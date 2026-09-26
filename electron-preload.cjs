const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("workbenchDesktop", {
  isDesktop: true,
  platform: process.platform,
  vaultStatus: () => ipcRenderer.invoke("vault:status"),
  loadLatestState: () => ipcRenderer.invoke("vault:loadLatestState"),
  syncCards: bundle => ipcRenderer.invoke("vault:syncCards", bundle),
  search: options => ipcRenderer.invoke("search:query", options),
  searchStatus: () => ipcRenderer.invoke("search:status"),
  rebuildSearchIndex: () => ipcRenderer.invoke("search:rebuild"),
  semanticStatus: options => ipcRenderer.invoke("semantic:status", options),
  rebuildSemanticIndex: options => ipcRenderer.invoke("semantic:rebuild", options),
  warmSemantic: options => ipcRenderer.invoke("semantic:warmup", options),
  windowShellStatus: () => ipcRenderer.invoke("shell:status"),
  selectAndImportFiles: mode => ipcRenderer.invoke("assets:selectAndImport", mode),
  selectAndImportImage: () => ipcRenderer.invoke("assets:selectAndImportImage"),
  importDroppedImage: file => ipcRenderer.invoke("assets:importDroppedImage",webUtils.getPathForFile(file)),
  openAsset: assetId => ipcRenderer.invoke("assets:open", assetId),
  revealAsset: assetId => ipcRenderer.invoke("assets:reveal", assetId),
  relinkAsset: assetId => ipcRenderer.invoke("assets:relink", assetId),
  getAssetPresentation: assetId => ipcRenderer.invoke("assets:presentation", assetId),
  selectAssetCover: assetId => ipcRenderer.invoke("assets:selectCover", assetId),
  clearAssetCover: assetId => ipcRenderer.invoke("assets:clearCover", assetId)
});
