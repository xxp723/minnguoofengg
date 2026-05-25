// @ts-nocheck
/**
 * 文件名: js/apps/chat/chat-message.js
 * 用途: 闲谈应用 — 聊天消息页面
 *       独立的聊天对话界面，包含消息列表、悬浮输入栏、功能占位区与聊天设置页。
 * 架构层: 应用层（闲谈子模块）
 */

import {
  DATA_KEY_SESSIONS,
  DATA_KEY_MESSAGES_PREFIX,
  dbGet,
  dbPut,
  normalizeStickerData,
  normalizeWalletData,
  persistWalletData
} from './chat-utils.js';
import { chat } from './prompt.js';
/* ==========================================================================
   [区域标注·已完成·全局API报错弹窗接入] 导入应用内 API 报错弹窗
   说明：
   1. API 失败、429/503 等状态码、网络错误或空回复时，统一显示应用内弹窗。
   2. 不使用 alert/confirm/prompt 等原生浏览器弹窗。
   3. 弹窗只操作运行时 DOM，不写入聊天记录，不涉及持久化存储。
   ========================================================================== */
import { showApiErrorModal } from '../../core/ui/components/ApiErrorModal.js';
import { ensureChatHtmlCardMessageBridge } from './chat-message-card-bridge.js';
import {
  buildPromptPayloadForLatestUserRound as buildPromptPayloadForLatestUserRoundModule
} from './chat-message-prompt-payload.js';
import {
  bindAsideSegmentsToAiMessages as bindAsideSegmentsToAiMessagesModule,
  resolveStickerProtocolTarget as resolveStickerProtocolTargetModule,
  normalizeStickerLooseMatchText as normalizeStickerLooseMatchTextModule,
  findLooseStickerTargetFromText as findLooseStickerTargetFromTextModule,
  createStickerMessagePatchFromTarget as createStickerMessagePatchFromTargetModule,
  repairAiMessageFormatIfPossible as repairAiMessageFormatIfPossibleModule,
  repairAiTextMessageFormatIfPossible as repairAiTextMessageFormatIfPossibleModule,
  repairAiQuoteMessageFormatIfPossible as repairAiQuoteMessageFormatIfPossibleModule,
  repairAiVoiceMessageFormatIfPossible as repairAiVoiceMessageFormatIfPossibleModule,
  repairAiAsideMessageFormatIfPossible as repairAiAsideMessageFormatIfPossibleModule,
  repairAiSystemTipFormatIfPossible as repairAiSystemTipFormatIfPossibleModule,
  cleanAiProtocolBlockContent as cleanAiProtocolBlockContentModule,
  sortAiMessagesByRuntimeProtocolOrder as sortAiMessagesByRuntimeProtocolOrderModule,
  stripAiRuntimeProtocolOrderFields as stripAiRuntimeProtocolOrderFieldsModule,
  filterCurrentUserRoundEchoFromAiMessages as filterCurrentUserRoundEchoFromAiMessagesModule,
  parseAiTransferProtocolPayload as parseAiTransferProtocolPayloadModule,
  resolveAiQuotePayloadById as resolveAiQuotePayloadByIdModule,
  extractAiProtocolBlocks as extractAiProtocolBlocksModule,
  buildAiReplyMessages as buildAiReplyMessagesModule,
  splitAiReplyIntoBubbles as splitAiReplyIntoBubblesModule,
  sanitizeAiVisibleReply as sanitizeAiVisibleReplyModule,
  extractProtocolReplyContents as extractProtocolReplyContentsModule,
  getReplyBubbleCountRange as getReplyBubbleCountRangeModule,
  cleanAiVisibleBubbleText as cleanAiVisibleBubbleTextModule,
  splitSingleBubbleForCount as splitSingleBubbleForCountModule,
  enforceAiReplyMessageCount as enforceAiReplyMessageCountModule
} from './chat-message-ai-protocol.js';
/* ==========================================================================
   [区域标注·已完成·礼物板块集成] 导入独立礼物模块
   说明：
   1. 咖啡功能区“礼物”入口、礼物消息摘要与礼物卡片渲染均来自 chat-gift.js。
   2. 本文件只负责消息页挂载与渲染衔接，礼物功能细节请直接修改 chat-gift.js。
   3. 持久化仍由 DB.js / IndexedDB 完成，禁止 localStorage/sessionStorage。
   ========================================================================== */
import {
  getGiftMessageDisplayText
} from './chat-gift.js';
/* ==========================================================================
   [区域标注·已完成·文字图板块集成] 导入独立文字图模块
   说明：
   1. 咖啡功能区“文字图”入口、拍立得消息气泡与悬浮预览由 chat-text-image.js / chat-text-image.css 独立维护。
   2. 本文件只负责把文字图消息接入聊天消息页渲染与 AI 上下文组装。
   3. 文字图不写 imageUrl，不触发视觉识别 token；AI 只读取精简图片描述文本。
   4. 持久化仍统一通过 DB.js / IndexedDB，不使用 localStorage/sessionStorage。
   ========================================================================== */
import {
  isTextImageMessage
} from './chat-text-image.js';
/* ==========================================================================
   [区域标注·已完成·心声面板集成] 导入心声模块提取函数
   说明：
   1. extractInnerVoiceFromRawText 从 AI 原始回复中提取 [心声]{json}[/心声] 并返回清理后文本。
   2. 提取到的心声数据挂到本轮最后一条 AI 消息的 innerVoice 字段，随 currentMessages 写入 DB.js / IndexedDB。
   3. 不使用 localStorage/sessionStorage，不做双份存储兜底。
   ========================================================================== */
import {
  extractInnerVoiceFromRawText,
  persistInnerVoiceHistoryEntry
} from './chat-inner-voice.js';
/* ==========================================================================
   [区域标注·已完成·旁白模式] 导入旁白模块函数
   说明：
   1. extractAsideFromRawText — 从 AI 原始回复中提取 [旁白]...[/旁白] 标记内容。
   2. renderAsideBubbleHtml — 生成旁白气泡居中加粗 HTML。
   3. isAsideModeActive — 检测当前 state 是否处于旁白模式。
   ========================================================================== */
import {
  extractAsideFromRawText,
  renderAsideBubbleHtml,
  isAsideModeActive
} from './chat-aside.js';
/* ==========================================================================
   [区域标注·已完成·本次拆分] 聊天消息页弹窗子模块接线
   说明：
   1. 原 chat-message.js 中的图片、转账、头像、撤回、编辑、收藏、转发等弹窗实现，
      已拆分到 chat-message-modals.js。
   2. 本文件只保留 facade 接线层，继续对外提供原有同名导出，避免影响既有调用方。
   3. 后续如需修改这些弹窗，请直接修改 chat-message-modals.js，不要回到本文件追加实现。
   4. 弹窗仍统一沿用应用内样式；不使用 localStorage/sessionStorage。
   ========================================================================== */
import {
  showMessageImageModal as showMessageImageModalModule,
  showMessageTransferModal as showMessageTransferModalModule,
  showTransferActionModal as showTransferActionModalModule,
  showChatAvatarSourceModal as showChatAvatarSourceModalModule,
  showChatAvatarUrlModal as showChatAvatarUrlModalModule,
  showChatAvatarCropModal as showChatAvatarCropModalModule,
  updateChatAvatarCropPreview as updateChatAvatarCropPreviewModule,
  buildChatAvatarFromCropModal as buildChatAvatarFromCropModalModule,
  showAiFormatRepairTypeModal as showAiFormatRepairTypeModalModule,
  showUserWithdrawMessageModal as showUserWithdrawMessageModalModule,
  showAiWithdrawnMessageModal as showAiWithdrawnMessageModalModule,
  showAiFormatRepairResultModal as showAiFormatRepairResultModalModule,
  showEditMessageModal as showEditMessageModalModule,
  showEditAsideModal as showEditAsideModalModule,
  showFavoriteSavedModal as showFavoriteSavedModalModule,
  showForwardMessagesModal as showForwardMessagesModalModule
} from './chat-message-modals.js';
import {
  getMessageDisplayTextForQuote as getMessageDisplayTextForQuoteModule,
  createQuotePayloadFromMessage as createQuotePayloadFromMessageModule,
  renderQuotePreview as renderQuotePreviewModule,
  syncPendingQuoteComposer as syncPendingQuoteComposerModule
} from './chat-message-quote.js';
import {
  getChatSearchMessageText as getChatSearchMessageTextModule,
  getChatSearchMatches as getChatSearchMatchesModule,
  renderChatSearchResultBubble as renderChatSearchResultBubbleModule,
  renderChatMessageSearchResultsHtml as renderChatMessageSearchResultsHtmlModule,
  renderChatMessageSearchPanelHtml as renderChatMessageSearchPanelHtmlModule,
  syncChatMessageSearchPanel as syncChatMessageSearchPanelModule,
  scrollToChatSearchResult as scrollToChatSearchResultModule
} from './chat-message-search.js';
import {
  updateMultiSelectActionBar as updateMultiSelectActionBarModule,
  resetMessageSelectionState as resetMessageSelectionStateModule,
  getSelectedMessages as getSelectedMessagesModule
} from './chat-message-selection.js';
import {
  getVisibleChatConsoleLogs as getVisibleChatConsoleLogsModule,
  renderChatConsoleDockHtml as renderChatConsoleDockHtmlModule,
  getAsideSegmentsFromMessage as getAsideSegmentsFromMessageModule,
  renderMessageBubble as renderMessageBubbleModule,
  renderChatMessage as renderChatMessageModule,
  renderCurrentChatMessage as renderCurrentChatMessageModule,
  appendCurrentMessageBubble as appendCurrentMessageBubbleModule,
  refreshMessageBubbleRows as refreshMessageBubbleRowsModule,
  refreshCurrentMessageListOnly as refreshCurrentMessageListOnlyModule,
  refreshCurrentSessionLastMessage as refreshCurrentSessionLastMessageModule
} from './chat-message-render.js';
import {
  appendChatConsoleRuntimeLog,
  persistChatConsoleRuntimeLogs
} from './chat-message-console.js';
import { refreshArchiveContextForAiRequest } from './chat-message-archive-context.js';
import {
  syncStickerInputSuggestions as syncStickerInputSuggestionsModule,
  renderMsgStickerPanelGrid as renderMsgStickerPanelGridModule,
  syncMountedStickerGroupButtons as syncMountedStickerGroupButtonsModule
} from './chat-message-stickers.js';
import { maybeRunAutoLongTermMemorySummary } from './chat-memory-settings.js';

/* ==========================================================================
   [区域标注·已完成·本次拆分] 聊天消息页 HTML 卡片 iframe 全局桥接接线
   说明：
   1. 原 chat-message.js 内联的 postMessage 监听器已下沉到 chat-message-card-bridge.js。
   2. 本文件只保留一次性初始化调用，继续保持原有高度自适应、双击收藏与交互事件桥接行为。
   3. 不改动任何持久化路径；相关交互仍由上层统一写入 DB.js / IndexedDB。
   ========================================================================== */
ensureChatHtmlCardMessageBridge();


/* ==========================================================================
   [区域标注·已完成·本次拆分] IconPark 图标 SVG 定义
   说明：
   1. 聊天消息页面用到的按键图标 SVG 常量已拆至 chat-message-icons.js。
   2. 本文件不再维护内联 SVG 常量，图标渲染职责已下沉到对应子模块。
   3. 图标模块仅导出静态 SVG，不涉及持久化存储。
   ========================================================================== */

/* ==========================================================================
   [区域标注] 工具函数
/* ========================================================================== */
function formatMsgTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/* ========================================================================
   [区域标注·已完成·本次聊天记录分段加载] 消息渲染数量控制
   说明：
   1. 聊天界面默认只渲染最新 100 条消息，避免历史消息过多导致页面卡顿。
   2. 点击消息列表顶部居中的“加载更多消息”后，每次再向前显示 100 条旧消息。
   3. 这里只控制“界面渲染/用户查看范围”；state.currentMessages 始终保留完整数组，
      AI 发送历史上下文仍按原有逻辑读取完整 currentMessages，不受本区域影响。
   4. 不读写 localStorage/sessionStorage，不新增任何持久化存储，也不按长文本字段过滤。
   ======================================================================== */
