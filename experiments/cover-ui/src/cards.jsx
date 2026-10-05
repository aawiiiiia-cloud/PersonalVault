import React, {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';

function QuickStatus({card,changeStatus}) {
  const trigger=useRef(null),menu=useRef(null);
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useLayoutEffect(()=>{
    if(!open)return;
    const popup=menu.current,rect=trigger.current.getBoundingClientRect();
    popup.showPopover();
    const bounds=popup.getBoundingClientRect();
    popup.style.left=`${Math.max(8,Math.min(rect.right-bounds.width,innerWidth-bounds.width-8))}px`;
    popup.style.top=`${rect.bottom+bounds.height+5<innerHeight-8?rect.bottom+5:Math.max(8,rect.top-bounds.height-5)}px`;
    popup.querySelector('[aria-selected="true"]')?.focus({preventScroll:true});
    const dismiss=()=>setOpen(false);
    window.addEventListener('resize',dismiss);window.addEventListener('scroll',dismiss,true);
    return ()=>{window.removeEventListener('resize',dismiss);window.removeEventListener('scroll',dismiss,true);};
  },[open]);
  const choose=async(value)=>{
    if(busy)return;
    setBusy(true);setError('');
    try{await changeStatus(card.id,value);setOpen(false);trigger.current?.focus({preventScroll:true});}
    catch(e){setError(e.message||'保存失败，请重试');}
    finally{setBusy(false);}
  };
  const keyDown=event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setOpen(false);trigger.current?.focus({preventScroll:true});return;}
    const options=[...menu.current.querySelectorAll('[role="option"]')],index=options.indexOf(document.activeElement);
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
      event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?options.length-1:(index+(event.key==='ArrowDown'?1:-1)+options.length)%options.length;
      options[next]?.focus();
    }
  };
  return <>
    <button ref={trigger} type="button" className={`card-status-trigger status-pill status--${card.tone}`} aria-label={`修改状态：${card.status}`} aria-haspopup="listbox" aria-expanded={open} onClick={event=>{event.stopPropagation();setOpen(!open);}} onKeyDown={event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();event.stopPropagation();setOpen(true);}}}>{card.status}</button>
    {open&&createPortal(<div ref={menu} className="main-status-menu collection-status-menu" popover="auto" role="listbox" aria-label="修改卡片状态" aria-busy={busy} onToggle={event=>{if(event.newState==='closed')setOpen(false);}} onClick={event=>event.stopPropagation()} onKeyDown={keyDown}>
      {card.statusChoices.map(choice=><button key={choice.value} type="button" role="option" aria-selected={choice.value===card.statusValue} disabled={busy} className={`main-status-value status--${choice.tone}`} onClick={()=>choose(choice.value)}>{choice.label}</button>)}
      {error&&<span role="alert" className="card-status-error">{error}</span>}
    </div>,document.body)}
  </>;
}

function RefTag({item,hidden=false}) {
  return <button type="button" className={`type-chip type-chip--${item.type}`} data-open-ref={item.id} title={item.title} hidden={hidden}><small>{item.label}{item.bidirectional?' · 双向':''}</small><span className="ref-title">{item.title}</span></button>;
}

function Relations({group,ownerId}) {
  const node=useRef(null),[visible,setVisible]=useState(group.items.length);
  const limited=group.kind==='content-relations';
  const signature=group.items.map(item=>`${item.id}:${item.title}`).join('|');
  useLayoutEffect(()=>{
    if(!limited || !node.current) return;
    const container=node.current;
    let lastWidth=-1,frame;
    const measure=()=>{
      const width=container.getBoundingClientRect().width;
      if(!width || width===lastWidth) return;
      lastWidth=width;
      const chips=[...container.querySelectorAll('.type-chip')],more=container.querySelector('.relation-overflow');
      const previous=chips.map(chip=>chip.hidden),previousMore=more.hidden,previousText=more.textContent;
      chips.forEach(chip=>chip.hidden=false);more.hidden=true;
      const tops=[];let count=chips.length;
      for(let i=0;i<chips.length;i++) {
        const top=chips[i].offsetTop;
        if(!tops.some(row=>Math.abs(row-top)<2))tops.push(top);
        if(tops.length>2){count=i;break;}
      }
      if(count<chips.length) {
        more.hidden=false;
        // Keep React's text nodes attached while measuring the overflow button.
        const update=()=>{chips.forEach((chip,i)=>chip.hidden=i>=count);more.firstChild.nodeValue=`+${chips.length-count}`;};
        update();
        while(count>0 && more.offsetTop>tops[1]+2){count--;update();}
      }
      chips.forEach((chip,i)=>chip.hidden=previous[i]);more.hidden=previousMore;more.firstChild.nodeValue=previousText;
      setVisible(count);
    };
    measure();
    const observer=new ResizeObserver(()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(measure);});
    observer.observe(container);
    return ()=>{observer.disconnect();cancelAnimationFrame(frame);};
  },[limited,signature]);
  const count=limited?Math.min(visible,group.items.length):group.items.length;
  return <div className={`relation-group ${group.kind}`}><span className="relation-kind">{group.label}</span><div ref={node}>
    {group.items.map((item,i)=><RefTag key={item.id} item={item} hidden={i>=count}/>)}
    {group.url&&<a className="external-link" href={group.url} target="_blank" rel="noopener">打开原文 ↗</a>}
    {limited&&<button type="button" className="relation-overflow" data-open-ref={ownerId} hidden={count===group.items.length} title={`查看其余 ${group.items.length-count} 条关联内容`} aria-label={`查看其余 ${group.items.length-count} 条关联内容`}>{`+${group.items.length-count}`}</button>}
  </div></div>;
}

