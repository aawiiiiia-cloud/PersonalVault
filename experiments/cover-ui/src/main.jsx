import React, {useState,useEffect,useRef,useLayoutEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {CollectionCards} from './cards.jsx';
function Thumbnail({item}) {
  const [failed,setFailed]=useState(false);
  useEffect(()=>setFailed(false),[item.url]);
  return <>{item.url&&!failed?(item.videoPreview?<video src={item.url} muted playsInline preload="auto" onError={()=>setFailed(true)}/>:<img src={item.url} alt="" loading="lazy" onError={()=>setFailed(true)}/>):<span className="cover-placeholder">{item.category||'资料'}</span>}{item.category==='视频'&&<span className="cover-video-badge">▶ {item.duration||'视频'}</span>}</>;
}
function Stack({items=[],selectedId=null}) {
  const selected=items.find(item=>item.id===selectedId),layers=selected?[selected]:items.slice(0,3);
  return <div className={`cover-stack ${layers.length>1?'cover-stack-multiple':''}`} aria-label={selected?'指定封面':`自动封面，${items.length} 个文件`}>
    {layers.length?[...layers].reverse().map((item,i)=>{const depth=layers.length-1-i;return <div className={`cover-layer ${depth===0?'cover-layer-front':''}`} key={item.id} style={{'--cover-depth':depth,zIndex:3-depth}}><Thumbnail item={item}/></div>;}):<div className="cover-layer cover-layer-front"><span className="cover-placeholder">资料</span></div>}
    {!selected&&items.length>3&&<span className="cover-count">+{items.length-3}</span>}
  </div>;
}
function CoverChoices({items,selectedId,choose}) {
  const viewport=useRef(null),drag=useRef(null),[edges,setEdges]=useState({back:false,next:false});
  useLayoutEffect(()=>{
    const node=viewport.current;
    const measure=()=>setEdges({back:node.scrollLeft>1,next:node.scrollLeft+node.clientWidth<node.scrollWidth-1});
    measure();node.addEventListener('scroll',measure);
    const observer=new ResizeObserver(measure);observer.observe(node);
    return ()=>{node.removeEventListener('scroll',measure);observer.disconnect();};
  },[items]);
  const scroll=direction=>viewport.current.scrollBy({left:direction*Math.max(116,viewport.current.clientWidth*.8),behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});
  const stop=event=>{
    if(viewport.current.hasPointerCapture(event.pointerId))viewport.current.releasePointerCapture(event.pointerId);
    if(drag.current)drag.current.active=false;
  };
  const arrow=<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M6 3L13 9L6 15Z"/></svg>;
  return <div className="cover-choice-strip">
    <button type="button" className="cover-scroll-arrow cover-scroll-back" aria-label="向左浏览封面" disabled={!edges.back} onClick={()=>scroll(-1)}>{arrow}</button>
    <div ref={viewport} className="cover-options" role="group" aria-label="选择封面" onDragStart={event=>event.preventDefault()}
      onPointerDown={event=>{if(event.button===0)drag.current={active:true,moved:false,x:event.clientX,left:event.currentTarget.scrollLeft};}}
      onPointerMove={event=>{
        const state=drag.current;if(!state?.active)return;
        const distance=event.clientX-state.x;if(!state.moved&&Math.abs(distance)<5)return;
        if(!state.moved){state.moved=true;event.currentTarget.setPointerCapture(event.pointerId);}
        event.preventDefault();event.currentTarget.scrollLeft=state.left-distance;
      }} onPointerUp={stop} onPointerCancel={stop}
      onClickCapture={event=>{if(drag.current?.moved){event.preventDefault();event.stopPropagation();}}}>
      <button type="button" className="cover-option-auto" aria-pressed={!selectedId} onClick={()=>choose(null)}>自动封面</button>
      {items.map(item=><button type="button" className="cover-option" key={item.id} aria-pressed={selectedId===item.id} title={item.name} onClick={()=>choose(item.id)}><span className="cover-option-image"><Thumbnail item={item}/></span><span>{item.name}</span></button>)}
      {!items.length&&<span className="cover-empty">画布中暂无图片或视频</span>}
    </div>
    <button type="button" className="cover-scroll-arrow" aria-label="向右浏览封面" disabled={!edges.next} onClick={()=>scroll(1)}>{arrow}</button>
  </div>;
}
function Picker({items:initial=[],selectedId:initialSelection=null,onSelect,onRefresh}) {
  const [items,setItems]=useState(initial),[selectedId,setSelected]=useState(initialSelection),[open,setOpen]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState('');
  useEffect(()=>setItems(initial),[initial]);
  useEffect(()=>setSelected(initialSelection),[initialSelection,initial]);
  const choose=id=>{setSelected(id);onSelect(id);setOpen(false);};
  const toggle=async()=>{if(open){setOpen(false);return;}setLoading(true);setError('');try{setItems(await onRefresh());setOpen(true);}catch(e){setError(e.message||'封面加载失败');}finally{setLoading(false);}};
  return <section className={`cover-picker ${open?'cover-picker-open':''}`}><div className="cover-picker-preview"><Stack items={items} selectedId={selectedId}/></div><div className="cover-picker-body"><div className="cover-picker-heading"><strong>封面</strong><span>{selectedId&&items.some(i=>i.id===selectedId)?'指定封面':'自动封面'}</span></div><div className="cover-picker-actions"><button type="button" onClick={toggle} disabled={loading} aria-expanded={open}>{loading?'加载中…':open?'收起':'选择封面'}</button>{selectedId&&<button type="button" onClick={()=>choose(null)}>恢复自动封面</button>}</div>{error&&<p role="alert">{error}</p>}</div>
    {open&&<CoverChoices items={items} selectedId={selectedId} choose={choose}/>}
  </section>;
}
const roots=new Map();
function mount(element,props,picker=false){let root=roots.get(element);if(!root){root=createRoot(element);roots.set(element,root);}root.render(picker?<Picker key={props.key} {...props}/>:<Stack {...props}/>);}
function cleanup(){for(const [element,root] of roots)if(!element.isConnected){root.unmount();roots.delete(element);}}
new MutationObserver(cleanup).observe(document.body,{subtree:true,childList:true});
window.WorkbenchCover={mount,cleanup};
const cardRoots=new WeakMap();
window.WorkbenchCards={render(element,props){let root=cardRoots.get(element);if(!root){root=createRoot(element);cardRoots.set(element,root);}flushSync(()=>root.render(<CollectionCards {...props} Stack={Stack}/>));}};
window.dispatchEvent(new Event('workbench-cover-ready'));
