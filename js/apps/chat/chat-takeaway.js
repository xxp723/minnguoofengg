// @ts-nocheck
/**
 * 文件名: js/apps/chat/chat-takeaway.js
 * 用途: 闲谈应用 — 咖啡功能区“外卖”功能模块
 * 架构层: 应用层（闲谈子模块）
 *
 * 说明：
 * 1. 负责外卖点单弹窗、高级气泡渲染、顶部横幅展示及代付确认逻辑。
 * 2. 这里仅处理外卖相关的状态与 DOM 渲染。
 * 3. 持久化统一交由外部的 chat-event-click.js 和 DB.js / IndexedDB 进行，不使用 localStorage/sessionStorage。
 */

import { escapeHtml } from './chat-utils.js';
import { MSG_ICONS } from './chat-message-icons.js';
import { renderMessageBubble } from './chat-message-render.js';
import { getWalletDisplayAmount } from './profile-wallet.js';

/* ==========================================================================
   [区域标注·外卖模块] 状态与常量
   ========================================================================== */
export const TAKEAWAY_TYPE = 'takeaway';
export const TAKEAWAY_SYSTEM_TYPE = 'takeaway_system';

// 当前活动的配送定时器
let activeTakeawayTimers = new Map();

/* ==========================================================================
   [区域标注·外卖模块] 功能区入口渲染
   ========================================================================== */
export function renderTakeawayFeatureButton() {
  return `
    <button class="msg-feature-dock__item msg-feature-dock__item--takeaway" type="button" data-action="open-msg-takeaway-modal" data-feature="takeaway">
      ${MSG_ICONS.takeaway}<span>外卖</span>
    </button>
  `;
}

/* ==========================================================================
   [区域标注·外卖模块] 气泡文字提取（用于消息列表预览）
   ========================================================================== */
export function getTakeawayMessageDisplayText(msg) {
  if (msg?.takeawayStatus === 'pending') {
    return `[外卖代付] 帮我点一份 ${msg?.takeawayTitle || '外卖'}`;
  }
  return `[外卖] 为你点了一份 ${msg?.takeawayTitle || '外卖'}`;
}

export function isTakeawayMessage(msg) {
  return String(msg?.type || '') === TAKEAWAY_TYPE;
}

export function isTakeawaySystemMessage(msg) {
  return String(msg?.type || '') === TAKEAWAY_SYSTEM_TYPE;
}

/* ==========================================================================
   [区域标注·外卖模块] 气泡渲染 (高级杂志风)
   说明：
   1. 发送到聊天框的外卖气泡（分为自己点的或代付的）。
   2. 不带发送按钮，点击后发送。
   ========================================================================== */
export function renderTakeawayBubble(msg) {
  const isRequest = msg?.takeawayStatus === 'pending';
  const itemName = String(msg?.takeawayTitle || '').trim();
  const amountText = String(msg?.takeawayDisplayPrice || '0').trim();
  const status = msg?.takeawayStatus || 'pending';
  
  let statusText = '正在配送';
  let statusClass = '';
  
  if (status === 'completed') {
    statusText = '已送达';
    statusClass = 'msg-takeaway-bubble__status--completed';
  } else if (status === 'timeout') {
    statusText = '已超时';
    statusClass = 'msg-takeaway-bubble__status--timeout';
  } else if (status === 'waiting') {
    statusText = '等待支付';
  }

  return `
    <div class="msg-bubble--takeaway" title="${escapeHtml(isRequest ? '外卖代付' : '外卖订单')}">
      <div class="msg-takeaway-bubble__header">
        <div class="msg-takeaway-bubble__icon">${MSG_ICONS.takeaway}</div>
        <h4 class="msg-takeaway-bubble__title">${isRequest ? '代付外卖' : '外卖订单'}</h4>
      </div>
      <div class="msg-takeaway-bubble__divider"></div>
      <div class="msg-takeaway-bubble__content">
        <span class="msg-takeaway-bubble__item-name">${escapeHtml(itemName)}</span>
        <span class="msg-takeaway-bubble__price">${escapeHtml(amountText)}</span>
      </div>
      <div class="msg-takeaway-bubble__footer">
        <span class="msg-takeaway-bubble__time">${isRequest ? '等待对方确认' : '订单详情'}</span>
        ${!isRequest ? `<span class="msg-takeaway-bubble__status ${statusClass}">${statusText}</span>` : ''}
      </div>
    </div>
  `;
}

/* ==========================================================================
   [区域标注·已更新·外卖模块] 弹窗展示
   ========================================================================== */
