import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const Session=createRequire(import.meta.url)('../vault-session.js');
let version=1,writeCount=0,fail=false;
const session=Session.create({
  load:async()=>({revision:{version},state:{entries:[]}}),
  sync:async bundle=>{
    writeCount++;
    assert.equal(bundle.baseRevision.version,version);
    assert.equal(bundle.requireRevision,true);
    if(fail)throw new Error('硬盘断开');
    version++;
    return {revision:{version}};
  }
});
await assert.rejects(session.save({cards:[]}),/尚未载入/);
assert.equal(writeCount,0);
await session.open();
await Promise.all([session.save({cards:[{id:'a'}]}),session.save({cards:[{id:'b'}]})]);
assert.equal(writeCount,2,'own writes are serialized with advancing disk revisions');
fail=true;
const unsaved={cards:[{id:'c',title:'未保存的标题'}],canvasDocuments:{c:{update:'AQID',assets:{}}}};
await assert.rejects(session.save(unsaved),/硬盘断开/);
unsaved.cards[0].title='later mutation';
assert.equal(session.failedBundle.cards[0].title,'未保存的标题');
assert.equal(session.failedBundle.canvasDocuments.c.update,'AQID');
assert.equal(session.blocked,true);
await assert.rejects(session.save({cards:[]}),/上次保存失败/);
assert.equal(writeCount,3,'failed sessions cannot continue silently writing');
fail=false;await session.open();
assert.equal(session.failedBundle,null);
await session.save({cards:[]});
version++;
await assert.rejects(session.assertFresh(),/已停止保存/);
assert.equal(session.blocked,true);
let hash='h0',number=0;
const queued=Session.create({
  load:async()=>({revision:{identity:'vault',tombstones:'ledger',cards:{a:hash}},state:{entries:[{id:'a',content:'0'}]}}),
  sync:async bundle=>{
    assert.equal(bundle.baseRevision.cards.a,hash,'queued writes advance only through this session’s own revisions');
    assert.deepEqual(bundle.changedIds,['a']);hash='h'+(++number);
    return {revision:{identity:'vault',tombstones:'ledger',cards:{a:hash}},state:{entries:bundle.cards}};
  }
});
await queued.open();
await Promise.all([queued.save({cards:[{id:'a',content:'1'}]}),queued.save({cards:[{id:'a',content:'2'}]})]);
assert.equal(number,2);
console.log('PASS disk session readiness, serialized revisions, retained failed drafts and blocked writes');
