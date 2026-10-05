// 自由画布验证管道：用 Chrome DevTools Protocol 打开页面、收集报错、截图。
// 不依赖任何 npm 包（Node 24 自带 fetch + WebSocket）。
// 使用独立临时配置目录启动 Chrome，不干扰用户正在使用的浏览器实例。
//
// 用法：
//   node tools/canvas-eyes.mjs [--url http://127.0.0.1:5173/] [--out .canvas-eyes] [--wait 6000]
//   node tools/canvas-eyes.mjs --eval "<返回可序列化值的 JS 表达式>"   # 页面内诊断

import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const TARGET_URL = argOf('--url', 'http://127.0.0.1:5173/');
const OUT_DIR = path.resolve(argOf('--out', '.canvas-eyes'));
const WAIT_MS = Number(argOf('--wait', '7000'));
const EVAL_EXPRESSION = argOf('--eval', null);
const PAN_TEST = args.includes('--pan-test');
const KEYS = argOf('--keys', null);
const IFRAME_TEST = args.includes('--iframe-test');

const BROWSER_CANDIDATES = [
  process.env.PV_CHROME,
  'C:\\Users\\Admin\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

function findBrowser() {
  for (const candidate of BROWSER_CANDIDATES) if (existsSync(candidate)) return candidate;
  throw new Error('找不到 Chrome/Edge；可用 PV_CHROME 环境变量指定路径');
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchJson(url, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

// --- 真实输入模拟（走 CDP Input 域，产生可信事件） -------------------------

// 统一的画布状态探针。自动穿透同源 iframe，因此顶层页与嵌入场景共用一份逻辑。
const CANVAS_PROBE = `(() => {
  let doc = document;
  let depth = 0;
  while (!doc.querySelector('affine-edgeless-root') && depth < 4) {
    const frame = doc.querySelector('iframe');
    if (!frame || !frame.contentDocument) break;
    try { doc = frame.contentDocument; } catch { break; }
    depth += 1;
  }
  const editor = doc.querySelector('affine-edgeless-root');
  const vp = editor && editor.gfx ? editor.gfx.viewport : null;
  const tool = editor && editor.gfx ? editor.gfx.tool : null;
  const round = (v, f) => (v === null || v === undefined ? null : Math.round(v * f) / f);
  return {
    探针层级: depth,
    编辑器已挂载: !!editor,
    hasViewport: !!vp,
    viewportX: vp ? round(vp.viewportX, 100) : null,
    viewportY: vp ? round(vp.viewportY, 100) : null,
    zoom: vp ? round(vp.zoom, 1000) : null,
    width: vp ? round(vp.width, 1) : null,
    height: vp ? round(vp.height, 1) : null,
    currentTool: tool && tool.currentTool$ ? tool.currentTool$.peek().toolName : null,
    dragging: tool && tool.dragging$ ? tool.dragging$.peek() : null,
    toolbarPanningClass: !!doc.querySelector('.canvas-tools.panning'),
    文档有焦点: doc.hasFocus(),
    顶层文档有焦点: document.hasFocus(),
    顶层活动元素: document.activeElement ? document.activeElement.tagName.toLowerCase() : null,
    画布文档活动元素: doc.activeElement ? doc.activeElement.tagName.toLowerCase() : null,
  };
})()`;

async function probeCanvas(cdp) {
  const result = await cdp.send('Runtime.evaluate', { returnByValue: true, expression: CANVAS_PROBE });
  if (result.exceptionDetails) throw new Error(`探针异常: ${result.exceptionDetails.text}`);
  return result.result?.value || {};
}

const readPanState = probeCanvas;

async function spacePanTest(cdp, { centerX, centerY, distance = 160, label = '' }) {
  // 先确保画布拿到焦点：点击画布正中央的空白处（不落在笔记上）。
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: centerX, y: centerY, button: 'left', clickCount: 1, buttons: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: centerX, y: centerY, button: 'left', clickCount: 1, buttons: 0 });
  await sleep(150);

  const before = await readPanState(cdp);

  const keyBase = { key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 };
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...keyBase });
  await sleep(150);
  const duringSpace = await readPanState(cdp);

  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: centerX, y: centerY, button: 'left', clickCount: 1, buttons: 1 });
  const steps = 8;
  const stepPx = distance / steps;
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: Math.round(centerX + stepPx * i),
      y: centerY,
      button: 'left',
      buttons: 1,
      // BlockSuite 的平移读 movementX/movementY；CDP 用 deltaX/deltaY 提供它们。
      deltaX: stepPx,
      deltaY: 0,
    });
    await sleep(30);
  }
  const duringDrag = await readPanState(cdp);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: centerX + distance, y: centerY, button: 'left', clickCount: 1, buttons: 0 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...keyBase });
  await sleep(200);
  const after = await readPanState(cdp);

  const dx = before.viewportX !== null && duringDrag.viewportX !== null
    ? Math.round((duringDrag.viewportX - before.viewportX) * 100) / 100 : null;
  const dy = before.viewportY !== null && duringDrag.viewportY !== null
    ? Math.round((duringDrag.viewportY - before.viewportY) * 100) / 100 : null;
  const spaceReachedCanvas = duringSpace.toolbarPanningClass || duringSpace.currentTool === 'pan';

  return {
    场景: label || '默认',
    鼠标起点: [centerX, centerY],
    拖拽距离: distance,
    空格按下前: before,
    空格按住时: duringSpace,
    拖拽过程中: duringDrag,
    判定: {
      空格到达了画布: spaceReachedCanvas,
      拖拽被识别: duringDrag.dragging === true,
      视口确实移动了: dx === null || dy === null ? null : (dx !== 0 || dy !== 0),
      水平位移: dx,
      垂直位移: dy,
      缩放未被误改: before.zoom === after.zoom,
    },
  };
}

