(function () {
  "use strict";

  const FORMAT = "personal-knowledge-workbench";
  const SCHEMA_VERSION = 2;
  const CardV2 = (typeof window !== "undefined" && window.WorkbenchCardV2) || (typeof require === "function" ? require("./card-v2.js") : null);
  const VALID_TYPES = new Set(["capture", "area", "project", "review", "knowledge", "source"]);
  const REFERENCE_FIELDS = ["areaRefs", "sourceRefs", "relatedRefs", "projectRefs"];

  function normalizeTombstones(input = []) {
    const byId = new Map();
    (Array.isArray(input) ? input : []).forEach(item => {
      if (!item?.id || !item?.type || !item?.deletedAt) return;
      byId.set(String(item.id), {
        id:String(item.id),
        type:String(item.type),
        deletedAt:toIso(item.deletedAt)
      });
    });
    return [...byId.values()];
  }

  function isoNow() {
    return new Date().toISOString();
  }

  function toIso(value, fallback = isoNow()) {
    if (!value) return fallback;
    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value;
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
  }

  function dayOf(iso) {
    return String(iso || "").slice(0, 10);
  }

  function normalizeEntry(entry = {}) {
    const source = CardV2?.MAIN_TYPES.has(entry.type) ? CardV2.migrateEntry(entry) : entry;
    const createdAt = toIso(source.createdAt || source.created);
    const updatedAt = toIso(source.updatedAt || source.updated, createdAt);
    const normalized = {
      ...source,
      id: source.id || crypto.randomUUID(),
      type: source.type || "capture",
      title: String(source.title || "未命名内容"),
      deletedAt: source.deletedAt || null,
      createdAt,
      updatedAt
    };
    if (!CardV2?.MAIN_TYPES.has(normalized.type)) {
      normalized.archived = Boolean(source.archived);
      normalized.created = source.created || dayOf(createdAt);
      normalized.updated = source.updated || dayOf(updatedAt);
    }
    REFERENCE_FIELDS.forEach(field => {
      if (CardV2?.MAIN_TYPES.has(normalized.type) && !Object.hasOwn(source,field) && field !== "areaRefs" && field !== "relatedRefs") return;
      normalized[field] = Array.isArray(source[field]) ? [...new Set(source[field].filter(Boolean))] : [];
    });
    // Older source cards stored ordinary project links in projectRefs.
    // Reviews still use projectRefs for their parent project.
    if (normalized.type === "source" && normalized.projectRefs?.length) {
      normalized.relatedRefs = [...new Set([...normalized.relatedRefs, ...normalized.projectRefs])];
      normalized.projectRefs = [];
    }
    if (["project", "knowledge", "source"].includes(normalized.type)) {
      normalized.relatedRefs = normalized.relatedRefs.filter(id => id !== normalized.id);
    }
    if (normalized.type === "project") {
      const sourceTasks = Array.isArray(source.tasks) ? source.tasks : [];
      normalized.tasks = sourceTasks.map((task,index) => ({
        id:String(task?.id || `${normalized.id}-task-${index+1}`),
        text:String(task?.text || "").trim(),
        done:Boolean(task?.done)
      })).filter(task => task.text);
    }
    return normalized;
  }

  function normalizeState(input = {}) {
    const entries = Array.isArray(input.entries) ? input.entries.map(normalizeEntry) : [];
    return {
      schemaVersion: SCHEMA_VERSION,
      updatedAt: input.updatedAt || isoNow(),
      entries,
      tombstones:normalizeTombstones(input.tombstones)
    };
  }

  function validateState(input = {}) {
    const entries = Array.isArray(input.entries) ? input.entries : [];
    const errors = [];
    const warnings = [];
    const ids = new Set();
    const duplicateIds = new Set();
    const tombstones = normalizeTombstones(input.tombstones);

    entries.forEach((entry, index) => {
      const label = entry.title || `第 ${index + 1} 条`;
      if (!entry.id) errors.push(`${label}缺少稳定ID`);
      else if (ids.has(entry.id)) duplicateIds.add(entry.id);
      else ids.add(entry.id);
      if (!VALID_TYPES.has(entry.type)) errors.push(`${label}的类型“${entry.type || "空"}”无法识别`);
      if (!String(entry.title || "").trim()) warnings.push(`第 ${index + 1} 条内容没有标题`);
    });

    duplicateIds.forEach(id => errors.push(`发现重复ID：${id}`));
    const tombstoneIds = new Set(tombstones.map(item => item.id));
    entries.forEach(entry => {
      if (tombstoneIds.has(entry.id)) errors.push(`${entry.title || entry.id}同时存在于卡片和永久删除记录中`);
    });
    entries.forEach(entry => {
      REFERENCE_FIELDS.forEach(field => {
        const refs = Array.isArray(entry[field]) ? entry[field] : [];
        refs.forEach(id => {
          if (!ids.has(id)) warnings.push(`${entry.title || entry.id}存在失效关联：${id}`);
        });
      });
    });

    return {
      ok: errors.length === 0,
      errors,
      warnings,
      stats: {
        total: entries.length,
        active: entries.filter(entry => !entry.deletedAt).length,
        trash: entries.filter(entry => entry.deletedAt).length,
        references: entries.reduce((count, entry) => count + REFERENCE_FIELDS.reduce((sum, field) => sum + (entry[field]?.length || 0), 0), 0)
      }
    };
  }

  function createBundle(state) {
    const normalized = normalizeState(state);
    return {
      format: FORMAT,
      schemaVersion: SCHEMA_VERSION,
      exportedAt: isoNow(),
      stateUpdatedAt: normalized.updatedAt,
      generator: "个人知识工作台 prototype",
      cards: normalized.entries,
      tombstones:normalized.tombstones
    };
  }

  function readBundle(value) {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== "object") throw new Error("文件内容不是有效的数据对象");
    if (Number(parsed.schemaVersion || 1) > SCHEMA_VERSION) {
      throw new Error(`该文件的数据版本为 ${parsed.schemaVersion}，当前版本暂不支持`);
    }
    const entries = parsed.cards || parsed.entries || parsed.state?.entries;
    if (!Array.isArray(entries)) throw new Error("没有找到可导入的卡片列表");
    const rawReport = validateState({ entries, tombstones:parsed.tombstones });
    const state = normalizeState({ entries, tombstones:parsed.tombstones });
    const normalizedReport = validateState(state);
    const report = {
      ...normalizedReport,
      ok: rawReport.errors.length === 0 && normalizedReport.errors.length === 0,
      errors: [...rawReport.errors, ...normalizedReport.errors.filter(message => !rawReport.errors.includes(message))],
      warnings: [...rawReport.warnings, ...normalizedReport.warnings.filter(message => !rawReport.warnings.includes(message))]
    };
    return { state, report, sourceFormat: parsed.format || "legacy-json" };
  }

  function download(name, content, type) {
    const blob = new Blob([content], { type });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 0);
  }

  function exportBundle(state, date) {
    download(`知识工作台迁移包-${date}.kwb.json`, JSON.stringify(createBundle(state), null, 2), "application/json;charset=utf-8");
  }

  window.WorkbenchData = {
    FORMAT,
    SCHEMA_VERSION,
    REFERENCE_FIELDS,
    normalizeTombstones,
    normalizeEntry,
    normalizeState,
    validateState,
    createBundle,
    readBundle,
    exportBundle,
    download,
    isoNow,
    dayOf
  };
})();
