import { createVideoControls } from './video-controls.js';
import {selectPreviewGroup,previewGroupFor,PREVIEW_GROUPS} from './preview-groups.js';
import {mountFilePreview,psdPreview} from '../src/advanced-preview.js';
import '../../../attachment-cache.js';
const stage = document.querySelector('#stage');
const loading = document.querySelector('#loading');
const name = document.querySelector('#media-name');
const count = document.querySelector('#page-count');
const zoomValue = document.querySelector('#zoom-value');
const previous = document.querySelector('#previous');
const next = document.querySelector('#next');
const urls = new Map();
let items = [];
let allItems=[];
const typeSelector=document.querySelector('#preview-type');
const groupPositions=new Map();
let group=null;
let index = 0;
let media = null;
let width = 1;
let height = 1;
let fitScale = 1;
let zoomFactor = 1;
let panX = 0;
let panY = 0;
let drag = null;
let videoControls = null;
let advanced=null,previewAbort=null,renderVersion=0;
let cardId=null;
const attachmentSelector=document.querySelector('#attachment-select');
const cache=window.WorkbenchAttachmentCache,lease=cache.lease(),fileRequests=new Map();
cache.onSaved(({links,urls})=>{for(const item of allItems){const id=links?.[item.sourceId];if(id&&item.draftKey){delete item.draftKey;item.assetId=id;item.saved=true;item.url=urls[id];}}lease.update(allItems.map(item=>item.draftKey).filter(Boolean));});
async function loadFile(item,signal){
  if(signal?.aborted)throw new DOMException('已取消','AbortError');
  if(item.blob instanceof Blob)return item.blob;
  if(item.saved){if(!item.url)throw new Error('文件缺失，请重新选择原文件或明确恢复');const response=await fetch(item.url,{signal,cache:'no-store'});if(!response.ok)throw new Error('文件缺失或无法读取');return response.blob();}
  if(item.draftKey){const blob=await cache.get(item.draftKey);if(!blob)throw new Error('草稿文件已不可用，请重新插入');return blob;}
  if(!window.opener||window.opener.closed)throw new Error('附件读取窗口已关闭');
  return new Promise((resolve,reject)=>{const requestId=crypto.randomUUID();const timer=setTimeout(()=>finish(null),30000);const abort=()=>{clearTimeout(timer);fileRequests.delete(requestId);reject(new DOMException('已取消','AbortError'));};const finish=blob=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);fileRequests.delete(requestId);blob?resolve(blob):reject(new Error('附件文件无法读取'));};fileRequests.set(requestId,finish);signal?.addEventListener('abort',abort,{once:true});window.opener.postMessage({type:'personalvault:media-viewer:request-file',requestId,sourceId:item.sourceId},'*');});
}

function positionControls() {
  if (!videoControls || !media) return;
  const rect = media.getBoundingClientRect(), bounds = stage.getBoundingClientRect();
  const left = Math.max(rect.left,bounds.left), right = Math.min(rect.right,bounds.right);
  const bottom = Math.min(rect.bottom,bounds.bottom), top = Math.max(rect.top,bounds.top);
  const root = videoControls.root;
  root.hidden = right-left < 52 || bottom-top < 38;
  root.style.left = `${left-bounds.left}px`;
  root.style.top = `${bottom-bounds.top-Math.min(78,bottom-top)}px`;
  root.style.width = `${Math.max(0,right-left)}px`;
  root.style.height = `${Math.min(78,bottom-top)}px`;
  root.toggleAttribute('data-compact',right-left < 270);
  root.toggleAttribute('data-tiny',right-left < 150);
}

function updateTransform() {
  if (!media) return;
  const scale = fitScale * zoomFactor;
  media.style.width = `${width}px`;
  media.style.height = `${height}px`;
  media.style.transform = `translate(-50%, -50%) translate(${panX}px, ${panY}px) scale(${scale})`;
  zoomValue.value = `${Math.round(scale * 100)}%`;
  positionControls();
}

function fitMedia() {
  if (!media) return;
  fitScale = Math.min(1, Math.max(0.01, (stage.clientWidth - 48) / width),
    Math.max(0.01, (stage.clientHeight - 48) / height));
  updateTransform();
}

