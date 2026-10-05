// 基线验证：本环境能否对「普通 contenteditable」执行加粗？
// 若连这个都不行，说明不是画布/我的改动的问题，而是无头环境限制（同剪贴板）。
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
const CHROME = ['C:\\Users\\Admin\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(p => existsSync(p));
const PORT = 9880;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const profileDir = await mkdtemp(`${tmpdir()}\\pv-fmtbase-`);
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

await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate', { url: 'data:text/html,<div id=ed contenteditable=true style="font-size:20px;padding:20px">HELLO-BOLD-TEST</div>' });
await sleep(1200);

console.log('=== 在普通 contenteditable 上测试加粗 ===');
const result = await read(`(() => {
  const ed = document.querySelector('#ed');
  ed.focus();
  const sel = document.getSelection();
  const range = document.createRange();
  range.selectNodeContents(ed);
  sel.removeAllRanges();
  sel.addRange(range);
  const before = ed.innerHTML;
  const enabled = document.queryCommandEnabled('bold');
  const exec = document.execCommand('bold');
  const after = ed.innerHTML;
  return {
    文档有焦点: document.hasFocus(),
    活动元素: document.activeElement ? document.activeElement.tagName.toLowerCase() : null,
    queryCommandEnabled: enabled,
    execCommand返回: exec,
    innerHTML_前: before,
    innerHTML_后: after,
    是否生效: before !== after,
  };
})()`);
console.log(JSON.stringify(result, null, 1));

console.log('\n=== 同样测试斜体 ===');
const italic = await read(`(() => {
  const ed = document.querySelector('#ed');
  ed.focus();
  const sel = document.getSelection();
  const range = document.createRange();
  range.selectNodeContents(ed);
  sel.removeAllRanges();
  sel.addRange(range);
  const before = ed.innerHTML;
  const exec = document.execCommand('italic');
  return { execCommand返回: exec, 是否生效: before !== ed.innerHTML, innerHTML: ed.innerHTML };
})()`);
console.log(JSON.stringify(italic, null, 1));

socket.close(); try { child.kill(); } catch {}
await sleep(300);
await rm(profileDir, { recursive: true, force: true }).catch(() => {});
process.exit(0);
