// 按用户给出的精确条件复现：
//   双击进入文本框编辑 → 按住拖动选中文字 → 不松手继续拖到框外（画布空白区）
//   → 观察是否把其他文本框也纳入选中 → 松手 → 按 Backspace → 检查残留
//
// 读取状态时用正确的字段（BlockSuite 的文字存在子段落块上，不在 note.text）。
import { spawn } from 'node:child_process';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const CHROME = ['C:\\Users\\Admin\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(p => existsSync(p));
const PORT = 9750;
const OUT = path.resolve('.canvas-eyes');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const profileDir = await mkdtemp(`${tmpdir()}\\pv-outdrag-`);
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

// 用正确字段读取：文字在子段落块上
const STATE = `(() => {
  const root = document.querySelector('affine-edgeless-root');
  const doc = root.doc;
  const notes = doc.root.children.filter(b => b.flavour === 'affine:note');
  const desc = notes.map(n => ({
    id: n.id,
    子块: n.children.map(c => c.flavour),
    文字: n.children.map(c => String(c.text || '')).join('').slice(0, 20),
  }));
  const views = [...document.querySelectorAll('affine-edgeless-note')];
  const sel = root.gfx.selection;
  return {
    模型文本框数: notes.length,
    视图文本框数: views.length,
    各框: desc,
    选中元素数: sel.selectedElements.length,
    选中元素类型: sel.selectedElements.map(e => e.flavour),
    文字选区: String(document.getSelection()).slice(0, 50),
    视图尺寸: views.map(v => { const r = v.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }),
  };
})()`;

await mkdir(OUT, { recursive: true });
await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
await sleep(11000);

// ── 准备：再建一个带文字的文本框，让它位于默认文本框右侧，便于观察是否被卷入 ──
const setup = await read(`(() => {
  const root = document.querySelector('affine-edgeless-root');
  const doc = root.doc;
  doc.captureSync();
  const id = doc.addBlock('affine:note', {
    xywh: JSON.stringify([900, 420, 320, 140]),
    displayMode: 'edgeless',
  }, doc.root.id);
  const para = doc.addBlock('affine:paragraph', {}, id);
  const text = new (doc.getBlockById(para).text.constructor)('第二个框的内容BBB');
  doc.transact(() => { doc.getBlockById(para).text.applyDelta([{ insert: '第二个框的内容BBB' }]); });
  doc.captureSync();
  return { 新文本框: id };
})()`);
console.log('准备:', JSON.stringify(setup));
await sleep(1200);
console.log('操作前状态:', JSON.stringify(await read(STATE), null, 1));

// ── 真实操作：双击默认文本框进入编辑 ──────────────────────────────
const pos = await read(`(() => {
  const v = document.querySelector('affine-edgeless-note');
  const r = v.getBoundingClientRect();
  return { left: Math.round(r.left), right: Math.round(r.right), cx: Math.round(r.left + r.width/2), cy: Math.round(r.top + r.height/2), top: Math.round(r.top), bottom: Math.round(r.bottom) };
})()`);
console.log(`\n默认文本框: ${JSON.stringify(pos)}`);
await click(pos.cx, pos.cy, 2);
console.log('双击后进入编辑:', await read(`!!document.querySelector('affine-edgeless-note[data-pv-editing]')`));

// ── 关键：从框内文字处按下，让拖拽路径依次经过第二个框，最后到框外空白区 ──
console.log('\n=== 按住拖动：框内 → 经过第二个框 → 框外空白区（逐步观察选区归属）===');
const startX = pos.left + 8;
const startY = pos.cy;
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: startX, y: startY, button: 'left', clickCount: 1, buttons: 1 });

const notePos = await read(`(() => {
  const views = [...document.querySelectorAll('affine-edgeless-note')];
  return views.map(v => { const r = v.getBoundingClientRect(); return { cx: Math.round(r.left + r.width/2), cy: Math.round(r.top + r.height/2), top: Math.round(r.top), bottom: Math.round(r.bottom) }; });
})()`);
console.log(`各文本框位置: ${JSON.stringify(notePos)}`);

