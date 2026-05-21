// @ts-nocheck
/**
 * 文件名: js/apps/chat/chat-beauty-settings.js
 * 用途: 闲谈应用 — 聊天设置页“聊天美化 / 聊天背景”独立模块
 * 架构层: 应用层（闲谈子模块）
 *
 * 说明：
 * 1. 本模块只服务“聊天美化 → 聊天背景”区域。
 * 2. 聊天背景随当前聊天对象写入 chatPromptSettings，并通过 DB.js / IndexedDB 持久化。
 * 3. 禁止 localStorage/sessionStorage；不写双份存储兜底；不做长文本字段过滤。
 * 4. 所有弹窗均复用闲谈应用内 chat-modal 样式，不使用浏览器原生弹窗或原生选择器。
 * 5. 已完成本地大图 Blob 入库、运行时 objectURL 预览/应用、来源持久化与“删除”恢复默认背景。
 */

import { escapeHtml, dbPut, getCurrentChatPromptSettingsKey, renderModalNotice, closeModal, STORE_NAME } from './chat-utils.js';
import { MSG_ICONS } from './chat-message-icons.js';

const CHAT_BACKGROUND_MEDIA_RECORD_PREFIX = 'chat_background_media';
const chatBackgroundRuntimeUrlByKey = new Map();

