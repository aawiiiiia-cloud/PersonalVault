const STORAGE_KEY = "zhixingtai-v1";
const standaloneCardId=new URLSearchParams(location.search).get('card');
if(standaloneCardId)document.body.classList.add('standalone-card-window');
const SEMANTIC_MODEL_KEY = "knowledge-workbench-semantic-model";
const SEMANTIC_DEVICE_KEY = "knowledge-workbench-semantic-device";
const AREA_NAV_COLLAPSED_KEY = "knowledge-workbench-area-nav-collapsed";
let areaNavCollapsed = localStorage.getItem(AREA_NAV_COLLAPSED_KEY) === "true";
const DEFAULT_SEMANTIC_MODEL = "multilingual-e5-base-q8";

const desktopPlatform=window.workbenchDesktop?.platform;
if (window.workbenchDesktop?.isDesktop && desktopPlatform) {
  document.body.classList.add("desktop-shell",`platform-${desktopPlatform}`);
}

// Keep collection navigation together so wrapping controls share one sticky surface.
const workspaceHeader=document.createElement('div');
workspaceHeader.className='workspace-header';
const workspaceTopbar=document.querySelector('.topbar');
workspaceTopbar.before(workspaceHeader);
workspaceHeader.append(workspaceTopbar);
const collectionHeaderControls=document.createElement('div');
collectionHeaderControls.className='collection-header-controls';
collectionHeaderControls.append(document.querySelector('.collection-toolbar'),document.getElementById('collectionStats'));
workspaceHeader.append(collectionHeaderControls);
const homeHeaderControls=document.createElement('div');
homeHeaderControls.className='home-header-controls';
homeHeaderControls.append(document.querySelector('.home-quick-actions'));
workspaceHeader.append(homeHeaderControls);

const seedEntries = [
  { id:"area-ai", type:"area", title:"AI 工具与自动化", description:"AI 工具学习、Agent 协作、开源项目和工作流程自动化。", scope:"关注工具如何解决真实问题，以及如何沉淀可复用的方法。", status:"active", archived:false, created:"2026-09-14", updated:"2026-09-14" },
  { id:"area-art", type:"area", title:"艺术创作", description:"绘画、雕塑、视觉研究与个人创作实践。", scope:"关注创作主题、材料、形式语言和作品推进。", status:"active", archived:false, created:"2026-09-14", updated:"2026-09-14" },
  { id:"capture-session", type:"capture", title:"整理 Claude Session 记录", origin:"AI 对话", rawContent:"区分原始资料与正式知识，提取真正值得保留的判断。", archived:false, created:"2026-09-07", updated:"2026-09-07" },
  { id:"source-ytd", type:"source", title:"Tyrrrz / YoutubeDownloader", rawContent:"同事推荐的现成下载工具，后续与自己的 yt-dlp GUI 对照研究。", sourceKind:"GitHub", readingStatus:"unread", areaRefs:["area-ai"], archived:false, created:"2026-09-07", updated:"2026-09-07" },
  { id:"project-bars", type:"project", title:"视频黑边检测工具", challenge:"批量视频需要筛查异常黑边，人工检查耗时且标准不一致。", desired:"批量扫描视频，输出可复核的检测结果，并能解释误判。", existingSolution:"FFmpeg：负责读取和分析各种视频；cropdetect：提供现成的黑边候选区域检测。", customDecision:"我负责确定抽样位置、异常标准、误判处理和验收。", executionMode:"collaboration", myRole:"提出业务目标、定义黑边标准、准备测试样本并验收结果。", agentWork:"编写检测脚本、处理 FFmpeg 调用、修复兼容性问题。", nextStep:"用不同编码、分辨率和片头片尾样本建立测试集。", status:"active", areaRefs:["area-ai"], archived:false, created:"2026-08-20", updated:"2026-09-06" },
  { id:"project-ding", type:"project", title:"钉钉跨表统计工具", challenge:"团队多张业务表的数据需要重复清洗和统计。", desired:"团队成员不写代码也能稳定完成跨表统计。", existingSolution:"钉钉 MCP：连接钉钉并调用表格能力。", customDecision:"我负责团队字段含义、清洗标准、人员映射和统计口径。", executionMode:"collaboration", myRole:"提出需求、解释业务、验证结果。", agentWork:"编写脚本和工具调用流程。", nextStep:"收集一次真实使用反馈。", status:"active", areaRefs:["area-ai"], archived:false, created:"2026-08-15", updated:"2026-09-05" },
  { id:"knowledge-core-shell", type:"knowledge", title:"通用核心与业务外壳应该分开", conclusion:"已有库和工具负责通用能力，自己的精力用于只有业务现场才知道的规则。", applies:"开发内部工具、选择开源项目、使用 MCP。", limits:"现成核心无法满足稳定性、隐私或关键差异时，需要重新评估。", sourceRefs:["project-bars","project-ding"], relatedRefs:[], areaRefs:["area-ai"], confidence:"reviewed", archived:false, created:"2026-09-04", updated:"2026-09-04" }
];

const schemas = {
  capture: {
    title:"随手记", kicker:"Notes · 收集", hint:"随手记用于暂存尚未分类的内容。想清楚后，把它转成项目、知识或资料。",
    fields:[
      ["title","标题","text","刚刚遇到了什么？",true,"full"],
      ["origin","从哪里来的","text","例如：AI 对话 / 网页 / 同事推荐 / 自己想到的",false,"full"],
      ["rawContent","原始内容","textarea","先保留原意，不急着总结",true,"full"]
    ]
  },
  area: {
    title:"领域", kicker:"Area · 长期方向", hint:"领域用于区分长期关注方向，不要求完成，也不是项目文件夹。",
    fields:[
      ["title","领域名称","text","例如：AI 工具与自动化 / 艺术创作",true,"full"],
      ["description","这个领域包含什么","textarea","用一句话说明它长期关注的内容",true,"full"],
      ["scope","判断边界","textarea","什么内容属于这里，什么内容不属于",false,"full"],
      ["status","关注状态","select","active|活跃,inactive|暂停关注",false,"full"]
    ]
  },
  project: {
    title:"项目", kicker:"项目", hint:"标题之外均可稍后补充。",
    fields:[
      ["title","标题","text","给项目起一个名字",true,"full"],
      ["areaRefs","所属领域","reference","area",false,"full","输入领域名称搜索；一个项目也可以跨多个领域。",true],
      ["relatedRefs","关联内容","reference","project,knowledge,source",false,"full","可关联其他项目、知识或资料。",true],
      ["status","项目进度","select","not_started|未开始,active|进行中,paused|暂停,done|已完成",false,"full"],
      ["goal","目标与场景","textarea","想完成什么，准备在什么场景中使用？",false,"full"],
      ["tasks","待办列表","tasks","",false,"full"],
      ["content","内容","textarea","想法、过程、资料、判断，都可以写在这里。",false,"full"]
    ]
  },
  review: {
    title:"项目复盘", kicker:"Review · 复盘", hint:"项目复盘附属于某个项目；请从项目阅读页的“写项目复盘”进入。",
    fields:[
      ["title","复盘标题","text","哪个项目 / 哪个阶段",true,"full"],
      ["projectRefs","关联项目","reference","project",true,"full","输入标题即可检索，只能关联一个项目。",false],
      ["result","最终结果","textarea","完成了什么，是否达到预期",true,"full"],
      ["worked","哪些做法有效","textarea","值得继续保留的做法"],
      ["problems","踩过哪些坑","textarea","现象、原因和代价"],
      ["existing","哪些坑网上已有答案","textarea","下次应该提前搜索什么"],
      ["lesson","下次如何调整","textarea","写成明确行动规则",false,"full"],
      ["status","复盘状态","select","draft|草稿,reviewed|已完成"]
    ]
  },
  knowledge: {
    title:"知识", kicker:"知识", hint:"标题之外均可稍后补充。",
    fields:[
      ["title","标题","text","这条知识叫什么？",true,"full"],
      ["areaRefs","所属领域","reference","area",false,"full","输入领域名称搜索；知识可以连接多个领域。",true],
      ["relatedRefs","关联内容","reference","project,knowledge,source",false,"full","可关联项目、知识或资料；与依据/来源不同。",true],
      ["confidence","置信度","select","draft|待验证,basic|基本可信,reviewed|已确认",false,"full"],
      ["origin","来源","textarea","对话、网页、书籍、人物、经历或 URL。",false,"full"],
      ["content","内容","textarea","自由记录结论、例子、疑问或补充说明。",false,"full"]
    ]
  },
  source: {
    title:"资料", kicker:"资料", hint:"标题之外均可稍后补充。",
    fields:[
      ["title","标题","text","资料名称",true,"full"],
      ["areaRefs","所属领域","reference","area",false,"full","输入领域名称搜索；资料可以服务多个领域。",true],
      ["relatedRefs","关联内容","reference","project,knowledge,source",false,"full","可关联项目、知识或其他资料。",true],
      ["readingStatus","阅读状态","select","unread|未读,reading|处理中,processed|已处理",false,"full"],
      ["origin","来源","textarea","网址、作者、平台或发现位置。",false,"full"],
      ["content","备注与摘要","textarea","摘要、用途、关键词和个人判断，均可写在这里。",false,"full"]
    ]
  }
};

const formGroups = {
  capture:[
    { title:"记录内容", description:"先忠实保留当时的信息，不要求立刻形成结论。", fields:["title","origin","rawContent"] }
  ],
  area:[
    { title:"领域定义", description:"领域是长期存在的关注方向，用边界帮助自己判断内容应该归到哪里。", fields:["title","description","scope","status"] }
  ],
  project:[
    { title:"标题", description:"", fields:["title"] },
    { title:"卡片信息", description:"归属、关联与当前进度。", fields:["areaRefs","relatedRefs","status"] },
    { title:"目标与场景", description:"", fields:["goal"] },
    { title:"待办列表", description:"", fields:["tasks"] },
    { title:"内容", description:"不知道该放在哪里的内容，可以直接写在这里。", fields:["content"] }
  ],
  review:[
    { title:"复盘对象", description:"说明这次复盘对应哪个项目，以及目前是否完成整理。", fields:["title","projectRefs","status"] },
    { title:"结果与过程", description:"先还原发生了什么，再判断哪些做法有效、哪些地方踩坑。", fields:["result","worked","problems"] },
    { title:"方法沉淀", description:"把经历转化为下一次可以直接使用的行动规则。", fields:["existing","lesson"] }
  ],
  knowledge:[
    { title:"标题", description:"", fields:["title"] },
    { title:"卡片信息", description:"归属、关联与置信度。", fields:["areaRefs","relatedRefs","confidence"] },
    { title:"来源", description:"自由记录出处，不是关联选择器。", fields:["origin"] },
    { title:"内容", description:"不知道该放在哪里的内容，可以直接写在这里。", fields:["content"] }
  ],
  source:[
    { title:"标题", description:"", fields:["title"] },
    { title:"卡片信息", description:"归属、关联与阅读状态。", fields:["areaRefs","relatedRefs","readingStatus"] },
    { title:"来源", description:"自由记录网址、作者或发现位置。", fields:["origin"] },
    { title:"导入文件", description:"已关联文件的信息显示在这里。", fields:[] },
    { title:"内容", description:"备注与摘要均可留空。", fields:["content"] }
  ]
};

let state = window.workbenchDesktop?.isDesktop ? WorkbenchData.normalizeState({entries:[]}) : loadState();
const vaultSession=WorkbenchVaultSession.create({
  normalize:state=>WorkbenchData.normalizeState(state),
  load:async()=>{
    if(window.workbenchDesktop?.loadLatestState)return window.workbenchDesktop.loadLatestState();
    const response=await fetch('/api/vault/state',{cache:'no-store'});
    const result=await response.json();
    if(!response.ok)throw new Error(result.error || '资料库无法读取');
    return result;
  },
  sync:async bundle=>{
    if(window.workbenchDesktop?.syncCards)return window.workbenchDesktop.syncCards(bundle);
    const response=await fetch('/api/vault/sync-cards',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(bundle)});
    const result=await response.json();
    if(!response.ok)throw new Error(result.error || '资料库保存失败');
    return result;
  }
});
const canvasRevisions=new Map();
const floatingCanvasRevisions=new Map();
let currentView = "home";
let currentFilter = "all";
const collectionAreaFilterByView={ projects:"all",knowledge:"all",sources:"all" };
let searchReturnView = "home";
let searchScopeType = "";

function collectionType(view=currentView) {
  return ({projects:"project",knowledge:"knowledge",sources:"source"})[view] || "";
}
let searchReturnAreaId = null;
let browsingAreaId = null;
let editingId = null;
let editingCanvasId = null;
let editingCoverSelection = null;
let editingCustomCover = null;
let editingCustomCoverUpload = null;
let editingCustomCoverRequest = null;
let canvasModeSwitch = null;

function cancelCanvasModeSwitch() {
  if (!canvasModeSwitch) return;
  clearTimeout(canvasModeSwitch.timeout);
  canvasModeSwitch=null;
  $("#editorDialog").classList.remove("card-canvas-loading");
}

async function finishCanvasModeSwitch(frame) {
  const pending=canvasModeSwitch;
  if (!pending || pending.frame!==frame) return;
  // The document bridge is ready before image decoding and video posters finish.
  const deadline=performance.now()+10000;
  await frame.contentDocument?.fonts?.ready;
  for (let readyFrames=0; readyFrames<3 && performance.now()<deadline;) {
    await new Promise(requestAnimationFrame);
    if (canvasModeSwitch!==pending || !$("#editorDialog").open) return;
    const media=[...frame.contentDocument.querySelectorAll('img,video')];
    const ready=media.every(item=>item.tagName==='IMG' ? item.complete : Boolean(item.poster) || item.readyState>=2 || Boolean(item.error));
    readyFrames=ready ? readyFrames+1 : 0;
  }
  if (canvasModeSwitch!==pending || !$("#editorDialog").open) return;
  closeViewerDialog();
  cancelCanvasModeSwitch();
  $("#editorDialog").focus({preventScroll:true});
}
const cardCoverDataCache = new Map();
const canvasSummaryCache = new Map();
const canvasSummaryRequests = new Map();
const canvasSummaryKey = entry => `${entry.id}:${entry.updatedAt || entry.updated || ''}`;
async function loadCardSummary(entry) {
  const key=canvasSummaryKey(entry);
  if(canvasSummaryCache.has(key))return canvasSummaryCache.get(key);
  if(!canvasSummaryRequests.has(key))canvasSummaryRequests.set(key,(async()=>{
    const [{longestCanvasText},snapshot]=await Promise.all([import('./canvas-summary.js'),loadCanvasDocument(entry.id)]);
    const text=longestCanvasText(snapshot);
    canvasSummaryCache.set(key,text);
    return text;
  })().finally(()=>canvasSummaryRequests.delete(key)));
  return canvasSummaryRequests.get(key);
}

async function hydrateCardSummaries() {
  await Promise.all([...document.querySelectorAll('[data-card-summary]')].map(async target => {
    const entry=entryById(target.dataset.cardSummary);
    if (!entry || entry.canvasVersion!==1 || !['project','knowledge'].includes(entry.type)) return;
    const key=canvasSummaryKey(entry);
    try {
      if (!canvasSummaryCache.has(key)) {
        if (!canvasSummaryRequests.has(key)) canvasSummaryRequests.set(key,(async()=>{
          const [{longestCanvasText},snapshot]=await Promise.all([import('./canvas-summary.js'),loadCanvasDocument(entry.id)]);
          const text=longestCanvasText(snapshot);
          canvasSummaryCache.set(key,text);
          return text;
        })().finally(()=>canvasSummaryRequests.delete(key)));
        await canvasSummaryRequests.get(key);
      }
      if (target.isConnected) {
        const text=canvasSummaryCache.get(key);
        target.textContent=text.slice(0,Number(target.dataset.summaryLimit) || 300);
        target.hidden=!text;
        scheduleCollectionRelationLimit();
      }
    } catch(error) { console.warn('画布摘要读取失败',error); }
  }));
}

function cardSummaryHtml(entry,limit=300) {
  const text=summary(entry).slice(0,limit);
  return `<p data-card-summary="${escapeHtml(entry.id)}" data-summary-limit="${limit}"${text ? '' : ' hidden'}>${escapeHtml(text)}</p>`;
}

async function coverItems(attachments) {
  return Promise.all((attachments || []).filter(a=>['图片','视频'].includes(a.category)).map(async asset=>{
    const presentation=!asset.previewUrl && window.workbenchDesktop ? await getAssetPresentation(asset.id) : null;
    return { ...asset, id:asset.draft ? `source:${asset.id.slice(6)}` : asset.id, url:asset.previewUrl || (window.workbenchDesktop ? presentation?.previewUrl : `/api/assets/${encodeURIComponent(asset.id)}/preview`),videoPreview:asset.category==='视频'&&asset.previewUrl?.startsWith('blob:'), duration:asset.durationSeconds ? formatDuration(asset.durationSeconds) : '' };
  }));
}
async function cardCoverData(entry) {
  const key=`${entry.id}:${entry.updatedAt || entry.updated || ''}`;
  if(!cardCoverDataCache.has(key))cardCoverDataCache.set(key,(async()=>{
    const snapshot=entry.canvasVersion===1 ? await loadCanvasDocument(entry.id) : null;
    const attachments=snapshot?.attachments || (entry.assetId ? [{id:entry.assetId,name:entry.fileName || entry.title,category:entry.assetCategory,durationSeconds:entry.durationSeconds}] : []);
    const selectedId=snapshot?.coverAssetId || null;
    const custom=snapshot?.customCoverId===selectedId && snapshot?.customCover ? [snapshot.customCover] : [];
    return {items:await coverItems([...attachments,...custom]),selectedId};
  })().catch(error=>{cardCoverDataCache.delete(key);throw error;}));
  return cardCoverDataCache.get(key);
}
async function hydrateCollectionCovers() {
  if(!window.WorkbenchCover)return;
  for(const target of document.querySelectorAll('[data-card-cover]')) {
    const entry=entryById(target.dataset.cardCover);if(!entry)continue;
    try { const data=await cardCoverData(entry);if(target.isConnected){target.hidden=!data.items.length;if(data.items.length)WorkbenchCover.mount(target,data);scheduleCollectionRelationLimit();} }
    catch(error){console.warn('封面加载失败',error);}
  }
}
window.addEventListener('workbench-cover-ready',()=>{
  if(currentView==='home'&&!standaloneCardId)renderHome();
  if(!['home','graph'].includes(currentView))renderCollection();
});

const coverPickerUpdates=new WeakMap();
async function mountCoverPicker(frame,entry,snapshot,liveAttachments=null) {
  const target=frame.closest('.main-card-page')?.querySelector('[data-cover-editor]');
  if(!target)return;
  const version=(coverPickerUpdates.get(target)||0)+1;coverPickerUpdates.set(target,version);
  if(!window.WorkbenchCover)await new Promise(resolve=>window.addEventListener('workbench-cover-ready',resolve,{once:true}));
  if(!target.isConnected || editingCanvasId!==frame.dataset.canvasCardId)return;
  if(liveAttachments===null){
    editingCoverSelection=snapshot?.coverAssetId || null;
    editingCustomCover=snapshot?.customCover ? (await coverItems([snapshot.customCover]))[0] : null;
    editingCustomCoverUpload=null;
  }
  const existing=liveAttachments || snapshot?.attachments || (entry.assetId ? [{id:entry.assetId,name:entry.fileName || entry.title,category:entry.assetCategory,durationSeconds:entry.durationSeconds}] : []);
  const items=await coverItems(existing);
  if(!target.isConnected||coverPickerUpdates.get(target)!==version)return;
  if(editingCoverSelection!==editingCustomCover?.id&&editingCoverSelection&&!items.some(item=>item.id===editingCoverSelection))editingCoverSelection=null;
  WorkbenchCover.mount(target,{key:editingCanvasId,items,customCover:editingCustomCover,selectedId:editingCoverSelection,onSelect:id=>{editingCoverSelection=id;},onCustomSelect:file=>{
    const cardId=editingCanvasId;
    const request=(async()=>{
      if(!/\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(file.name))throw new Error('请选择 PNG、JPG、WebP、GIF、BMP 或 AVIF 图片');
      const dataUrl=await blobDataUrl(file);
      if(!/^data:image\/(png|jpeg|webp|gif|bmp|avif);base64,/.test(dataUrl))throw new Error('请选择常见图片文件');
      const image=new Image();image.src=dataUrl;
      try{await image.decode();}catch{throw new Error('无法读取这张图片，请选择有效的图片文件');}
      if(!target.isConnected||editingCanvasId!==cardId||!$('#editorDialog').open)throw new Error('编辑窗口已关闭');
      editingCustomCoverUpload={name:file.name,dataUrl,width:image.naturalWidth,height:image.naturalHeight};
      editingCustomCover={id:'custom-cover-draft',name:file.name,category:'图片',url:dataUrl};
      editingCoverSelection=editingCustomCover.id;
      return editingCustomCover;
    })();
    editingCustomCoverRequest=request;
    return request.finally(()=>{if(editingCustomCoverRequest===request)editingCustomCoverRequest=null;});
  },onRefresh:async()=>{
    const current=await captureCanvas(frame);
    const live=new Set(Object.values(current.linkedAssets || {}));
    if(current.primaryAssetId)live.add(current.primaryAssetId);
    const items=await coverItems(existing.filter(asset=>live.has(asset.id)));
    for(const [sourceId,url] of Object.entries(current.assets || {})){
      if(!/^data:(image|video)\//.test(url))continue;
      const meta=current.assetMetadata?.[sourceId] || {};
      const category=url.startsWith('data:video/')?'视频':'图片';
      let preview=url;
      if(category==='视频') {
        const video=document.createElement('video');video.muted=true;video.preload='auto';video.src=url;
        try { await new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=()=>reject(new Error('视频首帧暂不可用'));setTimeout(()=>reject(new Error('视频首帧读取超时')),5000);});const canvas=document.createElement('canvas');canvas.width=240;canvas.height=Math.max(1,240*video.videoHeight/video.videoWidth);canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);preview=canvas.toDataURL('image/jpeg'); }
        catch {preview=null;}finally{video.removeAttribute('src');video.load();}
      }
      items.push({id:`source:${sourceId}`,name:meta.name || `画布${category}`,category,url:preview,duration:meta.durationSeconds ? formatDuration(meta.durationSeconds) : ''});
    }
    return items;
  }},true);
}
let viewedEntryId = null;
let editingRefs = {};
let editingRemovedRelations = new Set();
let editingTasks = [];
let editorReturnEntryId = null;
let dragState = null;
let cardResizeState = null;
let indexedSearchIds = null;
let indexedSearchRequest = 0;
let indexedSearchTimer = null;
let sourceDisplayMode = localStorage.getItem("knowledge-workbench-source-display") || "gallery";
const collectionDisplayModes = Object.fromEntries(["projects","knowledge","areaDetail","inbox","areas"].map(view =>
  [view, localStorage.getItem(`knowledge-workbench-${view}-display`) === "gallery" ? "gallery" : "list"]));
function collectionDisplayMode() {
  return currentView === "sources" ? sourceDisplayMode : collectionDisplayModes[currentView] || "list";
}
let sourceBatchMode = false;
let selectedSourceIds = new Set();
let visibleSourceIds = new Set();
let sourceBatchBusy = false;
let sourceBatchFeedback = "";
let lastImportedSourceIds = [];
const assetPresentationCache = new Map();
const assetPresentationRequests = new Map();
let graphController = null;
let currentGraph = { nodes:[],edges:[],areas:[] };
let graphEntrancePending = false;

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const {renderHome,renderActivityCalendar,recordActivity,recordVisit,handleStackClick,RECENT_VISITS_KEY,ACTIVITY_PREFIX}=WorkbenchHome.create({
$,$$,standaloneCardId,getState:()=>state,getView:()=>currentView,summary,escapeHtml,typeLabel,statusTone,statusOf,entryById,inboxEntries,cardCoverData,loadCardSummary
});

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved ? migrateState(saved) : WorkbenchData.normalizeState({ entries:structuredClone(seedEntries) });
  } catch { return WorkbenchData.normalizeState({ entries:structuredClone(seedEntries) }); }
}

function migrateState(saved) {
  return WorkbenchData.normalizeState(saved);
}

function nextStateTime(previous=state.updatedAt) {
  return new Date(Math.max(Date.now(),(Date.parse(previous) || 0)+1)).toISOString();
}

async function saveState(message='已保存') {
  const nextState=WorkbenchData.normalizeState(state);
  render();
  try { await commitUnifiedState(nextState,message);return true; }
  catch(error) {console.error(error);toast('尚未保存到硬盘：'+error.message);return false;}
}

function cacheSavedState(nextState,{keepPrevious=false}={}) {
  try {
    const previous=localStorage.getItem(STORAGE_KEY);
    if(keepPrevious&&previous&&!localStorage.getItem(STORAGE_KEY+'-previous-cache'))localStorage.setItem(STORAGE_KEY+'-previous-cache',previous);
    localStorage.setItem(STORAGE_KEY,JSON.stringify(nextState));
  } catch(error){console.warn('本机缓存不可写，继续使用硬盘资料',error);}
}

async function commitUnifiedState(nextState,message='已保存',options={}) {
  nextState=WorkbenchData.normalizeState(nextState);
  nextState.updatedAt=nextStateTime();
  const report=WorkbenchData.validateState(nextState);
  if(!report.ok)throw new Error(report.errors[0] || '数据检查失败');
  let result;
  try {result=await vaultSession.save({...WorkbenchData.createBundle(nextState),...options});}
  catch(error){$('#vaultResult').innerHTML='<div class="health-line error">尚未保存到硬盘：'+escapeHtml(error.message)+' 可通过“导出完整迁移包”保留本次未保存修改。</div>';throw error;}
  state=WorkbenchData.normalizeState(result.state || nextState);
  cacheSavedState(state);
  if(message!=='已恢复演示数据')try{recordActivity();}catch(error){console.warn('活跃记录不可写，卡片已保存',error);}
  render();toast(message);
  if(result.index?.error)toast('卡片已保存，搜索目录需要重建：'+result.index.error);
  return result;
}

async function hydrateDesktopState() {
  try {
    const result=await vaultSession.open();
    state=WorkbenchData.normalizeState(result.state || {entries:[]});
    cacheSavedState(state,{keepPrevious:true});
    canvasRevisions.clear();cardCoverDataCache.clear();canvasSummaryCache.clear();
    render();
    return true;
  } catch(error) {
    console.error(error);toast('资料库无法载入，已停止硬盘写入：'+error.message);
    return false;
  }
}

function escapeHtml(value="") { return String(value).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }
function today() { return new Date().toLocaleDateString("sv-SE"); }
function typeLabel(type) { return ({capture:"随手记",area:"领域",project:"项目",review:"项目复盘",knowledge:"知识",source:"资料"})[type] || type; }
function statusOf(entry) {
  if (entry.deletedAt) return "回收站";
  if (entry.type === "capture") return "等待分类";
  if (entry.type === "area") return entry.status === "inactive" ? "暂停关注" : "活跃领域";
  const value = entry.type === "knowledge" ? entry.confidence : entry.type === "source" ? entry.readingStatus : entry.status;
  return ({not_started:"未开始",active:"进行中",inactive:"暂停关注",paused:"暂停",done:"已完成",draft:"待验证",basic:"基本可信",reviewed:"已确认",evergreen:"长期有效",superseded:"已被替代",unread:"未读",reading:"处理中",processed:"已处理"})[value] || "正常";
}
function statusTone(entry) {
  if (entry.deletedAt) return "paused";
  if (entry.type === "capture") return "todo";
  if (entry.type === "area") return entry.status === "inactive" ? "paused" : "done";
  const value = entry.type === "knowledge" ? entry.confidence : entry.type === "source" ? entry.readingStatus : entry.status;
  return ({not_started:"todo",draft:"todo",unread:"todo",active:"doing",reading:"doing",basic:"doing",paused:"paused",inactive:"paused",superseded:"paused",done:"done",reviewed:"done",evergreen:"done",processed:"done"})[value] || "paused";
}
function summary(entry) {
  if (entry.type==='source') return String(entry.origin || '').trim();
  if (['project','knowledge'].includes(entry.type) && entry.canvasVersion===1) return canvasSummaryCache.get(canvasSummaryKey(entry)) || '';
  return WorkbenchCardMarkdown.plainText(entry.content) || entry.goal || entry.origin || entry.description || entry.result || entry.rawContent || "暂时没有摘要";
}
function inboxEntries() { return state.entries.filter(e => !e.deletedAt && e.type === "capture"); }
function entryById(id) { return state.entries.find(e => e.id === id); }

function relationButtonHtml(item) {
  const ref = item.entry || item;
  return `<button type="button" class="type-chip type-chip--${escapeHtml(ref.type)}" data-open-ref="${escapeHtml(ref.id)}" title="${escapeHtml(ref.title)}"><small>${escapeHtml(typeLabel(ref.type))}${item.bidirectional ? " · 双向" : ""}</small><span class="ref-title">${escapeHtml(ref.title)}</span></button>`;
}

function relationGroupHtml(label, refs, className="") {
  if (!refs.length) return "";
  return `<div class="relation-group ${className}"><span class="relation-kind">${escapeHtml(label)}</span><div>${refs.map(relationButtonHtml).join("")}</div></div>`;
}

function relationshipGroupsHtml(entry, { includeExternal=false, detailsOnly=false, gallery=false } = {}) {
  const relations = WorkbenchRelations.groups(state,entry);
  const groups = [
    detailsOnly ? "" : relationGroupHtml(gallery ? "领域" : "所属领域 · 分类标签",relations.areas,"area-relations"),
    relationGroupHtml("关联内容",visibleMainRelations(entry,relations),"content-relations"),
    entry.type === "project" ? relationGroupHtml("项目复盘",relations.reviews,"review-relations") : ""
  ];
  if (includeExternal) {
    const externalUrl = safeExternalUrl(entry.url) || safeExternalUrl(String(entry.origin || "").match(/https?:\/\/[^\s)）]+/)?.[0]);
    if (externalUrl) groups.push(`<div class="relation-group external-relation"><span class="relation-kind">原始位置</span><div><a class="external-link" href="${escapeHtml(externalUrl)}" target="_blank" rel="noopener">打开原文 ↗</a></div></div>`);
  }
  return groups.filter(Boolean).join("");
}

function relationshipOverviewHtml(entry) {
  if (!entry || !["project","knowledge","source","review"].includes(entry.type)) return "";
  const groups = relationshipGroupsHtml(entry);
  return `<section class="form-section relationship-overview"><div class="form-section-head"><span>↔</span><div><h3>关系一览</h3><p>主动关联可在上方增删。反向引用只读；如需移除，请编辑建立关联的那张卡片。点击名称可打开卡片。</p></div></div><div class="relationship-groups">${groups || `<p class="empty-relations">尚未建立领域或内容关联</p>`}</div></section>`;
}