export function showTakeawayModal(container, options = {}) {
  const mask = container.querySelector('[data-role="modal-mask"]');
  const panel = container.querySelector('[data-role="modal-panel"]');
  if (!mask || !panel) return;

  const balanceLabel = String(options.balanceLabel || '0.00');
  const closeIcon = `<svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14 14L34 34M34 14L14 34" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  panel.innerHTML = `
    <div class="chat-modal-header">
      <span>点外卖</span>
      <button class="chat-modal-close" data-action="close-modal" type="button" aria-label="关闭">${closeIcon}</button>
    </div>
    <div class="chat-modal-body msg-takeaway-modal-content">
      <div class="msg-takeaway-modal-header">
        <div class="msg-takeaway-modal-header__icon">
          ${MSG_ICONS.takeaway}
        </div>
      </div>
      
      <div class="msg-takeaway-form">
        <div class="msg-takeaway-field">
          <label class="msg-takeaway-field__label">外卖名称</label>
          <input type="text" class="msg-takeaway-input" data-role="msg-takeaway-title-input" placeholder="想吃点什么？" maxlength="30" autocomplete="off">
        </div>
        
        <div class="msg-takeaway-field">
          <label class="msg-takeaway-field__label">金额</label>
          <input type="number" class="msg-takeaway-input" data-role="msg-takeaway-price-input" placeholder="0.00" min="0.01" step="0.01">
        </div>
        
        <div class="msg-takeaway-wallet-info">
          钱包余额 <strong>${escapeHtml(balanceLabel)}</strong>
        </div>
        
        <div id="msg-takeaway-error" class="msg-takeaway-error" style="display: none; color: #ff4d4f; font-size: 13px; text-align: center;"></div>
        
        <div class="msg-takeaway-actions">
          <button class="msg-takeaway-btn msg-takeaway-btn--request" data-action="request-msg-takeaway-pay" type="button">发起代付</button>
          <button class="msg-takeaway-btn msg-takeaway-btn--pay" data-action="confirm-msg-takeaway-send" type="button">确认支付</button>
        </div>
      </div>
    </div>
  `;

  mask.classList.remove('is-hidden');
  
  const nameInput = panel.querySelector('[data-role="msg-takeaway-title-input"]');
  if (nameInput) {
    setTimeout(() => nameInput.focus(), 50);
  }
}

/* ==========================================================================
   [区域标注·已更新·本次启动失败修复·外卖模块导出补齐]
   说明：
   1. chat-event-click.js 依赖的外卖接口已在本模块统一补齐。
   2. 仅补齐导出名，不改变闲谈其它模块的持久化链路。
   3. 仍然只使用 DB.js / IndexedDB，不引入 localStorage/sessionStorage。
   ========================================================================== */
export const showMessageTakeawayModal = showTakeawayModal;

export function parseTakeawayDraftFromModal(container, walletDisplay = {}, walletData = {}) {
  const titleInput = container.querySelector('[data-role="msg-takeaway-title-input"]');
  const priceInput = container.querySelector('[data-role="msg-takeaway-price-input"]');
  const takeawayTitle = String(titleInput?.value || '').trim();
  const takeawayPrice = Number(String(priceInput?.value || '').trim());

  const currency = walletDisplay.currency || { code: 'CNY', precision: 2 };
  const currencyCode = String(currency.code || 'CNY').toUpperCase();
  const precision = Math.max(0, Number(currency.precision ?? 2) || 0);
  const rates = walletData?.rates && typeof walletData.rates === 'object' ? walletData.rates : {};
  const displayRate = currencyCode === 'CNY' ? 1 : Math.max(0, Number(rates[currencyCode] || 0) || 0);
  const takeawayBaseCny = currencyCode === 'CNY' ? takeawayPrice : (takeawayPrice / displayRate);

  return {
    takeawayTitle,
    takeawayPrice,
    takeawayBaseCny,
    currencyCode,
    precision,
    displayRate
  };
}

export function showTakeawayActionModal(container, options = {}) {
  const mask = container.querySelector('[data-role="modal-mask"]');
  const panel = container.querySelector('[data-role="modal-panel"]');
  if (!mask || !panel) return;

  const messageId = String(options.messageId || '').trim();
  const title = String(options.title || '外卖').trim();
  const priceLabel = String(options.priceLabel || '').trim();
  const note = String(options.note || '').trim();
  const statusLabel = String(options.statusLabel || '').trim() || '待处理';
  const actionHint = String(options.actionHint || '').trim() || '请选择处理方式';
  const canAccept = Boolean(options.canAccept);

  const closeIcon = `<svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14 14L34 34M34 14L14 34" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const checkIcon = `<svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 24L20 34L40 14" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  panel.innerHTML = `
    <div class="chat-modal-header">
      <span>外卖操作</span>
      <button class="chat-modal-close" data-action="close-modal" type="button">${closeIcon}</button>
    </div>
    <div class="chat-modal-body msg-transfer-action-modal-body">
      <div class="msg-transfer-action-card">
        <div class="msg-transfer-action-card__row">
          <span class="msg-transfer-action-card__label">外卖</span>
          <strong class="msg-transfer-action-card__amount">${escapeHtml(title)}</strong>
        </div>
        ${priceLabel ? `
          <div class="msg-transfer-action-card__row">
            <span class="msg-transfer-action-card__label">价格</span>
            <span class="msg-transfer-action-card__status">${escapeHtml(priceLabel)}</span>
          </div>
        ` : ''}
        <div class="msg-transfer-action-card__row">
          <span class="msg-transfer-action-card__label">状态</span>
          <span class="msg-transfer-action-card__status">${escapeHtml(statusLabel)}</span>
        </div>
        ${note ? `<div class="msg-transfer-action-card__note">${escapeHtml(note)}</div>` : ''}
      </div>
      <div class="chat-modal-notice">${escapeHtml(actionHint)}</div>
    </div>
    <div class="chat-modal-footer">
      ${canAccept ? `<button class="chat-modal-btn chat-modal-btn--primary" data-action="msg-takeaway-accept" data-message-id="${escapeHtml(messageId)}" type="button">${checkIcon}<span>代付</span></button>` : ''}
    </div>
  `;

  mask.classList.remove('is-hidden');
}

