(() => {
  const api=window.workbenchWindow;
  if(!api)return;
  const card=new URLSearchParams(location.search).has('card');
  if(!card&&!document.body.classList.contains('appearance-window')&&!document.querySelector('#closeCanvasWindow, .viewer-navigation'))return;
  let pinned=false,busy=false;
  const buttons=[];
  function refresh(){
    buttons.forEach(button=>{
      button.setAttribute('aria-pressed',String(pinned));
      button.setAttribute('aria-label',pinned?'取消窗口置顶':'固定窗口到最上层');
      button.title=pinned?'取消固定':'固定在所有应用上方';
      button.querySelector('span').textContent=pinned?'已固定':'固定';
      button.disabled=busy;
    });
  }
  const selectors=card?['#viewerDialog .main-head-nav','#editorDialog .main-head-nav']:['.appearance-head','.viewer-navigation','body > header'];
  function mount(){
    selectors.forEach(selector=>{
      const host=document.querySelector(selector);
      if(!host||host.querySelector('.window-pin-button'))return;
      const button=document.createElement('button');
      button.type='button';button.className='window-pin-button';
      button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6m-5 0v6l-4 5v2h12v-2l-4-5V3M12 16v5"/></svg><span>固定</span>';
      button.addEventListener('click',async()=>{
        if(busy)return;
        busy=true;refresh();
        try{pinned=await api.setPinned(!pinned);}
        catch(error){console.error('窗口固定失败',error);}
        finally{busy=false;refresh();}
      });
      const close=host.querySelector('#closeViewer,#closeDialog,#closeCanvasWindow,#close,[data-close]');
      host.insertBefore(button,close||null);buttons.push(button);refresh();
    });
  }
  mount();
  // The appearance header is created dynamically.
  if(!buttons.length){const observer=new MutationObserver(()=>{mount();if(buttons.length)observer.disconnect();});observer.observe(document.body,{childList:true,subtree:true});}
  void api.pinStatus().then(value=>{pinned=value;refresh();}).catch(error=>console.error(error));
})();
