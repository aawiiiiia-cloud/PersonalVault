import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const execFileAsync = promisify(execFile);

const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), "knowledge-workbench-"));
const vaultPath = path.join(sandbox, "PersonalVault");
const inputPath = path.join(sandbox, "input");
await fs.mkdir(inputPath, { recursive:true });
process.env.PERSONAL_VAULT_PATH = vaultPath;

try {
  const vault = await import(`../server.mjs?test=${Date.now()}`);
  const semantic = await import(`../semantic-index.mjs?test=${Date.now()}`);
  const models = await import(`../embedding-models.mjs?test=${Date.now()}`);
  const defaultProfile = models.getEmbeddingProfile();
  assert.equal(defaultProfile.id, "multilingual-e5-base-q8");
  assert.equal(defaultProfile.dimension, 768);
  assert.equal(defaultProfile.queryPrefix, "query: ");
  assert.notEqual(defaultProfile.indexFile, models.getEmbeddingProfile("bge-small-zh-v1.5-q8").indexFile);
  const fakeEmbeddingProvider = {
    model:"test-embedding",
    async embed(texts) {
      return texts.map(text => /建模|雕塑|轮廓/.test(text) ? [1,0,0] : /移动硬盘/.test(text) ? [0,1,0] : [0,0,1]);
    }
  };
  const first = path.join(inputPath, "同名资料.txt");
  const second = path.join(inputPath, "第二份", "同名资料.txt");
  const movable = path.join(inputPath, "待移动.md");
  const external = path.join(inputPath, "保留原位.blend");
  await fs.mkdir(path.dirname(second), { recursive:true });
  await fs.writeFile(first, "第一份内容", "utf8");
  await fs.writeFile(second, "内容不同", "utf8");
  await fs.writeFile(movable, "移动后源文件应消失", "utf8");
  await fs.writeFile(external, "工程文件测试", "utf8");

  const copiedFirst = (await vault.importFiles([first], "copy")).assets[0];
  const copiedSecond = (await vault.importFiles([second], "copy")).assets[0];
  const duplicate = (await vault.importFiles([first], "copy")).assets[0];
  const moved = (await vault.importFiles([movable], "move")).assets[0];
  const registered = (await vault.importFiles([external], "register")).assets[0];

  assert.equal(copiedFirst.displayName, "同名资料.txt");
  assert.equal(copiedSecond.displayName, "同名资料 (2).txt");
  assert.equal(duplicate.id, copiedFirst.id);
  assert.equal(duplicate.duplicate, true);
  assert.equal(await fs.access(movable).then(() => true, () => false), false);
  assert.equal(moved.storageMode, "move");
  assert.equal(registered.storageMode, "register");
  assert.equal(registered.portable, false);
  assert.equal(registered.absolutePath, external);
  assert.match(copiedFirst.contentHash, /^[a-f0-9]{64}$/);
  assert.equal(copiedFirst.category, "文档");
  assert.equal(registered.category, "工程");

  const resolved = await vault.getAsset(copiedFirst.id);
  assert.equal(resolved.absolutePath, path.join(vaultPath, ...copiedFirst.relativePath.split("/")));
  await vault.syncCards({ schemaVersion:1, cards:[
    { id:"area-test", type:"area", title:"动画制作", status:"active" },
    { id:"card-test", type:"source", title:"状态恢复测试", rawContent:"从移动硬盘重新载入", areaRefs:["area-test"], readingStatus:"processed", fileExtension:".mp4", durationSeconds:120 },
    { id:"knowledge-test", type:"knowledge", title:"雕塑需要观察轮廓", conclusion:"先看大形，再处理细节", confidence:"reviewed" }
  ] });
  const restored = await vault.loadLatestState();
  assert.equal(restored.found, true);
  assert.equal(restored.state.entries.length, 3);
  const searchResult = await vault.querySearchIndex({ query:"移动硬盘", type:"source" });
  assert.equal(searchResult.count, 1);
  assert.equal(searchResult.results[0].id, "card-test");
  assert.equal((await vault.querySearchIndex({ query:"!!!" })).count, 0);
  const combinedFilter = await vault.querySearchIndex({ areaId:"area-test", extension:".mp4", status:"processed", minDuration:"100", maxDuration:"130" });
  assert.equal(combinedFilter.count, 1);
  assert.equal(combinedFilter.results[0].id, "card-test");
  const areaNameSearch = await vault.querySearchIndex({ query:"动画制作" });
  assert.ok(areaNameSearch.results.some(result => result.id === "card-test"));
  const userFacingAreaSearch = await vault.queryCombinedSearch({ query:"动画制作", mode:"exact" });
  assert.deepEqual(userFacingAreaSearch.results.map(result => result.id),["card-test"]);
  assert.ok(userFacingAreaSearch.results.every(result => ["project","knowledge","source"].includes(result.type)));
  const indexStatus = await vault.getIndexStatus();
  assert.equal(indexStatus.healthy, true);
  assert.equal(indexStatus.indexedCount, 3);
  await semantic.rebuildSemanticIndex(vaultPath, { provider:fakeEmbeddingProvider });
  const semanticResult = await semantic.semanticSearch(vaultPath, { query:"人物建模方法", type:"knowledge", provider:fakeEmbeddingProvider });
  assert.equal(semanticResult.results[0].id, "knowledge-test");
  assert.equal(semantic.semanticQueryEligibility("8798789784").eligible, false);
  assert.equal(semantic.semanticQueryEligibility("abc8798789784").eligible, false);
  assert.equal(semantic.semanticQueryEligibility("UE5建模").eligible, true);
  const relevantResults = semantic.selectRelevantSemanticResults([
    { id:"strong", semanticScore:0.62 },
    { id:"weak", semanticScore:0.44 },
    { id:"noise", semanticScore:0.18 }
  ]);
  assert.deepEqual(relevantResults.results.map(result => result.id), ["strong"]);
  assert.equal((await semantic.semanticIndexStatus(vaultPath)).indexedCount, 2);
  assert.equal((await semantic.semanticIndexStatus(vaultPath)).needsRebuild, false);
  await vault.syncCards({ schemaVersion:1, cards:restored.state.entries.map(card => card.id === "card-test"
    ? { ...card, updatedAt:"2026-09-21T00:00:00.000Z" }
    : card) });
  assert.equal((await semantic.semanticIndexStatus(vaultPath)).needsRebuild, true);
  await semantic.rebuildSemanticIndex(vaultPath, { provider:fakeEmbeddingProvider });
  assert.equal((await semantic.semanticIndexStatus(vaultPath)).needsRebuild, false);
  await fs.rm(path.join(vaultPath, "系统", "latest-state.json"));
  const rebuiltFromMarkdown = await vault.rebuildIndex();
  assert.equal(rebuiltFromMarkdown.cardCount, 3);
  const markdownRecoverySearch = await vault.querySearchIndex({ query:"雕塑 轮廓" });
  assert.equal(markdownRecoverySearch.results[0].id, "knowledge-test");
  await fs.writeFile(path.join(vaultPath, "系统", "索引", "knowledge.sqlite"), "模拟损坏的索引", "utf8");
  await vault.rebuildIndex();
  const corruptionRecoverySearch = await vault.querySearchIndex({ query:"移动硬盘" });
  assert.equal(corruptionRecoverySearch.results[0].id, "card-test");
  await vault.syncCards({ schemaVersion:1, cards:[
    ...restored.state.entries,
    { id:"project-tasks", type:"project", title:"待办列表测试", status:"active", tasks:[
      { id:"task-1", text:"整理编码样本", done:false },
      { id:"task-2", text:"完成第一轮检测", done:true }
    ], nextStep:"整理编码样本" }
  ] });
  const projectMarkdownFiles = await fs.readdir(path.join(vaultPath,"卡片","项目"));
  const projectMarkdown = await fs.readFile(path.join(vaultPath,"卡片","项目",projectMarkdownFiles.find(name => name.includes("待办列表测试"))),"utf8");
  assert.match(projectMarkdown,/- \[ \] 整理编码样本/);
  assert.match(projectMarkdown,/- \[x\] 完成第一轮检测/);
  const taskSearch = await vault.queryCombinedSearch({ query:"整理编码样本", mode:"exact" });
  assert.equal(taskSearch.results[0].id,"project-tasks");
  const rebuiltSemanticWithTasks = await semantic.rebuildSemanticIndex(vaultPath, { provider:fakeEmbeddingProvider });
  const semanticDb = new DatabaseSync(rebuiltSemanticWithTasks.path, { readOnly:true });
  const taskSemanticText = semanticDb.prepare("SELECT semantic_text FROM embeddings WHERE card_id = ?").get("project-tasks").semantic_text;
  semanticDb.close();
  assert.equal(taskSemanticText.split("整理编码样本").length - 1, 1);
  assert.equal((await semantic.semanticIndexStatus(vaultPath)).needsRebuild, false);
  const mixedLanguageSearch = await semantic.semanticSearch(vaultPath, { query:"UE5人物建模", provider:fakeEmbeddingProvider });
  assert.equal(mixedLanguageSearch.results[0].id,"knowledge-test");

  const deletionBase = (await vault.loadLatestState()).state;
  const trashCard = {
    id:"trash-knowledge", type:"knowledge", title:"回收站语义测试", conclusion:"雕塑先观察轮廓再处理细节",
    relatedRefs:["knowledge-test"], areaRefs:["area-test"], sourceRefs:[], projectRefs:[], confidence:"reviewed",
    createdAt:"2026-09-20T10:00:00.000Z", updatedAt:"2026-09-20T10:00:00.000Z", deletedAt:null
  };
  const assetSource = {
    id:"asset-source", type:"source", title:"资产删除保护测试", rawContent:"资料卡删除后原始资产仍需保留",
    assetId:copiedFirst.id, assetPath:copiedFirst.relativePath, readingStatus:"processed",
    areaRefs:[], sourceRefs:[], relatedRefs:[], projectRefs:[], createdAt:"2026-09-20T11:00:00.000Z", updatedAt:"2026-09-20T11:00:00.000Z", deletedAt:null
  };
  const referrer = {
    id:"trash-referrer", type:"source", title:"删除关系保留测试", rawContent:"引用待删除知识",
    sourceRefs:[trashCard.id], areaRefs:[], relatedRefs:[], projectRefs:[], readingStatus:"unread"
  };
  let lifecycleEntries = [...deletionBase.entries,trashCard,assetSource,referrer];
  await vault.syncCards({ schemaVersion:1, cards:lifecycleEntries, tombstones:[] });
  await semantic.rebuildSemanticIndex(vaultPath, { provider:fakeEmbeddingProvider });
  await assert.rejects(
    vault.syncCards({ schemaVersion:1, cards:lifecycleEntries.filter(card => card.id !== assetSource.id), tombstones:[{ id:assetSource.id, type:assetSource.type, deletedAt:"2026-09-21T00:30:00.000Z" }] }),
    /只有已经位于回收站的卡片可以永久删除/
  );

  const trashedAt = "2026-09-21T01:00:00.000Z";
  lifecycleEntries = lifecycleEntries.map(card => card.id === trashCard.id ? { ...card, deletedAt:trashedAt } : card);
  const trashSync = await vault.syncCards({ schemaVersion:1, cards:lifecycleEntries, tombstones:[] });
  assert.equal(trashSync.integrity.healthy,true);
  const trashedState = (await vault.loadLatestState()).state.entries.find(card => card.id === trashCard.id);
  assert.equal(trashedState.deletedAt,trashedAt);
  assert.equal(trashedState.conclusion,trashCard.conclusion);
  assert.deepEqual(trashedState.relatedRefs,trashCard.relatedRefs);
  const trashManifest = JSON.parse(await fs.readFile(path.join(vaultPath,"系统","cards-manifest.json"),"utf8"));
  assert.match(trashManifest.cards[trashCard.id].path,/卡片\/回收站\//);
  assert.equal((await vault.querySearchIndex({ query:"回收站语义测试" })).count,0);
  assert.ok(!(await semantic.semanticSearch(vaultPath,{ query:"雕塑轮廓", provider:fakeEmbeddingProvider })).results.some(result => result.id === trashCard.id));

  lifecycleEntries = lifecycleEntries.map(card => card.id === trashCard.id ? { ...card, deletedAt:null } : card);
  await vault.syncCards({ schemaVersion:1, cards:lifecycleEntries, tombstones:[] });
  const restoredTrashCard = (await vault.loadLatestState()).state.entries.find(card => card.id === trashCard.id);
  assert.equal(restoredTrashCard.id,trashCard.id);
  assert.equal(restoredTrashCard.conclusion,trashCard.conclusion);
  assert.deepEqual(restoredTrashCard.relatedRefs,trashCard.relatedRefs);
  assert.equal((await vault.querySearchIndex({ query:"回收站语义测试" })).results[0].id,trashCard.id);
  assert.ok((await semantic.semanticSearch(vaultPath,{ query:"雕塑轮廓", provider:fakeEmbeddingProvider })).results.some(result => result.id === trashCard.id));

  lifecycleEntries = lifecycleEntries.map(card => card.id === trashCard.id || card.id === assetSource.id
    ? { ...card, deletedAt:"2026-09-21T02:00:00.000Z" }
    : card);
  await vault.syncCards({ schemaVersion:1, cards:lifecycleEntries, tombstones:[] });
  const permanentAt = "2026-09-21T03:00:00.000Z";
  const tombstones = [
    { id:trashCard.id, type:trashCard.type, deletedAt:permanentAt },
    { id:assetSource.id, type:assetSource.type, deletedAt:permanentAt }
  ];
  lifecycleEntries = lifecycleEntries
    .filter(card => ![trashCard.id,assetSource.id].includes(card.id))
    .map(card => ({ ...card, sourceRefs:(card.sourceRefs || []).filter(id => id !== trashCard.id) }));
  const permanentSync = await vault.syncCards({ schemaVersion:1, cards:lifecycleEntries, tombstones });
  assert.equal(permanentSync.integrity.healthy,true);
  const tombstoneFile = await fs.readFile(path.join(vaultPath,"系统","tombstones.json"),"utf8");
  const storedTombstones = JSON.parse(tombstoneFile).tombstones;
  assert.deepEqual(Object.keys(storedTombstones.find(item => item.id === trashCard.id)).sort(),["deletedAt","id","type"]);
  assert.ok(!tombstoneFile.includes(trashCard.conclusion));
  const cardMarkdownFiles = await fs.readdir(path.join(vaultPath,"卡片"),{ recursive:true });
  assert.ok(!cardMarkdownFiles.some(name => String(name).includes(trashCard.id) || String(name).includes(assetSource.id)));
  assert.equal(await fs.access(path.join(vaultPath,...copiedFirst.relativePath.split("/"))).then(()=>true,()=>false),true);
  assert.deepEqual((await vault.loadLatestState()).state.entries.find(card => card.id === referrer.id).sourceRefs,[]);

  await fs.rm(path.join(vaultPath,"系统","latest-state.json"));
  await vault.rebuildIndex();
  assert.equal((await vault.querySearchIndex({ query:"回收站语义测试", includeDeleted:true })).count,0);
  await vault.syncCards({ schemaVersion:1, cards:lifecycleEntries, tombstones });

  const raceBase = { id:"sync-race", type:"capture", title:"串行同步 A", rawContent:"并发同步测试", areaRefs:[], sourceRefs:[], relatedRefs:[], projectRefs:[] };
  lifecycleEntries = [...lifecycleEntries,raceBase];
  await vault.syncCards({ schemaVersion:1, cards:lifecycleEntries, tombstones });
  const raceB = lifecycleEntries.map(card => card.id === raceBase.id ? { ...card, title:"串行同步 B" } : card);
  const raceC = lifecycleEntries.map(card => card.id === raceBase.id ? { ...card, title:"串行同步 C" } : card);
  const concurrentResults = await Promise.all([
    vault.syncCards({ schemaVersion:1, cards:raceB, tombstones }),
    vault.syncCards({ schemaVersion:1, cards:raceC, tombstones })
  ]);
  assert.equal(concurrentResults[1].integrity.healthy,true);
  assert.equal((await vault.loadLatestState()).state.entries.find(card => card.id === raceBase.id).title,"串行同步 C");
  const finalManifest = JSON.parse(await fs.readFile(path.join(vaultPath,"系统","cards-manifest.json"),"utf8"));
  assert.match(finalManifest.cards[raceBase.id].path,/串行同步 C/);

  const unknownPath = path.join(vaultPath,"卡片","随手记","未登记测试--unknown-card.md");
  await fs.writeFile(unknownPath,'---\nid: "unknown-card"\ntype: "capture"\ntitle: "未登记测试"\ndeletedAt: null\n---\n\n# 未登记测试\n','utf8');
  const unknownResult = await vault.syncCards({ schemaVersion:1, cards:raceC, tombstones });
  assert.ok(unknownResult.integrity.unknownMarkdown.some(item => item.endsWith("未登记测试--unknown-card.md")));
  await fs.rm(path.join(vaultPath,"系统","latest-state.json"));
  await vault.rebuildIndex();
  assert.equal((await vault.querySearchIndex({ query:"未登记测试", includeDeleted:true })).count,0);
  await fs.rm(unknownPath);
  await vault.syncCards({ schemaVersion:1, cards:raceC, tombstones });

  const video = path.join(inputPath, "尺寸测试.mp4");
  try {
    await execFileAsync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=black:s=96x64:d=0.4", "-c:v", "mpeg4", "-y", video]);
    const media = (await vault.importFiles([video], "copy")).assets[0];
    assert.equal(media.width, 96);
    assert.equal(media.height, 64);
    assert.ok(media.durationSeconds > 0);
    const presentation = await vault.getAssetPresentation(media.id);
    assert.equal(presentation.category, "视频");
    assert.equal(await fs.access(fileURLToPath(presentation.previewUrl)).then(()=>true,()=>false),true);
    const cover = path.join(inputPath,"自定义封面.jpg");
    await execFileAsync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=red:s=120x80:d=0.1", "-frames:v", "1", "-y", cover]);
    const customPresentation = await vault.setAssetCover(media.id,cover);
    assert.equal(customPresentation.customCover,true);
    assert.match(customPresentation.previewUrl,/-cover\.jpg$/);
    const restoredPresentation = await vault.clearAssetCover(media.id);
    assert.equal(restoredPresentation.customCover,false);
    console.log("文件入库、SQLite 检索、状态恢复及媒体信息读取：全部通过");
  } catch (error) {
    if (error.code === "ENOENT") console.log("基础文件测试通过；当前系统没有 ffmpeg，跳过媒体探测测试");
    else throw error;
  }
} finally {
  await fs.rm(sandbox, { recursive:true, force:true });
}
