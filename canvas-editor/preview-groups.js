// File navigation and document page navigation are separate concepts.
export const PREVIEW_GROUPS = Object.freeze({
  image: {label:'图片',navigation:'attachments',kinds:['image','psd']},
  video: {label:'视频',navigation:'attachments',kinds:['video']},
  audio: {label:'音频',navigation:'attachments',kinds:['audio']},
  reading: {label:'阅读',navigation:'document',kinds:['pdf','epub','text','markdown']},
  table: {label:'表格',navigation:'single',kinds:['csv','tsv']},
  model: {label:'模型',navigation:'single',kinds:['model']},
});

export function previewGroupFor(kind) {
  return Object.values(PREVIEW_GROUPS).find(group=>group.kinds.includes(kind)) || null;
}

export function previewKindFor(block) {
  if(block?.flavour==='affine:image')return 'image';
  const extension=(block?.name||'').split('.').pop().toLowerCase();
  const formats={pdf:'pdf',epub:'epub',md:'markdown',markdown:'markdown',csv:'csv',tsv:'tsv',psd:'psd',glb:'model',gltf:'model',obj:'model',stl:'model',fbx:'model'};
  if(formats[extension])return formats[extension];
  if(block?.type?.startsWith('video/')||['mp4','webm','mov','mkv','m4v','avi'].includes(extension))return 'video';
  if(block?.type?.startsWith('audio/')||['mp3','wav','flac','ogg','m4a','aac'].includes(extension))return 'audio';
  if(['txt','log','json','xml','js','ts','jsx','tsx','py','css','html','yml','yaml','ini','toml','c','cpp','h','java','sh','bat','sql','rs','go','srt','vtt'].includes(extension))return 'text';
  return null;
}

export function selectPreviewGroup(items,initialIndex=0) {
  const index=Number.isInteger(initialIndex) ? Math.max(0,Math.min(items.length-1,initialIndex)) : 0;
  const selected=items[index],group=previewGroupFor(selected?.kind);
  if(!group)return {items:[],initialIndex:0,group:null};
  const grouped=items.filter(item=>previewGroupFor(item.kind)===group);
  return {items:grouped,initialIndex:grouped.indexOf(selected),group};
}
