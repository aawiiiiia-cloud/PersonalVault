import assert from "node:assert/strict";

const port = Number(process.argv[2] || 9334);
const delay = ms => new Promise(resolve => setTimeout(resolve,ms));

let targets;
for (let attempt=0; attempt<50; attempt+=1) {
  try {
    targets=await fetch(`http://127.0.0.1:${port}/json`).then(response=>response.json());
    if (targets.some(target=>target.type==="page")) break;
  } catch {}
  await delay(200);
}
const target=targets?.find(item=>item.type==="page");
if (!target) throw new Error("没有找到 Electron 图谱测试页面");
const socket=new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{socket.addEventListener("open",resolve,{once:true});socket.addEventListener("error",reject,{once:true});});
let sequence=0;
const pending=new Map();
socket.addEventListener("message",event=>{
  const message=JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const task=pending.get(message.id); pending.delete(message.id);
  message.error ? task.reject(new Error(message.error.message)) : task.resolve(message.result);
});
function command(method,params={}) {
  const id=++sequence; socket.send(JSON.stringify({id,method,params}));
  return new Promise((resolve,reject)=>pending.set(id,{resolve,reject}));
}
async function evaluate(expression) {
  const response=await command("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true,userGesture:true});
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text || "页面执行失败");
  return response.result.value;
}
async function waitFor(expression,label) {
  for (let attempt=0; attempt<50; attempt+=1) {
    if (await evaluate(`Boolean(${expression})`)) return;
    await delay(100);
  }
  throw new Error(`等待超时：${label}`);
}

