import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadRebuildState, rebuildSearchIndex, searchIndex } from "../search-index.mjs";

const require = createRequire(import.meta.url);
globalThis.window = {};
require("../data-layer.js");
const Data = window.WorkbenchData;
const Relations = require("../content-relations.js");
const Graph = require("../graph-data.js");

const types = ["project", "knowledge", "source"];
const entries = types.flatMap(type => [0, 1, 2].map(index => ({ id:`${type}-${index}`, type, title:`${type}标题${index}`, relatedRefs:[] })));
const byId = new Map(entries.map(entry => [entry.id, entry]));
byId.get("knowledge-1").title = "TargetAnchor";
for (const sourceType of types) {
  const source = byId.get(`${sourceType}-0`);
  for (const targetType of types) source.relatedRefs.push(`${targetType}-1`);
}
const knowledge = byId.get("knowledge-0");
knowledge.sourceRefs = ["project-2", "review-0", "source-2"];
entries.push({ id:"review-0", type:"review", title:"项目复盘", projectRefs:["project-2"] });
entries.push({ id:"area-0", type:"area", title:"领域" });
entries.push({ id:"trash-0", type:"source", title:"回收站", deletedAt:"2026-09-24T00:00:00Z" });
const legacy = { id:"source-legacy", type:"source", title:"旧资料", projectRefs:["project-2"], relatedRefs:["knowledge-1"] };
entries.push(legacy);

const normalized = Data.normalizeState({ entries });
const relationCount = cards => cards.reduce((count,entry)=>count+["relatedRefs","sourceRefs","projectRefs"].reduce((sum,field)=>sum+(entry[field]?.length || 0),0),0);
assert.equal(relationCount(normalized.entries),relationCount(entries),"兼容迁移不得丢失旧关系");
const migrated = normalized.entries.find(entry => entry.id === legacy.id);
assert.deepEqual(migrated.projectRefs || [], []);
assert.deepEqual(migrated.relatedRefs, ["knowledge-1", "project-2"]);
assert.deepEqual(normalized.entries.find(entry => entry.id === "knowledge-0").sourceRefs, knowledge.sourceRefs);
assert.deepEqual(normalized.entries.find(entry => entry.id === "review-0").projectRefs, ["project-2"]);
assert.deepEqual(Data.normalizeEntry({ id:"project-0", type:"project", relatedRefs:["project-0", "project-1", "project-1"] }).relatedRefs, ["project-1"]);
assert.equal(Relations.selectable(normalized.entries, "project-0").length, 9);
assert.equal(Relations.selectable(normalized.entries, "project-0", "知识1").length, 0);
assert.equal(Relations.selectable(normalized.entries, "project-0", "TargetAnchor").length, 1);
assert.ok(!Relations.selectable(normalized.entries, "project-0").some(entry => entry.id === "trash-0" || entry.id === "area-0" || entry.id === "review-0"));

for (const sourceType of types) {
  const source = normalized.entries.find(entry => entry.id === `${sourceType}-0`);
  assert.deepEqual(Relations.groups(normalized, source).outgoing.map(item => item.entry.type), types);
  for (const targetType of types) {
    const target = normalized.entries.find(entry => entry.id === `${targetType}-1`);
    assert.ok(Relations.groups(normalized, target).incoming.some(item => item.entry.id === source.id));
    assert.ok(!(target.relatedRefs || []).includes(source.id));
  }
}
assert.deepEqual(Relations.groups(normalized, knowledge).evidence.map(entry => entry.type), ["project", "review", "source"]);
assert.deepEqual(Relations.groups(normalized, normalized.entries.find(entry => entry.id === "project-2")).reviews.map(entry => entry.id), ["review-0"]);
assert.ok(!Relations.groups({ ...normalized,tombstones:[{id:"source-1",type:"source",deletedAt:"2026-09-24T00:00:00Z"}] }, byId.get("project-0")).outgoing.some(item => item.entry.id === "source-1"));

