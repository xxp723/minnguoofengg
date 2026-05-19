// @ts-nocheck
/**
 * 文件名: js/apps/chat/chat-event-input.js
 * 用途: 闲谈应用输入事件处理。
 * 架构层: 应用层子模块（由 chat-event-handlers.js 聚合导出）
 */

/* ==========================================================================
   [区域标注·已完成·chat-event-handlers.js拆分] 输入事件处理
   说明：
   1. 从 chat-event-handlers.js 原样拆出输入事件处理逻辑。
   2. 保持原有输入分支顺序、刷新逻辑与 DB.js / IndexedDB 持久化调用不变。
   3. 不引入 localStorage/sessionStorage，不增加双份兜底存储。
   ========================================================================== */
import {
  DATA_KEY_FAVORITES,
  DATA_KEY_SESSIONS,
  getCurrentChatPromptSettingsKey,
  dbPut,
  normalizeFavoriteData
} from './chat-utils.js';
import { handleContactsInput } from './contacts.js';
import {
  syncStickerInputSuggestions,
  syncChatMessageSearchPanel
} from './chat-message.js';
import { refreshPanel } from './chat-shell.js';
import { refreshFavoriteSearchResultsOnly } from './chat-navigation.js';
import {
  syncMessageInputAutoHeight
} from './chat-state.js';
import {
  normalizeMomentsComposeDraft,
  ensureMomentsComposeDraft
} from './moments.js';
import { updateChatAvatarCropPreview } from './chat-message.js';
import { handleChatMemorySettingsInput } from './chat-memory-settings.js';
import { handleAutonomousActivitySettingsInput } from './chat-autonomous-activity-settings.js';

