// 单独验证：通过 CDP 发送 Ctrl+C，哪种参数组合才能真正触发浏览器复制。
// 用一个已知内容的 textarea 做对照，避免被画布逻辑干扰。
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
const CHROME = ['C:\\Users\\Admin\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(p => existsSync(p));
const PORT = 9800;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const profileDir = await mkdtemp(`${tmpdir()}\\pv-send-`);
const child = spawn(CHROME, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${profileDir}`, '--no-first-run',
  '--no-default-browser-check', '--window-size=1200,800', '--headless=new', 'about:blank'], { cwd: profileDir, windowsHide: true, stdio: 'ignore' });
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
const click = async (x, y) => {
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 });
  await sleep(300);
};

await send('Page.enable'); await send('Runtime.enable');
// 用一个简单的测试页，排除画布干扰
await send('Page.navigate', { url: 'data:text/html,<textarea id=t style="width:400px;height:100px">HELLO-COPY-ME</textarea><div id=log></div>' });
await sleep(1200);
await read(`(() => {
  window.__ev = [];
  for (const type of ['keydown','copy','paste','beforeinput']) {
    document.addEventListener(type, e => window.__ev.push({ 事件: type, 键: e.key ?? null, ctrl: e.ctrlKey ?? null, 阻止: e.defaultPrevented, 类型: e.inputType ?? null }), true);
  }
  document.querySelector('#t').focus();
  document.querySelector('#t').select();
  return 'ready';
})()`);
await click(200, 50);
await read(`document.querySelector('#t').select(); 'selected'`);

const variants = [
  { 名称: 'A: 仅 rawKeyDown', events: [
    { type: 'rawKeyDown', key: 'c', code: 'KeyC', windowsVirtualKeyCode: 67, nativeVirtualKeyCode: 67, modifiers: 2 },
    { type: 'keyUp', key: 'c', code: 'KeyC', windowsVirtualKeyCode: 67, nativeVirtualKeyCode: 67, modifiers: 2 },
  ]},
  { 名称: 'B: rawKeyDown + char', events: [
    { type: 'rawKeyDown', key: 'c', code: 'KeyC', windowsVirtualKeyCode: 67, nativeVirtualKeyCode: 67, modifiers: 2 },
    { type: 'char', key: 'c', text: 'c', unmodifiedText: 'c', windowsVirtualKeyCode: 67, nativeVirtualKeyCode: 67, modifiers: 2 },
    { type: 'keyUp', key: 'c', code: 'KeyC', windowsVirtualKeyCode: 67, nativeVirtualKeyCode: 67, modifiers: 2 },
  ]},
  { 名称: 'C: keyDown + text + unmodifiedText', events: [
    { type: 'keyDown', key: 'c', code: 'KeyC', text: 'c', unmodifiedText: 'c', windowsVirtualKeyCode: 67, nativeVirtualKeyCode: 67, modifiers: 2 },
    { type: 'keyUp', key: 'c', code: 'KeyC', windowsVirtualKeyCode: 67, nativeVirtualKeyCode: 67, modifiers: 2 },
  ]},
  { 名称: 'D: rawKeyDown + commands:["copy"]', events: [
    { type: 'rawKeyDown', key: 'c', code: 'KeyC', windowsVirtualKeyCode: 67, nativeVirtualKeyCode: 67, modifiers: 2, commands: ['copy'] },
    { type: 'keyUp', key: 'c', code: 'KeyC', windowsVirtualKeyCode: 67, nativeVirtualKeyCode: 67, modifiers: 2 },
  ]},
];

for (const v of variants) {
  await read(`window.__ev.length = 0; document.querySelector('#t').focus(); document.querySelector('#t').select();`);
  for (const ev of v.events) await send('Input.dispatchKeyEvent', ev);
  await sleep(400);
  const evs = await read(`window.__ev`);
  console.log(`\n${v.名称}`);
  console.log(`  事件: ${JSON.stringify(evs)}`);
}
socket.close(); try { child.kill(); } catch {}
await sleep(300);
await rm(profileDir, { recursive: true, force: true }).catch(() => {});
process.exit(0);
