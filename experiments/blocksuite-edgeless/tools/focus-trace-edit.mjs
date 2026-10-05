// 追踪进入编辑后焦点落在哪：逐步记录 activeElement，
// 判断是 enterEditing 没把焦点放进内层编辑器，还是之后被别的处理器抢走。
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
const CHROME = ['C:\\Users\\Admin\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(p => existsSync(p));
const PORT = 9890;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const profileDir = await mkdtemp(`${tmpdir()}\\pv-ftrace-`);
const child = spawn(CHROME, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${profileDir}`, '--no-first-run',
  '--no-default-browser-check', '--window-size=1600,1000', '--headless=new', 'about:blank'], { cwd: profileDir, windowsHide: true, stdio: 'ignore' });
for (let i = 0; i < 60; i++) { try { await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; } catch { await sleep(250); } }
const page = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { socket.addEventListener('open', res); socket.addEventListener('error', rej); });
let id = 1; const pending = new Map();
socket.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
});
const send = (m, p = {}) => { const i = id++; socket.send(JSON.stringify({ id: i, method: m, params: p })); return new Promise((res, rej) => pending.set(i, { res, rej })); };
const read = async expr => {
  const r = await send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression: expr });
  if (r.exceptionDetails) throw new Error(`表达式异常: ${r.exceptionDetails.text}`);
  return r.result?.value;
};

await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
await sleep(11000);

await read(`(() => {
  const doc = document.querySelector('affine-edgeless-root').doc;
  doc.captureSync();
  doc.transact(() => { for (const c of [...doc.root.children]) if (c.flavour === 'affine:note') doc.deleteBlock(c); });
  const id = doc.addBlock('affine:note', { xywh: JSON.stringify([150, 150, 460, 160]), displayMode: 'edgeless' }, doc.root.id);
  const p = doc.addBlock('affine:paragraph', {}, id);
  doc.transact(() => doc.getBlockById(p).text.applyDelta([{ insert: '测试加粗的文字CONTENT' }]));
  doc.captureSync();
  return true;
})()`);
await sleep(1500);

// 安装焦点变化追踪：记录每次 focusin 的目标与时间
await read(`(() => {
  window.__focusTrace = [];
  const snap = tag => {
    const a = document.activeElement;
    window.__focusTrace.push({ tag, at: performance.now().toFixed(0), active: a ? a.tagName.toLowerCase() + (a.className ? '.' + String(a.className).split(' ')[0] : '') : null, inNote: !!(a && a.closest && a.closest('affine-edgeless-note')) });
  };
  for (const t of ['focusin','focusout','pointerdown','pointerup','dblclick','click']) {
    document.addEventListener(t, () => { snap(t + '-同步'); setTimeout(() => snap(t + '-t0'), 0); setTimeout(() => snap(t + '-t60'), 60); }, true);
  }
  snap('初始');
  return true;
})()`);

const pos = await read(`(() => { const v = document.querySelector('affine-edgeless-note'); const r = v.getBoundingClientRect(); return { cx: Math.round(r.left+r.width/2), cy: Math.round(r.top+r.height/2) }; })()`);
// 双击进入编辑
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pos.cx, y: pos.cy, button: 'left', clickCount: 2, buttons: 1 });
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pos.cx, y: pos.cy, button: 'left', clickCount: 2, buttons: 0 });
await sleep(1200);

const trace = await read(`window.__focusTrace`);
console.log('=== 焦点变化追踪（双击进入编辑）===');
for (const t of trace) console.log(`  ${String(t.tag).padEnd(18)} active=${String(t.active).padEnd(28)} 在文本框内=${t.inNote}`);

const final = await read(`(() => {
  const a = document.activeElement;
  const note = document.querySelector('affine-edgeless-note[data-pv-editing]');
  const inline = note && note.querySelector('.inline-editor');
  return {
    最终活动元素: a ? a.tagName.toLowerCase() + (a.className ? '.' + String(a.className).split(' ')[0] : '') : null,
    内层编辑器存在: !!inline,
    内层编辑器有焦点: inline ? document.activeElement === inline : null,
    编辑中: !!note,
  };
})()`);
console.log('\n=== 最终状态 ===');
console.log(JSON.stringify(final, null, 1));

socket.close(); try { child.kill(); } catch {}
await sleep(300);
await rm(profileDir, { recursive: true, force: true }).catch(() => {});
process.exit(0);
