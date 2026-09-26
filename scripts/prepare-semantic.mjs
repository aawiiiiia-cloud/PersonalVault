import { rebuildSemantic, getSemanticStatus } from "../server.mjs";

const modelId = process.argv[2] || "multilingual-e5-base-q8";
const device = process.argv[3] || "auto";

console.log(`正在准备 ${modelId}（设备：${device}）…`);
const result = await rebuildSemantic({ semanticModel:modelId, semanticDevice:device });
console.log(JSON.stringify(result,null,2));
console.log(JSON.stringify(await getSemanticStatus({ semanticModel:modelId, semanticDevice:device }),null,2));
