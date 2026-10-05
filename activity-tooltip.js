(() => {
  const calendar=document.getElementById('homeActivityCalendar');
  if(!calendar)return;
  const tooltip=document.createElement('div');
  tooltip.id='activityTooltip';tooltip.className='activity-tooltip';tooltip.role='tooltip';tooltip.hidden=true;
  document.body.append(tooltip);
  let active=null;
  function hide(){active?.removeAttribute('aria-describedby');active=null;tooltip.hidden=true;}
  function show(cell){
    if(!cell||cell.classList.contains('outside-range'))return;
    hide();active=cell;tooltip.textContent=cell.getAttribute('aria-label');tooltip.hidden=false;
    cell.setAttribute('aria-describedby',tooltip.id);
    const rect=cell.getBoundingClientRect(),bounds=tooltip.getBoundingClientRect();
    tooltip.style.left=Math.max(8,Math.min(innerWidth-bounds.width-8,rect.left+(rect.width-bounds.width)/2))+'px';
    tooltip.style.top=(rect.top-bounds.height-8>=8?rect.top-bounds.height-8:Math.min(innerHeight-bounds.height-8,rect.bottom+8))+'px';
  }
  calendar.addEventListener('pointerover',event=>show(event.target.closest('.home-activity-cell')));
  calendar.addEventListener('pointermove',event=>{const cell=event.target.closest('.home-activity-cell');if(cell!==active)show(cell);});
  calendar.addEventListener('pointerout',event=>{if(event.target.closest('.home-activity-cell'))hide();});
  calendar.addEventListener('focusin',event=>show(event.target.closest('.home-activity-cell')));
  calendar.addEventListener('focusout',hide);
  window.addEventListener('scroll',hide,true);window.addEventListener('resize',hide);
  document.addEventListener('keydown',event=>{if(event.key==='Escape')hide();});
})();
