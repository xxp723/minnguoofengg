// @ts-nocheck
/**
 * 文件名: js/apps/chat/chat-user-pat.js
 * 用途: 闲谈应用 — “拍一拍”功能独立模块
 * 架构层: 应用层（闲谈子模块）
 */

import {
  DATA_KEY_SESSIONS,
  dbPut,
  escapeHtml,
  renderModalNotice
} from './chat-utils.js';
import {
  appendCurrentMessageBubble,
  persistCurrentMessages
} from './chat-message.js';
import { refreshPanel } from './chat-shell.js';

/* ==========================================================================
   [区域标注·已完成·本次拍一拍独立模块]
   说明：
   1. 本文件集中维护聊天设置页“功能玩法 → 拍一拍”的渲染、消息创建与发送处理。
   2. 拍一拍消息通过当前聊天记录 DB.js / IndexedDB 链路保存，不使用 localStorage/sessionStorage。
   3. 不写双份兜底，不使用原生浏览器弹窗或原生选择器。
   4. 消息类型固定为 user_pat_system，渲染层按系统提示小字显示。
   ========================================================================== */

export const USER_PAT_SYSTEM_MESSAGE_TYPE = 'user_pat_system';

/* ==========================================================================
   [区域标注·已完成·拍一拍系统提示类型判断]
   说明：
   1. 供聊天消息渲染模块判断 user_pat_system 是否走系统提示小字样式。
   2. 这里只做类型判断，不读写任何持久化存储。
   ========================================================================== */
export function isUserPatSystemMessage(message = {}) {
  return String(message?.type || '') === USER_PAT_SYSTEM_MESSAGE_TYPE;
}

/* ==========================================================================
   [区域标注·已完成·拍一拍设置抽屉HTML]
   说明：
   1. 供 chat-message-settings.js 在“功能玩法”板块内插入“拍一拍”小版块。
   2. 使用抽屉式结构，点击后由 chat-event-click.js 的既有抽屉分支展开/收起。
   3. 输入框只填写身体部位/身体相关位置，最终提示为“你拍了拍角色名的____”。
   ========================================================================== */
export function renderUserPatSettingsSection(roleDisplayName = '聊天') {
  const safeRoleDisplayName = String(roleDisplayName || '聊天').trim() || '聊天';

  return `
    <div class="msg-settings-feature-play-pat">
      <button
        class="msg-settings-row msg-settings-feature-play-sticker-toggle"
        data-action="toggle-settings-sticker-drawer"
        type="button"
        aria-label="展开拍一拍"
        aria-expanded="false">
        <span class="msg-settings-card__title">拍一拍</span>
        <span class="msg-settings-feature-play-arrow" aria-hidden="true">
          <svg viewBox="0 0 48 48" fill="none">
            <path d="M19 12l12 12-12 12" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </span>
      </button>
      <div class="msg-settings-feature-play-drawer" data-role="settings-user-pat-drawer">
        <div class="msg-settings-feature-play-drawer__inner">
          <div class="msg-settings-pat-editor" data-role="settings-user-pat-editor">
            <div class="msg-settings-pat-editor__line">
              <span>你拍了拍${escapeHtml(safeRoleDisplayName)}的</span>
              <input
                class="msg-settings-input msg-settings-pat-editor__input"
                data-role="settings-user-pat-target-input"
                type="text"
                placeholder="肩膀"
                maxlength="24">
            </div>
            <button class="msg-settings-pat-editor__send" data-action="send-user-pat-message" type="button">拍一拍</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

/* ==========================================================================
   [区域标注·已完成·拍一拍消息创建]
   说明：
   1. 只创建当前聊天内的 user_pat_system 系统提示消息对象。
   2. 默认部位为“肩膀”，避免空输入导致空白提示。
   3. 不做长文本过滤，不使用 isLikelyLargeMediaField 之类逻辑。
   ========================================================================== */
export function createUserPatSystemMessage(session = {}, patTargetText = '') {
  const patTarget = String(patTargetText || '').trim() || '肩膀';
  const roleName = String(session.name || session.remark || '对方').trim() || '对方';
  const now = Date.now();

  return {
    id: `user_pat_system_${now}_${Math.random().toString(16).slice(2)}`,
    role: 'user',
    type: USER_PAT_SYSTEM_MESSAGE_TYPE,
    content: `你拍了拍${roleName}的${patTarget}`,
    patTarget,
    patRoleName: roleName,
    timestamp: now
  };
}

/* ==========================================================================
   [区域标注·已完成·拍一拍发送处理]
   说明：
   1. 供 chat-event-click.js 在 send-user-pat-message 分支中转交调用。
   2. 追加系统提示小字消息，并复用 persistCurrentMessages / DATA_KEY_SESSIONS 的 IndexedDB 持久化链路。
   3. 只局部追加消息与刷新聊天列表摘要，不重建设置页，避免页面闪屏。
   4. 不使用 localStorage/sessionStorage，不写双份兜底，不使用原生弹窗或原生选择器。
   ========================================================================== */
export async function handleSendUserPatMessage({
  state,
  container,
  db
} = {}) {
  if (!state?.currentChatId) return false;

  const session = (Array.isArray(state.sessions) ? state.sessions : [])
    .find(s => String(s.id) === String(state.currentChatId));

  if (!session) {
    renderModalNotice(container, '当前聊天不存在，无法拍一拍');
    return false;
  }

  const input = container?.querySelector?.('[data-role="settings-user-pat-target-input"]');
  const patMessage = createUserPatSystemMessage(session, input?.value || '');

  state.currentMessages.push(patMessage);
  session.lastMessage = patMessage.content;
  session.lastTime = patMessage.timestamp;

  await Promise.all([
    persistCurrentMessages(state, db),
    dbPut(db, DATA_KEY_SESSIONS(state.activeMaskId), state.sessions)
  ]);

  if (input) input.value = '';
  appendCurrentMessageBubble(container, state, patMessage);
  refreshPanel(container, state, 'chatList');
  return true;
}
