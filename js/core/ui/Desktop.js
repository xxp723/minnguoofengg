/**
 * 文件名: js/core/ui/Desktop.js
 * 用途: 桌面渲染器。
 *       根据 DesktopConfig 的 pages 数据渲染多屏桌面和应用图标。
 *       监听 desktop:changed 事件自动重渲染；点击图标通过 EventBus 打开应用。
 * 位置: /js/core/ui/Desktop.js
 * 架构层: 外观层（UI Layer）
 */
export class Desktop {
  /**
   * @param {HTMLElement} container
   * @param {import('../interaction/EventBus.js').EventBus} eventBus
   * @param {import('../logic/AppManager.js').AppManager} appManager
   */
  constructor(container, eventBus, appManager) {
    this.container = container;
    this.eventBus = eventBus;
    this.appManager = appManager;

    this.bindEvents();
  }

  bindEvents() {
    this.eventBus.on('desktop:changed', ({ config }) => {
      this.render(config);
    });
  }

  render(config) {
    if (!this.container || !config) return;

    // 如果已有静态布局（data-static-layout="true"），不重建 DOM，只做增强：绑定事件、恢复图标
    const isStaticLayout = this.container.dataset.staticLayout === 'true';

    if (!isStaticLayout) {
      // 原有动态渲染路径（保留兼容性）
      const apps = this.appManager.registry.getAll();
      const appMap = new Map(apps.map((app) => [app.id, app]));
      const pages = Array.isArray(config.pages) ? config.pages : [];
      const renderIcons = (appIds, rowClass) => {
        const iconsHtml = (appIds || [])
          .map((appId) => {
            const app = appMap.get(appId);
            if (!app) return '';
            const customImg = localStorage.getItem(`miniphone_app_icon_${app.id}`);
            const imgStyle = customImg ? '' : 'display:none;';
            return `
              <div class="app-icon" draggable="true" data-app-id="${app.id}" title="${app.name}">
                <button class="app-icon-btn" type="button" data-open-app="${app.id}" aria-label="打开${app.name}">
                  <span class="app-icon-glyph">${app.icon || ''}</span>
                  <img class="app-custom-img" src="${customImg || ''}" style="${imgStyle}" alt="${app.name}" />
                </button>
                <span class="app-icon-label">${app.name}</span>
              </div>
            `;
          })
          .join('');
        return `<div class="${rowClass}">${iconsHtml}</div>`;
      };

      const html = pages
        .map((page, index) => {
          if (index === 0) {
            return `
              <section class="desktop-page" data-page-id="${page.id}">
                <div class="p1-clock-widget">
                  <div class="p1-clock-shell">
                    <div class="p1-time" id="widget-time">00:00</div>
                    <div class="p1-date" id="widget-date">1925年1月1日 星期一</div>
                  </div>
                </div>
                <div class="p1-widgets-row">
                  <div class="p1-avatar-widget" id="avatar-trigger" title="点击编辑头像">
                    <div class="p1-avatar-inner">
                      <img class="p1-avatar-img" id="widget-avatar" style="display:none;" alt="头像" />
                      <div class="p1-avatar-hint" id="widget-avatar-hint">點擊上傳</div>
                    </div>
                    <div class="p1-avatar-desc" id="cfg-avatar-desc">號加外急<br>0123456789</div>
                  </div>
                  <div class="p1-news-widget" id="news-trigger" title="点击编辑报纸">
                    <div class="p1-news-image" id="widget-news-img-wrap">
                      <img class="p1-news-img" id="widget-news-img" style="display:none;" alt="报纸图片" />
                    </div>
                    <div class="p1-news-title" id="cfg-news-title">民国日报</div>
                    <div class="p1-news-content" id="cfg-news-content">才子佳人，乱世情缘。<br>寻人启事：炮火纷飞，国破家亡，生离死别，苦不堪言。寻影展示，护你一世周全。阴阳两隔，任性蹉跎。这就是真正的民国。</div>
                  </div>
                </div>
                ${renderIcons(page.appIds, 'p1-apps-row')}
                <div class="p1-ticket-widget" id="p1-ticket">
                  <div class="p1-ticket-inner">
                    <div class="p1-ticket-brand" id="cfg-p1-ticket-brand">中华民国长江航运公司</div>
                    <div class="p1-ticket-body">
                      <div class="p1-ticket-route">
                        <div class="p1-ticket-date" id="cfg-p1-ticket-date">民国十四年五月初七</div>
                        <div class="p1-ticket-arrows">
                          <span id="cfg-p1-ticket-from">重庆</span>
                          <span class="p1-ticket-arrow">→</span>
                          <span id="cfg-p1-ticket-to">汉口</span>
                        </div>
                      </div>
                      <div class="p1-ticket-footer">
                        <span id="cfg-p1-ticket-name">乘客：张三</span>
                        <span id="cfg-p1-ticket-time">开航：辰时</span>
                        <span id="cfg-p1-ticket-no">票号：M1925-001</span>
                      </div>
                    </div>
                    <div class="p1-ticket-stamp">民国快线</div>
                  </div>
                </div>
              </section>
            `;
          } else if (index === 1) {
            return `
              <section class="desktop-page" data-page-id="${page.id}">
                <div class="p2-ticket-widget">
                  <div class="p2-ticket-inner">
                    <div class="p2-ticket-brand" contenteditable="true" id="cfg-ticket-brand" spellcheck="false">浮生劇院</div>
                    <div class="p2-ticket-img-box" id="ticket-img-trigger">
                      <img class="p2-ticket-img" id="widget-ticket-img" style="display:none;" />
                      <div class="p2-ticket-stamp" contenteditable="true" id="cfg-ticket-stamp" spellcheck="false">No.001925 憑券入場</div>
                    </div>
                    <div class="p2-ticket-text-zone">
                      <div class="p2-ticket-title" contenteditable="true" id="cfg-ticket-title" spellcheck="false">霸王別姬</div>
                      <div class="p2-ticket-desc" contenteditable="true" id="cfg-ticket-desc" spellcheck="false">
                        <span>辛已年五月廿十</span>
                        <span>渝州縣橫河街</span>
                        <span>經典劇目 悲慘世界</span>
                      </div>
                    </div>
                  </div>
                </div>
                ${renderIcons(page.appIds, 'p2-apps-row')}
              </section>
            `;
          } else {
            return `<section class="desktop-page" data-page-id="${page.id}">${renderIcons(page.appIds, 'p1-apps-row')}</section>`;
          }
        })
        .join('');

      this.container.innerHTML = html;
    } else {
      // 静态布局：仅恢复图标图片、绑定事件
      const apps = this.appManager.registry.getAll();
      const appMap = new Map(apps.map((app) => [app.id, app]));

      // 恢复自定义图标
      this.container.querySelectorAll('[data-app-id]').forEach((el) => {
        const appId = el.getAttribute('data-app-id');
        const app = appMap.get(appId);
        if (!app) return;
        const btn = el.querySelector('.app-icon-btn');
        const img = el.querySelector('.app-custom-img');
        const glyph = el.querySelector('.app-icon-glyph');
        if (glyph && !glyph.innerHTML.trim()) glyph.innerHTML = app.icon || '';
        const customImg = localStorage.getItem(`miniphone_app_icon_${appId}`);
        if (img && customImg) {
          img.src = customImg;
          img.style.display = 'block';
          btn?.classList.add('has-img');
        }
      });

      // Dock 图标自定义
      document.querySelectorAll('#dock-container [data-app-id]').forEach((el) => {
        const appId = el.getAttribute('data-app-id');
        const img = el.querySelector('.app-custom-img');
        const btn = el.querySelector('.app-icon-btn');
        const glyph = el.querySelector('.app-icon-glyph');
        const app = appMap.get(appId);
        if (glyph && app && !glyph.innerHTML.trim()) glyph.innerHTML = app.icon || '';
        const customImg = localStorage.getItem(`miniphone_app_icon_${appId}`);
        if (img && customImg) {
          img.src = customImg;
          img.style.display = 'block';
          btn?.classList.add('has-img');
        }
      });

      // [模块标注] 桌面应用名称显示修复模块：桌面应用显示名称，DOCK 栏应用隐藏名称
      this.container.querySelectorAll('.app-icon[data-app-id]').forEach((el) => {
        const label = el.querySelector('.app-icon-label');
        if (label) label.style.display = '';
      });

      document.querySelectorAll('#dock-container .app-icon[data-app-id]').forEach((el) => {
        const label = el.querySelector('.app-icon-label');
        if (label) label.style.display = 'none';
      });
    }

    this.bindIconEvents();
    this.initWidgets();
  }

