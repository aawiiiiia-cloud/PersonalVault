// 诊断三件事：
//   A. 文本框里那个「灰色小竖线」是什么元素（有抓手光标、可拖动）
//   B. iframe 里 navigator.clipboard 是否可用；execCommand('copy') 能否作为兜底
//   C. 编辑态内双击是否被我们的 dblclick 处理器劫持
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
const CHROME = ['C:\\Users\\Admin\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(p => existsSync(p));
const PORT = 9830;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const profileDir = await mkdtemp(`${tmpdir()}\\pv-three-`);
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

// ── A. 找出文本框内那个「灰色小竖线」 ─────────────────────────────────────
console.log('=== A. 文本框内的灰竖线（列出所有子元素及其光标/尺寸/背景）===');
await read(`(() => {
  const doc = document.querySelector('affine-edgeless-root').doc;
  doc.captureSync();
  doc.transact(() => { for (const c of [...doc.root.children]) if (c.flavour === 'affine:note') doc.deleteBlock(c); });
  const id = doc.addBlock('affine:note', { xywh: JSON.stringify([200, 200, 460, 200]), displayMode: 'edgeless' }, doc.root.id);
  const p1 = doc.addBlock('affine:paragraph', {}, id);
  doc.transact(() => doc.getBlockById(p1).text.applyDelta([{ insert: '第一行内容' }]));
  const p2 = doc.addBlock('affine:paragraph', {}, id);
  doc.transact(() => doc.getBlockById(p2).text.applyDelta([{ insert: '第二行内容撒大苏' }]));
  doc.captureSync();
  return id;
})()`);
await sleep(1500);

const elements = await read(`(() => {
  const note = document.querySelector('affine-edgeless-note');
  const noteRect = note.getBoundingClientRect();
  const out = [];
  const walk = (root, depth) => {
    for (const el of root.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      out.push({
        层级: depth,
        标签: el.tagName.toLowerCase(),
        类名: [...el.classList].slice(0, 4).join('.') || null,
        伪元素: null,
        光标: cs.cursor,
        背景: cs.backgroundColor,
        尺寸: [Math.round(r.width), Math.round(r.height)],
        相对note: [Math.round(r.left - noteRect.left), Math.round(r.top - noteRect.top)],
      });
      if (el.shadowRoot) walk(el.shadowRoot, depth + 1);
    }
  };
  walk(note, 0);
  // 伪元素也要看：灰竖线很可能来自 ::before/::after
  const pseudo = [];
  for (const el of [...note.querySelectorAll('*')].slice(0, 40)) {
    for (const which of ['::before', '::after']) {
      const cs = getComputedStyle(el, which);
      if (cs.content && cs.content !== 'none' && cs.display !== 'none') {
        pseudo.push({ 宿主: el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : ''), 伪元素: which, content: cs.content, 宽: cs.width, 高: cs.height, 背景: cs.backgroundColor, 光标: cs.cursor, 位置: cs.position });
      }
    }
  }
  return { 元素: out.filter(e => e.尺寸[0] > 0 && e.尺寸[1] > 0), 伪元素: pseudo };
})()`);
console.log('元素列表:');
for (const el of (elements.元素 || [])) {
  console.log(`  层${el.层级} ${el.标签}${el.类名 ? '.' + el.类名 : ''}  光标=${el.光标}  背景=${el.背景}  ${el.尺寸[0]}x${el.尺寸[1]}  相对note=${JSON.stringify(el.相对note)}`);
}
console.log('伪元素:');
for (const p of (elements.伪元素 || [])) console.log(`  ${p.宿主}${p.伪元素}  content=${p.content} ${p.宽}x${p.高} 背景=${p.背景} 光标=${p.光标} ${p.位置}`);

// ── B. 剪贴板能力探测 ───────────────────────────────────────────────────
console.log('\n=== B. 剪贴板能力 ===');
const clipboard = await read(`(async () => {
  const result = { 在iframe内: window.top !== window.self };
  result.有clipboard对象 = !!navigator.clipboard;
  result.有writeText = !!(navigator.clipboard && navigator.clipboard.writeText);
  result.有readText = !!(navigator.clipboard && navigator.clipboard.readText);
  result.权限API可用 = !!navigator.permissions;
  // 实测 writeText
  if (result.有writeText) {
    try { await navigator.clipboard.writeText('PROBE-WRITE-OK'); result.writeText = '成功'; }
    catch (e) { result.writeText = '失败: ' + e.name + ' ' + e.message; }
  }
  // 实测 execCommand 兜底
  try {
    const ta = document.createElement('textarea');
    ta.value = 'PROBE-EXEC-OK';
    ta.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(ta);
    ta.select();
    result.execCommand = document.execCommand('copy') ? '成功' : '返回false';
    ta.remove();
  } catch (e) { result.execCommand = '异常: ' + e.message; }
  // 复制事件里 clipboardData 是否可写
  result.clipboardData可写 = (() => {
    let ok = null;
    const handler = ev => { try { ev.clipboardData.setData('text/plain', 'PROBE-EV'); ok = '可写'; } catch (e) { ok = '不可写: ' + e.message; } };
    document.addEventListener('copy', handler);
    document.dispatchEvent(new ClipboardEvent('copy', { clipboardData: new DataTransfer(), bubbles: true, cancelable: true }));
    document.removeEventListener('copy', handler);
    return ok;
  })();
  return result;
})()`);
console.log(JSON.stringify(clipboard, null, 1));

// ── C. 编辑态内双击是否被劫持 ───────────────────────────────────────────
console.log('\n=== C. 编辑态内双击行为 ===');
await read(`(() => {
  const doc = document.querySelector('affine-edgeless-root').doc;
  doc.captureSync();
  doc.transact(() => { for (const c of [...doc.root.children]) if (c.flavour === 'affine:note') doc.deleteBlock(c); });
  const id = doc.addBlock('affine:note', { xywh: JSON.stringify([200, 200, 460, 180]), displayMode: 'edgeless' }, doc.root.id);
  const p1 = doc.addBlock('affine:paragraph', {}, id);
  doc.transact(() => doc.getBlockById(p1).text.applyDelta([{ insert: '第一行内容' }]));
  const p2 = doc.addBlock('affine:paragraph', {}, id);
  doc.transact(() => doc.getBlockById(p2).text.applyDelta([{ insert: '第二行内容' }]));
  doc.captureSync();
  return id;
})()`);
await sleep(1400);

const pos = await read(`(() => { const v = document.querySelector('affine-edgeless-note'); const r = v.getBoundingClientRect(); return { cx: Math.round(r.left + r.width/2), cy: Math.round(r.top + r.height/2), top: Math.round(r.top) }; })()`);
await click(pos.cx, pos.cy, 2);
console.log('进入编辑:', await read(`!!document.querySelector('affine-edgeless-note[data-pv-editing]')`));

// 记录 dblclick 是否被我们的处理器拦截
await read(`(() => {
  window.__dbl = [];
  document.addEventListener('dblclick', e => window.__dbl.push({ 阶段: '捕获', 目标: e.target instanceof Element ? e.target.tagName.toLowerCase() : null, 阻止: e.defaultPrevented }), true);
  document.addEventListener('dblclick', e => window.__dbl.push({ 阶段: '冒泡', 阻止: e.defaultPrevented }), false);
  return true;
})()`);

// 在第二行文字上双击（此时已在编辑态内）
const secondLine = await read(`(() => {
  const ps = [...document.querySelectorAll('affine-edgeless-note affine-paragraph')];
  if (ps.length < 2) return null;
  const r = ps[1].getBoundingClientRect();
  return { x: Math.round(r.left + 30), y: Math.round(r.top + r.height/2) };
})()`);
console.log('第二行位置:', JSON.stringify(secondLine));
if (secondLine) {
  await click(secondLine.x, secondLine.y, 2);
  const sel = await read(`(() => { const s = document.getSelection(); return { 文字: String(s).slice(0, 20), 折叠: s.isCollapsed, 偏移: s.anchorOffset, 在文本节点: s.anchorNode ? s.anchorNode.nodeType === 3 : null }; })()`);
  console.log('双击第二行后的选区:', JSON.stringify(sel));
  console.log('dblclick 记录:', JSON.stringify(await read(`window.__dbl`)));
}

console.log(`\n未捕获异常: ${errors.length}`);
errors.slice(0, 3).forEach(e => console.log('  ✗ ' + String(e).slice(0, 200)));

socket.close(); try { child.kill(); } catch {}
await sleep(300);
await rm(profileDir, { recursive: true, force: true }).catch(() => {});
process.exit(0);
