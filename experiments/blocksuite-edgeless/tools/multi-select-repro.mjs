// 复现：编辑态下从框内往外拖 → 观察是否转成「画布多选」→ 按 Backspace 会发生什么。
// 关键修正：第二个文本框放在可见区域内（上次跑到 x=1603 超出视口 1584，根本不是有效路径）。
import { spawn } from 'node:child_process';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const CHROME = ['C:\\Users\\Admin\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(p => existsSync(p));
const PORT = 9760;
const OUT = path.resolve('.canvas-eyes');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const profileDir = await mkdtemp(`${tmpdir()}\\pv-multi-`);
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
  if (r.exceptionDetails) throw new Error(`表达式异常: ${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description || ''}`);
  return r.result?.value;
};
const click = async (x, y, clickCount = 1) => {
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount, buttons: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount, buttons: 0 });
  await sleep(450);
};
const key = async (k, code, vk) => {
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  await sleep(400);
};

const STATE = `(() => {
  const root = document.querySelector('affine-edgeless-root');
  const doc = root.doc;
  const notes = doc.root.children.filter(b => b.flavour === 'affine:note');
  const sel = root.gfx.selection;
  const views = [...document.querySelectorAll('affine-edgeless-note')];
  return {
    模型文本框数: notes.length,
    视图文本框数: views.length,
    各框文字: notes.map(n => n.children.map(c => String(c.text || '')).join('').slice(0, 18)),
    各框视图尺寸: views.map(v => { const r = v.getBoundingClientRect(); return Math.round(r.width) + 'x' + Math.round(r.height); }),
    画布选中数: sel.selectedElements.length,
    画布选中类型: sel.selectedElements.map(e => e.flavour),
    编辑中的框: document.querySelector('affine-edgeless-note[data-pv-editing]')?.getAttribute('data-block-id') ?? null,
    浏览器文字选区: String(document.getSelection()).replace(/\\n/g, '|').slice(0, 40),
  };
})()`;

await mkdir(OUT, { recursive: true });
await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
await sleep(11000);

// 准备：第二个框放在默认框右下方、视口内（x≈600, y≈620），保证在拖拽路径上
await read(`(() => {
  const doc = document.querySelector('affine-edgeless-root').doc;
  doc.captureSync();
  const id = doc.addBlock('affine:note', { xywh: JSON.stringify([560, 620, 340, 140]), displayMode: 'edgeless' }, doc.root.id);
  const para = doc.addBlock('affine:paragraph', {}, id);
  doc.transact(() => { doc.getBlockById(para).text.applyDelta([{ insert: '第二个框的文字BBB' }]); });
  doc.captureSync();
  return id;
})()`);
await sleep(1500);
const positions = await read(`(() => [...document.querySelectorAll('affine-edgeless-note')].map(v => { const r = v.getBoundingClientRect(); return { left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom), cx: Math.round(r.left+r.width/2), cy: Math.round(r.top+r.height/2) }; }))()`);
console.log('各框位置:', JSON.stringify(positions));
console.log('操作前:', JSON.stringify(await read(STATE), null, 1));

// 双击第一个框进入编辑
const first = positions[0];
await click(first.cx, first.cy, 2);
console.log('\n双击后进入编辑:', await read(`!!document.querySelector('affine-edgeless-note[data-pv-editing]')`));

// 从第一个框内文字处按下，斜向拖到第二个框，再继续拖到空白
const startX = first.left + 10, startY = first.cy;
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: startX, y: startY, button: 'left', clickCount: 1, buttons: 1 });
const target = positions[1];
console.log(`\n拖拽: (${startX},${startY}) → 第二框 (${target.cx},${target.cy}) → 空白`);
const total = 14;
for (let i = 1; i <= total; i++) {
  const t = i / total;
  const x = Math.round(startX + (target.cx + 120 - startX) * t);
  const y = Math.round(startY + (target.cy + 120 - startY) * t);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1 });
  await sleep(30);
  if (i % 3 === 0 || i === total) {
    const s = await read(STATE);
    console.log(`  ${String(i).padStart(2)}/${total}  画布选中=${s.画布选中数} ${JSON.stringify(s.画布选中类型)}  编辑中=${s.编辑中的框 ? s.编辑中的框.slice(0,6) : '无'}  文字选区=${JSON.stringify(s.浏览器文字选区)}`);
  }
}
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: Math.round(target.cx + 120), y: Math.round(target.cy + 120), button: 'left', clickCount: 1, buttons: 0 });
await sleep(500);
const afterDrag = await read(STATE);
console.log('\n松手后:', JSON.stringify({ 画布选中数: afterDrag.画布选中数, 选中类型: afterDrag.画布选中类型, 文字选区: afterDrag.浏览器文字选区 }));

// 按 Backspace
const errorsBefore = errors.length;
await key('Backspace', 'Backspace', 8);
const after = await read(STATE);
console.log('\n=== 按 Backspace 之后 ===');
console.log(JSON.stringify(after, null, 1));
const newErrors = errors.slice(errorsBefore);
console.log(`新增报错 (${newErrors.length}):`);
newErrors.slice(0, 4).forEach(e => console.log('  ✗ ' + String(e).slice(0, 200)));

const shot = await send('Page.captureScreenshot', { format: 'png' });
await writeFile(path.join(OUT, 'multi-select-repro.png'), Buffer.from(shot.data, 'base64'));
console.log('截图: .canvas-eyes/multi-select-repro.png');

socket.close(); try { child.kill(); } catch {}
await sleep(300);
await rm(profileDir, { recursive: true, force: true }).catch(() => {});
process.exit(0);
