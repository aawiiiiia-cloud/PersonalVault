import path from "node:path";
import CardMarkdown from "./card-markdown.js";
import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { loadRebuildState } from "./search-index.mjs";
import { DEFAULT_EMBEDDING_MODEL_ID, getEmbeddingProfile, listEmbeddingProfiles } from "./embedding-models.mjs";

export const DEFAULT_EMBEDDING_MODEL = DEFAULT_EMBEDDING_MODEL_ID;
const LEGACY_INDEX_RELATIVE_PATH = path.join("系统", "索引", "semantic.sqlite");
const MEANING_FIELDS = [
  "goal", "origin", "content",
  "description", "scope", "rawContent", "challenge", "desired", "customDecision", "myRole", "nextStep",
  "tasks", "result", "worked", "problems", "lesson", "conclusion", "applies", "limits", "summaryText", "candidate"
];
const SEARCHABLE_CONTENT_TYPES = new Set(["project","knowledge","source"]);
const PROVIDER_CACHE = new Map();

function semanticPath(vaultRoot, profile) {
  return path.join(vaultRoot, "系统", "索引", profile.indexFile);
}

async function readableSemanticPath(vaultRoot, profile) {
  const currentPath = semanticPath(vaultRoot,profile);
  if (!profile.legacy) return currentPath;
  const legacyPath = path.join(vaultRoot,LEGACY_INDEX_RELATIVE_PATH);
  const currentExists = await fs.access(currentPath).then(() => true, () => false);
  if (currentExists) return currentPath;
  const legacyExists = await fs.access(legacyPath).then(() => true, () => false);
  return legacyExists ? legacyPath : currentPath;
}

function modelCachePath(cacheDir, profile) {
  return path.join(cacheDir, ...profile.model.split("/"));
}

function normalizedText(card, byId) {
  const areaNames = (card.areaRefs || []).map(id => byId.get(id)?.title).filter(Boolean);
  const parts = [`标题：${card.title}`, areaNames.length ? `领域：${areaNames.join("、")}` : ""];
  MEANING_FIELDS.forEach(field => {
    if (field === "nextStep" && Array.isArray(card.tasks) && card.tasks.some(task => String(task?.text || "").trim())) return;
    const value = field === "content" ? CardMarkdown.plainText(card.content) : field === "tasks" && Array.isArray(card.tasks)
      ? card.tasks.map(task => task.text).filter(Boolean).join("\n")
      : String(card[field] || "").trim();
    if (value) parts.push(value);
  });
  if (card.type === "source" && card.summaryText) {
    const rawIndex = parts.indexOf(String(card.rawContent || "").trim());
    if (rawIndex >= 0) parts.splice(rawIndex, 1);
  }
  return parts.filter(Boolean).join("\n").slice(0, 6000);
}

function semanticDocuments(cards) {
  const byId = new Map(cards.map(card => [card.id,card]));
  return cards
    .filter(card => SEARCHABLE_CONTENT_TYPES.has(card.type))
    .map(card => ({ card, text:normalizedText(card,byId) }))
    .filter(item => item.text);
}

function indexedMetadata(card) {
  return JSON.stringify({
    type:card.type,
    status:cardStatus(card),
    areaRefs:card.areaRefs || [],
    fileExtension:card.fileExtension || null,
    durationSeconds:Number(card.durationSeconds) || null,
    updatedAt:card.updatedAt || card.updated || null
  });
}

function documentsHash(documents) {
  const hash = crypto.createHash("sha256");
  documents.slice().sort((a,b) => a.card.id.localeCompare(b.card.id)).forEach(item => {
    hash.update(item.card.id).update("\0").update(item.text).update("\0").update(indexedMetadata(item.card)).update("\0");
  });
  return hash.digest("hex");
}

function bufferFromVector(vector) {
  return Buffer.from(new Float32Array(vector).buffer);
}

function vectorFromBuffer(buffer, dimension) {
  const copy = Uint8Array.from(buffer);
  return new Float32Array(copy.buffer, 0, dimension);
}

function dot(a, b) {
  let score = 0;
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i += 1) score += a[i] * b[i];
  return score;
}

export class TransformersEmbeddingProvider {
  constructor({ profile = getEmbeddingProfile(), cacheDir, device = "auto" } = {}) {
    this.profile = profile;
    this.model = profile.model;
    this.modelId = profile.id;
    this.cacheDir = cacheDir;
    this.requestedDevice = device;
    this.actualDevice = null;
    this.fallbackReason = null;
    this.extractor = null;
    this.loadPromise = null;
  }

