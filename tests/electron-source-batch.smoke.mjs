import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";

const port=Number(process.argv[2] || 9335);
const fixture=JSON.parse(await fs.readFile(process.argv[3],"utf8"));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function syncLogCount() {
  try {
    const text=await fs.readFile(path.join(fixture.vaultPath,"系统","日志","sync-events.jsonl"),"utf8");
    return text.split(/\r?\n/).filter(line=>line.trim() && JSON.parse(line).action === "sync-complete").length;
  } catch { return 0; }
}

let targets;
for (let attempt=0;attempt<50;attempt+=1) {
  try { targets=await fetch(`http://127.0.0.1:${port}/json`).then(response=>response.json()); if (targets.some(target=>target.type === "page")) break; } catch {}
  await delay(200);
}
const target=targets?.find(item=>item.type === "page");
if (!target) throw new Error("没有找到 Electron 批量整理测试页面");
const socket=new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{socket.addEventListener("open",resolve,{ once:true });socket.addEventListener("error",reject,{ once:true });});
let sequence=0;
const pending=new Map();
socket.addEventListener("message",event=>{
  const message=JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const task=pending.get(message.id);pending.delete(message.id);
  message.error ? task.reject(new Error(message.error.message)) : task.resolve(message.result);
});
function command(method,params={}) { const id=++sequence;socket.send(JSON.stringify({ id,method,params }));return new Promise((resolve,reject)=>pending.set(id,{ resolve,reject })); }
async function evaluate(expression) {
  const response=await command("Runtime.evaluate",{ expression,awaitPromise:true,returnByValue:true,userGesture:true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text || "页面执行失败");
  return response.result.value;
}
async function waitFor(expression,label) {
  for (let attempt=0;attempt<80;attempt+=1) { if (await evaluate(`Boolean(${expression})`)) return;await delay(100); }
  throw new Error(`等待超时：${label}`);
}
async function click(selector) { await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); }
async function changeSelect(selector,value) { await evaluate(`(()=>{const select=document.querySelector(${JSON.stringify(selector)});select.value=${JSON.stringify(value)};select.dispatchEvent(new Event('change',{bubbles:true}))})()`); }
async function expectOneSync(before,label) {
  for (let attempt=0;attempt<50;attempt+=1) { const count=await syncLogCount();if (count>before) { assert.equal(count-before,1,label);return; }await delay(100); }
  throw new Error(`等待同步超时：${label}`);
}
const stateExpression=`JSON.parse(localStorage.getItem('zhixingtai-v1'))`;

await command("Runtime.enable");
await command("Page.bringToFront");
await waitFor(`${stateExpression}.entries.some(entry=>entry.id==='source-a')`,`桌面状态载入`);
await evaluate(`window.__confirmMessages=[];window.confirm=message=>{window.__confirmMessages.push(message);return true}`);

await click('[data-view="projects"]');
assert.equal(await evaluate(`document.querySelector('#collectionAreaFilterWrap').classList.contains('hidden')`),false);
await changeSelect('#collectionAreaFilter','area-b');
assert.equal(await evaluate(`document.querySelector('#collectionStats .stat b').textContent`),"0");
assert.equal(await evaluate(`document.querySelector('#emptyState b').textContent`),"当前领域条件下没有内容");
await changeSelect('#collectionAreaFilter','area-c');
assert.deepEqual(await evaluate(`[...document.querySelectorAll('#collectionList [data-edit]')].map(node=>node.dataset.edit)`),["project-c"]);
await changeSelect('#collectionAreaFilter','unassigned');
assert.deepEqual(await evaluate(`[...document.querySelectorAll('#collectionList [data-edit]')].map(node=>node.dataset.edit)`),["project-free"]);

await click('[data-view="knowledge"]');
assert.equal(await evaluate(`document.querySelector('#collectionAreaFilter').value`),"all","不同内容页默认使用全部领域");
await changeSelect('#collectionAreaFilter','area-c');
assert.deepEqual(await evaluate(`[...document.querySelectorAll('#collectionList [data-edit]')].map(node=>node.dataset.edit)`),["knowledge-c"]);
await changeSelect('#collectionAreaFilter','unassigned');
assert.deepEqual(await evaluate(`[...document.querySelectorAll('#collectionList [data-edit]')].map(node=>node.dataset.edit)`),["knowledge-free"]);

