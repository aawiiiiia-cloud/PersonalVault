import { semanticSearch, selectRelevantSemanticResults, TransformersEmbeddingProvider } from "../semantic-index.mjs";
import { getEmbeddingProfile } from "../embedding-models.mjs";
import { loadLatestState } from "../server.mjs";

const vaultRoot = process.env.PERSONAL_VAULT_PATH || "E:\\PersonalVault";
const modelId = process.argv[2] || "multilingual-e5-base-q8";
const cacheDir = `${vaultRoot}\\系统\\模型`;
const provider = new TransformersEmbeddingProvider({ profile:getEmbeddingProfile(modelId), cacheDir, device:"cpu" });
const state = await loadLatestState();
const titles = new Map((state.state?.entries || []).map(card => [card.id,card.title]));
const queries = process.argv.slice(3).length ? process.argv.slice(3) : [
  "二次元",
  "动漫",
  "初音未来",
  "Hatsune Miku",
  "Silver Wolf Honkai Star Rail",
  "black bar detection",
  "批量检查视频画面问题",
  "怎么避免重复造轮子",
  "Mac Time Machine 备份方法"
];

for (const query of queries) {
  const raw = await semanticSearch(vaultRoot,{ query, modelId, cacheDir, device:"cpu", provider, limit:8 });
  const relevant = selectRelevantSemanticResults(raw.results,{ minimumScore:raw.minimumScore, maxDrop:raw.maxDrop, limit:8 });
  console.log(`\n[${query}] threshold=${relevant.threshold.toFixed(4)} selected=${relevant.results.length}`);
  raw.results.slice(0,5).forEach(result => {
    const selected = relevant.results.some(item => item.id === result.id) ? "✓" : "·";
    console.log(`${selected} ${result.semanticScore.toFixed(4)}  ${titles.get(result.id) || result.id}`);
  });
}
