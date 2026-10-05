// 确认块拖拽手柄在 DOM 中的确切元素与类名，以便精确隐藏（而不是猜选择器）。
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
const CHROME = ['C:\\Users\\Admin\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(p => existsSync(p));
const PORT = 9850;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const profileDir = await mkdtemp(`${tmpdir()}\\pv-handle-`);
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

await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
await sleep(11000);

// 进入编辑态：手柄通常只在编辑态/悬停时显示
const pos = await read(`(() => { const v = document.querySelector('affine-edgeless-note'); const r = v.getBoundingClientRect(); return { cx: Math.round(r.left+r.width/2), cy: Math.round(r.top+r.height/2) }; })()`);
for (const type of ['mousePressed', 'mouseReleased']) {
  await send('Input.dispatchMouseEvent', { type, x: pos.cx, y: pos.cy, button: 'left', clickCount: 2, buttons: type === 'mousePressed' ? 1 : 0 });
}
await sleep(800);

// 把鼠标移到段落文字上，触发手柄出现
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pos.cx, y: pos.cy, button: 'none', buttons: 0 });
await sleep(700);

const handles = await read(`(() => {
  const out = [];
  const seen = new Set();
  const walk = (root, depth) => {
    for (const el of root.querySelectorAll('*')) {
      const tag = el.tagName.toLowerCase();
      const cls = String(el.className || '');
      if (/drag-handle|grabber/i.test(tag + ' ' + cls)) {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        out.push({
          标签: tag,
          类名: [...el.classList].join('.'),
          光标: cs.cursor,
          显示: cs.display,
          可见: cs.visibility,
          透明度: cs.opacity,
          尺寸: [Math.round(r.width), Math.round(r.height)],
          屏幕位置: [Math.round(r.left), Math.round(r.top)],
          背景: cs.backgroundColor,
        });
      }
      if (el.shadowRoot && !seen.has(el.shadowRoot)) { seen.add(el.shadowRoot); walk(el.shadowRoot, depth + 1); }
    }
  };
  walk(document, 0);
  return out;
})()`);
console.log('=== 拖拽手柄相关元素 ===');
for (const h of handles) console.log(`  ${h.标签}.${h.类名}  光标=${h.光标} display=${h.显示} 可见=${h.可见} 尺寸=${h.尺寸.join('x')} 位置=${h.屏幕位置.join(',')} 背景=${h.背景}`);

// 明确验证：手柄是否仍被创建、以及是否被我们的 CSS 隐藏。
// 注意必须遍历 shadowRoot —— 手柄在 affine-drag-handle-widget 的 Shadow DOM 内，
// 用 document.querySelector 查不到。
const verdict = await read(`(() => {
  const found = [];
  const seen = new Set();
  const walk = (root) => {
    for (const el of root.querySelectorAll('*')) {
      if (el.classList && el.classList.contains('affine-drag-handle-grabber')) {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        found.push({ display: cs.display, 尺寸: [Math.round(r.width), Math.round(r.height)] });
      }
      if (el.shadowRoot && !seen.has(el.shadowRoot)) { seen.add(el.shadowRoot); walk(el.shadowRoot); }
    }
  };
  walk(document);
  if (!found.length) return { 手柄已创建: false, 结论: '手柄未出现在 DOM（悬停未触发，无法判定）' };
  const hidden = found.every(f => f.display === 'none' || (f.尺寸[0] === 0 && f.尺寸[1] === 0));
  return {
    手柄已创建: true,
    细节: found,
    结论: hidden ? '✅ 已被隐藏' : '❌ 仍然可见',
  };
})()`);
console.log('\n=== 隐藏判定 ===');
console.log(JSON.stringify(verdict, null, 1));

// 也列出所有创建在 body/editor 下的、带 grab 光标的元素（兜底）
const grabbers = await read(`(() => {
  const out = [];
  const seen = new Set();
  const walk = (root) => {
    for (const el of root.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      if (/grab/.test(cs.cursor)) {
        const r = el.getBoundingClientRect();
        out.push({ 标签: el.tagName.toLowerCase(), 类名: [...el.classList].join('.') || '(无)', 光标: cs.cursor, 尺寸: [Math.round(r.width), Math.round(r.height)], 位置: [Math.round(r.left), Math.round(r.top)] });
      }
      if (el.shadowRoot && !seen.has(el.shadowRoot)) { seen.add(el.shadowRoot); walk(el.shadowRoot); }
    }
  };
  walk(document);
  return out;
})()`);
console.log('\n=== 所有 grab 光标元素 ===');
for (const g of grabbers) console.log(`  ${g.标签}.${g.类名}  光标=${g.光标}  尺寸=${g.尺寸.join('x')}  位置=${g.位置.join(',')}`);

socket.close(); try { child.kill(); } catch {}
await sleep(300);
await rm(profileDir, { recursive: true, force: true }).catch(() => {});
process.exit(0);