// 同源 iframe 宿主：宿主页与画布由同一端口提供，因此父页面可以读取 iframe 内部状态。
// 只在页面里放 iframe，Vite 的 HMR 仍由 iframe 内部按自己的 origin 工作。
const HOST_PAGE_HTML = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>iframe 宿主（复现侧栏）</title>
<style>html,body{margin:0;height:100%}iframe{display:block;width:100%;height:100%;border:0}</style>
</head><body><iframe id="canvas" src="/"></iframe></body></html>`;

// 宿主页必须与画布同源，但又不能占用 Vite 的 "/"，否则 iframe 会嵌回宿主页自身。
const HOST_PAGE_PATH = '/__host';

async function withHostServer(fn, backendOrigin = 'http://127.0.0.1:5173') {
  const { createServer, request: httpRequest } = await import('node:http');
  const server = createServer((req, res) => {
    if (req.url === HOST_PAGE_PATH || req.url === `${HOST_PAGE_PATH}?`) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(HOST_PAGE_HTML);
      return;
    }
    // 其余全部反向代理到 Vite，使宿主页与画布同源，且 "/" 拿到的是真正的画布。
    const target = new URL(req.url, backendOrigin);
    const proxy = httpRequest(
      { hostname: target.hostname, port: target.port, path: target.pathname + target.search, method: req.method, headers: { ...req.headers, host: target.host } },
      upstream => { res.writeHead(upstream.statusCode || 502, upstream.headers); upstream.pipe(res); },
    );
    proxy.on('error', error => { res.writeHead(502, { 'Content-Type': 'text/plain' }); res.end(`proxy error: ${error.message}`); });
    req.pipe(proxy);
  });
  await new Promise(resolve => server.listen(5174, '127.0.0.1', resolve));
  try { return await fn(`http://127.0.0.1:5174${HOST_PAGE_PATH}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

