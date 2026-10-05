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
const cardWindows=new Map();
let creatingWindow=false;
let vault;

const pinPreload=path.join(APP_ROOT,'window-pin-preload.cjs');
const mediaWindowOptions={width:1080,height:760,minWidth:520,minHeight:380,frame:false,resizable:true,roundedCorners:true,autoHideMenuBar:true,backgroundColor:'#fafbfd',webPreferences:{preload:pinPreload,contextIsolation:true,nodeIntegration:false,sandbox:false}};

function bindFloatingCanvasClose(child,url){
  child.setParentWindow(null);
  if(!new URL(url).pathname.replaceAll('\\','/').endsWith('/canvas-window.html'))return;
  child.webContents.setWindowOpenHandler(({url:mediaUrl})=>{
    const target=new URL(mediaUrl),origin=new URL(child.webContents.getURL());
    if(target.origin!==origin.origin||target.href!==new URL('./canvas-editor/media-viewer.html',origin).href)return {action:'deny'};
    return {action:'allow',overrideBrowserWindowOptions:mediaWindowOptions};
  });
  let closing=false;
  child.on('close',event=>{
    if(closing)return;
    event.preventDefault();closing=true;
    child.webContents.executeJavaScript('window.requestFloatingCanvasClose ? window.requestFloatingCanvasClose() : true').then(confirmed=>{
      if(confirmed&&!child.isDestroyed())child.destroy();else closing=false;
    }).catch(()=>{closing=false;});
  });
}

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
    mainWindow.on("closed", () => {
      mainWindow=null;
      // Floating windows belong to the main workspace's lifetime.
      for(const child of BrowserWindow.getAllWindows()){
        if(!child.isDestroyed())child.destroy();
      }
    });
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      const page = new URL(url);
      const origin = new URL(mainWindow.webContents.getURL() || `file://${APP_ROOT}/index.html`);
      const isAppearance = page.href === new URL('./appearance.html',origin).href;
      const isCanvasWindow = page.href === new URL('./canvas-window.html',origin).href;
      const isMediaViewer = page.pathname.replaceAll('\\', '/').endsWith('/canvas-editor/media-viewer.html');
      if ((!isMediaViewer && !isAppearance && !isCanvasWindow) || page.origin !== origin.origin) return { action: 'deny' };
      if(isCanvasWindow)return {action:'allow',overrideBrowserWindowOptions:{width:1080,height:760,minWidth:420,minHeight:320,frame:false,resizable:true,roundedCorners:true,backgroundColor:'#fafbfd',webPreferences:{preload:pinPreload,contextIsolation:true,nodeIntegration:false,sandbox:true}}};
      if (isAppearance) return {
        action:'allow',
        overrideBrowserWindowOptions:{
          width:640,height:800,minWidth:360,minHeight:420,
          title:'外观设置',backgroundColor:'#fafbfd',frame:false,resizable:true,roundedCorners:true,
          autoHideMenuBar:true,modal:false,
          webPreferences:{preload:pinPreload,contextIsolation:true,nodeIntegration:false,sandbox:true}
        }
      };
      return {
        action: 'allow',
        overrideBrowserWindowOptions: mediaWindowOptions
      };
    });
    mainWindow.webContents.on('did-create-window', (child,details) => {
      bindFloatingCanvasClose(child,details.url);
      if (process.platform !== 'darwin') child.removeMenu();
    });
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

