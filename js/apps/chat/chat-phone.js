// @ts-nocheck
/**
 * 文件名: js/apps/chat/chat-phone.js
 * 用途: 闲谈应用 — 电话功能子模块
 * 架构层: 应用层（闲谈子模块）
 *
 * 说明：
 * 1. 负责聊天页中电话功能入口的点击事件拦截与全屏界面的渲染。
 * 2. 挂载 DOM 覆盖层，实现独立的消息收发、重新生成、挂断功能。
 * 3. 将电话的开始与结束记录，以及期间的对话直接写入 currentMessages，
 *    通过统一的 DB.js / IndexedDB 进行持久化。
 */

import { MSG_ICONS } from './chat-message-icons.js';
import { sendMessage } from './chat-message.js';
import { renderCurrentChatMessage, renderMessageBubble } from './chat-message-render.js';
import { dbPut, DATA_KEY_MESSAGES_PREFIX, escapeHtml } from './chat-utils.js';

let phoneStartTime = 0;
let phoneOverlayElement = null;
let phoneChatArea = null;

// 从 index.js 中获取全局状态。由于架构限制，我们在调用时动态获取。
// 我们可以通过参数传递 state
let state = null;
let _db = null;
let _settingsManager = null;
let _container = null;

// 在普通聊天列表中隐藏 phone 系统的记录，由 render 处理即可，或者我们利用 type 进行特殊渲染

/* ==========================================================================
   [区域标注·本次修改·电话功能] 格式化时长
   说明：将毫秒转为分秒格式。
   ========================================================================== */
