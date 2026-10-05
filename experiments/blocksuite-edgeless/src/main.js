import '@toeverything/theme/style.css';
import { combinedDarkCssVariables, combinedLightCssVariables } from '@toeverything/theme';
import './style.css';
import '../public/video-controls.css';
import { createVideoControls } from '../public/video-controls.js';
import './preset-tool-art.css';
import { AffineSchemas, AttachmentBlockService } from '@blocksuite/blocks';
import { effects as blockEffects } from '@blocksuite/blocks/effects';
import { EdgelessEditor } from '@blocksuite/presets';
import { effects as presetEffects } from '@blocksuite/presets/effects';
import { DocCollection, Schema, Text } from '@blocksuite/store';
import {CanvasBlobSource} from './canvas-blob-source.js';
import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';
import { resizeNote, NOTE_MIN_WIDTH, NOTE_MIN_HEIGHT } from './note-geometry.js';
import { openMediaViewer } from './media-viewer.js';
import {previewKindFor} from '../public/preview-groups.js';
import { customizeFormatMenus, withFontSizeSupport } from './format-menus.js';
import { customizeConnectorMenu } from './connector-menu.js';
let pendingMediaPlacement=null;

function applyCanvasTheme() {
  const variables = document.documentElement.dataset.theme === 'dark' ? combinedDarkCssVariables : combinedLightCssVariables;
  for (const [name, value] of Object.entries(variables)) document.documentElement.style.setProperty(name, value);
}
applyCanvasTheme();
window.addEventListener('workbench-theme-change', applyCanvasTheme);

const STATUS = document.querySelector('#status');
blockEffects();
presetEffects();
const embedded = new URLSearchParams(location.search).has('embedded');
let viewing = new URLSearchParams(location.search).get('embedded') === 'view';
if(embedded)installAttachmentContextMenu();
if (embedded) document.body.classList.add('embedded-canvas', viewing ? 'embedded-canvas-view' : 'embedded-canvas-edit');
window.addEventListener('keydown', event => {
  if(document.querySelector('.pv-attachment-menu'))return;
  if (!viewing) return;
  if (event.code === 'Space') return;
  if (event.key === 'F5' || (event.ctrlKey || event.metaKey) && ['r', 'f', 'l', '+', '-', '0', 'c'].includes(event.key.toLowerCase())) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}, true);
const KEY = 'personalvault-blocksuite-edgeless-prototype-v10';
const schema = new Schema().register(AffineSchemas);
const canvasBlobSource=new CanvasBlobSource();
const sourceNames=new Map();
const collection = new DocCollection({
  schema,
  blobSources: { main: canvasBlobSource },
});
collection.meta.initialize();
let doc = collection.createDoc({ id: 'prototype' });
const linkedAssets = {};
let activeCardId=null;
const FILE_CARD_WIDTH=320,FILE_CARD_HEIGHT=88;
const mediaNames = new Map();
const pendingMediaNames = new Set();
const mediaHash = async blob => [...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(value=>value.toString(16).padStart(2,'0')).join('');
function rememberMediaName(file) {
  const pending = mediaHash(file).then(hash=>mediaNames.set(hash,file.name)).catch(console.warn);
  pendingMediaNames.add(pending);
  void pending.finally(()=>pendingMediaNames.delete(pending));
}
function isCanvasFileDrag(event) {
  return event.dataTransfer?.types.includes('Files') && event.composedPath().some(node=>node.id==='canvas');
}
function clearCanvasFileDropIndicator() {
  // The preset's text-block drop manager owns both the blue line and its target.
  document.querySelector('affine-edgeless-root')?.service?.fileDropManager?.onDragLeave();
}
for(const type of ['dragenter','dragover'])window.addEventListener(type,event=>{
  if(!isCanvasFileDrag(event))return;
  event.preventDefault();event.stopImmediatePropagation();
  event.dataTransfer.dropEffect=viewing?'none':'copy';
  clearCanvasFileDropIndicator();
},true);
window.addEventListener('dragleave',event=>{
  if(!isCanvasFileDrag(event))return;
  event.stopImmediatePropagation();clearCanvasFileDropIndicator();
},true);
window.addEventListener('dragend',clearCanvasFileDropIndicator,true);
window.addEventListener('drop', event => {
  if (!isCanvasFileDrag(event)) return;
  event.preventDefault();event.stopImmediatePropagation();clearCanvasFileDropIndicator();
  if(viewing)return;
  const files=[...event.dataTransfer?.files || []];
  if(!files.length)return;
  const root=document.querySelector('affine-edgeless-root');
  if(!root?.gfx?.viewport){setStatus('画布尚未就绪，请稍后再拖入附件');return;}
  // Freeze the drop point before reading files, since video metadata and blob
  // storage are asynchronous and the user may pan/zoom while they load.
  const rect=root.getBoundingClientRect();
  const [x,y]=root.gfx.viewport.toModelCoord(event.clientX-rect.left,event.clientY-rect.top);
  let nextY=y;
  const placement={doc,targetForSize(width,height){const xywh=[x,nextY,width,height];nextY+=height+40;return {xywh};}};
  void (async()=>{
    for(const file of files){rememberMediaName(file);await insertMedia(file,file.name,false,placement);}
    window.WorkbenchCanvas?.refreshAttachments?.();
    setStatus(`已插入 ${files.length} 个附件`);
  })().catch(error=>{console.error(error);setStatus(`插入失败：${error.message}`);});
},true);

function attachmentCategory(name,type) {
  if(type.startsWith('image/'))return '图片';
  if(type.startsWith('video/'))return '视频';
  if(type.startsWith('audio/'))return '音频';
  const extension=name.split('.').pop().toLowerCase();
  if(['mp3','wav','flac','aac','m4a','ogg'].includes(extension))return '音频';
  if(['pdf','doc','docx','ppt','pptx','xls','xlsx','txt','md','rtf','epub'].includes(extension))return '文档';
  if(['fbx','obj','gltf','glb','stl','usd','usda','usdc','abc'].includes(extension))return '模型';
  if(['blend','blend1','uproject','uasset','unity','psd','psb','ai','kra','c4d','ztl'].includes(extension))return '工程';
  return '其他';
}
let primaryAssetId = null;
const persistence = embedded ? null : new IndexeddbPersistence(KEY, doc.spaceDoc);

function setStatus(message) { STATUS.textContent = message; }
function initializeEmptyDocument() {
  const page = doc.addBlock('affine:page', { title: new Text('画布原型') });
  doc.addBlock('affine:surface', {}, page);
  const note = doc.addBlock('affine:note', {}, page);
  doc.addBlock('affine:paragraph', { text: new Text('在这里写正文。画布上的其他位置可添加文字、图片等内容。') }, note);
}

function fromBase64(value) {
  const bytes = atob(value);
  return Uint8Array.from(bytes, character => character.charCodeAt(0));
}

function toBase64(bytes) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function waitForParentDocument() {
  return new Promise(resolve => {
    const receive = event => {
      if (event.source !== window.parent || event.data?.type !== 'personalvault:canvas:init') return;
      window.removeEventListener('message', receive);
      resolve(event.data);
    };
    window.addEventListener('message', receive);
    window.parent.postMessage({ type: 'personalvault:canvas:ready' }, '*');
  });
}

function richDeltas(node, attributes = {}) {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ? [{ insert: node.textContent, ...(Object.keys(attributes).length ? { attributes } : {}) }] : [];
  }
  if (node.nodeType !== Node.ELEMENT_NODE || node.matches('img,video,script,style')) return [];
  if (node.matches('br')) return [{ insert: '\n' }];
  const next = { ...attributes };
  if (node.matches('b,strong')) next.bold = true;
  if (node.matches('i,em')) next.italic = true;
  if (node.matches('u')) next.underline = true;
  if (node.matches('s,strike,del')) next.strike = true;
  if (node.matches('code')) next.code = true;
  if (node.matches('a[href]')) next.link = node.getAttribute('href');
  return [...node.childNodes].flatMap(child => richDeltas(child, next));
}

function initializeCardDocument(html) {
  const page = doc.addBlock('affine:page', { title: new Text('卡片画布') });
  doc.addBlock('affine:surface', {}, page);
  const note = doc.addBlock('affine:note', {
    xywh: '[80,80,720,420]', displayMode: 'edgeless',
  }, page);
  const container = document.createElement('div');
  container.innerHTML = html;
  const blocks = [...container.children].flatMap(element => element.matches('ul,ol') ? [...element.children] : [element])
    .filter(element => !element.matches('img,video'));
  let added = 0;
  for (const block of blocks) {
    if (block.querySelector('img,video') && !block.textContent.trim()) continue;
    const deltas = richDeltas(block);
    if (!deltas.length && !block.textContent.trim()) continue;
    const type = /^H[1-6]$/.test(block.tagName) ? block.tagName.toLowerCase() : 'text';
    doc.addBlock('affine:paragraph', { type, text: new Text(deltas.length ? deltas : block.textContent) }, note);
    added++;
  }
  if (!added) doc.addBlock('affine:paragraph', { type: 'text', text: new Text() }, note);
}

async function restoreLegacyImages(html) {
  if (!html || doc.root.children.some(block => block.flavour === 'affine:image')) return 0;
  const container = document.createElement('div');
  container.innerHTML = html;
  const surface = doc.root.children.find(block => block.flavour === 'affine:surface');
  let top = 900;
  let failures = 0;
  for (const image of container.querySelectorAll('img[src]')) {
    try {
      const blob = await (await fetch(image.src)).blob();
      const sourceId = await doc.blobSync.set(blob);
      const bitmap = await createImageBitmap(blob);
      const width = Math.min(bitmap.width, 480);
      const height = Math.max(1, Math.round(bitmap.height * width / bitmap.width));
      bitmap.close();
      doc.addBlock('affine:image', { sourceId, width, height, xywh: JSON.stringify([80, top, width, height]) }, surface.id);
      top += height + 24;
    } catch (error) { failures++;console.warn('旧卡片图片未能导入画布', error); }
  }
  return failures;
}

async function restoreAssets(assets) {
  const remapped = new Map();
  for (const [oldId, url] of Object.entries(assets)) {
    const blob = await (await fetch(url)).blob();
    const newId = await doc.blobSync.set(oldId,blob);
    if (newId !== oldId) remapped.set(oldId, newId);
  }
  if (!remapped.size) return;
  const visit = block => {
    if (remapped.has(block.sourceId)) doc.updateBlock(block, () => { block.sourceId = remapped.get(block.sourceId); });
    block.children?.forEach(visit);
  };
  visit(doc.root);
}

function blobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function snapshotDocument() {
  const assets = {};
  const assetMetadata = {};
  await Promise.all(pendingMediaNames);
  const text = [];
  const visit = async block => {
    if (block.text && block.flavour === 'affine:paragraph') text.push(String(block.text));
    if (block.sourceId && !assets[block.sourceId]) {
      if(linkedAssets[block.sourceId]&&!canvasBlobSource.isDraft(block.sourceId)){for(const child of block.children??[])await visit(child);return;}
      const blob = await doc.blobSync.get(block.sourceId);
      if(!blob)throw new Error(`附件数据无法读取：${block.name || '画布附件'}。请重新插入原文件后保存`);
      if (blob) {
        assets[block.sourceId] = await blobAsDataUrl(blob);
        const metadata = { name:block.name || mediaNames.get(await mediaHash(blob)) || '' };
        if (blob.type.startsWith('image/')) {
          const bitmap = await createImageBitmap(blob).catch(()=>null);
          if (bitmap) { metadata.width=bitmap.width; metadata.height=bitmap.height; bitmap.close(); }
        } else {
          const video = [...document.querySelectorAll('affine-edgeless-attachment')].find(view=>view.dataset.blockId===block.id)?.querySelector('video');
          if (video?.videoWidth) { metadata.width=video.videoWidth; metadata.height=video.videoHeight; }
          if (Number.isFinite(video?.duration)) metadata.durationSeconds=video.duration;
        }
        assetMetadata[block.sourceId] = metadata;
      }
    }
    for (const child of block.children ?? []) await visit(child);
  };
  await visit(doc.root);
  return { update: toBase64(Y.encodeStateAsUpdate(doc.spaceDoc)), assets, assetMetadata, fileCardLayoutVersion:1, text: text.join('\n'),
    linkedAssets: Object.fromEntries(Object.entries(linkedAssets).filter(([id]) => {
      return doc.getBlocksByFlavour('affine:image').concat(doc.getBlocksByFlavour('affine:attachment')).some(({model}) => model.sourceId === id);
    })), primaryAssetId:doc.getBlocksByFlavour('affine:image').concat(doc.getBlocksByFlavour('affine:attachment')).some(({model})=>linkedAssets[model.sourceId]===primaryAssetId) ? primaryAssetId : null };
}

function installParentBridge() {
  window.addEventListener('message', async event => {
    if(event.source!==window.parent)return;
    if(event.data?.type==='personalvault:canvas:saved'){
      const saved=event.data.snapshot;Object.assign(linkedAssets,saved.linkedAssets||{});
      primaryAssetId=saved.primaryAssetId || null;
      await canvasBlobSource.commit(saved,event.data.linkedMedia||{});
      window.WorkbenchCanvas?.acceptSavedAttachments?.(saved);return;
    }
    if(event.data?.type==='personalvault:canvas:restore'){
      try{
        const assetId=event.data.assetId,sourceId=Object.keys(linkedAssets).find(id=>linkedAssets[id]===assetId);
        const blob=sourceId?await window.WorkbenchAttachmentCache.legacy(sourceId):null;
        if(!blob)throw new Error('缓存中没有这个文件，请重新插入原文件');
        const id=await doc.blobSync.set('draft-'+crypto.randomUUID(),blob);linkedAssets[id]=assetId;
        sourceNames.set(id,canvasBlobSource.names[assetId]);
        for(const {model} of doc.getBlocksByFlavour('affine:image').concat(doc.getBlocksByFlavour('affine:attachment')))if(model.sourceId===sourceId)doc.updateBlock(model,{sourceId:id});
        window.WorkbenchCanvas?.refreshAttachments?.();setStatus('已从缓存恢复，请保存卡片');
        window.parent.postMessage({type:'personalvault:canvas:restore-result',message:'已从缓存恢复，请保存卡片'},'*');
      }catch(error){window.parent.postMessage({type:'personalvault:canvas:restore-result',message:error.message},'*');}return;
    }
    if (event.data?.type !== 'personalvault:canvas:snapshot') return;
    try {
      window.parent.postMessage({ type: 'personalvault:canvas:snapshot-result', requestId: event.data.requestId,
        snapshot: await snapshotDocument() }, '*');
    } catch (error) {
      window.parent.postMessage({ type: 'personalvault:canvas:snapshot-result', requestId: event.data.requestId,
        error: error.message }, '*');
    }
  });
  window.parent.postMessage({ type: 'personalvault:canvas:loaded' }, '*');
}

// This prototype cannot open the separate documents created by BlockSuite's
// linked-doc action. Remove unsupported embeds left in earlier test data, and
// keep their containing note editable even if the embed was its only child.
function removeUnsupportedLinkedDocs() {
  if (!doc.root) return;
  const unsupported = [];
  const affectedNotes = new Set();
  const visit = (block, note = null) => {
    const containingNote = block.flavour === 'affine:note' ? block : note;
    for (const child of block.children ?? []) {
      if (child.flavour === 'affine:embed-linked-doc') {
        unsupported.push(child);
        if (containingNote) affectedNotes.add(containingNote);
      } else visit(child, containingNote);
    }
  };
  visit(doc.root);
  if (!unsupported.length) return;
  doc.captureSync();
  doc.transact(() => {
    for (const block of unsupported) doc.deleteBlock(block);
    for (const note of affectedNotes) {
      if (note.children.length === 0) {
        doc.addBlock('affine:paragraph', { type: 'text', text: new Text() }, note.id);
      }
    }
  });
  doc.captureSync();
}

// Older table cards can contain an empty paragraph above the database after
// a double click on the title. It has no table data and cannot be removed
// through the card UI, so discard only empty direct children of table notes.
function removeEmptyTableCardParagraphs() {
  const notes = doc.root?.children.filter(block => block.flavour === 'affine:note') ?? [];
  const empty = notes.flatMap(note => {
    const children = note.children;
    if (!children.some(child => child.flavour === 'affine:database') ||
      children.some(child => child.flavour === 'affine:paragraph' && child.text?.length > 0)) return [];
    return children.filter(child => child.flavour === 'affine:paragraph' && !child.text?.length);
  });
  if (!empty.length) return;
  doc.captureSync();
  doc.transact(() => { for (const block of empty) doc.deleteBlock(block); });
  doc.captureSync();
}

