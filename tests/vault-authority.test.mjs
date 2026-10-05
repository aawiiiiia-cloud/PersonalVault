import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import {mkdtemp,readFile,writeFile,rm,stat,copyFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {readCardFiles} from '../vault-cards.mjs';

const root=await mkdtemp(path.join(os.tmpdir(),'vault-authority-'));
process.env.PERSONAL_VAULT_PATH=root;
const vault=await import('../server.mjs');
const require=createRequire(import.meta.url), Card=require('../card-v2.js');
const entry=(id,title)=>({id,type:'knowledge',title,structureVersion:2,content:'原始正文',createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-10-01T00:00:00.000Z'});
try {
  // New empty vaults can save a canvas and card in one operation.
  const empty=await vault.loadLatestState();
  const initial=await vault.syncCards({cards:[entry('A','卡片甲'),entry('B','卡片乙')],baseRevision:empty.revision,requireRevision:true,canvasDocuments:{A:{update:'AQID',assets:{image:'data:image/png;base64,AQID'},baseRevision:null}}});
  const fileA=path.join(root,JSON.parse(await readFile(path.join(root,'系统','cards-manifest.json'),'utf8')).cards.A.path);
  const fileB=path.join(root,JSON.parse(await readFile(path.join(root,'系统','cards-manifest.json'),'utf8')).cards.B.path);
  const untouchedB=await readFile(fileB,'utf8'), beforeB=(await stat(fileB)).mtimeMs;
  const computerA=await vault.loadLatestState(),computerB=await vault.loadLatestState();
  await vault.syncCards({cards:computerA.state.entries.map(card=>card.id==='A'?{...card,content:'电脑 A 的新内容'}:card),baseRevision:computerA.revision,requireRevision:true});
  assert.equal((await stat(fileB)).mtimeMs,beforeB,'unchanged cards are not rewritten');
  await assert.rejects(vault.syncCards({cards:computerB.state.entries.map(card=>card.id==='B'?{...card,content:'电脑 B 的旧快照'}:card),baseRevision:computerB.revision,requireRevision:true}),/已停止保存/);
  assert.equal(await readFile(fileB,'utf8'),untouchedB,'stale saves must not partially modify another card');
  assert.equal((await vault.loadLatestState()).state.entries.find(card=>card.id==='A').content,'电脑 A 的新内容');
  await vault.syncCards({cards:computerB.state.entries.map(card=>card.id==='B'?{...card,content:'电脑 B 的独立修改'}:card),changedIds:['B'],baseRevision:computerB.revision,requireRevision:true});
  const independent=(await vault.loadLatestState()).state.entries;
  assert.equal(independent.find(card=>card.id==='A').content,'电脑 A 的新内容','saving B must retain the latest A');
  assert.equal(independent.find(card=>card.id==='B').content,'电脑 B 的独立修改');
  await assert.rejects(vault.syncCards({cards:computerB.state.entries.map(card=>card.id==='A'?{...card,content:'A 的过期编辑'}:card),changedIds:['A'],baseRevision:computerB.revision,requireRevision:true}),/已停止保存/);
  const beforeOutsideEdit=await vault.loadLatestState();
  const outsideBody=(await readFile(fileB,'utf8'))+'\n人工附加的阅读备注\n';
  await writeFile(fileB,outsideBody);
  await vault.syncCards({cards:beforeOutsideEdit.state.entries.map(card=>card.id==='A'?{...card,content:card.content+'，再补充'}:card),changedIds:['A'],baseRevision:beforeOutsideEdit.revision,requireRevision:true});
  assert.equal(await readFile(fileB,'utf8'),outsideBody,'unmodified originals must be retained byte for byte, including body and line endings');

  // Derived snapshots and registries can be absent or corrupt.
  await writeFile(path.join(root,'系统','latest-state.json'),'{broken');
  await writeFile(path.join(root,'系统','cards-manifest.json'),'{broken');
  assert.equal((await vault.loadLatestState()).state.entries.length,2);
  await vault.rebuildIndex();
  assert.equal((await vault.querySearchIndex({query:'新内容'})).results[0].id,'A');

  // Canvas conflicts are rejected before the metadata or original is changed.
  const oldCanvas=await vault.loadCanvasDocument('A');
  const newerCanvas=await vault.saveCanvasDocument('A',{...oldCanvas,update:'BAUG',baseRevision:oldCanvas.revision,requireRevision:true});
  const beforeMetadata=await readFile(fileA,'utf8');
  const current=await vault.loadLatestState();
  await assert.rejects(vault.syncCards({cards:current.state.entries.map(card=>card.id==='A'?{...card,content:'不能提交'}:card),baseRevision:current.revision,requireRevision:true,canvasDocuments:{A:{...oldCanvas,update:'BwgJ',baseRevision:oldCanvas.revision}}}),/画布已被其他窗口修改/);
  assert.equal(await readFile(fileA,'utf8'),beforeMetadata);
  assert.equal((await vault.loadCanvasDocument('A')).update,'BAUG');

  // Rebuild repairs lookup pointers but does not invent missing bytes.
  const asset=newerCanvas.snapshot.attachments[0];
  await writeFile(path.join(root,'系统','附件索引',asset.id+'.json'),JSON.stringify({cardId:'wrong'}));
  await rm(path.join(root,asset.relativePath));
  const rebuilt=await vault.rebuildVault();
  assert.equal(rebuilt.cards,2);assert.equal(rebuilt.missingAttachments.length,1);
  assert.equal(JSON.parse(await readFile(path.join(root,'系统','附件索引',asset.id+'.json'),'utf8')).cardId,'A');
  assert.equal(await readFile(fileA,'utf8'),beforeMetadata);
  assert.equal(await stat(path.join(root,asset.relativePath)).then(()=>true,()=>false),false);
  assert.equal(initial.canvasDocuments.A.linkedAssets.image,asset.id);

  // Duplicate and malformed originals fail visibly rather than being deleted.
  const duplicate=fileA+'.duplicate.md';await copyFile(fileA,duplicate);
  await assert.rejects(vault.rebuildVault(),/重复卡片 ID/);
  assert.equal(await readFile(duplicate,'utf8'),beforeMetadata);await rm(duplicate);
  const invalid=path.join(root,'卡片','知识','invalid.md');await writeFile(invalid,'# broken card');
  await assert.rejects(vault.loadLatestState(),/卡片格式无效/);await rm(invalid);

  const Session=require('../vault-session.js');
  const windowA=Session.create({load:vault.loadLatestState,sync:vault.syncCards});
  const windowB=Session.create({load:vault.loadLatestState,sync:vault.syncCards});
  const loadedA=await windowA.open(),loadedB=await windowB.open();
  await windowA.save({cards:loadedA.state.entries.map(card=>card.id==='A'?{...card,content:'独立窗口甲'}:card)});
  await windowB.save({cards:loadedB.state.entries.map(card=>card.id==='B'?{...card,content:'独立窗口乙'}:card)});
  const shared=(await vault.loadLatestState()).state.entries;
  assert.equal(shared.find(card=>card.id==='A').content,'独立窗口甲');
  assert.equal(shared.find(card=>card.id==='B').content,'独立窗口乙');

  // An empty original collection stays empty even if an old snapshot has cards.
  const lastRevision=(await vault.loadLatestState()).revision;
  await rm(fileA);await rm(fileB);
  await writeFile(path.join(root,'系统','latest-state.json'),JSON.stringify({entries:[entry('old','旧缓存')]}));
  assert.equal((await vault.loadLatestState()).state.entries.length,0);
  await assert.rejects(vault.syncCards({cards:[entry('old','旧缓存')],baseRevision:lastRevision,requireRevision:true}),/已停止保存/);
  const emptyRebuild=await vault.rebuildVault();assert.equal(emptyRebuild.cards,0);

  const migrated=Card.migrateEntry({id:'legacy',type:'project',title:'旧卡片',challenge:'结构化问题',desired:'结构化目标',customField:{value:7}});
  assert.equal(migrated.legacyRecord.challenge,'结构化问题');assert.deepEqual(migrated.legacyRecord.customField,{value:7});
  assert.deepEqual(Card.migrateEntry(migrated),migrated,'migration is idempotent');
  assert.deepEqual(Card.migrateEntry({...migrated,customField:{value:9}}).customField,{value:9},'unknown current fields survive normalization');
  assert.throws(()=>Card.migrateEntry({...migrated,structureVersion:3}),/更新的数据版本/);

  // Disconnecting a previously loaded vault cannot recreate it from a cache.
  const connected=await vault.loadLatestState();
  await rm(path.join(root,'vault.json'));
  await assert.rejects(vault.syncCards({cards:[],baseRevision:connected.revision,requireRevision:true}),/已停止保存/);
  assert.equal(await stat(path.join(root,'vault.json')).then(()=>true,()=>false),false);
  assert.equal((await readCardFiles(root)).state.entries.length,0);
  console.log('PASS card authority, stale saves, canvas conflicts, rebuild, missing originals, migration and disconnected vault protection');
} finally {
  assert(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));
  await rm(root,{recursive:true,force:true});
}