function renderGraphInspector(node,graph=currentGraph) {
  const target = $("#graphInspector");
  if (!node) {
    target.innerHTML = `<span class="graph-inspector-kicker">当前选择</span><h2>选择一个节点</h2><p>点击节点查看它的领域和直接关联。拖动节点只会保存为本机界面偏好。</p>`;
    return;
  }
  const relations = WorkbenchGraphData.directRelations(graph,node.id).sort((a,b)=>a.title.localeCompare(b.title,"zh-CN"));
  target.innerHTML = `<span class="graph-inspector-kicker">${escapeHtml(typeLabel(node.type))}</span><h2>${escapeHtml(node.title)}</h2><div class="graph-inspector-areas">${node.areas.length ? node.areas.map(area=>`<button type="button" class="type-chip type-chip--area" data-browse-area="${escapeHtml(area.id)}"><small>领域</small><span class="ref-title">${escapeHtml(area.title)}</span></button>`).join("") : `<span class="graph-no-area">尚未归属领域</span>`}</div><div class="graph-relations"><span>直接关联 <span class="graph-relation-count">${relations.length}</span></span><div class="graph-relation-list">${relations.length ? relations.map(relation=>`<button type="button" class="type-chip type-chip--${escapeHtml(relation.type)}" data-graph-focus="${escapeHtml(relation.id)}"><small>${escapeHtml(typeLabel(relation.type))}</small><span class="ref-title">${escapeHtml(relation.title)}</span></button>`).join("") : `<p>当前没有直接关联。</p>`}</div></div><button type="button" class="graph-view-card" data-graph-open="${escapeHtml(node.id)}">查看卡片</button>`;
}

function graphTypes() {
  return new Set($$("#graphTypeFilters input:checked").map(input=>input.value));
}

function renderGraph() {
  const fullGraph = WorkbenchGraphData.buildGraph(state);
  const areaSelect = $("#graphAreaFilter");
  const selectedArea = areaSelect.value;
  areaSelect.innerHTML = `<option value="">全部领域</option>${fullGraph.areas.sort((a,b)=>a.title.localeCompare(b.title,"zh-CN")).map(area=>`<option value="${escapeHtml(area.id)}">${escapeHtml(area.title)}</option>`).join("")}`;
  areaSelect.value = fullGraph.areas.some(area=>area.id===selectedArea) ? selectedArea : "";
  currentGraph = WorkbenchGraphData.filterGraph(fullGraph,{ types:graphTypes(),areaId:areaSelect.value });
  if (!graphController) {
    graphController = WorkbenchGraphCanvas.createGraphCanvas($("#graphCanvas"),{
      onSelect(node,graph){ renderGraphInspector(node,graph); }
    });
    window.workbenchGraphController = graphController;
  }
  graphController.setGraph(currentGraph);
  if (graphEntrancePending) {
    graphEntrancePending=false;
    graphController.playEntrance();
  }
  const selectedId = graphController.getState().selectedId;
  renderGraphInspector(currentGraph.nodes.find(node=>node.id===selectedId) || null,currentGraph);
  $("#graphNodeCount").textContent = currentGraph.nodes.length;
  $("#graphEdgeCount").textContent = currentGraph.edges.length;
  $("#graphEmpty").classList.toggle("hidden",currentGraph.nodes.length>0);
}

function render() {
  if(standaloneCardId)return;
  const inbox = inboxEntries();
  $("#inboxCount").textContent = inbox.length;
  $("#trashCount").textContent = state.entries.filter(e => e.deletedAt).length;
  for (const [selector, type] of [["#projectNavCount", "project"], ["#knowledgeNavCount", "knowledge"], ["#sourceNavCount", "source"]]) {
    $(selector).textContent = state.entries.filter(entry => entry.type === type && !entry.deletedAt).length;
  }
  renderAreaNav();
  populateSearchFilterOptions();
  renderHome();
  if (currentView === "graph") renderGraph();
  else if (currentView !== "home") renderCollection();
}

function renderAreaNav() {
  const areas = state.entries.filter(e => e.type === "area" && !e.deletedAt && e.status !== "inactive");
  $("#areaNavList").innerHTML = areas.map(area => `<button class="${browsingAreaId === area.id ? "active" : ""}" data-browse-area="${area.id}" title="${escapeHtml(area.title)}">${escapeHtml(area.title)}</button>`).join("");
  $("#areaNavList").hidden = areaNavCollapsed;
  const toggle = $("#areaNavToggle");
  toggle.setAttribute("aria-expanded", String(!areaNavCollapsed));
  const label = areaNavCollapsed ? "展开领域列表" : "收起领域列表";
  toggle.setAttribute("aria-label", label);
  toggle.title = label;
}

function renderPreview(selector, entries, emptyText) {
  const target = $(selector);
  if (!entries.length) { target.innerHTML = `<div class="stack-item"><span class="dot"></span><div><b>${emptyText}</b><small>没有等待你判断的内容</small></div></div>`; return; }
  target.innerHTML = entries.slice(0,3).map(e => `<button class="stack-item" data-edit="${e.id}"><span class="dot"></span><div><b>${escapeHtml(e.title)}</b><small>${typeLabel(e.type)} · ${statusOf(e)}</small></div><time>${escapeHtml(WorkbenchData.dayOf(e.updatedAt))}</time></button>`).join("");
}

const viewConfig = {
  search:{eyebrow:"Search · 检索",title:"搜索结果",types:["project","knowledge","source"],create:"capture",filters:[["all","全部内容"],["project","项目"],["knowledge","知识"],["source","资料"]]},
  inbox:{eyebrow:"Notes · 待分类",title:"随手记",inbox:true,create:"capture",filters:[["all","全部随手记"]]},
  areas:{eyebrow:"Areas · 长期方向",title:"领域",types:["area"],create:"area",filters:[["all","全部领域"]]},
  areaDetail:{eyebrow:"Area · 领域内容",title:"领域",create:null,filters:[["all","全部"],["project","项目"],["knowledge","知识"],["source","资料"]]},
  projects:{eyebrow:"Practice · 实践",title:"项目",types:["project"],create:"project",filters:[["all","全部"],["not_started","未开始"],["active","进行中"],["paused","暂停"],["done","已完成"]]},
  knowledge:{eyebrow:"Distill · 提炼",title:"知识",types:["knowledge"],create:"knowledge",filters:[["all","全部"],["draft","待验证"],["basic","基本可信"],["reviewed","已确认"]]},
  sources:{eyebrow:"Evidence · 来源",title:"资料",types:["source"],create:"source",filters:[["all","全部"],["unread","未读"],["reading","处理中"],["processed","已处理"]]},
  trash:{eyebrow:"Trash · 可恢复删除",title:"回收站",trash:true,create:null,filters:[["all","全部"],["capture","随手记"],["area","领域"],["project","项目"],["knowledge","知识"],["source","资料"]]}
};

function filterValue(entry, value) { return entry.type === value || entry.status === value || entry.confidence === value || entry.readingStatus === value; }

function activeCollectionAreaFilter(){
  return collectionAreaFilterByView[currentView] || WorkbenchCollectionFilter.ALL_AREAS;
}

function renderCollectionAreaFilter(){
  const visible=["projects","knowledge","sources"].includes(currentView);
  const wrap=$("#collectionAreaFilterWrap");
  wrap.classList.toggle("hidden",!visible);
  if(!visible) return;
  const select=$("#collectionAreaFilter");
  const areas=state.entries.filter(entry=>entry.type==="area"&&!entry.deletedAt).sort((a,b)=>a.title.localeCompare(b.title,"zh-CN"));
  const selected=activeCollectionAreaFilter();
  select.innerHTML=`<option value="all">全部领域</option>${areas.map(area=>`<option value="${escapeHtml(area.id)}">${escapeHtml(area.title)}</option>`).join("")}<option value="unassigned">未归属领域</option>`;
  collectionAreaFilterByView[currentView]=["all","unassigned",...areas.map(area=>area.id)].includes(selected)?selected:"all";
  select.value=collectionAreaFilterByView[currentView];
}

function searchStatusChoices() {
  const groups = [
    ["project", "项目", [["not_started", "未开始"], ["active", "进行中"], ["paused", "暂停"], ["done", "已完成"]]],
    ["knowledge", "知识", [["draft", "待验证"], ["basic", "基本可信"], ["reviewed", "已确认"], ["evergreen", "长期有效"]]],
    ["source", "资料", [["unread", "未读"], ["reading", "处理中"], ["processed", "已处理"]]]
  ];
  const type = $("#searchTypeFilter").value;
  return [{value:"", label:"全部状态", typeLabel:""}, ...groups.filter(group => !type || group[0] === type).flatMap(([, typeLabel, values]) => values.map(([value, label]) => ({value, label, typeLabel})))];
}

function syncSearchStatusFilter() {
  const select = $("#searchStatusFilter");
  const choices = searchStatusChoices();
  const value = choices.some(choice => choice.value === select.value) ? select.value : "";
  select.innerHTML = choices.map(choice => `<option value="${choice.value}">${choice.label}${choice.typeLabel ? " · " + choice.typeLabel : ""}</option>`).join("");
  select.value = value;
  $("#searchStatusValue").textContent = choices.find(choice => choice.value === value).label;
  $("#searchStatusMenu").innerHTML = choices.map(choice => `<button type="button" role="option" tabindex="-1" data-search-status="${choice.value}" aria-selected="${choice.value === value}"><span>${choice.label}</span>${choice.typeLabel ? `<small>${choice.typeLabel}</small>` : ""}</button>`).join("");
}

function populateSearchFilterOptions() {
  syncSearchStatusFilter();
  const areaSelect = $("#searchAreaFilter");
  const formatSelect = $("#searchFormatFilter");
  if (!areaSelect || !formatSelect) return;
  const areaValue = areaSelect.value;
  const formatValue = formatSelect.value;
  const areas = state.entries.filter(entry => entry.type === "area" && !entry.deletedAt).sort((a,b) => a.title.localeCompare(b.title,"zh-CN"));
  areaSelect.innerHTML = `<option value="">全部领域</option>${areas.map(area => `<option value="${escapeHtml(area.id)}">${escapeHtml(area.title)}</option>`).join("")}`;
  const formats = [...new Set(state.entries.map(entry => entry.fileExtension).filter(Boolean))].sort();
  formatSelect.innerHTML = `<option value="">全部格式</option>${formats.map(format => `<option value="${escapeHtml(format)}">${escapeHtml(format)}</option>`).join("")}`;
  areaSelect.value = areas.some(area => area.id === areaValue) ? areaValue : "";
  formatSelect.value = formats.includes(formatValue) ? formatValue : "";
}

function searchOptions() {
  const quickType = ["project","knowledge","source"].includes(currentFilter) ? currentFilter : "";
  return {
    query:$("#searchInput").value.trim(),
    mode:$("#searchModeFilter").value || "exact",
    semanticModel:localStorage.getItem(SEMANTIC_MODEL_KEY) || DEFAULT_SEMANTIC_MODEL,
    semanticDevice:localStorage.getItem(SEMANTIC_DEVICE_KEY) || "auto",
    types:searchScopeType ? [searchScopeType] : ["project","knowledge","source"],
    type:searchScopeType || $("#searchTypeFilter").value || quickType,
    areaId:$("#searchAreaFilter").value,
    extension:$("#searchFormatFilter").value,
    status:$("#searchStatusFilter").value,
    dateFrom:$("#searchDateFrom").value,
    dateTo:$("#searchDateTo").value,
    minDuration:$("#searchMinDuration").value,
    maxDuration:$("#searchMaxDuration").value
  };
}

function matchesAdvancedSearch(entry) {
  const options = searchOptions();
  if (options.type && entry.type !== options.type) return false;
  if (options.areaId && !(entry.areaRefs || []).includes(options.areaId)) return false;
  if (options.extension && entry.fileExtension !== options.extension) return false;
  if (options.status && !filterValue(entry,options.status)) return false;
  const updated = entry.updatedAt || entry.updated || "";
  if (options.dateFrom && updated < options.dateFrom) return false;
  if (options.dateTo && updated.slice(0,10) > options.dateTo) return false;
  const duration = Number(entry.durationSeconds);
  if (options.minDuration !== "" && (!Number.isFinite(duration) || duration < Number(options.minDuration))) return false;
  if (options.maxDuration !== "" && (!Number.isFinite(duration) || duration > Number(options.maxDuration))) return false;
  return true;
}

function showIndexedResults(result) {
  indexedSearchIds = new Set(result.results.map(item => item.id));
  renderCollection();
}

function setSearchBadge(message, state = "ready") {
  $("#searchEngineBadge").textContent = message;
  $("#searchEngineBadge").className = `search-engine-badge ${state}`;
}

const semanticSearchCoordinator = WorkbenchSemanticSearch.createCoordinator({
  search:options=>window.workbenchDesktop.search(options),
  warm:()=>window.workbenchDesktop.warmSemantic(semanticPreferences()),
  onExact(result,options) {
    if (currentView !== "search") return;
    showIndexedResults(result);
    if (options.mode === "exact") setSearchBadge(`SQLite 精确检索 · ${result.count} 条`);
  },
  onPreparing() {
    if (currentView === "search") setSearchBadge("精确结果已显示 · 正在准备语义检索 · 首次可能需数秒", "preparing");
  },
  onHybrid(result) {
    if (currentView !== "search" || $("#searchModeFilter").value !== "hybrid") return;
    showIndexedResults(result);
    if (result.semanticUnavailable || result.engine === "exact") {
      setSearchBadge(`语义检索不可用 · 保留精确 ${result.count} 条`, "fallback");
    } else setSearchBadge(`精确＋语义 · ${result.count} 条`);
  },
  onSkipped(result,reason) {
    if (currentView !== "search") return;
    showIndexedResults(result);
    const label = ["non-language","identifier-like"].includes(reason)
      ? `编号或符号按精确检索 · ${result.count} 条`
      : `SQLite 精确检索 · ${result.count} 条`;
    setSearchBadge(label);
  },
  onLoadError(error,result) {
    if (currentView !== "search") return;
    showIndexedResults(result);
    setSearchBadge(`语义模型准备失败 · 保留精确 ${result.count} 条`, "fallback");
    console.error(error);
  },
  onSearchError(error) {
    if (currentView !== "search") return;
    indexedSearchIds = null;
    setSearchBadge("索引不可用 · 临时检索", "fallback");
    console.error(error);
    renderCollection();
  }
});

function queueIndexedSearch(immediate = false) {
  clearTimeout(indexedSearchTimer);
  semanticSearchCoordinator.invalidate();
  indexedSearchIds = null;
  if (currentView !== "search") return;
  if (!window.workbenchDesktop?.search) {
    $("#searchEngineBadge").textContent = "浏览器临时检索";
    $("#searchEngineBadge").className = "search-engine-badge fallback";
    renderCollection();
    return;
  }
  indexedSearchTimer = setTimeout(runIndexedSearch, immediate ? 0 : 140);
}

async function runIndexedSearch() {
  indexedSearchRequest += 1;
  $("#searchEngineBadge").textContent = "SQLite 检索中";
  $("#searchEngineBadge").className = "search-engine-badge";
  await semanticSearchCoordinator.run(searchOptions());
}

