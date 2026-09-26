import path from "node:path";
import { promises as fs } from "node:fs";

const workspace=path.resolve(process.cwd());
const sandbox=path.resolve(workspace,".electron-source-batch-smoke");
if (path.dirname(sandbox) !== workspace) throw new Error(`拒绝使用意外的测试目录：${sandbox}`);
await fs.rm(sandbox,{ recursive:true,force:true });
const vaultPath=path.join(sandbox,"PersonalVault");
const userDataPath=path.join(sandbox,"user-data");
const inputPath=path.join(sandbox,"input");
await fs.mkdir(inputPath,{ recursive:true });
await fs.mkdir(userDataPath,{ recursive:true });
process.env.PERSONAL_VAULT_PATH=vaultPath;

const files=[];
for (const name of ["资料甲.txt","资料乙.txt","资料丙.txt","资料丁.txt","刚刚导入.txt"]) {
  const filePath=path.join(inputPath,name);
  await fs.writeFile(filePath,`${name} 的批量整理测试内容`,`utf8`);
  files.push(filePath);
}
const vault=await import(`../server.mjs?source-batch-fixture=${Date.now()}`);
const assets=(await vault.importFiles(files,"copy")).assets;
const timestamp="2026-09-23T08:00:00.000Z";
const source=(id,title,asset,areaRefs,readingStatus,index)=>({
  id,type:"source",title,rawContent:`${title} 的批量整理测试内容`,areaRefs,readingStatus,
  assetId:asset.id,assetPath:asset.relativePath,assetCategory:asset.category,fileName:asset.displayName,
  fileExtension:asset.extension,fileSize:asset.size,contentHash:asset.contentHash,
  relatedRefs:id === "source-a" ? ["source-b"] : [],sourceRefs:[],projectRefs:[],
  createdAt:timestamp,updatedAt:`2026-09-23T08:0${index}:00.000Z`,created:"2026-09-23",updated:"2026-09-23"
});
await vault.syncCards({ schemaVersion:1,cards:[
  { id:"area-a",type:"area",title:"领域 A",status:"active",areaRefs:[],sourceRefs:[],relatedRefs:[],projectRefs:[],createdAt:timestamp,updatedAt:timestamp },
  { id:"area-b",type:"area",title:"领域 B",status:"active",areaRefs:[],sourceRefs:[],relatedRefs:[],projectRefs:[],createdAt:timestamp,updatedAt:timestamp },
  { id:"area-c",type:"area",title:"领域 C",status:"active",areaRefs:[],sourceRefs:[],relatedRefs:[],projectRefs:[],createdAt:timestamp,updatedAt:timestamp },
  { id:"project-c",type:"project",title:"领域项目",status:"active",areaRefs:["area-c"],sourceRefs:[],relatedRefs:[],projectRefs:[],createdAt:timestamp,updatedAt:timestamp },
  { id:"project-free",type:"project",title:"未归属项目",status:"active",areaRefs:[],sourceRefs:[],relatedRefs:[],projectRefs:[],createdAt:timestamp,updatedAt:timestamp },
  { id:"knowledge-c",type:"knowledge",title:"领域知识",confidence:"reviewed",areaRefs:["area-c"],sourceRefs:[],relatedRefs:[],projectRefs:[],createdAt:timestamp,updatedAt:timestamp },
  { id:"knowledge-free",type:"knowledge",title:"未归属知识",confidence:"draft",areaRefs:[],sourceRefs:[],relatedRefs:[],projectRefs:[],createdAt:timestamp,updatedAt:timestamp },
  source("source-a","资料甲",assets[0],["area-a"],"unread",1),
  source("source-b","资料乙",assets[1],["area-b"],"reading",2),
  source("source-c","资料丙",assets[2],["area-a","area-b","area-c"],"processed",3),
  source("source-d","资料丁",assets[3],[],"unread",4)
],tombstones:[] });

const fixture={ vaultPath,userDataPath,orphanAsset:assets[4],existingAsset:assets[0],assetPaths:assets.map(asset=>path.join(vaultPath,asset.relativePath)) };
const fixturePath=path.join(sandbox,"fixture.json");
await fs.writeFile(fixturePath,JSON.stringify(fixture,null,2),"utf8");
console.log(JSON.stringify({ ...fixture,fixturePath },null,2));
