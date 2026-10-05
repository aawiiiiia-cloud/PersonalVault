// 验证剪贴板兜底方案：writeText 因 "Document is not focused" 失败、execCommand 返回 false，
// 只有 copy 事件里的 clipboardData.setData 报告可写。实测它能否真正写入系统剪贴板。
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
const CHROME = ['C:\\Users\\Admin\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(p => existsSync(p));
const PORT = 9840;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const profileDir = await mkdtemp(`${tmpdir()}\\pv-clip2-`);
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
await send('Browser.grantPermissions', { origin: 'http://127.0.0.1:5173', permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] }).catch(() => {});
await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
await sleep(11000);

// 方案 1：在 copy 事件里用 clipboardData.setData 写入
console.log('=== 方案1：copy 事件 + clipboardData.setData ===');
const r1 = await read(`(() => {
  let written = null;
  const handler = event => {
    try { event.clipboardData.setData('text/plain', 'PLAN1-CLIPBOARD-DATA'); written = 'setData 已调用'; }
    catch (e) { written = 'setData 异常: ' + e.message; }
  };
  document.addEventListener('copy', handler);
  document.body.focus();
  const ok = document.execCommand('copy');
  document.removeEventListener('copy', handler);
  return { written, execCommand返回: ok };
})()`);
console.log(JSON.stringify(r1));
await sleep(500);
console.log('读回剪贴板:', JSON.stringify(await read(`navigator.clipboard.readText().then(t => t, e => 'ERR: ' + e.message)`)));

// 方案 2：选中真实的可编辑元素后 execCommand('copy')
console.log('\n=== 方案2：真实选区 + execCommand(copy) ===');
const r2 = await read(`(() => {
  const ta = document.createElement('textarea');
  ta.value = 'PLAN2-EXECCOMMAND';
  ta.style.cssText = 'position:fixed;left:10px;top:10px;width:200px;height:40px;z-index:9999';
  document.body.appendChild(ta);
  ta.focus();
  ta.setSelectionRange(0, ta.value.length);
  const focused = document.hasFocus();
  const ok = document.execCommand('copy');
  ta.remove();
  return { 文档有焦点: focused, execCommand返回: ok };
})()`);
console.log(JSON.stringify(r2));
await sleep(500);
console.log('读回剪贴板:', JSON.stringify(await read(`navigator.clipboard.readText().then(t => t, e => 'ERR: ' + e.message)`)));

// 方案 3：writeText 在文档获得焦点时是否可用
console.log('\n=== 方案3：文档有焦点时的 writeText ===');
const r3 = await read(`(async () => {
  document.body.setAttribute('tabindex','-1');
  document.body.focus();
  const hasFocus = document.hasFocus();
  try { await navigator.clipboard.writeText('PLAN3-WRITETEXT'); return { 文档有焦点: hasFocus, 结果: '成功' }; }
  catch (e) { return { 文档有焦点: hasFocus, 结果: '失败: ' + e.message }; }
})()`);
console.log(JSON.stringify(r3));
await sleep(500);
console.log('读回剪贴板:', JSON.stringify(await read(`navigator.clipboard.readText().then(t => t, e => 'ERR: ' + e.message)`)));

socket.close(); try { child.kill(); } catch {}
await sleep(300);
await rm(profileDir, { recursive: true, force: true }).catch(() => {});
process.exit(0);
