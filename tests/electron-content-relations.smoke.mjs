import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import path from "node:path";

const require = createRequire(import.meta.url);
const electron = require("electron");
const root = await mkdtemp(path.join(tmpdir(), "workbench-relations-desktop-"));
const vaultPath = path.join(root, "PersonalVault");
const imagePath = path.join(root,"inline.png");
await writeFile(imagePath,Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==","base64"));
const userData = path.join(root, "user-data");
const appData = path.join(root, "appdata");
await mkdir(appData,{recursive:true});
const port = await new Promise((resolve,reject)=>{
  const probe=createServer();
  probe.once("error",reject);
  probe.listen(0,"127.0.0.1",()=>{const address=probe.address();probe.close(()=>resolve(address.port));});
});
process.env.PERSONAL_VAULT_PATH = vaultPath;
const vault = await import(`../server.mjs?relation-smoke=${Date.now()}`);
const imageAsset=(await vault.importFiles([imagePath],"copy")).assets[0];
const imagePresentation=await vault.getAssetPresentation(imageAsset.id);
const when = "2026-09-24T00:00:00.000Z";
await vault.syncCards({ schemaVersion:1, cards:[
  { id:"area-a", type:"area", title:"领域 A", createdAt:when, updatedAt:when },
  { id:"project-a", type:"project", title:"项目 A", relatedRefs:["knowledge-a","source-a"], createdAt:when, updatedAt:when },
  { id:"project-b", type:"project", title:"项目 B", relatedRefs:["project-a"], createdAt:when, updatedAt:when },
  { id:"knowledge-a", type:"knowledge", title:"知识 A", sourceRefs:["project-a"], relatedRefs:["project-b"], createdAt:when, updatedAt:when },
  { id:"source-a", type:"source", title:"资料 A", relatedRefs:["project-b"], createdAt:when, updatedAt:when },
  { id:"trash-a", type:"source", title:"回收站资料", deletedAt:when, createdAt:when, updatedAt:when }
] });
// Contain Windows native spellchecker scratch paths in the disposable test root.
const child = spawn(electron,[`--remote-debugging-port=${port}`,`--user-data-dir=${userData}`,"--disable-gpu","--in-process-gpu",path.resolve(import.meta.dirname,"..")],{
  cwd:root, env:{ ...process.env,PERSONAL_VAULT_PATH:vaultPath,APPDATA:appData,LOCALAPPDATA:appData }, stdio:["ignore","pipe","pipe"], windowsHide:true
});
let childOutput="";
let childExit=null;
child.stdout.on("data",chunk=>{childOutput+=chunk.toString();});
child.stderr.on("data",chunk=>{childOutput+=chunk.toString();});
child.on("exit",(code,signal)=>{childExit={code,signal};});
const delay = ms => new Promise(resolve => setTimeout(resolve,ms));
let socket;
try {
  let target;
  for (let attempt=0; attempt<100; attempt++) {
    try { target=(await fetch(`http://127.0.0.1:${port}/json`).then(response=>response.json())).find(item=>item.type==="page"); } catch {}
    if (target?.url?.includes("index.html")) break;
    await delay(100);
  }
  if (!target) throw new Error("Electron 测试窗口没有启动");
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ socket.addEventListener("open",resolve,{once:true}); socket.addEventListener("error",reject,{once:true}); });
  let sequence=0;
  const pending=new Map();
  socket.addEventListener("message",event=>{
    const message=JSON.parse(event.data);
    const task=pending.get(message.id);
    if (!task) return;
    pending.delete(message.id);
    message.error ? task.reject(new Error(message.error.message)) : task.resolve(message.result);
  });
  socket.addEventListener("close",()=>{
    for (const task of pending.values()) task.reject(new Error("Electron 调试连接已关闭"));
    pending.clear();
  });
  async function evaluate(expression) {
    const id=++sequence;
    socket.send(JSON.stringify({ id,method:"Runtime.evaluate",params:{ expression,returnByValue:true,awaitPromise:true } }));
    const result=await Promise.race([
      new Promise((resolve,reject)=>pending.set(id,{resolve,reject})),
      delay(5000).then(()=>{pending.delete(id);throw new Error(`Electron 页面无响应：${expression.slice(0,80)}`);})
    ]);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  }
  async function command(method,params={}) {
    const id=++sequence;
    socket.send(JSON.stringify({id,method,params}));
    return new Promise((resolve,reject)=>pending.set(id,{resolve,reject}));
  }
  for (let attempt=0; attempt<100; attempt++) {
    if (await evaluate(`typeof state !== 'undefined' && state.entries?.some(entry=>entry.id==='project-a')`)) break;
    await delay(100);
  }
  assert.equal(await evaluate(`state.entries.some(entry=>entry.id==='project-a')`),true,"必须加载隔离知识库");
  const brand=await evaluate(`(()=>{const mark=document.querySelector('.brand-mark'),rect=mark.getBoundingClientRect();return {name:document.querySelector('.brand strong')?.textContent,mark:mark.textContent,layout:getComputedStyle(document.querySelector('.brand')).display,width:rect.width,cat:document.querySelector('.brand-cat')!==null}})()`);
  assert.deepEqual(brand,{name:"知行台",mark:"知",layout:"flex",width:34,cat:false},"侧栏应恢复原有品牌标识");
  for (const type of ["project","knowledge","source"]) {
    const id=`${type}-a`;
    const result=await evaluate(`(()=>{const entry=state.entries.find(item=>item.id==='${id}');openEditor('${type}',entry);const picker=document.querySelector('#editorDialog [data-ref-name="relatedRefs"]');return {open:document.querySelector('#editorDialog').open,types:picker?.dataset.refTypes,selected:[...picker.querySelectorAll('.selected-refs .ref-chip')].map(chip=>chip.textContent),hasDuplicate:new Set([...picker.querySelectorAll('.selected-refs .ref-chip button:first-child')].map(button=>button.dataset.openRef)).size!==picker.querySelectorAll('.selected-refs .ref-chip').length,oldExtra:document.querySelector('#editorDialog .main-card-extras')!==null}})()`);
    assert.equal(result.open,true);
    assert.equal(result.types,"project,knowledge,source");
    assert.equal(result.hasDuplicate,false);
    assert.equal(result.oldExtra,false);
    assert.equal(await evaluate(`WorkbenchRelations.selectable(state.entries,'${id}').some(entry=>entry.id==='trash-a'||entry.id==='${id}')`),false);
    await evaluate(`document.querySelector('#editorDialog').close()`);
  }
  const richControls=await evaluate(`(()=>{openEditor('knowledge',state.entries.find(entry=>entry.id==='knowledge-a'));const editor=document.querySelector('#editorDialog .main-rich-editor'),selection=window.getSelection();editor.innerHTML='<p>引用测试</p>';const select=()=>{const range=document.createRange();range.selectNodeContents(editor.querySelector('p') || editor);selection.removeAllRanges();selection.addRange(range);rememberRichSelection()};select();document.querySelector('#editorDialog [data-md-action="bullet"]').click();select();document.querySelector('#editorDialog [data-md-action="quote"]').click();const first=editor.innerHTML;select();document.querySelector('#editorDialog [data-md-action="quote"]').click();const second=editor.innerHTML;editor.innerHTML='<p>标题测试</p>';select();document.querySelector('#editorDialog [data-md-action="h1"]').click();select();document.querySelector('#editorDialog [data-md-action="normal"]').click();const normal=editor.innerHTML;select();const size=document.querySelector('#editorDialog [data-rich-size]');size.value='7';size.dispatchEvent(new Event('change',{bubbles:true}));const font=editor.innerHTML;select();document.querySelector('#editorDialog [data-rich-palette-toggle="foreColor"]').click();const presets=document.querySelectorAll('#richColorPalette [data-rich-swatch]').length;const custom=document.querySelector('#richColorPalette [data-rich-custom-toggle]').textContent;document.querySelector('#richColorPalette [data-rich-swatch][data-color="#0070c0"]').click();const palette=editor.innerHTML;editor.innerHTML='<p>访问 https://example.com 后继续</p>';editor.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:' '}));const linked=editor.querySelector('a')?.href;const sample=document.createElement('p');sample.innerHTML='<i>sd</i> <b>原始记录</b>';editor.append(sample);const liveBold=Number(getComputedStyle(sample.querySelector('b')).fontWeight),liveItalicTransform=getComputedStyle(sample.querySelector('i')).transform;sample.remove();return {first,second,normal,font,palette,linked,custom,liveBold,liveItalicTransform,presets,columns:[...document.querySelectorAll('#editorDialog .main-relation-column > b')].map(item=>item.textContent)}})()`);
  assert.equal((richControls.first.match(/<blockquote/g)||[]).length,1,JSON.stringify(richControls));
  assert.equal((richControls.second.match(/<blockquote/g)||[]).length,0,`再次点击引用应退出引用：${JSON.stringify(richControls)}`);
  assert.ok(!richControls.normal.includes('<h1'),"正文选项应退出标题样式");
  assert.ok(richControls.font.includes('font-size') || richControls.font.includes('size="7"'),"字号选项应立即改变正文");
  assert.ok(richControls.palette.includes('rgb(0, 112, 192)') || richControls.palette.includes('#0070c0'),JSON.stringify(richControls));
  assert.equal(richControls.linked,"https://example.com/");
  assert.equal(richControls.custom,"自定义…");
  assert.ok(richControls.liveBold>=900 && richControls.liveItalicTransform!=="none",JSON.stringify(richControls));
  assert.equal(richControls.presets,90);
  assert.deepEqual(richControls.columns,["项目","知识","资料"]);
  const paletteLayout=await evaluate(`(()=>{document.querySelector('[data-rich-palette-toggle="foreColor"]').click();const colors=[...document.querySelectorAll('#richColorPalette [data-rich-swatch]')].map(item=>item.dataset.color);const titles=[...document.querySelectorAll('#richColorPalette [title]')].map(item=>item.title);const standard=document.querySelector('#editorMarkdownToolbar [data-md-action="bold"]').getBoundingClientRect().height;const color=document.querySelector('#editorMarkdownToolbar .rich-color-control').getBoundingClientRect().height;document.querySelector('[data-rich-palette-toggle="foreColor"]').click();return {distinct:new Set(colors).size,dark:colors.filter(value=>/^#[0-6][0-9a-f]/i.test(value)).length,titles,standard,color}})()`);
  assert.ok(paletteLayout.distinct>65 && paletteLayout.dark>10,`色卡应有连续的明暗色阶：${JSON.stringify(paletteLayout)}`);
  assert.deepEqual(paletteLayout.titles,[],"悬停色块不显示颜色编号");
  assert.ok(Math.abs(paletteLayout.standard-paletteLayout.color)<=3,"颜色按钮高度应与普通格式按钮一致");
  const linkToggle=await evaluate(`(()=>{const editor=document.querySelector('#editorDialog .main-rich-editor');editor.innerHTML='<p><a href="https://example.com">示例链接</a></p>';const anchor=editor.querySelector('a'),selection=window.getSelection(),range=document.createRange();range.selectNodeContents(anchor);range.collapse(false);selection.removeAllRanges();selection.addRange(range);rememberRichSelection();const button=document.querySelector('#editorDialog [data-md-action="link"]');button.click();const plain=editor.querySelector('[data-plain-href]');linkifyEditorUrls(editor);const persisted=WorkbenchCardMarkdown.serializeRich(editor.innerHTML);button.click();return {plain:Boolean(plain),persisted,linked:editor.querySelector('a')?.href}})()`);
  assert.equal(linkToggle.plain,true);
  assert.ok(linkToggle.persisted.includes('data-plain-href=')&&!linkToggle.persisted.includes('<a '),"取消链接后保存不得自动重新链接");
  assert.equal(linkToggle.linked,"https://example.com/");
  const customColor=await evaluate(`(()=>{const editor=document.querySelector('#editorDialog .main-rich-editor');editor.innerHTML='<p>自定义颜色</p>';const range=document.createRange(),selection=window.getSelection();range.selectNodeContents(editor);selection.removeAllRanges();selection.addRange(range);rememberRichSelection();document.querySelector('[data-rich-palette-toggle="foreColor"]').click();document.querySelector('[data-rich-custom-toggle]').click();const hue=document.querySelector('[data-rich-custom="h"]');hue.value='120';hue.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[data-rich-custom-apply]').click();const chosen=lastRichColor('foreColor');const first=editor.innerHTML;editor.innerHTML='<p>再次使用</p>';const next=document.createRange();next.selectNodeContents(editor);selection.removeAllRanges();selection.addRange(next);rememberRichSelection();document.querySelector('[data-rich-apply-color="foreColor"]').click();return {chosen,first,second:editor.innerHTML,paletteHidden:document.querySelector('#richColorPalette').classList.contains('hidden'),nativeColorInputs:document.querySelectorAll('#richColorPalette input[type=color]').length}})()`);
  assert.ok(customColor.first.includes('color:') && customColor.second.includes('color:'),JSON.stringify(customColor));
  assert.equal(customColor.paletteHidden,true);
  assert.equal(customColor.nativeColorInputs,0,"自定义色不显示 RGB 参数控件");
  const dropPoint=await evaluate(`(()=>{const rect=document.querySelector('#editorDialog .main-rich-editor').getBoundingClientRect();return {x:rect.left+80,y:rect.top+75}})()`);
  const dragData={items:[],files:[imagePath],dragOperationsMask:1};
  await command("Input.dispatchDragEvent",{type:"dragEnter",x:dropPoint.x,y:dropPoint.y,data:dragData});
  await command("Input.dispatchDragEvent",{type:"dragOver",x:dropPoint.x,y:dropPoint.y,data:dragData});
  await command("Input.dispatchDragEvent",{type:"drop",x:dropPoint.x,y:dropPoint.y,data:dragData});
  for(let attempt=0;attempt<40 && !(await evaluate(`document.querySelector('#editorDialog .main-rich-editor img[data-asset-id]')!==null`));attempt++) await delay(50);
  assert.equal(await evaluate(`document.querySelector('#editorDialog .main-rich-editor img[data-asset-id]')?.dataset.assetId`),imageAsset.id,"拖入真实本地图片应复用图片资产并插入正文");
  await evaluate(`document.querySelector('#editorDialog').close()`);
  const editNavigation=await evaluate(`(()=>{openEditor('project',state.entries.find(entry=>entry.id==='project-a'));document.querySelector('#mainTitleInput').value='尚未保存的标题';document.querySelector('#editorDialog .main-rich-editor').textContent='未保存的正文';document.querySelector('#editorDialog [data-open-ref="project-b"]').click();return {viewer:document.querySelector('#viewerDialog').open,title:document.querySelector('#viewerTitle').textContent,back:!document.querySelector('#viewerBack').classList.contains('hidden')}})()`);
  assert.deepEqual(editNavigation,{viewer:true,title:"项目 B",back:true});
  await evaluate(`document.querySelector('#viewerBack').click()`);
  assert.deepEqual(await evaluate(`({editor:document.querySelector('#editorDialog').open,title:document.querySelector('#mainTitleInput').value,content:document.querySelector('#editorDialog .main-rich-editor').textContent})`),{editor:true,title:"尚未保存的标题",content:"未保存的正文"});
  await evaluate(`document.querySelector('#editorDialog').close()`);
  const trashActions=await evaluate(`(()=>{openEditor('source',state.entries.find(entry=>entry.id==='trash-a'));return {restore:getComputedStyle(document.querySelector('#restoreEntry')).display,delete:getComputedStyle(document.querySelector('#permanentDelete')).display,footer:getComputedStyle(document.querySelector('#editorDialog .dialog-actions')).display,save:getComputedStyle(document.querySelector('#mainSaveTop')).display}})()`);
  assert.notEqual(trashActions.footer,"none","回收站主卡片仍须能恢复或永久删除");
  assert.notEqual(trashActions.restore,"none");
  assert.notEqual(trashActions.delete,"none");
  assert.equal(trashActions.save,"none");
  await evaluate(`document.querySelector('#editorDialog').close()`);
  const view=await evaluate(`(()=>{openViewer(state.entries.find(entry=>entry.id==='project-a'));return {open:document.querySelector('#viewerDialog').open,outgoing:document.querySelector('#viewerMainRelations')?.textContent.includes('关联内容'),linked:[...document.querySelectorAll('#viewerMainRelations [data-open-ref]')].map(button=>button.dataset.openRef),oldExtra:document.querySelector('#viewerBody .main-card-extras')!==null}})()`);
  if(process.env.CARD_LAYOUT_SCREENSHOT) {
    await delay(350);
    const id=++sequence;
    socket.send(JSON.stringify({id,method:"Page.captureScreenshot",params:{format:"png",captureBeyondViewport:false}}));
    const shot=await new Promise((resolve,reject)=>pending.set(id,{resolve,reject}));
    await writeFile(process.env.CARD_LAYOUT_SCREENSHOT,Buffer.from(shot.data,"base64"));
  }
  assert.equal(view.open,true);
  assert.equal(view.outgoing,true);
  assert.deepEqual(view.linked.sort(),["knowledge-a","project-b","source-a"]);
  assert.equal(view.oldExtra,false);
  const relationScroll=await evaluate(`(()=>{const outer=document.querySelector('#viewerMainRelations .main-relation-scroll'),scroll=outer.querySelector('.main-relation-column-items');scroll.style.width='24px';scroll.dispatchEvent(new WheelEvent('wheel',{deltaY:1,bubbles:true,cancelable:true}));const afterWheel=scroll.scrollLeft;scroll.dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerId:22,clientX:180,bubbles:true}));document.dispatchEvent(new PointerEvent('pointermove',{pointerId:22,clientX:90,bubbles:true}));document.dispatchEvent(new PointerEvent('pointerup',{pointerId:22,clientX:90,bubbles:true}));const result={afterWheel,afterDrag:scroll.scrollLeft,columns:outer.querySelectorAll('.main-relation-column').length,display:getComputedStyle(outer.querySelector('.main-relation-columns')).gridTemplateColumns,scrollbar:getComputedStyle(scroll).scrollbarWidth};scroll.style.width='';return result})()`);
  assert.equal(relationScroll.columns,3);
  assert.equal(relationScroll.scrollbar,"none");
  assert.equal(relationScroll.display.split(' ').length,1,"三种关系应纵向排列");
  assert.ok(relationScroll.afterWheel>0 && relationScroll.afterDrag>relationScroll.afterWheel,JSON.stringify(relationScroll));
  assert.equal(await evaluate(`WorkbenchGraphData.buildGraph(state).edges.length`),5);
  const sanitized=await evaluate(`WorkbenchCardMarkdown.render(WorkbenchCardMarkdown.RICH_PREFIX+'<p onclick="alert(1)">安全文本</p><img src=x onerror=alert(1)><script>alert(1)</script>')`);
  assert.equal(sanitized,"<p>安全文本</p>","富文本恢复不得执行原始 HTML 中的事件和脚本");
  const safeImage=await evaluate(`WorkbenchCardMarkdown.serializeRich('<img data-asset-id="${imageAsset.id}" src="file:///private/image.png" onerror="alert(1)" alt="插图">')`);
  assert.ok(safeImage.includes(`data-asset-id="${imageAsset.id}"`) && !safeImage.includes("file://") && !safeImage.includes("onerror"),"插图仅保存安全资产 ID");
  const readGeometry=await evaluate(`(()=>{const dialog=document.querySelector('#viewerDialog'),rect=dialog.getBoundingClientRect();return {width:rect.width,height:rect.height,info:document.querySelector('#viewerMainInfo').getBoundingClientRect().top,relations:document.querySelector('#viewerMainRelations').getBoundingClientRect().top,toolbarHidden:getComputedStyle(document.querySelector('#viewerMarkdownToolbar')).display==='none'}})()`);
  assert.equal(readGeometry.toolbarHidden,true,"只读模式不应显示格式工具栏");
  await evaluate(`document.querySelector('#editViewedEntryTop').click()`);
  if(process.env.CARD_LAYOUT_SCREENSHOT) {
    await delay(350);
    const id=++sequence;
    socket.send(JSON.stringify({id,method:"Page.captureScreenshot",params:{format:"png",captureBeyondViewport:false}}));
    const shot=await new Promise((resolve,reject)=>pending.set(id,{resolve,reject}));
    await writeFile(process.env.CARD_LAYOUT_SCREENSHOT.replace(/\.png$/i,".edit.png"),Buffer.from(shot.data,"base64"));
  }
  const editGeometry=await evaluate(`(()=>{const dialog=document.querySelector('#editorDialog'),rect=dialog.getBoundingClientRect();return {width:rect.width,height:rect.height,info:document.querySelector('#editorMainInfo').getBoundingClientRect().top,relations:document.querySelector('#editorMainRelations').getBoundingClientRect().top}})()`);
  for(const key of ["width","height","info","relations"]) assert.ok(Math.abs(readGeometry[key]-editGeometry[key])<4,`阅读/编辑 ${key} 位置或尺寸不应明显变化：${JSON.stringify({readGeometry,editGeometry})}`);
  const toolbarWidths=await evaluate(`(()=>{const dialog=document.querySelector('#editorDialog'),toolbar=document.querySelector('#editorMarkdownToolbar'),original=dialog.style.width;const values=[1120,900,800,650,510,390].map(width=>{dialog.style.width=width+'px';const edge=toolbar.getBoundingClientRect().right;return {width,clipped:[...toolbar.querySelectorAll('button,select,input')].filter(item=>getComputedStyle(item).display!=='none'&&item.getClientRects().length&&item.getBoundingClientRect().right>edge+1).map(item=>item.outerHTML.slice(0,80)),foreground:getComputedStyle(toolbar.querySelector('.main-toolbar-foreground')).display,background:getComputedStyle(toolbar.querySelector('.main-toolbar-background')).display}});dialog.style.width=original;return values})()`);
  assert.ok(toolbarWidths.every(item=>item.clipped.length===0),`窄窗口工具不应被截断：${JSON.stringify(toolbarWidths)}`);
  assert.equal(toolbarWidths.find(item=>item.width===650).foreground,"none");
  assert.equal(toolbarWidths.find(item=>item.width===800).background,"none");
  const listRelations=await evaluate(`(()=>{const entry=state.entries.find(item=>item.id==='project-a'),html=relationshipGroupsHtml(entry);const holder=document.createElement('div');holder.innerHTML=html;document.body.append(holder);const labels=[...holder.querySelectorAll('.relation-kind')].map(item=>item.textContent),ids=[...holder.querySelectorAll('[data-open-ref]')].map(item=>item.dataset.openRef);holder.remove();return {labels,ids}})()`);
  assert.ok(listRelations.labels.includes("关联内容"));
  assert.ok(!listRelations.labels.some(label=>label.includes("主动关联")||label.includes("被哪些内容关联")));
  assert.equal(new Set(listRelations.ids).size,listRelations.ids.length,"列表关联不得重复展示双向关系");
  const typeColors=await evaluate(`(()=>{const holder=document.createElement('div');holder.innerHTML=['project','knowledge','source','area'].map(type=>'<span class="entry-type entry-type--'+type+'">'+type+'</span><button class="type-chip type-chip--'+type+'">'+type+'</button><span class="ref-chip type-chip type-chip--'+type+'"><button>'+type+'</button></span>').join('');document.body.append(holder);const values=['project','knowledge','source','area'].map(type=>({type,list:getComputedStyle(holder.querySelector('.entry-type--'+type)).color,card:getComputedStyle(holder.querySelector('button.type-chip--'+type)).color,editor:getComputedStyle(holder.querySelector('.ref-chip.type-chip--'+type+' button')).color}));holder.remove();return values})()`);
  assert.ok(typeColors.every(item=>item.list===item.card&&item.card===item.editor),`列表和弹窗的标签颜色应一致：${JSON.stringify(typeColors)}`);
  assert.equal(await evaluate(`document.querySelector('#editorDialog [data-ref-name="relatedRefs"] .selected-refs').textContent.includes('知识 A')`),true);
  assert.equal(await evaluate(`document.querySelector('#editorDialog [data-md-action="bold"]').disabled`),false);
  const beforeSaveHtml=await evaluate(`(()=>{const field=document.querySelector('#editorDialog .main-rich-editor');field.textContent='正文测试';const selection=window.getSelection();const selectAll=()=>{const range=document.createRange();range.selectNodeContents(field);selection.removeAllRanges();selection.addRange(range);rememberRichSelection()};selectAll();document.querySelector('#editorDialog [data-md-action="bold"]').click();selectAll();chooseRichColor('foreColor','#cc2233');selectAll();chooseRichColor('hiliteColor','#fff0aa');selectAll();const size=document.querySelector('#editorDialog [data-rich-size]');size.value='7';size.dispatchEvent(new Event('change',{bubbles:true}));const end=document.createRange();end.selectNodeContents(field);end.collapse(false);selection.removeAllRanges();selection.addRange(end);rememberRichSelection();const image=insertImageAsset(${JSON.stringify(imageAsset)},${JSON.stringify(imagePresentation)});return {html:field.innerHTML,image,last:localStorage.getItem('knowledge-workbench-text-color')}})()`);
  assert.equal(beforeSaveHtml.image,true);
  assert.equal(beforeSaveHtml.last,"#cc2233");
  const selected=await evaluate(`(()=>{const editor=document.querySelector('#editorDialog .main-rich-editor'),row=editor.querySelector('[data-image-row]'),image=row.querySelector('img');showRichImageControls(image);setSelectedImageLayout('left');const left=getComputedStyle(image).float;setSelectedImageLayout('right');const right=getComputedStyle(image).float;setSelectedImageLayout('full');return {layout:row.dataset.imageLayout,left,right,handles:document.querySelectorAll('[data-rich-image-resize]').length}})()`);
  assert.deepEqual(selected,{layout:"full",left:"left",right:"right",handles:0});
  await evaluate(`document.querySelector('#editorDialog .main-rich-editor img[data-asset-id]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`);
  for(let attempt=0;attempt<20 && !(await evaluate(`document.querySelector('#inlineImageDialog').open`));attempt++) await delay(50);
  assert.equal(await evaluate(`document.querySelector('#inlineImageDialog').open`),true,"编辑时可双击预览图片");
  await evaluate(`document.querySelector('#closeInlineImage').click()`);
  const independent=await evaluate(`(()=>{insertImageAsset(${JSON.stringify(imageAsset)},${JSON.stringify(imagePresentation)});const editor=document.querySelector('#editorDialog .main-rich-editor');return {rows:editor.querySelectorAll('[data-image-row]').length,groups:editor.querySelectorAll('[data-image-group]').length}})()`);
  assert.deepEqual(independent,{rows:2,groups:0},"先后独立插入的图片不能自动组成图片组");
  await evaluate(`document.querySelector('#mainSaveTop').click()`);
  for(let attempt=0;attempt<40 && !(await evaluate(`document.querySelector('#viewerDialog').open`));attempt++) await delay(50);
  const formattedContent=await evaluate(`state.entries.find(entry=>entry.id==='project-a').content`);
  assert.ok(formattedContent.includes('color:#cc2233')&&formattedContent.includes('background-color:#fff0aa')&&formattedContent.includes('font-size:36px'),formattedContent);
  assert.ok(formattedContent.includes('data-image-layout="full"')&&formattedContent.includes(`data-asset-id="${imageAsset.id}"`)&&!formattedContent.includes("file:///"),formattedContent);
  assert.equal(await evaluate(`document.querySelectorAll('#viewerBody [data-image-row]').length`),2,"阅读时应保留两张独立图片的顺序");
  await evaluate(`document.querySelector('#viewerBody img[data-asset-id]').click()`);
  assert.equal(await evaluate(`document.querySelector('#inlineImageDialog').open`),false,"只读模式单击图片不打开预览");
  await evaluate(`document.querySelector('#viewerBody img[data-asset-id]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`);
  for(let attempt=0;attempt<20 && !(await evaluate(`document.querySelector('#inlineImageDialog').open`));attempt++) await delay(50);
  assert.equal(await evaluate(`document.querySelector('#inlineImageDialog').open`),true,"只读模式双击图片打开预览");
  const zoom=await evaluate(`(()=>{document.querySelector('#inlineImageZoomIn').click();return document.querySelector('#inlineImageZoomLabel').textContent})()`);
  assert.ok(parseInt(zoom,10)>100);
  await evaluate(`document.querySelector('#closeInlineImage').click()`);
  assert.equal(await evaluate(`document.querySelector('#viewerBody .main-markdown-content strong')?.textContent`),"正文测试");
  console.log("Electron 实测：关系、色卡、图片三布局入口、独立插入与预览均通过；详细图文拖放见 electron-image-layout.smoke.mjs");
} catch (error) {
  throw new Error(`${error.message}; child=${JSON.stringify(childExit)}; output=${childOutput.slice(-1000)}`,{cause:error});
} finally {
  socket?.close();
  child.kill();
  await delay(400);
  await rm(root,{ recursive:true,force:true });
}