function preventEmptyTableCardParagraphs() {
  let scheduled = false;
  doc.slots.blockUpdated.on(({ type, flavour }) => {
    if (type !== 'add' || flavour !== 'affine:paragraph' || scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      removeEmptyTableCardParagraphs();
    });
  });
}

function removeUnsupportedFormatBarActions(editor) {
  let attempts = 0;
  const remove = () => {
    const formatBar = editor.querySelector('affine-format-bar-widget');
    if (formatBar?.configItems?.length) {
      formatBar.configItems = formatBar.configItems.filter(item =>
        item.id !== 'convert-to-linked-doc' && item.id !== 'convert-to-database');
      customizeFormatMenus(formatBar);
    } else if (attempts++ < 120) {
      requestAnimationFrame(remove);
    }
  };
  remove();
}

try {
  if (persistence) await persistence.whenSynced;
  const initial = embedded ? await waitForParentDocument() : null;
  activeCardId=initial?.cardId||null;
  if (initial?.snapshot?.update) Y.applyUpdate(doc.spaceDoc, fromBase64(initial.snapshot.update));
  doc.load(() => {
    if (!doc.root) {
      if (embedded) initializeCardDocument(initial?.legacyHtml || '');
      else initializeEmptyDocument();
    }
  });
  if (initial?.snapshot?.assets) await restoreAssets(initial.snapshot.assets);
  Object.assign(linkedAssets,initial?.snapshot?.linkedAssets||{});
  canvasBlobSource.configure(initial?.snapshot,initial?.linkedMedia);
  for(const [id,assetId] of Object.entries(linkedAssets))sourceNames.set(id,canvasBlobSource.names[assetId]);
  void window.WorkbenchAttachmentCache.deleteLegacy(Object.keys(linkedAssets).filter(id=>!initial?.snapshot?.attachments?.find(a=>a.id===linkedAssets[id])?.missing));
  primaryAssetId = initial?.snapshot?.primaryAssetId || null;
  if(initial?.snapshot?.fileCardLayoutVersion!==1){
    for(const {model} of doc.getBlocksByFlavour('affine:attachment')){
      if(model.type?.startsWith('video/'))continue;
      const [x,y]=JSON.parse(model.xywh);
      doc.updateBlock(model,{xywh:JSON.stringify([x,y,FILE_CARD_WIDTH,FILE_CARD_HEIGHT]),style:'horizontalThin'});
    }
  }
  const migrationFailures = embedded && !initial?.snapshot?.update ? await restoreLegacyImages(initial?.legacyHtml || '') : 0;
  if (initial?.primaryMedia && primaryAssetId !== initial.primaryMedia.assetId) {
    const media = initial.primaryMedia;
    const url = initial.linkedMedia?.[media.assetId];
    if (!url) throw new Error('资料原文件无法读取');
    const sourceId = await insertMedia(await (await fetch(url)).blob(), media.name, true);
    linkedAssets[sourceId] = media.assetId;
    primaryAssetId = media.assetId;
  }
  removeUnsupportedLinkedDocs();
  removeEmptyTableCardParagraphs();
  if (!viewing) preventEmptyTableCardParagraphs();
  doc.awarenessStore.setReadonly(doc, viewing);
  const editor = new EdgelessEditor();
  editor.specs = withFontSizeSupport(editor.specs);
  editor.doc = doc;
  document.querySelector('#canvas').append(editor);
  doc.awarenessStore.setFlag('enable_lasso_tool', false);
  doc.awarenessStore.setFlag('enable_edgeless_text', false);
  const root = await waitForRoot(editor);
  const protectDrafts=()=>canvasBlobSource.protect(doc.getBlocksByFlavour('affine:image').concat(doc.getBlocksByFlavour('affine:attachment')).map(({model})=>model.sourceId).filter(Boolean));
  doc.slots.blockUpdated.on(protectDrafts);protectDrafts();
  // Original files are referenced by asset ID rather than copied into snapshots.
  if (Object.keys(linkedAssets).length) root.std.get(AttachmentBlockService).maxFileSize = Number.MAX_SAFE_INTEGER;
  if (embedded) installEmbeddedWheel(root);
  removeUnsupportedFormatBarActions(editor);
  installMinimalControls(editor, root);
  if (embedded) installMediaWindowOpen();
  installCanvasFocusClaim();
  setTimeout(() => localizeEditor(editor), 0);
  installSelectionRecovery(editor);
  setTimeout(() => { void markMissingImages(); }, 0);
  installVideoPreviews(editor);
  if (embedded) {
    installReadOnlyInteraction(editor, root);
    installModeSwitch(editor, root);
    installParentBridge();
    installLiveAttachments(initial);
    if (migrationFailures) window.parent.postMessage({ type: 'personalvault:canvas:migration-error', count:migrationFailures }, '*');
    setStatus(viewing ? '阅读画布' : '编辑画布');
  } else setStatus('原型数据保存在当前浏览器');
} catch (error) {
  console.error(error);
  setStatus(`启动失败：${error.message}`);
}

function installModeSwitch(editor, root) {
  let editGuardInstalled=!viewing;
  window.WorkbenchCanvas = {
    setMode(mode, {discard=false}={}) {
      if (discard) {
        doc.captureSync();
        while (doc.canUndo) doc.undo();
      }
      viewing=mode==='view';
      doc.awarenessStore.setReadonly(doc,viewing);
      if(!viewing && !editGuardInstalled) {
        preventEmptyTableCardParagraphs();
        editGuardInstalled=true;
      }
      if (!viewing) doc.history.clear();
      root.gfx.selection.clear();
      root.__pvSetTool?.('pan');
      document.getSelection()?.removeAllRanges();
      document.activeElement?.blur?.();
      document.body.classList.toggle('embedded-canvas-view',viewing);
      document.body.classList.toggle('embedded-canvas-edit',!viewing);
      document.documentElement.classList.toggle('embedded-canvas-view',viewing);
      document.documentElement.classList.toggle('embedded-canvas-edit',!viewing);
      for (const element of editor.querySelectorAll('*')) {
        if(!viewing) element.shadowRoot?.querySelector('#pv-readonly-selection')?.remove();
        element.requestUpdate?.();
      }
      root.requestUpdate?.();
      setStatus(viewing ? '阅读画布' : '编辑画布');
      if(!viewing)window.WorkbenchCanvas.refreshAttachments?.();
    },
  };
}

function installAttachmentContextMenu() {
  let menu=null,requestId=null;
  const close=()=>{menu?.remove();menu=null;requestId=null;};
  window.addEventListener('contextmenu',event=>{
    const view=event.composedPath().find(node=>node instanceof Element && node.matches('affine-edgeless-image,affine-edgeless-attachment'));
    if(!view){close();return;}
    const model=view.model;if(!model?.sourceId)return;
    event.preventDefault();event.stopImmediatePropagation();close();
    requestId=crypto.randomUUID();
    menu=document.createElement('div');menu.className='pv-attachment-menu';menu.setAttribute('role','menu');menu.tabIndex=-1;
    for(const [action,label] of [['open','打开'],['reveal','打开文件所在目录']]){
      const button=document.createElement('button');button.type='button';button.textContent=label;
      button.setAttribute('role','menuitem');button.disabled=true;button.dataset.action=action;
      button.onclick=()=>{window.parent.postMessage({type:'personalvault:canvas:attachment-action',sourceId:model.sourceId,assetId:linkedAssets[model.sourceId],action},'*');close();};
      menu.append(button);
    }
    const hint=document.createElement('p');hint.className='pv-attachment-menu-hint';hint.textContent='正在读取附件…';menu.append(hint);
    document.body.append(menu);
    menu.focus({preventScroll:true});
    menu.style.left=Math.max(4,Math.min(event.clientX,innerWidth-menu.offsetWidth-4))+'px';
    menu.style.top=Math.max(4,Math.min(event.clientY,innerHeight-menu.offsetHeight-4))+'px';
    window.parent.postMessage({type:'personalvault:canvas:attachment-menu',requestId,sourceId:model.sourceId,assetId:linkedAssets[model.sourceId]},'*');
  },true);
  window.addEventListener('message',event=>{
    if(event.source!==window.parent || event.data?.type!=='personalvault:canvas:attachment-menu-result' || event.data.requestId!==requestId || !menu)return;
    for(const button of menu.querySelectorAll('button'))button.disabled=!event.data.available;
    const hint=menu.querySelector('p');if(event.data.available)hint.remove();else hint.textContent='保存附件后可使用';
  });
  window.addEventListener('pointerdown',event=>{if(menu?.contains(event.target))event.stopPropagation();else close();},true);
  window.addEventListener('keydown',event=>{if(menu&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();}},true);
  window.addEventListener('wheel',close,{passive:true,capture:true});window.addEventListener('resize',close);
  window.addEventListener('blur',close);
}

function installLiveAttachments(initial) {
  const known=new Map((initial?.snapshot?.attachments||[]).map(asset=>[asset.id,asset]));
  const urls=new Map();
  let timer=null,generation=0,lastSignature=null;
  async function refresh(){
    if(viewing)return;
    const version=++generation;
    await Promise.all(pendingMediaNames);
    const models=doc.getBlocksByFlavour('affine:image').concat(doc.getBlocksByFlavour('affine:attachment')).map(({model})=>model);
    const signature=models.map(model=>model.sourceId).filter(Boolean).sort().join('|');
    if(signature===lastSignature)return;
    const seen=new Set(),attachments=[];
    for(const model of models){
      const sourceId=model.sourceId;if(!sourceId||seen.has(sourceId))continue;seen.add(sourceId);
      const assetId=linkedAssets[sourceId],saved=known.get(assetId);
      if(saved&&!canvasBlobSource.isDraft(sourceId)){attachments.push(saved);continue;}
      const blob=await doc.blobSync.get(sourceId);if(!blob)continue;
      const name=model.name||mediaNames.get(await mediaHash(blob))||initial?.primaryMedia?.name||'画布附件';
      if(!urls.has(sourceId))urls.set(sourceId,URL.createObjectURL(blob));
      const category=attachmentCategory(name,model.type||blob.type);
      attachments.push({id:assetId||'draft:'+sourceId,draft:true,name,category,extension:name.includes('.')?'.'+name.split('.').pop():'',size:blob.size,width:model.width,height:model.height,previewUrl:['图片','视频'].includes(category)?urls.get(sourceId):null});
    }
    if(version!==generation||viewing)return;
    lastSignature=signature;
    for(const [id,url] of urls)if(!seen.has(id)){URL.revokeObjectURL(url);urls.delete(id);}
    window.parent.postMessage({type:'personalvault:canvas:attachments-changed',attachments},'*');
  }
  const schedule=()=>{clearTimeout(timer);timer=setTimeout(()=>{void refresh().catch(console.warn);},50);};
  doc.slots.blockUpdated.on(schedule);
  window.WorkbenchCanvas.refreshAttachments=()=>{lastSignature=null;schedule();};
  window.WorkbenchCanvas.acceptSavedAttachments=snapshot=>{known.clear();snapshot.attachments?.forEach(asset=>known.set(asset.id,asset));lastSignature=null;schedule();};
  schedule();
}

