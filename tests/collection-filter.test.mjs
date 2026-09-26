import assert from "node:assert/strict";
import {createRequire} from "node:module";

const require=createRequire(import.meta.url);
const Filter=require("../collection-filter.js");
const entries=[
  {id:"project-a",type:"project",areaRefs:["area-a"]},
  {id:"project-free",type:"project",areaRefs:[]},
  {id:"knowledge-a",type:"knowledge",areaRefs:["area-a","area-b"]},
  {id:"knowledge-free",type:"knowledge"},
  {id:"source-b",type:"source",areaRefs:["area-b"]},
  {id:"source-free",type:"source",areaRefs:[]}
];

assert.deepEqual(Filter.filterByArea(entries,"all").map(entry=>entry.id),entries.map(entry=>entry.id));
assert.deepEqual(Filter.filterByArea(entries,"area-a").map(entry=>entry.id),["project-a","knowledge-a"]);
assert.deepEqual(Filter.filterByArea(entries,"area-b").map(entry=>entry.id),["knowledge-a","source-b"]);
assert.deepEqual(Filter.filterByArea(entries,"unassigned").map(entry=>entry.id),["project-free","knowledge-free","source-free"]);
for(const type of ["project","knowledge","source"]){
  const ofType=entries.filter(entry=>entry.type===type);
  assert.equal(Filter.filterByArea(ofType,"unassigned").length,1,`${type} 应支持未归属筛选`);
}

console.log("collection filter tests passed");
