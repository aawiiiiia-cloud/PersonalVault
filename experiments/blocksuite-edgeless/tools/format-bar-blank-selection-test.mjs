// 用真实点击加粗按钮来测格式化——这才是 BlockSuite 真正的格式化路径
// （execCommand 不是它用的机制，之前测的是错的东西）。
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';

const TARGET = process.argv[2] || 'http://127.0.0.1:5173/';
const PORT = Number(process.argv[3] || 9910);
const CHROME = ['C:\\Users\\Admin\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(p => existsSync(p));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const profileDir = await mkdtemp(`${tmpdir()}\\pv-fmtbtn-`);
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
  await sleep(600);
};

await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate', { url: TARGET });
await sleep(11000);

await read(`(() => {
  const doc = document.querySelector('affine-edgeless-root').doc;
  for (const block of [...doc.root.children]) if (block.flavour === 'affine:note') doc.deleteBlock(block);
  const id = doc.addBlock('affine:note', { xywh: JSON.stringify([150, 150, 240, 92]), displayMode: 'edgeless' }, doc.root.id);
  const p = doc.addBlock('affine:paragraph', {}, id);
  doc.getBlockById(p).text.applyDelta([{ insert: '这是第一行文字ABCDEFGHIJ，接着输入第二行文字KLMNOP。' }]);
  doc.updateBlock(doc.getBlockById(id), () => {
    const note = doc.getBlockById(id);
    note.edgeless.collapse = true;
    note.edgeless.collapsedHeight = 92;
  });
  return true;
})()`);
await sleep(1500);

const pos = await read(`(() => { const v = document.querySelector('affine-edgeless-note'); const r = v.getBoundingClientRect(); return { cx: Math.round(r.left+r.width/2), cy: Math.round(r.top+r.height/2) }; })()`);
// 双击进入编辑
await click(pos.cx, pos.cy, 2);

// 从正文拖选到同一张卡片的空白背景，mouseup 后仍应保留文字选区与格式栏。
await read(`(() => {
  window.__selectionTrace = [];
  for (const type of ['pointerdown', 'pointerup', 'click', 'selectionchange']) {
    document.addEventListener(type, event => setTimeout(() => {
      const root = document.querySelector('affine-edgeless-root');
      window.__selectionTrace.push({ type, target: event.target?.className || event.target?.nodeName,
        native: String(document.getSelection()).slice(0, 30),
        anchor: document.getSelection()?.anchorNode?.nodeName,
        model: root.gfx.std.selection.find('text')?.toJSON?.() ?? null,
        bar: document.querySelector('affine-format-bar-widget')?.displayType });
    }, 0), true);
  }
  return true;
})()`);
const para = await read(`(() => {
  const p = document.querySelector('affine-edgeless-note affine-paragraph').getBoundingClientRect();
  const note = document.querySelector('affine-edgeless-note').getBoundingClientRect();
  return { x: Math.round(p.left) + 4, y: Math.round(p.top + p.height / 2),
    endX: Math.round(note.right - 32), endY: Math.round(note.bottom - 32) };
})()`);
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: para.x, y: para.y, button: 'left', clickCount: 1, buttons: 1 });
for (let i = 1; i <= 8; i++) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: para.x + (para.endX - para.x) * i / 8, y: para.y + (para.endY - para.y) * i / 8, button: 'left', buttons: 1 });
  await sleep(30);
}
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: para.endX, y: para.endY, button: 'left', clickCount: 1, buttons: 0 });
await sleep(900);

