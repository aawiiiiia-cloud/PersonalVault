(function(){
  const DRAFT='personalvault-attachment-drafts-v1',LEGACY='personalvault-blocksuite-edgeless-prototype-v10-assets';
  const open=(name,store)=>new Promise((resolve,reject)=>{const request=indexedDB.open(name,1);request.onupgradeneeded=()=>request.result.createObjectStore(store);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  async function access(name,store,mode,action){const db=await open(name,store);return new Promise((resolve,reject)=>{const tx=db.transaction(store,mode);let result;try{action(tx.objectStore(store),value=>result=value);}catch(error){db.close();reject(error);return;}tx.oncomplete=()=>{db.close();resolve(result);};tx.onerror=()=>{db.close();reject(tx.error);};tx.onabort=tx.onerror;});}
  const read=(name,store,key)=>access(name,store,'readonly',(s,done)=>{const r=s.get(key);r.onsuccess=()=>done(r.result);});
  const remove=(name,store,ids)=>access(name,store,'readwrite',s=>ids.forEach(id=>s.delete(id)));
  const leasePrefix='personalvault-draft-lease:';
  const savedListeners=new Set(),channel=new BroadcastChannel('personalvault-attachment-saved');
  channel.onmessage=event=>savedListeners.forEach(listener=>listener(event.data));
  function lease(){const key=leasePrefix+crypto.randomUUID();let ids=[];const renew=()=>{try{localStorage.setItem(key,JSON.stringify({expires:Date.now()+300000,ids}));}catch{}};const timer=setInterval(renew,30000);const release=()=>{clearInterval(timer);try{localStorage.removeItem(key);}catch{}void api.delete(ids).catch(console.warn);};window.addEventListener('pagehide',release,{once:true});return {update(values){const old=ids;ids=[...values];renew();void api.delete(old.filter(id=>!ids.includes(id))).catch(console.warn);},release};}
  function protectedIds(){const ids=new Set();for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(!key?.startsWith(leasePrefix))continue;try{const value=JSON.parse(localStorage.getItem(key));if(value.expires>Date.now())value.ids.forEach(id=>ids.add(id));}catch{}}return ids;}
  async function entries(name,store){const result=[];await access(name,store,'readonly',(s,done)=>{const request=s.openCursor();request.onsuccess=()=>{const cursor=request.result;if(!cursor){done();return;}const value=cursor.value;result.push({id:cursor.key,size:value.size??value.byteLength??0});cursor.continue();};});return result;}
  async function legacyIds(){const databases=await indexedDB.databases();if(!databases.some(db=>db.name===LEGACY+'_blob'))return [];return entries(LEGACY+'_blob','blob');}
  const api={
    lease,
    onSaved(listener){savedListeners.add(listener);return ()=>savedListeners.delete(listener);},
    publishSaved(snapshot,urls){const data={links:snapshot.linkedAssets,urls};savedListeners.forEach(listener=>listener(data));channel.postMessage(data);},
    async put(id,blob){await access(DRAFT,'files','readwrite',s=>s.put({blob,size:blob.size,createdAt:Date.now()},id));},
    async get(id){return (await read(DRAFT,'files',id))?.blob||null;},
    async delete(ids){const active=protectedIds();await remove(DRAFT,'files',ids.filter(id=>!active.has(id)));},
    async legacy(id){const available=await indexedDB.databases();if(!available.some(db=>db.name===LEGACY+'_blob'))return null;const bytes=await read(LEGACY+'_blob','blob',id);if(!bytes)return null;const type=await read(LEGACY+'_blob_mime','blob_mime',id);return new Blob([bytes],{type:type||'application/octet-stream'});},
    async deleteLegacy(ids){const active=protectedIds();ids=ids.filter(id=>!active.has(id));if(!ids.length)return;const dbs=await indexedDB.databases();if(dbs.some(db=>db.name===LEGACY+'_blob'))await remove(LEGACY+'_blob','blob',ids);if(dbs.some(db=>db.name===LEGACY+'_blob_mime'))await remove(LEGACY+'_blob_mime','blob_mime',ids);},
    async stats(){const [drafts,legacy]=await Promise.all([entries(DRAFT,'files'),legacyIds()]);const active=protectedIds();return {draftBytes:drafts.reduce((n,v)=>n+v.size,0),legacyBytes:legacy.reduce((n,v)=>n+v.size,0),activeBytes:drafts.filter(v=>active.has(v.id)).reduce((n,v)=>n+v.size,0),count:drafts.length+legacy.length};},
    async clear(){await api.delete((await entries(DRAFT,'files')).map(v=>v.id));await api.deleteLegacy((await legacyIds()).map(v=>v.id));return api.stats();}
  };
  window.WorkbenchAttachmentCache=api;
})();
