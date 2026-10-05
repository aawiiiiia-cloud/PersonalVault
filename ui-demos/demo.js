const $ = s => document.querySelector(s);
const paths = {plus:'M12 5v14M5 12h14',home:'m3 10 9-7 9 7v10H3zM9 20v-7h6v7',inbox:'M4 4h16v16H4zM4 14h5l1 3h4l1-3h5',areas:'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',graph:'M6 6l12 12M18 6 6 18M8 6h8M6 8v8M18 8v8M8 18h8M6 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6M18 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6M6 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6M18 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6',project:'M3 6h7l2 3h9v11H3z',spark:'m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z',source:'M5 3h11l3 3v15H5zM9 10h6M9 14h6M9 18h4',chevron:'m9 5 7 7-7 7',trash:'M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7',settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2',search:'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14M15 15l6 6',grid:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',list:'M8 5h13M8 12h13M8 19h13M3 5h1M3 12h1M3 19h1',close:'m5 5 14 14M19 5 5 19',link:'M10 14l4-4M8 16l-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0M16 8l2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0',code:'m8 6-6 6 6 6M16 6l6 6-6 6M14 3l-4 18',play:'m8 4 12 8-12 8z'};
// Four connected nodes: a vertical branch, a diagonal link, and a horizontal branch.
paths.graph='M5.1 6.7 6.6 17.2M8.5 17.5l3.7-5.1M15.4 10.5h3.4M4.8 2.5a2.1 2.1 0 1 0 0 4.2 2.1 2.1 0 0 0 0-4.2M7 17.1a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8M13.4 8.1a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8M20.7 8.6a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8';
function icons(root=document){root.querySelectorAll('[data-icon]').forEach(e=>{e.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[e.dataset.icon]||paths.spark}"/></svg>`;});}
const esc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ai='AI 工具与自动化', design='创意与设计';
let serial=0;
function item(type,title,summary,status='进行中',domain=ai){return {id:++serial,type,title,summary,status,domain};}
const items=[
item('projects','视频黑边检测工具','让重复检查变得轻松。通过 FFmpeg 与边缘检测，建立稳定的视频质量检查流程。'),
item('projects','钉钉跨表统计工具','连接分散的表格，用一个入口完成数据汇总，让统计结果随业务一起更新。'),
item('projects','自由画布工作台','文本、图片、视频与表格自由连接，把灵感整理成自己的工作空间。','进行中',design),
item('projects','开源工具评估流程','从一个真实场景出发，记录验证过程，找到值得长期使用的工具。','未开始'),
item('projects','创意素材归档','建立可以随时翻看的素材库，让好想法在下一次创作中再次出现。','已完成',design),
item('projects','个人知识空间升级','让项目、知识与资料相互连接，形成一个越用越顺手的个人工作台。','未开始',design),
item('knowledge','通用核心与业务外壳应该分开','已有库和工具负责通用能力，自己的精力用于只有业务现场才知道的规则。','已确认'),
item('knowledge','先验证，再扩大自动化','先用小样本验证关键假设，再把稳定的流程交给工具。','待验证'),
item('knowledge','让知识之间建立连接','一条孤立的笔记只是记录，和项目、资料建立联系后，才能在需要时被找到。','已确认',design),
item('knowledge','好的工具应降低切换成本','把常用信息放在同一个空间，让每一个操作都顺着思考的节奏。','待验证',design),
item('sources','Tyrrrz / YoutubeDownloader','同事推荐的现成下载工具，后续与自己的 yt-dlp GUI 对照研究。','未读'),
item('sources','BlockSuite 自由画布','块编辑器与自由画布的组合，为自己的工作台提供可复用的基础能力。','已读'),
item('sources','UI 设计灵感集','收集清爽的配色、灵活的布局与有趣的小细节，为下一版界面寻找方向。','已读',design),
item('sources','视频样本与测试素材','不同编码、分辨率和片头片尾样本，组成可以反复使用的测试集。','未读'),
item('inbox','试试更有趣的界面','保持清晰，同时让每天打开工作台的那一刻更有活力。','待整理',design),
item('inbox','给视频测试补充样本','整理异常黑边样本，补齐人工验证的参照。','待整理'),
item('inbox','记录一个新想法','把零散想法先接住，再慢慢找到它属于哪个项目。','待整理',design)
];
const configs={projects:['项目','把想法，做成项目','从一个问题出发，在实践中找到自己的答案。','MAKE THINGS HAPPEN','每一步，都算数。'],knowledge:['知识','让经验，长成知识','留下有用的判断，让下一次思考有迹可循。','CONNECT THE DOTS','每一次理解，都有回响。'],sources:['资料','给灵感，一个入口','收藏值得再看的内容，让发现成为创作的起点。','STAY CURIOUS','好内容，值得留下。'],home:['工作台','今天，从这里开始','项目、知识与资料，在同一个空间相遇。','YOUR SECOND SPACE','想法正在发生。'],inbox:['随手记','先接住，每个想法','不用急着分类，把脑海里的灵感留在这里。','CAPTURE THE MOMENT','灵感不必等。'],areas:['领域','沿着兴趣，继续探索','按领域查看你的项目、经验与收藏。','FOLLOW YOUR INTEREST','让兴趣有迹可循。'],graph:['关系图谱','把线索，连成网络','每张卡片都是一个起点，沿着关联发现新的思路。','EVERYTHING CONNECTS','点击卡片，查看关联内容。'],trash:['回收站','让空间，保持轻盈','本次演示没有删除的内容。','A LITTLE ROOM','']};
let section='projects',display='gallery',filter='全部',current=null,editing=false,isNew=false;
let toastTimer;
function toast(t){$('#toast').textContent=t;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),2600);}
function theme(t){if(!['orbit','mint','pop'].includes(t))t='orbit';document.body.dataset.theme=t;document.querySelectorAll('[data-theme-choice]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.themeChoice===t)));const u=new URL(location.href);u.searchParams.set('theme',t);history.replaceState(null,'',u);}
function baseItems(){return items.filter(i=>section==='trash'?false:['home','areas','graph'].includes(section)||i.type===section);}
function render(){const c=configs[section];$('#breadcrumb').textContent=c[0];$('#page-title').innerHTML=esc(c[1])+'<span class="heading-spark">✳</span>';$('#page-description').textContent=c[2];$('#eyebrow').textContent=c[3];$('#collection-tagline').textContent=c[4];$('#new-label').textContent='新建'+(['projects','knowledge','sources'].includes(section)?c[0]:'卡片');
document.querySelectorAll('[data-section]').forEach(b=>b.classList.toggle('active',b.dataset.section===section));document.querySelectorAll('[data-display]').forEach(b=>{b.classList.toggle('active',b.dataset.display===display);b.setAttribute('aria-pressed',String(b.dataset.display===display));});
const base=baseItems(),statuses=['全部',...new Set(base.map(i=>i.status))];if(!statuses.includes(filter))filter='全部';$('#filters').innerHTML=statuses.map(s=>`<button data-filter="${esc(s)}" class="${s===filter?'active':''}" aria-pressed="${s===filter}">${esc(s)} <small>${s==='全部'?base.length:base.filter(i=>i.status===s).length}</small></button>`).join('');
const query=$('#search').value.trim().toLowerCase(),domain=$('#domain').value;
const result=base.filter(i=>(filter==='全部'||i.status===filter)&&(domain==='all'||i.domain===domain)&&`${i.title} ${i.summary}`.toLowerCase().includes(query));$('#item-count').textContent=result.length;$('#count-label').textContent='个'+(['projects','knowledge','sources'].includes(section)?c[0]:'内容');$('#collection').className=display;$('#empty').hidden=result.length>0;
$('#collection').innerHTML=result.map((i,n)=>`<article class="content-card"><button class="card-open" data-open="${i.id}"><div class="card-cover cover-${n%6}"><span class="cover-index">${String(n+1).padStart(2,'0')} / ${i.type==='projects'?'BUILD':i.type==='knowledge'?'THINK':'EXPLORE'}</span><div class="cover-art"><span class="art-window"></span><span data-icon="${['code','graph','areas','search','spark','project'][n%6]}"></span></div><span class="cover-dots">···</span></div><div class="card-copy"><div class="card-topline"><span class="card-kind">${configs[i.type][0]}</span><span class="status ${statusClass(i.status)}">${esc(i.status)}</span></div><h2>${esc(i.title)}</h2><p class="card-summary">${esc(i.summary)}</p></div></button><div class="card-footer"><span class="tag">${esc(i.domain)}</span><span class="card-date">10.${String(1+n).padStart(2,'0')}</span></div><div class="card-links"><span data-icon="link"></span><span>关联内容 · ${n%3+1}</span><b>↗</b></div></article>`).join('');icons($('#collection'));}
function statusClass(s){return ['已完成','已读'].includes(s)?'done':s==='已确认'?'verified':['未开始','待验证','未读','待整理'].includes(s)?'wait':'';}
function navigate(s){section=s;filter='全部';$('#search').value='';$('#domain').value='all';render();}
function setEditing(v){editing=v;['#dialog-title','#canvas-copy','#goal-copy'].forEach(s=>$(s).contentEditable=String(v));$('#canvas').dataset.editing=String(v);$('#cancel-edit').hidden=!v;$('#edit-toggle').textContent=v?'保存':'编辑';$('#card-dialog .dialog-extras input').disabled=!v;}
let pan={x:0,y:0},scale=1,drag=null;
function transform(){ $('#canvas-scene').style.transform=`translate(${pan.x}px,${pan.y}px) scale(${scale})`;$('#zoom-value').textContent=Math.round(scale*100)+'%';}
function fit(){pan={x:0,y:0};scale=Math.min(1,Math.max(.35,($('#canvas').clientWidth-50)/720));transform();}
function open(i,draft=false){current=i;isNew=draft;$('#dialog-title').textContent=i.title;$('#dialog-type').textContent=configs[i.type][0];$('#dialog-domain').textContent=i.domain;$('#dialog-status').textContent=i.status;$('#dialog-status').className='status '+statusClass(i.status);$('#canvas-title').textContent='原始内容';$('#canvas-copy').textContent=i.summary;$('#goal-copy').textContent='把想法变成可以验证的结果，记录过程，逐步完善。';$('#related-link').textContent=i.type==='knowledge'?'视频黑边检测工具':'通用核心与业务外壳应该分开';setEditing(draft);$('#card-dialog').showModal();requestAnimationFrame(fit);}
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.themeChoice){theme(b.dataset.themeChoice);return;}if(b.dataset.section){navigate(b.dataset.section);return;}if(b.dataset.display){display=b.dataset.display;render();return;}if(b.dataset.filter){filter=b.dataset.filter;render();return;}if(b.dataset.domain){navigate('projects');$('#domain').value=b.dataset.domain;render();return;}if(b.dataset.open){open(items.find(i=>i.id===+b.dataset.open));return;}if(b.dataset.action==='close')$('#card-dialog').close();if(b.dataset.action==='data')toast('演示数据仅保存在当前页面，刷新后恢复。');if(b.dataset.action==='trash')navigate('trash');if(b.dataset.action==='new'){const type=['projects','knowledge','sources','inbox'].includes(section)?section:'projects';open(item(type,'给新想法起个名字','在这里写下你的想法。',type==='knowledge'?'待验证':type==='sources'?'未读':type==='inbox'?'待整理':'未开始'),true);}});
$('#search').addEventListener('input',render);$('#domain').addEventListener('change',render);
$('#edit-toggle').onclick=()=>{if(!editing){setEditing(true);return;}current.title=$('#dialog-title').textContent.trim()||'未命名卡片';current.summary=$('#canvas-copy').textContent;if(isNew){items.unshift(current);isNew=false;}setEditing(false);render();toast('已保存到本次演示');};
$('#cancel-edit').onclick=()=>{if(isNew){$('#card-dialog').close();return;}$('#dialog-title').textContent=current.title;$('#canvas-copy').textContent=current.summary;setEditing(false);};
$('#related-link').onclick=()=>{const target=items.find(i=>i.id!==current.id&&i.type===(current.type==='knowledge'?'projects':'knowledge'));$('#card-dialog').close();open(target);};
$('#zoom-in').onclick=()=>{scale=Math.min(2,scale*1.2);transform();};$('#zoom-out').onclick=()=>{scale=Math.max(.3,scale/1.2);transform();};$('#zoom-fit').onclick=fit;
$('#canvas').addEventListener('wheel',e=>{if(!e.ctrlKey)return;e.preventDefault();scale=Math.min(2,Math.max(.3,scale*Math.exp(-e.deltaY*.002)));transform();},{passive:false});
$('#canvas').addEventListener('pointerdown',e=>{if(e.button!==0||e.target.closest('button,[contenteditable="true"]'))return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,px:pan.x,py:pan.y};$('#canvas').setPointerCapture(e.pointerId);});
$('#canvas').addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;pan={x:drag.px+e.clientX-drag.x,y:drag.py+e.clientY-drag.y};transform();});['pointerup','pointercancel','lostpointercapture'].forEach(t=>$('#canvas').addEventListener(t,()=>drag=null));
$('#card-dialog').addEventListener('click',e=>{if(e.target!==$('#card-dialog'))return;const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();});
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('#search').focus();}});
theme(new URL(location.href).searchParams.get('theme'));icons();render();