function setZoom(factor, x = stage.clientWidth / 2, y = stage.clientHeight / 2) {
  if (!media) return;
  const oldScale = fitScale * zoomFactor;
  const newScale = Math.max(0.05, Math.min(8, fitScale * factor));
  const ratio = newScale / oldScale;
  panX = x - stage.clientWidth / 2 - (x - stage.clientWidth / 2 - panX) * ratio;
  panY = y - stage.clientHeight / 2 - (y - stage.clientHeight / 2 - panY) * ratio;
  zoomFactor = newScale / fitScale;
  updateTransform();
}

function show(indexToShow) {
  if (!items.length || indexToShow < 0 || indexToShow >= items.length) return;
  index = indexToShow;
  groupPositions.set(group,index);
  const version=++renderVersion;
  previewAbort?.abort();previewAbort=new AbortController();advanced?.destroy();advanced=null;
  stage.querySelectorAll('.file-preview').forEach(element=>element.remove());
  media?.pause?.();
  videoControls?.destroy();
  videoControls = null;
  media?.remove();
  media = null;
  for(const url of urls.values())URL.revokeObjectURL(url);urls.clear();
  loading.hidden = false;
  loading.textContent = '正在加载媒体…';
  const item = items[index];
  const fileActions=document.querySelector('.viewer-file-actions');
  fileActions.hidden=!cardId||!window.workbenchWindow?.resolveAsset;
  fileActions.querySelectorAll('button').forEach(button=>button.disabled=true);
  if(!fileActions.hidden)void window.workbenchWindow.resolveAsset(cardId,item.sourceId,item.assetId).then(id=>{
    if(version!==renderVersion)return;item.assetId=id;fileActions.querySelectorAll('button').forEach(button=>button.disabled=!id);
  }).catch(()=>{});
  attachmentSelector.replaceChildren();
  const selectorButton=document.createElement('button');selectorButton.type='button';selectorButton.append(document.createElement('selectedcontent'));attachmentSelector.append(selectorButton);
  items.forEach((item,i)=>{const option=document.createElement('option');option.value=String(i);const chars=Array.from(item.name);option.textContent=chars.length>34?chars.slice(0,26).join('')+'…'+chars.slice(-7).join(''):item.name;option.title=item.name;attachmentSelector.append(option);});
  attachmentSelector.value=String(index);attachmentSelector.hidden=group.navigation==='attachments'||items.length<2;
  name.hidden=!attachmentSelector.hidden;
  zoomValue.hidden=item.kind==='model';zoomValue.value='100%';
  for(const control of document.querySelectorAll('#zoom-out,#zoom-value,#zoom-in'))control.hidden=group.navigation==='document'||(control===zoomValue&&item.kind==='model');
  stage.dataset.document=String(!['image','video','psd'].includes(item.kind));
  document.querySelector('.zoom-controls').hidden=!['image','video','psd'].includes(item.kind);
  name.textContent = item.name;
  count.textContent = `${group.label} · ${index + 1}/${items.length}`;
  document.querySelector('#preview-heading').textContent = `${group.label}预览`;
  typeSelector.value=Object.keys(PREVIEW_GROUPS).find(key=>PREVIEW_GROUPS[key]===group);
  previous.hidden = next.hidden = items.length < 2 || group.navigation==='document';
  previous.setAttribute('aria-label',`上一个${group.label}`);previous.title=`上一个${group.label} · ←`;
  next.setAttribute('aria-label',`下一个${group.label}`);next.title=`下一个${group.label} · →`;
  document.querySelector('#viewer-hint').textContent=`滚轮缩放 · 拖拽移动${items.length>1&&group.navigation==='attachments'?' · ← → 切换'+group.label:''}`;
  previous.disabled = index === 0;
  next.disabled = index === items.length - 1;
  document.title = `${item.name} · 个人知识工作台`;
  zoomFactor = 1;
  panX = 0;
  panY = 0;
  void(async()=>{
  const blob=await loadFile(item,previewAbort.signal);if(version!==renderVersion)return;
  const loadedItem={...item,blob};
  if(!['image','video','psd'].includes(item.kind)){
    void mountFilePreview(loadedItem,{container:stage,signal:previewAbort.signal,companions:allItems,loadFile,onNavigate:delta=>show(index+delta)}).then(instance=>{
      if(version!==renderVersion){instance.destroy();return;}
      advanced=instance;loading.hidden=true;document.querySelector('.zoom-controls').hidden=!instance.zoomBy;
      const hint=group.navigation==='document'?'阅读模式 · 文件内翻页使用阅读控件':item.kind==='model'?'拖动旋转 · 右键平移 · 滚轮缩放':'独立文件预览';
      document.querySelector('#viewer-hint').textContent=hint+(items.length>1?' · ← → 切换'+group.label:'');
    }).catch(error=>{if(version!==renderVersion||error.name==='AbortError')return;stage.querySelectorAll('.file-preview').forEach(element=>element.remove());loading.hidden=false;loading.textContent='无法预览：'+error.message;});
    return;
  }
  if(item.kind==='psd'){
    void psdPreview(blob,previewAbort.signal).then(blob=>{if(version===renderVersion)showMedia({...item,kind:'image'},blob);}).catch(error=>{if(version===renderVersion&&error.name!=='AbortError')loading.textContent='无法预览 PSD：'+error.message;});return;
  }
  showMedia(item,blob);
  })().catch(error=>{if(version===renderVersion&&error.name!=='AbortError'){loading.hidden=false;loading.textContent='无法预览：'+error.message;}});
}