const selInfo = await read(`String(document.getSelection()).slice(0, 20)`);
const selectionState = await read(`(() => {
  const root = document.querySelector('affine-edgeless-root');
  const bar = document.querySelector('affine-format-bar-widget');
  return {
    active: document.activeElement?.tagName,
    documentFocused: document.hasFocus(),
    textSelection: root?.gfx?.std?.selection?.find('text')?.toJSON?.() ?? null,
    barPresent: !!bar,
    barDisplay: bar?.displayType ?? null,
    linkedDocActionPresent: bar?.configItems?.some(item => item.id === 'convert-to-linked-doc') ?? null,
    barHTML: bar?.shadowRoot?.innerHTML?.slice(0, 300) ?? null,
  };
})()`);
console.log('选区状态:', JSON.stringify(selectionState));
console.log('原生选区:', JSON.stringify(selInfo));
console.log('事件轨迹:', JSON.stringify(await read('window.__selectionTrace.slice(-12)'), null, 1));
if (!selInfo || selectionState.barDisplay !== 'text' || !selectionState.textSelection) {
  throw new Error('拖选到卡片空白处后格式栏或文字选区消失');
}
if (selectionState.linkedDocActionPresent !== false) throw new Error('Create Linked Doc 仍在格式栏中');

// 找到格式栏，并在其中定位「加粗」按钮（按钮可能位于格式栏内部的 shadow DOM）。
const boldBtn = await read(`(() => {
  const bar = document.querySelector('editor-toolbar.affine-format-bar-widget')
    || document.querySelector('affine-format-bar-widget');
  if (!bar) return { error: '未找到格式栏' };
  const found = [];
  const seen = new Set();
  const walk = (root, path) => {
    for (const el of root.querySelectorAll('*')) {
      const label = (el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('data-testid') || '')) || '';
      const text = (el.textContent || '').trim();
      const r = el.getBoundingClientRect();
      if (/bold|加粗|italic|斜体|underline/i.test(label + ' ' + text)) {
        found.push({
          标签: el.tagName.toLowerCase(),
          类名: String(el.className || '').split(' ')[0],
          label: label || text,
          在shadow: path,
          位置: [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)],
          尺寸: [Math.round(r.width), Math.round(r.height)],
        });
      }
      if (el.shadowRoot && !seen.has(el.shadowRoot)) { seen.add(el.shadowRoot); walk(el.shadowRoot, path + '>shadow'); }
    }
  };
  walk(bar.shadowRoot ?? bar, 'bar');
  // 同时列出格式栏内所有有尺寸的小按钮，便于人工辨认
  const all = [];
  const seen2 = new Set();
  const walk2 = (root, path) => {
    for (const el of root.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      const t = el.tagName.toLowerCase();
      if (r.width > 8 && r.width < 60 && r.height > 8 && r.height < 60 && /button|editor-icon/i.test(t + String(el.className || ''))) {
        all.push({ 标签: t, 类名: String(el.className || '').split(' ')[0], 在shadow: path, 位置: [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)], 标签文本: (el.getAttribute('aria-label') || el.getAttribute('title') || '').slice(0, 20) });
      }
      if (el.shadowRoot && !seen2.has(el.shadowRoot)) { seen2.add(el.shadowRoot); walk2(el.shadowRoot, path + '>shadow'); }
    }
  };
  walk2(bar.shadowRoot ?? bar, 'bar');
  return { 匹配格式按钮: found, 格式栏内所有小按钮: all };
})()`);
console.log('格式栏内容:', JSON.stringify(boldBtn, null, 1));
const matched = boldBtn?.匹配格式按钮 || [];
const MODEL = `(() => { const doc = document.querySelector('affine-edgeless-root').doc; const n = doc.root.children.filter(b => b.flavour === 'affine:note')[0]; return JSON.stringify(n.children[0].text.toDelta ? n.children[0].text.toDelta() : String(n.children[0].text)); })()`;

const target = matched.find(b => /bold|加粗/i.test(b.label)) || matched[0];
console.log(`\n目标: ${TARGET}   选区: ${JSON.stringify(selInfo)}`);