  async load() {
    if (this.extractor) return this.extractor;
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = this.loadOnce();
    try { return await this.loadPromise; }
    finally { this.loadPromise = null; }
  }

  async loadOnce() {
    const transformers = await import("@huggingface/transformers");
    if (this.cacheDir) transformers.env.cacheDir = this.cacheDir;
    transformers.env.allowLocalModels = true;
    transformers.env.allowRemoteModels = true;
    const accelerated = process.platform === "win32" ? ["dml","webgpu"] : process.platform === "darwin" ? ["coreml","webgpu"] : ["cuda","webgpu"];
    const candidates = this.requestedDevice === "auto"
      ? [...accelerated,"cpu"]
      : this.requestedDevice === "gpu"
        ? [...accelerated,"cpu"]
        : this.requestedDevice === "cpu" ? ["cpu"] : [this.requestedDevice,"cpu"];
    const failures = [];
    for (const device of [...new Set(candidates)]) {
      try {
        this.extractor = await transformers.pipeline("feature-extraction", this.model, { dtype:this.profile.dtype, device });
        this.actualDevice = device;
        this.fallbackReason = failures.length ? failures.join(" | ") : null;
        return this.extractor;
      } catch (error) {
        failures.push(`${device}: ${error.message}`);
      }
    }
    throw new Error(`无法载入语义模型：${failures.join(" | ")}`);
  }

  async embed(texts, { kind = "document" } = {}) {
    const extractor = await this.load();
    const prefix = kind === "query" ? this.profile.queryPrefix : this.profile.documentPrefix;
    const prepared = texts.map(text => `${prefix}${String(text || "")}`);
    const output = await extractor(prepared, {
      pooling:this.profile.pooling,
      normalize:true,
      truncation:true,
      max_length:this.profile.maxTokens
    });
    const values = output.tolist();
    return Array.isArray(values[0]) ? values : [values];
  }
}

function sharedEmbeddingProvider(profile, options = {}) {
  const device = options.device || "auto";
  const key = `${profile.id}\0${options.cacheDir || ""}\0${device}`;
  if (!PROVIDER_CACHE.has(key)) {
    PROVIDER_CACHE.set(key,new TransformersEmbeddingProvider({ profile, cacheDir:options.cacheDir, device }));
  }
  return PROVIDER_CACHE.get(key);
}

export async function warmSemanticModel(vaultRoot, options = {}) {
  const profile = getEmbeddingProfile(options.modelId || DEFAULT_EMBEDDING_MODEL_ID);
  const startedAt = performance.now();
  const provider = sharedEmbeddingProvider(profile,options);
  await provider.embed(["知识库检索预热"],{ kind:"query" });
  return {
    ok:true,
    modelId:profile.id,
    device:provider.actualDevice,
    elapsedMs:Math.round(performance.now() - startedAt),
    vaultRoot
  };
}

function createSchema(db) {
  db.exec(`
    PRAGMA journal_mode = DELETE;
    PRAGMA synchronous = FULL;
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE embeddings (
      card_id TEXT PRIMARY KEY,
      model TEXT NOT NULL,
      dimension INTEGER NOT NULL,
      content_hash TEXT NOT NULL,
      semantic_text TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT,
      area_ids TEXT NOT NULL,
      file_extension TEXT,
      duration_seconds REAL,
      updated_at TEXT,
      vector BLOB NOT NULL
    );
    CREATE INDEX embeddings_type_idx ON embeddings(type);
    CREATE INDEX embeddings_status_idx ON embeddings(status);
  `);
}

function cardStatus(card) {
  return card.type === "knowledge" ? card.confidence || "" : card.type === "source" ? card.readingStatus || "" : card.status || "";
}