function renderCollection() {
  if (currentView === "search") syncSearchStatusFilter();
  const cfg = viewConfig[currentView];
  const browsingArea = currentView === "areaDetail" && browsingAreaId ? entryById(browsingAreaId) : null;
  $("#viewEyebrow").textContent = browsingArea ? "Area · 领域内容" : cfg.eyebrow;
  $("#viewTitle").textContent = browsingArea ? browsingArea.title : cfg.title;
  $("#advancedSearchPanel").classList.toggle("hidden", currentView !== "search");
  renderCollectionAreaFilter();
  $("#filterRow").innerHTML = browsingArea
    ? `<button data-view-link="areas">← 返回领域</button><button class="${currentFilter === "all" ? "active" : ""}" data-filter="all">全部</button><button class="${currentFilter === "project" ? "active" : ""}" data-filter="project">项目</button><button class="${currentFilter === "knowledge" ? "active" : ""}" data-filter="knowledge">知识</button><button class="${currentFilter === "source" ? "active" : ""}" data-filter="source">资料</button>`
    : (currentView === "search" && searchScopeType ? [["all",`全部${typeLabel(searchScopeType)}`]] : cfg.filters).map(([key,label]) => `<button class="${currentFilter === key ? "active" : ""}" data-filter="${key}">${label}</button>`).join("");
  const createButton = $("#collectionCreate");
  const sourceDisplayToggle = $("#sourceDisplayToggle");
  const sourceBatchToggle = $("#sourceBatchToggle");
  const supportsDisplayMode = ["projects","knowledge","sources","areaDetail","inbox","areas"].includes(currentView);
  const supportsBatchMode = Boolean(collectionType());
  const galleryActive = supportsDisplayMode && collectionDisplayMode() === "gallery";
  sourceDisplayToggle.classList.toggle("hidden", !supportsDisplayMode);
  sourceDisplayToggle.setAttribute("aria-label","内容呈现方式");
  sourceBatchToggle.classList.toggle("hidden",!supportsBatchMode);
  sourceBatchToggle.classList.toggle("active",sourceBatchMode && supportsBatchMode);
  sourceBatchToggle.textContent=sourceBatchMode ? "批量整理中" : "批量整理";
  sourceDisplayToggle.querySelectorAll("button").forEach(button => {
    const active=button.dataset.sourceDisplay === collectionDisplayMode();
    button.classList.toggle("active",active);
    button.setAttribute("aria-pressed",String(active));
  });
  $("#contextCreateMenu").classList.add("hidden");
  createButton.classList.toggle("hidden", currentView === "trash");
  if (browsingArea) {
    createButton.removeAttribute("data-create");
    createButton.textContent = `＋ 添加到“${browsingArea.title}”`;
  } else if (cfg.create) {
    createButton.dataset.create = cfg.create;
    createButton.textContent = "＋ 新建";
  } else {
    createButton.removeAttribute("data-create");
  }

  const query = currentView === "search" ? $("#searchInput").value.trim().toLowerCase() : "";
  const pageAreaFilter=activeCollectionAreaFilter();
  const entries = state.entries.filter(e => {
    const locationMatch = cfg.trash ? Boolean(e.deletedAt) : !e.deletedAt;
    const viewMatch = browsingArea ? (e.areaRefs||[]).includes(browsingArea.id) : cfg.inbox ? e.type === "capture" : (!cfg.types || cfg.types.includes(e.type));
    const filterMatch = currentFilter === "all" || filterValue(e,currentFilter);
    const localSearchMatch = !query || Object.values(e).flat().join(" ").toLowerCase().includes(query);
    const searchMatch = currentView === "search" && indexedSearchIds ? indexedSearchIds.has(e.id) : localSearchMatch;
    const advancedMatch = currentView !== "search" || matchesAdvancedSearch(e);
    const areaMatch = !["projects","knowledge","sources"].includes(currentView) || WorkbenchCollectionFilter.matchesArea(e,pageAreaFilter);
    return locationMatch && viewMatch && filterMatch && searchMatch && advancedMatch && areaMatch;
  }).sort((a,b) => String(b.updatedAt || b.updated || "").localeCompare(String(a.updatedAt || a.updated || "")));

  visibleSourceIds=new Set(supportsBatchMode ? entries.map(entry=>entry.id) : []);
  if (supportsBatchMode && sourceBatchMode) selectedSourceIds=WorkbenchSourceBatch.reconcileSelection(selectedSourceIds,entries,collectionType());

  $("#collectionStats").innerHTML = collectionStats(entries).map(([n,l]) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`).join("");
  $("#collectionList").classList.remove("asset-gallery");
  $("#collectionList").classList.toggle("content-gallery",galleryActive);
  $("#collectionList").classList.toggle("compact-list",!galleryActive && ["projects","knowledge","sources","search","areaDetail","inbox","areas"].includes(currentView));
  $("#collectionList").classList.toggle("glass-list",!galleryActive && ["projects","knowledge","sources","search","areas","areaDetail","inbox"].includes(currentView));
  $("#collectionList").classList.toggle("source-batch-mode",supportsBatchMode && sourceBatchMode);
  if(window.WorkbenchCards) {
    WorkbenchCards.render($("#collectionList"),{cards:entries.map(entry=>collectionCardModel(entry,galleryActive)),gallery:galleryActive,loadCover:cardCoverData,loadSummary:loadCardSummary,changeStatus:changeCollectionStatus});
  } else {
    $("#collectionList").innerHTML = entries.map(entryCardHtml).join("");
    void hydrateCollectionCovers();
    void hydrateCardSummaries();
  }
  observeGalleryCards();
  scheduleCollectionRelationLimit();
  const empty=$("#emptyState");
  empty.classList.toggle("hidden", entries.length > 0);
  if(!entries.length&&["projects","knowledge","sources"].includes(currentView)&&pageAreaFilter!=="all"){
    empty.querySelector("b").textContent="当前领域条件下没有内容";
    empty.querySelector("span").textContent="请选择“全部领域”或其他领域查看内容。";
  }else{
    empty.querySelector("b").textContent="这里还没有内容";
    empty.querySelector("span").textContent="从一次真实记录开始，不必先设计完整体系。";
  }
  renderSourceBatchBar();
  hydrateAssetPresentations(entries);
}

let relationLimitFrame = 0;
let relationLimitWidth = -1;
let relationLimitObserver = null;
let gallerySizeObserver = null;
function observeGalleryCards() {
  gallerySizeObserver?.disconnect();
  const list = $("#collectionList");
  const gallery = list.matches(".content-gallery, .asset-gallery");
  list.classList.toggle("gallery-masonry", gallery);
  if (!gallery) {
    // React retains cards across view changes; remove the previous masonry placement.
    [...list.children].forEach(card=>{card.style.gridColumn="";card.style.gridRow="";});
    return;
  }
  gallerySizeObserver ||= new ResizeObserver(scheduleCollectionRelationLimit);
  [...list.children].forEach(card => gallerySizeObserver.observe(card));
}
function layoutGalleryCards() {
  const list = $("#collectionList");
  if (!list.classList.contains("gallery-masonry") || !list.getBoundingClientRect().width) return;
  const cards = [...list.children];
  // Clear old positions so implicit columns cannot prevent a narrower layout.
  cards.forEach(card => { card.style.gridColumn = ""; card.style.gridRow = ""; });
  const columns = getComputedStyle(list).gridTemplateColumns.split(" ").length;
  const nextRows = Array(columns).fill(1);
  // Preserve reading order across columns; each column has its own next row.
  const heights = cards.map(card => Math.ceil(card.getBoundingClientRect().height));
  cards.forEach((card, index) => {
    const column = index % columns;
    const span = heights[index] + 16;
    card.style.gridColumn = String(column + 1);
    card.style.gridRow = `${nextRows[column]} / span ${span}`;
    nextRows[column] += span;
  });
}
document.fonts?.addEventListener("loadingdone", scheduleCollectionRelationLimit);
function scheduleCollectionRelationLimit() {
  if (!relationLimitObserver) {
    relationLimitObserver = new ResizeObserver(([record]) => {
      if (record.contentRect.width === relationLimitWidth) return;
      relationLimitWidth = record.contentRect.width;
      scheduleCollectionRelationLimit();
    });
    relationLimitObserver.observe($("#collectionList"));
  }
  cancelAnimationFrame(relationLimitFrame);
  relationLimitFrame = requestAnimationFrame(limitCollectionRelations);
}
function limitCollectionRelations() {
  layoutGalleryCards();
  const maxRows = 2;
  $$("#collectionList .content-relations > div").forEach(container => {
    if(container.closest('.react-content-card'))return;
    container.querySelector(".relation-overflow")?.remove();
    const chips = [...container.children];
    chips.forEach(chip => chip.hidden = false);
    if (!chips.length || !container.getBoundingClientRect().width) return;
    const rowTops = [];
    let visibleCount = chips.length;
    for (let index = 0; index < chips.length; index++) {
      const top = chips[index].offsetTop;
      if (!rowTops.some(row => Math.abs(row - top) < 2)) rowTops.push(top);
      if (rowTops.length > maxRows) { visibleCount = index; break; }
    }
    if (visibleCount === chips.length) return;
    const card = container.closest(".entry-card");
    const owner = card.querySelector("[data-edit], [data-source-batch-select]");
    const more = document.createElement("button");
    more.type = "button";
    more.className = "relation-overflow";
    more.dataset.openRef = owner?.dataset.edit || owner?.dataset.sourceBatchSelect || "";
    const update = () => {
      chips.forEach((chip, index) => chip.hidden = index >= visibleCount);
      more.textContent = `+${chips.length - visibleCount}`;
      more.title = `查看其余 ${chips.length - visibleCount} 条关联内容`;
      more.setAttribute("aria-label", more.title);
    };
    update();
    container.append(more);
    while (visibleCount > 0 && more.offsetTop > rowTops[maxRows - 1] + 2) {
      visibleCount--;
      update();
    }
  });
  layoutGalleryCards();
}

function renderSourceBatchBar() {
  const active=Boolean(collectionType()) && sourceBatchMode;
  const bar=$("#sourceBatchBar");
  bar.classList.toggle("hidden",!active);
  if (!active) return;
  const checkedAreas=new Set($$("#sourceBatchAreaChoices input:checked").map(input=>input.value));
  const areas=state.entries.filter(entry=>entry.type === "area" && !entry.deletedAt).sort((a,b)=>a.title.localeCompare(b.title,"zh-CN"));
  const availableAreaIds=new Set(areas.map(area=>area.id));
  [...checkedAreas].forEach(id=>{if(!availableAreaIds.has(id)) checkedAreas.delete(id);});
  $("#sourceBatchAreaChoices").innerHTML=areas.length
    ? areas.map(area=>`<label><input type="checkbox" value="${escapeHtml(area.id)}" ${checkedAreas.has(area.id) ? "checked" : ""}><span>${escapeHtml(area.title)}</span></label>`).join("")
    : `<span class="source-batch-no-areas">还没有可用领域</span>`;
  const count=selectedSourceIds.size;
  $("#sourceBatchCount").textContent=count;
  $("#sourceBatchTypeLabel").textContent=`条${typeLabel(collectionType())}`;
  $("#sourceBatchSelectVisible").textContent=`全选（${visibleSourceIds.size}）`;
  const statusField=schemas[collectionType()].fields.find(field=>field[0]===({project:"status",knowledge:"confidence",source:"readingStatus"})[collectionType()]);
  $("#sourceBatchStatusHeading").textContent=statusField[1];
  const statusSelect=$("#sourceBatchReadingStatus");
  if(statusSelect.dataset.type!==collectionType()) {
    statusSelect.innerHTML=statusField[3].split(",").map(option=>{const [value,label]=option.split("|");return `<option value="${value}">${label}</option>`;}).join("");
    statusSelect.dataset.type=collectionType();
  }
  $("#sourceBatchSelectVisible").disabled=sourceBatchBusy || !visibleSourceIds.size || count === visibleSourceIds.size;
  $("#sourceBatchClear").disabled=sourceBatchBusy || !count;
  ["sourceBatchAddAreas","sourceBatchRemoveAreas"].forEach(id=>{$("#"+id).disabled=sourceBatchBusy || !count || !checkedAreas.size;});
  ["sourceBatchSetReadingStatus","sourceBatchTrash"].forEach(id=>{$("#"+id).disabled=sourceBatchBusy || !count;});
  $("#sourceBatchReadingStatus").disabled=sourceBatchBusy;
  $("#sourceBatchExit").disabled=sourceBatchBusy;
  $("#sourceBatchFeedback").textContent=sourceBatchFeedback;
}

function enterSourceBatch(initialIds=[]) {
  sourceBatchMode=true;
  sourceBatchFeedback="";
  selectedSourceIds=WorkbenchSourceBatch.reconcileSelection(new Set(initialIds),state.entries.filter(entry=>visibleSourceIds.has(entry.id)),collectionType());
  renderCollection();
}

function exitSourceBatch(renderNow=true) {
  sourceBatchMode=false;
  selectedSourceIds.clear();
  visibleSourceIds.clear();
  sourceBatchFeedback="";
  $("#sourceBatchBar")?.classList.add("hidden");
  $("#collectionList")?.classList.remove("source-batch-mode");
  if (renderNow && currentView === "sources") renderCollection();
}

function chosenBatchAreaIds() {
  return $$("#sourceBatchAreaChoices input:checked").map(input=>input.value);
}

async function runSourceBatch(action,payload={},message="批量整理完成") {
  if (sourceBatchBusy || !selectedSourceIds.size) return;
  let result;
  const label=typeLabel(collectionType());
  try { result=WorkbenchSourceBatch.applyBatchToState(state,selectedSourceIds,action,{...payload,type:collectionType()},WorkbenchData.isoNow()); }
  catch (error) { toast(error.message); return; }
  if (!result.affected) { sourceBatchFeedback="没有需要修改的内容。"; renderSourceBatchBar(); return; }
  sourceBatchBusy=true;
  renderSourceBatchBar();
  try {
    await commitUnifiedState(result.state,`${message}：${result.affected} 条${label}`);
    sourceBatchFeedback=`已更新 ${result.affected} 条${label}`;
    if (action === "trash") selectedSourceIds.clear();
  } catch (error) {
    sourceBatchFeedback=`操作失败，未更新当前状态：${error.message}`;
    toast("批量操作失败");
  } finally {
    sourceBatchBusy=false;
    if (collectionType()) renderCollection();
  }
}

function collectionStats(entries) {
  if (browsingAreaId) return [[entries.length,"该领域全部内容"],[entries.filter(e => e.type === "project").length,"项目"],[entries.filter(e => e.type === "knowledge").length,"知识"]];
  if (currentView === "inbox") return [[entries.length,"等待分类的随手记"],[entries.filter(e => e.created >= weekAgo()).length,"最近 7 天新增"],[entries.filter(e => e.origin).length,"记录了来源"]];
  if (currentView === "areas") return [[entries.length,"长期领域"],[state.entries.filter(e => !e.deletedAt && ["project","knowledge","source"].includes(e.type) && (e.areaRefs||[]).length).length,"已有领域归属"],[state.entries.filter(e => !e.deletedAt && ["project","knowledge","source"].includes(e.type) && !(e.areaRefs||[]).length).length,"尚未归属"]];
  if (currentView === "projects") return [[entries.length,"项目总数"],[entries.filter(e => e.status === "active").length,"正在进行"],[entries.filter(e => e.status === "done").length,"已完成"]];
  if (currentView === "knowledge") return [[entries.length,"知识总数"],[entries.filter(e => ["reviewed","evergreen"].includes(e.confidence)).length,"已经确认"],[entries.filter(e => (e.sourceRefs||[]).length).length,"有来源依据"]];
  if (currentView === "sources") return [[entries.length,"资料总数"],[entries.filter(e => e.readingStatus === "unread").length,"尚未阅读"],[entries.filter(e => e.readingStatus === "processed").length,"已经处理"]];
  if (currentView === "trash") return [[entries.length,"回收站内容"],[entries.filter(e => e.type === "project").length,"项目"],[entries.filter(e => e.type === "knowledge").length,"知识"]];
  return [[entries.length,"搜索结果"],[entries.filter(e => e.type === "project").length,"项目"],[entries.filter(e => e.type === "knowledge").length,"知识"]];
}

function weekAgo() { const date = new Date(); date.setDate(date.getDate()-7); return date.toLocaleDateString("sv-SE"); }

function sourceFactsHtml(entry){
  const reading=entry.readingStatus||"unread";
  const readingLabel=({unread:"未读",reading:"处理中",processed:"已处理"})[reading]||"未读";
  const areas=(entry.areaRefs||[]).map(entryById).filter(area=>area?.type==="area"&&!area.deletedAt);
  const shown=areas.slice(0,2).map(area=>`<span class="area-fact" title="${escapeHtml(area.title)}">${escapeHtml(area.title)}</span>`).join("");
  const areaFacts=shown || `<span class="area-unassigned">未归属</span>`;
  const overflow=areas.length>2?`<span class="area-more" title="另外 ${areas.length-2} 个领域">+${areas.length-2}</span>`:"";
  return `<div class="source-card-facts"><span class="reading-${escapeHtml(reading)}">${readingLabel}</span>${areaFacts}${overflow}</div>`;
}

let collectionStatusSave=Promise.resolve();
function changeCollectionStatus(id,value) {
  const request=collectionStatusSave.then(async()=>{
    const entry=entryById(id),field=collectionStatusField(entry);
    if(!entry||entry.deletedAt||!field||!field[3].split(',').some(option=>option.split('|')[0]===value))throw new Error('该状态不可用');
    if(entry[field[0]]===value)return;
    const next=structuredClone(state),updated=next.entries.find(item=>item.id===id);
    updated[field[0]]=value;updated.updatedAt=WorkbenchData.isoNow();updated.updated=WorkbenchData.dayOf(updated.updatedAt);
    await commitUnifiedState(next,'状态已更新');
  });
  collectionStatusSave=request.catch(()=>{});
  return request;
}
function collectionStatusField(entry) {
  if(!entry||!['project','knowledge','source'].includes(entry.type))return null;
  const name=entry.type==='knowledge'?'confidence':entry.type==='source'?'readingStatus':'status';
  return schemas[entry.type].fields.find(field=>field[0]===name);
}
function collectionCardModel(entry,gallery) {
  const statusField=collectionStatusField(entry);
  const statusChoices=!entry.deletedAt&&statusField?statusField[3].split(',').map(option=>{const [value,label]=option.split('|');return {value,label,tone:statusTone({...entry,[statusField[0]]:value})};}):[];
  const relations=WorkbenchRelations.groups(state,entry);
  const tag=item=>{const ref=item.entry||item;return {id:ref.id,type:ref.type,title:ref.title,label:typeLabel(ref.type),bidirectional:Boolean(item.bidirectional)};};
  const groups=[
    {kind:'area-relations',label:gallery?'领域':'所属领域 · 分类标签',items:relations.areas.map(tag)},
    {kind:'content-relations',label:'关联内容',items:visibleMainRelations(entry,relations).map(tag)},
    {kind:'review-relations',label:'项目复盘',items:entry.type==='project'?relations.reviews.map(tag):[]}
  ].filter(group=>group.items.length);
  const url=safeExternalUrl(entry.url)||safeExternalUrl(String(entry.origin||'').match(/https?:\/\/[^\s)）]+/)?.[0]);
  if(url)groups.push({kind:'external-relation',label:'原始位置',items:[],url});
  let areaOverview=null;
  if(entry.type==='area'&&currentView!=='trash') {
    const members=state.entries.filter(item=>!item.deletedAt&&(item.areaRefs||[]).includes(entry.id));
    areaOverview=`包含 ${members.filter(item=>item.type==='project').length} 个项目 · ${members.filter(item=>item.type==='knowledge').length} 条知识 · ${members.filter(item=>item.type==='source').length} 份资料`;
  }
  const selecting=Boolean(collectionType())&&sourceBatchMode&&entry.type===collectionType();
  return {id:entry.id,createdDate:WorkbenchData.dayOf(entry.createdAt || entry.created),updatedDate:WorkbenchData.dayOf(entry.updatedAt || entry.updated),type:entry.type,title:entry.title,label:typeLabel(entry.type),status:statusOf(entry),tone:statusTone(entry),statusChoices,statusValue:statusField?entry[statusField[0]]:null,date:WorkbenchData.dayOf(entry.updatedAt),version:canvasSummaryKey(entry),entry,selecting,selected:selecting&&selectedSourceIds.has(entry.id),hasSummary:gallery||entry.type==='area'||!['projects','knowledge','sources','search','areaDetail'].includes(currentView),canvasSummary:entry.canvasVersion===1&&['project','knowledge'].includes(entry.type),summary:summary(entry),groups:entry.type==='area'?[]:groups,areaOverview};
}

function entryCardHtml(entry) {
  if (["projects","knowledge","sources","areaDetail","inbox","areas"].includes(currentView) && collectionDisplayMode() === "gallery") return contentGalleryCardHtml(entry);
  if (entry.type === "area") {
    const members = state.entries.filter(item => !item.deletedAt && (item.areaRefs||[]).includes(entry.id));
    return `<article class="entry-card"><button class="entry-open" data-edit="${entry.id}"><span class="entry-type entry-type--area">领域</span><div><h3>${escapeHtml(entry.title)}</h3><p>${escapeHtml(summary(entry)).slice(0,180)}</p></div><span class="entry-meta"><span class="status-pill status--${statusTone(entry)}">${statusOf(entry)}</span><br>${escapeHtml(WorkbenchData.dayOf(entry.updatedAt))}</span></button>${currentView === "trash" ? "" : `<div class="card-relations"><span>包含 ${members.filter(e=>e.type==="project").length} 个项目 · ${members.filter(e=>e.type==="knowledge").length} 条知识 · ${members.filter(e=>e.type==="source").length} 份资料</span><button data-browse-area="${entry.id}">查看该领域内容 →</button></div>`}</article>`;
  }
  const relationships = relationshipGroupsHtml(entry,{includeExternal:true});
  const batchSelecting=Boolean(collectionType()) && sourceBatchMode && entry.type === collectionType();
  const selected=batchSelecting && selectedSourceIds.has(entry.id);
  const openAttribute=batchSelecting ? `data-source-batch-select="${entry.id}" aria-pressed="${selected}"` : `data-edit="${entry.id}"`;
  const excerpt=["projects","knowledge","sources","search","areaDetail"].includes(currentView) ? "" : `${cardSummaryHtml(entry,180)}`;
  return `<article class="entry-card ${batchSelecting ? "source-selectable" : ""} ${selected ? "selected" : ""}"><button class="entry-open" ${openAttribute}>${batchSelecting ? `<span class="source-select-indicator" aria-hidden="true">${selected ? "✓" : ""}</span>` : ""}<span class="entry-type entry-type--${entry.type}">${typeLabel(entry.type)}</span><div><h3>${escapeHtml(entry.title)}</h3>${excerpt}</div><span class="entry-meta"><span class="status-pill status--${statusTone(entry)}">${statusOf(entry)}</span><br>${escapeHtml(WorkbenchData.dayOf(entry.updatedAt))}</span></button>${relationships ? `<div class="card-relations">${relationships}</div>` : ""}</article>`;
}

function contentGalleryCardHtml(entry) {
  const relationships=relationshipGroupsHtml(entry,{includeExternal:true,gallery:true});
  const selecting=sourceBatchMode && entry.type===collectionType();
  const selected=selecting && selectedSourceIds.has(entry.id);
  const target=selecting ? `data-source-batch-select="${escapeHtml(entry.id)}" aria-pressed="${selected}"` : `data-edit="${escapeHtml(entry.id)}"`;
  const cover=['project','knowledge','source'].includes(entry.type)?`<span class="entry-cover" data-card-cover="${escapeHtml(entry.id)}" hidden></span>`:'';
  const excerpt=cardSummaryHtml(entry),body=entry.type==='source'?cover+excerpt:excerpt+cover;
  const areaOverview=entry.type==='area'?collectionCardModel(entry,true).areaOverview:null;
  const relationContent=areaOverview?`<span>${escapeHtml(areaOverview)}</span><button type="button" data-browse-area="${escapeHtml(entry.id)}">查看该领域内容 →</button>`:entry.type==='area'?'':relationships;
  return `<article class="entry-card ${selecting ? "source-selectable" : ""} ${selected ? "selected" : ""}" data-card-type="${entry.type}"><button type="button" class="entry-open" ${target}>${selecting ? `<span class="source-select-indicator" aria-hidden="true">${selected ? "✓" : ""}</span>` : ""}<span class="entry-gallery-heading"><span class="entry-type entry-type--${entry.type}">${typeLabel(entry.type)}</span><span class="status-pill status--${statusTone(entry)}">${statusOf(entry)}</span></span><h3>${escapeHtml(entry.title)}</h3>${body}</button>${relationContent ? `<div class="card-relations">${relationContent}</div>` : ""}<div class="entry-gallery-date" ${target}><span class="entry-meta">${escapeHtml(WorkbenchData.dayOf(entry.updatedAt))}</span></div></article>`;
}

function assetSoftware(entry) {
  const ext = String(entry.fileExtension || "").toLowerCase();
  return ({
    ".blend":"Blender", ".blend1":"Blender 备份", ".uproject":"Unreal Engine", ".uasset":"Unreal Engine",
    ".unity":"Unity", ".fbx":"通用 3D", ".obj":"通用 3D", ".gltf":"glTF", ".glb":"glTF",
    ".stl":"3D 打印", ".usd":"USD", ".usda":"USD", ".usdc":"USD", ".abc":"Alembic",
    ".ztl":"ZBrush", ".c4d":"Cinema 4D", ".psd":"Photoshop", ".psb":"Photoshop", ".ai":"Illustrator", ".kra":"Krita"
  })[ext] || "";
}

function assetFallbackHtml(entry) {
  const ext = String(entry.fileExtension || "").replace(/^\./,"").toUpperCase();
  const software = assetSoftware(entry);
  const category = entry.assetCategory || entry.sourceKind || "资料";
  return `<div class="asset-fallback"><b>${escapeHtml(ext || category)}</b><span>${escapeHtml(software || (ext ? category : ""))}</span></div>`;
}

function assetGalleryCardHtml(entry) {

  const visual = `<div class="asset-card-visual" data-card-cover="${escapeHtml(entry.id)}">${assetFallbackHtml(entry)}</div>`;
  const batchSelecting=sourceBatchMode && Boolean(collectionType());
  const selected=batchSelecting && selectedSourceIds.has(entry.id);
  const openAttribute=batchSelecting ? `data-source-batch-select="${entry.id}" aria-pressed="${selected}"` : `data-edit="${entry.id}"`;
  return `<article class="asset-card ${batchSelecting ? "source-selectable" : ""} ${selected ? "selected" : ""}"><button type="button" class="asset-card-open" ${openAttribute}>${batchSelecting ? `<span class="source-select-indicator" aria-hidden="true">${selected ? "✓" : ""}</span>` : ""}${visual}<div class="asset-card-copy"><span>${escapeHtml(entry.assetCategory || entry.sourceKind || "资料")}</span><h3>${escapeHtml(entry.title)}</h3>${cardSummaryHtml(entry,150)}${sourceFactsHtml(entry)}</div></button></article>`;
}

function assetPreviewMarkup(entry, presentation, detail=false) {
  if (!presentation) return assetFallbackHtml(entry);
  const preview = escapeHtml(presentation.previewUrl || "");
  const media = escapeHtml(presentation.mediaUrl || "");
  if (detail && presentation.category === "视频" && media) return `<video controls preload="metadata" ${preview ? `poster="${preview}"` : ""}><source src="${media}"></video>`;
  if (detail && presentation.category === "音频" && media) return `<div class="audio-preview">${assetFallbackHtml(entry)}<audio controls preload="metadata" src="${media}"></audio></div>`;
  if (preview) return `<img src="${preview}" alt="${escapeHtml(entry.title)}" loading="lazy">${presentation.category === "视频" ? `<span class="video-badge">▶ ${entry.durationSeconds ? formatDuration(entry.durationSeconds) : "视频"}</span>` : ""}`;
  return assetFallbackHtml(entry);
}

async function getAssetPresentation(assetId) {
  if (!assetId || !window.workbenchDesktop?.getAssetPresentation) return null;
  if (assetPresentationCache.has(assetId)) return assetPresentationCache.get(assetId);
  if (!assetPresentationRequests.has(assetId)) {
    assetPresentationRequests.set(assetId,window.workbenchDesktop.getAssetPresentation(assetId)
      .then(result => { assetPresentationCache.set(assetId,result); return result; })
      .catch(error => { console.error(error); assetPresentationCache.set(assetId,null); return null; })
      .finally(()=>assetPresentationRequests.delete(assetId)));
  }
  return assetPresentationRequests.get(assetId);
}

async function hydrateAssetPresentations(entries) {
  const queue = entries.filter(entry => entry.assetId);
  const worker = async () => {
    while (queue.length) {
      const entry = queue.shift();
      const presentation = await getAssetPresentation(entry.assetId);
      document.querySelectorAll("[data-asset-preview]").forEach(target => {
        if (target.dataset.assetPreview === entry.assetId) target.innerHTML = assetPreviewMarkup(entry,presentation,false);
      });
      document.querySelectorAll("[data-asset-detail]").forEach(target => {
        if (target.dataset.assetDetail === entry.assetId) target.innerHTML = assetPreviewMarkup(entry,presentation,true);
      });
      document.querySelectorAll("[data-reset-asset-cover]").forEach(button => {
        if (button.dataset.resetAssetCover === entry.assetId) button.classList.toggle("hidden",!presentation?.customCover);
      });
    }
  };
  await Promise.all(Array.from({ length:Math.min(3,queue.length) },worker));
}

function safeExternalUrl(value) {
  try { const url = new URL(value); return ["http:","https:"].includes(url.protocol) ? url.href : ""; }
  catch { return ""; }
}

function switchView(view, areaId=null) {
  const enteringGraph=view === "graph" && currentView !== "graph";
  if (sourceBatchMode && view !== currentView) exitSourceBatch(false);
  if (view !== "search") searchScopeType="";
  if (view !== "search" && $("#searchInput")?.value) {
    $("#searchInput").value = "";
    $("#clearSearch").classList.add("hidden");
    $(".search-wrap").classList.remove("searching");
    indexedSearchIds = null;
    indexedSearchRequest += 1;
    semanticSearchCoordinator.invalidate();
    clearAdvancedSearchFilters(false);
  }
  browsingAreaId = view === "areaDetail" ? areaId : null;
  if (enteringGraph) graphEntrancePending=true;
  currentView = view;
  const searchType=collectionType(view) || (view === "search" ? searchScopeType : "");
  $("#searchInput").placeholder=searchType ? `搜索${typeLabel(searchType)}…` : "搜索项目、知识与资料…";
  $("#searchInput").setAttribute("aria-label",searchType ? `搜索${typeLabel(searchType)}` : "搜索项目、知识与资料");
  $("#searchTypeFilter").disabled=view === "search" && Boolean(searchScopeType);
  currentFilter = "all";
  $$(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === view || (view === "areaDetail" && b.dataset.view === "areas")));
  $("#homeView").classList.toggle("active", view === "home");
  $("#collectionView").classList.toggle("active", view !== "home" && view !== "graph");
  $("#graphView").classList.toggle("active",view === "graph");
  if (view === "home") { $("#viewEyebrow").textContent="工作概览"; $("#viewTitle").textContent="工作台"; }
  if (view === "graph") { $("#viewEyebrow").textContent="Graph · 只读关系网络"; $("#viewTitle").textContent="关系图谱"; }
  render();
}

function browseArea(id) {
  const area = entryById(id);
  if (!area || area.type !== "area") return;
  switchView("areaDetail",id);
}

function exitSearch() {
  $("#searchInput").value = "";
  clearAdvancedSearchFilters(false);
  indexedSearchIds = null;
  indexedSearchRequest += 1;
  semanticSearchCoordinator.invalidate();
  $("#clearSearch").classList.add("hidden");
  $(".search-wrap").classList.remove("searching");
  switchView(searchReturnView === "search" ? "home" : searchReturnView,searchReturnAreaId);
}

function clearAdvancedSearchFilters(refresh = true) {
  ["searchTypeFilter","searchAreaFilter","searchFormatFilter","searchStatusFilter","searchDateFrom","searchDateTo","searchMinDuration","searchMaxDuration"].forEach(id => { $("#" + id).value = ""; });
  $("#searchTypeFilter").value=searchScopeType;
  currentFilter = "all";
  if (refresh && currentView === "search") {
    renderCollection();
    queueIndexedSearch(true);
  }
}

function fieldHtml(field, value="") {
  const [name,label,type,placeholder,required,width,help,multiple] = field;
  const klass = `field ${width === "full" ? "full" : ""}`;
  const helpHtml = "";
  if (type === "tasks") return `<div class="${klass} task-editor"><label>${label}</label><div class="task-editor-list"></div><button type="button" class="add-task" data-add-task>＋ 添加待办</button></div>`;
  if (type === "textarea") return `<div class="${klass}"><label for="f-${name}">${label}</label><textarea id="f-${name}" name="${name}" ${required ? "required" : ""}>${escapeHtml(value)}</textarea>${helpHtml}</div>`;
  if (type === "select") {
    const options = placeholder.split(",").map(x => x.split("|"));
    return `<div class="${klass}"><label for="f-${name}">${label}</label><select id="f-${name}" name="${name}">${options.map(([key,text]) => `<option value="${key}" ${value === key ? "selected" : ""}>${text}</option>`).join("")}</select>${helpHtml}</div>`;
  }
  if (type === "reference") {
    editingRefs[name] = Array.isArray(value) ? [...value] : [];
    return `<div class="${klass} ref-picker ref-button-picker" data-ref-name="${name}" data-ref-types="${placeholder}" data-ref-multiple="${multiple}"><label>${label}</label><button type="button" class="ref-add-button" data-toggle-ref-picker aria-label="添加${escapeHtml(label)}" title="添加${escapeHtml(label)}" aria-expanded="false">＋</button><div class="selected-refs" data-selected-for="${name}"></div><div class="ref-popover hidden"><input type="search" class="ref-search" aria-label="搜索关联标题" placeholder="搜索" autocomplete="off"><div class="ref-suggestions hidden"></div></div>${helpHtml}</div>`;
  }
  if (type === "url") {
    const url = safeExternalUrl(value);
    return `<div class="${klass}"><label for="f-${name}">${label}</label><input id="f-${name}" name="${name}" type="url" value="${escapeHtml(value)}" ${required ? "required" : ""} data-url-input><a class="field-open-link ${url ? "" : "hidden"}" data-url-preview href="${escapeHtml(url)}" target="_blank" rel="noopener">打开原文 ↗</a>${helpHtml}</div>`;
  }
  return `<div class="${klass}"><label for="f-${name}">${label}</label><input id="f-${name}" name="${name}" type="${type}" value="${escapeHtml(value)}" ${required ? "required" : ""}>${helpHtml}</div>`;
}

function originalCaptureHtml(entry) {
  const original=entry?.originalCapture;
  if (!original?.content) return "";
  return `<details class="original-capture"><summary>原始随手记</summary>${original.origin ? `<p>记录来源：${escapeHtml(original.origin)}</p>` : ""}<div>${escapeHtml(original.content)}</div></details>`;
}

function groupedFieldsHtml(type, entry, assetPanel="") {
  const schema = schemas[type];
  const fieldMap = Object.fromEntries(schema.fields.map(field => [field[0],field]));
  const used = new Set();
  const sections = (formGroups[type] || []).map((group,index) => {
    const fields = group.fields.map(name => fieldMap[name]).filter(Boolean);
    fields.forEach(field => used.add(field[0]));
    const embeddedAsset=type === "source" && group.title === "导入文件" ? assetPanel || `<p class="asset-import-guidance">未关联文件。需要导入本地文件时，请使用侧边栏的“导入文件”，系统会自动建立资料卡。</p>` : "";
    return `<section class="form-section"><div class="form-section-head"><span>${String(index+1).padStart(2,"0")}</span><div><h3>${escapeHtml(group.title)}</h3>${group.description ? `<p>${escapeHtml(group.description)}</p>` : ""}</div></div><div class="form-section-fields">${fields.map(field => fieldHtml(field,entry?.[field[0]] ?? "")).join("")}${embeddedAsset}</div></section>`;
  });
  const remaining = schema.fields.filter(field => !used.has(field[0]));
  if (remaining.length) sections.push(`<section class="form-section"><div class="form-section-fields">${remaining.map(field => fieldHtml(field,entry?.[field[0]] ?? "")).join("")}</div></section>`);
  return sections.join("");
}

function viewerFieldHtml(field, value) {
  const [name,label,type,options] = field;
  if (["title","areaRefs","projectRefs","sourceRefs","relatedRefs"].includes(name)) return "";
  if (value == null || value === "" || (Array.isArray(value) && !value.length)) return "";
  if (type === "tasks") {
    const tasks = Array.isArray(value) ? value : [];
    if (!tasks.length) return "";
    return `<div class="viewer-field full"><span>${escapeHtml(label)}</span>${viewerTaskListHtml(tasks)}</div>`;
  }
  let display = String(value);
  if (type === "select") {
    const option = options.split(",").map(item => item.split("|")).find(([key]) => key === value);
    display = option?.[1] || display;
  }
  if (type === "url") {
    const url = safeExternalUrl(value);
    if (!url) return "";
    return `<div class="viewer-field full"><span>${escapeHtml(label)}</span><a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(value)} ↗</a></div>`;
  }
  return `<div class="viewer-field ${type === "textarea" ? "full" : ""}"><span>${escapeHtml(label)}</span><p>${escapeHtml(display)}</p></div>`;
}

function groupedViewerHtml(type, entry) {
  const schema = schemas[type];
  if (!schema) return "";
  const fieldMap = Object.fromEntries(schema.fields.map(field => [field[0],field]));
  return (formGroups[type] || []).map(group => {
    const fields = group.fields.map(name => fieldMap[name]).filter(Boolean).map(field => viewerFieldHtml(field,entry[field[0]])).filter(Boolean);
    const cardInfo=group.title === "卡片信息" ? (()=>{const relations=WorkbenchRelations.groups(state,entry);return [relationGroupHtml("所属领域",relations.areas),relationGroupHtml("主动关联的内容",relations.outgoing)].filter(Boolean).join("");})() : "";
    const asset=type === "source" && group.title === "导入文件" ? viewerAssetHtml(entry) : "";
    if (asset) return asset.replace("<h3>本地文件</h3>","<h3>导入文件</h3>");
    if (!fields.length && !cardInfo) return "";
    return `<section class="viewer-section"><h3>${escapeHtml(group.title)}</h3><div class="viewer-fields">${fields.join("")}</div>${cardInfo ? `<div class="relationship-groups">${cardInfo}</div>` : ""}</section>`;
  }).filter(Boolean).join("");
}

function areaMembershipHtml(area) {
  const members = state.entries.filter(entry => !entry.deletedAt && (entry.areaRefs || []).includes(area.id));
  return ["project","knowledge","source"].map(type => relationGroupHtml(`包含的${typeLabel(type)}`,members.filter(entry => entry.type === type))).filter(Boolean).join("");
}

function viewerAssetHtml(entry) {
  if (!entry.assetId) return "";
  if (isCanvasMediaSource(entry)) return "";
  return `<section class="viewer-section viewer-asset"><h3>本地文件</h3><div class="asset-detail-preview" data-asset-detail="${escapeHtml(entry.assetId)}">${assetFallbackHtml(entry)}</div><p>${escapeHtml(entry.assetPath || entry.fileName || "")}</p><div class="asset-meta"><span>${escapeHtml(entry.assetCategory || "其他")}</span><span>${escapeHtml(entry.fileExtension || "未知格式")}</span><span>${formatBytes(entry.fileSize || 0)}</span>${assetSoftware(entry) ? `<span>${escapeHtml(assetSoftware(entry))}</span>` : ""}${entry.mediaWidth ? `<span>${entry.mediaWidth} × ${entry.mediaHeight}</span>` : ""}${entry.durationSeconds ? `<span>${formatDuration(entry.durationSeconds)}</span>` : ""}</div><div class="asset-panel-actions"><button type="button" data-open-asset="${escapeHtml(entry.assetId)}">打开文件</button><button type="button" data-reveal-asset="${escapeHtml(entry.assetId)}">在文件夹中显示</button><button type="button" data-select-asset-cover="${escapeHtml(entry.assetId)}">选择封面</button><button type="button" class="hidden" data-reset-asset-cover="${escapeHtml(entry.assetId)}">恢复自动封面</button></div></section>`;
}

const MAIN_MARKDOWN_ACTIONS = [
  ["bold","B","加粗"],["italic","I","斜体"],["strike","S","删除线"],
  ["normal","正文","还原为正文"],["h1","标题 1","一级标题"],["h2","标题 2","二级标题"],["h3","标题 3","三级标题"],
  ["bullet","• 列表","无序列表"],["numbered","1. 列表","有序列表"],
  ["quote","❝","引用"],["code","<>","行内代码"],["link","↗","链接"]
];
const RICH_COLOR_DEFAULTS={foreColor:"#202735",hiliteColor:"#fff0aa"};
const RICH_COLOR_KEYS={foreColor:"knowledge-workbench-text-color",hiliteColor:"knowledge-workbench-highlight-color"};
function lastRichColor(command) {
  const color=localStorage.getItem(RICH_COLOR_KEYS[command]);
  return /^#[\da-f]{6}$/i.test(color || "") ? color : RICH_COLOR_DEFAULTS[command];
}
function hslColor(h,s,l) {
  const a=s*Math.min(l,100-l)/10000;
  const channel=n=>{const k=(n+h/30)%12;return Math.round(255*(l/100-a*Math.max(-1,Math.min(k-3,9-k,1)))).toString(16).padStart(2,"0");};
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}
function richColorChoices() {
  const shades=[96,88,78,67,55,43,32,21];
  const hues=[null,null,215,227,28,48,95,150,190,350];
  return shades.flatMap((light,row)=>hues.map((hue,column)=>column===0 ? hslColor(0,0,100-row*12) : column===1 ? hslColor(0,0,90-row*12) : hslColor(hue,68,light)));
}
function richPaletteHtml(command) {
  const title=command==="foreColor" ? "字色" : "底色";
  return `<span class="rich-color-control"><button type="button" class="rich-color-apply" data-rich-apply-color="${command}" title="应用上次使用的${title}" aria-label="应用${title}" style="--chosen:${lastRichColor(command)}">${command==="foreColor" ? "A" : "▰"}</button><button type="button" class="rich-color-toggle" data-rich-palette-toggle="${command}" title="选择${title}" aria-label="选择${title}">⌄</button></span>`;
}
function openRichColorPalette(command,button) {
  const dialog=$("#editorDialog"),palette=$("#richColorPalette"),selected=lastRichColor(command);
  const grid=richColorChoices().map((color,index)=>`<button type="button" class="rich-palette-swatch" data-rich-swatch="${command}" data-color="${color}" aria-label="选择色卡 ${index+1}" style="--swatch:${color}"></button>`).join("");
  const standards=["#c00000","#ff0000","#ffc000","#ffff00","#92d050","#00b050","#00b0f0","#0070c0","#7030a0","#202735"].map((color,index)=>`<button type="button" class="rich-palette-swatch" data-rich-swatch="${command}" data-color="${color}" aria-label="选择标准色 ${index+1}" style="--swatch:${color}"></button>`).join("");
  palette.innerHTML=`<div class="rich-palette-grid">${grid}</div><div class="rich-palette-caption">标准色</div><div class="rich-palette-grid">${standards}</div><button type="button" class="rich-palette-custom-toggle" data-rich-custom-toggle>自定义…</button><div class="rich-palette-custom hidden"><label>色相<input type="range" data-rich-custom="h" min="0" max="360" value="220"></label><label>浓淡<input type="range" data-rich-custom="s" min="0" max="100" value="70"></label><label>明暗<input type="range" data-rich-custom="l" min="10" max="95" value="50"></label><button type="button" data-rich-custom-apply style="--swatch:${selected}">使用此颜色</button></div>`;
  const rect=button.getBoundingClientRect(),host=dialog.getBoundingClientRect();
  palette.style.left=`${Math.min(Math.max(8,rect.left-host.left),host.width-237)}px`;
  palette.style.top=`${Math.min(rect.bottom-host.top+5,host.height-330)}px`;
  palette.dataset.command=command;
  palette.classList.remove("hidden");
}
function updateCustomColor() {
  const palette=$("#richColorPalette");
  const value=name=>Number(palette.querySelector(`[data-rich-custom="${name}"]`).value);
  palette.querySelector("[data-rich-custom-apply]").style.setProperty("--swatch",hslColor(value("h"),value("s"),value("l")));
}
function chooseRichColor(command,color) {
  if(!/^#[\da-f]{6}$/i.test(color)) return;
  localStorage.setItem(RICH_COLOR_KEYS[command],color);
  $("#editorMarkdownToolbar").querySelector(`[data-rich-apply-color="${command}"]`)?.style.setProperty("--chosen",color);
  $("#richColorPalette").classList.add("hidden");
  applyRichFormat(command,color);
}

function mainToolbarHtml(editable) {
  const actions=items=>items.map(([action,label,title])=>`<button type="button" data-md-action="${action}" title="${title}" aria-label="${title}" ${editable ? "" : "disabled"}>${label}</button>`).join("");
  return `<span class="main-toolbar-group main-toolbar-core"><span class="main-toolbar-label">格式</span>${actions(MAIN_MARKDOWN_ACTIONS.slice(0,4))}<button type="button" data-md-action="link" title="链接 / 取消链接" aria-label="链接 / 取消链接">链接</button><button type="button" data-rich-insert-image title="插入图片" aria-label="插入图片"><svg viewBox="0 0 18 18" width="14" height="14" aria-hidden="true"><rect x="1.5" y="2" width="15" height="14" rx="1" fill="none" stroke="currentColor"/><circle cx="5.5" cy="6" r="1.5" fill="#e58a34"/><path d="M2 14l5-5 3 3 2-2 4 4" fill="none" stroke="currentColor"/></svg>图片</button></span><span class="main-toolbar-group main-toolbar-headings">${actions(MAIN_MARKDOWN_ACTIONS.slice(4,7))}</span><span class="main-toolbar-group main-toolbar-size"><label class="main-size-tool">字号 <select data-rich-size aria-label="字号" ${editable ? "" : "disabled"}>${[[3,"默认 · 16"],[1,"10"],[2,"13"],[4,"18"],[5,"24"],[6,"30"],[7,"36"]].map(([value,label])=>`<option value="${value}">${label}</option>`).join("")}</select></label></span><span class="main-toolbar-group main-toolbar-spacing"><label class="main-size-tool">行距 <select data-rich-line-spacing aria-label="行距" ${editable ? "" : "disabled"}>${[["default","默认 · 1.85"],["1.4","紧凑 · 1.4"],["1.65","适中 · 1.65"],["2.2","宽松 · 2.2"]].map(([value,label])=>`<option value="${value}">${label}</option>`).join("")}</select></label></span><span class="main-toolbar-group main-toolbar-foreground">${richPaletteHtml("foreColor")}</span><span class="main-toolbar-group main-toolbar-background">${richPaletteHtml("hiliteColor")}</span><span class="main-toolbar-group main-toolbar-extra">${actions(MAIN_MARKDOWN_ACTIONS.slice(7,-1))}</span>`;
}

let richSelectionRange=null;
const RICH_TEXT_BLOCK_SELECTOR="p,h1,h2,h3,h4,li,blockquote,div:not([data-image-row]):not([data-image-group]):not(.main-rich-editor)";
function rememberRichSelection() {
  const editor=$("#editorDialog .main-rich-editor"),selection=window.getSelection();
  if(editor && selection?.rangeCount && editor.contains(selection.anchorNode)) {
    richSelectionRange=selection.getRangeAt(0).cloneRange();
    const anchor=selection.anchorNode?.nodeType===1 ? selection.anchorNode : selection.anchorNode?.parentElement;
    const spacing=$("#editorMarkdownToolbar [data-rich-line-spacing]");
    const value=anchor?.closest?.(RICH_TEXT_BLOCK_SELECTOR)?.style.lineHeight;
    if(spacing) spacing.value=["1.4","1.65","2.2"].includes(value) ? value : "default";
  }
}

function isCanvasMediaSource(entry) {
  return entry.type === "source" && Boolean(entry.assetId);
}

function canvasMediaFileHtml(entry,mode='view') {
  return `<section class="asset-panel canvas-attachments" data-canvas-attachments="${escapeHtml(entry.id)}"><div class="canvas-attachment-heading"><h3>附件 · 0</h3>${mode==='edit'?'<button type="button" class="secondary" data-insert-canvas-attachment>＋ 插入附件</button>':''}</div><p class="canvas-attachment-empty">暂无附件</p></section>`;
}

async function renderCanvasAttachments(frame,attachments) {
  const panel = frame.closest('.main-card-page')?.querySelector('[data-canvas-attachments]');
  if (!panel) return;
  const editing=Boolean(frame.closest('#editorDialog'));
  panel.hidden=false;
  const row = asset => `<div class="canvas-attachment-row"><div class="canvas-attachment-preview" data-attachment-preview="${escapeHtml(asset.id)}">${escapeHtml(asset.category)}</div><div class="canvas-attachment-copy"><strong title="${escapeHtml(asset.name)}">${escapeHtml(asset.name)}</strong><div class="asset-meta"><span>${escapeHtml(asset.extension || asset.category)}</span><span>${formatBytes(asset.size)}</span>${asset.width && asset.height ? `<span>${asset.width} × ${asset.height}</span>` : ''}${asset.category==='视频' && asset.durationSeconds ? `<span>${formatDuration(asset.durationSeconds)}</span>` : ''}</div><div class="asset-panel-actions"><button type="button" data-open-asset="${escapeHtml(asset.id)}" ${asset.draft?'disabled title="保存后可打开文件"':''}>打开</button><button type="button" data-reveal-asset="${escapeHtml(asset.id)}" ${asset.draft?'disabled title="保存后可定位文件"':''}>定位文件</button></div></div></div>`;
  attachments=attachments||[];
  panel.innerHTML = `<div class="canvas-attachment-heading"><h3>附件 · ${attachments.length}</h3>${editing?'<button type="button" class="secondary" data-insert-canvas-attachment>＋ 插入附件</button>':''}</div>${attachments.slice(0,3).map(row).join('')}${attachments.length > 3 ? `<details class="canvas-attachment-more"><summary>展开全部（+${attachments.length - 3}）</summary>${attachments.slice(3).map(row).join('')}</details>` : ''}${!attachments.length?'<p class="canvas-attachment-empty">暂无附件</p>':''}`;
  for (const asset of attachments) {
    if(asset.draft||asset.missing){
      const preview=panel.querySelector(`[data-attachment-preview="${CSS.escape(asset.id)}"]`);
      const badge=document.createElement('span');badge.textContent=asset.missing?'文件缺失':'未保存';badge.title=asset.missing?'原文件不存在，请重新插入原文件后保存':'保存卡片后，附件才会写入资料库';
      preview?.closest('.canvas-attachment-row')?.querySelector('.asset-meta')?.append(badge);
      if(asset.missing&&editing){const button=document.createElement('button');button.type='button';button.textContent='从旧缓存恢复';button.dataset.restoreCanvasAsset=asset.id;preview?.closest('.canvas-attachment-row')?.querySelector('.asset-panel-actions')?.append(button);}
    }
    if(!['图片','视频'].includes(asset.category))continue;
    const target = panel.querySelector(`[data-attachment-preview="${CSS.escape(asset.id)}"]`);
    if (!target) continue;
    const presentation = !asset.previewUrl && window.workbenchDesktop ? await getAssetPresentation(asset.id) : null;
    if (!target.isConnected) return;
    const url = asset.previewUrl || (window.workbenchDesktop ? presentation?.previewUrl : `/api/assets/${encodeURIComponent(asset.id)}/preview`);
    if (url) target.innerHTML = asset.draft && asset.category==='视频' ? `<video src="${escapeHtml(url)}" muted preload="metadata"></video>` : `<img src="${escapeHtml(url)}" loading="lazy" alt="" onerror="this.remove()">`;
  }
}

let areaGraphController = null;
function areaRelationshipGraph(area) {
  const full = WorkbenchGraphData.buildGraph(state);
  const members = WorkbenchGraphData.filterGraph(full,{areaId:area.id});
  const edges = [...members.edges, ...members.nodes.map(node=>({source:area.id,target:node.id,kinds:["areaRefs"]}))];
  const nodes = [{id:area.id,type:"area",title:area.title},...members.nodes].map(node=>({...node,connectionCount:edges.filter(edge=>edge.source===node.id||edge.target===node.id).length}));
  return {nodes,edges};
}

function areaGraphHtml(area) {
  const graph = areaRelationshipGraph(area);
  return `<section class="viewer-section viewer-area-relationships"><div class="area-graph-heading"><h3>关系</h3><div class="area-graph-legend">${["project","knowledge","source"].map(type=>`<span class="area-legend-${type}"><i></i>${typeLabel(type)} ${graph.nodes.filter(node=>node.type===type).length}</span>`).join("")}</div></div><div class="area-graph-surface"><canvas id="areaRelationCanvas" tabindex="0" aria-label="${escapeHtml(area.title)}的关系图谱"></canvas>${graph.nodes.length===1?'<span class="area-graph-empty">尚未关联项目、知识或资料</span>':''}<button type="button" id="resetAreaGraph" aria-label="复位关系图谱">复位</button></div><p class="area-graph-help">拖动画布 · 滚轮缩放 · 点击内容节点打开卡片</p></section>`;
}

function viewerTaskListHtml(tasks) {
  return `<ul class="viewer-task-list">${tasks.map(task => `<li class="${task.done ? "done" : ""}"><span>${task.done ? "✓" : ""}</span><b>${escapeHtml(task.text)}</b></li>`).join("")}</ul>`;
}
function restoreRichSelection() {
  const editor=$("#editorDialog .main-rich-editor");
  if(!editor) return null;
  editor.focus();
  if(richSelectionRange && editor.contains(richSelectionRange.commonAncestorContainer)) {
    const selection=window.getSelection();
    selection.removeAllRanges();selection.addRange(richSelectionRange);
  }
  return editor;
}
function applyRichFormat(action,value="") {
  const editor=restoreRichSelection();
  if(!editor) return;
  const commands={bold:"bold",italic:"italic",strike:"strikeThrough",bullet:"insertUnorderedList",numbered:"insertOrderedList",h1:"formatBlock",h2:"formatBlock",h3:"formatBlock",normal:"formatBlock",code:"formatBlock"};
  const closestBlock=selector=>{const node=window.getSelection()?.anchorNode;return (node?.nodeType===1 ? node : node?.parentElement)?.closest(selector);};
  const focusInside=node=>{const selection=window.getSelection(),range=document.createRange();range.selectNodeContents(node);range.collapse(false);selection.removeAllRanges();selection.addRange(range);};
  const selectedElements=selector=>{const selection=window.getSelection();if(!selection?.rangeCount)return [];const range=selection.getRangeAt(0);return [...editor.querySelectorAll(selector)].filter(node=>range.intersectsNode(node));};
  if(action==="link") {
    const anchor=closestBlock("a"),plain=closestBlock("[data-plain-href]");
    if(anchor) {
      const span=document.createElement("span");span.dataset.plainHref=anchor.href;span.textContent=anchor.textContent;
      anchor.replaceWith(span);focusInside(span);
    } else if(plain) {
      const link=document.createElement("a");link.href=plain.dataset.plainHref;link.target="_blank";link.rel="noopener noreferrer";link.textContent=plain.textContent;
      plain.replaceWith(link);focusInside(link);
    } else {
      const selected=window.getSelection()?.toString().trim() || "";
      const detected=safeExternalUrl(selected.startsWith("www.") ? `https://${selected}` : selected);
      const url=detected || prompt("链接地址（https:// 或 http://）");
      if(url && safeExternalUrl(url)) document.execCommand("createLink",false,url);
    }
  } else if(action==="foreColor" || action==="hiliteColor") {
    document.execCommand("styleWithCSS",false,true);
    document.execCommand(action,false,value);
    document.execCommand("styleWithCSS",false,false);
  } else if(action==="fontSize") {
    document.execCommand("fontSize",false,value);
  } else if(action==="quote") {
    const quoted=selectedElements("blockquote")[0],list=selectedElements("ul,ol")[0] || closestBlock("ul,ol");
    if(quoted) quoted.replaceWith(...quoted.childNodes);
    else if(list) {
      const quote=document.createElement("blockquote");
      [...list.children].filter(item=>item.tagName==="LI").forEach(item=>{const paragraph=document.createElement("p");paragraph.replaceChildren(...item.childNodes);quote.append(paragraph);});
      const parent=list.parentElement;
      if(parent?.tagName==="P" && parent.childNodes.length===1) parent.replaceWith(quote);
      else list.replaceWith(quote);
    } else {
      document.execCommand("formatBlock",false,"blockquote");
      editor.querySelectorAll("blockquote blockquote").forEach(nested=>nested.replaceWith(...nested.childNodes));
    }
  } else if(action==="normal") {
    const headings=selectedElements("h1,h2,h3,h4");
    if(headings.length) headings.forEach(heading=>{const paragraph=document.createElement("p");paragraph.replaceChildren(...heading.childNodes);heading.replaceWith(paragraph);});
    else document.execCommand("formatBlock",false,"p");
  } else if(commands[action]) {
    document.execCommand(commands[action],false,["h1","h2","h3"].includes(action) ? action : action==="code" ? "pre" : undefined);
  }
  rememberRichSelection();
}
function applyRichLineSpacing(value) {
  if(!["default","1.4","1.65","2.2"].includes(value)) return;
  const editor=restoreRichSelection(),selection=window.getSelection(),range=selection?.rangeCount && selection.getRangeAt(0);
  if(!editor || !range) return;
  const selector=RICH_TEXT_BLOCK_SELECTOR;
  const anchor=range.startContainer.nodeType===1 ? range.startContainer : range.startContainer.parentElement;
  const blocks=range.collapsed ? [anchor?.closest(selector)].filter(block=>block && editor.contains(block)) : [...editor.querySelectorAll(selector)].filter(block=>range.intersectsNode(block));
  blocks.forEach(block=>{if(value==="default") block.style.removeProperty("line-height");else block.style.lineHeight=value;});
  rememberRichSelection();
}

