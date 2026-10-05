import { InlineSpecExtension, InlineManagerIdentifier, InlineManagerExtension, InlineSpecExtensions, LatexEditorUnitSpecExtension, DefaultInlineManagerExtension } from '@blocksuite/blocks';
import { html } from 'lit';
import { z } from 'zod';

// Store sizes as inline attributes so selection formatting survives snapshots.
export const FontSizeInlineSpec = InlineSpecExtension('fontSize', provider => ({
  name: 'fontSize',
  schema: z.number().int().min(8).max(96).optional().nullable().catch(undefined),
  match: delta => Number.isInteger(delta.attributes?.fontSize) && delta.attributes.fontSize >= 8 && delta.attributes.fontSize <= 96,
  renderer: props => {
    const original = provider.get(InlineManagerIdentifier('DefaultInlineManager')).specs.toReversed().find(spec => spec.name !== 'fontSize' && spec.match(props.delta));
    return html`<span style=${`font-size:${props.delta.attributes.fontSize}px;line-height:1.5`}>${original ? original.renderer(props) : html`<affine-text .delta=${props.delta}></affine-text>`}</span>`;
  },
}));

export function withFontSizeSupport(specs) {
  const replacement = InlineManagerExtension({
    id: 'DefaultInlineManager',
    specs: [...InlineSpecExtensions.filter(spec => spec !== LatexEditorUnitSpecExtension).map(spec => spec.identifier), FontSizeInlineSpec.identifier],
  });
  return [...specs.flat(Infinity).filter(spec => spec !== DefaultInlineManagerExtension), FontSizeInlineSpec, replacement];
}

const colors = [['默认', null], ['红色', 'red'], ['橙色', 'orange'], ['黄色', 'yellow'], ['绿色', 'green'], ['青色', 'teal'], ['蓝色', 'blue'], ['紫色', 'purple'], ['灰色', 'grey']];
const menus = new WeakMap();
const menuControllers = new WeakMap();

function selectedFontSize(formatBar) {
  const range = formatBar.nativeRange;
  const selectedBlocks = formatBar.host.selection.filter('block').map(selection => selection.blockId);
  const sizes = new Set(), selection = [];
  for (const richText of formatBar.host.querySelectorAll('rich-text')) {
    const inline = richText.inlineEditor, block = richText.closest('[data-block-id]');
    if (!inline || !block) continue;
    const wholeBlock = selectedBlocks.includes(block.dataset.blockId);
    if (!wholeBlock && (!range || range.collapsed || !range.intersectsNode(richText))) continue;
    const selected = wholeBlock ? {index:0,length:inline.yText.length} : inline.getInlineRange();
    if (!selected?.length) continue;
    selection.push([block.dataset.blockId, selected.index, selected.length]);
    const defaultSize = parseFloat(getComputedStyle(richText).fontSize);
    let index = 0;
    for (const delta of inline.yTextDeltas) {
      const end = index + delta.insert.length;
      // Strict overlap excludes the preceding run at a formatting boundary.
      if (end > selected.index && index < selected.index + selected.length) {
        const size = delta.attributes?.fontSize ?? defaultSize;
        if (Number.isFinite(size)) sizes.add(Math.round(size * 10) / 10);
      }
      index = end;
    }
  }
  return {size:sizes.size === 1 ? [...sizes][0] : null, key:JSON.stringify(selection)};
}

function closeFormatMenus(formatBar) {
  for (const controller of menuControllers.get(formatBar) ?? []) controller.close();
}