function installReadOnlyInteraction(editor, root) {
  const listen=(type,handler,options)=>window.addEventListener(type,event=>{if(viewing)handler(event);},options);
  let textDrag = null;
  let cardPan = null;
  let draggedText = false;
  let draggedView = false;
  const cardFromEvent = event => event.composedPath().find(node =>
    node instanceof Element && node.matches('affine-edgeless-note, affine-edgeless-image, affine-edgeless-attachment'));
  const onVideoControl = event => event.composedPath().some(node =>
    node instanceof Element && node.matches('.pv-video-controls'));
  const selectCard = card => {
    const id = card?.getAttribute('data-block-id');
    if (id) root.gfx.selection.set({ elements: [id], editing: false });
  };
  const textCaretAt = (card, x, y) => {
    const caret = document.caretRangeFromPoint(x, y);
    if (caret && card.contains(caret.startContainer)) return caret;
    const nodes = [...card.querySelectorAll('[data-v-text]')].flatMap(element =>
      [...element.childNodes].filter(node => node.nodeType === Node.TEXT_NODE && node.textContent));
    if (!nodes.length) return null;
    const rect = card.getBoundingClientRect();
    const atEnd = y > rect.bottom || (y >= rect.top && x > rect.right);
    const node = atEnd ? nodes.at(-1) : nodes[0];
    const range = document.createRange();
    range.setStart(node, atEnd ? node.textContent.length : 0);
    range.collapse(true);
    return range;
  };
  const textHitAt = (card, x, y) => {
    const caret = document.caretRangeFromPoint(x, y);
    if (!caret || !card.contains(caret.startContainer) || caret.startContainer.nodeType !== Node.TEXT_NODE) return null;
    const node = caret.startContainer;
    // Caret APIs also return the nearest text for empty padding and line ends.
    // Only start selection when the pointer overlaps a visible character.
    for (const offset of [caret.startOffset - 1, caret.startOffset]) {
      if (offset < 0 || offset >= node.length || !node.textContent[offset].trim()) continue;
      const glyph = document.createRange();
      glyph.setStart(node, offset);
      glyph.setEnd(node, offset + 1);
      if ([...glyph.getClientRects()].some(rect => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom)) return caret;
    }
    return null;
  };
  const updateTextSelection = (x, y) => {
    if (!textDrag) return;
    const end = textCaretAt(textDrag.card, x, y);
    if (!end) return;
    const selection = document.getSelection();
    selection.setBaseAndExtent(textDrag.start.startContainer, textDrag.start.startOffset,
      end.startContainer, end.startOffset);
    draggedText = !selection.isCollapsed;
  };
  root.gfx.selection.clear();
  listen('beforeinput', event => {
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  listen('pointerdown', event => {
    if (event.button !== 0 || onVideoControl(event)) return;
    const card = cardFromEvent(event);
    if (!card) return;
    const start = card.matches('affine-edgeless-note') ? textHitAt(card, event.clientX, event.clientY) : null;
    draggedText = false;
    draggedView = false;
    if (start) textDrag = { card, start, id: event.pointerId };
    else {
      cardPan = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY };
      document.getSelection()?.removeAllRanges();
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    selectCard(card);
  }, true);
  listen('pointermove', event => {
    if (cardPan && event.pointerId === cardPan.id) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!draggedView) {
        if (Math.hypot(event.clientX - cardPan.startX, event.clientY - cardPan.startY) <= 3) return;
        draggedView = true;
        // Preserve the media target for clicks; capture only after dragging starts.
        editor.setPointerCapture(event.pointerId);
      }
      const dx = event.clientX - cardPan.x;
      const dy = event.clientY - cardPan.y;
      root.gfx.viewport.applyDeltaCenter(-dx / root.gfx.viewport.zoom, -dy / root.gfx.viewport.zoom);
      cardPan.x = event.clientX;
      cardPan.y = event.clientY;
      return;
    }
    if (!textDrag || event.pointerId !== textDrag.id || !(event.buttons & 1)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    updateTextSelection(event.clientX, event.clientY);
  }, true);
  const finishDrag = event => {
    textDrag = null;
    if (!cardPan || event.pointerId !== cardPan.id) return;
    cardPan = null;
    if (editor.hasPointerCapture(event.pointerId)) editor.releasePointerCapture(event.pointerId);
  };
  listen('pointerup', finishDrag, true);
  listen('pointercancel', finishDrag, true);
  listen('blur', () => { textDrag = null; cardPan = null; });
  listen('mousedown', event => {
    if (event.button !== 0 || onVideoControl(event)) return;
    const card = cardFromEvent(event);
    if (card?.matches('affine-edgeless-note')) event.stopPropagation();
  }, true);
  listen('selectstart', event => {
    if (cardFromEvent(event)?.matches('affine-edgeless-note')) event.stopPropagation();
  }, true);
  listen('click', event => {
    if (onVideoControl(event)) return;
    const card = cardFromEvent(event);
    if (!card) return;
    event.stopPropagation();
    if (!draggedText && !draggedView) selectCard(card);
  }, true);
  listen('dblclick', event => {
    if (onVideoControl(event)) return;
    if (!cardFromEvent(event)) event.preventDefault();
    event.stopPropagation();
  }, true);
  listen('copy', event => {
    const selected = String(window.getSelection() || '');
    const note = root.gfx.selection.selectedElements.find(element => element.flavour === 'affine:note');
    const text = selected || (note ? noteTextOf(note) : '');
    if (!text || !event.clipboardData) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    event.clipboardData.setData('text/plain', text);
  }, true);
  const hideHandles = () => {
    const selectedRect = editor.querySelector('edgeless-selected-rect');
    if(!viewing) {
      selectedRect?.shadowRoot?.querySelector('#pv-readonly-selection')?.remove();
      return;
    }
    if (!selectedRect?.shadowRoot || selectedRect.shadowRoot.querySelector('#pv-readonly-selection')) return;
    const style = document.createElement('style');
    style.id = 'pv-readonly-selection';
    style.textContent = '.handle { display: none !important; }';
    selectedRect.shadowRoot.append(style);
  };
  root.gfx.selection.slots.updated.on(() => requestAnimationFrame(hideHandles));
  hideHandles();
}

function installMediaWindowOpen() {
  window.addEventListener('dblclick', event => {
    if (event.composedPath().some(node =>
      node instanceof Element && node.matches('.pv-video-controls'))) return;
    const card = event.composedPath().find(node =>
      node instanceof Element && node.matches('affine-edgeless-image, affine-edgeless-attachment'));
    if (!card) return;
    if(!previewKindFor(card.model))return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void openMediaViewer(doc, card.getAttribute('data-block-id'), {
      onOpen: () => card.querySelector('video')?.pause(),
      getName:block=>block.name || sourceNames.get(block.sourceId),
      getDescriptor:block=>canvasBlobSource.descriptor(block.sourceId),
      cardId:activeCardId,getAssetId:block=>linkedAssets[block.sourceId],
    });
  }, true);
}

function wheelPixels(event, pageSize, axis = 'y') {
  const delta = axis === 'x' ? event.deltaX : event.deltaY;
  const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 :
    event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? pageSize : 1;
  return delta * unit;
}

function installEmbeddedWheel(root) {
  document.querySelector('#canvas').addEventListener('wheel', event => {
    event.stopImmediatePropagation();
    if (event.composedPath().some(node => node instanceof Element &&
      node.matches('editor-menu-content.highlight-panel, editor-menu-content.paragraph-panel, .pv-color-panel'))) return;
    // Leave ordinary wheel gestures to Chromium's native scroll chaining.
    // Only canvas zoom needs to cancel the browser's default action.
    if (event.ctrlKey) {
      event.preventDefault();
      zoomCanvasOnWheel(root, event);
    }
  }, { capture: true, passive: false });
}

function zoomCanvasOnWheel(root, event) {
  const rect = root.getBoundingClientRect();
  const viewport = root.gfx.viewport;
  const [x, y] = viewport.toModelCoord(event.clientX - rect.left, event.clientY - rect.top);
  const zoom = Math.max(0.1, Math.min(4,
    viewport.zoom * Math.exp(-wheelPixels(event, rect.height) * 0.0015)));
  viewport.setZoom(zoom, { x, y });
}

async function waitForRoot(editor) {
  for (let attempt = 0; attempt < 120; attempt++) {
    const root = editor.querySelector('affine-edgeless-root');
    if (root?.gfx?.tool && root.gfx.viewport) return root;
    await new Promise(resolve => requestAnimationFrame(resolve));
  }
  throw new Error('画布工具未能初始化');
}

function installMinimalControls(editor, root) {
  const toolbar = document.querySelector('.canvas-tools');
  const buttons = [...toolbar.querySelectorAll('[data-tool]')];
  const deleteButton = document.querySelector('#delete-selected');
  const tableButton = document.querySelector('#create-table');
  let activeTool = 'pan';
  let holdingSpace = false;
  let spaceUsedForPan = false;
  let spaceTextTarget = null;
  let canvasPan = null;
  let suppressPanClick = false;
  let selectionBeforePress = new Set();
  let blankPointerDown = null;
  let activeNotePointer = null;
  let tablePointerDown = null;
  let textPointerDown = null;
  let activeTextId = null;
  let activeTableId = null;
  let lastTextRange = null;
  // BlockSuite may insert an empty paragraph before a dedicated database.
  // A card with actual paragraph text stays a text card even if it also has
  // embedded databases among its direct children.
  const isTableNote = id => {
    const children = doc.getBlockById(id)?.children ?? [];
    return children.some(child => child.flavour === 'affine:database') &&
      !children.some(child => child.flavour === 'affine:paragraph' && child.text?.length > 0);
  };
  const tableNoteFromEvent = event => {
    const note = event.composedPath().find(node => node instanceof Element && node.matches('affine-edgeless-note'));
    return note && isTableNote(note.getAttribute('data-block-id')) ? note : null;
  };
  const syncTableEditing = () => {
    const selectedIds = new Set(root.gfx.selection.selectedElements.map(element => element.id));
    for (const table of editor.querySelectorAll('affine-edgeless-note[data-pv-table]')) {
      const active = table.contains(document.activeElement) &&
        document.activeElement.matches('textarea, input, .inline-editor');
      table.toggleAttribute('data-pv-table-editing',
        activeTableId === table.getAttribute('data-block-id') ||
        selectedIds.has(table.getAttribute('data-block-id')) && active);
    }
  };
  let tableEditingSyncScheduled = false;
  const scheduleTableEditingSync = () => {
    if (tableEditingSyncScheduled) return;
    tableEditingSyncScheduled = true;
    requestAnimationFrame(() => {
      tableEditingSyncScheduled = false;
      syncTableEditing();
    });
  };
  editor.addEventListener('focusin', scheduleTableEditingSync, true);
  editor.addEventListener('focusout', scheduleTableEditingSync, true);
  document.addEventListener('selectionchange', scheduleTableEditingSync);
  root.gfx.selection.slots.updated.on(scheduleTableEditingSync);
  function updateNoteControls() {
    const selected = root.gfx.selection.selectedElements;
    const notes = selected.filter(element => element.flavour === 'affine:note');
    const selectedIds = new Set(notes.map(note => note.id));
    const framedNoteId = notes.length === 1 && selected.length === 1 &&
      activeTextId !== notes[0].id && activeTableId !== notes[0].id ? notes[0].id : null;
    for (const view of editor.querySelectorAll('affine-edgeless-note')) {
      const id = view.getAttribute('data-block-id');
      view.toggleAttribute('data-pv-selected', selectedIds.has(id));
      view.toggleAttribute('data-pv-table', isTableNote(id));
      view.toggleAttribute('data-pv-frame', framedNoteId === id);
    }
    const selectedRect = editor.querySelector('edgeless-selected-rect');
    selectedRect?.toggleAttribute('data-pv-note-frame', !!framedNoteId);
    if (selectedRect?.shadowRoot && !selectedRect.shadowRoot.querySelector('#pv-note-frame-gap')) {
      const style = document.createElement('style');
      style.id = 'pv-note-frame-gap';
      style.textContent = `
        :host([data-pv-note-frame]) .affine-edgeless-selected-rect {
          border-color: transparent !important;
          outline: 2px solid #1e96eb;
          outline-offset: 8px;
        }
        :host([data-pv-note-frame]) .handle[aria-label="top-left"] { translate: -8px -8px; }
        :host([data-pv-note-frame]) .handle[aria-label="top"] { translate: 0 -8px; }
        :host([data-pv-note-frame]) .handle[aria-label="top-right"] { translate: 8px -8px; }
        :host([data-pv-note-frame]) .handle[aria-label="right"] { translate: 8px 0; }
        :host([data-pv-note-frame]) .handle[aria-label="bottom-right"] { translate: 8px 8px; }
        :host([data-pv-note-frame]) .handle[aria-label="bottom"] { translate: 0 8px; }
        :host([data-pv-note-frame]) .handle[aria-label="bottom-left"] { translate: -8px 8px; }
        :host([data-pv-note-frame]) .handle[aria-label="left"] { translate: -8px 0; }
      `;
      selectedRect.shadowRoot.append(style);
    }
  }
  const dragPreview = document.createElement('div');
  dragPreview.className = 'note-drag-preview';
  document.querySelector('#canvas').append(dragPreview);

  // Keep the root focusable for BlockSuite selection, but never let it accept
  // native text outside a real rich-text child.
  // Chromium delivers input to the outer editing host even when the native
  // selection is inside a paragraph. Refocusing a nested editor cancels IME.
  const hasTextSelection = () => {
    const anchor = document.getSelection()?.anchorNode;
    const element = anchor instanceof Element ? anchor : anchor?.parentElement;
    return !!activeTextId && element?.closest('affine-edgeless-note')?.getAttribute('data-block-id') === activeTextId;
  };
  const atStartOfFirstTextParagraph = () => {
    if (!activeTextId) return false;
    const native = document.getSelection();
    if (!native?.isCollapsed || !native.rangeCount) return false;
    const note = editor.querySelector(`affine-edgeless-note[data-block-id="${activeTextId}"]`);
    const inline = note?.querySelector('affine-paragraph .inline-editor');
    if (!inline?.contains(native.anchorNode)) return false;
    const beforeCaret = document.createRange();
    beforeCaret.selectNodeContents(inline);
    beforeCaret.setEnd(native.anchorNode, native.anchorOffset);
    return beforeCaret.toString().replace(/\u200b/g, '').length === 0;
  };
  let composing = false;
  root.addEventListener('compositionstart', () => { composing = true; }, true);
  const restoreEditingFocus = () => requestAnimationFrame(() => {
    if (!activeTextId || composing) return;
    const note = editor.querySelector(`affine-edgeless-note[data-block-id="${activeTextId}"]`);
    const anchor = document.getSelection()?.anchorNode;
    const anchorElement = anchor instanceof Element ? anchor : anchor?.parentElement;
    const paragraph = anchorElement?.closest('affine-paragraph');
    const inlineEditor = paragraph?.closest('affine-edgeless-note') === note
      ? paragraph.querySelector('.inline-editor')
      : [...(note?.querySelectorAll('affine-paragraph') ?? [])].at(-1)?.querySelector('.inline-editor');
    if (inlineEditor && document.activeElement !== inlineEditor) inlineEditor.focus({ preventScroll: true });
  });
  root.addEventListener('compositionend', () => { composing = false; restoreEditingFocus(); }, true);
  root.addEventListener('input', event => {
    if (activeTextId && !composing && !event.isComposing) restoreEditingFocus();
  }, true);
  root.addEventListener('focusin', event => {
    if (event.target === root && activeTextId && !composing) restoreEditingFocus();
  }, true);
  root.addEventListener('beforeinput', event => {
    if (event.target === root && !activeTextId && !hasTextSelection() && !event.isComposing) event.preventDefault();
  });
  // Keep BlockSuite's editing and undo machinery, but disable its built-in
  // letter/space tool switches. The visible toolbar is the only tool switcher.
  if (root.keyboardManager) {
    root.keyboardManager._setEdgelessTool = () => {};
    root.keyboardManager._space = () => {};
  }

  // BlockSuite's geometry picker can choose a lower card when notes, images,
  // and attachments overlap. Prefer the topmost visible DOM card.
  // Its default double click can also insert a second text object.
  function patchDefaultTool() {
    const tool = root.gfx.tool.currentTool$.peek();
    if (tool?.toolName !== 'default' || tool.__pvDoubleClickPatched) return;
    tool.__pvDoubleClickPatched = true;
    const nativePick = tool._pick.bind(tool);
    tool._pick = (x, y, options) => {
      const rect = root.getBoundingClientRect();
      const topCard = document.elementsFromPoint(rect.left + x, rect.top + y)
        .map(element => element.closest('affine-edgeless-note, affine-edgeless-image, affine-edgeless-attachment, affine-edgeless-text'))
        .find(Boolean);
      const id = topCard?.getAttribute('data-block-id');
      if (id) return doc.getBlockById(id) ?? nativePick(x, y, options);
      return nativePick(x, y, options);
    };
    tool.doubleClick = () => {};
    const nativeDragType = tool._determineDragType.bind(tool);
    tool._determineDragType = event => {
      const picked = tool._pick(event.x, event.y);
      if (picked && !selectionBeforePress.has(picked.id)) {
        root.gfx.selection.clear();
        return 'selecting';
      }
      // Do not let an overlapping unselected card replace a selected card
      // and immediately move in the same gesture.
      const type = nativeDragType(event);
      if (type === 'content-moving' && root.gfx.selection.selectedElements.some(element => !selectionBeforePress.has(element.id))) {
        root.gfx.selection.clear();
        return 'selecting';
      }
      return type;
    };
  }
  patchDefaultTool();

  // BlockSuite mounts database menus under the editor host rather than under
  // the card. Let the menu handle its own pointer events before they reach the
  // canvas tool, which otherwise treats a click above the card as deselection.
  const protectedMenus = new WeakSet();
  const protectCanvasMenu = menu => {
    if (protectedMenus.has(menu)) return;
    protectedMenus.add(menu);
    for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick']) {
      menu.addEventListener(type, event => event.stopPropagation());
    }
  };
  new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) {
      if (!(node instanceof Element)) continue;
      if (node.matches('affine-menu')) protectCanvasMenu(node);
      for (const menu of node.querySelectorAll('affine-menu')) protectCanvasMenu(menu);
    }
  }).observe(editor, { childList: true, subtree: true });
  for (const menu of editor.querySelectorAll('affine-menu')) protectCanvasMenu(menu);

  // 编辑某个文本框时，把其他文本框临时设为不可编辑。
  //
  // 原因（真实操作日志确认）：拖拽选择文字时，浏览器会把原生选区从当前文本框一路
  // 延伸进其他文本框——那些框同样带 contenteditable。于是选区跨框，按 Backspace
  // 就会跨框删除，留下子块为空、无法输入也无法删除的结构性损坏文本框。
  // 之前只在 selectstart 里判断「起点是否在活动文本框」是不够的：拖拽过程中浏览器
  // 不会重新触发 selectstart，终点完全没被约束。
  //
  // 非活动文本框设为 contenteditable="false"，离开编辑时恢复原状。
  // 拖选时再把其他卡片设为 inert，阻止浏览器先绘制跨卡片选区再由
  // selectionchange 收回，造成按住鼠标时的闪烁。
  const sealedNotes = new Set();
  const dragLockedNotes = new Map();
  function lockOtherNotesForTextDrag() {
    if (!activeTextId) return;
    for (const view of editor.querySelectorAll('affine-edgeless-note')) {
      if (view.getAttribute('data-block-id') === activeTextId) continue;
      if (!dragLockedNotes.has(view)) dragLockedNotes.set(view, view.inert);
      view.inert = true;
      view.setAttribute('data-pv-drag-locked', '');
    }
  }
  function unlockNotesAfterTextDrag() {
    for (const [view, wasInert] of dragLockedNotes) {
      view.inert = wasInert;
      view.removeAttribute('data-pv-drag-locked');
    }
    dragLockedNotes.clear();
  }
  function sealOtherNotes(activeId) {
    for (const view of editor.querySelectorAll('affine-edgeless-note')) {
      const id = view.getAttribute('data-block-id');
      if (!id || id === activeId) continue;
      if (view.getAttribute('contenteditable') === 'false') continue;
      sealedNotes.add(view);
      view.setAttribute('contenteditable', 'false');
      view.setAttribute('data-pv-sealed', '');
    }
  }
  function unsealNotes() {
    for (const view of sealedNotes) {
      if (view.isConnected) {
        view.removeAttribute('contenteditable');
        view.removeAttribute('data-pv-sealed');
      }
    }
    sealedNotes.clear();
  }
  function tableContentFits(note, content) {
    if (!note?.hasAttribute('data-pv-table') || !content?.offsetHeight) return false;
    const database = note.querySelector('affine-database');
    if (!database) return false;
    const rect = content.getBoundingClientRect();
    const scale = rect.height / content.offsetHeight;
    const visibleBottom = rect.top + (content.clientTop + content.clientHeight) * scale;
    return database.getBoundingClientRect().bottom + content.scrollTop * scale <= visibleBottom + 1;
  }
  let sealingScheduled = false;
  new MutationObserver(() => {
    if (dragLockedNotes.size) lockOtherNotesForTextDrag();
    if ((!activeTextId && !activeTableId) || sealingScheduled) return;
    sealingScheduled = true;
    requestAnimationFrame(() => {
      sealingScheduled = false;
      if (activeTextId || activeTableId) sealOtherNotes(activeTextId ?? activeTableId);
    });
  }).observe(editor, { childList: true, subtree: true });
  editor.addEventListener('scroll', event => {
    const content = event.target;
    if (!(content instanceof Element) || !content.matches('.edgeless-note-page-content')) return;
    const note = content.closest('affine-edgeless-note');
    if (note?.hasAttribute('data-pv-table')) {
      if (content.scrollTop && tableContentFits(note, content)) content.scrollTop = 0;
    } else if (content.scrollLeft) content.scrollLeft = 0;
  }, true);

  // 安全网：无论从哪条路径退出编辑，都不能让文本框被永久封印。
  // 以编辑器实际是否仍处于编辑态为准，而不是依赖每个出口都记得解封。
  setInterval(() => {
    if (!sealedNotes.size) return;
    const stillEditing = activeTextId
      && editor.querySelector(`affine-edgeless-note[data-block-id="${activeTextId}"]`)?.hasAttribute('data-pv-editing') ||
      activeTableId && editor.querySelector(`affine-edgeless-note[data-block-id="${activeTableId}"]`)?.hasAttribute('data-pv-table-editing');
    if (!stillEditing) unsealNotes();
  }, 500);

  function leaveEditing() {
    const wasEditing = Boolean(activeTextId || activeTableId || root.gfx.selection.editing);
    unlockNotesAfterTextDrag();
    unsealNotes();
    if (activeTextId) editor.querySelector(`affine-edgeless-note[data-block-id="${activeTextId}"]`)?.removeAttribute('data-pv-editing');
    if (activeTableId) editor.querySelector(`affine-edgeless-note[data-block-id="${activeTableId}"]`)?.removeAttribute('data-pv-table-editing');
    activeTextId = null;
    activeTableId = null;
    lastTextRange = null;
    root.gfx.std.selection.setGroup('note', []);
    document.getSelection()?.removeAllRanges();
    // Clear both current and cached surface editing selections before the next gesture/tool.
    if (wasEditing) {
      root.gfx.selection.clear();
      root.gfx.selection.clearLast();
    }
  }
  function enterTableEditing(note) {
    const id = note.getAttribute('data-block-id');
    if (!id) return;
    if (!['select', 'pan'].includes(activeTool)) setTool('select');
    if (activeTextId) leaveEditing();
    else if (activeTableId && activeTableId !== id) {
      unsealNotes();
      editor.querySelector(`affine-edgeless-note[data-block-id="${activeTableId}"]`)?.removeAttribute('data-pv-table-editing');
    }
    activeTableId = id;
    sealOtherNotes(id);
    note.setAttribute('data-pv-table-editing', '');
    updateNoteControls();
  }
  function placeCaretAtNoteEnd(id) {
    const note = editor.querySelector(`affine-edgeless-note[data-block-id="${id}"]`);
    const lastParagraph = [...(note?.querySelectorAll('affine-paragraph') ?? [])].at(-1);
    const paragraphId = lastParagraph?.getAttribute('data-block-id');
    const inlineEditor = lastParagraph?.querySelector('.inline-editor');
    if (!paragraphId || !inlineEditor) return false;
    const paragraph = doc.getBlockById(paragraphId);
    const selection = root.gfx.std.selection;
    // The browser's editing host must be the paragraph itself. Focusing the
    // canvas root leaves a model selection but no visible caret and can break
    // an IME composition into separate Latin keystrokes.
    selection.setGroup('note', [selection.create('text', {
      from: { blockId: paragraphId, index: paragraph?.text?.length ?? 0, length: 0 },
      to: null,
    })]);
    // Keep the native caret in the same paragraph as BlockSuite's model
    // selection. A click on the card background otherwise moves it to a DIV.
    const walker = document.createTreeWalker(inlineEditor, NodeFilter.SHOW_TEXT);
    let lastText = null;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) lastText = node;
    const range = document.createRange();
    if (lastText) range.setStart(lastText, lastText.textContent.length);
    else range.selectNodeContents(inlineEditor);
    range.collapse(true);
    const nativeSelection = document.getSelection();
    nativeSelection.removeAllRanges();
    nativeSelection.addRange(range);
    lastTextRange = { noteId: id, range: range.cloneRange() };
    inlineEditor.focus({ preventScroll: true });
    return true;
  }
  function enterEditing(id) {
    if (!id) return;
    if (!['select', 'pan'].includes(activeTool)) setTool('select');
    leaveEditing();
    activeTextId = id;
    root.gfx.selection.set({ elements: [id], editing: true });
    sealOtherNotes(id);
    const focusInput = () => {
      if (activeTextId !== id) return true;
      const note = editor.querySelector(`affine-edgeless-note[data-block-id="${id}"]`);
      note?.setAttribute('data-pv-editing', '');
      const content = note?.querySelector('.edgeless-note-page-content');
      if (content) content.scrollLeft = 0;
      updateNoteControls();
      if (!placeCaretAtNoteEnd(id)) return false;
      // BlockSuite may refocus the canvas as the double-click dispatch ends.
      // Restore the paragraph focus once after that dispatch, before typing.
      requestAnimationFrame(() => {
        if (activeTextId !== id || composing) return;
        const paragraph = [...note.querySelectorAll('affine-paragraph')].at(-1);
        paragraph?.querySelector('.inline-editor')?.focus({ preventScroll: true });
      });
      return true;
    };
    if (!focusInput()) {
      const observer = new MutationObserver(() => {
        if (focusInput()) observer.disconnect();
      });
      observer.observe(editor, { childList: true, subtree: true });
      setTimeout(() => observer.disconnect(), 5000);
    }
  }
  function createNote(clientX, clientY, width, height) {
    const rect = root.getBoundingClientRect();
    const [x, y] = root.gfx.viewport.toModelCoord(clientX - rect.left, clientY - rect.top);
    const zoom = root.gfx.viewport.zoom;
    const modelWidth = Math.max(NOTE_MIN_WIDTH, width / zoom);
    const modelHeight = Math.max(NOTE_MIN_HEIGHT, height / zoom);
    doc.captureSync();
    const id = doc.addBlock('affine:note', {
      xywh: JSON.stringify([x, y, modelWidth, modelHeight]),
      displayMode: 'edgeless',
    }, doc.root.id);
    doc.addBlock('affine:paragraph', { type: 'text', text: new Text() }, id);
    const note = doc.getBlockById(id);
    doc.updateBlock(note, () => {
      note.edgeless.collapse = true;
      note.edgeless.collapsedHeight = modelHeight;
    });
    doc.captureSync();
    setTool('select');
    enterEditing(id);
    return id;
  }

  function createTable(target=null) {
    const rect = root.getBoundingClientRect();
    const zoom = root.gfx.viewport.zoom;
    const [x, y] = target?.xywh || root.gfx.viewport.toModelCoord(rect.width / 2 - 380 * zoom, rect.height / 2 - 180 * zoom);
    const databaseService = root.gfx.std.getService('affine:database');
    if (!databaseService) { setStatus('表格组件尚未加载'); return; }
    doc.captureSync();
    const noteId = doc.addBlock('affine:note', {
      xywh: JSON.stringify([x, y, 760, 360]),
      displayMode: 'edgeless',
    }, doc.root.id);
    const databaseId = doc.addBlock('affine:database', { title: new Text('表格') }, noteId);
    const database = doc.getBlockById(databaseId);
    try {
      databaseService.databaseViewInitEmpty(database, 'table');
      database.columns[0].name = '标题';
      databaseService.addColumn(database, 'end', { name: '列 2', type: 'rich-text', data: {} });
      databaseService.addColumn(database, 'end', { name: '列 3', type: 'rich-text', data: {} });
      databaseService.applyColumnUpdate(database);
      for (let i = 0; i < 3; i++) doc.addBlock('affine:paragraph', { text: new Text() }, databaseId);
      const note = doc.getBlockById(noteId);
      doc.updateBlock(note, () => {
        note.edgeless.collapse = true;
        note.edgeless.collapsedHeight = 360;
      });
    } catch (error) {
      console.error('创建表格失败', error);
      doc.deleteBlock(noteId);
      setStatus(`创建表格失败：${error.message}`);
      return;
    }
    doc.captureSync();
    setTool('select');
    root.gfx.selection.set({ elements: [noteId], editing: false });
    requestAnimationFrame(() => {
      root.gfx.selection.set({ elements: [noteId], editing: false });
      updateNoteControls();
    });
    setStatus('已新建表格卡片');
    return noteId;
  }

  function connectCreated(panel,id,target){
    if(!id||!target)return;
    root.service.updateElement(panel.connector.id,{target:{id,position:target.position}});
    doc.captureSync();
  }
  customizeConnectorMenu({
    readonly:()=>viewing,
    note:panel=>{
      const target=panel._getTargetXYWH(480,92);
      if(!target)return;
      const rect=root.getBoundingClientRect(),[x,y]=root.gfx.viewport.toViewCoord(target.xywh[0],target.xywh[1]),zoom=root.gfx.viewport.zoom;
      connectCreated(panel,createNote(rect.left+x,rect.top+y,480*zoom,92*zoom),target);
    },
    table:panel=>{
      const target=panel._getTargetXYWH(760,360);
      if(target)connectCreated(panel,createTable(target),target);
    },
    media:panel=>{
      pendingMediaPlacement={doc,service:root.service,connectorId:panel.connector.id,targetForSize:(w,h)=>panel._getTargetXYWH(w,h)};
      document.querySelector('#media-file').click();
    }
  });

  tableButton.addEventListener('click', () => {
    createTable();
    tableButton.blur();
  });

  const isEditingText = event => event.composedPath().some(node =>
    node instanceof Element && (
      node.matches('input, textarea, .inline-editor, [contenteditable="true"]') &&
      node !== root
    )
  );
  const noteFromEvent = event => event.composedPath().find(node =>
    node instanceof Element && node.matches('affine-edgeless-note')
  );
  const pointHitsNoteText = (event, note) => {
    for (const inlineEditor of note.querySelectorAll('.inline-editor')) {
      const walker = document.createTreeWalker(inlineEditor, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent.length) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of range.getClientRects()) {
          if (event.clientX >= rect.left && event.clientX <= rect.right &&
            event.clientY >= rect.top && event.clientY <= rect.bottom) return true;
        }
      }
    }
    return false;
  };
  const pointHitsNoteParagraph = (event, note) => [...note.querySelectorAll('affine-paragraph')].some(paragraph => {
    const rect = paragraph.getBoundingClientRect();
    return event.clientX >= rect.left && event.clientX <= rect.right &&
      event.clientY >= rect.top && event.clientY <= rect.bottom;
  });
  const isFormatBarEvent = event => event.composedPath().some(node =>
    node instanceof Element && node.matches('affine-format-bar-widget')
  );
  const isBlank = event => event.composedPath().some(node =>
    node instanceof Element && node.matches('.edgeless-background, affine-surface, gfx-viewport, canvas')
  ) && !event.composedPath().some(node =>
    node instanceof Element && node.matches('affine-edgeless-note, affine-edgeless-text, affine-edgeless-image, affine-edgeless-attachment, .edgeless-toolbar')
  );
  function showTool(name) {
    activeTool = name;
    setStatus(`当前工具：${{
      select: '选择', pan: '移动', note: '富文本框',
      connector: '曲线', brush: '画笔', eraser: '橡皮擦',
    }[name]}`);
    for (const button of buttons) {
      const selected = button.dataset.tool === name;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
  }
  function setTool(name) {
    const options = {
      select: ['default'],
      pan: viewing ? ['pan', {panning:false}] : ['default'],
      note: ['default'],
      connector: ['connector', { mode: 2 }], // BlockSuite ConnectorMode.Curve
      brush: ['brush'],
      eraser: ['eraser'],
    }[name];
    if (!options) return;
    leaveEditing();
    root.gfx.tool.setTool(...options);
    patchDefaultTool();
    showTool(name);
  }
  toolbar.addEventListener('click', event => {
    const button = event.target instanceof Element && event.target.closest('[data-tool]');
    if (!button) return;
    setTool(button.dataset.tool);
    button.blur();
  });
  root.__pvSetTool=setTool;
  setTool('pan');
  // Native actions such as finishing a curve can return to the default tool.
  // Keep our toolbar synchronized while preserving its custom Move/Note modes.
  root.gfx.tool.currentToolName$.subscribe(toolName => {
    patchDefaultTool();
    if (toolName === 'default') {
      if (!['select', 'pan', 'note'].includes(activeTool)) showTool('select');
    } else if (['pan', 'connector', 'brush', 'eraser'].includes(toolName)) {
      showTool(toolName);
    }
  });

  // Decide the gesture from the selection that existed before this press.
  // Space always pans, including inside a rich-text or database editor.
  window.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !event.composedPath().includes(editor)) return;
    suppressPanClick = false;
    selectionBeforePress = new Set(root.gfx.selection.selectedElements.map(element => element.id));
    const card = event.composedPath().find(node => node instanceof Element &&
      node.matches('affine-edgeless-note, affine-edgeless-text, affine-edgeless-image, affine-edgeless-attachment'));
    const id = card?.getAttribute('data-block-id');
    const controls = event.composedPath().some(node => node instanceof Element &&
      node.matches('button, input, textarea, .canvas-tools, affine-format-bar-widget, affine-menu, .pv-video-controls, [data-note-resize], .handle[aria-label]'));
    const editingCard = id && (id === activeTextId || id === activeTableId);
    if (!holdingSpace && (viewing || activeTool !== 'pan' || !id || selectionBeforePress.has(id) || editingCard || controls)) return;
    if (holdingSpace && event.composedPath().some(node => node instanceof Element &&
      node.matches('.canvas-tools, affine-format-bar-widget, affine-menu'))) return;
    event.preventDefault();event.stopImmediatePropagation();
    if (!holdingSpace) leaveEditing();
    canvasPan = {id:event.pointerId, x:event.clientX, y:event.clientY, startX:event.clientX, startY:event.clientY, cardId:id, space:holdingSpace, dragged:false};
    blankPointerDown = null;tablePointerDown = null;textPointerDown = null;activeNotePointer = null;
  }, true);
  window.addEventListener('pointermove', event => {
    if (!canvasPan || canvasPan.id !== event.pointerId) return;
    event.preventDefault();event.stopImmediatePropagation();
    if (!canvasPan.dragged) {
      if (Math.hypot(event.clientX-canvasPan.startX,event.clientY-canvasPan.startY) <= 3) return;
      canvasPan.dragged = true;
      editor.setPointerCapture(event.pointerId);
      if (canvasPan.space) spaceUsedForPan = true;
      else root.gfx.selection.clear();
    }
    root.gfx.viewport.applyDeltaCenter(-(event.clientX-canvasPan.x)/root.gfx.viewport.zoom, -(event.clientY-canvasPan.y)/root.gfx.viewport.zoom);
    canvasPan.x = event.clientX;canvasPan.y = event.clientY;
  }, true);
  const finishCanvasPan = event => {
    if (!canvasPan || canvasPan.id !== event.pointerId) return;
    event.preventDefault();event.stopImmediatePropagation();
    const press = canvasPan;canvasPan = null;
    suppressPanClick = press.dragged || press.space;
    if (editor.hasPointerCapture(event.pointerId)) editor.releasePointerCapture(event.pointerId);
    if (!press.space && !press.dragged && press.cardId && event.type === 'pointerup') {
      root.gfx.selection.set({elements:[press.cardId],editing:false});updateNoteControls();
    }
    if (!holdingSpace) toolbar.classList.remove('panning');
  };
  window.addEventListener('pointerup', finishCanvasPan, true);
  window.addEventListener('pointercancel', finishCanvasPan, true);
  window.addEventListener('click', event => {
    if (!suppressPanClick || !event.composedPath().includes(editor)) return;
    suppressPanClick = false;event.preventDefault();event.stopImmediatePropagation();
  }, true);

  // BlockSuite 0.19 registers many canvas shortcuts even when its toolbar is
  // hidden. Keep only Space (temporary pan) and Ctrl+Z (native editor undo).
  window.addEventListener('keydown', event => {
    if(document.querySelector('.pv-attachment-menu'))return;
    if (composing || event.isComposing || event.keyCode === 229) return;
    if (holdingSpace && !spaceUsedForPan && spaceTextTarget && event.code !== 'Space' &&
      event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) insertBufferedSpace();
    if (event.code === 'Space' && !event.ctrlKey && !event.metaKey && !event.altKey &&
      (event.composedPath().includes(editor) || event.composedPath().includes(document.querySelector('#canvas')) ||
        event.target === document.body || event.target === document.documentElement)) {
      event.preventDefault();event.stopImmediatePropagation();
      if (!holdingSpace) {
        holdingSpace = true;spaceUsedForPan = false;
        spaceTextTarget = event.composedPath().find(node => node instanceof Element && node !== root &&
          node.matches('.inline-editor, input, textarea, [contenteditable="true"]')) ?? null;
        if (!spaceTextTarget && hasTextSelection()) {
          const anchor = document.getSelection()?.anchorNode;
          spaceTextTarget = (anchor instanceof Element ? anchor : anchor?.parentElement)?.closest('.inline-editor') ?? null;
        }
        toolbar.classList.add('panning');
      }
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (doc.canUndo) doc.undo();
      return;
    }
    if (event.key === 'Backspace' && atStartOfFirstTextParagraph()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (activeTextId || activeTableId || hasTextSelection() || isEditingText(event) && (
      activeTextId || tableNoteFromEvent(event) ||
      event.target instanceof Element && event.target.closest('input, textarea')
    )) return;
    if (event.target instanceof Element && event.target.closest('button')) return;
    if (event.key === 'Delete' && !event.ctrlKey && !event.metaKey &&
      !event.altKey && !event.shiftKey && root.gfx.selection.selectedElements.length) {
      event.preventDefault();
      event.stopImmediatePropagation();
      deleteSelected();
      return;
    }
    // Stop the preset's V/T/S/etc. shortcuts without making the canvas root
    // contenteditable consume those letters as stray document text.
    //
    // 注意：必须放行 Ctrl/Cmd 组合键。这里处在 window 捕获阶段，一旦对 c/v/x
    // 调用 stopImmediatePropagation()，事件就永远到不了编辑器，浏览器的原生
    // 复制/剪切/粘贴不会执行——表现为「Ctrl+C 无效」。
    const isClipboardCombo = (event.ctrlKey || event.metaKey) && ['c', 'v', 'x'].includes(event.key.toLowerCase());
    if (isClipboardCombo) return;
    if (event.key.length === 1 || ['Backspace', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      if (!event.ctrlKey && !event.metaKey && !event.altKey) event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  // 把编辑器内的复制/剪切/粘贴接到系统剪贴板。
  //
  // 背景（已实测）：BlockSuite 自己拦截了 copy/paste/cut 事件，调用 preventDefault()
  // 并清空 clipboardData，改用它内部的剪贴板。结果是不写入系统剪贴板、粘贴也拿不到
  // 内容——表现为「Ctrl+C / Ctrl+V 无效」。
  //
  // 方案选择（已实测）：navigator.clipboard.writeText 在文档未聚焦时抛
  // NotAllowedError，execCommand('copy') 同样要求文档聚焦并返回 false。而
  // copy/paste 事件自带的 clipboardData **不需要焦点、也不需要权限**，是原生机制。
  // 因此以事件 clipboardData 为主，navigator.clipboard 仅作补充。
  {
    // 复制 / 剪切：把选中文字写入 clipboardData。
    // 不阻断默认行为，BlockSuite 的内部剪贴板照常工作（画布内复制粘贴仍可用）。
    const writeClipboardData = event => {
      const text = String(document.getSelection() ?? '');
      if (!text || !event.clipboardData) return;
      try { event.clipboardData.setData('text/plain', text); } catch { /* 忽略 */ }
    };
    editor.addEventListener('copy', event => {
      writeClipboardData(event);
      // 额外尝试系统剪贴板 API：成功会更稳，失败不影响上面的原生写入。
      const text = String(document.getSelection() ?? '');
      if (text) navigator.clipboard?.writeText?.(text).catch(() => {});
    }, true);

    editor.addEventListener('cut', event => {
      const text = String(document.getSelection() ?? '');
      if (!text || !activeTextId) return;
      writeClipboardData(event);
      navigator.clipboard?.writeText?.(text).catch(() => {});
      // 阻断默认行为并自行删除，避免默认删除与 BlockSuite 内部处理叠加成删两次。
      event.preventDefault();
      event.stopImmediatePropagation();
      const noteEl = editor.querySelector(`affine-edgeless-note[data-block-id="${activeTextId}"]`);
      const paragraphEl = noteEl?.querySelector('affine-paragraph');
      const paragraphId = paragraphEl?.getAttribute('data-block-id');
      const paragraph = paragraphId ? doc.getBlockById(paragraphId) : null;
      if (!paragraph?.text) return;
      const full = String(paragraph.text);
      const range = (() => {
        const selection = document.getSelection();
        if (!selection || !selection.rangeCount) return null;
        const r = selection.getRangeAt(0);
        const nodeOf = n => (n instanceof Element ? n : n?.parentElement);
        if (nodeOf(r.startContainer)?.closest?.('affine-edgeless-note')?.getAttribute('data-block-id') !== activeTextId) return null;
        return { from: Math.min(r.startOffset, full.length), to: Math.min(r.endOffset, full.length) };
      })();
      if (!range || range.to <= range.from) return;
      doc.captureSync();
      doc.transact(() => { paragraph.text.delete(range.from, range.to - range.from); });
      doc.captureSync();
    }, true);

    // 粘贴：取剪贴板文字并插入当前文本框的当前段落。
    editor.addEventListener('paste', event => {
      if (!activeTextId) return;
      // 先阻断，避免 BlockSuite 用内部剪贴板再插一次造成重复。
      event.preventDefault();
      event.stopImmediatePropagation();
      const noteEl = editor.querySelector(`affine-edgeless-note[data-block-id="${activeTextId}"]`);
      // 优先取正在聚焦的段落；没有则取第一个段落。
      const focused = editor.querySelector(`affine-edgeless-note[data-block-id="${activeTextId}"] .inline-editor`);
      const paragraphEl = focused?.closest?.('affine-paragraph')
        || noteEl?.querySelector('affine-paragraph');
      const paragraphId = paragraphEl?.getAttribute('data-block-id');
      const paragraph = paragraphId ? doc.getBlockById(paragraphId) : null;
      if (!paragraph?.text) return;
      const insert = (raw) => {
        const text = String(raw || '').replace(/\r\n?/g, '\n');
        if (!text) return;
        // 在光标处插入；取不到光标就追加到末尾。
        let index = String(paragraph.text).length;
        const selection = document.getSelection();
        if (selection && selection.rangeCount) {
          const range = selection.getRangeAt(0);
          const nodeOf = n => (n instanceof Element ? n : n?.parentElement);
          if (nodeOf(range.startContainer)?.closest?.('affine-edgeless-note')?.getAttribute('data-block-id') === activeTextId) {
            index = Math.min(range.startOffset, index);
          }
        }
        doc.captureSync();
        doc.transact(() => { paragraph.text.insert(text, index); });
        doc.captureSync();
      };
      // 优先用 paste 事件自带的 clipboardData——不需要焦点也不需要权限。
      const fromEvent = event.clipboardData ? event.clipboardData.getData('text/plain') : '';
      if (fromEvent) { insert(fromEvent); return; }
      // 事件里没有内容时，再尝试系统剪贴板 API（可能因未聚焦或未授权失败）。
      if (navigator.clipboard?.readText) {
        navigator.clipboard.readText().then(text => insert(text), () => {});
      }
    }, true);
  }

  function insertBufferedSpace() {
    if (spaceTextTarget?.isConnected && !viewing) {
      spaceTextTarget.focus({preventScroll:true});
      const inline = spaceTextTarget.closest('rich-text')?.inlineEditor;
      const range = inline?.getInlineRange();
      if (inline && range) {
        const attributes = inline.getDeltaByRangeIndex(range.index)?.attributes ?? {};
        inline.insertText(range, ' ', attributes);
        inline.setInlineRange({index:range.index+1,length:0});
        inline.syncInlineRange();
      } else if (spaceTextTarget.matches('input, textarea') && spaceTextTarget.selectionStart !== null) {
        spaceTextTarget.setRangeText(' ', spaceTextTarget.selectionStart, spaceTextTarget.selectionEnd, 'end');
        spaceTextTarget.dispatchEvent(new InputEvent('input', {bubbles:true,composed:true,inputType:'insertText',data:' '}));
      }
    }
    spaceTextTarget = null;
  }
  const finishPan = event => {
    if (event?.code && event.code !== 'Space') return;
    if (!holdingSpace) return;
    holdingSpace = false;
    // A plain Space still types a space; the drag chord never inserts one.
    if (event?.type === 'keyup' && !spaceUsedForPan) insertBufferedSpace();
    else spaceTextTarget = null;
    if (!canvasPan) toolbar.classList.remove('panning');
  };
  window.addEventListener('keyup', event => {
    if (event.code !== 'Space' || !holdingSpace || composing || event.isComposing) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    finishPan(event);
  }, true);
  window.addEventListener('blur', () => {
    finishPan();
    if (canvasPan && editor.hasPointerCapture(canvasPan.id)) editor.releasePointerCapture(canvasPan.id);
    canvasPan = null;suppressPanClick = false;toolbar.classList.remove('panning');
  });

  // Blank drags in Move pan the view; card and Space gestures are handled above.
  {
    let blankPan = null;
    editor.addEventListener('pointerdown', event => {
      if (viewing || event.button !== 0 || activeTool!=='pan' || holdingSpace) return;
      if(!isBlank(event))return;
      if(event.composedPath().some(node=>node instanceof Element&&node.matches('button,input,textarea,.canvas-tools')))return;
      event.preventDefault();
      event.stopImmediatePropagation();
      leaveEditing();
      root.gfx.selection.clear();
      blankPan = { id: event.pointerId, x: event.clientX, y: event.clientY };
      editor.setPointerCapture(event.pointerId);
    }, true);
    window.addEventListener('pointermove', event => {
      if (!blankPan || event.pointerId !== blankPan.id) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const dx = event.clientX - blankPan.x;
      const dy = event.clientY - blankPan.y;
      root.gfx.viewport.applyDeltaCenter(-dx / root.gfx.viewport.zoom, -dy / root.gfx.viewport.zoom);
      blankPan.x = event.clientX;
      blankPan.y = event.clientY;
    }, true);
    const finishBlankPan = event => {
      if (!blankPan || event.pointerId !== blankPan.id) return;
      blankPan = null;
      if (editor.hasPointerCapture(event.pointerId)) editor.releasePointerCapture(event.pointerId);
    };
    window.addEventListener('pointerup', finishBlankPan, true);
    window.addEventListener('pointercancel', finishBlankPan, true);
    window.addEventListener('blur', () => { blankPan = null; });
  }

  // Keep the opposite edge fixed when a single note reaches its minimum size.
  // The preset clamps width/height after computing position, which makes it drift.
  editor.addEventListener('pointerdown', event => {
    const handle = event.composedPath().find(node => node instanceof Element && node.matches('[data-note-resize], .handle[aria-label]'));
    const selected = root.gfx.selection.selectedElements;
    if (!handle || !selected.length || !selected.every(element => element.flavour === 'affine:note') || event.button !== 0) return;
    const direction = handle.dataset.noteResize || handle.getAttribute('aria-label');
    if (!/^(top|bottom|left|right)(-(left|right))?$/.test(direction)) return;
    const note = selected.find(element => element.id === handle.closest('affine-edgeless-note')?.getAttribute('data-block-id')) || selected[0];
    if (note.isLocked()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const initial = JSON.parse(note.xywh);
    // 记住每个尺寸项在哪个轴上，多选等比缩放时要用它判断「主动轴」。
    const originals = selected.filter(element => !element.isLocked()).map(element => ({
      note: element,
      bounds: JSON.parse(element.xywh),
      scale: element.edgeless.scale ?? 1,
      kind: element.flavour,
    }));
    const start = { x: event.clientX, y: event.clientY };
    const zoom = root.gfx.viewport.zoom;
    const scale = note.edgeless.scale ?? 1;
    const pointerId = event.pointerId;
    doc.captureSync();
    handle.setPointerCapture(pointerId);
    const move = e => {
      if (e.pointerId !== pointerId) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const bounds = resizeNote(initial, direction, (e.clientX - start.x) / zoom, (e.clientY - start.y) / zoom, scale);
      doc.transact(() => {
        if (originals.length === 1) {
          const item = originals[0];
          doc.updateBlock(item.note, () => {
            item.note.xywh = JSON.stringify(bounds);
            if (item.kind === 'affine:note') {
              item.note.edgeless.collapse = true;
              item.note.edgeless.collapsedHeight = bounds[3] / item.scale;
            }
          });
          return;
        }
        // 多选：统一比例缩放，与图片原生缩放的行为一致。
        // 从拖拽方向推出「宽是否受影响、高是否受影响」，再据此算出统一因子，
        // 乘到每个元素的原始宽高上——因此各元素即使原始尺寸不同，也各自保持比例。
        const affectsWidth = direction.includes('left') || direction.includes('right');
        const affectsHeight = direction.includes('top') || direction.includes('bottom');
        const widthRatio = initial[2] ? bounds[2] / initial[2] : 1;
        const heightRatio = initial[3] ? bounds[3] / initial[3] : 1;
        let factor;
        if (affectsWidth && affectsHeight) {
          // 角拖拽：以位移较大的那根轴为准，避免两个方向同时抖动时因子乱跳。
          const widthDelta = Math.abs(bounds[2] - initial[2]);
          const heightDelta = Math.abs(bounds[3] - initial[3]);
          factor = widthDelta >= heightDelta ? widthRatio : heightRatio;
        } else if (affectsWidth) {
          factor = widthRatio;
        } else {
          factor = heightRatio;
        }
        for (const item of originals) {
          // 最小尺寸兜底：按比例缩小到触底时抬高因子，保证比例不被压坏。
          const minFactor = Math.max(
            (NOTE_MIN_WIDTH * item.scale) / item.bounds[2],
            (NOTE_MIN_HEIGHT * item.scale) / item.bounds[3],
          );
          const applied = Math.max(factor, minFactor, 0.01);
          // 纯边拖拽只改变一个方向；角拖拽两个方向都按同一因子缩放。
          const width = affectsWidth ? item.bounds[2] * applied : item.bounds[2];
          const height = affectsHeight ? item.bounds[3] * applied : item.bounds[3];
          doc.updateBlock(item.note, () => {
            item.note.xywh = JSON.stringify([item.bounds[0], item.bounds[1], width, height]);
            if (item.kind === 'affine:note') {
              item.note.edgeless.collapse = true;
              item.note.edgeless.collapsedHeight = height / item.scale;
            }
          });
        }
      });
    };
    const finish = e => {
      if (e.pointerId !== pointerId) return;
      e.stopImmediatePropagation();
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', finish, true);
      window.removeEventListener('pointercancel', finish, true);
      if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
      doc.captureSync();
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', finish, true);
    window.addEventListener('pointercancel', finish, true);
  }, true);

  editor.addEventListener('selectstart', event => {
    if (tableNoteFromEvent(event)) {
      if (!event.composedPath().some(node => node instanceof Element &&
        node.matches('.inline-editor, textarea, input'))) event.preventDefault();
      return;
    }
    if (!activeTextId || !event.composedPath().some(node => node instanceof Element && node.getAttribute('data-block-id') === activeTextId)) event.preventDefault();
  }, true);
  // Dragging an existing text selection invokes the browser's HTML drag/drop
  // path. BlockSuite can turn its drop into a new note and briefly select text
  // in other cards. Text inside a card only supports caret/selection dragging.
  editor.addEventListener('dragstart', event => {
    if (!activeTextId || !event.composedPath().some(node => node instanceof Element &&
      node.matches('affine-edgeless-note') && node.getAttribute('data-block-id') === activeTextId)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  editor.addEventListener('mousedown', event => {
    if (tableNoteFromEvent(event)) {
      if (tablePointerDown?.wasSelected && tablePointerDown.canMove) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      return;
    }
    if (!activeTextId && !isFormatBarEvent(event)) event.preventDefault();
  }, true);
  editor.addEventListener('pointerdown', event => {
    if (activeTextId && !event.composedPath().some(node => node instanceof Element &&
      node.getAttribute('data-block-id') === activeTextId) && !isFormatBarEvent(event)) leaveEditing();
    if (activeTableId && tableNoteFromEvent(event)?.getAttribute('data-block-id') !== activeTableId &&
      !isFormatBarEvent(event)) leaveEditing();
    const table = tableNoteFromEvent(event);
    tablePointerDown = event.button === 0 && table ? {
      id: table.getAttribute('data-block-id'),
      wasSelected: root.gfx.selection.selectedElements.some(element => element.id === table.getAttribute('data-block-id')),
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
      canMove: activeTableId !== table.getAttribute('data-block-id') &&
        !event.composedPath().some(node => node instanceof Element && node !== root &&
          node.matches('button, input, textarea, [contenteditable="true"], affine-menu, [data-note-resize], .pv-note-resize-controls')),
      initial: doc.getBlockById(table.getAttribute('data-block-id'))?.xywh,
      zoom: root.gfx.viewport.zoom,
      dragged: false,
    } : null;
    const note = noteFromEvent(event);
    textPointerDown = event.button === 0 && note && !table ? {
      id: note.getAttribute('data-block-id'),
      wasSelected: root.gfx.selection.selectedElements.some(element => element.id === note.getAttribute('data-block-id')),
      x: event.clientX,
      y: event.clientY,
    } : null;
    activeNotePointer = event.button === 0 && note?.getAttribute('data-block-id') === activeTextId
      ? { id: event.pointerId, x: event.clientX, y: event.clientY, dragged: false,
          fromText: event.composedPath().some(node => node instanceof Element && node.matches('.inline-editor')),
          resizing: event.composedPath().some(node => node instanceof Element && node.hasAttribute('data-note-resize')) }
      : null;
    if (activeNotePointer && !event.composedPath().some(node => node instanceof Element && node.hasAttribute('data-note-resize'))) {
      if (activeNotePointer.fromText && !holdingSpace) lockOtherNotesForTextDrag();
      const caret = document.caretRangeFromPoint?.(event.clientX, event.clientY);
      const caretElement = caret?.startContainer instanceof Element ? caret.startContainer : caret?.startContainer?.parentElement;
      if (caretElement?.closest('.inline-editor')?.closest('affine-edgeless-note')?.getAttribute('data-block-id') === activeTextId) {
        activeNotePointer.origin = { node: caret.startContainer, offset: caret.startOffset };
        activeNotePointer.lastValid = { noteId: activeTextId, model: null, range: caret.cloneRange() };
      }
      const native = document.getSelection();
      const range = native?.rangeCount ? native.getRangeAt(0) : null;
      const anchor = range?.startContainer instanceof Element ? range.startContainer : range?.startContainer?.parentElement;
      const withinSelectedGlyphs = range && !native.isCollapsed && [...range.getClientRects()].some(rect =>
        event.clientX >= rect.left && event.clientX <= rect.right &&
        event.clientY >= rect.top && event.clientY <= rect.bottom);
      if (withinSelectedGlyphs || caret && range && !native.isCollapsed &&
        range.isPointInRange(caret.startContainer, caret.startOffset)) {
        activeNotePointer.startedInSelection = true;
        activeNotePointer.lastValid = { noteId: activeTextId, model: null, range: range.cloneRange() };
      }
      if (!activeNotePointer.lastValid && anchor?.closest('affine-edgeless-note')?.getAttribute('data-block-id') === activeTextId) {
        activeNotePointer.lastValid = { noteId: activeTextId, model: null, range: range.cloneRange() };
      }
    }
    blankPointerDown = isBlank(event) ? { x: event.clientX, y: event.clientY, pointerId: event.pointerId } : null;
    if (blankPointerDown && activeTool === 'note') {
      event.preventDefault();
      event.stopImmediatePropagation();
      editor.setPointerCapture(event.pointerId);
    }
    if (tablePointerDown?.wasSelected && tablePointerDown.canMove) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
  document.addEventListener('pointerdown', event => {
    if (!event.composedPath().includes(editor)) activeNotePointer = null;
    if (activeTableId && !event.composedPath().includes(editor)) leaveEditing();
  }, true);
  // 表格内部的数据库会接管拖动事件；选中模式下由卡片统一处理移动。
  window.addEventListener('pointermove', event => {
    const press = tablePointerDown;
    if (!press?.canMove || !press.wasSelected || press.pointerId !== event.pointerId ||
      !(event.buttons & 1)) return;
    const dx = event.clientX - press.x;
    const dy = event.clientY - press.y;
    if (!press.dragged && Math.hypot(dx, dy) <= 3) return;
    const note = doc.getBlockById(press.id);
    if (!note || !press.initial) return;
    if (!press.dragged) {
      press.dragged = true;
      doc.captureSync();
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    const [x, y, width, height] = JSON.parse(press.initial);
    doc.updateBlock(note, () => {
      note.xywh = JSON.stringify([x + dx / press.zoom, y + dy / press.zoom, width, height]);
    });
  }, true);
  const finishTableMove = event => {
    const press = tablePointerDown;
    if (!press || press.pointerId !== event.pointerId || !press.dragged) return;
    tablePointerDown = null;
    doc.captureSync();
  };
  window.addEventListener('pointerup', finishTableMove, true);
  window.addEventListener('pointercancel', finishTableMove, true);
  window.addEventListener('pointerup', unlockNotesAfterTextDrag, true);
  window.addEventListener('pointercancel', unlockNotesAfterTextDrag, true);
  window.addEventListener('blur', unlockNotesAfterTextDrag);
  const rememberTextDragSelection = () => {
    if (!activeNotePointer?.dragged || activeNotePointer.startedInSelection ||
      typeof activeNotePointer.outsideClamped === 'boolean') return;
    const native = document.getSelection();
    if (!native?.rangeCount || native.isCollapsed) return;
    const range = native.getRangeAt(0);
    const noteIdOf = node => (node instanceof Element ? node : node?.parentElement)
      ?.closest('affine-edgeless-note')?.getAttribute('data-block-id');
    if (noteIdOf(range.startContainer) !== activeTextId || noteIdOf(range.endContainer) !== activeTextId) return;
    const model = root.gfx.std.selection.find('text');
    activeNotePointer.lastValid = {
      noteId: activeTextId,
      model: model && !model.isCollapsed() ? model.toJSON() : null,
      range: range.cloneRange(),
    };
    lastTextRange = { noteId: activeTextId, range: range.cloneRange() };
  };
  let restoringTextSelection = false;
  document.addEventListener('selectionchange', () => {
    const press = activeNotePointer;
    if (!activeTextId || restoringTextSelection || composing) return;
    const native = document.getSelection();
    if (!native?.rangeCount) return;
    const range = native.getRangeAt(0);
    if (((press?.startedInSelection && press.dragged) ||
      typeof press?.outsideClamped === 'boolean') && press.lastValid?.range) {
      const saved = press.lastValid.range;
      if (range.compareBoundaryPoints(Range.START_TO_START, saved) !== 0 ||
        range.compareBoundaryPoints(Range.END_TO_END, saved) !== 0) {
        restoringTextSelection = true;
        native.removeAllRanges();
        native.addRange(saved.cloneRange());
        queueMicrotask(() => { restoringTextSelection = false; });
      }
      return;
    }
    const noteIdOf = node => (node instanceof Element ? node : node?.parentElement)
      ?.closest('affine-edgeless-note')?.getAttribute('data-block-id');
    const textNoteIdOf = node => (node instanceof Element ? node : node?.parentElement)
      ?.closest('.inline-editor')?.closest('affine-edgeless-note')?.getAttribute('data-block-id');
    if (noteIdOf(range.startContainer) === activeTextId &&
      noteIdOf(range.endContainer) === activeTextId) {
      if (!press?.startedInSelection) lastTextRange = { noteId: activeTextId, range: range.cloneRange() };
      rememberTextDragSelection();
      return;
    }
    const originNode = press?.origin?.node ?? native.anchorNode;
    const originOffset = press?.origin?.offset ?? native.anchorOffset;
    if (press && textNoteIdOf(originNode) === activeTextId) {
      const note = editor.querySelector(`affine-edgeless-note[data-block-id="${activeTextId}"]`);
      const textNodes = [];
      for (const inline of note?.querySelectorAll('.inline-editor') ?? []) {
        const walker = document.createTreeWalker(inline, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (node.textContent.replace(/\u200b/g, '').length) textNodes.push(node);
        }
      }
      const forward = textNoteIdOf(range.startContainer) === activeTextId;
      const boundary = forward ? textNodes.at(-1) : textNodes[0];
      if (boundary) {
        restoringTextSelection = true;
        native.setBaseAndExtent(originNode, originOffset, boundary,
          forward ? boundary.textContent.length : 0);
        const clamped = native.getRangeAt(0).cloneRange();
        lastTextRange = { noteId: activeTextId, range: clamped };
        press.lastValid = { noteId: activeTextId, model: null, range: clamped.cloneRange() };
        queueMicrotask(() => { restoringTextSelection = false; });
        return;
      }
    }
    const saved = press?.lastValid?.noteId === activeTextId
      ? press.lastValid.range : lastTextRange?.noteId === activeTextId ? lastTextRange.range : null;
    if (!saved) return;
    restoringTextSelection = true;
    native.removeAllRanges();
    native.addRange(saved.cloneRange());
    queueMicrotask(() => { restoringTextSelection = false; });
  });
  const stopOutsideTextDrag = event => {
    const press = activeNotePointer;
    if (!activeTextId || !press || press.resizing || holdingSpace || !(event.buttons & 1)) return;
    const note = editor.querySelector(`affine-edgeless-note[data-block-id="${activeTextId}"]`);
    if (!note) return;
    const rect = note.getBoundingClientRect();
    if (event.clientX >= rect.left && event.clientX <= rect.right &&
      event.clientY >= rect.top && event.clientY <= rect.bottom) {
      press.outsideClamped = null;
      return;
    }
    press.dragged = true;
    event.preventDefault();
    event.stopImmediatePropagation();
    const content = note.querySelector('.edgeless-note-page-content');
    if (content?.scrollLeft) content.scrollLeft = 0;
    const forward = event.clientX > rect.right || event.clientY > rect.bottom;
    if (!press.startedInSelection && press.origin && press.outsideClamped !== forward) {
      const textNodes = [];
      for (const inline of note.querySelectorAll('.inline-editor')) {
        const walker = document.createTreeWalker(inline, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (node.textContent.replace(/\u200b/g, '').length) textNodes.push(node);
        }
      }
      const boundary = forward ? textNodes.at(-1) : textNodes[0];
      if (boundary) {
        const native = document.getSelection();
        native.setBaseAndExtent(press.origin.node, press.origin.offset, boundary,
          forward ? boundary.textContent.length : 0);
        const range = native.getRangeAt(0).cloneRange();
        press.lastValid = { noteId: activeTextId, model: null, range: range.cloneRange() };
        lastTextRange = { noteId: activeTextId, range };
        press.outsideClamped = forward;
        return;
      }
    }
    const saved = press.startedInSelection ? press.lastValid?.range
      : lastTextRange?.noteId === activeTextId ? lastTextRange.range : press.lastValid?.range;
    const native = document.getSelection();
    const range = native?.rangeCount ? native.getRangeAt(0) : null;
    const noteIdOf = node => (node instanceof Element ? node : node?.parentElement)
      ?.closest('affine-edgeless-note')?.getAttribute('data-block-id');
    if (saved && (press.startedInSelection || range && (noteIdOf(range.startContainer) !== activeTextId ||
      noteIdOf(range.endContainer) !== activeTextId))) {
      native.removeAllRanges();
      native.addRange(saved.cloneRange());
    }
  };
  document.addEventListener('pointermove', stopOutsideTextDrag, true);
  document.addEventListener('mousemove', stopOutsideTextDrag, true);
  editor.addEventListener('pointermove', event => {
    if (activeNotePointer?.id === event.pointerId &&
      Math.hypot(event.clientX - activeNotePointer.x, event.clientY - activeNotePointer.y) > 3) {
      activeNotePointer.dragged = true;
    }
    rememberTextDragSelection();
    if (!blankPointerDown || activeTool !== 'note') return;
    const { x, y } = blankPointerDown;
    const moved = Math.hypot(event.clientX - x, event.clientY - y);
    if (moved < 3) return;
    const rect = document.querySelector('#canvas').getBoundingClientRect();
    Object.assign(dragPreview.style, {
      display: 'block',
      left: `${Math.min(x, event.clientX) - rect.left}px`,
      top: `${Math.min(y, event.clientY) - rect.top}px`,
      width: `${Math.abs(event.clientX - x)}px`,
      height: `${Math.abs(event.clientY - y)}px`,
    });
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  editor.addEventListener('pointerup', event => {
    if (activeNotePointer?.id === event.pointerId &&
      Math.hypot(event.clientX - activeNotePointer.x, event.clientY - activeNotePointer.y) > 3) {
      activeNotePointer.dragged = true;
    }
    rememberTextDragSelection();
    const completedTextDrag = activeNotePointer?.id === event.pointerId && activeNotePointer.dragged
      ? activeNotePointer.lastValid : null;
    if (completedTextDrag) setTimeout(() => {
      if (activeTextId !== completedTextDrag.noteId) return;
      const current = root.gfx.std.selection.find('text');
      if (current && !current.isCollapsed()) return;
      const native = document.getSelection();
      root.focus({ preventScroll: true });
      native.removeAllRanges();
      native.addRange(completedTextDrag.range);
      if (completedTextDrag.model) {
        const { from, to, reverse } = completedTextDrag.model;
        const selection = root.gfx.std.selection;
        selection.setGroup('note', [selection.create('text', { from, to, reverse })]);
      }
    }, 0);
    if (!blankPointerDown) return;
    const moved = Math.hypot(event.clientX - blankPointerDown.x, event.clientY - blankPointerDown.y);
    const start = blankPointerDown;
    blankPointerDown = null;
    if (activeTool === 'note') {
      event.preventDefault();
      event.stopImmediatePropagation();
      dragPreview.style.display = 'none';
      if (editor.hasPointerCapture(start.pointerId)) editor.releasePointerCapture(start.pointerId);
      const x = moved <= 3 ? start.x : Math.min(start.x, event.clientX);
      const y = moved <= 3 ? start.y : Math.min(start.y, event.clientY);
      createNote(x, y, moved <= 3 ? 480 : Math.abs(event.clientX - start.x),
        moved <= 3 ? 200 : Math.abs(event.clientY - start.y));
      return;
    }
    if (moved <= 3 && !holdingSpace && (activeTool === 'select'||activeTool === 'pan')) {
      leaveEditing();
      root.gfx.selection.clear();
      if (editor.contains(document.activeElement)) document.activeElement.blur();
    }
  }, true);
  editor.addEventListener('pointercancel', () => {
    blankPointerDown = null;
    activeNotePointer = null;
    tablePointerDown = null;
    textPointerDown = null;
    dragPreview.style.display = 'none';
  }, true);
  editor.addEventListener('click', event => {
    const table = tableNoteFromEvent(event);
    if (table) {
      const press = tablePointerDown;
      tablePointerDown = null;
      if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 3) {
        event.preventDefault();event.stopImmediatePropagation();return;
      }
      if (event.button === 0 && press?.id === table.getAttribute('data-block-id') &&
        press.wasSelected && event.detail >= 2 && Math.hypot(event.clientX - press.x, event.clientY - press.y) <= 3) {
        enterTableEditing(table);
      } else if (event.button === 0 && press?.id === table.getAttribute('data-block-id') &&
        !press.wasSelected && Math.hypot(event.clientX - press.x, event.clientY - press.y) <= 3) {
        root.gfx.selection.set({ elements: [press.id], editing: false });
        updateNoteControls();
      }
      if (activeTableId !== table.getAttribute('data-block-id')) {
        event.preventDefault();event.stopImmediatePropagation();
      }
      return;
    }
    if (event.composedPath().some(node => node instanceof Element && node.hasAttribute('data-note-resize'))) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    const note = noteFromEvent(event);
    const press = textPointerDown;
    textPointerDown = null;
    if (note && activeTextId === note.getAttribute('data-block-id')) {
      const wasDrag = activeNotePointer?.dragged || false;
      activeNotePointer = null;
      const path = event.composedPath();
      const clickedText = pointHitsNoteText(event, note);
      const clickedResize = path.some(node => node instanceof Element && node.hasAttribute('data-note-resize'));
      if (event.button === 0 && !composing && !wasDrag && !clickedText &&
        !pointHitsNoteParagraph(event, note) && !clickedResize && document.getSelection()?.isCollapsed) {
        event.preventDefault();
        event.stopImmediatePropagation();
        placeCaretAtNoteEnd(activeTextId);
      }
      return;
    }
    if (!note) return;
    if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 3) {
      event.preventDefault();event.stopImmediatePropagation();return;
    }
    if (event.button === 0 && press?.id === note.getAttribute('data-block-id') &&
      press.wasSelected && event.detail >= 2 && Math.hypot(event.clientX - press.x, event.clientY - press.y) <= 3) {
      event.preventDefault();
      event.stopImmediatePropagation();
      enterEditing(press.id);
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    root.gfx.selection.set({ elements: [note.getAttribute('data-block-id')], editing: false });
    if (editor.contains(document.activeElement)) document.activeElement.blur();
  }, true);
  editor.addEventListener('dblclick', event => {
    const table = tableNoteFromEvent(event);
    if (table) {
      enterTableEditing(table);
      const path = event.composedPath();
      const title = path.find(node => node instanceof Element && node.matches('affine-database-title')) ||
        [...table.querySelectorAll('affine-database-title')].find(node => {
          const rect = node.getBoundingClientRect();
          return event.clientX >= rect.left && event.clientX <= rect.right &&
            event.clientY >= rect.top && event.clientY <= rect.bottom;
        });
      if (title) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const input = title.querySelector('textarea');
        requestAnimationFrame(() => input?.focus({ preventScroll: true }));
      } else if (!path.some(node => node instanceof Element && node.matches('affine-database'))) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      return;
    }
    const note = noteFromEvent(event);
    const noteId = note?.getAttribute('data-block-id');
    if (note && noteId === activeTextId) {
      // Double-clicking a card's empty background otherwise places the native
      // selection on a DIV and clears BlockSuite's text selection. Preserve
      // native double-click word selection when the pointer is on actual text.
      const path = event.composedPath();
      const clickedResize = path.some(node => node instanceof Element && node.hasAttribute('data-note-resize'));
      if (!composing && !clickedResize && !pointHitsNoteText(event, note) &&
        !pointHitsNoteParagraph(event, note)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        placeCaretAtNoteEnd(noteId);
      }
      return;
    }
    if (!note && !((activeTool === 'select'||activeTool === 'pan') && isBlank(event))) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (note) enterEditing(noteId);
    else createNote(event.clientX, event.clientY, 240, 92);
  }, true);
  editor.addEventListener('beforeinput', event => {
    if (event.inputType?.startsWith('delete') && event.inputType.endsWith('Backward') &&
      atStartOfFirstTextParagraph()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (tableNoteFromEvent(event)) return;
    const note = noteFromEvent(event);
    if (note && activeTextId !== note.getAttribute('data-block-id')) event.preventDefault();
  }, true);

  const updateDelete = () => {
    deleteButton.disabled = root.gfx.selection.selectedElements.length === 0;
    updateNoteControls();
    requestAnimationFrame(updateNoteControls);
  };
  root.gfx.selection.slots.updated.on(updateDelete);
  updateDelete();
  function deleteSelected() {
    const selected = [...root.gfx.selection.selectedElements];
    if (!selected.length) return;
    const deleting = new Set(selected);
    for (const element of selected) {
      for (const connector of root.gfx.surface?.getConnectors?.(element.id) ?? []) deleting.add(connector);
    }
    doc.captureSync();
    doc.transact(() => {
      for (const element of deleting) {
        if (element.flavour === 'affine:note') {
          if (doc.root.children.length > 1) doc.deleteBlock(element);
        } else {
          root.gfx.deleteElement(element.id);
        }
      }
    });
    doc.captureSync();
    root.gfx.selection.clear();
  }
  deleteButton.addEventListener('click', deleteSelected);

  // Embedded cards scroll their dialog with the wheel and zoom with Ctrl+wheel.
  // Keep the standalone prototype's original wheel behavior.
  editor.addEventListener('wheel', event => {
    // The color palette is a scrollable popup inside the editor's shadow DOM.
    // Keep its native scroll, while preventing the canvas from handling it.
    if (event.composedPath().some(node =>
      node instanceof Element && node.matches('editor-menu-content.highlight-panel, editor-menu-content.paragraph-panel, .pv-color-panel')
    )) {
      event.stopImmediatePropagation();
      return;
    }
    if (embedded) return; // handled by installEmbeddedWheel, including media controls
    if (event.ctrlKey) return; // browser touchpad pinch already zooms in BlockSuite
    const note = event.target instanceof Element && event.target.closest('affine-edgeless-note');
    const content = note?.querySelector('.edgeless-note-page-content');
    if (content && content.scrollHeight > content.clientHeight + 1 && !tableContentFits(note, content)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      content.scrollTop += event.deltaY * (event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : 1);
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    zoomCanvasOnWheel(root, event);
  }, { capture: true, passive: false });
}

// 嵌入 iframe 时为画布补上键盘焦点（空格平移需要键盘焦点）。
//
// 背景：浏览器只在「点中 iframe 内部一个真正可聚焦的 DOM 元素」时才把键盘焦点
// 分配给 iframe 文档。画布空白处本身不是可聚焦元素，因此宿主不转移焦点，空格会
// 留在外层（侧栏地址栏）被吃掉；工具栏按钮与正文编辑器可聚焦，所以点它们之后
// 空格才恢复。
//
// 做法：把画布容器变成可聚焦元素（tabindex="-1"），指针按下时聚焦它，并在
// pointerup 后再补两次——应用自身在 pointerup 里会对 activeElement 调用 blur()
// （点击空白处取消选中），会把刚补上的焦点丢掉。
function installCanvasFocusClaim() {
  const host = document.querySelector('#canvas');
  if (host && host.tabIndex !== -1) host.tabIndex = -1;

  // 判断指针是否落在真正的交互控件上，是则不抢焦点。
  //
  // 两个已踩过的坑，改动此选择器前务必先读：
  // 1. 不要加入 'a'：BlockSuite 把画布渲染在 <a> 内，加了之后点画布背景会被误判
  //    为交互控件，补焦被整段跳过。
  // 2. 必须排除 affine-edgeless-root：BlockSuite 把编辑器根节点自身标记为
  //    contenteditable="true"（用于接收键盘输入），不排除它则点画布任意位置都会
  //    命中选择器。
  // 这两点曾导致「补焦看起来完全无效」，实际只是从未执行。
  const isInteractive = target =>
    target instanceof Element &&
    !!target.closest('button, input, textarea, select, [contenteditable="true"]:not(affine-edgeless-root), .canvas-tools, .pv-note-resize-controls');

  const focusSelf = () => {
    if (document.hasFocus()) return;
    try { host?.focus({ preventScroll: true }); } catch {}
    if (!document.hasFocus()) {
      try { window.focus(); } catch {}
    }
  };

  document.addEventListener('pointerdown', event => {
    if (isInteractive(event.target)) return;
    focusSelf();
  }, true);

  document.addEventListener('pointerup', event => {
    if (isInteractive(event.target)) return;
    focusSelf();
    setTimeout(focusSelf, 0);
    setTimeout(focusSelf, 60);
  }, true);

  window.addEventListener('focus', focusSelf);
  focusSelf();
}

function installSelectionRecovery(editor) {
  // The 0.19.5 snap manager sometimes misses its surface view lookup in this
  // standalone editor. Its dragEnd then throws before clearing the marquee.
  // The mounted surface element is available directly in the editor tree.
  const repairSurfaceLookup = () => {
    const root = editor.querySelector('affine-edgeless-root');
    const snap = root?.gfx?.tool?.currentTool$?.peek()?.snapOverlay;
    if (!snap || snap._surface) return;
    Object.defineProperty(snap, '_surface', {
      configurable: true,
      get: () => editor.querySelector('affine-surface'),
    });
  };
  editor.addEventListener('pointerdown', repairSurfaceLookup, true);

  // Also clear stale selection state after a release, if the preset drops the
  // dragEnd event in another browser.
  const finish = event => {
    if (event.buttons) return;
    queueMicrotask(() => {
      const root = editor.querySelector('affine-edgeless-root');
      const controller = root?.gfx?.tool;
      const tool = controller?.currentTool$?.peek();
      const area = controller?.draggingViewArea$?.peek();
      if (tool?.dragType !== 'selecting' || !area?.w || !area?.h) return;
      tool._clearSelectingState?.();
      tool.dragType = 'none';
      controller.dragging$.value = false;
      controller.draggingViewArea$.value = {
        x: 0, y: 0, w: 0, h: 0,
        startX: 0, startY: 0, endX: 0, endY: 0,
      };
    });
  };
  window.addEventListener('pointerup', finish);
  window.addEventListener('mouseup', finish);
  window.addEventListener('pointermove', finish);
}

// BlockSuite 0.19.x keeps its preset UI labels in English and has no locale
// registration API. Translate UI chrome as it is rendered while skipping
// document and shape text editors.
const uiLabels = new Map(Object.entries({
  'Note': '正文', 'Pen': '画笔', 'Shape': '形状', 'Mind Map': '思维导图',
  'Template': '模板', 'Text': '文字', 'Edgeless Text': '文字框',
  'Frame': '画框', 'Connector': '连接线', 'Link': '链接',
  'Select': '选择', 'Hand': '移动画布', 'Lasso': '套索',
  'Add text': '添加文字', 'Add note': '添加正文',
  'More': '更多', 'Delete': '删除', 'Duplicate': '复制',
  'Copy': '复制', 'Paste': '粘贴', 'Cut': '剪切',
  'Group': '编组', 'Ungroup': '取消编组',
  'Bring to front': '置于顶层', 'Send to back': '置于底层',
  'Fit to screen': '适应屏幕', 'Zoom in': '放大', 'Zoom out': '缩小',
  'Others': '更多工具', 'Freehand': '自由套索', 'Polygonal': '多边形套索',
  'Bold': '加粗', 'Italic': '斜体', 'Underline': '下划线',
  'Heading 1': '一级标题', 'Heading 2': '二级标题',
  'Heading 3': '三级标题', 'Heading 4': '四级标题',
  'Heading 5': '五级标题', 'Heading 6': '六级标题',
  'Paragraph': '正文', 'Code': '代码', 'Quote': '引用',
  'Image': '图片', 'Video': '视频', 'Attachment': '附件',
  'Switch type': '切换类型', 'Style': '样式', 'Layout': '布局', 'Fill color': '填充颜色',
  'Border style': '边框样式', 'Draw connector': '绘制连接线',
  'Stroke': '描边', 'Background': '背景', 'Opacity': '透明度',
  'Align': '对齐', 'Rotate': '旋转', 'Lock': '锁定', 'Unlock': '解锁',
  'Curve': '曲线', 'Elbowed': '折线', 'Straight': '直线',
  'Custom': '自定义', 'Eraser': '橡皮擦',
  'Bulleted List': '无序列表', 'Numbered List': '有序列表',
  'To-do List': '待办列表', 'Code Block': '代码块', 'Divider': '分割线',
  "Type '/' for commands": '输入正文',
  'Color': '颜色', 'color': '颜色', 'Default Color': '默认颜色',
  'Default Background': '默认背景', 'Red': '红色', 'Orange': '橙色',
  'Yellow': '黄色', 'Green': '绿色', 'Teal': '青色', 'Blue': '蓝色',
  'Purple': '紫色', 'Grey': '灰色', 'Magenta': '洋红色', 'White': '白色',
  'Table View': '表格视图', 'New Record': '新增一行',
  'Table': '表格', 'Kanban': '看板', 'Kanban View': '看板视图',
  'Calculate': '计算', 'Untitled': '未命名',
  // Database column types and table actions (including nested context menus).
  'Checkbox': '复选框', 'CheckBox': '复选框', 'Date': '日期',
  'Multi-select': '多选', 'Number': '数字', 'Progress': '进度',
  'Plain-Text': '纯文本', 'Rich Text': '富文本', 'Title': '标题',
  'image': '图片',
  'Expand Row': '展开行', 'Insert Before': '在上方插入行',
  'Insert After': '在下方插入行', 'Delete Row': '删除行',
  'Delete Rows': '删除所选行', 'Delete Cards': '删除卡片',
  'Filter': '筛选', 'Sort': '排序',
  'Sort Ascending': '升序排列', 'Sort Descending': '降序排列',
  'Ascending': '升序', 'Descending': '降序',
  'Insert Left Column': '在左侧插入列',
  'Insert Right Column': '在右侧插入列',
  'Move Left': '向左移动', 'Move Right': '向右移动',
  'Hide In View': '在当前视图中隐藏', 'Number Format': '数字格式',
  'Properties': '属性', 'Property settings': '属性设置',
  'View settings': '视图设置', 'Edit View': '编辑视图',
  'New': '新建', 'New Group': '新建分组',
  'Create': '新建', 'Type here...': '输入或新建标签…',
  'Select tag or create one': '选择标签或新建标签',
  'Add': '添加', 'Add sort': '添加排序',
  'Add filter': '添加筛选条件', 'Add filter group': '添加筛选组',
  'New filter': '新筛选条件', 'Filters': '筛选条件',
  'Filter group': '筛选组', 'Where': '条件',
  'And': '且', 'Or': '或', 'Wrap in group': '加入分组',
  'Turn into group': '转为分组', 'Contains': '包含',
  'Contains all': '包含全部', 'Contains one of': '包含其中任一项',
  'Does no contains': '不包含',
  'Does not contains all': '不包含全部',
  'Does not contains one of': '不包含其中任一项',
  'Starts with': '开头是', 'Ends with': '结尾是',
  'Is': '是', 'Is not': '不是', 'Is one of': '是其中任一项',
  'Is not one of': '不是其中任一项',
  'Is empty': '为空', 'Is not empty': '不为空',
  'Is checked': '已勾选', 'Is unchecked': '未勾选',
  'True': '真', 'False': '假', 'Unchecked': '未勾选',
  'Number With Commas': '千分位数字', 'Percent': '百分比',
  'Japanese Yen': '日元', 'Chinese Yuan': '人民币',
  'Indian Rupee': '印度卢比', 'US Dollar': '美元',
  'Euro': '欧元', 'British Pound': '英镑',
  'Before': '早于', 'After': '晚于',
  'Search...': '搜索…', 'Search': '搜索',
  'Today': '今天', 'TODAY': '今天', 'today': '今天',
  'Clear': '清除', 'clear': '清除', 'Cancel': '取消',
  'No Results': '没有结果',
  'Su': '周日', 'Mo': '周一', 'Tu': '周二', 'We': '周三',
  'Th': '周四', 'Fr': '周五', 'Sa': '周六',
  'Jan': '一月', 'Feb': '二月', 'Mar': '三月',
  'Apr': '四月', 'May': '五月', 'Jun': '六月',
  'Jul': '七月', 'Aug': '八月', 'Sep': '九月',
  'Oct': '十月', 'Nov': '十一月', 'Dec': '十二月',
  'decrease decimal places': '减少小数位数',
  'increase decimal places': '增加小数位数',
}));

function localizeEditor(editor) {
  const skipped = 'input, textarea, edgeless-shape-text-editor, edgeless-text-editor, .inline-editor, affine-database-cell-container, affine-database-title, .affine-database-column-text-content';
  const localizedLabel = value => {
    if (uiLabels.has(value)) return uiLabels.get(value);
    const count = /^(\d+) (filters?|sorts?)$/.exec(value);
    if (count) return `${count[1]} 个${count[2].startsWith('filter') ? '筛选条件' : '排序条件'}`;
    return null;
  };
  const observed = new WeakSet();
  let pending = false;
  const observer = new MutationObserver(() => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; translate(document.body); });
  });
  function translate(root) {
    if (!observed.has(root)) {
      observed.add(root);
      observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['title', 'aria-label', 'data-tooltip', 'placeholder'] });
    }
    for (const input of root.querySelectorAll('.inline-editor')) input.tabIndex = 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const element = node.parentElement;
      const tagMenuLabel = element?.closest('.select-options-tips, .select-option-new-icon');
      if (element?.closest(skipped) && !tagMenuLabel) continue;
      const value = node.textContent.trim();
      const translated = localizedLabel(value);
      if (translated) node.textContent = node.textContent.replace(value, translated);
    }
    for (const element of root.querySelectorAll('*')) {
      for (const attribute of ['title', 'aria-label', 'data-tooltip', 'placeholder']) {
        const value = element.getAttribute(attribute);
        const translated = localizedLabel(value);
        if (translated) element.setAttribute(attribute, translated);
      }
      if (element.shadowRoot) translate(element.shadowRoot);
    }
  }
  translate(document.body);
  document.addEventListener('click', () => {
    requestAnimationFrame(() => translate(document.body));
    setTimeout(() => translate(document.body), 120);
  });
}

// BlockSuite stores a video as an attachment. Existing attachments may still be
// in file-card mode; enable its native player, then draw the first decoded frame
// into a poster. Posters are derived from the saved video when the page opens.
function installVideoPreviews(editor) {
  const posters = new Map();
  const videoBounds = new Map();
  const controls = new Map();
  let pointerDown = false;
  let pending = false;
  let updating = false;
  let rerun = false;
  const schedule = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      void update();
    });
  };
  const update = async () => {
    if (updating) { rerun = true; return; }
    updating = true;
    try {
    const surface = doc.root?.children.find(block => block.flavour === 'affine:surface');
    if (!surface) return;
    const active = new Set();
    for (const block of surface.children) {
      if (block.flavour !== 'affine:attachment' || !block.type?.startsWith('video/')) continue;
      if (!block.embed) {
        if (!viewing) doc.updateBlock(block, { embed: true });
        continue;
      }
      const view = [...editor.querySelectorAll('affine-edgeless-attachment')]
        .find(element => element.dataset.blockId === block.id);
      const player = view?.querySelector('video');
      if (!player || !block.sourceId) continue;
      active.add(block.id);
      view.toggleAttribute('data-pv-video', true);
      player.preload = 'metadata';
      player.controls = false;
      let control = controls.get(block.id);
      if (!control) {
        control = createVideoControls();
        controls.set(block.id, control);
      }
      control.bind(player, block.name, view);
      control.place(view);
      if (!posters.has(block.sourceId)) {
        posters.set(block.sourceId, makeVideoPoster(block.sourceId, block.type).catch(error => {
          console.warn('视频首帧预览生成失败', error);
          return null;
        }));
      }
      const preview = await posters.get(block.sourceId);
      if (preview?.poster && player.isConnected && player.poster !== preview.poster) {
        player.poster = preview.poster;
      }
      if (preview?.width && preview?.height && !pointerDown && !viewing) {
        const bound = block.elementBound;
        const ratio = preview.width / preview.height;
        if (Math.abs(bound.w - bound.h * ratio) > 0.05) {
          const oldDefault = Math.abs(bound.w - 480) < 1 && Math.abs(bound.h - 320) < 1;
          const previous = videoBounds.get(block.id);
          const widthChanged = previous && Math.abs(bound.w / previous.w - 1) > Math.abs(bound.h / previous.h - 1);
          const longSide = oldDefault ? 480 : Math.max(bound.w, bound.h);
          const width = oldDefault ? (ratio >= 1 ? longSide : longSide * ratio)
            : widthChanged ? bound.w : bound.h * ratio;
          const height = oldDefault ? (ratio >= 1 ? longSide / ratio : longSide)
            : widthChanged ? bound.w / ratio : bound.h;
          videoBounds.set(block.id, { w: width, h: height });
          doc.updateBlock(block, { xywh: JSON.stringify([bound.x, bound.y, width, height]) });
        } else {
          videoBounds.set(block.id, { w: bound.w, h: bound.h });
        }
      }
    }
    for (const [id, control] of controls) {
      if (active.has(id)) continue;
      control.destroy();
      controls.delete(id);
      videoBounds.delete(id);
    }
    } finally {
      updating = false;
      if (rerun) { rerun = false; schedule(); }
    }
  };
  const makeVideoPoster = async (sourceId, type) => {
    const blob = await doc.blobSync.get(sourceId);
    if (!blob) return null;
    const url = URL.createObjectURL(new Blob([blob], { type }));
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('视频解码超时')), 10000);
        video.addEventListener('loadeddata', () => { clearTimeout(timeout); resolve(); }, { once: true });
        video.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('无法解码视频')); }, { once: true });
        video.src = url;
        video.load();
      });
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 640 / video.videoWidth);
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
      const frame = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.82));
      return {
        poster: frame ? URL.createObjectURL(frame) : null,
        width: video.videoWidth,
        height: video.videoHeight,
      };
    } finally {
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
    }
  };
  new MutationObserver(mutations => {
    if (mutations.some(mutation => mutation.type === 'childList' || mutation.target.matches?.('affine-edgeless-attachment'))) schedule();
  }).observe(editor, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
  window.addEventListener('pointerdown', () => { pointerDown = true; }, true);
  window.addEventListener('pointerup', () => { pointerDown = false; schedule(); }, true);
  window.addEventListener('pointercancel', () => { pointerDown = false; schedule(); }, true);
  window.addEventListener('resize', schedule);
  editor.addEventListener('wheel', schedule, { passive: true });
  window.addEventListener('pagehide', () => {
    for (const poster of posters.values()) {
      void poster.then(preview => { if (preview?.poster) URL.revokeObjectURL(preview.poster); });
    }
  }, { once: true });
  schedule();
}