async function hydrateEmbeddedImages(root) {
  const images=[...root.querySelectorAll("img[data-asset-id]")];
  await Promise.all(images.map(async image=>{
    image.draggable=false;
    const presentation=await getAssetPresentation(image.dataset.assetId);
    if(image.isConnected && presentation?.category==="图片" && presentation.mediaUrl) image.src=presentation.mediaUrl;
  }));
}

function normalizeImageRows(root) {
  const imageOnly=node=>{
    if(node.matches?.("img[data-asset-id]")) return node;
    if(!node.matches?.("div,p") || node.hasAttribute("data-image-row") || node.textContent.trim()) return null;
    const images=node.querySelectorAll("img[data-asset-id]");
    return images.length===1 && [...node.children].every(child=>child===images[0] || child.tagName==="BR") ? images[0] : null;
  };
  for(const child of [...root.children]) {
    if(child.matches?.("[data-image-row],[data-image-group]")) continue;
    const image=imageOnly(child);
    if(!image) continue;
    const row=document.createElement("div");row.dataset.imageRow="true";row.dataset.imageLayout="full";child.before(row);
    row.append(image);
    if(child!==image) child.remove();
  }
}

let activeRichImage=null;
function hideRichImageControls() {
  activeRichImage?.classList.remove("rich-image-selected");
  activeRichImage=null;
  $("#richImageControls").classList.add("hidden");
  $("#richImageResizeHandles").classList.add("hidden");
}
function positionRichImageControls() {
  if(!activeRichImage?.isConnected) { hideRichImageControls(); return; }
  const imageRect=activeRichImage.getBoundingClientRect(),host=$("#editorDialog"),hostRect=host.getBoundingClientRect(),body=$("#formFields").getBoundingClientRect(),controls=$("#richImageControls");
  const outside=imageRect.bottom<body.top || imageRect.top>body.bottom;
  controls.classList.toggle("hidden",outside);
  controls.style.left=`${Math.max(8,Math.min(host.clientWidth-controls.offsetWidth-8,imageRect.left-hostRect.left-host.clientLeft))}px`;
  controls.style.top=`${Math.max(body.top-hostRect.top-host.clientTop,imageRect.top-hostRect.top-host.clientTop-controls.offsetHeight-5)}px`;
  const row=activeRichImage.closest("[data-image-row]"),layout=row?.dataset.imageLayout;
  controls.querySelectorAll("[data-image-layout-option]").forEach(button=>{button.disabled=!row || row.querySelectorAll(":scope > img[data-asset-id]").length!==1;button.classList.toggle("is-active",button.dataset.imageLayoutOption===layout);});
  const handles=$("#richImageResizeHandles");
  handles.classList.toggle("hidden",outside || !row);
  handles.classList.toggle("clip-top",imageRect.top<body.top+6);
  handles.classList.toggle("clip-bottom",imageRect.bottom>body.bottom-6);
  handles.style.left=`${imageRect.left-hostRect.left-host.clientLeft}px`;
  handles.style.top=`${imageRect.top-hostRect.top-host.clientTop}px`;
  handles.style.width=`${imageRect.width}px`;
  handles.style.height=`${imageRect.height}px`;
}
function showRichImageControls(image) {
  hideRichImageControls();
  activeRichImage=image;
  image.classList.add("rich-image-selected");
  $("#richImageControls").classList.remove("hidden");
  positionRichImageControls();
}
function setSelectedImageLayout(layout) {
  const row=activeRichImage?.closest("[data-image-row]");
  if(!row || row.querySelectorAll(":scope > img[data-asset-id]").length!==1 || !["full","left","right"].includes(layout)) return;
  row.dataset.imageLayout=layout;
  if([...row.querySelectorAll(":scope > p,:scope > [data-image-text]")].some(node=>node.textContent.trim())) row.dataset.imagePaired="true";
  positionRichImageControls();
}
function deleteSelectedEmbeddedImage() {
  const image=activeRichImage,block=image?.closest("[data-image-row],[data-image-group]");
  if(!block) return;
  const editor=$("#editorDialog .main-rich-editor"),before=editor.innerHTML;
  if(block.matches("[data-image-group]")) {
    if(block.querySelectorAll(":scope > img[data-asset-id]").length===2) pinImageWidth([...block.querySelectorAll(":scope > img[data-asset-id]")].find(item=>item!==image));
    image.remove();
    if(block.querySelectorAll(":scope > img[data-asset-id]").length===1) {
      delete block.dataset.imageGroup;
      block.dataset.imageRow="true";
      block.dataset.imageLayout="full";
    } else if(!block.querySelector("img[data-asset-id]")) block.remove();
  } else {
    image.remove();
    if(block.querySelector(":scope > img[data-asset-id]")) {
      if(block.querySelectorAll(":scope > img[data-asset-id]").length===1) block.dataset.imageLayout="full";
    } else {
      const content=[...block.childNodes].filter(node=>node.nodeType===1 || node.textContent.trim());
      for(const node of content) {
        if(node.matches?.("[data-image-text]")) {
          const paragraph=document.createElement("p");while(node.firstChild) paragraph.append(node.firstChild);node.replaceWith(paragraph);
        }
      }
      block.replaceWith(...content);
    }
  }
  hideRichImageControls();
  imageDragUndo={before,after:editor.innerHTML};
  editor.focus();
}
let imageResizeState=null;
function mergeSelectedImageWithPreviousRow() {
  const image=activeRichImage,row=image?.closest("[data-image-row]"),editor=$("#editorDialog .main-rich-editor");
  if(!row || row.parentElement!==editor || row.querySelectorAll(":scope > img[data-asset-id]").length!==1 || [...row.children].some(child=>child!==image && child.textContent.trim())) return false;
  const spacers=[];
  let previous=row.previousElementSibling;
  while(previous?.matches("div,p") && !previous.textContent.trim() && [...previous.children].every(child=>child.tagName==="BR")) {spacers.push(previous);previous=previous.previousElementSibling;}
  if(!previous?.matches("[data-image-row]") || [...previous.children].some(child=>!child.matches("img[data-asset-id]") && (child.textContent.replaceAll("\u200b","").trim() || child.querySelector("img")))) return false;
  const previousImages=[...previous.querySelectorAll(":scope > img[data-asset-id]")];
  const widths=[...previousImages,image].map(item=>item.getBoundingClientRect().width);
  if(widths.some(width=>!width) || widths.reduce((sum,width)=>sum+width,0)+8*previousImages.length>editor.clientWidth) return false;
  spacers.forEach(spacer=>spacer.remove());
  [...previous.children].filter(child=>!child.matches("img[data-asset-id]")).forEach(child=>child.remove());
  delete previous.dataset.imagePaired;
  previous.dataset.imageLayout="inline";
  previous.append(image);
  row.remove();
  positionRichImageControls();
  return true;
}
function startImageResize(event) {
  const handle=event.target.closest("[data-rich-image-resize]");
  if(!handle || !activeRichImage?.closest("[data-image-row]") || event.button!==0) return;
  event.preventDefault();event.stopPropagation();
  imageResizeState={pointerId:event.pointerId,image:activeRichImage,corner:handle.dataset.richImageResize,startX:event.clientX,startWidth:activeRichImage.getBoundingClientRect().width};
  handle.setPointerCapture?.(event.pointerId);
}
function moveImageResize(event) {
  const drag=imageResizeState;
  if(!drag || drag.pointerId!==event.pointerId) return;
  const direction=drag.corner.includes("e") ? 1 : -1;
  const editor=$("#editorDialog .main-rich-editor");
  drag.image.style.width=`${Math.round(Math.max(80,Math.min(1600,editor.clientWidth,drag.startWidth+direction*(event.clientX-drag.startX))))}px`;
  positionRichImageControls();
}
function stopImageResize(event) {
  if(imageResizeState?.pointerId!==event.pointerId) return;
  imageResizeState=null;
  positionRichImageControls();
}
let imageDragState=null,imageDragUndo=null,imageDragScrollFrame=0;
function pinImageWidth(image) {
  if(image.style.width) return;
  const width=Math.round(image.getBoundingClientRect().width);
  if(width>=80) image.style.width=`${Math.min(1600,width)}px`;
}
function stopImageDrag() {
  imageDragState=null;
  if(imageDragScrollFrame) cancelAnimationFrame(imageDragScrollFrame);
  imageDragScrollFrame=0;
  showImageDropPreview(null);
}
function scrollDuringImageDrag() {
  imageDragScrollFrame=0;
  const drag=imageDragState;
  if(!drag?.moved) return;
  const body=$("#formFields"),rect=body.getBoundingClientRect(),margin=46;
  const step=drag.y<rect.top+margin ? -Math.min(18,(rect.top+margin-drag.y)/2) : drag.y>rect.bottom-margin ? Math.min(18,(drag.y-(rect.bottom-margin))/2) : 0;
  if(step && body.scrollHeight>body.clientHeight) {
    body.scrollTop+=step;
    drag.placement=imageDropTarget(drag.x,drag.y,drag.source);
    showImageDropPreview(drag.placement);
  }
  imageDragScrollFrame=requestAnimationFrame(scrollDuringImageDrag);
}
function imageDropTarget(x,y,source) {
  const editor=$("#editorDialog .main-rich-editor"),bounds=editor.getBoundingClientRect(),viewport=$("#formFields").getBoundingClientRect();
  if(x<Math.max(bounds.left,viewport.left) || x>Math.min(bounds.right,viewport.right) || y<Math.max(bounds.top,viewport.top) || y>Math.min(bounds.bottom,viewport.bottom)) return null;
  const sourceBlock=source.matches("img[data-asset-id]") ? source.closest("[data-image-row],[data-image-group]") : source;
  const blocks=[...editor.children].filter(node=>node!==sourceBlock && node.getBoundingClientRect().height>0);
  if(!blocks.length) return {target:null,zone:"after"};
  const target=blocks.reduce((best,node)=>{
    const rect=node.getBoundingClientRect(),distance=y<rect.top ? rect.top-y : y>rect.bottom ? y-rect.bottom : 0;
    return !best || distance<best.distance ? {node,distance} : best;
  },null).node;
  const rect=target.getBoundingClientRect(),wide=editor.clientWidth>=680,group=source.matches("[data-image-group]");
  if(wide && !group && target.matches("p") && y>=rect.top+rect.height*.18 && y<=rect.bottom-rect.height*.18) {
    if(x<rect.left+rect.width*.28) return {target,zone:"left"};
    if(x>rect.right-rect.width*.28) return {target,zone:"right"};
    return {target,zone:"full"};
  }
  return {target,zone:y<rect.top+rect.height/2 ? "before" : "after"};
}
function showImageDropPreview(placement) {
  const preview=$("#imageDropPreview");
  if(!placement) { preview.classList.add("hidden");return; }
  const editor=$("#editorDialog .main-rich-editor"),rect=placement.target?.getBoundingClientRect() || editor.getBoundingClientRect(),side=["left","right"].includes(placement.zone);
  preview.dataset.zone=placement.zone;
  preview.replaceChildren();
  preview.style.left=`${side ? placement.zone==="left" ? rect.left : rect.right-4 : editor.getBoundingClientRect().left}px`;
  preview.style.top=`${side ? rect.top : placement.zone==="before" ? rect.top-4 : rect.bottom-4}px`;
  preview.style.width=`${side ? 4 : editor.getBoundingClientRect().width}px`;
  preview.style.height=`${side ? Math.max(20,rect.height) : 4}px`;
  preview.classList.remove("hidden");
}
function finishImageDrag(placement) {
  const editor=$("#editorDialog .main-rich-editor"),source=imageDragState?.source;
  if(!source || !placement || placement.target===source || placement.target===source.closest?.("[data-image-row],[data-image-group]")) return false;
  const before=editor.innerHTML;
  let block=source;
  if(source.matches("img[data-asset-id]")) {
    const oldRow=source.closest("[data-image-row],[data-image-group]");
    if(!oldRow) return false;
    block=document.createElement("div");block.dataset.imageRow="true";block.dataset.imageLayout="full";
    pinImageWidth(source);
    const remaining=oldRow.querySelectorAll(":scope > img[data-asset-id]");
    if(oldRow.matches("[data-image-group]") && remaining.length===2) pinImageWidth([...remaining].find(image=>image!==source));
    block.append(source);
    const leftImages=oldRow.querySelectorAll(":scope > img[data-asset-id]").length;
    if(!leftImages) {
      for(const node of [...oldRow.querySelectorAll(":scope > [data-image-text]")]) {
        const paragraph=document.createElement("p");paragraph.replaceChildren(...node.childNodes);node.replaceWith(paragraph);
      }
      oldRow.replaceWith(...oldRow.childNodes);
    } else if(oldRow.matches("[data-image-group]") && leftImages===1) {
      delete oldRow.dataset.imageGroup;
      oldRow.dataset.imageRow="true";
      oldRow.dataset.imageLayout="full";
    } else if(oldRow.matches("[data-image-row]") && leftImages===1) oldRow.dataset.imageLayout="full";
  } else if(source.matches("[data-image-row]")) {
    const images=[...source.querySelectorAll(":scope > img[data-asset-id]")];
    block=document.createElement("div");block.dataset.imageRow="true";block.dataset.imageLayout="full";
    images.forEach(image=>{pinImageWidth(image);block.append(image);});
    const remaining=[...source.childNodes];
    for(const node of remaining) if(node.matches?.("[data-image-text]")) {
      const p=document.createElement("p");while(node.firstChild) p.append(node.firstChild);node.replaceWith(p);
    }
    source.replaceWith(...source.childNodes);
  } else source.remove();
  if(placement.target && ["left","right"].includes(placement.zone) && placement.target.matches("p")) {
    block.dataset.imageLayout=placement.zone;
    block.dataset.imagePaired="true";
    placement.target.replaceWith(block);
    block.append(placement.target);
  } else if(placement.target) {
    if(block.matches("[data-image-row]")) block.dataset.imageLayout="full";
    if(placement.zone==="before") placement.target.before(block);else placement.target.after(block);
  } else editor.append(block);
  hideRichImageControls();
  imageDragUndo={before,after:editor.innerHTML};
  editor.focus();
  return true;
}
function placeImageTextCaret(image) {
  const row=image.closest("[data-image-row]");
  if(!row) return;
  if(row.dataset.imageLayout) {
    let paragraph=[...row.querySelectorAll(":scope > p")].at(-1) || (["full","inline"].includes(row.dataset.imageLayout) && row.nextElementSibling?.matches("p") ? row.nextElementSibling : null);
    if(!paragraph) {
      paragraph=document.createElement("p");paragraph.append(document.createElement("br"));
      if(["full","inline"].includes(row.dataset.imageLayout)) row.after(paragraph);
      else {row.append(paragraph);row.dataset.imagePaired="true";}
    }
    const selection=window.getSelection(),range=document.createRange();range.selectNodeContents(paragraph);range.collapse(false);selection.removeAllRanges();selection.addRange(range);
    $("#editorDialog .main-rich-editor").focus();rememberRichSelection();return;
  }
  const paired=row.querySelector(":scope > p");
  if(paired) {
    const selection=window.getSelection(),range=document.createRange();range.selectNodeContents(paired);range.collapse(false);selection.removeAllRanges();selection.addRange(range);
    $("#editorDialog .main-rich-editor").focus();rememberRichSelection();return;
  }
  let text=image.nextElementSibling?.matches("[data-image-text]") ? image.nextElementSibling : null;
  if(!text) {
    text=document.createElement("span");
    text.dataset.imageText="true";
    image.after(text);
  }
  if(!text.firstChild) text.append(document.createTextNode("\u200b"));
  const selection=window.getSelection(),range=document.createRange();
  range.setStart(text.firstChild,text.firstChild.textContent.length);
  range.collapse(true);
  selection.removeAllRanges();selection.addRange(range);
  $("#editorDialog .main-rich-editor").focus();
  rememberRichSelection();
}
function handleImageRowKeydown(event) {
  if(!["Enter","Backspace"].includes(event.key) || event.isComposing) return;
  const selection=window.getSelection(),range=selection?.rangeCount && selection.getRangeAt(0);
  if(!range?.collapsed) return;
  const text=(selection.anchorNode?.nodeType===1 ? selection.anchorNode : selection.anchorNode?.parentElement)?.closest?.("[data-image-text]");
  const row=text?.closest("[data-image-row]");
  if(!row) return;
  const empty=!text.textContent.replaceAll("\u200b","").trim() && !text.querySelector("br");
  if(event.key==="Enter") {
    event.preventDefault();
    if(!empty) {
      const caretRect=range.getBoundingClientRect();
      const imageBottom=Math.max(...[...row.querySelectorAll("img[data-asset-id]")].map(image=>image.getBoundingClientRect().bottom));
      const lineHeight=parseFloat(getComputedStyle(text).lineHeight) || parseFloat(getComputedStyle(event.target).lineHeight) || 30;
      if(caretRect.top>0 && caretRect.top+lineHeight>=imageBottom-2) {
        const tail=document.createRange();
        tail.setStart(range.startContainer,range.startOffset);
        tail.setEnd(text,text.childNodes.length);
        const paragraph=document.createElement("p");
        paragraph.append(tail.extractContents());
        if(!paragraph.textContent.replaceAll("\u200b","").trim() && !paragraph.querySelector("br")) paragraph.append(document.createElement("br"));
        row.after(paragraph);
        range.selectNodeContents(paragraph);range.collapse(true);
        selection.removeAllRanges();selection.addRange(range);
        rememberRichSelection();
        return;
      }
      const br=document.createElement("br"),caret=document.createTextNode("\u200b");
      range.deleteContents();range.insertNode(br);br.after(caret);
      range.setStart(caret,1);range.collapse(true);
      selection.removeAllRanges();selection.addRange(range);
      rememberRichSelection();
      return;
    }
    const next=document.createElement("div");next.dataset.imageRow="true";
    while(text.nextSibling) next.append(text.nextSibling);
    text.remove();
    if(next.childNodes.length) {
      row.after(next);
      const image=next.querySelector("img[data-asset-id]");
      if(image) placeImageTextCaret(image);
    } else {
      const paragraph=document.createElement("p");paragraph.append(document.createElement("br"));row.after(paragraph);
      range.setStart(paragraph,0);range.collapse(true);
      selection.removeAllRanges();selection.addRange(range);rememberRichSelection();
    }
    hideRichImageControls();
    return;
  }
  if(!empty) return;
  const spacers=[];
  let previous=row.previousElementSibling;
  while(previous?.matches("div,p") && !previous.textContent.trim() && [...previous.children].every(child=>child.tagName==="BR")) {
    spacers.push(previous);
    previous=previous.previousElementSibling;
  }
  if(!previous?.matches("[data-image-row]")) return;
  event.preventDefault();
  spacers.forEach(spacer=>spacer.remove());
  text.remove();
  previous.querySelectorAll("[data-image-text]").forEach(item=>{if(!item.textContent.replaceAll("\u200b","").trim()) item.remove();});
  const firstImage=row.querySelector("img[data-asset-id]");
  while(row.firstChild) previous.append(row.firstChild);
  row.remove();
  hideRichImageControls();
  if(firstImage) placeImageTextCaret(firstImage);
}
async function openInlineImagePreview(image) {
  if(!image?.dataset.assetId) return;
  const presentation=await getAssetPresentation(image.dataset.assetId);
  if(presentation?.category!=="图片" || !presentation.mediaUrl) return;
  const dialog=$("#inlineImageDialog"),full=$("#inlineImageFull");
  full.src=presentation.mediaUrl;
  full.alt=image.alt || "图片预览";
  setInlineImageZoom(1,true);
  if(!dialog.open) dialog.showModal();
}
function closeInlineImagePreview() {
  const dialog=$("#inlineImageDialog");
  if(dialog.open) dialog.close();
  $("#inlineImageFull").removeAttribute("src");
}

let inlineImageZoom=1,inlineImagePanX=0,inlineImagePanY=0,inlineImagePanDrag=null;
function setInlineImageZoom(next,resetPan=false) {
  inlineImageZoom=Math.max(.25,Math.min(6,Math.round(next*100)/100));
  if(resetPan) { inlineImagePanX=0;inlineImagePanY=0; }
  $("#inlineImageFull").style.transform=`translate(${inlineImagePanX}px,${inlineImagePanY}px) scale(${inlineImageZoom})`;
  $("#inlineImageZoomLabel").textContent=`${Math.round(inlineImageZoom*100)}%`;
  $("#inlineImageStage").classList.toggle("is-zoomed",inlineImageZoom>1);
}

function insertImageAsset(asset,presentation) {
  if(!asset?.id || presentation?.category!=="图片" || !$("#editorDialog").open) return false;
  const row=document.createElement("div");row.dataset.imageRow="true";row.dataset.imageLayout="full";
  row.append(createEmbeddedImage(asset,presentation));
  insertImageBlock(row);
  showRichImageControls(row.querySelector("img"));
  return true;
}
function createEmbeddedImage(asset,presentation) {
  const image=document.createElement("img");image.draggable=false;image.dataset.assetId=asset.id;if(asset.relativePath) image.dataset.assetPath=asset.relativePath.replaceAll("\\","/");image.alt=asset.displayName || "插入的图片";image.src=presentation.mediaUrl;return image;
}
function insertImageBlock(block) {
  const editor=restoreRichSelection(),selection=window.getSelection(),range=selection?.rangeCount ? selection.getRangeAt(0) : null;
  let child=range?.startContainer;
  if(child?.nodeType!==1) child=child?.parentElement;
  while(child?.parentElement && child.parentElement!==editor) child=child.parentElement;
  if(child?.parentElement===editor && child.matches("p,h1,h2,h3,h4,div:not([data-image-row]):not([data-image-group])") && range?.collapsed && child.contains(range.startContainer)) {
    const tail=document.createRange();tail.setStart(range.startContainer,range.startOffset);tail.setEnd(child,child.childNodes.length);
    const after=child.cloneNode(false);after.append(tail.extractContents());
    if(child.lastElementChild?.tagName==="BR") child.lastElementChild.remove();
    if(after.firstElementChild?.tagName==="BR") after.firstElementChild.remove();
    const beforeHasText=Boolean(child.textContent.trim()),afterHasText=Boolean(after.textContent.trim());
    if(beforeHasText) child.after(block);else child.replaceWith(block);
    if(afterHasText) block.after(after);
  } else if(child?.parentElement===editor) child.after(block);else editor.append(block);
  const after=document.createRange();after.setStartAfter(block);after.collapse(true);selection.removeAllRanges();selection.addRange(after);rememberRichSelection();
}
function insertImageGroup(images) {
  if(images.length<2 || !$("#editorDialog").open) return false;
  const group=document.createElement("div");group.dataset.imageGroup="true";
  images.forEach(({asset,presentation})=>{if(asset?.id && presentation?.category==="图片") group.append(createEmbeddedImage(asset,presentation));});
  if(group.children.length<2) return false;
  insertImageBlock(group);showRichImageControls(group.querySelector("img"));return true;
}

