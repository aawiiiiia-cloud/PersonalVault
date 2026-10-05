(function (global) {
  "use strict";

  const CONTENT_TYPES = new Set(["project", "knowledge", "source"]);
  const ACTIVE_REF_FIELDS = ["relatedRefs", "sourceRefs", "projectRefs"];

  function selectable(entries, currentId, query = "") {
    const needle = String(query).trim().toLocaleLowerCase();
    return entries.filter(entry => CONTENT_TYPES.has(entry.type) && !entry.deletedAt && entry.id !== currentId && (!needle || String(entry.title || "").toLocaleLowerCase().includes(needle)));
  }

  function groups(state, card) {
    const entries = (state.entries || []).filter(entry => !entry.deletedAt && !(state.tombstones || []).some(item => item.id === entry.id));
    const byId = new Map(entries.map(entry => [entry.id, entry]));
    const resolve = ids => [...new Set(ids || [])].map(id => byId.get(id)).filter(Boolean);
    const outgoing = CONTENT_TYPES.has(card.type) ? resolve(card.relatedRefs).filter(entry => CONTENT_TYPES.has(entry.type) && entry.id !== card.id) : [];
    const evidence = card.type === "knowledge" ? resolve(card.sourceRefs).filter(entry => ["project", "review", "source"].includes(entry.type)) : [];
    const outgoingIds = new Set(outgoing.map(entry => entry.id));
    const incoming = entries.filter(entry => entry.id !== card.id && CONTENT_TYPES.has(entry.type) && ACTIVE_REF_FIELDS.some(field => (entry[field] || []).includes(card.id)));
    const incomingIds = new Set(incoming.map(entry => entry.id));
    return {
      areas:resolve(card.areaRefs).filter(entry => entry.type === "area"),
      evidence,
      outgoing:outgoing.map(entry => ({ entry, bidirectional:incomingIds.has(entry.id) })),
      incoming:incoming.filter(entry => !outgoingIds.has(entry.id)).map(entry => ({ entry, bidirectional:false })),
      reviews:card.type === "project" ? entries.filter(entry => entry.type === "review" && (entry.projectRefs || []).includes(card.id)) : []
    };
  }

  function detach(entries,currentId,removedIds,updatedAt) {
    const removed=new Set(removedIds);
    if(!removed.size)return entries;
    return entries.map(entry=>{
      if(entry.id!==currentId&&!removed.has(entry.id))return entry;
      const patch={};
      for(const field of ACTIVE_REF_FIELDS){
        if(!Array.isArray(entry[field]))continue;
        const ids=entry[field].filter(id=>entry.id===currentId?!removed.has(id):id!==currentId);
        if(ids.length!==entry[field].length)patch[field]=ids;
      }
      return Object.keys(patch).length?{...entry,...patch,updatedAt,updated:String(updatedAt).slice(0,10)}:entry;
    });
  }
  const api = { CONTENT_TYPES, ACTIVE_REF_FIELDS, selectable, groups, detach };
  global.WorkbenchRelations = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
