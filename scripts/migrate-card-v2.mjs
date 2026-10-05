import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { cp, copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { searchIndexStatus } from "../search-index.mjs";
import { semanticIndexStatus } from "../semantic-index.mjs";
import {readCardFiles} from '../vault-cards.mjs';

const require=createRequire(import.meta.url);
globalThis.window={};
require("../data-layer.js");
const Data=window.WorkbenchData;
const args=process.argv.slice(2);
const vaultIndex=args.indexOf("--vault");
if(vaultIndex<0 || !args[vaultIndex+1]) throw new Error("请指定 --vault 知识库路径");
const vaultRoot=path.resolve(args[vaultIndex+1]);
const apply=args.includes("--apply");
const system=path.join(vaultRoot,"系统");
const cardRoot=path.join(vaultRoot,"卡片");
const statePath=path.join(system,"latest-state.json");
const manifestPath=path.join(system,"cards-manifest.json");
const hash=value=>crypto.createHash("sha256").update(value).digest("hex");
const slash=value=>value.split(path.sep).join("/");

async function markdownPaths(root,relative=""){
  const result=[];
  for(const item of await readdir(path.join(root,relative),{withFileTypes:true})){
    if(item.isSymbolicLink()) throw new Error("卡片目录含有符号链接，已停止迁移");
    const next=path.join(relative,item.name);
    if(item.isDirectory()) result.push(...await markdownPaths(root,next));
    else if(item.isFile() && item.name.toLowerCase().endsWith(".md")) result.push(slash(path.join("卡片",next)));
  }
  return result.sort();
}
async function readJson(file){return JSON.parse(await readFile(file,"utf8"));}
const originalDisk=await readCardFiles(vaultRoot);
if(!originalDisk.found) throw new Error('未找到原始卡片目录，请先检查资料库');
const oldState=originalDisk.state;
const oldManifest=await readJson(manifestPath);
const oldCards=oldState.entries || oldState.cards;
if(!Array.isArray(oldCards)) throw new Error("latest-state.json 不含卡片列表");
const oldIds=oldCards.map(card=>card.id);
assert.equal(new Set(oldIds).size,oldIds.length,"现有卡片 ID 不能重复");
const manifestIds=Object.keys(oldManifest.cards || {}).sort();
assert.deepEqual([...oldIds].sort(),manifestIds,"状态与 manifest ID 不一致，已停止迁移");
const actualPaths=await markdownPaths(cardRoot);
const expectedPaths=manifestIds.map(id=>oldManifest.cards[id].path.replaceAll("\\","/")).sort();
assert.deepEqual(actualPaths,expectedPaths,"存在未登记或缺失的 Markdown，已停止迁移");
for(const id of manifestIds){
  const registered=oldManifest.cards[id];
  const absolute=path.resolve(vaultRoot,registered.path);
  if(!absolute.startsWith(cardRoot+path.sep)) throw new Error("manifest 中存在越界路径："+registered.path);
  const text=await readFile(absolute);
  assert.equal(hash(text),registered.hash,"Markdown 哈希与 manifest 不一致："+id);
}

const next=Data.normalizeState(oldState);
const report=Data.validateState(next);
if(!report.ok) throw new Error("V2 数据验证失败："+report.errors.join("；"));
assert.deepEqual(next.entries.map(card=>card.id),oldIds,"迁移不得更换卡片 ID");
const knownTextFields=["challenge","desired","existingSolution","customDecision","myRole","agentWork","nextStep","origin","rawContent","conclusion","applies","limits","summaryText","candidate","url"];
const assetFields=["assetId","assetPath","assetCategory","assetStorageMode","assetPortable","fileName","fileExtension","fileSize","fileModifiedAt","contentHash","mediaWidth","mediaHeight","durationSeconds","videoCodec","audioCodec","sourceKind"];
for(let i=0;i<oldCards.length;i++){
  const before=oldCards[i],after=next.entries[i];
  assert.equal(after.title,before.title,"标题不能改变");
  assert.equal(after.type,before.type,"类型不能改变");
  assert.equal(after.createdAt,before.createdAt,"创建时间不能改变");
  assert.equal(after.deletedAt,before.deletedAt || null,"删除状态不能改变");
  for(const field of ["areaRefs","relatedRefs","sourceRefs"]){
    for(const id of before[field] || []) assert.ok([...(after.areaRefs||[]),...(after.relatedRefs||[]),...(after.sourceRefs||[])].includes(id),"关联丢失："+before.id+" "+id);
  }
  if(before.type==="review") assert.deepEqual(after.projectRefs,before.projectRefs,"项目复盘归属不能变");
  if(before.type==="source") for(const field of assetFields) if(Object.hasOwn(before,field)) assert.deepEqual(after[field],before[field],"资产元数据不能变："+before.id+" "+field);
  if(["project","knowledge","source"].includes(before.type)){
    const newText=[after.goal,after.origin,after.content,...(after.tasks||[]).map(task=>task.text),after.originalCapture?.content].filter(Boolean).join("\n");
    for(const field of knownTextFields){
      const value=String(before[field] || "").trim();
      if(value) assert.ok(newText.includes(value),"有价值文字未迁入："+before.id+" "+field);
    }
  }
}
const v2Count=next.entries.filter(card=>["project","knowledge","source"].includes(card.type)).length;
const hasLegacyMain=oldCards.some(card=>["project","knowledge","source"].includes(card.type) && Number(card.structureVersion || 0)<2);
console.log(JSON.stringify({mode:apply?"apply":"dry-run",vault:vaultRoot,total:next.entries.length,v2Cards:v2Count,markdown:actualPaths.length,warnings:report.warnings},null,2));
if(!apply) process.exit(0);

const stamp=new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d+Z$/,"Z").replace("T","-");
const snapshot=path.join(system,"迁移快照","card-v2-"+stamp);
await mkdir(snapshot,{recursive:true});
await copyFile(statePath,path.join(snapshot,"latest-state.json"));
await copyFile(manifestPath,path.join(snapshot,"cards-manifest.json"));
await cp(cardRoot,path.join(snapshot,"卡片"),{recursive:true,errorOnExist:true,force:false});
const snapshotMarkdown=await markdownPaths(path.join(snapshot,"卡片"));
assert.deepEqual(snapshotMarkdown,actualPaths,"快照 Markdown 数量或路径不一致");
const originalStateHash=hash(await readFile(statePath));
const backupStateHash=hash(await readFile(path.join(snapshot,"latest-state.json")));
assert.equal(backupStateHash,originalStateHash,"状态快照校验失败");
for(const id of manifestIds){
  const relative=oldManifest.cards[id].path;
  assert.equal(hash(await readFile(path.join(snapshot,relative))),oldManifest.cards[id].hash,"Markdown 快照校验失败："+id);
}
await writeFile(path.join(snapshot,"snapshot-report.json"),JSON.stringify({createdAt:new Date().toISOString(),vault:vaultRoot,originalStateHash,manifestHash:hash(await readFile(manifestPath)),cardCount:oldCards.length,markdownCount:actualPaths.length,paths:actualPaths},null,2)+"\n");

