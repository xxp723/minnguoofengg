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

    // 状态数据
    this.layout = {};
    this.savedLayoutSnapshot = {};
    this.currentPageId = 'page-1';

    // 可添加组件元数据
    this.widgetLibrary = [
      { id: 'clock', name: '时钟', icon: '🕰', selector: '.p1-clock-widget', colSpan: 4, rowSpan: 1 },
      { id: 'avatar', name: '头像框', icon: '🖼', selector: '.p1-avatar-widget', colSpan: 2, rowSpan: 2 },
      { id: 'news', name: '报纸', icon: '📰', selector: '.p1-news-widget', colSpan: 2, rowSpan: 2 },
      { id: 'ticket1', name: '船票', icon: '🎫', selector: '.p1-ticket-widget', colSpan: 4, rowSpan: 2 },
      { id: 'ticket2', name: '戏票', icon: '🎟', selector: '.p2-ticket-widget', colSpan: 4, rowSpan: 2 }
    ];

    this.bindEvents();
    this.loadLayout();
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

    // 应用当前 layout 到 DOM
    this.applyLayoutToDOM();

    // 激活 DragDrop 的自由拖拽
    if (this.dragDrop) {
      this.dragDrop.enableFreeDrag(this);
    }

    // 给所有元素添加删除按钮
    this.attachDeleteButtons();
  }

  exitEditMode() {
    if (!this.isEditMode) return;
    this.isEditMode = false;
    document.body.classList.remove('is-edit-mode');
    this.hideAddPanel();

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

  attachDeleteButtons() {
    const items = this.desktopContainer.querySelectorAll('.desktop-item');
    items.forEach((item) => this.ensureDeleteButton(item));
  }

  ensureDeleteButton(item) {
    if (item.querySelector('.edit-delete-btn')) return;
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

    // 逻辑删除：隐藏而不是 remove，确保“关闭”可恢复、可重新添加
    itemEl.style.display = 'none';
    this.updateLayoutDataFromDOM();
    this.positionItemsDOM();
    this.showToast('已移除');
  }

  isItemInLayout(itemId) {
    return Object.values(this.layout).some((items) =>
      (items || []).some((item) => item.id === itemId)
    );
  }

  getWidgetMeta(id) {
    return this.widgetLibrary.find((w) => w.id === id) || null;
  }

  getWidgetElementById(id) {
    let el = this.desktopContainer.querySelector(`.desktop-item[data-item-id="${id}"]`);
    if (el) return el;

    const meta = this.getWidgetMeta(id);
    if (!meta) return null;

    el = this.desktopContainer.querySelector(meta.selector);
    return el || null;
  }

  showAddPanel() {
    if (!this.addPanel || !this.addPanelGrid) return;

    this.updateLayoutDataFromDOM();

    // 可添加应用（去重）
    const apps = this.appManager.registry.getAll();
    const availableApps = apps.filter((app) => !this.isItemInLayout(`app-${app.id}`));

    // 可添加组件（去重）
    const availableWidgets = this.widgetLibrary.filter((w) => !this.isItemInLayout(w.id));

    const appHtml = availableApps.map((app) => `
      <div class="add-panel-item" data-add-type="app" data-add-id="${app.id}">
        <div class="app-icon-btn">
          <span class="app-icon-glyph">${app.icon || ''}</span>
        </div>
        <span>${app.name}</span>
      </div>
    `);

    const widgetHtml = availableWidgets.map((widget) => `
      <div class="add-panel-item" data-add-type="widget" data-add-id="${widget.id}">
        <div class="app-icon-btn">
          <span class="app-icon-glyph">${widget.icon}</span>
        </div>
        <span>${widget.name}</span>
      </div>
    `);

    const allHtml = [...appHtml, ...widgetHtml];
    this.addPanelGrid.innerHTML = allHtml.length
      ? allHtml.join('')
      : `<div style="grid-column:1/-1;text-align:center;color:#7D5A44;">当前没有可添加的应用或组件</div>`;

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
      if (this.isItemInLayout(itemId)) {
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

    this.savedLayoutSnapshot = this.cloneLayout(this.layout);
    this.applyLayoutToDOM(true);
  }

  saveLayout() {
    this.updateLayoutDataFromDOM();
    localStorage.setItem('miniphone_desktop_layout', JSON.stringify(this.layout));
    this.savedLayoutSnapshot = this.cloneLayout(this.layout);
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
      const domMap = {};

      allItems.forEach((el) => {
        if (el.classList.contains('p1-clock-widget')) domMap.clock = el;
        else if (el.classList.contains('p1-avatar-widget')) domMap.avatar = el;
        else if (el.classList.contains('p1-news-widget')) domMap.news = el;
        else if (el.classList.contains('p1-ticket-widget')) domMap.ticket1 = el;
        else if (el.classList.contains('p2-ticket-widget')) domMap.ticket2 = el;
        else if (el.classList.contains('app-icon')) {
          const appId = el.getAttribute('data-app-id');
          if (appId) domMap[`app-${appId}`] = el;
        }
      });

      // 应用 layout 数据
      layoutItems.forEach((itemData) => {
        let el = domMap[itemData.id];

        if (!el && itemData.type === 'app' && itemData.appId) {
          const app = this.appManager.registry.get(itemData.appId);
          const created = this.createAppItemElement(app);
          if (created) {
            page.appendChild(created);
            el = created;
            domMap[itemData.id] = created;
          }
        }

        if (!el && itemData.type === 'widget') {
          const widgetEl = this.getWidgetElementById(itemData.id);
          if (widgetEl) {
            if (widgetEl.parentElement !== page) page.appendChild(widgetEl);
            el = widgetEl;
            domMap[itemData.id] = widgetEl;
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
          delete domMap[itemData.id];
        }
      });

      // 未在 layout 中的元素隐藏
      Object.values(domMap).forEach((el) => {
        el.style.display = 'none';
      });
    });

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
    this.layout = {};
    const pages = this.desktopContainer.querySelectorAll('.desktop-page');
    pages.forEach((page) => {
      const pageId = page.getAttribute('data-page-id');
      this.layout[pageId] = [];
      const items = page.querySelectorAll('.desktop-item.absolute-layout');
      items.forEach((item) => {
        if (item.style.display === 'none') return;
        this.layout[pageId].push({
          id: item.getAttribute('data-item-id'),
          type: item.getAttribute('data-item-type'),
          appId: item.getAttribute('data-app-id'),
          col: parseInt(item.getAttribute('data-col')) || 0,
          row: parseInt(item.getAttribute('data-row')) || 0,
          colSpan: parseInt(item.getAttribute('data-colspan')) || 1,
          rowSpan: parseInt(item.getAttribute('data-rowspan')) || 1
        });
      });
    });
  }
}