async function importDroppedRichImage(file) {
  if(!window.workbenchDesktop?.importDroppedImage) { toast("拖入本地图片需要桌面版"); return; }
  try {
    const result=await window.workbenchDesktop.importDroppedImage(file);
    if(insertImageAsset(result.asset,result.presentation)) {
      assetPresentationCache.set(result.asset.id,result.presentation);
      toast("图片已插入；保存卡片后会保留在正文中");
    }
  } catch(error) { toast(`图片拖入失败：${error.message}`); }
}

async function chooseRichImage() {
  if(!window.workbenchDesktop?.selectAndImportImage) { toast("插入本地图片需要桌面版"); return; }
  rememberRichSelection();
  try {
    const result=await window.workbenchDesktop.selectAndImportImage();
    if(result?.canceled) return;
    const images=result.images || (result.asset ? [{asset:result.asset,presentation:result.presentation}] : []);
    images.forEach(({asset,presentation})=>assetPresentationCache.set(asset.id,presentation));
    if(images.length===1 ? insertImageAsset(images[0].asset,images[0].presentation) : insertImageGroup(images)) toast(`${images.length} 张图片已插入；保存卡片后会保留在正文中`);
  } catch(error) { toast(`图片插入失败：${error.message}`); }
}

function linkifyEditorUrls(editor) {
  const walker=document.createTreeWalker(editor,NodeFilter.SHOW_TEXT);
  const nodes=[];
  while(walker.nextNode()) if(!walker.currentNode.parentElement?.closest("a,code,pre,[data-plain-href]")) nodes.push(walker.currentNode);
  for(const node of nodes) {
    const source=node.nodeValue;
    const pattern=/(?:https?:\/\/|www\.)[^\s<>"']+/gi;
    const matches=[...source.matchAll(pattern)];
    if(!matches.length) continue;
    const fragment=document.createDocumentFragment();
    let cursor=0,changed=false;
    for(const match of matches) {
      const raw=match[0].replace(/[.,!?;:，。！？；：）)]*$/u,"");
      const href=safeExternalUrl(raw.startsWith("www.") ? `https://${raw}` : raw);
      if(!href) continue;
      fragment.append(document.createTextNode(source.slice(cursor,match.index)));
      const link=document.createElement("a");link.href=href;link.target="_blank";link.rel="noopener noreferrer";link.textContent=raw;
      fragment.append(link);cursor=match.index+raw.length;changed=true;
    }
    if(!changed) continue;
    fragment.append(document.createTextNode(source.slice(cursor)));
    const selection=window.getSelection(),atCaret=selection?.isCollapsed && selection.anchorNode===node;
    const last=fragment.lastChild;
    node.replaceWith(fragment);
    if(atCaret && last) { const range=document.createRange();range.selectNodeContents(last);range.collapse(false);selection.removeAllRanges();selection.addRange(range); }
  }
}

function mainMetaHtml(entry) {
  const created=entry.createdAt || entry.created || WorkbenchData.isoNow();
  const updated=entry.updatedAt || entry.updated || created;
  return `<strong class="entry-type--${escapeHtml(entry.type)}">${escapeHtml(typeLabel(entry.type))}</strong><div class="main-card-dates"><span>创建 ${escapeHtml(WorkbenchData.dayOf(created))}</span><span>修改 ${escapeHtml(WorkbenchData.dayOf(updated))}</span></div>`;
}

function visibleMainRelations(entry,relations=WorkbenchRelations.groups(state,entry)) {
  const byId=new Map();
  [...relations.outgoing,...relations.incoming,...relations.evidence].forEach(item=>{
    const ref=item.entry || item;
    if(["project","knowledge","source"].includes(ref.type) && ref.id!==entry.id) byId.set(ref.id,ref);
  });
  return [...byId.values()];
}
function mainRelationColumnsHtml(items,renderItem) {
  const rows=[["project","项目"],["knowledge","知识"],["source","资料"]].map(([type,label])=>{
    const matches=items.filter(item=>(item.ref || item.entry || item).type===type);
    return matches.length ? `<section class="main-relation-column"><b>${label}</b><div class="main-relation-column-items">${matches.map(renderItem).join("")}</div></section>` : "";
  }).filter(Boolean);
  return rows.length ? `<div class="main-relation-columns">${rows.join("")}</div>` : `<div class="main-relation-empty">暂无关联</div>`;
}

function compactRefPickerHtml(name,types,value,placeholder) {
  editingRefs[name]=Array.isArray(value) ? [...value] : [];
  const relation=name==="relatedRefs";
  const label=relation?"添加关联内容":"添加领域";
  return `<div class="ref-picker main-ref-picker ${relation ? "main-relation-picker" : ""}" data-ref-name="${name}" data-ref-types="${types}" data-ref-multiple="true">${relation ? '<div class="ref-picker-heading"><div class="main-relation-title">关联内容</div>' : ""}<button type="button" class="ref-add-button" data-toggle-ref-picker aria-label="${label}" title="${label}" aria-expanded="false">＋</button>${relation ? "</div>" : ""}<div class="selected-refs ${relation ? "main-relation-scroll" : ""}" data-selected-for="${name}"></div><div class="ref-popover hidden"><input type="search" class="ref-search" aria-label="搜索${relation?"关联内容":"领域"}" placeholder="搜索" autocomplete="off"><div class="ref-suggestions hidden"></div></div></div>`;
}

function mainStatusSelectHtml(entry) {
  const field=schemas[entry.type].fields.find(item=>item[0] === (entry.type === "project" ? "status" : entry.type === "knowledge" ? "confidence" : "readingStatus"));
  const [name,label,,options]=field;
  const choices=options.split(',').map(option=>option.split('|'));
  const selected=choices.find(([value])=>value===entry[name]) || choices[0];
  const tone=value=>statusTone({type:entry.type,[name]:value});
  return `<div class="main-status-control"><span>${escapeHtml(label)}</span><div class="main-status-picker"><input type="hidden" name="${name}" value="${escapeHtml(selected[0])}"><button type="button" class="main-status-value status--${tone(selected[0])}" data-status-trigger aria-label="${escapeHtml(label)}：${escapeHtml(selected[1])}" aria-haspopup="listbox" aria-expanded="false">${escapeHtml(selected[1])}</button><div class="main-status-menu" popover="auto" role="listbox" aria-label="${escapeHtml(label)}">${choices.map(([value,text])=>`<button type="button" role="option" aria-selected="${value===selected[0]}" class="main-status-value status--${tone(value)}" data-status-choice="${escapeHtml(value)}">${escapeHtml(text)}</button>`).join('')}</div></div></div>`;
}

function openCardStatusMenu(trigger) {
  const menu=trigger.parentElement.querySelector('.main-status-menu');
  const rect=trigger.getBoundingClientRect();
  menu.ontoggle=()=>trigger.setAttribute('aria-expanded',String(menu.matches(':popover-open')));
  menu.showPopover();
  const bounds=menu.getBoundingClientRect();
  menu.style.left=`${Math.max(8,Math.min(rect.right-bounds.width,innerWidth-bounds.width-8))}px`;
  menu.style.top=`${rect.bottom+bounds.height+5<=innerHeight-8 ? rect.bottom+5 : Math.max(8,rect.top-bounds.height-5)}px`;
  trigger.setAttribute('aria-expanded','true');
  menu.querySelector('[aria-selected="true"]')?.focus({preventScroll:true});
}

document.addEventListener('click',event=>{
  const trigger=event.target.closest('[data-status-trigger]');
  if(trigger) {
    const menu=trigger.parentElement.querySelector('.main-status-menu');
    if(menu.matches(':popover-open')) menu.hidePopover();else openCardStatusMenu(trigger);
    return;
  }
  const choice=event.target.closest('[data-status-choice]');
  if(!choice) return;
  const picker=choice.closest('.main-status-picker'),button=picker.querySelector('[data-status-trigger]');
  picker.querySelector('input').value=choice.dataset.statusChoice;
  button.className=choice.className;
  button.textContent=choice.textContent;
  button.setAttribute('aria-label',`${picker.querySelector('.main-status-menu').getAttribute('aria-label')}：${choice.textContent}`);
  picker.querySelectorAll('[data-status-choice]').forEach(item=>item.setAttribute('aria-selected',String(item===choice)));
  picker.querySelector('.main-status-menu').hidePopover();
  button.focus({preventScroll:true});
});

document.addEventListener('keydown',event=>{
  const trigger=event.target.closest('[data-status-trigger]');
  if(trigger && ['ArrowDown','ArrowUp'].includes(event.key)) {event.preventDefault();openCardStatusMenu(trigger);return;}
  const menu=event.target.closest('.main-status-menu');
  if(!menu || menu.classList.contains('collection-status-menu')) return;
  const choices=[...menu.querySelectorAll('[data-status-choice]')],index=choices.indexOf(document.activeElement);
  if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
    event.preventDefault();
    const next=event.key==='Home'?0:event.key==='End'?choices.length-1:(index+(event.key==='ArrowDown'?1:-1)+choices.length)%choices.length;
    choices[next].focus({preventScroll:true});
  }
  if(event.key==='Escape') {event.preventDefault();event.stopImmediatePropagation();menu.hidePopover();menu.parentElement.querySelector('[data-status-trigger]').focus({preventScroll:true});}
},true);

function mainReadFieldsHtml(entry) {
  const parts=[];
  if(entry.type === "project") {
    parts.push(`<div class="field full"><label>目标与场景</label><div class="main-read-text-box">${escapeHtml(entry.goal || "")}</div></div>`);
    parts.push(`<div class="field full main-read-tasks"><label>待办列表</label><div class="task-editor-list">${entry.tasks?.length ? entry.tasks.map(task=>`<div class="task-editor-row"><input type="checkbox" disabled ${task.done ? 'checked' : ''} aria-label="是否完成"><div class="main-read-text-box">${escapeHtml(task.text)}</div><span aria-hidden="true"></span></div>`).join('') : '<p>还没有待办事项。</p>'}</div><div class="main-task-add-space" aria-hidden="true"></div></div>`);
  } else parts.push(`<div class="field full main-origin-field"><label>来源</label><div class="main-read-text-box">${escapeHtml(entry.origin || "")}</div></div>`);
  return `<div class="main-card-secondary main-card-fields">${parts.join("")}</div>`;
}

function canvasAttachmentsFor(entry,snapshot){
  return snapshot?.attachments || (entry.assetId ? [{id:entry.assetId,name:entry.fileName || entry.title,category:entry.assetCategory,extension:entry.fileExtension,size:entry.fileSize,width:entry.mediaWidth,height:entry.mediaHeight,durationSeconds:entry.durationSeconds,relativePath:entry.assetPath}] : []);
}
function mainReferenceChipHtml(ref,field=null){
  const remove=field?`<button type="button" class="ref-remove" data-remove-ref="${escapeHtml(ref.id)}" data-ref-field="${field}" aria-label="移除${escapeHtml(ref.title)}">×</button>`:'<span class="ref-remove-space" aria-hidden="true"></span>';
  return `<span class="ref-chip type-chip type-chip--${escapeHtml(ref.type)} ${ref.type==='area'?'area-chip':'content-chip'}"><button type="button" class="ref-open" data-open-ref="${escapeHtml(ref.id)}"><small>${escapeHtml(typeLabel(ref.type))}</small><span class="ref-title">${escapeHtml(ref.title)}</span></button>${remove}</span>`;
}

function mainReadExtrasHtml(entry) {
  const parts=[];
  if(entry.type === "project") {
    const reviews=WorkbenchRelations.groups(state,entry).reviews;
    if(reviews.length) parts.push(`<div class="relationship-groups">${relationGroupHtml("项目复盘",reviews)}</div>`);
  }
  if(entry.type === "project" && !entry.deletedAt) parts.push('<button type="button" class="secondary" data-main-project-review>写项目复盘</button>');
  return parts.length ? `<div class="main-card-secondary">${parts.join("")}</div>` : "";
}

function mainEditFieldsHtml(entry) {
  const parts=[];
  if(entry.type === "project") {
    parts.push(fieldHtml(schemas.project.fields.find(field=>field[0]==="goal"),entry.goal || ""));
    parts.push(fieldHtml(schemas.project.fields.find(field=>field[0]==="tasks"),entry.tasks || []));
  } else {
    parts.push(fieldHtml(schemas[entry.type].fields.find(field=>field[0]==="origin"),entry.origin || "").replace('class="field full"','class="field full main-origin-field"'));
  }
  return `<div class="main-card-secondary main-card-fields">${parts.join("")}</div>`;
}

function mainEditExtrasHtml(entry) {
  const parts=[];
  const stored=entry.id ? entryById(entry.id) : null;
  if(stored?.type === "project") {
    const reviews=WorkbenchRelations.groups(state,stored).reviews;
    if(reviews.length) parts.push(`<div class="relationship-groups">${relationGroupHtml("项目复盘",reviews)}</div>`);
  }
  if(stored && !stored.deletedAt) parts.push('<div class="main-card-extra-actions"><button type="button" data-main-return-inbox>恢复为随手记</button><button type="button" data-main-trash>移到回收站</button></div>');
  return parts.length ? `<div class="main-card-secondary">${parts.join("")}</div>` : "";
}

function mainReadBodyHtml(entry,relations) {
  const content=entry.canvasVersion === 1 || isCanvasMediaSource(entry) ? canvasFrameHtml(entry.id,"view") : `<div class="main-markdown-content">${WorkbenchCardMarkdown.render(entry.content || "")}</div>`;
  const related=mainRelationColumnsHtml(visibleMainRelations(entry,relations),ref=>mainReferenceChipHtml(ref));
  return `<div class="main-card-page"><div class="main-card-relations"><div class="ref-picker-heading"><div class="main-relation-title">关联内容</div><span class="ref-add-placeholder" aria-hidden="true"></span></div><div class="main-relation-scroll">${related}</div></div>${mainReadFieldsHtml(entry)}${entry.type === "source" ? viewerAssetHtml(entry) : ""}${content}${mainReadExtrasHtml(entry)}${canvasMediaFileHtml(entry)}${originalCaptureHtml(entry)}</div>`;
}

function mainStatusReadHtml(entry) {
  const field=schemas[entry.type].fields.find(item=>item[0] === (entry.type === "project" ? "status" : entry.type === "knowledge" ? "confidence" : "readingStatus"));
  return `<div class="main-status-control main-status-readonly"><span>${escapeHtml(field[1])}</span><span class="main-status-value status--${statusTone(entry)}">${escapeHtml(statusOf(entry))}</span></div>`;
}

function mainEditBodyHtml(entry) {
  return `<div class="main-card-page"><div class="main-card-relations">${compactRefPickerHtml("relatedRefs","project,knowledge,source",entry.relatedRefs || [],"搜索标题，添加关联内容")}</div>${mainEditFieldsHtml(entry)}${canvasFrameHtml(editingCanvasId,"edit")}<div data-cover-editor></div><input type="hidden" name="content" value="${escapeHtml(entry.content || "")}">${canvasMediaFileHtml({...entry,id:editingCanvasId},"edit")}${mainEditExtrasHtml(entry)}${originalCaptureHtml(entry)}<input type="hidden" name="type" value="${entry.type}"></div>`;
}

const canvasFrameConfigs=new WeakMap();
const canvasSnapshotRequests=new Map();
let canvasRequestSequence=0;

function canvasFrameHtml(cardId,mode) {
  return `<div class="main-canvas-region"><iframe class="main-canvas-frame" title="自由画布" src="./canvas-editor/index.html?embedded=${mode}" data-canvas-card-id="${escapeHtml(cardId)}"></iframe><button type="button" class="canvas-popout-button" data-canvas-popout title="在独立窗口查看画布" aria-label="在独立窗口查看画布">↗ 独立窗口</button></div>`;
}

const floatingCanvasWindows=new Map();
document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-canvas-popout]');
  if(!button)return;
  const frame=button.closest('.main-canvas-region').querySelector('.main-canvas-frame');
  if(frame.dataset.canvasLoaded!=='true'){toast('画布正在加载，请稍后打开');return;}
  const config=canvasFrameConfigs.get(frame);
  const key=frame.dataset.canvasCardId;
  const existing=floatingCanvasWindows.get(key);
  if(existing&&!existing.closed){existing.focus();return;}
  const popup=window.open('./canvas-window.html',`workbench-canvas-${key}`,'popup,width=1080,height=760');
  if(!popup){toast('无法打开画布窗口，请允许弹出窗口');return;}
  floatingCanvasWindows.set(key,popup);
  floatingCanvasRevisions.set(key,canvasRevisions.get(key) ?? null);
  const ready=new Promise(resolve=>{
    const receive=e=>{if(e.source===popup&&e.data?.type==='personalvault:canvas-window:ready'){window.removeEventListener('message',receive);resolve();}};
    window.addEventListener('message',receive);
  });
  try {
    const snapshot=await captureCanvas(frame);
    const linkedMedia=await canvasMediaLinks(snapshot);
    await ready;
    popup.postMessage({type:'personalvault:canvas-window:init',key,title:config?.entry?.title||'自由画布',mode:frame.closest('#editorDialog')?'edit':'view',editable:!config?.entry?.deletedAt,snapshot,linkedMedia},location.origin==='null'?'*':location.origin);
  } catch(error){popup.close();floatingCanvasWindows.delete(key);toast(`打开画布失败：${error.message}`);}
});
window.addEventListener('beforeunload',()=>{for(const popup of floatingCanvasWindows.values())if(!popup.closed)popup.close();});

function beginFloatingCanvasEdit(key) {
  return Boolean(floatingCanvasWindows.get(key));
}

function returnFloatingCanvas(key,snapshot) {
  floatingCanvasWindows.delete(key);
}

async function confirmFloatingCanvas(key,snapshot) {
  if(!floatingCanvasWindows.get(key))throw new Error('画布窗口已断开');
  const stored=await loadCanvasDocument(key);
  if(stored?.coverAssetId)snapshot.coverAssetId=stored.coverAssetId;
  if(stored?.customCoverId)snapshot.customCoverId=stored.customCoverId;
  const entry=entryById(key);
  if(!entry)throw new Error('卡片已不存在');
  const updated={...entry,content:snapshot.text,canvasVersion:1,updatedAt:WorkbenchData.isoNow()};
  const result=await commitUnifiedState({...state,entries:state.entries.map(card=>card.id===key?updated:card)},'画布修改已保存',{canvasDocuments:{[key]:{...snapshot,baseRevision:floatingCanvasRevisions.get(key) ?? null}}});
  const normalized=result.canvasDocuments[key];
  canvasRevisions.set(key,normalized.revision);floatingCanvasRevisions.set(key,normalized.revision);
  const linkedMedia=await canvasMediaLinks(normalized);
  cardCoverDataCache.clear();canvasSummaryCache.clear();
  const old=[...document.querySelectorAll('dialog[open] .main-canvas-frame')].find(frame=>frame.dataset.canvasCardId===key);
  if(!old)return {snapshot:normalized,linkedMedia};
  const config=canvasFrameConfigs.get(old);
  const frame=old.cloneNode();
  frame.src=`./canvas-editor/index.html?embedded=${old.closest('#editorDialog')?'edit':'view'}`;
  delete frame.dataset.canvasLoaded;
  delete frame.dataset.floatingCanvasChanged;
  old.replaceWith(frame);
  mountCanvasFrame(frame,entry||config.entry,normalized);
  return {snapshot:normalized,linkedMedia};
}

async function loadCanvasDocument(cardId) {
  let snapshot;
  if(window.workbenchDesktop?.loadCanvasDocument)snapshot=await window.workbenchDesktop.loadCanvasDocument(cardId);
  else {
    const response=await fetch('/api/canvas/'+encodeURIComponent(cardId),{cache:'no-store'});
    if(!response.ok)throw new Error('读取画布失败：'+response.status);
    snapshot=(await response.json()).snapshot;
  }
  // Background cover/summary reads must not advance an editor's save baseline.
  if(!canvasRevisions.has(cardId))canvasRevisions.set(cardId,snapshot?.revision ?? null);
  return snapshot;
}

async function acceptSavedCanvas(cardId,result) {
  const snapshot=result.canvasDocuments?.[cardId];
  if(!snapshot)return;
  canvasRevisions.set(cardId,snapshot.revision);
  cardCoverDataCache.clear();canvasSummaryCache.clear();
  const frame=$('#editorDialog .main-canvas-frame');
  const config=canvasFrameConfigs.get(frame);
  if(config)config.snapshot=snapshot;
  if(frame)await notifyCanvasSaved(frame,snapshot).catch(error=>console.warn('画布已保存，但界面刷新失败',error));
}

function syncPrimaryAttachment(entry,snapshot) {
  const asset=snapshot.attachments?.find(asset=>asset.id===snapshot.primaryAssetId);
  if(entry.assetId)assetPresentationCache.delete(entry.assetId);
  if(asset)assetPresentationCache.delete(asset.id);
  Object.assign(entry,{assetId:asset?.id || null,assetPath:asset?.relativePath || '',assetPortable:Boolean(asset?.relativePath),fileName:asset?.name || '',assetCategory:asset?.category || '',fileExtension:asset?.extension || '',fileSize:asset?.size || 0,mediaWidth:asset?.width || null,mediaHeight:asset?.height || null,durationSeconds:asset?.durationSeconds || null});
}

async function canvasMediaLinks(snapshot,primaryId){
  const links={};const ids=new Set(Object.values(snapshot?.linkedAssets||{}));if(primaryId)ids.add(primaryId);
  await Promise.all([...ids].map(async id=>{
    if(snapshot?.attachments?.find(asset=>asset.id===id)?.missing){links[id]=null;return;}
    try{links[id]=window.workbenchDesktop?.getCanvasMediaUrl?await window.workbenchDesktop.getCanvasMediaUrl(id):'/api/canvas-file/'+encodeURIComponent(id);}catch{links[id]=null;}
  }));return links;
}
async function notifyCanvasSaved(frame,snapshot){frame.contentWindow.postMessage({type:'personalvault:canvas:saved',snapshot,linkedMedia:await canvasMediaLinks(snapshot)},'*');}
function blobDataUrl(blob) {
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result);
    reader.onerror=()=>reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function legacyCanvasHtml(entry) {
  const container=document.createElement("div");
  container.innerHTML=WorkbenchCardMarkdown.render(entry.content || "");
  await hydrateEmbeddedImages(container);
  let missingImages=0;
  await Promise.all([...container.querySelectorAll("img")].map(async image=>{
    try {
      if (image.dataset.assetId && window.workbenchDesktop?.getCanvasImageDataUrl) {
        image.src=await window.workbenchDesktop.getCanvasImageDataUrl(image.dataset.assetId);
        return;
      }
      if (!image.src) throw new Error("图片源不可用");
      image.src=await blobDataUrl(await (await fetch(image.src)).blob());
    } catch (error) { missingImages++;console.warn("画布迁移图片读取失败",error); }
  }));
  return {html:container.innerHTML,missingImages};
}

function mountCanvasFrame(frame,entry,overrideSnapshot=null) {
  if (!frame) return;
  const snapshot=canvasFrameConfigs.get(frame)?.snapshot;
  const config={entry,overrideSnapshot,snapshot};
  // Read the document while the editor bundle is starting up.
  config.initialDocument=overrideSnapshot?Promise.resolve(overrideSnapshot):snapshot?Promise.resolve(snapshot):entry.canvasVersion===1?loadCanvasDocument(entry.id):Promise.resolve(null);
  config.initialDocument.catch(()=>{});
  canvasFrameConfigs.set(frame,config);
}

function reusableCanvasFrame(dialog) {
  const frame=dialog.querySelector('.main-canvas-frame');
  return frame?.dataset.canvasLoaded==='true' && frame.contentWindow?.WorkbenchCanvas && Element.prototype.moveBefore ? frame : null;
}

function transferCanvasFrame(frame,placeholder,mode,discard=false) {
  if (!frame || !placeholder || !Element.prototype.moveBefore) return false;
  if(discard && frame.dataset.floatingCanvasChanged==='true')return false;
  placeholder.parentElement.moveBefore(frame,placeholder);
  placeholder.remove();
  frame.contentWindow.WorkbenchCanvas.setMode(mode,{discard});
  return true;
}

async function canvasAttachmentAssetId(cardId,sourceId,hint) {
  const snapshot=await loadCanvasDocument(cardId);
  return snapshot?.linkedAssets?.[sourceId] || (hint && snapshot?.attachments?.some(asset=>asset.id===hint) ? hint : null);
}
async function canvasAttachmentAction(cardId,sourceId,hint,action) {
  if(!['open','reveal'].includes(action))return;
  const assetId=await canvasAttachmentAssetId(cardId,sourceId,hint);
  if(assetId)await useAssetAction(action,assetId);else toast('请先保存附件');
}

window.addEventListener("message",async event=>{
  const frame=[...document.querySelectorAll(".main-canvas-frame")].find(item=>item.contentWindow===event.source);
  if (!frame || !event.data?.type?.startsWith("personalvault:canvas:")) return;
  if(event.data.type==='personalvault:canvas:attachment-menu'){
    let available=false;
    try{available=Boolean(await canvasAttachmentAssetId(frame.dataset.canvasCardId,event.data.sourceId,event.data.assetId));}catch(error){console.warn(error);}
    frame.contentWindow.postMessage({type:'personalvault:canvas:attachment-menu-result',requestId:event.data.requestId,available},'*');
  }
  if(event.data.type==='personalvault:canvas:attachment-action'){
    try{await canvasAttachmentAction(frame.dataset.canvasCardId,event.data.sourceId,event.data.assetId,event.data.action);}catch(error){toast('文件操作失败：'+error.message);}
  }
  if(event.data.type==='personalvault:canvas:attachments-changed'&&frame.closest('#editorDialog')){
    void renderCanvasAttachments(frame,event.data.attachments||[]);
    const config=canvasFrameConfigs.get(frame);
    if(config)void mountCoverPicker(frame,config.entry,config.snapshot,event.data.attachments||[]);
  }
  if (event.data.type==="personalvault:canvas:ready") {
    const config=canvasFrameConfigs.get(frame);
    if (!config) return;
    try {
      const snapshot=await config.initialDocument;
      config.snapshot=snapshot;
      if(config.entry.canvasVersion===1 && !snapshot) throw new Error("卡片画布文件缺失，已停止覆盖保存");
      void renderCanvasAttachments(frame,canvasAttachmentsFor(config.entry,snapshot));
      const legacy=snapshot ? {html:"",missingImages:0} : await legacyCanvasHtml(config.entry);
      if(frame.closest('#editorDialog'))void mountCoverPicker(frame,config.entry,snapshot);
      frame.dataset.canvasMigrationIncomplete=String(legacy.missingImages>0);
      if(legacy.missingImages) toast("有旧图片未能导入画布，请在桌面版中打开这张卡片");
      const primaryId=snapshot ? snapshot.primaryAssetId : isCanvasMediaSource(config.entry) ? config.entry.assetId : null;
      const linkedMedia=await canvasMediaLinks(snapshot,primaryId);
      frame.contentWindow.postMessage({type:"personalvault:canvas:init",cardId:config.entry.id,snapshot,legacyHtml:legacy.html,linkedMedia,
        primaryMedia:primaryId ? {assetId:primaryId,name:config.entry.fileName || config.entry.title} : null},"*");
    } catch (error) {
      console.error(error);
      frame.dataset.canvasMigrationIncomplete="true";
      frame.contentWindow.postMessage({type:"personalvault:canvas:init",snapshot:null,legacyHtml:WorkbenchCardMarkdown.render(config.entry.content || "")},"*");
      toast(`画布加载失败：${error.message}`);
    }
  }
  if (event.data.type==="personalvault:canvas:loaded") {
    frame.dataset.canvasLoaded="true";
    void finishCanvasModeSwitch(frame);
  }
  if (event.data.type==="personalvault:canvas:migration-error") {
    frame.dataset.canvasMigrationIncomplete="true";
    toast("旧图片未能完整导入画布，已阻止覆盖保存");
  }
  if (event.data.type==="personalvault:canvas:snapshot-result") {
    const pending=canvasSnapshotRequests.get(event.data.requestId);
    if (!pending) return;
    canvasSnapshotRequests.delete(event.data.requestId);
    clearTimeout(pending.timeout);
    if (event.data.error) pending.reject(new Error(event.data.error));
    else pending.resolve(event.data.snapshot);
  }
});

document.addEventListener('click',event=>{
  const button=event.target.closest('[data-insert-canvas-attachment]');
  if(!button)return;
  const frame=button.closest('.main-card-page')?.querySelector('.main-canvas-frame');
  if(!frame?.closest('#editorDialog')||frame.dataset.canvasLoaded!=='true'){toast('画布正在加载，请稍后插入附件');return;}
  frame.contentWindow.document.getElementById('choose-media')?.click();
});

document.addEventListener('click',event=>{
  const button=event.target.closest('[data-insert-canvas-attachment]');
  if(!button)return;
  const frame=button.closest('.main-card-page')?.querySelector('.main-canvas-frame');
  if(!frame?.closest('#editorDialog')||frame.dataset.canvasLoaded!=='true'){toast('画布正在加载，请稍后插入附件');return;}
  frame.contentWindow.document.getElementById('choose-media')?.click();
});

function captureCanvas(frame) {
  if (!frame?.contentWindow) return Promise.reject(new Error("画布尚未加载"));
  if (frame.dataset.canvasLoaded!=="true") return Promise.reject(new Error("画布正在加载，请稍后保存"));
  const requestId=++canvasRequestSequence;
  return new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{canvasSnapshotRequests.delete(requestId);reject(new Error("画布保存超时"));},60000);
    canvasSnapshotRequests.set(requestId,{resolve,reject,timeout});
    frame.contentWindow.postMessage({type:"personalvault:canvas:snapshot",requestId},"*");
  });
}

function fitMainContentInput() {
  const editor=$("#editorDialog .main-rich-editor");
  if (!editor || !$("#editorDialog").open) return;
  editor.style.minHeight=`${Math.max(300,$("#formFields").clientHeight-70)}px`;
}

function fitMainCanvasFrame(frame) {
  if(frame)frame.style.height='480px';
}

function fitMainCanvasFrames() {
  $$(".main-card-shell .main-canvas-frame").forEach(fitMainCanvasFrame);
}

function fitProjectTextFields() {
  if (!$("#editorDialog").open) return;
  $$("#editorDialog .main-card-secondary textarea, #editorDialog .task-editor-row textarea[data-task-text]").forEach(textarea=>{
    textarea.style.height="0px";
    textarea.style.height=`${Math.max(textarea.hasAttribute("data-task-text") ? 42 : 46,textarea.scrollHeight+2)}px`;
  });
  fitMainCanvasFrames();
}

const cleanupViewerMedia = window.WorkbenchMedia.bindDialogCleanup($("#viewerDialog"));

