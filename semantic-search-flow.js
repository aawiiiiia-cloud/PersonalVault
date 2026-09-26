(function(root,factory){
  const api=factory();
  if(typeof module!=="undefined"&&module.exports) module.exports=api;
  else root.WorkbenchSemanticSearch=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  function queryEligibility(value){
    const query=String(value||"").trim();
    if(!query) return {eligible:false,reason:"empty"};
    const compact=query.replace(/\s+/g,"");
    const letters=query.match(/\p{L}/gu)||[];
    const numbers=query.match(/\p{N}/gu)||[];
    if(!letters.length) return {eligible:false,reason:"non-language"};
    if(compact.length>=8&&!/\s/.test(query)&&numbers.length/compact.length>=.5) return {eligible:false,reason:"identifier-like"};
    return {eligible:true,reason:null};
  }

  function createLoadOnce(load){
    let promise=null;
    let state="idle";
    let error=null;
    return {
      prepare(){
        if(promise) return promise;
        state="loading";
        promise=Promise.resolve().then(load).then(result=>{
          state="ready";
          return result;
        },reason=>{
          state="failed";
          error=reason instanceof Error?reason:new Error(String(reason));
          throw error;
        });
        return promise;
      },
      get state(){return state;},
      get error(){return error;}
    };
  }

  function createCoordinator({search,warm,onExact,onPreparing,onHybrid,onSkipped,onLoadError,onSearchError}){
    const loader=createLoadOnce(warm);
    let latestRequest=0;
    async function run(options){
      const request=++latestRequest;
      const current=()=>request===latestRequest;
      try{
        const exact=await search({...options,mode:"exact"});
        if(!current()) return {stale:true};
        onExact?.(exact,options);
        if(options.mode!=="hybrid") return {exact};
        const eligibility=queryEligibility(options.query);
        if(!eligibility.eligible){
          onSkipped?.(exact,eligibility.reason,options);
          return {exact,skipped:eligibility.reason};
        }
        onPreparing?.(exact,options);
        try{ await loader.prepare(); }
        catch(error){
          if(current()) onLoadError?.(error,exact,options);
          return {exact,error};
        }
        if(!current()) return {exact,stale:true};
        const hybrid=await search({...options,mode:"hybrid"});
        if(!current()) return {exact,hybrid,stale:true};
        onHybrid?.(hybrid,options);
        return {exact,hybrid};
      }catch(error){
        if(current()) onSearchError?.(error,options);
        return {error};
      }
    }
    return {
      run,
      prepare:()=>loader.prepare(),
      invalidate(){latestRequest+=1;},
      get loadState(){return loader.state;},
      get loadError(){return loader.error;}
    };
  }

  return {queryEligibility,createLoadOnce,createCoordinator};
});
