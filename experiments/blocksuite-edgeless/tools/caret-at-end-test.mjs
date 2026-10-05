// 验证：双击进入文本框后，光标是否定位到文字末尾（而不是开头）。
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
const CHROME = ['C:\\Users\\Admin\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(p => existsSync(p));
const PORT = 9820;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const profileDir = await mkdtemp(`${tmpdir()}\\pv-caret-`);
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
  await sleep(500);
};

await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
await sleep(11000);

// 建一个已知内容的文本框
await read(`(() => {
  const doc = document.querySelector('affine-edgeless-root').doc;
  doc.captureSync();
  doc.transact(() => { for (const c of [...doc.root.children]) if (c.flavour === 'affine:note') doc.deleteBlock(c); });
  const id = doc.addBlock('affine:note', { xywh: JSON.stringify([200, 200, 240, 92]), displayMode: 'edgeless' }, doc.root.id);
  const p = doc.addBlock('affine:paragraph', {}, id);
  doc.transact(() => doc.getBlockById(p).text.applyDelta([{ insert: 'ABCDEFGHIJ' }]));
  doc.updateBlock(doc.getBlockById(id), () => {
    const note = doc.getBlockById(id);
    note.edgeless.collapse = true;
    note.edgeless.collapsedHeight = 92;
  });
  doc.captureSync();
  return id;
})()`);
await sleep(1400);

const pos = await read(`(() => { const v = document.querySelector('affine-edgeless-note'); const r = v.getBoundingClientRect(); return { cx: Math.round(r.left + r.width/2), cy: Math.round(r.top + r.height/2) }; })()`);
await click(pos.cx, pos.cy, 2);
console.log('进入编辑:', await read(`!!document.querySelector('affine-edgeless-note[data-pv-editing]')`));

const caret = await read(`(() => {
  const sel = document.getSelection();
  const noteText = 'ABCDEFGHIJ';
  const anchor = sel.anchorNode;
  const nodeText = anchor && anchor.nodeType === 3 ? anchor.textContent : (anchor && anchor.textContent) || '';
  return {
    锚点在文本节点内: !!(anchor && anchor.nodeType === 3),
    锚点偏移: sel.anchorOffset,
    所在节点文字: nodeText.slice(0, 24),
    是否在末尾: sel.anchorOffset === nodeText.length && nodeText.length > 0,
    是否为折叠光标: sel.isCollapsed,
  };
})()`);
console.log('光标状态:', JSON.stringify(caret, null, 1));

const blank = await read(`(() => {
  const note = document.querySelector('affine-edgeless-note[data-pv-editing]');
  const rect = note.getBoundingClientRect();
  const x = Math.round(rect.right - 32), y = Math.round(rect.bottom - 32);
  const target = document.elementFromPoint(x, y);
  return { x, y, target: target?.tagName, className: String(target?.className || '') };
})()`);
console.log('空白点击目标:', JSON.stringify(blank));
await click(blank.x, blank.y);
const afterBlank = await read(`(() => {
  const sel = document.getSelection();
  const node = sel.anchorNode;
  const root = document.querySelector('affine-edgeless-root');
  return {
    editing: !!document.querySelector('affine-edgeless-note[data-pv-editing]'),
    active: document.activeElement?.tagName,
    anchorNode: node?.nodeName ?? null,
    anchorText: node?.textContent?.slice(0, 30) ?? null,
    anchorOffset: sel.anchorOffset,
    modelSelection: root.gfx.std.selection.find('text')?.toJSON?.() ?? null,
  };
})()`);
console.log('点击框内空白后:', JSON.stringify(afterBlank));

// 直接输入一个字符，验证它是否追加到末尾
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Z', code: 'KeyZ', text: 'Z', unmodifiedText: 'Z', windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Z', code: 'KeyZ', windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90 });
await sleep(600);
const afterType = await read(`(() => {
  const doc = document.querySelector('affine-edgeless-root').doc;
  const n = doc.root.children.filter(b => b.flavour === 'affine:note')[0];
  return n.children.map(c => String(c.text || '')).join('');
})()`);
console.log('输入 Z 之后文字:', JSON.stringify(afterType));

const middle = await read(`(() => {
  const inline = document.querySelector('affine-edgeless-note[data-pv-editing] .inline-editor');
  const walker = document.createTreeWalker(inline, NodeFilter.SHOW_TEXT);
  let text = walker.nextNode();
  while (text && text.textContent.length < 4) text = walker.nextNode();
  const range = document.createRange();
  range.setStart(text, 4);
  range.collapse(true);
  const rect = range.getBoundingClientRect();
  return { x: Math.round(rect.left), y: Math.round(rect.top + rect.height / 2) };
})()`);
await click(middle.x, middle.y);
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Y', code: 'KeyY', text: 'Y', unmodifiedText: 'Y', windowsVirtualKeyCode: 89, nativeVirtualKeyCode: 89 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Y', code: 'KeyY', windowsVirtualKeyCode: 89, nativeVirtualKeyCode: 89 });
await sleep(500);
const afterMiddle = await read(`(() => {
  const doc = document.querySelector('affine-edgeless-root').doc;
  return doc.root.children.find(block => block.flavour === 'affine:note').children.map(child => String(child.text || '')).join('');
})()`);
console.log('点击文字中间输入 Y:', JSON.stringify(afterMiddle));