function showMedia(item,blob) {
  if (!(blob instanceof Blob)) {
    loading.textContent = '媒体文件不可用';
    return;
  }
  if (!urls.has(blob)) urls.set(blob, URL.createObjectURL(blob));
  const element = document.createElement(item.kind === 'video' ? 'video' : 'img');
  media = element;
  element.draggable = false;
  element.src = urls.get(blob);
  if (item.kind === 'video') {
    element.controls = false;
    element.autoplay = false;
    element.preload = 'metadata';
    element.addEventListener('loadedmetadata', () => {
      if (media !== element) return;
      width = element.videoWidth || 640;
      height = element.videoHeight || 360;
      fitMedia();
    });
    element.addEventListener('canplay', () => {
      if (media === element) loading.hidden = true;
    });
    element.addEventListener('error', () => {
      if (media === element) loading.textContent = '视频无法播放';
    });
    width = 640;
    height = 360;
  } else {
    element.addEventListener('load', () => {
      if (media !== element) return;
      width = element.naturalWidth || 1;
      height = element.naturalHeight || 1;
      fitMedia();
      loading.hidden = true;
    });
    element.addEventListener('error', () => {
      if (media === element) loading.textContent = '图片无法显示';
    });
    width = 640;
    height = 480;
  }
  stage.append(element);
  if (item.kind === 'video') {
    videoControls = createVideoControls();
    stage.append(videoControls.root);
    videoControls.bind(element,item.name,element,stage);
  }
  fitMedia();
}

window.addEventListener('message', event => {
  if (event.source !== window.opener) return;
  if(event.data?.type==='personalvault:media-viewer:file'){fileRequests.get(event.data.requestId)?.(event.data.blob);return;}
  if (event.data?.type === 'personalvault:media-viewer:error') {
    loading.textContent = `无法加载媒体：${event.data.message}`;
    return;
  }
  if (event.data?.type !== 'personalvault:media-viewer:data') return;
  allItems=Array.isArray(event.data.items) ? event.data.items : [];
  lease.update(allItems.map(item=>item.draftKey).filter(Boolean));
  cardId=event.data.cardId||null;
  groupPositions.clear();
  typeSelector.replaceChildren();
  for(const [key,availableGroup] of Object.entries(PREVIEW_GROUPS)){
    const size=allItems.filter(item=>previewGroupFor(item.kind)===availableGroup).length;
    if(!size)continue;
    const option=document.createElement('option');option.value=key;option.textContent=availableGroup.label;typeSelector.append(option);
  }
  typeSelector.hidden=typeSelector.options.length<2;
  document.querySelector('#preview-heading').hidden=!typeSelector.hidden;
  const grouped=selectPreviewGroup(allItems,event.data.initialIndex);
  items=grouped.items;group=grouped.group;
  if (!items.length) {
    loading.textContent = '没有可查看的媒体';
    return;
  }
  show(grouped.initialIndex);
});
attachmentSelector.addEventListener('change',()=>{show(Number(attachmentSelector.value));attachmentSelector.blur();});
attachmentSelector.addEventListener('keydown',event=>{if(['ArrowUp','ArrowDown'].includes(event.key))event.preventDefault();});
for(const [selector,action] of [['#open-external','openAsset'],['#reveal-file','revealAsset']])document.querySelector(selector).addEventListener('click',()=>{
  const id=items[index]?.assetId;if(id)void window.workbenchWindow[action](id).catch(error=>{loading.hidden=false;loading.textContent=error.message;});
});
let pointerTypeSelection=false;
typeSelector.addEventListener('pointerdown',()=>{pointerTypeSelection=true;});
typeSelector.addEventListener('keydown',()=>{pointerTypeSelection=false;});
typeSelector.addEventListener('change',()=>{
  group=PREVIEW_GROUPS[typeSelector.value];
  items=allItems.filter(item=>previewGroupFor(item.kind)===group);
  show(Math.min(items.length-1,groupPositions.get(group)||0));
  if(pointerTypeSelection){typeSelector.blur();pointerTypeSelection=false;}
});

