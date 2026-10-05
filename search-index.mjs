import path from "node:path";
import CardMarkdown from "./card-markdown.js";
import { promises as fs } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {readCardFiles} from './vault-cards.mjs';

const INDEX_RELATIVE_PATH = path.join("系统", "索引", "knowledge.sqlite");
const REFERENCE_FIELDS = ["areaRefs", "projectRefs", "sourceRefs", "relatedRefs"];

function indexPath(vaultRoot) {
  return path.join(vaultRoot, INDEX_RELATIVE_PATH);
}

function readJson(filePath, fallback) {
  return fs.readFile(filePath, "utf8").then(JSON.parse).catch(() => fallback);
}

export async function loadRebuildState(vaultRoot) {
  const disk = await readCardFiles(vaultRoot);
  if(disk.found) return {...disk.state,source:'markdown-cards'};
  // Compatibility for legacy migration tools with no card directory yet.
  const state = await readJson(path.join(vaultRoot,'系统','latest-state.json'),null);
  if(!state) return {...disk.state,source:'markdown-cards'};
  const deletedIds=new Set(disk.state.tombstones.map(item=>item.id));
  return {...state,entries:(state.entries || state.cards || []).filter(card=>!deletedIds.has(card.id)),source:'legacy-state'};
}

function statusValue(card) {
  if (card.deletedAt) return "deleted";
  return card.type === "knowledge" ? card.confidence || "" : card.type === "source" ? card.readingStatus || "" : card.status || "";
}

function textValue(value) {
  if (Array.isArray(value)) return value.map(textValue).join(" ");
  if (value && typeof value === "object") return Object.values(value).map(textValue).join(" ");
  return String(value ?? "");
}

function searchableBody(card) {
  const ignored = new Set(["id", "type", "title", "createdAt", "updatedAt", "created", "updated", "deletedAt", "legacyRecord", ...REFERENCE_FIELDS]);
  return Object.entries(card)
    .filter(([key]) => !ignored.has(key))
    .map(([key, value]) => key === "content" ? CardMarkdown.plainText(value) : textValue(value))
    .filter(Boolean)
    .join("\n");
}

function chineseBigrams(value) {
  const groups = String(value || "").match(/[\u3400-\u9fff]+/g) || [];
  const terms = [];
  groups.forEach(group => {
    if (group.length === 1) terms.push(group);
    for (let i = 0; i < group.length - 1; i += 1) terms.push(group.slice(i, i + 2));
  });
  return [...new Set(terms)].join(" ");
}

function ftsText(value) {
  const plain = String(value || "");
  return `${plain}\n${chineseBigrams(plain)}`;
}