// 路径：从第一个框内出发 → 上移到第二个框 → 再横穿到框外空白
const target = notePos[1] || { cx: pos.cx, cy: pos.bottom + 100 };
const waypoints = [];
for (let i = 1; i <= 6; i++) {
  waypoints.push({ x: Math.round(startX + (target.cx - startX) * i / 6), y: Math.round(startY + (target.cy - startY) * i / 6), note: `走向第二框 ${i}/6` });
}
for (let i = 1; i <= 5; i++) {
  waypoints.push({ x: Math.round(target.cx + 260 * i / 5), y: Math.round(target.cy + 120 * i / 5), note: `继续拖出框外 ${i}/5` });
}

const noteOfSel = `(() => {
  const sel = document.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const nodeOf = n => (n instanceof Element ? n : n?.parentElement);
  const idOf = n => nodeOf(n)?.closest?.('affine-edgeless-note')?.getAttribute('data-block-id') ?? null;
  const r = sel.getRangeAt(0);
  return {
    锚点框: idOf(r.startContainer), 焦点框: idOf(r.endContainer),
    跨框: idOf(r.startContainer) !== idOf(r.endContainer),
    文字: String(sel.toString()).replace(/\\n/g, '|').slice(0, 40),
  };
})()`;

let prev = null;
for (const wp of waypoints) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: wp.x, y: wp.y, button: 'left', buttons: 1 });
  await sleep(35);
  const s = await read(noteOfSel);
  const line = `  选中框数=${s && s.跨框 ? '2+ 跨框!' : '1'}  锚点=${s?.锚点框?.slice(0,6)}  焦点=${s?.焦点框?.slice(0,6)}  文字=${JSON.stringify(s?.文字 ?? '')}`;
  if (!prev || prev.跨框 !== s?.跨框 || prev.文字 !== s?.文字) {
    console.log(`  ${wp.note.padEnd(16)} ${line}`);
  }
  prev = s;
}
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: waypoints.at(-1).x, y: waypoints.at(-1).y, button: 'left', clickCount: 1, buttons: 0 });
await sleep(500);
const afterDrag = await read(STATE);
console.log('\n松手后:', JSON.stringify({ 选中元素数: afterDrag.选中元素数, 选中类型: afterDrag.选中元素类型, 文字选区: afterDrag.文字选区 }));

// ── 按 Backspace ────────────────────────────────────────────────────
const errorsBefore = errors.length;
await key('Backspace', 'Backspace', 8);
const after = await read(STATE);
const newErrors = errors.slice(errorsBefore);

console.log('\n=== 按 Backspace 之后 ===');
console.log(JSON.stringify(after, null, 1));
console.log(`\n新增报错 (${newErrors.length}):`);
newErrors.slice(0, 5).forEach(e => console.log('  ✗ ' + String(e).slice(0, 200)));

// 判定：文字是否丢失，或视图是否损坏
const lostText = after.各框.filter(n => !n.文字).length;
const collapsed = after.视图尺寸.filter(([, h]) => h < 20).length;
console.log(`\n空文字框: ${lostText} / ${after.模型文本框数}`);
console.log(`塌陷视图(高<20px): ${collapsed}`);
console.log(`判定: ${(lostText > 0 || collapsed > 0) ? '⚠️ 复现到异常——文字丢失或视图塌陷' : '✅ 未复现异常'}`);

const shot = await send('Page.captureScreenshot', { format: 'png' });
await writeFile(path.join(OUT, 'drag-outside-repro.png'), Buffer.from(shot.data, 'base64'));
console.log('截图: .canvas-eyes/drag-outside-repro.png');

socket.close(); try { child.kill(); } catch {}
await sleep(300);
await rm(profileDir, { recursive: true, force: true }).catch(() => {});
process.exit(0);
