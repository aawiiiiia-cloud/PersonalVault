import path from 'node:path';
import crypto from 'node:crypto';
import {promises as fs} from 'node:fs';

export const digest = value => crypto.createHash('sha256').update(value).digest('hex');

export async function atomicWrite(target, content) {
  await fs.mkdir(path.dirname(target), {recursive:true});
  const temporary = `${target}.${crypto.randomUUID()}.tmp`;
  try {
    const handle = await fs.open(temporary, 'wx');
    try { await handle.writeFile(content, 'utf8'); await handle.sync(); }
    finally { await handle.close(); }
    await fs.rename(temporary, target);
  } finally { await fs.unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}

export function parseCard(markdown, filename) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) throw new Error(`卡片格式无效：${filename}`);
  const card = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim()) continue;
    const separator = line.indexOf(':');
    const key = line.slice(0, separator).trim();
    if (separator < 1 || ['__proto__','constructor','prototype'].includes(key) || Object.hasOwn(card,key)) throw new Error(`卡片字段无效：${filename}`);
    const raw = line.slice(separator + 1).trim();
    try { card[key] = JSON.parse(raw); }
    catch { if(/^[\[{"]/.test(raw))throw new Error(`卡片字段内容无效：${filename} / ${key}`);card[key] = raw; }
  }
  if(typeof card.id!=='string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(card.id) || !['capture','area','project','review','knowledge','source'].includes(card.type) || typeof card.title!=='string' || !card.title.trim()) throw new Error(`卡片缺少有效 ID、类型或标题：${filename}`);
  if (Number(card.structureVersion || 1) > 2) throw new Error(`卡片 ${card.title} 使用更新的数据版本，请升级应用后打开`);
  return card;
}

async function optionalJson(filename, fallback) {
  try { return JSON.parse(await fs.readFile(filename,'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw new Error(`资料库文件无法读取：${filename}（${error.message}）`); }
}

// Read originals independently of snapshots and indexes. Never follow directory links.
export async function readCardFiles(vaultRoot) {
  const root = path.join(vaultRoot,'卡片');
  const files = [], ids = new Set();
  let found = false;
  async function walk(directory) {
    let items;
    try { items = await fs.readdir(directory,{withFileTypes:true}); }
    catch (error) { if (error.code === 'ENOENT' && directory === root) return; throw error; }
    found = true;
    for (const item of items.sort((a,b)=>a.name.localeCompare(b.name))) {
      const filename = path.join(directory,item.name);
      if (item.isDirectory()) await walk(filename);
      else if (item.isFile() && item.name.toLowerCase().endsWith('.md')) {
        const markdown = await fs.readFile(filename,'utf8');
        const relativePath = path.relative(vaultRoot,filename).split(path.sep).join('/');
        const card = parseCard(markdown,relativePath);
        if (ids.has(card.id)) throw new Error(`存在重复卡片 ID：${card.id}；请先保留并核对这两份卡片，程序未自动删除任何一份`);
        ids.add(card.id);
        files.push({card,relativePath,absolutePath:filename,hash:digest(markdown)});
      }
    }
  }
  await walk(root);
  const ledger = await optionalJson(path.join(vaultRoot,'系统','tombstones.json'),{tombstones:[]});
  if (!Array.isArray(ledger.tombstones) || ledger.tombstones.some(item=>!item?.id || !item?.type || !item?.deletedAt)) throw new Error('永久删除记录格式无效，已停止读取资料库');
  const tombstones = ledger.tombstones;
  const deletedIds = new Set(tombstones.map(item=>item.id));
  const entries = files.filter(item=>!deletedIds.has(item.card.id)).map(item=>item.card);
  const identity = await fs.readFile(path.join(vaultRoot,'vault.json'),'utf8').catch(error=>{if(error.code==='ENOENT')return '';throw error;});
  const revision = {identity:digest(identity),cards:Object.fromEntries(files.map(item=>[item.card.id,item.hash])),tombstones:digest(JSON.stringify([...tombstones].sort((a,b)=>String(a.id).localeCompare(String(b.id)))))};
  const updatedAt = entries.reduce((latest,card)=>String(card.updatedAt || card.updated || '') > latest ? String(card.updatedAt || card.updated) : latest,'1970-01-01T00:00:00.000Z');
  return {found,files,revision,state:{schemaVersion:2,updatedAt,entries,tombstones}};
}

export function assertRevision(expected, actual) {
  const ids = new Set([...Object.keys(expected?.cards || {}),...Object.keys(actual.cards)]);
  const initializing = expected?.identity === digest('') && ids.size === 0;
  if (!expected || (!initializing && expected.identity !== actual.identity) || expected.tombstones !== actual.tombstones || [...ids].some(id=>expected.cards[id] !== actual.cards[id])) {
    const error = new Error('硬盘中的卡片已发生变化，已停止保存。请先导出未保存内容，再重新载入资料库后核对；程序没有覆盖硬盘中的新内容。');
    error.code = 'VAULT_CONFLICT';
    throw error;
  }
}
