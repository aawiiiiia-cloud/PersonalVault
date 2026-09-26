import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require=createRequire(import.meta.url);
const Batch=require("../source-batch.js");

const entries=[
  { id:"area-a",type:"area",title:"领域 A" },
  { id:"area-b",type:"area",title:"领域 B" },
  { id:"source-a",type:"source",title:"资料 A",areaRefs:["area-a"],readingStatus:"unread",assetId:"asset-a",assetPath:"文件/资料/a.txt",relatedRefs:["source-b"] },
  { id:"source-b",type:"source",title:"资料 B",areaRefs:["area-b"],readingStatus:"reading",assetId:"asset-b",assetPath:"文件/资料/b.txt" },
  { id:"source-c",type:"source",title:"资料 C",areaRefs:["area-a","area-b"],readingStatus:"processed" },
  { id:"source-trash",type:"source",title:"已删除",areaRefs:["area-a"],deletedAt:"2026-09-01T00:00:00.000Z" }
];
const state={ schemaVersion:1,updatedAt:"2026-09-01T00:00:00.000Z",entries,tombstones:[] };
const selected=new Set(["source-a","source-b"]);
const now="2026-09-23T10:00:00.000Z";

assert.deepEqual(Batch.reconcileSelection(selected,[entries[2],entries[3]]),selected);
assert.deepEqual(Batch.reconcileSelection(selected,[entries[2]]),new Set(["source-a"]));

const added=Batch.applyBatchToState(state,selected,"add-areas",{ areaIds:["area-a","area-b","area-b"] },now);
assert.equal(added.affected,2);
assert.deepEqual(added.state.entries.find(entry=>entry.id === "source-a").areaRefs,["area-a","area-b"]);
assert.deepEqual(added.state.entries.find(entry=>entry.id === "source-b").areaRefs,["area-b","area-a"]);

const removed=Batch.applyBatchToState(added.state,selected,"remove-areas",{ areaIds:["area-b"] },now);
assert.equal(removed.affected,2);
assert.deepEqual(removed.state.entries.find(entry=>entry.id === "source-a").areaRefs,["area-a"]);
assert.deepEqual(removed.state.entries.find(entry=>entry.id === "source-b").areaRefs,["area-a"]);
assert.equal(Batch.countAreaRemoval(entries,selected,["area-a"]),1);

const status=Batch.applyBatchToState(state,selected,"set-reading-status",{ readingStatus:"processed" },now);
assert.equal(status.affected,2);
assert.ok(status.state.entries.filter(entry=>selected.has(entry.id)).every(entry=>entry.readingStatus === "processed"));

const trashed=Batch.applyBatchToState(state,selected,"trash",{},now);
assert.equal(trashed.affected,2);
const trashedA=trashed.state.entries.find(entry=>entry.id === "source-a");
assert.equal(trashedA.deletedAt,now);
assert.equal(trashedA.assetId,"asset-a");
assert.equal(trashedA.assetPath,"文件/资料/a.txt");
assert.deepEqual(trashedA.relatedRefs,["source-b"]);
assert.equal(state.entries.find(entry=>entry.id === "source-a").deletedAt,undefined,"原状态不得被直接修改");

assert.throws(()=>Batch.applyBatchToState(state,selected,"set-reading-status",{ readingStatus:"invalid" },now));
assert.throws(()=>Batch.applyBatchToState(state,selected,"remove-areas",{ areaIds:[] },now));

let created=0;
const merged=Batch.mergeImportedAssets(entries,[{ id:"asset-a" },{ id:"asset-new" },{ id:"asset-new" }],asset=>({ id:`new-${++created}`,type:"source",title:asset.id,assetId:asset.id }));
assert.equal(merged.reused,2);
assert.equal(merged.createdIds.length,1);
assert.deepEqual(merged.createdIds,["new-1"]);

console.log("source-batch tests passed");
