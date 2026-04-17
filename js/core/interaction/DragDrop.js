/**
 * 文件名: js/core/interaction/DragDrop.js
 * 用途: 桌面自由拖拽与网格吸附模块。
 *       支持 Touch 和 Mouse 事件。
 *       仅在编辑模式下生效，由 DesktopEditMode 调度。
 * 位置: /js/core/interaction/DragDrop.js
 * 架构层: 交互层（Interaction Layer）
 */
export class DragDrop {
  constructor(desktopContainer, eventBus) {
    this.desktopContainer = desktopContainer;
    this.eventBus = eventBus;
    this.editMode = null;

    this.activeDrag = null;
    this.lastPointer = null;
    this.pageSwitchThrottleMs = 260;
    this.lastPageSwitchAt = 0;

    this.onStart = this.onStart.bind(this);
    this.onMove = this.onMove.bind(this);
    this.onEnd = this.onEnd.bind(this);
  }

  bind() {
    // 禁用默认的 HTML5 drag 以免冲突
    this.desktopContainer.addEventListener('dragstart', (e) => e.preventDefault());
  }

  unbind() {
    this.disableFreeDrag();
  }

  enableFreeDrag(editModeInstance) {
    this.editMode = editModeInstance;
    const items = document.querySelectorAll('.desktop-item, #dock-container .app-icon[data-app-id]');
    items.forEach((item) => this.makeElementDraggable(item, this.editMode));
  }

  disableFreeDrag() {
    const items = document.querySelectorAll('.desktop-item, #dock-container .app-icon[data-app-id]');
    items.forEach((item) => {
      item.removeEventListener('touchstart', this.onStart);
      item.removeEventListener('mousedown', this.onStart);
    });
    this.editMode = null;
  }

  makeElementDraggable(el, editMode) {
    if (!el) return;
    if (!this.editMode) this.editMode = editMode;
    el.removeEventListener('touchstart', this.onStart);
    el.removeEventListener('mousedown', this.onStart);
    el.addEventListener('touchstart', this.onStart, { passive: false });
    el.addEventListener('mousedown', this.onStart);
  }

  getPageIndex(pageEl) {
    if (!pageEl) return 0;
    const pages = Array.from(this.desktopContainer.querySelectorAll('.desktop-page'));
    const idx = pages.indexOf(pageEl);
    if (idx >= 0) return idx;

    const pageId = pageEl.getAttribute('data-page-id') || '';
    const match = pageId.match(/^page-(\d+)$/);
    if (match) {
      const parsed = parseInt(match[1], 10) - 1;
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    }
    return 0;
  }

  trySwitchPage(pointer) {
    if (!this.activeDrag || this.activeDrag.isDockItem) return;

    const now = Date.now();
    if (now - this.lastPageSwitchAt < this.pageSwitchThrottleMs) return;

    const containerRect = this.desktopContainer.getBoundingClientRect();
    const pages = Array.from(this.desktopContainer.querySelectorAll('.desktop-page'));
    if (pages.length <= 1) return;

    const edgeTrigger = 36;
    const currentIndex = this.getPageIndex(this.activeDrag.pageEl);
    let targetIndex = currentIndex;

    if (pointer.clientX - containerRect.left <= edgeTrigger && currentIndex > 0) {
      targetIndex = currentIndex - 1;
    } else if (containerRect.right - pointer.clientX <= edgeTrigger && currentIndex < pages.length - 1) {
      targetIndex = currentIndex + 1;
    }

    if (targetIndex === currentIndex) return;

    const targetPage = pages[targetIndex];
    if (!targetPage) return;

    // 把拖拽元素移动到目标页
    targetPage.appendChild(this.activeDrag.el);

    // 同步滚动到目标页
    const width = this.desktopContainer.clientWidth || 0;
    this.desktopContainer.scrollTo({
      left: targetIndex * width,
      behavior: 'smooth'
    });

    // 重置拖拽参考坐标，确保切页后仍然跟手
    const parentRect = targetPage.getBoundingClientRect();
    const rect = this.activeDrag.el.getBoundingClientRect();

    this.activeDrag.pageEl = targetPage;
    this.activeDrag.parentRect = parentRect;
    this.activeDrag.initialLeft = rect.left - parentRect.left;
    this.activeDrag.initialTop = rect.top - parentRect.top;
    this.activeDrag.startX = pointer.clientX;
    this.activeDrag.startY = pointer.clientY;

    if (this.editMode) {
      this.editMode.currentPageId = `page-${targetIndex + 1}`;
    }

    this.lastPageSwitchAt = now;
  }