async function insertMedia(blob, name, linked = false, placement=null) {
  const sourceId = await doc.blobSync.set(blob);
  sourceNames.set(sourceId,name);
  if (!(await doc.blobSync.get(sourceId))) throw new Error('文件未能保存到本地资源库');
  const surface = doc.root?.children.find(block => block.flavour === 'affine:surface');
  if (!surface) throw new Error('画布尚未就绪');
  if (linked && surface.children.some(block => block.sourceId === sourceId)) return sourceId;
  const top = Math.max(120, ...surface.children.map(block => {
    try { const [, y, , h] = JSON.parse(block.xywh); return y + h + 40; } catch { return 120; }
  }));
  function addMedia(flavour,props,width,height){
    const target=placement?.doc===doc?placement.targetForSize(width,height):null;
    if(target)props.xywh=JSON.stringify(target.xywh);
    const id=doc.addBlock(flavour,props,surface.id);
    if(target&&placement.connectorId&&placement.service?.getElementById(placement.connectorId))placement.service.updateElement(placement.connectorId,{target:{id,position:target.position}});
    return id;
  }
  if (blob.type.startsWith('image/')) {
    const bitmap = await createImageBitmap(blob);
    const width = Math.min(bitmap.width, 480);
    const height = Math.round(bitmap.height * width / bitmap.width);
    bitmap.close();
    addMedia('affine:image', {
      sourceId,
      width,
      height,
      xywh: `[120,${top},${width},${height}]`,
    }, width,height);
    setTimeout(() => { void markMissingImages(); }, 0);
  } else if(blob.type.startsWith('video/')) {
    const dimensions = await readVideoDimensions(blob).catch(() => null);
    const ratio = dimensions ? dimensions.width / dimensions.height : 480 / 320;
    const width = ratio >= 1 ? 480 : 480 * ratio;
    const height = ratio >= 1 ? 480 / ratio : 480;
    addMedia('affine:attachment', {
      sourceId,
      name,
      size: blob.size,
      type: blob.type,
      embed: true,
      style: 'cubeThick',
      xywh: JSON.stringify([120, top, width, height]),
    }, width,height);
  } else {
    addMedia('affine:attachment', {
      sourceId,name,size:blob.size,type:blob.type||'application/octet-stream',embed:false,
      style:'horizontalThin',xywh:JSON.stringify([120,top,FILE_CARD_WIDTH,FILE_CARD_HEIGHT]),
    },FILE_CARD_WIDTH,FILE_CARD_HEIGHT);
  }
  return sourceId;
}

