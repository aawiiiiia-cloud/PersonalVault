import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';

const chrome = ['C:\\Users\\Admin\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(existsSync);
const port = 9786;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const profile = await mkdtemp(`${tmpdir()}\\pv-table-`);
const child = spawn(chrome, [`--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--window-size=1600,1000', '--headless=new',
  'about:blank'], { cwd: profile, windowsHide: true, stdio: 'ignore' });

try {
  for (let i = 0; i < 60; i++) {
    try { await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); break; }
    catch { await sleep(250); }
  }
  const page = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve);
    socket.addEventListener('error', reject);
  });
  let nextId = 1;
  const pending = new Map();
  const errors = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const callbacks = pending.get(message.id);
      pending.delete(message.id);
      message.error ? callbacks.reject(new Error(message.error.message)) : callbacks.resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') {
      errors.push(message.params.exceptionDetails?.exception?.description || message.params.exceptionDetails?.text);
    }
  });
  const send = (method, params = {}) => {
    const id = nextId++;
    socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  };
  const evaluate = async expression => {
    const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    return response.result?.value;
  };
  const click = async (x, y, count = 1) => {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: count, buttons: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: count, buttons: 0 });
    await sleep(450);
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
  await sleep(8000);
  const button = await evaluate(`(() => { const r = document.querySelector('#create-table').getBoundingClientRect(); return { x: r.left+r.width/2, y: r.top+r.height/2 }; })()`);
  await click(button.x, button.y);
  await sleep(2000);
  const result = await evaluate(`(() => {
    const root = document.querySelector('affine-edgeless-root');
    const notes = root.doc.root.children.filter(block => block.flavour === 'affine:note');
    const table = notes.find(note => note.children.some(child => child.flavour === 'affine:database'));
    const database = table?.children.find(child => child.flavour === 'affine:database');
    return {
      status: document.querySelector('#status').textContent,
      noteCount: notes.length,
      tableId: table?.id,
      databaseId: database?.id,
      columns: database?.columns.map(column => ({ name: column.name, type: column.type })),
      rows: database?.children.length,
      renderedDatabase: !!document.querySelector('affine-database'),
      renderedText: document.querySelector('affine-database')?.innerText.slice(0, 200),
    };
  })()`);
  const firstCell = await evaluate(`(() => { const r = document.querySelector('.affine-database-block-row')?.querySelectorAll('affine-database-cell-container')[1]?.getBoundingClientRect(); return r && {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
  if (!firstCell) throw new Error('找不到原生表格单元格');
  await click(firstCell.x, firstCell.y);
  await click(firstCell.x, firstCell.y, 2);
  await send('Input.insertText', { text: '测试单元格' });
  await sleep(500);
  const edited = await evaluate(`(() => {
    const database = document.querySelector('affine-edgeless-root').doc.root.children.flatMap(n => n.children).find(c => c.flavour === 'affine:database');
    return { text: document.querySelector('affine-database')?.innerText, cells: JSON.stringify(database?.cells) };
  })()`);
  const addRow = await evaluate(`(() => { const r = document.querySelector('.data-view-table-group-add-row-button')?.getBoundingClientRect(); return r && {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
  if (!addRow) throw new Error('找不到原生表格加行按钮');
  await click(addRow.x, addRow.y);
  const rowCount = await evaluate(`document.querySelector('affine-edgeless-root').doc.root.children.flatMap(n => n.children).find(c => c.flavour === 'affine:database')?.children.length`);
  await sleep(800);
  await send('Page.reload');
  await sleep(8000);
  const reopened = await evaluate(`(() => {
    const database = document.querySelector('affine-edgeless-root')?.doc.root.children.flatMap(n => n.children).find(c => c.flavour === 'affine:database');
    return { rows: database?.children.length, cells: JSON.stringify(database?.cells), rendered: !!document.querySelector('affine-database'), text: document.querySelector('affine-database')?.innerText };
  })()`);
  const checks = {
    '创建三列三行': result.columns?.length === 3 && result.rows === 3,
    '原生表格已渲染': result.renderedDatabase,
    '单元格输入写入模型': edited.cells.includes('测试单元格'),
    '原生按钮新增行': rowCount === 4,
    '重开后数据保留': reopened.rows === 4 && reopened.cells.includes('测试单元格') && reopened.rendered,
    '无浏览器异常': errors.length === 0,
  };
  console.log(JSON.stringify({ checks, initial: result, reopened: { rows: reopened.rows, rendered: reopened.rendered, hasText: reopened.cells.includes('测试单元格') }, errors }, null, 2));
  socket.close();
  if (Object.values(checks).some(value => !value)) process.exitCode = 1;
} finally {
  try { child.kill(); } catch {}
  await sleep(300);
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