  onStart(e) {
    if (!this.editMode || !this.editMode.isEditMode) return;
    if (e.target.closest('.edit-delete-btn')) return; // 点了删除按钮不拖拽

    // 如果是鼠标右键，则不拖拽
    if (e.type === 'mousedown' && e.button !== 0) return;

    e.preventDefault();
    e.stopPropagation();

    const target = e.currentTarget;
    const isDesktopItem = target.classList.contains('desktop-item');
    const isDockItem = !!target.closest('#dock-container');
    if (!isDesktopItem && !isDockItem) return;

    const pointer = e.type.includes('touch') ? e.touches[0] : e;
    const rect = target.getBoundingClientRect();
    const pageEl = target.closest('.desktop-page');
    const parentForDesktop = pageEl || target.parentElement;
    const parentRect = parentForDesktop ? parentForDesktop.getBoundingClientRect() : rect;

    const appId = target.getAttribute('data-app-id') || null;
    const sourceCol = parseInt(target.getAttribute('data-col'), 10);
    const sourceRow = parseInt(target.getAttribute('data-row'), 10);

    this.activeDrag = {
      el: target,
      isDockItem,
      appId,
      sourcePageId: pageEl ? pageEl.getAttribute('data-page-id') : null,
      sourceCol: Number.isFinite(sourceCol) ? sourceCol : null,
      sourceRow: Number.isFinite(sourceRow) ? sourceRow : null,
      sourceDockIndex: isDockItem && this.editMode && typeof this.editMode.getDockIndexByAppId === 'function'
        ? this.editMode.getDockIndexByAppId(appId)
        : null,

      startX: pointer.clientX,
      startY: pointer.clientY,
      initialLeft: rect.left - parentRect.left,
      initialTop: rect.top - parentRect.top,
      colSpan: parseInt(target.getAttribute('data-colspan')) || 1,
      rowSpan: parseInt(target.getAttribute('data-rowspan')) || 1,
      pageEl,
      parentRect,

      dockRect: isDockItem ? rect : null,
      dockOriginalStyle: isDockItem ? {
        position: target.style.position || '',
        left: target.style.left || '',
        top: target.style.top || '',
        width: target.style.width || '',
        height: target.style.height || '',
        zIndex: target.style.zIndex || '',
        pointerEvents: target.style.pointerEvents || ''
      } : null
    };

    if (isDockItem) {
      target.style.width = `${rect.width}px`;
      target.style.height = `${rect.height}px`;
    }

    target.classList.add('is-dragging');

    document.addEventListener('touchmove', this.onMove, { passive: false });
    document.addEventListener('touchend', this.onEnd);
    document.addEventListener('mousemove', this.onMove);
    document.addEventListener('mouseup', this.onEnd);
  }

  onMove(e) {
    if (!this.activeDrag) return;
    e.preventDefault();

    const pointer = e.type.includes('touch') ? e.touches[0] : e;
    this.lastPointer = pointer;

    if (this.activeDrag.isDockItem) {
      this.moveDockDragGhost(pointer);
      return;
    }

    // 先尝试切页（拖到左右边缘）
    this.trySwitchPage(pointer);

    const dx = pointer.clientX - this.activeDrag.startX;
    const dy = pointer.clientY - this.activeDrag.startY;

    let newLeft = this.activeDrag.initialLeft + dx;
    let newTop = this.activeDrag.initialTop + dy;

    // 限制在页面内
    const maxLeft = this.activeDrag.parentRect.width - this.activeDrag.el.offsetWidth;
    const maxTop = this.activeDrag.parentRect.height - this.activeDrag.el.offsetHeight;

    newLeft = Math.max(0, Math.min(newLeft, maxLeft));
    newTop = Math.max(0, Math.min(newTop, maxTop));

    this.activeDrag.el.style.left = `${newLeft}px`;
    this.activeDrag.el.style.top = `${newTop}px`;
  }

