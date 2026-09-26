(function (global) {
  "use strict";

  const ACTIONS=new Set(["add-areas","remove-areas","set-reading-status","trash"]);
  const READING_STATUSES=new Set(["unread","reading","processed"]);

  function uniqueIds(values=[]) {
    return [...new Set((values || []).filter(Boolean).map(String))];
  }

  function reconcileSelection(selectedIds,visibleEntries) {
    const visible=new Set((visibleEntries || []).filter(entry=>entry?.type === "source" && !entry.deletedAt).map(entry=>entry.id));
    return new Set(uniqueIds([...selectedIds]).filter(id=>visible.has(id)));
  }

  function applyBatchToState(state,selectedIds,action,payload={},now=new Date().toISOString()) {
    if (!ACTIONS.has(action)) throw new Error(`无法识别批量操作：${action}`);
    const selected=new Set(uniqueIds([...selectedIds]));
    const areaIds=uniqueIds(payload.areaIds);
    if (["add-areas","remove-areas"].includes(action) && !areaIds.length) throw new Error("请至少选择一个领域");
    if (action === "set-reading-status" && !READING_STATUSES.has(payload.readingStatus)) throw new Error("阅读状态无效");
    const updated=String(now).slice(0,10);
    const affectedIds=[];
    const entries=(state?.entries || []).map(entry=>{
      if (entry?.type !== "source" || entry.deletedAt || !selected.has(entry.id)) return entry;
      let change={};
      if (action === "add-areas") {
        const next=uniqueIds([...(entry.areaRefs || []),...areaIds]);
        if (next.length === (entry.areaRefs || []).length) return entry;
        change.areaRefs=next;
      }
      if (action === "remove-areas") {
        const remove=new Set(areaIds);
        const next=(entry.areaRefs || []).filter(id=>!remove.has(id));
        if (next.length === (entry.areaRefs || []).length) return entry;
        change.areaRefs=next;
      }
      if (action === "set-reading-status") {
        if (entry.readingStatus === payload.readingStatus) return entry;
        change.readingStatus=payload.readingStatus;
      }
      if (action === "trash") change.deletedAt=now;
      affectedIds.push(entry.id);
      return { ...entry,...change,updatedAt:now,updated };
    });
    return {
      state:{ ...state,entries,updatedAt:affectedIds.length ? now : state.updatedAt },
      affected:affectedIds.length,
      affectedIds
    };
  }

  function countAreaRemoval(entries,selectedIds,areaIds) {
    const selected=new Set(uniqueIds([...selectedIds]));
    const remove=new Set(uniqueIds(areaIds));
    return (entries || []).filter(entry=>entry?.type === "source" && !entry.deletedAt && selected.has(entry.id) && (entry.areaRefs || []).some(id=>remove.has(id))).length;
  }

  function mergeImportedAssets(entries,assets,createEntry) {
    const next=[...(entries || [])];
    const createdIds=[];
    let reused=0;
    (assets || []).forEach(asset=>{
      const existing=next.find(entry=>entry.assetId === asset.id && !entry.deletedAt);
      if (existing) { reused+=1; return; }
      const entry=createEntry(asset);
      next.unshift(entry);
      createdIds.push(entry.id);
    });
    return { entries:next,createdIds,reused };
  }

  const api={ uniqueIds,reconcileSelection,applyBatchToState,countAreaRemoval,mergeImportedAssets };
  global.WorkbenchSourceBatch=api;
  if (typeof module !== "undefined" && module.exports) module.exports=api;
})(typeof window !== "undefined" ? window : globalThis);
