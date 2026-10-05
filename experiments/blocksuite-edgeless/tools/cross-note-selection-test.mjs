// 回归测试：跨文本框选中文字 + Backspace，是否留下无法删除的空白文本框。
//
// 复现步骤（对应真实反馈）：
//   1. 建两个带文字的文本框
//   2. 双击进入第一个文本框编辑
//   3. 把选区从第一个文本框拖到第二个文本框（跨框选中）
//   4. 按 Backspace
//   5. 断言：是否留下「空的、无法通过点击选中的」文本框残留
//
// 用法：node tools/cross-note-selection-test.mjs [--canvas http://127.0.0.1:5173/]

import { spawn } from 'node:child_process';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const CANVAS = argOf('--canvas', 'http://127.0.0.1:5173/');
const DEBUG_PORT = Number(argOf('--port', '9730'));
const OUT = path.resolve(argOf('--out', '.canvas-eyes'));

const BROWSERS = [
  process.env.PV_CHROME,
  'C:\\Users\\Admin\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);
const browser = BROWSERS.find(p => existsSync(p));
if (!browser) { console.error('找不到 Chrome/Edge'); process.exit(1); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
const profileDir = await mkdtemp(`${tmpdir()}\\pv-xnote-`);
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
  await new Promise((res, rej) => { socket.addEventListener('open', res); socket.addEventListener('error', rej); });

  let nextId = 1;
  const pending = new Map();
  const consoleErrors = [];
  const exceptions = [];
  socket.addEventListener('message', event => {
    const m = JSON.parse(event.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      m.error ? p.rej(new Error(m.error.message)) : p.res(m.result);
      return;
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      consoleErrors.push((m.params.args || []).map(a => a.value ?? a.description ?? a.type).join(' '));
    }
    if (m.method === 'Runtime.exceptionThrown') {
      exceptions.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text);
    }
  });
  const send = (method, params = {}) => {
    const id = nextId++;
    socket.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => pending.set(id, { res, rej }));
  };
  const read = async expr => {
    const r = await send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression: expr });
    if (r.exceptionDetails) throw new Error(`页面表达式异常: ${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description || ''}`);
    return r.result?.value;
  };
  const click = async (x, y, opts = {}) => {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: opts.clickCount || 1, buttons: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: opts.clickCount || 1, buttons: 0 });
    await sleep(opts.wait || 400);
  };

  await mkdir(OUT, { recursive: true });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: CANVAS });
  await sleep(11000);

  // ── 准备：清空文档，建两个带文字的文本框 ──────────────────────────────
  const setup = await read(`(() => {
    const root = document.querySelector('affine-edgeless-root');
    const doc = root.doc;
    const Text = doc.getBlockById(root.doc.root.id).constructor;
    // 清掉默认内容，保证断言干净
    doc.captureSync();
    doc.transact(() => {
      for (const child of [...doc.root.children]) if (child.flavour === 'affine:note') doc.deleteBlock(child);
    });
    const ids = [];
    for (const [i, label] of [['A'], ['B']].entries()) {
      const id = doc.addBlock('affine:note', {
        xywh: JSON.stringify([200, 150 + i * 260, 320, 160]),
        displayMode: 'edgeless',
      }, doc.root.id);
      const para = doc.addBlock('affine:paragraph', {}, id);
      const paraModel = doc.getBlockById(para);
      doc.transact(() => { paraModel.text.insert(label[0] + 'AAA', 0); });
      ids.push(id);
    }
    doc.captureSync();
    return { noteIds: ids, noteCount: doc.root.children.filter(b => b.flavour === 'affine:note').length };
  })()`);
  console.log(`准备完成: 文本框 ${setup.noteCount} 个\n`);
  await sleep(1200);

  // ── 进入第一个文本框编辑 ────────────────────────────────────────────
  const noteA = await read(`(() => {
    const root = document.querySelector('affine-edgeless-root');
    const note = root.doc.root.children.filter(b => b.flavour === 'affine:note')[0];
    const view = document.querySelector('affine-edgeless-note[data-block-id="' + note.id + '"]');
    view.scrollIntoView?.();
    const r = view.getBoundingClientRect();
    return { id: note.id, 中心: [Math.round(r.left + r.width/2), Math.round(r.top + r.height/2)] };
  })()`);
  await click(noteA.中心[0], noteA.中心[1], { clickCount: 2, wait: 900 });
  const editing = await read(`(() => {
    const v = document.querySelector('affine-edgeless-note[data-pv-editing]');
    return { 编辑中: !!v, 活动文本框: v ? v.getAttribute('data-block-id') : null };
  })()`);
  console.log(`双击进入编辑: ${JSON.stringify(editing)}\n`);

  // ── 真实鼠标拖拽：从第一个文本框内的文字拖到第二个文本框 ──────────────
  const coords = await read(`(() => {
    const notes = [...document.querySelectorAll('affine-edgeless-note')];
    const pick = el => {
      const r = el.getBoundingClientRect();
      return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), cx: Math.round(r.left + r.width/2), cy: Math.round(r.top + r.height/2) };
    };
    const para = i => notes[i].querySelector('affine-paragraph');
    const p1 = pick(para(0)), p2 = pick(para(1));
    return { 第一框: p1, 第二框: p2 };
  })()`);
  console.log(`坐标: 第一框中心=${coords.第一框.cx},${coords.第一框.cy}  第二框中心=${coords.第二框.cx},${coords.第二框.cy}\n`);

  // 从第一框文字处按下，拖到第二框内，再松开——与用户的真实操作一致
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: coords.第一框.left + 6, y: coords.第一框.cy, button: 'left', clickCount: 1, buttons: 1 });
  const steps = 10;
  for (let i = 1; i <= steps; i++) {
    const x = (coords.第一框.left + 6) + ((coords.第二框.cx - (coords.第一框.left + 6)) * i) / steps;
    const y = coords.第一框.cy + ((coords.第二框.cy - coords.第一框.cy) * i) / steps;
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1 });
    await sleep(25);
  }
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: coords.第二框.cx, y: coords.第二框.cy, button: 'left', clickCount: 1, buttons: 0 });
  await sleep(400);

  const selectionProbe = await read(`(() => {
    const sel = document.getSelection();
    const anchorEl = (sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement);
    const focusEl = (sel.focusNode instanceof Element ? sel.focusNode : sel.focusNode?.parentElement);
    const noteOf = el => el?.closest?.('affine-edgeless-note')?.getAttribute('data-block-id') ?? null;
    const active = document.querySelector('affine-edgeless-note[data-pv-editing]');
    return {
      活动文本框: active ? active.getAttribute('data-block-id') : null,
      锚点文本框: noteOf(anchorEl),
      焦点文本框: noteOf(focusEl),
      是否跨框: noteOf(anchorEl) !== noteOf(focusEl),
      选区文字: String(sel.toString()).slice(0, 40),
    };
  })()`);
  console.log(`跨框选区探测（真实拖拽）: ${JSON.stringify(selectionProbe)}\n`);
  const clampDiag = await read(`window.__pvClamp ?? null`);
  console.log(`纠正逻辑诊断: ${JSON.stringify(clampDiag)}\n`);

  // ── 按 Backspace ───────────────────────────────────────────────────
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 });
  await sleep(900);

  // ── 断言 ───────────────────────────────────────────────────────────
  const after = await read(`(() => {
    const root = document.querySelector('affine-edgeless-root');
    const doc = root.doc;
    const notes = doc.root.children.filter(b => b.flavour === 'affine:note');
    const views = [...document.querySelectorAll('affine-edgeless-note')];
    return {
      模型文本框数: notes.length,
      视图文本框数: views.length,
      含文字的文本框: notes.filter(n => String(n.text || '').trim()).length,
      空白文本框: notes.filter(n => !String(n.text || '').trim()).length,
      可见文本框: views.filter(v => {
        const r = v.getBoundingClientRect();
        return r.width > 1 && r.height > 1;
      }).length,
      各文本框文字: notes.map(n => String(n.text || '').slice(0, 20)),
    };
  })()`);
  console.log('按 Backspace 之后:');
  for (const [k, v] of Object.entries(after)) console.log(`    ${k}: ${JSON.stringify(v)}`);

  // 残留判定：模型里存在空白文本框，且其视图仍然可见/占位
  const ghosts = after.空白文本框;
  const pass = ghosts === 0;
  console.log(`\n判定: ${pass ? '✅ 通过——没有留下空白文本框残留' : `❌ 未通过——留下 ${ghosts} 个空白文本框（无法删除的灰框来源）`}`);

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  const shotPath = path.join(OUT, 'cross-note-selection.png');
  await writeFile(shotPath, Buffer.from(shot.data, 'base64'));
  console.log(`截图: ${shotPath}`);

  if (consoleErrors.length) { console.log(`\n控制台错误 (${consoleErrors.length}):`); consoleErrors.slice(0, 8).forEach(e => console.log('  ✗ ' + e.slice(0, 200))); }
  if (exceptions.length) { console.log(`\n未捕获异常 (${exceptions.length}):`); exceptions.slice(0, 8).forEach(e => console.log('  ✗ ' + String(e).slice(0, 300))); }

  exitCode = pass ? 0 : 1;
} catch (error) {
  console.error(`\n测试执行失败：${error.message}`);
  exitCode = 1;
} finally {
  try { socket?.close(); } catch {}
  try { child.kill(); } catch {}
  await sleep(400);
  await rm(profileDir, { recursive: true, force: true }).catch(() => {});
}

process.exit(exitCode);