function closeViewerDialog() {
  areaGraphController?.destroy();
  areaGraphController = null;
  cleanupViewerMedia();
  const dialog = $("#viewerDialog");
  if (dialog.open) dialog.close();
}

function cardDialogBounds() {
  const titlebar = document.body.classList.contains("desktop-shell") ? document.querySelector(".desktop-titlebar") : null;
  return WorkbenchDialogResize.viewportBounds(window.innerWidth,window.innerHeight,titlebar?.getBoundingClientRect().height || 0);
}

function setCardDialogRect(dialog,rect) {
  dialog.style.left = `${rect.left}px`;
  dialog.style.top = `${rect.top}px`;
  dialog.style.width = `${rect.width}px`;
  dialog.style.height = `${rect.height}px`;
  dialog.style.transform = "none";
}

function usePreferredCardDialogSize(dialog,{ reset=false }={}) {
  if(standaloneCardId){setCardDialogRect(dialog,{left:0,top:0,width:innerWidth,height:innerHeight});return;}
  const type=dialog.dataset.dialogSize;
  if (window.innerWidth <= WorkbenchDialogResize.NARROW_WIDTH) {
    dialog.classList.add("card-dialog--narrow");
    ["left","top","width","height","transform"].forEach(name=>{dialog.style[name]="";});
    return;
  }
  dialog.classList.remove("card-dialog--narrow");
  const bounds=cardDialogBounds();
  const size=reset ? WorkbenchDialogResize.defaultSize(type,bounds) : WorkbenchDialogResize.readSize(type,localStorage) || WorkbenchDialogResize.defaultSize(type,bounds);
  setCardDialogRect(dialog,WorkbenchDialogResize.centerRect(type,size,bounds));
}

function fitOpenCardDialogs() {
  if(standaloneCardId){$$('.card-resizable[open]').forEach(dialog=>usePreferredCardDialogSize(dialog));return;}
  $$(".card-resizable[open]").forEach(dialog=>{
    if (window.innerWidth <= WorkbenchDialogResize.NARROW_WIDTH || dialog.classList.contains("card-dialog--narrow")) {
      usePreferredCardDialogSize(dialog);
      return;
    }
    const current=dialog.getBoundingClientRect();
    setCardDialogRect(dialog,WorkbenchDialogResize.fitRect(dialog.dataset.dialogSize,current,cardDialogBounds()));
  });
}

function startCardDialogResize(event) {
  if (event.button !== 0 || window.innerWidth <= WorkbenchDialogResize.NARROW_WIDTH) return;
  const handle=event.currentTarget;
  const dialog=handle.closest(".card-resizable");
  if (!dialog?.open) return;
  event.preventDefault();
  event.stopPropagation();
  const rect=dialog.getBoundingClientRect();
  cardResizeState={ pointerId:event.pointerId,dialog,handle,direction:handle.dataset.resizeDirection,startX:event.clientX,startY:event.clientY,rect:{left:rect.left,top:rect.top,width:rect.width,height:rect.height} };
  handle.setPointerCapture(event.pointerId);
}

function moveCardDialogResize(event) {
  if (!cardResizeState || event.pointerId !== cardResizeState.pointerId) return;
  const {dialog,direction,startX,startY,rect}=cardResizeState;
  const next=WorkbenchDialogResize.resizeRect(dialog.dataset.dialogSize,rect,direction,event.clientX-startX,event.clientY-startY,cardDialogBounds());
  setCardDialogRect(dialog,next);
}

function stopCardDialogResize(event) {
  if (!cardResizeState || event.pointerId !== cardResizeState.pointerId) return;
  const {dialog,handle}=cardResizeState;
  cardResizeState=null;
  if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
  if (dialog.open && window.innerWidth > WorkbenchDialogResize.NARROW_WIDTH) {
    const rect=dialog.getBoundingClientRect();
    WorkbenchDialogResize.saveSize(dialog.dataset.dialogSize,rect,localStorage);
  }
}

function openViewer(entry,{ transferRect=null, scrollTop=0, canvasFrame=null, discardCanvas=false }={}) {
  if (!entry) return;
  recordVisit(entry);
  if(!standaloneCardId){
    if(window.workbenchDesktop?.openCardWindow){void window.workbenchDesktop.openCardWindow(entry.id).catch(error=>toast(error.message));return;}
    const url=new URL(location.href);url.searchParams.set('card',entry.id);
    const cardWindow=window.open(url.href,`workbench-card-${entry.id}`,'popup,width=820,height=820,resizable=yes');
    if(cardWindow){cardWindow.focus();return;}
  }
  if(standaloneCardId)document.title=entry.title || '卡片';
  cleanupViewerMedia();
  areaGraphController?.destroy();
  areaGraphController = null;
  viewedEntryId = entry.id;
  const mainCard=WorkbenchCardV2.MAIN_TYPES.has(entry.type);
  const dialog = $("#viewerDialog");
  dialog.classList.toggle("card-mode-switch",Boolean(transferRect));
  dialog.classList.toggle("main-card-shell",mainCard);
  dialog.classList.toggle("area-card-shell",entry.type === "area");
  $("#viewerKicker").textContent = mainCard ? "" : `${typeLabel(entry.type)} · 阅读`;
  $("#viewerKicker").classList.toggle("hidden",mainCard);
  $("#viewerMeta").classList.toggle("hidden",!mainCard);
  $("#viewerMainInfo").classList.toggle("hidden",!mainCard);
  $("#viewerMainRelations").classList.add("hidden");
  $("#viewerMarkdownToolbar").classList.add("hidden");
  $("#editViewedEntryTop").classList.add("hidden");
  $("#viewerTitle").textContent = entry.title;
  $("#viewerTitle").title = `${typeLabel(entry.type)} · ${entry.title}`;
  if (mainCard) {
    const relations=WorkbenchRelations.groups(state,entry);
    $("#viewerMeta").innerHTML=mainMetaHtml(entry);
    $("#viewerMainInfo").innerHTML=`<div class="main-area-chips">${relations.areas.map(ref=>mainReferenceChipHtml(ref)).join("")}</div>${mainStatusReadHtml(entry)}`;
    $("#viewerMarkdownToolbar").innerHTML="";
    $("#viewerBody").innerHTML=mainReadBodyHtml(entry,relations);
    const reusedCanvas=transferCanvasFrame(canvasFrame,$("#viewerBody .main-canvas-frame"),'view',discardCanvas);
    if(reusedCanvas){
      const config=canvasFrameConfigs.get(canvasFrame);
      const snapshot=config?.snapshot ?? config?.initialDocument ?? loadCanvasDocument(entry.id);
      void Promise.resolve(snapshot).then(snapshot=>{
        if(canvasFrame.closest('#viewerDialog')!==dialog||!dialog.open||viewedEntryId!==entry.id)return;
        void renderCanvasAttachments(canvasFrame,canvasAttachmentsFor(entry,snapshot));
      }).catch(error=>console.warn('附件信息读取失败',error));
    }
    if(entry.canvasVersion!==1 && !isCanvasMediaSource(entry)) normalizeImageRows($("#viewerBody .main-markdown-content"));
    hydrateEmbeddedImages($("#viewerBody"));
    if(entry.canvasVersion===1 || isCanvasMediaSource(entry)) mountCanvasFrame($("#viewerBody .main-canvas-frame"),entry);
  } else {
    const relationships = entry.type === "area" ? "" : relationshipGroupsHtml(entry);
    $("#viewerBody").innerHTML = groupedViewerHtml(entry.type,entry)
      + (entry.type === "area" ? areaGraphHtml(entry) : "")
      + (relationships ? `<section class="viewer-section viewer-relationships"><h3>关系</h3><div class="relationship-groups">${relationships}</div></section>` : "")
      + viewerAssetHtml(entry);
  }
  $("#editViewedEntry").classList.toggle("hidden",Boolean(entry.deletedAt));
  $("#startProjectReview").classList.toggle("hidden",entry.type !== "project" || Boolean(entry.deletedAt));
  if (!dialog.open) {
    if (transferRect && window.innerWidth > WorkbenchDialogResize.NARROW_WIDTH) setCardDialogRect(dialog,WorkbenchDialogResize.fitRect("viewer",transferRect,cardDialogBounds()));
    else usePreferredCardDialogSize(dialog);
    dialog.showModal();
  }
  if(mainCard) fitMainCanvasFrame(dialog.querySelector(".main-canvas-frame"));
  dialog.querySelector(".viewer-body").scrollTop = scrollTop;
  requestAnimationFrame(() => {
    if (dialog.open && viewedEntryId === entry.id) {
      if(mainCard) fitMainCanvasFrame(dialog.querySelector(".main-canvas-frame"));
      dialog.querySelector(".viewer-body").scrollTop = scrollTop;
    }
  });
  if (entry.type === "area") {
    areaGraphController = WorkbenchGraphCanvas.createGraphCanvas($("#areaRelationCanvas"),{
      storage:null,
      onSelect(node){ if(node && node.id !== entry.id) openReferenced(node.id); }
    });
    areaGraphController.setGraph(areaRelationshipGraph(entry));
    $("#resetAreaGraph").addEventListener("click",()=>areaGraphController?.resetView());
  }
  hydrateAssetPresentations([entry]);
}

function openEditor(type, entry=null, preset={}, options={}) {
  if(entry)recordVisit(entry);
  if(!standaloneCardId){
    if(window.workbenchDesktop?.openCardWindow){void window.workbenchDesktop.openCardWindow(entry?.id||'new',{type,preset,edit:true}).catch(error=>toast(error.message));return;}
    const url=new URL(location.href);url.searchParams.set('card',entry?.id||'new');url.searchParams.set('type',type);url.searchParams.set('preset',JSON.stringify(preset));url.searchParams.set('edit','1');
    const child=window.open(url.href,`workbench-card-${entry?.id||'new-'+type}`,'popup,width=820,height=820,resizable=yes');if(child){child.focus();return;}
  }
  const schema = schemas[type];
  if (!schema) return;
  $("#richColorPalette").classList.add("hidden");
  hideRichImageControls();
  const model = { ...preset, ...(entry||{}) };
  editingId = entry?.id || null;
  editingCoverSelection = null;
  editingCustomCover = null;
  editingCustomCoverUpload = null;
  editingCustomCoverRequest = null;
  editingCanvasId = WorkbenchCardV2.MAIN_TYPES.has(type) ? (entry?.id || crypto.randomUUID()) : null;
  editorReturnEntryId = options.returnEntryId || (options.returnToViewer && entry ? entry.id : null);
  editingRefs = {};
  editingRemovedRelations = new Set();
  editingTasks = (model.tasks || []).map(task => ({ ...task }));
  const mainCard=WorkbenchCardV2.MAIN_TYPES.has(type);
  const inTrash=Boolean(entry?.deletedAt);
  const dialog = $("#editorDialog");
  dialog.classList.toggle("card-mode-switch",Boolean(options.returnToViewer || options.transferRect));
  cancelCanvasModeSwitch();
  dialog.classList.toggle("card-canvas-loading",Boolean(options.waitForCanvas));
  dialog.classList.toggle("main-card-shell",mainCard);
  dialog.classList.toggle("main-card-trash",mainCard && inTrash);
  dialog.dataset.dialogSize=mainCard ? "viewer" : "editor";
  $("#formKicker").textContent = mainCard ? "" : entry ? `编辑 · ${schema.kicker}` : schema.kicker;
  $("#formKicker").classList.toggle("hidden",mainCard);
  $("#formMeta").classList.toggle("hidden",!mainCard);
  $("#editorMainInfo").classList.toggle("hidden",!mainCard);
  $("#editorMainRelations").classList.add("hidden");
  $("#editorMarkdownToolbar").classList.add("hidden");
  $("#mainCancelTop").classList.add("hidden");
  $("#mainSaveTop").classList.add("hidden");
  $("#mainTitleInput").classList.toggle("hidden",!mainCard);
  $("#mainTitleInput").disabled=!mainCard;
  $("#formTitle").classList.toggle("hidden",mainCard);
  $("#formTitle").textContent = entry ? entry.title : schema.title;
  $("#formTitle").title = $("#formTitle").textContent;
  if(mainCard) {
    $("#formMeta").innerHTML=mainMetaHtml({ ...model,type });
    $("#mainTitleInput").value=model.title || "";
    $("#mainTitleInput").placeholder="卡片标题";
    $("#editorMainInfo").innerHTML=`${compactRefPickerHtml("areaRefs","area",model.areaRefs || [],"+ 添加领域")}${mainStatusSelectHtml({ ...model,type })}`;
    $("#editorMarkdownToolbar").innerHTML="";
  }
  const conversion = type === "capture" && entry && !entry.deletedAt
    ? `<div class="field full conversion-box"><label>这条随手记应该去哪里？</label><p>标题、来源和原始内容都会保留，并打开对应模板继续整理。</p><div><button type="button" data-convert="project">转为项目</button><button type="button" data-convert="knowledge">转为知识</button><button type="button" data-convert="source">转为资料</button></div></div>`
    : entry && !entry.deletedAt && ["project","knowledge","source"].includes(type)
      ? `<div class="field full conversion-box subtle"><label>分类错了吗？</label><p>可以恢复为随手记。当前已经填写的分类字段会被保留，以后再次转回来时仍然存在。</p><div><button type="button" data-return-inbox>恢复为随手记</button></div></div>`
      : "";
  const assetPanel = entry?.assetId
    ? `<section class="asset-panel"><h3>本地文件</h3><p>${escapeHtml(entry.assetPath || entry.fileName || "文件位置待确认")}</p><div class="asset-meta"><span>${escapeHtml(entry.assetCategory || "其他")}</span><span>${escapeHtml(entry.fileExtension || "未知格式")}</span><span>${formatBytes(entry.fileSize || 0)}</span>${entry.mediaWidth ? `<span>${entry.mediaWidth} × ${entry.mediaHeight}</span>` : ""}${entry.durationSeconds ? `<span>${formatDuration(entry.durationSeconds)}</span>` : ""}<span>${entry.assetPortable ? "随知识库移动" : "保留在原路径"}</span></div><div class="asset-panel-actions"><button type="button" data-open-asset="${escapeHtml(entry.assetId)}">打开文件</button><button type="button" data-reveal-asset="${escapeHtml(entry.assetId)}">在文件夹中显示</button><button type="button" data-relink-asset="${escapeHtml(entry.assetId)}">重新关联</button></div></section>`
    : "";
  $("#formFields").innerHTML = mainCard
    ? mainEditBodyHtml({ ...model,type })
    : groupedFieldsHtml(type,model,assetPanel) + relationshipOverviewHtml(entry) + (type === "source" ? "" : assetPanel) + conversion + originalCaptureHtml(model) + `<input type="hidden" name="type" value="${type}">`;
  const reusedCanvas=transferCanvasFrame(options.canvasFrame,$("#formFields .main-canvas-frame"),'edit');
  if(reusedCanvas) editingCoverSelection=canvasFrameConfigs.get(options.canvasFrame)?.snapshot?.coverAssetId || null;
  $("#deleteEntry").classList.toggle("hidden", !entry || inTrash);
  $("#restoreEntry").classList.toggle("hidden", !inTrash);
  $("#permanentDelete").classList.toggle("hidden", !inTrash);
  $("#saveEntry").classList.toggle("hidden", inTrash);
  $("#saveEntry").textContent=entry ? "保存" : "完成";
  $("#mainSaveTop").textContent=entry ? "保存" : "完成";
  if(options.transferRect && window.innerWidth > WorkbenchDialogResize.NARROW_WIDTH) setCardDialogRect(dialog,WorkbenchDialogResize.fitRect(dialog.dataset.dialogSize,options.transferRect,cardDialogBounds()));
  else usePreferredCardDialogSize(dialog);
  dialog.showModal();
  if(mainCard && entry) dialog.focus({preventScroll:true});
  if(options.waitForCanvas) {
    const frame=dialog.querySelector('.main-canvas-frame');
    const pending={frame,timeout:null};
    canvasModeSwitch=pending;
    pending.timeout=setTimeout(()=>{
      if(canvasModeSwitch!==pending) return;
      dialog.close();
      cancelCanvasModeSwitch();
      toast('编辑画布加载超时，请重试');
    },30000);
  }
  if(mainCard) mountCanvasFrame($("#formFields .main-canvas-frame"),{...model,type},options.canvasSnapshot || null);
  if(reusedCanvas) {
    const frame=$("#formFields .main-canvas-frame");
    void loadCanvasDocument(entry.id).then(snapshot=>{
      if(!frame.isConnected || !dialog.open || editingCanvasId!==entry.id) return;
      void renderCanvasAttachments(frame,canvasAttachmentsFor(entry,snapshot));
      void mountCoverPicker(frame,entry,snapshot);
    }).catch(error=>console.warn('附件信息读取失败',error));
  }
  renderAllSelectedRefs();
  renderTaskEditor();
  if(mainCard) fitMainCanvasFrame(dialog.querySelector(".main-canvas-frame"));
  $("#formFields").scrollTop=options.scrollTop || 0;
  if(mainCard) requestAnimationFrame(()=>{
    fitMainContentInput();fitProjectTextFields();
    $("#formFields").scrollTop=options.scrollTop || 0;
  });
  if(!mainCard || !entry) setTimeout(() => {
    if(dialog.open) (mainCard ? $("#mainTitleInput") : $("#formFields input, #formFields textarea"))?.focus({preventScroll:true});
  },50);
}

function startDialogDrag(event) {
  if(standaloneCardId)return;
  if (event.button !== 0 || window.innerWidth <= WorkbenchDialogResize.NARROW_WIDTH || event.target.closest("button, input, select, textarea, [data-resize-direction]")) return;
  const dialog = event.currentTarget.closest("dialog");
  if (!dialog) return;
  const rect = dialog.getBoundingClientRect();
  dialog.style.left = `${rect.left}px`;
  dialog.style.top = `${rect.top}px`;
  dialog.style.transform = "none";
  dragState = { pointerId:event.pointerId, dialog, offsetX:event.clientX-rect.left, offsetY:event.clientY-rect.top };
  event.currentTarget.setPointerCapture?.(event.pointerId);
}

function moveDialog(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  const dialog = dragState.dialog;
  const rect = dialog.getBoundingClientRect();
  const bounds=cardDialogBounds();
  const left = Math.min(bounds.right-rect.width,Math.max(bounds.left,event.clientX-dragState.offsetX));
  const top = Math.min(bounds.bottom-rect.height,Math.max(bounds.top,event.clientY-dragState.offsetY));
  dialog.style.left = `${left}px`;
  dialog.style.top = `${top}px`;
}

function stopDialogDrag(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  dragState = null;
  event.currentTarget.releasePointerCapture?.(event.pointerId);
}

function renderAllSelectedRefs() {
  Object.keys(editingRefs).forEach(name => {
    const target = document.querySelector(`#editorDialog [data-selected-for="${name}"]`);
    if (!target) return;
    const active=editingRefs[name].map(id=>entryById(id)).filter(ref=>ref && !ref.deletedAt).map(ref=>({ref,active:true}));
    const stored=editingId ? entryById(editingId) : null;
    const passive=name === "relatedRefs" && stored ? (()=>{const groups=WorkbenchRelations.groups(state,stored),byId=new Map();[...groups.incoming,...groups.outgoing.filter(item=>item.bidirectional),...groups.evidence].forEach(item=>{const ref=item.entry || item;byId.set(ref.id,ref);});return [...byId.values()];})().filter(ref=>!editingRefs.relatedRefs.includes(ref.id)).map(ref=>({ref,active:false})) : [];
    const items=[...active,...passive].filter(({ref})=>name!=="relatedRefs"||!editingRemovedRelations.has(ref.id));
    const chip=({ref})=>mainReferenceChipHtml(ref,name);
    target.innerHTML=name==="relatedRefs" ? mainRelationColumnsHtml(items,chip) : items.map(chip).join("");
  });
  const overview = document.querySelector("#editorDialog .relationship-overview .relationship-groups");
  const stored = editingId ? entryById(editingId) : null;
  if (overview && stored) {
    const groups = relationshipGroupsHtml({ ...stored, ...editingRefs });
    overview.innerHTML = groups || `<p class="empty-relations">尚未建立领域或内容关联</p>`;
  }
  requestAnimationFrame(fitMainCanvasFrames);
}

function renderTaskEditor() {
  const target = document.querySelector("#editorDialog .task-editor-list");
  if (!target) return;
  target.innerHTML = editingTasks.length
    ? editingTasks.map((task,index) => `<div class="task-editor-row" data-task-index="${index}"><input type="checkbox" ${task.done ? "checked" : ""} aria-label="是否完成"><textarea rows="1" data-task-text aria-label="待办内容">${escapeHtml(task.text)}</textarea><button type="button" data-remove-task="${index}" aria-label="删除待办">×</button></div>`).join("")
    : `<p>还没有待办</p>`;
  fitProjectTextFields();
}

function startReviewForProject(project) {
  if (!project || project.type !== "project") return;
  closeViewerDialog();
  openEditor("review",null,{ title:`${project.title} · 复盘`, projectRefs:[project.id] },{ returnEntryId:project.id });
}

function showReferenceSuggestions(input) {
  const picker = input.closest(".ref-picker");
  const types = picker.dataset.refTypes.split(",");
  const name = picker.dataset.refName;
  const query = input.value.trim().toLowerCase();
  const choices = name === "relatedRefs" ? WorkbenchRelations.selectable(state.entries,editingId,query) : state.entries.filter(e => !e.deletedAt && types.includes(e.type) && e.id !== editingId && (!query || e.title.toLowerCase().includes(query)));
  const suggestions = choices.filter(e => !editingRefs[name].includes(e.id)).slice(0,7);
  const box = picker.querySelector(".ref-suggestions");
  box.innerHTML = suggestions.length ? suggestions.map(e => `<button type="button" data-add-ref="${e.id}" data-ref-field="${name}"><b>${escapeHtml(e.title)}</b><small>${typeLabel(e.type)}</small></button>`).join("") : `<p>没有匹配的标题</p>`;
  box.classList.remove("hidden");
  picker.querySelector('.ref-popover')?.classList.remove('hidden');
  picker.querySelector('[data-toggle-ref-picker]')?.setAttribute('aria-expanded','true');
}

function closeReferencePicker(picker){
  picker.querySelector('.ref-suggestions')?.classList.add('hidden');
  picker.querySelector('.ref-popover')?.classList.add('hidden');
  picker.querySelector('[data-toggle-ref-picker]')?.setAttribute('aria-expanded','false');
}
function closeReferenceSuggestions(exceptPicker=null) {
  $$(".ref-picker").forEach(picker => {
    if (picker !== exceptPicker) closeReferencePicker(picker);
  });
}

async function saveForm(event) {
  event.preventDefault();
  const richEditor=$("#editorDialog .main-rich-editor");
  if(richEditor) { linkifyEditorUrls(richEditor); $("#editorDialog [name=content]").value=WorkbenchCardMarkdown.serializeRich(richEditor.innerHTML); }
  const data = Object.fromEntries(new FormData(event.currentTarget));
  if (!String(data.title || "").trim()) { toast("请先填写标题"); (WorkbenchCardV2.MAIN_TYPES.has(data.type) ? $("#mainTitleInput") : $("#formFields [name=title]"))?.focus(); return; }
  const existing = editingId ? entryById(editingId) : null;
  const defaults = {capture:{},area:{status:"active"},project:{status:"not_started"},review:{status:"draft"},knowledge:{confidence:"draft"},source:{readingStatus:"unread"}};
  const now = WorkbenchData.isoNow();
  const taskData = data.type === "project" ? { tasks:editingTasks.filter(task => task.text.trim()) } : {};
  const mainCard=WorkbenchCardV2.MAIN_TYPES.has(data.type);
  let pendingCanvas=null;
  if(mainCard) {
    try {
      const frame=$("#editorDialog .main-canvas-frame");
      if(frame.dataset.canvasMigrationIncomplete==="true") throw new Error("旧图片未能完整导入，请在桌面版重新打开卡片");
      if(editingCustomCoverRequest)await editingCustomCoverRequest;
      const snapshot=await captureCanvas(frame);
      delete snapshot.coverSourceId;
      if(editingCoverSelection?.startsWith('source:')) {
        const sourceId=editingCoverSelection.slice(7);
        if(Object.hasOwn(snapshot.assets,sourceId))snapshot.coverSourceId=sourceId;
        else snapshot.coverAssetId=null;
      }
      else snapshot.coverAssetId=editingCoverSelection;
      const savedCustomCover=canvasFrameConfigs.get(frame)?.snapshot?.customCoverId;
      if(savedCustomCover)snapshot.customCoverId=savedCustomCover;
      if(editingCustomCoverUpload)snapshot.customCoverUpload=editingCustomCoverUpload;
      snapshot.customCoverSelected=Boolean(editingCustomCover&&editingCoverSelection===editingCustomCover.id);
      snapshot.cardInfo={title:data.title,type:data.type};
      const configBeforeSave=canvasFrameConfigs.get(frame);
      const originalDocument=await configBeforeSave?.initialDocument;
      snapshot.baseRevision=(configBeforeSave?.snapshot || originalDocument)?.revision ?? null;
      pendingCanvas=snapshot;
      data.content=snapshot.text;
      data.canvasVersion=1;

      if(existing?.canvasVersion!==1 && existing?.content) data.legacyContent=existing.content;
    } catch(error) { console.error(error);toast("画布保存失败："+error.message);return; }
  }
  const editorRect=mainCard ? $("#editorDialog").getBoundingClientRect() : null;
  const editorScroll=mainCard ? $("#formFields").scrollTop : 0;
  const canvasFrame=mainCard ? reusableCanvasFrame($("#editorDialog")) : null;
  const entry = WorkbenchData.normalizeEntry({ ...(existing||{}), ...defaults[data.type], ...data, ...editingRefs, ...taskData, id:existing?.id || editingCanvasId || crypto.randomUUID(), deletedAt:existing?.deletedAt || null, ...(mainCard ? {structureVersion:2} : {archived:false,created:existing?.created || today(),updated:today()}), createdAt:existing?.createdAt || now, updatedAt:now });
  const reviewProject = entry.type === "review" ? entryById(entry.projectRefs?.[0]) : null;
  if(!existing) {
    try { const result=await commitUnifiedState({...state,entries:[entry,...state.entries]},'已加入知识工作台',pendingCanvas?{canvasDocuments:{[entry.id]:pendingCanvas}}:{});await acceptSavedCanvas(entry.id,result); }
    catch(error) { console.error(error);toast("卡片保存失败："+error.message);return; }
    $("#editorDialog").close();
    editorReturnEntryId=null;
    if(standaloneCardId)window.close();
    return;
  }
  const nextEntries=WorkbenchRelations.detach(state.entries.map(e=>e.id===existing.id?entry:e),entry.id,editingRemovedRelations,now);
  try {const result=await commitUnifiedState({...state,entries:nextEntries},'修改已保存',pendingCanvas?{canvasDocuments:{[entry.id]:pendingCanvas}}:{});await acceptSavedCanvas(entry.id,result);}
  catch(error){console.error(error);toast('卡片保存失败：'+error.message);return;}
  $("#editorDialog").close();
  editorReturnEntryId = null;
  if (mainCard) openViewer(entryById(entry.id)||entry,{transferRect:editorRect,scrollTop:editorScroll,canvasFrame});
  else if(standaloneCardId) openViewer(entryById(entry.id)||entry);
  else if (reviewProject) openViewer(reviewProject);
}

async function convertCapture(targetType) {
  const stored = entryById(editingId);
  const formData = Object.fromEntries(new FormData($("#editorForm")));
  const current = { ...stored, ...formData, ...editingRefs };
  if (!current || current.type !== "capture") return;
  const converted = WorkbenchData.normalizeEntry(WorkbenchCardV2.convertCapture(current,targetType,WorkbenchData.isoNow()));
  try{await commitUnifiedState({...state,entries:state.entries.map(e=>e.id===current.id?converted:e)},'分类已保存');}
  catch(error){toast('分类保存失败：'+error.message);return;}
  $("#editorDialog").close();
  openEditor(targetType,converted);
  toast(`已转为${typeLabel(targetType)}，请继续整理`);
}

async function returnToInbox() {
  const stored = entryById(editingId);
  if (!stored) return;
  const formData = Object.fromEntries(new FormData($("#editorForm")));
  const current = { ...stored, ...formData, ...editingRefs };
  const reverted = { ...current, type:"capture", lastMainType:current.type, rawContent:current.originalCapture?.content || current.content || current.goal || "", origin:current.originalCapture?.origin || current.origin || "", updated:today(), updatedAt:WorkbenchData.isoNow() };
  try{await commitUnifiedState({...state,entries:state.entries.map(e=>e.id===current.id?reverted:e)},'恢复分类已保存');}
  catch(error){toast('分类保存失败：'+error.message);return;}
  $("#editorDialog").close();
  openEditor("capture",reverted);
  toast("已恢复为随手记，原分类字段仍然保留");
}

async function openReferenced(id) {
  const entry=entryById(id);
  if(!entry)return;
  recordVisit(entry);
  if(window.workbenchDesktop?.openCardWindow){
    try { await window.workbenchDesktop.openCardWindow(id,{edit:Boolean(entry.deletedAt)}); }
    catch(error){toast(error.message);}
    return;
  }
  const url=new URL(location.href);
  ['card','edit','type','preset'].forEach(key=>url.searchParams.delete(key));
  url.searchParams.set('card',id);
  if(entry.deletedAt)url.searchParams.set('edit','1');
  const popup=window.open(url.href,'workbench-card-'+id,'popup,width=820,height=820,resizable=yes');
  if(popup)popup.focus();
  else toast('请允许弹出窗口后再打开关联卡片');
}

function exportMarkdown() {
  const sections = state.entries.map(entry => {
    const readable = {...entry};
    ["areaRefs","sourceRefs","relatedRefs","projectRefs"].forEach(key => { if (readable[key]) readable[key] = readable[key].map(id => entryById(id)?.title || id); });
    const meta = Object.entries(readable).filter(([k]) => !["rawContent","summaryText","conclusion","challenge","result","content","goal","origin","legacyContent"].includes(k)).map(([k,v]) => `${k}: ${k === "tasks" ? JSON.stringify(v) : Array.isArray(v) ? `[${v.join(", ")}]` : String(v).replace(/\n/g," ")}`).join("\n");
    const body = [entry.goal && `## 目标与场景\n\n${entry.goal}`,entry.origin && `## 来源\n\n${entry.origin}`,entry.content && `## ${entry.type === "source" ? "备注与摘要" : "内容"}\n\n${entry.content}`].filter(Boolean).join("\n\n") || entry.rawContent || entry.result || "";
    const tasks = entry.type === "project" && entry.tasks?.length ? `\n\n## 待办列表\n\n${entry.tasks.map(task => `- [${task.done ? "x" : " "}] ${task.text}`).join("\n")}` : "";
    return `---\n${meta}\n---\n\n# ${entry.title}\n\n${body}${tasks}\n`;
  });
  WorkbenchData.download(`知识工作台导出-${today()}.md`, sections.join("\n---\n\n"), "text/markdown;charset=utf-8");
  toast("Markdown 已导出");
}

let pendingImport = null;

function renderHealthReport(report, targetSelector="#dataHealthReport") {
  const target = $(targetSelector);
  if (!target) return;
  const lines = [];
  if (report.ok && !report.warnings.length) lines.push(`<div class="health-line ok">数据结构正常，没有发现重复ID或失效关联。</div>`);
  report.errors.forEach(message => lines.push(`<div class="health-line error">错误 · ${escapeHtml(message)}</div>`));
  report.warnings.slice(0,10).forEach(message => lines.push(`<div class="health-line warning">提醒 · ${escapeHtml(message)}</div>`));
  if (report.warnings.length > 10) lines.push(`<div class="health-line warning">另有 ${report.warnings.length - 10} 条提醒未展开。</div>`);
  target.innerHTML = lines.join("");
}

