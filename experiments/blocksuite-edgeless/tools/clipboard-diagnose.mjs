// 诊断 Ctrl+C / Ctrl+V：到底是没人实现，还是被 preventDefault 挡掉。
// 在 document 捕获阶段（最早）挂钩 copy/cut/paste，记录 defaultPrevented 与剪贴板内容。
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
const CHROME = ['C:\\Users\\Admin\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(p => existsSync(p));
const PORT = 9790;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const profileDir = await mkdtemp(`${tmpdir()}\\pv-copy-`);
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
const click = async (x, y, clickCount = 1) => {
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount, buttons: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount, buttons: 0 });
  await sleep(450);
};
// CDP 发送 Ctrl 组合键必须用 type:'keyDown' 并带 text 字段，
// rawKeyDown 不会触发浏览器编辑命令（已实测：A/B/D 变体全部收不到事件，只有 C 有效）。
const combo = async (k, code, vk) => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, text: k, unmodifiedText: k, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: 2 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: 2 });
  await sleep(500);
};

await send('Page.enable'); await send('Runtime.enable');
// 授予剪贴板权限：无头浏览器默认拒绝 navigator.clipboard.readText/writeText，
// 不授权就无法验证「复制是否真的写进系统剪贴板」。
await send('Browser.grantPermissions', {
  origin: 'http://127.0.0.1:5173',
  permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
}).then(() => console.log('已授予剪贴板权限')).catch(e => console.log('授权失败:', e.message));
await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
await sleep(11000);

// 挂钩最早阶段，记录剪贴板事件是否发生、是否被 preventDefault
await read(`(() => {
  window.__clip = [];
  window.__keys = [];
  // 记录所有 keydown 是否被阻止（在冒泡阶段 setTimeout 里读 defaultPrevented）
  window.addEventListener('keydown', event => {
    const rec = { 键: event.key, ctrl: event.ctrlKey, meta: event.metaKey, 目标: event.target instanceof Element ? event.target.tagName.toLowerCase() : null, 已阻止: event.defaultPrevented };
    window.__keys.push(rec);
    setTimeout(() => { rec.已阻止_最终 = event.defaultPrevented; }, 0);
  });
  for (const type of ['copy', 'cut', 'paste']) {
    document.addEventListener(type, event => {
      window.__clip.push({ 事件: type, 已被阻止: event.defaultPrevented, 有clipboardData: !!event.clipboardData, 选中: String(document.getSelection()).slice(0, 20) });
    });
  }
  // 直接派发一个合成 copy 事件，验证「处理链是否通」——与键盘是否触发分开判断
  window.__firedSynthetic = false;
  return '已挂钩';
})()`);

const pos = await read(`(() => { const v = document.querySelector('affine-edgeless-note'); const r = v.getBoundingClientRect(); return { cx: Math.round(r.left+r.width/2), cy: Math.round(r.top+r.height/2) }; })()`);
await click(pos.cx, pos.cy, 2);
console.log('进入编辑:', await read(`!!document.querySelector('affine-edgeless-note[data-pv-editing]')`));

// 全选框内文字
await combo('a', 'KeyA', 65);
const sel = await read(`String(document.getSelection()).slice(0, 30)`);
console.log('Ctrl+A 后选区:', JSON.stringify(sel));

// Ctrl+C
await read(`window.__clip.length = 0; window.__keys.length = 0;`);
await combo('c', 'KeyC', 67);
const afterCopy = await read(`({ 剪贴板事件: window.__clip, 按键: window.__keys })`);
console.log('Ctrl+C 记录:', JSON.stringify(afterCopy, null, 1));

