import { queryCombinedSearch, loadLatestState } from "../server.mjs";

const state = await loadLatestState();
const titles = new Map((state.state?.entries || []).map(card => [card.id,card.title]));
const queries = process.argv.slice(2).length ? process.argv.slice(2) : [
  "二次元",
  "Hatsune Miku",
  "black bar detection",
  "8798789784"
];

for (const query of queries) {
  const startedAt = performance.now();
  const result = await queryCombinedSearch({
    query,
    mode:"hybrid",
    semanticModel:"multilingual-e5-base-q8",
    semanticDevice:"auto"
  });
  const elapsed = Math.round(performance.now() - startedAt);
  console.log(`\n[${query}] engine=${result.engine} count=${result.count} ${elapsed}ms`);
  result.results.slice(0,5).forEach(item => console.log(`${item.semanticScore?.toFixed?.(4) || "exact"}  ${titles.get(item.id) || item.id}`));
}
