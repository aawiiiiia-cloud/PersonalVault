import * as Y from 'yjs';

// Read saved canvas blocks without mounting an editor or changing the document.
export function longestCanvasText(snapshot) {
  if (!snapshot?.update) return '';
  const doc = new Y.Doc();
  try {
    const bytes = Uint8Array.from(atob(snapshot.update), char => char.charCodeAt(0));
    Y.applyUpdate(doc, bytes);
    const blocks = doc.getMap('blocks').toJSON();
    const candidates = [];
    const visited = new Set();
    const textOf = (id, seen = new Set()) => {
      if (seen.has(id)) return '';
      seen.add(id);
      const block = blocks[id];
      if (!block || ['affine:database', 'affine:note'].includes(block['sys:flavour'])) return '';
      const own = ['affine:paragraph', 'affine:list', 'affine:code'].includes(block['sys:flavour'])
        ? String(block['prop:text'] || '').trim() : '';
      return [own, ...(block['sys:children'] || []).map(child => textOf(child, seen))].filter(Boolean).join('\n');
    };
    const visit = id => {
      if (visited.has(id)) return;
      visited.add(id);
      const block = blocks[id];
      if (!block) return;
      if (block['sys:flavour'] === 'affine:note' && !block['prop:hidden']) {
        candidates.push((block['sys:children'] || []).map(child => textOf(child)).filter(Boolean).join('\n').trim());
      }
      for (const child of block['sys:children'] || []) visit(child);
    };
    for (const block of Object.values(blocks)) if (block['sys:flavour'] === 'affine:page') visit(block['sys:id']);
    return candidates.reduce((longest, text) =>
      [...text.replace(/\s/g, '')].length > [...longest.replace(/\s/g, '')].length ? text : longest, '');
  } finally {
    doc.destroy();
  }
}
