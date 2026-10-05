(() => {
  const handle=document.getElementById('sidebarResizeHandle'),sidebar=document.getElementById('workspaceSidebar'),shell=handle?.closest('.app-shell');
  if(!handle||!sidebar||!shell)return;
  const key='knowledge-workbench-sidebar-width',minimum=190;
  let preferred=null,drag=null;
  try{const stored=Number(localStorage.getItem(key));if(Number.isFinite(stored)&&stored>=minimum)preferred=stored;}catch{}
  const maximum=()=>Math.max(minimum,Math.min(420,innerWidth-480));
  function apply(width,persist=false){
    const value=Math.round(Math.max(minimum,Math.min(maximum(),width)));
    shell.style.setProperty('--sidebar-width',value+'px');
    handle.setAttribute('aria-valuemin',minimum);handle.setAttribute('aria-valuemax',maximum());handle.setAttribute('aria-valuenow',value);
    if(persist){preferred=value;try{localStorage.setItem(key,String(value));}catch{}}
  }
  function sync(){
    if(innerWidth<=760)return;
    if(preferred!==null)apply(preferred);
    else{handle.setAttribute('aria-valuemin',minimum);handle.setAttribute('aria-valuemax',maximum());handle.setAttribute('aria-valuenow',Math.round(sidebar.getBoundingClientRect().width));}
  }
  handle.addEventListener('pointerdown',event=>{
    if(event.button!==0||innerWidth<=760)return;
    event.preventDefault();
    drag={pointer:event.pointerId,x:event.clientX,width:sidebar.getBoundingClientRect().width};
    handle.setPointerCapture(event.pointerId);document.body.classList.add('is-resizing-sidebar');
  });
  handle.addEventListener('pointermove',event=>{
    if(drag?.pointer===event.pointerId)apply(drag.width+event.clientX-drag.x);
  });
  const finish=event=>{
    if(!drag||drag.pointer!==event.pointerId)return;
    drag=null;document.body.classList.remove('is-resizing-sidebar');
    apply(sidebar.getBoundingClientRect().width,true);
    if(handle.hasPointerCapture(event.pointerId))handle.releasePointerCapture(event.pointerId);
  };
  handle.addEventListener('pointerup',finish);handle.addEventListener('pointercancel',finish);handle.addEventListener('lostpointercapture',finish);
  handle.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();const current=sidebar.getBoundingClientRect().width;
    apply(event.key==='Home'?minimum:event.key==='End'?maximum():current+(event.key==='ArrowLeft'?-1:1)*(event.shiftKey?30:10),true);
  });
  window.addEventListener('resize',()=>{if(drag){drag=null;document.body.classList.remove('is-resizing-sidebar');}sync();});
  sync();
})();