await click(blank.x, blank.y, 2);
const afterBlankDouble = await read(`(() => {
  const selection = document.getSelection();
  const root = document.querySelector('affine-edgeless-root');
  return { anchor: selection.anchorNode?.nodeName, text: selection.anchorNode?.textContent?.slice(0, 20),
    offset: selection.anchorOffset, model: root.gfx.std.selection.find('text')?.toJSON?.() ?? null };
})()`);
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'W', code: 'KeyW', text: 'W', unmodifiedText: 'W', windowsVirtualKeyCode: 87, nativeVirtualKeyCode: 87 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'W', code: 'KeyW', windowsVirtualKeyCode: 87, nativeVirtualKeyCode: 87 });
await sleep(400);
const afterBlankDoubleType = await read(`(() => {
  const doc = document.querySelector('affine-edgeless-root').doc;
  return doc.root.children.find(block => block.flavour === 'affine:note').children.map(child => String(child.text || '')).join('');
})()`);
console.log('双击空白后光标:', JSON.stringify(afterBlankDouble));
console.log('双击空白后输入 W:', JSON.stringify(afterBlankDoubleType));

const afterText = await read(`(() => {
  const note = document.querySelector('affine-edgeless-note[data-pv-editing]');
  const inline = note.querySelector('.inline-editor');
  const walker = document.createTreeWalker(inline, NodeFilter.SHOW_TEXT);
  let last = null;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) if (node.textContent.length) last = node;
  const range = document.createRange();
  range.setStart(last, last.textContent.length);
  range.collapse(true);
  const caretRect = range.getBoundingClientRect();
  const noteRect = note.getBoundingClientRect();
  const x = Math.min(Math.round(caretRect.right + 16), Math.round(noteRect.right - 16));
  const y = Math.round(caretRect.top + caretRect.height / 2);
  const target = document.elementFromPoint(x, y);
  return { x, y, target: target?.tagName, className: String(target?.className || '') };
})()`);
console.log('光标后空白位置:', JSON.stringify(afterText));
await click(afterText.x, afterText.y, 2);
const afterTextDouble = await read(`(() => {
  const selection = document.getSelection();
  const root = document.querySelector('affine-edgeless-root');
  return { anchor: selection.anchorNode?.nodeName, text: selection.anchorNode?.textContent?.slice(0, 20),
    offset: selection.anchorOffset, model: root.gfx.std.selection.find('text')?.toJSON?.() ?? null };
})()`);
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'V', code: 'KeyV', text: 'V', unmodifiedText: 'V', windowsVirtualKeyCode: 86, nativeVirtualKeyCode: 86 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'V', code: 'KeyV', windowsVirtualKeyCode: 86, nativeVirtualKeyCode: 86 });
await sleep(400);
const afterTextDoubleType = await read(`(() => {
  const doc = document.querySelector('affine-edgeless-root').doc;
  return doc.root.children.find(block => block.flavour === 'affine:note').children.map(child => String(child.text || '')).join('');
})()`);
console.log('双击光标后空白处光标:', JSON.stringify(afterTextDouble));
console.log('双击光标后空白处输入 V:', JSON.stringify(afterTextDoubleType));

await click(middle.x, middle.y, 2);
const wordSelection = await read(`(() => ({
  native: String(document.getSelection()),
  model: document.querySelector('affine-edgeless-root').gfx.std.selection.find('text')?.toJSON?.() ?? null,
}))()`);
console.log('双击实际文字的选区:', JSON.stringify(wordSelection));

const pass = caret.是否在末尾 === true && caret.是否为折叠光标 === true
  && afterType === 'ABCDEFGHIJZ' && afterMiddle.includes('Y') && !afterMiddle.endsWith('Y')
  && afterBlankDoubleType.endsWith('W') && afterBlankDouble.model?.from?.index === afterMiddle.length
  && afterTextDoubleType.endsWith('V') && afterTextDouble.model?.from?.index === afterBlankDoubleType.length
  && wordSelection.native.length > 0 && wordSelection.model?.from?.length > 0;
console.log(`\n判定: ${pass ? '✅ 通过——光标定位到末尾，输入追加在结尾' : '❌ 未通过'}`);
console.log(`未捕获异常: ${errors.length}`);
errors.slice(0, 3).forEach(e => console.log('  ✗ ' + String(e).slice(0, 160)));

socket.close(); try { child.kill(); } catch {}
await sleep(300);
await rm(profileDir, { recursive: true, force: true }).catch(() => {});
process.exit(pass ? 0 : 1);
