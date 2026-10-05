// 定位「加粗/斜体全部失效」的原因。
// 重点检查：进入编辑后，活动文本框及其编辑宿主的 contenteditable 状态，
// 以及 BlockSuite 的格式化命令是否还有效。
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
const CHROME = ['C:\\Users\\Admin\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(p => existsSync(p));
const PORT = 9860;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const profileDir = await mkdtemp(`${tmpdir()}\\pv-fmt-`);
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

// 建两个文本框，便于观察「封印其他框」的影响
await read(`(() => {
  const doc = document.querySelector('affine-edgeless-root').doc;
  doc.captureSync();
  doc.transact(() => { for (const c of [...doc.root.children]) if (c.flavour === 'affine:note') doc.deleteBlock(c); });
  const mk = (xywh, text) => {
    const id = doc.addBlock('affine:note', { xywh: JSON.stringify(xywh), displayMode: 'edgeless' }, doc.root.id);
    const p = doc.addBlock('affine:paragraph', {}, id);
    doc.transact(() => doc.getBlockById(p).text.applyDelta([{ insert: text }]));
    return id;
  };
  mk([150, 150, 420, 160], '第一个框的内容AAAA');
  mk([150, 420, 420, 160], '第二个框的内容BBBB');
  doc.captureSync();
  return true;
})()`);
await sleep(1500);

console.log('=== 进入编辑前的可编辑状态 ===');
console.log(JSON.stringify(await read(`(() => [...document.querySelectorAll('affine-edgeless-note')].map(v => ({ id: v.getAttribute('data-block-id').slice(0,6), contenteditable: v.getAttribute('contenteditable'), 编辑中: v.hasAttribute('data-pv-editing') })))()`), null, 1));

const pos = await read(`(() => { const v = document.querySelector('affine-edgeless-note'); const r = v.getBoundingClientRect(); return { cx: Math.round(r.left+r.width/2), cy: Math.round(r.top+r.height/2) }; })()`);
await click(pos.cx, pos.cy, 2);
await sleep(700);

console.log('\n=== 进入编辑后 ===');
const detail = await read(`(() => {
  const notes = [...document.querySelectorAll('affine-edgeless-note')];
  const active = document.querySelector('affine-edgeless-note[data-pv-editing]');
  const editor = active && active.querySelector('.inline-editor');
  const root = document.querySelector('affine-edgeless-root');
  return {
    各框: notes.map(v => ({ id: v.getAttribute('data-block-id').slice(0,6), contenteditable: v.getAttribute('contenteditable'), 编辑中: v.hasAttribute('data-pv-editing') })),
    活动框内容editable: active ? { 属性: active.getAttribute('contenteditable'), 计算值: getComputedStyle(active).contentEditable } : null,
    内层编辑器: editor ? { 属性: editor.getAttribute('contenteditable'), 计算值: getComputedStyle(editor).contentEditable, 有焦点: document.activeElement === editor } : null,
    编辑宿主root: { 属性: root.getAttribute('contenteditable'), 计算值: getComputedStyle(root).contentEditable },
    当前活动元素: document.activeElement ? document.activeElement.tagName.toLowerCase() + (document.activeElement.className ? '.' + String(document.activeElement.className).split(' ')[0] : '') : null,
    格式栏是否存在: !!document.querySelector('affine-format-bar-widget, .affine-format-bar'),
  };
})()`);
console.log(JSON.stringify(detail, null, 1));

console.log('\n=== 选中文字后，格式栏是否出现 + execCommand 能否生效 ===');
const para = await read(`(() => { const p = document.querySelector('affine-edgeless-note[data-pv-editing] affine-paragraph'); const r = p.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top + r.height/2), w: Math.round(r.width) }; })()`);
// 用真实鼠标在段落内拖选
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: para.x + 4, y: para.y, button: 'left', clickCount: 1, buttons: 1 });
for (let i = 1; i <= 6; i++) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: para.x + 4 + i * 20, y: para.y, button: 'left', buttons: 1 });
  await sleep(30);
}
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: para.x + 124, y: para.y, button: 'left', clickCount: 1, buttons: 0 });
await sleep(700);

const fmt = await read(`(() => {
  const sel = document.getSelection();
  const found = [];
  const seen = new Set();
  const walk = r => { for (const el of r.querySelectorAll('*')) { const t = el.tagName.toLowerCase(); if (/format-bar|formatbar/.test(t + ' ' + String(el.className||''))) found.push(t + '.' + [...el.classList].join('.')); if (el.shadowRoot && !seen.has(el.shadowRoot)) { seen.add(el.shadowRoot); walk(el.shadowRoot); } } };
  walk(document);
  return {
    选区文字: String(sel).slice(0, 20),
    选区折叠: sel.isCollapsed,
    格式栏元素: found.slice(0, 6),
    // 用命令查询粗体是否可用（queryCommandEnabled 反映当前是否可执行）
    粗体可执行: (() => { try { return document.queryCommandEnabled('bold'); } catch (e) { return 'ERR:' + e.message; } })(),
    粗体状态: (() => { try { return document.queryCommandState('bold'); } catch (e) { return 'ERR:' + e.message; } })(),
  };
})()`);
console.log(JSON.stringify(fmt, null, 1));

// 尝试执行加粗，看模型是否真的改变
const before = await read(`(() => { const doc = document.querySelector('affine-edgeless-root').doc; const n = doc.root.children.filter(b => b.flavour === 'affine:note')[0]; return JSON.stringify(n.children[0].text.toDelta ? n.children[0].text.toDelta() : String(n.children[0].text)); })()`);
const execResult = await read(`(() => { try { return document.execCommand('bold'); } catch (e) { return 'ERR:' + e.message; } })()`);
await sleep(600);
const after = await read(`(() => { const doc = document.querySelector('affine-edgeless-root').doc; const n = doc.root.children.filter(b => b.flavour === 'affine:note')[0]; return JSON.stringify(n.children[0].text.toDelta ? n.children[0].text.toDelta() : String(n.children[0].text)); })()`);
console.log(`\nexecCommand('bold') 返回: ${JSON.stringify(execResult)}`);
console.log(`加粗前模型: ${String(before).slice(0, 120)}`);
console.log(`加粗后模型: ${String(after).slice(0, 120)}`);
console.log(`模型是否变化: ${before !== after}`);

console.log(`\n未捕获异常: ${errors.length}`);
errors.slice(0, 4).forEach(e => console.log('  ✗ ' + String(e).slice(0, 200)));

socket.close(); try { child.kill(); } catch {}
await sleep(300);
await rm(profileDir, { recursive: true, force: true }).catch(() => {});
process.exit(0);
