// 验证封印方案没有误伤正常编辑：进入编辑后，框内选中 / 输入 / 删除都必须照常工作。
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
const CHROME = ['C:\\Users\\Admin\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(p => existsSync(p));
const PORT = 9780;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const profileDir = await mkdtemp(`${tmpdir()}\\pv-editok-`);
const child = spawn(CHROME, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${profileDir}`, '--no-first-run',
  '--no-default-browser-check', '--window-size=1600,1000', '--headless=new', 'about:blank'], { cwd: profileDir, windowsHide: true, stdio: 'ignore' });
for (let i = 0; i < 60; i++) { try { await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; } catch { await sleep(250); } }
const page = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { socket.addEventListener('open', res); socket.addEventListener('error', rej); });
let id = 1; const pending = new Map(); const errors = [];
socket.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); return; }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text);
});
const send = (m, p = {}) => { const i = id++; socket.send(JSON.stringify({ id: i, method: m, params: p })); return new Promise((res, rej) => pending.set(i, { res, rej })); };
const read = async expr => {
  const r = await send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression: expr });
  if (r.exceptionDetails) throw new Error(`表达式异常: ${r.exceptionDetails.text}`);
  return r.result?.value;
};
const click = async (x, y, clickCount = 1) => {
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount, buttons: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount, buttons: 0 });
  await sleep(450);
};
const key = async (k, code, vk, modifiers = 0) => {
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers });
  await sleep(400);
};
const NOTE_TEXT = `(() => {
  const doc = document.querySelector('affine-edgeless-root').doc;
  const active = document.querySelector('affine-edgeless-note[data-pv-editing]');
  if (!active) return null;
  const n = doc.getBlockById(active.getAttribute('data-block-id'));
  return n ? n.children.map(c => String(c.text || '')).join('') : null;
})()`;

await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
await sleep(11000);

const pos = await read(`(() => { const v = document.querySelector('affine-edgeless-note'); const r = v.getBoundingClientRect(); return { cx: Math.round(r.left+r.width/2), cy: Math.round(r.top+r.height/2) }; })()`);
await click(pos.cx, pos.cy, 2);
const results = {};
results['进入编辑'] = await read(`!!document.querySelector('affine-edgeless-note[data-pv-editing]')`);
results['初始文字'] = await read(NOTE_TEXT);

// 在框内拖动选中一部分文字（框内选择必须照常工作）
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pos.cx - 120, y: pos.cy, button: 'left', clickCount: 1, buttons: 1 });
for (let i = 1; i <= 6; i++) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pos.cx - 120 + i * 20, y: pos.cy, button: 'left', buttons: 1 });
  await sleep(30);
}
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pos.cx, y: pos.cy, button: 'left', clickCount: 1, buttons: 0 });
await sleep(400);
results['框内拖动后选区'] = await read(`String(document.getSelection()).slice(0, 24)`);

// 输入一个字符
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'X', code: 'KeyX', text: 'X', windowsVirtualKeyCode: 88, nativeVirtualKeyCode: 88 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'X', code: 'KeyX', windowsVirtualKeyCode: 88, nativeVirtualKeyCode: 88 });
await sleep(500);
results['输入X后文字'] = await read(NOTE_TEXT);

// 退格删除
await key('Backspace', 'Backspace', 8);
results['退格后文字'] = await read(NOTE_TEXT);

// Ctrl+A 全选（框内全选）
await key('a', 'KeyA', 65, 2);
results['Ctrl+A选区'] = await read(`String(document.getSelection()).slice(0, 24)`);

// 跨框是否仍然被阻止：确认没有其他框被卷入
results['各框是否仍可编辑'] = await read(`[...document.querySelectorAll('affine-edgeless-note')].map(v => v.getAttribute('contenteditable') === 'false' ? '封印' : '可编辑')`);
results['未捕获异常'] = errors.length;

for (const [k, v] of Object.entries(results)) console.log(`  ${k}: ${JSON.stringify(v)}`);

const editable = results['进入编辑'] === true;
const typed = typeof results['输入X后文字'] === 'string' && results['输入X后文字'].includes('X');
const deleted = results['退格后文字'] !== results['输入X后文字'];
const inNoteSelection = typeof results['框内拖动后选区'] === 'string' && results['框内拖动后选区'].length > 0;
const pass = editable && typed && deleted && inNoteSelection && results['未捕获异常'] === 0;
console.log(`\n判定: ${pass ? '✅ 通过——框内选择/输入/删除均正常，封印未误伤' : '❌ 未通过'}`);

socket.close(); try { child.kill(); } catch {}
await sleep(300);
await rm(profileDir, { recursive: true, force: true }).catch(() => {});
process.exit(pass ? 0 : 1);
