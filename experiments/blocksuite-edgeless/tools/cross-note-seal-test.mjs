// 端到端验证跨框选区修复：
// 进入编辑 → 从框内拖动、让路径经过另一个框 → 断言选区是否仍被限制在当前框内。
// 判据直接对齐真实日志：观察「文字选区」是否出现其他框的文字。
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const CHROME = ['C:\\Users\\Admin\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(p => existsSync(p));
const PORT = 9770;
const OUT = path.resolve('.canvas-eyes');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const profileDir = await mkdtemp(`${tmpdir()}\\pv-seal-`);
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
  if (r.exceptionDetails) throw new Error(`表达式异常: ${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description || ''}`);
  return r.result?.value;
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

// 建第二个框，放在默认框正下方且部分重叠，让拖拽路径必然经过
await read(`(() => {
  const doc = document.querySelector('affine-edgeless-root').doc;
  doc.captureSync();
  const id = doc.addBlock('affine:note', { xywh: JSON.stringify([300, 120, 400, 160]), displayMode: 'edgeless' }, doc.root.id);
  const para = doc.addBlock('affine:paragraph', {}, id);
  doc.transact(() => { doc.getBlockById(para).text.applyDelta([{ insert: '第二个框的文字BBB' }]); });
  doc.captureSync();
  return id;
})()`);
await sleep(1400);

const layout = await read(`(() => [...document.querySelectorAll('affine-edgeless-note')].map(v => { const r = v.getBoundingClientRect(); return { cx: Math.round(r.left+r.width/2), cy: Math.round(r.top+r.height/2), left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom) }; }))()`);
console.log('布局:', JSON.stringify(layout));

const first = layout[0], second = layout[1];
await click(first.cx, first.cy, 2);
console.log('进入编辑:', await read(`!!document.querySelector('affine-edgeless-note[data-pv-editing]')`));

const SEL = `(() => {
  const sel = document.getSelection();
  const nodeOf = n => (n instanceof Element ? n : n?.parentElement);
  const idOf = n => nodeOf(n)?.closest?.('affine-edgeless-note')?.getAttribute('data-block-id') ?? null;
  if (!sel || !sel.rangeCount) return { 文字: '', 锚点框: null, 焦点框: null, 跨框: false };
  const r = sel.getRangeAt(0);
  const a = idOf(r.startContainer), f = idOf(r.endContainer);
  return { 文字: String(sel).replace(/\\s+/g,' ').slice(0, 50), 锚点框: a, 焦点框: f, 跨框: a !== f };
})()`;

// 从第一个框内起拖，一路拖到第二个框再拖出画布空白
const startX = first.left + 10, startY = first.cy;
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: startX, y: startY, button: 'left', clickCount: 1, buttons: 1 });
let crossed = false;
const total = 16;
for (let i = 1; i <= total; i++) {
  const t = i / total;
  const x = Math.round(startX + (second.cx + 150 - startX) * t);
  const y = Math.round(startY + (second.cy + 150 - startY) * t);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1 });
  await sleep(30);
  const s = await read(SEL);
  if (s.跨框) { crossed = true; console.log(`  ⚠ ${i}/${total} 跨框! 锚点=${String(s.锚点框).slice(0,6)} 焦点=${String(s.焦点框).slice(0,6)} 文字=${JSON.stringify(s.文字)}`); }
  else if (i % 4 === 0) console.log(`  ${i}/${total} 未跨框  文字=${JSON.stringify(s.文字)}`);
}
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: second.cx + 150, y: second.cy + 150, button: 'left', clickCount: 1, buttons: 0 });
await sleep(400);

const after = await read(`(() => {
  const doc = document.querySelector('affine-edgeless-root').doc;
  const notes = doc.root.children.filter(b => b.flavour === 'affine:note');
  return {
    文本框数: notes.length,
    结构损坏框: notes.filter(n => n.children.length === 0).length,
    各框文字: notes.map(n => n.children.map(c => String(c.text||'')).join('').slice(0,16)),
  };
})()`);
console.log('\n结果:', JSON.stringify(after, null, 1));
const newErrors = errors.length;
console.log(`未捕获异常: ${newErrors}`);
newErrors && errors.slice(0,3).forEach(e => console.log('  ✗ ' + String(e).slice(0,160)));

const pass = !crossed && after.结构损坏框 === 0;
console.log(`\n判定: ${pass ? '✅ 通过——拖拽全程选区未跨框，无结构损坏' : '❌ 未通过'}`);

const shot = await send('Page.captureScreenshot', { format: 'png' });
await writeFile(path.join(OUT, 'seal-fix-verify.png'), Buffer.from(shot.data, 'base64'));

socket.close(); try { child.kill(); } catch {}
await sleep(300);
await rm(profileDir, { recursive: true, force: true }).catch(() => {});
process.exit(pass ? 0 : 1);
