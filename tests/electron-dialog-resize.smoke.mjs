import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:net";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const require=createRequire(import.meta.url);
const electron=require("electron");
const execFileAsync=promisify(execFile);
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const root=await mkdtemp(path.join(tmpdir(),"workbench-dialog-resize-"));
const vaultPath=path.join(root,"PersonalVault");
const appData=path.join(root,"appdata");
const userData=path.join(root,"user-data");
const videoPath=path.join(root,"resize-test.mp4");
await mkdir(appData,{recursive:true});
await execFileAsync("ffmpeg",["-hide_banner","-loglevel","error","-f","lavfi","-i","color=c=blue:s=160x90:r=24","-f","lavfi","-i","sine=frequency=440:sample_rate=44100","-t","8","-c:v","libx264","-pix_fmt","yuv420p","-c:a","aac","-y",videoPath]);
process.env.PERSONAL_VAULT_PATH=vaultPath;
const vault=await import(`../server.mjs?resize-smoke=${Date.now()}`);
const asset=(await vault.importFiles([videoPath],"copy")).assets[0];
const timestamp="2026-09-25T00:00:00.000Z";
await vault.syncCards({ schemaVersion:1,cards:[
  { id:"resize-video",type:"source",title:"缩放视频资料",sourceKind:"视频",rawContent:"长文测试。".repeat(1600),assetId:asset.id,assetPath:asset.relativePath,assetCategory:asset.category,fileName:asset.displayName,fileExtension:asset.extension,fileSize:asset.size,createdAt:timestamp,updatedAt:timestamp },
  { id:"resize-project",type:"project",title:"编辑窗口测试项目",challenge:"编辑表单测试。".repeat(800),status:"active",createdAt:timestamp,updatedAt:timestamp }
] });
const port=await new Promise((resolve,reject)=>{
  const probe=createServer();probe.once("error",reject);
  probe.listen(0,"127.0.0.1",()=>{const address=probe.address();probe.close(()=>resolve(address.port));});
});
const child=spawn(electron,[`--remote-debugging-port=${port}`,`--user-data-dir=${userData}`,"--disable-gpu","--in-process-gpu","."],{
  cwd:path.resolve(import.meta.dirname,".."),env:{...process.env,PERSONAL_VAULT_PATH:vaultPath,APPDATA:appData,LOCALAPPDATA:appData},stdio:["ignore","pipe","pipe"],windowsHide:true
});
let childOutput="";
child.stdout.on("data",chunk=>{childOutput+=chunk.toString();});
child.stderr.on("data",chunk=>{childOutput+=chunk.toString();});
let socket;
try {
  let target;
  for(let attempt=0;attempt<100;attempt++){
    try {target=(await fetch(`http://127.0.0.1:${port}/json`).then(response=>response.json())).find(item=>item.type==="page"&&item.url?.includes("index.html"));} catch {}
    if(target) break;
    await delay(100);
  }
  if(!target) throw new Error("Electron 测试窗口未启动");
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.addEventListener("open",resolve,{once:true});socket.addEventListener("error",reject,{once:true});});
  let sequence=0;
  const pending=new Map();
  socket.addEventListener("message",event=>{
    const message=JSON.parse(event.data), task=pending.get(message.id);
    if(!task) return;
    pending.delete(message.id);
    message.error ? task.reject(new Error(message.error.message)) : task.resolve(message.result);
  });
  socket.addEventListener("close",()=>{for(const task of pending.values()) task.reject(new Error("调试连接关闭"));pending.clear();});
  async function command(method,params={}){
    const id=++sequence;
    socket.send(JSON.stringify({id,method,params}));
    return Promise.race([new Promise((resolve,reject)=>pending.set(id,{resolve,reject})),delay(8000).then(()=>{pending.delete(id);throw new Error(`${method} 超时`);})]);
  }
  async function evaluate(expression){
    const result=await command("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true,userGesture:true});
    if(result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  }
  async function waitFor(expression,label){
    for(let attempt=0;attempt<80;attempt++){if(await evaluate(`Boolean(${expression})`)) return;await delay(100);}
    throw new Error(`等待超时：${label}`);
  }
  async function box(selector){
    return evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height,right:r.right,bottom:r.bottom}})()`);
  }
  async function dragHandle(dialogId,direction,dx,dy){
    const selector=`#${dialogId} [data-resize-direction="${direction}"]`;
    const r=await box(selector),x=r.left+r.width/2,y=r.top+r.height/2;
    await command("Input.dispatchMouseEvent",{type:"mouseMoved",x,y});
    await command("Input.dispatchMouseEvent",{type:"mousePressed",x,y,button:"left",buttons:1,clickCount:1});
    await command("Input.dispatchMouseEvent",{type:"mouseMoved",x:x+dx,y:y+dy,button:"left",buttons:1});
    await command("Input.dispatchMouseEvent",{type:"mouseReleased",x:x+dx,y:y+dy,button:"left",buttons:0,clickCount:1});
    await delay(30);
  }
  await waitFor(`typeof state !== 'undefined' && state.entries.some(entry=>entry.id==='resize-video')`,"隔离知识库加载");
  await evaluate(`openViewer(state.entries.find(entry=>entry.id==='resize-video'))`);
  await waitFor(`document.querySelector('#viewerDialog video')`,"视频预览");
  await evaluate(`(async()=>{window.__resizeVideo=document.querySelector('#viewerDialog video');window.__resizeVideo.muted=true;await window.__resizeVideo.play();return true})()`);
  assert.equal(await evaluate(`window.__resizeVideo.paused`),false);
  const initial=await box("#viewerDialog");
  const cursors=await evaluate(`Object.fromEntries([...document.querySelectorAll('#viewerDialog [data-resize-direction]')].map(handle=>[handle.dataset.resizeDirection,getComputedStyle(handle).cursor]))`);
  assert.deepEqual(cursors,{n:"ns-resize",s:"ns-resize",w:"ew-resize",e:"ew-resize",nw:"nwse-resize",ne:"nesw-resize",sw:"nesw-resize",se:"nwse-resize"});
  for(const direction of ["n","s","w","e","nw","ne","sw","se"]){
    await evaluate(`document.querySelector('[data-reset-dialog-size="viewer"]').click()`);
    const before=await box("#viewerDialog");
    await dragHandle("viewerDialog",direction,20,20);
    const after=await box("#viewerDialog");
    assert.ok(direction.includes("w") ? after.left>before.left : Math.abs(after.left-before.left)<2,`${direction} left`);
    assert.ok(direction.includes("n") ? after.top>before.top : Math.abs(after.top-before.top)<2,`${direction} top`);
    assert.ok(direction.includes("w") ? after.width<before.width : direction.includes("e") ? after.width>before.width : Math.abs(after.width-before.width)<2,`${direction} width`);
    assert.ok(direction.includes("n") ? after.height<before.height : direction.includes("s") ? after.height>before.height : Math.abs(after.height-before.height)<2,`${direction} height`);
    assert.equal(await evaluate(`document.querySelector('#viewerDialog video')===window.__resizeVideo && !window.__resizeVideo.paused`),true,`${direction} 缩放不应重建或暂停视频`);
  }
  assert.ok((await box("#viewerDialog")).width!==initial.width || (await box("#viewerDialog")).height!==initial.height);
  const savedViewer=await evaluate(`WorkbenchDialogResize.readSize('viewer',localStorage)`);
  assert.ok(savedViewer.width>0 && savedViewer.height>0);

  await evaluate(`document.querySelector('[data-reset-dialog-size="viewer"]').click()`);
  const dragBefore=await box("#viewerDialog"), head=await box("#viewerDialog .dialog-head");
  const dragX=head.left+170,dragY=head.top+Math.min(40,head.height/2);
  await command("Input.dispatchMouseEvent",{type:"mouseMoved",x:dragX,y:dragY});
  await command("Input.dispatchMouseEvent",{type:"mousePressed",x:dragX,y:dragY,button:"left",buttons:1,clickCount:1});
  await command("Input.dispatchMouseEvent",{type:"mouseMoved",x:dragX+24,y:dragY-14,button:"left",buttons:1});
  await command("Input.dispatchMouseEvent",{type:"mouseReleased",x:dragX+24,y:dragY-14,button:"left",buttons:0,clickCount:1});
  const dragAfter=await box("#viewerDialog");
  assert.ok(dragAfter.left>dragBefore.left+10 && dragAfter.top<dragBefore.top-5,"标题栏拖动应移动窗口但不改变尺寸");
  assert.ok(Math.abs(dragAfter.width-dragBefore.width)<2 && Math.abs(dragAfter.height-dragBefore.height)<2);
  await dragHandle("viewerDialog","w",22,0);
  const reopenedSize=await evaluate(`WorkbenchDialogResize.readSize('viewer',localStorage)`);

  const headerBefore=await box("#viewerDialog .dialog-head"), relationsBefore=await box("#viewerMainRelations");
  await evaluate(`document.querySelector('#viewerBody').scrollTop=500`);
  assert.ok(await evaluate(`document.querySelector('#viewerBody').scrollTop>0`));
  assert.equal((await box("#viewerDialog .dialog-head")).top,headerBefore.top);
  assert.equal((await box("#viewerMainRelations")).top,relationsBefore.top);
  assert.equal(await evaluate(`document.scrollingElement.scrollTop`),0);
  await command("Input.dispatchMouseEvent",{type:"mouseWheel",x:5,y:600,deltaX:0,deltaY:300});
  assert.equal(await evaluate(`document.scrollingElement.scrollTop`),0);

  await evaluate(`document.querySelector('#closeViewer').click()`);
  assert.equal(await evaluate(`window.__resizeVideo.paused && window.__resizeVideo.currentTime===0 && !window.__resizeVideo.getAttribute('src') && !window.__resizeVideo.querySelector('source')?.getAttribute('src')`),true);
  await evaluate(`openViewer(state.entries.find(entry=>entry.id==='resize-video'))`);
  await waitFor(`document.querySelector('#viewerDialog video')`,"重新打开视频");
  try { await waitFor(`document.querySelector('#viewerDialog video')?.readyState>=2`,"重新打开的视频可播放"); }
  catch (error) { throw new Error(`${error.message}: ${JSON.stringify(await evaluate(`(()=>{const v=document.querySelector('#viewerDialog video');return {src:v?.currentSrc,source:v?.querySelector('source')?.getAttribute('src'),ready:v?.readyState,network:v?.networkState,error:v?.error?.code}})()`))}`); }
  assert.equal(await evaluate(`document.querySelectorAll('#viewerDialog video').length`),1);
  assert.equal(await evaluate(`(async()=>{const video=document.querySelector('#viewerDialog video');video.muted=true;await video.play();return !video.paused})()`),true);
  assert.ok(Math.abs((await box("#viewerDialog")).width-reopenedSize.width)<2);
  await evaluate(`document.querySelector('[data-reset-dialog-size="viewer"]').click()`);
  assert.equal(await evaluate(`WorkbenchDialogResize.readSize('viewer',localStorage)`),null);
  await evaluate(`document.querySelector('#closeViewer').click()`);

  await evaluate(`openEditor('project',state.entries.find(entry=>entry.id==='resize-project'))`);
  await dragHandle("editorDialog","se",-40,-40);
  const savedEditor=await evaluate(`WorkbenchDialogResize.readSize('viewer',localStorage)`);
  assert.ok(savedEditor.width>=520 && savedEditor.height>=360);
  assert.equal(await evaluate(`WorkbenchDialogResize.readSize('editor',localStorage)`),null);
  await evaluate(`document.querySelector('#closeDialog').click()`);
  await evaluate(`openEditor('project',state.entries.find(entry=>entry.id==='resize-project'))`);
  assert.ok(Math.abs((await box("#editorDialog")).width-savedEditor.width)<2);
  await command("Emulation.setDeviceMetricsOverride",{width:800,height:540,deviceScaleFactor:1,mobile:false});
  await waitFor(`window.innerWidth===800`,"桌面视口缩小");
  await evaluate(`window.dispatchEvent(new Event('resize'))`);
  await waitFor(`(()=>{const r=document.querySelector('#editorDialog').getBoundingClientRect(),b=cardDialogBounds();return r.left>=b.left-1&&r.right<=b.right+1&&r.top>=b.top-1&&r.bottom<=b.bottom+1})()`,"桌面视口边界收缩");
  const fittedDesktop=await box("#editorDialog");
  assert.ok(fittedDesktop.left>=11 && fittedDesktop.right<=789 && fittedDesktop.top>=51 && fittedDesktop.bottom<=529);
  assert.equal(await evaluate(`WorkbenchDialogResize.readSize('viewer',localStorage).width`),savedEditor.width,"视口收缩不能覆盖保存的尺寸");

  await command("Emulation.setDeviceMetricsOverride",{width:700,height:600,deviceScaleFactor:1,mobile:false});
  await waitFor(`document.querySelector('#editorDialog').classList.contains('card-dialog--narrow')`,"窄窗口响应式布局");
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('#editorDialog [data-resize-direction="se"]')).display`),"none");
  const narrow=await box("#editorDialog");
  assert.ok(narrow.left>=0 && narrow.right<=701 && narrow.top>=0 && narrow.bottom<=601);
  assert.ok(await evaluate(`document.querySelector('#editorDialog .main-content-input')?.getBoundingClientRect().width>0`));
  assert.equal(await evaluate(`WorkbenchDialogResize.readSize('viewer',localStorage).width`),savedEditor.width);
  await command("Emulation.clearDeviceMetricsOverride");
  await waitFor(`!document.querySelector('#editorDialog').classList.contains('card-dialog--narrow')`,"桌面尺寸恢复");
  assert.ok(Math.abs((await box("#editorDialog")).width-savedEditor.width)<2);
  await evaluate(`document.querySelector('[data-reset-dialog-size="editor"]').click()`);
  assert.equal(await evaluate(`WorkbenchDialogResize.readSize('viewer',localStorage)`),null);
  await evaluate(`document.querySelector('#closeDialog').click()`);
  console.log("Electron 实测：八方向缩放、尺寸记忆与恢复、窄窗、固定布局、视频播放和关闭清理通过");
} catch(error){
  throw new Error(`${error.message}; electron=${childOutput.slice(-800)}`,{cause:error});
} finally {
  socket?.close();child.kill();await delay(400);
  await rm(root,{recursive:true,force:true}).catch(()=>{});
}
