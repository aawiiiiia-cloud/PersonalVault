const STORAGE_KEY = "zhixingtai-v1";
const SEMANTIC_MODEL_KEY = "knowledge-workbench-semantic-model";
const SEMANTIC_DEVICE_KEY = "knowledge-workbench-semantic-device";
const DEFAULT_SEMANTIC_MODEL = "multilingual-e5-base-q8";

const desktopPlatform=window.workbenchDesktop?.platform;
if (window.workbenchDesktop?.isDesktop && desktopPlatform) {
  document.body.classList.add("desktop-shell",`platform-${desktopPlatform}`);
}

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

const hadSavedLocalState = localStorage.getItem(STORAGE_KEY) !== null;
let state = loadState();
let currentView = "home";
let currentFilter = "all";
const collectionAreaFilterByView={ projects:"all",knowledge:"all",sources:"all" };
let searchReturnView = "home";
let searchReturnAreaId = null;
let browsingAreaId = null;
let editingId = null;
let viewedEntryId = null;
let viewerHistory = [];
let editorNavigationReturn = null;
let editingRefs = {};
let editingTasks = [];
let editorReturnEntryId = null;
let dragState = null;
let cardResizeState = null;
let indexedSearchIds = null;
let indexedSearchRequest = 0;
let indexedSearchTimer = null;
let sourceDisplayMode = localStorage.getItem("knowledge-workbench-source-display") || "gallery";
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

function saveState(message="已保存") {
  state.schemaVersion = WorkbenchData.SCHEMA_VERSION;
  state.updatedAt = nextStateTime();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  render();
  toast(message);
  if (window.workbenchDesktop?.isDesktop) {
    window.workbenchDesktop.syncCards(WorkbenchData.createBundle(state)).catch(error => {
      console.error(error);
      toast("电脑中已保存，但移动硬盘同步失败");
    });
  }
}

async function commitUnifiedState(nextState,message="已保存") {
  nextState.schemaVersion=WorkbenchData.SCHEMA_VERSION;
  nextState.updatedAt=nextStateTime();
  const report=WorkbenchData.validateState(nextState);
  if (!report.ok) throw new Error(report.errors[0] || "数据检查失败");
  let syncResult=null;
  if (window.workbenchDesktop?.isDesktop) {
    syncResult=await window.workbenchDesktop.syncCards(WorkbenchData.createBundle(nextState));
  }
  state=nextState;
  localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
  render();
  toast(message);
  return syncResult;
}

