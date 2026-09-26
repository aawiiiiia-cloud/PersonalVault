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
  const found = candidates.find(candidate => existsSync(path.join(candidate, "vault.json")));
  if (found) return path.resolve(found);
  return path.resolve(process.platform === "win32" ? "E:\\PersonalVault" : "/Volumes/PersonalVault");
}

const VAULT_ROOT = detectVaultRoot();
const MAX_BODY = 20 * 1024 * 1024;
const execFileAsync = promisify(execFile);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
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
    "文件/图片", "文件/视频", "文件/音频", "文件/文档", "文件/模型", "文件/工程", "文件/其他",
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

export async function queryCombinedSearch(options = {}) {
  const searchOptions = { ...options, types:["project","knowledge","source"] };
  const exact = await querySearchIndex(searchOptions);
  if (options.mode !== "hybrid" || !String(options.query || "").trim()) return { ...exact, engine:"exact" };
  const eligibility = semanticQueryEligibility(options.query);
  if (!eligibility.eligible) {
    return { ...exact, engine:"exact", semanticSkipped:eligibility.reason };
  }
  const status = await getSemanticStatus(options);
  if (!status.healthy) return { ...exact, engine:"exact", semanticUnavailable:true };
  try {
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

async function uniqueDestination(directory, fileName, incomingHash) {
  const parsed = path.parse(fileName);
  let index = 1;
  while (true) {
    const suffix = index === 1 ? "" : ` (${index})`;
    const candidate = path.join(directory, `${safeTitle(parsed.name)}${suffix}${parsed.ext.toLowerCase()}`);
    try {
      await fs.access(candidate);
      if (await hashFile(candidate) === incomingHash) return { path:candidate, duplicate:true };
      index += 1;
    } catch {
      return { path:candidate, duplicate:false };
    }
  }
}

function portableAssetPath(absolutePath) {
  const resolved = path.resolve(absolutePath);
  return resolved.startsWith(VAULT_ROOT + path.sep) ? relativeSlash(path.relative(VAULT_ROOT, resolved)) : null;
}

export async function importFiles(sourcePaths, mode = "copy") {
  if (!["copy", "move", "register"].includes(mode)) throw new Error("无法识别的导入方式");
  if (!Array.isArray(sourcePaths) || !sourcePaths.length) return { assets:[], skipped:[] };
  await ensureVault();
  const manifest = await readAssetManifest();
  const assets = [];
  const skipped = [];

  for (const source of sourcePaths) {
    const absoluteSource = path.resolve(source);
    const stat = await fs.stat(absoluteSource);
    if (!stat.isFile()) { skipped.push({ path:absoluteSource, reason:"不是普通文件" }); continue; }
    const contentHash = await hashFile(absoluteSource);
    const existing = Object.values(manifest.assets).find(asset => asset.contentHash === contentHash && asset.size === stat.size);
    if (existing) {
      const existingPath = existing.relativePath ? path.join(VAULT_ROOT, existing.relativePath) : existing.absolutePath;
      try {
        await fs.access(existingPath);
        assets.push({ ...existing, duplicate:true, message:"内容完全相同，已复用知识库中的现有文件" });
        continue;
      } catch {}
    }

    const category = categoryFor(absoluteSource);
    const id = crypto.randomUUID();
    let finalPath = absoluteSource;
    let relativePath = portableAssetPath(absoluteSource);
    let portable = Boolean(relativePath);

    if (mode !== "register") {
      const destinationDir = path.join(VAULT_ROOT, "文件", category);
      await fs.mkdir(destinationDir, { recursive:true });
      const destination = await uniqueDestination(destinationDir, path.basename(absoluteSource), contentHash);
      finalPath = destination.path;
      relativePath = portableAssetPath(finalPath);
      portable = true;
      if (!destination.duplicate) {
        await fs.copyFile(absoluteSource, finalPath);
        const copiedHash = await hashFile(finalPath);
        if (copiedHash !== contentHash) throw new Error(`复制校验失败：${path.basename(absoluteSource)}`);
        if (mode === "move") await fs.unlink(absoluteSource);
      }
    }

    const finalStat = await fs.stat(finalPath);
    const media = await probeMedia(finalPath, category);
    const asset = {
      id,
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
    assets.push(asset);
  }

  await writeAssetManifest(manifest);
  return { assets, skipped };
}

export async function getAsset(assetId) {
  const manifest = await readAssetManifest();
  const asset = manifest.assets?.[assetId];
  if (!asset) throw new Error("没有找到对应的文件记录");
  const absolutePath = asset.relativePath ? path.join(VAULT_ROOT, asset.relativePath) : asset.absolutePath;
  return { ...asset, absolutePath };
}

async function videoPreviewPath(asset) {
  const previewDir = path.join(VAULT_ROOT, "系统", "预览缓存");
  const target = path.join(previewDir, `${asset.id}.jpg`);
  await fs.mkdir(previewDir, { recursive:true });
  try {
    const [sourceStat, previewStat] = await Promise.all([fs.stat(asset.absolutePath), fs.stat(target)]);
    if (previewStat.mtimeMs >= sourceStat.mtimeMs) return target;
  } catch {}
  const duration = Number(asset.durationSeconds);
  const seek = Number.isFinite(duration) && duration > 0 ? Math.min(duration * 0.1, 30) : 1;
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
  await ensureVault();
  const manifest = await readAssetManifest();
  const asset = manifest.assets?.[assetId];
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
  await writeAssetManifest(manifest);
  return getAssetPresentation(assetId);
}

export async function clearAssetCover(assetId) {
  const manifest = await readAssetManifest();
  const asset = manifest.assets?.[assetId];
  if (!asset) throw new Error("没有找到对应的文件记录");
  const relativePath = asset.coverRelativePath;
  await removeAssetCoverFile(assetId,relativePath);
  delete asset.coverRelativePath;
  await writeAssetManifest(manifest);
  return getAssetPresentation(assetId);
}

export async function relinkAsset(assetId, selectedPath) {
  const manifest = await readAssetManifest();
  const asset = manifest.assets?.[assetId];
  if (!asset) throw new Error("没有找到对应的文件记录");
  const absolutePath = path.resolve(selectedPath);
  const stat = await fs.stat(absolutePath);
  if (!stat.isFile()) throw new Error("重新选择的位置不是文件");
  const contentHash = await hashFile(absolutePath);
  asset.contentHash = contentHash;
  asset.size = stat.size;
  asset.modifiedAt = stat.mtime.toISOString();
  asset.relativePath = portableAssetPath(absolutePath);
  asset.absolutePath = asset.relativePath ? null : absolutePath;
  asset.portable = Boolean(asset.relativePath);
  asset.displayName = path.basename(absolutePath);
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
  await writeAssetManifest(manifest);
  return { ...asset, absolutePath };
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error("数据包过大");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
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