const pairA = normalized.entries.find(entry => entry.id === "project-0");
const pairB = normalized.entries.find(entry => entry.id === "knowledge-1");
pairB.relatedRefs.push(pairA.id);
const pairGroups = Relations.groups(normalized, pairA);
assert.ok(pairGroups.outgoing.find(item => item.entry.id === pairB.id)?.bidirectional);
assert.ok(!pairGroups.incoming.some(item => item.entry.id === pairB.id));
const graph = Graph.buildGraph(normalized);
assert.equal(graph.edges.filter(edge => [edge.source,edge.target].includes(pairA.id) && [edge.source,edge.target].includes(pairB.id)).length, 1);
assert.ok(graph.edges.some(edge => edge.kinds.includes("sourceRefs")));
assert.ok(!graph.nodes.some(node => node.id === "review-0" || node.id === "trash-0"));

const restored = Data.normalizeState({ entries:normalized.entries.map(entry => entry.id === "trash-0" ? { ...entry, deletedAt:null, relatedRefs:["project-0"] } : entry) });
assert.ok(Relations.groups(restored, pairA).incoming.some(item => item.entry.id === "trash-0"));
const removed = normalized.entries.filter(entry => entry.id !== "project-0").map(entry => ({ ...entry, relatedRefs:(entry.relatedRefs || []).filter(id => id !== "project-0"), sourceRefs:(entry.sourceRefs || []).filter(id => id !== "project-0") }));
assert.ok(removed.every(entry => !(entry.relatedRefs || []).includes("project-0") && !(entry.sourceRefs || []).includes("project-0")));

const folder = await mkdtemp(path.join(tmpdir(), "workbench-relations-"));
try {
  await rebuildSearchIndex(folder, normalized);
  const found = await searchIndex(folder, { query:"TargetAnchor" });
  assert.ok(found.results.some(item => item.id === "project-0"));
  assert.ok(found.results.some(item => item.id === "source-legacy"));
  const hidden = await searchIndex(folder, { query:"回收站" });
  assert.ok(!hidden.results.some(item => item.id === "trash-0"));
  process.env.PERSONAL_VAULT_PATH = folder;
  const vault = await import(`../server.mjs?relations=${Date.now()}`);
  await vault.syncCards(Data.createBundle(normalized));
  const manifest = JSON.parse(await readFile(path.join(folder, "系统", "cards-manifest.json"), "utf8"));
  const markdown = await readFile(path.join(folder, manifest.cards["project-0"].path), "utf8");
  assert.match(markdown, /relatedRefs: \["project-1","knowledge-1","source-1"\]/);
  const sourceMarkdown = await readFile(path.join(folder, manifest.cards["source-legacy"].path), "utf8");
  assert.match(sourceMarkdown, /relatedRefs: \["knowledge-1","project-2"\]/);
  assert.doesNotMatch(sourceMarkdown, /projectRefs:/);
  const recovered = (await vault.loadLatestState()).state;
  assert.deepEqual(recovered.entries.find(entry => entry.id === "project-0").relatedRefs, ["project-1", "knowledge-1", "source-1"]);
  assert.deepEqual(recovered.entries.find(entry => entry.id === "knowledge-0").sourceRefs, knowledge.sourceRefs);
  assert.deepEqual(recovered.entries.find(entry => entry.id === "review-0").projectRefs, ["project-2"]);
  const latest = path.join(folder,"系统","latest-state.json");
  await rename(latest, `${latest}.test-backup`);
  const markdownRecovered = await loadRebuildState(folder);
  assert.equal(markdownRecovered.source,"markdown-cards");
  assert.deepEqual(markdownRecovered.entries.find(entry => entry.id === "source-legacy").relatedRefs, ["knowledge-1", "project-2"]);
  assert.deepEqual(markdownRecovered.entries.find(entry => entry.id === "knowledge-0").sourceRefs, knowledge.sourceRefs);
  await rename(`${latest}.test-backup`,latest);
} finally {
  await rm(folder, { recursive:true, force:true });
}
console.log("统一关联、九种组合、迁移、反向引用、图谱与精确检索：全部通过");