await click('[data-view="sources"]');
assert.equal(await evaluate(`document.querySelector('#collectionAreaFilter').value`),"all");
assert.match(await evaluate(`document.querySelector('[data-edit="source-c"] .source-card-facts').textContent`),/已处理.*领域 A.*领域 B.*\+1/);
assert.match(await evaluate(`document.querySelector('[data-edit="source-d"] .source-card-facts').textContent`),/未读.*未归属/);
await click('#sourceBatchToggle');
assert.equal(await evaluate(`document.querySelector('#sourceBatchSelectVisible').textContent`),"全选当前显示的 4 份资料");
assert.equal(await evaluate(`document.querySelector('#sourceBatchAddAreas').textContent`),"添加到所选资料");
assert.equal(await evaluate(`document.querySelector('#sourceBatchRemoveAreas').textContent`),"从所选资料移除");
assert.equal(await evaluate(`document.querySelector('#sourceBatchReadingStatus').parentElement.tagName`),"SECTION","下拉菜单不能与按钮嵌套在 label 中");
assert.equal(await evaluate(`document.querySelector('#collectionList').classList.contains('asset-gallery')`),true);
await click('[data-source-batch-select="source-a"]');
await click('[data-source-batch-select="source-b"]');
assert.equal(await evaluate(`Number(document.querySelector('#sourceBatchCount').textContent)`),2);

await click('[data-source-display="list"]');
assert.deepEqual(await evaluate(`[...document.querySelectorAll('[data-source-batch-select][aria-pressed="true"]')].map(node=>node.dataset.sourceBatchSelect).sort()`),["source-a","source-b"]);
await click('[data-source-display="gallery"]');
assert.equal(await evaluate(`Number(document.querySelector('#sourceBatchCount').textContent)`),2);

await changeSelect('#collectionAreaFilter','area-a');
assert.equal(await evaluate(`Number(document.querySelector('#sourceBatchCount').textContent)`),1,"领域筛选后隐藏选择必须清除");
assert.deepEqual(await evaluate(`[...document.querySelectorAll('[data-source-batch-select]')].map(node=>node.dataset.sourceBatchSelect).sort()`),["source-a","source-c"]);
await changeSelect('#collectionAreaFilter','all');
await click('[data-source-batch-select="source-b"]');
assert.equal(await evaluate(`Number(document.querySelector('#sourceBatchCount').textContent)`),2);

await click('[data-filter="unread"]');
assert.equal(await evaluate(`Number(document.querySelector('#sourceBatchCount').textContent)`),1,"筛选变化后隐藏选择必须清除");
assert.equal(await evaluate(`document.querySelector('#sourceBatchSelectVisible').textContent`),"全选当前显示的 2 份资料");
await click('#sourceBatchSelectVisible');
assert.deepEqual(await evaluate(`[...document.querySelectorAll('[data-source-batch-select][aria-pressed="true"]')].map(node=>node.dataset.sourceBatchSelect).sort()`),["source-a","source-d"]);
await click('[data-filter="all"]');

await click('#sourceBatchAreaChoices input[value="area-b"]');
let before=await syncLogCount();
await click('#sourceBatchAddAreas');
await waitFor(`document.querySelector('#sourceBatchFeedback').textContent.includes('操作完成')`,`添加领域`);
await expectOneSync(before,"添加领域只能同步一次");
let sourceState=await evaluate(`(()=>{const state=${stateExpression};return state.entries.filter(entry=>['source-a','source-d'].includes(entry.id)).map(entry=>({id:entry.id,areas:entry.areaRefs}))})()`);
assert.deepEqual(sourceState,[{ id:"source-a",areas:["area-a","area-b"] },{ id:"source-d",areas:["area-b"] }]);
assert.deepEqual(await evaluate(`WorkbenchGraphData.filterGraph(WorkbenchGraphData.buildGraph(${stateExpression}),{areaId:'area-b'}).nodes.map(node=>node.id).sort()`),["source-a","source-b","source-c","source-d"]);

await evaluate(`document.querySelectorAll('#sourceBatchAreaChoices input').forEach(input=>input.checked=input.value==='area-a')`);
before=await syncLogCount();
await click('#sourceBatchRemoveAreas');
await waitFor(`window.__confirmMessages.some(message=>message.includes('1 份资料'))`,`移除领域影响数量确认`);
await waitFor(`document.querySelector('#sourceBatchFeedback').textContent.includes('操作完成')`,`移除领域`);
await expectOneSync(before,"移除领域只能同步一次");
sourceState=await evaluate(`(()=>{const state=${stateExpression};return state.entries.filter(entry=>['source-a','source-d'].includes(entry.id)).map(entry=>({id:entry.id,areas:entry.areaRefs}))})()`);
assert.deepEqual(sourceState,[{ id:"source-a",areas:["area-b"] },{ id:"source-d",areas:["area-b"] }]);

await changeSelect('#sourceBatchReadingStatus','processed');
assert.equal(await evaluate(`(${stateExpression}).entries.find(entry=>entry.id==='source-a').readingStatus`),"unread","选择下拉值本身不能修改资料");
before=await syncLogCount();
await click('#sourceBatchSetReadingStatus');
await waitFor(`(${stateExpression}).entries.filter(entry=>['source-a','source-d'].includes(entry.id)).every(entry=>entry.readingStatus==='processed')`,`阅读状态批量更新`);
await expectOneSync(before,"阅读状态只能同步一次");
assert.equal(await evaluate(`document.querySelector('#sourceBatchReadingStatus').disabled`),false);