const CHAT_MESSAGE_INITIAL_VISIBLE_COUNT = 100;
const CHAT_MESSAGE_LOAD_MORE_STEP = 100;

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

/* ========================================================================
   [区域标注·已完成·引用回复] 引用消息数据工具
   说明：
   1. 只从当前消息对象提取可读摘要，随回复消息的 quote 字段写入 IndexedDB。
   2. 不使用 localStorage/sessionStorage，不保留双份存储兜底。
   3. 下次如需修改引用预览文案或长度，优先修改本区域。
   ======================================================================== */
function getMessageDisplayTextForQuote(message = {}) {
  return getMessageDisplayTextForQuoteModule(message);
}

export function createQuotePayloadFromMessage(message = {}, chatSession = {}, userProfile = {}) {
  return createQuotePayloadFromMessageModule(message, chatSession, userProfile);
}

function renderQuotePreview(quote = {}, variant = 'bubble') {
  return renderQuotePreviewModule(quote, variant);
}

/* ========================================================================
   [区域标注·已完成·本次拆分] 聊天记录搜索子模块 facade
   说明：
   1. 搜索文案提取、匹配、结果列表与顶栏下浮搜索面板实现，已拆分到 chat-message-search.js。
   2. 本文件仅保留薄接线层，继续维持原函数名，避免影响 renderChatMessage 与外部调用方。
   3. 搜索仍只使用当前运行时消息数组，不写入 IndexedDB，不使用 localStorage/sessionStorage。
   ======================================================================== */
function getChatSearchMessageText(message = {}) {
  return getChatSearchMessageTextModule(message);
}

function getChatSearchMatches(messages = [], keyword = '') {
  return getChatSearchMatchesModule(messages, keyword);
}

function renderChatSearchResultBubble(item = {}, session = {}, userProfile = {}) {
  return renderChatSearchResultBubbleModule(item, session, userProfile);
}

function renderChatMessageSearchResultsHtml(session = {}, messages = [], options = {}) {
  return renderChatMessageSearchResultsHtmlModule(session, messages, options);
}

function renderChatMessageSearchPanelHtml(session = {}, messages = [], options = {}) {
  return renderChatMessageSearchPanelHtmlModule(session, messages, options);
}

/* ==========================================================================
   [区域标注·已完成·本次拆分] 聊天页表情包面板与输入联想子模块 facade
   说明：
   1. 表情包面板分组、联想结果与局部刷新逻辑已拆分到 chat-message-stickers.js。
   2. 本文件保留同名函数接线，避免影响既有调用方。
   3. 只使用当前运行时 state.stickerData / IndexedDB 已加载数据，不使用 localStorage/sessionStorage。
   ========================================================================== */
export function syncStickerInputSuggestions(container, state, keyword = '') {
  return syncStickerInputSuggestionsModule(container, state, keyword);
}

/* ==========================================================================
   [区域标注·已完成·本次 chat-message.js 瘦身与渲染模块接线]
   说明：
   1. 单条消息气泡渲染、整页聊天 HTML、旁白拼接与控制台抽屉渲染已统一委托给 chat-message-render.js。
   2. 本文件只保留同名 facade，继续兼容 index.js 与其它既有调用方。
   3. AI 发送流程、协议解析、DB.js / IndexedDB 持久化调度仍保留在本文件。
   ========================================================================== */
function getAsideSegmentsFromMessage(message = {}) {
  return getAsideSegmentsFromMessageModule(message);
}

export function renderMessageBubble(msg, chatSession, options = {}) {
  return renderMessageBubbleModule(msg, chatSession, options);
}

export function renderChatMessage(chatSession, messages, options = {}) {
  return renderChatMessageModule(chatSession, messages, options);
}

/* ========================================================================== */
export function sleep(ms) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}


export function getAiBubbleDelayMs(bubbleText, index) {
  const length = String(bubbleText || '').length;
  return Math.min(1300, Math.max(420, 260 + length * 24 + index * 80));
}

/* ==========================================================================
   [区域标注·已完成·本次转账待确认修复] 用户转账待 AI 决策工具
   说明：
   1. 用户发给 AI 的转账保持 pending，直到纸飞机触发 API 后才把待确认状态交给 AI。
   2. AI 可用 [转账] 协议返回“操作:接收/退回”，这里只更新当前消息与钱包数据。
   3. 所有状态和钱包流水只通过 DB.js / IndexedDB 持久化，不使用 localStorage/sessionStorage。
   ========================================================================== */
function getPendingOutgoingTransfers(state) {
  return (Array.isArray(state.currentMessages) ? state.currentMessages : [])
    .filter(message => (
      String(message?.type || '') === 'transfer'
      && String(message?.transferDirection || '') === 'outgoing'
      && String(message?.transferStatus || 'pending') === 'pending'
    ));
}

function buildPendingOutgoingTransferSystemTemp(pendingTransfers = []) {
  const transfers = Array.isArray(pendingTransfers) ? pendingTransfers : [];
  if (!transfers.length) return '';

  const lines = transfers.map((message, index) => (
    `${index + 1}. 转账ID:${String(message.id || '').trim()}；金额:${String(message.transferDisplayAmount || message.content || '¥0.00').trim()}；备注:${String(message.transferNote || '无').trim() || '无'}`
  ));

  return `[SYSTEM_TEMP]
当前有用户已经转给你的待确认转账，用户现在点击纸飞机调用 API，你必须以当前角色的人设、关系阶段和上下文自行决定接收或退回。
待确认转账如下：
${lines.join('\n')}
如果决定接收其中某笔转账，必须输出独立协议块：**\`[转账] 角色名：{操作:接收,转账ID:对应ID}\`**。
如果决定退回其中某笔转账，必须输出独立协议块：**\`[转账] 角色名：{操作:退回,转账ID:对应ID,备注:可选理由}\`**。
该处理协议只用于界面更新，不会显示成普通文字；你仍应另外用 [回复] 协议自然回应用户。
[/SYSTEM_TEMP]`;
}

function extractAiPendingTransferDecisions(rawText) {
  const visibleText = String(rawText || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<\/?think>/gi, '')
    .trim();
  if (!visibleText) return [];

  const markerRegex = /(?:\*\*)?\s*`?\s*\[转账\]\s*([^：:\n`*]+?)\s*[：:]\s*/g;
  const matches = [...visibleText.matchAll(markerRegex)];

  return matches
    .map((match, index) => {
      const nextMatch = matches[index + 1];
      const contentStart = Number(match.index || 0) + String(match[0] || '').length;
      const contentEnd = nextMatch ? Number(nextMatch.index || visibleText.length) : visibleText.length;
      const body = cleanAiProtocolBlockContent(visibleText.slice(contentStart, contentEnd));
      const actionMatch = body.match(/操作\s*[：:]\s*(接收|退回|拒收|拒绝|返回)/i);
      const idMatch = body.match(/转账\s*ID\s*[：:]\s*([^,，;；}\s]+)/i) || body.match(/transfer\s*Id\s*[：:]\s*([^,，;；}\s]+)/i);
      if (!actionMatch || !idMatch) return null;
      const rawAction = String(actionMatch[1] || '').trim();
      return {
        transferId: String(idMatch[1] || '').trim(),
        action: rawAction === '接收' ? 'accepted' : 'returned'
      };
    })
    .filter(item => item && item.transferId && item.action);
}

async function applyAiPendingTransferDecisions(state, db, rawText) {
  const decisions = extractAiPendingTransferDecisions(rawText);
  if (!decisions.length) return false;

  let changed = false;
  const now = Date.now();
  const session = state.sessions.find(item => String(item.id) === String(state.currentChatId));
  const decisionMap = new Map(decisions.map(item => [String(item.transferId), item.action]));

  for (const message of (Array.isArray(state.currentMessages) ? state.currentMessages : [])) {
    if (
      String(message?.type || '') !== 'transfer'
      || String(message?.transferDirection || '') !== 'outgoing'
      || String(message?.transferStatus || 'pending') !== 'pending'
    ) continue;

    const action = decisionMap.get(String(message.id || ''));
    if (!action) continue;

    message.transferStatus = action;
    message.transferHandledAt = now;
    changed = true;

    const roleName = String(message.transferCounterpartyName || session?.name || '对方').trim() || '对方';
    const transferBaseCny = Math.max(0, Number(message.transferBaseCny || 0) || 0);

    if (action === 'returned' && transferBaseCny > 0) {
      state.walletData = normalizeWalletData({
        ...state.walletData,
        balanceBaseCny: Number(state.walletData?.balanceBaseCny || 0) + transferBaseCny,
        ledger: [
          {
            id: `wallet_ledger_${now}_${Math.random().toString(16).slice(2)}`,
            kind: 'transfer',
            direction: 'in',
            title: `${roleName} 退回转账`,
            amountBaseCny: Number(transferBaseCny.toFixed(2)),
            timestamp: now
          },
          ...(Array.isArray(state.walletData?.ledger) ? state.walletData.ledger : [])
        ],
        updatedAt: now
      });
    }

    state.currentMessages.push({
      id: `transfer_system_${now}_${Math.random().toString(16).slice(2)}`,
      role: 'user',
      type: 'transfer_system',
      content: action === 'accepted' ? `${roleName} 已接收` : `${roleName} 已退回`,
      transferStatus: action,
      timestamp: now + 1
    });
  }

  if (!changed) return false;

  if (session) {
    session.lastMessage = '[转账]';
    session.lastTime = now;
  }

  await Promise.all([
    persistCurrentMessages(state, db),
    dbPut(db, DATA_KEY_SESSIONS(state.activeMaskId), state.sessions),
    persistWalletData(state, db)
  ]);
  return true;
}

/* ========================================================================
   [区域标注·已完成·本次拆分] 当前轮旁白段落绑定 facade
   说明：
   1. 旁白固定/穿插位置绑定逻辑已下沉到 chat-message-ai-protocol.js。
   2. 本文件只保留薄接线层，继续维持 sendMessage() 现有调用方式不变。
   3. 不改动任何 DB.js / IndexedDB 持久化路径。
   ======================================================================== */
function bindAsideSegmentsToAiMessages(aiMessages = [], asideSegments = [], displayMode = 'top', rawTextWithAside = '') {
  return bindAsideSegmentsToAiMessagesModule(aiMessages, asideSegments, displayMode, rawTextWithAside);
}

