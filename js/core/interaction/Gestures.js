/**
 * 文件名: js/core/interaction/Gestures.js
 * 用途: 手势识别模块。
 *       当前提供基础能力：
 *       - 长按图标进入编辑模式（预留事件）
 *       - 桌面左右滑动切屏（利用 scroll-snap，内部仅辅助事件广播）
 *       后续可扩展双击、双指缩放、边缘返回等手势。
 * 位置: /js/core/interaction/Gestures.js
 * 架构层: 交互层（Interaction Layer）
 */
export class Gestures {
  /**
   * @param {HTMLElement} desktopContainer
   * @param {import('./EventBus.js').EventBus} eventBus
   */
  constructor(desktopContainer, eventBus) {
    this.desktopContainer = desktopContainer;
    this.eventBus = eventBus;

    this.longPressTimer = null;
    this.longPressDelay = 500;
    this.startX = 0;
    this.lastPageIndex = 0;

    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onScroll = this.onScroll.bind(this);
  }

  bind() {
    if (!this.desktopContainer) return;

    this.desktopContainer.addEventListener('pointerdown', this.onPointerDown);
    this.desktopContainer.addEventListener('pointerup', this.onPointerUp);
    this.desktopContainer.addEventListener('pointercancel', this.onPointerUp);
    this.desktopContainer.addEventListener('pointermove', this.onPointerMove);
    this.desktopContainer.addEventListener('scroll', this.onScroll);
  }

  unbind() {
    if (!this.desktopContainer) return;

    this.desktopContainer.removeEventListener('pointerdown', this.onPointerDown);
    this.desktopContainer.removeEventListener('pointerup', this.onPointerUp);
    this.desktopContainer.removeEventListener('pointercancel', this.onPointerUp);
    this.desktopContainer.removeEventListener('pointermove', this.onPointerMove);
    this.desktopContainer.removeEventListener('scroll', this.onScroll);
  }

  onPointerDown(event) {
    this.startX = event.clientX;
    const iconEl = event.target.closest('.app-icon');

    this.clearLongPressTimer();
    this.longPressTimer = setTimeout(() => {
      const appId = iconEl ? iconEl.dataset.appId : null;
      this.eventBus.emit('desktop:edit-mode', { appId, trigger: 'long-press' });
    }, this.longPressDelay);
  }

  onPointerMove(event) {
    const moveDistance = Math.abs(event.clientX - this.startX);
    if (moveDistance > 8) {
      this.clearLongPressTimer();
    }
  }

  onPointerUp() {
    this.clearLongPressTimer();
  }

  onScroll() {
    const width = this.desktopContainer.clientWidth || 1;
    const scrollLeft = this.desktopContainer.scrollLeft;
    const pageIndex = Math.round(scrollLeft / width);

    // Apply snap directly to prevent scrolling past limits
    if (this.scrollTimeout) clearTimeout(this.scrollTimeout);
    
    this.scrollTimeout = setTimeout(() => {
      const targetScrollLeft = pageIndex * width;
      if (Math.abs(scrollLeft - targetScrollLeft) > 1) {
        this.desktopContainer.scrollTo({
          left: targetScrollLeft,
          behavior: 'smooth'
        });
      }
    }, 150);

    if (pageIndex !== this.lastPageIndex) {
      this.lastPageIndex = pageIndex;
      this.eventBus.emit('desktop:page-changed', { pageIndex });
    }
  }

  clearLongPressTimer() {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }
}
