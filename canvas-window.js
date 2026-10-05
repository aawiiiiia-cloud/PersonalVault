let canvas=document.getElementById('floatingCanvas');
let initialization=null,ready=false,loaded=false,editing=false,closing=false,finished=false;
const requests=new Map();let sequence=0;
function syncFloatingAppearance(){
  let mode='light',profile;
  try{
    mode=localStorage.getItem('knowledge-workbench-theme')||'light';
    profile=JSON.parse(localStorage.getItem('knowledge-workbench-appearance')||'{}')[mode];
  }catch{}
  const theme=mode==='dark'||mode==='custom'&&profile?.baseTheme==='dark'?'dark':'light';
  window.WorkbenchTheme.apply(theme);
  canvas.contentWindow?.WorkbenchTheme?.apply(theme);
  const color=profile?.cardColorCustom&&/^#[\da-f]{6}$/i.test(profile.cardColor)?profile.cardColor:getComputedStyle(document.documentElement).getPropertyValue('--panel').trim();
  document.body.style.backgroundColor=color;
  document.querySelector('footer').style.backgroundColor=color;
}
window.addEventListener('storage',event=>{if(['knowledge-workbench-theme','knowledge-workbench-appearance'].includes(event.key))syncFloatingAppearance();});
const appearanceChannel=typeof BroadcastChannel==='function'?new BroadcastChannel('workbench-appearance'):null;
if(appearanceChannel)appearanceChannel.onmessage=syncFloatingAppearance;
syncFloatingAppearance();
function initialize(){
  if(initialization&&ready)canvas.contentWindow.postMessage({type:'personalvault:canvas:init',cardId:initialization.key,snapshot:initialization.snapshot,linkedMedia:initialization.linkedMedia},'*');
}
window.addEventListener('message',event=>{
  if(event.source===canvas.contentWindow&&event.data?.type==='personalvault:canvas:attachment-menu'){
    const request=event.data;
    void (async()=>{
      let available=false;
      try{available=Boolean(await window.opener?.canvasAttachmentAssetId(initialization.key,request.sourceId,request.assetId));}catch(error){console.warn(error);}
      canvas.contentWindow.postMessage({type:'personalvault:canvas:attachment-menu-result',requestId:request.requestId,available},'*');
    })();
  }
  if(event.source===canvas.contentWindow&&event.data?.type==='personalvault:canvas:attachment-action'){
    void window.opener?.canvasAttachmentAction(initialization.key,event.data.sourceId,event.data.assetId,event.data.action).catch(console.error);
  }
  if(event.source===canvas.contentWindow&&event.data?.type==='personalvault:canvas:ready'){ready=true;initialize();}
  if(event.source===canvas.contentWindow&&event.data?.type==='personalvault:canvas:loaded'){
    loaded=true;
    syncFloatingAppearance();
    document.getElementById('editFloatingCanvas').hidden=!initialization.editable||editing;
    if(initialization.mode==='edit'){
      initialization.mode='view';startEditing();
    }else showReadMode();
  }
  if(event.source===canvas.contentWindow&&event.data?.type==='personalvault:canvas:snapshot-result'){
    const request=requests.get(event.data.requestId);if(!request)return;
    requests.delete(event.data.requestId);clearTimeout(request.timeout);
    if(event.data.error)request.reject(new Error(event.data.error));else request.resolve(event.data.snapshot);
  }
  if(event.source===window.opener&&event.data?.type==='personalvault:canvas-window:init'){
    initialization=event.data;
    document.title=`${initialization.title} · 自由画布`;
    document.getElementById('canvasWindowTitle').textContent=document.title;
    initialize();
  }
});
function startEditing(){
  if(!loaded||!initialization.editable)return;
  if(!window.opener?.beginFloatingCanvasEdit(initialization.key))return;
  editing=true;canvas.contentWindow.WorkbenchCanvas.setMode('edit');
  document.getElementById('editFloatingCanvas').hidden=true;
  document.getElementById('confirmFloatingCanvas').hidden=false;
  document.getElementById('cancelFloatingCanvas').textContent='取消';
  document.getElementById('canvasModeLabel').textContent='编辑画布';
  document.getElementById('canvasActionHint').textContent='确认保存画布；取消放弃本轮修改。';
}
function showReadMode({discard=false}={}){
  editing=false;
  canvas.contentWindow.WorkbenchCanvas?.setMode('view',{discard});
  document.getElementById('editFloatingCanvas').hidden=!initialization?.editable;
  document.getElementById('confirmFloatingCanvas').hidden=true;
  document.getElementById('cancelFloatingCanvas').textContent='关闭';
  document.getElementById('canvasModeLabel').textContent='阅读画布';
  document.getElementById('canvasActionHint').textContent='阅读模式不会误改内容。';
}
function captureFloatingCanvas(){
  return new Promise((resolve,reject)=>{
    const requestId=++sequence;
    const timeout=setTimeout(()=>{requests.delete(requestId);reject(new Error('读取画布超时，请重试'));},30000);
    requests.set(requestId,{resolve,reject,timeout});
    canvas.contentWindow.postMessage({type:'personalvault:canvas:snapshot',requestId},'*');
  });
}
function cancelEditing(){
  if(!editing||closing)return;
  showReadMode({discard:true});
  document.getElementById('canvasActionHint').textContent='本轮修改已取消。';
}
async function confirmEditing(){
  if(!editing||closing)return;
  closing=true;
  const actions=[...document.querySelectorAll('footer button')];actions.forEach(button=>button.disabled=true);
  try{
    const snapshot=await captureFloatingCanvas();
    const saved=await window.opener.confirmFloatingCanvas(initialization.key,snapshot);
    initialization.snapshot=saved.snapshot;initialization.linkedMedia=saved.linkedMedia;
    canvas.contentWindow.postMessage({type:'personalvault:canvas:saved',...saved},'*');
    if(initialization.mode==='edit'){
      initialization.mode='view';startEditing();
    }else showReadMode();
    document.getElementById('canvasActionHint').textContent='画布修改已保存。';
  }catch(error){document.getElementById('canvasActionHint').textContent=error.message;}
  finally{closing=false;actions.forEach(button=>button.disabled=false);}
}
window.requestFloatingCanvasClose=async(confirm=false)=>{
  if(finished)return true;
  if(closing)return false;closing=true;
  const actions=[...document.querySelectorAll('footer button')];actions.forEach(button=>button.disabled=true);
  try{
    window.opener?.returnFloatingCanvas(initialization?.key,null);
    finished=true;return true;
  }catch(error){document.getElementById('canvasActionHint').textContent=error.message;return false;}
  finally{closing=false;actions.forEach(button=>button.disabled=false);}
};
window.finishFloatingCanvas=async(confirm=false)=>{if(await window.requestFloatingCanvasClose(confirm))window.close();};
document.getElementById('editFloatingCanvas').addEventListener('click',startEditing);
document.getElementById('closeCanvasWindow').addEventListener('click',()=>void window.finishFloatingCanvas());
document.getElementById('cancelFloatingCanvas').addEventListener('click',()=>editing?cancelEditing():void window.finishFloatingCanvas());
document.getElementById('confirmFloatingCanvas').addEventListener('click',()=>void confirmEditing());
window.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();if(editing)cancelEditing();else void window.finishFloatingCanvas();}});
window.opener?.postMessage({type:'personalvault:canvas-window:ready'},'*');