function ContentCard({card,gallery,loadCover,loadSummary,changeStatus,Stack}) {
  const [cover,setCover]=useState(null),[excerpt,setExcerpt]=useState(card.summary);
  useEffect(()=>{
    let active=true;setExcerpt(card.summary);
    if(card.hasSummary && card.canvasSummary)loadSummary(card.entry).then(text=>{if(active)setExcerpt(text);}).catch(()=>{});
    return ()=>{active=false;};
  },[card.version,card.hasSummary,card.canvasSummary,card.summary,loadSummary]);
  useEffect(()=>{
    let active=true;
    setCover(null);
    if(gallery&&['project','knowledge','source'].includes(card.type))loadCover(card.entry).then(data=>{if(active)setCover(data);}).catch(()=>{if(active)setCover({items:[]});});
    return ()=>{active=false;};
  },[gallery,card.version,card.type,loadCover]);
  const open=card.selecting ? {'data-source-batch-select':card.id,'aria-pressed':card.selected} : {'data-edit':card.id};
  const type=<span className={`entry-type entry-type--${card.type}`}>{card.label}</span>;
  const dates=<span className="entry-dates"><span>创建：{card.createdDate}</span><span>修改：{card.updatedDate}</span></span>;
  const editableStatus=card.statusChoices.length>0;
  const status=<span className={`status-pill status--${card.tone}`} style={editableStatus?{visibility:'hidden'}:undefined} aria-hidden={editableStatus||undefined}>{card.status}</span>;
  const summary=card.hasSummary&&<p data-card-summary={card.id} hidden={!excerpt}>{excerpt?.slice(0,gallery?300:180)}</p>;
  const image=cover?.items?.length>0&&<span className="entry-cover" data-react-cover={card.id}><Stack {...cover}/></span>;
  return <article className={`entry-card react-content-card ${card.selecting?'source-selectable':''} ${card.selected?'selected':''}`} data-react-card={card.id} data-card-type={card.type}>
    <button type="button" className="entry-open" {...open}>
      {card.selecting&&<span className="source-select-indicator" aria-hidden="true">{card.selected?'✓':''}</span>}
      {gallery ? <>
        <span className="entry-gallery-heading">{type}{status}</span>
        <h3>{card.title}</h3>
        {card.type==='source'?<>{image}{summary}</>:<>{summary}{image}</>}
      </> : <>{type}<div><h3>{card.title}</h3>{summary}</div><span className="entry-meta">{dates}</span>{!editableStatus&&<span className="entry-list-status">{status}</span>}</>}
    </button>
    {editableStatus&&<QuickStatus card={card} changeStatus={changeStatus}/>}
    {card.areaOverview ? <div className="card-relations"><span>{card.areaOverview}</span><button type="button" data-browse-area={card.id}>查看该领域内容 →</button></div> : card.groups.length>0&&<div className="card-relations">{card.groups.map(group=><Relations key={group.kind} group={group} ownerId={card.id}/>)}</div>}
    {gallery&&<div className="entry-gallery-date" data-edit={card.selecting?undefined:card.id} data-source-batch-select={card.selecting?card.id:undefined}><span className="entry-meta">{card.date}</span></div>}
  </article>;
}

export function CollectionCards({cards,gallery,loadCover,loadSummary,changeStatus,Stack}) {
  return cards.map(card=><ContentCard key={card.id} card={card} gallery={gallery} loadCover={loadCover} loadSummary={loadSummary} changeStatus={changeStatus} Stack={Stack}/>);
}
