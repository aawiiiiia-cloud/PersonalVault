const { contextBridge, ipcRenderer, webUtils } = require("electron");
require('./window-pin-preload.cjs');

contextBridge.exposeInMainWorld("workbenchDesktop", {
  isDesktop: true,
  platform: process.platform,
  openCardWindow: (cardId,options={}) => ipcRenderer.invoke('cards:openWindow',cardId,options),
  resetCardWindow: () => ipcRenderer.invoke('cards:resetWindow'),
  cardWindowReady: () => ipcRenderer.invoke('cards:ready'),
  vaultStatus: () => ipcRenderer.invoke("vault:status"),
  loadLatestState: () => ipcRenderer.invoke("vault:loadLatestState"),
  syncCards: bundle => ipcRenderer.invoke("vault:syncCards", bundle),
  loadCanvasDocument: cardId => ipcRenderer.invoke("canvas:load", cardId),
  saveCanvasDocument: (cardId, snapshot) => ipcRenderer.invoke("canvas:save", cardId, snapshot),
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
  getCanvasImageDataUrl: assetId => ipcRenderer.invoke("canvas:imageDataUrl", assetId),
  getCanvasMediaDataUrl: assetId => ipcRenderer.invoke("canvas:mediaDataUrl", assetId),
  getCanvasMediaUrl: assetId => ipcRenderer.invoke('canvas:mediaUrl',assetId),
  selectAssetCover: assetId => ipcRenderer.invoke("assets:selectCover", assetId),
  clearAssetCover: assetId => ipcRenderer.invoke("assets:clearCover", assetId)
});
