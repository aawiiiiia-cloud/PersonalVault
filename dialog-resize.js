(function (global) {
  "use strict";

  const STORAGE_PREFIX = "knowledge-workbench-card-dialog-size-v1:";
  const DEFAULT_WIDTH = { viewer:860, editor:720 };
  const MIN_SIZE = { viewer:{ width:520, height:360 }, editor:{ width:600, height:420 } };
  const NARROW_WIDTH = 760;

  function clamp(value, low, high) {
    return Math.min(Math.max(value, low), high);
  }

  function viewportBounds(width, height, topInset = 0, margin = 12) {
    return {
      left:margin,
      top:topInset + margin,
      right:Math.max(margin, width - margin),
      bottom:Math.max(topInset + margin, height - margin)
    };
  }

  function fitSize(type, size, bounds) {
    const availableWidth = Math.max(1, bounds.right - bounds.left);
    const availableHeight = Math.max(1, bounds.bottom - bounds.top);
    const minimum = MIN_SIZE[type];
    return {
      width:Math.round(clamp(Number(size.width) || DEFAULT_WIDTH[type], Math.min(minimum.width, availableWidth), availableWidth)),
      height:Math.round(clamp(Number(size.height) || availableHeight * .88, Math.min(minimum.height, availableHeight), availableHeight))
    };
  }

  function defaultSize(type, bounds) {
    return fitSize(type, { width:DEFAULT_WIDTH[type], height:Math.round((bounds.bottom - bounds.top) * .92) }, bounds);
  }

  function centerRect(type, size, bounds) {
    const fitted = fitSize(type,size,bounds);
    return {
      left:Math.round(bounds.left + (bounds.right - bounds.left - fitted.width) / 2),
      top:Math.round(bounds.top + (bounds.bottom - bounds.top - fitted.height) / 2),
      ...fitted
    };
  }

  function fitRect(type, rect, bounds) {
    const fitted = fitSize(type,rect,bounds);
    return {
      left:Math.round(clamp(rect.left,bounds.left,bounds.right - fitted.width)),
      top:Math.round(clamp(rect.top,bounds.top,bounds.bottom - fitted.height)),
      ...fitted
    };
  }

  function resizeRect(type, rect, direction, deltaX, deltaY, bounds) {
    const minimum = MIN_SIZE[type];
    let left = rect.left;
    let top = rect.top;
    let right = rect.left + rect.width;
    let bottom = rect.top + rect.height;
    if (direction.includes("w")) left = clamp(rect.left + deltaX,bounds.left,right - Math.min(minimum.width,right - bounds.left));
    if (direction.includes("e")) right = clamp(rect.left + rect.width + deltaX,left + Math.min(minimum.width,bounds.right - left),bounds.right);
    if (direction.includes("n")) top = clamp(rect.top + deltaY,bounds.top,bottom - Math.min(minimum.height,bottom - bounds.top));
    if (direction.includes("s")) bottom = clamp(rect.top + rect.height + deltaY,top + Math.min(minimum.height,bounds.bottom - top),bounds.bottom);
    return {
      left:Math.round(left),top:Math.round(top),
      width:Math.round(right - left),height:Math.round(bottom - top)
    };
  }

  function readSize(type, storage) {
    try {
      const value = JSON.parse(storage.getItem(STORAGE_PREFIX + type));
      if (Number.isFinite(value?.width) && Number.isFinite(value?.height) && value.width > 0 && value.height > 0) return value;
    } catch {}
    return null;
  }

  function saveSize(type, size, storage) {
    storage.setItem(STORAGE_PREFIX + type,JSON.stringify({ width:Math.round(size.width),height:Math.round(size.height) }));
  }

  function restoreDefault(type, storage) {
    storage.removeItem(STORAGE_PREFIX + type);
  }

  const api = { STORAGE_PREFIX,DEFAULT_WIDTH,MIN_SIZE,NARROW_WIDTH,viewportBounds,fitSize,defaultSize,centerRect,fitRect,resizeRect,readSize,saveSize,restoreDefault };
  global.WorkbenchDialogResize = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