await command("Runtime.enable");
await command("Page.bringToFront");
await waitFor(`document.querySelector('[data-view="graph"]')`,`图谱入口`);
await waitFor(`document.body.classList.contains('desktop-shell')`,`桌面窗口外壳初始化`);
assert.deepEqual(await evaluate(`(()=>{const titlebar=document.querySelector('.desktop-titlebar');const bar=titlebar.getBoundingClientRect();const shell=document.querySelector('.app-shell').getBoundingClientRect();return {desktop:document.body.classList.contains('desktop-shell'),platform:window.workbenchDesktop?.platform,title:document.title,barHeight:bar.height,barBottom:bar.bottom,shellTop:shell.top,background:getComputedStyle(titlebar).backgroundColor}})()`),{
  desktop:true,platform:"win32",title:"个人知识工作台",barHeight:40,barBottom:40,shellTop:40,background:"rgb(246, 247, 250)"
});
assert.deepEqual(await evaluate(`window.workbenchDesktop.windowShellStatus()`),{
  platform:"win32",title:"个人知识工作台",applicationMenuPresent:false,menuBarVisible:false,
  closable:true,minimizable:true,maximizable:true,resizable:true,fullScreenable:true
});
await command("Emulation.setEmulatedMedia",{ features:[{ name:"prefers-color-scheme",value:"dark" }] });
assert.equal(await evaluate(`getComputedStyle(document.querySelector('.desktop-titlebar')).backgroundColor`),"rgb(246, 247, 250)");
await command("Emulation.setEmulatedMedia",{ features:[{ name:"prefers-color-scheme",value:"light" }] });
await command("Input.dispatchKeyEvent",{ type:"keyDown",key:"k",code:"KeyK",modifiers:2,windowsVirtualKeyCode:75,nativeVirtualKeyCode:75 });
await command("Input.dispatchKeyEvent",{ type:"keyUp",key:"k",code:"KeyK",modifiers:2,windowsVirtualKeyCode:75,nativeVirtualKeyCode:75 });
assert.equal(await evaluate(`document.activeElement===document.querySelector('#searchInput')`),true);
await evaluate(`(()=>{const input=document.createElement('textarea');input.id='shellShortcutProbe';document.body.append(input);input.focus();window.__shellShortcutEvents={copy:0,cut:0,paste:0};for(const type of ['copy','cut','paste']) input.addEventListener(type,event=>{event.preventDefault();window.__shellShortcutEvents[type]+=1})})()`);
await evaluate(`(()=>{const input=document.querySelector('#shellShortcutProbe');input.value='快捷键';input.focus();input.setSelectionRange(0,0)})()`);
await command("Input.dispatchKeyEvent",{ type:"keyDown",key:"a",code:"KeyA",modifiers:2,windowsVirtualKeyCode:65,nativeVirtualKeyCode:65 });
await command("Input.dispatchKeyEvent",{ type:"keyUp",key:"a",code:"KeyA",modifiers:2,windowsVirtualKeyCode:65,nativeVirtualKeyCode:65 });
assert.deepEqual(await evaluate(`(()=>{const input=document.querySelector('#shellShortcutProbe');return [input.selectionStart,input.selectionEnd]})()`),[0,3]);
for (const shortcut of [{ key:"c",code:"KeyC",virtual:67 },{ key:"x",code:"KeyX",virtual:88 },{ key:"v",code:"KeyV",virtual:86 }]) {
  await command("Input.dispatchKeyEvent",{ type:"keyDown",key:shortcut.key,code:shortcut.code,modifiers:2,windowsVirtualKeyCode:shortcut.virtual,nativeVirtualKeyCode:shortcut.virtual });
  await command("Input.dispatchKeyEvent",{ type:"keyUp",key:shortcut.key,code:shortcut.code,modifiers:2,windowsVirtualKeyCode:shortcut.virtual,nativeVirtualKeyCode:shortcut.virtual });
}
assert.deepEqual(await evaluate(`window.__shellShortcutEvents`),{ copy:1,cut:1,paste:1 });
await evaluate(`(()=>{const input=document.querySelector('#shellShortcutProbe');input.value='';input.focus()})()`);
await command("Input.insertText",{ text:"撤销重做" });
await command("Input.dispatchKeyEvent",{ type:"keyDown",key:"z",code:"KeyZ",modifiers:2,windowsVirtualKeyCode:90,nativeVirtualKeyCode:90 });
await command("Input.dispatchKeyEvent",{ type:"keyUp",key:"z",code:"KeyZ",modifiers:2,windowsVirtualKeyCode:90,nativeVirtualKeyCode:90 });
assert.equal(await evaluate(`document.querySelector('#shellShortcutProbe').value`),"");
await command("Input.dispatchKeyEvent",{ type:"keyDown",key:"Z",code:"KeyZ",modifiers:10,windowsVirtualKeyCode:90,nativeVirtualKeyCode:90 });
await command("Input.dispatchKeyEvent",{ type:"keyUp",key:"Z",code:"KeyZ",modifiers:10,windowsVirtualKeyCode:90,nativeVirtualKeyCode:90 });
assert.equal(await evaluate(`document.querySelector('#shellShortcutProbe').value`),"撤销重做");
await evaluate(`document.querySelector('#shellShortcutProbe').remove()`);
await evaluate(`window.__cardStateBefore=localStorage.getItem('zhixingtai-v1');document.querySelector('[data-view="graph"]').click()`);
await waitFor(`window.workbenchGraphController?.getState().entranceRunCount===1`,`图谱入场动画`);
await evaluate(`(()=>{document.querySelectorAll('#graphTypeFilters input').forEach(input=>input.checked=true);const area=document.querySelector('#graphAreaFilter');area.value='';area.dispatchEvent(new Event('change',{bubbles:true}))})()`);
await waitFor(`window.workbenchGraphController?.getState().nodeCount===4`,`四个图谱节点`);
assert.deepEqual(await evaluate(`({nodes:Number(document.querySelector('#graphNodeCount').textContent),edges:Number(document.querySelector('#graphEdgeCount').textContent)})`),{nodes:4,edges:3});
assert.equal(await evaluate(`window.innerWidth<=960 || document.documentElement.scrollHeight<=window.innerHeight+1`),true);
assert.equal(await evaluate(`window.innerWidth<=960 || document.querySelector('#graphCanvas').getBoundingClientRect().bottom<=window.innerHeight+1`),true);

await evaluate(`document.querySelector('#graphTypeFilters input[value="source"]').click()`);
await waitFor(`window.workbenchGraphController.getState().nodeCount===2`,`类型筛选`);
assert.deepEqual(await evaluate(`({nodes:Number(document.querySelector('#graphNodeCount').textContent),edges:Number(document.querySelector('#graphEdgeCount').textContent)})`),{nodes:2,edges:1});
await evaluate(`document.querySelector('#graphTypeFilters input[value="source"]').click()`);
await waitFor(`window.workbenchGraphController.getState().nodeCount===4`,`恢复类型筛选`);