/* ========================================================================== */
export async function sendMessage(container, state, db, content, settingsManager, options = {}) {
  const userText = String(content || '').trim();
  const triggerAi = options.triggerAi !== false;
  // targetChatId 允许在后台为非当前窗口发送消息
  const targetChatId = options.targetChatId || state.currentChatId;
  if ((!userText && !options.skipAppendUser) || !targetChatId) return;

  // 初始化 activeAiRequests
  if (!state.activeAiRequests) state.activeAiRequests = new Set();
  
  if (triggerAi && state.activeAiRequests.has(targetChatId)) return;

  const session = state.sessions.find(s => s.id === targetChatId);
  if (!session) return;

  // 判断是否是当前窗口的消息
  const isCurrentChat = targetChatId === state.currentChatId;

  // 读取对应窗口的 messages
  let targetMessages = [];
  if (isCurrentChat) {
    targetMessages = state.currentMessages;
  } else {
    targetMessages = (await dbGet(db, DATA_KEY_MESSAGES_PREFIX(state.activeMaskId) + targetChatId)) || [];
  }

  /* ======================================================================
     [区域标注·已完成·本次控制台日志开关增强] 用户发送与触发记录
     说明：记录当前聊天页给 AI 的触发情况（文本发送 / 空触发）。
     ====================================================================== */
  if (!options.skipAppendUser) {
    appendChatConsoleRuntimeLog(state, 'info', userText ? `用户发送：${userText}` : '用户发送：空文本');
  } else if (triggerAi) {
    appendChatConsoleRuntimeLog(state, 'info', '触发 AI 回复（不追加用户消息）');
  }

  /* [区域标注·本次需求] 用户消息入列并写入 IndexedDB */
  /* ===== 闲谈：发送消息去重 START ===== */
  let appendedUserMessage = null;
  if (!options.skipAppendUser) {
    const pendingQuote = isCurrentChat && state.pendingQuote && state.pendingQuote.id ? { ...state.pendingQuote } : null;
    appendedUserMessage = {
      id: `user_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      role: 'user',
      content: userText,
      /* ======================================================================
         [区域标注·已完成·引用回复] 用户引用回复持久化字段
         说明：quote 字段随 currentMessages 写入 DB.js / IndexedDB；发送后清空运行时待引用状态。
         ====================================================================== */
      ...(pendingQuote ? { quote: pendingQuote } : {}),
      timestamp: Date.now()
    };
    targetMessages.push(appendedUserMessage);
    if (isCurrentChat) {
      state.pendingQuote = null;
      /* ======================================================================
         [区域标注·已完成·本次引用残留修复] 发送后立即移除底栏引用框
         说明：只清理运行时 pendingQuote 与当前 DOM 引用预览；消息 quote 字段已随消息对象写入 IndexedDB。
         ====================================================================== */
      syncPendingQuoteComposer(container, state);
    }
  }
  /* ===== 闲谈：发送消息去重 END ===== */

  await dbPut(db, DATA_KEY_MESSAGES_PREFIX(state.activeMaskId) + targetChatId, targetMessages);

  if (userText) {
    session.lastMessage = userText;
    session.lastTime = Date.now();
    await dbPut(db, DATA_KEY_SESSIONS(state.activeMaskId), state.sessions);
  }

  /* ===== 闲谈：发送消息去重 START ===== */
  if (appendedUserMessage && state.currentChatId === targetChatId) {
    appendCurrentMessageBubble(container, state, appendedUserMessage);
  }
  /* ===== 闲谈：发送消息去重 END ===== */

  /* ===== 闲谈应用：回车只发送用户消息 START ===== */
  if (!triggerAi) return;
  /* ===== 闲谈应用：回车只发送用户消息 END ===== */

  /* ==========================================================================
     [区域标注·本次修改2] 修复纸飞机发送后闪屏
     说明：问题出在发送后连续两次整页重绘聊天消息页：
           第一次渲染用户消息，第二次仅为了显示“正在回复...”又重建整个 msgWrap。
           这里改为只更新发送状态相关 DOM，不重建聊天页面，避免点击纸飞机后闪屏。
  /* ========================================================================== */
  state.activeAiRequests.add(targetChatId);
  if (state.currentChatId === targetChatId) {
    state.isAiSending = true;
    updateCurrentChatSendingUi(container, state);
  }

  let hasRenderedAiBubble = false;

  // 如果是在后台发送，需要单独获取其设置
  let targetChatSettings = state.chatPromptSettings;
  if (!isCurrentChat) {
    const rawSettings = await dbGet(db, `chat_prompt_settings::${state.activeMaskId}::${targetChatId}`);
    // 这里简单处理，实际上可能需要引入 normalizeChatPromptSettings
    targetChatSettings = rawSettings || {}; 
  }

  try {
    /* ===== 闲谈应用：短期记忆与最新一轮消息 START ===== */
    const promptPayload = buildPromptPayloadForLatestUserRound(targetMessages, targetChatSettings.shortTermMemoryRounds || 8);
    /* ===== 闲谈应用：短期记忆与最新一轮消息 END ===== */

    /* ========================================================================
       [区域标注·已完成·本次转账待确认修复] 纸飞机触发时把待确认转账交给 AI 决策
       说明：用户转账不再立即显示“AI 已接收”；仅在本次 API 请求中注入临时状态指令。
       ======================================================================== */
    const pendingOutgoingTransfers = targetMessages.filter(message => (
      String(message?.type || '') === 'transfer'
      && String(message?.transferDirection || '') === 'outgoing'
      && String(message?.transferStatus || 'pending') === 'pending'
    ));
    const pendingTransferTemp = buildPendingOutgoingTransferSystemTemp(pendingOutgoingTransfers);
    const userInputForAi = [promptPayload.userInput, pendingTransferTemp].filter(Boolean).join('\n\n');

    /* ========================================================================
       [区域标注·已完成·本次角色卡/用户面具上下文修复] AI 请求前读取最新档案
       说明：确保角色卡及其关系网络、用户面具身份及其关系网络均来自 DB.js / IndexedDB 最新记录，而不是闲谈启动时旧缓存。
       ======================================================================== */
    const latestArchiveDataForAi = await refreshArchiveContextForAiRequest(state, db, session);

    /* ========================================================================
       [区域标注·已完成·需求1·请求轮次日志释义修复] 调用 prompt.js 的 chat()
       说明：
       1. conversationRound 才是“当前聊到第几轮”的用户对话轮次序号。
       2. currentRoundMessages 只表示本轮连续用户消息/撤回提示条数，不再误写成 currentRound，避免误判短期记忆未刷新。
       3. historyRounds/historyMessages 只展示本次短期记忆实际携带范围；不改变 promptPayload.history 的发送内容。
       ======================================================================== */
    appendChatConsoleRuntimeLog(
      state,
      'info',
      `开始请求 AI：conversationRound=第${promptPayload.conversationRoundIndex || 0}轮，historyRounds=${promptPayload.historyRoundCount || 0}，historyMessages=${promptPayload.historyMessageCount ?? promptPayload.history.length}，currentRoundMessages=${promptPayload.currentRoundMessageCount ?? promptPayload.currentUserRoundMessages.length}`
    );
    /* ======================================================================
       [区域标注·已完成·控制台标题Token显示] 本轮请求开始时重置标题 token
       说明：
       1. chatConsoleTokenUsage 只作为当前运行时标题显示，不写入 DB.js / IndexedDB。
       2. 不使用 localStorage/sessionStorage，不做双份存储兜底。
       3. API 返回后会用 prompt.js 归一化后的真实 tokenUsage 覆盖本值。
       ====================================================================== */
    state.chatConsoleTokenUsage = null;
    syncChatConsoleDock(container, state);
    // 后台请求旁白相关状态可能需要额外处理，这里暂用 state 的，或者如果不在当前窗口，也可以不用旁白（看具体需求）
    let targetAsideModeActive = state.asideModeActive;
    let targetAsideSettings = state.asideSettings;
    let targetAsideHistory = state.asideHistory;

    if (!isCurrentChat) {
      targetAsideModeActive = false; // 后台暂不开启旁白
      targetAsideHistory = [];
    }

    const result = await chat({
      userInput: userInputForAi,
      history: promptPayload.history,
      /* [区域标注·已完成·AI识图当前轮媒体] 把本轮用户图片/表情包消息原始字段传给 prompt.js 组装视觉输入。 */
      currentUserRoundMessages: promptPayload.currentUserRoundMessages,
      chatSettings: targetChatSettings,
      /* [区域标注·已完成·本次时间断层强化] 时间感知请求上下文：把当前用户轮次、上一条 AI 回复与上一条历史聊天记录时间传给 prompt.js，避免 AI 把凌晨旧语境误当成早上当前语境。 */
      conversationTimeContext: promptPayload.conversationTimeContext,
      settingsManager,
      /* [区域标注·本次需求] 提示词真实上下文：把当前会话/联系人/面具/档案/DB 传给 prompt.js，供 AI 读取有效信息 */
      db,
      activeMaskId: state.activeMaskId,
      currentSession: session,
      /* ======================================================================
         [区域标注·已完成·头像与备注：向角色展示头像发送源对齐]
         说明：
         1. 这里把聊天界面当前实际展示给用户的“用户头像来源”一并透传给 prompt.js。
         2. 来源规则与聊天界面显示层保持一致：优先当前会话 session.userAvatar，缺失时回退到用户主页头像 state.profile.avatar。
         3. 仅用于本轮 API 请求的多模态头像发送，不写入消息历史，不新增持久化，不使用 localStorage/sessionStorage。
         ====================================================================== */
      currentUserAvatarForRole: String(session.userAvatar || state.profile?.avatar || '').trim(),
      currentContact: state.contacts.find(contact => String(contact.id) === String(session.id)) || null,
      /* [区域标注·已完成·本次角色卡/用户面具上下文修复] 传入刚从 IndexedDB 刷新的完整档案上下文 */
      archiveData: latestArchiveDataForAi,
      /* [区域标注·本次需求3] 把全局表情包资产传给 prompt.js，由当前面具挂载分组决定 AI 可用资源 */
      stickerData: state.stickerData,
      /* ======================================================================
         [区域标注·已完成·旁白模式] 旁白模式状态透传给 prompt.js 的 chat()
         说明：
         1. asideModeActive — 旁白模式是否开启，决定 system prompt 是否注入旁白提示词。
         2. asideSettings — 旁白人称/风格/字数/显示模式，供 buildAsideModeSystemPrompt 使用。
         3. asideHistory — 旁白历史摘要数组，退出旁白模式后由 buildAsideHistorySummary 注入上下文。
         ====================================================================== */
      asideModeActive: targetAsideModeActive,
      asideSettings: targetAsideSettings,
      asideHistory: targetAsideHistory
    });

    /* ======================================================================
       [区域标注·已完成·控制台标题Token显示] AI 返回后刷新标题 token
       说明：
       1. tokenUsage 来自 prompt.js 对各 API 响应 usage / usageMetadata 的归一化结果。
       2. 仅用于控制台标题最右侧实时显示“发送 / 返回”tokens，不做任何持久化。
       3. 不使用 localStorage/sessionStorage，也不新增兜底估算或长文本过滤逻辑。
       ====================================================================== */
    if (state.currentChatId === targetChatId) {
      state.chatConsoleTokenUsage = result?.tokenUsage || null;
      syncChatConsoleDock(container, state);
    }

    const rawAiTextOriginal = result?.rawText || result?.text || '';

    /* ========================================================================
       [区域标注·已完成·心声面板集成] 从 AI 原始回复中提取心声数据
       说明：
       1. extractInnerVoiceFromRawText 提取 [心声]{json}[/心声] 并返回去掉心声标签后的纯文本。
       2. 提取到的 innerVoice 对象会挂到本轮最后一条 AI 消息的 innerVoice 字段，随 currentMessages 写入 DB.js / IndexedDB。
       3. cleanedText 作为后续 buildAiReplyMessages 的输入，确保心声 JSON 不会以纯文本气泡显示在聊天界面。
       4. 不使用 localStorage/sessionStorage，不做双份存储兜底。
       ======================================================================== */
    const { innerVoice: extractedInnerVoice, cleanedText: rawAiTextAfterInnerVoice } = extractInnerVoiceFromRawText(rawAiTextOriginal);
    if (extractedInnerVoice) {
      appendChatConsoleRuntimeLog(state, 'info', `心声数据已提取：好感=${extractedInnerVoice.affection}%，醋意=${extractedInnerVoice.jealousy}%，心跳=${extractedInnerVoice.heartbeat}bpm`);
    }

    /* ========================================================================
       [区域标注·已完成·旁白模式] 从 AI 原始回复中提取旁白文本
       说明：
       1. 只在旁白模式开启时才提取 [旁白]...[/旁白] 标记。
       2. 提取后的 asideText 生成旁白气泡，cleanedText 作为后续消息解析输入。
       3. 旁白历史条目追加到 state.asideHistory，退出旁白模式时生成摘要注入上下文。
       4. 不使用 localStorage/sessionStorage，不做双份存储兜底。
       ======================================================================== */
    let rawAiText = rawAiTextAfterInnerVoice;
    let extractedAsideText = '';
    let extractedAsideSegments = [];
    if (isAsideModeActive(state)) {
      const { asideText, asideSegments, cleanedText } = extractAsideFromRawText(rawAiTextAfterInnerVoice);
      extractedAsideText = asideText;
      extractedAsideSegments = Array.isArray(asideSegments) ? asideSegments : [];
      rawAiText = cleanedText;
      if (extractedAsideText) {
        appendChatConsoleRuntimeLog(state, 'info', `旁白文本已提取：${extractedAsideSegments.length || 1} 段：${extractedAsideText.slice(0, 80)}${extractedAsideText.length > 80 ? '…' : ''}`);
      }
    }

    if (!String(rawAiText || '').trim()) {
      /* ======================================================================
         [区域标注·已完成·全局API报错弹窗接入] AI 空回复不入聊天记录
         说明：
         1. 主 API 请求完成但没有返回可展示内容时，只显示应用内报错弹窗。
         2. 不再把“AI 没有返回内容”或任何空回复占位文本发送到聊天界面。
         3. 本区域不写入 localStorage/sessionStorage，不新增双份存储兜底。
         ====================================================================== */
      appendChatConsoleRuntimeLog(state, 'warn', 'AI 返回为空文本，已改为显示 API 报错弹窗');
      if (state.currentChatId === targetChatId) {
        showApiErrorModal(container, {
          code: 'empty_response',
          title: 'AI 本轮没有成功回复',
          message: 'API 请求已完成，但本轮 AI 没有返回可展示的聊天内容。'
        });
      }
      return;
    } else {
      appendChatConsoleRuntimeLog(state, 'info', `AI 原始返回长度：${String(rawAiText).length}`);
    }
    
    // applyAiPendingTransferDecisions 需要修改为接收 targetMessages 和 targetChatId
    const decisions = extractAiPendingTransferDecisions(rawAiText);
    let hasAppliedPendingTransferDecision = false;
    if (decisions.length) {
      const decisionMap = new Map(decisions.map(item => [String(item.transferId), item.action]));
      const now = Date.now();
      
      for (const message of targetMessages) {
        if (
          String(message?.type || '') !== 'transfer'
          || String(message?.transferDirection || '') !== 'outgoing'
          || String(message?.transferStatus || 'pending') !== 'pending'
        ) continue;

        const action = decisionMap.get(String(message.id || ''));
        if (!action) continue;

        message.transferStatus = action;
        message.transferHandledAt = now;
        hasAppliedPendingTransferDecision = true;

        const roleName = String(message.transferCounterpartyName || session?.name || '对方').trim() || '对方';
        const transferBaseCny = Math.max(0, Number(message.transferBaseCny || 0) || 0);

        if (action === 'returned' && transferBaseCny > 0) {
          state.walletData = normalizeWalletData({
            ...state.walletData,
            balanceBaseCny: Number(state.walletData?.balanceBaseCny || 0) + transferBaseCny,
            ledger: [
              {
                id: `wallet_ledger_${now}_${Math.random().toString(16).slice(2)}`,
                kind: 'transfer',
                direction: 'in',
                title: `${roleName} 退回转账`,
                amountBaseCny: Number(transferBaseCny.toFixed(2)),
                timestamp: now
              },
              ...(Array.isArray(state.walletData?.ledger) ? state.walletData.ledger : [])
            ],
            updatedAt: now
          });
        }

        targetMessages.push({
          id: `transfer_system_${now}_${Math.random().toString(16).slice(2)}`,
          role: 'user',
          type: 'transfer_system',
          content: action === 'accepted' ? `${roleName} 已接收` : `${roleName} 已退回`,
          transferStatus: action,
          timestamp: now + 1
        });
      }
    }
    
    if (hasAppliedPendingTransferDecision) {
      session.lastMessage = '[转账]';
      session.lastTime = Date.now();
      await dbPut(db, DATA_KEY_SESSIONS(state.activeMaskId), state.sessions);
      await persistWalletData(state, db);
      if (state.currentChatId === targetChatId) refreshCurrentMessageListOnly(container, state);
    }

    /* ========================================================================
       [区域标注·已完成·AI生图] AI 生图结果转为聊天图片消息
       说明：
       1. prompt.js 已根据 AI 的 [图片] 协议调用设置应用中已开启的生图 API。
       2. 这里仅把 generatedImages 转成 type:image 的 assistant 消息，随 currentMessages 写入 DB.js / IndexedDB。
       3. 不使用 localStorage/sessionStorage，不保存双份图片缓存，也不显示原始 [图片] 协议文本。
       ======================================================================== */
    const generatedImageMessages = (Array.isArray(result?.generatedImages) ? result.generatedImages : [])
      .map((item, imageIndex) => ({
        role: 'assistant',
        type: 'image',
        content: `[图片] ${String(item?.imageName || item?.prompt || 'AI 生图').trim()}`,
        imageUrl: String(item?.imageUrl || '').trim(),
        imageName: String(item?.imageName || item?.prompt || 'AI 生图').trim(),
        imageSource: 'ai_generated',
        imagePrompt: String(item?.prompt || '').trim(),
        imageRoleName: String(item?.roleName || session?.name || '对方').trim(),
        imageGeneratedAt: Date.now() + imageIndex,
        /* ====================================================================
           [区域标注·已完成·AI图片与HTML卡片按协议原文顺序显示] AI 生图运行时顺序
           说明：protocolOrder 来自 prompt.js / chat-image-generation.js 对 [图片] 协议原文位置的解析；
                 仅用于本轮显示排序，入库前会剥离，不新增任何持久化字段。
           ==================================================================== */
        __protocolOrder: Number(item?.protocolOrder ?? item?.startIndex ?? imageIndex) || 0,
        __protocolEndIndex: Number(item?.endIndex ?? item?.startIndex ?? imageIndex) || 0
      }))
      .filter(item => item.imageUrl);

    const orderedAiMessages = sortAiMessagesByRuntimeProtocolOrder([
      ...buildAiReplyMessages(rawAiText, state, {
        /* [区域标注·已完成·AI文字图/生图互斥前端接收] 生图 API 开启时前端丢弃 [文字图]；未开启时才把 [文字图] 渲染为文字图气泡。 */
        textImageProtocolEnabled: Boolean(result?.textImageProtocolEnabled)
      }),
      ...generatedImageMessages
    ]);

        const aiMessagesWithoutCurrentUserEcho = filterCurrentUserRoundEchoFromAiMessages(
          orderedAiMessages.map(stripAiRuntimeProtocolOrderFields),
          promptPayload.currentUserRoundMessages
        );

        const aiMessages = bindAsideSegmentsToAiMessages(
          aiMessagesWithoutCurrentUserEcho,
          extractedAsideSegments,
          targetAsideSettings?.displayMode || 'top',
          rawAiTextAfterInnerVoice
        );
    if (!aiMessages.length) {
      appendChatConsoleRuntimeLog(state, 'warn', '解析后无可显示消息');
    } else {
      appendChatConsoleRuntimeLog(state, 'info', `解析完成：${aiMessages.length} 条消息${generatedImageMessages.length ? `，含AI生图 ${generatedImageMessages.length} 张` : ''}`);
    }
    for (let index = 0; index < aiMessages.length; index += 1) {
      const message = {
        ...aiMessages[index],
        id: `ai_${Date.now()}_${index}`,
        timestamp: Date.now() + index
      };
      const visibleText = String(
        message.type === 'sticker'
          ? message.stickerName || message.content || '表情包'
          : (message.type === 'transfer'
              ? message.transferDisplayAmount || message.content || '转账'
              : (message.type === 'gift'
                  ? getGiftMessageDisplayText(message)
                  : (message.type === 'image'
                      ? message.imageName || message.content || 'AI 生图'
                      : message.content || '')))
      ).trim();
      if (index > 0) await sleep(getAiBubbleDelayMs(visibleText, index));
      targetMessages.push(message);
      appendChatConsoleRuntimeLog(
        state,
        'info',
        message.type === 'sticker'
          ? `AI消息[${index + 1}]：表情包 ${message.stickerName || ''}`.trim()
          : (message.type === 'transfer'
              ? `AI消息[${index + 1}]：转账 ${message.transferDisplayAmount || message.content || ''}`.trim()
              : (message.type === 'gift'
                  ? `AI消息[${index + 1}]：礼物 ${message.giftTitle || message.content || ''}`.trim()
                  : (message.type === 'image'
                      ? (isTextImageMessage(message)
                          ? `AI消息[${index + 1}]：文字图 ${message.textImageText || ''}`.trim()
                          : `AI消息[${index + 1}]：AI生图 ${message.imageName || ''}`.trim())
                      : `AI消息[${index + 1}]：${String(message.content || '').slice(0, 120)}`)))
      );
      hasRenderedAiBubble = true;
      session.lastMessage = message.type === 'sticker'
        ? `[表情包] ${message.stickerName || '未命名表情包'}`
        : (message.type === 'transfer'
            ? `[转账] ${message.transferDisplayAmount || message.content || '¥0.00'}`
            : (message.type === 'gift'
                ? getGiftMessageDisplayText(message)
                : (message.type === 'image'
                    ? (isTextImageMessage(message) ? `[文字图] ${message.textImageText || '文字图'}` : `[图片] ${message.imageName || 'AI 生图'}`)
                    : (message.content || '（AI 没有返回内容）'))));
      session.lastTime = Date.now();
      
      await dbPut(db, DATA_KEY_MESSAGES_PREFIX(state.activeMaskId) + targetChatId, targetMessages);
      await dbPut(db, DATA_KEY_SESSIONS(state.activeMaskId), state.sessions);
      
      // 如果当前不是该聊天的页面，则不渲染 UI
      // 但是如果目标聊天是当前打开的聊天，我们就动态追加气泡
      if (targetChatId === state.currentChatId) {
        appendCurrentMessageBubble(container, state, targetMessages[targetMessages.length - 1]);
      }
    }

    session.lastMessage = aiMessages[aiMessages.length - 1]?.type === 'sticker'
      ? `[表情包] ${aiMessages[aiMessages.length - 1]?.stickerName || '未命名表情包'}`
      : (aiMessages[aiMessages.length - 1]?.type === 'transfer'
          ? `[转账] ${aiMessages[aiMessages.length - 1]?.transferDisplayAmount || aiMessages[aiMessages.length - 1]?.content || '¥0.00'}`
          : (aiMessages[aiMessages.length - 1]?.type === 'gift'
              ? getGiftMessageDisplayText(aiMessages[aiMessages.length - 1])
              : (aiMessages[aiMessages.length - 1]?.type === 'image'
                  ? (isTextImageMessage(aiMessages[aiMessages.length - 1]) ? `[文字图] ${aiMessages[aiMessages.length - 1]?.textImageText || '文字图'}` : `[图片] ${aiMessages[aiMessages.length - 1]?.imageName || 'AI 生图'}`)
                  : (aiMessages[aiMessages.length - 1]?.content || '（AI 没有返回内容）'))));
    session.lastTime = Date.now();

    /* ========================================================================
       [区域标注·已修改·心声每轮生成与独立历史] 保存本轮心声
       说明：
       1. 心声仍挂到本轮最后一条 assistant 消息的 innerVoice 字段，供点击当前气泡头像直接查看。
       2. 同时追加写入独立心声历史键 chat_inner_voice_history::*（DB.js / IndexedDB），因此删除/清空当前聊天消息不会删除心声历史。
       3. 下一轮发给 AI 的 history/currentUserRoundMessages 不包含 innerVoice 字段；心声仅供用户点开面板观看。
       4. 不使用 localStorage/sessionStorage，不做双份存储兜底，不按长文本字段过滤。
       ======================================================================== */
    if (extractedInnerVoice) {
      let innerVoiceMessageId = '';
      for (let i = targetMessages.length - 1; i >= 0; i--) {
        if (targetMessages[i]?.role === 'assistant') {
          targetMessages[i].innerVoice = extractedInnerVoice;
          innerVoiceMessageId = String(targetMessages[i]?.id || '');
          break;
        }
      }
      await Promise.all([
        dbPut(db, DATA_KEY_MESSAGES_PREFIX(state.activeMaskId) + targetChatId, targetMessages),
        persistInnerVoiceHistoryEntry(db, state, extractedInnerVoice, innerVoiceMessageId, targetChatId)
      ]);
    }

    /* ========================================================================
       [区域标注·已完成·旁白固定/穿插位置修复] 旁白历史持久化
       说明：
       1. 旁白不再在 AI 全部消息生成结束后挂到“最后一条 assistant 消息”。
       2. 当前轮旁白已在 aiMessages 入列前由 bindAsideSegmentsToAiMessages 绑定到正确位置：
          - 固定模式：绑定到本轮第一条 AI/角色消息之前；
          - 穿插模式：按 AI 原文中多段 [旁白] 的相对位置绑定到对应消息前/后。
       3. 这里仅追加旁白历史，退出旁白模式时生成摘要注入上下文。
       4. 持久化只走 DB.js / IndexedDB，不使用 localStorage/sessionStorage。
       ======================================================================== */
    if (extractedAsideText) {
      if (!Array.isArray(targetAsideHistory)) targetAsideHistory = [];
      const lastUserMsg = [...targetMessages].reverse().find(m => m.role === 'user');
      const lastAiMsg = [...targetMessages].reverse().find(m => m.role === 'assistant');
      targetAsideHistory.push({
        asideText: extractedAsideText,
        asideSegments: extractedAsideSegments.map(segment => ({ text: String(segment?.text || '').trim() })).filter(segment => segment.text),
        userMessage: lastUserMsg ? String(lastUserMsg.content || '').slice(0, 200) : '',
        aiMessage: lastAiMsg ? String(lastAiMsg.content || '').slice(0, 200) : '',
        timestamp: Date.now()
      });
      await dbPut(db, DATA_KEY_MESSAGES_PREFIX(state.activeMaskId) + targetChatId, targetMessages);
      const asideHistoryKey = `chat_aside_history::${state.activeMaskId}::${targetChatId}`;
      await dbPut(db, asideHistoryKey, targetAsideHistory);
      if (state.currentChatId === targetChatId) {
        state.asideHistory = targetAsideHistory;
      }
    }
  } catch (error) {
    /* ========================================================================
       [区域标注·已完成·全局API报错弹窗接入] API 调用失败不写入聊天气泡
       说明：
       1. 429、503、网络错误、配置错误等失败原因统一交给 showApiErrorModal 展示。
       2. 不再把“API 调用失败：...”或“AI 没有返回内容”写入消息界面。
       3. 聊天记录持久化仍只走 DB.js / IndexedDB；本错误弹窗不做任何持久化存储。
       ======================================================================== */
    appendChatConsoleRuntimeLog(state, 'error', `API 调用失败，已显示报错弹窗：${error?.message || '未知错误'}`);
    if (state.currentChatId === targetChatId) {
      showApiErrorModal(container, error);
    }
  } finally {
    state.activeAiRequests.delete(targetChatId);
    if (state.currentChatId === targetChatId) {
      state.isAiSending = false;
      updateCurrentChatSendingUi(container, state);
    }
    
    await Promise.all([
      dbPut(db, DATA_KEY_MESSAGES_PREFIX(state.activeMaskId) + targetChatId, targetMessages),
      dbPut(db, DATA_KEY_SESSIONS(state.activeMaskId), state.sessions),
      persistChatConsoleRuntimeLogs(state, db)
    ]);
    
    if (state.currentChatId === targetChatId) {
      if (hasRenderedAiBubble) {
        updateCurrentChatSendingUi(container, state);
      } else {
        renderCurrentChatMessage(container, state);
      }
    }

    if (hasRenderedAiBubble) {
      /* ========================================================================
         [区域标注·本次需求] 后台保活通知触发点 与 网页内横幅通知
         说明：
         1. 如果开启了 inAppNotificationEnabled 且页面在前端，触发网页内横幅。
         2. 如果开启了 backgroundKeepaliveEnabled 且页面在后台，触发系统通知。
         ======================================================================== */
      settingsManager.getAll().then(allSettings => {
        if (allSettings) {
          const lastAiMsg = targetMessages[targetMessages.length - 1];
          let notificationBody = 'AI 回复了你的消息';
          if (lastAiMsg?.type === 'sticker') {
            notificationBody = `[表情包] ${lastAiMsg.stickerName || ''}`;
          } else if (lastAiMsg?.type === 'voice') {
            notificationBody = '[语音消息]';
          } else if (lastAiMsg?.type === 'image') {
            notificationBody = '[图片消息]';
          } else if (lastAiMsg?.type === 'gift') {
            notificationBody = `[礼物] ${lastAiMsg.giftTitle || ''}`;
          } else if (lastAiMsg?.type === 'transfer') {
            notificationBody = `[转账] ${lastAiMsg.transferDisplayAmount || ''}`;
          } else if (lastAiMsg?.content) {
            notificationBody = String(lastAiMsg.content).replace(/\[.*?\]/g, '').trim().slice(0, 50) + (String(lastAiMsg.content).length > 50 ? '...' : '');
          }

          const title = session?.name || '闲谈';
          let iconUrl = '';
          if (session?.avatar) {
            try {
              iconUrl = new URL(session.avatar, window.location.href).href;
            } catch(e) {
              iconUrl = session.avatar;
            }
          }

          // 网页内横幅通知（页面在前台时）
          if (document.visibilityState !== 'hidden' && allSettings.inAppNotificationEnabled !== false && typeof window.showInAppNotification === 'function') {
             // 只有当AI在后台聊天（非当前窗口），或者虽然是当前窗口但用户滚动到很上面时，才需要弹横幅，当前窗口且在看最新消息时弹横幅有点吵。
             // 如果你要不管三七二十一只要在页面内收到回复就弹，把 && targetChatId !== state.currentChatId 去掉即可。这里我们保守一点，既然用户提到了没弹，我们就不加限制条件。
             window.showInAppNotification(title, notificationBody, iconUrl);
          }

          // 系统 PWA 通知（页面在后台时）
          if (document.visibilityState === 'hidden' && allSettings.backgroundKeepaliveEnabled && 'Notification' in window && Notification.permission === 'granted') {
            const options = {
              body: notificationBody,
              icon: iconUrl,
              vibrate: [200, 100, 200]
            };

            const fallbackNotification = () => {
              try {
                new Notification(title, options);
              } catch (e) {
                console.error('原生 Notification 发送失败:', e);
              }
            };

            if ('serviceWorker' in navigator) {
              const executeShowNotification = (reg) => {
                if (!reg || typeof reg.showNotification !== 'function') return false;
                reg.showNotification(title, options).catch(err => {
                  fallbackNotification();
                });
                return true;
              };

              navigator.serviceWorker.getRegistration().then(reg => {
                if (reg) {
                  if (!executeShowNotification(reg)) fallbackNotification();
                } else {
                  const swUrl = new URL('../../service-worker.js', window.location.href).href;
                  const scopeUrl = new URL('../../', window.location.href).pathname;
                  navigator.serviceWorker.register(swUrl, { scope: scopeUrl }).then(newReg => {
                    if (newReg.active) executeShowNotification(newReg);
                    else navigator.serviceWorker.ready.then(readyReg => executeShowNotification(readyReg)).catch(() => fallbackNotification());
                  }).catch(() => fallbackNotification());
                }
              }).catch(() => fallbackNotification());
            } else {
              fallbackNotification();
            }
          }
        }
      }).catch(err => console.error('读取设置失败:', err));

      /* ========================================================================
         [区域标注·已完成·长期记忆自动总结触发点]
         说明：
         1. 仅在本轮 AI 回复已成功落入当前聊天消息后触发长期记忆自动总结检查。
         2. 达到“长期记忆 → 总结轮数”要求时，后台调用设置应用副 API，并写入旧事应用 IndexedDB。
         3. 不使用 localStorage/sessionStorage，不做主 API 兜底，不使用原生浏览器弹窗，不重绘聊天页以避免闪屏。
         ======================================================================== */
      // 修改 maybeRunAutoLongTermMemorySummary 以支持非当前窗口
      void maybeRunAutoLongTermMemorySummary({
        state,
        container,
        db,
        settingsManager,
        targetChatId,
        targetMessages
      });
    }
  }
}

/* ========================================================================== */
export async function persistCurrentMessages(state, db) {
  if (!state.currentChatId) return;
  await dbPut(db, DATA_KEY_MESSAGES_PREFIX(state.activeMaskId) + state.currentChatId, state.currentMessages);
}

/* ========================================================================== */
export function getMountedStickerItems(state) {
  const data = normalizeStickerData(state.stickerData);
  const mountedGroupIds = Array.isArray(state.chatPromptSettings?.mountedStickerGroupIds)
    ? Array.from(new Set(state.chatPromptSettings.mountedStickerGroupIds.map(String).filter(Boolean)))
    : [];
  if (!mountedGroupIds.length) return [];
  if (mountedGroupIds.includes('all')) return data.items;
  return data.items.filter(item => mountedGroupIds.includes(String(item.groupId || 'all')));
}


/* ========================================================================
   [区域标注·已完成·本次拆分] 表情协议匹配与消息修复 facade
   说明：
   1. 表情协议目标归一化、宽松匹配与 AI 表情消息修复逻辑已下沉到 chat-message-ai-protocol.js。
   2. 本文件继续保留原导出名，避免影响既有调用方与格式修复入口。
   3. 不改动任何 DB.js / IndexedDB 持久化路径。
   ======================================================================== */
export function getStickerProtocolCandidates(token) {
  const raw = String(token || '').trim();
  if (!raw) return [];

  const cleaned = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/[`*_]+/g, '')
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .trim();

  const candidates = [
    cleaned,
    cleaned.replace(/^(?:资源\s*ID|资源Id|ID|id|表情名|名称)\s*[：:]\s*/i, '').trim()
  ];

  [...cleaned.matchAll(/(?:资源\s*ID|资源Id|ID|id|表情名|名称)\s*[：:]\s*([^；;，,\n]+)/gi)]
    .forEach(match => candidates.push(String(match[1] || '').trim()));

  [...cleaned.matchAll(/sticker_[A-Za-z0-9_:-]+/g)]
    .forEach(match => candidates.push(String(match[0] || '').trim()));

  cleaned.split(/[；;，,\s]+/).forEach(part => candidates.push(part.trim()));

  return Array.from(new Set(
    candidates
      .map(item => String(item || '').replace(/^["'“”]+|["'“”]+$/g, '').trim())
      .filter(Boolean)
  ));
}

export function resolveStickerProtocolTarget(token, state) {
  return resolveStickerProtocolTargetModule(token, state);
}

/* ========================================================================== */
export function normalizeStickerLooseMatchText(value) {
  return normalizeStickerLooseMatchTextModule(value);
}


export function findLooseStickerTargetFromText(text, state) {
  return findLooseStickerTargetFromTextModule(text, state);
}


export function createStickerMessagePatchFromTarget(message, sticker) {
  return createStickerMessagePatchFromTargetModule(message, sticker);
}


export function repairAiMessageFormatIfPossible(message, state) {
  return repairAiMessageFormatIfPossibleModule(message, state);
}


/* ==========================================================================
   [区域标注·已完成·本次拆分] AI 文本/引用/语音/旁白/系统提示修复 facade
   说明：
   1. 各类 AI 掉格式修复逻辑已下沉到 chat-message-ai-protocol.js。
   2. 本文件保留原导出名，继续兼容修正弹窗、消息修补流程与既有调用方。
   3. 只做运行时接线，不改动 DB.js / IndexedDB 持久化路径。
   ========================================================================== */
export function repairAiTextMessageFormatIfPossible(message) {
  return repairAiTextMessageFormatIfPossibleModule(message);
}

export function repairAiQuoteMessageFormatIfPossible(message, state) {
  return repairAiQuoteMessageFormatIfPossibleModule(message, state);
}

export function repairAiVoiceMessageFormatIfPossible(message) {
  return repairAiVoiceMessageFormatIfPossibleModule(message);
}

export function repairAiAsideMessageFormatIfPossible(message) {
  return repairAiAsideMessageFormatIfPossibleModule(message);
}

/* ========================================================================
   [区域标注·已完成·本次拆分] AI 本轮撤回系统提示修复 facade
   说明：
   1. ai_withdraw_system 小字修复逻辑已下沉到 chat-message-ai-protocol.js。
   2. 本文件继续保留原导出名，避免影响既有修正入口。
   ======================================================================== */
export function repairAiSystemTipFormatIfPossible(message) {
  return repairAiSystemTipFormatIfPossibleModule(message);
}


/* ========================================================================
   [区域标注·已完成·本次引用回复合并与闭合标签残片清理] AI 协议闭合标签清理工具
   说明：
   1. 统一清理 `[/回复]`、`[/引用]`、`[/语音]`、`[/文字图]`、`[/图片]`、`[/卡片]` 等闭合协议残片。
   2. 仅服务聊天前端协议解析与可见文本清洗，不改 DB.js / IndexedDB 持久化结构。
   3. 本次用于修复“闭合标签单独掉成普通气泡/普通文本”的问题，并为引用+回复合并提供更稳定的前置清洗。
   ======================================================================== */
const AI_PROTOCOL_CLOSING_TAG_REGEX = /(?:\[\s*\/\s*(?:回复|表情|转账|礼物|引用|撤回|语音|文字图|图片|卡片|旁白|心声)\s*\]|【\s*\/\s*(?:语音|文字图)\s*】)/gi;

function stripAiProtocolClosingTags(value = '') {
  return String(value || '').replace(AI_PROTOCOL_CLOSING_TAG_REGEX, ' ');
}

/* ========================================================================
   [区域标注·已完成·本次拆分] AI 协议正文清洗 facade
   说明：
   1. 协议闭合标签、think 段与 Markdown 包裹清理逻辑已下沉到 chat-message-ai-protocol.js。
   2. 本文件继续保留原导出名，避免影响转账待确认解析、消息修复等既有调用点。
   ======================================================================== */
export function cleanAiProtocolBlockContent(content) {
  return cleanAiProtocolBlockContentModule(content);
}

/* ========================================================================
   [区域标注·已完成·AI图片与HTML卡片按协议原文顺序显示] 本轮消息运行时排序工具
   说明：
   1. __protocolOrder / __protocolEndIndex 只在本轮 AI 回复解析与排序时使用，写入 currentMessages 前会剥离。
   2. AI 生图与 HTML 卡片都按原文中 [图片]/[卡片] 协议位置插回文字、语音、礼物等消息之间，不再统一落到本轮最下方。
   3. 本区域不读写持久化存储；消息最终仍只通过 DB.js / IndexedDB 保存，不使用 localStorage/sessionStorage。
   ======================================================================== */
function getAiRuntimeProtocolOrder(message = {}, fallbackIndex = 0) {
  const value = Number(message?.__protocolOrder);
  return Number.isFinite(value) ? value : Number(fallbackIndex || 0);
}

function sortAiMessagesByRuntimeProtocolOrder(messages = []) {
  return sortAiMessagesByRuntimeProtocolOrderModule(messages);
}

function stripAiRuntimeProtocolOrderFields(message = {}) {
  return stripAiRuntimeProtocolOrderFieldsModule(message);
}

/* ==========================================================================
   [区域标注·已完成·本次用户本轮消息回显拦截] AI 普通文字回复去除本轮用户原话回显
   说明：
   1. 只处理普通 assistant 文字气泡；不处理表情、图片、语音、礼物、转账、卡片、撤回系统提示、文字图等特殊类型。
   2. 若 AI 普通文字气泡与本轮某条用户原话一致，则直接丢弃该气泡。
   3. 若 AI 普通文字气泡开头先复述本轮某条用户原话，再接真正回复，则剥离开头复述，仅保留后续回复。
   4. 拦截发生在消息落库/渲染前，因此不会闪屏，也不会把重复内容写入 DB.js / IndexedDB。
   ========================================================================== */
function normalizeCurrentUserEchoCompareText(value = '') {
  return String(value || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<\/?think>/gi, '')
    .replace(/[`*_]/g, '')
    .replace(/[“”"'‘’「」『』《》〈〉（）()【】\[\]{}]/g, '')
    .replace(/[\s\u3000]+/g, '')
    .replace(/[，,。.!！？?、；;：:~～…\-—]/g, '')
    .toLowerCase()
    .trim();
}

function getCurrentUserRoundComparableTexts(currentUserRoundMessages = []) {
  return (Array.isArray(currentUserRoundMessages) ? currentUserRoundMessages : [])
    .filter(message => String(message?.role || '') === 'user' && !String(message?.type || '').trim())
    .map(message => {
      const raw = String(message?.content || '').trim();
      const normalized = normalizeCurrentUserEchoCompareText(raw);
      return raw && normalized ? { raw, normalized } : null;
    })
    .filter(Boolean)
    .sort((a, b) => (b.normalized.length - a.normalized.length) || (b.raw.length - a.raw.length));
}

function stripLeadingCurrentUserEchoFromAiText(aiText = '', currentUserTexts = []) {
  const sourceText = String(aiText || '').trim();
  const comparableTexts = Array.isArray(currentUserTexts) ? currentUserTexts : [];
  if (!sourceText || !comparableTexts.length) return sourceText;

  const getLeadingEchoCutIndex = (text, comparable) => {
    const targetNormalized = String(comparable?.normalized || '').trim();
    if (!targetNormalized) return -1;

    let collected = '';
    for (let index = 0; index < text.length; index += 1) {
      const normalizedChar = normalizeCurrentUserEchoCompareText(text.charAt(index));
      if (!normalizedChar) continue;

      collected += normalizedChar;
      if (!targetNormalized.startsWith(collected)) return -1;

      if (collected === targetNormalized) {
        let cutIndex = index + 1;
        const trailingMatch = text
          .slice(cutIndex)
          .match(/^[\s\u3000，,。.!！？?、；;：:~～…\-—"'“”‘’「」『』《》〈〉（）()【】\[\]{}]+/);
        if (trailingMatch) cutIndex += trailingMatch[0].length;
        return cutIndex;
      }
    }

    return -1;
  };

  let remaining = sourceText;
  let previousText = '';

  while (remaining && remaining !== previousText) {
    previousText = remaining;
    let matchedCutIndex = -1;

    comparableTexts.forEach(item => {
      const currentCutIndex = getLeadingEchoCutIndex(remaining, item);
      if (currentCutIndex > matchedCutIndex) matchedCutIndex = currentCutIndex;
    });

    if (matchedCutIndex < 0) break;
    remaining = remaining.slice(matchedCutIndex).trim();
  }

  return remaining;
}

function filterCurrentUserRoundEchoFromAiMessages(aiMessages = [], currentUserRoundMessages = []) {
  return filterCurrentUserRoundEchoFromAiMessagesModule(aiMessages, currentUserRoundMessages);
}

/* ==========================================================================
   [区域标注·已完成·角色主动转账协议解析] AI 转账协议内容解析
   说明：
   1. 只解析 `[转账] 角色名：{金额:xxx,备注:xxx}` 对应的大括号内容。
   2. 解析成功后统一生成 type:transfer 结构化消息，持久化仍只走 DB.js / IndexedDB。
   3. 不新增任何本地同步存储，也不改用户手动转账入口逻辑。
   ========================================================================== */
export function parseAiTransferProtocolPayload(content) {
  return parseAiTransferProtocolPayloadModule(content);
}


export function resolveAiQuotePayloadById(state, quoteId = '') {
  return resolveAiQuotePayloadByIdModule(state, quoteId);
}


/* ==========================================================================
   [区域标注·已完成·本次消息掉格式修复] 通用协议段落解析辅助
   说明：
   1. 兼容 AI 漏写“角色名：”或漏写“：”时仍可识别协议块，避免 [表情]/[引用]/[回复] 整段掉成普通文本。
   2. 只做运行时解析，不改持久化结构；消息落库仍统一走 DB.js / IndexedDB。
   ========================================================================== */
function parseProtocolRoleAndContent(raw = '', type = '') {
  const text = cleanAiProtocolBlockContent(raw);
  if (!text) return { roleName: '', content: '' };

  const typeName = String(type || '').trim();

  /* [引用] 常见掉格式：{引用ID:xxx}正文（漏角色名） */
  if (typeName === '引用' && /^\s*\{\s*引用\s*ID\s*[：:]/i.test(text)) {
    return { roleName: '', content: text };
  }

  /* 标准：角色名：内容（角色名 1-40 字）
     [区域标注·已完成·本次表情包前置空回复修复]
     说明：如果 AI 输出 `[回复] 角色名：` 后紧跟 `[表情]`，这里返回空 content，让 extractAiProtocolBlocks 丢弃该空回复块，
           避免聊天界面单独显示“角色名：”文字气泡。 */
  const roleAndContentMatch = text.match(/^([^：:\n`*]{1,40})\s*[：:]\s*([\s\S]*)$/);
  if (roleAndContentMatch) {
    const roleName = String(roleAndContentMatch[1] || '').trim();
    const content = cleanAiProtocolBlockContent(roleAndContentMatch[2] || '');
    if (roleName) return { roleName, content };
  }

  return { roleName: '', content: text };
}

export function extractAiProtocolBlocks(rawText) {
  return extractAiProtocolBlocksModule(rawText);
}


/* ========================================================================
   [区域标注·已完成·本次拆分] AI 回复协议解析与消息构建 facade
   说明：
   1. AI 协议块解析、撤回/礼物/转账/语音/文字图/HTML 卡片组装逻辑已下沉到 chat-message-ai-protocol.js。
   2. 本文件只保留原导出名与接线，继续兼容 sendMessage() 现有调用，不改业务逻辑。
   3. 本轮排序字段仍仅用于运行时，持久化路径不变，继续统一走 DB.js / IndexedDB。
   ======================================================================== */
export function buildAiReplyMessages(rawText, state, options = {}) {
  return buildAiReplyMessagesModule(rawText, state, options);
}


/* ==========================================================================
   [区域标注·已完成·AI识图图片消息发送] 图片消息入列与持久化
   说明：
   1. 图片来源仅来自聊天消息页咖啡功能区“图片”板块：本地 data URL 或用户输入 URL。
   2. 消息对象使用 type:image / imageUrl / imageName / imageSource，随 currentMessages 写入 DB.js / IndexedDB。
   3. 不使用 localStorage/sessionStorage，不写双份存储兜底。
   ========================================================================== */
const CHAT_IMAGE_MAX_SIDE = 768;
const CHAT_IMAGE_JPEG_QUALITY = 0.72;

function isLocalImageDataUrlForChat(value = '') {
  return /^data:image\/[a-z0-9.+-]+;base64,/i.test(String(value || '').trim());
}

function formatApproxKb(value = '') {
  return `${Math.max(1, Math.round(String(value || '').length / 1024))}KB`;
}

async function compressLocalImageDataUrlForChat(dataUrl = {}) {
  const source = String(dataUrl || '').trim();
  if (!isLocalImageDataUrlForChat(source)) return source;

  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片读取失败'));
    img.src = source;
  });

  const sourceWidth = Number(image.naturalWidth || image.width || 0);
  const sourceHeight = Number(image.naturalHeight || image.height || 0);
  if (!sourceWidth || !sourceHeight) return source;

  const scale = Math.min(1, CHAT_IMAGE_MAX_SIDE / Math.max(sourceWidth, sourceHeight));
  const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
  const targetHeight = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return source;

  /* [区域标注·本次修改·本地图片省token] 透明 PNG/WebP 转 JPEG 前铺浅色底，避免透明区域变黑；最长边限制为 768px。 */
  ctx.fillStyle = '#f8f4ef';
  ctx.fillRect(0, 0, targetWidth, targetHeight);
  ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

  const compressed = canvas.toDataURL('image/jpeg', CHAT_IMAGE_JPEG_QUALITY);
  return compressed && compressed.length < source.length ? compressed : source;
}

