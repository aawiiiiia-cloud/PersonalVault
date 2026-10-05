(function(global){
  'use strict';
  // One session owns the disk baseline and serializes its saves. Local caches
  // never supply a disk revision and cannot become authoritative on startup.
  const stable=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item);
  function create({load,sync,normalize=state=>state}) {
    let revision=null, queue=Promise.resolve(), blocked=false, ready=false, failedBundle=null;
    let baseCards=new Map(), bound=false;
    const ownChanges=new Map();
    async function open() {
      await queue;
      let result;
      try {
        result=await load();
        if(bound&&revision?.identity!==result.revision?.identity)throw new Error('当前资料库已断开或被替换，请重新连接原资料库后再载入；未使用本机缓存创建替代资料库');
      }
      catch(error){ready=false;blocked=true;throw error;}
      revision=result.revision;
      bound=Boolean(result.found);
      baseCards=new Map((normalize(result.state)?.entries || []).map(card=>[card.id,stable(card)]));
      ownChanges.clear();
      ready=true;blocked=false;failedBundle=null;
      return result;
    }
    function save(bundle) {
      const captured=structuredClone(bundle);
      const expected=structuredClone(revision);
      const nextCards=new Map((captured.cards || []).map(card=>[card.id,stable(card)]));
      const changedIds=Array.isArray(captured.changedIds)?[...new Set([...captured.changedIds,...Object.keys(captured.canvasDocuments || {})])]:[...new Set([...baseCards.keys(),...nextCards.keys(),...Object.keys(captured.canvasDocuments || {})])].filter(id=>Object.hasOwn(captured.canvasDocuments || {},id)||baseCards.get(id)!==nextCards.get(id));
      captured.changedIds=changedIds;
      const operation=queue.then(async()=>{
        if(!ready || blocked) {failedBundle=captured;throw new Error('资料库尚未载入或上次保存失败，请先导出未保存内容，再重新载入资料库');}
        try {
          const baseRevision=expected?.cards ? {...expected,cards:{...expected.cards}} : revision;
          for(const id of changedIds) {
            const history=ownChanges.get(id),seen=new Set();
            let hash=baseRevision?.cards?.[id];
            while(history?.has(hash)&&!seen.has(hash)){seen.add(hash);hash=history.get(hash);}
            if(baseRevision?.cards) {if(hash===undefined)delete baseRevision.cards[id];else baseRevision.cards[id]=hash;}
          }
          const result=await sync({...captured,changedIds,baseRevision,requireRevision:true});
          for(const id of changedIds)if(baseRevision?.cards&&result.revision?.cards) {
            if(!ownChanges.has(id))ownChanges.set(id,new Map());
            ownChanges.get(id).set(baseRevision.cards[id],result.revision.cards[id]);
          }
          revision=result.revision;
          bound=true;
          baseCards=new Map((normalize(result.state || {entries:captured.cards})?.entries || []).map(card=>[card.id,stable(card)]));
          return result;
        } catch(error) {blocked=true;failedBundle=captured;throw error;}
      });
      queue=operation.catch(()=>{});
      return operation;
    }
    async function assertFresh() {
      await queue;
      if(!ready || blocked) throw new Error('资料库尚未载入或上次保存失败，请重新载入后再保存');
      const current=await load();
      if(JSON.stringify(current.revision)!==JSON.stringify(revision)) {
        blocked=true;
        throw new Error('硬盘中的卡片已发生变化，已停止保存，请先导出未保存内容，再重新载入资料库后核对');
      }
    }
    return {open,save,assertFresh,get ready(){return ready;},get blocked(){return blocked;},get failedBundle(){return failedBundle?structuredClone(failedBundle):null;}};
  }
  const api={create};global.WorkbenchVaultSession=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
