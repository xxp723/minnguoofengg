// @ts-nocheck
/**
 * 文件名: js/apps/chat/chat-phone.js
 * 用途: 闲谈应用 — 电话功能子模块
 * 架构层: 应用层（闲谈子模块）
 *
 * 说明：
 * 1. 负责聊天页中电话功能入口的点击事件拦截与弹窗渲染。
 * 2. 所有的持久化存储操作请通过项目中统一的 DB.js / IndexedDB 进行。
 * 3. 严禁使用 localStorage/sessionStorage 和浏览器原生弹窗。
 */

import { escapeHtml } from './chat-utils.js';
import { MSG_ICONS } from './chat-message-icons.js';
import { createApiErrorModal } from '../../core/ui/components/ApiErrorModal.js';

/* ==========================================================================
   [区域标注·本次修改·电话功能] 电话应用内弹窗渲染
   说明：
   1. 拦截“电话”入口点击事件后触发此弹窗。
   2. 占位用功能，只显示开发中提示。
   ========================================================================== */
export function openPhoneModal() {
  const modal = createApiErrorModal({
    title: '电话',
    message: `
      <div class="msg-phone-modal-body">
        <div class="msg-phone-modal-icon">
          ${MSG_ICONS.phone}
        </div>
        <div class="msg-phone-modal-text">
          电话功能还在开发中<br>敬请期待
        </div>
      </div>
    `,
    onRetry: () => {
      // 占位关闭逻辑，组件自带关闭按钮
    }
  });

  // 如果需要修改按钮文本或行为，可以直接操作 DOM，这里保持默认的“确认”按钮
  const retryBtn = modal.element.querySelector('.api-error-modal-btn--retry');
  if (retryBtn) {
    retryBtn.textContent = '我知道了';
  }

  document.body.appendChild(modal.element);
}
