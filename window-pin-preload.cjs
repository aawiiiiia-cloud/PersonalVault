const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('workbenchWindow',{
  pinStatus:()=>ipcRenderer.invoke('window:pinStatus'),
  setPinned:pinned=>ipcRenderer.invoke('window:setPinned',pinned),
  resolveAsset:(cardId,sourceId,hint)=>ipcRenderer.invoke('canvas:resolveAsset',cardId,sourceId,hint),
  openAsset:assetId=>ipcRenderer.invoke('assets:open',assetId),
  revealAsset:assetId=>ipcRenderer.invoke('assets:reveal',assetId)
});