  onEnd() {
    if (!this.activeDrag) return;

    document.removeEventListener('touchmove', this.onMove);
    document.removeEventListener('touchend', this.onEnd);
    document.removeEventListener('mousemove', this.onMove);
    document.removeEventListener('mouseup', this.onEnd);

    const drag = this.activeDrag;
    const el = drag.el;
    const pointer = this.lastPointer;
    let handled = false;

    el.classList.remove('is-dragging');

    if (drag.isDockItem) {
      handled = this.handleDockDrop(pointer);
      this.restoreDockItemStyle();
      if (!handled && this.editMode && typeof this.editMode.applyDockStateToDOM === 'function') {
        this.editMode.applyDockStateToDOM();
      }
    } else {
      handled = this.handleDesktopDrop(pointer);
      if (!handled) {
        this.snapToGrid();
      }
    }

    this.activeDrag = null;
    this.lastPointer = null;
  }

  moveDockDragGhost(pointer) {
    if (!this.activeDrag) return;
    const { el, dockRect } = this.activeDrag;
    const width = dockRect?.width || el.offsetWidth || 56;
    const height = dockRect?.height || el.offsetHeight || 56;

    el.style.position = 'fixed';
    el.style.left = `${pointer.clientX - width / 2}px`;
    el.style.top = `${pointer.clientY - height / 2}px`;
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;
    el.style.zIndex = '9999';
    el.style.pointerEvents = 'none';
  }

  restoreDockItemStyle() {
    if (!this.activeDrag || !this.activeDrag.isDockItem) return;
    const { el, dockOriginalStyle } = this.activeDrag;
    if (!dockOriginalStyle) return;

    el.style.position = dockOriginalStyle.position;
    el.style.left = dockOriginalStyle.left;
    el.style.top = dockOriginalStyle.top;
    el.style.width = dockOriginalStyle.width;
    el.style.height = dockOriginalStyle.height;
    el.style.zIndex = dockOriginalStyle.zIndex;
    el.style.pointerEvents = dockOriginalStyle.pointerEvents;
  }

  isPointerInsideRect(pointer, rect) {
    if (!pointer || !rect) return false;
    return pointer.clientX >= rect.left
      && pointer.clientX <= rect.right
      && pointer.clientY >= rect.top
      && pointer.clientY <= rect.bottom;
  }

  handleDesktopDrop(pointer) {
    if (!this.activeDrag || !pointer || !this.editMode) return false;
    const appId = this.activeDrag.appId;
    if (!appId) return false;

    const dock = document.getElementById('dock-container');
    if (!dock) return false;

    const dockRect = dock.getBoundingClientRect();
    const insideDock = this.isPointerInsideRect(pointer, dockRect);
    if (!insideDock) return false;

    if (typeof this.editMode.handleDesktopDropToDock === 'function') {
      return !!this.editMode.handleDesktopDropToDock({
        appId,
        fromPageId: this.activeDrag.sourcePageId,
        fromCol: this.activeDrag.sourceCol,
        fromRow: this.activeDrag.sourceRow,
        pointer
      });
    }

    return false;
  }

  handleDockDrop(pointer) {
    if (!this.activeDrag || !pointer || !this.editMode) return false;
    const appId = this.activeDrag.appId;
    if (!appId) return false;

    const dock = document.getElementById('dock-container');
    const dockRect = dock ? dock.getBoundingClientRect() : null;
    const insideDock = this.isPointerInsideRect(pointer, dockRect);
    if (insideDock && typeof this.editMode.reorderDockItemByPointer === 'function') {
      return !!this.editMode.reorderDockItemByPointer(appId, pointer);
    }

    const desktopRect = this.desktopContainer.getBoundingClientRect();
    const insideDesktop = this.isPointerInsideRect(pointer, desktopRect);
    if (insideDesktop && typeof this.editMode.handleDockDropToDesktop === 'function') {
      return !!this.editMode.handleDockDropToDesktop({
        appId,
        sourceDockIndex: this.activeDrag.sourceDockIndex,
        pointer
      });
    }

    return false;
  }

