const svg = path => `<svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
const icons = {
  play: svg('<path d="M7 4v16l13-8z"/>'),
  pause: svg('<path d="M6 4h4v16H6zm8 0h4v16h-4z"/>'),
  sound: svg('<path d="M3 9v6h4l5 4V5L7 9zm12-3-1.4 1.4a6.5 6.5 0 0 1 0 9.2L15 18a8.5 8.5 0 0 0 0-12z"/>'),
  mute: svg('<path d="M3 9v6h4l5 4V5L7 9zm12-2 1.4-1.4L19 8.2l2.6-2.6L23 7l-2.6 2.6L23 12.2l-1.4 1.4L19 11l-2.6 2.6L15 12.2l2.6-2.6z"/>'),
  fullscreen: svg('<path d="M3 3h7v2H5v5H3zm11 0h7v7h-2V5h-5zM3 14h2v5h5v2H3zm16 0h2v7h-7v-2h5z"/>'),
  more: svg('<circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>'),
};
const clock = seconds => { seconds = Number.isFinite(seconds) ? Math.floor(seconds) : 0; return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; };

// Both viewers use this surface, positioned in screen pixels independently of media zoom.
export function createVideoControls() {
  const root = document.createElement('div');
  root.className = 'pv-video-controls';
  root.innerHTML = `<div class="pv-video-row">
    <button type="button" class="pv-video-play" aria-label="播放"></button>
    <span class="pv-video-time"></span><span class="pv-video-spacer"></span>
    <button type="button" class="pv-video-mute" aria-label="静音"></button>
    <button type="button" class="pv-video-fullscreen" aria-label="全屏">${icons.fullscreen}</button>
    <button type="button" class="pv-video-more" aria-label="更多视频选项">${icons.more}</button></div>
    <input class="pv-video-seek" type="range" min="0" max="1000" value="0" aria-label="视频进度">
    <div class="pv-video-menu" hidden><button type="button" data-action="speed">播放速度：1×</button><button type="button" data-action="pip">画中画</button><button type="button" data-action="download">下载视频</button></div>`;
  const play = root.querySelector('.pv-video-play'), mute = root.querySelector('.pv-video-mute');
  const seek = root.querySelector('.pv-video-seek'), menu = root.querySelector('.pv-video-menu');
  let video, name, listeners, hoverTarget, fullscreenTarget, timer;
  const hide = () => { if (!menu.hidden) return; root.classList.add('pv-controls-hidden'); };
  const reveal = () => { clearTimeout(timer); root.classList.remove('pv-controls-hidden'); timer = setTimeout(hide, 2200); };
  const leave = () => { clearTimeout(timer); timer = setTimeout(hide, 250); };
  const sync = () => {
    if (!video) return;
    play.innerHTML = video.paused ? icons.play : icons.pause;
    play.setAttribute('aria-label', video.paused ? '播放' : '暂停');
    mute.innerHTML = video.muted || video.volume === 0 ? icons.mute : icons.sound;
    mute.setAttribute('aria-label', video.muted ? '取消静音' : '静音');
    root.querySelector('.pv-video-time').textContent = `${clock(video.currentTime)} / ${clock(video.duration)}`;
    seek.disabled = !Number.isFinite(video.duration) || video.duration <= 0;
    if (!seek.matches(':active')) seek.value = seek.disabled ? 0 : Math.round(1000 * video.currentTime / video.duration);
    menu.querySelector('[data-action="speed"]').textContent = `播放速度：${video.playbackRate}×`;
  };
  for (const type of ['pointerdown', 'dblclick', 'click']) root.addEventListener(type, e => e.stopPropagation());
  root.addEventListener('pointermove', reveal);
  root.addEventListener('pointerleave', leave);
  root.addEventListener('focusin', reveal);
  root.addEventListener('keydown', reveal);
  root.addEventListener('focusout', leave);
  play.addEventListener('click', () => { if (video.paused) void video.play().catch(console.warn); else video.pause(); sync(); });
  mute.addEventListener('click', () => { video.muted = !video.muted; sync(); });
  seek.addEventListener('input', () => { if (!seek.disabled) video.currentTime = video.duration * Number(seek.value) / 1000; });
  root.querySelector('.pv-video-fullscreen').addEventListener('click', () => {
    const target = fullscreenTarget || video;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void target.requestFullscreen?.().catch(console.warn);
  });
  root.querySelector('.pv-video-more').addEventListener('click', () => { menu.hidden = !menu.hidden; reveal(); });
  menu.addEventListener('click', e => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'speed') video.playbackRate = ({1:1.5,1.5:2,2:0.5,0.5:1})[video.playbackRate] ?? 1;
    if (action === 'pip' && video.requestPictureInPicture) void video.requestPictureInPicture().catch(console.warn);
    if (action === 'download') { const a = document.createElement('a'); a.href = video.currentSrc; a.download = name || 'video'; a.click(); }
    menu.hidden = true; sync();
  });
  return {
    root,
    bind(nextVideo, nextName, target = nextVideo, fullTarget = target) {
      name = nextName;
      if (nextVideo === video && target === hoverTarget) return;
      listeners?.abort(); listeners = new AbortController(); video = nextVideo; hoverTarget = target; fullscreenTarget = fullTarget;
      video.controls = false;
      const options = {signal:listeners.signal};
      for (const type of ['play','pause','volumechange','timeupdate','durationchange','ratechange','ended']) video.addEventListener(type, sync, options);
      for (const type of ['pointerenter','pointermove']) target.addEventListener(type, reveal, options);
      target.addEventListener('pointerleave', leave, options);
      document.addEventListener('pointermove', event => {
        const within = element => {
          const rect = element.getBoundingClientRect();
          return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
        };
        if (!within(target) && !within(root)) leave();
      }, options);
      sync(); reveal();
    },
    place(view) {
      if (root.parentElement !== view) view.append(root);
      const rect = view.getBoundingClientRect(), canvasRect = document.querySelector('#canvas').getBoundingClientRect();
      const zoom = rect.width / view.offsetWidth || 1;
      const left = Math.max(rect.left, canvasRect.left), right = Math.min(rect.right, canvasRect.right);
      const bottom = Math.min(rect.bottom, canvasRect.bottom), top = Math.max(rect.top, canvasRect.top);
      const visibleWidth = Math.max(0, right-left), controlsHeight = Math.min(78, bottom-top);
      root.hidden = visibleWidth < 52 || controlsHeight < 38;
      root.style.left = `${(left-rect.left)/zoom}px`;
      root.style.top = `${(bottom-rect.top-controlsHeight)/zoom}px`;
      root.style.width = `${visibleWidth}px`; root.style.height = `${controlsHeight}px`;
      root.style.transform = `scale(${1/zoom})`;
      root.toggleAttribute('data-compact', visibleWidth < 270);
      root.toggleAttribute('data-tiny', visibleWidth < 150);
    },
    destroy() { clearTimeout(timer); listeners?.abort(); root.remove(); },
  };
}
