import assert from "node:assert/strict";
import fs from "node:fs";

const port = Number(process.argv[2] || 9333);
const videoCardId = "smoke-video";
const audioCardId = "smoke-audio";
const projectCardId = "smoke-project";
const mediaFilePath = process.argv[3] || "";

async function delay(ms) { return new Promise(resolve => setTimeout(resolve,ms)); }

let targets;
for (let attempt = 0; attempt < 50; attempt += 1) {
  try {
    targets = await fetch(`http://127.0.0.1:${port}/json`).then(response => response.json());
    if (targets.some(target => target.type === "page")) break;
  } catch {}
  await delay(200);
}
const target = targets?.find(item => item.type === "page");
if (!target) throw new Error("没有找到 Electron 渲染页面");

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve,reject) => {
  socket.addEventListener("open",resolve,{ once:true });
  socket.addEventListener("error",reject,{ once:true });
});
let sequence = 0;
const pending = new Map();
socket.addEventListener("message",event => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve,reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message));
  else resolve(message.result);
});

function command(method,params={}) {
  const id = ++sequence;
  socket.send(JSON.stringify({ id,method,params }));
  return new Promise((resolve,reject) => pending.set(id,{ resolve,reject }));
}

async function evaluate(expression) {
  const result = await command("Runtime.evaluate",{ expression,awaitPromise:true,returnByValue:true,userGesture:true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "页面脚本执行失败");
  return result.result.value;
}

async function waitFor(expression,label) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (await evaluate(`Boolean(${expression})`)) return;
    await delay(100);
  }
  throw new Error(`等待超时：${label}`);
}

async function switchView(view) {
  await evaluate(`document.querySelector('[data-view="${view}"]').click()`);
  await delay(80);
}

async function openCard(view,id,mediaSelector) {
  await switchView(view);
  await evaluate(`document.querySelector('[data-edit="${id}"]').click()`);
  await waitFor(`document.querySelector('#viewerDialog[open] ${mediaSelector}')`,`${id} 媒体出现`);
}

async function startMedia(selector) {
  const started = await evaluate(`(async()=>{window.__testedMedia=document.querySelector('#viewerDialog ${selector}');window.__testedMedia.muted=true;await window.__testedMedia.play();window.__testedMedia.currentTime=Math.min(0.2,window.__testedMedia.duration||0.2);return !window.__testedMedia.paused})()`);
  assert.equal(started,true);
}

async function releasedMedia() {
  await delay(80);
  return evaluate(`({paused:window.__testedMedia.paused,currentTime:window.__testedMedia.currentTime,src:window.__testedMedia.getAttribute('src'),sourceSrc:window.__testedMedia.querySelector('source')?.getAttribute('src')||null})`);
}

function assertReleased(result,label) {
  assert.equal(result.paused,true,`${label} 应暂停`);
  assert.equal(result.currentTime,0,`${label} 应归零`);
  assert.equal(result.src,null,`${label} 应移除媒体 src`);
  assert.equal(result.sourceSrc,null,`${label} 应移除 source src`);
}

const checks = [];
await command("Runtime.enable");

await openCard("sources",videoCardId,"video");
await startMedia("video");
await evaluate(`document.querySelector('#closeViewer').click()`);
assertReleased(await releasedMedia(),"右上角关闭");
checks.push("右上角关闭");

await openCard("sources",videoCardId,"video");
await startMedia("video");
await evaluate(`document.querySelector('#closeViewerBottom').click()`);
assertReleased(await releasedMedia(),"底部关闭");
checks.push("底部关闭");

await openCard("sources",videoCardId,"video");
await startMedia("video");
await command("Input.dispatchKeyEvent",{ type:"keyDown",key:"Escape",code:"Escape",windowsVirtualKeyCode:27,nativeVirtualKeyCode:27 });
await command("Input.dispatchKeyEvent",{ type:"keyUp",key:"Escape",code:"Escape",windowsVirtualKeyCode:27,nativeVirtualKeyCode:27 });
assertReleased(await releasedMedia(),"Esc 关闭");
checks.push("Esc 关闭");

await openCard("sources",videoCardId,"video");
await startMedia("video");
await evaluate(`document.querySelector('#editViewedEntry').click()`);
await waitFor(`document.querySelector('#editorDialog[open]')`,`编辑窗口打开`);
assertReleased(await releasedMedia(),"进入编辑");
await evaluate(`document.querySelector('#closeDialog').click()`);
checks.push("进入编辑");

await openCard("sources",videoCardId,"video");
await startMedia("video");
await evaluate(`document.querySelector('#viewerDialog [data-open-ref="${audioCardId}"]').click()`);
await waitFor(`document.querySelector('#viewerDialog[open] audio')`,`关联音频打开`);
assertReleased(await releasedMedia(),"切换关联卡片");
checks.push("切换关联卡片");

await startMedia("audio");
await evaluate(`document.querySelector('#closeViewer').click()`);
assertReleased(await releasedMedia(),"音频关闭");
checks.push("音频关闭");

await openCard("projects",projectCardId,"video");
await startMedia("video");
await evaluate(`document.querySelector('#startProjectReview').click()`);
await waitFor(`document.querySelector('#editorDialog[open]')`,`复盘编辑窗口打开`);
assertReleased(await releasedMedia(),"写项目复盘");
await evaluate(`document.querySelector('#closeDialog').click()`);
checks.push("写项目复盘");

await openCard("sources",videoCardId,"video");
await startMedia("video");
await evaluate(`document.querySelector('#viewerDialog').close()`);
assertReleased(await releasedMedia(),"程序直接关闭 dialog");
checks.push("程序直接关闭 dialog");

await openCard("sources",videoCardId,"video");
await startMedia("video");
const instanceCount = await evaluate(`document.querySelectorAll('#viewerDialog video').length`);
assert.equal(instanceCount,1);
await evaluate(`document.querySelector('#closeViewer').click()`);
assertReleased(await releasedMedia(),"重复打开关闭");
checks.push("重复打开关闭并重新播放");

if (mediaFilePath) {
  const renamedPath = `${mediaFilePath}.handle-check`;
  fs.renameSync(mediaFilePath,renamedPath);
  fs.renameSync(renamedPath,mediaFilePath);
  checks.push("关闭后本地媒体文件可立即重命名");
}

socket.close();
console.log(JSON.stringify({ ok:true,checks },null,2));
