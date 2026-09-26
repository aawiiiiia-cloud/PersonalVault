import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import { applicationMenuTemplate,TITLEBAR_HEIGHT,TITLEBAR_OVERLAY,WINDOW_TITLE,windowShellOptions } from "../electron-window-shell.mjs";

const windows=windowShellOptions("win32");
assert.equal(windows.frame,true);
assert.equal(windows.resizable,true);
assert.equal(windows.titleBarStyle,"hidden");
assert.equal(windows.autoHideMenuBar,true);
assert.deepEqual(windows.titleBarOverlay,TITLEBAR_OVERLAY);
assert.equal(windows.titleBarOverlay.height,TITLEBAR_HEIGHT);
assert.equal(windows.titleBarOverlay.color,"#00000000","Windows 原生按钮覆盖层必须透明，以显示页面标题栏和模态遮罩");
assert.equal(windows.titleBarOverlay.symbolColor,"#474c59","透明覆盖层上仍需保持清晰的原生按钮符号");
assert.equal(applicationMenuTemplate("win32"),null);

const mac=windowShellOptions("darwin");
assert.equal(mac.frame,true);
assert.equal(mac.titleBarStyle,"hiddenInset");
assert.equal("titleBarOverlay" in mac,false);
assert.equal(TITLEBAR_OVERLAY.color,"#00000000");
const macMenu=applicationMenuTemplate("darwin",WINDOW_TITLE);
assert.deepEqual(macMenu.map(item=>item.label),[WINDOW_TITLE,"编辑","窗口"]);
const roles=macMenu.flatMap(item=>item.submenu || []).map(item=>item.role).filter(Boolean);
for (const role of ["undo","redo","cut","copy","paste","selectAll","minimize","zoom","close","quit"]) {
  assert.ok(roles.includes(role),`macOS 菜单缺少 ${role}`);
}

const css=await readFile(new URL("../styles.css",import.meta.url),"utf8");
assert.match(css,/body\.desktop-shell \{ height: 100vh; overflow: hidden; \}/);
assert.match(css,/body\.desktop-shell \.sidebar \{ position: static; height: 100%; min-height: 0; \}/);
assert.match(css,/body\.desktop-shell main \{ min-height: 0; overflow-y: auto; overscroll-behavior: contain; \}/);

console.log("electron-window-shell tests passed");
