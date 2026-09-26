import assert from "node:assert/strict";

const port=Number(process.argv[2]||9336);
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let targets;
for(let attempt=0;attempt<60;attempt+=1){
  try{
    targets=await fetch(`http://127.0.0.1:${port}/json`).then(response=>response.json());
    if(targets.some(target=>target.type==="page")) break;
  }catch{}
  await delay(200);
}
const target=targets?.find(item=>item.type==="page");
if(!target) throw new Error("没有找到 Electron 启动测试页面");
const socket=new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{socket.addEventListener("open",resolve,{once:true});socket.addEventListener("error",reject,{once:true});});
let sequence=0;
const pending=new Map();
socket.addEventListener("message",event=>{
  const message=JSON.parse(event.data);
  if(!message.id||!pending.has(message.id)) return;
  const task=pending.get(message.id);pending.delete(message.id);
  message.error?task.reject(new Error(message.error.message)):task.resolve(message.result);
});
function command(method,params={}){
  const id=++sequence;socket.send(JSON.stringify({id,method,params}));
  return new Promise((resolve,reject)=>pending.set(id,{resolve,reject}));
}
async function evaluate(expression){
  const response=await command("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true,userGesture:true});
  if(response.exceptionDetails) throw new Error(response.exceptionDetails.text||"页面执行失败");
  return response.result.value;
}
async function waitFor(expression,label){
  for(let attempt=0;attempt<60;attempt+=1){
    if(await evaluate(`Boolean(${expression})`)) return;
    await delay(100);
  }
  throw new Error(`等待超时：${label}`);
}

await command("Runtime.enable");
await waitFor(`document.body.classList.contains('desktop-shell')`,`桌面外壳`);
await delay(10000);

const before=await evaluate(`(()=>{const bar=document.querySelector('.desktop-titlebar').getBoundingClientRect();const side=document.querySelector('.sidebar').getBoundingClientRect();const main=document.querySelector('main');return {bodyScroll:document.scrollingElement.scrollTop,barTop:bar.top,sideTop:side.top,sideBottom:side.bottom,mainTop:main.getBoundingClientRect().top,mainHeight:main.clientHeight,mainScrollHeight:main.scrollHeight}})()`);
assert.equal(before.bodyScroll,0);
assert.equal(before.barTop,0);
assert.equal(before.sideTop,40);
assert.ok(before.mainScrollHeight>before.mainHeight,"测试页面应具备可滚动正文");

await evaluate(`document.querySelector('main').scrollTop=500`);
await delay(100);
const after=await evaluate(`(()=>{const bar=document.querySelector('.desktop-titlebar').getBoundingClientRect();const side=document.querySelector('.sidebar').getBoundingClientRect();const main=document.querySelector('main');return {bodyScroll:document.scrollingElement.scrollTop,barTop:bar.top,sideTop:side.top,sideBottom:side.bottom,mainScroll:main.scrollTop}})()`);
assert.equal(after.bodyScroll,0,"桌面页面本身不得滚动");
assert.equal(after.barTop,before.barTop,"标题栏必须保持固定");
assert.equal(after.sideTop,before.sideTop,"侧栏必须保持固定");
assert.equal(after.sideBottom,before.sideBottom,"侧栏底部不得被正文滚动带走");
assert.ok(after.mainScroll>0,"只有右侧正文区域滚动");

await evaluate(`(()=>{const input=document.querySelector('#searchInput');input.value='核心知识';input.dispatchEvent(new Event('input',{bubbles:true}))})()`);
await waitFor(`document.querySelector('#searchEngineBadge').textContent.includes('SQLite 精确检索')`,`精确检索完成`);
assert.equal(await evaluate(`document.querySelector('#searchModeFilter').value`),"exact");

socket.close();
console.log(JSON.stringify({ok:true,checks:["启动10秒保持稳定","页面本身不滚动","标题栏固定","侧栏固定","右侧正文独立滚动","精确检索立即可用"]},null,2));