export async function sendTakeawayMessage(container, state, db, draft = {}, helpers = {}) {
  if (!state.currentChatId) return false;
  const session = state.sessions.find(item => String(item.id) === String(state.currentChatId));
  if (!session) return false;

  const now = Date.now();
  const takeawayTitle = String(draft.takeawayTitle || '').trim();
  const takeawayPrice = Number(draft.takeawayPrice || 0);
  const takeawayBaseCny = Number(draft.takeawayBaseCny || 0);
  const currencyCode = String(draft.currencyCode || 'CNY').toUpperCase();
  const precision = Math.max(0, Number(draft.precision ?? 2) || 0);
  const formatWalletMoney = typeof helpers.formatWalletMoney === 'function'
    ? helpers.formatWalletMoney
    : ((value, code) => `${code} ${Number(value || 0).toFixed(precision)}`);

  const takeawayDisplayPrice = formatWalletMoney(takeawayPrice, currencyCode);
  const nextBalanceBaseCny = Math.max(0, Number(state.walletData?.balanceBaseCny || 0) - takeawayBaseCny);

  state.walletData = normalizeWalletData({
    ...state.walletData,
    balanceBaseCny: nextBalanceBaseCny,
    ledger: [
      {
        id: `wallet_ledger_${now}_${Math.random().toString(16).slice(2)}`,
        kind: 'takeaway',
        direction: 'out',
        title: `给 ${String(session.name || '对方').trim() || '对方'} 点外卖：${takeawayTitle}`,
        amountBaseCny: Number(takeawayBaseCny.toFixed(2)),
        timestamp: now
      },
      ...(Array.isArray(state.walletData?.ledger) ? state.walletData.ledger : [])
    ],
    updatedAt: now
  });

  const takeawayMessage = {
    id: `user_takeaway_${now}_${Math.random().toString(16).slice(2)}`,
    role: 'user',
    type: 'takeaway',
    content: `[外卖] ${takeawayTitle}`,
    takeawayTitle,
    takeawayDisplayPrice,
    takeawayCurrency: currencyCode,
    takeawayPrice: Number(takeawayPrice.toFixed(precision)),
    takeawayBaseCny: Number(takeawayBaseCny.toFixed(2)),
    takeawayNote: 'for you, with a warm meal and a quiet evening',
    takeawayPayer: '我已购买',
    takeawayDirection: 'outgoing',
    takeawayStatus: 'accepted',
    timestamp: now
  };

  state.currentMessages.push(takeawayMessage);
  state.coffeeDockOpen = false;
  state.stickerPanelOpen = false;
  session.lastMessage = getTakeawayMessageDisplayText(takeawayMessage);
  session.lastTime = now;

  await Promise.all([
    persistWalletData(state, db),
    dbPut(db, DATA_KEY_MESSAGES_PREFIX(state.activeMaskId) + state.currentChatId, state.currentMessages),
    dbPut(db, DATA_KEY_SESSIONS(state.activeMaskId), state.sessions)
  ]);

  return true;
}