export async function sendImageMessage(container, state, db, imageUrl, settingsManager, options = {}) {
  if (!state.currentChatId || (state.activeAiRequests && state.activeAiRequests.has(state.currentChatId))) return;

  let safeUrl = String(imageUrl || '').trim();
  if (!safeUrl) return;

  if (isLocalImageDataUrlForChat(safeUrl)) {
    const originalUrl = safeUrl;
    try {
      safeUrl = await compressLocalImageDataUrlForChat(safeUrl);
      if (safeUrl !== originalUrl) {
        appendChatConsoleRuntimeLog(state, 'info', `本地图片已压缩：${formatApproxKb(originalUrl)} → ${formatApproxKb(safeUrl)}`);
      }
    } catch (error) {
      appendChatConsoleRuntimeLog(state, 'warn', `本地图片压缩失败，保留原图：${error?.message || '未知错误'}`);
      safeUrl = originalUrl;
    }
  }

  const session = state.sessions.find(s => s.id === state.currentChatId);
  if (!session) return;

  const imageName = String(options.imageName || '').trim() || (safeUrl.startsWith('data:image/') ? '本地图片' : '图片链接');
  const imageMessage = {
    id: `user_image_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    role: 'user',
    type: 'image',
    content: `[图片] ${imageName}`,
    imageUrl: safeUrl,
    imageName,
    imageSource: safeUrl.startsWith('data:image/') ? 'local' : 'url',
    timestamp: Date.now()
  };

  state.currentMessages.push(imageMessage);
  state.stickerPanelOpen = false;
  state.coffeeDockOpen = false;
  session.lastMessage = `[图片] ${imageName}`;
  session.lastTime = Date.now();

  await Promise.all([
    persistCurrentMessages(state, db),
    dbPut(db, DATA_KEY_SESSIONS(state.activeMaskId), state.sessions)
  ]);

  renderCurrentChatMessage(container, state);

  if (options.triggerAi === true) {
    await sendMessage(container, state, db, '', settingsManager, { skipAppendUser: true, triggerAi: true, targetChatId: session.id });
  }
}


export async function sendStickerMessage(container, state, db, stickerId, settingsManager, options = {}) {
  if (!state.currentChatId || (state.activeAiRequests && state.activeAiRequests.has(state.currentChatId))) return;

  const data = normalizeStickerData(state.stickerData);
  const sticker = data.items.find(item => String(item.id) === String(stickerId));
  const session = state.sessions.find(s => s.id === state.currentChatId);
  if (!sticker || !session) return;

  const stickerMessage = {
    id: `user_sticker_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    role: 'user',
    type: 'sticker',
    content: `[表情包] ${sticker.name}`,
    stickerId: sticker.id,
    stickerName: sticker.name,
    stickerUrl: sticker.url,
    timestamp: Date.now()
  };

  state.currentMessages.push(stickerMessage);
  state.stickerPanelOpen = false;
  state.coffeeDockOpen = false;
  session.lastMessage = `[表情包] ${sticker.name}`;
  session.lastTime = Date.now();

  await Promise.all([
    persistCurrentMessages(state, db),
    dbPut(db, DATA_KEY_SESSIONS(state.activeMaskId), state.sessions)
  ]);

  /* ========================================================================
     [区域标注·已完成·本次表情包发送防闪屏修复] 表情包消息局部追加
     说明：
     1. 点选表情包后只增量追加当前表情包气泡，不再 renderCurrentChatMessage 整页重绘。
     2. 表情包面板与咖啡面板只同步 class 开关，避免发送瞬间闪屏。
     3. 消息与会话仍只写入 DB.js / IndexedDB，不使用 localStorage/sessionStorage。
     ======================================================================== */
  appendCurrentMessageBubble(container, state, stickerMessage);
  syncMessageDockOpenState(container, state);

  /* ========================================================================
     [区域标注·本次需求1] 发送表情包后禁止立即调用 API
     说明：
     1. 用户点选表情包只把表情包作为 user 消息入列并写入 IndexedDB。
     2. 只有纸飞机按钮或魔法棒等显式触发点传入 triggerAi:true 时，才允许调用 API。
     3. 不做双份存储兜底，不使用 localStorage/sessionStorage。
     ======================================================================== */
  if (options.triggerAi === true) {
    await sendMessage(container, state, db, '', settingsManager, { skipAppendUser: true, triggerAi: true, targetChatId: session.id });
  }
}

