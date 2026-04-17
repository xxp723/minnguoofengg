/**
 * 文件名: js/core/interaction/DesktopEditMode.js
 * 用途: 桌面编辑模式控制器，管理锁屏与编辑模式切换，
 *       渲染和保存自定义桌面网格布局（自由定位+网格吸附）。
 * 位置: /js/core/interaction/DesktopEditMode.js
 */
import { Logger } from '../../utils/Logger.js';

export class DesktopEditMode {
  constructor(desktopContainer, eventBus, appManager, dragDrop) {
    this.desktopContainer = desktopContainer;
    this.eventBus = eventBus;
    this.appManager = appManager;
    this.dragDrop = dragDrop;

    this.isEditMode = false;
    this.gridCols = 4;
    this.gridRows = 6;

    // UI 元素
    this.toolbar = document.getElementById('edit-toolbar');
    this.btnAdd = document.getElementById('edit-btn-add');
    this.btnAddPage = document.getElementById('edit-btn-add-page');
    this.btnRemovePage = document.getElementById('edit-btn-remove-page');
    this.btnReset = document.getElementById('edit-btn-reset');
    this.btnDone = document.getElementById('edit-btn-done');
    this.btnClose = document.getElementById('edit-btn-close');
    this.addPanel = document.getElementById('add-panel');
    this.addPanelMask = document.getElementById('add-panel-mask');
    this.addPanelGrid = document.getElementById('add-panel-grid');
    this.toastEl = document.getElementById('desktop-toast');
    this.dockContainer = document.getElementById('dock-container');

    // 状态数据
    this.layout = {};
    this.savedLayoutSnapshot = {};
    this.currentPageId = 'page-1';

    // Dock 状态（仅控制显示/隐藏）
    this.dockState = [];
    this.savedDockSnapshot = [];

    // 工具栏拖拽状态
    this.toolbarPosStorageKey = 'miniphone_edit_toolbar_pos';
    this.toolbarDragState = null;
    this.onToolbarDragMove = this.onToolbarDragMove.bind(this);
    this.onToolbarDragEnd = this.onToolbarDragEnd.bind(this);

    // [模块标注] 组件库注册模块：统一维护系统组件、新增仿手机组件与自定义组件
    this.widgetLibrary = [
      { id: 'clock', name: '时钟', icon: '🕰', selector: '.p1-clock-widget', colSpan: 4, rowSpan: 1, source: 'system' },
      { id: 'avatar', name: '头像框', icon: '🖼', selector: '.p1-avatar-widget', colSpan: 2, rowSpan: 2, source: 'system' },
      { id: 'news', name: '报纸', icon: '📰', selector: '.p1-news-widget', colSpan: 2, rowSpan: 2, source: 'system' },
      { id: 'ticket1', name: '船票', icon: '🎫', selector: '.p1-ticket-widget', colSpan: 4, rowSpan: 2, source: 'system' },
      { id: 'ticket2', name: '戏票', icon: '🎟', selector: '.p2-ticket-widget', colSpan: 4, rowSpan: 2, source: 'system' },
      { id: 'music', name: '音乐', icon: '♫', selector: '.widget-music-card', colSpan: 4, rowSpan: 2, source: 'builtin' },
      { id: 'calendar', name: '日历', icon: '📅', selector: '.widget-calendar-card', colSpan: 2, rowSpan: 2, source: 'builtin' },
      { id: 'polaroid', name: '拍立得', icon: '▣', selector: '.widget-polaroid-card', colSpan: 2, rowSpan: 2, source: 'builtin' },
      { id: 'profile', name: '个人名片', icon: '◉', selector: '.widget-profile-card', colSpan: 2, rowSpan: 2, source: 'builtin' },
      { id: 'todo', name: '待办事项', icon: '☑', selector: '.widget-todo-card', colSpan: 2, rowSpan: 2, source: 'builtin' },
      { id: 'memo', name: '快捷便签', icon: '✎', selector: '.widget-memo-card', colSpan: 2, rowSpan: 2, source: 'builtin' }
    ];

    this.bindEvents();
    this.loadLayout();
    this.loadDockState();
    this.initToolbarDrag();
    this.initManagedWidgetModal();
  }

  bindEvents() {
    this.eventBus.on('desktop:edit-mode', () => {
      this.enterEditMode();
    });

    this.eventBus.on('desktop:page-changed', ({ pageIndex }) => {
      this.currentPageId = `page-${pageIndex + 1}`;
    });

    if (this.btnDone) {
      this.btnDone.addEventListener('click', () => {
        this.saveLayout();
        this.exitEditMode();
        this.showToast('布局已保存');
      });
    }

    if (this.btnClose) {
      this.btnClose.addEventListener('click', () => {
        // 关闭时不保存：恢复到最近一次已保存（或初始化）的快照
        this.layout = this.cloneLayout(this.savedLayoutSnapshot);
        this.applyLayoutToDOM();
        this.dockState = Array.isArray(this.savedDockSnapshot) ? [...this.savedDockSnapshot] : [];
        this.applyDockStateToDOM();
        this.exitEditMode();
      });
    }

    if (this.btnReset) {
      this.btnReset.addEventListener('click', () => {
        if (confirm('确定要恢复默认布局吗？所有自定义位置将被重置。')) {
          // 重置仅作用于当前编辑态；只有点“完成”才会真正保存
          this.initDefaultLayout();
          this.applyLayoutToDOM();
          this.showToast('已恢复默认布局');
        }
      });
    }

    if (this.btnAdd) {
      this.btnAdd.addEventListener('click', () => this.showAddPanel());
    }

    if (this.btnAddPage) {
      this.btnAddPage.addEventListener('click', () => this.addDesktopPage());
    }

    if (this.btnRemovePage) {
      this.btnRemovePage.addEventListener('click', () => this.removeCurrentDesktopPage());
    }

    if (this.addPanelMask) {
      this.addPanelMask.addEventListener('click', () => this.hideAddPanel());
    }
  }

  cloneLayout(layout) {
    return JSON.parse(JSON.stringify(layout || {}));
  }

  enterEditMode() {
    if (this.isEditMode) return;
    this.isEditMode = true;
    document.body.classList.add('is-edit-mode');

    // [模块标注] 唯一性与重叠预清理模块：进入编辑模式先清理桌面/Dock重复与重叠脏数据
    this.sanitizeLayoutForUniquenessAndOverlap();

    // 应用当前 layout 到 DOM
    this.applyLayoutToDOM();
    this.applyDockStateToDOM();
    this.enableDockEditState();

    // 工具栏位置恢复（可拖动）
    this.restoreToolbarPosition();

    // 激活 DragDrop 的自由拖拽
    if (this.dragDrop) {
      this.dragDrop.enableFreeDrag(this);
    }

    // 给所有元素添加删除按钮
    this.attachDeleteButtons();
    this.attachDockDeleteButtons();
  }

  exitEditMode() {
    if (!this.isEditMode) return;
    this.isEditMode = false;
    document.body.classList.remove('is-edit-mode');
    this.hideAddPanel();
    this.disableDockEditState();
    this.cleanupToolbarDragListeners();

    if (this.dragDrop) {
      this.dragDrop.disableFreeDrag();
    }
  }

  showToast(msg) {
    if (!this.toastEl) return;
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    setTimeout(() => {
      this.toastEl.classList.remove('show');
    }, 2000);
  }

  // =========================
  // 工具栏拖动
  // =========================
  initToolbarDrag() {
    if (!this.toolbar || this.toolbar.dataset.dragBound === 'true') return;
    this.toolbar.dataset.dragBound = 'true';

    const onStart = (e) => {
      if (!this.isEditMode) return;
      if (e.target.closest('.edit-toolbar-btn')) return;
      this.onToolbarDragStart(e);
    };

    this.toolbar.addEventListener('mousedown', onStart);
    this.toolbar.addEventListener('touchstart', onStart, { passive: false });
  }

  onToolbarDragStart(e) {
    if (!this.toolbar) return;

    const isTouch = e.type === 'touchstart';
    const pointer = isTouch ? e.touches[0] : e;
    if (!pointer) return;
    if (!isTouch && e.button !== 0) return;

    e.preventDefault();

    const parent = this.toolbar.offsetParent || document.body;
    const parentRect = parent.getBoundingClientRect();
    const rect = this.toolbar.getBoundingClientRect();

    // 首次拖动时，从当前视觉位置切换到绝对 left/top 定位
    this.toolbar.classList.add('is-custom-position');
    this.toolbar.style.bottom = 'auto';
    this.toolbar.style.left = `${rect.left - parentRect.left}px`;
    this.toolbar.style.top = `${rect.top - parentRect.top}px`;

    this.toolbarDragState = {
      parentRect,
      startX: pointer.clientX,
      startY: pointer.clientY,
      startLeft: rect.left - parentRect.left,
      startTop: rect.top - parentRect.top
    };

    document.addEventListener('mousemove', this.onToolbarDragMove);
    document.addEventListener('mouseup', this.onToolbarDragEnd);
    document.addEventListener('touchmove', this.onToolbarDragMove, { passive: false });
    document.addEventListener('touchend', this.onToolbarDragEnd);
  }

  onToolbarDragMove(e) {
    if (!this.toolbar || !this.toolbarDragState) return;

    const pointer = e.type.startsWith('touch') ? e.touches[0] : e;
    if (!pointer) return;

    e.preventDefault();

    const dx = pointer.clientX - this.toolbarDragState.startX;
    const dy = pointer.clientY - this.toolbarDragState.startY;

    let left = this.toolbarDragState.startLeft + dx;
    let top = this.toolbarDragState.startTop + dy;

    const maxLeft = this.toolbarDragState.parentRect.width - this.toolbar.offsetWidth;
    const maxTop = this.toolbarDragState.parentRect.height - this.toolbar.offsetHeight;

    left = Math.max(0, Math.min(left, Math.max(0, maxLeft)));
    top = Math.max(0, Math.min(top, Math.max(0, maxTop)));

    this.toolbar.style.left = `${left}px`;
    this.toolbar.style.top = `${top}px`;
  }

  onToolbarDragEnd() {
    if (!this.toolbar || !this.toolbarDragState) return;
    this.persistToolbarPosition();
    this.toolbarDragState = null;
    this.cleanupToolbarDragListeners();
  }

  cleanupToolbarDragListeners() {
    document.removeEventListener('mousemove', this.onToolbarDragMove);
    document.removeEventListener('mouseup', this.onToolbarDragEnd);
    document.removeEventListener('touchmove', this.onToolbarDragMove);
    document.removeEventListener('touchend', this.onToolbarDragEnd);
  }