await evaluate(`(()=>{const select=document.querySelector('#graphAreaFilter');select.value='area-a';select.dispatchEvent(new Event('change',{bubbles:true}))})()`);
await waitFor(`window.workbenchGraphController.getState().nodeCount===3`,`领域筛选`);
assert.equal(await evaluate(`document.querySelector('#graphAreaFilter option:checked').textContent`),"领域 A");
await evaluate(`(()=>{const select=document.querySelector('#graphAreaFilter');select.value='';select.dispatchEvent(new Event('change',{bubbles:true}))})()`);

await evaluate(`document.querySelector('#graphTitleSearch').value='核心知识';document.querySelector('#graphLocateNode').click()`);
await waitFor(`window.workbenchGraphController.getState().selectedId==='knowledge-a'`,`标题定位`);
assert.equal(await evaluate(`document.querySelector('#graphInspector h2').textContent`),"核心知识");
assert.equal(await evaluate(`document.querySelectorAll('#graphInspector [data-graph-focus]').length`),2);

const cameraBeforeViewer=await evaluate(`window.workbenchGraphController.getState().camera`);
const entranceRunsBeforeViewer=await evaluate(`window.workbenchGraphController.getState().entranceRunCount`);
await evaluate(`document.querySelector('#graphInspector [data-graph-open]').click()`);
await waitFor(`document.querySelector('#viewerDialog[open]')`,`阅读窗口`);
assert.equal(await evaluate(`document.querySelector('#viewerTitle').textContent`),"核心知识");
await evaluate(`document.querySelector('#closeViewer').click()`);
await waitFor(`!document.querySelector('#viewerDialog').open`,`关闭阅读窗口`);
assert.deepEqual(await evaluate(`window.workbenchGraphController.getState().camera`),cameraBeforeViewer);
assert.equal(await evaluate(`window.workbenchGraphController.getState().entranceRunCount`),entranceRunsBeforeViewer);
assert.equal(await evaluate(`document.querySelector('#graphView').classList.contains('active')`),true);

const rect=await evaluate(`(()=>{const r=document.querySelector('#graphCanvas').getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height}})()`);
const selectedScreen=await evaluate(`window.workbenchGraphController.getState().selectedScreen`);
const centerX=rect.left+selectedScreen.x, centerY=rect.top+selectedScreen.y;
const pointDiagnostics=await evaluate(`(()=>{const element=document.elementFromPoint(${centerX},${centerY});return {selectedScreen:window.workbenchGraphController.getState().selectedScreen,viewport:window.workbenchGraphController.getState().viewport,rect:(()=>{const r=document.querySelector('#graphCanvas').getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height}})(),element:element?.id||element?.className||element?.tagName}})()`);
await command("Input.dispatchMouseEvent",{type:"mouseMoved",x:centerX,y:centerY});
await delay(120);
const hoveredId=await evaluate(`window.workbenchGraphController.getState().hoveredId`);
assert.equal(hoveredId,"knowledge-a",`画布中心悬停节点错误；命中 ${hoveredId}；${JSON.stringify(pointDiagnostics)}`);
const pageVisible=await evaluate(`document.visibilityState==='visible'`);
if (pageVisible) assert.ok((await evaluate(`window.workbenchGraphController.getState().emphasisProgress`))>.2);
else assert.equal(await evaluate(`window.workbenchGraphController.getState().emphasisAnimating`),true);
await command("Input.dispatchMouseEvent",{type:"mouseMoved",x:rect.left+12,y:rect.top+12});
await delay(20);
assert.equal(await evaluate(`window.workbenchGraphController.getState().hoveredId`),null);
assert.equal(await evaluate(`window.workbenchGraphController.getState().emphasisAnimating`),true);
await delay(320);
if (pageVisible) assert.ok((await evaluate(`window.workbenchGraphController.getState().emphasisProgress`))<.002);
assert.equal(await evaluate(`window.workbenchGraphController.getState().selectedId`),"knowledge-a");
await command("Input.dispatchMouseEvent",{type:"mouseMoved",x:centerX,y:centerY});

