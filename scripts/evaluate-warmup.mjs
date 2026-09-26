import { warmSemantic, queryCombinedSearch } from "../server.mjs";

const options = { semanticModel:"multilingual-e5-base-q8", semanticDevice:"auto" };
const warmup = await warmSemantic(options);
const startedAt = performance.now();
const result = await queryCombinedSearch({ ...options, query:"日本", mode:"hybrid" });
console.log(JSON.stringify({ warmup, firstVisibleSearchMs:Math.round(performance.now() - startedAt), count:result.count, results:result.results.map(item => item.title) },null,2));
