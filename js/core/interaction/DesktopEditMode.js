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
    this.btnReset = document.getElementById('edit-btn-reset');
    this.btnDone = document.getElementById('edit-btn-done');
    this.btnClose = document.getElementById('edit-btn-close');
    this.addPanel = document.getElementById('add-panel');
    this.addPanelMask = document.getElementById('add-panel-mask');
    this.addPanelGrid = document.getElementById('add-panel-grid');
    this.toastEl = document.getElementById('desktop-toast');

    // 状态数据
    this.layout = {}; 
    this.currentPageId = 'page-1';

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
        // 关闭时不保存，重新加载之前的布局
        this.loadLayout();
        this.applyLayoutToDOM();
        this.exitEditMode();
      });
    }

    if (this.btnReset) {
      this.btnReset.addEventListener('click', () => {
        if (confirm('确定要恢复默认布局吗？所有自定义位置将被重置。')) {
          localStorage.removeItem('miniphone_desktop_layout');
          this.loadLayout();
          this.applyLayoutToDOM();
          this.showToast('已恢复默认布局');
        }
      });
    }

    if (this.btnAdd) {
      this.btnAdd.addEventListener('click', () => this.showAddPanel());
    }
    
    if (this.addPanelMask) {
      this.addPanelMask.addEventListener('click', () => this.hideAddPanel());
    }
  }

  enterEditMode() {
    if (this.isEditMode) return;
    this.isEditMode = true;
    document.body.classList.add('is-edit-mode');
    
    // 把现有的 DOM 转换为绝对定位布局，或者应用已保存的布局
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
    items.forEach(item => {
      if (!item.querySelector('.edit-delete-btn')) {
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
    });
  }

  removeItem(itemEl) {
    const pageEl = itemEl.closest('.desktop-page');
    if (!pageEl) return;
    
    const pageId = pageEl.getAttribute('data-page-id');
    const itemId = itemEl.getAttribute('data-item-id');
    
    itemEl.style.transform = 'scale(0)';
    setTimeout(() => {
      itemEl.remove();
      this.updateLayoutDataFromDOM();
      this.showToast('已移除');
    }, 200);
  }

  showAddPanel() {
    if (!this.addPanel || !this.addPanelGrid) return;
    
    // 渲染所有可用的应用
    const apps = this.appManager.registry.getAll();
    this.addPanelGrid.innerHTML = apps.map(app => `
      <div class="add-panel-item" data-add-type="app" data-add-id="${app.id}">
        <div class="app-icon-btn">
          <span class="app-icon-glyph">${app.icon || ''}</span>
        </div>
        <span>${app.name}</span>
      </div>
    `).join('');

    // 绑定添加事件
    this.addPanelGrid.querySelectorAll('.add-panel-item').forEach(item => {
      item.addEventListener('click', () => {
        const type = item.getAttribute('data-add-type');
        const id = item.getAttribute('data-add-id');
        this.addItemToDesktop(type, id);
        this.hideAddPanel();
      });
    });

    this.addPanel.classList.add('is-visible');
    this.addPanelMask.classList.add('is-visible');
  }

  hideAddPanel() {
    if (this.addPanel) this.addPanel.classList.remove('is-visible');
    if (this.addPanelMask) this.addPanelMask.classList.remove('is-visible');
  }

  addItemToDesktop(type, id) {
    const pageEl = this.desktopContainer.querySelector(`.desktop-page[data-page-id="${this.currentPageId}"]`);
    if (!pageEl) return;

    // 找一个空闲位置
    const pos = this.findFreeSpot(this.currentPageId, 1, 1);
    if (!pos) {
      this.showToast('当前页面空间不足');
      return;
    }

    if (type === 'app') {
      const app = this.appManager.registry.get(id);
      if (!app) return;
      
      const customImg = localStorage.getItem(`miniphone_app_icon_${app.id}`);
      const imgStyle = customImg ? '' : 'display:none;';
      const btnClass = customImg ? 'app-icon-btn has-img' : 'app-icon-btn';
      
      const itemEl = document.createElement('div');
      itemEl.className = 'app-icon desktop-item absolute-layout';
      itemEl.setAttribute('data-item-id', `app-${app.id}`);
      itemEl.setAttribute('data-item-type', 'app');
      itemEl.setAttribute('data-app-id', app.id);
      itemEl.setAttribute('data-col', pos.col);
      itemEl.setAttribute('data-row', pos.row);
      itemEl.setAttribute('data-colspan', '1');
      itemEl.setAttribute('data-rowspan', '1');
      
      itemEl.innerHTML = `
        <button class="${btnClass}" type="button" data-open-app="${app.id}">
          <span class="app-icon-glyph">${app.icon || ''}</span>
          <img class="app-custom-img" src="${customImg || ''}" style="${imgStyle}" alt="${app.name}" />
        </button>
        <span class="app-icon-label">${app.name}</span>
        <div class="edit-delete-btn">×</div>
      `;
      
      // 绑定删除事件
      itemEl.querySelector('.edit-delete-btn').addEventListener('click', (e) => {
        e.stopPropagation(); e.preventDefault();
        this.removeItem(itemEl);
      });

      pageEl.appendChild(itemEl);
      this.dragDrop.makeElementDraggable(itemEl, this);
      this.updateLayoutDataFromDOM();
      this.positionItemsDOM(); // 重新计算所有位置
      this.showToast('已添加');
    }
  }

  findFreeSpot(pageId, colSpan, rowSpan) {
    const pageData = this.layout[pageId] || [];
    const grid = Array(this.gridRows).fill().map(() => Array(this.gridCols).fill(false));
    
    pageData.forEach(item => {
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
    return null; // 没有空闲位置
  }

  // --- 布局保存与恢复核心 ---

  loadLayout() {
    const saved = localStorage.getItem('miniphone_desktop_layout');
    if (saved) {
      try {
        this.layout = JSON.parse(saved);
        // 初始化时如果已有自定义布局，静默应用
        this.applyLayoutToDOM(true);
      } catch (e) {
        Logger.error('解析桌面布局失败', e);
        this.initDefaultLayout();
      }
    } else {
      this.initDefaultLayout();
    }
  }

  saveLayout() {
    this.updateLayoutDataFromDOM();
    localStorage.setItem('miniphone_desktop_layout', JSON.stringify(this.layout));
  }

  initDefaultLayout() {
    // 根据当前 DOM 提取默认布局
    this.layout = {};
    const pages = this.desktopContainer.querySelectorAll('.desktop-page');
    pages.forEach(page => {
      const pageId = page.getAttribute('data-page-id');
      this.layout[pageId] = [];
      
      // 提取 Widget
      const widgets = [
        { selector: '.p1-clock-widget', id: 'clock', col: 0, row: 0, colSpan: 4, rowSpan: 1 },
        { selector: '.p1-avatar-widget', id: 'avatar', col: 0, row: 1, colSpan: 2, rowSpan: 2 },
        { selector: '.p1-news-widget', id: 'news', col: 2, row: 1, colSpan: 2, rowSpan: 2 },
        { selector: '.p1-ticket-widget', id: 'ticket1', col: 0, row: 4, colSpan: 4, rowSpan: 2 },
        { selector: '.p2-ticket-widget', id: 'ticket2', col: 0, row: 0, colSpan: 4, rowSpan: 2 }
      ];

      widgets.forEach(w => {
        const el = page.querySelector(w.selector);
        if (el) {
          el.classList.add('desktop-item', 'absolute-layout');
          el.setAttribute('data-item-id', w.id);
          el.setAttribute('data-item-type', 'widget');
          el.setAttribute('data-col', w.col);
          el.setAttribute('data-row', w.row);
          el.setAttribute('data-colspan', w.colSpan);
          el.setAttribute('data-rowspan', w.rowSpan);
          
          this.layout[pageId].push({
            id: w.id, type: 'widget',
            col: w.col, row: w.row, colSpan: w.colSpan, rowSpan: w.rowSpan
          });
        }
      });

      // 提取 Apps
      const appRows = page.querySelectorAll('.p1-apps-row, .p2-apps-row');
      let defaultAppRowStart = pageId === 'page-1' ? 3 : 2;
      let appCol = 0;
      
      appRows.forEach(row => {
        const apps = row.querySelectorAll('.app-icon');
        apps.forEach(appEl => {
          const appId = appEl.getAttribute('data-app-id');
          if (appCol >= 4) { appCol = 0; defaultAppRowStart++; }
          
          appEl.classList.add('desktop-item', 'absolute-layout');
          appEl.setAttribute('data-item-id', `app-${appId}`);
          appEl.setAttribute('data-item-type', 'app');
          appEl.setAttribute('data-app-id', appId);
          appEl.setAttribute('data-col', appCol);
          appEl.setAttribute('data-row', defaultAppRowStart);
          appEl.setAttribute('data-colspan', 1);
          appEl.setAttribute('data-rowspan', 1);
          
          this.layout[pageId].push({
            id: `app-${appId}`, type: 'app', appId: appId,
            col: appCol, row: defaultAppRowStart, colSpan: 1, rowSpan: 1
          });
          
          appCol++;
        });
      });
    });
  }

  applyLayoutToDOM(initialLoad = false) {
    if (!this.layout || Object.keys(this.layout).length === 0) return;

    // 先清理原有的排版容器 (p1-widgets-row, p1-apps-row 等)
    // 把里面的 item 提取到 page 直属下面
    const pages = this.desktopContainer.querySelectorAll('.desktop-page');
    pages.forEach(page => {
      const pageId = page.getAttribute('data-page-id');
      const layoutItems = this.layout[pageId] || [];
      
      // 提取嵌套的元素到直接层级，并扁平化
      const wrappers = page.querySelectorAll('.p1-widgets-row, .p1-apps-row, .p2-apps-row');
      wrappers.forEach(w => {
        while(w.firstChild) page.insertBefore(w.firstChild, w);
        w.remove();
      });

      // 遍历所有可能的项，如果不在 layout 中则隐藏或移除
      const allItems = page.querySelectorAll('.p1-clock-widget, .p1-avatar-widget, .p1-news-widget, .p1-ticket-widget, .p2-ticket-widget, .app-icon');
      
      // 建立 DOM 映射
      const domMap = {};
      allItems.forEach(el => {
        if (el.classList.contains('p1-clock-widget')) domMap['clock'] = el;
        else if (el.classList.contains('p1-avatar-widget')) domMap['avatar'] = el;
        else if (el.classList.contains('p1-news-widget')) domMap['news'] = el;
        else if (el.classList.contains('p1-ticket-widget')) domMap['ticket1'] = el;
        else if (el.classList.contains('p2-ticket-widget')) domMap['ticket2'] = el;
        else if (el.classList.contains('app-icon')) {
          const appId = el.getAttribute('data-app-id');
          if (appId) domMap[`app-${appId}`] = el;
        }
      });

      // 应用 layout 数据
      layoutItems.forEach(itemData => {
        const el = domMap[itemData.id];
        if (el) {
          el.classList.add('desktop-item', 'absolute-layout');
          el.setAttribute('data-item-id', itemData.id);
          el.setAttribute('data-item-type', itemData.type);
          if (itemData.appId) el.setAttribute('data-app-id', itemData.appId);
          el.setAttribute('data-col', itemData.col);
          el.setAttribute('data-row', itemData.row);
          el.setAttribute('data-colspan', itemData.colSpan);
          el.setAttribute('data-rowspan', itemData.rowSpan);
          // 标记已处理
          delete domMap[itemData.id];
        } else if (itemData.type === 'app') {
          // 如果是 app 且 DOM 中没有，则尝试创建（可能是新添加保存后重新加载的）
          // （此处简化，依赖初始化时 HTML 结构完整）
        }
      });

      // 未在 layout 中的元素，隐藏它们
      Object.values(domMap).forEach(el => {
        el.style.display = 'none';
      });
    });

    this.positionItemsDOM();
  }

  positionItemsDOM() {
    // 根据 data-col, data-row 计算绝对定位
    // 假设网格：左右 margin 20px, 每页可用宽度 clientWidth - 40
    // 格子高度设为定值 90px
    const marginX = 20;
    const marginY = 15;
    const gridH = 90;

    const pages = this.desktopContainer.querySelectorAll('.desktop-page');
    pages.forEach(page => {
      const w = page.clientWidth;
      if(w === 0) return; // 隐藏状态不计算
      
      const gridW = (w - marginX * 2) / this.gridCols;

      const items = page.querySelectorAll('.desktop-item.absolute-layout');
      items.forEach(item => {
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
    pages.forEach(page => {
      const pageId = page.getAttribute('data-page-id');
      this.layout[pageId] = [];
      const items = page.querySelectorAll('.desktop-item.absolute-layout');
      items.forEach(item => {
        if (item.style.display === 'none') return;
        this.layout[pageId].push({
          id: item.getAttribute('data-item-id'),
          type: item.getAttribute('data-item-type'),
          appId: item.getAttribute('data-app-id'),
          col: parseInt(item.getAttribute('data-col')),
          row: parseInt(item.getAttribute('data-row')),
          colSpan: parseInt(item.getAttribute('data-colspan')),
          rowSpan: parseInt(item.getAttribute('data-rowspan'))
        });
      });
    });
  }
}