// --- 极简 CDP 客户端 -------------------------------------------------------
function createCdp(wsUrl) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    let nextId = 1;
    const pending = new Map();
    const listeners = new Map();

    socket.addEventListener('open', () => resolve({
      send(method, params = {}, sessionId) {
        const id = nextId++;
        const payload = { id, method, params };
        if (sessionId) payload.sessionId = sessionId;
        socket.send(JSON.stringify(payload));
        return new Promise((res, rej) => pending.set(id, { res, rej, method }));
      },
      on(method, handler) {
        if (!listeners.has(method)) listeners.set(method, []);
        listeners.get(method).push(handler);
      },
      close() { try { socket.close(); } catch {} },
    }));

    socket.addEventListener('error', () => reject(new Error(`WebSocket 连接失败：${wsUrl}`)));

    socket.addEventListener('message', event => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.id) {
        const entry = pending.get(message.id);
        if (!entry) return;
        pending.delete(message.id);
        if (message.error) entry.rej(new Error(`${entry.method}: ${message.error.message}`));
        else entry.res(message.result);
        return;
      }
      for (const handler of listeners.get(message.method) || []) {
        try { handler(message.params, message.sessionId); } catch (error) { console.error('监听器异常:', error); }
      }
    });
  });
}

// --- 主流程 ---------------------------------------------------------------
const browserPath = findBrowser();
const profileDir = await mkdtemp(path.join(tmpdir(), 'pv-canvas-eyes-'));
const debugPort = 9333;

await mkdir(OUT_DIR, { recursive: true });

console.log(`浏览器 : ${browserPath}`);
console.log(`目标页 : ${TARGET_URL}`);
console.log(`配置目录: ${profileDir}（独立临时，不影响你正在用的浏览器）`);
console.log(`输出目录: ${OUT_DIR}`);

const child = spawn(browserPath, [
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profileDir}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-features=Translate,MediaRouter',
  '--window-size=1600,1000',
  '--headless=new',
  'about:blank',
], { cwd: profileDir, windowsHide: true, stdio: 'ignore', detached: false });

let exitCode = 0;
let cdp = null;

