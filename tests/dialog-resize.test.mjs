import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require=createRequire(import.meta.url);
const Resize=require("../dialog-resize.js");
const bounds=Resize.viewportBounds(1200,800,40);
const rect={left:250,top:150,width:700,height:500};
for (const direction of ["n","s","w","e","nw","ne","sw","se"]) {
  const next=Resize.resizeRect("viewer",rect,direction,40,30,bounds);
  assert.equal(next.left,direction.includes("w") ? 290 : 250,direction);
  assert.equal(next.top,direction.includes("n") ? 180 : 150,direction);
  assert.equal(next.width,direction.includes("w") ? 660 : direction.includes("e") ? 740 : 700,direction);
  assert.equal(next.height,direction.includes("n") ? 470 : direction.includes("s") ? 530 : 500,direction);
}
const minViewer=Resize.resizeRect("viewer",rect,"nw",1000,1000,bounds);
assert.deepEqual({width:minViewer.width,height:minViewer.height},Resize.MIN_SIZE.viewer);
assert.equal(minViewer.left,rect.left+rect.width-minViewer.width);
assert.equal(minViewer.top,rect.top+rect.height-minViewer.height);
const maxViewer=Resize.resizeRect("viewer",rect,"se",1000,1000,bounds);
assert.equal(maxViewer.left+maxViewer.width,bounds.right);
assert.equal(maxViewer.top+maxViewer.height,bounds.bottom);
const maxOpposite=Resize.resizeRect("viewer",rect,"nw",-1000,-1000,bounds);
assert.equal(maxOpposite.left,bounds.left);
assert.equal(maxOpposite.top,bounds.top);
const minEditor=Resize.resizeRect("editor",{left:200,top:100,width:720,height:600},"se",-1000,-1000,bounds);
assert.deepEqual({width:minEditor.width,height:minEditor.height},Resize.MIN_SIZE.editor);

const saved=new Map();
const storage={getItem:key=>saved.get(key) ?? null,setItem:(key,value)=>saved.set(key,value),removeItem:key=>saved.delete(key)};
Resize.saveSize("viewer",{width:950,height:610},storage);
Resize.saveSize("editor",{width:680,height:550},storage);
assert.deepEqual(Resize.readSize("viewer",storage),{width:950,height:610});
assert.deepEqual(Resize.readSize("editor",storage),{width:680,height:550});
assert.deepEqual(Resize.centerRect("viewer",Resize.readSize("viewer",storage),bounds).width,950);
Resize.restoreDefault("viewer",storage);
assert.equal(Resize.readSize("viewer",storage),null);
assert.deepEqual(Resize.readSize("editor",storage),{width:680,height:550});
assert.equal(Resize.defaultSize("viewer",bounds).width,860);

const smallBounds=Resize.viewportBounds(640,480,40);
const fitted=Resize.fitRect("viewer",{left:700,top:500,width:950,height:610},smallBounds);
assert.ok(fitted.left>=smallBounds.left && fitted.top>=smallBounds.top);
assert.ok(fitted.left+fitted.width<=smallBounds.right);
assert.ok(fitted.top+fitted.height<=smallBounds.bottom);
assert.ok(Resize.fitSize("editor",{width:10000,height:10000},smallBounds).width<=smallBounds.right-smallBounds.left);
assert.equal(Resize.NARROW_WIDTH,760);
console.log("阅读与编辑弹窗八方向缩放、边界和本机尺寸偏好：全部通过");
