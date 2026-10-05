// 探测：选中画布元素后，BlockSuite 自带的元素工具栏 / 更多菜单是否出现，
// 以及其中是否包含图层（reorder）动作。这决定"图层问题"要不要从零做。
import { spawn } from 'node:child_process';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const CHROME = 'C:\\Users\\Admin\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9711;
const OUT = 'D:\\personalvault\\experiments\\blocksuite-edgeless\\.canvas-eyes';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const profileDir = await mkdtemp(path.join(tmpdir(), 'pv-toolbar-'));
const child = spawn(CHROME, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${profileDir}`, '--no-first-run',
  '--no-default-browser-check', '--window-size=1600,1000', '--headless=new', 'about:blank'], { cwd: profileDir, windowsHide: true, stdio: 'ignore' });
for (let i = 0; i < 60; i++) { try { await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; } catch { await sleep(250); } }
const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { socket.addEventListener('open', res); socket.addEventListener('error', rej); });
let id = 1; const pending = new Map();
socket.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } });
const send = (m, p = {}) => { const i = id++; socket.send(JSON.stringify({ id: i, method: m, params: p })); return new Promise((res, rej) => pending.set(i, { res, rej })); };
const ev = async (expr, label) => { const r = await send('Runtime.evaluate', { returnByValue: true, expression: expr }); if (label) console.log('    ' + label.padEnd(32), JSON.stringify(r.result.value)); return r.result.value; };
const click = async (x, y, opt = {}) => {
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: opt.button || 'left', clickCount: opt.clickCount || 1, buttons: opt.button === 'right' ? 2 : 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: opt.button || 'left', clickCount: opt.clickCount || 1, buttons: 0 });
  await sleep(opt.wait || 500);
};

await mkdir(OUT, { recursive: true });
await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
await sleep(11000);

// 先建第二个文本框，这样才有"图层关系"可调
console.log('=== 1. 建立两个可重叠的元素 ===');
await ev(`(() => {
  const root = document.querySelector('affine-edgeless-root');
  return { 已有元素: root.gfx.surface?.elementModels?.length ?? '未知' };
})()`, '当前元素数');

console.log('\n=== 2. 用代码建两个重叠的文本框（便于观察图层）===');
await ev(`(() => {
  const root = document.querySelector('affine-edgeless-root');
  const doc = root.doc;
  const surface = root.gfx.surface;
  const ids = [];
  doc.captureSync();
  for (let i = 0; i < 2; i++) {
    const id = doc.addBlock('affine:note', {
      xywh: JSON.stringify([200 + i * 60, 200 + i * 60, 320, 160]),
      displayMode: 'edgeless',
    }, doc.root.id);
    doc.addBlock('affine:paragraph', { type: 'text', text: new (doc.paragraphModel?.constructor?.TextForDoc ?? Object)() }, id).catch?.(()=>{});
    ids.push(id);
  }
  doc.captureSync();
  return { 新建: ids.length, 总数: surface.elementModels.length };
})()`, '建两个文本框');

console.log('\n=== 3. 选中一个元素，看元素工具栏是否出现 ===');
const firstNote = await ev(`(() => {
  const view = document.querySelector('affine-edgeless-note');
  if (!view) return null;
  const r = view.getBoundingClientRect();
  return { 中心: [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)] };
})()`, '第一个文本框位置');
if (firstNote) {
  await click(firstNote.中心[0], firstNote.中心[1], { wait: 900 });
  await ev(`(() => {
    const root = document.querySelector('affine-edgeless-root');
    const hosts = ['edgeless-element-toolbar', 'edgeless-toolbar', 'edgeless-more-menu', 'affine-toolbar'];
    const found = {};
    for (const sel of hosts) found[sel] = root.querySelectorAll(sel).length;
    const all = [...root.querySelectorAll('*')].filter(el => el.tagName.toLowerCase().includes('toolbar') || el.tagName.toLowerCase().includes('menu')).map(el => el.tagName.toLowerCase());
    return { 具名宿主: found, 所有toolbar或menu类元素: [...new Set(all)] };
  })()`, '工具栏宿主');
  await ev(`(() => {
    const root = document.querySelector('affine-edgeless-root');
    const labels = [];
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) {
        for (const inner of el.shadowRoot.querySelectorAll('*')) {
          const t = (inner.textContent || '').trim();
          if (t && t.length < 24) labels.push(t);
        }
      }
    }
    return { 可见文案样本: [...new Set(labels)].slice(0, 40) };
  })()`, '元素工具栏文案');
}

console.log('\n=== 4. 右键菜单是否有图层项？ ===');
if (firstNote) {
  await click(firstNote.中心[0], firstNote.中心[1], { button: 'right', wait: 900 });
  await ev(`(() => {
    const texts = [];
    const walk = node => {
      for (const el of node.querySelectorAll('*')) {
        if (el.shadowRoot) walk(el.shadowRoot);
        const t = (el.textContent || '').trim();
        if (t && t.length < 30) texts.push(t);
      }
    };
    walk(document);
    const uniq = [...new Set(texts)];
    return {
      含图层相关文案: uniq.filter(t => /Fron|Back|Forward|Backward|顶层|底层|上移|下移|图层/i.test(t)),
      右键菜单文案样本: uniq.filter(t => /Group|Copy|Duplicate|Delete|Frame|编组|复制|删除/i.test(t)).slice(0, 20),
    };
  })()`, '右键菜单内容');
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(OUT, 'layer-contextmenu.png'), Buffer.from(shot.data, 'base64'));
  console.log('    截图: .canvas-eyes/layer-contextmenu.png');
}

socket.close(); try { child.kill(); } catch {}
await sleep(300);
await rm(profileDir, { recursive: true, force: true }).catch(() => {});
process.exit(0);
