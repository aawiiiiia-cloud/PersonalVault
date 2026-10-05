import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';

const chrome = ['C:\\Users\\Admin\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(existsSync);
const port = 9823;
const profile = await mkdtemp(`${tmpdir()}\\pv-video-`);
const child = spawn(chrome, [`--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--headless=new', 'about:blank'], { cwd: profile, windowsHide: true, stdio: 'ignore' });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  for (let n = 0; n < 60; n++) { try { await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); break; } catch { await sleep(250); } }
  const page = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); });
  let seq = 0;
  const pending = new Map();
  ws.addEventListener('message', ({ data }) => { const msg = JSON.parse(data); if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'warning') console.log('browser warning', msg.params.args.map(arg => arg.value ?? arg.description)); const p = pending.get(msg.id); if (!p) return; pending.delete(msg.id); msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result); });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
  const read = async expression => { const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text); return result.result.value; };
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1400, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
  await sleep(9000);
  console.log('initial', await read(`({ status: document.querySelector('#status')?.textContent, root: !!document.querySelector('affine-edgeless-root') })`));
  const videoResult = await read(`(async () => {
    const doc = document.querySelector('affine-edgeless-root').doc;
    const surface = doc.root.children.find(block => block.flavour === 'affine:surface');
    const canvas = document.createElement('canvas'); canvas.width = 90; canvas.height = 160;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#e5383b'; ctx.fillRect(0, 0, 90, 160);
    const stream = canvas.captureStream(0);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    const chunks = [];
    recorder.ondataavailable = event => chunks.push(event.data);
    const stopped = new Promise(resolve => { recorder.onstop = resolve; });
    recorder.start();
    for (let n = 0; n < 12; n++) {
      ctx.fillStyle = n % 2 ? '#e5383b' : '#ef4b4e'; ctx.fillRect(0, 0, 90, 160);
      stream.getVideoTracks()[0].requestFrame();
      await new Promise(resolve => setTimeout(resolve, 60));
    }
    recorder.stop(); await stopped;
    stream.getTracks().forEach(track => track.stop());
    const blob = new Blob(chunks, { type: 'video/webm' });
    window.__videoTestBlob = blob;
    const sourceId = await doc.blobSync.set(blob);
    const id = doc.addBlock('affine:attachment', { sourceId, name: 'test.webm', size: blob.size, type: blob.type, embed: false, style: 'cubeThick', xywh: '[120,300,480,320]' }, surface.id);
    await new Promise(resolve => setTimeout(resolve, 3500));
    const model = doc.getBlockById(id);
    const view = document.querySelector('affine-edgeless-attachment[data-block-id="' + id + '"]');
    const player = view?.querySelector('video');
    const container = view?.querySelector('.affine-attachment-container');
    const allControls = [...document.querySelectorAll('.pv-video-controls')];
    const controls = allControls.find(element => !element.hidden);
    return { id, props: { embed: model.embed, type: model.type, sourceId: model.sourceId, size: model.size },
      bounds: { w: model.elementBound.w, h: model.elementBound.h },
      playerBounds: player ? { w: Math.round(player.getBoundingClientRect().width), h: Math.round(player.getBoundingClientRect().height) } : null,
      containerStyle: container ? { transform: getComputedStyle(container).transform, overflow: getComputedStyle(container).overflow } : null,
      nativeControls: player?.controls, customControls: !!controls,
      controlsDebug: allControls.map(element => ({hidden:element.hidden,rect:element.getBoundingClientRect().toJSON()})),
      hostRect: view?.getBoundingClientRect().toJSON(), canvasRect: document.querySelector('#canvas').getBoundingClientRect().toJSON(),
      controlWidth: controls ? Math.round(controls.getBoundingClientRect().width) : null,
      playerStyle: player?.style.cssText, view: !!view, player: !!player,
      poster: player?.poster?.startsWith('blob:'), readyState: player?.readyState };
  })()`);
  console.log('video', videoResult);
  if (!videoResult.props.embed || !videoResult.player || !videoResult.poster || videoResult.readyState < 2) throw Error('视频未显示可播放的首帧预览');
  if (Math.abs(videoResult.bounds.w / videoResult.bounds.h - 90 / 160) > 0.02) throw Error('竖屏视频框未按源比例调整');
  if (Math.abs(videoResult.playerBounds.w - videoResult.bounds.w) > 2) throw Error('视频播放器尺寸与画布框不一致');
  if (videoResult.containerStyle?.transform !== 'none' || videoResult.containerStyle?.overflow !== 'visible') throw Error('视频仍被附件卡片缩放或裁切');
  if (videoResult.nativeControls || !videoResult.customControls || Math.abs(videoResult.controlWidth - videoResult.playerBounds.w) > 2) throw Error('独立视频控制条未显示');
  const inserted = await read(`(async () => {
    const input = document.querySelector('#media-file');
    const transfer = new DataTransfer();
    transfer.items.add(new File([window.__videoTestBlob], 'portrait.webm', { type: 'video/webm' }));
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 2500));
    const doc = document.querySelector('affine-edgeless-root').doc;
    const surface = doc.root.children.find(block => block.flavour === 'affine:surface');
    const model = surface.children.find(block => block.flavour === 'affine:attachment' && block.name === 'portrait.webm');
    return { status: document.querySelector('#status').textContent, width: model?.elementBound.w, height: model?.elementBound.h };
  })()`);
  console.log('new upload', inserted);
  if (inserted.width !== 270 || inserted.height !== 480) throw Error('新上传竖屏视频未按原比例插入');
  const resized = await read(`(async () => {
    const doc = document.querySelector('affine-edgeless-root').doc;
    const model = doc.getBlockById('${videoResult.id}');
    const { x, y } = model.elementBound;
    doc.updateBlock(model, { xywh: JSON.stringify([x, y, 300, 533]) });
    await new Promise(resolve => setTimeout(resolve, 450));
    const player = document.querySelector('affine-edgeless-attachment[data-block-id="${videoResult.id}"] video');
    return { width: Math.round(player.getBoundingClientRect().width), height: Math.round(player.getBoundingClientRect().height),
      ratioError: Math.abs(model.elementBound.w - model.elementBound.h * 90 / 160) };
  })()`);
  console.log('after resize', resized);
  if (resized.width !== 300 || resized.height !== 533 || resized.ratioError > 0.05) throw Error('调整视频框大小后比例或播放器未同步');
  const zoomed = await read(`(async () => {
    const view = document.querySelector('affine-edgeless-attachment[data-block-id="${videoResult.id}"]');
    view.style.transform = view.style.transform.replace(/scale\\([^)]*\\)/, 'scale(0.5)');
    await new Promise(resolve => setTimeout(resolve, 450));
    const player = view.querySelector('video');
    const controls = [...document.querySelectorAll('.pv-video-controls')].find(element => !element.hidden);
    return { videoWidth: player.getBoundingClientRect().width, controlsWidth: controls?.getBoundingClientRect().width,
      playButtonWidth: controls?.querySelector('.pv-video-play').getBoundingClientRect().width };
  })()`);
  console.log('after zoom', zoomed);
  if (Math.abs(zoomed.videoWidth - zoomed.controlsWidth) > 2 || zoomed.playButtonWidth !== 30) throw Error('画布缩放后视频控制条尺寸异常');
  const actions = await read(`(() => {
    const controls = [...document.querySelectorAll('.pv-video-controls')].find(element => !element.hidden);
    const video = document.querySelector('affine-edgeless-attachment[data-block-id="${videoResult.id}"] video');
    controls.querySelector('.pv-video-mute').click();
    controls.querySelector('.pv-video-more').click();
    const opened = !controls.querySelector('.pv-video-menu').hidden;
    controls.querySelector('[data-action="speed"]').click();
    return { muted: video.muted, muteLabel: controls.querySelector('.pv-video-mute').getAttribute('aria-label'),
      opened, speed: video.playbackRate, closed: controls.querySelector('.pv-video-menu').hidden };
  })()`);
  console.log('control actions', actions);
  if (!actions.muted || actions.muteLabel !== '取消静音' || !actions.opened || actions.speed !== 1.5 || !actions.closed) throw Error('视频控制按钮未正常工作');
  await read(`(() => {
    const note = document.querySelector('affine-edgeless-note');
    const sample = document.createElement('div');
    sample.textContent = 'Text';
    note.append(sample);
    const popup = document.createElement('div');
    popup.attachShadow({ mode: 'open' }).innerHTML = '<div>Heading 1</div><div>To-do List</div><div>Code Block</div>';
    note.append(popup);
    return true;
  })()`);
  await sleep(450);
  const localization = await read(`(() => {
    const note = document.querySelector('affine-edgeless-note');
    const sample = [...note.children].find(el => el.textContent === '文字');
    const popup = [...note.children].find(el => el.shadowRoot?.textContent?.includes('一级标题'));
    return { noteMenuLabel: !!sample, shadowMenu: popup?.shadowRoot?.textContent ?? null };
  })()`);
  console.log('localization', localization);
  if (!localization.noteMenuLabel || localization.shadowMenu !== '一级标题待办列表代码块') throw Error('文本编辑菜单未完全翻译');
  ws.close();
} finally {
  child.kill();
  await sleep(600);
  await rm(profile, { recursive: true, force: true });
}
