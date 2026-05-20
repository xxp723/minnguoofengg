// @ts-nocheck
/**
 * 文件名: js/apps/chat/chat-cleanup-settings.js
 * 用途: 闲谈应用 — 聊天设置页清理板块
 *       独立维护“清空聊天消息”和“清理本窗口图片”，方便后续只改清理功能。
 * 架构层: 应用层（闲谈子模块）
 */

import { TAB_ICONS, escapeHtml } from './chat-utils.js';

/* ==========================================================================
   [区域标注·已完成·聊天设置清理板块工具函数]
   说明：
   1. 本文件只处理当前聊天窗口的消息清理 UI 与消息对象字段更新。
   2. 持久化由 index.js 调用 persistCurrentMessages / dbPut 写入 DB.js / IndexedDB。
   3. 不使用 localStorage/sessionStorage，不写双份存储兜底，不按长文本字段过滤。
   ========================================================================== */
const EXPIRED_CHAT_IMAGE_LABEL = '已过期';

function getUtf8ByteLength(value = '') {
  const text = String(value || '');
  if (!text) return 0;
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).length;
  return text.length * 2;
}

function estimateDataUrlBytes(dataUrl = '') {
  const value = String(dataUrl || '').trim();
  const commaIndex = value.indexOf(',');
  if (commaIndex < 0) return getUtf8ByteLength(value);

  const meta = value.slice(0, commaIndex);
  const body = value.slice(commaIndex + 1).trim();
  if (!/;base64/i.test(meta)) return getUtf8ByteLength(body);

  const padding = body.endsWith('==') ? 2 : (body.endsWith('=') ? 1 : 0);
  return Math.max(0, Math.floor((body.length * 3) / 4) - padding);
}

function estimateStoredImageBytes(imageUrl = '') {
  const value = String(imageUrl || '').trim();
  if (!value) return 0;
  return /^data:image\//i.test(value) ? estimateDataUrlBytes(value) : getUtf8ByteLength(value);
}