ipcMain.handle('cards:openWindow',async (event,cardId,options={})=>{
  const trustedSender=event.sender===mainWindow?.webContents || [...cardWindows.values()].some(window=>!window.isDestroyed()&&window.webContents===event.sender);
  if(!trustedSender || typeof cardId!=='string' || !cardId || cardId.length>200) throw new Error('无效的卡片窗口请求');
  const newType=cardId==='new'&&['capture','area','project','review','knowledge','source'].includes(options.type)?options.type:null;
  if(cardId==='new'&&!newType)throw new Error('无效的卡片类型');
  const windowKey=newType?`new:${newType}`:cardId;
  const existing=cardWindows.get(windowKey);
  if(existing&&!existing.isDestroyed()){if(existing.cardContentReady){if(existing.isMinimized())existing.restore();existing.show();existing.focus();}return;}
  const initialBackground=await event.sender.executeJavaScript("getComputedStyle(document.querySelector('#viewerDialog')).backgroundColor").catch(()=> '#1b1d25');
  if(cardWindows.has(windowKey))return;
  const child=new BrowserWindow({width:820,height:820,minWidth:420,minHeight:420,title:'卡片',show:false,frame:false,resizable:true,roundedCorners:true,autoHideMenuBar:true,backgroundColor:initialBackground,webPreferences:{preload:path.join(APP_ROOT,'electron-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:false}});
  cardWindows.set(windowKey,child);
  child.cardContentReady=false;
  child.on('closed',()=>cardWindows.delete(windowKey));
  // Card windows reuse the trusted app page and never load external pages.
  child.webContents.setWindowOpenHandler(({url})=>{
    const target=new URL(url),origin=new URL(child.webContents.getURL());
    if(target.href===new URL('./canvas-window.html',origin).href)return {action:'allow',overrideBrowserWindowOptions:{width:1080,height:760,minWidth:420,minHeight:320,frame:false,resizable:true,roundedCorners:true,backgroundColor:'#fafbfd',webPreferences:{preload:pinPreload,contextIsolation:true,nodeIntegration:false,sandbox:true}}};
    if(target.origin!==origin.origin || !target.pathname.replaceAll('\\','/').endsWith('/canvas-editor/media-viewer.html'))return {action:'deny'};
    return {action:'allow',overrideBrowserWindowOptions:mediaWindowOptions};
  });
  child.webContents.on('did-create-window',(popup,details)=>bindFloatingCanvasClose(popup,details.url));
  if(process.platform!=='darwin')child.removeMenu();
  await child.loadFile(path.join(APP_ROOT,'index.html'),{query:{card:cardId,...(newType?{type:newType,preset:JSON.stringify(options.preset||{})}:{}),...(options.edit?{edit:'1'}:{})}});
});
ipcMain.handle('cards:ready',event=>{
  const child=BrowserWindow.fromWebContents(event.sender);
  if(!child||child.isDestroyed()||![...cardWindows.values()].includes(child))return;
  child.cardContentReady=true;child.show();child.focus();
});
ipcMain.handle('cards:resetWindow',event=>{
  const child=BrowserWindow.fromWebContents(event.sender);
  if(![...cardWindows.values()].includes(child))return;
  child.setSize(820,820);
});

function independentWindowFor(event){
  const window=BrowserWindow.fromWebContents(event.sender);
  if(!window||window.isDestroyed()||window===mainWindow)throw new Error('无效的独立窗口请求');
  const allowed=['index.html','appearance.html','canvas-window.html','canvas-editor/media-viewer.html'].map(file=>path.join(APP_ROOT,file).toLowerCase());
  const url=new URL(event.sender.getURL());
  if(url.protocol!=='file:'||!allowed.includes(path.normalize(fileURLToPath(url)).toLowerCase()))throw new Error('无效的独立窗口请求');
  return window;
}
ipcMain.handle('window:pinStatus',event=>independentWindowFor(event).isAlwaysOnTop());
ipcMain.handle('window:setPinned',(event,pinned)=>{
  if(typeof pinned!=='boolean')throw new Error('无效的固定状态');
  const window=independentWindowFor(event);
  window.setAlwaysOnTop(pinned);
  window.focus();
  return window.isAlwaysOnTop();
});

ipcMain.handle("canvas:load", async (_event, cardId) => {
  vault ||= await import("./server.mjs");
  return vault.loadCanvasDocument(cardId);
});
ipcMain.handle('canvas:resolveAsset',async(_event,cardId,sourceId,hint)=>{
  vault ||= await import('./server.mjs');
  const snapshot=await vault.loadCanvasDocument(cardId);
  return snapshot?.linkedAssets?.[sourceId] || (snapshot?.attachments?.some(asset=>asset.id===hint)?hint:null);
});

ipcMain.handle("canvas:save", async (_event, cardId, snapshot) => {
  vault ||= await import("./server.mjs");
  return vault.saveCanvasDocument(cardId, snapshot);
});

ipcMain.handle("canvas:imageDataUrl", async (_event, assetId) => {
  vault ||= await import("./server.mjs");
  return vault.getCanvasImageDataUrl(assetId);
});

ipcMain.handle("canvas:mediaDataUrl", async (_event, assetId) => {
  vault ||= await import("./server.mjs");
  return vault.getCanvasMediaDataUrl(assetId);
});
ipcMain.handle('canvas:mediaUrl',async (_event,assetId)=>{
  vault ||= await import('./server.mjs');
  return vault.getCanvasMediaUrl(assetId);
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
