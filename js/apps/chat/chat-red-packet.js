// @ts-nocheck
/**
 * 文件名: js/apps/chat/chat-red-packet.js
 * 用途: 闲谈应用 — 咖啡功能区“红包”独立模块
 *       负责红包入口、红包弹窗、红包消息卡片渲染、发送与接收处理。
 * 存储规则：所有持久化只通过 DB.js / IndexedDB 封装完成，禁止 localStorage/sessionStorage。
 */

import {
  DATA_KEY_SESSIONS,
  DATA_KEY_MESSAGES_PREFIX,
  TAB_ICONS,
  dbPut,
  escapeHtml,
  normalizeWalletData,
  persistWalletData
} from './chat-utils.js';

/* ==========================================================================
   [区域标注·本次新增红包模块] IconPark 图标
   说明：本模块新增按键图标统一使用 IconPark 风格 SVG。
   ========================================================================== */
export const RED_PACKET_ICONS = {
  redPacket: `<svg viewBox="0 0 48 48" fill="none"><path d="M43 16V40C43 41.1046 42.1046 42 41 42H7C5.89543 42 5 41.1046 5 40V16" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M24 28C26.7614 28 29 25.7614 29 23C29 20.2386 26.7614 18 24 18C21.2386 18 19 20.2386 19 23C19 25.7614 21.2386 28 24 28Z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M43 16L24 28L5 16" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 16C5 14.8954 5.89543 14 7 14H41C42.1046 14 43 14.8954 43 16" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  wallet: `<svg viewBox="0 0 48 48" fill="none"><path d="M6 14h36v28H6V14Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M10 14V8h26v6" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M32 28h10v8H32a4 4 0 0 1 0-8Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>`,
  check: `<svg viewBox="0 0 48 48" fill="none"><path d="M40 12L18 34L8 24" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`
};

/* ==========================================================================
   [区域标注·本次新增红包模块] 咖啡功能区入口
   ========================================================================== */
export function renderRedPacketFeatureButton() {
  return `
    <button class="msg-feature-dock__item msg-feature-dock__item--red-packet" type="button" data-action="open-msg-red-packet-modal" data-feature="red-packet">
      ${RED_PACKET_ICONS.redPacket}<span>红包</span>
    </button>
  `;
}

/* ==========================================================================
   [区域标注·本次新增红包模块] 红包消息识别与摘要
   ========================================================================== */
export function isRedPacketMessage(message = {}) {
  return String(message?.type || '') === 'red_packet';
}

function formatRedPacketAmountLabel(message = {}, fallbackCurrency = 'CNY') {
  const displayAmount = String(message?.redPacketDisplayAmount || '').trim();
  if (displayAmount) return displayAmount;

  const amount = Number(message?.redPacketAmount || message?.amount || 0);
  if (!Number.isFinite(amount) || amount <= 0) return '';

  const currencyCode = String(message?.redPacketCurrency || fallbackCurrency || 'CNY').toUpperCase();
  return currencyCode === 'CNY' ? `¥${amount.toFixed(2)}` : `${currencyCode} ${amount.toFixed(2)}`;
}

export function getRedPacketMessageDisplayText(message = {}) {
  const note = String(message?.redPacketNote || message?.remark || '').trim();
  const amountLabel = formatRedPacketAmountLabel(message);
  return note
    ? `[红包] ${note}${amountLabel ? ` · ${amountLabel}` : ''}`
    : `[红包] ${amountLabel || ''}`.trim();
}

export function isRedPacketSystemMessage(message = {}) {
  return String(message?.type || '') === 'red_packet_system';
}

/* ==========================================================================
   [区域标注·本次新增红包模块] AI 发送与接收红包协议解析
   ========================================================================== */
function cleanAiProtocolValue(value = '') {
  return String(value || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^\s*(?:`|\*\*)+/g, '')
    .replace(/(?:`|\*\*)+\s*$/g, '')
    .replace(/^\s*["'“”]+|["'“”]+\s*$/g, '')
    .trim();
}

/* ==========================================================================
   [区域标注·已完成·红包协议与金额解析修复]
   说明：
   1. 红包金额输入与 AI 红包协议都先做宽松清洗，再统一落到 packetAmount / redPacketAmount / redPacketBaseCny。
   2. 解析函数继续只服务红包模块，不引入 localStorage/sessionStorage，也不增加双份兜底存储。
   3. AI 红包备注保留模型原文，不再把缺省备注硬塞成“恭喜发财，大吉大利”；显示层会直接读取 redPacketNote / remark。
   ========================================================================== */
function parseRedPacketAmountInputValue(value = '') {
  const normalized = String(value ?? '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/[\s,，]/g, '')
    .replace(/[￥¥]/g, '')
    .replace(/[。．｡．]/g, '.')
    .trim();

  if (!normalized) return NaN;

  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : NaN;
}

function parseAiRedPacketBodyFields(body = '') {
  const text = String(body || '').trim();
  if (!text) return null;

  const amountMatch = text.match(/(?:金额|金额数|数额|红包金额|金额￥)\s*[：:]\s*([0-9]+(?:\.[0-9]{1,2})?)/i)
    || text.match(/\b([0-9]+(?:\.[0-9]{1,2})?)\b/);
  if (!amountMatch) return null;

  const noteMatch = text.match(/(?:备注|留言|文案|祝福|祝语|互动留言)\s*[：:]\s*([\s\S]*?)(?=\s*(?:金额|金额数|数额|红包金额|金额￥)\s*[：:]|$)/i)
    || text.match(/(?:备注|留言|文案|祝福|祝语|互动留言)\s*[：:]\s*([^]*)/i);
  const rawNote = cleanAiProtocolValue(noteMatch?.[1] || '');

  return {
    amount: Number(amountMatch[1]),
    note: rawNote
  };
}

function buildRedPacketDisplayAmount(amount = 0, currencyCode = 'CNY') {
  const normalizedAmount = Number(Number(amount || 0).toFixed(2));
  return currencyCode === 'CNY'
    ? `¥${normalizedAmount.toFixed(2)}`
    : `${String(currencyCode || 'CNY').toUpperCase()} ${normalizedAmount.toFixed(2)}`;
}

export function parseAiRedPacketSendProtocol(content = {}) {
  const normalized = cleanAiProtocolValue(content);
  if (!normalized) return null;

  const bodyMatch = normalized.match(/\{\s*([\s\S]*?)\s*\}/);
  const body = bodyMatch ? String(bodyMatch[1] || '').trim() : normalized;
  if (!body) return null;

  const parsed = parseAiRedPacketBodyFields(body);
  if (!parsed) return null;

  const amount = Number(parsed.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const normalizedAmount = Number(amount.toFixed(2));
  const redPacketDisplayAmount = buildRedPacketDisplayAmount(normalizedAmount, 'CNY');

  return {
    amount: normalizedAmount,
    note: String(parsed.note || '').trim(),
    redPacketAmount: normalizedAmount,
    redPacketBaseCny: normalizedAmount,
    redPacketDisplayAmount,
    redPacketCurrency: 'CNY',
    redPacketNote: String(parsed.note || '').trim(),
    redPacketPayer: '对方',
    redPacketDirection: 'incoming',
    redPacketStatus: 'pending',
    content: `红包：${redPacketDisplayAmount}`
  };
}

export function createAiRedPacketMessageFromProtocol(block = {}) {
  const payload = parseAiRedPacketSendProtocol(block?.content || '');
  if (!payload) return null;

  const roleName = String(block?.roleName || '').trim() || '对方';
  const redPacketDisplayAmount = buildRedPacketDisplayAmount(payload.amount, payload.redPacketCurrency || 'CNY');
  const redPacketNote = String(payload.redPacketNote || payload.note || '').trim();
  return {
    role: 'assistant',
    type: 'red_packet',
    content: `[红包] ${redPacketNote}${redPacketDisplayAmount ? ` · ${redPacketDisplayAmount}` : ''}`,
    redPacketAmount: Number(Number(payload.amount || 0).toFixed(2)),
    redPacketBaseCny: Number(Number(payload.amount || 0).toFixed(2)),
    redPacketDisplayAmount,
    redPacketCurrency: 'CNY',
    redPacketNote,
    redPacketPayer: roleName,
    redPacketSource: 'ai_protocol',
    redPacketDirection: 'incoming',
    redPacketStatus: 'pending'
  };
}

export function parseAiRedPacketReceiveProtocol(content = {}) {
  const normalized = cleanAiProtocolValue(content);
  if (!normalized) return null;

  const bodyMatch = normalized.match(/\{\s*([\s\S]*?)\s*\}/);
  const body = bodyMatch ? String(bodyMatch[1] || '').trim() : normalized;
  if (!body) return null;

  const idMatch = body.match(/(?:红包ID|ID)\s*[：:]\s*([^,，;；}\n]+)/i);
  const targetId = cleanAiProtocolValue(idMatch?.[1] || '');

  if (!targetId) return null;

  return { targetId };
}

/* ==========================================================================
   [区域标注·已完成·本次红包金额与备注显示修复] 红包卡片气泡渲染
   说明：
   1. 红包卡片统一读取 redPacket* 字段，避免 AI 红包备注回落成默认文案。
   2. 卡片直接展示红包金额标签，用户和 AI 红包都能看到金额。
   3. 本区域只负责渲染，不读写存储；持久化仍由上层 DB.js / IndexedDB 链路完成。
   ========================================================================== */
export function renderRedPacketBubble(message = {}) {
  const note = String(message?.redPacketNote || message?.remark || '').trim();
  const amountLabel = formatRedPacketAmountLabel(message);
  const status = String(message?.redPacketStatus || 'pending').trim();
  const isAccepted = status === 'accepted';
  const statusLabel = isAccepted ? '已领取' : (status === 'returned' ? '已退回' : '');
  const titleText = note || amountLabel || '红包';
  const noteText = note || (amountLabel ? '红包' : '');

  return `
    <article class="msg-red-packet-card msg-red-packet-card--${escapeHtml(status)}" title="${escapeHtml(titleText)}">
      <div class="msg-red-packet-card__content">
        <span class="msg-red-packet-card__icon">${RED_PACKET_ICONS.redPacket}</span>
        <div class="msg-red-packet-card__text">
          <h3 class="msg-red-packet-card__note">${escapeHtml(noteText)}</h3>
          ${amountLabel ? `<strong class="msg-red-packet-card__amount">${escapeHtml(amountLabel)}</strong>` : ''}
          ${statusLabel ? `<span class="msg-red-packet-card__status">${escapeHtml(statusLabel)}</span>` : ''}
        </div>
      </div>
      <div class="msg-red-packet-card__footer">
        <span>微信红包</span>
      </div>
    </article>
  `;
}

/* ==========================================================================
   [区域标注·本次新增红包模块] 领取红包弹窗
   ========================================================================== */
export function showRedPacketActionModal(container, options = {}) {
  const mask = container.querySelector('[data-role="modal-mask"]');
  const panel = container.querySelector('[data-role="modal-panel"]');
  if (!mask || !panel) return;

  const messageId = String(options.messageId || '').trim();
  const note = String(options.note || '').trim();
  const payer = String(options.payer || '对方').trim();
  const amount = String(options.amount || options.amountLabel || '').trim();
  const isAccepted = options.status === 'accepted';

  panel.innerHTML = `
    <div class="chat-modal-header msg-red-packet-modal__header">
      <span>红包</span>
      <button class="chat-modal-close" data-action="close-modal" type="button">${TAB_ICONS.close}</button>
    </div>
    <div class="chat-modal-body msg-red-packet-action-modal">
      <div class="msg-red-packet-action-card">
        <div class="msg-red-packet-action-avatar">${RED_PACKET_ICONS.redPacket}</div>
        <h3 class="msg-red-packet-action-payer">${escapeHtml(payer)}的红包</h3>
        <p class="msg-red-packet-action-note">${escapeHtml(note)}</p>
        ${amount ? `<div class="msg-red-packet-action-amount"><strong>${escapeHtml(amount)}</strong></div>` : ''}
        ${isAccepted ? `<div class="msg-red-packet-action-status">已领取</div>` : ''}
      </div>
    </div>
    <div class="chat-modal-footer msg-red-packet-modal__footer">
      ${!isAccepted ? `<button class="chat-modal-btn chat-modal-btn--primary" data-action="msg-red-packet-accept" data-message-id="${escapeHtml(messageId)}" type="button"><span>领取红包</span></button>` : ''}
    </div>
  `;

  mask.classList.remove('is-hidden');
}

/* ==========================================================================
   [区域标注·已更新·本次新增红包模块] 发红包弹窗
   ========================================================================== */
export function showMessageRedPacketModal(container, options = {}) {
  const mask = container.querySelector('[data-role="modal-mask"]');
  const panel = container.querySelector('[data-role="modal-panel"]');
  if (!mask || !panel) return;

  const balanceLabel = String(options.balanceLabel || '¥0.00').trim();
  const currencyCode = String(options.currencyCode || 'CNY').trim().toUpperCase();
  const maskName = String(options.maskName || '当前面具身份').trim();

  panel.innerHTML = `
    <div class="chat-modal-header msg-red-packet-modal__header">
      <span>发红包</span>
      <button class="chat-modal-close" data-action="close-modal" type="button">${TAB_ICONS.close}</button>
    </div>
    <div class="chat-modal-body msg-red-packet-modal">
      <section class="msg-red-packet-modal__balance-card">
        <span class="msg-red-packet-modal__balance-icon">${RED_PACKET_ICONS.wallet}</span>
        <div>
          <em>${escapeHtml(maskName)}的钱包余额</em>
          <strong>${escapeHtml(balanceLabel)}</strong>
          <small>${escapeHtml(currencyCode)}</small>
        </div>
      </section>

      <label class="msg-red-packet-modal__field">
        <span>金额</span>
        <input class="chat-modal-search msg-red-packet-modal__input" data-role="msg-red-packet-amount-input" type="number" min="0.01" step="0.01" placeholder="0.00">
      </label>

      <label class="msg-red-packet-modal__field">
        <span>备注</span>
        <input class="chat-modal-search msg-red-packet-modal__input" data-role="msg-red-packet-note-input" type="text" placeholder="恭喜发财，大吉大利">
      </label>

      <div class="chat-modal-notice" data-role="modal-notice"></div>
    </div>
    <div class="chat-modal-footer msg-red-packet-modal__footer">
      <button class="chat-modal-btn chat-modal-btn--primary" data-action="confirm-msg-red-packet-send" type="button">塞钱进红包</button>
    </div>
  `;

  mask.classList.remove('is-hidden');
  setTimeout(() => panel.querySelector('[data-role="msg-red-packet-amount-input"]')?.focus(), 30);
}

/* ==========================================================================
   [区域标注·已完成·本次红包金额字段统一修复] 解析弹窗输入
   说明：
   1. 发送确认分支读取 packetAmount / packetBaseCny / displayRate，本区域已统一返回这些字段。
   2. 红包输入按当前钱包显示币种解释，再换算为基础人民币余额扣减。
   3. 不新增任何持久化存储，不使用 localStorage/sessionStorage。
   ========================================================================== */
export function parseRedPacketDraftFromModal(container, walletDisplay = {}, walletData = {}) {
  const amountInput = container.querySelector('[data-role="msg-red-packet-amount-input"]');
  const noteInput = container.querySelector('[data-role="msg-red-packet-note-input"]');
  const packetAmount = parseRedPacketAmountInputValue(amountInput?.value);
  const packetNote = String(noteInput?.value || '').trim() || '恭喜发财，大吉大利';

  const currency = walletDisplay.currency || { code: 'CNY', precision: 2 };
  const currencyCode = String(currency.code || 'CNY').toUpperCase();
  const precision = Math.max(0, Number(currency.precision ?? 2) || 0);
  const rates = walletData?.rates && typeof walletData.rates === 'object' ? walletData.rates : {};
  const displayRate = currencyCode === 'CNY' ? 1 : Math.max(0, Number(rates[currencyCode] || 0) || 0);
  const packetBaseCny = currencyCode === 'CNY' ? packetAmount : (packetAmount / displayRate);

  return {
    packetAmount,
    packetBaseCny,
    packetNote,
    currencyCode,
    precision,
    displayRate,
    amount: packetAmount,
    note: packetNote,
    giftBaseCny: packetBaseCny
  };
}

/* ==========================================================================
   [区域标注·已完成·本次红包发送字段统一修复] 发送红包消息
   说明：
   1. 发送后仅入列，不自动触发 AI 回复（要求用户点击纸飞机）。
   2. 统一使用 packet* 入参并写入 redPacket* 消息字段，避免金额校验与卡片显示字段错位。
   3. 钱包、当前聊天消息、会话摘要统一写入 DB.js / IndexedDB。
   ========================================================================== */
export async function sendRedPacketMessage(container, state, db, draft = {}, helpers = {}) {
  if (!state.currentChatId) return false;
  const session = state.sessions.find(item => String(item.id) === String(state.currentChatId));
  if (!session) return false;

  const now = Date.now();
  const amount = Number(draft.packetAmount ?? draft.amount ?? 0);
  const note = String(draft.packetNote || draft.note || '恭喜发财，大吉大利').trim();
  const packetBaseCny = Number(draft.packetBaseCny ?? draft.giftBaseCny ?? 0);
  const currencyCode = String(draft.currencyCode || 'CNY').toUpperCase();
  const precision = Math.max(0, Number(draft.precision ?? 2) || 0);
  const formatWalletMoney = typeof helpers.formatWalletMoney === 'function'
    ? helpers.formatWalletMoney
    : ((value, code) => (code === 'CNY' ? `¥${Number(value || 0).toFixed(precision)}` : `${code} ${Number(value || 0).toFixed(precision)}`));
  const redPacketDisplayAmount = String(draft.packetDisplayAmount || '').trim() || formatWalletMoney(amount, currencyCode);
  const nextBalanceBaseCny = Math.max(0, Number(state.walletData?.balanceBaseCny || 0) - packetBaseCny);

  state.walletData = normalizeWalletData({
    ...state.walletData,
    balanceBaseCny: nextBalanceBaseCny,
    ledger: [
      {
        id: `wallet_ledger_${now}_${Math.random().toString(16).slice(2)}`,
        kind: 'red_packet',
        direction: 'out',
        title: `发红包给 ${String(session.name || '对方').trim()}`,
        amountBaseCny: Number(packetBaseCny.toFixed(2)),
        timestamp: now
      },
      ...(Array.isArray(state.walletData?.ledger) ? state.walletData.ledger : [])
    ],
    updatedAt: now
  });

  const redPacketMessage = {
    id: `user_red_packet_${now}_${Math.random().toString(16).slice(2)}`,
    role: 'user',
    type: 'red_packet',
    content: `[红包] ${note}${redPacketDisplayAmount ? ` · ${redPacketDisplayAmount}` : ''}`,
    redPacketAmount: Number(amount.toFixed(precision)),
    redPacketBaseCny: Number(packetBaseCny.toFixed(2)),
    redPacketDisplayAmount,
    redPacketCurrency: currencyCode,
    redPacketNote: note,
    redPacketPayer: '我',
    redPacketDirection: 'outgoing',
    redPacketStatus: 'pending', // 对方未领
    timestamp: now
  };

  state.currentMessages.push(redPacketMessage);
  state.coffeeDockOpen = false;
  state.stickerPanelOpen = false;
  session.lastMessage = getRedPacketMessageDisplayText(redPacketMessage);
  session.lastTime = now;

  await Promise.all([
    persistWalletData(state, db),
    dbPut(db, DATA_KEY_MESSAGES_PREFIX(state.activeMaskId) + state.currentChatId, state.currentMessages),
    dbPut(db, DATA_KEY_SESSIONS(state.activeMaskId), state.sessions)
  ]);

  return true;
}