/* ========================================================================== */
export function renderCurrentChatMessage(container, state, options = {}) {
  return renderCurrentChatMessageModule(container, state, options);
}

/* ========================================================================== */
/* ==========================================================================
   [区域标注·已完成·旁白固定/穿插位置修复] 旧版当前轮旁白插入函数（兼容保留）
   说明：
   1. 本次修复后，旁白已在 AI 消息入列前通过 bindAsideSegmentsToAiMessages 绑定到消息对象。
   2. appendCurrentMessageBubble 会随消息一起渲染旁白，不再依赖“AI 全部回复结束后再插入旁白”的旧流程。
   3. 本函数仅为旧调用兼容保留；当前主流程不再调用它，避免旁白总落在最后一条 AI 消息附近。
   4. 不做任何持久化读写；持久化仍统一走 DB.js / IndexedDB。
   ========================================================================== */
function syncCurrentAsideBubble(container, asideText = '', messageId = '') {
  const text = String(asideText || '').trim();
  const safeMessageId = String(messageId || '').trim();
  if (!text || !safeMessageId) return false;

  const listArea = container.querySelector('[data-role="msg-list"]');
  const targetRow = listArea?.querySelector(`[data-message-id="${CSS.escape(safeMessageId)}"]`);
  if (!listArea || !targetRow) return false;

  const asideSelector = `.msg-aside-bubble[data-aside-id="${CSS.escape(safeMessageId)}"]`;
  const existingAside = listArea.querySelector(asideSelector);
  const asideHtml = renderAsideBubbleHtml(text, safeMessageId);

  if (existingAside) {
    existingAside.outerHTML = asideHtml;
  } else {
    targetRow.insertAdjacentHTML('beforebegin', asideHtml);
  }

  listArea.scrollTop = listArea.scrollHeight;
  return true;
}