async function reloadVaultFromDisk() {
  if(!confirm('重新载入会放弃当前未保存修改。需要保留时，请先导出迁移包；正在编辑的卡片请先取消编辑。是否继续？'))return;
  if($('#editorDialog').open){toast('请先关闭当前编辑，再重新载入');return;}
  if(await hydrateDesktopState())toast('已从硬盘重新载入资料库');
}

async function rebuildVaultFromCards() {
  if(vaultSession.blocked){toast('请先导出未保存内容并重新载入资料库，再重建目录');return;}
  const button=$('#rebuildVault');button.disabled=true;
  try {
    let result;
    if(window.workbenchDesktop?.rebuildVault)result=await window.workbenchDesktop.rebuildVault();
    else {
      const response=await fetch('/api/vault/rebuild',{method:'POST'});
      result=await response.json();
      if(!response.ok)throw new Error(result.error || '重建失败');
    }
    await hydrateDesktopState();
    const missing=result.missingAttachments.length+result.missingCanvases.length;
    $('#vaultResult').innerHTML=`<div class="health-line ${missing?'warning':'ok'}">已从 ${result.cards} 张卡片重建汇总、卡片清单、附件查找索引和全文搜索目录。${missing?'发现 '+missing+' 项原文件或画布缺失，重建不能恢复缺失内容。':''}</div>`;
    updateDataManager();void refreshSearchIndexStatus();
    toast('数据目录已重建');
  } catch(error){$('#vaultResult').innerHTML='<div class="health-line error">'+escapeHtml(error.message)+'</div>';toast('重建失败');}
  finally {button.disabled=false;}
}

function updateDataManager() {
  const report = WorkbenchData.validateState(state);
  $("#dataSchemaVersion").textContent = `v${WorkbenchData.SCHEMA_VERSION}`;
  $("#dataEntryCount").textContent = report.stats.total;
  $("#dataReferenceCount").textContent = report.stats.references;
  renderHealthReport(report);
}

async function refreshVaultStatus() {
  const badge = $("#vaultStatusBadge");
  badge.textContent = "检查中";
  badge.className = "vault-badge checking";
  try {
    let result;
    if (window.workbenchDesktop?.isDesktop) result = await window.workbenchDesktop.vaultStatus();
    else {
      const response = await fetch("/api/vault/status", { cache:"no-store" });
      if (!response.ok) throw new Error("当前服务器不支持本地知识库写入，请用“启动知识工作台.cmd”重新启动。");
      result = await response.json();
    }
    $("#vaultPathLabel").textContent = result.path;
    badge.textContent = result.connected ? "已连接" : "未初始化";
    badge.className = `vault-badge ${result.connected ? "connected" : "disconnected"}`;
    $("#syncCardsToVault").disabled = false;
    return result;
  } catch (error) {
    $("#vaultPathLabel").textContent = error.message;
    badge.textContent = "服务未连接";
    badge.className = "vault-badge disconnected";
    $("#syncCardsToVault").disabled = true;
    return null;
  }
}

async function syncCardsToVault() {
  const report = WorkbenchData.validateState(state);
  if (!report.ok) {
    renderHealthReport(report,"#vaultResult");
    toast("请先处理数据错误");
    return;
  }
  const button = $("#syncCardsToVault");
  button.disabled = true;
  button.textContent = "正在写入…";
  try {
    let result;
    const bundle = WorkbenchData.createBundle(state);
    result=await vaultSession.save(bundle);
    state=WorkbenchData.normalizeState(result.state || state);
    cacheSavedState(state);
    const integrityNotice = result.integrity?.healthy
      ? ""
      : `<div class="health-line warning">发现 ${result.integrity?.unknownMarkdown?.length || 0} 个未登记 Markdown 和 ${result.integrity?.missingMarkdown?.length || 0} 个缺失文件；系统没有自动导入或删除，请查看同步日志。</div>`;
    $("#vaultResult").innerHTML = `<div class="health-line ok">已写入 ${result.written} 张独立卡片；目录：${escapeHtml(result.path)}</div>${integrityNotice}`;
    toast("卡片已写入移动硬盘");
    await refreshVaultStatus();
  } catch (error) {
    $("#vaultResult").innerHTML = `<div class="health-line error">${escapeHtml(error.message)}</div>`;
    toast("写入失败");
  } finally {
    button.disabled = false;
    button.textContent = "把当前卡片写入移动硬盘";
  }
}

async function refreshSearchIndexStatus() {
  const badge = $("#indexStatusBadge");
  const details = $("#indexStatusDetails");
  badge.textContent = "检查中";
  badge.className = "vault-badge checking";
  if (!window.workbenchDesktop?.searchStatus) {
    badge.textContent = "桌面版可用";
    badge.className = "vault-badge disconnected";
    details.innerHTML = `<div class="health-line warning">浏览器版继续使用临时全文筛选；SQLite 搜索目录由桌面版管理。</div>`;
    $("#rebuildSearchIndex").disabled = true;
    return null;
  }
  try {
    const result = await window.workbenchDesktop.searchStatus();
    badge.textContent = result.healthy && !result.needsRebuild ? "已就绪" : "需要重建";
    badge.className = `vault-badge ${result.healthy && !result.needsRebuild ? "connected" : "disconnected"}`;
    details.innerHTML = result.healthy
      ? `<div class="health-line ${result.needsRebuild ? "warning" : "ok"}">已索引 ${result.indexedCount} / ${result.sourceCount} 张卡片 · ${result.updatedAt ? new Date(result.updatedAt).toLocaleString("zh-CN") : "时间未知"}</div><div class="health-line">位置：${escapeHtml(result.path)}</div>`
      : `<div class="health-line warning">尚未建立搜索目录，点击“一键重建”即可生成。</div>`;
    $("#rebuildSearchIndex").disabled = false;
    return result;
  } catch (error) {
    badge.textContent = "检查失败";
    badge.className = "vault-badge disconnected";
    details.innerHTML = `<div class="health-line error">${escapeHtml(error.message)}</div>`;
    return null;
  }
}

async function rebuildDesktopSearchIndex() {
  if (!window.workbenchDesktop?.rebuildSearchIndex) return;
  const button = $("#rebuildSearchIndex");
  button.disabled = true;
  button.textContent = "正在重建…";
  try {
    const result = await window.workbenchDesktop.rebuildSearchIndex();
    toast(`已索引 ${result.cardCount} 张卡片`);
    await refreshSearchIndexStatus();
    if (currentView === "search") queueIndexedSearch(true);
  } catch (error) {
    $("#indexStatusDetails").innerHTML = `<div class="health-line error">${escapeHtml(error.message)}</div>`;
    toast("搜索目录重建失败");
  } finally {
    button.disabled = false;
    button.textContent = "一键重建搜索目录";
  }
}

async function refreshSemanticStatus() {
  const badge = $("#semanticStatusBadge");
  const details = $("#semanticStatusDetails");
  badge.textContent = "检查中";
  badge.className = "vault-badge checking";
  if (!window.workbenchDesktop?.semanticStatus) {
    badge.textContent = "桌面版可用";
    badge.className = "vault-badge disconnected";
    details.innerHTML = `<div class="health-line warning">本地语义检索只在桌面版运行。</div>`;
    $("#rebuildSemanticIndex").disabled = true;
    return null;
  }
  try {
    const preferences = semanticPreferences();
    const result = await window.workbenchDesktop.semanticStatus(preferences);
    populateSemanticModelOptions(result.availableModels,preferences.semanticModel);
    badge.textContent = result.healthy ? (result.needsRebuild ? "需要更新" : "已就绪") : "尚未建立";
    badge.className = `vault-badge ${result.healthy && !result.needsRebuild ? "connected" : "disconnected"}`;
    details.innerHTML = result.healthy
      ? `<div class="health-line ${result.needsRebuild ? "warning" : "ok"}">已向量化 ${result.indexedCount} / ${result.sourceCount} 张卡片 · ${result.dimension} 维${result.needsRebuild ? " · 卡片有更新" : ""}</div><div class="health-line">模型：${escapeHtml(result.modelLabel || result.model || "未知")} · ${escapeHtml(result.dtype || "")} · 实际使用 ${escapeHtml(result.device || "自动设备")}<br>索引：${escapeHtml(result.path)}<br>共享模型目录：${escapeHtml(result.cacheDir || "未知")}${result.deviceFallbackReason ? `<br>设备说明：加速不可用，已安全回退到 CPU。` : ""}</div>`
      : `<div class="health-line warning">${result.modelReady ? "共享模型已经准备好，尚未建立对应语义目录。" : "共享模型尚未准备；首次建立时会下载一次。"} 精确搜索仍可正常使用。</div><div class="health-line">计划模型：${escapeHtml(result.modelLabel || result.model || "未知")}<br>共享模型目录：${escapeHtml(result.cacheDir || "未知")}</div>`;
    $("#rebuildSemanticIndex").disabled = false;
    $("#rebuildSemanticIndex").textContent = result.modelReady ? "重新建立语义目录" : "准备模型并建立目录";
    return result;
  } catch (error) {
    badge.textContent = "检查失败";
    badge.className = "vault-badge disconnected";
    details.innerHTML = `<div class="health-line error">${escapeHtml(error.message)}</div>`;
    return null;
  }
}

async function rebuildDesktopSemanticIndex() {
  if (!window.workbenchDesktop?.rebuildSemanticIndex) return;
  const button = $("#rebuildSemanticIndex");
  const preferences = semanticPreferences();
  const label = $("#semanticModelSelect").selectedOptions[0]?.textContent || "所选模型";
  if (!confirm(`将准备 ${label} 并重新处理当前卡片。模型和索引保存在移动硬盘，旧索引不会被删除。是否继续？`)) return;
  button.disabled = true;
  button.textContent = "准备模型并生成中…";
  $("#semanticStatusDetails").innerHTML = `<div class="health-line warning">首次准备多语言模型可能需要几分钟；以后不会重复下载，请保持移动硬盘连接。</div>`;
  try {
    const result = await window.workbenchDesktop.rebuildSemanticIndex(preferences);
    toast(`已向量化 ${result.cardCount} 张卡片`);
    await refreshSemanticStatus();
    $("#searchModeFilter").value = "hybrid";
    if (currentView === "search") queueIndexedSearch(true);
  } catch (error) {
    $("#semanticStatusDetails").innerHTML = `<div class="health-line error">${escapeHtml(error.message)}</div>`;
    toast("语义目录建立失败");
  } finally {
    button.disabled = false;
    button.textContent = "重新建立语义目录";
  }
}

function semanticPreferences() {
  return {
    semanticModel:$("#semanticModelSelect")?.value || localStorage.getItem(SEMANTIC_MODEL_KEY) || DEFAULT_SEMANTIC_MODEL,
    semanticDevice:$("#semanticDeviceSelect")?.value || localStorage.getItem(SEMANTIC_DEVICE_KEY) || "auto"
  };
}

function populateSemanticModelOptions(models = [], selected = DEFAULT_SEMANTIC_MODEL) {
  const select = $("#semanticModelSelect");
  if (!select || !models.length) return;
  select.innerHTML = models.map(model => `<option value="${escapeHtml(model.id)}">${escapeHtml(model.label)}</option>`).join("");
  select.value = models.some(model => model.id === selected) ? selected : DEFAULT_SEMANTIC_MODEL;
}

function initializeSemanticPreferences() {
  const model = localStorage.getItem(SEMANTIC_MODEL_KEY) || DEFAULT_SEMANTIC_MODEL;
  const device = localStorage.getItem(SEMANTIC_DEVICE_KEY) || "auto";
  if ($("#semanticModelSelect")) $("#semanticModelSelect").value = model;
  if ($("#semanticDeviceSelect")) $("#semanticDeviceSelect").value = device;
}

async function saveSemanticPreferences() {
  const preferences = semanticPreferences();
  localStorage.setItem(SEMANTIC_MODEL_KEY,preferences.semanticModel);
  localStorage.setItem(SEMANTIC_DEVICE_KEY,preferences.semanticDevice);
  await refreshSemanticStatus();
  if (currentView === "search" && $("#searchInput").value.trim()) queueIndexedSearch(true);
}

function formatBytes(value) {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB","MB","GB","TB"];
  let size = bytes / 1024;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit += 1; }
  return `${size >= 10 ? size.toFixed(1) : size.toFixed(2)} ${units[unit]}`;
}

function formatDuration(value) {
  const total = Math.max(0,Math.round(Number(value) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours ? `${hours}:${String(minutes).padStart(2,"0")}:${String(seconds).padStart(2,"0")}` : `${minutes}:${String(seconds).padStart(2,"0")}`;
}

function sourceKindForAsset(asset) {
  return ({图片:"图片",视频:"视频",音频:"音频",文档:"文档",模型:"3D 模型",工程:"工程文件"})[asset.category] || "其他";
}

function entryFromAsset(asset) {
  const now = WorkbenchData.isoNow();
  const title = String(asset.displayName || asset.originalName || "未命名文件").replace(/\.[^.]+$/, "");
  return WorkbenchData.normalizeEntry({
    id:asset.ownerCardId || crypto.randomUUID(),
    type:"source",
    title,
    origin:"本地文件导入",
    sourceKind:sourceKindForAsset(asset),
    content:"",
    structureVersion:2,
    readingStatus:"unread",
    areaRefs:[],
    assetId:asset.id,
    assetPath:asset.relativePath || asset.absolutePath || "",
    assetCategory:asset.category,
    assetStorageMode:asset.storageMode,
    assetPortable:Boolean(asset.portable),
    fileName:asset.displayName,
    fileExtension:asset.extension,
    fileSize:asset.size,
    fileModifiedAt:asset.modifiedAt,
    contentHash:asset.contentHash,
    mediaWidth:asset.width || null,
    mediaHeight:asset.height || null,
    durationSeconds:asset.durationSeconds || null,
    videoCodec:asset.videoCodec || null,
    audioCodec:asset.audioCodec || null,
    createdAt:now,
    updatedAt:now,
    created:today(),
    updated:today()
  });
}

function openAssetImportDialog() {
  const desktop = Boolean(window.workbenchDesktop?.isDesktop);
  $("#assetImportResult").innerHTML = "";
  $("#assetImportAvailability").textContent = desktop ? "桌面文件能力已连接，可以安全选择真实路径。" : "当前是浏览器版本。复制、移动和原路径登记需要打开桌面版。";
  $("#assetImportAvailability").className = `health-line ${desktop ? "ok" : "warning"}`;
  $("#chooseAssetFiles").disabled = !desktop;
  $("#assetImportDialog").showModal();
}

async function chooseAndImportAssets() {
  if (!window.workbenchDesktop?.isDesktop) return;
  const mode = document.querySelector('input[name="assetMode"]:checked')?.value || "copy";
  if (mode === "move" && !confirm("“移动到知识库”会在复制并校验成功后删除原文件。确定继续吗？")) return;
  const button = $("#chooseAssetFiles");
  button.disabled = true;
  button.textContent = "正在处理文件…";
  try {
    const result = await window.workbenchDesktop.selectAndImportFiles(mode);
    if (result.canceled) return;
    await completeAssetImport(result);
  } catch (error) {
    $("#assetImportResult").innerHTML = `<div class="health-line error">${escapeHtml(error.message)}</div>`;
  } finally {
    button.disabled = false;
    button.textContent = "选择文件并导入";
  }
}

async function completeAssetImport(result) {
  const merged=WorkbenchSourceBatch.mergeImportedAssets(state.entries,result.assets,entryFromAsset);
  const nextState={ ...state,entries:merged.entries };
  await commitUnifiedState(nextState,`已导入 ${merged.createdIds.length} 个文件`);
  const created=merged.createdIds.length;
  const reused=merged.reused;
  lastImportedSourceIds=[...merged.createdIds];
  const lines = [];
  if (created) lines.push(`<div class="health-line ok">已创建 ${created} 张资料卡片，并写入移动硬盘。</div>`);
  if (reused) lines.push(`<div class="health-line warning">${reused} 个文件内容完全相同，已复用原有资产，没有重复复制。</div>`);
  if (result.skipped?.length) lines.push(`<div class="health-line warning">${result.skipped.length} 个项目未导入。</div>`);
  if (created) lines.push(`<button type="button" class="organize-imported-assets" data-organize-imported>整理刚刚导入的 ${created} 份资料</button>`);
  $("#assetImportResult").innerHTML = lines.join("") || `<div class="health-line warning">没有新增文件。</div>`;
  return { createdIds:[...merged.createdIds],reused };
}

async function useAssetAction(action, assetId) {
  if (!window.workbenchDesktop?.isDesktop) { toast("请在桌面版中使用文件操作"); return; }
  try {
    if (action === "open") await window.workbenchDesktop.openAsset(assetId);
    if (action === "reveal") await window.workbenchDesktop.revealAsset(assetId);
    if (action === "cover") {
      const result = await window.workbenchDesktop.selectAssetCover(assetId);
      if (result.canceled) return;
      assetPresentationCache.set(assetId,result.presentation);
      hydrateAssetPresentations(state.entries.filter(entry => entry.assetId === assetId));
      renderCollection();
      toast("资产封面已更新");
    }
    if (action === "reset-cover") {
      const presentation = await window.workbenchDesktop.clearAssetCover(assetId);
      assetPresentationCache.set(assetId,presentation);
      hydrateAssetPresentations(state.entries.filter(entry => entry.assetId === assetId));
      renderCollection();
      toast("已恢复自动封面");
    }
    if (action === "relink") {
      const result = await window.workbenchDesktop.relinkAsset(assetId);
      if (result.canceled) return;
      const entry = state.entries.find(item => item.assetId === assetId);
      if (entry) {
        const asset = result.asset;
        Object.assign(entry, {
          assetPath:asset.relativePath || asset.absolutePath || "",
          assetCategory:asset.category,
          assetPortable:Boolean(asset.portable),
          fileName:asset.displayName,
          fileExtension:asset.extension,
          fileSize:asset.size,
          fileModifiedAt:asset.modifiedAt,
          contentHash:asset.contentHash,
          mediaWidth:asset.width || null,
          mediaHeight:asset.height || null,
          durationSeconds:asset.durationSeconds || null,
          videoCodec:asset.videoCodec || null,
          audioCodec:asset.audioCodec || null,
          updated:today(),
          updatedAt:WorkbenchData.isoNow()
        });
        assetPresentationCache.delete(assetId);
        if(!await saveState("文件已重新关联"))return;
        const wasViewing = $("#viewerDialog").open;
        if ($("#editorDialog").open) $("#editorDialog").close();
        if (wasViewing) { closeViewerDialog(); openViewer(entry); }
        else openEditor(entry.type,entry);
      }
    }
  } catch (error) { toast(error.message); }
}

function openDataManager() {
  pendingImport = null;
  $("#importPreview").classList.add("hidden");
  $("#importBundleFile").value = "";
  updateDataManager();
  $("#dataDialog").showModal();
  void refreshAttachmentCache();
  refreshVaultStatus();
  refreshSearchIndexStatus();
  refreshSemanticStatus();
}

async function previewImport(file) {
  try {
    const parsed = WorkbenchData.readBundle(await file.text());
    for(const [id,snapshot] of Object.entries(parsed.canvasDocuments)) {
      const current=await loadCanvasDocument(id);
      snapshot.baseRevision=current?.revision ?? null;
    }
    pendingImport = parsed;
    const { report } = parsed;
    $("#importPreviewSummary").textContent = Array.isArray(parsed.changedIds)?`将恢复 ${parsed.changedIds.length} 张卡片的未保存修改；其他卡片保留硬盘当前版本。请先核对同一卡片的新内容，再确认恢复。`:`将导入 ${report.stats.total} 张卡片，其中 ${report.stats.trash} 张位于回收站。确认后写入资料库；移除现有卡片仍需永久删除记录。`;
    renderHealthReport(report,"#importPreviewIssues");
    $("#confirmImport").disabled = !report.ok;
    $("#importPreview").classList.remove("hidden");
  } catch (error) {
    pendingImport = null;
    $("#importPreview").classList.remove("hidden");
    $("#importPreviewSummary").textContent = "无法读取这个文件。";
    $("#importPreviewIssues").innerHTML = `<div class="health-line error">${escapeHtml(error.message)}</div>`;
    $("#confirmImport").disabled = true;
  }
}

async function confirmImport() {
  if (!pendingImport?.report.ok) return;
  localStorage.setItem(`${STORAGE_KEY}-pre-import`,JSON.stringify(state));
  try{await commitUnifiedState(pendingImport.state,'迁移包已导入',{canvasDocuments:pendingImport.canvasDocuments,...(Array.isArray(pendingImport.changedIds)?{changedIds:pendingImport.changedIds}:{})});}
  catch(error){toast('导入未完成：'+error.message);return;}
  pendingImport = null;
  $("#dataDialog").close();
}

function toast(message) { const el=$("#toast"); el.textContent=message; el.classList.add("show"); clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.classList.remove("show"),1800); }

$("#collectionList").addEventListener("click", event => {
  const card = event.target.closest(".entry-card, .asset-card");
  if (!card || event.target.closest("button, a, input, select, textarea")) return;
  const opener = card.querySelector(".entry-open, .asset-card-open");
  if (!opener) return;
  event.stopPropagation();
  opener.click();
});

document.addEventListener("click", event => {
  if (event.target.closest("#areaNavToggle")) {
    areaNavCollapsed = !areaNavCollapsed;
    localStorage.setItem(AREA_NAV_COLLAPSED_KEY, String(areaNavCollapsed));
    renderAreaNav();
    return;
  }
  const editImage=event.target.closest("#editorDialog .main-rich-editor img[data-asset-id]");
  if(editImage) {
    if(suppressImageClick) {suppressImageClick=false;event.preventDefault();return;}
    showRichImageControls(editImage);placeImageTextCaret(editImage);return;
  }
  if(event.target.closest("[data-rich-image-resize]")) return;
  const layoutButton=event.target.closest("[data-image-layout-option]");
  if(layoutButton) {setSelectedImageLayout(layoutButton.dataset.imageLayoutOption);return;}
  if(event.target.closest("[data-image-delete]")) {deleteSelectedEmbeddedImage();return;}
  if(!event.target.closest("#richImageControls")) hideRichImageControls();
  closeReferenceSuggestions(event.target.closest(".ref-picker"));
  if (!event.target.closest(".context-create-wrap")) $("#contextCreateMenu").classList.add("hidden");
  if (event.target.closest("#collectionCreate") && currentView === "areaDetail") {
    $("#contextCreateMenu").classList.toggle("hidden");
    return;
  }
  const batchSelect=event.target.closest("[data-source-batch-select]");
  if (batchSelect) {
    const id=batchSelect.dataset.sourceBatchSelect;
    if (selectedSourceIds.has(id)) selectedSourceIds.delete(id); else if (visibleSourceIds.has(id)) selectedSourceIds.add(id);
    sourceBatchFeedback="";
    renderCollection();
    return;
  }
  if (event.target.closest("[data-organize-imported]")) {
    $("#assetImportDialog").close();
    switchView("sources");
    enterSourceBatch(lastImportedSourceIds);
    return;
  }
  const contextCreate = event.target.closest("[data-context-create]");
  if (contextCreate) {
    $("#contextCreateMenu").classList.add("hidden");
    openEditor(contextCreate.dataset.contextCreate,null,{areaRefs:[browsingAreaId]});
    return;
  }
  const ref = event.target.closest("[data-open-ref]"); if (ref) { event.stopPropagation(); openReferenced(ref.dataset.openRef); return; }
  const graphFocus = event.target.closest("[data-graph-focus]"); if (graphFocus) {
    graphController?.focusNode(graphFocus.dataset.graphFocus);
    $("#graphSearchFeedback").textContent = "已定位到关联节点。";
    return;
  }
  const graphOpen = event.target.closest("[data-graph-open]"); if (graphOpen) {
    const entry=entryById(graphOpen.dataset.graphOpen);
    if (entry && !entry.deletedAt) openViewer(entry);
    return;
  }
  const sourceDisplay = event.target.closest("[data-source-display]"); if (sourceDisplay) {
    const mode=sourceDisplay.dataset.sourceDisplay;
    if (!["gallery","list"].includes(mode)) return;
    if (currentView === "sources") {
      sourceDisplayMode=mode;
      localStorage.setItem("knowledge-workbench-source-display",mode);
    } else if (["projects","knowledge","areaDetail","inbox","areas"].includes(currentView)) {
      collectionDisplayModes[currentView]=mode;
      localStorage.setItem(`knowledge-workbench-${currentView}-display`,mode);
    } else return;
    renderCollection();
    return;
  }
  const areaBrowse = event.target.closest("[data-browse-area]"); if (areaBrowse) { browseArea(areaBrowse.dataset.browseArea); return; }
  const refToggle=event.target.closest('[data-toggle-ref-picker]');
  if(refToggle){
    const picker=refToggle.closest('.ref-picker');
    if(refToggle.getAttribute('aria-expanded')==='true')closeReferencePicker(picker);
    else {const input=picker.querySelector('.ref-search');showReferenceSuggestions(input);input.focus();}
    return;
  }
  const addRef = event.target.closest("[data-add-ref]"); if (addRef) {
    const name=addRef.dataset.refField, picker=addRef.closest(".ref-picker");
    if (addRef.dataset.addRef === editingId || editingRefs[name].includes(addRef.dataset.addRef)) return;
    if (picker.dataset.refMultiple !== "true") editingRefs[name]=[];
    editingRefs[name].push(addRef.dataset.addRef);
    if(name==='relatedRefs')editingRemovedRelations.delete(addRef.dataset.addRef);
    picker.querySelector(".ref-search").value=""; closeReferencePicker(picker); renderAllSelectedRefs(); return;
  }
  const removeRef = event.target.closest("[data-remove-ref]"); if (removeRef) {
    const name=removeRef.dataset.refField,id=removeRef.dataset.removeRef;
    editingRefs[name]=editingRefs[name].filter(refId=>refId!==id);
    if(name==='relatedRefs'){
      editingRemovedRelations.add(id);
      for(const field of WorkbenchRelations.ACTIVE_REF_FIELDS)if(editingRefs[field])editingRefs[field]=editingRefs[field].filter(refId=>refId!==id);
    }
    renderAllSelectedRefs();return;
  }
  const addTask = event.target.closest("[data-add-task]"); if (addTask) { editingTasks.push({ id:crypto.randomUUID(), text:"", done:false }); renderTaskEditor(); document.querySelector('.task-editor-row:last-child textarea[data-task-text]')?.focus(); return; }
  const removeTask = event.target.closest("[data-remove-task]"); if (removeTask) { editingTasks.splice(Number(removeTask.dataset.removeTask),1); renderTaskEditor(); return; }
  const mdAction=event.target.closest("[data-md-action]"); if (mdAction && !mdAction.disabled) { applyRichFormat(mdAction.dataset.mdAction); return; }
  const applyColor=event.target.closest("[data-rich-apply-color]"); if(applyColor) { applyRichFormat(applyColor.dataset.richApplyColor,lastRichColor(applyColor.dataset.richApplyColor)); return; }
  const paletteToggle=event.target.closest("[data-rich-palette-toggle]"); if(paletteToggle) { const palette=$("#richColorPalette");if(!palette.classList.contains("hidden") && palette.dataset.command===paletteToggle.dataset.richPaletteToggle) palette.classList.add("hidden");else openRichColorPalette(paletteToggle.dataset.richPaletteToggle,paletteToggle);return; }
  const swatch=event.target.closest("[data-rich-swatch]"); if(swatch) { chooseRichColor(swatch.dataset.richSwatch,swatch.dataset.color); return; }
  if(event.target.closest("[data-rich-custom-toggle]")) { $("#richColorPalette .rich-palette-custom").classList.toggle("hidden"); return; }
  if(event.target.closest("[data-rich-custom-apply]")) { const palette=$("#richColorPalette");chooseRichColor(palette.dataset.command,palette.querySelector("[data-rich-custom-apply]").style.getPropertyValue("--swatch"));return; }
  if(event.target.closest("[data-rich-insert-image]")) { chooseRichImage(); return; }
  if(!event.target.closest("#richColorPalette,#editorMarkdownToolbar")) $("#richColorPalette").classList.add("hidden");
  if(event.target.closest("[data-main-project-review]")) { startReviewForProject(entryById(viewedEntryId)); return; }
  if(event.target.closest("[data-main-return-inbox]")) { returnToInbox(); return; }
  if(event.target.closest("[data-main-trash]")) { $("#deleteEntry").click(); return; }
  const convert = event.target.closest("[data-convert]"); if (convert) { convertCapture(convert.dataset.convert); return; }
  const returnInbox = event.target.closest("[data-return-inbox]"); if (returnInbox) { returnToInbox(); return; }
  const openAsset = event.target.closest("[data-open-asset]"); if (openAsset) { useAssetAction("open",openAsset.dataset.openAsset); return; }
  const revealAsset = event.target.closest("[data-reveal-asset]"); if (revealAsset) { useAssetAction("reveal",revealAsset.dataset.revealAsset); return; }
  const relinkAsset = event.target.closest("[data-relink-asset]"); if (relinkAsset) { useAssetAction("relink",relinkAsset.dataset.relinkAsset); return; }
  const selectAssetCover = event.target.closest("[data-select-asset-cover]"); if (selectAssetCover) { useAssetAction("cover",selectAssetCover.dataset.selectAssetCover); return; }
  const resetAssetCover = event.target.closest("[data-reset-asset-cover]"); if (resetAssetCover) { useAssetAction("reset-cover",resetAssetCover.dataset.resetAssetCover); return; }
  const nav=event.target.closest("[data-view]"); if (nav) switchView(nav.dataset.view);
  const openProjectReview = event.target.closest("[data-open-project-review]"); if (openProjectReview) { switchView("projects"); toast("打开一个项目，在阅读页底部点击“写项目复盘”"); return; }
  const viewLink=event.target.closest("[data-view-link]"); if (viewLink) switchView(viewLink.dataset.viewLink);
  if(handleStackClick(event.target))return;
  if(event.target.closest('[data-home-import]')){openAssetImportDialog();return;}
  const pendingView=event.target.closest('[data-home-pending-view]');
  if(pendingView){switchView(pendingView.dataset.homePendingView);currentFilter=pendingView.dataset.homePendingFilter;renderCollection();return;}
  const create=event.target.closest("[data-create]"); if (create) openEditor(create.dataset.create);
  const edit=event.target.closest("[data-edit]"); if (edit) { const entry=entryById(edit.dataset.edit); if (entry) entry.deletedAt ? openEditor(entry.type,entry) : openViewer(entry); }
  const filter=event.target.closest("[data-filter]"); if (filter) {
    currentFilter=filter.dataset.filter;
    if (currentView === "search") $("#searchTypeFilter").value = searchScopeType || (currentFilter === "all" ? "" : currentFilter);
    renderCollection();
    if (currentView === "search") queueIndexedSearch(true);
  }
});

document.addEventListener("pointerdown",event=>{
  if(event.target.closest("#editorMarkdownToolbar button,#editorMarkdownToolbar select,#richColorPalette button,#richColorPalette input")) rememberRichSelection();
});
document.addEventListener("dblclick",event=>{const image=event.target.closest("#editorDialog .main-rich-editor img[data-asset-id],#viewerBody .main-markdown-content img[data-asset-id]");if(image) openInlineImagePreview(image);});
document.addEventListener("keydown",event=>{
  if(!event.target.closest("#editorDialog .main-rich-editor")) return;
  if(event.key==="Backspace" && !event.isComposing && !event.ctrlKey && !event.metaKey && !event.altKey && activeRichImage?.isConnected) {
    event.preventDefault();
    mergeSelectedImageWithPreviousRow();
    return;
  }
  handleImageRowKeydown(event);
});
document.addEventListener("pointerdown",startImageResize);
document.addEventListener("pointermove",moveImageResize);
document.addEventListener("pointerup",stopImageResize);
document.addEventListener("pointercancel",stopImageResize);
let suppressImageClick=false;
document.addEventListener("pointerdown",event=>{
  const source=event.target.closest("#editorDialog .main-rich-editor img[data-asset-id]");
  if(!source || event.button!==0) return;
  event.preventDefault();
  imageDragState={source,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,x:event.clientX,y:event.clientY,placement:null,moved:false};
});
document.addEventListener("pointermove",event=>{
  const drag=imageDragState;
  if(!drag || drag.pointerId!==event.pointerId) return;
  if(!drag.moved && Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)<5) return;
  drag.moved=true;
  drag.x=event.clientX;drag.y=event.clientY;
  drag.placement=imageDropTarget(event.clientX,event.clientY,drag.source);
  showImageDropPreview(drag.placement);
  if(!imageDragScrollFrame) imageDragScrollFrame=requestAnimationFrame(scrollDuringImageDrag);
});
document.addEventListener("pointerup",event=>{
  if(imageDragState?.pointerId!==event.pointerId) return;
  const placement=imageDragState.moved ? imageDragState.placement : null;
  if(placement && finishImageDrag(placement)) {
    suppressImageClick=true;
    setTimeout(()=>{suppressImageClick=false;},0);
  }
  stopImageDrag();
});
document.addEventListener("pointercancel",stopImageDrag);
document.addEventListener("dragstart",event=>{if(event.target.closest?.("#editorDialog .main-rich-editor img[data-asset-id]")) event.preventDefault();});
document.addEventListener("keydown",event=>{
  if(event.key==="Escape" && imageDragState) {event.preventDefault();stopImageDrag();return;}
  if(!$("#editorDialog").open || !(event.target.closest?.("#editorDialog .main-rich-editor,#richImageControls")) || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase()!=="z" || !imageDragUndo) return;
  event.preventDefault();
  const editor=$("#editorDialog .main-rich-editor"),html=event.shiftKey ? imageDragUndo.after : imageDragUndo.before;
  editor.innerHTML=html;hydrateEmbeddedImages(editor);hideRichImageControls();
  if(event.shiftKey) imageDragUndo=null;
});
document.addEventListener("dragover",event=>{
  const editor=event.target.closest("#editorDialog .main-rich-editor");
  if(!editor || !event.dataTransfer?.types.includes("Files")) return;
  event.preventDefault();event.dataTransfer.dropEffect="copy";editor.classList.add("rich-image-drop-target");
});
document.addEventListener("dragleave",event=>{const editor=event.target.closest("#editorDialog .main-rich-editor");if(editor && !editor.contains(event.relatedTarget)) editor.classList.remove("rich-image-drop-target");});
document.addEventListener("drop",event=>{
  const editor=event.target.closest("#editorDialog .main-rich-editor");
  if(!editor || !event.dataTransfer?.files.length) return;
  event.preventDefault();editor.classList.remove("rich-image-drop-target");
  const range=document.caretRangeFromPoint?.(event.clientX,event.clientY);
  const selection=window.getSelection();
  if(range && editor.contains(range.startContainer)) { selection.removeAllRanges();selection.addRange(range); }
  else { const end=document.createRange();end.selectNodeContents(editor);end.collapse(false);selection.removeAllRanges();selection.addRange(end); }
  rememberRichSelection();
  importDroppedRichImage(event.dataTransfer.files[0]);
});
document.addEventListener("selectionchange",()=>{
  if($("#editorDialog").open) rememberRichSelection();
});
document.addEventListener("change",event=>{
  if(event.target.matches('.main-status-control select[data-status-type]')) {
    const select=event.target;
    select.className=`status--${statusTone({type:select.dataset.statusType,[select.name]:select.value})}`;
  }
  if(event.target.matches("#editorMarkdownToolbar [data-rich-size]")) applyRichFormat("fontSize",event.target.value);
  if(event.target.matches("#editorMarkdownToolbar [data-rich-line-spacing]")) applyRichLineSpacing(event.target.value);
});
document.addEventListener("input",event=>{
  if(event.target.matches("#editorDialog .main-rich-editor")) {
    imageDragUndo=null;
    hideRichImageControls();
    event.target.querySelectorAll('[data-image-row][data-image-paired]').forEach(row=>{
      if(![...row.querySelectorAll(':scope > p,:scope > [data-image-text]')].some(node=>node.textContent.replaceAll('\u200b','').trim())) {row.dataset.imageLayout='full';delete row.dataset.imagePaired;}
    });
  }
  if(event.target.matches("#richColorPalette [data-rich-custom]")) updateCustomColor();
  if(event.target.matches("#editorDialog .main-rich-editor") && (event.data===" " || event.inputType==="insertParagraph" || event.inputType==="insertFromPaste")) linkifyEditorUrls(event.target);
});
document.addEventListener("focusout",event=>{if(event.target.matches("#editorDialog .main-rich-editor")) linkifyEditorUrls(event.target);});
let relationScrollDrag=null,ignoreRelationClick=false;
document.addEventListener("pointerdown",event=>{
  if(event.button!==0 || event.target.closest("input,select")) return;
  const inner=event.target.closest(".main-relation-column-items");
  const scroll=inner?.scrollWidth>inner?.clientWidth ? inner : event.target.closest(".main-relation-scroll");
  if(scroll) relationScrollDrag={scroll,x:event.clientX,scrollLeft:scroll.scrollLeft,moved:false,pointerId:event.pointerId};
});
document.addEventListener("pointermove",event=>{
  const drag=relationScrollDrag;
  if(!drag || drag.pointerId!==event.pointerId) return;
  const delta=event.clientX-drag.x;
  if(Math.abs(delta)>5) { drag.moved=true;drag.scroll.classList.add("is-dragging");drag.scroll.scrollLeft=drag.scrollLeft-delta; }
});
document.addEventListener("pointerup",event=>{
  if(!relationScrollDrag || relationScrollDrag.pointerId!==event.pointerId) return;
  ignoreRelationClick=relationScrollDrag.moved;
  relationScrollDrag.scroll.classList.remove("is-dragging");relationScrollDrag=null;
  if(ignoreRelationClick) setTimeout(()=>{ignoreRelationClick=false;},0);
});
document.addEventListener("click",event=>{
  if(ignoreRelationClick && event.target.closest(".main-relation-scroll")) { event.preventDefault();event.stopImmediatePropagation();ignoreRelationClick=false; }
},true);

