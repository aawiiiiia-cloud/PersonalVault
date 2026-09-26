import path from "node:path";
import { promises as fs } from "node:fs";

const workspace=path.resolve(process.cwd());
const sandbox=path.resolve(workspace,".electron-graph-smoke");
if (path.dirname(sandbox) !== workspace) throw new Error(`拒绝使用意外的测试目录：${sandbox}`);

await fs.rm(sandbox,{ recursive:true,force:true });
const vaultPath=path.join(sandbox,"PersonalVault");
const userDataPath=path.join(sandbox,"user-data");
await fs.mkdir(userDataPath,{ recursive:true });
process.env.PERSONAL_VAULT_PATH=vaultPath;

const vault=await import(`../server.mjs?graph-fixture=${Date.now()}`);
const timestamp="2026-09-22T08:00:00.000Z";
await vault.syncCards({
  schemaVersion:1,
  cards:[
    { id:"area-a",type:"area",title:"领域 A",createdAt:timestamp,updatedAt:timestamp },
    { id:"area-b",type:"area",title:"领域 B",createdAt:timestamp,updatedAt:timestamp },
    { id:"project-a",type:"project",title:"项目节点",areaRefs:["area-a"],sourceRefs:["source-a"],relatedRefs:["knowledge-a"],createdAt:timestamp,updatedAt:timestamp },
    { id:"knowledge-a",type:"knowledge",title:"核心知识",areaRefs:["area-a"],relatedRefs:["project-a","source-a"],createdAt:timestamp,updatedAt:timestamp },
    { id:"source-a",type:"source",title:"关联资料",areaRefs:["area-a"],projectRefs:["project-a"],createdAt:timestamp,updatedAt:timestamp },
    { id:"source-isolated",type:"source",title:"孤立资料",areaRefs:["area-b"],createdAt:timestamp,updatedAt:timestamp },
    { id:"capture-a",type:"capture",title:"不进入图谱的随手记",relatedRefs:["knowledge-a"],createdAt:timestamp,updatedAt:timestamp },
    { id:"review-a",type:"review",title:"不进入图谱的复盘",projectRefs:["project-a"],createdAt:timestamp,updatedAt:timestamp },
    { id:"deleted-source",type:"source",title:"不进入图谱的回收站资料",deletedAt:timestamp,createdAt:timestamp,updatedAt:timestamp }
  ],
  tombstones:[{ id:"permanently-deleted",type:"knowledge",deletedAt:timestamp }]
});

console.log(JSON.stringify({ vaultPath,userDataPath },null,2));