next.updatedAt=new Date().toISOString();
process.env.PERSONAL_VAULT_PATH=vaultRoot;
const vault=await import("../server.mjs?v2migration="+Date.now());
const syncResult=await vault.syncCards({...Data.createBundle(next),baseRevision:originalDisk.revision,requireRevision:true});
const restored=(await vault.loadLatestState()).state;
assert.equal(restored.schemaVersion,2);
assert.deepEqual(restored.entries.map(card=>card.id).sort(),[...oldIds].sort());
const currentManifest=await readJson(manifestPath);
assert.equal(Object.keys(currentManifest.cards).length,oldCards.length);
for(const card of restored.entries){
  const md=await readFile(path.join(vaultRoot,currentManifest.cards[card.id].path));
  assert.equal(hash(md),currentManifest.cards[card.id].hash,"迁移后 Markdown 哈希失败："+card.id);
}
const exact=await searchIndexStatus(vaultRoot);
const semantic=await semanticIndexStatus(vaultRoot);
if(hasLegacyMain && semantic.exists && !semantic.needsRebuild) throw new Error("语义内容改变后索引仍显示健康，请调查来源哈希");
console.log(JSON.stringify({snapshot,writeCount:syncResult.written,integrity:syncResult.integrity,exact,semantic:{exists:semantic.exists,indexedCount:semantic.indexedCount,sourceCount:semantic.sourceCount,needsRebuild:semantic.needsRebuild}},null,2));