  snapToGrid() {
    if (!this.activeDrag || this.activeDrag.isDockItem) return;

    const { el, pageEl, colSpan, rowSpan, parentRect } = this.activeDrag;

    const marginX = 20;
    const marginY = 15;
    const gridH = 90;
    const w = parentRect.width;
    const gridCols = this.editMode.gridCols;
    const gridRows = this.editMode.gridRows;
    const gridW = (w - marginX * 2) / gridCols;

    const rect = el.getBoundingClientRect();

    // 计算中心点所在的格子
    const centerX = rect.left - parentRect.left + rect.width / 2;
    const centerY = rect.top - parentRect.top + rect.height / 2;

    let targetCol = Math.floor((centerX - marginX) / gridW);
    let targetRow = Math.floor((centerY - marginY) / gridH);

    // 边界限制
    targetCol = Math.max(0, Math.min(targetCol, gridCols - colSpan));
    targetRow = Math.max(0, Math.min(targetRow, gridRows - rowSpan));

    const pageId = pageEl.getAttribute('data-page-id');
    const draggedItemId = el.getAttribute('data-item-id');

    // 在 layout 里找到被拖拽项（可能来自其它页）
    let myItem = null;
    let fromPageId = null;
    Object.entries(this.editMode.layout).forEach(([pid, items]) => {
      const found = (items || []).find((i) => i.id === draggedItemId);
      if (found && !myItem) {
        myItem = found;
        fromPageId = pid;
      }
    });

    if (!myItem) {
      myItem = {
        id: draggedItemId,
        type: el.getAttribute('data-item-type') || 'app',
        appId: el.getAttribute('data-app-id') || null,
        col: 0,
        row: 0,
        colSpan,
        rowSpan
      };
    }

    myItem.colSpan = colSpan;
    myItem.rowSpan = rowSpan;
    myItem.type = myItem.type || el.getAttribute('data-item-type') || 'app';
    if (!myItem.appId) myItem.appId = el.getAttribute('data-app-id') || null;

    if (!this.editMode.layout[pageId]) this.editMode.layout[pageId] = [];

    // 先从旧页移除，再确保在新页存在
    if (fromPageId && fromPageId !== pageId && this.editMode.layout[fromPageId]) {
      this.editMode.layout[fromPageId] = this.editMode.layout[fromPageId].filter((i) => i.id !== draggedItemId);
    }

    const targetPageItems = this.editMode.layout[pageId];
    if (!targetPageItems.some((i) => i.id === draggedItemId)) {
      targetPageItems.push(myItem);
    }

    const oldCol = myItem.col;
    const oldRow = myItem.row;

    let conflictItem = null;
    for (const item of targetPageItems) {
      if (item.id === draggedItemId) continue;

      const overlapX = targetCol < item.col + item.colSpan && targetCol + colSpan > item.col;
      const overlapY = targetRow < item.row + item.rowSpan && targetRow + rowSpan > item.row;

      if (overlapX && overlapY) {
        conflictItem = item;
        break;
      }
    }

    if (conflictItem) {
      // 发生冲突：若尺寸相同，则互换位置；否则恢复原位
      if (colSpan === conflictItem.colSpan && rowSpan === conflictItem.rowSpan) {
        myItem.col = conflictItem.col;
        myItem.row = conflictItem.row;
        conflictItem.col = oldCol;
        conflictItem.row = oldRow;

        el.setAttribute('data-col', myItem.col);
        el.setAttribute('data-row', myItem.row);

        const conflictEl = pageEl.querySelector(`[data-item-id="${conflictItem.id}"]`);
        if (conflictEl) {
          conflictEl.setAttribute('data-col', conflictItem.col);
          conflictEl.setAttribute('data-row', conflictItem.row);
        }
      } else {
        myItem.col = oldCol;
        myItem.row = oldRow;
        el.setAttribute('data-col', myItem.col);
        el.setAttribute('data-row', myItem.row);
      }
    } else {
      // 无冲突，直接更新
      myItem.col = targetCol;
      myItem.row = targetRow;
      el.setAttribute('data-col', targetCol);
      el.setAttribute('data-row', targetRow);
    }

    // 动画回到正确位置
    this.editMode.positionItemsDOM();
  }
}