async function hydrateDesktopState() {
  if (!window.workbenchDesktop?.isDesktop) return;
  try {
    const result = await window.workbenchDesktop.loadLatestState();
    if (!result?.found || !result.state?.entries?.length) return;
    const diskTime = Date.parse(result.state.updatedAt || 0) || 0;
    const localTime = Date.parse(state.updatedAt || 0) || 0;
    if (!hadSavedLocalState || diskTime > localTime) {
      state = WorkbenchData.normalizeState(result.state);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      render();
      toast("已从移动硬盘载入最新内容");
    } else if (localTime > diskTime) {
      await window.workbenchDesktop.syncCards(WorkbenchData.createBundle(state));
    }
  } catch (error) {
    console.error(error);
    toast("移动硬盘内容暂时无法读取");
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
function summary(entry) { return WorkbenchCardMarkdown.plainText(entry.content) || entry.goal || entry.origin || entry.description || entry.result || entry.rawContent || "暂时没有摘要"; }
function inboxEntries() { return state.entries.filter(e => !e.deletedAt && e.type === "capture"); }
function entryById(id) { return state.entries.find(e => e.id === id); }

function relationButtonHtml(item) {
  const ref = item.entry || item;
  return `<button type="button" class="type-chip type-chip--${escapeHtml(ref.type)}" data-open-ref="${escapeHtml(ref.id)}"><small>${escapeHtml(typeLabel(ref.type))}${item.bidirectional ? " · 双向" : ""}</small>${escapeHtml(ref.title)}</button>`;
}

function relationGroupHtml(label, refs, className="") {
  if (!refs.length) return "";
  return `<div class="relation-group ${className}"><span class="relation-kind">${escapeHtml(label)}</span><div>${refs.map(relationButtonHtml).join("")}</div></div>`;
}

function relationshipGroupsHtml(entry, { includeExternal=false, detailsOnly=false } = {}) {
  const relations = WorkbenchRelations.groups(state,entry);
  const groups = [
    detailsOnly ? "" : relationGroupHtml("所属领域 · 分类标签",relations.areas,"area-relations"),
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
  target.innerHTML = `<span class="graph-inspector-kicker">${escapeHtml(typeLabel(node.type))}</span><h2>${escapeHtml(node.title)}</h2><div class="graph-inspector-meta"><div><span>所属领域</span><b>${escapeHtml(node.areas.map(area=>area.title).join("、") || "尚未归属领域")}</b></div><div><span>直接关联</span><b>${relations.length} 个节点</b></div></div><div class="graph-relations"><span>直接关联</span><div class="graph-relation-list">${relations.length ? relations.map(relation=>`<button type="button" data-graph-focus="${escapeHtml(relation.id)}">${escapeHtml(typeLabel(relation.type))} · ${escapeHtml(relation.title)}</button>`).join("") : `<p>当前没有直接关联。</p>`}</div></div><button type="button" class="graph-view-card" data-graph-open="${escapeHtml(node.id)}">查看卡片</button>`;
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
  const inbox = inboxEntries();
  $("#inboxCount").textContent = inbox.length;
  $("#trashCount").textContent = state.entries.filter(e => e.deletedAt).length;
  renderAreaNav();
  populateSearchFilterOptions();
  $("#todayLabel").textContent = new Intl.DateTimeFormat("zh-CN", {year:"numeric",month:"long",day:"numeric",weekday:"long"}).format(new Date());
  renderPreview("#inboxPreview", inbox, "没有尚未分类的随手记");
  renderPreview("#projectPreview", state.entries.filter(e => e.type === "project" && !e.deletedAt && e.status === "active"), "还没有进行中的项目");
  if (currentView === "graph") renderGraph();
  else if (currentView !== "home") renderCollection();
}

function renderAreaNav() {
  const areas = state.entries.filter(e => e.type === "area" && !e.deletedAt && e.status !== "inactive");
  $("#areaNavList").innerHTML = areas.map(area => `<button class="${browsingAreaId === area.id ? "active" : ""}" data-browse-area="${area.id}" title="${escapeHtml(area.title)}">· ${escapeHtml(area.title)}</button>`).join("");
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

function populateSearchFilterOptions() {
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
    types:["project","knowledge","source"],
    type:$("#searchTypeFilter").value || quickType,
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
    setSearchBadge(`精确＋语义 · ${result.count} 条`);
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
  const cfg = viewConfig[currentView];
  const browsingArea = currentView === "areaDetail" && browsingAreaId ? entryById(browsingAreaId) : null;
  $("#viewEyebrow").textContent = browsingArea ? "Area · 领域内容" : cfg.eyebrow;
  $("#viewTitle").textContent = browsingArea ? browsingArea.title : cfg.title;
  $("#advancedSearchPanel").classList.toggle("hidden", currentView !== "search");
  renderCollectionAreaFilter();
  $("#filterRow").innerHTML = browsingArea
    ? `<button data-view-link="areas">← 返回领域</button><button class="${currentFilter === "all" ? "active" : ""}" data-filter="all">全部</button><button class="${currentFilter === "project" ? "active" : ""}" data-filter="project">项目</button><button class="${currentFilter === "knowledge" ? "active" : ""}" data-filter="knowledge">知识</button><button class="${currentFilter === "source" ? "active" : ""}" data-filter="source">资料</button>`
    : cfg.filters.map(([key,label]) => `<button class="${currentFilter === key ? "active" : ""}" data-filter="${key}">${label}</button>`).join("");
  const createButton = $("#collectionCreate");
  const sourceDisplayToggle = $("#sourceDisplayToggle");
  const sourceBatchToggle = $("#sourceBatchToggle");
  const galleryActive = currentView === "sources" && sourceDisplayMode === "gallery";
  sourceDisplayToggle.classList.toggle("hidden", currentView !== "sources");
  sourceBatchToggle.classList.toggle("hidden",currentView !== "sources");
  sourceBatchToggle.classList.toggle("active",sourceBatchMode && currentView === "sources");
  sourceBatchToggle.textContent=sourceBatchMode ? "批量整理中" : "批量整理";
  sourceDisplayToggle.querySelectorAll("button").forEach(button => button.classList.toggle("active",button.dataset.sourceDisplay === sourceDisplayMode));
  $("#contextCreateMenu").classList.add("hidden");
  createButton.classList.toggle("hidden", currentView === "trash");
  if (browsingArea) {
    createButton.removeAttribute("data-create");
    createButton.textContent = `＋ 添加到“${browsingArea.title}”`;
  } else if (cfg.create) {
    createButton.dataset.create = cfg.create;
    createButton.textContent = `＋ 新建${typeLabel(cfg.create)}`;
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

  visibleSourceIds=new Set(currentView === "sources" ? entries.map(entry=>entry.id) : []);
  if (currentView === "sources" && sourceBatchMode) selectedSourceIds=WorkbenchSourceBatch.reconcileSelection(selectedSourceIds,entries);

  $("#collectionStats").innerHTML = collectionStats(entries).map(([n,l]) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`).join("");
  $("#collectionList").classList.toggle("asset-gallery",galleryActive);
  $("#collectionList").classList.toggle("source-batch-mode",currentView === "sources" && sourceBatchMode);
  $("#collectionList").innerHTML = entries.map(entryCardHtml).join("");
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

function renderSourceBatchBar() {
  const active=currentView === "sources" && sourceBatchMode;
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
  $("#sourceBatchTrashCount").textContent=count;
  $("#sourceBatchSelectVisible").textContent=`全选当前显示的 ${visibleSourceIds.size} 份资料`;
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
  selectedSourceIds=WorkbenchSourceBatch.reconcileSelection(new Set(initialIds),state.entries.filter(entry=>visibleSourceIds.has(entry.id)));
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
  try { result=WorkbenchSourceBatch.applyBatchToState(state,selectedSourceIds,action,payload,WorkbenchData.isoNow()); }
  catch (error) { toast(error.message); return; }
  if (!result.affected) { sourceBatchFeedback="没有资料需要修改。"; renderSourceBatchBar(); return; }
  sourceBatchBusy=true;
  renderSourceBatchBar();
  try {
    await commitUnifiedState(result.state,`${message}：${result.affected} 份资料`);
    sourceBatchFeedback=`操作完成，共更新 ${result.affected} 份资料。`;
    if (action === "trash") selectedSourceIds.clear();
  } catch (error) {
    sourceBatchFeedback=`操作失败，未更新当前状态：${error.message}`;
    toast("批量操作失败");
  } finally {
    sourceBatchBusy=false;
    if (currentView === "sources") renderCollection();
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

function entryCardHtml(entry) {
  if (entry.type === "area") {
    const members = state.entries.filter(item => !item.deletedAt && (item.areaRefs||[]).includes(entry.id));
    return `<article class="entry-card"><button class="entry-open" data-edit="${entry.id}"><span class="entry-type entry-type--area">领域</span><div><h3>${escapeHtml(entry.title)}</h3><p>${escapeHtml(summary(entry)).slice(0,180)}</p></div><span class="entry-meta"><span class="status-pill status--${statusTone(entry)}">${statusOf(entry)}</span><br>${escapeHtml(WorkbenchData.dayOf(entry.updatedAt))}</span></button>${currentView === "trash" ? "" : `<div class="card-relations"><span>包含 ${members.filter(e=>e.type==="project").length} 个项目 · ${members.filter(e=>e.type==="knowledge").length} 条知识 · ${members.filter(e=>e.type==="source").length} 份资料</span><button data-browse-area="${entry.id}">查看该领域内容 →</button></div>`}</article>`;
  }
  if (currentView === "sources" && sourceDisplayMode === "gallery") return assetGalleryCardHtml(entry);
  const relationships = relationshipGroupsHtml(entry,{includeExternal:true});
  const batchSelecting=currentView === "sources" && sourceBatchMode && entry.type === "source";
  const selected=batchSelecting && selectedSourceIds.has(entry.id);
  const openAttribute=batchSelecting ? `data-source-batch-select="${entry.id}" aria-pressed="${selected}"` : `data-edit="${entry.id}"`;
  return `<article class="entry-card ${batchSelecting ? "source-selectable" : ""} ${selected ? "selected" : ""}"><button class="entry-open" ${openAttribute}>${batchSelecting ? `<span class="source-select-indicator" aria-hidden="true">${selected ? "✓" : ""}</span>` : ""}<span class="entry-type entry-type--${entry.type}">${typeLabel(entry.type)}</span><div><h3>${escapeHtml(entry.title)}</h3><p>${escapeHtml(summary(entry)).slice(0,180)}</p>${entry.type === "source" ? sourceFactsHtml(entry) : ""}</div><span class="entry-meta"><span class="status-pill status--${statusTone(entry)}">${statusOf(entry)}</span><br>${escapeHtml(WorkbenchData.dayOf(entry.updatedAt))}</span></button>${relationships ? `<div class="card-relations">${relationships}</div>` : ""}</article>`;
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
  const detail = [entry.fileExtension, entry.fileSize ? formatBytes(entry.fileSize) : "", assetSoftware(entry)].filter(Boolean).join(" · ");
  const visual = entry.assetId
    ? `<div class="asset-card-visual" data-asset-preview="${escapeHtml(entry.assetId)}">${assetFallbackHtml(entry)}</div>`
    : `<div class="asset-card-visual">${assetFallbackHtml(entry)}</div>`;
  const batchSelecting=sourceBatchMode && currentView === "sources";
  const selected=batchSelecting && selectedSourceIds.has(entry.id);
  const openAttribute=batchSelecting ? `data-source-batch-select="${entry.id}" aria-pressed="${selected}"` : `data-edit="${entry.id}"`;
  return `<article class="asset-card ${batchSelecting ? "source-selectable" : ""} ${selected ? "selected" : ""}"><button type="button" class="asset-card-open" ${openAttribute}>${batchSelecting ? `<span class="source-select-indicator" aria-hidden="true">${selected ? "✓" : ""}</span>` : ""}${visual}<div class="asset-card-copy"><span>${escapeHtml(entry.assetCategory || entry.sourceKind || "资料")}</span><h3>${escapeHtml(entry.title)}</h3><p>${escapeHtml(detail || summary(entry)).slice(0,150)}</p>${sourceFactsHtml(entry)}</div></button></article>`;
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
  if (currentView === "sources" && view !== "sources") exitSourceBatch(false);
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
  currentFilter = "all";
  $$(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === view || (view === "areaDetail" && b.dataset.view === "areas")));
  $("#homeView").classList.toggle("active", view === "home");
  $("#collectionView").classList.toggle("active", view !== "home" && view !== "graph");
  $("#graphView").classList.toggle("active",view === "graph");
  if (view === "home") { $("#viewEyebrow").textContent="2026 · 个人知识系统"; $("#viewTitle").textContent="今天，把经历变成方法"; }
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
    return `<div class="${klass} ref-picker" data-ref-name="${name}" data-ref-types="${placeholder}" data-ref-multiple="${multiple}"><label>${label}</label><div class="selected-refs" data-selected-for="${name}"></div><input type="search" class="ref-search" aria-label="搜索关联标题" autocomplete="off"><div class="ref-suggestions hidden"></div>${helpHtml}</div>`;
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
    return `<div class="viewer-field full"><span>${escapeHtml(label)}</span><ul class="viewer-task-list">${tasks.map(task => `<li class="${task.done ? "done" : ""}"><span>${task.done ? "✓" : ""}</span><b>${escapeHtml(task.text)}</b></li>`).join("")}</ul></div>`;
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
  return `<span class="main-toolbar-group main-toolbar-core"><span class="main-toolbar-label">格式</span>${actions(MAIN_MARKDOWN_ACTIONS.slice(0,4))}<button type="button" data-md-action="link" title="链接 / 取消链接" aria-label="链接 / 取消链接">链接</button><button type="button" data-rich-insert-image title="插入图片" aria-label="插入图片"><svg viewBox="0 0 18 18" width="14" height="14" aria-hidden="true"><rect x="1.5" y="2" width="15" height="14" rx="1" fill="none" stroke="currentColor"/><circle cx="5.5" cy="6" r="1.5" fill="#e58a34"/><path d="M2 14l5-5 3 3 2-2 4 4" fill="none" stroke="currentColor"/></svg>图片</button></span><span class="main-toolbar-group main-toolbar-headings">${actions(MAIN_MARKDOWN_ACTIONS.slice(4,7))}</span><span class="main-toolbar-group main-toolbar-size"><label class="main-size-tool">字号 <select data-rich-size aria-label="字号" ${editable ? "" : "disabled"}>${[[3,"默认 · 16"],[1,"10"],[2,"13"],[4,"18"],[5,"24"],[6,"30"],[7,"36"]].map(([value,label])=>`<option value="${value}">${label}</option>`).join("")}</select></label></span><span class="main-toolbar-group main-toolbar-foreground">${richPaletteHtml("foreColor")}</span><span class="main-toolbar-group main-toolbar-background">${richPaletteHtml("hiliteColor")}</span><span class="main-toolbar-group main-toolbar-extra">${actions(MAIN_MARKDOWN_ACTIONS.slice(7,-1))}</span>`;
}

let richSelectionRange=null;
function rememberRichSelection() {
  const editor=$("#editorDialog .main-rich-editor"),selection=window.getSelection();
  if(editor && selection?.rangeCount && editor.contains(selection.anchorNode)) richSelectionRange=selection.getRangeAt(0).cloneRange();
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

async function hydrateEmbeddedImages(root) {
  const images=[...root.querySelectorAll("img[data-asset-id]")];
  await Promise.all(images.map(async image=>{
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
}
function positionRichImageControls() {
  if(!activeRichImage?.isConnected) { hideRichImageControls(); return; }
  const imageRect=activeRichImage.getBoundingClientRect(),host=$("#editorDialog"),hostRect=host.getBoundingClientRect(),body=$("#formFields").getBoundingClientRect(),controls=$("#richImageControls");
  controls.classList.toggle("hidden",imageRect.bottom<body.top || imageRect.top>body.bottom);
  controls.style.left=`${Math.max(8,Math.min(host.clientWidth-controls.offsetWidth-8,imageRect.left-hostRect.left-host.clientLeft))}px`;
  controls.style.top=`${Math.max(body.top-hostRect.top-host.clientTop,imageRect.top-hostRect.top-host.clientTop-controls.offsetHeight-5)}px`;
  const row=activeRichImage.closest("[data-image-row]"),layout=row?.dataset.imageLayout;
  controls.querySelectorAll("[data-image-layout-option]").forEach(button=>{button.disabled=!row || row.querySelectorAll(":scope > img[data-asset-id]").length!==1;button.classList.toggle("is-active",button.dataset.imageLayoutOption===layout);});
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
  row.querySelectorAll(":scope > img[data-asset-id]").forEach(image=>image.style.removeProperty("width"));
  positionRichImageControls();
}
function deleteSelectedEmbeddedImage() {
  const image=activeRichImage,block=image?.closest("[data-image-row],[data-image-group]");
  if(!block) return;
  if(block.matches("[data-image-group]")) block.remove();
  else {
    image.remove();
    const content=[...block.childNodes].filter(node=>node.nodeType===1 || node.textContent.trim());
    for(const node of content) {
      if(node.matches?.("[data-image-text]")) {
        const paragraph=document.createElement("p");while(node.firstChild) paragraph.append(node.firstChild);node.replaceWith(paragraph);
      }
    }
    block.replaceWith(...content);
  }
  hideRichImageControls();
}
let imageDragState=null,imageDragUndo=null,imageDragScrollFrame=0;
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
  const blocks=[...editor.children].filter(node=>node!==source && node.getBoundingClientRect().height>0);
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
  const editor=$("#editorDialog .main-rich-editor"),rect=placement.target?.getBoundingClientRect() || editor.getBoundingClientRect(),zones=["left","right","full"].includes(placement.zone),width=zones ? rect.width : editor.getBoundingClientRect().width;
  preview.dataset.zone=placement.zone;
  preview.innerHTML=zones
    ? `<span class="image-drop-zone ${placement.zone==="left" ? "is-target" : ""}">图左文右</span><span class="image-drop-zone ${placement.zone==="full" ? "is-target" : ""}">大图</span><span class="image-drop-zone ${placement.zone==="right" ? "is-target" : ""}">文左图右</span>`
    : `<span class="image-drop-line-label">插入到此处</span>`;
  preview.style.left=`${zones ? rect.left : editor.getBoundingClientRect().left}px`;
  preview.style.top=`${zones ? rect.top : placement.zone==="before" ? rect.top-4 : rect.bottom-4}px`;
  preview.style.width=`${width}px`;
  preview.style.height=`${zones ? Math.max(40,rect.height) : 8}px`;
  preview.classList.remove("hidden");
}
function finishImageDrag(placement) {
  const editor=$("#editorDialog .main-rich-editor"),source=imageDragState?.source;
  if(!source || !placement || placement.target===source) return false;
  const before=editor.innerHTML;
  let block=source;
  if(source.matches("[data-image-row]")) {
    const images=[...source.querySelectorAll(":scope > img[data-asset-id]")];
    block=document.createElement("div");block.dataset.imageRow="true";block.dataset.imageLayout="full";
    images.forEach(image=>{image.style.removeProperty("width");block.append(image);});
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
  return true;
}
function placeImageTextCaret(image) {
  const row=image.closest("[data-image-row]");
  if(!row) return;
  if(row.dataset.imageLayout) {
    let paragraph=[...row.querySelectorAll(":scope > p")].at(-1) || (row.dataset.imageLayout==="full" && row.nextElementSibling?.matches("p") ? row.nextElementSibling : null);
    if(!paragraph) {
      paragraph=document.createElement("p");paragraph.append(document.createElement("br"));
      if(row.dataset.imageLayout==="full") row.after(paragraph);
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
  const image=document.createElement("img");image.dataset.assetId=asset.id;if(asset.relativePath) image.dataset.assetPath=asset.relativePath.replaceAll("\\","/");image.alt=asset.displayName || "插入的图片";image.src=presentation.mediaUrl;return image;
}
function insertImageBlock(block) {
  const editor=restoreRichSelection(),selection=window.getSelection(),range=selection?.rangeCount ? selection.getRangeAt(0) : null;
  let child=range?.startContainer;
  if(child?.nodeType!==1) child=child?.parentElement;
  while(child?.parentElement && child.parentElement!==editor) child=child.parentElement;
  if(child?.parentElement===editor) child.after(block);else editor.append(block);
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
  return `<strong class="entry-type--${escapeHtml(entry.type)}">${escapeHtml(typeLabel(entry.type))}</strong><span>创建于 ${escapeHtml(WorkbenchData.dayOf(entry.createdAt || WorkbenchData.isoNow()))}</span>`;
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
  return `<div class="main-relation-columns">${[["project","项目"],["knowledge","知识"],["source","资料"]].map(([type,label])=>
    `<section class="main-relation-column"><b>${label}</b><div class="main-relation-column-items">${items.filter(item=>(item.ref || item.entry || item).type===type).map(renderItem).join("")}</div></section>`).join("")}</div>`;
}

function compactRefPickerHtml(name,types,value,placeholder) {
  editingRefs[name]=Array.isArray(value) ? [...value] : [];
  const relation=name==="relatedRefs";
  return `<div class="ref-picker main-ref-picker ${relation ? "main-relation-picker" : ""}" data-ref-name="${name}" data-ref-types="${types}" data-ref-multiple="true">${relation ? `<input type="search" class="ref-search" aria-label="${placeholder}" placeholder="${placeholder}" autocomplete="off">` : ""}<div class="selected-refs ${relation ? "main-relation-scroll" : ""}" data-selected-for="${name}"></div>${relation ? "" : `<input type="search" class="ref-search" aria-label="${placeholder}" placeholder="${placeholder}" autocomplete="off">`}<div class="ref-suggestions hidden"></div></div>`;
}

function mainStatusSelectHtml(entry) {
  const field=schemas[entry.type].fields.find(item=>item[0] === (entry.type === "project" ? "status" : entry.type === "knowledge" ? "confidence" : "readingStatus"));
  const [name,label,,options]=field;
  return `<label class="main-status-control"><span>${escapeHtml(label)}</span><select name="${name}">${options.split(",").map(option=>{
    const [value,text]=option.split("|");
    return `<option value="${value}" ${entry[name] === value ? "selected" : ""}>${text}</option>`;
  }).join("")}</select></label>`;
}

function mainReadExtrasHtml(entry) {
  const parts=[];
  if(entry.type === "project") {
    if(entry.goal) parts.push(`<div><b>目标与场景</b><p>${escapeHtml(entry.goal)}</p></div>`);
    if(entry.tasks?.length) parts.push(`<div><b>待办列表</b>${viewerFieldHtml(schemas.project.fields.find(field=>field[0]==="tasks"),entry.tasks)}</div>`);
  } else if(entry.origin) parts.push(`<div><b>来源</b><p>${escapeHtml(entry.origin)}</p></div>`);
  if(entry.type === "project") {
    const reviews=WorkbenchRelations.groups(state,entry).reviews;
    if(reviews.length) parts.push(`<div class="relationship-groups">${relationGroupHtml("项目复盘",reviews)}</div>`);
  }
  if(entry.type === "project" && !entry.deletedAt) parts.push('<button type="button" class="secondary" data-main-project-review>写项目复盘</button>');
  return parts.length ? `<div class="main-card-secondary">${parts.join("")}</div>` : "";
}

function mainEditExtrasHtml(entry,assetPanel) {
  const parts=[];
  if(entry.type === "project") {
    parts.push(fieldHtml(schemas.project.fields.find(field=>field[0]==="goal"),entry.goal || ""));
    parts.push(fieldHtml(schemas.project.fields.find(field=>field[0]==="tasks"),entry.tasks || []));
  } else {
    parts.push(fieldHtml(schemas[entry.type].fields.find(field=>field[0]==="origin"),entry.origin || ""));
  }
  if(entry.type === "source") parts.push(assetPanel || '<p>未关联文件。可从侧边栏“导入文件”，系统会建立资料卡。</p>');
  const stored=entry.id ? entryById(entry.id) : null;
  if(stored?.type === "project") {
    const reviews=WorkbenchRelations.groups(state,stored).reviews;
    if(reviews.length) parts.push(`<div class="relationship-groups">${relationGroupHtml("项目复盘",reviews)}</div>`);
  }
  if(stored && !stored.deletedAt) parts.push('<div class="main-card-extra-actions"><button type="button" data-main-return-inbox>恢复为随手记</button><button type="button" data-main-trash>移到回收站</button></div>');
  return parts.length ? `<div class="main-card-secondary">${parts.join("")}</div>` : "";
}

function mainReadBodyHtml(entry) {
  return `<div class="main-card-page">${entry.type === "source" ? viewerAssetHtml(entry) : ""}<div class="main-markdown-content">${WorkbenchCardMarkdown.render(entry.content || "")}</div>${mainReadExtrasHtml(entry)}${originalCaptureHtml(entry)}<div class="viewer-timestamps">修改于 ${escapeHtml(WorkbenchData.dayOf(entry.updatedAt))}</div></div>`;
}

function mainEditBodyHtml(entry,assetPanel) {
  return `<div class="main-card-page"><div class="main-rich-editor main-content-input" contenteditable="true" role="textbox" aria-multiline="true" aria-label="${entry.type === "source" ? "备注与摘要" : "内容"}" data-placeholder="从这里开始记录。选中文字即可直接调整格式。">${WorkbenchCardMarkdown.render(entry.content || "")}</div><input type="hidden" name="content" value="">${mainEditExtrasHtml(entry,assetPanel)}${originalCaptureHtml(entry)}<input type="hidden" name="type" value="${entry.type}"></div>`;
}

function fitMainContentInput() {
  const editor=$("#editorDialog .main-rich-editor");
  if (!editor || !$("#editorDialog").open) return;
  editor.style.minHeight=`${Math.max(300,$("#formFields").clientHeight-70)}px`;
}

const cleanupViewerMedia = window.WorkbenchMedia.bindDialogCleanup($("#viewerDialog"));

function closeViewerDialog({ resetHistory=false }={}) {
  cleanupViewerMedia();
  const dialog = $("#viewerDialog");
  if (dialog.open) dialog.close();
  if (resetHistory) { viewerHistory = []; editorNavigationReturn=null; }
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

function openViewer(entry,{ resetHistory=false, transferRect=null, scrollTop=0 }={}) {
  if (!entry) return;
  cleanupViewerMedia();
  if (resetHistory) viewerHistory = [];
  viewedEntryId = entry.id;
  $("#viewerBack").classList.toggle("hidden",viewerHistory.length === 0 && !editorNavigationReturn);
  const mainCard=WorkbenchCardV2.MAIN_TYPES.has(entry.type);
  const dialog = $("#viewerDialog");
  dialog.classList.toggle("main-card-shell",mainCard);
  $("#viewerKicker").textContent = mainCard ? "" : `${typeLabel(entry.type)} · 阅读`;
  $("#viewerKicker").classList.toggle("hidden",mainCard);
  $("#viewerMeta").classList.toggle("hidden",!mainCard);
  $("#viewerMainInfo").classList.toggle("hidden",!mainCard);
  $("#viewerMainRelations").classList.toggle("hidden",!mainCard);
  $("#viewerMarkdownToolbar").classList.add("hidden");
  $("#editViewedEntryTop").classList.toggle("hidden",!mainCard || Boolean(entry.deletedAt));
  $("#viewerTitle").textContent = entry.title;
  $("#viewerTitle").title = `${typeLabel(entry.type)} · ${entry.title}`;
  if (mainCard) {
    const relations=WorkbenchRelations.groups(state,entry);
    $("#viewerMeta").innerHTML=mainMetaHtml(entry);
    $("#viewerMainInfo").innerHTML=`<span class="main-info-label">卡片信息</span><div class="main-area-chips">${relations.areas.map(relationButtonHtml).join("")}</div><span class="main-status-chip status--${statusTone(entry)}">${escapeHtml(statusOf(entry))}</span>`;
    $("#viewerMainRelations").innerHTML=`<div class="main-relation-title">关联内容</div><div class="main-relation-scroll">${mainRelationColumnsHtml(visibleMainRelations(entry,relations),relationButtonHtml)}</div>`;
    $("#viewerMarkdownToolbar").innerHTML="";
    $("#viewerBody").innerHTML=mainReadBodyHtml(entry);
    normalizeImageRows($("#viewerBody .main-markdown-content"));
    hydrateEmbeddedImages($("#viewerBody"));
  } else {
    const relationships = entry.type === "area" ? areaMembershipHtml(entry) : relationshipGroupsHtml(entry);
    $("#viewerBody").innerHTML = groupedViewerHtml(entry.type,entry)
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
  dialog.querySelector(".viewer-body").scrollTop = scrollTop;
  hydrateAssetPresentations([entry]);
}

function openEditor(type, entry=null, preset={}, options={}) {
  const schema = schemas[type];
  if (!schema) return;
  $("#richColorPalette").classList.add("hidden");
  hideRichImageControls();
  const model = { ...preset, ...(entry||{}) };
  editingId = entry?.id || null;
  editorReturnEntryId = options.returnEntryId || (options.returnToViewer && entry ? entry.id : null);
  editingRefs = {};
  editingTasks = (model.tasks || []).map(task => ({ ...task }));
  const mainCard=WorkbenchCardV2.MAIN_TYPES.has(type);
  const inTrash=Boolean(entry?.deletedAt);
  const dialog = $("#editorDialog");
  dialog.classList.toggle("main-card-shell",mainCard);
  dialog.classList.toggle("main-card-trash",mainCard && inTrash);
  dialog.dataset.dialogSize=mainCard ? "viewer" : "editor";
  $("#formKicker").textContent = mainCard ? "" : entry ? `编辑 · ${schema.kicker}` : schema.kicker;
  $("#formKicker").classList.toggle("hidden",mainCard);
  $("#formMeta").classList.toggle("hidden",!mainCard);
  $("#editorMainInfo").classList.toggle("hidden",!mainCard);
  $("#editorMainRelations").classList.toggle("hidden",!mainCard);
  $("#editorMarkdownToolbar").classList.toggle("hidden",!mainCard);
  $("#mainCancelTop").classList.toggle("hidden",!mainCard);
  $("#mainSaveTop").classList.toggle("hidden",!mainCard || inTrash);
  $("#mainTitleInput").classList.toggle("hidden",!mainCard);
  $("#mainTitleInput").disabled=!mainCard;
  $("#formTitle").classList.toggle("hidden",mainCard);
  $("#formTitle").textContent = entry ? entry.title : schema.title;
  $("#formTitle").title = $("#formTitle").textContent;
  if(mainCard) {
    $("#formMeta").innerHTML=mainMetaHtml({ ...model,type });
    $("#mainTitleInput").value=model.title || "";
    $("#mainTitleInput").placeholder="卡片标题";
    $("#editorMainInfo").innerHTML=`<span class="main-info-label">卡片信息</span>${compactRefPickerHtml("areaRefs","area",model.areaRefs || [],"+ 添加领域")}${mainStatusSelectHtml({ ...model,type })}`;
    $("#editorMainRelations").innerHTML=compactRefPickerHtml("relatedRefs","project,knowledge,source",model.relatedRefs || [],"搜索标题，添加关联内容");
    $("#editorMarkdownToolbar").innerHTML=mainToolbarHtml(true);
  }
  $("#formHint").textContent = schema.hint;
  const conversion = type === "capture" && entry && !entry.deletedAt
    ? `<div class="field full conversion-box"><label>这条随手记应该去哪里？</label><p>标题、来源和原始内容都会保留，并打开对应模板继续整理。</p><div><button type="button" data-convert="project">转为项目</button><button type="button" data-convert="knowledge">转为知识</button><button type="button" data-convert="source">转为资料</button></div></div>`
    : entry && !entry.deletedAt && ["project","knowledge","source"].includes(type)
      ? `<div class="field full conversion-box subtle"><label>分类错了吗？</label><p>可以恢复为随手记。当前已经填写的分类字段会被保留，以后再次转回来时仍然存在。</p><div><button type="button" data-return-inbox>恢复为随手记</button></div></div>`
      : "";
  const assetPanel = entry?.assetId
    ? `<section class="asset-panel"><h3>本地文件</h3><p>${escapeHtml(entry.assetPath || entry.fileName || "文件位置待确认")}</p><div class="asset-meta"><span>${escapeHtml(entry.assetCategory || "其他")}</span><span>${escapeHtml(entry.fileExtension || "未知格式")}</span><span>${formatBytes(entry.fileSize || 0)}</span>${entry.mediaWidth ? `<span>${entry.mediaWidth} × ${entry.mediaHeight}</span>` : ""}${entry.durationSeconds ? `<span>${formatDuration(entry.durationSeconds)}</span>` : ""}<span>${entry.assetPortable ? "随知识库移动" : "保留在原路径"}</span></div><div class="asset-panel-actions"><button type="button" data-open-asset="${escapeHtml(entry.assetId)}">打开文件</button><button type="button" data-reveal-asset="${escapeHtml(entry.assetId)}">在文件夹中显示</button><button type="button" data-relink-asset="${escapeHtml(entry.assetId)}">重新关联</button></div></section>`
    : "";
  $("#formFields").innerHTML = mainCard
    ? mainEditBodyHtml({ ...model,type },assetPanel)
    : groupedFieldsHtml(type,model,assetPanel) + relationshipOverviewHtml(entry) + (type === "source" ? "" : assetPanel) + conversion + originalCaptureHtml(model) + `<input type="hidden" name="type" value="${type}">`;
  $("#deleteEntry").classList.toggle("hidden", !entry || inTrash);
  $("#restoreEntry").classList.toggle("hidden", !inTrash);
  $("#permanentDelete").classList.toggle("hidden", !inTrash);
  $("#saveEntry").classList.toggle("hidden", inTrash);
  if(options.transferRect && window.innerWidth > WorkbenchDialogResize.NARROW_WIDTH) setCardDialogRect(dialog,WorkbenchDialogResize.fitRect(dialog.dataset.dialogSize,options.transferRect,cardDialogBounds()));
  else usePreferredCardDialogSize(dialog);
  dialog.showModal();
  if(mainCard) { normalizeImageRows($("#formFields .main-rich-editor"));hydrateEmbeddedImages($("#formFields")); }
  renderAllSelectedRefs();
  renderTaskEditor();
  $("#formFields").scrollTop=options.scrollTop || 0;
  if(mainCard) requestAnimationFrame(fitMainContentInput);
  setTimeout(() => (mainCard ? $("#mainTitleInput") : $("#formFields input, #formFields textarea"))?.focus(),50);
}

function startDialogDrag(event) {
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
    const items=[...active,...passive];
    const chip=({ref,active:isActive})=>`<span class="ref-chip type-chip type-chip--${escapeHtml(ref.type)} ${ref.type === "area" ? "area-chip" : "content-chip"}" ${isActive ? "" : 'title="这条关联保存在另一张卡片中；要解除它，请编辑建立关联的卡片。"'}><button type="button" data-open-ref="${escapeHtml(ref.id)}"><small>${escapeHtml(typeLabel(ref.type))}</small>${escapeHtml(ref.title)}</button>${isActive ? `<button type="button" data-remove-ref="${escapeHtml(ref.id)}" data-ref-field="${name}" aria-label="移除">×</button>` : ""}</span>`;
    target.innerHTML=name==="relatedRefs" ? mainRelationColumnsHtml(items,chip) : items.map(chip).join("");
  });
  const overview = document.querySelector("#editorDialog .relationship-overview .relationship-groups");
  const stored = editingId ? entryById(editingId) : null;
  if (overview && stored) {
    const groups = relationshipGroupsHtml({ ...stored, ...editingRefs });
    overview.innerHTML = groups || `<p class="empty-relations">尚未建立领域或内容关联</p>`;
  }
}

function renderTaskEditor() {
  const target = document.querySelector(".task-editor-list");
  if (!target) return;
  target.innerHTML = editingTasks.length
    ? editingTasks.map((task,index) => `<div class="task-editor-row" data-task-index="${index}"><input type="checkbox" ${task.done ? "checked" : ""} aria-label="是否完成"><input type="text" value="${escapeHtml(task.text)}" aria-label="待办内容"><button type="button" data-remove-task="${index}" aria-label="删除待办">×</button></div>`).join("")
    : `<p>还没有待办</p>`;
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
}

function closeReferenceSuggestions(exceptPicker=null) {
  $$(".ref-picker").forEach(picker => {
    if (picker !== exceptPicker) picker.querySelector(".ref-suggestions")?.classList.add("hidden");
  });
}

function saveForm(event) {
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
  const editorRect=mainCard ? $("#editorDialog").getBoundingClientRect() : null;
  const editorScroll=mainCard ? $("#formFields").scrollTop : 0;
  const entry = WorkbenchData.normalizeEntry({ ...(existing||{}), ...defaults[data.type], ...data, ...editingRefs, ...taskData, id:existing?.id || crypto.randomUUID(), deletedAt:existing?.deletedAt || null, ...(mainCard ? {structureVersion:2} : {archived:false,created:existing?.created || today(),updated:today()}), createdAt:existing?.createdAt || now, updatedAt:now });
  const reviewProject = entry.type === "review" ? entryById(entry.projectRefs?.[0]) : null;
  if (existing) state.entries = state.entries.map(e => e.id === existing.id ? entry : e); else state.entries.unshift(entry);
  $("#editorDialog").close();
  saveState(existing ? "修改已保存" : "已加入知识工作台");
  editorReturnEntryId = null;
  if (mainCard) openViewer(entry,{transferRect:editorRect,scrollTop:editorScroll});
  else if (reviewProject) openViewer(reviewProject);
}

function convertCapture(targetType) {
  const stored = entryById(editingId);
  const formData = Object.fromEntries(new FormData($("#editorForm")));
  const current = { ...stored, ...formData, ...editingRefs };
  if (!current || current.type !== "capture") return;
  const converted = WorkbenchData.normalizeEntry(WorkbenchCardV2.convertCapture(current,targetType,WorkbenchData.isoNow()));
  state.entries = state.entries.map(e => e.id === current.id ? converted : e);
  state.updatedAt = nextStateTime();
  localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
  $("#editorDialog").close();
  openEditor(targetType,converted);
  toast(`已转为${typeLabel(targetType)}，请继续整理`);
}

function returnToInbox() {
  const stored = entryById(editingId);
  if (!stored) return;
  const formData = Object.fromEntries(new FormData($("#editorForm")));
  const current = { ...stored, ...formData, ...editingRefs };
  const reverted = { ...current, type:"capture", lastMainType:current.type, rawContent:current.originalCapture?.content || current.content || current.goal || "", origin:current.originalCapture?.origin || current.origin || "", updated:today(), updatedAt:WorkbenchData.isoNow() };
  state.entries = state.entries.map(e => e.id === current.id ? reverted : e);
  state.updatedAt = nextStateTime();
  localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
  $("#editorDialog").close();
  openEditor("capture",reverted);
  toast("已恢复为随手记，原分类字段仍然保留");
}

function openReferenced(id) {
  const entry = entryById(id); if (!entry) return;
  const fromViewer = $("#viewerDialog").open;
  if ($("#editorDialog").open) {
    if ($("#editorDialog").classList.contains("main-card-shell")) {
      const dialog=$("#editorDialog"),form=$("#editorForm"),fields=Object.fromEntries(new FormData(form));
      editorNavigationReturn={type:fields.type,id:editingId,fields,richHtml:dialog.querySelector(".main-rich-editor")?.innerHTML || "",refs:structuredClone(editingRefs),tasks:structuredClone(editingTasks),rect:dialog.getBoundingClientRect(),scrollTop:$("#formFields").scrollTop};
    }
    $("#editorDialog").close();
    editorReturnEntryId=null;
  }
  if (fromViewer && viewedEntryId && viewedEntryId !== id) viewerHistory.push(viewedEntryId);
  if (entry.deletedAt) openEditor(entry.type,entry);
  else openViewer(entry,{ resetHistory:!fromViewer,transferRect:editorNavigationReturn?.rect || null });
}

function returnToEditingCard() {
  const draft=editorNavigationReturn;
  if(!draft) return;
  editorNavigationReturn=null;
  closeViewerDialog();
  const entry=draft.id ? entryById(draft.id) : null;
  openEditor(draft.type,entry,{}, {returnToViewer:Boolean(entry),transferRect:draft.rect,scrollTop:draft.scrollTop});
  Object.entries(draft.fields).forEach(([name,value])=>{
    const control=name==="title" ? $("#mainTitleInput") : $("#editorDialog [name="+CSS.escape(name)+"]");
    if(control && !["content","type"].includes(name)) control.value=value;
  });
  $("#editorDialog .main-rich-editor").innerHTML=draft.richHtml;
  editingRefs=draft.refs;
  editingTasks=draft.tasks;
  renderAllSelectedRefs();renderTaskEditor();fitMainContentInput();
}

function exportMarkdown() {
  const sections = state.entries.map(entry => {
    const readable = {...entry};
    ["areaRefs","sourceRefs","relatedRefs","projectRefs"].forEach(key => { if (readable[key]) readable[key] = readable[key].map(id => entryById(id)?.title || id); });
    const meta = Object.entries(readable).filter(([k]) => !["rawContent","summaryText","conclusion","challenge","result","content","goal","origin"].includes(k)).map(([k,v]) => `${k}: ${k === "tasks" ? JSON.stringify(v) : Array.isArray(v) ? `[${v.join(", ")}]` : String(v).replace(/\n/g," ")}`).join("\n");
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
    if (window.workbenchDesktop?.isDesktop) result = await window.workbenchDesktop.syncCards(bundle);
    else {
      const response = await fetch("/api/vault/sync-cards", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(bundle) });
      result = await response.json();
      if (!response.ok) throw new Error(result.error || "写入失败");
    }
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
    id:crypto.randomUUID(),
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
        saveState("文件已重新关联");
        await window.workbenchDesktop.syncCards(WorkbenchData.createBundle(state));
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
  refreshVaultStatus();
  refreshSearchIndexStatus();
  refreshSemanticStatus();
}

async function previewImport(file) {
  try {
    const parsed = WorkbenchData.readBundle(await file.text());
    pendingImport = parsed;
    const { report } = parsed;
    $("#importPreviewSummary").textContent = `将导入 ${report.stats.total} 张卡片，其中 ${report.stats.trash} 张位于回收站。确认后会替换当前浏览器中的全部内容。`;
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

function confirmImport() {
  if (!pendingImport?.report.ok) return;
  localStorage.setItem(`${STORAGE_KEY}-pre-import`,JSON.stringify(state));
  state = pendingImport.state;
  pendingImport = null;
  saveState("迁移包已导入");
  $("#dataDialog").close();
}

function toast(message) { const el=$("#toast"); el.textContent=message; el.classList.add("show"); clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.classList.remove("show"),1800); }

document.addEventListener("click", event => {
  const editImage=event.target.closest("#editorDialog .main-rich-editor img[data-asset-id]");
  if(editImage) { showRichImageControls(editImage);placeImageTextCaret(editImage);return; }
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
    if (entry && !entry.deletedAt) openViewer(entry,{ resetHistory:true });
    return;
  }
  const sourceDisplay = event.target.closest("[data-source-display]"); if (sourceDisplay) {
    sourceDisplayMode = sourceDisplay.dataset.sourceDisplay;
    localStorage.setItem("knowledge-workbench-source-display",sourceDisplayMode);
    renderCollection();
    return;
  }
  const areaBrowse = event.target.closest("[data-browse-area]"); if (areaBrowse) { browseArea(areaBrowse.dataset.browseArea); return; }
  const addRef = event.target.closest("[data-add-ref]"); if (addRef) {
    const name=addRef.dataset.refField, picker=addRef.closest(".ref-picker");
    if (addRef.dataset.addRef === editingId || editingRefs[name].includes(addRef.dataset.addRef)) return;
    if (picker.dataset.refMultiple !== "true") editingRefs[name]=[];
    editingRefs[name].push(addRef.dataset.addRef); picker.querySelector(".ref-search").value=""; picker.querySelector(".ref-suggestions").classList.add("hidden"); renderAllSelectedRefs(); return;
  }
  const removeRef = event.target.closest("[data-remove-ref]"); if (removeRef) { editingRefs[removeRef.dataset.refField]=editingRefs[removeRef.dataset.refField].filter(id => id !== removeRef.dataset.removeRef); renderAllSelectedRefs(); return; }
  const addTask = event.target.closest("[data-add-task]"); if (addTask) { editingTasks.push({ id:crypto.randomUUID(), text:"", done:false }); renderTaskEditor(); document.querySelector('.task-editor-row:last-child input[type="text"]')?.focus(); return; }
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
  const create=event.target.closest("[data-create]"); if (create) openEditor(create.dataset.create);
  const edit=event.target.closest("[data-edit]"); if (edit) { const entry=entryById(edit.dataset.edit); if (entry) entry.deletedAt ? openEditor(entry.type,entry) : openViewer(entry,{ resetHistory:true }); }
  const filter=event.target.closest("[data-filter]"); if (filter) {
    currentFilter=filter.dataset.filter;
    if (currentView === "search") $("#searchTypeFilter").value = currentFilter === "all" ? "" : currentFilter;
    renderCollection();
    if (currentView === "search") queueIndexedSearch(true);
  }
});

document.addEventListener("pointerdown",event=>{
  if(event.target.closest("#editorMarkdownToolbar button,#editorMarkdownToolbar select,#richColorPalette button,#richColorPalette input")) rememberRichSelection();
});
document.addEventListener("dblclick",event=>{const image=event.target.closest("#editorDialog .main-rich-editor img[data-asset-id],#viewerBody .main-markdown-content img[data-asset-id]");if(image) openInlineImagePreview(image);});
document.addEventListener("keydown",event=>{if(event.target.closest("#editorDialog .main-rich-editor")) handleImageRowKeydown(event);});
document.addEventListener("pointerdown",event=>{
  const handle=event.target.closest("[data-image-drag]");
  const source=activeRichImage?.closest("[data-image-row],[data-image-group]");
  if(!handle || !source || event.button!==0) return;
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
  if(placement) finishImageDrag(placement);
  stopImageDrag();
});
document.addEventListener("pointercancel",stopImageDrag);
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
  if(event.target.matches("#editorMarkdownToolbar [data-rich-size]")) applyRichFormat("fontSize",event.target.value);
});
document.addEventListener("input",event=>{
  if(event.target.matches("#editorDialog .main-rich-editor")) {
    imageDragUndo=null;
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
  if (event.target.closest(".task-editor-row")) {
    const row = event.target.closest(".task-editor-row");
    const task = editingTasks[Number(row.dataset.taskIndex)];
    if (task) {
      if (event.target.matches('input[type="checkbox"]')) task.done = event.target.checked;
      if (event.target.matches('input[type="text"]')) task.text = event.target.value;
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
  const affected=WorkbenchSourceBatch.countAreaRemoval(state.entries,selectedSourceIds,areaIds);
  if (!affected) { sourceBatchFeedback="所选资料都不属于这些领域。"; renderSourceBatchBar(); return; }
  if (confirm(`将从 ${affected} 份资料中移除所选领域？其他领域不会受影响。`)) runSourceBatch("remove-areas",{ areaIds },"已移除领域");
});
$("#sourceBatchSetReadingStatus").addEventListener("click",()=>runSourceBatch("set-reading-status",{ readingStatus:$("#sourceBatchReadingStatus").value },"已更新阅读状态"));
$("#sourceBatchTrash").addEventListener("click",()=>{
  const count=selectedSourceIds.size;
  if (count && confirm(`将选中的 ${count} 份资料移到回收站？原始文件不会删除，之后仍可恢复。`)) runSourceBatch("trash",{},"已移到回收站");
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
function closeViewerAndResetHistory() {
  closeViewerDialog({ resetHistory:true });
}
$("#closeViewer").addEventListener("click",closeViewerAndResetHistory);
$("#closeViewerBottom").addEventListener("click",closeViewerAndResetHistory);
$("#viewerDialog").addEventListener("cancel",()=>{viewerHistory=[];editorNavigationReturn=null;});
$("#viewerBack").addEventListener("click",()=>{
  const previousId = viewerHistory.pop();
  const previous = entryById(previousId);
  if (previous) openViewer(previous);
  else if(editorNavigationReturn) returnToEditingCard();
  else $("#viewerBack").classList.add("hidden");
});
$("#editViewedEntry").addEventListener("click",()=>{
  const entry = entryById(viewedEntryId);
  if (!entry) return;
  const mainCard=WorkbenchCardV2.MAIN_TYPES.has(entry.type);
  const transferRect=mainCard ? $("#viewerDialog").getBoundingClientRect() : null;
  const scrollTop=mainCard ? $("#viewerBody").scrollTop : 0;
  closeViewerDialog();
  openEditor(entry.type,entry,{}, { returnToViewer:true,transferRect,scrollTop });
});
$("#startProjectReview").addEventListener("click",()=>startReviewForProject(entryById(viewedEntryId)));
$("#cancelEdit").addEventListener("click",()=>{
  const returnEntry = editorReturnEntryId ? entryById(editorReturnEntryId) : null;
  const mainCard=returnEntry && WorkbenchCardV2.MAIN_TYPES.has(returnEntry.type);
  const transferRect=mainCard ? $("#editorDialog").getBoundingClientRect() : null;
  const scrollTop=mainCard ? $("#formFields").scrollTop : 0;
  $("#editorDialog").close();
  editorReturnEntryId = null;
  if (returnEntry) openViewer(returnEntry,{transferRect,scrollTop});
});
$("#editorForm").addEventListener("submit",saveForm);
$("#deleteEntry").addEventListener("click",()=>{
  const entry=entryById(editingId); if (!entry || !confirm("将这条内容移到回收站吗？之后可以恢复。")) return;
  entry.deletedAt=new Date().toISOString(); $("#editorDialog").close();
  if (editingId === browsingAreaId) switchView("areas");
  saveState("已移到回收站");
});
$("#restoreEntry").addEventListener("click",()=>{
  const entry=entryById(editingId); if (!entry) return;
  entry.deletedAt=null; $("#editorDialog").close(); saveState("内容已恢复");
});
$("#permanentDelete").addEventListener("click",()=>{
  const entry=entryById(editingId);
  if (!entry?.deletedAt) { toast("只有回收站中的卡片可以永久删除"); return; }
  if (!confirm(`将“${entry.title}”永久删除？卡片正文将无法恢复，但关联的原始文件会保留。`)) return;
  state.tombstones ||= [];
  state.tombstones = WorkbenchData.normalizeTombstones([...state.tombstones, { id:entry.id, type:entry.type, deletedAt:WorkbenchData.isoNow() }]);
  state.entries=state.entries.filter(e=>e.id!==editingId);
  state.entries.forEach(e=>["areaRefs","sourceRefs","relatedRefs","projectRefs"].forEach(k=>{ if(e[k]) e[k]=e[k].filter(id=>id!==editingId); }));
  $("#editorDialog").close(); saveState("内容已永久删除");
});
$("#searchInput").addEventListener("input",event=>{
  const hasQuery = event.target.value.trim().length > 0;
  $("#clearSearch").classList.toggle("hidden",!hasQuery);
  $(".search-wrap").classList.toggle("searching",hasQuery);
  if (hasQuery) {
    if (currentView !== "search") { searchReturnView=currentView; searchReturnAreaId=browsingAreaId; switchView("search"); }
    else renderCollection();
    queueIndexedSearch();
  } else if (currentView === "search") exitSearch();
  else render();
});
$("#clearSearch").addEventListener("click",exitSearch);
$("#clearSearchFilters").addEventListener("click",()=>clearAdvancedSearchFilters(true));
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
$("#refreshIndexStatus").addEventListener("click",refreshSearchIndexStatus);
$("#rebuildSearchIndex").addEventListener("click",rebuildDesktopSearchIndex);
$("#refreshSemanticStatus").addEventListener("click",refreshSemanticStatus);
$("#rebuildSemanticIndex").addEventListener("click",rebuildDesktopSemanticIndex);
$("#semanticModelSelect").addEventListener("change",saveSemanticPreferences);
$("#semanticDeviceSelect").addEventListener("change",saveSemanticPreferences);
$("#exportBundle").addEventListener("click",()=>{ WorkbenchData.exportBundle(state,today()); toast("完整迁移包已导出"); });
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
  const dialog=button.closest(".card-resizable");
  WorkbenchDialogResize.restoreDefault(dialog.dataset.dialogSize,localStorage);
  if (dialog.open) usePreferredCardDialogSize(dialog,{reset:true});
}));
window.addEventListener("resize",()=>{fitOpenCardDialogs();fitMainContentInput();});
document.addEventListener("keydown",e=>{
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();$("#searchInput").focus();}
  if(e.key==="Escape") closeReferenceSuggestions();
  if(e.key==="Escape" && currentView==="search" && !$("#editorDialog").open && !$("#viewerDialog").open){e.preventDefault();exitSearch();}
});

initializeSemanticPreferences();
render();
hydrateDesktopState();
