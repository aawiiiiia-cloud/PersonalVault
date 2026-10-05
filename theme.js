(function () {
  const key = 'knowledge-workbench-theme';
  function read() { try { const mode=localStorage.getItem(key);if(mode==='custom'){const saved=JSON.parse(localStorage.getItem('knowledge-workbench-appearance')||'null');return saved?.custom?.baseTheme==='dark'?'dark':'light';}return mode === 'dark' ? 'dark' : 'light'; } catch { return 'light'; } }
  function apply(theme) {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    const button = document.getElementById('themeToggle');
    if (button) {
      button.querySelector('[data-theme-label]').textContent = '外观设置';
      button.setAttribute('aria-label', '外观设置');
      button.removeAttribute('aria-pressed');
    }
    const quickToggle=document.getElementById('themeQuickToggle');
    if(quickToggle){
      const next=theme==='dark'?'light':'dark',label=next==='dark'?'切换到深色模式':'切换到浅色模式';
      quickToggle.setAttribute('aria-label',label);quickToggle.title=label;
      quickToggle.querySelectorAll('[data-switch-to]').forEach(icon=>icon.hidden=icon.dataset.switchTo!==next);
    }
    window.dispatchEvent(new CustomEvent('workbench-theme-change', {detail:theme}));
  }
  apply(read());
  document.addEventListener('DOMContentLoaded', () => {
    apply(read());
  });
  window.addEventListener('storage', event => { if (event.key === key) apply(read()); });
  window.WorkbenchTheme={apply};
})();
