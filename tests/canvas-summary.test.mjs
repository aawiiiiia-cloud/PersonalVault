import assert from 'node:assert/strict';
import * as Y from '../experiments/blocksuite-edgeless/node_modules/yjs/dist/yjs.mjs';
import {longestCanvasText} from '../experiments/blocksuite-edgeless/src/canvas-summary.js';

const doc=new Y.Doc();
const blocks=doc.getMap('blocks');
function add(id,flavour,children=[],text='') {
  const block=new Y.Map();
  blocks.set(id,block);
  block.set('sys:id',id);block.set('sys:flavour',flavour);block.set('sys:children',Y.Array.from(children));
  block.set('prop:text',new Y.Text(text));
  return block;
}
add('page','affine:page',['surface']);
add('surface','affine:surface',['short','long','table','hidden']);
add('short','affine:note',['a']);add('a','affine:paragraph',[],'短文本');
add('long','affine:note',['b','c']);add('b','affine:paragraph',[],'较长的正文');add('c','affine:list',[],'列表内容');
add('table','affine:note',['db']);add('db','affine:database',['cell']);add('cell','affine:paragraph',[],'表格内容'.repeat(30));
add('hidden','affine:note',['hiddenText']).set('prop:hidden',true);add('hiddenText','affine:paragraph',[],'隐藏内容'.repeat(30));
add('orphan','affine:note',['orphanText']);add('orphanText','affine:paragraph',[],'已删除的框'.repeat(30));
const snapshot=()=>({update:Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64')});
assert.equal(longestCanvasText(snapshot()),'较长的正文\n列表内容');
blocks.get('a').set('prop:text',new Y.Text('短文本'+' '.repeat(300)));
assert.equal(longestCanvasText(snapshot()),'较长的正文\n列表内容','blank space does not make a note the longest');
blocks.get('surface').set('sys:children',Y.Array.from(['short','table']));
assert.equal(longestCanvasText(snapshot()),'短文本','removed notes no longer contribute');
assert.equal(longestCanvasText(null),'');
assert.throws(()=>longestCanvasText({update:'AQID'}));
doc.destroy();
console.log('Canvas summary tests passed');
