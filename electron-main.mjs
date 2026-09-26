import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from "electron";
import { applicationMenuTemplate,WINDOW_TITLE,windowShellOptions } from "./electron-window-shell.mjs";

const APP_ROOT = path.dirname(fileURLToPath(import.meta.url));
if (!app.isPackaged) {
  app.commandLine.appendSwitch("disk-cache-dir", path.join(APP_ROOT, ".electron-cache"));
  app.commandLine.appendSwitch("disable-http-cache");
  app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");
}
let mainWindow;
let creatingWindow=false;
let vault;

app.setName(WINDOW_TITLE);
const menuTemplate=applicationMenuTemplate(process.platform,WINDOW_TITLE);
Menu.setApplicationMenu(menuTemplate ? Menu.buildFromTemplate(menuTemplate) : null);
const hasSingleInstanceLock=app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();
else app.on("second-instance", () => {
  const window=mainWindow && !mainWindow.isDestroyed() ? mainWindow : BrowserWindow.getAllWindows()[0];
  if (!window) { createWindow(); return; }
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
});

async function createWindow() {
  if (creatingWindow) return;
  creatingWindow=true;
  try {
    vault ||= await import("./server.mjs");
    mainWindow = new BrowserWindow({
      width: 1440,
      height: 920,
      minWidth: 980,
      minHeight: 680,
      backgroundColor: "#f6f7fa",
      title: WINDOW_TITLE,
      ...windowShellOptions(process.platform),
      webPreferences: {
        preload: path.join(APP_ROOT, "electron-preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    });
    mainWindow.on("closed", () => { mainWindow=null; });
    if (process.platform !== "darwin") mainWindow.removeMenu();
    await mainWindow.loadFile(path.join(APP_ROOT, "index.html"));
  } finally {
    creatingWindow=false;
  }
}

ipcMain.handle("vault:status", async () => {
  vault ||= await import("./server.mjs");
  return vault.vaultStatus();
});

ipcMain.handle("vault:syncCards", async (_event, bundle) => {
  vault ||= await import("./server.mjs");
  return vault.syncCards(bundle);
});

ipcMain.handle("vault:loadLatestState", async () => {
  vault ||= await import("./server.mjs");
  return vault.loadLatestState();
});

ipcMain.handle("search:query", async (_event, options) => {
  vault ||= await import("./server.mjs");
  return vault.queryCombinedSearch(options);
});

ipcMain.handle("search:status", async () => {
  vault ||= await import("./server.mjs");
  return vault.getIndexStatus();
});

ipcMain.handle("search:rebuild", async () => {
  vault ||= await import("./server.mjs");
  return vault.rebuildIndex();
});

ipcMain.handle("semantic:status", async (_event, options) => {
  vault ||= await import("./server.mjs");
  return vault.getSemanticStatus(options || {});
});

ipcMain.handle("semantic:rebuild", async (_event, options) => {
  vault ||= await import("./server.mjs");
  return vault.rebuildSemantic(options || {});
});

ipcMain.handle("semantic:warmup", async (_event, options) => {
  vault ||= await import("./server.mjs");
  return vault.warmSemantic(options || {});
});

ipcMain.handle("shell:status", event => {
  const targetWindow=BrowserWindow.fromWebContents(event.sender);
  return {
    platform:process.platform,
    title:targetWindow?.getTitle() || "",
    applicationMenuPresent:Boolean(Menu.getApplicationMenu()),
    menuBarVisible:process.platform === "darwin" ? true : Boolean(targetWindow?.isMenuBarVisible()),
    closable:Boolean(targetWindow?.isClosable()),
    minimizable:Boolean(targetWindow?.isMinimizable()),
    maximizable:Boolean(targetWindow?.isMaximizable()),
    resizable:Boolean(targetWindow?.isResizable()),
    fullScreenable:Boolean(targetWindow?.isFullScreenable())
  };
});

ipcMain.handle("assets:selectAndImport", async (_event, mode) => {
  vault ||= await import("./server.mjs");
  const result = await dialog.showOpenDialog(mainWindow, {
    title: mode === "move" ? "选择要移动到知识库的文件" : mode === "register" ? "选择保留在原位置的文件" : "选择要复制到知识库的文件",
    buttonLabel: "选择文件",
    properties: ["openFile", "multiSelections"],
    filters: [{ name:"所有文件", extensions:["*"] }]
  });
  if (result.canceled) return { canceled:true, assets:[], skipped:[] };
  return { canceled:false, ...(await vault.importFiles(result.filePaths, mode)) };
});

async function importImagePath(imagePath) {
  vault ||= await import("./server.mjs");
  if(!imagePath || !path.isAbsolute(imagePath) || !new Set([".png",".jpg",".jpeg",".gif",".webp",".bmp"]).has(path.extname(imagePath).toLowerCase())) throw new Error("请选择常见图片文件");
  const imported=await vault.importFiles([imagePath],"copy");
  const asset=imported.assets[0];
  if(!asset || asset.category!=="图片") throw new Error("请选择图片文件");
  return {canceled:false,asset,presentation:await vault.getAssetPresentation(asset.id)};
}

ipcMain.handle("assets:selectAndImportImage", async () => {
  const result=await dialog.showOpenDialog(mainWindow,{
    title:"选择要插入卡片的图片",buttonLabel:"插入图片",properties:["openFile","multiSelections"],
    filters:[{name:"图片",extensions:["png","jpg","jpeg","gif","webp","bmp"]}]
  });
  if(result.canceled || !result.filePaths.length) return {canceled:true};
  if(result.filePaths.some(imagePath=>!path.isAbsolute(imagePath) || !new Set([".png",".jpg",".jpeg",".gif",".webp",".bmp"]).has(path.extname(imagePath).toLowerCase()))) throw new Error("请选择常见图片文件");
  vault ||= await import("./server.mjs");
  const imported=await vault.importFiles(result.filePaths,"copy");
  const images=await Promise.all(imported.assets.filter(asset=>asset.category==="图片").map(async asset=>({asset,presentation:await vault.getAssetPresentation(asset.id)})));
  return {canceled:false,images,skipped:imported.skipped};
});

ipcMain.handle("assets:importDroppedImage", async (_event,imagePath) => importImagePath(imagePath));

ipcMain.handle("assets:open", async (_event, assetId) => {
  vault ||= await import("./server.mjs");
  const asset = await vault.getAsset(assetId);
  const error = await shell.openPath(asset.absolutePath);
  if (error) throw new Error(error);
  return true;
});

ipcMain.handle("assets:reveal", async (_event, assetId) => {
  vault ||= await import("./server.mjs");
  const asset = await vault.getAsset(assetId);
  shell.showItemInFolder(asset.absolutePath);
  return true;
});

ipcMain.handle("assets:relink", async (_event, assetId) => {
  vault ||= await import("./server.mjs");
  const result = await dialog.showOpenDialog(mainWindow, {
    title:"重新选择文件位置",
    buttonLabel:"重新关联",
    properties:["openFile"],
    filters:[{ name:"所有文件", extensions:["*"] }]
  });
  if (result.canceled) return { canceled:true };
  return { canceled:false, asset:await vault.relinkAsset(assetId, result.filePaths[0]) };
});

ipcMain.handle("assets:presentation", async (_event, assetId) => {
  vault ||= await import("./server.mjs");
  return vault.getAssetPresentation(assetId);
});

ipcMain.handle("assets:selectCover", async (_event, assetId) => {
  vault ||= await import("./server.mjs");
  const result = await dialog.showOpenDialog(mainWindow, {
    title:"选择资产封面",
    buttonLabel:"设为封面",
    properties:["openFile"],
    filters:[{ name:"图片", extensions:["jpg","jpeg","png","webp","gif","bmp","tif","tiff"] }]
  });
  if (result.canceled) return { canceled:true };
  return { canceled:false, presentation:await vault.setAssetCover(assetId,result.filePaths[0]) };
});

ipcMain.handle("assets:clearCover", async (_event, assetId) => {
  vault ||= await import("./server.mjs");
  return vault.clearAssetCover(assetId);
});

if (hasSingleInstanceLock) app.whenReady().then(createWindow);
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
