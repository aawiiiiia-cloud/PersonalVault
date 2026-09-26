(function (global) {
  "use strict";

  function releaseMediaElement(media) {
    try { media.pause(); } catch {}
    try { media.currentTime = 0; } catch {}
    try { media.removeAttribute("src"); } catch {}
    media.querySelectorAll?.("source").forEach(source => source.removeAttribute("src"));
    try { media.load(); } catch {}
  }

  function cleanupMedia(root) {
    const mediaElements = root?.querySelectorAll?.("video, audio") || [];
    mediaElements.forEach(releaseMediaElement);
    return mediaElements.length;
  }

  function bindDialogCleanup(dialog) {
    const cleanup = () => cleanupMedia(dialog);
    dialog?.addEventListener?.("cancel", cleanup);
    // A queued close event may arrive after the same dialog has reopened.
    // The reopen path already releases the old media before replacing it.
    dialog?.addEventListener?.("close", () => { if (!dialog.open) cleanup(); });
    return cleanup;
  }

  const api = { releaseMediaElement, cleanupMedia, bindDialogCleanup };
  global.WorkbenchMedia = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
