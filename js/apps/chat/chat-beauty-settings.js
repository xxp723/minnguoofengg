// @ts-nocheck
/**
 * 文件名: js/apps/chat/chat-beauty-settings.js
 * 用途: 闲谈应用 — 聊天设置页“聊天美化 / 聊天背景”独立模块
 * 架构层: 应用层（闲谈子模块）
 *
 * 说明：
 * 1. 本模块只服务用户本次要求新增的“聊天美化 → 聊天背景”区域。
 * 2. 聊天背景随当前聊天对象写入 chatPromptSettings，并通过 DB.js / IndexedDB 持久化。
 * 3. 禁止 localStorage/sessionStorage；不写双份存储兜底；不做长文本字段过滤。
 * 4. 所有弹窗均复用闲谈应用内 chat-modal 样式，不使用浏览器原生弹窗或原生选择器。
 */

import { escapeHtml, dbPut, getCurrentChatPromptSettingsKey, renderModalNotice, closeModal } from './chat-utils.js';
import { MSG_ICONS } from './chat-message-icons.js';

/* ==========================================================================
   [区域标注·已完成·聊天美化数据规范化]
   说明：
   1. 当前仅规范化聊天背景 chatBackgroundSrc，保存位置为当前会话 chatPromptSettings。
   2. 持久化由 confirmChatBackgroundSelection() 调用 DB.js / IndexedDB 完成。
   3. 不使用 localStorage/sessionStorage，不写双份兜底，不做大文本字段过滤。
   ========================================================================== */
export function normalizeChatBeautySettings(chatSettings = {}) {
  const source = chatSettings && typeof chatSettings === 'object' ? chatSettings : {};
  return {
    chatBackgroundSrc: String(source.chatBackgroundSrc || '').trim()
  };
}

function escapeCssUrlValue(value = '') {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '')
    .replace(/\r/g, '');
}

/* ==========================================================================
   [区域标注·已完成·当前聊天窗口背景样式生成]
   说明：
   1. 供 chat-message-render.js 首屏渲染消息列表时直接带上背景 class/style，减少页面闪屏。
   2. 只读取运行时 chatSettings，不涉及任何持久化存储。
   ========================================================================== */
export function getChatBackgroundListAreaAttrs(chatSettings = {}) {
  const { chatBackgroundSrc } = normalizeChatBeautySettings(chatSettings);
  if (!chatBackgroundSrc) {
    return {
      className: '',
      styleAttr: ''
    };
  }

  return {
    className: 'has-chat-background',
    styleAttr: ` style="--msg-chat-background-image: url('${escapeHtml(escapeCssUrlValue(chatBackgroundSrc))}');"`
  };
}

/* ==========================================================================
   [区域标注·已完成·当前聊天窗口背景 DOM 同步]
   说明：
   1. 确认更换聊天背景后，立即同步当前聊天窗口 data-role="msg-list" 的背景。
   2. 只做局部 DOM 更新，不重渲染整页，避免闪屏。
   3. 不涉及 localStorage/sessionStorage；保存动作由确认分支单独写入 DB.js / IndexedDB。
   ========================================================================== */
export function applyChatBackgroundToCurrentWindow(container, state = {}) {
  const listArea = container?.querySelector?.('[data-role="msg-list"]');
  if (!listArea) return;

  const { chatBackgroundSrc } = normalizeChatBeautySettings(state.chatPromptSettings || {});
  listArea.classList.toggle('has-chat-background', Boolean(chatBackgroundSrc));
  if (chatBackgroundSrc) {
    listArea.style.setProperty('--msg-chat-background-image', `url("${escapeCssUrlValue(chatBackgroundSrc)}")`);
  } else {
    listArea.style.removeProperty('--msg-chat-background-image');
  }
}

function renderChatBackgroundPreviewHtml(src = '', extraClass = '') {
  const safeSrc = String(src || '').trim();
  const className = ['msg-chat-beauty-preview', extraClass].filter(Boolean).join(' ');
  return `
    <div class="${escapeHtml(className)}" data-role="chat-background-preview">
      ${safeSrc
        ? `<img src="${escapeHtml(safeSrc)}" alt="当前聊天背景" decoding="async">`
        : `<div class="msg-chat-beauty-preview__empty">${MSG_ICONS.image}<span>未设置</span></div>`}
    </div>
  `;
}

/* ==========================================================================
   [区域标注·已完成·聊天美化设置页 HTML]
   说明：
   1. 本区域插入在“双语模式”板块下方，结构参考“功能玩法”板块。
   2. “聊天背景”使用右侧 IconPark 风格箭头折叠，展开后抽屉式显示“更换聊天背景”设置栏。
   3. 左侧竖长方框显示当前聊天背景；右侧“更换”按钮打开应用内选择弹窗。
   4. 隐藏 file input 只负责触发系统文件选择；图片确认前仅保存在运行时草稿，不写入 IndexedDB。
   ========================================================================== */
