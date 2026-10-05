import '../../../attachment-cache.js';
const cache=window.WorkbenchAttachmentCache;
export class CanvasBlobSource {
  readonly=false;
  links={};urls={};names={};drafts=new Set();pending=new Map();
  constructor(){this.lease=cache.lease();}
  configure(snapshot,urls={}){this.links={...(snapshot?.linkedAssets||{})};this.urls={...urls};for(const asset of snapshot?.attachments||[]){this.names[asset.id]=asset.name;}this.lease.update(this.drafts);}
  isDraft(id){return this.drafts.has(id);}
  descriptor(id){const assetId=this.links[id];return this.isDraft(id)||!assetId?{draftKey:id}:{assetId,url:this.urls[assetId]||null,saved:true};}
  async set(id,blob){this.drafts.add(id);this.lease.update(this.drafts);await cache.put(id,blob);return id;}
  async get(id){
    if(this.isDraft(id)||!this.links[id]){let blob=await cache.get(id);if(!blob&&!this.links[id]){blob=await cache.legacy(id);if(blob)await this.set(id,blob);}return blob;}
    const url=this.urls[this.links[id]];if(!url)return null;
    if(!this.pending.has(id)){
      const promise=fetch(url,{cache:'no-store'}).then(response=>response.ok?response.blob():null).catch(()=>null).finally(()=>this.pending.delete(id));this.pending.set(id,promise);
    }
    return this.pending.get(id);
  }
  async list(){return [...new Set([...Object.keys(this.links),...this.drafts])];}
  async delete(id){this.drafts.delete(id);this.lease.update(this.drafts);await cache.delete([id]);}
  protect(ids){this.lease.update([...ids].filter(id=>this.isDraft(id)||!this.links[id]));}
  async commit(snapshot,urls){this.configure(snapshot,urls);const saved=Object.keys(snapshot.linkedAssets||{});saved.forEach(id=>this.drafts.delete(id));this.lease.update(this.drafts);cache.publishSaved(snapshot,urls);await cache.delete(saved);await cache.deleteLegacy(saved);}
}