function ftsQuery(value) {
  const plainTerms = String(value || "").trim().split(/\s+/).filter(term => term && !/[\u3400-\u9fff]{2}/.test(term));
  const latinTerms = String(value || "").match(/[A-Za-z0-9_.+-]+/g) || [];
  const bigrams = chineseBigrams(value).split(/\s+/).filter(Boolean);
  const terms = [...new Set([...plainTerms, ...latinTerms, ...bigrams])]
    .map(term => term.replace(/["*:^(){}\[\]]/g, " ").trim())
    .filter(Boolean);
  // English fragments such as crop should match cropdetect; IDs and numbers
  // still use complete tokens so their meaning does not become ambiguous.
  return terms.map(term => `"${term.replaceAll('"', '""')}"${/^[A-Za-z]{2,}$/.test(term) ? "*" : ""}`).join(" AND ");
}

function createSchema(db) {
  db.exec(`
    PRAGMA journal_mode = DELETE;
    PRAGMA synchronous = FULL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT,
      area_ids TEXT NOT NULL DEFAULT '[]',
      asset_id TEXT,
      asset_path TEXT,
      asset_category TEXT,
      file_extension TEXT,
      duration_seconds REAL,
      created_at TEXT,
      updated_at TEXT,
      deleted_at TEXT,
      raw_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS cards_type_idx ON cards(type);
    CREATE INDEX IF NOT EXISTS cards_status_idx ON cards(status);
    CREATE INDEX IF NOT EXISTS cards_extension_idx ON cards(file_extension);
    CREATE INDEX IF NOT EXISTS cards_updated_idx ON cards(updated_at);
    CREATE TABLE IF NOT EXISTS relations (
      source_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      PRIMARY KEY(source_id, target_id, kind)
    );
    CREATE INDEX IF NOT EXISTS relations_target_idx ON relations(target_id);
    CREATE VIRTUAL TABLE IF NOT EXISTS cards_fts USING fts5(
      id UNINDEXED,
      title,
      body,
      areas,
      tokenize='unicode61 remove_diacritics 2'
    );
  `);
}

export async function rebuildSearchIndex(vaultRoot, suppliedState = null) {
  const state = suppliedState || await loadRebuildState(vaultRoot);
  const cards = state.entries || state.cards || [];
  const byId = new Map(cards.map(card => [card.id, card]));
  const targetPath = indexPath(vaultRoot);
  const temporaryPath = `${targetPath}.rebuild-${process.pid}-${Date.now()}`;
  await fs.mkdir(path.dirname(targetPath), { recursive:true });
  const db = new DatabaseSync(temporaryPath);
  createSchema(db);
  const insertCard = db.prepare(`INSERT INTO cards
    (id,type,title,status,area_ids,asset_id,asset_path,asset_category,file_extension,duration_seconds,created_at,updated_at,deleted_at,raw_json)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insertFts = db.prepare("INSERT INTO cards_fts(id,title,body,areas) VALUES(?,?,?,?)");
  const insertRelation = db.prepare("INSERT OR IGNORE INTO relations(source_id,target_id,kind) VALUES(?,?,?)");
  const insertMeta = db.prepare("INSERT OR REPLACE INTO meta(key,value) VALUES(?,?)");

  let updatedAt;
  try {
    db.exec("BEGIN IMMEDIATE; DELETE FROM cards; DELETE FROM relations; DELETE FROM cards_fts; DELETE FROM meta;");
    cards.forEach(card => {
      const areaNames = (card.areaRefs || []).map(id => byId.get(id)?.title).filter(Boolean).join(" ");
      const relationTitles = ["relatedRefs", "sourceRefs", "projectRefs"]
        .flatMap(field => card[field] || [])
        .map(id => byId.get(id))
        .filter(target => target && !target.deletedAt && ["project", "knowledge", "source", "review"].includes(target.type))
        .map(target => target.title);
      const body = `${searchableBody(card)}\n${[...new Set(relationTitles)].join(" ")}`;
      insertCard.run(
        card.id, card.type, card.title, statusValue(card), JSON.stringify(card.areaRefs || []), card.assetId || null,
        card.assetPath || null, card.assetCategory || null, card.fileExtension || null, Number(card.durationSeconds) || null,
        card.createdAt || card.created || null, card.updatedAt || card.updated || null, card.deletedAt || null, JSON.stringify(card)
      );
      insertFts.run(card.id, ftsText(card.title), ftsText(body), ftsText(areaNames));
      REFERENCE_FIELDS.forEach(kind => (card[kind] || []).forEach(targetId => insertRelation.run(card.id, targetId, kind)));
    });
    updatedAt = new Date().toISOString();
    insertMeta.run("schemaVersion", "1");
    insertMeta.run("updatedAt", updatedAt);
    insertMeta.run("cardCount", String(cards.length));
    insertMeta.run("source", state.source || (suppliedState ? "live-state" : "unknown"));
    db.exec("COMMIT;");
  } catch (error) {
    try { db.exec("ROLLBACK;"); } catch {}
    try { db.close(); } catch {}
    await fs.rm(temporaryPath, { force:true });
    throw error;
  }
  db.close();
  await fs.rm(targetPath, { force:true });
  await fs.rm(`${targetPath}-wal`, { force:true });
  await fs.rm(`${targetPath}-shm`, { force:true });
  await fs.rename(temporaryPath, targetPath);
  return { ok:true, updatedAt, cardCount:cards.length, path:targetPath };
}

export async function searchIndex(vaultRoot, options = {}) {
  const dbPath = indexPath(vaultRoot);
  try { await fs.access(dbPath); } catch { await rebuildSearchIndex(vaultRoot); }
  const db = new DatabaseSync(dbPath, { readOnly:true });
  try {
    const where = [options.includeDeleted ? "1=1" : "c.deleted_at IS NULL"];
    const values = [];
    const rawQuery = String(options.query || "").trim();
    const query = ftsQuery(rawQuery);
    let join = "";
    let rank = "0 AS rank";
    if (query) {
      join = "JOIN cards_fts f ON f.id = c.id";
      where.push("cards_fts MATCH ?");
      values.push(query);
      rank = "bm25(cards_fts, 0, 7, 2, 3) AS rank";
    } else if (rawQuery) {
      where.push("0=1");
    }
    if (options.type) { where.push("c.type = ?"); values.push(options.type); }
    if (Array.isArray(options.types) && options.types.length) {
      where.push(`c.type IN (${options.types.map(() => "?").join(",")})`);
      values.push(...options.types);
    }
    if (options.status) { where.push("c.status = ?"); values.push(options.status); }
    if (options.extension) { where.push("c.file_extension = ?"); values.push(String(options.extension).toLowerCase()); }
    if (options.areaId) { where.push("EXISTS (SELECT 1 FROM json_each(c.area_ids) WHERE value = ?)"); values.push(options.areaId); }
    if (options.dateFrom) { where.push("c.updated_at >= ?"); values.push(options.dateFrom); }
    if (options.dateTo) { where.push("c.updated_at <= ?"); values.push(`${options.dateTo}T23:59:59.999Z`); }
    if (Number.isFinite(Number(options.minDuration)) && options.minDuration !== "") { where.push("c.duration_seconds >= ?"); values.push(Number(options.minDuration)); }
    if (Number.isFinite(Number(options.maxDuration)) && options.maxDuration !== "") { where.push("c.duration_seconds <= ?"); values.push(Number(options.maxDuration)); }
    const order = query ? "rank ASC, c.updated_at DESC" : "c.updated_at DESC";
    const limit = Math.min(Math.max(Number(options.limit) || 200, 1), 500);
    const rows = db.prepare(`SELECT c.id, c.type, c.title, c.status, c.updated_at AS updatedAt, ${rank}
      FROM cards c ${join} WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT ${limit}`).all(...values);
    return { query:options.query || "", count:rows.length, results:rows.map(row => ({ ...row })) };
  } finally {
    db.close();
  }
}

export async function searchIndexStatus(vaultRoot) {
  const dbPath = indexPath(vaultRoot);
  try {
    const stat = await fs.stat(dbPath);
    const db = new DatabaseSync(dbPath, { readOnly:true });
    try {
      const meta = Object.fromEntries(db.prepare("SELECT key,value FROM meta").all().map(row => [row.key, row.value]));
      const state = await loadRebuildState(vaultRoot);
      const sourceCount = (state.entries || state.cards || []).length;
      return {
        exists:true,
        healthy:true,
        path:dbPath,
        size:stat.size,
        updatedAt:meta.updatedAt || null,
        source:meta.source || "unknown",
        indexedCount:Number(meta.cardCount || 0),
        sourceCount,
        needsRebuild:Number(meta.cardCount || 0) !== sourceCount
      };
    } finally { db.close(); }
  } catch (error) {
    return { exists:false, healthy:false, path:dbPath, indexedCount:0, sourceCount:0, needsRebuild:true, message:error.message };
  }
}