document.addEventListener("input", event => {
  if(event.target.closest(".main-rich-editor")) { rememberRichSelection();fitMainContentInput(); }
  if(event.target.matches("#editorDialog .main-card-secondary textarea, #editorDialog .task-editor-row textarea[data-task-text]")) fitProjectTextFields();
  if (event.target.closest(".task-editor-row")) {
    const row = event.target.closest(".task-editor-row");
    const task = editingTasks[Number(row.dataset.taskIndex)];
    if (task) {
      if (event.target.matches('input[type="checkbox"]')) task.done = event.target.checked;
      if (event.target.matches('textarea[data-task-text]')) task.text = event.target.value;
    }
  }
  if (event.target.matches(".ref-search")) showReferenceSuggestions(event.target);
  if (event.target.matches("[data-url-input]")) {
    const link = event.target.parentElement.querySelector("[data-url-preview]");
    const url = safeExternalUrl(event.target.value);
    link.href = url;
    link.classList.toggle("hidden",!url);
  }
});
document.addEventListener("focusin", event => {
  if (event.target.matches(".ref-search")) {
    closeReferenceSuggestions(event.target.closest(".ref-picker"));
    showReferenceSuggestions(event.target);
  } else if (!event.target.closest(".ref-picker")) closeReferenceSuggestions();
});
document.addEventListener("wheel",event => {
  const openDialog = document.querySelector("dialog[open]");
  if (!openDialog) return;
  const horizontal=event.target.closest(".main-relation-column-items,.main-relation-scroll");
  if(horizontal && openDialog.contains(horizontal)) {
    const scroll=horizontal.scrollWidth>horizontal.clientWidth ? horizontal : horizontal.closest(".main-relation-scroll");
    if(scroll?.scrollWidth>scroll?.clientWidth) { scroll.scrollLeft+=Math.abs(event.deltaX)>Math.abs(event.deltaY) ? event.deltaX : event.deltaY;event.preventDefault();return; }
  }
  const scrollable = event.target.closest(".viewer-body,.form-fields,.data-manager-body,.asset-import-body");
  if (!scrollable || !openDialog.contains(scrollable)) event.preventDefault();
},{ passive:false, capture:true });
$("#quickCapture").addEventListener("click",()=>openEditor("capture"));
$("#openAssetImport").addEventListener("click",openAssetImportDialog);
$("#closeAssetImport").addEventListener("click",()=>$("#assetImportDialog").close());
$("#cancelAssetImport").addEventListener("click",()=>$("#assetImportDialog").close());
$("#chooseAssetFiles").addEventListener("click",chooseAndImportAssets);
$("#sourceBatchToggle").addEventListener("click",()=>sourceBatchMode ? exitSourceBatch() : enterSourceBatch());
$("#sourceBatchExit").addEventListener("click",()=>exitSourceBatch());
$("#sourceBatchSelectVisible").addEventListener("click",()=>{ selectedSourceIds=new Set(visibleSourceIds); sourceBatchFeedback=""; renderCollection(); });
$("#sourceBatchClear").addEventListener("click",()=>{ selectedSourceIds.clear(); sourceBatchFeedback=""; renderCollection(); });
$("#sourceBatchAreaChoices").addEventListener("change",renderSourceBatchBar);
$("#sourceBatchAddAreas").addEventListener("click",()=>runSourceBatch("add-areas",{ areaIds:chosenBatchAreaIds() },"已添加领域"));
$("#sourceBatchRemoveAreas").addEventListener("click",()=>{
  const areaIds=chosenBatchAreaIds();
  if (!areaIds.length) { toast("请至少选择一个领域"); return; }
  const affected=WorkbenchSourceBatch.countAreaRemoval(state.entries,selectedSourceIds,areaIds,collectionType());
  if (!affected) { sourceBatchFeedback="所选内容未添加这些领域。"; renderSourceBatchBar(); return; }
  runSourceBatch("remove-areas",{ areaIds },"已移除领域");
});
$("#sourceBatchSetReadingStatus").addEventListener("click",()=>runSourceBatch("set-status",{ status:$("#sourceBatchReadingStatus").value },"已更新状态"));
$("#sourceBatchTrash").addEventListener("click",()=>{
  const count=selectedSourceIds.size;
  if (count && confirm(`将选中的 ${count} 条${typeLabel(collectionType())}移到回收站？`)) runSourceBatch("trash",{},"已移到回收站");
});
$("#collectionAreaFilter").addEventListener("change",event=>{
  if(!["projects","knowledge","sources"].includes(currentView)) return;
  collectionAreaFilterByView[currentView]=event.target.value||"all";
  renderCollection();
});
document.querySelectorAll('input[name="assetMode"]').forEach(input => input.addEventListener("change",()=>{
  document.querySelectorAll(".import-mode").forEach(label => label.classList.toggle("selected",label.contains(input)));
}));
$("#closeDialog").addEventListener("click",()=>$("#editorDialog").close());
$("#editorDialog").addEventListener("close",()=>{if($("#editorDialog").open)return;hideRichImageControls();$("#richColorPalette").classList.add("hidden");stopImageDrag();imageDragUndo=null;});
$("#formFields").addEventListener("scroll",positionRichImageControls);
window.addEventListener("resize",positionRichImageControls);
$("#closeInlineImage").addEventListener("click",closeInlineImagePreview);
$("#inlineImageDialog").addEventListener("close",()=>{$("#inlineImageFull").removeAttribute("src");setInlineImageZoom(1,true);});
$("#inlineImageZoomIn").addEventListener("click",()=>setInlineImageZoom(inlineImageZoom*1.25));
$("#inlineImageZoomOut").addEventListener("click",()=>setInlineImageZoom(inlineImageZoom/1.25));
$("#inlineImageZoomReset").addEventListener("click",()=>setInlineImageZoom(1,true));
$("#inlineImageStage").addEventListener("wheel",event=>{event.preventDefault();setInlineImageZoom(inlineImageZoom*(event.deltaY<0 ? 1.15 : 1/1.15));},{passive:false});
$("#inlineImageStage").addEventListener("pointerdown",event=>{if(event.button!==0)return;event.preventDefault();inlineImagePanDrag={pointerId:event.pointerId,x:event.clientX,y:event.clientY,panX:inlineImagePanX,panY:inlineImagePanY};event.currentTarget.setPointerCapture?.(event.pointerId);});
$("#inlineImageStage").addEventListener("pointermove",event=>{if(inlineImagePanDrag?.pointerId!==event.pointerId)return;inlineImagePanX=inlineImagePanDrag.panX+event.clientX-inlineImagePanDrag.x;inlineImagePanY=inlineImagePanDrag.panY+event.clientY-inlineImagePanDrag.y;setInlineImageZoom(inlineImageZoom);});
$("#inlineImageStage").addEventListener("pointerup",event=>{if(inlineImagePanDrag?.pointerId===event.pointerId)inlineImagePanDrag=null;});
$("#inlineImageStage").addEventListener("pointercancel",()=>{inlineImagePanDrag=null;});
$("#mainSaveTop").addEventListener("click",()=>$("#editorForm").requestSubmit());
$("#mainCancelTop").addEventListener("click",()=>$("#cancelEdit").click());
$("#editViewedEntryTop").addEventListener("click",()=>$("#editViewedEntry").click());
function closeViewedCard() {
  closeViewerDialog();
}
$("#closeViewer").addEventListener("click",closeViewedCard);
$("#viewerDialog").addEventListener("close",()=>{if(!$("#viewerDialog").open){areaGraphController?.destroy();areaGraphController=null;}});
$("#closeViewerBottom").addEventListener("click",closeViewedCard);
$("#editViewedEntry").addEventListener("click",()=>{
  const entry = entryById(viewedEntryId);
  if (!entry) return;
  const mainCard=WorkbenchCardV2.MAIN_TYPES.has(entry.type);
  const transferRect=mainCard ? $("#viewerDialog").getBoundingClientRect() : null;
  const scrollTop=mainCard ? $("#viewerBody").scrollTop : 0;
  const canvasFrame=mainCard ? reusableCanvasFrame($("#viewerDialog")) : null;
  const waitForCanvas=mainCard && !canvasFrame && $("#viewerDialog").open;
  if(!waitForCanvas) closeViewerDialog();
  openEditor(entry.type,entry,{}, { returnToViewer:true,transferRect,scrollTop,waitForCanvas,canvasFrame });
});
$("#editorDialog").addEventListener("close",()=>{
  if(!$("#editorDialog").open){
    cancelCanvasModeSwitch();
    editingCustomCover=null;editingCustomCoverUpload=null;editingCustomCoverRequest=null;
    const picker=$('#editorDialog [data-cover-editor]');
    if(picker)window.WorkbenchCover?.unmount(picker);
  }
});
$("#startProjectReview").addEventListener("click",()=>startReviewForProject(entryById(viewedEntryId)));
$("#cancelEdit").addEventListener("click",()=>{
  const returnEntry = editorReturnEntryId ? entryById(editorReturnEntryId) : null;
  const mainCard=returnEntry && WorkbenchCardV2.MAIN_TYPES.has(returnEntry.type);
  const transferRect=mainCard ? $("#editorDialog").getBoundingClientRect() : null;
  const scrollTop=mainCard ? $("#formFields").scrollTop : 0;
  const canvasFrame=mainCard ? reusableCanvasFrame($("#editorDialog")) : null;
  $("#editorDialog").close();
  editorReturnEntryId = null;
  if (returnEntry) openViewer(returnEntry,{transferRect,scrollTop,canvasFrame,discardCanvas:true});
});
$("#editorForm").addEventListener("submit",saveForm);
$("#deleteEntry").addEventListener("click",async()=>{
  const entry=entryById(editingId);if(!entry||!confirm('将这条内容移到回收站吗？之后可以恢复。'))return;
  try{await commitUnifiedState({...state,entries:state.entries.map(card=>card.id===entry.id?{...card,deletedAt:new Date().toISOString()}:card)},'已移到回收站');}
  catch(error){toast('尚未删除：'+error.message);return;}
  $("#editorDialog").close();
  if(entry.id===browsingAreaId)switchView('areas');
});
$("#restoreEntry").addEventListener("click",async()=>{
  const entry=entryById(editingId);if(!entry)return;
  try{await commitUnifiedState({...state,entries:state.entries.map(card=>card.id===entry.id?{...card,deletedAt:null}:card)},'内容已恢复');}
  catch(error){toast('恢复失败：'+error.message);return;}
  $("#editorDialog").close();
});
$("#permanentDelete").addEventListener("click",async()=>{
  const entry=entryById(editingId);
  if(!entry?.deletedAt){toast('只有回收站中的卡片可以永久删除');return;}
  if(!confirm('将“'+entry.title+'”永久删除？卡片正文将无法恢复，但关联的原始文件会保留。'))return;
  const tombstones=WorkbenchData.normalizeTombstones([...(state.tombstones || []),{id:entry.id,type:entry.type,deletedAt:WorkbenchData.isoNow()}]);
  const entries=state.entries.filter(card=>card.id!==entry.id).map(card=>({...card,...Object.fromEntries(['areaRefs','sourceRefs','relatedRefs','projectRefs'].filter(key=>card[key]).map(key=>[key,card[key].filter(id=>id!==entry.id)]))}));
  try{await commitUnifiedState({...state,entries,tombstones},'内容已永久删除');}
  catch(error){toast('永久删除失败：'+error.message);return;}
  $("#editorDialog").close();
});
$("#searchInput").addEventListener("input",event=>{
  const hasQuery = event.target.value.trim().length > 0;
  $("#clearSearch").classList.toggle("hidden",!hasQuery);
  $(".search-wrap").classList.toggle("searching",hasQuery);
  if (hasQuery) {
    if (currentView !== "search") {
      searchReturnView=currentView; searchReturnAreaId=browsingAreaId;
      searchScopeType=collectionType();
      clearAdvancedSearchFilters(false);
      switchView("search");
    }
    else renderCollection();
    queueIndexedSearch();
  } else if (currentView === "search") exitSearch();
  else render();
});
$("#clearSearch").addEventListener("click",exitSearch);
$("#clearSearchFilters").addEventListener("click",()=>clearAdvancedSearchFilters(true));
const searchStatusMenu = $("#searchStatusMenu");
const searchStatusTrigger = $("#searchStatusTrigger");
function openSearchStatusMenu() {
  const rect = searchStatusTrigger.getBoundingClientRect();
  const width = Math.max(165, rect.width);
  searchStatusMenu.style.width = `${width}px`;
  searchStatusMenu.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - width - 8))}px`;
  searchStatusMenu.style.top = `${rect.bottom + 4}px`;
  searchStatusMenu.showPopover();
  searchStatusMenu.querySelector('[aria-selected="true"]')?.focus({preventScroll:true});
}
searchStatusTrigger.addEventListener("click",()=>searchStatusMenu.matches(":popover-open") ? searchStatusMenu.hidePopover() : openSearchStatusMenu());
searchStatusTrigger.addEventListener("keydown",event=>{
  if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
  event.preventDefault(); openSearchStatusMenu();
});
searchStatusMenu.addEventListener("toggle",event=>searchStatusTrigger.setAttribute("aria-expanded",String(event.newState === "open")));
searchStatusMenu.addEventListener("click",event=>{
  const option = event.target.closest("[data-search-status]");
  if (!option) return;
  $("#searchStatusFilter").value = option.dataset.searchStatus;
  searchStatusMenu.hidePopover();
  $("#searchStatusFilter").dispatchEvent(new Event("change",{bubbles:true}));
  searchStatusTrigger.focus({preventScroll:true});
});
searchStatusMenu.addEventListener("keydown",event=>{
  const options = [...searchStatusMenu.querySelectorAll('[role="option"]')];
  const index = options.indexOf(document.activeElement);
  if (["ArrowDown","ArrowUp","Home","End"].includes(event.key)) {
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
    options[next].focus({preventScroll:true});
  } else if (event.key === "Escape") {
    event.preventDefault(); event.stopPropagation();
    searchStatusMenu.hidePopover(); searchStatusTrigger.focus({preventScroll:true});
  }
});
window.addEventListener("resize",()=>{ if(searchStatusMenu.matches(":popover-open")) searchStatusMenu.hidePopover(); });
for (const id of ["searchDateFrom","searchDateTo"]) {
  $("#" + id).addEventListener("click",event=>{
    if (typeof event.currentTarget.showPicker !== "function") return;
    event.preventDefault();
    try { event.currentTarget.showPicker(); } catch { event.currentTarget.focus(); }
  });
}
$("#graphTypeFilters").addEventListener("change",()=>{ renderGraph(); graphController?.resetView(); });
$("#graphAreaFilter").addEventListener("change",()=>{ renderGraph(); graphController?.resetView(); });
function locateGraphNode() {
  const query=$("#graphTitleSearch").value.trim();
  const node=WorkbenchGraphData.findNodeByTitle(currentGraph,query);
  if (!node) { $("#graphSearchFeedback").textContent=query ? "当前筛选中没有匹配标题。" : "请输入要定位的标题。"; return; }
  graphController?.focusNode(node.id);
  $("#graphSearchFeedback").textContent=`已定位：${node.title}`;
}
$("#graphLocateNode").addEventListener("click",locateGraphNode);
$("#graphTitleSearch").addEventListener("keydown",event=>{ if(event.key==="Enter"){event.preventDefault();locateGraphNode();} });
$("#graphResetView").addEventListener("click",()=>{ graphController?.resetView(); $("#graphSearchFeedback").textContent="已恢复默认视角。"; });
$("#advancedSearchPanel").addEventListener("change",event=>{
  if (!event.target.matches("select,input")) return;
  if (event.target.id === "searchTypeFilter") currentFilter = event.target.value || "all";
  if (event.target.id === "searchModeFilter" && event.target.value === "hybrid" && !$("#searchInput").value.trim()) {
    setSearchBadge("正在准备语义检索 · 首次可能需数秒", "preparing");
    semanticSearchCoordinator.prepare().then(()=>{
      if ($("#searchModeFilter").value === "hybrid" && !$("#searchInput").value.trim()) setSearchBadge("语义检索已就绪");
    }).catch(error=>{
      if ($("#searchModeFilter").value === "hybrid" && !$("#searchInput").value.trim()) setSearchBadge("语义模型准备失败 · 精确检索仍可用", "fallback");
      console.error(error);
    });
  }
  renderCollection();
  queueIndexedSearch();
});
$("#openDataManager").addEventListener("click",openDataManager);
$("#closeDataDialog").addEventListener("click",()=>$("#dataDialog").close());
$("#doneDataDialog").addEventListener("click",()=>$("#dataDialog").close());
$("#runDataCheck").addEventListener("click",()=>{ updateDataManager(); toast("检查完成"); });
$("#refreshVaultStatus").addEventListener("click",refreshVaultStatus);
$("#syncCardsToVault").addEventListener("click",syncCardsToVault);
$('#reloadVault').addEventListener('click',reloadVaultFromDisk);
$('#rebuildVault').addEventListener('click',rebuildVaultFromCards);
$("#refreshIndexStatus").addEventListener("click",refreshSearchIndexStatus);
$("#rebuildSearchIndex").addEventListener("click",rebuildDesktopSearchIndex);
$("#refreshSemanticStatus").addEventListener("click",refreshSemanticStatus);
$("#rebuildSemanticIndex").addEventListener("click",rebuildDesktopSemanticIndex);
$("#semanticModelSelect").addEventListener("change",saveSemanticPreferences);
$("#semanticDeviceSelect").addEventListener("change",saveSemanticPreferences);
$("#exportBundle").addEventListener("click",()=>{
  const failed=vaultSession.failedBundle;
  if(failed){WorkbenchData.download('知识工作台未保存修改-'+today()+'.kwb.json',JSON.stringify(failed,null,2),'application/json;charset=utf-8');toast('未保存修改已导出，包含本次提交的画布');}
  else{WorkbenchData.exportBundle(state,today());toast('完整迁移包已导出');}
});
$("#exportData").addEventListener("click",exportMarkdown);
$("#chooseImport").addEventListener("click",()=>$("#importBundleFile").click());
$("#importBundleFile").addEventListener("change",event=>{ const [file]=event.target.files; if(file) previewImport(file); });
$("#cancelImport").addEventListener("click",()=>{ pendingImport=null; $("#importPreview").classList.add("hidden"); $("#importBundleFile").value=""; });
$("#confirmImport").addEventListener("click",confirmImport);
$("#resetDemo").addEventListener("click",()=>{ if(confirm("确定恢复为初始演示数据吗？当前浏览器中的修改会被清除。")){ state=WorkbenchData.normalizeState({entries:structuredClone(seedEntries)}); saveState("已恢复演示数据"); } });
$$('#editorDialog .dialog-head, #viewerDialog .dialog-head').forEach(head => {
  head.addEventListener("pointerdown",startDialogDrag);
  head.addEventListener("pointermove",moveDialog);
  head.addEventListener("pointerup",stopDialogDrag);
  head.addEventListener("pointercancel",stopDialogDrag);
});
$$('.card-resize-handle').forEach(handle=>{
  handle.addEventListener("pointerdown",startCardDialogResize);
  handle.addEventListener("pointermove",moveCardDialogResize);
  handle.addEventListener("pointerup",stopCardDialogResize);
  handle.addEventListener("pointercancel",stopCardDialogResize);
});
$$('[data-reset-dialog-size]').forEach(button=>button.addEventListener("click",()=>{
  if(standaloneCardId){if(window.workbenchDesktop?.resetCardWindow)void window.workbenchDesktop.resetCardWindow();else window.resizeTo(820,820);return;}
  const dialog=button.closest(".card-resizable");
  WorkbenchDialogResize.restoreDefault(dialog.dataset.dialogSize,localStorage);
  if (dialog.open) usePreferredCardDialogSize(dialog,{reset:true});
}));
window.addEventListener("resize",()=>{fitOpenCardDialogs();fitMainContentInput();fitProjectTextFields();fitMainCanvasFrames();});
new ResizeObserver(fitProjectTextFields).observe($("#formFields"));
const canvasViewportObserver=new ResizeObserver(fitMainCanvasFrames);
canvasViewportObserver.observe($("#viewerBody"));
canvasViewportObserver.observe($("#formFields"));
document.addEventListener("keydown",e=>{
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();$("#searchInput").focus();}
  if(e.key==="Escape") closeReferenceSuggestions();
  if(e.key==="Escape" && currentView==="search" && !$("#editorDialog").open && !$("#viewerDialog").open){e.preventDefault();exitSearch();}
});

if(!standaloneCardId)initializeSemanticPreferences();
render();
async function initializeCardWindow(){
  await hydrateDesktopState();
  if(standaloneCardId){
    const params=new URLSearchParams(location.search),entry=entryById(standaloneCardId);
    if(standaloneCardId==='new'&&Object.hasOwn(schemas,params.get('type'))){let preset={};try{preset=JSON.parse(params.get('preset')||'{}');}catch{}openEditor(params.get('type'),null,preset);}
    else if(entry){if(params.get('edit')==='1')openEditor(entry.type,entry,{}, {returnToViewer:true});else openViewer(entry);}
    else{toast('这张卡片已不存在');}
    if(document.readyState==='loading')await new Promise(resolve=>document.addEventListener('DOMContentLoaded',resolve,{once:true}));
    await Promise.race([document.fonts.ready,new Promise(resolve=>setTimeout(resolve,100))]);
    // Hidden Electron windows can throttle animation frames. Do not gate
    // showing a populated, themed dialog on a hidden-window animation frame.
    void window.workbenchDesktop?.cardWindowReady?.();
  }
}
void initializeCardWindow();
function refreshOpenCardRelations(){
  const dialog=$('#viewerDialog'),entry=entryById(viewedEntryId);
  if(!dialog.open||!entry||$('#editorDialog').open)return;
  if(WorkbenchCardV2.MAIN_TYPES.has(entry.type)){
    const relations=WorkbenchRelations.groups(state,entry);
    const areas=dialog.querySelector('.main-area-chips');
    if(areas)areas.innerHTML=relations.areas.map(ref=>mainReferenceChipHtml(ref)).join('');
    const related=dialog.querySelector('.main-card-page > .main-card-relations .main-relation-scroll');
    if(related)related.innerHTML=mainRelationColumnsHtml(visibleMainRelations(entry,relations),ref=>mainReferenceChipHtml(ref));
  }else{
    const section=dialog.querySelector('.viewer-relationships');
    if(section){const groups=relationshipGroupsHtml(entry);section.innerHTML=groups?'<h3>关系</h3><div class="relationship-groups">'+groups+'</div>':'';}
  }
}
function syncSharedCardState(raw){
  if(!raw || $('#editorDialog').open || vaultSession.blocked)return;
  void hydrateDesktopState().then(()=>refreshOpenCardRelations());
}

window.addEventListener('storage',event=>{if(event.key?.startsWith(ACTIVITY_PREFIX)&&!standaloneCardId)renderActivityCalendar();if(event.key===RECENT_VISITS_KEY&&!standaloneCardId)renderHome();if(event.key===STORAGE_KEY)syncSharedCardState(event.newValue);});
window.workbenchDesktop?.onVaultChanged?.(()=>syncSharedCardState('disk-change'));
if(standaloneCardId)window.addEventListener('focus',()=>syncSharedCardState(localStorage.getItem(STORAGE_KEY)));
if(standaloneCardId){
  ['closeViewer','closeViewerBottom','closeDialog'].forEach(id=>document.getElementById(id).addEventListener('click',()=>window.close()));
  $('#viewerDialog').addEventListener('cancel',()=>window.close());
  $('#editorDialog').addEventListener('cancel',event=>{event.preventDefault();$('#cancelEdit').click();});
  $('#cancelEdit').addEventListener('click',()=>{if(!editingId)window.close();});
}

async function refreshAttachmentCache(){
 const target=document.querySelector('#attachmentCacheStatus');
 try{const stats=await window.WorkbenchAttachmentCache.stats();target.textContent='草稿 '+formatBytes(stats.draftBytes)+' · 旧版完整缓存 '+formatBytes(stats.legacyBytes)+' · 正在使用 '+formatBytes(stats.activeBytes);}catch(error){target.textContent='统计失败：'+error.message;}
}
document.querySelector('#refreshAttachmentCache').addEventListener('click',refreshAttachmentCache);
document.querySelector('#clearAttachmentCache').addEventListener('click',async event=>{
 event.target.disabled=true;try{await window.WorkbenchAttachmentCache.clear();await refreshAttachmentCache();toast('未使用缓存已清理，资料库原文件未改动');}catch(error){toast('清理失败：'+error.message);}finally{event.target.disabled=false;}
});
document.addEventListener('click',event=>{const button=event.target.closest('[data-restore-canvas-asset]');if(!button)return;const frame=button.closest('.main-card-page').querySelector('.main-canvas-frame');frame.contentWindow.postMessage({type:'personalvault:canvas:restore',assetId:button.dataset.restoreCanvasAsset},'*');});
window.addEventListener('message',event=>{if(event.data?.type==='personalvault:canvas:restore-result'&&[...document.querySelectorAll('.main-canvas-frame')].some(frame=>frame.contentWindow===event.source))toast(event.data.message);});