  persistToolbarPosition() {
    if (!this.toolbar || !this.toolbar.classList.contains('is-custom-position')) return;
    const left = parseFloat(this.toolbar.style.left || '');
    const top = parseFloat(this.toolbar.style.top || '');
    if (!Number.isFinite(left) || !Number.isFinite(top)) return;
    localStorage.setItem(this.toolbarPosStorageKey, JSON.stringify({ left, top }));
  }

  restoreToolbarPosition() {
    if (!this.toolbar) return;
    const saved = localStorage.getItem(this.toolbarPosStorageKey);
    if (!saved) return;

    try {
      const pos = JSON.parse(saved);
      if (!Number.isFinite(pos?.left) || !Number.isFinite(pos?.top)) return;

      this.toolbar.classList.add('is-custom-position');
      this.toolbar.style.bottom = 'auto';
      this.toolbar.style.left = `${pos.left}px`;
      this.toolbar.style.top = `${pos.top}px`;
    } catch (_) {
      // 忽略坏数据
    }
  }

  initManagedWidgetModal() {
    this.widgetModal = document.getElementById('widget-modal');
    this.widgetModalTitle = document.getElementById('widget-modal-title');
    this.widgetModalSave = document.getElementById('widget-modal-save');
    this.widgetModalClose = document.getElementById('widget-modal-close');
    this.widgetModalMask = this.widgetModal?.querySelector('.widget-modal__mask') || null;
    this.widgetModalSections = Array.from(document.querySelectorAll('.modal-section'));
    this.widgetModalState = null;

    if (this.widgetModalClose && !this.widgetModalClose.dataset.desktopEditBound) {
      this.widgetModalClose.dataset.desktopEditBound = 'true';
      this.widgetModalClose.addEventListener('click', () => {
        if (this.widgetModalState?.owner !== 'desktop-edit-mode') return;
        this.hideManagedWidgetModal();
      });
    }

    if (this.widgetModalMask && !this.widgetModalMask.dataset.desktopEditBound) {
      this.widgetModalMask.dataset.desktopEditBound = 'true';
      this.widgetModalMask.addEventListener('click', () => {
        if (this.widgetModalState?.owner !== 'desktop-edit-mode') return;
        this.hideManagedWidgetModal();
      });
    }

    if (this.widgetModalSave && !this.widgetModalSave.dataset.desktopEditBound) {
      this.widgetModalSave.dataset.desktopEditBound = 'true';
      this.widgetModalSave.addEventListener('click', async () => {
        if (this.widgetModalState?.owner !== 'desktop-edit-mode') return;
        const submit = this.widgetModalState?.onSave;
        if (typeof submit === 'function') {
          await submit();
        }
      });
    }
  }

  showManagedWidgetSection(mode) {
    if (!this.widgetModalSections?.length) return;
    this.widgetModalSections.forEach((sec) => sec.classList.remove('is-active'));
    const target = document.querySelector(`.modal-section[data-modal-section="${mode}"]`);
    if (target) target.classList.add('is-active');
  }

  openManagedWidgetModal({ mode, title, onOpen, onSave }) {
    if (!this.widgetModal || !mode) return;
    this.widgetModalState = {
      owner: 'desktop-edit-mode',
      mode,
      onSave
    };
    this.widgetModalTitle.textContent = title || '编辑组件';
    this.showManagedWidgetSection(mode);
    this.widgetModal.classList.remove('hidden');
    this.widgetModal.setAttribute('aria-hidden', 'false');
    if (typeof onOpen === 'function') onOpen();
  }

  hideManagedWidgetModal() {
    if (!this.widgetModal) return;
    this.widgetModal.classList.add('hidden');
    this.widgetModal.setAttribute('aria-hidden', 'true');
    this.widgetModalState = null;
  }

  setModalImagePreview(previewEl, placeholderEl, src) {
    if (!previewEl || !placeholderEl) return;
    if (src) {
      previewEl.src = src;
      previewEl.style.display = 'block';
      placeholderEl.style.display = 'none';
      return;
    }
    previewEl.removeAttribute('src');
    previewEl.style.display = 'none';
    placeholderEl.style.display = 'block';
  }

  async chooseResourceForManagedModal(label, accept, urlHint) {
    const useLocal = window.confirm(`点击“确定”从本地导入${label}，点击“取消”输入${urlHint || 'URL 链接'}`);
    if (useLocal) {
      return await this.pickLocalResource(accept);
    }

    const url = window.prompt(`请输入${label}的URL链接：`);
    if (!url || !url.trim()) return null;
    const cleanUrl = url.trim();
    return {
      src: cleanUrl,
      name: cleanUrl.split('/').pop() || label
    };
  }

  bindManagedModalAction(elementId, handler) {
    const el = document.getElementById(elementId);
    if (!el || el.dataset.desktopEditActionBound === 'true') return;
    el.dataset.desktopEditActionBound = 'true';
    el.addEventListener('click', async (event) => {
      if (this.widgetModalState?.owner !== 'desktop-edit-mode') return;
      event.preventDefault();
      await handler();
    });
  }

