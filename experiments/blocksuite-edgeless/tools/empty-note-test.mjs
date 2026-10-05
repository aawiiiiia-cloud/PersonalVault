// 干净复现：在一个文本框内「全选 → 删除」，是否留下损坏的空白文本框。
// 刻意不用任何 setBaseAndExtent / 直接改 DOM，全部走真实输入事件。
import { spawn } from 'node:child_process';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const CHROME = ['C:\\Users\\Admin\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(p => existsSync(p));
const PORT = 9740;
const OUT = 'D:\\personalvault\\experiments\\blocksuite-edgeless\\.canvas-eyes';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const profileDir = await mkdtemp(`${tmpdir()}\\pv-empty-`);
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
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push((m.params.args || []).map(a => a.value ?? a.description).join(' '));
});
const send = (m, p = {}) => { const i = id++; socket.send(JSON.stringify({ id: i, method: m, params: p })); return new Promise((res, rej) => pending.set(i, { res, rej })); };
const read = async expr => {
  const r = await send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression: expr });
  if (r.exceptionDetails) throw new Error(`表达式异常: ${r.exceptionDetails.text}`);
  return r.result?.value;
};
const key = async (k, code, vk) => {
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  await sleep(350);
};
const click = async (x, y, clickCount = 1) => {
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount, buttons: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount, buttons: 0 });
  await sleep(450);
};

await mkdir(OUT, { recursive: true });
await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
await sleep(11000);

// ── 基线：默认文档本来就是 1 个「有文字」的文本框 ─────────────────────
const base = await read(`(() => {
  const doc = document.querySelector('affine-edgeless-root').doc;
  const notes = doc.root.children.filter(b => b.flavour === 'affine:note');
  return { 文本框数: notes.length, 各框文字: notes.map(n => String(n.text || '').slice(0, 30)) };
})()`);
console.log('基线:', JSON.stringify(base));

// ── 真实操作：双击进入默认文本框 → 全选 → 删除 ────────────────────────
const pos = await read(`(() => {
  const v = document.querySelector('affine-edgeless-note');
  const r = v.getBoundingClientRect();
  return { cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2) };
})()`);
console.log(`默认文本框位置: ${pos.cx},${pos.cy}`);

await click(pos.cx, pos.cy, 2);
const editing = await read(`!!document.querySelector('affine-edgeless-note[data-pv-editing]')`);
console.log(`双击后进入编辑: ${editing}`);

await key('a', 'KeyA', 65); // 需要 Ctrl 才全选，这里先试无修饰
await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 65, modifiers: 2 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 65, modifiers: 2 });
await sleep(400);
const selected = await read(`String(document.getSelection()).slice(0, 40)`);
console.log(`Ctrl+A 后选区: ${JSON.stringify(selected)}`);

const beforeDelete = await read(`(() => {
  const doc = document.querySelector('affine-edgeless-root').doc;
  return doc.root.children.filter(b => b.flavour === 'affine:note').map(n => String(n.text || '').slice(0, 20));
})()`);
console.log(`删除前各框文字: ${JSON.stringify(beforeDelete)}`);
const errorsBefore = errors.length;

await key('Backspace', 'Backspace', 8);

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
    视图尺寸: views.map(v => { const r = v.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }),
  };
})()`);
const newErrors = errors.slice(errorsBefore);

console.log('\n删除后:');
for (const [k, v] of Object.entries(after)) console.log(`    ${k}: ${JSON.stringify(v)}`);
console.log(`新增报错 (${newErrors.length}):`);
newErrors.slice(0, 4).forEach(e => console.log('    ✗ ' + String(e).slice(0, 180)));

const ghosts = after.空白文本框;
console.log(`\n判定: ${ghosts === 0 ? '✅ 通过——单框全选删除不留空白残留' : `❌ 未通过——留下 ${ghosts} 个空白文本框`}`);

const shot = await send('Page.captureScreenshot', { format: 'png' });
await writeFile(path.join(OUT, 'empty-note-after-delete.png'), Buffer.from(shot.data, 'base64'));
console.log('截图: .canvas-eyes/empty-note-after-delete.png');

socket.close(); try { child.kill(); } catch {}
await sleep(300);
await rm(profileDir, { recursive: true, force: true }).catch(() => {});
process.exit(ghosts === 0 ? 0 : 1);
