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

import { MSG_ICONS } from './chat-message-icons.js';

/* ==========================================================================
   [区域标注·已完成·电话弹窗启动失败修复] 电话应用内弹窗渲染
   说明：
   1. 拦截“电话”入口点击事件后触发此弹窗。
   2. 占位用功能，只显示开发中提示，符合 UI 主题。
   3. 移除不存在的 createApiErrorModal 导致启动失败的导入。
   ========================================================================== */
export function openPhoneModal(container) {
  const mask = container.querySelector('[data-role="modal-mask"]');
  const panel = container.querySelector('[data-role="modal-panel"]');
  if (!mask || !panel) return;

  panel.innerHTML = `
    <div class="chat-modal-card">
      <div class="chat-modal-header">
        <h3 class="chat-modal-title">电话</h3>
        <button class="chat-modal-close-btn" data-action="close-modal" aria-label="关闭">
          <svg viewBox="0 0 48 48" fill="none"><path d="M14 14l20 20M34 14L14 34" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
      <div class="chat-modal-body" style="text-align: center; padding: 40px 20px;">
        <div style="color: #b15f34; margin-bottom: 16px;">
          ${MSG_ICONS.phone}
        </div>
        <div style="font-size: 15px; color: #5c422d; line-height: 1.6;">
          电话功能还在开发中<br>敬请期待
        </div>
      </div>
      <div class="chat-modal-footer">
        <button class="chat-modal-btn chat-modal-btn--primary" data-action="close-modal" type="button" style="width: 100%;">
          我知道了
        </button>
      </div>
    </div>
  `;

  mask.classList.remove('is-hidden');
}
