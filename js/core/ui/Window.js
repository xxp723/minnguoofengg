/**
 * 文件名: js/core/ui/Window.js
 * 用途: 应用窗口管理器（全屏覆盖桌面）。
 *       提供 open/close/focus/showError 等方法，供 AppManager 控制应用窗口生命周期。
 * 位置: /js/core/ui/Window.js
 * 架构层: 外观层（UI Layer）
 */
export class WindowManager {
  /**
   * @param {HTMLElement} rootEl - 手机屏幕根容器（通常是 #phone-screen）
   * @param {import('../interaction/EventBus.js').EventBus} eventBus
   */
  constructor(rootEl, eventBus) {
    this.rootEl = rootEl;
    this.eventBus = eventBus;
    /** @type {Map<string, HTMLElement>} */
    this.windows = new Map();
    this.container = this.ensureContainer();
  }

  ensureContainer() {
    let el = this.rootEl.querySelector('#app-window-layer');
    if (!el) {
      el = document.createElement('div');
      el.id = 'app-window-layer';
      el.className = 'app-window-layer';
      this.rootEl.appendChild(el);
    }
    return el;
  }

  open(appMeta) {
    const existed = this.windows.get(appMeta.id);
    if (existed) {
      this.focus(appMeta.id);
      return existed.querySelector('.app-window__content');
    }

    const win = document.createElement('section');
    win.className = 'app-window';
    win.dataset.appId = appMeta.id;

    const header = document.createElement('header');
    header.className = 'app-window__header';
    header.innerHTML = `
      <button class="app-window__back" type="button" aria-label="返回" style="opacity:0; pointer-events:none;">
        <svg width="22" height="22" viewBox="0 0 48 48" fill="none"><path d="M16 12L32 24L16 36" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <div class="app-window__title">${appMeta.name}</div>
      <button class="app-window__close" type="button" aria-label="关闭应用">
        <svg width="22" height="22" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M10 4V44" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M38 4V44" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M10 4H38" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M4 44H44" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="28" cy="24" r="2.5" fill="currentColor"/>
        </svg>
      </button>
    `;

    const content = document.createElement('div');
    content.className = 'app-window__content';
    content.innerHTML = '<div class="loading">应用加载中...</div>';

    header.querySelector('.app-window__close')?.addEventListener('click', () => {
      this.eventBus.emit('app:close', { appId: appMeta.id });
    });

    win.appendChild(header);
    win.appendChild(content);
    this.container.appendChild(win);

    this.windows.set(appMeta.id, win);
    this.focus(appMeta.id);

    return content;
  }

  close(appId) {
    const win = this.windows.get(appId);
    if (!win) return;
    win.remove();
    this.windows.delete(appId);
  }

  focus(appId) {
    this.windows.forEach((win, id) => {
      win.classList.toggle('is-active', id === appId);
    });
  }

  setTitle(appId, title) {
    const win = this.windows.get(appId);
    if (!win) return;
    const titleEl = win.querySelector('.app-window__title');
    if (titleEl) titleEl.textContent = title;
  }

  setBackAction(appId, action) {
    const win = this.windows.get(appId);
    if (!win) return;
    const backBtn = win.querySelector('.app-window__back');
    if (!backBtn) return;
    
    const newBtn = backBtn.cloneNode(true);
    backBtn.parentNode.replaceChild(newBtn, backBtn);
    
    if (action) {
      newBtn.style.opacity = '1';
      newBtn.style.pointerEvents = 'auto';
      newBtn.addEventListener('click', action);
    } else {
      newBtn.style.opacity = '0';
      newBtn.style.pointerEvents = 'none';
    }
  }

  showError(appId, message) {
    const win = this.windows.get(appId);
    if (!win) return;
    const content = win.querySelector('.app-window__content');
    if (content) {
      content.innerHTML = `<div class="app-error">${message}</div>`;
    }
  }
}