// 关键对照：把 stopImmediatePropagation 变成空操作，看事件是否就通了。
// 若通了 → 说明是我们的 window 捕获监听器吃掉了事件；若仍不通 → 另有原因。
const neutralized = await read(`(() => {
  window.__origStopImmediate = Event.prototype.stopImmediatePropagation;
  Event.prototype.stopImmediatePropagation = function () { window.__stopCount = (window.__stopCount || 0) + 1; };
  window.__stopCount = 0;
  return '已把 stopImmediatePropagation 变为空操作';
})()`);
console.log('对照实验:', neutralized);
await read(`window.__clip.length = 0; window.__keys.length = 0; window.__stopCount = 0;`);
await combo('c', 'KeyC', 67);
const afterCopy2 = await read(`({ 剪贴板事件: window.__clip, 按键数: window.__keys.length, 被拦截次数: window.__stopCount, 前两个键: window.__keys.slice(0,2) })`);
console.log('停用拦截后 Ctrl+C:', JSON.stringify(afterCopy2, null, 1));
await read(`Event.prototype.stopImmediatePropagation = window.__origStopImmediate; 'restored'`);

// 对照：直接派发合成 copy 事件，看处理链本身是否可用
await read(`(() => {
  const editor = document.querySelector('affine-edgeless-root');
  const event = new ClipboardEvent('copy', { bubbles: true, cancelable: true, composed: true,
    clipboardData: new DataTransfer() });
  editor.dispatchEvent(event);
  window.__syntheticResult = { 已阻止: event.defaultPrevented, 数据: event.clipboardData ? event.clipboardData.getData('text/plain').slice(0, 40) : '(无)' };
  return true;
})()`);
const synthetic = await read(`window.__syntheticResult`);
console.log('合成 copy 事件结果:', JSON.stringify(synthetic));

// 直接用浏览器剪贴板 API 读，验证是否真的写入系统剪贴板
const clipboardRead = await read(`navigator.clipboard.readText().then(t => t.slice(0, 40), e => 'ERR: ' + e.message)`);
console.log('navigator.clipboard 读到:', JSON.stringify(clipboardRead));

// Ctrl+V
await read(`window.__clip.length = 0`);
await combo('v', 'KeyV', 86);
const afterPaste = await read(`window.__clip`);
console.log('Ctrl+V 记录:', JSON.stringify(afterPaste, null, 1));
const textAfterPaste = await read(`(() => { const a = document.querySelector('affine-edgeless-note[data-pv-editing]'); const doc = document.querySelector('affine-edgeless-root').doc; const n = a && doc.getBlockById(a.getAttribute('data-block-id')); return n ? n.children.map(c => String(c.text||'')).join('').slice(0,40) : null; })()`);
console.log('粘贴后文字:', JSON.stringify(textAfterPaste));

// 端到端验证：复制 → 改内容 → 粘贴 → 应恢复原文（证明真的走了系统剪贴板）
console.log('\n=== 端到端：复制 → 删除 → 粘贴 ===');
await combo('a', 'KeyA', 65);
const original = await read(`(() => { const a = document.querySelector('affine-edgeless-note[data-pv-editing]'); const doc = document.querySelector('affine-edgeless-root').doc; const n = a && doc.getBlockById(a.getAttribute('data-block-id')); return n ? n.children.map(c => String(c.text||'')).join('') : null; })()`);
await combo('c', 'KeyC', 67);
const clipAfterCopy = await read(`navigator.clipboard.readText().then(t => t.slice(0, 40), e => 'ERR:' + e.message)`);
console.log('复制后系统剪贴板:', JSON.stringify(clipAfterCopy));
await combo('v', 'KeyV', 86);
await sleep(600);
const afterPaste2 = await read(`(() => { const a = document.querySelector('affine-edgeless-note[data-pv-editing]'); const doc = document.querySelector('affine-edgeless-root').doc; const n = a && doc.getBlockById(a.getAttribute('data-block-id')); return n ? n.children.map(c => String(c.text||'')).join('') : null; })()`);
console.log('粘贴后文字:', JSON.stringify(afterPaste2));
console.log(`\n判定: ${clipAfterCopy && !String(clipAfterCopy).startsWith('ERR') && String(clipAfterCopy).length > 0 ? '✅ 复制已写入系统剪贴板' : '❌ 复制未写入系统剪贴板'}`);

socket.close(); try { child.kill(); } catch {}
await sleep(300);
await rm(profileDir, { recursive: true, force: true }).catch(() => {});
process.exit(0);
