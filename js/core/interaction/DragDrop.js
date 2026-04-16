/**
 * 文件名: js/core/interaction/DragDrop.js
 * 用途: 桌面图标拖拽排序交互模块。
 *       使用 Pointer Events 实现触摸和鼠标兼容的自由拖拽，
 *       仅在编辑模式下生效。
 * 位置: /js/core/interaction/DragDrop.js
 * 架构层: 交互层（Interaction Layer）
 */
export class DragDrop {
  /**
   * @param {HTMLElement} desktopContainer
   * @param {import('./EventBus.js').EventBus} eventBus
   */
  constructor(desktopContainer, eventBus) {
    this.desktopContainer = desktopContainer;
    this.eventBus = eventBus;
    
    // 我们绑定到全局 body 上以支持跨容器（桌面和Dock）拖拽
    this.root = document.body;
    
    this.draggingAppId = null;
    this.ghostEl = null;
    this.originalIconEl = null;
    this.startX = 0;
    this.startY = 0;
    this.isDragging = false;
    this.dragThreshold = 5;

    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
  }

  bind() {
    this.root.addEventListener('pointerdown', this.onPointerDown);
  }

  unbind() {
    this.root.removeEventListener('pointerdown', this.onPointerDown);
    this.root.removeEventListener('pointermove', this.onPointerMove);
    this.root.removeEventListener('pointerup', this.onPointerUp);
    this.root.removeEventListener('pointercancel', this.onPointerUp);
  }

  onPointerDown(event) {
    // 仅在编辑模式下允许拖拽
    if (!document.body.classList.contains('is-edit-mode')) return;
    
    // 忽略删除按钮的点击
    if (event.target.closest('.delete-badge')) return;

    const iconEl = event.target.closest('.app-icon');
    if (!iconEl || !iconEl.dataset.appId) return;

    this.draggingAppId = iconEl.dataset.appId;
    this.originalIconEl = iconEl;
    this.startX = event.clientX;
    this.startY = event.clientY;
    this.isDragging = false;

    this.root.addEventListener('pointermove', this.onPointerMove);
    this.root.addEventListener('pointerup', this.onPointerUp);
    this.root.addEventListener('pointercancel', this.onPointerUp);
    
    // 设置 pointer capture 确保我们能收到后续事件
    try {
      this.root.setPointerCapture(event.pointerId);
    } catch (e) {}
  }

  onPointerMove(event) {
    if (!this.draggingAppId || !this.originalIconEl) return;

    const dx = event.clientX - this.startX;
    const dy = event.clientY - this.startY;

    if (!this.isDragging) {
      if (Math.abs(dx) > this.dragThreshold || Math.abs(dy) > this.dragThreshold) {
        this.isDragging = true;
        this.createGhost(event.clientX, event.clientY);
        this.originalIconEl.style.opacity = '0.3'; // 视觉上变淡
      }
    }

    if (this.isDragging && this.ghostEl) {
      // 移动幽灵元素，居中于指针
      this.ghostEl.style.left = `${event.clientX}px`;
      this.ghostEl.style.top = `${event.clientY}px`;
      
      // 检查下方元素以实现交互反馈（可选）
      // 这里可以添加高亮目标位置的逻辑
    }
  }

  onPointerUp(event) {
    this.root.removeEventListener('pointermove', this.onPointerMove);
    this.root.removeEventListener('pointerup', this.onPointerUp);
    this.root.removeEventListener('pointercancel', this.onPointerUp);
    
    try {
      this.root.releasePointerCapture(event.pointerId);
    } catch (e) {}

    if (this.isDragging && this.ghostEl) {
      // 找到指针下方的元素（忽略幽灵元素本身）
      this.ghostEl.style.display = 'none';
      const targetEl = document.elementFromPoint(event.clientX, event.clientY);
      this.ghostEl.style.display = 'block';

      if (targetEl) {
        const targetIcon = targetEl.closest('.app-icon');
        if (targetIcon && targetIcon.dataset.appId && targetIcon.dataset.appId !== this.draggingAppId) {
          // 触发交换事件
          this.eventBus.emit('desktop:icon-move', {
            fromAppId: this.draggingAppId,
            toAppId: targetIcon.dataset.appId
          });
        }
      }
    }

    // 清理状态
    if (this.originalIconEl) {
      this.originalIconEl.style.opacity = '';
    }
    if (this.ghostEl) {
      this.ghostEl.remove();
      this.ghostEl = null;
    }
    
    this.draggingAppId = null;
    this.originalIconEl = null;
    this.isDragging = false;
  }

  createGhost(x, y) {
    this.ghostEl = this.originalIconEl.cloneNode(true);
    this.ghostEl.classList.add('is-dragging-ghost');
    this.ghostEl.style.position = 'fixed';
    this.ghostEl.style.pointerEvents = 'none'; // 确保不阻止鼠标事件
    this.ghostEl.style.zIndex = '9999';
    this.ghostEl.style.transform = 'translate(-50%, -50%) scale(1.1)'; // 放大一点并居中
    this.ghostEl.style.left = `${x}px`;
    this.ghostEl.style.top = `${y}px`;
    this.ghostEl.style.opacity = '0.9';
    
    // 如果是 Dock 里的图标，移除 dock-icon 类以防止样式冲突
    this.ghostEl.classList.remove('dock-icon');
    
    document.body.appendChild(this.ghostEl);
  }
}