export async function rebuildSemanticIndex(vaultRoot, options = {}) {
  const profile = getEmbeddingProfile(options.modelId || DEFAULT_EMBEDDING_MODEL_ID);
  const state = options.state || await loadRebuildState(vaultRoot);
  const documents = semanticDocuments(state.entries || []);
  const sourceHash = documentsHash(documents);
  const provider = options.provider || sharedEmbeddingProvider(profile,options);
  const targetPath = semanticPath(vaultRoot,profile);
  const temporaryPath = `${targetPath}.rebuild-${process.pid}-${Date.now()}`;
  await fs.mkdir(path.dirname(targetPath), { recursive:true });
  const db = new DatabaseSync(temporaryPath);
  createSchema(db);
  const insert = db.prepare(`INSERT INTO embeddings
    (card_id,model,dimension,content_hash,semantic_text,type,status,area_ids,file_extension,duration_seconds,updated_at,vector)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`);
  const meta = db.prepare("INSERT INTO meta(key,value) VALUES(?,?)");
  let dimension = 0;
  try {
    db.exec("BEGIN IMMEDIATE");
    const batchSize = 8;
    for (let offset = 0; offset < documents.length; offset += batchSize) {
      const batch = documents.slice(offset, offset + batchSize);
      const vectors = await provider.embed(batch.map(item => item.text), { kind:"document" });
      batch.forEach((item,index) => {
        const vector = vectors[index];
        dimension ||= vector.length;
        const card = item.card;
        insert.run(
          card.id, provider.model || profile.model, vector.length,
          crypto.createHash("sha256").update(item.text).digest("hex"), item.text, card.type, cardStatus(card),
          JSON.stringify(card.areaRefs || []), card.fileExtension || null, Number(card.durationSeconds) || null,
          card.updatedAt || card.updated || null, bufferFromVector(vector)
        );
      });
      options.onProgress?.({ completed:Math.min(offset + batch.length,documents.length), total:documents.length });
    }
    const updatedAt = new Date().toISOString();
    meta.run("schemaVersion", "3");
    meta.run("updatedAt", updatedAt);
    meta.run("profileId", profile.id);
    meta.run("model", provider.model || profile.model);
    meta.run("dtype", profile.dtype);
    meta.run("device", provider.actualDevice || options.device || "test");
    meta.run("deviceFallbackReason", provider.fallbackReason || "");
    meta.run("dimension", String(dimension));
    meta.run("cardCount", String(documents.length));
    meta.run("sourceHash", sourceHash);
    db.exec("COMMIT");
    db.close();
    await fs.rm(targetPath, { force:true });
    await fs.rename(temporaryPath,targetPath);
    return {
      ok:true,
      updatedAt,
      model:provider.model || profile.model,
      modelId:profile.id,
      modelLabel:profile.label,
      dtype:profile.dtype,
      device:provider.actualDevice || options.device || "test",
      deviceFallbackReason:provider.fallbackReason || null,
      cacheDir:options.cacheDir,
      dimension,
      cardCount:documents.length,
      path:targetPath
    };
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch {}
    try { db.close(); } catch {}
    await fs.rm(temporaryPath, { force:true });
    throw error;
  }
}

function metadataMatches(row, options) {
  if (options.type && row.type !== options.type) return false;
  if (Array.isArray(options.types) && options.types.length && !options.types.includes(row.type)) return false;
  if (options.status && row.status !== options.status) return false;
  if (options.extension && row.file_extension !== String(options.extension).toLowerCase()) return false;
  if (options.areaId && !JSON.parse(row.area_ids || "[]").includes(options.areaId)) return false;
  if (options.dateFrom && String(row.updated_at || "") < options.dateFrom) return false;
  if (options.dateTo && String(row.updated_at || "").slice(0,10) > options.dateTo) return false;
  if (options.minDuration !== "" && options.minDuration != null && (row.duration_seconds == null || row.duration_seconds < Number(options.minDuration))) return false;
  if (options.maxDuration !== "" && options.maxDuration != null && (row.duration_seconds == null || row.duration_seconds > Number(options.maxDuration))) return false;
  return true;
}

export function semanticQueryEligibility(value) {
  const query = String(value || "").trim();
  if (!query) return { eligible:false, reason:"empty" };
  const compact = query.replace(/\s+/g, "");
  const letters = query.match(/\p{L}/gu) || [];
  const numbers = query.match(/\p{N}/gu) || [];
  if (!letters.length) return { eligible:false, reason:"non-language" };
  if (compact.length >= 8 && !/\s/.test(query) && numbers.length / compact.length >= 0.5) {
    return { eligible:false, reason:"identifier-like" };
  }
  return { eligible:true, reason:null };
}

