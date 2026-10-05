import http from "node:http";
import path from "node:path";
import crypto from "node:crypto";
import { promises as fs, constants as fsConstants, createReadStream, existsSync, readdirSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { rebuildSearchIndex, searchIndex, searchIndexStatus } from "./search-index.mjs";
import {
  rebuildSemanticIndex,
  semanticSearch,
  semanticIndexStatus,
  semanticQueryEligibility,
  selectRelevantSemanticResults,
  warmSemanticModel
} from "./semantic-index.mjs";

const APP_ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.WORKBENCH_PORT || 4173);
const HOST = "127.0.0.1";
function detectVaultRoot() {
  if (process.env.PERSONAL_VAULT_PATH) return path.resolve(process.env.PERSONAL_VAULT_PATH);
  const candidates = [];
  if (process.platform === "win32") {
    const letters = ["E", ..."DEFGHIJKLMNOPQRSTUVWXYZ"].filter((letter, index, all) => all.indexOf(letter) === index);
    letters.forEach(letter => candidates.push(`${letter}:\\PersonalVault`));
  } else if (process.platform === "darwin") {
    try {
      readdirSync("/Volumes", { withFileTypes:true })
        .filter(item => item.isDirectory())
        .forEach(item => {
          candidates.push(path.join("/Volumes", item.name));
          candidates.push(path.join("/Volumes", item.name, "PersonalVault"));
        });
    } catch {}
  }
  candidates.push(path.join(APP_ROOT, "PersonalVault"));
  const found = candidates.find(candidate => existsSync(path.join(candidate, "vault.json")));
  if (found) return path.resolve(found);
  return path.resolve(process.platform === "win32" ? "E:\\PersonalVault" : "/Volumes/PersonalVault");
}

const VAULT_ROOT = detectVaultRoot();
const MAX_BODY = 20 * 1024 * 1024;
const MAX_CANVAS_BODY = 100 * 1024 * 1024;
const execFileAsync = promisify(execFile);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".wasm": "application/wasm",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

const TYPE_DIR = {
  capture: "随手记",
  area: "领域",
  project: "项目",
  review: "项目复盘",
  knowledge: "知识",
  source: "资料"
};

const FIELD_LABELS = {
  goal: "目标与场景",
  content: "内容",
  origin: "来源",
  rawContent: "原始内容",
  description: "说明",
  scope: "判断边界",
  challenge: "问题与目标",
  desired: "期望结果",
  existingSolution: "现成能力",
  customDecision: "需要自己判断",
  myRole: "我的角色",
  agentWork: "Agent或他人的工作",
  nextStep: "下一步",
  tasks: "待办列表",
  result: "最终结果",
  worked: "有效做法",
  problems: "遇到的问题",
  existing: "已有答案",
  lesson: "行动规则",
  conclusion: "核心结论",
  applies: "适用场景",
  limits: "边界与例外",
  summaryText: "我的摘要",
  candidate: "待进一步处理"
};

function sendJson(res, status, value) {
  res.writeHead(status, { "Content-Type": MIME[".json"], "Cache-Control": "no-store" });
  res.end(JSON.stringify(value));
}

function safeTitle(value) {
  const cleaned = String(value || "未命名")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, 80);
  return cleaned || "未命名";
}

function relativeSlash(value) {
  return value.split(path.sep).join("/");
}

function cardMarkdown(card) {
  const metadata = Object.keys(card)
    .sort()
    .map(key => `${key}: ${JSON.stringify(card[key] ?? null)}`)
    .join("\n");
  const body = Object.entries(FIELD_LABELS)
    .filter(([key]) => String(card[key] || "").trim())
    .map(([key, label]) => {
      const value = key === "tasks" && Array.isArray(card.tasks)
        ? card.tasks.map(task => `- [${task.done ? "x" : " "}] ${task.text}`).join("\n")
        : String(card[key]).trim();
      return `## ${label}\n\n${value}`;
    })
    .join("\n\n");
  return `---\n${metadata}\n---\n\n# ${card.title || "未命名内容"}\n\n${body || "_暂无正文_"}\n`;
}

function normalizeTombstones(items = []) {
  const byId = new Map();
  (Array.isArray(items) ? items : []).forEach(item => {
    if (!item?.id || !item?.type || !item?.deletedAt) return;
    byId.set(String(item.id), { id:String(item.id), type:String(item.type), deletedAt:String(item.deletedAt) });
  });
  return [...byId.values()];
}

async function readTombstones() {
  try {
    const stored = JSON.parse(await fs.readFile(path.join(VAULT_ROOT, "系统", "tombstones.json"), "utf8"));
    return normalizeTombstones(stored?.tombstones);
  } catch {
    return [];
  }
}

async function writeTombstones(tombstones) {
  await writeDurable(path.join(VAULT_ROOT, "系统", "tombstones.json"), `${JSON.stringify({ schemaVersion:1, updatedAt:new Date().toISOString(), tombstones:normalizeTombstones(tombstones) }, null, 2)}\n`);
}