if (target) {
  const before = await read(MODEL);
  console.log(`\n点击: ${target.tag}.${target.cls} label=${JSON.stringify(target.label)}`);
  await click(target.位置[0], target.位置[1]);
  await sleep(800);
  const after = await read(MODEL);
  console.log(`  点前模型: ${String(before).slice(0, 130)}`);
  console.log(`  点后模型: ${String(after).slice(0, 130)}`);
  console.log(`  ✅ 格式化生效: ${before !== after}`);
  if (before === after) throw new Error('加粗未修改文本模型');
  console.log('加粗后选区:', JSON.stringify(await read(`(() => {
    const root = document.querySelector('affine-edgeless-root');
    const bar = document.querySelector('affine-format-bar-widget');
    return { native: String(document.getSelection()), model: root.gfx.std.selection.find('text')?.toJSON?.() ?? null, bar: bar?.displayType };
  })()`)));
  for (const name of ['italic', 'underline']) {
    const button = await read(`(() => {
      const bar = document.querySelector('affine-format-bar-widget');
      const el = [...bar.shadowRoot.querySelectorAll('editor-icon-button')].find(node => node.getAttribute('data-testid') === ${JSON.stringify(name)});
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
    })()`);
    if (!button) throw new Error(`未找到 ${name} 按钮`);
    const previous = await read(MODEL);
    await click(button.x, button.y);
    const updated = await read(MODEL);
    console.log(`  ${name} 生效: ${previous !== updated}`);
    if (previous === updated) throw new Error(`${name} 未修改文本模型`);
  }
} else {
  throw new Error('未找到加粗按钮，无法点击测试');
}

const highlight = await read(`(() => {
  const bar = document.querySelector('affine-format-bar-widget');
  const rect = bar.shadowRoot.querySelector('.highlight-button').getBoundingClientRect();
  return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
})()`);
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: highlight.x, y: highlight.y, buttons: 0 });
await sleep(700);
const palette = await read(`(() => {
  const panel = document.querySelector('affine-format-bar-widget').shadowRoot.querySelector('.highlight-panel');
  const scroll = panel.querySelector('[data-orientation="vertical"]');
  const rect = scroll.getBoundingClientRect();
  return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + Math.min(100, rect.height / 2)),
    scrollTop: scroll.scrollTop, maxScroll: scroll.scrollHeight - scroll.clientHeight,
    zoom: document.querySelector('affine-edgeless-root').gfx.viewport.zoom };
})()`);
if (palette.maxScroll < 20) throw new Error('颜色菜单没有可滚动内容');
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: palette.x, y: palette.y, buttons: 0 });
await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: palette.x, y: palette.y, deltaX: 0, deltaY: 180 });
await sleep(500);
const wheelResult = await read(`(() => {
  const scroll = document.querySelector('affine-format-bar-widget').shadowRoot.querySelector('.highlight-panel [data-orientation="vertical"]');
  return { scrollTop: scroll.scrollTop, zoom: document.querySelector('affine-edgeless-root').gfx.viewport.zoom };
})()`);
console.log('颜色菜单滚动:', JSON.stringify({ before: palette, after: wheelResult }));
if (wheelResult.scrollTop <= palette.scrollTop || wheelResult.zoom !== palette.zoom) {
  throw new Error('颜色菜单滚轮未滚动，或误缩放了画布');
}

const staleEmbed = await read(`(() => {
  const doc = document.querySelector('affine-edgeless-root').doc;
  const note = doc.root.children.find(block => block.flavour === 'affine:note');
  return doc.addBlock('affine:embed-linked-doc', { pageId: 'unsupported-test-doc' }, note.id);
})()`);
await sleep(1000);
await send('Page.reload', { ignoreCache: true });
await sleep(5000);
const restored = await read(`(() => {
  const doc = document.querySelector('affine-edgeless-root').doc;
  const note = doc.root.children.find(block => block.flavour === 'affine:note');
  return { staleEmbedPresent: !!doc.getBlockById(${JSON.stringify(staleEmbed)}), noteEditable: note.children.some(child => child.flavour === 'affine:paragraph') };
})()`);
console.log('失效 Linked Doc 清理:', JSON.stringify(restored));
if (restored.staleEmbedPresent || !restored.noteEditable) throw new Error('刷新后失效 Linked Doc 未清理');

console.log(`\n未捕获异常: ${errors.length}`);
errors.slice(0, 3).forEach(e => console.log('  ✗ ' + String(e).slice(0, 180)));

socket.close(); try { child.kill(); } catch {}
await sleep(300);
await rm(profileDir, { recursive: true, force: true }).catch(() => {});
process.exit(0);