export function selectRelevantSemanticResults(results, options = {}) {
  const sorted = [...(results || [])].sort((a,b) => b.semanticScore - a.semanticScore);
  const minimumScore = Number.isFinite(Number(options.minimumScore)) ? Number(options.minimumScore) : 0.35;
  const maxDrop = Number.isFinite(Number(options.maxDrop)) ? Number(options.maxDrop) : 0.12;
  const limit = Math.min(Math.max(Number(options.limit) || 80,1),200);
  if (!sorted.length) return { results:[], threshold:minimumScore, rejectedCount:0 };
  const threshold = Math.max(minimumScore, sorted[0].semanticScore - maxDrop);
  const selected = sorted.filter(result => result.semanticScore >= threshold).slice(0,limit);
  return { results:selected, threshold, rejectedCount:sorted.length - selected.length };
}

export async function semanticSearch(vaultRoot, options = {}) {
  const query = String(options.query || "").trim();
  if (!query) return { query, count:0, results:[] };
  const profile = getEmbeddingProfile(options.modelId || DEFAULT_EMBEDDING_MODEL_ID);
  const dbPath = await readableSemanticPath(vaultRoot,profile);
  const state = await loadRebuildState(vaultRoot);
  const activeIds = new Set((state.entries || []).filter(card => !card.deletedAt).map(card => card.id));
  const db = new DatabaseSync(dbPath, { readOnly:true });
  try {
    const meta = Object.fromEntries(db.prepare("SELECT key,value FROM meta").all().map(row => [row.key,row.value]));
    const provider = options.provider || sharedEmbeddingProvider(profile,options);
    const [queryVector] = await provider.embed([query], { kind:"query" });
    const rows = db.prepare("SELECT * FROM embeddings").all().filter(row => activeIds.has(row.card_id) && metadataMatches(row,options));
    const limit = Math.min(Math.max(Number(options.limit) || 80,1),200);
    const results = rows.map(row => ({
      id:row.card_id,
      semanticScore:dot(queryVector,vectorFromBuffer(row.vector,row.dimension)),
      type:row.type,
      updatedAt:row.updated_at
    })).sort((a,b) => b.semanticScore - a.semanticScore).slice(0,limit);
    return {
      query,
      model:meta.model,
      modelId:profile.id,
      modelLabel:profile.label,
      minimumScore:profile.minimumScore,
      maxDrop:profile.maxDrop,
      count:results.length,
      results
    };
  } finally { db.close(); }
}

export async function semanticIndexStatus(vaultRoot, options = {}) {
  const profile = getEmbeddingProfile(options.modelId || DEFAULT_EMBEDDING_MODEL_ID);
  const dbPath = await readableSemanticPath(vaultRoot,profile);
  const cacheDir = options.cacheDir || path.join(vaultRoot,"系统","模型");
  const cachePath = modelCachePath(cacheDir,profile);
  const availableModels = listEmbeddingProfiles();
  const modelReady = await fs.access(cachePath).then(() => true, () => false);
  try {
    const stat = await fs.stat(dbPath);
    const db = new DatabaseSync(dbPath, { readOnly:true });
    try {
      const meta = Object.fromEntries(db.prepare("SELECT key,value FROM meta").all().map(row => [row.key,row.value]));
      const state = await loadRebuildState(vaultRoot);
      const documents = semanticDocuments(state.entries || []);
      const sourceCount = documents.length;
      const needsRebuild = meta.profileId !== profile.id || Number(meta.cardCount || 0) !== sourceCount || meta.sourceHash !== documentsHash(documents);
      return {
        exists:true,
        healthy:true,
        path:dbPath,
        size:stat.size,
        updatedAt:meta.updatedAt,
        model:meta.model,
        modelId:profile.id,
        modelLabel:profile.label,
        dtype:meta.dtype || profile.dtype,
        device:meta.device || null,
        deviceFallbackReason:meta.deviceFallbackReason || null,
        dimension:Number(meta.dimension || 0),
        indexedCount:Number(meta.cardCount || 0),
        sourceCount,
        needsRebuild,
        cacheDir,
        cachePath,
        modelReady,
        availableModels,
        legacyIndexPath:path.join(vaultRoot,LEGACY_INDEX_RELATIVE_PATH)
      };
    } finally { db.close(); }
  } catch (error) {
    return {
      exists:false,
      healthy:false,
      path:dbPath,
      indexedCount:0,
      modelId:profile.id,
      model:profile.model,
      modelLabel:profile.label,
      dtype:profile.dtype,
      cacheDir,
      cachePath,
      modelReady,
      availableModels,
      legacyIndexPath:path.join(vaultRoot,LEGACY_INDEX_RELATIVE_PATH),
      message:error.message
    };
  }
}