  getCustomWidgetStorageList() {
    try {
      const parsed = JSON.parse(localStorage.getItem('miniphone_custom_widgets') || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  saveCustomWidgetStorageList(list) {
    localStorage.setItem('miniphone_custom_widgets', JSON.stringify(Array.isArray(list) ? list : []));
  }

  updateCustomWidgetDefinition(nextConfig) {
    if (!nextConfig?.id) return;
    const list = this.getCustomWidgetStorageList();
    const nextList = list.map((item) => item.id === nextConfig.id ? { ...item, ...nextConfig } : item);
    this.saveCustomWidgetStorageList(nextList);
    this.eventBus?.emit?.('desktop:custom-widgets-changed', { widgets: nextList });
  }

  refreshCustomWidgetElement(widgetId) {
    if (!widgetId) return;
    const node = this.desktopContainer.querySelector(`.widget-custom-card[data-custom-widget-id="${widgetId}"]`);
    if (!node) return;
    const meta = this.getWidgetMeta(widgetId);
    if (!meta?.customConfig) return;

    node.innerHTML = `
      <div class="widget-surface widget-surface--custom">
        <div class="widget-renderer">
          <style>${meta.customConfig.css || ''}</style>
          ${meta.customConfig.html || ''}
        </div>
      </div>
    `;
    node.setAttribute('data-custom-widget-id', meta.customConfig.id);
    node.dataset.customWidgetSource = meta.customConfig.source || '';
    this.bindCustomWidgetInteractions(meta, node);
  }

  openBuiltinWidgetModal(id, el) {
    const current = this.loadBuiltinWidgetState(id);

    if (id === 'music') {
      const titleInput = document.getElementById('modal-music-title-input');
      const subtitleInput = document.getElementById('modal-music-subtitle-input');
      const audioNameInput = document.getElementById('modal-music-audio-name');
      const coverPreview = document.getElementById('modal-music-cover-preview');
      const coverPlaceholder = document.getElementById('modal-music-cover-placeholder');
      const draft = { ...current };

      this.openManagedWidgetModal({
        mode: 'music',
        title: '编辑音乐组件',
        onOpen: () => {
          if (titleInput) titleInput.value = current.title || '';
          if (subtitleInput) subtitleInput.value = current.subtitle || '';
          if (audioNameInput) audioNameInput.value = current.audioName || '';
          this.setModalImagePreview(coverPreview, coverPlaceholder, current.coverSrc || '');
        },
        onSave: async () => {
          const next = this.saveBuiltinWidgetState(id, {
            ...draft,
            title: titleInput?.value?.trim() || '旧梦留声机',
            subtitle: subtitleInput?.value?.trim() || '点击卡片编辑封面与音频'
          });
          this.renderBuiltinWidgetElement(id, el);
          this.bindBuiltinWidgetInteractions(id, el);
          this.showToast('音乐组件已更新');
          this.hideManagedWidgetModal();
          return next;
        }
      });

      this.bindManagedModalAction('modal-music-cover-upload', async () => {
        const media = await this.chooseResourceForManagedModal('音乐封面图片', 'image/*', '图片 URL');
        if (!media?.src) return;
        draft.coverSrc = media.src;
        this.setModalImagePreview(coverPreview, coverPlaceholder, draft.coverSrc);
      });

      this.bindManagedModalAction('modal-music-cover-delete', async () => {
        draft.coverSrc = '';
        this.setModalImagePreview(coverPreview, coverPlaceholder, '');
      });

      this.bindManagedModalAction('modal-music-audio-upload', async () => {
        const media = await this.chooseResourceForManagedModal('音频文件', '.mp3,.wav,audio/mpeg,audio/wav', '音频 URL');
        if (!media?.src) return;
        draft.audioSrc = media.src;
        draft.audioName = media.name || '已导入音频';
        draft.progress = 0;
        if (audioNameInput) audioNameInput.value = draft.audioName;
      });

      this.bindManagedModalAction('modal-music-audio-delete', async () => {
        draft.audioSrc = '';
        draft.audioName = '';
        draft.progress = 0;
        if (audioNameInput) audioNameInput.value = '';
      });

      return;
    }

    if (id === 'calendar') {
      const titleInput = document.getElementById('modal-calendar-title-input');
      const linesInput = document.getElementById('modal-calendar-lines-input');

      this.openManagedWidgetModal({
        mode: 'calendar',
        title: '编辑日历组件',
        onOpen: () => {
          if (titleInput) titleInput.value = current.title || '';
          if (linesInput) linesInput.value = Array.isArray(current.lines) ? current.lines.join('\n') : '';
        },
        onSave: async () => {
          this.saveBuiltinWidgetState(id, {
            title: titleInput?.value?.trim() || '今日行程',
            lines: (linesInput?.value || '').split('\n').map((line) => line.trim()).filter(Boolean)
          });
          this.renderBuiltinWidgetElement(id, el);
          this.bindBuiltinWidgetInteractions(id, el);
          this.showToast('日历组件已更新');
          this.hideManagedWidgetModal();
        }
      });
      return;
    }

    if (id === 'polaroid') {
      const titleInput = document.getElementById('modal-polaroid-title-input');
      const subtitleInput = document.getElementById('modal-polaroid-subtitle-input');
      const preview = document.getElementById('modal-polaroid-image-preview');
      const placeholder = document.getElementById('modal-polaroid-image-placeholder');
      const draft = { ...current };

      this.openManagedWidgetModal({
        mode: 'polaroid',
        title: '编辑拍立得组件',
        onOpen: () => {
          if (titleInput) titleInput.value = current.title || '';
          if (subtitleInput) subtitleInput.value = current.subtitle || '';
          this.setModalImagePreview(preview, placeholder, current.imageSrc || '');
        },
        onSave: async () => {
          this.saveBuiltinWidgetState(id, {
            ...draft,
            title: titleInput?.value?.trim() || '昨日底片',
            subtitle: subtitleInput?.value?.trim() || '把此刻留在桌面上'
          });
          this.renderBuiltinWidgetElement(id, el);
          this.bindBuiltinWidgetInteractions(id, el);
          this.showToast('拍立得组件已更新');
          this.hideManagedWidgetModal();
        }
      });

      this.bindManagedModalAction('modal-polaroid-image-upload', async () => {
        const media = await this.chooseResourceForManagedModal('拍立得图片', 'image/*', '图片 URL');
        if (!media?.src) return;
        draft.imageSrc = media.src;
        this.setModalImagePreview(preview, placeholder, draft.imageSrc);
      });

      this.bindManagedModalAction('modal-polaroid-image-delete', async () => {
        draft.imageSrc = '';
        this.setModalImagePreview(preview, placeholder, '');
      });

      return;
    }

    if (id === 'profile') {
      const nameInput = document.getElementById('modal-profile-name-input');
      const roleInput = document.getElementById('modal-profile-role-input');
      const tagsInput = document.getElementById('modal-profile-tags-input');

      this.openManagedWidgetModal({
        mode: 'profile',
        title: '编辑个人名片组件',
        onOpen: () => {
          if (nameInput) nameInput.value = current.name || '';
          if (roleInput) roleInput.value = current.role || '';
          if (tagsInput) tagsInput.value = Array.isArray(current.tags) ? current.tags.join('\n') : '';
        },
        onSave: async () => {
          this.saveBuiltinWidgetState(id, {
            name: nameInput?.value?.trim() || 'MiniPhone',
            role: roleInput?.value?.trim() || '系统默认组件',
            tags: (tagsInput?.value || '').split(/\n|，|,/).map((tag) => tag.trim()).filter(Boolean)
          });
          this.renderBuiltinWidgetElement(id, el);
          this.bindBuiltinWidgetInteractions(id, el);
          this.showToast('个人名片组件已更新');
          this.hideManagedWidgetModal();
        }
      });
      return;
    }

    if (id === 'todo') {
      const titleInput = document.getElementById('modal-todo-title-input');
      const itemsInput = document.getElementById('modal-todo-items-input');

      this.openManagedWidgetModal({
        mode: 'todo',
        title: '编辑待办事项组件',
        onOpen: () => {
          if (titleInput) titleInput.value = current.title || '';
          if (itemsInput) itemsInput.value = Array.isArray(current.items) ? current.items.join('\n') : '';
        },
        onSave: async () => {
          this.saveBuiltinWidgetState(id, {
            title: titleInput?.value?.trim() || '今日待办',
            items: (itemsInput?.value || '').split('\n').map((line) => line.trim()).filter(Boolean)
          });
          this.renderBuiltinWidgetElement(id, el);
          this.bindBuiltinWidgetInteractions(id, el);
          this.showToast('待办组件已更新');
          this.hideManagedWidgetModal();
        }
      });
      return;
    }

    if (id === 'memo') {
      const titleInput = document.getElementById('modal-memo-title-input');
      const linesInput = document.getElementById('modal-memo-lines-input');

      this.openManagedWidgetModal({
        mode: 'memo',
        title: '编辑快捷标签组件',
        onOpen: () => {
          if (titleInput) titleInput.value = current.title || '';
          if (linesInput) linesInput.value = Array.isArray(current.lines) ? current.lines.join('\n') : '';
        },
        onSave: async () => {
          this.saveBuiltinWidgetState(id, {
            title: titleInput?.value?.trim() || '灵感速记',
            lines: (linesInput?.value || '').split('\n').map((line) => line.trim()).filter(Boolean)
          });
          this.renderBuiltinWidgetElement(id, el);
          this.bindBuiltinWidgetInteractions(id, el);
          this.showToast('快捷标签组件已更新');
          this.hideManagedWidgetModal();
        }
      });
    }
  }

  bindCustomWidgetInteractions(meta, el) {
    if (!el || !meta?.customConfig) return;
    el.setAttribute('data-custom-widget-id', meta.customConfig.id);
    el.dataset.customWidgetSource = meta.customConfig.source || '';

    if (el.dataset.customWidgetInteractionBound === 'true') return;
    el.dataset.customWidgetInteractionBound = 'true';

    el.addEventListener('click', (event) => {
      if (this.isEditMode) return;
      event.preventDefault();
      event.stopPropagation();
      this.openCustomWidgetModal(meta.customConfig.id);
    });
  }

  openCustomWidgetModal(widgetId) {
    const widgets = this.getCustomWidgetStorageList();
    const current = widgets.find((item) => item.id === widgetId);
    if (!current) return;

    const nameInput = document.getElementById('modal-custom-name-input');
    const sourceInput = document.getElementById('modal-custom-source-input');

    this.openManagedWidgetModal({
      mode: 'custom',
      title: `编辑 ${current.name}`,
      onOpen: () => {
        if (nameInput) nameInput.value = current.name || '';
        if (sourceInput) sourceInput.value = current.source || JSON.stringify(current, null, 2);
      },
      onSave: async () => {
        try {
          const parsed = JSON.parse(sourceInput?.value || '{}');
          const next = {
            ...current,
            ...parsed,
            id: current.id,
            name: nameInput?.value?.trim() || parsed.name || current.name,
            source: sourceInput?.value || current.source || ''
          };

          if (!next.html || !next.css) {
            this.showToast('组件代码需包含 html 与 css');
            return;
          }

          this.updateCustomWidgetDefinition(next);
          this.refreshCustomWidgetElement(widgetId);
          this.showToast('自定义组件已更新');
          this.hideManagedWidgetModal();
        } catch (_) {
          this.showToast('组件代码不是有效 JSON');
        }
      }
    });
  }

  // =========================
  // Dock 编辑模式（排序/互换/显示）
  // =========================
  getDockItems() {
    return Array.from(document.querySelectorAll('#dock-container .app-icon[data-app-id]'));
  }

  dedupeDockState(list) {
    const result = [];
    const seen = new Set();
    (list || []).forEach((id) => {
      if (!id || seen.has(id)) return;
      seen.add(id);
      result.push(id);
    });
    return result;
  }

  // [模块标注] Dock去重清理模块：清理 Dock 内同 appId 的重复节点，避免交换/删除后命中错误实例
  sanitizeDockDomDuplicates() {
    const allItems = this.getDockItems();
    const map = new Map();
    const duplicates = [];

    allItems.forEach((item) => {
      const appId = item.getAttribute('data-app-id');
      if (!appId) return;

      if (!map.has(appId)) {
        map.set(appId, item);
        return;
      }

      const kept = map.get(appId);
      const shouldKeepCurrent = kept.style.display === 'none' && item.style.display !== 'none';

      if (shouldKeepCurrent) {
        duplicates.push(kept);
        map.set(appId, item);
      } else {
        duplicates.push(item);
      }
    });

    duplicates.forEach((item) => item.remove());
  }

  getDockIndexByAppId(appId) {
    return (this.dockState || []).indexOf(appId);
  }

  getDockTargetAppIdByPointer(pointer, excludeAppId = null) {
    if (!pointer) return null;
    const visible = this.getDockItems().filter((item) => item.style.display !== 'none');
    for (const item of visible) {
      const appId = item.getAttribute('data-app-id');
      if (!appId || appId === excludeAppId) continue;
      const rect = item.getBoundingClientRect();
      const inside = pointer.clientX >= rect.left
        && pointer.clientX <= rect.right
        && pointer.clientY >= rect.top
        && pointer.clientY <= rect.bottom;
      if (inside) return appId;
    }
    return null;
  }

  getDockInsertIndexByPointer(pointer, excludeAppId = null) {
    if (!pointer) return (this.dockState || []).length;

    const visible = this.getDockItems()
      .filter((item) => item.style.display !== 'none')
      .filter((item) => item.getAttribute('data-app-id') !== excludeAppId);

    if (visible.length === 0) return 0;

    for (let i = 0; i < visible.length; i++) {
      const rect = visible[i].getBoundingClientRect();
      const mid = rect.left + rect.width / 2;
      if (pointer.clientX < mid) return i;
    }

    return visible.length;
  }

  normalizeDockItemElement(itemEl) {
    if (!itemEl) return;
    itemEl.classList.add('dock-icon');
    itemEl.classList.remove('desktop-item', 'absolute-layout');
    itemEl.removeAttribute('data-item-id');
    itemEl.removeAttribute('data-item-type');
    itemEl.removeAttribute('data-col');
    itemEl.removeAttribute('data-row');
    itemEl.removeAttribute('data-colspan');
    itemEl.removeAttribute('data-rowspan');

    itemEl.style.position = '';
    itemEl.style.left = '';
    itemEl.style.top = '';
    itemEl.style.width = '';
    itemEl.style.height = '';
    itemEl.style.paddingTop = '';
    itemEl.style.justifyContent = '';
    itemEl.style.display = '';

    // [模块标注] Dock显示模块：Dock中的应用不显示名称
    const labelEl = itemEl.querySelector('.app-icon-label');
    if (labelEl) labelEl.style.display = 'none';
  }

  normalizeDesktopAppElement(itemEl, pageId, col, row) {
    if (!itemEl) return;
    const appId = itemEl.getAttribute('data-app-id');
    if (!appId) return;

    itemEl.classList.add('desktop-item', 'absolute-layout');
    itemEl.classList.remove('dock-icon');
    itemEl.setAttribute('data-item-id', `app-${appId}`);
    itemEl.setAttribute('data-item-type', 'app');
    itemEl.setAttribute('data-col', String(col));
    itemEl.setAttribute('data-row', String(row));
    itemEl.setAttribute('data-colspan', '1');
    itemEl.setAttribute('data-rowspan', '1');
    itemEl.style.display = '';

    // [模块标注] 桌面显示模块：桌面中的应用显示名称
    const labelEl = itemEl.querySelector('.app-icon-label');
    if (labelEl) labelEl.style.display = '';

    const pageEl = this.desktopContainer.querySelector(`.desktop-page[data-page-id="${pageId}"]`);
    if (pageEl && itemEl.parentElement !== pageEl) {
      pageEl.appendChild(itemEl);
    }
  }

  // [模块标注] 唯一性与重叠清理模块：桌面(全部页)+Dock 每个应用只允许存在一个，且桌面布局不允许重叠保存
  sanitizeLayoutForUniquenessAndOverlap() {
    this.dockState = this.dedupeDockState(this.dockState || []);

    const dockSet = new Set(this.dockState || []);
    const seenAppIds = new Set(dockSet);
    const nextLayout = {};

    const isOverlap = (a, b) => (
      a.col < b.col + b.colSpan
      && a.col + a.colSpan > b.col
      && a.row < b.row + b.rowSpan
      && a.row + a.rowSpan > b.row
    );

    Object.entries(this.layout || {}).forEach(([pageId, items]) => {
      const pageItems = [];

      (items || []).forEach((item) => {
        if (!item?.id) return;

        const normalized = {
          id: item.id,
          type: item.type || 'app',
          appId: item.appId || null,
          col: parseInt(item.col, 10) || 0,
          row: parseInt(item.row, 10) || 0,
          colSpan: parseInt(item.colSpan, 10) || 1,
          rowSpan: parseInt(item.rowSpan, 10) || 1
        };

        if (normalized.type === 'app' && normalized.appId) {
          if (seenAppIds.has(normalized.appId)) return;
        }

        const conflict = pageItems.some((existing) => isOverlap(normalized, existing));
        if (conflict) return;

        pageItems.push(normalized);

        if (normalized.type === 'app' && normalized.appId) {
          seenAppIds.add(normalized.appId);
        }
      });

      nextLayout[pageId] = pageItems;
    });

    this.layout = nextLayout;
  }

  // [模块标注] 桌面重复节点清理模块：隐藏桌面中重复应用节点，以及与 Dock 冲突的桌面应用节点
  sanitizeDesktopDomDuplicates() {
    const dockSet = new Set(this.dockState || []);
    const seenDesktopAppIds = new Set();
    const items = this.desktopContainer.querySelectorAll('.desktop-page .app-icon[data-app-id]');

    items.forEach((item) => {
      const appId = item.getAttribute('data-app-id');
      if (!appId) return;

      const duplicated = seenDesktopAppIds.has(appId);
      const inDock = dockSet.has(appId);

      if (duplicated || inDock) {
        item.style.display = 'none';
        return;
      }

      seenDesktopAppIds.add(appId);
    });
  }

  loadDockState() {
    const saved = localStorage.getItem('miniphone_dock_layout');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        this.dockState = this.dedupeDockState(Array.isArray(parsed) ? parsed : []);
      } catch (e) {
        Logger.error('解析 Dock 布局失败', e);
        this.initDefaultDockState();
      }
    } else {
      this.initDefaultDockState();
    }

    this.savedDockSnapshot = Array.isArray(this.dockState) ? [...this.dockState] : [];
    this.applyDockStateToDOM();
  }

  initDefaultDockState() {
    this.dockState = this.dedupeDockState(
      this.getDockItems()
        .map((item) => item.getAttribute('data-app-id'))
        .filter(Boolean)
    );
  }

  updateDockDataFromDOM() {
    this.dockState = this.dedupeDockState(
      this.getDockItems()
        .filter((item) => item.style.display !== 'none')
        .map((item) => item.getAttribute('data-app-id'))
        .filter(Boolean)
    );
  }

  applyDockStateToDOM() {
    if (!this.dockContainer) return;

    this.sanitizeDockDomDuplicates();
    this.dockState = this.dedupeDockState(this.dockState || []);
    const allItems = this.getDockItems();
    const map = new Map();
    allItems.forEach((item) => {
      const appId = item.getAttribute('data-app-id');
      if (!appId || map.has(appId)) return;
      map.set(appId, item);
    });

    const orderedVisible = [];
    this.dockState.forEach((appId) => {
      const item = map.get(appId);
      if (!item) return;
      this.normalizeDockItemElement(item);
      orderedVisible.push(item);
    });

    orderedVisible.forEach((item) => this.dockContainer.appendChild(item));
    allItems.forEach((item) => {
      if (!orderedVisible.includes(item)) this.dockContainer.appendChild(item);
    });

    const dockSet = new Set(this.dockState || []);
    const visibleAppIds = new Set();
    this.getDockItems().forEach((item) => {
      const appId = item.getAttribute('data-app-id');

      // [模块标注] Dock唯一实例清理模块：同一 appId 在 Dock 中只允许显示一个
      const shouldShow = !!appId && dockSet.has(appId) && !visibleAppIds.has(appId);
      item.style.display = shouldShow ? '' : 'none';

      if (shouldShow) {
        visibleAppIds.add(appId);
        this.ensureDockDeleteButton(item);
      }
    });
  }

  saveDockState() {
    this.dockState = this.dedupeDockState(this.dockState || []);
    localStorage.setItem('miniphone_dock_layout', JSON.stringify(this.dockState));
    this.savedDockSnapshot = [...this.dockState];
  }

  ensureDockDeleteButton(item) {
    const old = item.querySelector('.edit-delete-btn');
    if (old) old.remove();

    const btn = document.createElement('div');
    btn.className = 'edit-delete-btn';
    btn.innerHTML = '×';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.removeDockItem(item);
    });
    item.appendChild(btn);
  }

  attachDockDeleteButtons() {
    this.getDockItems().forEach((item) => {
      if (item.style.display === 'none') return;
      this.ensureDockDeleteButton(item);
    });
  }

  removeDockItem(itemEl) {
    if (!itemEl) return;
    const appId = itemEl.getAttribute('data-app-id');
    if (!appId) return;

    // [模块标注] 移除同步修复模块：显示“已移除”时同步清理 Dock 状态和桌面残留
    this.dockState = (this.dockState || []).filter((id) => id !== appId);
    this.removeAppFromLayout(appId);

    const desktopItems = this.desktopContainer.querySelectorAll(`.desktop-page .desktop-item[data-app-id="${appId}"]`);
    desktopItems.forEach((item) => {
      item.style.display = 'none';
    });

    this.applyDockStateToDOM();
    this.updateLayoutDataFromDOM();
    this.positionItemsDOM();
    this.showToast('已移除');
  }

  reorderDockItemByPointer(appId, pointer) {
    if (!appId) return false;
    const oldIndex = this.getDockIndexByAppId(appId);
    if (oldIndex < 0) return false;

    const next = (this.dockState || []).filter((id) => id !== appId);
    const insertIndex = this.getDockInsertIndexByPointer(pointer, appId);
    const safeIndex = Math.max(0, Math.min(insertIndex, next.length));
    next.splice(safeIndex, 0, appId);

    this.dockState = this.dedupeDockState(next);
    this.applyDockStateToDOM();
    return true;
  }

  removeAppFromLayout(appId) {
    const itemId = `app-${appId}`;
    let removed = null;

    Object.entries(this.layout).forEach(([pageId, items]) => {
      const arr = items || [];
      const idx = arr.findIndex((i) => i.id === itemId);
      if (idx < 0) return;

      const hit = arr[idx];
      removed = {
        pageId,
        col: hit.col,
        row: hit.row
      };
      arr.splice(idx, 1);
      this.layout[pageId] = arr;
    });

    return removed;
  }

  upsertAppInLayout(pageId, appId, col, row) {
    if (!pageId || !appId) return;
    if (!this.layout[pageId]) this.layout[pageId] = [];

    const itemId = `app-${appId}`;
    const pageItems = this.layout[pageId];
    const found = pageItems.find((i) => i.id === itemId);

    if (found) {
      found.type = 'app';
      found.appId = appId;
      found.col = col;
      found.row = row;
      found.colSpan = 1;
      found.rowSpan = 1;
      return;
    }

    pageItems.push({
      id: itemId,
      type: 'app',
      appId,
      col,
      row,
      colSpan: 1,
      rowSpan: 1
    });
  }

  getDesktopAppItemAt(pageId, col, row, excludeAppId = null) {
    const items = this.layout[pageId] || [];
    return items.find((item) => {
      if (item.type !== 'app' || !item.appId) return false;
      if (excludeAppId && item.appId === excludeAppId) return false;
      return item.col === col && item.row === row;
    }) || null;
  }

  getDesktopPageByPointer(pointer) {
    if (!pointer) return null;
    const pages = Array.from(this.desktopContainer.querySelectorAll('.desktop-page'));
    for (const page of pages) {
      const rect = page.getBoundingClientRect();
      const inside = pointer.clientX >= rect.left
        && pointer.clientX <= rect.right
        && pointer.clientY >= rect.top
        && pointer.clientY <= rect.bottom;
      if (inside) return page;
    }
    return null;
  }

  pointerToGrid(pageEl, pointer, colSpan = 1, rowSpan = 1) {
    if (!pageEl || !pointer) return null;

    const marginX = 20;
    const marginY = 15;
    const gridH = 90;
    const pageRect = pageEl.getBoundingClientRect();
    const gridW = (pageRect.width - marginX * 2) / this.gridCols;

    let targetCol = Math.floor((pointer.clientX - pageRect.left - marginX) / gridW);
    let targetRow = Math.floor((pointer.clientY - pageRect.top - marginY) / gridH);

    targetCol = Math.max(0, Math.min(targetCol, this.gridCols - colSpan));
    targetRow = Math.max(0, Math.min(targetRow, this.gridRows - rowSpan));

    return { col: targetCol, row: targetRow };
  }

  handleDesktopDropToDock({ appId, fromPageId, fromCol, fromRow, pointer }) {
    if (!appId) return false;

    const draggedDesktopEl = this.desktopContainer.querySelector(
      `.desktop-page .desktop-item[data-app-id="${appId}"]`
    );
    if (!draggedDesktopEl) return false;

    const targetDockAppId = this.getDockTargetAppIdByPointer(pointer, appId);
    const sourcePos = this.removeAppFromLayout(appId) || {
      pageId: fromPageId || this.currentPageId,
      col: Number.isFinite(fromCol) ? fromCol : 0,
      row: Number.isFinite(fromRow) ? fromRow : 0
    };

    draggedDesktopEl.style.display = '';
    this.normalizeDockItemElement(draggedDesktopEl);

    // [模块标注] 拖入Dock唯一性保护模块：拖入前先清理 Dock 内同 appId 的重复节点
    if (this.dockContainer) {
      const sameAppDockItems = this.getDockItems().filter((item) => (
        item.getAttribute('data-app-id') === appId && item !== draggedDesktopEl
      ));
      sameAppDockItems.forEach((item) => {
        item.style.display = 'none';
      });
    }

    if (this.dockContainer && draggedDesktopEl.parentElement !== this.dockContainer) {
      this.dockContainer.appendChild(draggedDesktopEl);
    }
    this.ensureDockDeleteButton(draggedDesktopEl);

    let nextDock = (this.dockState || []).filter((id) => id !== appId);

    if (targetDockAppId) {
      const targetIndex = nextDock.indexOf(targetDockAppId);
      const safeDockIndex = targetIndex >= 0 ? targetIndex : nextDock.length;
      nextDock.splice(safeDockIndex, 0, appId);

      this.sanitizeDockDomDuplicates();
      const targetDockEl = this.dockContainer?.querySelector(`.app-icon[data-app-id="${targetDockAppId}"]`);
      if (targetDockEl) {
        this.dockState = this.dedupeDockState(nextDock);
        this.dockState = this.dockState.filter((id) => id !== targetDockAppId);

        this.normalizeDesktopAppElement(targetDockEl, sourcePos.pageId, sourcePos.col, sourcePos.row);
        this.ensureDeleteButton(targetDockEl);
        this.upsertAppInLayout(sourcePos.pageId, targetDockAppId, sourcePos.col, sourcePos.row);

        if (this.dragDrop) this.dragDrop.makeElementDraggable(targetDockEl, this);
      }
    } else {
      const insertIndex = this.getDockInsertIndexByPointer(pointer, appId);
      const safeIndex = Math.max(0, Math.min(insertIndex, nextDock.length));
      nextDock.splice(safeIndex, 0, appId);
    }

    this.dockState = this.dedupeDockState(nextDock);
    this.applyDockStateToDOM();
    this.positionItemsDOM();

    if (this.dragDrop) this.dragDrop.makeElementDraggable(draggedDesktopEl, this);
    return true;
  }

  handleDockDropToDesktop({ appId, sourceDockIndex, pointer }) {
    if (!appId || !pointer) return false;

    const pageEl = this.getDesktopPageByPointer(pointer);
    if (!pageEl) return false;
    const pageId = pageEl.getAttribute('data-page-id');
    if (!pageId) return false;

    const cell = this.pointerToGrid(pageEl, pointer, 1, 1);
    if (!cell) return false;

    const dragDockEl = this.dockContainer?.querySelector(`.app-icon[data-app-id="${appId}"]`);
    if (!dragDockEl) return false;

    const targetDesktop = this.getDesktopAppItemAt(pageId, cell.col, cell.row, appId);

    let nextDock = (this.dockState || []).filter((id) => id !== appId);

    if (targetDesktop?.appId) {
      const targetAppId = targetDesktop.appId;
      this.removeAppFromLayout(targetAppId);

      const insertIndex = Number.isFinite(sourceDockIndex) ? sourceDockIndex : nextDock.length;
      const safeIndex = Math.max(0, Math.min(insertIndex, nextDock.length));
      nextDock.splice(safeIndex, 0, targetAppId);

      const targetDesktopEl = this.desktopContainer.querySelector(
        `.desktop-page .desktop-item[data-app-id="${targetAppId}"]`
      );
      if (targetDesktopEl) {
        this.normalizeDockItemElement(targetDesktopEl);
        if (this.dockContainer && targetDesktopEl.parentElement !== this.dockContainer) {
          this.dockContainer.appendChild(targetDesktopEl);
        }
        this.ensureDockDeleteButton(targetDesktopEl);
        if (this.dragDrop) this.dragDrop.makeElementDraggable(targetDesktopEl, this);
      }
    }

    this.normalizeDesktopAppElement(dragDockEl, pageId, cell.col, cell.row);
    this.ensureDeleteButton(dragDockEl);
    this.upsertAppInLayout(pageId, appId, cell.col, cell.row);

    this.dockState = this.dedupeDockState(nextDock);
    this.applyDockStateToDOM();
    this.positionItemsDOM();

    if (this.dragDrop) this.dragDrop.makeElementDraggable(dragDockEl, this);
    return true;
  }

  enableDockEditState() {
    if (!this.dockContainer) return;
    this.dockContainer.classList.add('is-edit-mode');
  }

  disableDockEditState() {
    if (!this.dockContainer) return;
    this.dockContainer.classList.remove('is-edit-mode');
  }

  getActiveDockAppIdSet() {
    const set = new Set(this.dockState || []);
    return set;
  }

  // =========================
  // 桌面项删除按钮
  // =========================
  attachDeleteButtons() {
    const items = this.desktopContainer.querySelectorAll('.desktop-item');
    items.forEach((item) => this.ensureDeleteButton(item));
  }

  ensureDeleteButton(item) {
    const old = item.querySelector('.edit-delete-btn');
    if (old) old.remove();

    const btn = document.createElement('div');
    btn.className = 'edit-delete-btn';
    btn.innerHTML = '×';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.removeItem(item);
    });
    item.appendChild(btn);
  }

  removeItem(itemEl) {
    const pageEl = itemEl.closest('.desktop-page');
    if (!pageEl) return;

    const itemType = itemEl.getAttribute('data-item-type');
    const appId = itemEl.getAttribute('data-app-id');
    const itemId = itemEl.getAttribute('data-item-id');

    // [模块标注] 移除同步修复模块：显示“已移除”时同步清理桌面重复残留，避免看见已移除但仍保留
    if (itemType === 'app' && appId) {
      this.removeAppFromLayout(appId);
      const sameAppItems = this.desktopContainer.querySelectorAll(`.desktop-page .desktop-item[data-app-id="${appId}"]`);
      sameAppItems.forEach((item) => {
        item.style.display = 'none';
      });
    } else if (itemId) {
      itemEl.style.display = 'none';
    }

    this.updateLayoutDataFromDOM();
    this.positionItemsDOM();
    this.showToast('已移除');
  }

  isItemInLayout(itemId) {
    return Object.values(this.layout).some((items) =>
      (items || []).some((item) => item.id === itemId)
    );
  }

  getCustomWidgetLibrary() {
    try {
      const parsed = JSON.parse(localStorage.getItem('miniphone_custom_widgets') || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  getMergedWidgetLibrary() {
    const customWidgets = this.getCustomWidgetLibrary().map((widget) => ({
      id: widget.id,
      name: widget.name,
      icon: widget.iconSvg || '✦',
      selector: `.widget-custom-card[data-custom-widget-id="${widget.id}"]`,
      colSpan: Math.max(1, Math.min(4, Number(widget.width) || 2)),
      rowSpan: Math.max(1, Math.min(3, Number(widget.height) || 2)),
      source: 'custom',
      customConfig: widget
    }));

    return [...this.widgetLibrary, ...customWidgets];
  }

  getWidgetMeta(id) {
    return this.getMergedWidgetLibrary().find((w) => w.id === id) || null;
  }

  escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  getBuiltinWidgetStorageKey(id) {
    return `miniphone_builtin_widget_${id}`;
  }

  getBuiltinWidgetDefaultState(id) {
    if (id === 'music') {
      return {
        title: '旧梦留声机',
        subtitle: '点击卡片编辑封面与音频',
        coverSrc: '',
        audioSrc: '',
        audioName: '',
        progress: 0
      };
    }

    if (id === 'calendar') {
      return {
        title: '今日行程',
        lines: ['09:30 编辑部会议', '14:00 江边取景']
      };
    }

    if (id === 'polaroid') {
      return {
        title: '昨日底片',
        subtitle: '把此刻留在桌面上',
        imageSrc: ''
      };
    }

    if (id === 'profile') {
      return {
        name: 'MiniPhone',
        role: '系统默认组件',
        tags: ['桌面', '名片', '系统']
      };
    }

    if (id === 'todo') {
      return {
        title: '今日待办',
        items: ['整理桌面组件库', '导入自定义组件模板', '完成图标统一']
      };
    }

    if (id === 'memo') {
      return {
        title: '灵感速记',
        lines: ['组件预览显示完整样式', '支持桌面单独点击编辑', '按钮图标统一为 IconPark']
      };
    }

    return {};
  }

  loadBuiltinWidgetState(id) {
    const defaults = this.getBuiltinWidgetDefaultState(id);
    try {
      const parsed = JSON.parse(localStorage.getItem(this.getBuiltinWidgetStorageKey(id)) || '{}');
      return { ...defaults, ...(parsed || {}) };
    } catch (_) {
      return { ...defaults };
    }
  }

  saveBuiltinWidgetState(id, nextState) {
    const merged = { ...this.getBuiltinWidgetDefaultState(id), ...(nextState || {}) };
    localStorage.setItem(this.getBuiltinWidgetStorageKey(id), JSON.stringify(merged));
    return merged;
  }

  getWidgetIconSvg(type) {
    if (type === 'play') {
      return `<svg viewBox="0 0 48 48" width="18" height="18" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18 12L36 24L18 36V12Z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`;
    }

    if (type === 'pause') {
      return `<svg viewBox="0 0 48 48" width="18" height="18" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M16 10V38" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M32 10V38" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>`;
    }

    return `<svg viewBox="0 0 48 48" width="18" height="18" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="24" cy="24" r="16" stroke="currentColor" stroke-width="3"/></svg>`;
  }

  renderBuiltinWidgetContent(id, state) {
    const now = new Date();
    const month = now.getMonth() + 1;
    const date = now.getDate();

    if (id === 'music') {
      return `
        <div class="widget-surface widget-surface--music">
          <div class="widget-music-cover">
            ${state.coverSrc
              ? `<img class="widget-music-cover-img" src="${this.escapeHtml(state.coverSrc)}" alt="${this.escapeHtml(state.title)}" />`
              : `<span class="widget-music-cover-placeholder">♫</span>`}
          </div>
          <div class="widget-music-body">
            <div class="widget-title-row">
              <span class="widget-eyebrow">SYSTEM MUSIC</span>
              <button class="widget-music-play-btn" type="button" aria-label="播放或暂停音乐">${this.getWidgetIconSvg('play')}</button>
            </div>
            <div class="widget-title-main">${this.escapeHtml(state.title)}</div>
            <div class="widget-subtitle">${this.escapeHtml(state.subtitle)}</div>
            <div class="widget-progress"><span style="width:${Number(state.progress) || 0}%;"></span></div>
            <div class="widget-inline-meta">
              <span>${this.escapeHtml(state.audioName || '未导入音频')}</span>
              <span>${state.audioSrc ? '点击播放' : '点击编辑'}</span>
            </div>
            <audio class="widget-music-audio" preload="metadata" src="${this.escapeHtml(state.audioSrc || '')}"></audio>
          </div>
        </div>
      `;
    }

    if (id === 'calendar') {
      const lines = Array.isArray(state.lines) ? state.lines.slice(0, 3) : [];
      return `
        <div class="widget-surface widget-surface--calendar">
          <div class="widget-calendar-top">
            <span>${month}月</span>
            <strong>${date}</strong>
          </div>
          <div class="widget-calendar-body">
            <div class="widget-title-main">${this.escapeHtml(state.title)}</div>
            ${(lines.length ? lines : ['暂无安排']).map((line) => {
              const text = this.escapeHtml(line);
              const parts = text.split(/\s+/);
              const time = parts.shift() || '—';
              const content = parts.join(' ') || text;
              return `
                <div class="widget-calendar-event">
                  <span>${time}</span>
                  <span>${content}</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    if (id === 'polaroid') {
      return `
        <div class="widget-surface widget-surface--polaroid">
          <div class="widget-polaroid-photo">
            ${state.imageSrc
              ? `<img class="widget-polaroid-img" src="${this.escapeHtml(state.imageSrc)}" alt="${this.escapeHtml(state.title)}" />`
              : `<span class="widget-polaroid-placeholder">✦</span>`}
          </div>
          <div class="widget-polaroid-caption">
            <div class="widget-title-main">${this.escapeHtml(state.title)}</div>
            <div class="widget-subtitle">${this.escapeHtml(state.subtitle)}</div>
          </div>
        </div>
      `;
    }

    if (id === 'profile') {
      const tags = Array.isArray(state.tags) ? state.tags.slice(0, 4) : [];
      const avatarText = this.escapeHtml((state.name || 'M').slice(0, 1).toUpperCase());
      return `
        <div class="widget-surface widget-surface--profile">
          <div class="widget-profile-avatar">${avatarText}</div>
          <div class="widget-title-main">${this.escapeHtml(state.name)}</div>
          <div class="widget-subtitle">${this.escapeHtml(state.role)}</div>
          <div class="widget-profile-tags">
            ${tags.map((tag) => `<span>${this.escapeHtml(tag)}</span>`).join('')}
          </div>
        </div>
      `;
    }

    if (id === 'todo') {
      const items = Array.isArray(state.items) ? state.items.slice(0, 4) : [];
      return `
        <div class="widget-surface widget-surface--todo">
          <div class="widget-title-row">
            <span class="widget-title-main">${this.escapeHtml(state.title)}</span>
            <span class="widget-counter">${items.length}</span>
          </div>
          ${(items.length ? items : ['暂无待办']).map((line) => {
            const isDone = /^\s*(\[x\]|✔|√)/i.test(line);
            const text = line.replace(/^\s*(\[x\]|\[ \]|✔|√|-)\s*/i, '');
            return `<div class="widget-todo-item ${isDone ? 'is-done' : ''}"><i></i><span>${this.escapeHtml(text || '未命名事项')}</span></div>`;
          }).join('')}
        </div>
      `;
    }

    if (id === 'memo') {
      const lines = Array.isArray(state.lines) ? state.lines.slice(0, 4) : [];
      return `
        <div class="widget-surface widget-surface--memo">
          <div class="widget-eyebrow">QUICK NOTE</div>
          <div class="widget-title-main">${this.escapeHtml(state.title)}</div>
          <div class="widget-memo-lines">
            ${(lines.length ? lines : ['暂无内容']).map((line) => `<span>• ${this.escapeHtml(line)}</span>`).join('')}
          </div>
        </div>
      `;
    }

    return '';
  }

  bindMusicAudioProgress(el) {
    const audio = el?.querySelector('.widget-music-audio');
    const progress = el?.querySelector('.widget-progress span');
    const playBtn = el?.querySelector('.widget-music-play-btn');
    if (!audio || !progress || audio.dataset.bound === 'true') return;

    const update = () => {
      const value = audio.duration ? Math.min(100, (audio.currentTime / audio.duration) * 100) : 0;
      progress.style.width = `${value}%`;
    };

    const resetBtn = () => {
      if (playBtn) playBtn.innerHTML = this.getWidgetIconSvg('play');
    };

    audio.dataset.bound = 'true';
    audio.addEventListener('loadedmetadata', update);
    audio.addEventListener('timeupdate', update);
    audio.addEventListener('pause', resetBtn);
    audio.addEventListener('ended', () => {
      update();
      resetBtn();
    });
  }

  bindBuiltinWidgetInteractions(id, el) {
    if (!el) return;
    el.setAttribute('data-builtin-widget-id', id);

    if (el.dataset.widgetInteractionBound !== 'true') {
      el.dataset.widgetInteractionBound = 'true';
      el.addEventListener('click', (event) => {
        if (this.isEditMode) return;

        const widgetId = el.getAttribute('data-builtin-widget-id');
        if (!widgetId) return;

        if (widgetId === 'music' && event.target.closest('.widget-music-play-btn')) {
          event.preventDefault();
          event.stopPropagation();
          this.toggleMusicPlayback(el);
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        this.openBuiltinWidgetModal(widgetId, el);
      });
    }

    if (id === 'music') {
      this.bindMusicAudioProgress(el);
    }
  }

  renderBuiltinWidgetElement(id, el) {
    if (!el) return null;

    el.className = 'desktop-widget-card desktop-item absolute-layout';
    if (id === 'music') el.classList.add('widget-music-card');
    if (id === 'calendar') el.classList.add('widget-calendar-card');
    if (id === 'polaroid') el.classList.add('widget-polaroid-card');
    if (id === 'profile') el.classList.add('widget-profile-card');
    if (id === 'todo') el.classList.add('widget-todo-card');
    if (id === 'memo') el.classList.add('widget-memo-card');

    el.innerHTML = this.renderBuiltinWidgetContent(id, this.loadBuiltinWidgetState(id));
    this.bindBuiltinWidgetInteractions(id, el);
    return el;
  }

  async pickLocalResource(accept) {
    return await new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept;
      input.style.display = 'none';
      document.body.appendChild(input);

      input.addEventListener('change', () => {
        const file = input.files?.[0];
        if (!file) {
          input.remove();
          resolve(null);
          return;
        }

        const reader = new FileReader();
        reader.onload = () => {
          input.remove();
          resolve({
            src: String(reader.result || ''),
            name: file.name || ''
          });
        };
        reader.onerror = () => {
          input.remove();
          resolve(null);
        };
        reader.readAsDataURL(file);
      }, { once: true });

      input.click();
    });
  }

  async pickResourceFromLocalOrUrl(label, accept, urlHint) {
    const useLocal = confirm(`点击“确定”从本地导入${label}，点击“取消”输入${urlHint || 'URL 链接'}`);
    if (useLocal) {
      return await this.pickLocalResource(accept);
    }

    const url = prompt(`请输入${label}的URL链接：`);
    if (!url || !url.trim()) return null;

    const cleanUrl = url.trim();
    return {
      src: cleanUrl,
      name: cleanUrl.split('/').pop() || label
    };
  }

  toggleMusicPlayback(el) {
    const audio = el?.querySelector('.widget-music-audio');
    const btn = el?.querySelector('.widget-music-play-btn');
    if (!audio || !btn) return;

    if (!audio.getAttribute('src')) {
      this.showToast('请先导入 mp3 / wav 音频');
      return;
    }

    document.querySelectorAll('.widget-music-audio').forEach((node) => {
      if (node !== audio) node.pause();
    });
    document.querySelectorAll('.widget-music-play-btn').forEach((node) => {
      if (node !== btn) node.innerHTML = this.getWidgetIconSvg('play');
    });

    if (audio.paused) {
      audio.play().then(() => {
        btn.innerHTML = this.getWidgetIconSvg('pause');
      }).catch(() => {
        this.showToast('音频播放失败');
      });
    } else {
      audio.pause();
      btn.innerHTML = this.getWidgetIconSvg('play');
    }
  }

  createBuiltinWidgetElement(id) {
    const el = document.createElement('div');
    return this.renderBuiltinWidgetElement(id, el);
  }

  createCustomWidgetElement(meta) {
    const config = meta?.customConfig;
    if (!config) return null;

    const el = document.createElement('div');
    el.className = 'desktop-widget-card desktop-item absolute-layout widget-custom-card';
    el.setAttribute('data-custom-widget-id', config.id);
    el.dataset.customWidgetSource = config.source || '';
    el.innerHTML = `
      <div class="widget-surface widget-surface--custom">
        <div class="widget-renderer">
          <style>${config.css || ''}</style>
          ${config.html || ''}
        </div>
      </div>
    `;
    this.bindCustomWidgetInteractions(meta, el);
    return el;
  }

  getOrCreateWidgetElement(meta) {
    if (!meta) return null;

    let el = this.desktopContainer.querySelector(`.desktop-item[data-item-id="${meta.id}"]`);
    if (el) return el;

    if (meta.selector) {
      el = this.desktopContainer.querySelector(meta.selector);
      if (el) return el;
    }

    if (meta.source === 'builtin') {
      return this.createBuiltinWidgetElement(meta.id);
    }

    if (meta.source === 'custom') {
      return this.createCustomWidgetElement(meta);
    }

    return null;
  }

  getWidgetElementById(id) {
    const meta = this.getWidgetMeta(id);
    if (!meta) return null;
    return this.getOrCreateWidgetElement(meta);
  }

  sanitizeWidgetPreviewNode(root) {
    if (!root) return;
    const nodes = [root, ...root.querySelectorAll('*')];

    nodes.forEach((node) => {
      if (node.classList?.contains('edit-delete-btn')) {
        node.remove();
        return;
      }

      node.removeAttribute?.('id');
      node.removeAttribute?.('title');
      node.removeAttribute?.('aria-label');
      node.removeAttribute?.('contenteditable');
      node.removeAttribute?.('data-open-app');
      node.classList?.remove('desktop-item', 'absolute-layout', 'is-dragging');

      // 避免预览继承编辑态绝对定位
      if (node === root) {
        node.style.position = 'relative';
        node.style.left = '';
        node.style.top = '';
        node.style.width = '';
        node.style.height = '';
        if (node.style.display === 'none') node.style.display = '';
      }
    });
  }

  buildWidgetPreviewHtml(widget) {
    const source = this.getWidgetElementById(widget.id);
    const size = `${widget.colSpan || 1}x${widget.rowSpan || 1}`;
    if (!source) {
      return `<div class="add-panel-widget-preview" data-widget-size="${size}"><div class="add-panel-widget-preview-empty">暂无预览</div></div>`;
    }

    const clone = source.cloneNode(true);
    this.sanitizeWidgetPreviewNode(clone);
    return `
      <div class="add-panel-widget-preview" data-widget-size="${size}">
        <div class="add-panel-widget-preview-scale">${clone.outerHTML}</div>
      </div>
    `;
  }

  showAddPanel() {
    if (!this.addPanel || !this.addPanelGrid) return;

    this.updateLayoutDataFromDOM();
    this.updateDockDataFromDOM();

    const dockAppSet = this.getActiveDockAppIdSet();

    // 可添加应用（去重：桌面 + Dock）
    const apps = this.appManager.registry.getAll();
    const availableApps = apps.filter((app) => {
      if (dockAppSet.has(app.id)) return false;
      return !this.isItemInLayout(`app-${app.id}`);
    });

    // 可添加组件（去重）
    const availableWidgets = this.getMergedWidgetLibrary().filter((w) => !this.isItemInLayout(w.id));

    const appHtml = availableApps.length
      ? availableApps.map((app) => `
        <div class="add-panel-item add-panel-item--app" data-add-type="app" data-add-id="${app.id}">
          <div class="app-icon-btn">
            <span class="app-icon-glyph">${app.icon || ''}</span>
          </div>
          <span class="add-panel-item-label">${app.name}</span>
        </div>
      `).join('')
      : `<div class="add-panel-empty">无可添加应用</div>`;

    const widgetHtml = availableWidgets.length
      ? availableWidgets.map((widget) => `
        <div class="add-panel-item add-panel-item--widget" data-add-type="widget" data-add-id="${widget.id}">
          ${this.buildWidgetPreviewHtml(widget)}
          <span class="add-panel-item-label">${widget.name}</span>
        </div>
      `).join('')
      : `<div class="add-panel-empty">无可添加组件</div>`;

    this.addPanelGrid.innerHTML = `
      <div class="add-panel-section">
        <div class="add-panel-section-title">应用</div>
        <div class="add-panel-row add-panel-row--apps">${appHtml}</div>
      </div>
      <div class="add-panel-section">
        <div class="add-panel-section-title">组件</div>
        <div class="add-panel-row add-panel-row--widgets">${widgetHtml}</div>
      </div>
    `;

    // 绑定添加事件
    this.addPanelGrid.querySelectorAll('.add-panel-item').forEach((item) => {
      item.addEventListener('click', () => {
        const type = item.getAttribute('data-add-type');
        const id = item.getAttribute('data-add-id');
        const added = this.addItemToDesktop(type, id);
        if (added) this.hideAddPanel();
      });
    });

    this.addPanel.classList.add('is-visible');
    this.addPanelMask.classList.add('is-visible');
  }

  hideAddPanel() {
    if (this.addPanel) this.addPanel.classList.remove('is-visible');
    if (this.addPanelMask) this.addPanelMask.classList.remove('is-visible');
  }

  addDesktopPage() {
    const pages = Array.from(this.desktopContainer.querySelectorAll('.desktop-page'));
    const nextIndex = pages.length;
    const pageId = `page-${nextIndex + 1}`;

    const pageEl = document.createElement('section');
    pageEl.className = 'desktop-page';
    pageEl.setAttribute('data-page-id', pageId);
    this.desktopContainer.appendChild(pageEl);

    this.layout[pageId] = [];
    this.currentPageId = pageId;

    const width = this.desktopContainer.clientWidth || 0;
    this.desktopContainer.scrollTo({
      left: nextIndex * width,
      behavior: 'smooth'
    });

    this.positionItemsDOM();
    this.showToast('已新增桌面页');
  }

  removeCurrentDesktopPage() {
    const pages = Array.from(this.desktopContainer.querySelectorAll('.desktop-page'));
    if (pages.length <= 1) {
      this.showToast('至少保留一页');
      return;
    }

    let currentPageEl = this.desktopContainer.querySelector(`.desktop-page[data-page-id="${this.currentPageId}"]`);
    if (!currentPageEl) {
      currentPageEl = pages[pages.length - 1];
    }

    const removedIndex = pages.indexOf(currentPageEl);
    const removedId = currentPageEl.getAttribute('data-page-id');

    currentPageEl.remove();
    delete this.layout[removedId];

    this.reindexDesktopPages();

    const remainPages = Array.from(this.desktopContainer.querySelectorAll('.desktop-page'));
    const targetIndex = Math.min(removedIndex, remainPages.length - 1);
    const targetPage = remainPages[targetIndex];

    if (targetPage) {
      this.currentPageId = targetPage.getAttribute('data-page-id');
      const width = this.desktopContainer.clientWidth || 0;
      this.desktopContainer.scrollTo({
        left: targetIndex * width,
        behavior: 'smooth'
      });
    }

    this.positionItemsDOM();
    this.showToast('已删除桌面页');
  }

  reindexDesktopPages() {
    const pages = Array.from(this.desktopContainer.querySelectorAll('.desktop-page'));
    const nextLayout = {};

    pages.forEach((page, index) => {
      const oldId = page.getAttribute('data-page-id');
      const newId = `page-${index + 1}`;
      page.setAttribute('data-page-id', newId);
      nextLayout[newId] = this.layout[oldId] || [];
    });

    this.layout = nextLayout;
  }

  createAppItemElement(app) {
    if (!app) return null;

    const customImg = localStorage.getItem(`miniphone_app_icon_${app.id}`);
    const imgStyle = customImg ? '' : 'display:none;';
    const btnClass = customImg ? 'app-icon-btn has-img' : 'app-icon-btn';

    const itemEl = document.createElement('div');
    itemEl.className = 'app-icon desktop-item absolute-layout';
    itemEl.setAttribute('data-item-id', `app-${app.id}`);
    itemEl.setAttribute('data-item-type', 'app');
    itemEl.setAttribute('data-app-id', app.id);

    itemEl.innerHTML = `
      <button class="${btnClass}" type="button" data-open-app="${app.id}">
        <span class="app-icon-glyph">${app.icon || ''}</span>
        <img class="app-custom-img" src="${customImg || ''}" style="${imgStyle}" alt="${app.name}" />
      </button>
      <span class="app-icon-label">${app.name}</span>
      <div class="edit-delete-btn">×</div>
    `;

    const deleteBtn = itemEl.querySelector('.edit-delete-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.removeItem(itemEl);
      });
    }

    const openBtn = itemEl.querySelector('[data-open-app]');
    if (openBtn) {
      openBtn.addEventListener('click', () => {
        if (!this.isEditMode) {
          this.eventBus.emit('app:open', { appId: app.id });
        }
      });
    }

    return itemEl;
  }

  addItemToDesktop(type, id) {
    const pageEl = this.desktopContainer.querySelector(`.desktop-page[data-page-id="${this.currentPageId}"]`);
    if (!pageEl) return false;

    this.updateLayoutDataFromDOM();

    if (type === 'app') {
      const itemId = `app-${id}`;
      const dockAppSet = this.getActiveDockAppIdSet();

      if (dockAppSet.has(id) || this.isItemInLayout(itemId)) {
        this.showToast('该应用已在桌面上');
        return false;
      }

      const app = this.appManager.registry.get(id);
      if (!app) return false;

      const colSpan = 1;
      const rowSpan = 1;
      const pos = this.findFreeSpot(this.currentPageId, colSpan, rowSpan);
      if (!pos) {
        this.showToast('当前页面空间不足');
        return false;
      }

      let itemEl = this.desktopContainer.querySelector(`.desktop-item[data-item-id="${itemId}"]`);
      if (!itemEl) {
        itemEl = this.createAppItemElement(app);
      }
      if (!itemEl) return false;

      if (itemEl.parentElement !== pageEl) {
        pageEl.appendChild(itemEl);
      }

      itemEl.style.display = '';
      itemEl.classList.add('desktop-item', 'absolute-layout');
      itemEl.setAttribute('data-item-id', itemId);
      itemEl.setAttribute('data-item-type', 'app');
      itemEl.setAttribute('data-app-id', app.id);
      itemEl.setAttribute('data-col', pos.col);
      itemEl.setAttribute('data-row', pos.row);
      itemEl.setAttribute('data-colspan', String(colSpan));
      itemEl.setAttribute('data-rowspan', String(rowSpan));

      // [模块标注] 桌面名称显示修复模块：桌面上的应用必须显示应用名称
      const labelEl = itemEl.querySelector('.app-icon-label');
      if (labelEl) labelEl.style.display = '';

      this.ensureDeleteButton(itemEl);

      if (this.dragDrop) {
        this.dragDrop.makeElementDraggable(itemEl, this);
      }

      this.updateLayoutDataFromDOM();
      this.positionItemsDOM();
      this.showToast('已添加');
      return true;
    }

    if (type === 'widget') {
      const itemId = id;
      if (this.isItemInLayout(itemId)) {
        this.showToast('该组件已在桌面上');
        return false;
      }

      const meta = this.getWidgetMeta(id);
      if (!meta) return false;

      const colSpan = meta.colSpan || 1;
      const rowSpan = meta.rowSpan || 1;
      const pos = this.findFreeSpot(this.currentPageId, colSpan, rowSpan);
      if (!pos) {
        this.showToast('当前页面空间不足');
        return false;
      }

      const itemEl = this.getWidgetElementById(id);
      if (!itemEl) {
        this.showToast('未找到可恢复的组件');
        return false;
      }

      if (itemEl.parentElement !== pageEl) {
        pageEl.appendChild(itemEl);
      }

      itemEl.style.display = '';
      itemEl.classList.add('desktop-item', 'absolute-layout');
      itemEl.setAttribute('data-item-id', itemId);
      itemEl.setAttribute('data-item-type', 'widget');
      itemEl.setAttribute('data-col', pos.col);
      itemEl.setAttribute('data-row', pos.row);
      itemEl.setAttribute('data-colspan', String(colSpan));
      itemEl.setAttribute('data-rowspan', String(rowSpan));

      this.ensureDeleteButton(itemEl);

      if (this.dragDrop) {
        this.dragDrop.makeElementDraggable(itemEl, this);
      }

      this.updateLayoutDataFromDOM();
      this.positionItemsDOM();
      this.showToast('已添加');
      return true;
    }

    return false;
  }

  findFreeSpot(pageId, colSpan, rowSpan) {
    const pageData = this.layout[pageId] || [];
    const grid = Array(this.gridRows).fill().map(() => Array(this.gridCols).fill(false));

    pageData.forEach((item) => {
      for (let r = 0; r < item.rowSpan; r++) {
        for (let c = 0; c < item.colSpan; c++) {
          if (item.row + r < this.gridRows && item.col + c < this.gridCols) {
            grid[item.row + r][item.col + c] = true;
          }
        }
      }
    });

    for (let r = 0; r <= this.gridRows - rowSpan; r++) {
      for (let c = 0; c <= this.gridCols - colSpan; c++) {
        let isFree = true;
        for (let rr = 0; rr < rowSpan; rr++) {
          for (let cc = 0; cc < colSpan; cc++) {
            if (grid[r + rr][c + cc]) {
              isFree = false;
              break;
            }
          }
          if (!isFree) break;
        }
        if (isFree) return { col: c, row: r };
      }
    }

    return null;
  }

  // --- 布局保存与恢复核心 ---

  loadLayout() {
    const saved = localStorage.getItem('miniphone_desktop_layout');
    if (saved) {
      try {
        this.layout = JSON.parse(saved);
      } catch (e) {
        Logger.error('解析桌面布局失败', e);
        this.initDefaultLayout();
      }
    } else {
      this.initDefaultLayout();
    }

    // [模块标注] 唯一性与重叠清理模块：加载历史布局后先清理重复与重叠
    this.sanitizeLayoutForUniquenessAndOverlap();

    this.savedLayoutSnapshot = this.cloneLayout(this.layout);
    this.applyLayoutToDOM(true);
  }

  saveLayout() {
    this.updateLayoutDataFromDOM();

    // [模块标注] 保存前一致性模块：保存前再次清理唯一性与重叠问题，避免重叠被写入已保存桌面
    this.sanitizeLayoutForUniquenessAndOverlap();
    this.applyLayoutToDOM();

    localStorage.setItem('miniphone_desktop_layout', JSON.stringify(this.layout));
    this.savedLayoutSnapshot = this.cloneLayout(this.layout);

    // 同步保存 Dock 可见状态
    this.saveDockState();
  }

  initDefaultLayout() {
    // 默认布局：只保留应用，不包含组件
    this.layout = {};
    const pages = this.desktopContainer.querySelectorAll('.desktop-page');

    pages.forEach((page) => {
      const pageId = page.getAttribute('data-page-id');
      this.layout[pageId] = [];

      const apps = Array.from(page.querySelectorAll('.app-icon[data-app-id]'));
      apps.forEach((appEl, index) => {
        const appId = appEl.getAttribute('data-app-id');
        const col = index % this.gridCols;
        const row = Math.floor(index / this.gridCols);

        appEl.classList.add('desktop-item', 'absolute-layout');
        appEl.setAttribute('data-item-id', `app-${appId}`);
        appEl.setAttribute('data-item-type', 'app');
        appEl.setAttribute('data-app-id', appId);
        appEl.setAttribute('data-col', String(col));
        appEl.setAttribute('data-row', String(row));
        appEl.setAttribute('data-colspan', '1');
        appEl.setAttribute('data-rowspan', '1');

        this.layout[pageId].push({
          id: `app-${appId}`,
          type: 'app',
          appId,
          col,
          row,
          colSpan: 1,
          rowSpan: 1
        });
      });
    });
  }

  applyLayoutToDOM(initialLoad = false) {
    if (!this.layout || Object.keys(this.layout).length === 0) return;

    // 先清理原有的排版容器 (p1-widgets-row, p1-apps-row 等)
    // 把里面的 item 提取到 page 直属下面
    const pages = this.desktopContainer.querySelectorAll('.desktop-page');
    pages.forEach((page) => {
      const pageId = page.getAttribute('data-page-id');
      const layoutItems = this.layout[pageId] || [];

      // 提取嵌套的元素到直接层级，并扁平化
      const wrappers = page.querySelectorAll('.p1-widgets-row, .p1-apps-row, .p2-apps-row');
      wrappers.forEach((w) => {
        while (w.firstChild) page.insertBefore(w.firstChild, w);
        w.remove();
      });

      const allItems = page.querySelectorAll('.p1-clock-widget, .p1-avatar-widget, .p1-news-widget, .p1-ticket-widget, .p2-ticket-widget, .app-icon');
      const domMap = new Map();
      const duplicates = [];

      allItems.forEach((el) => {
        let key = null;
        if (el.classList.contains('p1-clock-widget')) key = 'clock';
        else if (el.classList.contains('p1-avatar-widget')) key = 'avatar';
        else if (el.classList.contains('p1-news-widget')) key = 'news';
        else if (el.classList.contains('p1-ticket-widget')) key = 'ticket1';
        else if (el.classList.contains('p2-ticket-widget')) key = 'ticket2';
        else if (el.classList.contains('app-icon')) {
          const appId = el.getAttribute('data-app-id');
          if (appId) key = `app-${appId}`;
        }

        if (!key) return;

        if (domMap.has(key)) {
          duplicates.push(el);
          return;
        }

        domMap.set(key, el);
      });

      // 应用 layout 数据
      layoutItems.forEach((itemData) => {
        let el = domMap.get(itemData.id);

        if (!el && itemData.type === 'app' && itemData.appId) {
          const app = this.appManager.registry.get(itemData.appId);
          const created = this.createAppItemElement(app);
          if (created) {
            page.appendChild(created);
            el = created;
            domMap.set(itemData.id, created);
          }
        }

        if (!el && itemData.type === 'widget') {
          const widgetEl = this.getWidgetElementById(itemData.id);
          if (widgetEl) {
            if (widgetEl.parentElement !== page) page.appendChild(widgetEl);
            el = widgetEl;
            domMap.set(itemData.id, widgetEl);
          }
        }

        if (el) {
          el.style.display = '';
          el.classList.add('desktop-item', 'absolute-layout');
          el.setAttribute('data-item-id', itemData.id);
          el.setAttribute('data-item-type', itemData.type);
          if (itemData.appId) el.setAttribute('data-app-id', itemData.appId);
          el.setAttribute('data-col', String(itemData.col));
          el.setAttribute('data-row', String(itemData.row));
          el.setAttribute('data-colspan', String(itemData.colSpan));
          el.setAttribute('data-rowspan', String(itemData.rowSpan));

          // [模块标注] 桌面名称显示修复模块：桌面区应用始终显示名称
          if (itemData.type === 'app') {
            const labelEl = el.querySelector('.app-icon-label');
            if (labelEl) labelEl.style.display = '';
          }

          domMap.delete(itemData.id);
        }
      });

      duplicates.forEach((el) => {
        el.style.display = 'none';
      });

      // 未在 layout 中的元素隐藏
      Array.from(domMap.values()).forEach((el) => {
        el.style.display = 'none';
      });
    });

    this.sanitizeDesktopDomDuplicates();
    this.positionItemsDOM();

    // 初次加载后，校正当前页 id（防止页面状态不同步）
    if (initialLoad) {
      const width = this.desktopContainer.clientWidth || 1;
      const pageIndex = Math.round(this.desktopContainer.scrollLeft / width);
      this.currentPageId = `page-${pageIndex + 1}`;
    }
  }

  positionItemsDOM() {
    // 根据 data-col, data-row 计算绝对定位
    const marginX = 20;
    const marginY = 15;
    const gridH = 90;

    const pages = this.desktopContainer.querySelectorAll('.desktop-page');
    pages.forEach((page) => {
      const w = page.clientWidth;
      if (w === 0) return;

      const gridW = (w - marginX * 2) / this.gridCols;

      const items = page.querySelectorAll('.desktop-item.absolute-layout');
      items.forEach((item) => {
        if (item.style.display === 'none') return;

        const col = parseInt(item.getAttribute('data-col')) || 0;
        const row = parseInt(item.getAttribute('data-row')) || 0;
        const colSpan = parseInt(item.getAttribute('data-colspan')) || 1;
        const rowSpan = parseInt(item.getAttribute('data-rowspan')) || 1;

        const left = marginX + col * gridW;
        const top = marginY + row * gridH;
        const width = gridW * colSpan;
        const height = gridH * rowSpan;

        item.style.position = 'absolute';
        item.style.left = `${left}px`;
        item.style.top = `${top}px`;
        item.style.width = `${width}px`;
        item.style.height = `${height}px`;

        // 特殊处理应用图标居中
        if (item.classList.contains('app-icon')) {
          item.style.justifyContent = 'flex-start';
          item.style.paddingTop = '10px';
        }
      });
    });
  }

  updateLayoutDataFromDOM() {
    this.sanitizeDockDomDuplicates();
    this.dockState = this.dedupeDockState(this.dockState || []);

    const dockSet = new Set(this.dockState || []);
    const globalSeenAppIds = new Set(dockSet);
    const nextLayout = {};

    const isOverlap = (a, b) => (
      a.col < b.col + b.colSpan
      && a.col + a.colSpan > b.col
      && a.row < b.row + b.rowSpan
      && a.row + a.rowSpan > b.row
    );

    const pages = this.desktopContainer.querySelectorAll('.desktop-page');
    pages.forEach((page) => {
      const pageId = page.getAttribute('data-page-id');
      nextLayout[pageId] = [];
      const items = page.querySelectorAll('.desktop-item.absolute-layout');

      items.forEach((item) => {
        if (item.style.display === 'none') return;

        const itemData = {
          id: item.getAttribute('data-item-id'),
          type: item.getAttribute('data-item-type'),
          appId: item.getAttribute('data-app-id'),
          col: parseInt(item.getAttribute('data-col')) || 0,
          row: parseInt(item.getAttribute('data-row')) || 0,
          colSpan: parseInt(item.getAttribute('data-colspan')) || 1,
          rowSpan: parseInt(item.getAttribute('data-rowspan')) || 1
        };

        if (!itemData.id) {
          item.style.display = 'none';
          return;
        }

        if (itemData.type === 'app' && itemData.appId) {
          // [模块标注] 应用全局唯一模块：桌面和 Dock 合并后，同一应用只保留一个
          if (globalSeenAppIds.has(itemData.appId)) {
            item.style.display = 'none';
            return;
          }

          // [模块标注] 桌面名称显示修复模块：采样桌面应用时强制显示名称
          const labelEl = item.querySelector('.app-icon-label');
          if (labelEl) labelEl.style.display = '';
        }

        // [模块标注] 重叠阻止模块：若当前项与页面已有项重叠，则不纳入保存布局
        const conflict = nextLayout[pageId].some((existing) => isOverlap(itemData, existing));
        if (conflict) {
          item.style.display = 'none';
          return;
        }

        nextLayout[pageId].push(itemData);

        if (itemData.type === 'app' && itemData.appId) {
          globalSeenAppIds.add(itemData.appId);
        }
      });
    });

    this.layout = nextLayout;
    this.sanitizeLayoutForUniquenessAndOverlap();
  }
}