export function renderChatBeautySettingsSection(chatSettings = {}) {
  const { chatBackgroundSrc } = normalizeChatBeautySettings(chatSettings);

  return `
        <!-- ==================================================================
             [区域标注·已完成·本次新增：聊天美化聊天背景板块]
             说明：
             1. 本板块位于“双语模式”板块下方，样式参照“功能玩法”板块。
             2. 点击“聊天背景”折叠栏后，向下抽屉式展开“更换聊天背景”设置栏。
             3. 左侧竖长方框预览当前聊天背景，右侧“更换”按钮打开应用内弹窗。
             4. 弹窗支持本地图片 / URL 图片；只有点击“确认”后才写入 chatPromptSettings 并同步当前聊天窗口背景。
             5. 持久化统一走 DB.js / IndexedDB；不使用 localStorage/sessionStorage，不写双份兜底，不做长文本过滤。
             ================================================================== -->
        <section class="msg-settings-chat-beauty-section">
          <div class="msg-settings-section-title">聊天美化</div>
          <section class="msg-settings-card msg-settings-chat-beauty-card">
            <div class="msg-settings-chat-beauty-background">
              <button
                class="msg-settings-row msg-settings-chat-beauty-toggle"
                data-action="toggle-settings-sticker-drawer"
                type="button"
                aria-label="展开聊天背景"
                aria-expanded="false">
                <span class="msg-settings-card__title">聊天背景</span>
                <span class="msg-settings-chat-beauty-arrow" aria-hidden="true">
                  <svg viewBox="0 0 48 48" fill="none">
                    <path d="M19 12l12 12-12 12" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </span>
              </button>
              <div class="msg-settings-chat-beauty-drawer" data-role="settings-chat-background-drawer">
                <div class="msg-settings-chat-beauty-drawer__inner">
                  <div class="msg-chat-background-setting-row">
                    ${renderChatBackgroundPreviewHtml(chatBackgroundSrc, 'msg-chat-beauty-preview--setting')}
                    <div class="msg-chat-background-setting-row__actions">
                      <div class="msg-settings-card__title">更换聊天背景</div>
                      <button class="msg-chat-background-change-btn" data-action="open-chat-background-modal" type="button">
                        ${MSG_ICONS.image}<span>更换</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <input data-role="chat-background-file-input" type="file" accept="image/*" hidden>
            </div>
          </section>
        </section>
  `;
}

function getPendingChatBackgroundDraft(state = {}) {
  if (!state.pendingChatBackgroundDraft || typeof state.pendingChatBackgroundDraft !== 'object') {
    const { chatBackgroundSrc } = normalizeChatBeautySettings(state.chatPromptSettings || {});
    state.pendingChatBackgroundDraft = {
      source: chatBackgroundSrc ? 'url' : 'local',
      src: '',
      url: chatBackgroundSrc || ''
    };
  }
  return state.pendingChatBackgroundDraft;
}

function renderChatBackgroundModalBody(state = {}) {
  const draft = getPendingChatBackgroundDraft(state);
  const selectedSrc = String(draft.src || draft.url || '').trim();
  const source = String(draft.source || 'local') === 'url' ? 'url' : 'local';

  return `
    <div class="msg-chat-background-modal" data-role="chat-background-modal">
      <div class="msg-chat-background-source-tabs" role="tablist" aria-label="聊天背景来源">
        <button class="msg-chat-background-source-tab ${source === 'local' ? 'is-active' : ''}" data-action="set-chat-background-source" data-source="local" type="button">
          ${MSG_ICONS.upload}<span>本地图片</span>
        </button>
        <button class="msg-chat-background-source-tab ${source === 'url' ? 'is-active' : ''}" data-action="set-chat-background-source" data-source="url" type="button">
          ${MSG_ICONS.link}<span>URL链接</span>
        </button>
      </div>
      <div class="msg-chat-background-modal__content">
        ${renderChatBackgroundPreviewHtml(selectedSrc, 'msg-chat-beauty-preview--modal')}
        <div class="msg-chat-background-modal__fields">
          ${source === 'local'
            ? `
              <button class="msg-chat-background-local-btn" data-action="open-chat-background-local-picker" type="button">
                ${MSG_ICONS.upload}<span>${draft.src ? '重新选择本地图片' : '选择本地图片'}</span>
              </button>
            `
            : `
              <label class="msg-chat-background-url-field">
                <span>URL链接图片</span>
                <input class="chat-modal-search" data-role="chat-background-url-input" type="text" placeholder="https://example.com/background.png" value="${escapeHtml(draft.url || '')}">
              </label>
            `}
        </div>
      </div>
      <div class="chat-modal-notice" data-role="modal-notice"></div>
    </div>
  `;
}