function createChatBackgroundMediaKey(state = {}) {
  const maskId = String(state.activeMaskId || 'default').replace(/[^\w-]/g, '_');
  const chatId = String(state.currentChatId || 'default').replace(/[^\w-]/g, '_');
  return `${CHAT_BACKGROUND_MEDIA_RECORD_PREFIX}_${maskId}_${chatId}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function isBlobUrl(value = '') {
  return String(value || '').startsWith('blob:');
}

function revokeChatBackgroundRuntimeUrl(mediaKey = '') {
  const key = String(mediaKey || '').trim();
  const url = key ? chatBackgroundRuntimeUrlByKey.get(key) : '';
  if (url && isBlobUrl(url)) {
    URL.revokeObjectURL(url);
  }
  if (key) chatBackgroundRuntimeUrlByKey.delete(key);
}

function setChatBackgroundRuntimeUrl(mediaKey = '', url = '') {
  const key = String(mediaKey || '').trim();
  const safeUrl = String(url || '').trim();
  if (!key || !safeUrl) return '';

  const existing = chatBackgroundRuntimeUrlByKey.get(key);
  if (existing && existing !== safeUrl && isBlobUrl(existing)) {
    URL.revokeObjectURL(existing);
  }

  chatBackgroundRuntimeUrlByKey.set(key, safeUrl);
  return safeUrl;
}

function cleanupPendingChatBackgroundDraft(draft = null) {
  if (draft?.previewObjectUrl && isBlobUrl(draft.previewObjectUrl)) {
    URL.revokeObjectURL(draft.previewObjectUrl);
  }
}

async function readChatBackgroundMediaRecord(db, mediaKey = '') {
  const key = String(mediaKey || '').trim();
  if (!db || typeof db.get !== 'function' || !key) return null;

  try {
    const record = await db.get(STORE_NAME, key);
    return record ? (record.data ?? record.value ?? null) : null;
  } catch (error) {
    console.error('[Chat] 聊天背景图片读取失败:', key, error);
    return null;
  }
}

async function persistChatBackgroundMediaRecord(db, mediaKey = '', file) {
  const key = String(mediaKey || '').trim();
  if (!db || typeof db.put !== 'function' || !key || !(file instanceof Blob)) return false;

  try {
    await db.put(STORE_NAME, {
      id: key,
      appId: 'chat',
      data: {
        blob: file,
        name: String(file.name || 'chat-background'),
        type: String(file.type || 'image/*'),
        size: Number(file.size || 0),
        createdAt: Date.now()
      }
    });
    return true;
  } catch (error) {
    console.error('[Chat] 聊天背景图片写入失败:', key, error);
    return false;
  }
}

async function deleteChatBackgroundMediaRecord(db, mediaKey = '') {
  const key = String(mediaKey || '').trim();
  if (!key) return;

  revokeChatBackgroundRuntimeUrl(key);

  if (!db || typeof db.delete !== 'function') return;
  try {
    await db.delete(STORE_NAME, key);
  } catch (error) {
    console.error('[Chat] 聊天背景图片删除失败:', key, error);
  }
}

function getChatBackgroundBlobFromRecord(record = null) {
  if (record instanceof Blob) return record;
  if (record?.blob instanceof Blob) return record.blob;
  if (record?.file instanceof Blob) return record.file;
  return null;
}

/* ==========================================================================
   [区域标注·已完成·聊天美化背景 Blob 运行时恢复]
   说明：
   1. 本地聊天背景原图保存为 DB.js / IndexedDB appsData 中的 Blob 记录，chatPromptSettings 只保存轻量 mediaKey。
   2. 进入聊天页或确认更换后，按 mediaKey 读取 Blob 并生成运行时 objectURL，避免把超过 1MB 的 data URL 塞进设置对象。
   3. objectURL 只保存在本模块运行时 Map，不写入 localStorage/sessionStorage，也不写入双份兜底存储。
   ========================================================================== */
export async function prepareChatBackgroundRuntimeUrl(state = {}, db) {
  const settings = state.chatPromptSettings && typeof state.chatPromptSettings === 'object'
    ? state.chatPromptSettings
    : {};
  const source = String(settings.chatBackgroundSource || '').trim();
  const mediaKey = String(settings.chatBackgroundMediaKey || '').trim();

  if (source !== 'local' || !mediaKey) return '';

  const cachedUrl = chatBackgroundRuntimeUrlByKey.get(mediaKey);
  if (cachedUrl) return cachedUrl;

  const mediaRecord = await readChatBackgroundMediaRecord(db, mediaKey);
  const blob = getChatBackgroundBlobFromRecord(mediaRecord);
  if (!blob) return '';

  const objectUrl = URL.createObjectURL(blob);
  return setChatBackgroundRuntimeUrl(mediaKey, objectUrl);
}

/* ==========================================================================
   [区域标注·已完成·聊天美化数据规范化：IndexedDB Blob 背景]
   说明：
   1. URL 背景继续使用 chatBackgroundSrc 保存 URL；本地背景使用 chatBackgroundMediaKey 指向 DB.js / IndexedDB Blob 记录。
   2. chatBackgroundSrc 的本地大图运行时值来自 objectURL 缓存，不再新增 data URL 持久化写入。
   3. chatBackgroundSource 用于区分 local/url，避免本地图下次打开被塞进 URL 输入框。
   4. 不使用 localStorage/sessionStorage，不写双份兜底，不做大文本字段过滤。
   ========================================================================== */
export function normalizeChatBeautySettings(chatSettings = {}) {
  const source = chatSettings && typeof chatSettings === 'object' ? chatSettings : {};
  const persistedSrc = String(source.chatBackgroundSrc || '').trim();
  const chatBackgroundMediaKey = String(source.chatBackgroundMediaKey || '').trim();
  const runtimeBlobSrc = chatBackgroundMediaKey
    ? String(chatBackgroundRuntimeUrlByKey.get(chatBackgroundMediaKey) || '').trim()
    : '';
  const chatBackgroundSrc = runtimeBlobSrc || persistedSrc;
  const rawSource = String(source.chatBackgroundSource || '').trim();
  const chatBackgroundSource = rawSource === 'local' || rawSource === 'url'
    ? rawSource
    : (chatBackgroundMediaKey || chatBackgroundSrc.startsWith('data:image/') || chatBackgroundSrc.startsWith('blob:') ? 'local' : 'url');

  return {
    chatBackgroundSrc,
    chatBackgroundSource: (chatBackgroundSrc || chatBackgroundMediaKey) ? chatBackgroundSource : 'local',
    chatBackgroundMediaKey
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
   [区域标注·已完成·当前聊天窗口背景样式生成：支持 Blob objectURL]
   说明：
   1. 供 chat-message-render.js 首屏渲染聊天背景专用底层、会话容器与消息列表时直接带上背景 class/style，减少页面闪屏。
   2. 同一 CSS 变量作用于 .msg-chat-background-layer，并同步给外层状态类用于控制透明层级。
   3. 只读取运行时 chatSettings / objectURL 缓存，不涉及任何持久化存储。
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
   [区域标注·已完成·当前聊天窗口背景 DOM 同步：Blob 背景局部更新]
   说明：
   1. 确认更换聊天背景后，立即同步当前聊天窗口 .msg-chat-background-layer、.msg-page、data-role="msg-conversation" 与 data-role="msg-list"。
   2. 背景图片真正显示在 .msg-chat-background-layer 专用底层；顶栏、消息列表、底栏都叠在它上方。
   3. 只做局部 DOM 更新，不重渲染整页，避免闪屏。
   4. 不涉及 localStorage/sessionStorage；保存动作由确认分支单独写入 DB.js / IndexedDB。
   ========================================================================== */
export function applyChatBackgroundToCurrentWindow(container, state = {}) {
  const conversation = container?.querySelector?.('[data-role="msg-conversation"]');
  const { chatBackgroundSrc } = normalizeChatBeautySettings(state.chatPromptSettings || {});
  let backgroundLayer = container?.querySelector?.('[data-role="msg-chat-background-layer"]');

  if (conversation && !backgroundLayer) {
    conversation.insertAdjacentHTML('afterbegin', '<div class="msg-chat-background-layer" data-role="msg-chat-background-layer"></div>');
    backgroundLayer = conversation.querySelector('[data-role="msg-chat-background-layer"]');
  }

  const targets = [
    container?.querySelector?.('.msg-page'),
    conversation,
    container?.querySelector?.('[data-role="msg-list"]'),
    backgroundLayer
  ].filter(Boolean);

  targets.forEach(target => {
    target.classList.toggle('has-chat-background', Boolean(chatBackgroundSrc));
    if (chatBackgroundSrc) {
      target.style.setProperty('--msg-chat-background-image', `url("${escapeCssUrlValue(chatBackgroundSrc)}")`);
    } else {
      target.style.removeProperty('--msg-chat-background-image');
    }
  });
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
   [区域标注·已完成·聊天美化设置页 HTML：大图 Blob 背景]
   说明：
   1. 本区域插入在“双语模式”板块下方，结构参考“功能玩法”板块。
   2. “聊天背景”使用右侧 IconPark 风格箭头折叠，展开后抽屉式显示“更换聊天背景”设置栏。
   3. 左侧竖长方框显示当前聊天背景；右侧“更换 / 删除”按钮分别负责应用内选择与恢复默认背景。
   4. 隐藏 file input 只负责触发系统文件选择；图片确认前仅保存在运行时草稿，不写入 IndexedDB。
   5. 删除按钮会清空当前会话聊天背景引用并删除对应 Blob 记录，仅通过 DB.js / IndexedDB 保存。
   ========================================================================== */
export function renderChatBeautySettingsSection(chatSettings = {}) {
  const { chatBackgroundSrc } = normalizeChatBeautySettings(chatSettings);

  return `
        <!-- ==================================================================
             [区域标注·已完成·聊天美化聊天背景板块：大图 Blob 入库与透明背景同步]
             说明：
             1. 本板块位于“双语模式”板块下方，样式参照“功能玩法”板块。
             2. 点击“聊天背景”折叠栏后，向下抽屉式展开“更换聊天背景”设置栏。
             3. 左侧竖长方框预览当前聊天背景，右侧“更换 / 删除”按钮分别打开应用内弹窗与恢复默认背景。
             4. 弹窗支持本地图片 / URL 图片；本地图片确认后以 Blob 写入 DB.js / IndexedDB，设置对象只保存 mediaKey。
             5. “确认 / 删除”均通过 DB.js / IndexedDB 写入当前 chatPromptSettings，并同步当前聊天窗口背景。
             6. 本区域仅保留 IndexedDB 单一路径，不写双份兜底，不做长文本过滤。
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
                      <div class="msg-chat-background-setting-row__buttons">
                        <button class="msg-chat-background-change-btn" data-action="open-chat-background-modal" type="button">
                          ${MSG_ICONS.image}<span>更换</span>
                        </button>
                        <button class="msg-chat-background-delete-btn" data-action="delete-chat-background" type="button">
                          ${MSG_ICONS.delete}<span>删除</span>
                        </button>
                      </div>
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
    const { chatBackgroundSrc, chatBackgroundSource, chatBackgroundMediaKey } = normalizeChatBeautySettings(state.chatPromptSettings || {});
    state.pendingChatBackgroundDraft = {
      source: chatBackgroundSrc || chatBackgroundMediaKey ? chatBackgroundSource : 'local',
      src: chatBackgroundSource === 'local' ? chatBackgroundSrc : '',
      url: chatBackgroundSource === 'url' ? chatBackgroundSrc : '',
      mediaKey: chatBackgroundSource === 'local' ? chatBackgroundMediaKey : '',
      file: null,
      previewObjectUrl: ''
    };
  }
  return state.pendingChatBackgroundDraft;
}

