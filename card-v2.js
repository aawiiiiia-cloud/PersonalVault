(function (global) {
  "use strict";

  const VERSION = 2;
  const MAIN_TYPES = new Set(["project", "knowledge", "source"]);
  const ASSET_FIELDS = [
    "assetId", "assetPath", "assetCategory", "assetStorageMode", "assetPortable",
    "fileName", "fileExtension", "fileSize", "fileModifiedAt", "contentHash",
    "mediaWidth", "mediaHeight", "durationSeconds", "videoCodec", "audioCodec", "sourceKind"
  ];

  function text(value) { return String(value ?? "").trim(); }
  function uniqueIds(values) { return [...new Set((Array.isArray(values) ? values : []).filter(Boolean))]; }
  function joinSections(sections) {
    const seen = new Set();
    return sections.map(([label,value]) => {
      const body=text(value);
      if (!body || seen.has(body)) return "";
      seen.add(body);
      return label ? `${label}\n${body}` : body;
    }).filter(Boolean).join("\n\n");
  }
  function captureOriginal(value) {
    if (!value) return null;
    if (typeof value === "string") return { content:value };
    const content=text(value.content);
    if (!content) return null;
    return { content, ...(text(value.origin) ? { origin:text(value.origin) } : {}) };
  }
  function tasksFrom(entry) {
    const source=Array.isArray(entry.tasks) && entry.tasks.length ? entry.tasks : text(entry.nextStep) ? [{ text:text(entry.nextStep),done:false }] : [];
    return source.map((task,index)=>({ id:String(task?.id || `${entry.id}-task-${index+1}`),text:text(task?.text),done:Boolean(task?.done) })).filter(task=>task.text);
  }
  function projectStatus(status) {
    return ({ not_started:"not_started",active:"active",paused:"paused",done:"done",inactive:"paused",archived:"done" })[status] || "not_started";
  }
  function knowledgeConfidence(confidence) {
    return ({ draft:"draft",basic:"basic",reviewed:"reviewed",evergreen:"reviewed",superseded:"draft" })[confidence] || "draft";
  }
  function readingStatus(status) { return ["unread","reading","processed"].includes(status) ? status : "unread"; }

  function migrateEntry(entry) {
    if (!MAIN_TYPES.has(entry?.type)) return { ...entry };
    if(Number(entry.structureVersion || 1)>VERSION) throw new Error(`卡片“${entry.title || entry.id}”使用更新的数据版本，请升级应用后打开`);
    const alreadyV2=Number(entry.structureVersion) >= VERSION;
    const output={
      ...(alreadyV2 ? entry : {}),
      id:entry.id,type:entry.type,title:entry.title,structureVersion:VERSION,
      createdAt:entry.createdAt || entry.created,updatedAt:entry.updatedAt || entry.updated,
      deletedAt:entry.deletedAt || null,
      areaRefs:uniqueIds(entry.areaRefs),
      relatedRefs:uniqueIds([...(entry.relatedRefs || []),...(entry.projectRefs || [])]).filter(id=>id!==entry.id)
    };
    // Preserve the original structured record once; generated display text is
    // not a substitute for the source fields. Normalization stays idempotent.
    if(entry.legacyRecord) output.legacyRecord=entry.legacyRecord;
    else if(!alreadyV2) output.legacyRecord={...entry,structureVersion:Number(entry.structureVersion || 1)};
    if (entry.archived) output.archived=true;
    if (entry.canvasVersion === 1) output.canvasVersion=1;
    if (typeof entry.legacyContent === "string") output.legacyContent=entry.legacyContent;
    if (Array.isArray(entry.sourceRefs) && entry.sourceRefs.length) output.sourceRefs=uniqueIds(entry.sourceRefs);
    const original=captureOriginal(entry.originalCapture);
    if (original) output.originalCapture=original;

    if (entry.type === "project") {
      output.status=projectStatus(entry.status);
      output.tasks=tasksFrom(entry);
      output.goal=alreadyV2 ? text(entry.goal) : joinSections([
        ["当前问题",entry.challenge || entry.goal], ["希望结果",entry.desired]
      ]);
      const taskTexts=new Set(output.tasks.map(task=>task.text));
      output.content=alreadyV2 ? text(entry.content) : joinSections([
        ["",entry.content], ["项目起因",entry.origin], ["原始记录",entry.rawContent],
        ["现成能力",entry.existingSolution || entry.reuse], ["需要自己判断",entry.customDecision || entry.build],
        ["执行方式",({self:"主要由我完成",collaboration:"我与 Agent 协作",agent:"主要由 Agent 代做",external:"使用现成产品或他人完成"})[entry.executionMode] || entry.executionMode],
        ["我的角色",entry.myRole], ["他人或 Agent 的工作",entry.agentWork],
        ["下一步",taskTexts.has(text(entry.nextStep)) ? "" : entry.nextStep]
      ]);
    } else if (entry.type === "knowledge") {
      output.confidence=knowledgeConfidence(entry.confidence);
      output.origin=alreadyV2 ? text(entry.origin) : joinSections([["",entry.origin || entry.source]]);
      output.content=alreadyV2 ? text(entry.content) : joinSections([
        ["",entry.content], ["结论",entry.conclusion], ["适用场景",entry.applies],
        ["边界与例外",entry.limits], ["原始记录",entry.rawContent],
        ["原有置信状态",entry.confidence === "evergreen" ? "长期有效" : entry.confidence === "superseded" ? "已被替代" : ""]
      ]);
    } else {
      output.readingStatus=readingStatus(entry.readingStatus || (entry.status === "processed" ? "processed" : "unread"));
      output.origin=alreadyV2 ? text(entry.origin) : joinSections([["",entry.origin],["链接",entry.url]]);
      output.content=alreadyV2 ? text(entry.content) : joinSections([
        ["",entry.content], ["摘要",entry.summaryText], ["原始内容",entry.rawContent], ["待进一步处理",entry.candidate]
      ]);
      ASSET_FIELDS.forEach(field=>{ if (Object.hasOwn(entry,field)) output[field]=entry[field]; });
    }
    return output;
  }

  function convertCapture(entry,type,now) {
    if (entry?.type !== "capture" || !MAIN_TYPES.has(type)) throw new Error("只能将随手记转为主卡片");
    const origin=text(entry.origin);
    const returning=entry.structureVersion >= VERSION && entry.lastMainType === type;
    const original=captureOriginal(entry.originalCapture) || captureOriginal({ content:entry.rawContent || entry.content, origin });
    return migrateEntry({
      id:entry.id,type,title:entry.title,structureVersion:VERSION,
      createdAt:entry.createdAt || entry.created,updatedAt:now,deletedAt:entry.deletedAt || null,
      areaRefs:entry.areaRefs || [],relatedRefs:entry.relatedRefs || [],
      ...(original ? {originalCapture:original} : {}),
      ...(type === "project" ? {status:returning ? entry.status : "not_started",goal:returning ? entry.goal : "",tasks:returning ? entry.tasks : [],content:returning ? entry.content : ""} : {}),
      ...(type === "knowledge" ? {confidence:returning ? entry.confidence : "draft",origin:returning ? entry.origin : origin,content:returning ? entry.content : ""} : {}),
      ...(type === "source" ? {readingStatus:returning ? entry.readingStatus : "unread",origin:returning ? entry.origin : origin,content:returning ? entry.content : "",sourceKind:returning ? entry.sourceKind : "其他"} : {}),
      ...(returning && type === "source" ? Object.fromEntries(ASSET_FIELDS.filter(field=>Object.hasOwn(entry,field)).map(field=>[field,entry[field]])) : {}),
      ...(Array.isArray(entry.sourceRefs) && entry.sourceRefs.length ? {sourceRefs:entry.sourceRefs} : {})
    });
  }

  const api={VERSION,MAIN_TYPES,ASSET_FIELDS,migrateEntry,convertCapture,projectStatus,knowledgeConfidence,readingStatus};
  global.WorkbenchCardV2=api;
  if (typeof module !== "undefined" && module.exports) module.exports=api;
})(typeof window !== "undefined" ? window : globalThis);
