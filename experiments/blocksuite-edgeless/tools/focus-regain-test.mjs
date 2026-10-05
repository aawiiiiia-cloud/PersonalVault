// 常驻回归测试：侧栏（iframe）场景下的键盘焦点与「空格 + 拖动」平移。
//
// 复现真实侧栏结构：父页面有一条可聚焦的「地址栏」，画布在 iframe 内（同源代理，
// 因此探针可以读取 iframe 内部状态）。流程：
//   1. 点画布 → 建立焦点 → 空格应能进入平移态
//   2. 点父页面地址栏 → 画布失去焦点
//   3. 点回画布空白处 → 断言焦点是否被夺回、空格是否恢复
//
// 用法：node tools/focus-regain-test.mjs [--canvas http://127.0.0.1:5173/] [--port 9700]

import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer, request as httpRequest } from 'node:http';

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const CANVAS = argOf('--canvas', 'http://127.0.0.1:5173/');
const HOST_PORT = Number(argOf('--port', '9700'));
const DEBUG_PORT = HOST_PORT + 1;

const BROWSERS = [
  process.env.PV_CHROME,
  'C:\\Users\\Admin\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);
const browser = BROWSERS.find(p => existsSync(p));
if (!browser) { console.error('找不到 Chrome/Edge，可用 PV_CHROME 指定'); process.exit(1); }

const sleep = ms => new Promise(r => setTimeout(r, ms));

const HOST_HTML = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>sidebar-sim</title>
<style>html,body{margin:0;height:100%;font:13px sans-serif}
#bar{height:44px;display:flex;align-items:center;gap:8px;padding:0 10px;background:#eee;border-bottom:1px solid #ccc}
#addr{flex:1;height:26px}
iframe{display:block;width:100%;height:calc(100% - 45px);border:0}</style></head>
<body><div id="bar"><input id="addr" placeholder="地址栏（点击这里模拟点到侧栏别处）"></div>
<iframe id="canvas" src="/"></iframe></body></html>`;

const backend = new URL(CANVAS);
const server = createServer((req, res) => {
  if (req.url === '/__host') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HOST_HTML);
    return;
  }
  const target = new URL(req.url, CANVAS);
  const proxy = httpRequest(
    { hostname: target.hostname, port: target.port || backend.port, path: target.pathname + target.search, method: req.method, headers: { ...req.headers, host: target.host } },
    upstream => { res.writeHead(upstream.statusCode || 502, upstream.headers); upstream.pipe(res); },
  );
  proxy.on('error', error => { res.writeHead(502, { 'Content-Type': 'text/plain' }); res.end(`proxy error: ${error.message}`); });
  req.pipe(proxy);
});
await new Promise(resolve => server.listen(HOST_PORT, '127.0.0.1', resolve));

const profileDir = await mkdtemp(`${tmpdir()}\\pv-focus-test-`);
const child = spawn(browser, [
  `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profileDir}`,
  '--no-first-run', '--no-default-browser-check', '--window-size=1600,1000', '--headless=new', 'about:blank',
], { cwd: profileDir, windowsHide: true, stdio: 'ignore' });

let exitCode = 0;
let socket = null;
try {
  let version = null;
  for (let i = 0; i < 60; i++) {
    try { version = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).json(); break; }
    catch { await sleep(250); }
  }
  if (!version) throw new Error('调试端口未就绪');
  const page = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve); socket.addEventListener('error', reject); });

  let nextId = 1;
  const pending = new Map();
  let fileChooserOpened = 0;
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Page.fileChooserOpened') fileChooserOpened++;
    if (message.id && pending.has(message.id)) {
      const entry = pending.get(message.id);
      pending.delete(message.id);
      message.error ? entry.rej(new Error(message.error.message)) : entry.res(message.result);
    }
  });
  const send = (method, params = {}) => {
    const id = nextId++;
    socket.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => pending.set(id, { res, rej }));
  };

  const FOCUS = `document.querySelector('#canvas').contentDocument.hasFocus()`;
  const TOOL = `document.querySelector('#canvas').contentDocument.querySelector('affine-edgeless-root')?.gfx.tool.currentTool$.peek().toolName ?? null`;
  const read = async expr => (await send('Runtime.evaluate', { returnByValue: true, expression: expr })).result?.value;
  const click = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 });
    await sleep(450);
  };
  const spacePanCheck = async () => {
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 });
    await sleep(300);
    const tool = await read(TOOL);
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 });
    await sleep(150);
    return tool === 'pan';
  };

  await send('Page.enable');
  await send('Page.setInterceptFileChooserDialog', { enabled: true });
  await send('Runtime.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${HOST_PORT}/__host` });
  await sleep(13000);

  const results = [];

  await click(700, 100);
  const baseFocus = await read(FOCUS);
  const basePan = await spacePanCheck();
  results.push({ 步骤: '1. 点画布建立焦点', 有焦点: baseFocus, 空格可平移: basePan, 期望: '有焦点=true, 可平移=true' });

  await click(400, 22);
  const lostFocus = await read(FOCUS);
  results.push({ 步骤: '2. 点地址栏夺焦', 有焦点: lostFocus, 空格可平移: null, 期望: '有焦点=false' });

  await click(250, 700);
  const regainedFocus = await read(FOCUS);
  const regainedPan = await spacePanCheck();
  results.push({ 步骤: '3. 点回画布空白处', 有焦点: regainedFocus, 空格可平移: regainedPan, 期望: '有焦点=true, 可平移=true' });

  const mediaButton = await read(`(() => {
    const frame = document.querySelector('#canvas');
    const rect = frame.contentDocument.querySelector('#choose-media').getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    return { x: Math.round(frameRect.left + rect.left + rect.width / 2), y: Math.round(frameRect.top + rect.top + rect.height / 2) };
  })()`);
  await click(mediaButton.x, mediaButton.y);
  const chooserCount = fileChooserOpened;
  const focusedAfterMedia = await read(`(() => {
    const doc = document.querySelector('#canvas').contentDocument;
    return doc.hasFocus();
  })()`);
  const panAfterMedia = await spacePanCheck();
  results.push({ 步骤: '4. 点击插入媒体后按空格', 有焦点: focusedAfterMedia, 空格可平移: panAfterMedia,
    文件框未重开: fileChooserOpened === chooserCount, 期望: '画布有焦点、可平移、文件框未重开' });

  console.log(`\n浏览器: ${version.Browser}`);
  console.log(`画布  : ${CANVAS}`);
  console.log(`宿主页: http://127.0.0.1:${HOST_PORT}/__host\n`);
  for (const row of results) {
    console.log(`  ${row.步骤}`);
    console.log(`     有焦点=${row.有焦点}  空格可平移=${row.空格可平移}  文件框未重开=${row.文件框未重开 ?? '-'}   （期望 ${row.期望}）`);
  }

  const step3 = results[2];
  const step4 = results[3];
  const pass = step3.有焦点 === true && step3.空格可平移 === true
    && step4.有焦点 === true && step4.空格可平移 === true && step4.文件框未重开 === true;
  console.log(`\n判定: ${pass ? '✅ 通过——点回画布后无需额外操作即可空格平移' : '❌ 未通过——点回画布后仍无法直接空格平移'}`);
  exitCode = pass ? 0 : 1;
} catch (error) {
  console.error(`\n测试执行失败：${error.message}`);
  exitCode = 1;
} finally {
  try { socket?.close(); } catch {}
  try { child.kill(); } catch {}
  await sleep(400);
  await rm(profileDir, { recursive: true, force: true }).catch(() => {});
  await new Promise(resolve => server.close(resolve));
}

process.exit(exitCode);
