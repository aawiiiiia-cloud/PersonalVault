import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require=createRequire(import.meta.url);
const { wheelDeltaPixels,wheelZoomTarget }=require("../graph-canvas.js");

assert.equal(wheelDeltaPixels(2,1,800),32);
assert.equal(wheelDeltaPixels(2,2,100),200);
assert.equal(wheelDeltaPixels(500,0,800),240);

const camera={ x:120,y:80,scale:.75 };
const pointer={ x:430,y:260 };
const before={ x:(pointer.x-camera.x)/camera.scale,y:(pointer.y-camera.y)/camera.scale };
const target=wheelZoomTarget(camera,pointer.x,pointer.y,-120,0,800);
const after={ x:(pointer.x-target.x)/target.scale,y:(pointer.y-target.y)/target.scale };
assert.ok(target.scale>camera.scale);
assert.ok(Math.abs(before.x-after.x)<1e-9);
assert.ok(Math.abs(before.y-after.y)<1e-9);
assert.equal(wheelZoomTarget({ x:0,y:0,scale:3 },0,0,-240).scale,3);
assert.equal(wheelZoomTarget({ x:0,y:0,scale:.2 },0,0,240).scale,.2);

console.log("graph-canvas tests passed");