export function handleInput(e, state, container, db) {
  const target = e.target;

  /* ==========================================================================
     [区域标注·已完成·自主活动设置输入接线]
     说明：
     1. 本区只把“自主活动”模块的时间间隔输入转交给 chat-autonomous-activity-settings.js。
     2. 实际规范化、局部同步与 DB.js / IndexedDB 持久化均在独立模块内完成。
     3. 不使用 localStorage/sessionStorage，不改动其它聊天设置输入分支。
     ========================================================================== */
  /* ==========================================================================
     [区域标注·已完成·长期记忆设置输入接线]
     说明：
     1. 本区只把“长期记忆”的总结轮数输入转交给 chat-memory-settings.js。
     2. 实际规范化、局部同步与 DB.js / IndexedDB 持久化均在独立模块内完成。
     3. 不使用 localStorage/sessionStorage，不改动其它聊天设置输入分支。
     ========================================================================== */
  if (handleChatMemorySettingsInput(e, state, container, db)) return;

  if (handleAutonomousActivitySettingsInput(e, state, container, db)) return;

  if (target.matches('[data-role="msg-input"]')) {
    syncMessageInputAutoHeight(target);
    syncStickerInputSuggestions(container, state, target.value || '');
    return;
  }

  if (target.matches('[data-role="moments-compose-textarea"]')) {
    const draft = ensureMomentsComposeDraft(state);
    state.momentsComposeDraft = normalizeMomentsComposeDraft({
      ...draft,
      text: target.value || ''
    });
    return;
  }

  if (target.matches('[data-role="msg-search-input"]')) {
    e.stopPropagation();
    state.chatMessageSearchKeyword = target.value || '';
    syncChatMessageSearchPanel(container, state);
    return;
  }

  if (target.matches('[data-role="chat-search-input"]')) {
    state.chatSearchKeyword = target.value || '';
    refreshPanel(container, state, 'chatList');
    return;
  }

  if (target.matches('[data-role="modal-search"]')) {
    const keyword = (target.value || '').toLowerCase();
    const body = container.querySelector('[data-role="modal-body"]');
    if (!body) return;
    body.querySelectorAll('.chat-modal-contact').forEach(item => {
      const nameEl = item.querySelector('.chat-modal-contact__name');
      const name = (nameEl?.textContent || '').toLowerCase();
      item.style.display = name.includes(keyword) ? '' : 'none';
    });
    return;
  }

  if (handleContactsInput(e, state, container)) return;

  if (target.matches('[data-role="favorite-search-input"]')) {
    const data = normalizeFavoriteData(state.favoriteData);
    state.favoriteData = { ...data, searchKeyword: target.value || '' };
    dbPut(db, DATA_KEY_FAVORITES(state.activeMaskId), normalizeFavoriteData(state.favoriteData));
    refreshFavoriteSearchResultsOnly(container, state);
    return;
  }

  if (target.matches('[data-role="chat-avatar-crop-zoom"], [data-role="chat-avatar-crop-x"], [data-role="chat-avatar-crop-y"]')) {
    updateChatAvatarCropPreview(container);
    return;
  }

  if (target.matches('[data-role="msg-session-remark"]')) {
    const currentSession = (state.sessions || []).find(item => String(item.id) === String(state.currentChatId));
    if (!currentSession) return;
    currentSession.remark = target.value ?? '';
    dbPut(db, DATA_KEY_SESSIONS(state.activeMaskId), state.sessions);

    const remarkDisplayName = String(currentSession.remark ?? '').length
      ? String(currentSession.remark)
      : String(currentSession.name || '聊天');

    const topNameEl = container.querySelector('.msg-top-bar__name');
    if (topNameEl) topNameEl.textContent = remarkDisplayName;

    refreshPanel(container, state, 'chatList');
    return;
  }

  if (target.matches('[data-role="msg-current-command"]')) {
    state.chatPromptSettings.currentCommand = target.value || '';
    dbPut(db, getCurrentChatPromptSettingsKey(state), state.chatPromptSettings);
    return;
  }

  if (target.matches('[data-role="msg-custom-thinking"]')) {
    state.chatPromptSettings.customThinkingInstruction = target.value || '';
    dbPut(db, getCurrentChatPromptSettingsKey(state), state.chatPromptSettings);
    return;
  }

  /* ==========================================================================
     [区域标注·已完成·本次修改·拍一拍设置输入持久化]
     说明：
     1. 聊天设置页“拍一拍”输入框只保存气泡功能栏“拍拍”共用的部位/文案，不再直接发送系统提示小字。
     2. 设置值写入当前面具 + 当前聊天对象的 chatPromptSettings.userPatTargetText，经 DB.js / IndexedDB 持久化。
     3. 不使用 localStorage/sessionStorage，不写双份兜底，不使用原生浏览器弹窗或原生选择器。
     ========================================================================== */
  if (target.matches('[data-role="settings-user-pat-target-input"]')) {
    state.chatPromptSettings.userPatTargetText = target.value || '';
    dbPut(db, getCurrentChatPromptSettingsKey(state), state.chatPromptSettings);
    return;
  }

  /* ==========================================================================
     [区域标注·已完成·本次4项修改：短期记忆轮数允许留空]
     说明：
     1. 仅调整“短期记忆”输入保存：允许用户清空输入框，不再强制回填 0 或默认 8。
     2. 留空保存为空字符串；发送时由 prompt 构建链路按 0 轮处理，即不携带短期历史。
     3. 仍写入当前面具 + 当前聊天对象的 chatPromptSettings，经 DB.js / IndexedDB 持久化。
     ========================================================================== */
  if (target.matches('[data-role="msg-reply-bubble-min"], [data-role="msg-reply-bubble-max"], [data-role="msg-short-term-memory-rounds"]')) {
    const minInput = container.querySelector('[data-role="msg-reply-bubble-min"]');
    const maxInput = container.querySelector('[data-role="msg-reply-bubble-max"]');
    const memoryInput = container.querySelector('[data-role="msg-short-term-memory-rounds"]');

    const min = Math.max(1, Math.floor(Number(minInput?.value || 1)) || 1);
    const max = Math.max(min, Math.floor(Number(maxInput?.value || min)) || min);
    const rawMemoryText = String(memoryInput?.value ?? '').trim();
    const rawMemoryNumber = Number(rawMemoryText);
    const rounds = rawMemoryText === ''
      ? ''
      : (Number.isFinite(rawMemoryNumber) ? Math.max(0, Math.floor(rawMemoryNumber)) : '');

    state.chatPromptSettings.replyBubbleMin = min;
    state.chatPromptSettings.replyBubbleMax = max;
    state.chatPromptSettings.shortTermMemoryRounds = rounds;

    if (minInput && String(minInput.value) !== String(min)) minInput.value = String(min);
    if (maxInput && String(maxInput.value) !== String(max)) maxInput.value = String(max);
    if (memoryInput && rawMemoryText !== '' && String(memoryInput.value) !== String(rounds)) memoryInput.value = String(rounds);

    dbPut(db, getCurrentChatPromptSettingsKey(state), state.chatPromptSettings);
  }
}