function renderChatBackgroundModalBody(state = {}) {
  const draft = getPendingChatBackgroundDraft(state);
  const source = String(draft.source || 'local') === 'url' ? 'url' : 'local';
  const selectedSrc = String(source === 'local' ? draft.src : draft.url).trim();

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
                ${MSG_ICONS.upload}<span>${draft.src || draft.mediaKey ? '重新选择本地图片' : '选择本地图片'}</span>
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
   [区域标注·已完成·聊天背景应用内弹窗：本地大图 Blob 草稿]
   说明：
   1. 弹窗只包含右上角“关闭”和右下角“确认”按钮，沿用 chat-modal 暖色主题。
   2. 来源切换、本地图片读取、URL 输入都只更新运行时草稿；确认前不保存。
   3. 本地来源预览使用 objectURL，不再把本地大图读取为 data URL，避免超过 1MB 背景无法替换。
   4. 不使用浏览器原生 alert/confirm/prompt，不使用原生选择器控件。
   ========================================================================== */
export function showChatBackgroundModal(container, state = {}) {
  cleanupPendingChatBackgroundDraft(state.pendingChatBackgroundDraft);

  const { chatBackgroundSrc, chatBackgroundSource, chatBackgroundMediaKey } = normalizeChatBeautySettings(state.chatPromptSettings || {});
  state.pendingChatBackgroundDraft = {
    source: chatBackgroundSrc || chatBackgroundMediaKey ? chatBackgroundSource : 'local',
    src: chatBackgroundSource === 'local' ? chatBackgroundSrc : '',
    url: chatBackgroundSource === 'url' ? chatBackgroundSrc : '',
    mediaKey: chatBackgroundSource === 'local' ? chatBackgroundMediaKey : '',
    file: null,
    previewObjectUrl: ''
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
   [区域标注·已完成·聊天背景本地图片草稿：objectURL 预览]
   说明：
   1. 本地图片选择后仅把 File 和 objectURL 暂存到 state.pendingChatBackgroundDraft。
   2. 不再读取为 data URL；只有用户在弹窗中点击“确认”后，才把 File 作为 Blob 写入 DB.js / IndexedDB。
   3. 预览 objectURL 只存在运行时，切换草稿时及时释放，避免页面闪屏与内存堆积。
   ========================================================================== */
export function handleChatBackgroundFileInputChange(file, state = {}, container) {
  if (!file) return;

  if (!/^image\//i.test(file.type || '')) {
    renderModalNotice(container, '请选择图片文件');
    return;
  }

  const draft = getPendingChatBackgroundDraft(state);
  cleanupPendingChatBackgroundDraft(draft);

  const previewUrl = URL.createObjectURL(file);
  state.pendingChatBackgroundDraft = {
    ...draft,
    source: 'local',
    src: previewUrl,
    mediaKey: '',
    file,
    previewObjectUrl: previewUrl
  };
  rerenderChatBackgroundModal(container, state);
}

/* ==========================================================================
   [区域标注·已完成·聊天背景确认保存：本地大图 IndexedDB Blob]
   说明：
   1. URL 背景只保存 URL；本地图片保存 Blob 记录，chatPromptSettings 只保存 mediaKey。
   2. 更换来源或删除旧本地背景时，同步删除旧 Blob 记录，避免残留垃圾数据。
   3. 保存后仅局部同步当前聊天窗口背景和设置页预览，不重渲染整页，避免闪屏。
   ========================================================================== */
export async function confirmChatBackgroundSelection(container, state = {}, db) {
  const draft = getPendingChatBackgroundDraft(state);
  const source = String(draft.source || 'local') === 'url' ? 'url' : 'local';
  const oldMediaKey = String(state.chatPromptSettings?.chatBackgroundMediaKey || '').trim();
  let nextSrc = '';
  let nextMediaKey = '';

  if (source === 'url') {
    const input = container.querySelector('[data-role="chat-background-url-input"]');
    nextSrc = String(input?.value || draft.url || '').trim();
    if (!/^https?:\/\/\S+/i.test(nextSrc) && !/^data:image\//i.test(nextSrc)) {
      renderModalNotice(container, '请输入有效的图片 URL');
      return;
    }
  } else if (draft.file instanceof Blob) {
    nextMediaKey = createChatBackgroundMediaKey(state);
    const saved = await persistChatBackgroundMediaRecord(db, nextMediaKey, draft.file);
    if (!saved) {
      renderModalNotice(container, '图片保存失败，请重新选择');
      return;
    }

    setChatBackgroundRuntimeUrl(nextMediaKey, String(draft.src || '').trim());
  } else if (String(draft.mediaKey || '').trim()) {
    nextMediaKey = String(draft.mediaKey || '').trim();
    if (!chatBackgroundRuntimeUrlByKey.get(nextMediaKey)) {
      await prepareChatBackgroundRuntimeUrl({
        ...state,
        chatPromptSettings: {
          ...(state.chatPromptSettings || {}),
          chatBackgroundSource: 'local',
          chatBackgroundMediaKey: nextMediaKey
        }
      }, db);
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
    chatBackgroundSrc: source === 'url' ? nextSrc : (nextMediaKey ? '' : nextSrc),
    chatBackgroundSource: source,
    chatBackgroundMediaKey: source === 'local' ? nextMediaKey : ''
  };

  await dbPut(db, getCurrentChatPromptSettingsKey(state), state.chatPromptSettings);

  if (oldMediaKey && oldMediaKey !== nextMediaKey) {
    await deleteChatBackgroundMediaRecord(db, oldMediaKey);
  }

  applyChatBackgroundToCurrentWindow(container, state);
  syncChatBackgroundSettingsPreview(container, state);
  cleanupPendingChatBackgroundDraft(state.pendingChatBackgroundDraft);
  state.pendingChatBackgroundDraft = null;
  closeModal(container);
}

/* ==========================================================================
   [区域标注·已完成·聊天背景删除恢复默认：同步删除 Blob]
   说明：
   1. 仅清空当前聊天对象 chatPromptSettings.chatBackgroundSrc / chatBackgroundSource / chatBackgroundMediaKey，恢复默认聊天背景。
   2. 删除动作统一通过 DB.js / IndexedDB 保存；若当前背景为本地 Blob，会同步删除对应 appsData 记录。
   3. 保存后只同步当前聊天窗口背景和设置页预览，不重渲染整页，避免闪屏。
   ========================================================================== */
export async function deleteChatBackgroundSelection(container, state = {}, db) {
  const oldMediaKey = String(state.chatPromptSettings?.chatBackgroundMediaKey || '').trim();

  state.chatPromptSettings = {
    ...(state.chatPromptSettings || {}),
    chatBackgroundSrc: '',
    chatBackgroundSource: 'local',
    chatBackgroundMediaKey: ''
  };

  await dbPut(db, getCurrentChatPromptSettingsKey(state), state.chatPromptSettings);
  if (oldMediaKey) await deleteChatBackgroundMediaRecord(db, oldMediaKey);

  applyChatBackgroundToCurrentWindow(container, state);
  syncChatBackgroundSettingsPreview(container, state);
  cleanupPendingChatBackgroundDraft(state.pendingChatBackgroundDraft);
  state.pendingChatBackgroundDraft = null;
}

export function syncChatBackgroundSettingsPreview(container, state = {}) {
  const { chatBackgroundSrc } = normalizeChatBeautySettings(state.chatPromptSettings || {});
  const preview = container.querySelector('.msg-settings-chat-beauty-section [data-role="chat-background-preview"]');
  if (!preview) return;
  preview.outerHTML = renderChatBackgroundPreviewHtml(chatBackgroundSrc, 'msg-chat-beauty-preview--setting');
}
