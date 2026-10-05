import {controls,defaults,validate} from './recent-motion-model.js';
const storageKey='knowledge-workbench-recent-motion-tuning-v1';
let settings={...defaults},child=null;
try{settings=validate(JSON.parse(localStorage.getItem(storageKey))?.parameters||defaults);}catch{}
const hints={responseMs:'数值越小，卡片越快跟随滚轮。',settleMs:'数值越小，回落结束越快。',idleMs:'多久没有滚动后开始回落。',sensitivity:'数值越大，同样的滚动距离翻得越多。',gestureGapMs:'间隔超过此值，按新一次动作计算。',notchThreshold:'达到此滚动量时，至少完成一张翻页。'};
const groups=[...new Set(controls.map(c=>c.group))];
document.querySelector('#controls').innerHTML=groups.map(group=>`<fieldset><legend>${group}</legend>${controls.filter(c=>c.group===group).map(c=>`<div class="parameter"><div class="parameter-head"><label for="${c.key}">${c.label}</label><span class="value"><input id="number-${c.key}" type="number" min="${c.min}" max="${c.max}" step="${c.step}" aria-label="${c.label}数值"><span>${c.unit}</span></span></div><input id="${c.key}" type="range" min="${c.min}" max="${c.max}" step="${c.step}" aria-label="${c.label}">${hints[c.key]?`<p class="hint">${hints[c.key]}</p>`:''}</div>`).join('')}</fieldset>`).join('');
function reflect(){
 for(const c of controls){document.getElementById(c.key).value=settings[c.key];document.getElementById(`number-${c.key}`).value=settings[c.key];}
 document.querySelector('#json').value=JSON.stringify({version:1,parameters:settings},null,2);
}
function apply(){
 reflect();if(!child)return;
 child.eval('updateRecentStack(0)');
 child.__recentMotionSettings={...settings};
 document.querySelector('#motionStatus').textContent='参数已生效 · 在卡片上滚动试试';
}
function changed(key,value){settings=validate({...settings,[key]:value});localStorage.setItem(storageKey,JSON.stringify({version:1,parameters:settings}));apply();document.querySelector('#savedStatus').textContent='已保留在本页；调好后点击「保存调节结果」。';}
for(const c of controls)for(const id of [c.key,`number-${c.key}`])document.getElementById(id).addEventListener('input',event=>changed(c.key,event.target.value));
function installPreview(){
 const frame=document.querySelector('#preview');
 try{if(!frame.contentWindow?.eval('typeof scrollRecentStack==="function"'))return false;}catch{return false;}
 child=frame.contentWindow;
 child.__recentMotionSettings={...settings};
 const style=child.document.createElement('style');
 style.textContent=`.sidebar,.sidebar-resize-handle,.desktop-titlebar,.workspace-header,.topbar,.home-quick-actions,.home-activity-section,.home-grid,.home-section-head{display:none!important}.app-shell{display:block!important;min-height:0!important;height:auto!important}body{margin:0}main{padding:0 24px!important;overflow:hidden!important}#homeView>*{display:none!important}#homeView>.home-card-columns{display:block!important}.home-project-section,.home-pending-section{display:none!important}.home-recent-navigation{margin-bottom:10px!important}`;
 child.document.head.append(style);
 child.eval(`(()=>{const entries=state.entries.filter(e=>['project','knowledge','source'].includes(e.type)&&!e.deletedAt).slice(0,6);while(entries.length<6){entries.push({id:'motion-preview-'+entries.length,type:'project',title:['视频黑边检测工具','钉钉跨表统计工具','图库001','工作记录','资料整理','知识笔记'][entries.length],status:'active',content:'用滚轮体验当前参数。标题、封面和文本区域与正式卡片保持一致。'});}window.__motionPreviewVisits=entries.map(entry=>({id:entry.id,at:new Date().toISOString()}));entries.filter(entry=>!entryById(entry.id)).forEach(entry=>state.entries.push(entry));recentVisits=()=>window.__motionPreviewVisits;homeRecentIndex=0;renderHome();})();`);
 child.document.addEventListener('click',event=>{if(event.target.closest('.home-recent-card')){event.preventDefault();event.stopImmediatePropagation();}},true);
 document.querySelector('#save').disabled=false;apply();return true;
}
const ready=setInterval(()=>{try{if(installPreview())clearInterval(ready);}catch(error){clearInterval(ready);document.querySelector('#motionStatus').textContent=error.message;}},100);
document.querySelector('#resetParameters').addEventListener('click',()=>{settings={...defaults};localStorage.setItem(storageKey,JSON.stringify({version:1,parameters:settings}));apply();});
document.querySelector('#resetPreview').addEventListener('click',()=>child?.eval('updateRecentStack(0);homeRecentIndex=0;updateRecentStack(0)'));
for(const [id,delta] of [['singleUp',-120],['singleDown',120],['burst',2400]])document.getElementById(id).addEventListener('click',()=>child?.eval(`scrollRecentStack(${delta},performance.now())`));
document.querySelector('#save').addEventListener('click',async()=>{
 const status=document.querySelector('#savedStatus');status.textContent='正在保存…';
 try{
  const response=await fetch('http://127.0.0.1:4174/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:1,parameters:settings})});
  if(!response.ok)throw new Error('保存服务未响应');
  status.textContent='调节结果已保存。告诉我「调好了」，我会读取参数再同步到正式界面。';
 }catch(error){status.textContent='参数已保留在本页。保存服务暂不可用，可复制「查看参数」中的内容给我。';}
});
setInterval(()=>{
 if(!child)return;
 const info=child.eval('({index:homeRecentIndex,motion:homeRecentMotion?{velocity:homeRecentMotion.velocity,position:homeRecentMotion.position,target:homeRecentMotion.target,active:homeRecentMotion.active}:null})');
 document.querySelector('#motionStatus').textContent=info.motion?(info.motion.active?'正在跟随滚动':'正在回落'):'已停止';
 document.querySelector('#motionValue').textContent=info.motion?`速度 ${Math.abs(info.motion.velocity).toFixed(2)} 张/秒 · 剩余 ${Math.abs(info.motion.target-info.motion.position).toFixed(2)} 张`:`当前第 ${info.index+1} 张 · 仅预览`;
},100);
reflect();
