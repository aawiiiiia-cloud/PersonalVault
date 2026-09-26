import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { promises as fs } from "node:fs";
import { createRequire } from "node:module";

const require=createRequire(import.meta.url);
const Batch=require("../source-batch.js");
const GraphData=require("../graph-data.js");
const sandbox=await fs.mkdtemp(path.join(os.tmpdir(),"knowledge-workbench-batch-"));
const vaultPath=path.join(sandbox,"PersonalVault");
const inputPath=path.join(sandbox,"input");
process.env.PERSONAL_VAULT_PATH=vaultPath;

async function syncLogCount() {
  try {
    const text=await fs.readFile(path.join(vaultPath,"系统","日志","sync-events.jsonl"),"utf8");
    return text.split(/\r?\n/).filter(line=>line.trim() && JSON.parse(line).action === "sync-complete").length;
  } catch { return 0; }
}

try {
  await fs.mkdir(inputPath,{ recursive:true });
  const firstPath=path.join(inputPath,"批量资料甲.txt");
  const secondPath=path.join(inputPath,"批量资料乙.txt");
  await fs.writeFile(firstPath,"批量整理索引甲","utf8");
  await fs.writeFile(secondPath,"批量整理索引乙","utf8");
  const vault=await import(`../server.mjs?batch=${Date.now()}`);
  const semantic=await import(`../semantic-index.mjs?batch=${Date.now()}`);
  const [firstAsset,secondAsset]=(await vault.importFiles([firstPath,secondPath],"copy")).assets;
  const initial={ schemaVersion:1,tombstones:[],entries:[
    { id:"area-a",type:"area",title:"领域 A",status:"active",areaRefs:[],createdAt:"2026-09-20T00:00:00.000Z",updatedAt:"2026-09-20T00:00:00.000Z" },
    { id:"area-b",type:"area",title:"领域 B",status:"active",areaRefs:[],createdAt:"2026-09-20T00:00:00.000Z",updatedAt:"2026-09-20T00:00:00.000Z" },
    { id:"source-a",type:"source",title:"批量资料甲",rawContent:"批量整理索引甲",areaRefs:["area-a"],readingStatus:"unread",assetId:firstAsset.id,assetPath:firstAsset.relativePath,createdAt:"2026-09-20T00:00:00.000Z",updatedAt:"2026-09-20T00:00:00.000Z" },
    { id:"source-b",type:"source",title:"批量资料乙",rawContent:"批量整理索引乙",areaRefs:[],readingStatus:"reading",assetId:secondAsset.id,assetPath:secondAsset.relativePath,createdAt:"2026-09-20T00:00:00.000Z",updatedAt:"2026-09-20T00:00:00.000Z" }
  ] };
  await vault.syncCards({ schemaVersion:1,cards:initial.entries,tombstones:[] });
  const provider={ model:"batch-test",async embed(texts){ return texts.map((_,index)=>index%2 ? [0,1,0] : [1,0,0]); } };
  await semantic.rebuildSemanticIndex(vaultPath,{ provider });
  assert.equal((await semantic.semanticIndexStatus(vaultPath,{ provider })).needsRebuild,false);

  const beforeBatchLogs=await syncLogCount();
  const batch=Batch.applyBatchToState(initial,new Set(["source-a","source-b"]),"add-areas",{ areaIds:["area-b"] },"2026-09-23T10:00:00.000Z");
  await vault.syncCards({ schemaVersion:1,cards:batch.state.entries,tombstones:[] });
  assert.equal((await syncLogCount())-beforeBatchLogs,1,"一次批量操作应只产生一次完整同步");

  const restored=(await vault.loadLatestState()).state;
  assert.ok(restored.entries.filter(entry=>entry.type === "source").every(entry=>entry.areaRefs.includes("area-b")));
  const manifest=JSON.parse(await fs.readFile(path.join(vaultPath,"系统","cards-manifest.json"),"utf8"));
  for (const id of ["source-a","source-b"]) {
    const markdown=await fs.readFile(path.join(vaultPath,manifest.cards[id].path),"utf8");
    assert.match(markdown,/areaRefs: \["area-[ab]"(?:,"area-b")?\]/);
  }
  const exact=await vault.querySearchIndex({ query:"批量整理",type:"source",areaId:"area-b" });
  assert.deepEqual(new Set(exact.results.map(result=>result.id)),new Set(["source-a","source-b"]));
  assert.equal((await semantic.semanticIndexStatus(vaultPath,{ provider })).needsRebuild,true,"领域变化应让语义索引明确标记为需要重建");
  const graph=GraphData.filterGraph(GraphData.buildGraph(restored),{ areaId:"area-b" });
  assert.deepEqual(new Set(graph.nodes.map(node=>node.id)),new Set(["source-a","source-b"]));

  const beforeTrashLogs=await syncLogCount();
  const trashed=Batch.applyBatchToState(restored,new Set(["source-a"]),"trash",{},"2026-09-23T11:00:00.000Z");
  await vault.syncCards({ schemaVersion:1,cards:trashed.state.entries,tombstones:[] });
  assert.equal((await syncLogCount())-beforeTrashLogs,1);
  const trashManifest=JSON.parse(await fs.readFile(path.join(vaultPath,"系统","cards-manifest.json"),"utf8"));
  assert.match(trashManifest.cards["source-a"].path,/卡片\/回收站\//);
  assert.equal((await vault.querySearchIndex({ query:"批量资料甲" })).count,0);
  assert.ok(await fs.stat(path.join(vaultPath,firstAsset.relativePath)),"批量移到回收站不得删除原始资产");

  console.log("source-batch integration tests passed");
} finally {
  await fs.rm(sandbox,{ recursive:true,force:true });
}