async function appendSyncLog(event) {
  const logPath = path.join(VAULT_ROOT, "系统", "日志", "sync-events.jsonl");
  await fs.mkdir(path.dirname(logPath), { recursive:true });
  const handle = await fs.open(logPath, "a");
  try {
    await handle.writeFile(`${JSON.stringify({ timestamp:new Date().toISOString(), ...event })}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function parseMarkdownCard(markdown) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  const card = {};
  match[1].split(/\r?\n/).forEach(line => {
    const separator = line.indexOf(":");
    if (separator < 1) return;
    const key = line.slice(0,separator).trim();
    const raw = line.slice(separator + 1).trim();
    try { card[key] = JSON.parse(raw); } catch { card[key] = raw; }
  });
  return card.id ? card : null;
}

async function markdownInventory() {
  const cardsRoot = path.join(VAULT_ROOT, "卡片");
  const files = [];
  async function walk(directory) {
    let items = [];
    try { items = await fs.readdir(directory, { withFileTypes:true }); } catch { return; }
    for (const item of items) {
      const itemPath = path.join(directory,item.name);
      if (item.isDirectory()) await walk(itemPath);
      else if (item.isFile() && item.name.toLowerCase().endsWith(".md")) {
        let card = null;
        try { card = parseMarkdownCard(await fs.readFile(itemPath,"utf8")); } catch {}
        files.push({
          absolutePath:itemPath,
          relativePath:relativeSlash(path.relative(VAULT_ROOT,itemPath)),
          id:card?.id || null
        });
      }
    }
  }
  await walk(cardsRoot);
  return files;
}

function integrityReport(files, manifest) {
  const registered = new Set(Object.values(manifest.cards || {}).map(item => item.path));
  const existing = new Set(files.map(item => item.relativePath));
  return {
    healthy:[...registered].every(item => existing.has(item)) && files.every(item => registered.has(item.relativePath)),
    missingMarkdown:[...registered].filter(item => !existing.has(item)),
    unknownMarkdown:files.filter(item => !registered.has(item.relativePath)).map(item => item.relativePath)
  };
}

export async function ensureVault() {
  const folders = [
    "卡片/随手记", "卡片/领域", "卡片/项目", "卡片/项目复盘", "卡片/知识", "卡片/资料", "卡片/回收站",
    "文件/项目", "文件/知识", "文件/资料",
    "系统/索引", "系统/预览缓存", "系统/日志"
  ];
  await Promise.all(folders.map(folder => fs.mkdir(path.join(VAULT_ROOT, folder), { recursive: true })));
  const info = {
    format: "personal-knowledge-vault",
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    note: "卡片与原始文件是长期数据；系统目录中的索引可以重建。"
  };
  const infoPath = path.join(VAULT_ROOT, "vault.json");
  try { await fs.access(infoPath); }
  catch { await writeDurable(infoPath, `${JSON.stringify(info, null, 2)}\n`); }
}

async function writeDurable(target, content) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const handle = await fs.open(target, "w");
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function vaultStatus() {
  try {
    const stat = await fs.stat(VAULT_ROOT);
    if (!stat.isDirectory()) return { connected:false, writable:false, path:VAULT_ROOT, message:"知识库位置不是文件夹" };
    try {
      await fs.access(VAULT_ROOT, fsConstants.R_OK | fsConstants.W_OK);
      return { connected:true, writable:true, path:VAULT_ROOT };
    } catch {
      return { connected:true, writable:false, path:VAULT_ROOT, message:"知识库可以读取，但当前系统不能写入" };
    }
  } catch (error) {
    return { connected: false, writable: false, path: VAULT_ROOT, message: error.code === "ENOENT" ? "尚未初始化" : error.message };
  }
}

let syncQueue = Promise.resolve();

export function syncCards(payload) {
  const operation = syncQueue.then(() => syncCardsOnce(payload), () => syncCardsOnce(payload));
  syncQueue = operation.catch(() => {});
  return operation;
}

async function syncCardsOnce(payload) {
  const cards = payload?.cards || payload?.entries || payload?.state?.entries;
  if (!Array.isArray(cards)) throw new Error("没有找到卡片数据");
  await ensureVault();

  const manifestPath = path.join(VAULT_ROOT, "系统", "cards-manifest.json");
  let previous = { cards: {} };
  try { previous = JSON.parse(await fs.readFile(manifestPath, "utf8")); } catch {}

  const persistedTombstones = await readTombstones();
  const tombstones = normalizeTombstones([...persistedTombstones, ...(payload?.tombstones || payload?.state?.tombstones || [])]);
  const tombstoneById = new Map(tombstones.map(item => [item.id,item]));
  let previousState = { entries:[] };
  try { previousState = JSON.parse(await fs.readFile(path.join(VAULT_ROOT,"系统","latest-state.json"),"utf8")); } catch {}
  const previousEntries = new Map((previousState.entries || previousState.cards || []).map(card => [card.id,card]));
  const persistedTombstoneIds = new Set(persistedTombstones.map(item => item.id));
  const invalidPermanentDeletes = tombstones.filter(item => {
    if (persistedTombstoneIds.has(item.id)) return false;
    const previousCard = previousEntries.get(item.id);
    const previousPath = previous.cards?.[item.id]?.path || "";
    return previousCard && !previousCard.deletedAt && !previousPath.replaceAll("\\","/").startsWith("卡片/回收站/");
  });
  if (invalidPermanentDeletes.length) {
    await appendSyncLog({ action:"sync-rejected", reason:"permanent-delete-outside-trash", ids:invalidPermanentDeletes.map(item => item.id) });
    throw new Error("只有已经位于回收站的卡片可以永久删除");
  }
  const cardIds = new Set();
  cards.forEach(card => {
    if (!card?.id || !card?.type || !card?.title) throw new Error("存在缺少ID、类型或标题的卡片，已经停止写入");
    if (cardIds.has(card.id)) throw new Error(`存在重复卡片ID：${card.id}`);
    if (tombstoneById.has(card.id)) throw new Error(`卡片 ${card.id} 已被永久删除，不能重新同步`);
    cardIds.add(card.id);
  });
  const unexplainedRemovals = Object.keys(previous.cards || {}).filter(id => !cardIds.has(id) && !tombstoneById.has(id));
  if (unexplainedRemovals.length) {
    await appendSyncLog({ action:"sync-rejected", reason:"missing-tombstone", ids:unexplainedRemovals });
    throw new Error(`有 ${unexplainedRemovals.length} 张卡片从状态中消失，但没有永久删除记录；已停止同步`);
  }

  const next = { schemaVersion: payload.schemaVersion || 1, updatedAt: new Date().toISOString(), cards: {} };
  const written = [];
  const changes = [];
  const beforeFiles = await markdownInventory();
  for (const card of cards) {
    const previousInfo=previous.cards?.[card.id];
    if(/^[a-zA-Z0-9_-]{1,128}$/.test(String(card.id)) && (previousInfo?.title!==card.title || previousInfo?.type!==card.type))await queueCanvasStorage(async()=>{
      const attachments=await readCardAttachments(card.id);
      if(attachments.directory) {
        await prepareCardDirectory(attachments,card);
        const primary=attachments.assets[card.assetId];
        if(primary)card.assetPath=primary.relativePath || primary.absolutePath;
      }
    });
    const directory = card.deletedAt ? "回收站" : TYPE_DIR[card.type];
    if (!directory) throw new Error(`无法识别卡片类型：${card.type}`);
    const filename = `${safeTitle(card.title)}--${safeTitle(card.id)}.md`;
    const relativePath = path.join("卡片", directory, filename);
    const absolutePath = path.join(VAULT_ROOT, relativePath);
    const markdown = cardMarkdown(card);
    const hash = crypto.createHash("sha256").update(markdown).digest("hex");
    await writeDurable(absolutePath, markdown);
    next.cards[card.id] = { path: relativeSlash(relativePath), hash, title: card.title, type: card.type, updatedAt: card.updatedAt || card.updated || null };
    written.push(relativeSlash(relativePath));

    const oldRelative = previous.cards?.[card.id]?.path;
    if (oldRelative && oldRelative !== relativeSlash(relativePath)) {
      const oldPath = path.resolve(VAULT_ROOT, oldRelative);
      if (oldPath.startsWith(VAULT_ROOT + path.sep)) {
        await fs.unlink(oldPath).catch(error => { if (error.code !== "ENOENT") throw error; });
        changes.push({ id:card.id, action:card.deletedAt ? "moved-to-trash" : "restored-or-renamed", from:relativeSlash(oldRelative), to:relativeSlash(relativePath) });
      }
    }
    const unregisteredSameId = beforeFiles.filter(item => item.id === card.id && item.relativePath !== relativeSlash(relativePath) && item.relativePath !== oldRelative);
    for (const item of unregisteredSameId) {
      await fs.unlink(item.absolutePath).catch(error => { if (error.code !== "ENOENT") throw error; });
      changes.push({ id:card.id, action:"reconciled-unregistered-path", from:item.relativePath, to:relativeSlash(relativePath) });
    }
  }

  await writeTombstones(tombstones);
  const afterCardWrites = await markdownInventory();
  for (const tombstone of tombstones) {
    const paths = new Set([
      previous.cards?.[tombstone.id]?.path,
      ...afterCardWrites.filter(item => item.id === tombstone.id).map(item => item.relativePath)
    ].filter(Boolean));
    for (const relativePath of paths) {
      const target = path.resolve(VAULT_ROOT,relativePath);
      if (!target.startsWith(path.join(VAULT_ROOT,"卡片") + path.sep)) continue;
      await fs.unlink(target).catch(error => { if (error.code !== "ENOENT") throw error; });
      changes.push({ id:tombstone.id, action:"permanently-deleted-card-markdown", from:relativeSlash(relativePath) });
    }
  }

  await writeDurable(manifestPath, `${JSON.stringify(next, null, 2)}\n`);
  await writeDurable(path.join(VAULT_ROOT, "系统", "latest-state.json"), `${JSON.stringify({ schemaVersion: payload.schemaVersion || 1, updatedAt: payload.stateUpdatedAt || new Date().toISOString(), entries: cards, tombstones }, null, 2)}\n`);
  const index = await rebuildSearchIndex(VAULT_ROOT, { entries:cards });
  const integrity = integrityReport(await markdownInventory(),next);
  await appendSyncLog({ action:"sync-complete", cardCount:cards.length, tombstoneCount:tombstones.length, changes, integrity });
  return { written: written.length, path: VAULT_ROOT, manifest: relativeSlash(path.relative(VAULT_ROOT, manifestPath)), index, tombstones:tombstones.length, integrity };
}

export async function loadLatestState() {
  const statePath = path.join(VAULT_ROOT, "系统", "latest-state.json");
  try {
    const state = JSON.parse(await fs.readFile(statePath, "utf8"));
    const entries = state?.entries || state?.cards;
    if (!Array.isArray(entries)) throw new Error("移动硬盘中的最新状态文件格式不正确");
    const tombstones = normalizeTombstones([...(await readTombstones()), ...(state.tombstones || [])]);
    const tombstoneIds = new Set(tombstones.map(item => item.id));
    return { found:true, path:VAULT_ROOT, state:{ ...state, entries:entries.filter(card => !tombstoneIds.has(card.id)), tombstones } };
  } catch (error) {
    if (error.code === "ENOENT") return { found:false, path:VAULT_ROOT, state:null };
    throw error;
  }
}

export async function querySearchIndex(options = {}) {
  return searchIndex(VAULT_ROOT, options);
}

export async function rebuildIndex() {
  return rebuildSearchIndex(VAULT_ROOT);
}

export async function getIndexStatus() {
  return searchIndexStatus(VAULT_ROOT);
}

function semanticOptions(options = {}) {
  return {
    ...options,
    modelId:options.semanticModel || options.modelId,
    device:options.semanticDevice || options.device || process.env.WORKBENCH_MODEL_DEVICE || "auto",
    cacheDir:process.env.WORKBENCH_MODEL_CACHE || path.join(VAULT_ROOT,"系统","模型")
  };
}

export async function rebuildSemantic(options = {}) {
  return rebuildSemanticIndex(VAULT_ROOT, semanticOptions(options));
}

export async function getSemanticStatus(options = {}) {
  return semanticIndexStatus(VAULT_ROOT, semanticOptions(options));
}

export async function warmSemantic(options = {}) {
  return warmSemanticModel(VAULT_ROOT, semanticOptions(options));
}

const pendingSemanticUpdates = new Map();
async function ensureCurrentSemanticIndex(options) {
  const key = options.semanticModel || "default";
  if (pendingSemanticUpdates.has(key)) return pendingSemanticUpdates.get(key);
  const pending = (async () => {
    const status = await getSemanticStatus(options);
    if (!status.healthy || status.needsRebuild) await rebuildSemantic(options);
  })();
  pendingSemanticUpdates.set(key, pending);
  try { await pending; } finally { pendingSemanticUpdates.delete(key); }
}

export async function queryCombinedSearch(options = {}) {
  const searchOptions = { ...options, types:["project","knowledge","source"] };
  const exact = await querySearchIndex(searchOptions);
  if (options.mode !== "hybrid" || !String(options.query || "").trim()) return { ...exact, engine:"exact" };
  const eligibility = semanticQueryEligibility(options.query);
  if (!eligibility.eligible) {
    return { ...exact, engine:"exact", semanticSkipped:eligibility.reason };
  }
  try {
    await ensureCurrentSemanticIndex(options);
    const semantic = await semanticSearch(VAULT_ROOT, semanticOptions(searchOptions));
    const relevant = selectRelevantSemanticResults(semantic.results, {
      limit:options.limit,
      minimumScore:semantic.minimumScore,
      maxDrop:semantic.maxDrop
    });
    const fused = new Map();
    relevant.results.forEach(result => fused.set(result.id, { ...result, exact:false, combinedScore:Math.max(0,result.semanticScore) * 0.55 }));
    exact.results.forEach((result,index) => {
      const current = fused.get(result.id) || { ...result, semanticScore:null };
      fused.set(result.id, { ...current, ...result, exact:true, combinedScore:(current.combinedScore || 0) + 1 + Math.max(0,0.15 - index * 0.005) });
    });
    const limit = Math.min(Math.max(Number(options.limit) || 200,1),500);
    const results = [...fused.values()].sort((a,b) => b.combinedScore - a.combinedScore).slice(0,limit);
    return {
      query:options.query || "",
      count:results.length,
      results,
      engine:"hybrid",
      semanticModel:semantic.model,
      semanticThreshold:relevant.threshold,
      semanticRejectedCount:relevant.rejectedCount,
      exactCount:exact.count
    };
  } catch (error) {
    return { ...exact, engine:"exact", semanticUnavailable:true, semanticError:error.message };
  }
}

const EXTENSION_CATEGORY = new Map([
  ...[".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tif", ".tiff", ".heic", ".svg"].map(ext => [ext, "图片"]),
  ...[".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v"].map(ext => [ext, "视频"]),
  ...[".mp3", ".wav", ".flac", ".aac", ".m4a", ".ogg"].map(ext => [ext, "音频"]),
  ...[".pdf", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx", ".txt", ".md", ".rtf", ".epub"].map(ext => [ext, "文档"]),
  ...[".fbx", ".obj", ".gltf", ".glb", ".stl", ".usd", ".usda", ".usdc", ".abc"].map(ext => [ext, "模型"]),
  ...[".blend", ".blend1", ".uproject", ".uasset", ".unity", ".psd", ".psb", ".ai", ".kra", ".c4d", ".ztl"].map(ext => [ext, "工程"])
]);

function categoryFor(filePath) {
  return EXTENSION_CATEGORY.get(path.extname(filePath).toLowerCase()) || "其他";
}

async function hashFile(filePath) {
  const hash = crypto.createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

async function probeMedia(filePath, category) {
  if (!["图片", "视频", "音频"].includes(category)) return {};
  try {
    const { stdout } = await execFileAsync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height,codec_name", "-of", "json", filePath], { windowsHide:true, maxBuffer:2 * 1024 * 1024 });
    const parsed = JSON.parse(stdout);
    const video = parsed.streams?.find(stream => stream.codec_type === "video");
    const audio = parsed.streams?.find(stream => stream.codec_type === "audio");
    const duration = Number(parsed.format?.duration);
    return {
      durationSeconds:Number.isFinite(duration) ? Math.round(duration * 1000) / 1000 : null,
      width:Number(video?.width) || null,
      height:Number(video?.height) || null,
      videoCodec:video?.codec_name || null,
      audioCodec:audio?.codec_name || null
    };
  } catch {
    return {};
  }
}

async function readAssetManifest() {
  const manifestPath = path.join(VAULT_ROOT, "系统", "assets-manifest.json");
  try { return JSON.parse(await fs.readFile(manifestPath, "utf8")); }
  catch { return { schemaVersion: 1, updatedAt: null, assets: {} }; }
}

async function writeAssetManifest(manifest) {
  manifest.updatedAt = new Date().toISOString();
  await writeDurable(path.join(VAULT_ROOT, "系统", "assets-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

function portableAssetPath(absolutePath) {
  const resolved = path.resolve(absolutePath);
  return resolved.startsWith(VAULT_ROOT + path.sep) ? relativeSlash(path.relative(VAULT_ROOT, resolved)) : null;
}

export async function importFiles(sourcePaths, mode = "copy") {
  if (!["copy", "move", "register"].includes(mode)) throw new Error("无法识别的导入方式");
  if (!Array.isArray(sourcePaths) || !sourcePaths.length) return { assets:[], skipped:[] };
  await ensureVault();
  const assets = [];
  const skipped = [];

  for (const source of sourcePaths) {
    const absoluteSource = path.resolve(source);
    const stat = await fs.stat(absoluteSource);
    if (!stat.isFile()) { skipped.push({ path:absoluteSource, reason:"不是普通文件" }); continue; }
    const contentHash = await hashFile(absoluteSource);
    const category = categoryFor(absoluteSource);
    const id = ownedAssetId();
    const ownerCardId=crypto.randomUUID();
    const manifest=await readCardAttachments(ownerCardId);
    const destinationDir=await prepareCardDirectory(manifest,{title:path.parse(absoluteSource).name,type:'source'});
    let finalPath = absoluteSource;
    let relativePath = portableAssetPath(absoluteSource);
    let portable = Boolean(relativePath);

    if (mode !== "register") {
      finalPath = await unusedAttachmentPath(destinationDir,path.basename(absoluteSource));
      relativePath = portableAssetPath(finalPath);
      portable = true;
      await fs.copyFile(absoluteSource, finalPath);
      const copiedHash = await hashFile(finalPath);
      if (copiedHash !== contentHash) throw new Error(`复制校验失败：${path.basename(absoluteSource)}`);
    }

    const finalStat = await fs.stat(finalPath);
    const media = await probeMedia(finalPath, category);
    const asset = {
      id,
      ownerCardId,
      originalName:path.basename(source),
      displayName:path.basename(finalPath),
      extension:path.extname(finalPath).toLowerCase(),
      category,
      size:finalStat.size,
      modifiedAt:finalStat.mtime.toISOString(),
      contentHash,
      storageMode:mode,
      portable,
      relativePath,
      absolutePath:portable ? null : finalPath,
      importedAt:new Date().toISOString(),
      ...media
    };
    manifest.assets[id] = asset;
    await writeCardAttachments(manifest);
    if(mode==='move')await fs.unlink(absoluteSource);
    assets.push(asset);
  }

  return { assets, skipped };
}

export async function getAsset(assetId) {
  const asset = await readStoredAsset(assetId);
  if (!asset) throw new Error("没有找到对应的文件记录");
  const absolutePath = asset.relativePath ? path.join(VAULT_ROOT, asset.relativePath) : asset.absolutePath;
  return { ...asset, absolutePath };
}

async function videoPreviewPath(asset) {
  const previewDir = path.join(VAULT_ROOT, "系统", "预览缓存");
  const target = path.join(previewDir, `${asset.id}-first-frame.jpg`);
  await fs.mkdir(previewDir, { recursive:true });
  try {
    const [sourceStat, previewStat] = await Promise.all([fs.stat(asset.absolutePath), fs.stat(target)]);
    if (previewStat.mtimeMs >= sourceStat.mtimeMs) return target;
  } catch {}
  const duration = Number(asset.durationSeconds);
  const seek = 0;
  try {
    await execFileAsync("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-ss", String(seek), "-i", asset.absolutePath,
      "-frames:v", "1", "-vf", "scale=960:-2:force_original_aspect_ratio=decrease", "-q:v", "3", "-y", target
    ], { windowsHide:true, maxBuffer:2 * 1024 * 1024 });
    return target;
  } catch {
    return null;
  }
}

export async function getAssetPresentation(assetId) {
  await ensureVault();
  const asset = await getAsset(assetId);
  let previewPath = null;
  if (asset.coverRelativePath) {
    const customCover = path.join(VAULT_ROOT, asset.coverRelativePath);
    try { await fs.access(customCover); previewPath = customCover; } catch {}
  }
  if (!previewPath && asset.category === "图片") previewPath = asset.absolutePath;
  if (!previewPath && asset.category === "视频") previewPath = await videoPreviewPath(asset);
  const playable = ["图片", "视频", "音频"].includes(asset.category);
  return {
    assetId,
    category:asset.category,
    previewUrl:previewPath ? pathToFileURL(previewPath).href : null,
    mediaUrl:playable ? pathToFileURL(asset.absolutePath).href : null,
    customCover:Boolean(asset.coverRelativePath && previewPath),
    extension:asset.extension,
    displayName:asset.displayName
  };
}

async function removeAssetCoverFile(assetId, relativePath) {
  if (!relativePath) return;
  const previewDir = path.resolve(VAULT_ROOT, "系统", "预览缓存");
  const target = path.resolve(VAULT_ROOT, relativePath);
  if (target.startsWith(previewDir + path.sep) && path.basename(target).startsWith(`${assetId}-cover`)) {
    await fs.unlink(target).catch(()=>{});
  }
}

export async function setAssetCover(assetId, selectedPath) {
  return queueCanvasStorage(async()=>{
  await ensureVault();
  const asset = await readStoredAsset(assetId);
  if (!asset) throw new Error("没有找到对应的文件记录");
  const absolutePath = path.resolve(selectedPath);
  const stat = await fs.stat(absolutePath);
  if (!stat.isFile() || categoryFor(absolutePath) !== "图片") throw new Error("封面必须是图片文件");
  const extension = path.extname(absolutePath).toLowerCase() || ".jpg";
  const relativePath = relativeSlash(path.join("系统", "预览缓存", `${assetId}-cover${extension}`));
  const target = path.join(VAULT_ROOT, relativePath);
  await fs.copyFile(absolutePath, target);
  if (asset.coverRelativePath !== relativePath) await removeAssetCoverFile(assetId,asset.coverRelativePath);
  asset.coverRelativePath = relativePath;
  await updateStoredAsset(asset);
  return getAssetPresentation(assetId);
  });
}

export async function clearAssetCover(assetId) {
  return queueCanvasStorage(async()=>{
  const asset = await readStoredAsset(assetId);
  if (!asset) throw new Error("没有找到对应的文件记录");
  const relativePath = asset.coverRelativePath;
  await removeAssetCoverFile(assetId,relativePath);
  delete asset.coverRelativePath;
  await updateStoredAsset(asset);
  return getAssetPresentation(assetId);
  });
}

export async function relinkAsset(assetId, selectedPath) {
  return queueCanvasStorage(async()=>{
  const asset = await readStoredAsset(assetId);
  if (!asset) throw new Error("没有找到对应的文件记录");
  const absolutePath = path.resolve(selectedPath);
  const stat = await fs.stat(absolutePath);
  if (!stat.isFile()) throw new Error("重新选择的位置不是文件");
  const contentHash = await hashFile(absolutePath);
  asset.contentHash = contentHash;
  asset.size = stat.size;
  asset.modifiedAt = stat.mtime.toISOString();
  let finalPath=absolutePath;
  if(asset.ownerCardId) {
    const owner=await readCardAttachments(asset.ownerCardId);
    const directory=await prepareCardDirectory(owner);
    finalPath=await unusedAttachmentPath(directory,path.basename(absolutePath));
    await fs.copyFile(absolutePath,finalPath);
    if(await hashFile(finalPath)!==contentHash)throw new Error('附件复制校验失败');
  }
  asset.relativePath = portableAssetPath(finalPath);
  asset.absolutePath = asset.relativePath ? null : finalPath;
  asset.portable = Boolean(asset.relativePath);
  asset.displayName = path.basename(finalPath);
  asset.extension = path.extname(absolutePath).toLowerCase();
  asset.category = categoryFor(absolutePath);
  Object.assign(asset, {
    durationSeconds:null,
    width:null,
    height:null,
    videoCodec:null,
    audioCodec:null,
    ...(await probeMedia(absolutePath, asset.category))
  });
  asset.relinkedAt = new Date().toISOString();
  await updateStoredAsset(asset);
  return { ...asset, absolutePath:finalPath };
  });
}

async function readBody(req, maxBytes = MAX_BODY) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error("数据包过大");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function attachmentManifestPath(cardId) {
  canvasDocumentPath(cardId); // Validate IDs before using them in paths.
  return path.join(VAULT_ROOT,'系统','附件清单',`${cardId}.json`);
}

function attachmentIndexPath(assetId) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(String(assetId))) throw new Error('附件 ID 无效');
  return path.join(VAULT_ROOT,'系统','附件索引',`${assetId}.json`);
}

async function writeAtomicJson(target,value) {
  const temporary=`${target}.${crypto.randomUUID()}.tmp`;
  try { await writeDurable(temporary,JSON.stringify(value,null,2)); await fs.rename(temporary,target); }
  finally { await fs.unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;}); }
}

async function readCardAttachments(cardId) {
  try { return JSON.parse(await fs.readFile(attachmentManifestPath(cardId),'utf8')); }
  catch(error) { if(error.code!=='ENOENT')throw error; return {schemaVersion:2,cardId,assets:{},sourceAssets:{},legacyAssets:{}}; }
}

async function writeCardAttachments(manifest) {
  manifest.updatedAt=new Date().toISOString();
  await writeAtomicJson(attachmentManifestPath(manifest.cardId),manifest);
  // Direct ID lookup; adding an attachment never rewrites a global inventory.
  for (const id of Object.keys(manifest.assets)) {
    const target=attachmentIndexPath(id);
    if (!existsSync(target)) await writeAtomicJson(target,{cardId:manifest.cardId});
  }
}

async function readStoredAsset(assetId) {
  let owner;
  try { owner=JSON.parse(await fs.readFile(attachmentIndexPath(assetId),'utf8')); }
  catch(error) { if(error.code!=='ENOENT')throw error; }
  if(owner) return (await readCardAttachments(owner.cardId)).assets[assetId] || null;
  if(String(assetId).startsWith('ca_')) return null;
  return (await readAssetManifest()).assets?.[assetId] || null;
}

async function updateStoredAsset(asset) {
  if(asset.ownerCardId) {
    const manifest=await readCardAttachments(asset.ownerCardId);
    manifest.assets[asset.id]=asset;
    await writeCardAttachments(manifest);
  } else {
    const manifest=await readAssetManifest();
    manifest.assets[asset.id]=asset;
    await writeAssetManifest(manifest);
  }
}

function ownedAssetId() { return `ca_${crypto.randomUUID()}`; }
function storedAssetPath(asset) { return asset.relativePath ? path.join(VAULT_ROOT,asset.relativePath) : asset.absolutePath; }

async function prepareCardDirectory(manifest,cardInfo={}) {
  const title=String(cardInfo.title || manifest.title || '未命名卡片');
  // Returning to the inbox retains the previous attachment category.
  const type=['project','knowledge','source'].includes(cardInfo.type) ? cardInfo.type : manifest.type || 'source';
  const directory=relativeSlash(path.join('文件',TYPE_DIR[type],`${safeTitle(title)}--${manifest.cardId}`));
  const target=path.resolve(VAULT_ROOT,directory);
  const filesRoot=path.join(VAULT_ROOT,'文件')+path.sep;
  if(!target.startsWith(filesRoot))throw new Error('附件目录无效');
  if(manifest.directory && manifest.directory!==directory) {
    const previous=path.resolve(VAULT_ROOT,manifest.directory);
    if(!previous.startsWith(filesRoot))throw new Error('附件目录无效');
    if(existsSync(previous)) {
      await fs.mkdir(path.dirname(target),{recursive:true});
      if(existsSync(target))throw new Error('卡片附件目标目录已存在，请检查同名目录');
      await fs.rename(previous,target);
    }
    for(const asset of Object.values(manifest.assets)) {
      if(asset.relativePath?.startsWith(manifest.directory+'/'))asset.relativePath=directory+asset.relativePath.slice(manifest.directory.length);
    }
    Object.assign(manifest,{title,type,directory});
    // Publish relocated paths even if a later attachment fails validation.
    await writeCardAttachments(manifest);
  }
  await fs.mkdir(target,{recursive:true});
  Object.assign(manifest,{title,type,directory});
  return target;
}

async function unusedAttachmentPath(directory,fileName) {
  const parsed=path.parse(fileName);
  for(let i=1;;i++) {
    const target=path.join(directory,`${safeTitle(parsed.name)}${i===1?'':` (${i})`}${parsed.ext.toLowerCase()}`);
    if(!existsSync(target))return target;
  }
}

export async function getCanvasImageDataUrl(assetId) {
  const asset = await getAsset(assetId);
  if (asset.category !== "图片") throw new Error("画布只能导入图片资源");
  const extension = path.extname(asset.absolutePath).toLowerCase();
  const mime = ({ ".png":"image/png", ".jpg":"image/jpeg", ".jpeg":"image/jpeg", ".gif":"image/gif", ".webp":"image/webp", ".svg":"image/svg+xml", ".avif":"image/avif" })[extension] || "image/png";
  return `data:${mime};base64,${(await fs.readFile(asset.absolutePath)).toString("base64")}`;
}

export async function getCanvasMediaDataUrl(assetId) {
  const asset = await getAsset(assetId);
  if (asset.category === "图片") return getCanvasImageDataUrl(assetId);
  const extension = path.extname(asset.absolutePath).toLowerCase();
  const mime = ({ ".mp4":"video/mp4", ".m4v":"video/mp4", ".webm":"video/webm", ".mov":"video/quicktime", ".ogv":"video/ogg", ".mkv":"video/x-matroska", ".avi":"video/x-msvideo" })[extension] || 'application/octet-stream';
  return `data:${mime};base64,${(await fs.readFile(asset.absolutePath)).toString("base64")}`;
}

export async function getCanvasMediaUrl(assetId) {
  const asset=await getAsset(assetId);
  await fs.access(asset.absolutePath);
  return pathToFileURL(asset.absolutePath).href;
}

function canvasDocumentPath(cardId) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(String(cardId))) throw new Error("画布卡片 ID 无效");
  return path.join(VAULT_ROOT, "系统", "自由画布", `${cardId}.json`);
}

let canvasStorageQueue = Promise.resolve();
function queueCanvasStorage(action) {
  const result = canvasStorageQueue.then(action);
  canvasStorageQueue = result.catch(() => {});
  return result;
}

async function externalizeCanvasAssets(cardId,snapshot,{validateLinkedFiles=false,migration=false}={}) {
  const manifest=await readCardAttachments(cardId);
  const linkedAssets={...(snapshot.linkedAssets || {})};
  const writing=migration || validateLinkedFiles || Object.keys(snapshot.assets || {}).length>0;
  const directory=writing ? await prepareCardDirectory(manifest,snapshot.cardInfo) : null;
  const resolved=new Map();
  const remapped=new Map();
  const extensions={'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp','image/gif':'.gif','image/svg+xml':'.svg','image/avif':'.avif','image/bmp':'.bmp','video/mp4':'.mp4','video/webm':'.webm'};
  const lookup=async id=>manifest.assets[id] || await readStoredAsset(id);
  const validate=async asset=>{
    if(!asset)throw new Error('附件保存失败：没有找到对应的文件记录，请重新插入原文件');
    const stat=await fs.stat(storedAssetPath(asset)).catch(()=>null);
    if(!stat?.isFile())throw new Error('附件文件缺失：'+(asset.displayName || asset.originalName)+'。请重新插入原文件后保存');
    if(stat.size!==asset.size)throw new Error('附件文件大小不符：'+(asset.displayName || asset.originalName)+'。请重新插入原文件后保存');
  };
  // Validate unchanged references before copying legacy files or publishing metadata.
  if(validateLinkedFiles)for(const [sourceId,id] of Object.entries(linkedAssets)) {
    if(!Object.hasOwn(snapshot.assets,sourceId))await validate(await lookup(manifest.legacyAssets[id] || id));
  }
  const own=async id=>{
    if(remapped.has(id))return remapped.get(id);
    let asset=await lookup(manifest.legacyAssets[id] || id);
    if(writing && asset && asset.ownerCardId!==cardId) {
      const sourceStat=await fs.stat(storedAssetPath(asset)).catch(()=>null);
      const missing=!sourceStat?.isFile() || sourceStat.size!==asset.size;
      if(!migration || !missing)await validate(asset);
      const target=await unusedAttachmentPath(directory,asset.originalName || asset.displayName);
      let hash=asset.contentHash;
      if(!missing) {
        await fs.copyFile(storedAssetPath(asset),target);
        hash=await hashFile(target);
        if(asset.contentHash && hash!==asset.contentHash)throw new Error('旧附件复制校验失败');
      }
      asset={...asset,id:ownedAssetId(),ownerCardId:cardId,displayName:path.basename(target),relativePath:portableAssetPath(target),absolutePath:null,storageMode:'copy',portable:true,contentHash:hash};
      manifest.assets[asset.id]=asset;
      manifest.legacyAssets[id]=asset.id;
    }
    if(asset)resolved.set(asset.id,asset);
    remapped.set(id,asset?.id || id);
    return asset?.id || id;
  };
  for(const [sourceId,dataUrl] of Object.entries(snapshot.assets || {})) {
    const match=/^data:([\w.+-]+\/[\w.+-]+);base64,([A-Za-z0-9+/=]*)$/.exec(dataUrl);
    if(!match)throw new Error('画布资源格式无效');
    const bytes=Buffer.from(match[2],'base64');
    const contentHash=crypto.createHash('sha256').update(bytes).digest('hex');
    const previousId=linkedAssets[sourceId] || manifest.sourceAssets[sourceId];
    let asset=previousId ? await lookup(manifest.legacyAssets[previousId] || previousId) : null;
    if(asset?.ownerCardId!==cardId || asset.contentHash!==contentHash || asset.size!==bytes.length)asset=null;
    const metadata=snapshot.assetMetadata?.[sourceId] || {};
    const originalName=typeof metadata.name==='string' ? path.basename(metadata.name).slice(0,180) : '';
    const extension=path.extname(originalName).toLowerCase() || extensions[match[1]] || '.bin';
    const category=match[1].startsWith('image/') ? '图片' : match[1].startsWith('video/') ? '视频' : match[1].startsWith('audio/') ? '音频' : categoryFor(originalName);
    const stat=asset ? await fs.stat(storedAssetPath(asset)).catch(()=>null) : null;
    if(!asset || !stat?.isFile() || stat.size!==bytes.length) {
      const target=asset ? storedAssetPath(asset) : await unusedAttachmentPath(directory,originalName || '画布'+category+'-'+contentHash.slice(0,12)+extension);
      // A changed file is preserved. Explicit restoration only fills a missing original.
      if(stat?.isFile()) { asset=null; }
      const destination=stat?.isFile() ? await unusedAttachmentPath(directory,originalName || path.basename(target)) : target;
      await writeDurable(destination,bytes);
      if(await hashFile(destination)!==contentHash)throw new Error('画布文件保存校验失败');
      const savedStat=await fs.stat(destination);
      const media=await probeMedia(destination,category);
      asset={id:asset?.id || ownedAssetId(),ownerCardId:cardId,originalName:originalName || path.basename(destination),displayName:path.basename(destination),extension,category,size:bytes.length,contentHash,storageMode:'copy',portable:true,relativePath:portableAssetPath(destination),absolutePath:null,importedAt:new Date().toISOString(),modifiedAt:savedStat.mtime.toISOString(),...media};
      for(const key of ['width','height','durationSeconds'])if(!asset[key] && Number.isFinite(metadata[key]) && metadata[key]>0)asset[key]=metadata[key];
      manifest.assets[asset.id]=asset;
    }
    linkedAssets[sourceId]=asset.id;
    resolved.set(asset.id,asset);
    if(previousId)remapped.set(previousId,asset.id);
  }
  for(const [sourceId,id] of Object.entries(linkedAssets))linkedAssets[sourceId]=await own(id);
  const primaryAssetId=snapshot.primaryAssetId ? await own(snapshot.primaryAssetId) : null;
  const assetIds=[...new Set([...Object.values(linkedAssets),...(primaryAssetId ? [primaryAssetId] : [])])];
  if(validateLinkedFiles)for(const id of assetIds)await validate(resolved.get(id) || await lookup(id));
  if(writing) {
    Object.assign(manifest.sourceAssets,linkedAssets);
    await writeCardAttachments(manifest);
  }
  const attachments=await Promise.all(assetIds.map(async id=>{
    const asset=resolved.get(id) || await lookup(id);
    if(!asset)return null;
    const stat=await fs.stat(storedAssetPath(asset)).catch(()=>null);
    return {id:asset.id,name:asset.displayName || asset.originalName,category:asset.category,extension:asset.extension,size:asset.size,width:asset.width,height:asset.height,durationSeconds:asset.durationSeconds,relativePath:asset.relativePath,...(!stat?.isFile() || stat.size!==asset.size ? {missing:true} : {})};
  }));
  const requestedCover=snapshot.coverSourceId ? linkedAssets[snapshot.coverSourceId] : remapped.get(snapshot.coverAssetId) || snapshot.coverAssetId;
  const present=attachments.filter(Boolean);
  const coverAssetId=present.some(asset=>asset.id===requestedCover && ['图片','视频'].includes(asset.category)) ? requestedCover : null;
  return {update:snapshot.update,assets:{},linkedAssets,...(snapshot.fileCardLayoutVersion===1 ? {fileCardLayoutVersion:1} : {}),...(primaryAssetId ? {primaryAssetId} : {}),coverAssetId,attachments:present};
}

async function writeCanvasSnapshot(cardId,snapshot) {
  const target = canvasDocumentPath(cardId);
  const temporary = `${target}.${crypto.randomUUID()}.tmp`;
  try { await writeDurable(temporary,JSON.stringify(snapshot)); await fs.rename(temporary,target); }
  finally { await fs.unlink(temporary).catch(error => { if(error.code !== 'ENOENT') throw error; }); }
}

export async function loadCanvasDocument(cardId) {
  return queueCanvasStorage(async () => {
  try {
    const snapshot = JSON.parse(await fs.readFile(canvasDocumentPath(cardId), "utf8"));
    if (Object.keys(snapshot.assets || {}).length) {
      const normalized = await externalizeCanvasAssets(cardId,snapshot);
      const backupDir = path.join(VAULT_ROOT,'系统','迁移备份','画布附件');
      await fs.mkdir(backupDir,{recursive:true});
      const backup = path.join(backupDir,`${cardId}.json`);
      try { await fs.access(backup); } catch { await writeDurable(backup,JSON.stringify(snapshot)); }
      await writeCanvasSnapshot(cardId,normalized);
      return normalized;
    }
    return externalizeCanvasAssets(cardId,snapshot);
  }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
  });
}

export async function saveCanvasDocument(cardId, snapshot) {
  if (!snapshot || typeof snapshot.update !== "string" || !/^[A-Za-z0-9+/=]+$/.test(snapshot.update) ||
    !snapshot.assets || typeof snapshot.assets !== "object" || Array.isArray(snapshot.assets)) throw new Error("画布数据无效");
  for (const value of Object.values(snapshot.assets)) {
    if (typeof value !== "string" || !/^data:[\w.+-]+\/[\w.+-]+;base64,[A-Za-z0-9+/=]*$/.test(value)) throw new Error("画布资源格式无效");
  }
  const linkedAssets = snapshot.linkedAssets || {};
  if (!linkedAssets || typeof linkedAssets !== "object" || Array.isArray(linkedAssets) ||
      Object.entries(linkedAssets).some(([sourceId, assetId]) => !sourceId || !/^[a-zA-Z0-9_-]{1,128}$/.test(String(assetId)))) throw new Error("画布关联资源无效");
  if (snapshot.primaryAssetId && !/^[a-zA-Z0-9_-]{1,128}$/.test(snapshot.primaryAssetId)) throw new Error("画布关联资源无效");
  if (snapshot.coverAssetId && !/^[a-zA-Z0-9_-]{1,128}$/.test(snapshot.coverAssetId)) throw new Error('封面资源无效');
  if (snapshot.coverSourceId && !Object.hasOwn(snapshot.assets,snapshot.coverSourceId)) throw new Error('封面资源无效');
  canvasDocumentPath(cardId);
  return queueCanvasStorage(async () => {
    await ensureVault();
    const normalized = await externalizeCanvasAssets(cardId,snapshot,{validateLinkedFiles:true});
    await writeCanvasSnapshot(cardId,normalized);
    return { saved:true, cardId, attachments:normalized.attachments,snapshot:normalized };
  });
}

// Offline migration preserves missing originals as missing records; normal saves
// remain strict and never restore bytes from a preview cache.
export async function migrateCanvasAttachments(cardId,cardInfo) {
  return queueCanvasStorage(async()=>{
    const target=canvasDocumentPath(cardId);
    const snapshot=JSON.parse(await fs.readFile(target,'utf8'));
    const normalized=await externalizeCanvasAssets(cardId,{...snapshot,cardInfo},{migration:true});
    await writeCanvasSnapshot(cardId,normalized);
    return normalized;
  });
}

export async function migrateCardAssetReferences(cardId,cardInfo,assetIds) {
  return queueCanvasStorage(async()=>{
    const snapshot={update:'',assets:{},linkedAssets:Object.fromEntries(assetIds.map(id=>[id,id])),cardInfo};
    const normalized=await externalizeCanvasAssets(cardId,snapshot,{migration:true});
    return {assetIds:normalized.linkedAssets,attachments:normalized.attachments};
  });
}

async function serveStatic(urlPath, res) {
  const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const file = path.resolve(APP_ROOT, rel);
  if (!file.startsWith(APP_ROOT + path.sep) && file !== path.join(APP_ROOT, "index.html")) return sendJson(res, 403, { error: "Forbidden" });
  try {
    const content = await fs.readFile(file);
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(content);
  } catch {
    sendJson(res, 404, { error: "Not found" });
  }
}

export function createServer() {
  return http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${HOST}:${PORT}`);
    if (url.pathname === "/api/vault/status" && req.method === "GET") return sendJson(res, 200, await vaultStatus());
    if (url.pathname === "/api/vault/initialize" && req.method === "POST") {
      await ensureVault();
      return sendJson(res, 200, await vaultStatus());
    }
    if (url.pathname === "/api/vault/sync-cards" && req.method === "POST") return sendJson(res, 200, await syncCards(await readBody(req)));
    const canvasRoute = url.pathname.match(/^\/api\/canvas\/([a-zA-Z0-9_-]{1,128})$/);
    const canvasMediaRoute = url.pathname.match(/^\/api\/canvas-media\/([a-zA-Z0-9_-]{1,128})$/);
    const canvasFileRoute=url.pathname.match(/^\/api\/canvas-file\/([a-zA-Z0-9_-]{1,128})$/);
    if(canvasFileRoute&&req.method==='GET'){
      const asset=await getAsset(canvasFileRoute[1]);const stat=await fs.stat(asset.absolutePath);
      if(!stat.isFile()||stat.size!==asset.size)throw new Error('附件原文件缺失或大小不符');
      const mime=MIME[path.extname(asset.absolutePath)]||({'图片':asset.extension==='.jpg'?'image/jpeg':'image/png','视频':asset.extension==='.webm'?'video/webm':'video/mp4','音频':asset.extension==='.wav'?'audio/wav':'audio/mpeg'})[asset.category]||'application/octet-stream';
      res.writeHead(200,{'Content-Type':mime,'Content-Length':stat.size,'Cache-Control':'no-store'});createReadStream(asset.absolutePath).on('error',()=>res.destroy()).pipe(res);return;
    }
    const assetPreviewRoute = url.pathname.match(/^\/api\/assets\/([a-zA-Z0-9_-]{1,128})\/preview$/);
    if (assetPreviewRoute && req.method === 'GET') {
      const presentation = await getAssetPresentation(assetPreviewRoute[1]);
      if (!presentation.previewUrl) return sendJson(res,404,{error:'暂无预览'});
      const previewPath = fileURLToPath(presentation.previewUrl);
      const mime = path.extname(previewPath).toLowerCase() === '.svg' ? 'image/svg+xml' : ({'.png':'image/png','.webp':'image/webp','.gif':'image/gif','.avif':'image/avif'})[path.extname(previewPath).toLowerCase()] || 'image/jpeg';
      res.writeHead(200,{'Content-Type':mime,'Cache-Control':'private, max-age=300'});
      createReadStream(previewPath).pipe(res);
      return;
    }
    if (canvasMediaRoute && req.method === "GET") return sendJson(res, 200, {dataUrl:await getCanvasMediaDataUrl(canvasMediaRoute[1])});
    if (canvasRoute && req.method === "GET") return sendJson(res, 200, { snapshot:await loadCanvasDocument(canvasRoute[1]) });
    if (canvasRoute && req.method === "POST") return sendJson(res, 200, await saveCanvasDocument(canvasRoute[1], await readBody(req, MAX_CANVAS_BODY)));
    if (url.pathname.startsWith("/api/")) return sendJson(res, 404, { error: "Unknown API" });
    await serveStatic(url.pathname, res);
  } catch (error) {
    sendJson(res, 400, { error: error.message });
  }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  createServer().listen(PORT, HOST, () => {
    console.log(`知识工作台：http://${HOST}:${PORT}/`);
    console.log(`本地知识库：${VAULT_ROOT}`);
  });
}
