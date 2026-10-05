// A/B 实验：installCanvasFocusClaim 的 pointerdown 抢焦点，是否导致
// 「内层编辑器拿不到焦点 → 加粗/斜体失效」。
// 做法：进入编辑后点一下文字（真实点击），分别在「抢焦点生效」与「停用抢焦点」两种情况下
// 对比 document.activeElement 与格式化是否生效。
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
const CHROME = ['C:\\Users\\Admin\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(p => existsSync(p));
const PORT = 9870;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const profileDir = await mkdtemp(`${tmpdir()}\\pv-focusab-`);
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
  await sleep(500);
};
const drag = async (x, y, dx) => {
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 });
  for (let i = 1; i <= 6; i++) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + (dx * i) / 6, y, button: 'left', buttons: 1 });
    await sleep(30);
  }
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x + dx, y, button: 'left', clickCount: 1, buttons: 0 });
  await sleep(600);
};

const ACTIVE = `(() => {
  const a = document.activeElement;
  return a ? a.tagName.toLowerCase() + (a.className ? '.' + String(a.className).split(' ')[0] : '') : null;
})()`;
const MODEL = `(() => {
  const doc = document.querySelector('affine-edgeless-root').doc;
  const n = doc.root.children.filter(b => b.flavour === 'affine:note')[0];
  return JSON.stringify(n.children[0].text.toDelta ? n.children[0].text.toDelta() : String(n.children[0].text));
})()`;

await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
await sleep(11000);

await read(`(() => {
  const doc = document.querySelector('affine-edgeless-root').doc;
  doc.captureSync();
  doc.transact(() => { for (const c of [...doc.root.children]) if (c.flavour === 'affine:note') doc.deleteBlock(c); });
  const id = doc.addBlock('affine:note', { xywh: JSON.stringify([150, 150, 460, 160]), displayMode: 'edgeless' }, doc.root.id);
  const p = doc.addBlock('affine:paragraph', {}, id);
  doc.transact(() => doc.getBlockById(p).text.applyDelta([{ insert: '测试加粗的文字CONTENT' }]));
  doc.captureSync();
  return true;
})()`);
await sleep(1500);

const pos = await read(`(() => { const v = document.querySelector('affine-edgeless-note'); const r = v.getBoundingClientRect(); return { cx: Math.round(r.left+r.width/2), cy: Math.round(r.top+r.height/2) }; })()`);

async function runCase(label, disableFocusClaim) {
  console.log(`\n===== ${label} =====`);
  // 切换状态：通过移除/恢复 installCanvasFocusClaim 注册的 pointerdown 监听无法精细控制，
  // 改为在页面里打补丁：让 focusSelf 变成空操作。
  await read(`(() => {
    if (!window.__canvasHost) window.__canvasHost = document.querySelector('#canvas');
    ${disableFocusClaim
      ? "if (!window.__hostFocusOrig) { window.__hostFocusOrig = window.__canvasHost.focus; window.__canvasHost.focus = function(){}; }"
      : "if (window.__hostFocusOrig) { window.__canvasHost.focus = window.__hostFocusOrig; delete window.__hostFocusOrig; }"}
    return true;
  })()`);

  // 进入编辑
  await click(pos.cx, pos.cy, 2);
  await sleep(500);
  // 在文字上真实点击一次（这一步会触发 pointerdown 抢焦点）
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pos.cx - 100, y: pos.cy, button: 'left', clickCount: 1, buttons: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pos.cx - 100, y: pos.cy, button: 'left', clickCount: 1, buttons: 0 });
  await sleep(400);
  const active = await read(ACTIVE);
  // 拖选文字
  await drag(pos.cx - 100, pos.cy, 120);
  const sel = await read(`String(document.getSelection()).slice(0, 16)`);
  // 执行加粗
  const before = await read(MODEL);
  const exec = await read(`(() => { try { return document.execCommand('bold'); } catch (e) { return 'ERR:' + e.message; } })()`);
  await sleep(600);
  const after = await read(MODEL);
  const active2 = await read(ACTIVE);
  console.log(`  点击后活动元素: ${JSON.stringify(active)}`);
  console.log(`  选区: ${JSON.stringify(sel)}   执行后活动元素: ${JSON.stringify(active2)}`);
  console.log(`  execCommand('bold') → ${JSON.stringify(exec)}`);
  console.log(`  模型变化: ${before !== after}`);
  console.log(`  加粗后模型: ${String(after).slice(0, 140)}`);
  return { active, sel, exec, changed: before !== after };
}

const withClaim = await runCase('A. 抢焦点生效（当前行为）', false);
const withoutClaim = await runCase('B. 停用抢焦点（对照）', true);

console.log('\n===== 结论 =====');
console.log(`  抢焦点时格式化生效: ${withClaim.changed}`);
console.log(`  停用抢焦点时格式化生效: ${withoutClaim.changed}`);
if (!withClaim.changed && withoutClaim.changed) {
  console.log('  → ✅ 确认：installCanvasFocusClaim 抢焦点导致格式化失效');
} else if (withClaim.changed && withoutClaim.changed) {
  console.log('  → 两者都生效，格式化失效与抢焦点无关（本环境无法复现）');
} else {
  console.log('  → 两者都未生效，另有原因');
}

socket.close(); try { child.kill(); } catch {}
await sleep(300);
await rm(profileDir, { recursive: true, force: true }).catch(() => {});
process.exit(0);
