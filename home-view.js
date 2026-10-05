(function(global){
'use strict';
function create(context){
const {$,$$,standaloneCardId,getState,getView,summary,escapeHtml,typeLabel,statusTone,statusOf,entryById,inboxEntries,cardCoverData,loadCardSummary}=context;
const RECENT_VISITS_KEY = 'knowledge-workbench-recent-visits';
const ACTIVITY_PREFIX='knowledge-workbench-activity:';
function activityDay(date=new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function recordActivity() {
  const now=new Date();
  localStorage.setItem(ACTIVITY_PREFIX+crypto.randomUUID(),activityDay(now));
  const cutoff=new Date(now);cutoff.setDate(cutoff.getDate()-370);
  const oldest=activityDay(cutoff);
  for(const key of Object.keys(localStorage))if(key.startsWith(ACTIVITY_PREFIX)&&localStorage.getItem(key)<oldest)localStorage.removeItem(key);
  if(!standaloneCardId)renderActivityCalendar();
}
let homeRecentIndex=0,homeRecentSignature='',homeRecentWheelAt=0,homeRecentWheelTimer=null;
let homeRecentAnimation=null,homeRecentQueuedStep=0;
let homeRecentMotion=null;
function createHomeStackState(id){return {id,index:0,signature:'',animation:null,queued:0,motion:null,wheelAt:0,wheelTimer:null,pool:[],bag:[]};}
const homeStacks={
  recent:{id:'#homeRecent',
    get index(){return homeRecentIndex;},set index(value){homeRecentIndex=value;},
    get animation(){return homeRecentAnimation;},set animation(value){homeRecentAnimation=value;},
    get queued(){return homeRecentQueuedStep;},set queued(value){homeRecentQueuedStep=value;},
    get motion(){return homeRecentMotion;},set motion(value){homeRecentMotion=value;},
    get wheelAt(){return homeRecentWheelAt;},set wheelAt(value){homeRecentWheelAt=value;},
    get wheelTimer(){return homeRecentWheelTimer;},set wheelTimer(value){homeRecentWheelTimer=value;},pool:[]},
  projects:createHomeStackState('#homeProjects'),
  pending:createHomeStackState('#homePending')
};
const RECENT_MOTION_SETTINGS=Object.freeze({"downMs":470,"upMs":420,"maxAcceleration":2,"responseMs":5,"settleMs":10,"idleMs":35,"sensitivity":1.6,"gestureLimit":1,"gestureGapMs":120,"notchThreshold":30,"escapePadding":14,"tilt":10});
const RECENT_MOTION_PREVIEW=new URLSearchParams(location.search).has('recent-motion-preview');
function recentMotionSettings(){return RECENT_MOTION_PREVIEW&&window.__recentMotionSettings?window.__recentMotionSettings:RECENT_MOTION_SETTINGS;}
function recentVisits() {
  try { const saved=JSON.parse(localStorage.getItem(RECENT_VISITS_KEY)||'[]'); return Array.isArray(saved)?saved.filter(item=>typeof item.id==='string'&&typeof item.at==='string'):[]; } catch { return []; }
}
function recordVisit(entry) {
  if(!entry||entry.deletedAt||!['project','knowledge','source'].includes(entry.type))return;
  localStorage.setItem(RECENT_VISITS_KEY,JSON.stringify([{id:entry.id,at:new Date().toISOString()},...recentVisits().filter(item=>item.id!==entry.id)].slice(0,24)));
  if(!standaloneCardId&&getView()==='home')renderHome();
}

function homeStackCard(entry,index,at,stackKey) {
  const text=summary(entry);
  const time=stackKey==='recent'?at:entry.updatedAt;
  return '<button class="home-recent-card" data-home-stack="'+stackKey+'" data-recent-index="'+index+'" data-recent-id="'+escapeHtml(entry.id)+'"><span class="home-recent-meta"><span class="entry-type entry-type--'+entry.type+'">'+typeLabel(entry.type)+'</span><span class="status-pill status--'+statusTone(entry)+'">'+escapeHtml(statusOf(entry))+'</span></span><h3>'+escapeHtml(entry.title)+'</h3><p>'+escapeHtml((text==='暂时没有摘要'?'':text).slice(0,1200))+'</p><span class="home-visit-time">'+(stackKey==='recent'?'访问于 ':'修改于 ')+escapeHtml(time?WorkbenchData.dayOf(time):'')+'</span></button>';
}
function homeCoverKey(entry) {
  return JSON.stringify([entry.assetId,entry.assetCategory,entry.canvasVersion,entry.updatedAt||entry.updated]);
}
function syncHomeCard(card,entry,index,at,stackKey) {
  card.dataset.recentIndex=String(index);
  const setText=(selector,text)=>{const target=card.querySelector(selector);if(target.textContent!==text)target.textContent=text;};
  const type=card.querySelector('.entry-type');
  type.className='entry-type entry-type--'+entry.type;
  setText('.entry-type',typeLabel(entry.type));
  card.querySelector('.status-pill').className='status-pill status--'+statusTone(entry);
  setText('.status-pill',statusOf(entry));
  setText('h3',entry.title);
  const text=summary(entry);
  setText('p',(text==='暂时没有摘要'?'':text).slice(0,1200));
  const time=stackKey==='recent'?at:entry.updatedAt;
  setText('.home-visit-time',(stackKey==='recent'?'访问于 ':'修改于 ')+(time?WorkbenchData.dayOf(time):''));
  const coverKey=homeCoverKey(entry);
  if(card.dataset.coverKey!==coverKey){
    card.dataset.coverKey=coverKey;
    card.querySelector('.home-recent-cover')?.remove();
    card.classList.remove('has-cover');
    delete card.dataset.hydrating;
  }
}
function shuffledHomeEntries(entries) {
  const result=entries.slice();
  for(let i=result.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}
  return result;
}
function recycleHomeStack(stackKey,from,step) {
  if(stackKey==='recent'||!step)return;
  const stack=homeStacks[stackKey],count=$$(stack.id+' .home-recent-card').length;
  if(stack.pool.length<=count)return;
  const direction=Math.sign(step);
  for(let turn=0;turn<Math.abs(step);turn++){
    const center=((from+direction*turn)%count+count)%count,next=(center+direction+count)%count;
    const cards=$$(stack.id+' .home-recent-card');
    const retiring=cards.findIndex((card,index)=>Math.abs(recentStackOffset(index,next,count)-recentStackOffset(index,center,count))>1);
    if(retiring<0)continue;
    const visible=new Set(cards.map(card=>card.dataset.recentId));
    if(!stack.bag?.some(id=>!visible.has(id)))stack.bag=(stackKey==='pending'?shuffledHomeEntries(stack.pool):stack.pool).map(entry=>entry.id);
    const at=stack.bag.findIndex(id=>!visible.has(id));
    if(at<0)continue;
    const entry=entryById(stack.bag.splice(at,1)[0]);
    if(entry)cards[retiring].outerHTML=homeStackCard(entry,retiring,null,stackKey);
  }
  void hydrateRecentCovers(stackKey);
}
function renderHome() {
  if(standaloneCardId)return;
  const visits=recentVisits().map(visit=>({...visit,entry:entryById(visit.id)})).filter(item=>item.entry&&!item.entry.deletedAt).slice(0,6);
  const projects=getState().entries.filter(entry=>entry.type==='project'&&!entry.deletedAt&&entry.status==='active').sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));
  const pending=[...new Map([...inboxEntries(),...getState().entries.filter(entry=>!entry.deletedAt&&((entry.type==='source'&&entry.readingStatus==='unread')||(entry.type==='knowledge'&&entry.confidence==='draft')))].map(entry=>[entry.id,entry])).values()];
  $('#homeProjectCount').textContent=projects.length;
  $('#homePendingCount').textContent=pending.length;
  const decks={recent:visits,projects:projects.slice(0,6).map(entry=>({entry})),pending:shuffledHomeEntries(pending).slice(0,6).map(entry=>({entry}))};
  const empty={recent:'打开项目、知识或资料后，会在这里显示。',projects:'暂无进行中的项目。',pending:'暂无待整理内容。'};
  for(const [stackKey,stack] of Object.entries(homeStacks)) {
    const container=$(stack.id),cards=$$(stack.id+' .home-recent-card');
    const pool=stackKey==='pending'?pending:stackKey==='projects'?projects:decks[stackKey].map(item=>item.entry);
    const byId=new Map(decks[stackKey].map(item=>[item.entry.id,item]));
    const signature=JSON.stringify(pool.map(entry=>entry.id).sort());
    if(signature===stack.signature){
      const entries=new Map(pool.map(entry=>[entry.id,entry]));
      const current=cards.map(card=>entries.get(card.dataset.recentId)).filter(Boolean);
      if(current.length)decks[stackKey]=current.map(entry=>({entry,at:byId.get(entry.id)?.at}));
    }else stack.bag=[];
    stack.pool=pool;
    stack.signature=signature;
    const deck=decks[stackKey];
    const layoutChanged=deck.length!==cards.length||deck.some(({entry},index)=>entry.id!==cards[index]?.dataset.recentId);
    if(layoutChanged)updateRecentStack(0,{stackKey});
    const existing=new Map(cards.map(card=>[card.dataset.recentId,card]));
    const next=deck.map(({entry,at},index)=>{
      let card=existing.get(entry.id);
      if(!card){const template=document.createElement('template');template.innerHTML=homeStackCard(entry,index,at,stackKey);card=template.content.firstElementChild;}
      syncHomeCard(card,entry,index,at,stackKey);
      return card;
    });
    container.classList.toggle('has-cards',deck.length>0);
    if(layoutChanged){
      const frontId=cards[stack.index]?.dataset.recentId;
      const frontIndex=next.findIndex(card=>card.dataset.recentId===frontId);
      stack.index=frontIndex<0?0:frontIndex;
      container.replaceChildren(...next);
      updateRecentStack(0,{stackKey});
    }
    if(!deck.length&&!container.querySelector('.home-empty'))container.innerHTML='<div class="home-empty"><span>'+empty[stackKey]+'</span></div>';
    void hydrateRecentCovers(stackKey);
  }
  renderActivityCalendar();
}
async function hydrateRecentCovers(stackKey='recent') {
  await Promise.all($$(homeStacks[stackKey].id+' .home-recent-card').map(async card=>{
    const entry=entryById(card.dataset.recentId);
    if(!entry||card.classList.contains('has-cover')||card.dataset.hydrating)return;
    const coverKey=homeCoverKey(entry);
    card.dataset.coverKey=coverKey;card.dataset.hydrating=coverKey;
    const isCurrent=()=>card.isConnected&&card.dataset.coverKey===coverKey;
    try {
      if(entry.assetId||entry.canvasVersion===1){
        const data=await cardCoverData(entry),cover=data.items.find(item=>item.id===data.selectedId)||data.items[0];
        if(cover?.url&&isCurrent()){const image=new Image();image.className='home-recent-cover';image.alt='';image.draggable=false;image.decoding='async';image.src=cover.url;await image.decode();if(isCurrent()){card.querySelector('h3').after(image);card.classList.add('has-cover');}}
      }
    } catch { /* Keep the text fallback if media is unavailable. */ }
    finally {
      if(isCurrent()&&!card.classList.contains('has-cover')&&entry.canvasVersion===1){try{const text=await loadCardSummary(entry);if(isCurrent())card.querySelector('p').textContent=text||'';}catch{}}
      if(card.dataset.hydrating===coverKey)delete card.dataset.hydrating;
    }
  }));
}

function recentStackOffset(index,center,count) {
  let offset=(index-center+count)%count;
  if(offset>Math.floor(count/2))offset-=count;
  return offset;
}
function recentStackTransform(y,z,scale,x=0,tilt=0,rotation=0) {
  return `perspective(1100px) translate3d(${x}px,${y}px,${z}px) rotateX(${tilt}deg) rotateZ(${rotation}deg) scale(${scale})`;
}
function recentStackPose(offset) {
  if(!offset)return {x:0,rotation:0};
  const depth=Math.abs(offset),side=depth%2?1:-1;
  return {x:side*(6+depth*2),rotation:side*Math.sign(offset)*(.45+depth*.2)};
}
function updateRecentStack(step=0,{queueLimit=6,duration=600,continuous=false,stackKey='recent'}={}) {
  const stack=homeStacks[stackKey];
  const cfg=recentMotionSettings();
  if(stack.motion&&!continuous){
    cancelAnimationFrame(stack.motion.frame);stack.motion=null;
    const previous=stack.animation;stack.animation=null;stack.queued=0;
    previous?.forEach(animation=>animation.cancel());$(stack.id).classList.remove('is-animating');
  }
  const cards=$$(stack.id+' .home-recent-card'),count=cards.length;
  const container=$(stack.id);
  stack.layoutWidth=container.getBoundingClientRect().width;
  const spacing=44*Math.max(1,stack.layoutWidth/320);
  container.style.setProperty('--home-stack-spacing',spacing+'px');
  if(step&&stack.animation){stack.queued=Math.max(-queueLimit,Math.min(queueLimit,stack.queued+step));return;}
  if(!continuous){clearTimeout(stack.wheelTimer);stack.wheelTimer=null;stack.wheelAt=0;}
  if(!step&&stack.animation){
    const previous=stack.animation;stack.animation=null;stack.queued=0;
    previous.forEach(animation=>animation.cancel());
    $(stack.id).classList.remove('is-animating');
  }
  if(!count)return;
  const previousIndex=stack.index;
  stack.index=((stack.index+step)%count+count)%count;
  cards.forEach((card,index)=>{
    const offset=recentStackOffset(index,stack.index,count);
    const pose=recentStackPose(offset);
    card.style.transform=recentStackTransform(offset*spacing,0,1-Math.abs(offset)*.07,pose.x,0,pose.rotation);
    card.style.zIndex=String(10-Math.abs(offset));
    card.classList.toggle('is-front',offset===0);
    card.tabIndex=offset===0?0:-1;
    card.setAttribute('aria-hidden',String(offset!==0));
    if(offset===0)card.dataset.edit=card.dataset.recentId;else delete card.dataset.edit;
  });
  if(!step||count<2||previousIndex===stack.index)return;
  if(matchMedia('(prefers-reduced-motion:reduce)').matches){recycleHomeStack(stackKey,previousIndex,step);updateRecentStack(0,{continuous,stackKey});return;}
  const reverse=step===-1,direction=reverse?1:Math.sign(step);
  const smooth=value=>{const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t);};
  const spring=(value,damping=7,frequency=9)=>{
    const t=Math.max(0,Math.min(1,value));
    return t===1?1:1-Math.exp(-damping*t)*(Math.cos(frequency*t)+(damping/frequency)*Math.sin(frequency*t));
  };
  const animations=cards.map((card,index)=>{
    const from=recentStackOffset(index,reverse?stack.index:previousIndex,count),to=recentStackOffset(index,reverse?previousIndex:stack.index,count);
    const wrapping=Math.abs(to-from)>Math.abs(step),leaving=index===(reverse?stack.index:previousIndex);
    const escapeY=-direction*(card.offsetHeight+cfg.escapePadding);
    const fromPose=recentStackPose(from),toPose=recentStackPose(to);
    const frames=Array.from({length:41},(_,frame)=>{
      const t=frame/40;
      const progress=to===0?spring((t-.12)/.88):smooth(t);
      const scaleFrom=1-Math.abs(from)*.07,scaleTo=1-Math.abs(to)*.07;
      let x=fromPose.x+(toPose.x-fromPose.x)*progress,y=from*spacing+(to-from)*spacing*progress,scale=scaleFrom+(scaleTo-scaleFrom)*progress,rotation=fromPose.rotation+(toPose.rotation-fromPose.rotation)*progress,tilt=0,z=0;
      if(to===0) {
        const reveal=Math.sin(Math.PI*Math.max(0,Math.min(1,(t-.12)/.88)));
        tilt=-direction*4.5*reveal;z=11*reveal;
      }
      if(leaving) {
        // Clear the foreground card before changing the departing card's layer.
        // The card stays opaque, so media never dissolve into another card.
        const out=smooth((t-.10)/.34),back=spring((t-.54)/.46,12,8);
        const lift=smooth(t/.12)*(1-smooth((t-.16)/.30));
        y=t<.5?escapeY*out:escapeY+(to*spacing-escapeY)*back;
        scale=t<.5?1+.028*lift-.04*out:.96+(scaleTo-.96)*back;
        rotation=t<.5?direction*(3*lift+1.5*out):direction*1.5*(1-back)+toPose.rotation*back;
        tilt=direction*cfg.tilt*lift;z=14*lift;x=t<.5?direction*8*lift:toPose.x*back;
      }
      const layer=leaving?(t<.5?20:10-Math.abs(to)):to===0?15:wrapping?1:10-Math.max(Math.abs(from),Math.abs(to));
      return {offset:t,zIndex:String(frame===40?10-Math.abs(to):layer),transform:recentStackTransform(y,z,scale,x,tilt,rotation),opacity:1};
    });
    const path=reverse?frames.slice().reverse().map(frame=>({...frame,offset:1-frame.offset})):frames;
    return card.animate(path,{duration,easing:'linear'});
  });
  stack.animation=animations;
  $(stack.id).classList.add('is-animating');
  Promise.allSettled(animations.map(animation=>animation.finished)).then(()=>{
    if(stack.animation!==animations)return;
    stack.animation=null;$(stack.id).classList.remove('is-animating');
    if(!continuous){recycleHomeStack(stackKey,previousIndex,step);updateRecentStack(0,{stackKey});}
    if(stack.queued){const next=Math.sign(stack.queued);stack.queued-=next;updateRecentStack(next,{stackKey});}
  });
}

// A single position and velocity drive the existing card arc throughout a wheel gesture.
// Each integer is a settled card; fractional positions scrub an opaque lift/return arc.
function scrollRecentStack(delta,now,{lineMode=false,stackKey='recent'}={}) {
  const stack=homeStacks[stackKey];
  const cfg=recentMotionSettings();
  if(matchMedia('(prefers-reduced-motion:reduce)').matches){updateRecentStack(Math.sign(delta),{stackKey});return;}
  if(!stack.motion){
    updateRecentStack(0,{stackKey});
    stack.motion={origin:stack.index,base:0,position:0,target:0,gestureAnchor:0,velocity:0,segment:null,last:now,frame:0,active:true};
  }
  const motion=stack.motion;
  const gap=stack.wheelAt?now-stack.wheelAt:Infinity;
  if(!motion.active&&gap>cfg.gestureGapMs)motion.gestureAnchor=Math.round(motion.target);
  stack.wheelAt=now;motion.active=true;
  // A wheel detent commits at least one card. Small touchpad packets accumulate.
  // Cap the entire gesture, rather than queuing more cards after reaching its limit.
  const discrete=lineMode||Math.abs(delta)>=cfg.notchThreshold||(gap>120&&Math.abs(delta)>=32);
  const distance=discrete?Math.sign(delta)*Math.max(1,Math.round(Math.abs(delta)*cfg.sensitivity/120)):delta*cfg.sensitivity/120;
  motion.target=Math.max(motion.gestureAnchor-cfg.gestureLimit,Math.min(motion.gestureAnchor+cfg.gestureLimit,motion.target+distance));
  clearTimeout(stack.wheelTimer);
  stack.wheelTimer=setTimeout(()=>{
    stack.wheelTimer=null;
    if(stack.motion!==motion)return;
    motion.active=false;
    motion.target=Math.round(motion.target);
  },cfg.idleMs);
  if(!motion.frame)motion.frame=requestAnimationFrame(now=>tickRecentStack(now,stackKey));
}
function tickRecentStack(now,stackKey='recent') {
  const stack=homeStacks[stackKey];
  const cfg=recentMotionSettings();
  const motion=stack.motion;if(!motion)return;
  motion.frame=0;
  const dt=Math.min(.032,Math.max(.001,(now-motion.last)/1000));motion.last=now;
  const omega=motion.active?1000/cfg.responseMs:1000/cfg.settleMs,error=motion.position-motion.target,c=motion.velocity+omega*error,decay=Math.exp(-omega*dt);
  const next=motion.target+(error+c*dt)*decay;
  motion.velocity=(motion.velocity-omega*c*dt)*decay;
  // Larger gestures can traverse several cards. Adapt follow speed to distance
  // without discarding input or restarting the animation.
  const defaultSpeed=1000/(error<0?cfg.downMs:cfg.upMs);
  const multiple=Math.abs(motion.target-motion.gestureAnchor)>1;
  const speed=Math.min(defaultSpeed*cfg.maxAcceleration,multiple?defaultSpeed+Math.abs(error)*3:defaultSpeed);
  const travel=Math.max(-speed*dt,Math.min(speed*dt,next-motion.position));
  motion.position+=travel;
  motion.velocity=Math.max(-speed,Math.min(speed,motion.velocity));
  const cards=$$(stack.id+' .home-recent-card'),count=cards.length;
  if(count<2){updateRecentStack(0,{stackKey});return;}
  // Both directions sample the same canonical forward arc. Reverse scrolling
  // rewinds that arc instead of ejecting the current card downwards.
  const base=Math.floor(motion.position),progress=motion.position-base;
  if(!motion.segment||motion.segment.base!==base){
    motion.base=base;
    stack.index=((motion.origin+base)%count+count)%count;
    updateRecentStack(0,{continuous:true,stackKey});motion.segment=null;
    updateRecentStack(1,{continuous:true,stackKey});
    if(stack.animation){
      stack.animation.forEach(animation=>animation.pause());
      motion.segment={base,animations:stack.animation};
    }
  }
  if(motion.segment){
    motion.segment.animations.forEach(animation=>animation.currentTime=progress*animation.effect.getTiming().duration);
  }
  if(!motion.active&&Math.abs(motion.position-motion.target)<.003&&Math.abs(motion.velocity)<.04){
    motion.base=motion.target;
    stack.index=((motion.origin+motion.base)%count+count)%count;
    updateRecentStack(0,{continuous:true,stackKey});
    recycleHomeStack(stackKey,motion.origin,motion.base);
    updateRecentStack(0,{continuous:true,stackKey});stack.motion=null;return;
  }
  motion.frame=requestAnimationFrame(now=>tickRecentStack(now,stackKey));
}

function renderActivityCalendar() {
  if(standaloneCardId)return;
  const counts=new Map();
  for(const key of Object.keys(localStorage))if(key.startsWith(ACTIVITY_PREFIX)) {
    const day=localStorage.getItem(key);
    if(/^\d{4}-\d{2}-\d{2}$/.test(day))counts.set(day,(counts.get(day)||0)+1);
  }
  const end=new Date();end.setHours(12,0,0,0);
  const first=new Date(end);first.setDate(first.getDate()-364);
  const start=new Date(first);start.setDate(start.getDate()-((start.getDay()+6)%7));
  const firstDay=activityDay(first),lastDay=activityDay(end);
  let total=0,activeDays=0,months='',cells='',previousMonth=-1;
  for(let week=0;week<53;week++) {
    const weekStart=new Date(start);weekStart.setDate(start.getDate()+week*7);
    const weekEnd=new Date(weekStart);weekEnd.setDate(weekEnd.getDate()+6);
    const month=(weekEnd>end?end:weekEnd).getMonth();
    if(month!==previousMonth){months+=`<span style="grid-column:${week+1}${week>50?';justify-self:end':''}">${month+1}月</span>`;previousMonth=month;}
    for(let row=0;row<7;row++) {
      const date=new Date(weekStart);date.setDate(date.getDate()+row);
      const day=activityDay(date),inRange=day>=firstDay&&day<=lastDay,count=inRange?(counts.get(day)||0):0;
      if(count){total+=count;activeDays++;}
      const level=count>=8?4:count>=4?3:count>=2?2:count?1:0;
      const label=`${day}：${count} 次活跃`;
      cells+=`<span class="home-activity-cell ${inRange?'':'outside-range'}" data-day="${day}" data-count="${count}" data-level="${level}" style="grid-column:${week+1};grid-row:${row+1}" ${inRange?`aria-label="${label}" role="img"`:'aria-hidden="true"'}></span>`;
    }
  }
  $('#homeActivityCalendar').innerHTML=`<div class="home-activity-months">${months}</div><div class="home-activity-cells">${cells}</div>`;
  $('#homeActivitySummary').textContent=`过去一年 · ${activeDays} 天活跃 · ${total} 次操作`;
}


for(const [stackKey,stack] of Object.entries(homeStacks)){
  $(stack.id).addEventListener('wheel',event=>{
    if(event.ctrlKey||$$(stack.id+' .home-recent-card').length<2)return;
    event.preventDefault();
    const delta=(event.deltaY||event.deltaX)*(event.deltaMode===1?16:event.deltaMode===2?300:1);
    if(delta)scrollRecentStack(delta,performance.now(),{lineMode:event.deltaMode!==0,stackKey});
  },{passive:false});
  $(stack.id).addEventListener('keydown',event=>{
    if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)||$$(stack.id+' .home-recent-card').length<2)return;
    event.preventDefault();updateRecentStack(['ArrowUp','ArrowLeft'].includes(event.key)?-1:1,{stackKey});
    $(stack.id+' .is-front')?.focus({preventScroll:true});
  });
}

