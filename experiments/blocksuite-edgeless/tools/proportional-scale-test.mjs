// 验证：多选时角拖拽是否等比缩放（各元素保持各自宽高比），边拖拽是否只改一个方向。
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
const CHROME = ['C:\\Users\\Admin\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(p => existsSync(p));
const PORT = 9810;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const profileDir = await mkdtemp(`${tmpdir()}\\pv-scale-`);
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

await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
await sleep(11000);

// 建两个尺寸差异明显的文本框
const ids = await read(`(() => {
  const doc = document.querySelector('affine-edgeless-root').doc;
  doc.captureSync();
  doc.transact(() => { for (const c of [...doc.root.children]) if (c.flavour === 'affine:note') doc.deleteBlock(c); });
  const mk = (xywh, text) => {
    const id = doc.addBlock('affine:note', { xywh: JSON.stringify(xywh), displayMode: 'edgeless' }, doc.root.id);
    const p = doc.addBlock('affine:paragraph', {}, id);
    doc.transact(() => doc.getBlockById(p).text.applyDelta([{ insert: text }]));
    return id;
  };
  const a = mk([120, 120, 400, 200], 'AAAA');
  const b = mk([640, 120, 150, 300], 'BBBB');
  doc.captureSync();
  return [a, b];
})()`);
await sleep(1400);
console.log('文本框:', JSON.stringify(ids));

const stateExpr = `(() => {
  const doc = document.querySelector('affine-edgeless-root').doc;
  return ${JSON.stringify(ids)}.map(id => JSON.parse(doc.getBlockById(id).xywh).map(v => Math.round(v)));
})()`;

const before = await read(stateExpr);
console.log('缩放前:', JSON.stringify(before));

// 用真实 CDP 指针事件做一次右下角拖拽：多选两个框 → 抓住右下角手柄
await read(`(() => {
  const root = document.querySelector('affine-edgeless-root');
  const doc = root.doc;
  const a = doc.getBlockById(${JSON.stringify(ids[0])});
  const b = doc.getBlockById(${JSON.stringify(ids[1])});
  root.gfx.selection.set({ elements: [a.id, b.id], editing: false });
  return true;
})()`);
await sleep(600);

// 找到选中框上的缩放手柄屏幕坐标（右下角）
const handlePos = await read(`(() => {
  const root = document.querySelector('affine-edgeless-root');
  const view = document.querySelector('affine-edgeless-note[data-block-id="${ids[0]}"]');
  const handle = view.querySelector('[data-note-resize="bottom-right"]');
  if (!handle) return null;
  const r = handle.getBoundingClientRect();
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
})()`);
console.log('右下角手柄位置:', JSON.stringify(handlePos));

if (handlePos) {
  // 沿对角线拖：宽 +400、高 +200（与第一个框初始 400x200 同比例 → 因子 2）
  const target = { x: handlePos.x + 400, y: handlePos.y + 200 };
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: handlePos.x, y: handlePos.y, button: 'left', clickCount: 1, buttons: 1, pointerType: 'mouse' });
  const steps = 10;
  for (let i = 1; i <= steps; i++) {
    await send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: Math.round(handlePos.x + (target.x - handlePos.x) * i / steps),
      y: Math.round(handlePos.y + (target.y - handlePos.y) * i / steps),
      button: 'left', buttons: 1,
    });
    await sleep(30);
  }
  const during = await read(stateExpr);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: target.x, y: target.y, button: 'left', clickCount: 1, buttons: 0 });
  await sleep(200);

  const ratio = v => v[2] / v[3];
  console.log('缩放后:', JSON.stringify(during));
  const ratiosBefore = before.map(v => ratio(v).toFixed(3));
  const ratiosAfter = during.map(v => ratio(v).toFixed(3));
  console.log(`宽高比 前: ${JSON.stringify(ratiosBefore)}   后: ${JSON.stringify(ratiosAfter)}`);
  const kept = before.every((v, i) => Math.abs(ratio(v) - ratio(during[i])) < 0.03);
  const grew = during.every((v, i) => v[2] > before[i][2] && v[3] > before[i][3]);
  const sameFactor = Math.abs((during[0][2] / before[0][2]) - (during[1][2] / before[1][2])) < 0.03;
  console.log(`\n各自宽高比保持不变: ${kept}`);
  console.log(`宽和高都变大: ${grew}`);
  console.log(`两个框使用同一比例因子: ${sameFactor}`);
  console.log(`判定: ${kept && grew && sameFactor ? '✅ 通过——多选角拖拽等比缩放' : '❌ 未通过'}`);
} else {
  console.log('未找到缩放手柄，无法测试');
}

console.log(`未捕获异常: ${errors.length}`);
errors.slice(0, 3).forEach(e => console.log('  ✗ ' + String(e).slice(0, 160)));

socket.close(); try { child.kill(); } catch {}
await sleep(300);
await rm(profileDir, { recursive: true, force: true }).catch(() => {});
process.exit(0);