const ready = setInterval(() => {
  if (items.length || !window.opener || window.opener.closed) {
    clearInterval(ready);
    return;
  }
  window.opener.postMessage({ type: 'personalvault:media-viewer:ready' }, '*');
}, 250);
window.opener?.postMessage({ type: 'personalvault:media-viewer:ready' }, '*');

previous.addEventListener('click', () => show(index - 1));
next.addEventListener('click', () => show(index + 1));
document.querySelector('#close').addEventListener('click', () => window.close());
document.querySelector('#zoom-in').addEventListener('click', () => advanced ? advanced.zoomBy?.(1.25) : setZoom(zoomFactor * 1.25));
document.querySelector('#zoom-out').addEventListener('click', () => advanced ? advanced.zoomBy?.(.8) : setZoom(zoomFactor / 1.25));
document.querySelector('#fit').addEventListener('click', () => {
  if(advanced){advanced.fit?.();return;}
  zoomFactor = 1;
  panX = 0;
  panY = 0;
  fitMedia();
});
stage.addEventListener('wheel', event => {
  if(stage.dataset.document==='true')return;
  event.preventDefault();
  const rect = stage.getBoundingClientRect();
  setZoom(zoomFactor * Math.exp(-event.deltaY * 0.0015),
    event.clientX - rect.left, event.clientY - rect.top);
}, { passive: false });
stage.addEventListener('pointerdown', event => {
  if(stage.dataset.document==='true')return;
  if (event.button !== 0 || event.target.closest('.pv-video-controls')) return;
  event.preventDefault();
  drag = { x: event.clientX, y: event.clientY, panX, panY };
  stage.classList.add('dragging');
  stage.setPointerCapture(event.pointerId);
});
stage.addEventListener('pointermove', event => {
  if (!drag) return;
  panX = drag.panX + event.clientX - drag.x;
  panY = drag.panY + event.clientY - drag.y;
  updateTransform();
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  stage.addEventListener(type, () => { drag = null; stage.classList.remove('dragging'); });
}
window.addEventListener('keydown', event => {
  if((event.target!==attachmentSelector&&event.target.closest('input,select,textarea'))||event.target.isContentEditable)return;
  if(group?.navigation==='document'){
    if(event.target===attachmentSelector)return;
    if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();advanced?.turnPage?.(event.key==='ArrowLeft'?-1:1);return;}
  }
  if (group?.navigation!=='document'&&items.length>1) {
    if (event.key === 'ArrowLeft') { event.preventDefault(); show(index - 1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); show(index + 1); }
  }
  if (event.key === 'Escape') window.close();
});
window.addEventListener('resize', fitMedia);
document.addEventListener('fullscreenchange', () => requestAnimationFrame(fitMedia));
window.addEventListener('beforeunload', () => {
  previewAbort?.abort();advanced?.destroy();media?.pause?.();videoControls?.destroy();
  for (const url of urls.values()) URL.revokeObjectURL(url);
});