function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}分${seconds}秒`;
}

/* ==========================================================================
   [区域标注·本次修改·电话功能] 创建/获取全屏 DOM
   说明：在 container (聊天应用主容器) 中注入电话界面的 DOM 结构。
   ========================================================================== */
function initPhoneOverlay(container) {
  if (phoneOverlayElement) return phoneOverlayElement;

  phoneOverlayElement = document.createElement('div');
  phoneOverlayElement.className = 'msg-phone-fullscreen-overlay is-hidden';
  
  // 组装 HTML
  phoneOverlayElement.innerHTML = `
    <div class="msg-phone-header">
      <img class="msg-phone-avatar" src="" alt="头像" id="phone-avatar" />
      <div class="msg-phone-name" id="phone-name">未知联系人</div>
      <div class="msg-phone-status">
        <span class="msg-phone-status-dot"></span>
        <span id="phone-status-text">正在通话...</span>
      </div>
    </div>
    
    <div class="msg-phone-chat-area" id="phone-chat-area">
      <!-- 消息气泡将会通过 renderChatList 渲染到这里 -->
    </div>
    
    <div class="msg-phone-footer">
      <div class="msg-phone-input-bar">
        <button class="msg-phone-btn-reset" id="phone-btn-reset" title="重新生成">
          <svg viewBox="0 0 48 48" fill="none"><path d="M16 14H6v10" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 24c3-9 10-14 20-14c8 0 14 3 18 9" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M42 34c-3 5-8 8-14 8c-8 0-14-3-18-9" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>
        </button>
        <input type="text" class="msg-phone-input" id="phone-input" placeholder="输入消息..." autocomplete="off" />
        <button class="msg-phone-btn-send" id="phone-btn-send" title="发送">
          <svg viewBox="0 0 48 48" fill="none"><path d="M43 5L25 43l-5-18L2 20L43 5Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M20 25l23-20" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>
        </button>
      </div>
      
      <div class="msg-phone-actions">
        <button class="msg-phone-btn-hangup" id="phone-btn-hangup" title="挂断">
          ${MSG_ICONS.phone}
        </button>
      </div>
    </div>
  `;

  container.appendChild(phoneOverlayElement);
  phoneChatArea = phoneOverlayElement.querySelector('#phone-chat-area');

  bindPhoneEvents();
  return phoneOverlayElement;
}

/* ==========================================================================
   [区域标注·本次修改·电话功能] 绑定界面事件
   说明：输入框回车、发送、重回、挂断事件。
   ========================================================================== */
function bindPhoneEvents() {
  const input = phoneOverlayElement.querySelector('#phone-input');
  const btnSend = phoneOverlayElement.querySelector('#phone-btn-send');
  const btnReset = phoneOverlayElement.querySelector('#phone-btn-reset');
  const btnHangup = phoneOverlayElement.querySelector('#phone-btn-hangup');

  /* ========================================================================
     [区域标注·本次修改·电话功能] 按键分流：回车只入列、纸飞机才触发 AI
     说明：
     1. 回车键只把消息写入 currentMessages 并刷新电话页，不再自动请求 AI。
     2. 点击纸飞机按钮时才允许 triggerAi=true，进入角色回复流程。
     3. 这样可以避免通话页面误把键盘发送当作 AI 触发入口。
     ======================================================================== */
  /* ========================================================================
     [区域标注·本次修改·电话消息发送优化] 
     说明：修复发送后电话页没马上显示消息的问题。
           无论是发送文本还是触发 AI，都先通过 sendMessage 入列（此时可能还没开始 fetch），
           随后立即调用 updatePhoneUI 刷新界面；由于 sendMessage 是异步的，
           对于 triggerAi，我们在它内部调用结束后会由外部状态或者 render 刷新，
           但我们在本页面需要主动再刷新一次或者订阅变化。
     ======================================================================== */
  const sendPhoneMessage = async (triggerAi = false) => {
    const text = input.value.trim();
    if (!text && !triggerAi) return;

    // 当有文字时，首先作为用户消息发送，且不触发 AI（只是入库入列）
    if (text) {
      input.value = '';
      await sendMessage(_container, state, _db, text, _settingsManager, { triggerAi: false });
      updatePhoneUI();
      scrollToBottom();
    }

    // 如果是点击了纸飞机且 triggerAi=true，即使没有文字，我们也要去请求 AI 回复最近的对话
    if (triggerAi) {
      // 传递空字符串并 skipAppendUser=true 可以让底层 chat-message.js 直接调用 AI 生成
      await sendMessage(_container, state, _db, '', _settingsManager, { skipAppendUser: true, triggerAi: true });
      updatePhoneUI();
      scrollToBottom();
    }
  };

  btnSend.addEventListener('click', () => {
    void sendPhoneMessage(true);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void sendPhoneMessage(false);
    }
  });

  /* ========================================================================
     [区域标注·本次修改·电话功能] 重新生成当前通话最后一条 AI 回复
     说明：仅在电话页中删掉最后一条 AI 消息并重新请求，刷新后同步更新电话页。
     ======================================================================== */
  btnReset.addEventListener('click', async () => {
    const messages = state.currentMessages;
    let lastAiIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'ai' || messages[i].role === 'assistant') {
        lastAiIndex = i;
        break;
      }
    }

    if (lastAiIndex !== -1) {
      messages.splice(lastAiIndex, 1);
      /* ========================================================================
         [区域标注·已完成·电话功能持久化修复] 重新生成持久化
         说明：使用 dbPut 替换错误的 DB.put，采用规范的 keys
         ======================================================================== */
      if (state.currentChatId) {
        await dbPut(_db, DATA_KEY_MESSAGES_PREFIX(state.activeMaskId) + state.currentChatId, state.currentMessages);
      }
      updatePhoneUI();
      await sendMessage(_container, state, _db, '', _settingsManager, { skipAppendUser: true, triggerAi: true });
    }
  });

  /* ========================================================================
     [区域标注·本次修改·电话功能] 挂断按钮接线
     说明：点击挂断时直接进入 endPhoneCall，避免把结束流程留到下一次通话才回写。
     ======================================================================== */
  btnHangup.addEventListener('click', async () => {
    await endPhoneCall();
  });
}

/* ==========================================================================
   [区域标注·本次修改·电话功能] 同步渲染电话聊天区域
   说明：将 currentMessages 中属于本次通话的消息提取出来渲染在全屏内。
   ========================================================================== */
export function renderPhoneChatArea() {
  if (!phoneOverlayElement || phoneOverlayElement.classList.contains('is-hidden')) return;
  if (!phoneChatArea) return;

  // 由于我们要利用 chat-message-render.js 现成的气泡组装能力
  // 我们可以临时劫持一个 DOM 让其渲染，或者直接利用主聊天列表的渲染能力
  // 为了独立显示，这里清空并使用 renderChatList()
  // 但我们只需要渲染最近的消息，且确保其能用长按等多选功能。
  // 实际上 renderChatList 是往特定的 list 容器塞 html。
  
  const originalList = document.querySelector('.chat-message-list');
  
  // 提取本次通话记录
  // 向前查找最近的 'phone_start_system'
  let startIndex = 0;
  for (let i = state.currentMessages.length - 1; i >= 0; i--) {
    if (state.currentMessages[i].type === 'phone_start_system') {
      startIndex = i + 1; // 开始渲染系统提示之后的实际消息
      break;
    }
  }

  const phoneMessages = state.currentMessages.slice(startIndex);
  
  // 渲染
  phoneChatArea.innerHTML = '';
  // 因为 renderChatList 目前没有开放容器参数，如果我们要让电话里的消息支持长按
  // 最简单的做法是，将长按事件挂载点就是这些气泡本身。chat-event-handlers 是全局代理。
  // 我们可以手动构造气泡，或直接修改 renderChatList 让其支持目标容器。
  // 为避免大量侵入原有渲染层，我们构造基础聊天 HTML。由于提示要求支持"编辑"、"多选"、"删除"，
  // 主应用的 chat-event-handlers.js 使用的是全局基于 data-id 属性的代理。
  // 所以只要我们生成一样的气泡结构结构，事件自然生效。
  
  // 这里做一个简单的生成循环（参考主 render，如果主 render 不好提出来）
  // 为了安全并满足要求，我们会导入 renderChatList 并做个小 trick
}

/* 
 * 修正：为了完美复用聊天气泡渲染和长按事件，
 * 我们直接使用 chat-message-render.js 提供的 renderMessageBubble 渲染标准气泡。
 * 并且传入 hideAvatars 隐藏联系人与用户头像。
 */
function rebuildPhoneMessagesHTML(messages) {
  let html = '';
  const currentSession = (state.sessions || []).find(session => String(session.id) === String(state.currentChatId)) || {};

  for (const msg of messages) {
    if (msg.type === 'system' || msg.type === 'phone_start_system' || msg.type === 'phone_end_system') continue;
    
    /* ========================================================================
       [区域标注·本次修改·移除下方消息头像与正常显示气泡]
       说明：复用主界面的 renderMessageBubble，传入 chatSettings: { hideAvatars: true }，
             使得气泡拥有和主聊天页面一样的格式，包括靠左靠右和底色，从而解决“不显示发送的消息”和“有巨大头像”的问题。
       ======================================================================== */
    html += renderMessageBubble(msg, currentSession, { 
      chatSettings: { hideAvatars: true }, 
      userProfile: state.profile 
    });
  }
  return html;
}

/* ==========================================================================
   [区域标注·本次修改·电话功能] 渲染更新循环
   ========================================================================== */
export function updatePhoneUI() {
  if (!phoneOverlayElement || phoneOverlayElement.classList.contains('is-hidden')) return;
  
  // 查找本次通话记录
  let startIndex = 0;
  for (let i = state.currentMessages.length - 1; i >= 0; i--) {
    if (state.currentMessages[i].type === 'phone_start_system') {
      startIndex = i + 1;
      break;
    }
  }

  const phoneMsgs = state.currentMessages.slice(startIndex);
  if (phoneChatArea) {
    let html = rebuildPhoneMessagesHTML(phoneMsgs);
    
    /* ========================================================================
       [区域标注·本次修改·电话思考提示]
       说明：如果 AI 正在回复，追加一个处于左侧的“……”思考气泡。
             当 state.isAiSending 为 false 时，UI 更新会自动移除。
       ======================================================================== */
    if (state.isAiSending) {
      html += `
        <div class="msg-bubble-row msg-bubble-row--left">
          <div class="msg-bubble-content">
            <div class="msg-bubble msg-bubble--other msg-bubble--thinking">
              <span class="msg-thinking-dots">……</span>
            </div>
          </div>
        </div>
      `;
    }
    
    phoneChatArea.innerHTML = html;
    scrollToBottom();
  }
}

function scrollToBottom() {
  if (phoneChatArea) {
    requestAnimationFrame(() => {
      phoneChatArea.scrollTop = phoneChatArea.scrollHeight;
    });
  }
}


/* ==========================================================================
   [区域标注·本次修改·电话功能] 电话应用内弹窗渲染（新版）
   说明：
   1. 拦截“电话”入口点击事件后触发此方法。
   2. 初始化全屏覆盖层，进入通话状态。
   3. 写入系统提示以记录开始。
   ========================================================================== */
export async function openPhoneModal(container, chatState, db, settingsManager, skipSystemMessage = false) {
  state = chatState;
  _db = db;
  _settingsManager = settingsManager;
  _container = container;
  
  // 如果之前是在普通聊天状态，现在进入电话状态
  phoneStartTime = Date.now();

  if (!skipSystemMessage) {
    // 1. 写入开始通话的系统消息，用以让 prompt-payload 识别当前是通话中
    const startMsg = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      role: 'system',
      type: 'phone_start_system',
      content: '[电话通话开始]',
      timestamp: Date.now()
    };
    state.currentMessages.push(startMsg);
    /* ========================================================================
       [区域标注·已完成·电话功能持久化修复] 通话开始提示持久化
       说明：使用 dbPut 替换错误的 DB.put，采用规范的 keys
       ======================================================================== */
    if (state.currentChatId) {
      await dbPut(_db, DATA_KEY_MESSAGES_PREFIX(state.activeMaskId) + state.currentChatId, state.currentMessages);
    }
  }

  // 2. 初始化/显示 DOM
  const overlay = initPhoneOverlay(container);
  
  // 3. 更新对方头像和名字
  /* ========================================================================
     [区域标注·本次修改·电话顶部头像获取]
     说明：如果在会话(session)中没有专门设置头像，回退读取通讯录(contact)中的头像，
           保证电话独立页面的顶部头像和普通聊天列表中的一致。
     ======================================================================== */
  const currentSession = (state.sessions || []).find(session => String(session.id) === String(state.currentChatId)) || {};
  const contact = (state.contacts || []).find(c => String(c.id) === String(currentSession.id) || String(c.roleId) === String(currentSession.roleId)) || {};
  const contactAvatar = String(currentSession.avatar || contact.avatar || '');
  const contactName = String(currentSession.remark || currentSession.name || '未知联系人');

  const avatarEl = overlay.querySelector('#phone-avatar');
  const nameEl = overlay.querySelector('#phone-name');
  if (avatarEl) {
    avatarEl.src = contactAvatar;
    avatarEl.onerror = () => {
      avatarEl.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="%23ccc"><circle cx="24" cy="24" r="20" fill="%23eee"/><path d="M24 24c-4.4 0-8-3.6-8-8s3.6-8 8-8 8 3.6 8 8-3.6 8-8 8zm0 4c7.7 0 14 5.3 14 12H10c0-6.7 6.3-12 14-12z" fill="%23ccc"/></svg>';
    };
  }
  if (nameEl) nameEl.textContent = contactName;
  
  // 4. 显示
  overlay.classList.remove('is-hidden');
  // 触发过度动画
  requestAnimationFrame(() => {
    overlay.classList.add('is-visible');
    // 隐藏主菜单遮罩和面板
    const mask = container.querySelector('[data-role="modal-mask"]');
    const panel = container.querySelector('[data-role="modal-panel"]');
    if (mask) mask.classList.add('is-hidden');
    if (panel) panel.innerHTML = '';
  });

  updatePhoneUI();
}

/* ==========================================================================
   [区域标注·本次修改·电话功能] 结束通话
   说明：计算时长，写入系统消息，恢复主界面。
   ========================================================================== */
export async function endPhoneCall(skipSystemMessage = false) {
  if (!phoneOverlayElement || phoneOverlayElement.classList.contains('is-hidden')) return;
  const durationMs = Date.now() - phoneStartTime;
  const durationStr = formatDuration(durationMs);

  /* ========================================================================
     [区域标注·本次修改·电话功能] 通话结束即时回写
     说明：
     1. 挂断时立刻把结束系统消息写入 currentMessages 和 IndexedDB。
     2. 先刷新主聊天页，让通话结束气泡与系统提示马上落到聊天页，而不是等到下一次电话再补显示。
     3. 隐藏电话覆盖层仍保留收尾动画，但不再把结束状态延后到下一轮通话。
     ======================================================================== */
  if (!skipSystemMessage) {
    const endMsg = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      role: 'system',
      type: 'phone_end_system',
      content: `[电话通话结束，时长: ${durationStr}]`,
      timestamp: Date.now()
    };
    state.currentMessages.push(endMsg);
    /* ========================================================================
       [区域标注·已完成·电话功能持久化修复] 通话结束提示持久化
       说明：使用 dbPut 替换错误的 DB.put，采用规范的 keys
       ======================================================================== */
    if (state.currentChatId) {
      await dbPut(_db, DATA_KEY_MESSAGES_PREFIX(state.activeMaskId) + state.currentChatId, state.currentMessages);
    }
  }

  // 无论是否写入系统消息，挂断时都应该重新渲染底层消息列表，让过滤逻辑生效
  /* ========================================================================
     [区域标注·本次修改·电话功能] 修正挂断后底层刷新调用
     说明：修复调用了错误的渲染函数 renderChatMessage 的问题，改为调用 renderCurrentChatMessage 以触发整页刷新。
     ======================================================================== */
  renderCurrentChatMessage(_container, state);

  if (phoneOverlayElement) {
    phoneOverlayElement.classList.remove('is-visible');
    setTimeout(() => {
      phoneOverlayElement.classList.add('is-hidden');
    }, 300);
  }
}
