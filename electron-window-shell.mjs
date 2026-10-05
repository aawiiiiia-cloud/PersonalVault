export const WINDOW_TITLE = "个人知识工作台";
export const TITLEBAR_HEIGHT = 40;
export const TITLEBAR_OVERLAY = Object.freeze({
  // Keep the native controls above the page, but let the renderer titlebar and
  // modal backdrop remain visible underneath the Window Controls Overlay.
  color: "#00000000",
  symbolColor: "#9299a8",
  height: TITLEBAR_HEIGHT
});

export function windowShellOptions(platform) {
  const common = {
    frame: true,
    resizable: true,
    roundedCorners: true
  };
  if (platform === "win32") {
    return {
      ...common,
      titleBarStyle: "hidden",
      titleBarOverlay: { ...TITLEBAR_OVERLAY },
      autoHideMenuBar: true
    };
  }
  if (platform === "darwin") {
    return {
      ...common,
      titleBarStyle: "hiddenInset"
    };
  }
  return { ...common,autoHideMenuBar:true };
}

export function applicationMenuTemplate(platform,appName=WINDOW_TITLE) {
  if (platform !== "darwin") return null;
  return [
    {
      label:appName,
      submenu:[
        { label:`关于${appName}`,role:"about" },
        { type:"separator" },
        { label:"服务",role:"services" },
        { type:"separator" },
        { label:`隐藏${appName}`,role:"hide" },
        { label:"隐藏其他应用",role:"hideOthers" },
        { label:"全部显示",role:"unhide" },
        { type:"separator" },
        { label:`退出${appName}`,role:"quit" }
      ]
    },
    {
      label:"编辑",
      submenu:[
        { label:"撤销",role:"undo" },
        { label:"重做",role:"redo" },
        { type:"separator" },
        { label:"剪切",role:"cut" },
        { label:"复制",role:"copy" },
        { label:"粘贴",role:"paste" },
        { type:"separator" },
        { label:"全选",role:"selectAll" }
      ]
    },
    {
      label:"窗口",
      submenu:[
        { label:"最小化",role:"minimize" },
        { label:"缩放",role:"zoom" },
        { label:"关闭窗口",role:"close" },
        { type:"separator" },
        { label:"前置全部窗口",role:"front" }
      ]
    }
  ];
}
