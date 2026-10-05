import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {rebuildSearchIndex, searchIndex} from '../search-index.mjs';
import {rebuildSemanticIndex, semanticIndexStatus, selectRelevantSemanticResults, shortQueryHasEvidence} from '../semantic-index.mjs';
import {getEmbeddingProfile} from '../embedding-models.mjs';

const vault=await mkdtemp(path.join(os.tmpdir(),'workbench-recall-'));
try {
  const entries=[{id:'video',type:'project',title:'视频黑边检测工具',content:'使用 cropdetect 检查视频中的黑边。编号 123456。',status:'active'}];
  await mkdir(path.join(vault,'系统'),{recursive:true});
  await writeFile(path.join(vault,'系统','latest-state.json'),JSON.stringify({entries}));
  await rebuildSearchIndex(vault,{entries});
  assert.deepEqual((await searchIndex(vault,{query:'crop'})).results.map(r=>r.id),['video']);
  assert.equal((await searchIndex(vault,{query:'1234'})).count,0,'数字编号不能进行前缀扩展');
  const profile=getEmbeddingProfile();
  const provider={embed:async texts=>texts.map(()=>Array.from({length:profile.dimension},(_,i)=>i===0?1:0))};
  await rebuildSemanticIndex(vault,{state:{entries:[]},provider});
  const empty=await semanticIndexStatus(vault);
  assert.equal(empty.healthy,false,'空向量索引不能报告已就绪');
  assert.equal(empty.needsRebuild,true);
  await rebuildSemanticIndex(vault,{provider});
  const ready=await semanticIndexStatus(vault);
  assert.equal(ready.healthy,true);
  assert.equal(ready.needsRebuild,false);
  const selected=selectRelevantSemanticResults([{id:'top',semanticScore:.8123},{id:'video',semanticScore:.7886},{id:'unrelated',semanticScore:.72}],profile);
  assert.ok(selected.results.some(r=>r.id==='video'),'相近的语义候选不应被过窄的分差过滤');
  assert.ok(!selected.results.some(r=>r.id==='unrelated'));
  assert.equal(shortQueryHasEvidence('边缘','视频黑边检测工具：检查异常黑边'),true);
  assert.equal(shortQueryHasEvidence('边缘','电风扇犯得上：发射点发生'),false);
  assert.equal(shortQueryHasEvidence('黑色','我的角色：处理钉钉表格'),false);
  assert.equal(shortQueryHasEvidence('黑色','视频黑边检测'),true);
  assert.equal(shortQueryHasEvidence('crop','cropdetect 视频检测'),true);
  assert.equal(shortQueryHasEvidence('crop','音乐视频'),false);
  assert.equal(shortQueryHasEvidence('如何识别视频边缘的黑色区域','检查异常黑边'),true,'完整描述不要求字面重合');
  const shortResults=selectRelevantSemanticResults([
    {id:'video',semanticScore:.7886,shortQueryEvidence:true},
    {id:'fan',semanticScore:.80,shortQueryEvidence:false}
  ],profile);
  assert.deepEqual(shortResults.results.map(result=>result.id),['video'],'无文字线索的短词候选即使分数接近也不能混入结果');
  console.log('search recall tests passed');
} finally {await rm(vault,{recursive:true,force:true});}