/* ==========================================================================
   [区域标注·已完成·聊天背景应用内弹窗]
   说明：
   1. 弹窗只包含右上角“关闭”和右下角“确认”按钮，沿用 chat-modal 暖色主题。
   2. 来源切换、本地图片读取、URL 输入都只更新运行时草稿；确认前不保存。
   3. 不使用浏览器原生 alert/confirm/prompt，不使用原生选择器控件。
   ========================================================================== */
export function showChatBackgroundModal(container, state = {}) {
  state.pendingChatBackgroundDraft = {
    source: 'local',
    src: '',
    url: normalizeChatBeautySettings(state.chatPromptSettings || {}).chatBackgroundSrc || ''
  };

  const mask = container.querySelector('[data-role="modal-mask"]');
  if (!mask) return;

  mask.classList.remove('is-hidden');
  mask.innerHTML = `
    <div class="chat-modal-panel chat-background-modal-panel" role="dialog" aria-modal="true" aria-label="更换聊天背景">
      <div class="chat-modal-header">
        <span>更换聊天背景</span>
        <button class="chat-modal-close" data-action="close-modal" type="button" aria-label="关闭">${MSG_ICONS.close}</button>
      </div>
      <div class="chat-modal-body">
        ${renderChatBackgroundModalBody(state)}
      </div>
      <div class="chat-modal-footer">
        <button class="chat-modal-btn chat-modal-btn--primary" data-action="confirm-chat-background" type="button">确认</button>
      </div>
    </div>
  `;
}

export function rerenderChatBackgroundModal(container, state = {}) {
  const body = container.querySelector('[data-role="chat-background-modal"]');
  if (!body) return;
  body.outerHTML = renderChatBackgroundModalBody(state);
}

export function setChatBackgroundSource(container, state = {}, source = 'local') {
  const draft = getPendingChatBackgroundDraft(state);
  state.pendingChatBackgroundDraft = {
    ...draft,
    source: String(source || 'local') === 'url' ? 'url' : 'local'
  };
  rerenderChatBackgroundModal(container, state);
}

export function openChatBackgroundLocalPicker(container) {
  const input = container.querySelector('[data-role="chat-background-file-input"]');
  if (!input) return false;
  input.value = '';
  input.click();
  return true;
}

/* ==========================================================================
   [区域标注·已完成·聊天背景本地图片草稿]
   说明：
   1. 读取本地图片为 data URL 后仅暂存 state.pendingChatBackgroundDraft.src。
   2. 只有用户在弹窗中点击“确认”后，才写入 chatPromptSettings 与 IndexedDB。
   ========================================================================== */
export function handleChatBackgroundFileInputChange(file, state = {}, container) {
  if (!file) return;

  if (!/^image\//i.test(file.type || '')) {
    renderModalNotice(container, '请选择图片文件');
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const imageUrl = String(reader.result || '');
    if (!imageUrl.startsWith('data:image/')) {
      renderModalNotice(container, '图片读取失败，请重新选择');
      return;
    }

    const draft = getPendingChatBackgroundDraft(state);
    state.pendingChatBackgroundDraft = {
      ...draft,
      source: 'local',
      src: imageUrl
    };
    rerenderChatBackgroundModal(container, state);
  };
  reader.onerror = () => renderModalNotice(container, '图片读取失败，请重新选择');
  reader.readAsDataURL(file);
}

export async function confirmChatBackgroundSelection(container, state = {}, db) {
  const draft = getPendingChatBackgroundDraft(state);
  const source = String(draft.source || 'local') === 'url' ? 'url' : 'local';
  let nextSrc = '';

  if (source === 'url') {
    const input = container.querySelector('[data-role="chat-background-url-input"]');
    nextSrc = String(input?.value || draft.url || '').trim();
    if (!/^https?:\/\/\S+/i.test(nextSrc) && !/^data:image\//i.test(nextSrc)) {
      renderModalNotice(container, '请输入有效的图片 URL');
      return;
    }
  } else {
    nextSrc = String(draft.src || '').trim();
    if (!nextSrc.startsWith('data:image/')) {
      renderModalNotice(container, '请先选择本地图片');
      return;
    }
  }

  state.chatPromptSettings = {
    ...(state.chatPromptSettings || {}),
    chatBackgroundSrc: nextSrc
  };

  await dbPut(db, getCurrentChatPromptSettingsKey(state), state.chatPromptSettings);
  applyChatBackgroundToCurrentWindow(container, state);
  syncChatBackgroundSettingsPreview(container, state);
  state.pendingChatBackgroundDraft = null;
  closeModal(container);
}

export function syncChatBackgroundSettingsPreview(container, state = {}) {
  const { chatBackgroundSrc } = normalizeChatBeautySettings(state.chatPromptSettings || {});
  const preview = container.querySelector('.msg-chat-beauty-section [data-role="chat-background-preview"]');
  if (!preview) return;
  preview.outerHTML = renderChatBackgroundPreviewHtml(chatBackgroundSrc, 'msg-chat-beauty-preview--setting');
}
