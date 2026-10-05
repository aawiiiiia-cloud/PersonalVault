import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import {createReadStream} from 'node:fs';
import {cp,mkdir,readFile,readdir,rename,stat,writeFile} from 'node:fs/promises';

const args=process.argv.slice(2),vaultArg=args.indexOf('--vault');
if(vaultArg<0 || !args[vaultArg+1])throw new Error('请指定 --vault 知识库路径');
const root=path.resolve(args[vaultArg+1]);
process.env.PERSONAL_VAULT_PATH=root;
const apply=args.includes('--apply'),archive=args.includes('--archive-old');
const legacyCategories=['图片','视频','音频','文档','模型','工程','其他'];
const system=path.join(root,'系统'),filesRoot=path.join(root,'文件');
const inside=(base,target)=>{const resolved=path.resolve(target);if(!resolved.startsWith(path.resolve(base)+path.sep))throw new Error('目录越界：'+target);return resolved;};
const slash=value=>value.split(path.sep).join('/');
const readJson=async file=>JSON.parse(await readFile(file,'utf8'));
const readOptional=async file=>{try{return await readJson(file);}catch(e){if(e.code!=='ENOENT')throw e;return null;}};
async function digest(file){const hash=crypto.createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');}
async function walk(directory){const result=[];for(const item of await readdir(directory,{withFileTypes:true}).catch(e=>{if(e.code==='ENOENT')return [];throw e;})){if(item.isSymbolicLink())throw new Error('迁移目录含有符号链接：'+directory);const file=path.join(directory,item.name);if(item.isDirectory())result.push(...await walk(file));else if(item.isFile())result.push(file);}return result;}

const statePath=path.join(system,'latest-state.json');
const stateText=await readFile(statePath,'utf8'),state=JSON.parse(stateText);
const cards=state.entries || state.cards;
assert(Array.isArray(cards),'没有卡片列表');
const registry=await readJson(path.join(system,'cards-manifest.json'));
const globalManifest=await readOptional(path.join(system,'assets-manifest.json')) || {assets:{}};
assert.deepEqual(cards.map(c=>c.id).sort(),Object.keys(registry.cards).sort(),'卡片清单与状态不一致');
const actualMarkdown=await walk(path.join(root,'卡片'));
assert.deepEqual(actualMarkdown.filter(f=>f.endsWith('.md')).map(f=>slash(path.relative(root,f))).sort(),Object.values(registry.cards).map(c=>c.path.replaceAll('\\','/')).sort(),'有未登记或缺失的卡片文件');
for(const c of cards){const record=registry.cards[c.id];const file=inside(path.join(root,'卡片'),path.join(root,record.path));assert.equal(await digest(file),record.hash,'卡片文件被外部修改：'+c.id);}

const plans=[],hashes=new Map(),missing=[];
const asset=async id=>{
  const pointer=await readOptional(path.join(system,'附件索引',id+'.json'));
  if(pointer)return (await readJson(path.join(system,'附件清单',pointer.cardId+'.json'))).assets[id];
  return globalManifest.assets[id];
};
function referencedIds(card,doc){
  const ids=new Set([...Object.values(doc?.linkedAssets||{}),doc?.primaryAssetId,card.assetId].filter(Boolean));
  const text=JSON.stringify(card);
  for(const id of Object.keys(globalManifest.assets))if(text.includes(id))ids.add(id);
  for(const a of Object.values(globalManifest.assets))if(a.relativePath && text.includes(a.relativePath))ids.add(a.id);
  return [...ids];
}
for(const card of cards){
  assert(/^[a-zA-Z0-9_-]{1,128}$/.test(card.id),'卡片 ID 无效');
  const document=await readOptional(path.join(system,'自由画布',card.id+'.json'));
  const ids=referencedIds(card,document),records=[];
  for(const id of ids){
    const a=await asset(id);assert(a,'附件记录缺失：'+id);
    const file=a.relativePath ? inside(root,path.join(root,a.relativePath)) : path.resolve(a.absolutePath);
    const size=await stat(file).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
    const absent=!size?.isFile() || size.size!==a.size;
    let hash=null;
    if(!absent){if(!hashes.has(file))hashes.set(file,await digest(file));hash=hashes.get(file);if(a.contentHash)assert.equal(hash,a.contentHash,'附件内容与登记哈希不符：'+file);}
    else missing.push({cardId:card.id,title:card.title,name:a.displayName || a.originalName,path:a.relativePath || a.absolutePath});
    records.push({id,asset:a,file,hash,missing:absent});
  }
  plans.push({card,document,records});
}
const legacyDirectories=[];
for(const name of legacyCategories){const directory=inside(filesRoot,path.join(filesRoot,name));const items=await walk(directory);if(await stat(directory).catch(()=>null))legacyDirectories.push({name,directory,files:items.length});}
const summary={cards:cards.length,canvases:plans.filter(p=>p.document).length,cardsWithAttachments:plans.filter(p=>p.records.length).length,attachmentReferences:plans.reduce((n,p)=>n+p.records.length,0),missing,legacyDirectories:legacyDirectories.map(({name,files})=>({name,files}))};
if(!apply){console.log(JSON.stringify({mode:'dry-run',...summary},null,2));process.exit(0);}

const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const backup=inside(path.join(system,'迁移备份'),path.join(system,'迁移备份','附件按卡片',stamp));
await mkdir(path.join(backup,'metadata'),{recursive:true});
for(const name of ['latest-state.json','cards-manifest.json','assets-manifest.json','tombstones.json','自由画布','附件清单','附件索引']){
  const source=path.join(system,name);if(await stat(source).catch(()=>null))await cp(source,path.join(backup,'metadata','系统',name),{recursive:true});
}
await cp(path.join(root,'卡片'),path.join(backup,'metadata','卡片'),{recursive:true});
assert.equal(await readFile(statePath,'utf8'),stateText,'应用仍在更新数据，已停止迁移');
const vault=await import('../server.mjs');
const mappings=[],updatedCards=structuredClone(cards);
const reportPath=path.join(backup,'report.json');
try{
  for(const [i,plan] of plans.entries()){
    const card=updatedCards[i],map={};let normalized=null;
    if(plan.document){
      normalized=await vault.migrateCanvasAttachments(card.id,{title:card.title,type:card.type});
      for(const [source,id] of Object.entries(plan.document.linkedAssets||{}))if(normalized.linkedAssets[source])map[id]=normalized.linkedAssets[source];
      if(plan.document.primaryAssetId && normalized.primaryAssetId)map[plan.document.primaryAssetId]=normalized.primaryAssetId;
    }
    const extra=plan.records.map(r=>r.id).filter(id=>!map[id]);
    if(extra.length)Object.assign(map,(await vault.migrateCardAssetReferences(card.id,{title:card.title,type:card.type},extra)).assetIds);
    const replacements=[];
    for(const before of plan.records){
      const after=await vault.getAsset(map[before.id]);
      assert.equal(after.ownerCardId,card.id,'附件没有属于当前卡片');
      const target=inside(filesRoot,after.absolutePath);
      if(before.missing)assert.equal(await stat(target).then(()=>true,()=>false),false,'缺失文件不得自动恢复');
      else {assert.equal(await digest(target),before.hash,'迁移后的文件内容不一致');assert.equal((await stat(target)).size,before.asset.size);}
      mappings.push({cardId:card.id,title:card.title,oldId:before.id,newId:after.id,from:before.asset.relativePath || before.file,to:after.relativePath,missing:before.missing,hash:before.hash});
      replacements.push([before.id,after.id]);
      if(before.asset.relativePath)replacements.push([before.asset.relativePath,after.relativePath]);
      if(card.assetId===before.id)Object.assign(card,{assetId:after.id,assetPath:after.relativePath,assetPortable:true,assetStorageMode:after.storageMode,fileName:after.displayName});
    }
    const replace=value=>typeof value==='string' ? replacements.reduce((s,[a,b])=>s.split(a).join(b),value) : Array.isArray(value) ? value.map(replace) : value && typeof value==='object' ? Object.fromEntries(Object.entries(value).map(([key,v])=>[key,replace(v)])) : value;
    updatedCards[i]=replace(card);
  }
  const migratedAt=new Date().toISOString();
  await vault.syncCards({schemaVersion:state.schemaVersion,entries:updatedCards,tombstones:state.tombstones || [],stateUpdatedAt:migratedAt});
  const latest=(await vault.loadLatestState()).state;
  assert.deepEqual(latest.entries.map(c=>c.id).sort(),cards.map(c=>c.id).sort());
  // Check all live structured references after publishing, before archiving originals.
  for(const card of latest.entries){
    const doc=await vault.loadCanvasDocument(card.id);
    const ids=new Set([...Object.values(doc?.linkedAssets||{}),doc?.primaryAssetId,card.assetId].filter(Boolean));
    for(const id of ids){const a=await vault.getAsset(id);assert.equal(a.ownerCardId,card.id);assert(a.relativePath && !legacyCategories.some(c=>a.relativePath.startsWith('文件/'+c+'/')),'仍有引用旧分类目录的附件');}
  }
  const updatedLegacy=structuredClone(globalManifest),archived=[];
  if(archive){
    for(const item of legacyDirectories){
      const target=inside(backup,path.join(backup,'旧文件',item.name));
      await mkdir(path.dirname(target),{recursive:true});
      // Both resolved targets are verified within the vault and backup roots.
      inside(filesRoot,item.directory);inside(backup,target);
      await rename(item.directory,target);
      archived.push({from:slash(path.relative(root,item.directory)),to:slash(path.relative(root,target)),files:item.files});
      for(const a of Object.values(updatedLegacy.assets))if(a.relativePath?.startsWith('文件/'+item.name+'/')){
        a.relativePath=slash(path.relative(root,path.join(target,a.relativePath.slice(('文件/'+item.name+'/').length))));
      }
    }
    updatedLegacy.updatedAt=migratedAt;
    await writeFile(path.join(system,'assets-manifest.json'),JSON.stringify(updatedLegacy,null,2));
  }
  await writeFile(reportPath,JSON.stringify({status:'complete',vault:root,backup,migratedAt,...summary,mappings,archived},null,2));
  console.log(JSON.stringify({status:'complete',backup,report:reportPath,...summary,verifiedCopies:mappings.filter(m=>!m.missing).length,archived},null,2));
}catch(error){await writeFile(reportPath,JSON.stringify({status:'failed',error:error.message,backup,...summary,mappings},null,2));throw error;}