function attachMenu(formatBar, wrapper, trigger, panel, maxHeight) {
  const controllers = menuControllers.get(formatBar) ?? [];
  menuControllers.set(formatBar, controllers);
  // The top layer escapes the floating toolbar's containing block and clipping.
  panel.setAttribute('popover', 'manual');
  trigger.setAttribute('aria-expanded', 'false');
  let frame = 0;
  const close = () => {
    cancelAnimationFrame(frame);frame = 0;
    if (panel.matches(':popover-open')) panel.hidePopover();
    panel.hidden = true;trigger.setAttribute('aria-expanded', 'false');
  };
  const position = () => {
    if (panel.hidden) return;
    const bounds = trigger.getBoundingClientRect();
    if (!trigger.isConnected || !bounds.width || !bounds.height || getComputedStyle(formatBar.formatBarElement).display === 'none') return close();
    const below = innerHeight - bounds.bottom - 14, above = bounds.top - 14;
    const upward = below < Math.min(maxHeight, panel.scrollHeight + 12) && above > below;
    panel.style.maxHeight = `${Math.max(40, Math.min(maxHeight, upward ? above : below))}px`;
    const rect = panel.getBoundingClientRect();
    panel.style.left = `${Math.max(8, Math.min(bounds.left, innerWidth - rect.width - 8))}px`;
    panel.style.top = `${Math.max(8, upward ? bounds.top - rect.height - 6 : bounds.bottom + 6)}px`;
    frame = requestAnimationFrame(position);
  };
  const controller = {close};controllers.push(controller);
  wrapper.addEventListener('mousedown', event => event.preventDefault());
  trigger.addEventListener('click', () => {
    const opening = panel.hidden;
    closeFormatMenus(formatBar);
    if (!opening) return;
    panel.hidden = false;panel.showPopover();trigger.setAttribute('aria-expanded', 'true');position();
  });
  return controller;
}

function fontSizeMenu(formatBar) {
  if (!menus.has(formatBar)) menus.set(formatBar, new Map());
  const cached = menus.get(formatBar);
  if (cached.has('fontSize')) {
    const wrapper = cached.get('fontSize');
    wrapper.querySelector('.pv-color-trigger').textContent = selectedFontSize(formatBar).size ?? '字号';
    return wrapper;
  }
  const wrapper = document.createElement('div');
  wrapper.className = 'pv-color-dropdown';
  const trigger = document.createElement('button');
  trigger.type = 'button';trigger.className = 'pv-color-trigger';trigger.textContent = selectedFontSize(formatBar).size ?? '字号';
  trigger.setAttribute('aria-label', '调整字号');trigger.setAttribute('aria-expanded', 'false');
  const panel = document.createElement('div');
  panel.className = 'pv-color-panel pv-font-size-panel';panel.hidden = true;panel.setAttribute('role', 'menu');
  const controller = attachMenu(formatBar, wrapper, trigger, panel, 240);
  for (const size of [null, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64, 96]) {
    const choice = document.createElement('button');choice.type = 'button';choice.setAttribute('role', 'menuitem');
    choice.textContent = size === null ? '默认字号' : `${size} px`;
    choice.addEventListener('click', () => {
      const payload = {styles: {fontSize: size}};
      const doc = formatBar.host.doc;doc.captureSync();
      formatBar.host.std.command.chain().try(chain => [
        chain.getTextSelection().formatText(payload),
        chain.getBlockSelections().formatBlock(payload),
        chain.formatNative(payload),
      ]).run();
      doc.captureSync();controller.close();formatBar.requestUpdate();
    });
    panel.append(choice);
  }
  wrapper.append(menuStyle(), trigger, panel);cached.set('fontSize', wrapper);
  return wrapper;
}

function colorMenu(formatBar, kind) {
  if (!menus.has(formatBar)) menus.set(formatBar, new Map());
  const cached = menus.get(formatBar);
  if (cached.has(kind)) return cached.get(kind);
  const wrapper = document.createElement('div');
  wrapper.className = 'pv-color-dropdown';
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'pv-color-trigger';
  trigger.textContent = kind === 'color' ? '字体颜色' : '背景颜色';
  const panel = document.createElement('div');
  panel.className = 'pv-color-panel';
  panel.hidden = true;
  panel.setAttribute('role', 'menu');
  const controller = attachMenu(formatBar, wrapper, trigger, panel, 200);
  for (const [label, name] of colors) {
    const choice = document.createElement('button');
    choice.type = 'button';
    choice.setAttribute('role', 'menuitem');
    const value = name ? `var(--affine-text-highlight-${kind === 'color' ? 'foreground-' : ''}${name})` : null;
    const swatch = document.createElement('span');
    swatch.className = 'pv-color-swatch';
    swatch.setAttribute('aria-hidden', 'true');
    swatch.textContent = 'A';
    if (kind === 'color') swatch.style.color = value || 'inherit';
    else swatch.style.background = value || 'transparent';
    choice.append(swatch, document.createTextNode(label));
    choice.addEventListener('click', () => {
      const payload = { styles: { [kind]: value } };
      formatBar.host.std.command.chain().try(chain => [
        chain.getTextSelection().formatText(payload),
        chain.getBlockSelections().formatBlock(payload),
        chain.formatNative(payload),
      ]).run();
      controller.close();
      formatBar.requestUpdate();
    });
    panel.append(choice);
  }
  wrapper.append(menuStyle(), trigger, panel);
  cached.set(kind, wrapper);
  return wrapper;
}

