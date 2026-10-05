import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { mkdtemp, readFile, readdir, rm, stat, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { searchIndex, loadRebuildState } from "../search-index.mjs";
import { rebuildSemanticIndex, semanticIndexStatus } from "../semantic-index.mjs";

const require=createRequire(import.meta.url);
globalThis.window={};
const V2=require("../card-v2.js");
const Rich=require("../card-markdown.js");
require("../data-layer.js");
const Data=window.WorkbenchData;
const execFileAsync=promisify(execFile);
const when="2026-09-20T00:00:00.000Z";
const after="2026-09-25T10:00:00.000Z";
const legacy=[
  {id:"area-a",type:"area",title:"工作领域",createdAt:when,updatedAt:when},
  {id:"project-a",type:"project",title:"测试项目",challenge:"希望解决的难题",desired:"目标场景",existingSolution:"已有工具",customDecision:"自行判断",myRole:"我来验收",agentWork:"协助编写",nextStep:"开始测试",tasks:[{id:"task-a",text:"开始测试",done:false}],status:"active",areaRefs:["area-a"],relatedRefs:["knowledge-a"],createdAt:when,updatedAt:when},
  {id:"knowledge-a",type:"knowledge",title:"测试知识",conclusion:"核心结论",applies:"适用案例",limits:"边界例外",sourceRefs:["project-a"],relatedRefs:["source-a"],confidence:"reviewed",createdAt:when,updatedAt:when},
  {id:"source-a",type:"source",title:"测试资料",origin:"平台出处",url:"https://example.com",summaryText:"独特摘要词",rawContent:"原始素材",projectRefs:["project-a"],assetId:"asset-a",assetPath:"素材/资料.txt",assetCategory:"文档",fileName:"资料.txt",fileSize:4,readingStatus:"unread",createdAt:when,updatedAt:when},
  {id:"review-a",type:"review",title:"项目复盘",projectRefs:["project-a"],createdAt:when,updatedAt:when},
  {id:"trash-a",type:"source",title:"回收站资料",rawContent:"不应搜到",deletedAt:when,createdAt:when,updatedAt:when}
];
const migrated=Data.normalizeState({updatedAt:when,entries:legacy});
assert.equal(migrated.schemaVersion,2);
assert.equal(migrated.updatedAt,when);
assert.deepEqual(migrated.entries.map(card=>card.id),legacy.map(card=>card.id));
const project=migrated.entries.find(card=>card.id==="project-a");
assert.equal(project.structureVersion,2);
assert.equal(project.createdAt,when);
assert.equal(project.updatedAt,when);
assert.equal(project.status,"active");
assert.equal(project.tasks[0].id,"task-a");
assert.match(project.goal,/希望解决的难题/);
assert.match(project.goal,/目标场景/);
for(const phrase of ["已有工具","自行判断","我来验收","协助编写"]) assert.match(project.content,new RegExp(phrase));
assert.equal(project.content.includes("开始测试"),false,"已迁入待办的文字不要重复写入内容");
for(const oldField of ["challenge","desired","existingSolution","customDecision","myRole","agentWork","nextStep"]) assert.equal(Object.hasOwn(project,oldField),false);
const knowledge=migrated.entries.find(card=>card.id==="knowledge-a");
for(const phrase of ["核心结论","适用案例","边界例外"]) assert.match(knowledge.content,new RegExp(phrase));
assert.deepEqual(knowledge.sourceRefs,["project-a"]);
const source=migrated.entries.find(card=>card.id==="source-a");
assert.deepEqual(source.relatedRefs,["project-a"]);
assert.equal(source.assetId,"asset-a");
assert.equal(source.assetPath,"素材/资料.txt");
assert.match(source.origin,/平台出处/);
assert.match(source.origin,/example.com/);
assert.match(source.content,/独特摘要词/);
assert.match(source.content,/原始素材/);
assert.deepEqual(migrated.entries.find(card=>card.id==="review-a").projectRefs,["project-a"]);
assert.equal(migrated.entries.find(card=>card.id==="trash-a").deletedAt,when);
for(const type of ["project","knowledge","source"]){
  const created=Data.normalizeEntry({id:`new-${type}`,type,title:"新卡片",createdAt:when,updatedAt:when});
  assert.equal(created.structureVersion,2);
  assert.equal(created[type==="project"?"status":type==="knowledge"?"confidence":"readingStatus"],type==="project"?"not_started":type==="knowledge"?"draft":"unread");
  assert.equal(created.content,"");
}
for(const type of ["project","knowledge","source"]){
  const capture={id:`capture-${type}`,type:"capture",title:"随手记转卡",origin:"一次对话",rawContent:"一字不丢的原文",createdAt:when,updatedAt:when};
  const converted=Data.normalizeEntry(V2.convertCapture(capture,type,after));
  assert.equal(converted.id,capture.id);
  assert.equal(converted.createdAt,when);
  assert.equal(converted.updatedAt,after);
  assert.deepEqual(converted.originalCapture,{content:"一字不丢的原文",origin:"一次对话"});
  assert.equal(converted.content,"");
}
assert.equal(Object.hasOwn(Data.normalizeEntry({id:"p",type:"project",title:"无原文"}),"originalCapture"),false);
const canvasCard=Data.normalizeEntry({id:"canvas-card",type:"knowledge",title:"画布卡片",content:"新正文",canvasVersion:1,legacyContent:"<p>旧正文</p>"});
assert.equal(canvasCard.canvasVersion,1);
assert.equal(canvasCard.legacyContent,"<p>旧正文</p>");

const sandbox=await mkdtemp(path.join(tmpdir(),"workbench-card-v2-"));
const vaultPath=path.join(sandbox,"vault");
process.env.PERSONAL_VAULT_PATH=vaultPath;
try {
  const assetPath=path.join(vaultPath,"素材","资料.txt");
  await mkdir(path.dirname(assetPath),{recursive:true});
  await writeFile(assetPath,"ASSET");
  const assetBefore=await readFile(assetPath);
  const vault=await import(`../server.mjs?v2=${Date.now()}`);
  await vault.syncCards({schemaVersion:1,cards:legacy});
  const beforeManifest=JSON.parse(await readFile(path.join(vaultPath,"系统","cards-manifest.json"),"utf8"));
  await execFileAsync(process.execPath,[path.resolve(import.meta.dirname,"../scripts/migrate-card-v2.mjs"),"--vault",vaultPath,"--apply"],{env:{...process.env,PERSONAL_VAULT_PATH:vaultPath}});
  const snapshots=await readdir(path.join(vaultPath,"系统","迁移快照"));
  assert.equal(snapshots.length,1);
  const snapshot=path.join(vaultPath,"系统","迁移快照",snapshots[0]);
  assert.equal(JSON.parse(await readFile(path.join(snapshot,"latest-state.json"),"utf8")).schemaVersion,1);
  assert.deepEqual(JSON.parse(await readFile(path.join(snapshot,"latest-state.json"),"utf8")).entries,legacy);
  assert.equal(crypto.createHash("sha256").update(await readFile(path.join(snapshot,beforeManifest.cards["source-a"].path))).digest("hex"),beforeManifest.cards["source-a"].hash);
  const restored=(await vault.loadLatestState()).state;
  assert.equal(restored.schemaVersion,2);
  assert.deepEqual(restored.entries.find(card=>card.id==="source-a"),source);
  const manifest=JSON.parse(await readFile(path.join(vaultPath,"系统","cards-manifest.json"),"utf8"));
  assert.equal(manifest.schemaVersion,2);
  assert.equal(Object.keys(manifest.cards).length,legacy.length);
  for(const card of migrated.entries){
    const md=await readFile(path.join(vaultPath,manifest.cards[card.id].path),"utf8");
    assert.match(md,new RegExp(`structureVersion: 2|# ${card.title}`));
    if(card.id==="project-a") assert.match(md,/目标与场景/);
    if(card.id==="source-a") assert.match(md,/独特摘要词/);
  }
  assert.deepEqual(await readFile(assetPath),assetBefore);
  assert.ok((await stat(assetPath)).isFile());
  assert.ok((await searchIndex(vaultPath,{query:"独特摘要词"})).results.some(item=>item.id==="source-a"));
  assert.equal((await searchIndex(vaultPath,{query:"不应搜到"})).count,0);
  const markdownRestored=await loadRebuildState(vaultPath);
  assert.deepEqual(markdownRestored.entries.find(card=>card.id==="source-a").relatedRefs,["project-a"]);
  const provider={model:"v2-test",async embed(texts){return texts.map(()=>[1,0,0]);}};
  await rebuildSemanticIndex(vaultPath,{provider});
  assert.equal((await semanticIndexStatus(vaultPath)).needsRebuild,false);
  const richContent=Rich.RICH_PREFIX+'<p>新版资料<span style="color:#cc2233;background-color:#fff0aa">备注与摘要</span></p>';
  const refreshed=Data.normalizeState({...restored,entries:restored.entries.map(card=>card.id==="source-a"?{...card,content:richContent,updatedAt:after}:card)});
  await vault.syncCards(Data.createBundle(refreshed));
  assert.ok((await searchIndex(vaultPath,{query:"备注与摘要"})).results.some(item=>item.id==="source-a"),"彩色文字仍须能被精确检索");
  assert.equal((await loadRebuildState(vaultPath)).entries.find(card=>card.id==="source-a").content,richContent);
  assert.equal((await semanticIndexStatus(vaultPath)).needsRebuild,true,"语义内容变更必须标记旧索引过期");
} finally {
  await rm(sandbox,{recursive:true,force:true});
}
console.log("V2 字段迁移、随手记、Markdown、精确/语义索引与资产保持：全部通过");
