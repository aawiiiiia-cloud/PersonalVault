import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { cleanupMedia, bindDialogCleanup } = require("../media-lifecycle.js");

function fakeMedia({ nestedSource=false }={}) {
  const removed = [];
  const source = { removeAttribute(name) { removed.push(`source:${name}`); } };
  return {
    paused:false,
    currentTime:37,
    pauseCalls:0,
    loadCalls:0,
    removed,
    pause() { this.paused = true; this.pauseCalls += 1; },
    load() { this.loadCalls += 1; },
    removeAttribute(name) { removed.push(`media:${name}`); },
    querySelectorAll(selector) { return selector === "source" && nestedSource ? [source] : []; }
  };
}

function fakeDialog(mediaElements) {
  const listeners = new Map();
  return {
    open:false,
    querySelectorAll(selector) { return selector === "video, audio" ? mediaElements : []; },
    addEventListener(name, handler) { listeners.set(name,handler); },
    dispatch(name) { listeners.get(name)?.(); }
  };
}

function assertReleased(media, nestedSource=false) {
  assert.equal(media.paused,true);
  assert.equal(media.currentTime,0);
  assert.equal(media.pauseCalls,1);
  assert.equal(media.loadCalls,1);
  assert.ok(media.removed.includes("media:src"));
  if (nestedSource) assert.ok(media.removed.includes("source:src"));
}

const video = fakeMedia({ nestedSource:true });
const audio = fakeMedia();
assert.equal(cleanupMedia(fakeDialog([video,audio])),2);
assertReleased(video,true);
assertReleased(audio,false);

const cancelVideo = fakeMedia({ nestedSource:true });
const closeAudio = fakeMedia();
const dialog = fakeDialog([cancelVideo,closeAudio]);
const cleanup = bindDialogCleanup(dialog);
dialog.dispatch("cancel");
assertReleased(cancelVideo,true);
assertReleased(closeAudio,false);

const reopenedVideo = fakeMedia({ nestedSource:true });
const reopenedDialog = fakeDialog([reopenedVideo]);
bindDialogCleanup(reopenedDialog);
reopenedDialog.dispatch("close");
assertReleased(reopenedVideo,true);

const freshVideo = fakeMedia({ nestedSource:true });
const quickReopenDialog = fakeDialog([freshVideo]);
bindDialogCleanup(quickReopenDialog);
quickReopenDialog.open = true;
quickReopenDialog.dispatch("close");
assert.equal(freshVideo.pauseCalls,0,"延迟 close 事件不能清理重新打开的视频");

const switchedVideo = fakeMedia({ nestedSource:true });
cleanupMedia(fakeDialog([switchedVideo]));
assertReleased(switchedVideo,true);
assert.doesNotThrow(()=>cleanup());

console.log("阅读弹窗视频与音频生命周期清理：全部通过");