await command("Input.dispatchMouseEvent",{type:"mousePressed",x:centerX,y:centerY,button:"left",buttons:1,clickCount:1});
await command("Input.dispatchMouseEvent",{type:"mouseMoved",x:centerX+55,y:centerY+35,button:"left",buttons:1});
await command("Input.dispatchMouseEvent",{type:"mouseReleased",x:centerX+55,y:centerY+35,button:"left",buttons:0,clickCount:1});
assert.equal(await evaluate(`Boolean(JSON.parse(localStorage.getItem('knowledge-workbench-graph-node-positions')||'{}')['knowledge-a'])`),true);

const panBefore=await evaluate(`window.workbenchGraphController.getState().camera`);
await command("Input.dispatchMouseEvent",{type:"mousePressed",x:rect.left+12,y:rect.top+12,button:"left",buttons:1,clickCount:1});
await command("Input.dispatchMouseEvent",{type:"mouseMoved",x:rect.left+52,y:rect.top+42,button:"left",buttons:1});
await command("Input.dispatchMouseEvent",{type:"mouseReleased",x:rect.left+52,y:rect.top+42,button:"left",buttons:0,clickCount:1});
const panAfter=await evaluate(`window.workbenchGraphController.getState().camera`);
assert.ok(panAfter.x!==panBefore.x || panAfter.y!==panBefore.y);
assert.equal(await evaluate(`window.workbenchGraphController.getState().inertiaActive`),true);

await command("Input.dispatchMouseEvent",{type:"mousePressed",x:rect.left+12,y:rect.top+12,button:"left",buttons:1,clickCount:1});
await command("Input.dispatchMouseEvent",{type:"mouseReleased",x:rect.left+12,y:rect.top+12,button:"left",buttons:0,clickCount:1});
assert.equal(await evaluate(`window.workbenchGraphController.getState().selectedId`),null);

const scaleBefore=await evaluate(`window.workbenchGraphController.getState().camera.scale`);
await command("Input.dispatchMouseEvent",{type:"mouseWheel",x:centerX,y:centerY,deltaX:0,deltaY:-240});
await delay(34);
const zoomDuring=await evaluate(`window.workbenchGraphController.getState()`);
assert.equal(zoomDuring.zoomAnimating,true);
assert.ok(zoomDuring.camera.scale>scaleBefore);
assert.ok(zoomDuring.zoomTarget.scale>zoomDuring.camera.scale);
await waitFor(`!window.workbenchGraphController.getState().zoomAnimating`,`滚轮缩放缓动结束`);
await evaluate(`document.querySelector('#graphResetView').click()`);
assert.equal(await evaluate(`document.querySelector('#graphSearchFeedback').textContent`),"已恢复默认视角。");

const entranceRunsBeforeReopen=await evaluate(`window.workbenchGraphController.getState().entranceRunCount`);
await evaluate(`document.querySelector('[data-view="home"]').click();document.querySelector('[data-view="graph"]').click()`);
await waitFor(`window.workbenchGraphController.getState().entranceRunCount===${entranceRunsBeforeReopen+1}`,`重新进入图谱时播放动画`);

assert.equal(await evaluate(`localStorage.getItem('zhixingtai-v1')===window.__cardStateBefore`),true);
assert.equal(await evaluate(`document.querySelector('#graphInspector [data-graph-open]')===null`),true);

socket.close();
console.log(JSON.stringify({ok:true,checks:["Windows桌面标题栏占位且内容不遮挡","默认应用菜单和窗口菜单栏均不存在","原生最小化/最大化及缩放边框可用","深色系统主题下标题栏保持冷白灰","Ctrl+K聚焦搜索","Ctrl+C/V/X/A/Z/Shift+Z输入快捷键路由","中心弹簧展开入场动画","重新进入图谱时重播","桌面图谱适配视口且页面无纵向滚动条","类型筛选","领域筛选","标题定位","悬停节点放大阴影及邻居渐变","节点拖动本机保存","画布拖动与惯性启动","空白点击恢复全图","滚轮缩放使用逐帧缓动并保持节点尺寸映射","查看卡片并保持视角且不重播","重置视角","卡片数据未修改"]},null,2));
