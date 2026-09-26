(function(root,factory){
  const api=factory();
  if(typeof module!=="undefined"&&module.exports) module.exports=api;
  else root.WorkbenchCollectionFilter=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  const ALL_AREAS="all";
  const UNASSIGNED_AREA="unassigned";

  function matchesArea(entry,areaFilter=ALL_AREAS){
    const refs=Array.isArray(entry?.areaRefs)?entry.areaRefs:[];
    if(!areaFilter||areaFilter===ALL_AREAS) return true;
    if(areaFilter===UNASSIGNED_AREA) return refs.length===0;
    return refs.includes(areaFilter);
  }

  function filterByArea(entries,areaFilter=ALL_AREAS){
    return (entries||[]).filter(entry=>matchesArea(entry,areaFilter));
  }

  return {ALL_AREAS,UNASSIGNED_AREA,matchesArea,filterByArea};
});