/* ==========================================================================
   [区域标注·外卖模块] 顶部横幅更新（外卖距离）
   ========================================================================== */
export function initTakeawayBanner(container, state, messageIds = []) {
  const conversation = container.querySelector('.msg-conversation');
  if (!conversation) return;

  // 寻找所有进行中的外卖消息 (status: pending)
  const pendingOrders = (state.currentMessages || []).filter(msg => 
    isTakeawayMessage(msg) && 
    msg.status === 'pending' && 
    (messageIds.length === 0 || messageIds.includes(msg.id))
  );

  if (pendingOrders.length === 0) return;

  pendingOrders.forEach(order => {
    if (activeTakeawayTimers.has(order.id)) return; // 已经在跑了

    // 模拟配送流程
    // 30分钟配送，分为几个阶段，这里为了演示，时间压缩（比如总共5分钟，即300秒）
    const TOTAL_DELIVERY_TIME_SEC = 300; 
    let remainingSec = TOTAL_DELIVERY_TIME_SEC;
    
    // 初始化或获取已存储的配送进度
    if (order.deliveryRemainingSec !== undefined) {
      remainingSec = order.deliveryRemainingSec;
    }
    
    const bannerId = `msg-takeaway-banner-${order.id}`;
    let bannerWrapper = document.getElementById('msg-takeaway-banner-wrapper');
    if (!bannerWrapper) {
      bannerWrapper = document.createElement('div');
      bannerWrapper.id = 'msg-takeaway-banner-wrapper';
      bannerWrapper.className = 'msg-takeaway-banner-wrapper';
      conversation.appendChild(bannerWrapper);
    }
    
    const updateBannerUI = (distance, timeText, statusDesc) => {
      let banner = document.getElementById(bannerId);
      if (!banner) {
        banner = document.createElement('div');
        banner.id = bannerId;
        banner.className = 'msg-takeaway-banner';
        bannerWrapper.appendChild(banner);
      }
      
      banner.innerHTML = `
        <div class="msg-takeaway-banner__icon">
          ${MSG_ICONS.takeaway}
        </div>
        <div class="msg-takeaway-banner__info">
          <span class="msg-takeaway-banner__title">${escapeHtml(order.itemName)} · ${statusDesc}</span>
          <span class="msg-takeaway-banner__desc">距离 <strong>${distance}</strong>，预计 <strong>${timeText}</strong> 送达</span>
        </div>
      `;
    };

    const timer = setInterval(() => {
      remainingSec -= 1;
      order.deliveryRemainingSec = remainingSec;

      // 根据剩余时间计算距离和状态
      let distance = '';
      let timeText = '';
      let statusDesc = '';

      if (remainingSec > 240) {
        distance = '2.5km';
        timeText = '30分钟';
        statusDesc = '商家备餐中';
      } else if (remainingSec > 180) {
        distance = '2km';
        timeText = '20分钟';
        statusDesc = '骑手已取餐';
      } else if (remainingSec > 60) {
        distance = '1km';
        timeText = '10分钟';
        statusDesc = '骑手配送中';
      } else if (remainingSec > 0) {
        distance = '200m';
        timeText = '即将';
        statusDesc = '即将送达';
      }

      if (remainingSec <= 0) {
        clearInterval(timer);
        activeTakeawayTimers.delete(order.id);
        
        // 随机决定是送达还是超时
        const isTimeout = Math.random() > 0.8; // 20% 概率超时
        
        // 触发一个自定义事件去更新消息状态和持久化
        const event = new CustomEvent('takeaway-delivery-complete', {
          detail: { 
            messageId: order.id, 
            status: isTimeout ? 'timeout' : 'completed' 
          }
        });
        document.dispatchEvent(event);

        // 移除 banner
        const banner = document.getElementById(bannerId);
        if (banner) {
          banner.classList.add('is-closing');
          setTimeout(() => banner.remove(), 300);
        }
      } else {
        updateBannerUI(distance, timeText, statusDesc);
      }

    }, 1000); // 每秒更新一次测试，实际可能用真实时间对比

    activeTakeawayTimers.set(order.id, timer);
  });
}

export function clearAllTakeawayTimers() {
  activeTakeawayTimers.forEach(timer => clearInterval(timer));
  activeTakeawayTimers.clear();
  const wrapper = document.getElementById('msg-takeaway-banner-wrapper');
  if (wrapper) wrapper.remove();
}