await changeSelect('#sourceBatchReadingStatus','reading');
before=await syncLogCount();
await click('#sourceBatchSetReadingStatus');
await waitFor(`(${stateExpression}).entries.filter(entry=>['source-a','source-d'].includes(entry.id)).every(entry=>entry.readingStatus==='reading')`,`连续第二次阅读状态更新`);
await expectOneSync(before,"连续阅读状态操作仍只同步一次");
await click('[data-source-display="list"]');
assert.equal(await evaluate(`document.querySelector('#sourceBatchReadingStatus').disabled`),false,"切换列表后下拉菜单必须可用");
await click('[data-source-display="gallery"]');
await changeSelect('#sourceBatchReadingStatus','processed');
before=await syncLogCount();
await click('#sourceBatchSetReadingStatus');
await waitFor(`(${stateExpression}).entries.filter(entry=>['source-a','source-d'].includes(entry.id)).every(entry=>entry.readingStatus==='processed')`,`切换视图后的阅读状态更新`);
await expectOneSync(before,"切换视图后的状态操作仍只同步一次");

await click('[data-view="home"]');
assert.equal(await evaluate(`document.querySelector('#sourceBatchBar').classList.contains('hidden')`),true);
await click('[data-view="sources"]');
await click('#sourceBatchToggle');
assert.equal(await evaluate(`Number(document.querySelector('#sourceBatchCount').textContent)`),0,"离开资料页后选择必须清空");
await click('#sourceBatchExit');

await evaluate(`openAssetImportDialog()`);
before=await syncLogCount();
const importResult=await evaluate(`completeAssetImport({assets:${JSON.stringify([fixture.orphanAsset,fixture.existingAsset])},skipped:[]})`);
assert.equal(importResult.createdIds.length,1);
assert.equal(importResult.reused,1);
await expectOneSync(before,"导入建卡只能同步一次");
assert.match(await evaluate(`document.querySelector('[data-organize-imported]').textContent`),/整理刚刚导入的 1 份资料/);
await click('[data-organize-imported]');
const importedId=importResult.createdIds[0];
assert.equal(await evaluate(`Number(document.querySelector('#sourceBatchCount').textContent)`),1);
assert.deepEqual(await evaluate(`[...document.querySelectorAll('[data-source-batch-select][aria-pressed="true"]')].map(node=>node.dataset.sourceBatchSelect)`),[importedId]);
assert.equal(await evaluate(`document.querySelector('[data-source-batch-select="source-a"]').getAttribute('aria-pressed')`),"false","复用旧资产不得选中旧卡片");

await click('[data-source-display="list"]');
assert.equal(await evaluate(`document.querySelector('[data-source-batch-select="${importedId}"]').getAttribute('aria-pressed')`),"true");
await click('[data-source-batch-select="source-a"]');
before=await syncLogCount();
await click('#sourceBatchTrash');
await waitFor(`window.__confirmMessages.some(message=>message.includes('2 份资料移到回收站'))`,`回收站数量确认`);
await waitFor(`(${stateExpression}).entries.filter(entry=>[${JSON.stringify(importedId)},'source-a'].includes(entry.id)).every(entry=>Boolean(entry.deletedAt))`,`批量进入回收站`);
await expectOneSync(before,"批量移到回收站只能同步一次");
assert.equal(await evaluate(`Number(document.querySelector('#sourceBatchCount').textContent)`),0);
const exact=await evaluate(`window.workbenchDesktop.search({query:'刚刚导入',type:'source'})`);
assert.equal(exact.count,0);

const manifest=JSON.parse(await fs.readFile(path.join(fixture.vaultPath,"系统","cards-manifest.json"),"utf8"));
assert.match(manifest.cards[importedId].path,/卡片\/回收站\//);
assert.match(manifest.cards["source-a"].path,/卡片\/回收站\//);
for (const assetPath of [fixture.assetPaths[0],fixture.assetPaths[4]]) assert.ok(await fs.stat(assetPath));

socket.close();
console.log(JSON.stringify({ ok:true,checks:["项目/知识/资料领域筛选","未归属领域筛选","筛选统计与空状态","画廊显示阅读状态和领域","画廊与列表多选一致","领域筛选和状态筛选清除隐藏选择","全选当前显示资料","添加领域并去重","移除领域前显示影响数量","下拉值不直接保存","连续三次应用阅读状态","切换画廊/列表后下拉仍可用","离开资料页清除选择","导入后只选择新建资料","复用旧资产不误选旧卡片","每次操作仅一次同步","批量回收站保留原始资产","精确检索排除回收站"] },null,2));
