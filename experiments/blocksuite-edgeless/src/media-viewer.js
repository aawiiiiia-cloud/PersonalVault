import {previewGroupFor,previewKindFor} from '../public/preview-groups.js';

export function openMediaViewer(doc,blockId,{onOpen,getName,cardId,getAssetId,getDescriptor}={}){
  const surface=doc.root?.children.find(block=>block.flavour==='affine:surface');
  const selected=surface?.children.find(block=>block.id===blockId);
  if(!previewGroupFor(previewKindFor(selected)))return;
  const seen=new Set();const blocks=(surface.children||[]).filter(block=>{if(!block.sourceId||seen.has(block.sourceId))return false;seen.add(block.sourceId);return true;});
  const initialIndex=blocks.findIndex(block=>block.sourceId===selected.sourceId);
  const popup=window.open(new URL('./media-viewer.html',location.href).href,'_blank','width=1080,height=760');if(!popup)return;onOpen?.();
  // Send metadata only. Saved files have original-file URLs; draft files have
  // shared cache keys, so the window remains usable after the editor closes.
  const items=Promise.all(blocks.map(async(block,index)=>({kind:previewKindFor(block),sourceId:block.sourceId,assetId:getAssetId?.(block),name:await getName?.(block,null)||block.name||`图片 ${index+1}`,...getDescriptor?.(block)})));
  const receive=async event=>{
    if(event.source!==popup)return;
    if(event.data?.type==='personalvault:media-viewer:ready'){
      try{popup.postMessage({type:'personalvault:media-viewer:data',initialIndex,cardId,items:await items},'*');}catch(error){if(!popup.closed)popup.postMessage({type:'personalvault:media-viewer:error',message:error.message},'*');}
    }
    if(event.data?.type==='personalvault:media-viewer:request-file'){
      const sourceId=event.data.sourceId;if(!blocks.some(block=>block.sourceId===sourceId))return;
      const blob=await doc.blobSync.get(sourceId).catch(()=>null);
      if(!popup.closed)popup.postMessage({type:'personalvault:media-viewer:file',requestId:event.data.requestId,blob},'*');
    }
  };
  window.addEventListener('message',receive);const timer=setInterval(()=>{if(popup.closed){clearInterval(timer);window.removeEventListener('message',receive);}},1000);
}