async function readVideoDimensions(blob) {
  const url = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.preload = 'metadata';
  try {
    return await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('读取视频尺寸超时')), 10000);
      video.addEventListener('loadedmetadata', () => {
        clearTimeout(timeout);
        resolve({ width: video.videoWidth, height: video.videoHeight });
      }, { once: true });
      video.addEventListener('error', () => {
        clearTimeout(timeout);
        reject(new Error('无法读取视频尺寸'));
      }, { once: true });
      video.src = url;
      video.load();
    });
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}

async function markMissingImages() {
  const surface = doc.root?.children.find(block => block.flavour === 'affine:surface');
  if (!surface) return;
  for (const image of surface.children.filter(block => block.flavour === 'affine:image')) {
    const descriptor = canvasBlobSource.descriptor(image.sourceId);
    const exists = image.sourceId && (descriptor.saved ? Boolean(descriptor.url) : await doc.blobSync.get(image.sourceId));
    const element = document.querySelector(`affine-edgeless-image[data-block-id="${image.id}"]`);
    if (element) element.toggleAttribute('data-pv-missing', !exists);
  }
}

// ---------------------------------------------------------------------------
// 文本框体检 + 操作记录（临时排查工具）
//
// 目的：把我无法模拟的「真实操作序列」记录下来，用于定位「无法删除的灰框」问题。
// 只做读取与记录，不擅自修改内容；空文本框可由用户按 Alt+Delete 自行清理。
// 注意：BlockSuite 的文字存在子段落块上，不在 note.text 上——用错字段会把正常
// 文本框误判成空框（这一点已实际踩坑）。
// ---------------------------------------------------------------------------
function noteTextOf(note) {
  return note.children.map(child => String(child.text || '')).join('').trim();
}
function collectNotes() {
  const root = document.querySelector('affine-edgeless-root');
  const doc = root?.doc;
  if (!doc?.root) return [];
  return doc.root.children
    .filter(block => block.flavour === 'affine:note')
    .map(note => ({
      id: note.id,
      text: noteTextOf(note),
      childFlavours: note.children.map(child => child.flavour),
      xywh: String(note.xywh || ''),
    }));
}

