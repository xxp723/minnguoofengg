// @ts-nocheck
/**
 * 文件名: js/apps/chat/chat-message-render.js
 * 用途: 闲谈应用 — 聊天消息页渲染子模块
 * 架构层: 应用层（闲谈子模块）
 *
 * 说明：
 * 1. 本文件承接 chat-message.js 中与“消息气泡渲染 / 聊天页 HTML / 局部刷新”直接相关的逻辑。
 * 2. 仅处理运行时 state 与 DOM，不新增任何持久化存储；真正持久化仍由外层通过 DB.js / IndexedDB 完成。
 * 3. 不使用 localStorage/sessionStorage，不使用原生浏览器弹窗。
 */

import { escapeHtml } from './chat-utils.js';
import { MSG_ICONS } from './chat-message-icons.js';
import { renderChatMessageSettingsPage } from './chat-message-settings.js';
import { sanitizeHtmlCardDocumentForSrcdoc } from './chat-html-card.js';
import {
  getGiftMessageDisplayText,
  isGiftMessage,
  renderGiftBubble,
  renderGiftFeatureButton
} from './chat-gift.js';
import {
  getRedPacketMessageDisplayText,
  isRedPacketMessage,
  isRedPacketSystemMessage,
  renderRedPacketBubble,
  renderRedPacketFeatureButton
} from './chat-red-packet.js';
import {
  isTextImageMessage,
  renderTextImageBubble,
  renderTextImageFeatureButton
} from './chat-text-image.js';
import {
  getVoiceMessageDisplayText,
  isVoiceMessage,
  renderVoiceBubble,
  renderVoiceFeatureButton
} from './chat-voice.js';
import {
  isTakeawayMessage,
  renderTakeawayBubble,
  renderTakeawayFeatureButton,
  initTakeawayBanner
} from './chat-takeaway.js';
import {
  renderAsideBubbleHtml,
  renderAsideExitButtonHtml,
  isAsideModeActive
} from './chat-aside.js';
import { renderTranslationBubbleHtml } from './chat-translation.js';
import { renderQuotePreview } from './chat-message-quote.js';
import { renderChatMessageSearchPanelHtml } from './chat-message-search.js';
import { isUserPatSystemMessage } from './chat-user-pat.js';
import { getChatBackgroundListAreaAttrs } from './chat-beauty-settings.js';
/* ==========================================================================
   [区域标注·本次修改·分享链接] 导入链接卡片渲染
   ========================================================================== */
import {
  isLinkCardMessage,
  renderLinkCardBubble,
  getLinkCardMessageDisplayText
} from './chat-link-card.js';

const CHAT_MESSAGE_INITIAL_VISIBLE_COUNT = 100;
const CHAT_MESSAGE_LOAD_MORE_STEP = 100;

/* ==========================================================================
   [区域标注·已完成·本次朋友圈分享卡片气泡] 朋友圈分享卡片渲染工具
   说明：
   1. 仅根据消息对象生成聊天气泡 HTML，不包含任何持久化存储读写。
   2. 不使用 localStorage/sessionStorage，不写双份兜底。
   3. 文字截断由 CSS 控制，不做长文本过滤。
   ========================================================================== */
