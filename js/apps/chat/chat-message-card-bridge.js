// @ts-nocheck
/**
 * 文件名: js/apps/chat/chat-message-card-bridge.js
 * 用途: 闲谈应用 — 聊天消息页 HTML 卡片 iframe 全局桥接
 * 架构层: 应用层（闲谈子模块）
 *
 * 说明：
 * 1. 统一注册 HTML 卡片 iframe 的 postMessage 监听器。
 * 2. 负责高度自适应、双击桥接、交互事件桥接。
 * 3. 只做运行时 DOM/事件转发，不做任何持久化存储。
 * 4. 持久化仍由上层通过 DB.js / IndexedDB 处理，不使用 localStorage/sessionStorage。
 */

/* ==========================================================================
   [区域标注·已完成·本次拆分] 聊天消息页 HTML 卡片 iframe 全局桥接
   说明：
   1. 原 chat-message.js 中的 HTML 卡片 postMessage 监听器已拆分到本文件。
   2. 本文件只负责一次性注册全局监听，不直接依赖聊天 state，也不触碰持久化逻辑。
   3. iframe 内部的高度上报、双击收藏桥接、互动事件桥接仍保持原有行为不变。
   4. 仅在具备浏览器 DOM 环境时注册，避免模块初始化阶段因 window/document 不可用而导致闲谈应用启动失败。
   5. 全局只注册一次，避免重复绑定；持久化仍只走 DB.js / IndexedDB。
   ========================================================================== */
export function ensureChatHtmlCardMessageBridge() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__miniphone_card_message_bridge_listener__) return;

  window.__miniphone_card_message_bridge_listener__ = true;
  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || !String(data.type || '').startsWith('__miniphone_card_')) return;

    const iframes = document.querySelectorAll('.msg-html-card-bubble__frame, .favorite-html-card__iframe');
    for (const iframe of iframes) {
      if (iframe.contentWindow !== event.source) continue;

      if (data.type === '__miniphone_card_height__' && data.height) {
        iframe.style.height = Math.ceil(data.height) + 'px';
        break;
      }

      /* ======================================================================
         [区域标注·已完成·本次拆分] HTML卡片 iframe 双击收藏桥接
         说明：iframe 内部 dblclick 不能原生冒泡到聊天页，这里转成父页面可捕获的 dblclick，
               复用 index.js 的 HTML 卡片收藏逻辑，持久化仍只走 DB.js / IndexedDB。
         ====================================================================== */
      if (data.type === '__miniphone_card_dblclick__') {
        iframe.dispatchEvent(new MouseEvent('dblclick', {
          bubbles: true,
          cancelable: true,
          view: window
        }));
        break;
      }

      if (data.type === '__miniphone_card_interaction__') {
        iframe.dispatchEvent(new CustomEvent('miniphone-html-card-interaction', {
          bubbles: true,
          detail: {
            messageId: String(iframe.dataset.messageId || ''),
            text: String(data.text || '').trim(),
            value: String(data.value || '').trim(),
            checked: Boolean(data.checked),
            tagName: String(data.tagName || '').trim(),
            role: String(data.role || '').trim(),
            eventType: String(data.eventType || 'click').trim(),
            timestamp: Number(data.timestamp || Date.now()) || Date.now()
          }
        }));
        break;
      }
    }
  });
}