const RECORD_LIMIT = 400;
const recordedEvents = [];
let recordingActive = false;
// 供自动化测试读取真实记录状态（不影响运行，仅暴露引用）。
window.__pvRecord = { events: recordedEvents, isActive: () => recordingActive };
function currentSnapshot() {
  const root = document.querySelector('affine-edgeless-root');
  const doc = root?.doc;
  const notes = doc?.root ? doc.root.children.filter(b => b.flavour === 'affine:note') : [];
  const selection = root?.gfx?.selection;
  const selected = selection?.selectedElements ?? [];
  const editingId = document.querySelector('affine-edgeless-note[data-pv-editing]')?.getAttribute('data-block-id') ?? null;
  const browserSelection = String(document.getSelection() ?? '').replace(/\s+/g, ' ').slice(0, 40);
  const views = [...document.querySelectorAll('affine-edgeless-note')];
  return {
    t: Date.now(),
    编辑中: editingId,
    画布选中: selected.length,
    选中类型: selected.map(e => e.flavour).join(','),
    文字选区: browserSelection,
    文本框数: notes.length,
    视图数: views.length,
    空框数: notes.filter(n => !noteTextOf(n)).length,
    视图尺寸: views.map(v => { const r = v.getBoundingClientRect(); return Math.round(r.width) + 'x' + Math.round(r.height); }).join(' '),
  };
}
function pushRecord(label, extra = {}) {
  if (!recordingActive) return;
  if (recordedEvents.length >= RECORD_LIMIT) return;
  recordedEvents.push({ ...currentSnapshot(), 事件: label, ...extra });
}
function installRecording() {
  const root = document.querySelector('affine-edgeless-root');
  if (!root) return;
  // 用捕获阶段记录：这些事件正是「编辑态 → 画布多选」转换发生的位置。
  for (const type of ['pointerdown', 'pointerup', 'keydown', 'beforeinput', 'selectionchange', 'click']) {
    const target = type === 'selectionchange' ? document : document;
    target.addEventListener(type, event => {
      const detail = event
        ? {
            目标: event.target instanceof Element ? event.target.tagName.toLowerCase() : null,
            键: event.key ?? event.inputType ?? null,
            按: event.buttons ?? null,
          }
        : {};
      pushRecord(type, detail);
    }, true);
  }
  pushRecord('recording-start');
}
function installNoteInspector() {
  const recordButton = document.querySelector('#inspect-notes');
  const copyButton = document.querySelector('#copy-record');
  const output = document.querySelector('#note-report');
  const fallback = document.querySelector('#record-fallback');
  if (!recordButton || !output) return;
  let lastEmptyIds = [];
  let timer = null;
  let snapshot = '';

  const render = () => {
    const notes = collectNotes();
    const empty = notes.filter(note => !note.text);
    lastEmptyIds = empty.map(note => note.id);
    const views = [...document.querySelectorAll('affine-edgeless-note')];
    const sizes = views.map(view => {
      const rect = view.getBoundingClientRect();
      return `${Math.round(rect.width)}x${Math.round(rect.height)}`;
    });
    const lines = [
      `记录中: ${recordingActive ? '是' : '否'}    已记录: ${recordedEvents.length} 条`,
      `文本框总数（模型）: ${notes.length}    视图数（DOM）: ${views.length}    空文本框: ${empty.length}`,
      '',
      ...notes.map((note, index) => {
        const size = sizes[index] ?? '无对应视图';
        const mark = note.text ? '有内容' : '空';
        return `[${index + 1}] ${mark}  视图=${size}  文字="${note.text.slice(0, 30)}"  子块=[${note.childFlavours.join(',')}]  id=${note.id}`;
      }),
      '',
      empty.length
        ? `注意：有 ${empty.length} 个空文本框。点「复制记录」前可先按 Ctrl+Z 撤销误操作。`
        : '没有空文本框。',
    ];
    const next = lines.join('\n');
    if (next !== snapshot) { snapshot = next; output.textContent = next; }
  };

  // 点按钮 = 打开面板并开始记录；再点 = 停止并关闭。全程只用鼠标，不依赖快捷键。
  recordButton.addEventListener('click', () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
      recordingActive = false;
      output.hidden = true;
      return;
    }
    recordedEvents.length = 0;
    recordingActive = true;
    pushRecord('recording-start');
    output.hidden = false;
    render();
    timer = setInterval(render, 1000);
  });

  copyButton?.addEventListener('click', () => {
    recordingActive = false;
    const payload = JSON.stringify({
      导出时间: new Date().toISOString(),
      页面: location.href,
      窗口: [innerWidth, innerHeight],
      文本框: collectNotes(),
      记录: recordedEvents,
    }, null, 1);
    output.hidden = false;
    render();
    const done = () => { output.textContent = `${snapshot}\n\n已复制，直接粘贴给我即可。`; };
    const failed = () => {
      if (!fallback) return;
      fallback.hidden = false;
      fallback.value = payload;
      fallback.focus();
      fallback.select();
      output.textContent = `${snapshot}\n\n剪贴板不可用，已把内容放进下面的文本框，请全选复制（Ctrl+C）。`;
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(payload).then(done, failed);
    else failed();
  });
}
installNoteInspector();
installRecording();