function formatStorageBytes(bytes = 0) {
  const value = Math.max(0, Number(bytes || 0) || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(value < 10 * 1024 ? 1 : 0)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(value < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function getChatImageDescription(message = {}) {
  const name = String(message?.imageName || '').trim();
  const prompt = String(message?.imagePrompt || '').trim();
  const content = String(message?.content || '').replace(/^\s*\[图片\]\s*/i, '').trim();
  return name || prompt || content || '图片';
}

function isCleanableChatImageMessage(message = {}) {
  return String(message?.type || '') === 'image' && Boolean(String(message?.imageUrl || '').trim());
}

/* ==========================================================================
   [区域标注·已完成·本窗口图片统计]
   说明：
   1. 只统计当前聊天窗口 currentMessages 中仍保存 imageUrl 的 type:image 消息。
   2. data:image 按实际 base64 载荷估算；URL 图片按当前保存的 URL 文本大小估算。
   3. 已过期图片不会重复计入，避免重复清理。
   ========================================================================== */
export function getCurrentChatImageCleanupStats(messages = []) {
  const items = (Array.isArray(messages) ? messages : [])
    .filter(isCleanableChatImageMessage)
    .map(message => {
      const bytes = estimateStoredImageBytes(message.imageUrl);
      return {
        id: String(message?.id || ''),
        bytes,
        sizeLabel: formatStorageBytes(bytes),
        description: getChatImageDescription(message)
      };
    });

  const totalBytes = items.reduce((sum, item) => sum + item.bytes, 0);
  return {
    count: items.length,
    totalBytes,
    totalSizeLabel: formatStorageBytes(totalBytes),
    items
  };
}

/* ==========================================================================
   [区域标注·已完成·聊天设置清理板块独立渲染]
   说明：
   1. 本区域已从 chat-message.js 拆到独立文件，后续修改清理按钮优先改这里。
   2. 左侧为“清理本窗口图片”，右侧为“清空聊天消息”，保持同一设置卡片内并排显示。
   3. 图标由 chat-message.js 传入现有 IconPark 风格 broom SVG；本文件不新增图标。
   ========================================================================== */
export function renderChatCleanupSettingsSection({ broomIcon = '' } = {}) {
  const iconHtml = String(broomIcon || '');

  return `
    <!-- ======================================================================
         [区域标注·已完成·聊天设置清理板块独立文件]
         说明：
         1. “清理本窗口图片”和“清空聊天消息”已统一迁移到 chat-cleanup-settings.js。
         2. 本板块只提供入口；点击后由 index.js 打开应用内弹窗并通过 DB.js / IndexedDB 保存。
         3. 不使用浏览器原生弹窗，不使用 localStorage/sessionStorage。
         ====================================================================== -->
    <section class="msg-settings-card msg-settings-danger-card msg-settings-cleanup-card">
      <div class="msg-settings-cleanup-actions">
        <button class="msg-settings-danger-action msg-settings-cleanup-action" data-action="open-clear-current-chat-images-modal" type="button">
          <span class="msg-settings-danger-action__icon">${iconHtml}</span>
          <span class="msg-settings-danger-action__text">
            <strong>清理本窗口图片</strong>
            <em>图片气泡显示“已过期”</em>
          </span>
        </button>
        <button class="msg-settings-danger-action msg-settings-cleanup-action" data-action="open-clear-all-messages-modal" type="button">
          <span class="msg-settings-danger-action__icon">${iconHtml}</span>
          <span class="msg-settings-danger-action__text">
            <strong>清空聊天消息</strong>
            <em>仅清空当前聊天界面的消息</em>
          </span>
        </button>
      </div>
    </section>
  `;
}

/* ==========================================================================
   [区域标注·已完成·清空聊天消息弹窗独立维护·同步清空心声历史选项]
   说明：
   1. 弹窗使用闲谈应用内 chat-modal 样式，不使用 alert/confirm/prompt。
   2. 真正清空和持久化由点击处理层统一写入 DB.js / IndexedDB。
   3. 本弹窗已新增“同步清空所有心声记录”iPhone 风格开关；后续修改清空聊天消息优先改这里。
   ========================================================================== */
export function showClearAllMessagesModal(container, state) {
  const mask = container.querySelector('[data-role="modal-mask"]');
  const panel = container.querySelector('[data-role="modal-panel"]');
  const session = state.sessions.find(item => String(item.id) === String(state.currentChatId));
  if (!mask || !panel || !session) return;

  panel.innerHTML = `
    <!-- [区域标注·已完成·聊天设置清理板块弹窗·清空聊天消息] -->
    <div class="chat-modal-header">
      <span>清空聊天消息</span>
      <button class="chat-modal-close" data-action="close-modal" type="button">${TAB_ICONS.close}</button>
    </div>
    <div class="chat-modal-body">
      <div class="chat-modal-hint">是否清空与“${escapeHtml(session.name || '未命名')}”的全部聊天消息？<br>此操作默认只清空当前聊天界面的消息，不删除联系人。</div>
      <!-- [区域标注·已完成·清空聊天消息弹窗·同步清空心声历史开关] -->
      <button class="msg-clear-inner-voice-toggle" data-action="toggle-clear-inner-voice-history" data-role="clear-inner-voice-history-toggle" type="button" aria-checked="false">
        <span class="msg-clear-inner-voice-toggle__text">
          <strong>同步清空所有心声记录</strong>
          <em>开启后会同时清空这个聊天窗口内角色的心声历史</em>
        </span>
        <span class="msg-clear-inner-voice-toggle__switch" aria-hidden="true"></span>
      </button>
    </div>
    <div class="chat-modal-footer">
      <button class="chat-modal-btn chat-modal-btn--secondary" data-action="close-modal" type="button">取消</button>
      <button class="chat-modal-btn chat-modal-btn--primary" data-action="confirm-clear-all-messages" type="button">清空</button>
    </div>
  `;

  mask.classList.remove('is-hidden');
}

/* ==========================================================================
   [区域标注·已完成·清理本窗口图片弹窗]
   说明：
   1. 点击“清理本窗口图片”后显示当前窗口图片数量与合计占用大小。
   2. 清理后只移除消息对象中的 imageUrl，并写入 imageExpired/imageDescription 等说明字段。
   3. 图片描述仍保留在 content/imageName/imageDescription 中，AI 历史上下文可继续读取文字描述。
   ========================================================================== */
export function showClearCurrentChatImagesModal(container, state) {
  const mask = container.querySelector('[data-role="modal-mask"]');
  const panel = container.querySelector('[data-role="modal-panel"]');
  const session = state.sessions.find(item => String(item.id) === String(state.currentChatId));
  if (!mask || !panel || !session) return;

  const stats = getCurrentChatImageCleanupStats(state.currentMessages);
  const previewItems = stats.items.slice(0, 4);

  panel.innerHTML = `
    <!-- [区域标注·已完成·聊天设置清理板块弹窗·清理本窗口图片] -->
    <div class="chat-modal-header">
      <span>清理本窗口图片</span>
      <button class="chat-modal-close" data-action="close-modal" type="button">${TAB_ICONS.close}</button>
    </div>
    <div class="chat-modal-body">
      <div class="chat-modal-hint">
        当前本窗口共有 <strong>${stats.count}</strong> 张可清理图片，合计约占 <strong>${escapeHtml(stats.totalSizeLabel)}</strong>。
        <br>清理后窗口内图片会显示“${EXPIRED_CHAT_IMAGE_LABEL}”，不会清空图片描述文字。
      </div>
      ${previewItems.length ? `
        <div class="msg-cleanup-image-summary">
          ${previewItems.map(item => `
            <div class="msg-cleanup-image-summary__item">
              <span>${escapeHtml(item.description)}</span>
              <em>${escapeHtml(item.sizeLabel)}</em>
            </div>
          `).join('')}
          ${stats.items.length > previewItems.length ? `<div class="msg-cleanup-image-summary__more">还有 ${stats.items.length - previewItems.length} 张图片未列出</div>` : ''}
        </div>
      ` : `
        <div class="chat-modal-notice">当前本窗口没有可清理的图片。</div>
      `}
    </div>
    <div class="chat-modal-footer">
      <button class="chat-modal-btn chat-modal-btn--secondary" data-action="close-modal" type="button">${stats.count ? '取消' : '知道了'}</button>
      ${stats.count ? `<button class="chat-modal-btn chat-modal-btn--primary" data-action="confirm-clear-current-chat-images" type="button">确认清理</button>` : ''}
    </div>
  `;

  mask.classList.remove('is-hidden');
}

/* ==========================================================================
   [区域标注·已完成·清空聊天消息状态入口·可同步心声历史]
   说明：
   1. 只处理当前聊天窗口 currentMessages 的清空状态，不删除联系人。
   2. 是否同步清空心声历史由“清空聊天消息”弹窗开关决定。
   3. 真正持久化由点击处理层统一写入 DB.js / IndexedDB，不使用 localStorage/sessionStorage。
   ========================================================================== */
export function clearCurrentChatMessages(state, { clearInnerVoiceHistory = false } = {}) {
  /* ==========================================================================
     [区域标注·已完成·清空聊天消息状态处理·可同步心声历史]
     说明：
     1. 只清空当前聊天窗口的 currentMessages，联系人与会话仍由点击处理层保留。
     2. 真正持久化由点击处理层统一调用 persistCurrentMessages/dbPut 写入 DB.js / IndexedDB。
     3. 本函数返回本次是否勾选同步清空心声历史；心声历史清空由 chat-inner-voice.js 的 DB.js / IndexedDB 函数完成。
     ========================================================================== */
  if (!state?.currentChatId) return { cleared: false, clearInnerVoiceHistory: false };
  state.currentMessages = [];
  return {
    cleared: true,
    clearInnerVoiceHistory: Boolean(clearInnerVoiceHistory)
  };
}

export function expireCurrentChatImages(messages = []) {
  const stats = getCurrentChatImageCleanupStats(messages);
  const changedIds = [];
  const now = Date.now();

  (Array.isArray(messages) ? messages : []).forEach(message => {
    if (!isCleanableChatImageMessage(message)) return;

    const description = getChatImageDescription(message);
    message.imageExpired = true;
    message.imageExpiredAt = now;
    message.imageExpiredLabel = EXPIRED_CHAT_IMAGE_LABEL;
    message.imageDescription = String(message.imageDescription || description || '图片').trim();
    message.imageStoredBytes = estimateStoredImageBytes(message.imageUrl);
    delete message.imageUrl;
    changedIds.push(String(message.id || '').trim());
  });

  return {
    changedIds: changedIds.filter(Boolean),
    stats
  };
}
