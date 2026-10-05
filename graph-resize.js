(() => {
  const handle=document.getElementById('graphResizeHandle'),shell=handle?.closest('.graph-workspace');
  if(!handle||!shell)return;
  const key='knowledge-workbench-graph-inspector-ratio',minimumRatio=.15,maximumRatio=.6;
  let ratio=null,legacyWidth=248,drag=null;
  try {
    const value=Number(localStorage.getItem(key));
    if(Number.isFinite(value)&&value>=minimumRatio&&value<=maximumRatio)ratio=value;
    const old=Number(localStorage.getItem('knowledge-workbench-graph-inspector-width'));
    if(Number.isFinite(old)&&old>=200)legacyWidth=old;
  }catch{}
  const minimum=()=>shell.clientWidth*minimumRatio;
  const maximum=()=>shell.clientWidth*maximumRatio;
  function apply(value,persist=false){
    const width=Math.max(minimum(),Math.min(maximum(),value));
    shell.style.setProperty('--graph-inspector-width',width+'px');
    handle.setAttribute('aria-valuemin',Math.round(minimum()));handle.setAttribute('aria-valuemax',Math.round(maximum()));handle.setAttribute('aria-valuenow',width);
    if(persist){ratio=width/shell.clientWidth;try{localStorage.setItem(key,String(ratio));}catch{}}
  }
  handle.addEventListener('pointerdown',event=>{
    if(event.button!==0||innerWidth<=760)return;
    event.preventDefault();drag={id:event.pointerId,x:event.clientX,width:Number(handle.getAttribute('aria-valuenow'))};
    handle.setPointerCapture(event.pointerId);document.body.classList.add('is-resizing-graph');
  });
  handle.addEventListener('pointermove',event=>{if(drag?.id===event.pointerId)apply(drag.width+drag.x-event.clientX);});
  function finish(event){
    if(drag?.id!==event.pointerId)return;
    drag=null;document.body.classList.remove('is-resizing-graph');apply(Number(handle.getAttribute('aria-valuenow')),true);
    if(handle.hasPointerCapture(event.pointerId))handle.releasePointerCapture(event.pointerId);
  }
  for(const name of ['pointerup','pointercancel','lostpointercapture'])handle.addEventListener(name,finish);
  handle.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();const width=Number(handle.getAttribute('aria-valuenow'));
    apply(event.key==='Home'?minimum():event.key==='End'?maximum():width+(event.key==='ArrowLeft'?10:-10),true);
  });
  new ResizeObserver(()=>{
    if(innerWidth<=760||!shell.clientWidth||drag)return;
    if(ratio===null){apply(legacyWidth,true);}else apply(shell.clientWidth*ratio);
  }).observe(shell);
})();