// 隐藏 BlockSuite 的块拖拽手柄（那条 4x12 的灰色小竖条）。
//
// 它设计上用于拖动「整个块」，但在 edgeless 折叠文本框里无法重排段落——拖不动，
// 只会给出错误的可拖拽暗示，因此隐藏。
//
// 注意：手柄位于 affine-drag-handle-widget 的 **Shadow DOM** 内，普通样式表穿不过去
// （document.querySelector 都找不到它），必须在 shadow root 内部注入样式才有效。
function installDragHandleHiding() {
  const STYLE_ID = 'pv-hide-drag-handle';
  const CSS = '.affine-drag-handle-grabber { display: none !important; }';
  const patch = () => {
    const widget = document.querySelector('affine-drag-handle-widget');
    const root = widget?.shadowRoot;
    if (!root) return false;
    if (!root.querySelector(`#${STYLE_ID}`)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      root.append(style);
    }
    return true;
  };
  if (patch()) return;
  // 组件可能尚未挂载，观察一段时间等待它出现（只在首次成功时停止）。
  const observer = new MutationObserver(() => { if (patch()) observer.disconnect(); });
  observer.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), 15000);
}
installDragHandleHiding();


const mediaButton = document.querySelector('#choose-media');
const mediaInput = document.querySelector('#media-file');
const canvasHost = document.querySelector('#canvas');
const restoreCanvasFocus = () => canvasHost.focus({ preventScroll: true });
mediaButton.addEventListener('click', () => {
  pendingMediaPlacement=null;
  // A focused button treats Space as another click, reopening the file picker.
  mediaInput.click();
  mediaButton.blur();
  restoreCanvasFocus();
  // The native chooser may restore focus to its opener after click returns.
  setTimeout(() => {
    if ([mediaButton, mediaInput, document.body].includes(document.activeElement)) restoreCanvasFocus();
  }, 0);
});
mediaInput.addEventListener('cancel', ()=>{pendingMediaPlacement=null;restoreCanvasFocus();});
mediaInput.addEventListener('change', async event => {
  const placement=pendingMediaPlacement;
  pendingMediaPlacement=null;
  const files = [...event.target.files || []];
  event.target.value = '';
  restoreCanvasFocus();
  if (!files.length) return;
  try {
    for(const file of files){rememberMediaName(file);await insertMedia(file, file.name,false,placement);}
    if(embedded)window.WorkbenchCanvas?.refreshAttachments?.();
    setStatus(`已插入 ${files.length} 个附件`);
  } catch (error) {
    console.error(error);
    setStatus(`插入失败：${error.message}`);
  }
});