function menuStyle() {
  const style = document.createElement('style');
  style.textContent = `
    editor-toolbar > editor-menu-button:last-child,
    editor-toolbar > editor-toolbar-separator:nth-last-child(2) { display: none; }
    .pv-font-size-panel { width: 104px !important; }
    editor-menu-content.paragraph-panel { max-height: min(220px, calc(100vh - 16px)); }
    editor-menu-content.paragraph-panel > div[data-orientation="vertical"] {
      max-height: min(200px, calc(100vh - 36px)); overflow-y: auto; overscroll-behavior: contain;
    }
    .pv-color-trigger { height: 32px; padding: 0 7px; border: 0; background: transparent; color: var(--affine-text-primary-color); font-size: 11px; white-space: nowrap; cursor: pointer; }
    .pv-color-panel { position: fixed; inset: auto; margin: 0; width: 152px; padding: 5px; box-sizing: border-box; overflow-y: auto; overscroll-behavior: contain; border: 1px solid var(--affine-border-color); border-radius: 8px; background: var(--affine-background-overlay-panel-color, var(--affine-background-primary-color)); color: var(--affine-text-primary-color); box-shadow: 0 4px 18px #0002; z-index: 1000; }
    .pv-color-panel[hidden] { display: none; }
    .pv-color-panel button { display: flex; align-items: center; gap: 8px; width: 100%; padding: 5px 7px; border: 0; border-radius: 4px; background: transparent; color: var(--affine-text-primary-color); font-size: 12px; cursor: pointer; }
    .pv-color-panel button:hover, .pv-color-trigger:hover { background: var(--affine-hover-color); }
    .pv-color-swatch { display: grid; place-items: center; width: 18px; height: 18px; border: 1px solid var(--affine-border-color); border-radius: 3px; }
    .pv-color-panel::-webkit-scrollbar, .paragraph-panel > div::-webkit-scrollbar { width: 5px; }
    .pv-color-panel::-webkit-scrollbar-thumb, .paragraph-panel > div::-webkit-scrollbar-thumb { background: var(--affine-border-color); border-radius: 5px; }
  `;
  return style;
}

export function customizeFormatMenus(formatBar) {
  formatBar.moreGroups = [];
  formatBar.configItems = formatBar.configItems.flatMap(item =>
    item.type === 'paragraph-dropdown' ? [item, { type: 'custom', render: bar => fontSizeMenu(bar) }] : item.type === 'highlighter-dropdown' ? [
      { type: 'custom', render: bar => colorMenu(bar, 'color') },
      { type: 'custom', render: bar => colorMenu(bar, 'background') },
    ] : [item]);
  document.addEventListener('pointerdown', event => {
    if (event.composedPath().some(node => node instanceof Element && node.matches('.pv-color-dropdown'))) return;
    closeFormatMenus(formatBar);
  }, true);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeFormatMenus(formatBar);
  }, true);
  let selectedKey = '', frame = 0;
  const refreshSelection = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const {key,size} = selectedFontSize(formatBar);
      if (key !== selectedKey) closeFormatMenus(formatBar);
      selectedKey = key;
      const trigger = menus.get(formatBar)?.get('fontSize')?.querySelector('.pv-color-trigger');
      if (trigger) trigger.textContent = size ?? '字号';
    });
  };
  document.addEventListener('selectionchange', refreshSelection);
  formatBar.disposables.add(formatBar.host.selection.slots.changed.on(refreshSelection));
}