export function appendCurrentMessageBubble(container, state, message) {
  return appendCurrentMessageBubbleModule(container, state, message);
}

/* ========================================================================== */
export function refreshMessageBubbleRows(container, state, messageIds = []) {
  return refreshMessageBubbleRowsModule(container, state, messageIds);
}


export function refreshCurrentMessageListOnly(container, state) {
  return refreshCurrentMessageListOnlyModule(container, state);
}


/* ==========================================================================
   [区域标注·已完成·本次拆分] 聊天消息页多选状态子模块 facade
   说明：
   1. 多选底栏计数、重置选中态、获取已选消息逻辑已拆分到 chat-message-selection.js。
   2. 本文件仅保留同名导出接线层，继续兼容 chat-event-handlers.js / chat-navigation.js / chat-state.js 等既有调用方。
   3. 只处理运行时状态，不新增任何持久化存储。
   ========================================================================== */
export function updateMultiSelectActionBar(container, state) {
  return updateMultiSelectActionBarModule(container, state);
}

/* ========================================================================== */
export function resetMessageSelectionState(state) {
  return resetMessageSelectionStateModule(state);
}


export function getSelectedMessages(state) {
  return getSelectedMessagesModule(state);
}


export function refreshCurrentSessionLastMessage(state) {
  return refreshCurrentSessionLastMessageModule(state);
}