const homeStackSizeObserver=new ResizeObserver(records=>{
  for(const record of records){
    const pair=Object.entries(homeStacks).find(([,stack])=>$(stack.id)===record.target);
    if(pair&&Math.abs(record.contentRect.width-(pair[1].layoutWidth??0))>.5)updateRecentStack(0,{stackKey:pair[0]});
  }
});
Object.values(homeStacks).forEach(stack=>homeStackSizeObserver.observe($(stack.id)));

function handleStackClick(target) {
  const control=target.closest('[data-recent-step]');
  if(control){updateRecentStack(Number(control.dataset.recentStep),{stackKey:control.dataset.homeStack||'recent'});return true;}
  const card=target.closest('.home-recent-card:not(.is-front)');
  if(!card)return false;
  const stackKey=card.dataset.homeStack||'recent',stack=homeStacks[stackKey],count=$$(stack.id+' .home-recent-card').length;
  let step=(Number(card.dataset.recentIndex)-stack.index+count)%count;
  if(step>count/2)step-=count;
  updateRecentStack(step,{stackKey});return true;
}
return {renderHome,renderActivityCalendar,recordActivity,recordVisit,handleStackClick,RECENT_VISITS_KEY,ACTIVITY_PREFIX};
}
global.WorkbenchHome={create};
})(window);