const MOMENT_SHARE_ICON = `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M10 8h28a2 2 0 0 1 2 2v28a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M16 18h16M16 26h10M34 31l4 4l4-8" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function getMomentSharePreviewText(msg = {}) {
  const explicitText = String(msg?.momentShareText || '').trim();
  if (explicitText) return explicitText;

  const content = String(msg?.content || '').trim();
  return content.replace(/^我分享了一条朋友圈动态：?/, '').trim() || '朋友圈动态';
}

function renderMomentShareBubble(msg = {}) {
  const previewText = getMomentSharePreviewText(msg);
  const imageCount = Math.max(0, Math.floor(Number(msg?.momentShareImageCount || 0)) || 0);
  const location = String(msg?.momentShareLocation || '').trim();
  const authorName = String(msg?.momentShareAuthorName || '').trim();
  const meta = [
    authorName || '朋友圈动态',
    imageCount ? `图片 x ${imageCount}` : '',
    location ? `@${location}` : ''
  ].filter(Boolean).join(' · ');

  return `
    <div class="msg-moment-share-bubble" title="${escapeHtml(previewText)}" aria-label="朋友圈分享：${escapeHtml(previewText)}">
      <div class="msg-moment-share-bubble__icon">${MOMENT_SHARE_ICON}</div>
      <div class="msg-moment-share-bubble__content">
        <span class="msg-moment-share-bubble__label">朋友圈分享</span>
        <strong class="msg-moment-share-bubble__text">${escapeHtml(previewText)}</strong>
        ${meta ? `<span class="msg-moment-share-bubble__meta">${escapeHtml(meta)}</span>` : ''}
      </div>
    </div>
  `;
}

function formatMsgTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function normalizeChatMessageVisibleCount(value) {
  const count = Math.floor(Number(value));
  return Number.isFinite(count) && count > 0 ? count : CHAT_MESSAGE_INITIAL_VISIBLE_COUNT;
}

function getVisibleChatMessagesForRender(messages = [], options = {}) {
  const allMessages = Array.isArray(messages) ? messages : [];
  const visibleCount = normalizeChatMessageVisibleCount(options.chatMessageVisibleCount);
  const visibleMessages = allMessages.length > visibleCount
    ? allMessages.slice(-visibleCount)
    : allMessages.slice();
  const hiddenMessageCount = Math.max(0, allMessages.length - visibleMessages.length);

  return {
    allMessages,
    visibleMessages,
    hiddenMessageCount,
    nextLoadCount: Math.min(CHAT_MESSAGE_LOAD_MORE_STEP, hiddenMessageCount)
  };
}

export function normalizeStickerPanelData(rawData) {
  const source = rawData && typeof rawData === 'object' ? rawData : {};
  const groups = Array.isArray(source.groups)
    ? source.groups
        .map(group => ({
          id: String(group?.id || '').trim(),
          name: String(group?.name || '').trim()
        }))
        .filter(group => group.id && group.name)
    : [];
  const validGroupIds = new Set(['all', ...groups.map(group => group.id)]);
  const rawItems = Array.isArray(source.items)
    ? source.items
    : (Array.isArray(source.stickers) ? source.stickers : []);
  const items = rawItems
    .map(item => ({
      id: String(item?.id || '').trim(),
      groupId: validGroupIds.has(String(item?.groupId || 'all')) ? String(item?.groupId || 'all') : 'all',
      name: String(item?.name || '').trim(),
      url: String(item?.url || '').trim()
    }))
    .filter(item => item.id && item.name && item.url);

  return { groups, items };
}

function getStickerPanelGroups(rawData) {
  const data = normalizeStickerPanelData(rawData);
  return [{ id: 'all', name: 'All' }, ...data.groups];
}

function getVisibleStickerPanelItems(rawData, groupId = 'all') {
  const data = normalizeStickerPanelData(rawData);
  if (groupId === 'all') return data.items;
  return data.items.filter(item => item.groupId === groupId);
}

export function getVisibleChatConsoleLogs(chatConsoleLogs = [], warnErrorOnly = false) {
  const logs = Array.isArray(chatConsoleLogs) ? chatConsoleLogs : [];
  return warnErrorOnly
    ? logs.filter(item => String(item?.level || '').toLowerCase() === 'warn' || String(item?.level || '').toLowerCase() === 'error')
    : logs;
}

function formatChatConsoleTokenCount(value) {
  const count = Math.floor(Number(value));
  return Number.isFinite(count) && count >= 0 ? String(count) : '--';
}

function readChatConsoleTokenCount(...values) {
  for (const value of values) {
    const count = Math.floor(Number(value));
    if (Number.isFinite(count) && count >= 0) return count;
  }
  return null;
}

/* ==========================================================================
   [区域标注·已完成·本次重进Token标题显示修复] 控制台标题右侧每轮 Token 显示
   说明：
   1. 读取当前 state.chatConsoleTokenUsage；该值可能来自本轮运行时结果，也可能来自 DB.js / IndexedDB 重进恢复。
   2. 兼容真实 API usage / usageMetadata 的常见字段名，只展示真实返回字段；不估算、不按长文本过滤。
   3. 不在本渲染区域写入 DB.js / IndexedDB，不使用 localStorage/sessionStorage，不做双份存储兜底。
   ========================================================================== */
function renderChatConsoleTokenMetaHtml(tokenUsage = null) {
  const usage = tokenUsage && typeof tokenUsage === 'object' ? tokenUsage : {};
  const usageMetadata = usage.usageMetadata && typeof usage.usageMetadata === 'object' ? usage.usageMetadata : {};
  const inputTokens = readChatConsoleTokenCount(
    usage.inputTokens,
    usage.promptTokens,
    usage.prompt_tokens,
    usage.input_tokens,
    usageMetadata.promptTokenCount
  );
  const outputTokens = readChatConsoleTokenCount(
    usage.outputTokens,
    usage.completionTokens,
    usage.completion_tokens,
    usage.output_tokens,
    usageMetadata.candidatesTokenCount
  );
  const totalTokens = readChatConsoleTokenCount(
    usage.totalTokens,
    usage.total_tokens,
    usageMetadata.totalTokenCount
  );

  const inputText = formatChatConsoleTokenCount(inputTokens);
  const outputText = formatChatConsoleTokenCount(outputTokens);
  const totalText = totalTokens === null ? '' : ` / 总计 ${escapeHtml(formatChatConsoleTokenCount(totalTokens))}`;
  return `<span class="msg-console-dock__tokens" title="本轮发送给 AI / AI 返回 tokens">发送 ${escapeHtml(inputText)} / 返回 ${escapeHtml(outputText)}${totalText}</span>`;
}

export function renderChatConsoleDockHtml({
  chatConsoleEnabled = false,
  chatConsoleExpanded = false,
  chatConsoleWarnErrorOnly = false,
  visibleConsoleLogs = [],
  chatConsoleTokenUsage = null
} = {}) {
  if (!chatConsoleEnabled) return '';

  const tokenMetaHtml = renderChatConsoleTokenMetaHtml(chatConsoleTokenUsage);
  const displayConsoleLogs = (Array.isArray(visibleConsoleLogs) ? visibleConsoleLogs : [])
    .map((item, index) => ({ item, index }))
    .sort((a, b) => (
      (Number(b.item?.ts || 0) - Number(a.item?.ts || 0))
      || (b.index - a.index)
    ))
    .map(entry => entry.item);

  return `
    <div class="msg-console-dock ${chatConsoleExpanded ? 'is-expanded' : ''}" data-role="msg-console-dock">
      <button class="msg-console-dock__trigger" type="button" data-action="toggle-chat-console-expand">
        <span class="msg-console-dock__title">${MSG_ICONS.monitor}<em>查看控制台 (Log/警告/错误)</em></span>
        <span class="msg-console-dock__meta"><span>${visibleConsoleLogs.length} 条</span>${tokenMetaHtml}</span>
      </button>
      <div class="msg-console-dock__panel">
        <div class="msg-console-dock__toolbar">
          <button class="msg-console-dock__btn ${chatConsoleWarnErrorOnly ? 'is-active' : ''}" data-action="set-chat-console-filter-warn-error" type="button">${MSG_ICONS.warning}<span>仅 warn/error</span></button>
          <button class="msg-console-dock__btn ${!chatConsoleWarnErrorOnly ? 'is-active' : ''}" data-action="set-chat-console-filter-all" type="button"><span>查看全部</span></button>
          <button class="msg-console-dock__btn" data-action="clear-chat-console-logs" type="button">${MSG_ICONS.broom}<span>清空日志</span></button>
          <button class="msg-console-dock__btn" data-action="copy-chat-console-logs" type="button">${MSG_ICONS.copy}<span>复制</span></button>
        </div>
        <div class="msg-console-dock__list" data-role="msg-console-list">
          ${displayConsoleLogs.length
            ? displayConsoleLogs.map(item => `
                <div class="msg-console-log msg-console-log--${escapeHtml(String(item?.level || 'info').toLowerCase())}">
                  <span class="msg-console-log__time">${escapeHtml(String(item?.time || '--:--:--'))}</span>
                  <span class="msg-console-log__level">${escapeHtml(String(item?.level || 'info').toUpperCase())}</span>
                  <span class="msg-console-log__text">${escapeHtml(String(item?.text || ''))}</span>
                </div>
              `).join('')
            : `<div class="msg-console-dock__empty">目前没有日志资料。</div>`}
        </div>
      </div>
    </div>
  `;
}

export function getAsideSegmentsFromMessage(message = {}) {
  const rawSegments = Array.isArray(message?.asideSegments) ? message.asideSegments : [];
  const normalizedSegments = rawSegments
    .map((segment, index) => {
      const text = typeof segment === 'string' ? segment : String(segment?.text || '').trim();
      if (!text) return null;
      return {
        id: String(segment?.id || `${message?.id || 'aside'}_${index + 1}`),
        text,
        placement: String(segment?.placement || 'before') === 'after' ? 'after' : 'before'
      };
    })
    .filter(Boolean);

  if (normalizedSegments.length) return normalizedSegments;

  const legacyText = String(message?.asideText || '').trim();
  return legacyText
    ? [{
        id: String(message?.id || 'aside'),
        text: legacyText,
        placement: 'before'
      }]
    : [];
}

function hasRenderableAsideContent(message = {}) {
  return getAsideSegmentsFromMessage(message).length > 0;
}

function renderAsideToolbarHtml(message = {}, chatSession, options = {}) {
  const holder = document.createElement('div');
  holder.innerHTML = renderMessageBubble(message, chatSession, options).trim();
  return holder.querySelector('[data-role="msg-bubble-toolbar"]')?.outerHTML || '';
}

function renderMessageAsideHtml(message = {}, placement = 'before', chatSession = {}, options = {}) {
  const targetPlacement = placement === 'after' ? 'after' : 'before';
  const messageId = String(message?.id || '').trim();
  const selectedAsideSegmentId = String(options.selectedAsideSegmentId || '').trim();

  return getAsideSegmentsFromMessage(message)
    .filter(segment => segment.placement === targetPlacement)
    .map((segment, index) => {
      const asideSegmentId = String(segment.id || `${message?.id || 'aside'}_${index + 1}`);
      const isToolbarOpen = !Boolean(options.multiSelectMode)
        && String(options.selectedMessageId || '') === messageId
        && selectedAsideSegmentId === asideSegmentId;
      const toolbarHtml = isToolbarOpen ? renderAsideToolbarHtml(message, chatSession, options) : '';

      return renderAsideBubbleHtml(
        segment.text,
        `${asideSegmentId}_${targetPlacement}_${index + 1}`,
        {
          ownerMessageId: messageId,
          asideSegmentId,
          isToolbarOpen,
          toolbarHtml
        }
      );
    })
    .join('');
}

function renderMessageWithAsideHtml(message, chatSession, options = {}) {
  const beforeAsideHtml = renderMessageAsideHtml(message, 'before', chatSession, options);
  const bubbleHtml = renderMessageBubble(message, chatSession, options);
  const afterAsideHtml = renderMessageAsideHtml(message, 'after', chatSession, options);
  return `${beforeAsideHtml}${bubbleHtml}${afterAsideHtml}`;
}

/* ========================================================================
   [区域标注·本次修改·头像与备注3点需求：当前会话消息头像联系人回退与隐藏开关]
   说明：
   1. 当前会话角色头像优先使用 session.avatar；删除后回退到联系人资料头像；资料头像不存在时才回退首字。
   2. 当前会话用户头像优先使用 session.userAvatar；删除后继续回退到用户主页头像。
   3. hideAvatars 仅隐藏当前会话窗口中的左右消息头像，不影响顶部栏、聊天列表、设置页预览或其它页面。
   4. 本区域只读取运行时 state 传入数据，不做任何 localStorage/sessionStorage 持久化。
   ======================================================================== */
function getCurrentContactForSession(options = {}, session = {}) {
  if (options.currentContact && typeof options.currentContact === 'object') {
    return options.currentContact;
  }

  const contacts = Array.isArray(options.contacts) ? options.contacts : [];
  const sessionId = String(session?.id || '').trim();
  const sessionRoleId = String(session?.roleId || '').trim();

  return contacts.find(contact => {
    const contactId = String(contact?.id || '').trim();
    const contactRoleId = String(contact?.roleId || '').trim();
    return (
      (contactId && sessionId && contactId === sessionId)
      || (contactRoleId && sessionRoleId && contactRoleId === sessionRoleId)
      || (contactRoleId && sessionId && contactRoleId === sessionId)
      || (contactId && sessionRoleId && contactId === sessionRoleId)
    );
  }) || null;
}

function getSessionAvatarMarkup(session = {}, options = {}) {
  const sessionName = String(session?.name || '聊天').trim() || '聊天';
  const currentContact = getCurrentContactForSession(options, session);
  const sessionAvatar = String(session?.avatar || '').trim();
  const contactAvatar = String(currentContact?.avatar || options.contactAvatar || '').trim();
  const avatarSrc = sessionAvatar || contactAvatar;

  return avatarSrc
    ? `<img src="${escapeHtml(avatarSrc)}" alt="${escapeHtml(sessionName)}">`
    : `<span>${escapeHtml((sessionName || '?').charAt(0).toUpperCase())}</span>`;
}

function getUserAvatarMarkup(session = {}, options = {}) {
  const userProfile = options.userProfile || {};
  const userName = String(userProfile.nickname || userProfile.name || '我').trim() || '我';
  const userAvatar = String(session?.userAvatar || userProfile.avatar || '').trim();

  return userAvatar
    ? `<img src="${escapeHtml(userAvatar)}" alt="${escapeHtml(userName)}">`
    : `<span>${escapeHtml((userName || '我').charAt(0).toUpperCase())}</span>`;
}

export function renderMessageBubble(msg, chatSession, options = {}) {
  const session = chatSession || {};
  const name = session.name || '聊天';
  const userProfile = options.userProfile || {};
  const chatSettings = options.chatSettings || {};
  const hideAvatars = Boolean(chatSettings.hideAvatars);
  const roleAvatarMarkup = getSessionAvatarMarkup(session, options);
  const userAvatarMarkup = getUserAvatarMarkup(session, options);
  const userName = userProfile.nickname || userProfile.name || '我';
  const selectedMessageId = String(options.selectedMessageId || '');
  const selectedAsideSegmentId = String(options.selectedAsideSegmentId || '').trim();
  const selectedMessageIds = Array.isArray(options.selectedMessageIds) ? options.selectedMessageIds.map(String) : [];
  const multiSelectMode = Boolean(options.multiSelectMode);
  const deleteConfirmMessageId = String(options.deleteConfirmMessageId || '');
  const rewindConfirmMessageId = String(options.rewindConfirmMessageId || '');

  const messageId = String(msg?.id || '');
  const isUser = msg?.role === 'user';
  const isAssistant = msg?.role === 'assistant' || msg?.role === 'other';
  const isToolbarOpen = !multiSelectMode && selectedMessageId && selectedMessageId === messageId && !selectedAsideSegmentId;
  const isSelected = selectedMessageIds.includes(messageId);
  const isDeleteConfirming = isToolbarOpen && deleteConfirmMessageId === messageId;
  const isRewindConfirming = isToolbarOpen && rewindConfirmMessageId === messageId;
  const isStickerMessage = String(msg?.type || '') === 'sticker' && String(msg?.stickerUrl || '').trim();
  const isTextImageBubbleMessage = isTextImageMessage(msg);
  const isVoiceBubbleMessage = isVoiceMessage(msg);
  const hasImageUrl = String(msg?.type || '') === 'image' && String(msg?.imageUrl || '').trim();
  const isExpiredImageMessage = String(msg?.type || '') === 'image' && Boolean(msg?.imageExpired);
  const isImageMessage = Boolean(hasImageUrl || isExpiredImageMessage);
  const isZoomableImage = Boolean(hasImageUrl && !isExpiredImageMessage);
  const isTransferMessage = String(msg?.type || '') === 'transfer';
  const isGiftBubbleMessage = isGiftMessage(msg);
  const isRedPacketBubbleMessage = isRedPacketMessage(msg);
  const isTakeawayBubbleMessage = isTakeawayMessage(msg);
  const isMomentShareMessage = String(msg?.type || '') === 'moment_share';
  const isLinkCardBubbleMessage = isLinkCardMessage(msg); // [区域标注·本次修改·分享链接] 判断是否为带链接元数据的消息
  const isHtmlCardMessage = String(msg?.type || '') === 'card' && String(msg?.cardHtml || msg?.content || '').trim();
  const htmlCardSrcdoc = isHtmlCardMessage
    ? sanitizeHtmlCardDocumentForSrcdoc(String(msg?.cardHtml || msg?.content || ''))
    : '';
  /* ======================================================================
     [区域标注·已完成·拍一拍独立模块系统小字渲染]
     说明：
     1. user_pat_system 的类型判断已转交 chat-user-pat.js，方便下次直接修改拍一拍独立文件。
     2. ai_pat_system 与 user_pat_system 均复用聊天页既有系统提示小字样式。
     3. 这里只影响运行时渲染，不新增持久化存储，不使用 localStorage/sessionStorage。
     4. 拍一拍消息显示为系统小字，不进入普通聊天气泡。
     ====================================================================== */
  const isAiWithdrawSystemMessage = String(msg?.type || '') === 'ai_withdraw_system';
  const isAiPatSystemMessage = String(msg?.type || '') === 'ai_pat_system';
  const isUserPatSystem = isUserPatSystemMessage(msg);
  const isUserWithdrawSystemMessage = String(msg?.type || '') === 'user_withdraw_system';
  const isHtmlCardInteractionSystemMessage = String(msg?.type || '') === 'html_card_interaction_system';
  const isRedPacketSystem = isRedPacketSystemMessage(msg);
  const isPhoneSystemMessage = String(msg?.type || '') === 'phone_end_system' || String(msg?.type || '') === 'phone_start_system';
  const isTransferSystemMessage = String(msg?.type || '') === 'transfer_system' || isAiWithdrawSystemMessage || isAiPatSystemMessage || isUserPatSystem || isUserWithdrawSystemMessage || isHtmlCardInteractionSystemMessage || isRedPacketSystem || isPhoneSystemMessage;
  const transferStatus = String(msg?.transferStatus || '').trim() || 'pending';
  const isTransferAccepted = transferStatus === 'accepted';
  const quoteHtml = renderQuotePreview(msg?.quote);
  const bubbleInnerHtml = (() => {
    if (isStickerMessage) {
      return `
        <div class="msg-sticker-bubble" title="${escapeHtml(msg?.stickerName || msg?.content || '表情包')}">
          <img class="msg-sticker-bubble__image" src="${escapeHtml(msg?.stickerUrl || '')}" alt="${escapeHtml(msg?.stickerName || msg?.content || '表情包')}">
        </div>
      `;
    }

    if (isTextImageBubbleMessage) return renderTextImageBubble(msg);
    if (isVoiceBubbleMessage) return renderVoiceBubble(msg);

    if (isImageMessage) {
      return isExpiredImageMessage
        ? `
          <div class="msg-image-bubble msg-image-bubble--expired" title="已过期">
            <span class="msg-image-bubble__expired-text">已过期</span>
          </div>
        `
        : `
          <div class="msg-image-bubble ${isZoomableImage ? 'msg-image-bubble--zoomable' : ''}"
               ${isZoomableImage ? `data-role="msg-media-zoom-trigger" data-action="msg-media-open-zoom" data-media-kind="image" data-media-src="${escapeHtml(msg?.imageUrl || '')}" data-media-alt="${escapeHtml(msg?.imageName || msg?.content || '图片')}" data-message-id="${escapeHtml(messageId)}"` : ''}
               title="${escapeHtml(msg?.imageName || msg?.content || '图片')}">
            <img class="msg-image-bubble__image" src="${escapeHtml(msg?.imageUrl || '')}" alt="${escapeHtml(msg?.imageName || msg?.content || '图片')}" decoding="async">
          </div>
        `;
    }

    if (isRedPacketBubbleMessage) return renderRedPacketBubble(msg);

    if (isTransferMessage) {
      return `
        <div class="msg-transfer-bubble msg-transfer-bubble--${escapeHtml(transferStatus)}" title="转账">
          <div class="msg-transfer-bubble__icon">${MSG_ICONS.wallet}</div>
          <div class="msg-transfer-bubble__content">
            <span class="msg-transfer-bubble__label">转账</span>
            <strong class="msg-transfer-bubble__amount">${escapeHtml(msg?.transferDisplayAmount || msg?.content || '')}</strong>
            ${String(msg?.transferNote || '').trim()
              ? `<span class="msg-transfer-bubble__note">${escapeHtml(msg.transferNote)}</span>`
              : `<span class="msg-transfer-bubble__note msg-transfer-bubble__note--empty">无备注</span>`}
          </div>
          ${isTransferAccepted ? `<span class="msg-transfer-bubble__check" aria-label="已接收">${MSG_ICONS.check}</span>` : ''}
        </div>
      `;
    }

    if (isGiftBubbleMessage) return renderGiftBubble(msg);
    if (isTakeawayBubbleMessage) return renderTakeawayBubble(msg);
    if (isMomentShareMessage) return renderMomentShareBubble(msg);
    if (isLinkCardBubbleMessage) {
      const linkUrl = String(msg?.linkData?.url || '');
      let userText = String(msg?.content || '').trim();
      if (linkUrl) {
        userText = userText.split(linkUrl).join('').trim();
      }
      const textHtml = userText ? `<div style="margin-bottom: 6px; word-break: break-word;">${escapeHtml(userText)}</div>` : '';
      return `${textHtml}${renderLinkCardBubble(msg)}`;
    } // [区域标注·本次修改·分享链接] 渲染链接卡片并保留用户原始文本

    if (isHtmlCardMessage) {
      return `
        <div class="msg-html-card-bubble"
             data-role="msg-media-zoom-trigger"
             data-action="msg-media-open-zoom"
             data-media-kind="html-card"
             data-media-srcdoc="${escapeHtml(htmlCardSrcdoc)}"
             data-media-alt="${escapeHtml(msg?.cardTitle || msg?.content || 'HTML卡片')}"
             data-message-id="${escapeHtml(messageId)}">
          <iframe
            class="msg-html-card-bubble__frame"
            data-message-id="${escapeHtml(messageId)}"
            sandbox="allow-scripts allow-forms allow-popups-to-escape-sandbox"
            loading="lazy"
            referrerpolicy="no-referrer"
            frameborder="0"
            scrolling="no"
            style="border:0;outline:0;background:transparent;"
            srcdoc="${escapeHtml(htmlCardSrcdoc)}"
            title="${escapeHtml(msg?.cardTitle || msg?.content || 'HTML卡片')}"></iframe>
        </div>
      `;
    }

    return escapeHtml(msg?.content || '');
  })();

  if (isTransferSystemMessage) {
    return `
      <div class="msg-transfer-system-row ${isToolbarOpen ? 'is-action-open' : ''}"
           data-message-id="${escapeHtml(messageId)}"
           data-action="msg-system-tip-select">
        <span class="msg-transfer-system-row__text">${escapeHtml(msg?.content || '')}</span>
        ${isToolbarOpen ? `
          <div class="msg-system-tip-actions" data-role="msg-bubble-toolbar">
            ${isAiWithdrawSystemMessage ? `
              <button class="msg-system-tip-actions__btn" data-action="msg-system-tip-view-withdrawn" data-message-id="${escapeHtml(messageId)}" type="button">
                ${MSG_ICONS.systemTip}<span>查看</span>
              </button>
              <button class="msg-system-tip-actions__btn" data-action="msg-system-tip-fix-format" data-message-id="${escapeHtml(messageId)}" type="button">
                ${MSG_ICONS.fixFormat}<span>修正</span>
              </button>
            ` : ''}
            <button class="msg-system-tip-actions__btn ${isDeleteConfirming ? 'is-confirming' : ''}" data-action="msg-system-tip-delete" data-message-id="${escapeHtml(messageId)}" type="button">
              ${MSG_ICONS.delete}<span>${isDeleteConfirming ? '取消' : '删除'}</span>
            </button>
            ${isDeleteConfirming ? `
              <button class="msg-system-tip-actions__btn msg-system-tip-actions__btn--confirm" data-action="msg-system-tip-confirm-delete" data-message-id="${escapeHtml(messageId)}" type="button">
                ${MSG_ICONS.check}<span>确认删除</span>
              </button>
            ` : ''}
          </div>
        ` : ''}
      </div>
    `;
  }

  /* ======================================================================
     [区域标注·已完成·本次需求2·礼物卡片点击接取入口]
     说明：
     1. 礼物气泡外层点击改为 msg-gift-open-actions，像转账一样进入应用内操作弹窗。
     2. 本区域只决定点击 action，不做任何持久化；收取/退回由 chat-event-click.js 写入 DB.js / IndexedDB。
     3. 多选模式仍保持原有 msg-multi-toggle，避免影响消息多选。
     ====================================================================== */
  const bubbleRowAction = multiSelectMode
    ? 'msg-multi-toggle'
        : (isTransferMessage
        ? 'msg-transfer-open-actions'
        : (isGiftBubbleMessage ? 'msg-gift-open-actions' : (isRedPacketBubbleMessage ? 'msg-red-packet-open-actions' : (isTakeawayBubbleMessage ? 'msg-takeaway-open-actions' : (isLinkCardBubbleMessage ? 'msg-link-card-open-actions' : 'msg-bubble-select'))))); // [区域标注·本次修改·分享链接] 绑定点击打开事件

  return `
    <div class="msg-bubble-row ${isUser ? 'msg-bubble-row--right' : 'msg-bubble-row--left'} ${multiSelectMode ? 'is-multi-selecting' : ''} ${isSelected ? 'is-selected' : ''}"
         data-message-id="${escapeHtml(messageId)}"
         data-action="${bubbleRowAction}">
      ${!isUser && !hideAvatars ? `<div class="msg-bubble__avatar">${roleAvatarMarkup}</div>` : ''}
      <div class="msg-bubble-content">
        ${isToolbarOpen ? `
          <div class="msg-bubble-toolbar" data-role="msg-bubble-toolbar">
            ${isAssistant ? `
              <button class="msg-bubble-toolbar__btn msg-bubble-toolbar__btn--fix-format" data-action="msg-bubble-fix-format" data-message-id="${escapeHtml(messageId)}" type="button">
                ${MSG_ICONS.fixFormat}<span>修正</span>
              </button>
              <!-- ======================================================================
                   [区域标注·已完成·本次角色气泡拍拍入口]
                   说明：仅角色方消息气泡功能栏显示“拍拍”，点击后由 chat-user-pat.js 追加系统小字并立即触发 AI 回复。
                   ====================================================================== -->
              <button class="msg-bubble-toolbar__btn msg-bubble-toolbar__btn--pat" data-action="msg-bubble-pat" data-message-id="${escapeHtml(messageId)}" type="button">
                ${MSG_ICONS.pat}<span>拍拍</span>
              </button>
            ` : ''}
            <button class="msg-bubble-toolbar__btn" data-action="msg-bubble-edit" data-message-id="${escapeHtml(messageId)}" type="button">
              ${MSG_ICONS.edit}<span>编辑</span>
            </button>
            <button class="msg-bubble-toolbar__btn" data-action="msg-bubble-favorite" data-message-id="${escapeHtml(messageId)}" type="button">
              ${MSG_ICONS.favorite}<span>收藏</span>
            </button>
            ${isUser ? `
              <button class="msg-bubble-toolbar__btn msg-bubble-toolbar__btn--withdraw" data-action="msg-bubble-withdraw" data-message-id="${escapeHtml(messageId)}" type="button">
                ${MSG_ICONS.withdraw}<span>撤回</span>
              </button>
            ` : ''}
            <button class="msg-bubble-toolbar__btn msg-bubble-toolbar__btn--danger ${isDeleteConfirming ? 'is-confirming' : ''}" data-action="msg-bubble-delete" data-message-id="${escapeHtml(messageId)}" type="button">
              ${MSG_ICONS.delete}<span>${isDeleteConfirming ? '取消' : '删除'}</span>
            </button>
            ${isDeleteConfirming ? `
              <button class="msg-bubble-toolbar__btn msg-bubble-toolbar__btn--confirm-delete" data-action="msg-bubble-confirm-delete" data-message-id="${escapeHtml(messageId)}" type="button">
                ${MSG_ICONS.check}<span>确认删除</span>
              </button>
            ` : ''}
            <button class="msg-bubble-toolbar__btn msg-bubble-toolbar__btn--rewind ${isRewindConfirming ? 'is-confirming' : ''}" data-action="msg-bubble-rewind" data-message-id="${escapeHtml(messageId)}" type="button">
              ${MSG_ICONS.rewind}<span>${isRewindConfirming ? '取消' : '回溯'}</span>
            </button>
            ${isRewindConfirming ? `
              <button class="msg-bubble-toolbar__btn msg-bubble-toolbar__btn--confirm-rewind" data-action="msg-bubble-confirm-rewind" data-message-id="${escapeHtml(messageId)}" type="button">
                ${MSG_ICONS.check}<span>确认回溯</span>
              </button>
            ` : ''}
            <button class="msg-bubble-toolbar__btn" data-action="msg-bubble-multi" data-message-id="${escapeHtml(messageId)}" type="button">
              ${MSG_ICONS.multiSelect}<span>多选</span>
            </button>
            <button class="msg-bubble-toolbar__btn msg-bubble-toolbar__btn--copy" data-action="msg-bubble-copy" data-message-id="${escapeHtml(messageId)}" type="button">
              ${MSG_ICONS.copy}<span>复制</span>
            </button>
            <button class="msg-bubble-toolbar__btn msg-bubble-toolbar__btn--quote" data-action="msg-bubble-quote" data-message-id="${escapeHtml(messageId)}" type="button">
              ${MSG_ICONS.quote}<span>引用</span>
            </button>
          </div>
        ` : ''}
        <div class="msg-bubble ${isUser ? 'msg-bubble--user' : 'msg-bubble--other'} ${isAssistant && msg?.pending ? 'is-pending' : ''} ${isStickerMessage ? 'msg-bubble--sticker' : ''} ${isTextImageBubbleMessage ? 'msg-bubble--text-image' : ''} ${isVoiceBubbleMessage ? 'msg-bubble--voice' : ''} ${isImageMessage ? 'msg-bubble--image' : ''} ${isTransferMessage ? 'msg-bubble--transfer' : ''} ${isGiftBubbleMessage ? 'msg-bubble--gift' : ''} ${isRedPacketBubbleMessage ? 'msg-bubble--red-packet' : ''} ${isMomentShareMessage ? 'msg-bubble--moment-share' : ''} ${isLinkCardBubbleMessage ? 'msg-bubble--link-card' : ''} ${isHtmlCardMessage ? 'msg-bubble--html-card' : ''} ${isTakeawayBubbleMessage ? 'msg-bubble--takeaway-wrap' : ''} ${quoteHtml ? 'msg-bubble--with-quote' : ''}">
          ${quoteHtml}
          ${bubbleInnerHtml}
          ${renderTranslationBubbleHtml(msg, options.translationSettings, isUser)}
        </div>
        <span class="msg-bubble__time">${formatMsgTime(msg?.timestamp)}</span>
      </div>
      ${isUser && !hideAvatars ? `<div class="msg-bubble__avatar msg-bubble__avatar--user">${userAvatarMarkup}</div>` : ''}
      ${multiSelectMode ? `
        <button class="msg-bubble-select-dot ${isSelected ? 'is-selected' : ''}" data-action="msg-multi-toggle" data-message-id="${escapeHtml(messageId)}" type="button" aria-label="选择消息">
          ${isSelected ? MSG_ICONS.check : ''}
        </button>
      ` : ''}
    </div>
  `;
}

function renderLoadMoreChatMessagesHtml(hiddenMessageCount = 0, nextLoadCount = CHAT_MESSAGE_LOAD_MORE_STEP) {
  const hiddenCount = Math.max(0, Number(hiddenMessageCount || 0) || 0);
  if (!hiddenCount) return '';

  return `
    <div class="msg-load-more-row" data-role="msg-load-more-row">
      <button class="msg-load-more-btn" data-action="load-more-chat-messages" type="button">加载更多消息</button>
      <span class="msg-load-more-row__meta">还有 ${hiddenCount} 条更早消息，每次加载 ${Math.max(1, Number(nextLoadCount || 0) || CHAT_MESSAGE_LOAD_MORE_STEP)} 条</span>
    </div>
  `;
}

function renderChatMessageListHtml(session = {}, messages = [], options = {}) {
  const {
    allMessages,
    visibleMessages: rawMsgs,
    hiddenMessageCount,
    nextLoadCount
  } = getVisibleChatMessagesForRender(messages, options);

  const msgs = [];
  let inPhoneCall = false;
  for (const msg of rawMsgs) {
    if (String(msg?.type || '') === 'phone_start_system') {
      inPhoneCall = true;
      continue;
    }
    if (String(msg?.type || '') === 'phone_end_system') {
      inPhoneCall = false;
      msgs.push(msg); // 让主聊天记录显示“通话结束及通话时长”气泡
      continue;
    }
    if (inPhoneCall) continue; // 折叠/隐藏通话期间的聊天气泡
    msgs.push(msg);
  }

  if (allMessages.length === 0) {
    return `<div class="msg-empty">${MSG_ICONS.emptyChat}<p>还没有消息<br>发送一条消息开始聊天吧</p></div>`;
  }

  const asideDisplayMode = String(options.asideDisplayMode || 'top');
  const parts = [];

  for (let index = 0; index < msgs.length; index += 1) {
    const msg = msgs[index];

    if (asideDisplayMode === 'top' && msg?.role === 'assistant') {
      const run = [];
      let cursor = index;
      while (cursor < msgs.length && msgs[cursor]?.role === 'assistant') {
        run.push(msgs[cursor]);
        cursor += 1;
      }

      const runAsideHtml = run
        .flatMap(item => getAsideSegmentsFromMessage(item).map(segment => ({
          ownerMessageId: String(item?.id || '').trim(),
          segment
        })))
        .filter(item => item.segment?.text)
        .map((item, asideIndex) => {
          const ownerMessageId = String(item.ownerMessageId || '').trim();
          const asideSegmentId = String(item.segment?.id || `${run[0]?.id || 'aside_run'}_${asideIndex + 1}`);
          const isToolbarOpen = !Boolean(options.multiSelectMode)
            && String(options.selectedMessageId || '') === ownerMessageId
            && String(options.selectedAsideSegmentId || '').trim() === asideSegmentId;
          return renderAsideBubbleHtml(
            item.segment.text,
            `${asideSegmentId}_top_${asideIndex + 1}`,
            {
              ownerMessageId,
              asideSegmentId,
              isToolbarOpen,
              toolbarHtml: isToolbarOpen
                ? renderAsideToolbarHtml(run.find(message => String(message?.id || '') === ownerMessageId) || {}, session, options)
                : ''
            }
          );
        })
        .join('');

      if (runAsideHtml) parts.push(runAsideHtml);
      run.forEach(item => parts.push(renderMessageBubble(item, session, options)));
      index = cursor - 1;
      continue;
    }

    parts.push(renderMessageWithAsideHtml(msg, session, options));
  }

  return `${renderLoadMoreChatMessagesHtml(hiddenMessageCount, nextLoadCount)}${parts.join('')}`;
}

export function renderChatMessage(chatSession, messages, options = {}) {
  const session = chatSession || {};
  const name = String(session.remark ?? '').length ? String(session.remark) : (session.name || '聊天');
  const allMsgs = Array.isArray(messages) ? messages : [];
  const { visibleMessages: msgs } = getVisibleChatMessagesForRender(allMsgs, options);
  const chatSettings = options.chatSettings || {};
  const isSending = Boolean(options.isSending);
  const currentContact = getCurrentContactForSession(options, session);
  const contactAvatar = String(currentContact?.avatar || '').trim();
  const topBarAvatarMarkup = getSessionAvatarMarkup(session, {
    ...options,
    currentContact,
    contactAvatar
  });

  const stickerData = normalizeStickerPanelData(options.stickerData);
  const stickerPanelGroupId = String(options.stickerPanelGroupId || 'all');
  const stickerPanelOpen = Boolean(options.stickerPanelOpen);
  const coffeeDockOpen = Boolean(options.coffeeDockOpen);
  const stickerGroups = getStickerPanelGroups(stickerData);
  const visibleStickerItems = getVisibleStickerPanelItems(stickerData, stickerPanelGroupId);
  const mountedStickerGroupIds = Array.isArray(chatSettings.mountedStickerGroupIds)
    ? chatSettings.mountedStickerGroupIds.map(String)
    : [];

  const multiSelectMode = Boolean(options.multiSelectMode);
  const selectedMessageIds = Array.isArray(options.selectedMessageIds) ? options.selectedMessageIds.map(String) : [];
  const selectedCount = selectedMessageIds.length;
  const pendingQuote = options.pendingQuote || null;
  const pendingQuoteHtml = renderQuotePreview(pendingQuote, 'composer');

  const chatConsoleEnabled = Boolean(options.chatConsoleEnabled);
  const chatConsoleExpanded = Boolean(options.chatConsoleExpanded);
  const chatConsoleWarnErrorOnly = Boolean(options.chatConsoleWarnErrorOnly);
  const chatConsoleLogs = Array.isArray(options.chatConsoleLogs) ? options.chatConsoleLogs : [];
  const visibleConsoleLogs = getVisibleChatConsoleLogs(chatConsoleLogs, chatConsoleWarnErrorOnly);

  const topBarHtml = `
    <div class="msg-top-bar">
      <button class="msg-top-bar__back" data-action="msg-back" type="button">${MSG_ICONS.back}</button>
      <div class="msg-top-bar__user">
        <div class="msg-top-bar__avatar">
          ${topBarAvatarMarkup}
        </div>
        <div class="msg-top-bar__info">
          <span class="msg-top-bar__name">${escapeHtml(name)}</span>
          <span class="msg-top-bar__status">${isSending ? '正在回复...' : '在线'}</span>
        </div>
      </div>
      ${isAsideModeActive(options) ? renderAsideExitButtonHtml() : ''}
      <button class="msg-top-bar__search ${options.chatSearchOpen ? 'is-active' : ''}" data-action="toggle-msg-search" type="button" aria-label="搜索聊天记录">${MSG_ICONS.search}</button>
      <button class="msg-top-bar__more" data-action="msg-more" type="button">${MSG_ICONS.more}</button>
    </div>
  `;

  const searchPanelHtml = renderChatMessageSearchPanelHtml(session, msgs, options);
  const messagesHtml = renderChatMessageListHtml(session, allMsgs, options);

  const featureDockHtml = `
    <div class="msg-feature-dock ${coffeeDockOpen ? 'is-open' : ''}" data-role="msg-feature-dock">
      <div class="msg-feature-dock__row">
        <button class="msg-feature-dock__item" type="button" data-action="open-msg-image-modal" data-feature="image">
          ${MSG_ICONS.image}<span>图片</span>
        </button>
        ${renderTextImageFeatureButton()}
        ${renderVoiceFeatureButton()}
        <button class="msg-feature-dock__item" type="button" data-action="open-msg-transfer-modal" data-feature="transfer">
          ${MSG_ICONS.wallet}<span>转账</span>
        </button>
      </div>
      <div class="msg-feature-dock__row">
        ${renderGiftFeatureButton()}
        ${renderRedPacketFeatureButton()}
        ${renderTakeawayFeatureButton()}
        <button class="msg-feature-dock__item msg-feature-dock__item--aside" type="button" data-action="open-msg-aside-modal" data-feature="aside">
          ${MSG_ICONS.aside}<span>旁白</span>
        </button>
      </div>
      <!-- ======================================================================
           [区域标注·本次修改·电话功能] 第三行"电话"板块
           说明：增加电话功能板块占位
           ====================================================================== -->
      <div class="msg-feature-dock__row">
        <button class="msg-feature-dock__item msg-feature-dock__item--phone" type="button" data-action="open-msg-phone-modal" data-feature="phone">
          ${MSG_ICONS.phone}<span>电话</span>
        </button>
        <div class="msg-feature-dock__item" style="visibility: hidden;"></div>
        <div class="msg-feature-dock__item" style="visibility: hidden;"></div>
        <div class="msg-feature-dock__item" style="visibility: hidden;"></div>
      </div>
    </div>
  `;

  const stickerPanelHtml = `
    <div class="msg-sticker-panel ${stickerPanelOpen ? 'is-open' : ''}" data-role="msg-sticker-panel">
      <div class="msg-sticker-panel__groups">
        ${stickerGroups.map(group => `
          <button class="msg-sticker-panel__group-btn ${stickerPanelGroupId === group.id ? 'is-active' : ''}"
                  data-action="switch-msg-sticker-group"
                  data-sticker-group-id="${escapeHtml(group.id)}"
                  type="button">
            ${escapeHtml(group.name)}
          </button>
        `).join('')}
      </div>
      <div class="msg-sticker-panel__grid">
        ${visibleStickerItems.length
          ? visibleStickerItems.map(item => `
              <button class="msg-sticker-panel__item"
                      data-action="send-msg-sticker"
                      data-sticker-id="${escapeHtml(item.id)}"
                      type="button"
                      title="${escapeHtml(item.name)}">
                <img src="${escapeHtml(item.url)}" alt="${escapeHtml(item.name)}">
                <span>${escapeHtml(item.name)}</span>
              </button>
            `).join('')
          : `<div class="msg-sticker-panel__empty">当前分组暂无表情包</div>`}
      </div>
    </div>
  `;

  const multiSelectBarHtml = multiSelectMode ? `
    <div class="msg-multi-action-bar" data-role="msg-multi-action-bar">
      <button class="msg-multi-action-bar__btn" data-action="msg-multi-cancel" type="button">${MSG_ICONS.close}<span>取消</span></button>
      <span class="msg-multi-action-bar__count">已选 ${selectedCount} 条</span>
      <button class="msg-multi-action-bar__btn" data-action="msg-multi-favorite-selected" type="button" ${selectedCount ? '' : 'disabled'}>${MSG_ICONS.favorite}<span>收藏</span></button>
      <button class="msg-multi-action-bar__btn msg-multi-action-bar__btn--danger" data-action="msg-multi-delete-selected" type="button" ${selectedCount ? '' : 'disabled'}>${MSG_ICONS.delete}<span>删除</span></button>
      <button class="msg-multi-action-bar__btn" data-action="msg-multi-forward" type="button" ${selectedCount ? '' : 'disabled'}>${MSG_ICONS.forward}<span>转发</span></button>
    </div>
  ` : '';

  const chatBackgroundAttrs = getChatBackgroundListAreaAttrs(chatSettings);
  /* ======================================================================
     [区域标注·已完成·聊天背景专用底层渲染]
     说明：
     1. 背景来源仍只读取当前 chatPromptSettings.chatBackgroundSrc，不新增任何持久化存储。
     2. 本次改为在真实聊天消息页 .msg-conversation 内渲染专用背景层，像桌面壁纸一样铺满聊天窗口底层。
     3. 顶栏、消息列表、底栏都叠在背景层上方；消息列表保持透明，避免默认底色遮住新背景。
     ====================================================================== */
  const pageClassName = [
    'msg-page',
    chatBackgroundAttrs.className
  ].filter(Boolean).join(' ');
  const conversationClassName = [
    multiSelectMode ? 'msg-conversation is-multi-select-mode' : 'msg-conversation',
    chatBackgroundAttrs.className
  ].filter(Boolean).join(' ');
  const listAreaClassName = [
    multiSelectMode ? 'msg-list-area is-multi-select-mode' : 'msg-list-area',
    chatBackgroundAttrs.className
  ].filter(Boolean).join(' ');

  const chatBackgroundLayerHtml = `
    <div class="msg-chat-background-layer ${chatBackgroundAttrs.className}" data-role="msg-chat-background-layer"${chatBackgroundAttrs.styleAttr}></div>
  `;

  const inputBarHtml = `
    <div class="msg-input-shell ${pendingQuoteHtml ? 'has-pending-quote' : ''}">
      ${featureDockHtml}
      ${stickerPanelHtml}
      ${pendingQuoteHtml ? `
        <div class="msg-pending-quote" data-role="msg-pending-quote">
          ${pendingQuoteHtml}
          <button class="msg-pending-quote__cancel" data-action="cancel-msg-quote" type="button" aria-label="取消引用">${MSG_ICONS.close}</button>
        </div>
      ` : ''}

      ${renderChatConsoleDockHtml({
        chatConsoleEnabled,
        chatConsoleExpanded,
        chatConsoleWarnErrorOnly,
        visibleConsoleLogs,
        chatConsoleTokenUsage: options.chatConsoleTokenUsage
      })}

      <div class="msg-input-bar">
        <button class="msg-input-bar__icon-btn" data-action="msg-coffee" type="button">${MSG_ICONS.coffee}</button>
        <button class="msg-input-bar__icon-btn ${stickerPanelOpen ? 'is-active' : ''}" data-action="msg-sticker" type="button" ${isSending ? 'disabled' : ''}>${MSG_ICONS.sticker}</button>
        <textarea class="msg-input-bar__input" rows="1" placeholder="输入消息..." data-role="msg-input" ${isSending ? 'disabled' : ''}></textarea>
        <button class="msg-input-bar__icon-btn" data-action="msg-magic" type="button" ${isSending ? 'disabled' : ''}>${MSG_ICONS.magicWand}</button>
        <button class="msg-input-bar__icon-btn msg-input-bar__send-btn" data-action="msg-send" type="button" ${isSending ? 'disabled' : ''}>${MSG_ICONS.send}</button>
      </div>
    </div>
  `;

  const settingsPageHtml = renderChatMessageSettingsPage({
    session,
    name,
    chatSettings,
    options: {
      ...options,
      currentContact,
      contactAvatar
    },
    stickerGroups,
    mountedStickerGroupIds,
    chatConsoleEnabled
  });

  setTimeout(() => {
    initTakeawayBanner(document.querySelector('.msg-page'), { currentMessages: allMsgs }, selectedMessageIds);
  }, 100);

  return `
    <div class="${pageClassName}"${chatBackgroundAttrs.styleAttr}>
      <div class="${conversationClassName}" data-role="msg-conversation"${chatBackgroundAttrs.styleAttr}>
        ${chatBackgroundLayerHtml}
        ${topBarHtml}
        ${searchPanelHtml}
        <!-- ==================================================================
             [区域标注·已完成·本次新增：聊天背景应用到当前聊天窗口]
             说明：
             1. 背景来源读取当前 chatPromptSettings.chatBackgroundSrc，随当前会话设置持久化。
             2. 首屏渲染时直接写入 class/style，减少进入聊天窗口时的背景闪屏。
             3. 不在本区域读写 localStorage/sessionStorage，不做双份兜底。
             ================================================================== -->
        <div class="${listAreaClassName}" data-role="msg-list"${chatBackgroundAttrs.styleAttr}>${messagesHtml}</div>
        ${multiSelectBarHtml}
        ${multiSelectMode ? '' : inputBarHtml}
      </div>
      ${settingsPageHtml}
    </div>
  `;
}

function syncRenderedChatMessageLoadMoreControl(listArea, state) {
  if (!listArea) return;
  const existingRow = listArea.querySelector('[data-role="msg-load-more-row"]');
  const { hiddenMessageCount, nextLoadCount } = getVisibleChatMessagesForRender(state.currentMessages, {
    chatMessageVisibleCount: state.chatMessageVisibleCount
  });

  if (!hiddenMessageCount) {
    existingRow?.remove();
    return;
  }

  const nextHtml = renderLoadMoreChatMessagesHtml(hiddenMessageCount, nextLoadCount);
  if (existingRow) {
    existingRow.outerHTML = nextHtml;
    return;
  }

  listArea.insertAdjacentHTML('afterbegin', nextHtml);
}

function trimRenderedChatMessageRowsToVisibleLimit(listArea, state) {
  if (!listArea) return;
  const visibleCount = normalizeChatMessageVisibleCount(state.chatMessageVisibleCount);
  const messageRows = Array.from(listArea.children).filter(element => element.hasAttribute('data-message-id'));

  while (messageRows.length > visibleCount) {
    const row = messageRows.shift();
    if (!row) break;

    let previous = row.previousElementSibling;
    while (previous && previous.classList.contains('msg-aside-bubble')) {
      const toRemove = previous;
      previous = previous.previousElementSibling;
      toRemove.remove();
    }

    row.remove();
  }
}

function syncHtmlCardBubbleToolbarWithoutFrameReload(row, message, session, state) {
  if (!row || !message || state.multiSelectMode) return false;
  if (String(message?.type || '') !== 'card' || !String(message?.cardHtml || message?.content || '').trim()) return false;

  const holder = document.createElement('div');
  holder.innerHTML = renderMessageBubble(message, session, {
    userProfile: state.profile,
    selectedMessageId: state.selectedMessageId,
    selectedAsideSegmentId: state.selectedAsideSegmentId,
    multiSelectMode: state.multiSelectMode,
    selectedMessageIds: state.selectedMessageIds,
    deleteConfirmMessageId: state.deleteConfirmMessageId,
    rewindConfirmMessageId: state.rewindConfirmMessageId
  }).trim();

  const nextRow = holder.firstElementChild;
  const content = row.querySelector('.msg-bubble-content');
  const bubble = content?.querySelector('.msg-bubble');
  if (!nextRow || !content || !bubble) return false;

  row.className = nextRow.className;
  if (nextRow.dataset.action) row.dataset.action = nextRow.dataset.action;

  const existingToolbar = Array.from(content.children).find(child => child.matches?.('[data-role="msg-bubble-toolbar"]'));
  const nextToolbar = nextRow.querySelector('[data-role="msg-bubble-toolbar"]');

  if (!nextToolbar) {
    existingToolbar?.remove();
    return true;
  }

  if (existingToolbar) {
    existingToolbar.outerHTML = nextToolbar.outerHTML;
    return true;
  }

  bubble.insertAdjacentHTML('beforebegin', nextToolbar.outerHTML);
  return true;
}

export function renderCurrentChatMessage(container, state, options = {}) {
  const msgWrap = container.querySelector('[data-role="msg-page-wrap"]');
  const session = state.sessions.find(s => s.id === state.currentChatId);
  if (!msgWrap || !session) return;

  const listBefore = msgWrap.querySelector('[data-role="msg-list"]');
  const shouldKeepScroll = Boolean(options.keepScroll);
  const shouldPreservePrependPosition = Boolean(options.preservePrependPosition);
  const previousScrollTop = listBefore ? listBefore.scrollTop : 0;
  const previousScrollHeight = listBefore ? listBefore.scrollHeight : 0;

  msgWrap.innerHTML = renderChatMessage(session, state.currentMessages, {
    chatSettings: state.chatPromptSettings,
    isSending: state.isAiSending,
    translationSettings: state.translationSettings,
    userProfile: state.profile,
    contacts: state.contacts,
    stickerData: state.stickerData,
    stickerPanelGroupId: state.stickerPanelGroupId,
    stickerPanelOpen: state.stickerPanelOpen,
    coffeeDockOpen: state.coffeeDockOpen,
    selectedMessageId: state.selectedMessageId,
    selectedAsideSegmentId: state.selectedAsideSegmentId,
    multiSelectMode: state.multiSelectMode,
    selectedMessageIds: state.selectedMessageIds,
    deleteConfirmMessageId: state.deleteConfirmMessageId,
    rewindConfirmMessageId: state.rewindConfirmMessageId,
    pendingQuote: state.pendingQuote,
    chatConsoleEnabled: state.chatConsoleEnabled,
    chatConsoleExpanded: state.chatConsoleExpanded,
    chatConsoleWarnErrorOnly: state.chatConsoleWarnErrorOnly,
    chatConsoleLogs: state.chatConsoleLogs,
    chatConsoleTokenUsage: state.chatConsoleTokenUsage,
    chatSearchOpen: state.chatMessageSearchOpen,
    chatSearchKeyword: state.chatMessageSearchKeyword,
    chatMessageVisibleCount: state.chatMessageVisibleCount,
    asideModeActive: state.asideModeActive,
    asideDisplayMode: state.asideSettings?.displayMode || 'top'
  });

  setTimeout(() => {
    const listArea = msgWrap.querySelector('[data-role="msg-list"]');
    if (!listArea) return;
    if (shouldPreservePrependPosition) {
      listArea.scrollTop = previousScrollTop + Math.max(0, listArea.scrollHeight - previousScrollHeight);
      return;
    }
    if (shouldKeepScroll) {
      listArea.scrollTop = previousScrollTop;
      return;
    }
    listArea.scrollTop = listArea.scrollHeight;
  }, 30);
}

export function appendCurrentMessageBubble(container, state, message) {
  if (!message || !state.currentChatId) return;

  const msgWrap = container.querySelector('[data-role="msg-page-wrap"]');
  const listArea = msgWrap?.querySelector('[data-role="msg-list"]');
  const session = state.sessions.find(s => s.id === state.currentChatId);
  if (!msgWrap || !listArea || !session) {
    renderCurrentChatMessage(container, state);
    return;
  }

  const emptyEl = listArea.querySelector('.msg-empty');
  if (emptyEl) emptyEl.remove();

  /* ========================================================================
     [区域标注·本次修改·主界面电话消息过滤修复] 
     说明：修复在电话期间发送的消息依然会追加到主页面列表的 bug。
           追加前，如果发现当前会话中已经有未闭合的 'phone_start_system'，
           说明还处于电话状态，此时不应该将这条消息追加到主聊天界面里去，
           而是依靠 chat-phone.js 去渲染到全屏的电话页面。
           注意：这里不处理 'phone_start_system' 本身，因为它需要显示；
           也不处理 'phone_end_system'，因为它需要显示。
     ======================================================================== */
  let isCurrentlyInPhoneCall = false;
  const msgs = state.currentMessages || [];
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].type === 'phone_end_system') {
      break; // 从后往前找，先遇到结束标志，说明没在通话中
    }
    if (msgs[i].type === 'phone_start_system') {
      isCurrentlyInPhoneCall = true;
      break; // 先遇到开始标志，说明在通话中
    }
  }

  // 如果当前在通话中，且追加的不是系统开始/结束提示，直接跳过在主界面的渲染
  if (isCurrentlyInPhoneCall && message.type !== 'phone_start_system' && message.type !== 'phone_end_system') {
    return;
  }

  listArea.insertAdjacentHTML('beforeend', renderMessageWithAsideHtml(message, session, {
    userProfile: state.profile,
    contacts: state.contacts,
    chatSettings: state.chatPromptSettings,
    selectedMessageId: state.selectedMessageId,
    selectedAsideSegmentId: state.selectedAsideSegmentId,
    multiSelectMode: state.multiSelectMode,
    selectedMessageIds: state.selectedMessageIds,
    asideDisplayMode: state.asideSettings?.displayMode || 'top',
    translationSettings: state.translationSettings,
    deleteConfirmMessageId: state.deleteConfirmMessageId,
    rewindConfirmMessageId: state.rewindConfirmMessageId,
    pendingQuote: state.pendingQuote
  }));

  trimRenderedChatMessageRowsToVisibleLimit(listArea, state);
  syncRenderedChatMessageLoadMoreControl(listArea, state);
  listArea.scrollTop = listArea.scrollHeight;
}

export function refreshMessageBubbleRows(container, state, messageIds = []) {
  const msgWrap = container.querySelector('[data-role="msg-page-wrap"]');
  const listArea = msgWrap?.querySelector('[data-role="msg-list"]');
  const session = state.sessions.find(s => s.id === state.currentChatId);
  if (!listArea || !session) return false;

  const uniqueIds = Array.from(new Set((messageIds || []).map(id => String(id || '')).filter(Boolean)));
  const shouldRefreshWholeListForAside = uniqueIds.some(messageId => {
    const message = (state.currentMessages || []).find(item => String(item.id) === messageId);
    return hasRenderableAsideContent(message);
  });

  if (shouldRefreshWholeListForAside) {
    refreshCurrentMessageListOnly(container, state);
    return true;
  }

  uniqueIds.forEach(messageId => {
    const row = listArea.querySelector(`.msg-bubble-row[data-message-id="${CSS.escape(messageId)}"], .msg-transfer-system-row[data-message-id="${CSS.escape(messageId)}"]`);
    const message = (state.currentMessages || []).find(item => String(item.id) === messageId);
    if (!row || !message) return;

    if (syncHtmlCardBubbleToolbarWithoutFrameReload(row, message, session, state)) return;

    row.outerHTML = renderMessageBubble(message, session, {
      userProfile: state.profile,
      contacts: state.contacts,
      chatSettings: state.chatPromptSettings,
      selectedMessageId: state.selectedMessageId,
      selectedAsideSegmentId: state.selectedAsideSegmentId,
      multiSelectMode: state.multiSelectMode,
      selectedMessageIds: state.selectedMessageIds,
      deleteConfirmMessageId: state.deleteConfirmMessageId,
      rewindConfirmMessageId: state.rewindConfirmMessageId
    });
  });

  return true;
}

export function refreshCurrentMessageListOnly(container, state) {
  const msgWrap = container.querySelector('[data-role="msg-page-wrap"]');
  const listArea = msgWrap?.querySelector('[data-role="msg-list"]');
  const session = state.sessions.find(s => s.id === state.currentChatId);
  if (!listArea || !session) {
    renderCurrentChatMessage(container, state, { keepScroll: true });
    return;
  }

  const previousScrollTop = listArea.scrollTop;
  listArea.innerHTML = renderChatMessageListHtml(session, state.currentMessages, {
    userProfile: state.profile,
    contacts: state.contacts,
    chatSettings: state.chatPromptSettings,
    selectedMessageId: state.selectedMessageId,
    selectedAsideSegmentId: state.selectedAsideSegmentId,
    multiSelectMode: state.multiSelectMode,
    selectedMessageIds: state.selectedMessageIds,
    asideDisplayMode: state.asideSettings?.displayMode || 'top',
    deleteConfirmMessageId: state.deleteConfirmMessageId,
    rewindConfirmMessageId: state.rewindConfirmMessageId,
    chatMessageVisibleCount: state.chatMessageVisibleCount
  });
  listArea.scrollTop = previousScrollTop;
}

export function refreshCurrentSessionLastMessage(state) {
  const session = state.sessions.find(s => s.id === state.currentChatId);
  if (!session) return;

  const latest = [...(state.currentMessages || [])].reverse().find(item => String(item?.content || '').trim());
  session.lastMessage = latest?.type === 'sticker'
    ? `[表情包] ${latest?.stickerName || '未命名表情包'}`
    : (isTextImageMessage(latest)
        ? `[文字图] ${latest?.textImageText || '文字图'}`
        : (isVoiceMessage(latest)
            ? getVoiceMessageDisplayText(latest)
            : (latest?.type === 'image'
                ? `[图片] ${latest?.imageName || '图片'}`
                : (latest?.type === 'transfer'
                    ? `[转账] ${latest?.transferDisplayAmount || latest?.content || '¥0.00'}`
                    : (latest?.type === 'gift'
                        ? getGiftMessageDisplayText(latest)
                        : (latest?.type === 'red_packet'
                            ? getRedPacketMessageDisplayText(latest)
                            : (isLinkCardMessage(latest)
                                ? getLinkCardMessageDisplayText(latest)
                                : (latest?.type === 'phone_end_system' || latest?.type === 'phone_start_system'
                                    ? String(latest?.content || '[电话记录]')
                                    : (latest?.content || '')))))))));
  session.lastTime = latest?.timestamp || Date.now();
}