/* ========================================================================== */
export async function retryLatestAiReply(container, state, db, settingsManager) {
  const targetChatId = state.currentChatId;
  if (!targetChatId || (state.activeAiRequests && state.activeAiRequests.has(targetChatId))) return;

  /* ========================================================================
     [区域标注·已完成·重回清理AI拍一拍系统小字] 清空最新一轮角色回复
     说明：
     1. “重回”需要清空最新一轮 AI/角色回复后，再基于最新一轮用户消息重新请求 AI。
     2. AI 主动拍一拍会生成 type:ai_pat_system 的系统小字；它视觉上是系统提示，
        但在当前数据模型中 role 不是 assistant，因此旧逻辑会在这里提前停止，
        导致只能清空系统小字下方的 AI 回复。
     3. 本区域只把 ai_pat_system 视为“最新一轮 AI 回复附属消息”一起删除；
        不删除 user_pat_system，因为它代表用户发起的拍一拍输入，需要保留给重回重新生成。
     ======================================================================== */
  for (let i = state.currentMessages.length - 1; i >= 0; i -= 1) {
    const message = state.currentMessages[i];
    const isLatestAiReplyMessage = message?.role === 'assistant'
      || String(message?.type || '') === 'ai_pat_system';

    if (isLatestAiReplyMessage) {
      state.currentMessages.splice(i, 1);
      continue;
    }
    break;
  }

  /* ===== 闲谈：用户最新一轮消息触发AI START =====
     说明：魔法棒重新回复使用“用户最新一轮消息”触发。
     sendMessage(skipAppendUser) 会基于 state.currentMessages 调用 buildPromptPayloadForLatestUserRound，
     自动把末尾连续 user 消息合并为“用户最新一轮消息”。 */
  const latestUserRound = [];
  for (let i = state.currentMessages.length - 1; i >= 0; i -= 1) {
    const item = state.currentMessages[i];
    if (item?.role !== 'user') break;
    if (String(item.content || '').trim()) latestUserRound.unshift(item);
  }
  if (!latestUserRound.length) {
    renderCurrentChatMessage(container, state);
    return;
  }

  /* ========================================================================
     [区域标注·已完成·魔法棒局部刷新防闪屏] 魔法棒重 roll 立即清空旧 AI 回复
     说明：
     1. 先删除最新一轮 AI 回复并立即写入 DB.js / IndexedDB。
     2. 只刷新消息列表区域，不重建整个聊天消息页壳子，避免点击魔法棒闪屏。
     3. 再调用 API 重新生成最新一轮回复，不保留旧 AI 气泡到返回列表后才消失。
     ======================================================================== */
  refreshCurrentSessionLastMessage(state);
  await Promise.all([
    persistCurrentMessages(state, db),
    dbPut(db, DATA_KEY_SESSIONS(state.activeMaskId), state.sessions)
  ]);
  refreshCurrentMessageListOnly(container, state);
  await sendMessage(container, state, db, '', settingsManager, { skipAppendUser: true, triggerAi: true, targetChatId });
  /* ===== 闲谈：用户最新一轮消息触发AI END ===== */
}


/* ===== 闲谈：用户最新一轮消息触发AI START ===== */
/* ========================================================================
   [区域标注·已完成·本次拆分] Prompt payload 组装 facade
   说明：
   1. 最新用户轮识别、短期记忆按轮截取、撤回系统提示并入与时间感知上下文计算，已下沉到 chat-message-prompt-payload.js。
   2. 本文件只保留原导出名，继续兼容 sendMessage() 与外部既有调用方。
   3. 不改动任何请求结构与 DB.js / IndexedDB 持久化路径。
   ======================================================================== */
export function buildPromptPayloadForLatestUserRound(messages = [], shortTermMemoryRounds = 8) {
  return buildPromptPayloadForLatestUserRoundModule(messages, shortTermMemoryRounds);
}


/* ========================================================================
   [区域标注·已完成·本次拆分] AI 回复拆泡与可见文本清洗 facade
   说明：
   1. 回复拆泡、可见文本清洗与最少/最多气泡数收口逻辑已下沉到 chat-message-ai-protocol.js。
   2. 本文件继续保留原导出名，避免影响 prompt 协议接线与外部调用方。
   ======================================================================== */
export function splitAiReplyIntoBubbles(text, chatSettings = {}) {
  return splitAiReplyIntoBubblesModule(text, chatSettings);
}

/* ========================================================================== */
export function sanitizeAiVisibleReply(text) {
  return sanitizeAiVisibleReplyModule(text);
}


function mergeAiPunctuationOnlyBubbleFragments(parts = []) {
  /* ========================================================================
     [区域标注·已完成·普通气泡引号保留与省略号残片合并] 省略号残片合并
     说明：
     1. 修复 AI 输出连续点号/省略号后，又残留单独 "." / "。" / "…" 时被拆成独立气泡的问题。
     2. 只合并“纯标点残片”，不合并正常文字句子，不改变多句回复的原有拆泡逻辑。
     3. 本区域只处理前端运行时解析；不读写 localStorage/sessionStorage，不做双份存储兜底。
     ======================================================================== */
  const merged = [];
  (Array.isArray(parts) ? parts : []).forEach(part => {
    const value = String(part || '').trim();
    if (!value) return;

    if (merged.length && /^[.。…]+$/.test(value)) {
      merged[merged.length - 1] = `${merged[merged.length - 1]}${value}`;
      return;
    }

    merged.push(value);
  });
  return merged;
}