try {
  // 等待调试端口就绪
  let version = null;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { version = await fetchJson(`http://127.0.0.1:${debugPort}/json/version`); break; }
    catch { await sleep(250); }
  }
  if (!version) throw new Error('调试端口未就绪；浏览器可能拒绝以该配置目录启动');
  console.log(`已连接 : ${version.Browser}`);

  const target = await fetchJson(`http://127.0.0.1:${debugPort}/json/new?about:blank`, 5000)
    .catch(async () => {
      const list = await fetchJson(`http://127.0.0.1:${debugPort}/json/list`);
      return list.find(item => item.type === 'page');
    });
  if (!target?.webSocketDebuggerUrl) throw new Error('无法取得页面调试地址');

  cdp = await createCdp(target.webSocketDebuggerUrl);

  const consoleErrors = [];
  const consoleWarnings = [];
  const consoleAll = [];
  const exceptions = [];
  const failedRequests = [];

  cdp.on('Runtime.consoleAPICalled', params => {
    const text = (params.args || []).map(a => {
      if (a.type === 'string') return a.value;
      if ('value' in a) return JSON.stringify(a.value);
      return a.description || a.type;
    }).join(' ');
    const record = { level: params.type, text };
    consoleAll.push(record);
    if (params.type === 'error') consoleErrors.push(text);
    else if (params.type === 'warning') consoleWarnings.push(text);
  });
  cdp.on('Runtime.exceptionThrown', params => {
    const d = params.exceptionDetails || {};
    exceptions.push({
      text: d.text,
      line: d.lineNumber,
      column: d.columnNumber,
      url: d.url,
      description: d.exception?.description || d.exception?.value || '',
      stack: (d.stackTrace?.callFrames || []).slice(0, 6).map(f => `${f.functionName || '(匿名)'} @ ${f.url}:${f.lineNumber + 1}`),
    });
  });
  cdp.on('Network.loadingFailed', params => {
    failedRequests.push({ url: params.documentURL || '', error: params.errorText, type: params.type });
  });

  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Network.enable');
  await cdp.send('Log.enable').catch(() => {});

  console.log(`\n正在加载页面，等待 ${WAIT_MS} ms…`);

  if (IFRAME_TEST) {
    const report = await withHostServer(async hostUrl => {
      console.log(`宿主页 : ${hostUrl}（同源 iframe 包裹 ${TARGET_URL}）`);
      const nav = await cdp.send('Page.navigate', { url: hostUrl });
      if (nav.errorText) throw new Error(`宿主页导航失败：${nav.errorText}`);
      await sleep(WAIT_MS + 5000);

      const report = { 宿主页: hostUrl };

      // 诊断：逐层报告文档链，必要时抓图。
      const chain = await cdp.send('Runtime.evaluate', {
        returnByValue: true,
        expression: `(() => {
          const levels = [];
          let doc = document;
          for (let i = 0; i < 5; i++) {
            const frames = [...doc.querySelectorAll('iframe')];
            levels.push({
              层: i,
              url: doc.location ? doc.location.href : String(doc.URL || ''),
              标题: doc.title,
              有编辑器: !!doc.querySelector('affine-edgeless-root'),
              有工具栏: !!doc.querySelector('.canvas-tools'),
              同层iframe数: frames.length,
              同层iframe的src: frames.map(f => f.getAttribute('src')),
              body子元素数: doc.body ? doc.body.children.length : 0,
            });
            const next = frames.find(f => f.contentDocument);
            if (!next) break;
            try { doc = next.contentDocument; } catch { break; }
          }
          return levels;
        })()`,
      });
      report.文档链 = chain.result?.value;
      const iframeShot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      const iframeShotPath = path.join(OUT_DIR, 'iframe-scene.png');
      await writeFile(iframeShotPath, Buffer.from(iframeShot.data, 'base64'));
      report.截图 = iframeShotPath;

      // 场景 1：完全不碰页面（模拟「刚导航完，焦点还在地址栏」）
      report.场景1_从未点击 = {
        状态: await probeCanvas(cdp),
        拖拽: await spacePanTest(cdp, { centerX: 792, centerY: 500, distance: 160, label: '从未点击 iframe' }),
      };

      // 场景 2：点一下 iframe 里的画布（正常使用路径）
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 792, y: 500, button: 'left', clickCount: 1, buttons: 1 });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 792, y: 500, button: 'left', clickCount: 1, buttons: 0 });
      await sleep(300);
      report.场景2_点击过画布 = {
        状态: await probeCanvas(cdp),
        拖拽: await spacePanTest(cdp, { centerX: 792, centerY: 500, distance: 160, label: '点击过画布' }),
      };

      // 场景 3：点过画布之后，焦点又被父页面拿走（模拟去地址栏敲了一次）
      await cdp.send('Runtime.evaluate', { expression: "document.querySelector('#canvas').contentWindow.blur(); document.body.focus();" });
      await sleep(300);
      report.场景3_点击后被夺焦 = {
        状态: await probeCanvas(cdp),
        拖拽: await spacePanTest(cdp, { centerX: 792, centerY: 500, distance: 160, label: '点过画布但焦点被夺走' }),
      };

      return report;
    });
    console.log(`\n===== iframe 焦点场景测试 =====`);
    console.log(JSON.stringify(report, null, 2));
    console.log(`\n===== 控制台错误 (${consoleErrors.length}) =====`);
    consoleErrors.slice(0, 12).forEach(line => console.log(`  ✗ ${line.slice(0, 300)}`));
    console.log(`===== 未捕获异常 (${exceptions.length}) =====`);
    exceptions.slice(0, 8).forEach(e => console.log(`  ✗ ${e.text} @ ${e.url}:${(e.line ?? 0) + 1}`));
  } else {
  const navigation = await cdp.send('Page.navigate', { url: TARGET_URL });
  if (navigation.errorText) throw new Error(`导航失败：${navigation.errorText}`);

  await sleep(WAIT_MS);

  const probe = await cdp.send('Runtime.evaluate', {    returnByValue: true,
    awaitPromise: false,
    expression: `(() => {
      const editor = document.querySelector('affine-edgeless-root');
      const canvas = document.querySelector('#canvas');
      const out = {
        title: document.title,
        status: document.querySelector('#status')?.textContent ?? null,
        canvasElExists: !!canvas,
        canvasChildCount: canvas ? canvas.children.length : 0,
        editorMounted: !!editor,
        editorHasGfx: !!(editor && editor.gfx),
        editorHasTool: !!(editor && editor.gfx && editor.gfx.tool),
        editorHasViewport: !!(editor && editor.gfx && editor.gfx.viewport),
        viewportZoom: (editor && editor.gfx && editor.gfx.viewport) ? editor.gfx.viewport.zoom : null,
        toolbarButtons: [...document.querySelectorAll('.canvas-tools [data-tool]')].map(b => b.dataset.tool),
        noteViewCount: document.querySelectorAll('affine-edgeless-note').length,
        imageViewCount: document.querySelectorAll('affine-edgeless-image').length,
        stickyCanvasCount: document.querySelectorAll('canvas').length,
        bodySize: [document.body.clientWidth, document.body.clientHeight],
        readyState: document.readyState,
      };
      const surface = editor?.querySelector('affine-surface');
      if (surface) {
        const r = surface.getBoundingClientRect();
        out.surfaceRect = [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
      }
      return out;
    })()`,
  });
  const state = probe.result?.value || {};

  if (KEYS) {
    // 发真实按键（CDP Input 域），用于验证快捷键链路。格式: "alt+r,alt+l,Escape"
    console.log(`\n===== 按键: ${KEYS} =====`);
    // 按键需要页面持有文档焦点；先点一下画布中央的空白区域。
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 200, y: 700, button: 'left', clickCount: 1, buttons: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 200, y: 700, button: 'left', clickCount: 1, buttons: 0 });
    await sleep(300);
    for (const spec of KEYS.split(',').map(s => s.trim()).filter(Boolean)) {
      const parts = spec.split('+');
      const keyName = parts.pop();
      const modifiers = parts.map(p => p.toLowerCase());
      const codeMap = { r: ['KeyR', 82], l: ['KeyL', 76], Escape: ['Escape', 27], Delete: ['Delete', 46], Backspace: ['Backspace', 8], ' ': ['Space', 32] };
      const [code, vk] = codeMap[keyName] || [`Key${keyName.toUpperCase()}`, keyName.toUpperCase().charCodeAt(0)];
      let mod = 0;
      if (modifiers.includes('alt')) mod |= 1;
      if (modifiers.includes('ctrl')) mod |= 2;
      if (modifiers.includes('meta')) mod |= 4;
      if (modifiers.includes('shift')) mod |= 8;
      await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: keyName, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: mod });
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: keyName, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: mod });
      await sleep(400);
      const rec = await cdp.send('Runtime.evaluate', {
        returnByValue: true,
        expression: `({ active: !!(window.__pvRecord && window.__pvRecord.isActive()), count: window.__pvRecord ? window.__pvRecord.events.length : -1 })`,
      });
      console.log(`  已发送 ${spec}  → 记录中=${rec.result?.value?.active} 条数=${rec.result?.value?.count}`);
    }
    const after = await cdp.send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => { const o = document.querySelector('#note-report'); return o && !o.hidden ? o.textContent.split('\\n').slice(-4).join(' | ') : '(面板未展开)'; })()`,
    });
    console.log(`\n面板尾部: ${JSON.stringify(after.result?.value)}`);
    console.log(`控制台错误 (${consoleErrors.length})`); consoleErrors.slice(0, 8).forEach(l => console.log('  ✗ ' + l.slice(0, 200)));
    console.log(`未捕获异常 (${exceptions.length})`); exceptions.slice(0, 5).forEach(e => console.log('  ✗ ' + e.text));
  } else if (PAN_TEST) {
    const centerX = Math.round((state.bodySize?.[0] || 1600) / 2);
    const centerY = Math.round((state.bodySize?.[1] || 900) / 2) + 40;
    console.log(`\n===== 空格平移测试 =====`);
    const result = await spacePanTest(cdp, { centerX, centerY, distance: 160 });
    console.log(JSON.stringify(result, null, 2));
    console.log(`\n===== 控制台错误 (${consoleErrors.length}) =====`);
    consoleErrors.slice(0, 12).forEach(line => console.log(`  ✗ ${line.slice(0, 300)}`));
    console.log(`===== 未捕获异常 (${exceptions.length}) =====`);
    exceptions.slice(0, 8).forEach(e => console.log(`  ✗ ${e.text} @ ${e.url}:${(e.line ?? 0) + 1}`));
  } else if (EVAL_EXPRESSION) {
    const evaluated = await cdp.send('Runtime.evaluate', {
      returnByValue: true,
      awaitPromise: true,
      expression: EVAL_EXPRESSION,
    });
    console.log(`\n===== 页面状态 =====`);
    console.log(JSON.stringify(state, null, 2));
    console.log(`\n===== --eval 结果 =====`);
    if (evaluated.exceptionDetails) {
      exitCode = 1;
      console.error(JSON.stringify({
        异常: evaluated.exceptionDetails.text,
        描述: evaluated.exceptionDetails.exception?.description || '',
        行: evaluated.exceptionDetails.lineNumber,
      }, null, 2));
    } else {
      console.log(JSON.stringify(evaluated.result?.value ?? evaluated.result, null, 2));
    }
    console.log(`\n===== 控制台错误 (${consoleErrors.length}) =====`);
    consoleErrors.slice(0, 12).forEach(line => console.log(`  ✗ ${line.slice(0, 300)}`));
    console.log(`===== 未捕获异常 (${exceptions.length}) =====`);
    exceptions.slice(0, 8).forEach(e => console.log(`  ✗ ${e.text} @ ${e.url}:${(e.line ?? 0) + 1}`));
  } else {
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const pngPath = path.join(OUT_DIR, 'canvas-baseline.png');
  await writeFile(pngPath, Buffer.from(shot.data, 'base64'));

  const report = {
    被验证时间: new Date().toISOString(),
    目标页: TARGET_URL,
    浏览器: version.Browser,
    等待毫秒: WAIT_MS,
    页面状态: state,
    控制台错误: consoleErrors,
    控制台警告: consoleWarnings,
    未捕获异常: exceptions,
    加载失败请求: failedRequests.slice(0, 20),
    控制台全部输出: consoleAll.slice(0, 60),
    截图文件: pngPath,
  };
  const reportPath = path.join(OUT_DIR, 'report.json');
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`\n===== 页面状态 =====`);
  console.log(JSON.stringify(state, null, 2));
  console.log(`\n===== 控制台错误 (${consoleErrors.length}) =====`);
  consoleErrors.slice(0, 12).forEach(line => console.log(`  ✗ ${line.slice(0, 300)}`));
  console.log(`\n===== 控制台警告 (${consoleWarnings.length}) =====`);
  consoleWarnings.slice(0, 8).forEach(line => console.log(`  ! ${line.slice(0, 200)}`));
  console.log(`\n===== 未捕获异常 (${exceptions.length}) =====`);
  exceptions.slice(0, 8).forEach(e => {
    console.log(`  ✗ ${e.text} @ ${e.url}:${(e.line ?? 0) + 1}`);
    if (e.stack?.length) e.stack.forEach(f => console.log(`      ${f}`));
  });
  console.log(`\n===== 加载失败 (${failedRequests.length}) =====`);
  failedRequests.slice(0, 10).forEach(r => console.log(`  ✗ [${r.type}] ${r.error} ${r.url.slice(0, 160)}`));
  console.log(`\n截图: ${pngPath}`);
  console.log(`报告: ${reportPath}`);
  }
  }
} catch (error) {
  exitCode = 1;
  console.error(`\n验证失败：${error.message}`);
} finally {
  cdp?.close();
  try { child.kill(); } catch {}
  await sleep(400);
  await rm(profileDir, { recursive: true, force: true }).catch(() => {});
}

process.exit(exitCode);
