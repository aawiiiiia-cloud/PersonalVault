import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const GraphData = require("../graph-data.js");
const GraphCanvas = require("../graph-canvas.js");

const state = {
  tombstones:[{ id:"tombstoned",type:"knowledge",deletedAt:"2026-09-22T00:00:00Z" }],
  entries:[
    { id:"area-art",type:"area",title:"艺术",deletedAt:null },
    { id:"project-a",type:"project",title:"角色项目",areaRefs:["area-art"],sourceRefs:["source-a"] },
    { id:"source-a",type:"source",title:"造型资料",areaRefs:["area-art"],projectRefs:["project-a"] },
    { id:"knowledge-a",type:"knowledge",title:"轮廓优先",areaRefs:["area-art"],relatedRefs:["knowledge-b"] },
    { id:"knowledge-b",type:"knowledge",title:"细节后置",relatedRefs:["knowledge-a"] },
    { id:"source-isolated",type:"source",title:"孤立资料",areaRefs:[] },
    { id:"capture-a",type:"capture",title:"随手记",relatedRefs:["knowledge-a"] },
    { id:"review-a",type:"review",title:"项目复盘",projectRefs:["project-a"] },
    { id:"deleted-source",type:"source",title:"回收站资料",deletedAt:"2026-09-22T00:00:00Z" },
    { id:"tombstoned",type:"knowledge",title:"不应复活" }
  ]
};
const snapshot = JSON.stringify(state);
const graph = GraphData.buildGraph(state);

assert.deepEqual(new Set(graph.nodes.map(node => node.id)),new Set(["project-a","source-a","knowledge-a","knowledge-b","source-isolated"]));
assert.ok(graph.nodes.every(node => ["project","knowledge","source"].includes(node.type)));
assert.equal(graph.edges.length,2);
assert.equal(graph.edges.filter(edge => [edge.source,edge.target].includes("project-a") && [edge.source,edge.target].includes("source-a")).length,1);
assert.deepEqual(GraphData.neighborIds(graph,"project-a"),new Set(["source-a"]));
assert.deepEqual(GraphData.directRelations(graph,"source-a").map(node => node.id),["project-a"]);
assert.ok(graph.nodes.some(node => node.id === "source-isolated"));
assert.equal(graph.nodes.find(node => node.id === "project-a").incomingCount,1);
assert.equal(graph.nodes.find(node => node.id === "source-isolated").incomingCount,0);
assert.equal(graph.nodes.find(node => node.id === "knowledge-a").connectionCount,1);
assert.ok(GraphCanvas.nodeRadius({ connectionCount:4,incomingCount:0 }) > GraphCanvas.nodeRadius({ connectionCount:1,incomingCount:3 }));
assert.ok(GraphCanvas.nodeRadius({ connectionCount:1 }) > GraphCanvas.nodeRadius({ connectionCount:0 }));
assert.notEqual(GraphCanvas.nodeColor("project",0),GraphCanvas.nodeColor("knowledge",0));
assert.notEqual(GraphCanvas.nodeColor("knowledge",0),GraphCanvas.nodeColor("source",0));
assert.notEqual(GraphCanvas.nodeColor("project",0),GraphCanvas.nodeColor("project",4));
const colorBrightness = color => color.match(/\d+/g).map(Number).reduce((sum,value)=>sum+value,0)/3;
assert.ok(colorBrightness(GraphCanvas.nodeColor("knowledge",1))-colorBrightness(GraphCanvas.nodeColor("knowledge",3))>18);
assert.ok(GraphCanvas.labelPresentation(1).fontSize > GraphCanvas.labelPresentation(.5).fontSize);
assert.ok(GraphCanvas.labelPresentation(.5).opacity > GraphCanvas.labelPresentation(.32).opacity);
assert.equal(GraphCanvas.labelPresentation(.32).opacity,0);
assert.ok(GraphCanvas.labelVerticalOffset(8,11,1)>GraphCanvas.labelVerticalOffset(8,11,0));
assert.ok(GraphCanvas.nodeScaleForZoom(.3)<GraphCanvas.nodeScaleForZoom(1));
assert.ok(GraphCanvas.nodeScaleForZoom(2)>GraphCanvas.nodeScaleForZoom(1));
assert.equal(GraphCanvas.entranceSpringProgress(0),0);
assert.ok(GraphCanvas.entranceSpringProgress(.5)>1);
assert.equal(GraphCanvas.entranceSpringProgress(1),1);
assert.equal(GraphCanvas.hoverNodeScale(0),1);
assert.ok(GraphCanvas.hoverNodeScale(1)>GraphCanvas.hoverNodeScale(.5));

const artGraph = GraphData.filterGraph(graph,{ areaId:"area-art" });
assert.deepEqual(new Set(artGraph.nodes.map(node => node.id)),new Set(["project-a","source-a","knowledge-a"]));
assert.ok(!artGraph.nodes.some(node => node.type === "area"));
const projectGraph = GraphData.filterGraph(graph,{ types:new Set(["project"]) });
assert.deepEqual(projectGraph.nodes.map(node => node.id),["project-a"]);
assert.equal(projectGraph.edges.length,0);
assert.equal(GraphData.findNodeByTitle(graph,"轮廓").id,"knowledge-a");
assert.equal(GraphData.findNodeByTitle(graph,"不存在"),null);
assert.equal(JSON.stringify(state),snapshot);

const hubGraph = GraphData.buildGraph({ entries:[
  { id:"hub",type:"knowledge",title:"三个直接连接",relatedRefs:["one","two"] },
  { id:"one",type:"project",title:"连接一" },
  { id:"two",type:"source",title:"连接二" },
  { id:"three",type:"project",title:"连接三",relatedRefs:["hub"] }
] });
const hub=hubGraph.nodes.find(node=>node.id==="hub");
assert.equal(hub.connectionCount,3);
assert.equal(hub.incomingCount,1);
assert.ok(GraphCanvas.nodeRadius(hub) > GraphCanvas.nodeRadius(hubGraph.nodes.find(node=>node.id==="one")));

console.log("关系图谱数据转换、去重、筛选与定位：全部通过");
