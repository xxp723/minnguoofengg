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
    
    this.onStart = this.onStart.bind(this);
    this.onMove = this.onMove.bind(this);
    this.onEnd = this.onEnd.bind(this);
  }

  bind() {
    // 禁用默认的 HTML5 drag 以免冲突
    this.desktopContainer.addEventListener('dragstart', e => e.preventDefault());
  }

  unbind() {
    this.disableFreeDrag();
  }

  enableFreeDrag(editModeInstance) {
    this.editMode = editModeInstance;
    const items = this.desktopContainer.querySelectorAll('.desktop-item');
    items.forEach(item => this.makeElementDraggable(item, this.editMode));
  }

  disableFreeDrag() {
    const items = this.desktopContainer.querySelectorAll('.desktop-item');
    items.forEach(item => {
      item.removeEventListener('touchstart', this.onStart);
      item.removeEventListener('mousedown', this.onStart);
    });
    this.editMode = null;
  }

  makeElementDraggable(el, editMode) {
    if (!this.editMode) this.editMode = editMode;
    el.addEventListener('touchstart', this.onStart, { passive: false });
    el.addEventListener('mousedown', this.onStart);
  }

  onStart(e) {
    if (!this.editMode || !this.editMode.isEditMode) return;
    if (e.target.closest('.edit-delete-btn')) return; // 点了删除按钮不拖拽
    
    // 如果是鼠标右键，则不拖拽
    if (e.type === 'mousedown' && e.button !== 0) return;

    e.preventDefault();
    e.stopPropagation();

    const target = e.currentTarget;
    if (!target.classList.contains('desktop-item')) return;

    const pointer = e.type.includes('touch') ? e.touches[0] : e;
    
    // 获取初始位置和偏移
    const rect = target.getBoundingClientRect();
    const parentRect = target.parentElement.getBoundingClientRect();

    this.activeDrag = {
      el: target,
      startX: pointer.clientX,
      startY: pointer.clientY,
      initialLeft: rect.left - parentRect.left,
      initialTop: rect.top - parentRect.top,
      colSpan: parseInt(target.getAttribute('data-colspan')) || 1,
      rowSpan: parseInt(target.getAttribute('data-rowspan')) || 1,
      pageEl: target.closest('.desktop-page'),
      parentRect: parentRect
    };

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

  onEnd(e) {
    if (!this.activeDrag) return;

    document.removeEventListener('touchmove', this.onMove);
    document.removeEventListener('touchend', this.onEnd);
    document.removeEventListener('mousemove', this.onMove);
    document.removeEventListener('mouseup', this.onEnd);

    const el = this.activeDrag.el;
    el.classList.remove('is-dragging');

    this.snapToGrid();

    this.activeDrag = null;
  }

  snapToGrid() {
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

    // 简单的位置互换/推挤逻辑
    // 为了简单，直接交换位置或寻找最近空位
    const pageId = pageEl.getAttribute('data-page-id');
    const layoutItems = this.editMode.layout[pageId] || [];
    const draggedItemId = el.getAttribute('data-item-id');

    let conflictItem = null;
    for (const item of layoutItems) {
      if (item.id === draggedItemId) continue;
      
      // 检测重叠
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
        const myItem = layoutItems.find(i => i.id === draggedItemId);
        if (myItem) {
          const oldCol = myItem.col;
          const oldRow = myItem.row;
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
        }
      } else {
        // 尺寸不同，不让放置，恢复
      }
    } else {
      // 无冲突，直接更新
      const myItem = layoutItems.find(i => i.id === draggedItemId);
      if (myItem) {
        myItem.col = targetCol;
        myItem.row = targetRow;
      }
      el.setAttribute('data-col', targetCol);
      el.setAttribute('data-row', targetRow);
    }

    // 动画回到正确位置
    this.editMode.positionItemsDOM();
  }
}