  bindIconEvents() {
    // 桌面内应用图标绑定
    const buttons = this.container.querySelectorAll('[data-open-app]');
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const appId = btn.getAttribute('data-open-app');
        if (!appId) return;
        this.eventBus.emit('app:open', { appId });
      });
    });

    // Dock 栏图标事件绑定 (因为 Dock 是脱离 desktop-container 的，所以在外层绑定一次)
    const dockButtons = document.querySelectorAll('#dock-container [data-open-app]');
    dockButtons.forEach((btn) => {
      // 避免重复绑定
      if (btn.dataset.bound) return;
      btn.dataset.bound = "true";
      btn.addEventListener('click', () => {
        const appId = btn.getAttribute('data-open-app');
        if (!appId) return;
        this.eventBus.emit('app:open', { appId });
      });
    });
  }

  initWidgets() {
    // 静态布局模式下，内联脚本已经处理了弹窗事件绑定，
    // Desktop.js 只负责恢复数据，不重复绑定弹窗事件以避免冲突
    const isStaticLayout = this.container.dataset.staticLayout === 'true';

    if (!isStaticLayout) {
      // 非静态布局时（动态渲染），由 Desktop.js 处理弹窗
      const avatarTrigger = this.container.querySelector('#avatar-trigger');
      const newsTrigger = this.container.querySelector('#news-trigger');
      const p1TicketTrigger = this.container.querySelector('#p1-ticket');
      const p2TicketTrigger = this.container.querySelector('#p2-ticket-trigger');
      const fileInput = document.getElementById('sys-file-upload');
      let currentUploadTarget = null;
      let currentModalMode = null;

      const modal = document.getElementById('widget-modal');
      const modalClose = document.getElementById('widget-modal-close');
      const modalSave = document.getElementById('widget-modal-save');
      const modalTitle = document.getElementById('widget-modal-title');
      const modalSections = document.querySelectorAll('.modal-section');
      const modalAvatarUpload = document.getElementById('modal-avatar-upload');
      const modalAvatarPreview = document.getElementById('modal-avatar-preview');
      const modalAvatarPlaceholder = document.getElementById('modal-avatar-placeholder');
      const modalAvatarDescInput = document.getElementById('modal-avatar-desc-input');
      const modalNewsUpload = document.getElementById('modal-news-upload');
      const modalNewsPreview = document.getElementById('modal-news-preview');
      const modalNewsPlaceholder = document.getElementById('modal-news-placeholder');
      const modalNewsTitleInput = document.getElementById('modal-news-title-input');
      const modalNewsContentInput = document.getElementById('modal-news-content-input');

      const modalP1TicketUpload = document.getElementById('modal-p1-ticket-upload');
      const modalP1TicketPreview = document.getElementById('modal-p1-ticket-preview');
      const modalP1TicketPlaceholder = document.getElementById('modal-p1-ticket-placeholder');
      const modalP1TicketBrandInput = document.getElementById('modal-p1-ticket-brand-input');
      const modalP1TicketDateInput = document.getElementById('modal-p1-ticket-date-input');
      const modalP1TicketFromInput = document.getElementById('modal-p1-ticket-from-input');
      const modalP1TicketToInput = document.getElementById('modal-p1-ticket-to-input');
      const modalP1TicketInfoInput = document.getElementById('modal-p1-ticket-info-input');

      const modalP2TicketUpload = document.getElementById('modal-ticket2-upload');
      const modalP2TicketPreview = document.getElementById('modal-ticket2-preview');
      const modalP2TicketPlaceholder = document.getElementById('modal-ticket2-placeholder');
      const modalP2TicketBrandInput = document.getElementById('modal-ticket2-brand-input');
      const modalP2TicketTitleInput = document.getElementById('modal-ticket2-title-input');
      const modalP2TicketDescInput = document.getElementById('modal-ticket2-desc-input');
      const modalP2TicketStampInput = document.getElementById('modal-ticket2-stamp-input');

      const modalAvatarDelete = document.getElementById('modal-avatar-delete');
      const modalP2TicketDelete = document.getElementById('modal-ticket2-delete');

      const hideModal = () => {
        if (modal) {
          modal.classList.add('hidden');
          modal.setAttribute('aria-hidden', 'true');
          currentModalMode = null;
        }
      };

      const showSection = (mode) => {
        modalSections.forEach(sec => sec.classList.remove('is-active'));
        const target = document.querySelector(`.modal-section[data-modal-section="${mode}"]`);
        if (target) target.classList.add('is-active');
      };

      const openModal = (mode) => {
        if (!modal) return;
        currentModalMode = mode;
        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
        const modalTitleMap = {
          avatar: '编辑头像',
          news: '编辑报纸',
          ticket1: '编辑航运车票',
          ticket2: '编辑戏票组件'
        };
        modalTitle.textContent = modalTitleMap[mode] || '编辑';
        showSection(mode);

        if (mode === 'avatar') {
          const img = this.container.querySelector('#widget-avatar');
          if (img && img.style.display !== 'none') {
            modalAvatarPreview.src = img.src;
            modalAvatarPreview.style.display = 'block';
            modalAvatarPlaceholder.style.display = 'none';
          } else {
            modalAvatarPreview.style.display = 'none';
            modalAvatarPlaceholder.style.display = 'block';
          }
          const desc = this.container.querySelector('#cfg-avatar-desc');
          modalAvatarDescInput.value = desc ? desc.innerText : '';
        } else if (mode === 'news') {
          const img = this.container.querySelector('#widget-news-img');
          if (img && img.style.display !== 'none') {
            modalNewsPreview.src = img.src;
            modalNewsPreview.style.display = 'block';
            modalNewsPlaceholder.style.display = 'none';
          } else {
            modalNewsPreview.style.display = 'none';
            modalNewsPlaceholder.style.display = 'block';
          }
          const title = this.container.querySelector('#cfg-news-title');
          const content = this.container.querySelector('#cfg-news-content');
          modalNewsTitleInput.value = title ? title.innerText : '';
          modalNewsContentInput.value = content ? content.innerHTML.replace(/<br\s*\/?>/g, '\n') : '';
        } else if (mode === 'ticket1') {
          modalP1TicketBrandInput.value = this.container.querySelector('#cfg-p1-ticket-brand')?.innerText || '';
          modalP1TicketDateInput.value = this.container.querySelector('#cfg-p1-ticket-date')?.innerText || '';
          modalP1TicketFromInput.value = this.container.querySelector('#cfg-p1-ticket-from')?.innerText || '';
          modalP1TicketToInput.value = this.container.querySelector('#cfg-p1-ticket-to')?.innerText || '';
          const info = [
            this.container.querySelector('#cfg-p1-ticket-name')?.innerText || '',
            this.container.querySelector('#cfg-p1-ticket-time')?.innerText || '',
            this.container.querySelector('#cfg-p1-ticket-no')?.innerText || ''
          ].filter(Boolean).join('\n');
          modalP1TicketInfoInput.value = info;
        } else if (mode === 'ticket2') {
          const img = this.container.querySelector('#widget-ticket-img');
          if (img && img.style.display !== 'none') {
            modalP2TicketPreview.src = img.src;
            modalP2TicketPreview.style.display = 'block';
            modalP2TicketPlaceholder.style.display = 'none';
          } else {
            modalP2TicketPreview.style.display = 'none';
            modalP2TicketPlaceholder.style.display = 'block';
          }
          modalP2TicketBrandInput.value = this.container.querySelector('#cfg-ticket-brand')?.innerText || '';
          modalP2TicketTitleInput.value = this.container.querySelector('#cfg-ticket-title')?.innerText || '';
          modalP2TicketDescInput.value = this.container.querySelector('#cfg-ticket-desc')?.innerText || '';
          modalP2TicketStampInput.value = this.container.querySelector('#cfg-ticket-stamp')?.innerText || '';
        }
      };

      const ensureManagedResourceModal = () => {
        const existed = document.getElementById('desktop-managed-resource-modal');
        if (existed) {
          return {
            modal: existed,
            mask: existed.querySelector('.managed-resource-modal__mask'),
            closeBtn: existed.querySelector('#desktop-managed-resource-modal-close'),
            localBtn: existed.querySelector('#desktop-managed-resource-modal-local'),
            confirmBtn: existed.querySelector('#desktop-managed-resource-modal-confirm'),
            titleEl: existed.querySelector('#desktop-managed-resource-modal-title'),
            hintEl: existed.querySelector('#desktop-managed-resource-modal-hint'),
            inputEl: existed.querySelector('#desktop-managed-resource-modal-url')
          };
        }

        const modalEl = document.createElement('div');
        modalEl.id = 'desktop-managed-resource-modal';
        modalEl.className = 'managed-resource-modal hidden';
        modalEl.setAttribute('aria-hidden', 'true');
        modalEl.innerHTML = `
          <div class="managed-resource-modal__mask"></div>
          <div class="managed-resource-modal__panel" role="dialog" aria-modal="true" aria-labelledby="desktop-managed-resource-modal-title">
            <div class="managed-resource-modal__header">
              <span id="desktop-managed-resource-modal-title">选择图片资源</span>
              <button type="button" class="managed-resource-modal__close" id="desktop-managed-resource-modal-close" aria-label="关闭图片资源弹窗">
                <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="16" height="16"><path d="M14 14L34 34" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M34 14L14 34" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>
              </button>
            </div>
            <div class="managed-resource-modal__body">
              <p class="managed-resource-modal__hint" id="desktop-managed-resource-modal-hint">可从本地导入，也可直接粘贴图片 URL。</p>
              <button type="button" class="modal-btn" id="desktop-managed-resource-modal-local">从本地导入图片</button>
              <div class="modal-field">
                <label for="desktop-managed-resource-modal-url">图片 URL</label>
                <input id="desktop-managed-resource-modal-url" type="url" placeholder="https://example.com/image.jpg" />
              </div>
              <button type="button" class="modal-btn primary" id="desktop-managed-resource-modal-confirm">使用 URL 图片</button>
            </div>
          </div>
        `;
        document.body.appendChild(modalEl);

        return {
          modal: modalEl,
          mask: modalEl.querySelector('.managed-resource-modal__mask'),
          closeBtn: modalEl.querySelector('#desktop-managed-resource-modal-close'),
          localBtn: modalEl.querySelector('#desktop-managed-resource-modal-local'),
          confirmBtn: modalEl.querySelector('#desktop-managed-resource-modal-confirm'),
          titleEl: modalEl.querySelector('#desktop-managed-resource-modal-title'),
          hintEl: modalEl.querySelector('#desktop-managed-resource-modal-hint'),
          inputEl: modalEl.querySelector('#desktop-managed-resource-modal-url')
        };
      };

      const openManagedResourceModal = ({ title, hint, placeholder, onLocalPick, onUrlConfirm }) => {
        const modalRefs = ensureManagedResourceModal();
        if (!modalRefs?.modal) return;

        modalRefs.titleEl.textContent = title || '选择图片资源';
        modalRefs.hintEl.textContent = hint || '可从本地导入，也可直接粘贴图片 URL。';
        modalRefs.inputEl.value = '';
        modalRefs.inputEl.placeholder = placeholder || 'https://example.com/image.jpg';

        const close = () => {
          modalRefs.modal.classList.add('hidden');
          modalRefs.modal.setAttribute('aria-hidden', 'true');
          modalRefs.mask?.removeEventListener('click', close);
          modalRefs.closeBtn?.removeEventListener('click', close);
          modalRefs.localBtn?.removeEventListener('click', handleLocal);
          modalRefs.confirmBtn?.removeEventListener('click', handleConfirm);
        };

        const handleLocal = async () => {
          const ok = await onLocalPick?.();
          if (ok) close();
        };

        const handleConfirm = async () => {
          const url = modalRefs.inputEl?.value?.trim();
          if (!url) {
            modalRefs.inputEl?.focus();
            return;
          }
          const ok = await onUrlConfirm?.(url);
          if (ok) close();
        };

        modalRefs.mask?.addEventListener('click', close);
        modalRefs.closeBtn?.addEventListener('click', close);
        modalRefs.localBtn?.addEventListener('click', handleLocal);
        modalRefs.confirmBtn?.addEventListener('click', handleConfirm);

        modalRefs.modal.classList.remove('hidden');
        modalRefs.modal.setAttribute('aria-hidden', 'false');
        modalRefs.inputEl?.focus();
      };

      const handleUploadClick = (target) => {
        openManagedResourceModal({
          title: '选择图片资源',
          hint: '你可以从本地导入图片，也可以输入网络图片 URL。',
          placeholder: 'https://example.com/image.jpg',
          onLocalPick: async () => {
            currentUploadTarget = target;
            fileInput?.click();
            return true;
          },
          onUrlConfirm: async (url) => {
            this.applyImageToTarget(target, url.trim());
            if (target === 'avatar') {
              modalAvatarPreview.src = url.trim();
              modalAvatarPreview.style.display = 'block';
              modalAvatarPlaceholder.style.display = 'none';
            }
            if (target === 'news') {
              modalNewsPreview.src = url.trim();
              modalNewsPreview.style.display = 'block';
              modalNewsPlaceholder.style.display = 'none';
            }
            if (target === 'p1ticket') {
              modalP1TicketPreview.src = url.trim();
              modalP1TicketPreview.style.display = 'block';
              modalP1TicketPlaceholder.style.display = 'none';
            }
            if (target === 'ticket') {
              modalP2TicketPreview.src = url.trim();
              modalP2TicketPreview.style.display = 'block';
              modalP2TicketPlaceholder.style.display = 'none';
            }
            return true;
          }
        });
      };

      if (avatarTrigger) avatarTrigger.addEventListener('click', () => openModal('avatar'));
      if (newsTrigger) newsTrigger.addEventListener('click', () => openModal('news'));
      if (p1TicketTrigger) p1TicketTrigger.addEventListener('click', () => openModal('ticket1'));
      if (p2TicketTrigger) p2TicketTrigger.addEventListener('click', () => openModal('ticket2'));

      if (modalAvatarUpload) modalAvatarUpload.addEventListener('click', () => handleUploadClick('avatar'));
      if (modalNewsUpload) modalNewsUpload.addEventListener('click', () => handleUploadClick('news'));
      if (modalP1TicketUpload) modalP1TicketUpload.addEventListener('click', () => handleUploadClick('p1ticket'));
      if (modalP2TicketUpload) modalP2TicketUpload.addEventListener('click', () => handleUploadClick('ticket'));

      // 删除按钮事件
      if (modalAvatarDelete) modalAvatarDelete.addEventListener('click', () => {
        this.removeImageFromTarget('avatar');
        modalAvatarPreview.style.display = 'none';
        modalAvatarPlaceholder.style.display = 'block';
      });
      if (modalP2TicketDelete) modalP2TicketDelete.addEventListener('click', () => {
        this.removeImageFromTarget('ticket');
        modalP2TicketPreview.style.display = 'none';
        modalP2TicketPlaceholder.style.display = 'block';
      });

      if (modalClose) modalClose.addEventListener('click', hideModal);
      modal?.querySelector('.widget-modal__mask')?.addEventListener('click', hideModal);

      if (modalSave) {
        modalSave.addEventListener('click', () => {
          if (currentModalMode === 'avatar') {
            const desc = modalAvatarDescInput.value || '';
            const descEl = this.container.querySelector('#cfg-avatar-desc');
            if (descEl) {
              descEl.innerText = desc;
              localStorage.setItem('miniphone_widget_cfg-avatar-desc', descEl.innerHTML);
            }
          } else if (currentModalMode === 'news') {
            const title = modalNewsTitleInput.value || '';
            const content = modalNewsContentInput.value || '';
            const titleEl = this.container.querySelector('#cfg-news-title');
            const contentEl = this.container.querySelector('#cfg-news-content');
            if (titleEl) {
              titleEl.innerText = title;
              localStorage.setItem('miniphone_widget_cfg-news-title', titleEl.innerHTML);
            }
            if (contentEl) {
              const html = content.replace(/\n/g, '<br>');
              contentEl.innerHTML = html;
              localStorage.setItem('miniphone_widget_cfg-news-content', contentEl.innerHTML);
            }
          } else if (currentModalMode === 'ticket1') {
            const brandEl = this.container.querySelector('#cfg-p1-ticket-brand');
            const dateEl = this.container.querySelector('#cfg-p1-ticket-date');
            const fromEl = this.container.querySelector('#cfg-p1-ticket-from');
            const toEl = this.container.querySelector('#cfg-p1-ticket-to');
            const nameEl = this.container.querySelector('#cfg-p1-ticket-name');
            const timeEl = this.container.querySelector('#cfg-p1-ticket-time');
            const noEl = this.container.querySelector('#cfg-p1-ticket-no');

            if (brandEl) {
              brandEl.innerText = modalP1TicketBrandInput.value || '';
              localStorage.setItem('miniphone_widget_cfg-p1-ticket-brand', brandEl.innerHTML);
            }
            if (dateEl) {
              dateEl.innerText = modalP1TicketDateInput.value || '';
              localStorage.setItem('miniphone_widget_cfg-p1-ticket-date', dateEl.innerHTML);
            }
            if (fromEl) {
              fromEl.innerText = modalP1TicketFromInput.value || '';
              localStorage.setItem('miniphone_widget_cfg-p1-ticket-from', fromEl.innerHTML);
            }
            if (toEl) {
              toEl.innerText = modalP1TicketToInput.value || '';
              localStorage.setItem('miniphone_widget_cfg-p1-ticket-to', toEl.innerHTML);
            }

            const infoLines = (modalP1TicketInfoInput.value || '').split('\n').map((s) => s.trim()).filter(Boolean);
            if (nameEl) {
              nameEl.innerText = infoLines[0] || '';
              localStorage.setItem('miniphone_widget_cfg-p1-ticket-name', nameEl.innerHTML);
            }
            if (timeEl) {
              timeEl.innerText = infoLines[1] || '';
              localStorage.setItem('miniphone_widget_cfg-p1-ticket-time', timeEl.innerHTML);
            }
            if (noEl) {
              noEl.innerText = infoLines[2] || '';
              localStorage.setItem('miniphone_widget_cfg-p1-ticket-no', noEl.innerHTML);
            }
          } else if (currentModalMode === 'ticket2') {
            const brandEl = this.container.querySelector('#cfg-ticket-brand');
            const titleEl = this.container.querySelector('#cfg-ticket-title');
            const descEl = this.container.querySelector('#cfg-ticket-desc');
            const stampEl = this.container.querySelector('#cfg-ticket-stamp');

            if (brandEl) {
              brandEl.innerText = modalP2TicketBrandInput.value || '';
              localStorage.setItem('miniphone_widget_cfg-ticket-brand', brandEl.innerHTML);
            }
            if (titleEl) {
              titleEl.innerText = modalP2TicketTitleInput.value || '';
              localStorage.setItem('miniphone_widget_cfg-ticket-title', titleEl.innerHTML);
            }
            if (descEl) {
              const html = (modalP2TicketDescInput.value || '').replace(/\n/g, '<br>');
              descEl.innerHTML = html;
              localStorage.setItem('miniphone_widget_cfg-ticket-desc', descEl.innerHTML);
            }
            if (stampEl) {
              stampEl.innerText = modalP2TicketStampInput.value || '';
              localStorage.setItem('miniphone_widget_cfg-ticket-stamp', stampEl.innerHTML);
            }
          }
          hideModal();
        });
      }

      // 防止多次绑定全局事件
      if (fileInput && !fileInput.dataset.bound) {
        fileInput.dataset.bound = "true";
        fileInput.addEventListener('change', (e) => {
          const file = e.target.files[0];
          if (file && currentUploadTarget) {
            const reader = new FileReader();
            reader.onload = (evt) => {
              this.applyImageToTarget(currentUploadTarget, evt.target.result);
              if (currentUploadTarget === 'avatar') {
                modalAvatarPreview.src = evt.target.result;
                modalAvatarPreview.style.display = 'block';
                modalAvatarPlaceholder.style.display = 'none';
              } else if (currentUploadTarget === 'news') {
                modalNewsPreview.src = evt.target.result;
                modalNewsPreview.style.display = 'block';
                modalNewsPlaceholder.style.display = 'none';
              } else if (currentUploadTarget === 'p1ticket') {
                modalP1TicketPreview.src = evt.target.result;
                modalP1TicketPreview.style.display = 'block';
                modalP1TicketPlaceholder.style.display = 'none';
              } else if (currentUploadTarget === 'ticket') {
                modalP2TicketPreview.src = evt.target.result;
                modalP2TicketPreview.style.display = 'block';
                modalP2TicketPlaceholder.style.display = 'none';
              }
              fileInput.value = ''; // 清空方便下次选择
            };
            reader.readAsDataURL(file);
          }
        });
      }
    }

    // 从 localStorage 恢复自定义文本和图片
    this.restoreWidgetData();
  }

  removeImageFromTarget(targetStr) {
    if (targetStr === 'avatar') {
      const img = this.container.querySelector('#widget-avatar');
      const hint = this.container.querySelector('#widget-avatar-hint');
      if (img) { img.src = ''; img.style.display = 'none'; }
      if (hint) hint.style.display = 'block';
      localStorage.removeItem('miniphone_widget_avatar');
    } else if (targetStr === 'ticket') {
      const img = this.container.querySelector('#widget-ticket-img');
      if (img) { img.src = ''; img.style.display = 'none'; }
      localStorage.removeItem('miniphone_widget_ticket');
    }
  }

  applyImageToTarget(targetStr, src) {
    if (targetStr === 'avatar') {
      const img = this.container.querySelector('#widget-avatar');
      const hint = this.container.querySelector('#widget-avatar-hint');
      if (img) { img.src = src; img.style.display = 'block'; }
      if (hint) hint.style.display = 'none';
      localStorage.setItem('miniphone_widget_avatar', src);
    } else if (targetStr === 'ticket') {
      const img = this.container.querySelector('#widget-ticket-img');
      if (img) { img.src = src; img.style.display = 'block'; }
      localStorage.setItem('miniphone_widget_ticket', src);
    } else if (targetStr === 'p1ticket') {
      const img = this.container.querySelector('#widget-p1-ticket-img');
      if (img) { img.src = src; img.style.display = 'block'; }
      localStorage.setItem('miniphone_widget_p1_ticket', src);
    } else if (targetStr === 'news') {
      const img = this.container.querySelector('#widget-news-img');
      if (img) { img.src = src; img.style.display = 'block'; }
      localStorage.setItem('miniphone_widget_news_img', src);
    }
  }

  restoreWidgetData() {
    // 恢复图片
    const savedAvatar = localStorage.getItem('miniphone_widget_avatar');
    if (savedAvatar) this.applyImageToTarget('avatar', savedAvatar);
    
    const savedTicket = localStorage.getItem('miniphone_widget_ticket');
    if (savedTicket) this.applyImageToTarget('ticket', savedTicket);

    const savedNewsImg = localStorage.getItem('miniphone_widget_news_img');
    if (savedNewsImg) this.applyImageToTarget('news', savedNewsImg);

    const savedP1TicketImg = localStorage.getItem('miniphone_widget_p1_ticket');
    if (savedP1TicketImg) this.applyImageToTarget('p1ticket', savedP1TicketImg);

    // 恢复文本
    const textFields = [
      'cfg-avatar-desc',
      'cfg-news-title',
      'cfg-news-content',
      'cfg-ticket-brand',
      'cfg-ticket-title',
      'cfg-ticket-desc',
      'cfg-ticket-stamp',
      'cfg-p1-ticket-brand',
      'cfg-p1-ticket-date',
      'cfg-p1-ticket-from',
      'cfg-p1-ticket-to',
      'cfg-p1-ticket-name',
      'cfg-p1-ticket-time',
      'cfg-p1-ticket-no'
    ];
    textFields.forEach(id => {
      const el = this.container.querySelector('#' + id);
      if (el) {
        const saved = localStorage.getItem('miniphone_widget_' + id);
        if (saved) el.innerHTML = saved;
        el.addEventListener('blur', () => {
          localStorage.setItem('miniphone_widget_' + id, el.innerHTML);
        });
        el.addEventListener('mousedown', (e) => e.stopPropagation());
      }
    });
  }
}
