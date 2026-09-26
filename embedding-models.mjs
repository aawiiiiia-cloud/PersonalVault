export const DEFAULT_EMBEDDING_MODEL_ID = "multilingual-e5-base-q8";

const MODEL_PROFILES = Object.freeze({
  "multilingual-e5-base-q8": Object.freeze({
    id:"multilingual-e5-base-q8",
    label:"Multilingual E5 Base · 多语言均衡",
    description:"约 100 种语言，适合中英日混合搜索；所有设备统一使用。",
    model:"onnx-community/multilingual-e5-base-ONNX",
    dtype:"q8",
    dimension:768,
    maxTokens:512,
    pooling:"mean",
    queryPrefix:"query: ",
    documentPrefix:"passage: ",
    minimumScore:0.70,
    maxDrop:0.01,
    indexFile:"semantic-multilingual-e5-base-q8.sqlite",
    approximateDownloadMB:295,
    legacy:false
  }),
  "bge-small-zh-v1.5-q8": Object.freeze({
    id:"bge-small-zh-v1.5-q8",
    label:"BGE Small 中文 · 旧版回退",
    description:"中文轻量模型；保留用于对照和故障回退。",
    model:"Xenova/bge-small-zh-v1.5",
    dtype:"q8",
    dimension:512,
    maxTokens:512,
    pooling:"cls",
    queryPrefix:"",
    documentPrefix:"",
    minimumScore:0.35,
    maxDrop:0.12,
    indexFile:"semantic-bge-small-zh-v1.5-q8.sqlite",
    approximateDownloadMB:30,
    legacy:true
  })
});

export function getEmbeddingProfile(id = DEFAULT_EMBEDDING_MODEL_ID) {
  const profile = MODEL_PROFILES[id];
  if (!profile) throw new Error(`不支持的语义模型：${id}`);
  return profile;
}

export function listEmbeddingProfiles() {
  return Object.values(MODEL_PROFILES).map(profile => ({ ...profile }));
}