export function splitStrictSentenceBubbles(text) {
  const normalized = stripAiProtocolClosingTags(String(text || ''))
    /* ===== 闲谈：通用消息协议解析 START ===== */
    .replace(/\*\*`?\s*\[回复\]\s*[^：:\n`]+?\s*[：:]\s*/g, '')
    .replace(/`?\*\*/g, '')
    /* ===== 闲谈：通用消息协议解析 END ===== */
    .replace(/\r\n/g, '\n')
    .trim();

  if (!normalized) return [];

  /* ========================================================================
     [区域标注·已完成·本次句末标点非强制] 仅按自然分隔切气泡
     说明：
     1. 这里仅基于已有换行和已有终止标点做分句，不给文本追加任何句末标点。
     2. 若 AI 输出是无句号口语短句（如“行 我马上来”“哈哈哈”），保持原样，不做“补句号”。
     3. 已补充省略号/连续点号后的纯标点残片合并，避免一个 "." 被拆成独立消息气泡。
     ======================================================================== */
  return mergeAiPunctuationOnlyBubbleFragments(
    normalized
      .replace(/([。！？!?]+)(?:\s+|(?=\S))/g, '$1\n')
      .replace(/([…]{2,}|[.。]{3,}|、、、)(?:\s+|(?=\S))/g, '$1\n')
      .split(/\n+/)
      .map(item => item.trim())
      .filter(Boolean)
  );
}

/* ===== 闲谈：用户最新一轮消息触发AI END ===== */

/* ===== 闲谈应用：AI回复拆分为多个气泡 START ===== */
/* ===== 闲谈：通用消息协议解析 START ===== */
export function extractProtocolReplyContents(text) {
  return extractProtocolReplyContentsModule(text);
}

/* ===== 闲谈：通用消息协议解析 END ===== */

export function getReplyBubbleCountRange(chatSettings = {}) {
  return getReplyBubbleCountRangeModule(chatSettings);
}

/* ========================================================================== */
export function cleanAiVisibleBubbleText(text) {
  return cleanAiVisibleBubbleTextModule(text);
}


export function splitSingleBubbleForCount(text) {
  return splitSingleBubbleForCountModule(text);
}


export function enforceAiReplyMessageCount(messages, chatSettings = {}) {
  return enforceAiReplyMessageCountModule(messages, chatSettings);
}

/* ========================================================================== */
/* ==========================================================================
   [区域标注·已完成·本次引用防闪屏修复] 输入栏引用预览局部同步
   说明：
   1. 点击“引用”或“取消引用”时只更新底栏引用框，不再重绘整个聊天消息页。
   2. 用户发送后会立即清除 DOM 中的引用框，避免 quote 已发送但底栏残留。
   3. 仅使用运行时 state.pendingQuote；持久化仍只随消息对象 quote 字段写入 DB.js / IndexedDB。
   ========================================================================== */
export function syncPendingQuoteComposer(container, state) {
  return syncPendingQuoteComposerModule(container, state);
}


export function updateCurrentChatSendingUi(container, state) {
  const msgWrap = container.querySelector('[data-role="msg-page-wrap"]');
  if (!msgWrap) return;

  const statusEl = msgWrap.querySelector('.msg-top-bar__status');
  if (statusEl) statusEl.textContent = state.isAiSending ? '正在回复...' : '在线';

  msgWrap.querySelectorAll('[data-role="msg-input"], [data-action="msg-magic"], [data-action="msg-send"]').forEach(el => {
    el.toggleAttribute('disabled', Boolean(state.isAiSending));
  });
}

/* ========================================================================== */
/* ==========================================================================
   [区域标注·已完成·本次控制台持久显示与防闪屏修复] 控制台抽屉局部渲染工具
   说明：
   1. 与完整 renderChatMessage 复用同一 HTML 结构，保证主题 UI 风格一致。
   2. 开关关闭只移除抽屉 DOM，不清空 state.chatConsoleLogs；日志继续后台记录。
   3. 展开/关闭、筛选、清空日志时仅替换抽屉区域，避免聊天页整页重绘闪屏。
   ========================================================================== */
function getVisibleChatConsoleLogs(chatConsoleLogs = [], warnErrorOnly = false) {
  return getVisibleChatConsoleLogsModule(chatConsoleLogs, warnErrorOnly);
}

function renderChatConsoleDockHtml(options = {}) {
  return renderChatConsoleDockHtmlModule(options);
}

export function syncChatMessageSearchPanel(container, state) {
  return syncChatMessageSearchPanelModule(container, state);
}

export function scrollToChatSearchResult(container, messageId = '') {
  return scrollToChatSearchResultModule(container, messageId);
}

/* ========================================================================== */
export function syncChatConsoleDock(container, state) {
  const msgWrap = container.querySelector('[data-role="msg-page-wrap"]');
  const shell = msgWrap?.querySelector('.msg-input-shell');
  if (!shell) return false;

  const existingDock = shell.querySelector('[data-role="msg-console-dock"]');
  const visibleLogs = getVisibleChatConsoleLogs(state.chatConsoleLogs, state.chatConsoleWarnErrorOnly);
  const nextHtml = renderChatConsoleDockHtml({
    chatConsoleEnabled: state.chatConsoleEnabled,
    chatConsoleExpanded: state.chatConsoleExpanded,
    chatConsoleWarnErrorOnly: state.chatConsoleWarnErrorOnly,
    visibleConsoleLogs: visibleLogs,
    chatConsoleTokenUsage: state.chatConsoleTokenUsage
  });

  if (!nextHtml) {
    existingDock?.remove();
    return true;
  }

  if (existingDock) {
    existingDock.outerHTML = nextHtml;
    return true;
  }

  const inputBar = shell.querySelector('.msg-input-bar');
  if (!inputBar) return false;
  inputBar.insertAdjacentHTML('beforebegin', nextHtml);
  return true;
}

/* ========================================================================== */
export function syncMessageDockOpenState(container, state) {
  const msgWrap = container.querySelector('[data-role="msg-page-wrap"]');
  if (!msgWrap) return;

  const coffeeDock = msgWrap.querySelector('[data-role="msg-feature-dock"]');
  const stickerPanel = msgWrap.querySelector('[data-role="msg-sticker-panel"]');
  const coffeeBtn = msgWrap.querySelector('[data-action="msg-coffee"]');
  const stickerBtn = msgWrap.querySelector('[data-action="msg-sticker"]');

  if (coffeeDock) coffeeDock.classList.toggle('is-open', Boolean(state.coffeeDockOpen));
  if (stickerPanel) stickerPanel.classList.toggle('is-open', Boolean(state.stickerPanelOpen));
  if (coffeeBtn) coffeeBtn.classList.toggle('is-active', Boolean(state.coffeeDockOpen));
  if (stickerBtn) stickerBtn.classList.toggle('is-active', Boolean(state.stickerPanelOpen));
}


export function renderMsgStickerPanelGrid(container, state) {
  return renderMsgStickerPanelGridModule(container, state, renderCurrentChatMessage);
}

/* ========================================================================== */
export function syncMountedStickerGroupButtons(container, state) {
  return syncMountedStickerGroupButtonsModule(container, state);
}

/* ========================================================================== */
/* ==========================================================================
   [区域标注·已完成·本次拆分] 聊天消息页弹窗 facade 导出层
   说明：
   1. 原 chat-message.js 尾部的图片、转账、头像、撤回、编辑、收藏、转发等弹窗实现，
      已迁移到 chat-message-modals.js。
   2. 本区域只保留同名薄包装导出，继续兼容 chat-event-handlers.js / profile-favorites.js 等既有调用方。
   3. 后续如果需要修改这些弹窗，请直接修改 chat-message-modals.js，不要在本文件恢复大段实现。
   4. 本次拆分不引入 localStorage/sessionStorage；弹窗样式仍统一沿用应用内主题。
   ========================================================================== */
export function showMessageImageModal(container) {
  return showMessageImageModalModule(container);
}


/* ==========================================================================
   [区域标注·已完成·本次转账需求] 聊天消息页转账应用内弹窗
   说明：
   1. 弹窗结构与闲谈应用现有 chat-modal 风格保持一致，不使用原生浏览器弹窗。
   2. 余额文案由 index.js 根据当前钱包余额与显示币种实时计算后传入。
   3. 这里只负责渲染转账弹窗，不做 localStorage/sessionStorage 读写，也不做双份存储兜底。
   ========================================================================== */
export function showMessageTransferModal(container, options = {}) {
  return showMessageTransferModalModule(container, options);
}

/* ==========================================================================
   [区域标注·已完成·本次转账需求] 转账消息操作弹窗（接收 / 退回）
   说明：
   1. 用户点击转账消息后使用应用内弹窗处理，不使用原生浏览器弹窗。
   2. 这里只负责 UI；余额变更和消息状态持久化统一由 index.js 写入 DB.js / IndexedDB。
   ========================================================================== */
export function showTransferActionModal(container, options = {}) {
  return showTransferActionModalModule(container, options);
}

/* ==========================================================================
   [区域标注·已完成·当前会话头像设置弹窗]
   说明：
   1. 头像 URL 输入、裁剪预览、原图头像/自动压缩均使用应用内弹窗，不使用原生浏览器弹窗。
   2. 弹窗只产生待保存头像数据；真正保存由 index.js 更新当前 session.avatar 并写入 DB.js / IndexedDB。
   3. URL 原图模式直接保存 URL；裁剪/压缩模式通过 canvas 输出 data:image/jpeg。
   ========================================================================== */
export function showChatAvatarSourceModal(container, avatarTarget = 'character') {
  return showChatAvatarSourceModalModule(container, avatarTarget);
}

export function showChatAvatarUrlModal(container, avatarTarget = 'character') {
  return showChatAvatarUrlModalModule(container, avatarTarget);
}

export function showChatAvatarCropModal(container, { imageUrl = '', source = 'local', fileName = '', avatarTarget = 'character' } = {}) {
  return showChatAvatarCropModalModule(container, { imageUrl, source, fileName, avatarTarget });
}

export function updateChatAvatarCropPreview(container) {
  return updateChatAvatarCropPreviewModule(container);
}

export async function buildChatAvatarFromCropModal(container, mode = 'cropped') {
  return buildChatAvatarFromCropModalModule(container, mode);
}

/* ========================================================================== */
export function showAiFormatRepairTypeModal(container, messageId = '') {
  return showAiFormatRepairTypeModalModule(container, messageId);
}


/* ========================================================================
   [区域标注·已完成·用户消息撤回] 用户消息撤回确认弹窗
   说明：
   1. 使用闲谈应用内 chat-modal 样式，不使用浏览器原生弹窗或原生选择器。
   2. 用户可选择“AI 不可见 / AI 可见”；真正撤回和 IndexedDB 持久化由 index.js 处理。
   3. 点击撤回按钮只打开本弹窗，不重绘聊天页，避免闪屏。
   ======================================================================== */
export function showUserWithdrawMessageModal(container, message = {}) {
  return showUserWithdrawMessageModalModule(container, message);
}

/* ========================================================================
   [区域标注·已完成·本次撤回弹窗称谓文案调整] 对方撤回查看弹窗
   说明：你点击对方撤回系统提示后查看原文；应用内弹窗，不使用原生浏览器弹窗。
   ======================================================================== */
export function showAiWithdrawnMessageModal(container, message = {}) {
  return showAiWithdrawnMessageModalModule(container, message);
}

export function showAiFormatRepairResultModal(container, { success = false, title = '', message = '' } = {}) {
  return showAiFormatRepairResultModalModule(container, { success, title, message });
}

/* ========================================================================== */
export function showEditMessageModal(container, state, messageId) {
  return showEditMessageModalModule(container, state, messageId);
}

/* ==========================================================================
   [区域标注·已完成·本次旁白编辑弹窗指向修复] 旁白专用编辑弹窗
   说明：
   1. 只读取并编辑 owner 消息上的 asideSegments[].text / 兼容 asideText，不读取 message.content。
   2. 弹窗沿用闲谈应用 chat-modal 主题样式，不使用浏览器原生弹窗或原生选择器。
   3. 保存 action 为 confirm-edit-aside，由 index.js 写回 currentMessages 并通过 DB.js / IndexedDB 持久化。
   ========================================================================== */
export function showEditAsideModal(container, state, messageId, asideSegmentId) {
  return showEditAsideModalModule(container, state, messageId, asideSegmentId);
}

/* ========================================================================== */
export function showFavoriteSavedModal(container, count) {
  return showFavoriteSavedModalModule(container, count);
}

/* ========================================================================== */
export function showForwardMessagesModal(container, state) {
  return showForwardMessagesModalModule(container, state);
}
