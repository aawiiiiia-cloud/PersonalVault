import React, {useState,useEffect,useRef,useLayoutEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {CollectionCards} from './cards.jsx';
function Thumbnail({item}) {
  const [failed,setFailed]=useState(false);
  useEffect(()=>setFailed(false),[item.url]);
  return <>{item.url&&!failed?(item.videoPreview?<video src={item.url} muted playsInline preload="auto" onError={()=>setFailed(true)}/>:<img src={item.url} alt="" loading="lazy" onError={()=>setFailed(true)}/>):<span className="cover-placeholder">{item.missing?'文件缺失':item.category||'资料'}</span>}{item.category==='视频'&&<span className="cover-video-badge">▶ {item.duration||'视频'}</span>}</>;
}
function Stack({items=[],selectedId=null}) {
  const selected=items.find(item=>item.id===selectedId),layers=selected?[selected]:items.slice(0,3);
  return <div className={`cover-stack ${layers.length>1?'cover-stack-multiple':''}`} aria-label={selected?'指定封面':`自动封面，${items.length} 个文件`}>
    {layers.length?[...layers].reverse().map((item,i)=>{const depth=layers.length-1-i;return <div className={`cover-layer ${depth===0?'cover-layer-front':''}`} key={item.id} style={{'--cover-depth':depth,zIndex:3-depth}}><Thumbnail item={item}/></div>;}):<div className="cover-layer cover-layer-front"><span className="cover-placeholder">资料</span></div>}
    {!selected&&items.length>3&&<span className="cover-count">+{items.length-3}</span>}
  </div>;
}
function CoverChoices({items,customCover,selectedId,choose,pickCustom,loading}) {
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
      <button type="button" className={`cover-option ${customCover?'':'cover-option-auto'}`} aria-pressed={Boolean(customCover&&selectedId===customCover.id)} disabled={loading} onClick={pickCustom} title="选择本机图片作为自定义封面">
        {customCover?<span className="cover-option-image"><Thumbnail item={customCover}/></span>:<svg className="cover-custom-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7M3 17l5-5 4 4 3-3 5 5M18 2v8M14 6h8"/></svg>}
        <span>{loading?'读取中…':'自定义封面'}</span>
      </button>
      {items.map(item=><button type="button" className="cover-option" key={item.id} aria-pressed={selectedId===item.id} title={item.name} onClick={()=>choose(item.id)}><span className="cover-option-image"><Thumbnail item={item}/></span><span>{item.name}</span></button>)}
      {!items.length&&<span className="cover-empty">画布中暂无图片或视频</span>}
    </div>
    <button type="button" className="cover-scroll-arrow" aria-label="向右浏览封面" disabled={!edges.next} onClick={()=>scroll(1)}>{arrow}</button>
  </div>;
}
function Picker({items:initial=[],customCover:initialCustom=null,selectedId:initialSelection=null,onSelect,onRefresh,onCustomSelect}) {
  const [items,setItems]=useState(initial),[customCover,setCustomCover]=useState(initialCustom),[selectedId,setSelected]=useState(initialSelection),[open,setOpen]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState('');
  const input=useRef(null);
  useEffect(()=>setItems(initial),[initial]);
  useEffect(()=>setCustomCover(initialCustom),[initialCustom]);
  useEffect(()=>setSelected(initialSelection),[initialSelection,initial]);
  const choose=id=>{setSelected(id);onSelect(id);};
  const toggle=async()=>{if(open){setOpen(false);return;}setLoading(true);setError('');try{setItems(await onRefresh());setOpen(true);}catch(e){setError(e.message||'封面加载失败');}finally{setLoading(false);}};
  const customSelected=Boolean(customCover&&selectedId===customCover.id);
  const upload=async event=>{
    const file=event.target.files?.[0];event.target.value='';if(!file)return;
    setLoading(true);setError('');
    try{const cover=await onCustomSelect(file);setCustomCover(cover);setSelected(cover.id);}
    catch(e){setError(e.message||'自定义封面读取失败');}
    finally{setLoading(false);}
  };
  const pickCustom=()=>input.current.click();
  return <section className={`cover-picker ${open?'cover-picker-open':''}`}><input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif" hidden aria-label="选择自定义封面图片" onChange={upload}/><div className="cover-picker-preview"><Stack items={customSelected?[customCover]:items} selectedId={selectedId}/></div><div className="cover-picker-body"><div className="cover-picker-heading"><strong>封面</strong><span>{customSelected?'自定义封面':selectedId&&items.some(i=>i.id===selectedId)?'指定封面':'自动封面'}</span></div><div className="cover-picker-actions"><button type="button" onClick={toggle} disabled={loading} aria-expanded={open}>{loading?'加载中…':open?'收起':'选择封面'}</button></div></div>
    {open&&<CoverChoices items={items} customCover={customCover} selectedId={selectedId} choose={choose} pickCustom={pickCustom} loading={loading}/>}
    {error&&<p className="cover-picker-error" role="alert">{error}</p>}
  </section>;
}
const roots=new Map();
function mount(element,props,picker=false){let root=roots.get(element);if(!root){root=createRoot(element);roots.set(element,root);}root.render(picker?<Picker key={props.key} {...props}/>:<Stack {...props}/>);}
function unmount(element){const root=roots.get(element);if(root){root.unmount();roots.delete(element);}}
function cleanup(){for(const [element,root] of roots)if(!element.isConnected){root.unmount();roots.delete(element);}}
new MutationObserver(cleanup).observe(document.body,{subtree:true,childList:true});
window.WorkbenchCover={mount,unmount,cleanup};
const cardRoots=new WeakMap();
window.WorkbenchCards={render(element,props){let root=cardRoots.get(element);if(!root){root=createRoot(element);cardRoots.set(element,root);}flushSync(()=>root.render(<CollectionCards {...props} Stack={Stack}/>));}};
window.dispatchEvent(new Event('workbench-cover-ready'));
