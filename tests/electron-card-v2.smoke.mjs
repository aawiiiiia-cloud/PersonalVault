import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import path from "node:path";

const require=createRequire(import.meta.url);
const electron=require("electron");
const root=await mkdtemp(path.join(tmpdir(),"workbench-v2-desktop-"));
const vaultPath=path.join(root,"vault"),userData=path.join(root,"user-data"),appData=path.join(root,"appdata");
await mkdir(appData,{recursive:true});
process.env.PERSONAL_VAULT_PATH=vaultPath;
const vault=await import("../server.mjs?v2smoke="+Date.now());
const when="2026-09-20T00:00:00.000Z";
await vault.syncCards({schemaVersion:1,cards:[
  {id:"area-a",type:"area",title:"测试领域",createdAt:when,updatedAt:when},
  {id:"capture-a",type:"capture",title:"待转换",origin:"一次对话",rawContent:"不可丢失的随手记原文",createdAt:when,updatedAt:when},
  {id:"source-a",type:"source",title:"原有资料",rawContent:"原有资料文字",assetId:"asset-a",assetPath:"素材/asset.mp4",assetCategory:"视频",createdAt:when,updatedAt:when}
]});
const port=await new Promise((resolve,reject)=>{const probe=createServer();probe.once("error",reject);probe.listen(0,"127.0.0.1",()=>{const address=probe.address();probe.close(()=>resolve(address.port));});});
const child=spawn(electron,["--remote-debugging-port="+port,"--user-data-dir="+userData,"--disable-gpu","--in-process-gpu","."],{cwd:path.resolve(import.meta.dirname,".."),env:{...process.env,PERSONAL_VAULT_PATH:vaultPath,APPDATA:appData,LOCALAPPDATA:appData},stdio:["ignore","pipe","pipe"],windowsHide:true});
let output="";
child.stdout.on("data",chunk=>{output+=chunk.toString();});
child.stderr.on("data",chunk=>{output+=chunk.toString();});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let socket;
try {
  let target;
  for(let i=0;i<100;i++){try{target=(await fetch("http://127.0.0.1:"+port+"/json").then(response=>response.json())).find(item=>item.type==="page"&&item.url?.includes("index.html"));}catch{}if(target)break;await delay(100);}
  if(!target)throw new Error("隔离 Electron 窗口未启动");
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.addEventListener("open",resolve,{once:true});socket.addEventListener("error",reject,{once:true});});
  let sequence=0;
  const pending=new Map();
  socket.addEventListener("message",event=>{const msg=JSON.parse(event.data),task=pending.get(msg.id);if(!task)return;pending.delete(msg.id);msg.error?task.reject(new Error(msg.error.message)):task.resolve(msg.result);});
  async function evaluate(expression){const id=++sequence;socket.send(JSON.stringify({id,method:"Runtime.evaluate",params:{expression,returnByValue:true,awaitPromise:true,userGesture:true}}));const result=await Promise.race([new Promise((resolve,reject)=>pending.set(id,{resolve,reject})),delay(8000).then(()=>{pending.delete(id);throw new Error("Electron 页面无响应: "+expression.slice(0,90));})]);if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);return result.result.value;}
  async function waitFor(expression){for(let i=0;i<80;i++){if(await evaluate("Boolean("+expression+")"))return;await delay(100);}throw new Error("等待超时: "+expression);}
  await waitFor("typeof state !== 'undefined' && state.entries.some(card=>card.id==='capture-a')");
  for(const type of ["project","knowledge","source"]){
    const fresh=await evaluate("(()=>{openEditor('"+type+"');return {title:document.querySelector('#formMeta strong').textContent,kicker:document.querySelector('#formKicker').classList.contains('hidden'),status:document.querySelector('select[name="+JSON.stringify(type==="project"?"status":type==="knowledge"?"confidence":"readingStatus")+"]').value,info:document.querySelector('#editorMainInfo').textContent,body:document.querySelector('#formFields .main-rich-editor')!==null,extra:document.querySelector('#editorDialog .main-card-secondary')?.textContent}})()");
    assert.equal(fresh.title,{project:"项目",knowledge:"知识",source:"资料"}[type]);
    assert.equal(fresh.kicker,true);
    assert.equal(fresh.status,{project:"not_started",knowledge:"draft",source:"unread"}[type]);
    assert.ok(fresh.info.includes("卡片信息")&&fresh.body);
    if(type==="project")assert.ok(fresh.extra.includes("目标与场景")&&fresh.extra.includes("待办列表"));
    if(type==="knowledge"||type==="source")assert.ok(fresh.extra.includes("来源"));
    if(type==="source")assert.ok(fresh.extra.includes("导入文件"));
    await evaluate("(()=>{document.querySelector('#mainTitleInput').value='V2 "+type+"';document.querySelector('.main-rich-editor').textContent='新版内容 "+type+"';"+(type==="project"?"document.querySelector('#f-goal').value='目标文字';document.querySelector('[data-add-task]').click();document.querySelector('.task-editor-row input[type=text]').value='第一项待办';document.querySelector('.task-editor-row input[type=text]').dispatchEvent(new Event('input',{bubbles:true}));":"")+"document.querySelector('#editorForm').requestSubmit();return true})()");
    await waitFor("state.entries.some(card=>card.title==='V2 "+type+"')");
    const saved=await evaluate("(()=>{const card=state.entries.find(card=>card.title==='V2 "+type+"');openViewer(card);return {heading:document.querySelector('#viewerTitle').textContent,kind:document.querySelector('#viewerMeta strong').textContent,body:document.querySelector('#viewerBody').textContent,original:document.querySelector('#viewerBody .original-capture')!==null,times:document.querySelector('.viewer-timestamps')?.textContent}})()");
    assert.equal(saved.heading,"V2 "+type);
    assert.equal(saved.kind,{project:"项目",knowledge:"知识",source:"资料"}[type]);
    assert.ok(saved.body.includes("新版内容 "+type));
    assert.equal(saved.original,false);
    assert.ok(saved.times.includes("修改"));
    await evaluate("document.querySelector('#editViewedEntry').click()");
    assert.equal(await evaluate("document.querySelector('#mainTitleInput').value"),saved.heading);
    await evaluate("(()=>{document.querySelector('.main-rich-editor').textContent+=' 编辑';document.querySelector('#editorForm').requestSubmit();return true})()");
    await waitFor("WorkbenchCardMarkdown.plainText(state.entries.find(card=>card.title==='V2 "+type+"')?.content).endsWith('编辑')");
    if(type==="project")assert.equal(await evaluate("state.entries.find(card=>card.title==='V2 project').tasks[0].text"),"第一项待办");
    await evaluate("document.querySelector('#closeViewer').click()");
  }
  await evaluate("openEditor('project',state.entries.find(card=>card.title==='V2 project'))");
  await evaluate("(()=>{document.querySelector('.task-editor-row input[type=checkbox]').click();document.querySelector('#editorForm').requestSubmit();return true})()");
  await waitFor("state.entries.find(card=>card.title==='V2 project').tasks[0]?.done===true");
  await evaluate("document.querySelector('#closeViewer').click()");
  await evaluate("openEditor('project',state.entries.find(card=>card.title==='V2 project'))");
  await evaluate("(()=>{document.querySelector('[data-remove-task]').click();document.querySelector('#editorForm').requestSubmit();return true})()");
  await waitFor("state.entries.find(card=>card.title==='V2 project').tasks.length===0");
  await evaluate("document.querySelector('#closeViewer').click()");
  await evaluate("openEditor('source')");
  await evaluate("(()=>{document.querySelector('#mainTitleInput').value='空白资料';document.querySelector('#editorForm').requestSubmit();return true})()");
  await waitFor("state.entries.some(card=>card.title==='空白资料')");
  const emptySections=await evaluate("(()=>{openViewer(state.entries.find(card=>card.title==='空白资料'));return [...document.querySelectorAll('#viewerBody .viewer-section h3')].map(el=>el.textContent)})()");
  assert.deepEqual(emptySections,[]);
  await evaluate("document.querySelector('#closeViewer').click()");
  await evaluate("openEditor('capture',state.entries.find(card=>card.id==='capture-a'))");
  await evaluate("document.querySelector('[data-convert=knowledge]').click()");
  const converted=await evaluate("(()=>({id:editingId,title:document.querySelector('#mainTitleInput').value,original:document.querySelector('#formFields .original-capture')?.textContent,open:document.querySelector('#formFields .original-capture')?.open}))()");
  assert.equal(converted.id,"capture-a");
  assert.ok(converted.original.includes("不可丢失的随手记原文"));
  assert.equal(converted.open,false);
  await evaluate("document.querySelector('#editorForm').requestSubmit()");
  await waitFor("state.entries.find(card=>card.id==='capture-a')?.type==='knowledge'");
  assert.equal(await evaluate("state.entries.find(card=>card.id==='capture-a').createdAt"),when);
  assert.equal(await evaluate("state.entries.find(card=>card.id==='source-a').assetId"),"asset-a");
  await evaluate("location.reload()");
  await waitFor("typeof state !== 'undefined' && state.entries.some(card=>card.title==='V2 project')");
  assert.equal(await evaluate("state.entries.find(card=>card.id==='capture-a').originalCapture.content"),"不可丢失的随手记原文");
  await waitFor("state.entries.some(card=>card.title==='V2 source')");
  let persisted;
  for(let i=0;i<80;i++){persisted=(await vault.loadLatestState()).state;if(["V2 project","V2 knowledge","V2 source"].every(title=>persisted.entries.some(card=>card.title===title)))break;await delay(100);}
  assert.ok(["V2 project","V2 knowledge","V2 source"].every(title=>persisted.entries.some(card=>card.title===title)));
  const manifest=JSON.parse(await readFile(path.join(vaultPath,"系统","cards-manifest.json"),"utf8"));
  assert.equal(Object.keys(manifest.cards).length,persisted.entries.length);
  console.log("Electron V2 实测：三种新建/编辑、状态默认值、待办、随手记原文、标题与重启恢复通过");
}catch(error){throw new Error(error.message+"; electron="+output.slice(-1000),{cause:error});}
finally{socket?.close();child.kill();await delay(400);await rm(root,{recursive:true,force:true}).catch(()=>{});}
