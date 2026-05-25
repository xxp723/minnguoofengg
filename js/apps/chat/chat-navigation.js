// @ts-nocheck
/**
 * 文件名: js/apps/chat/chat-navigation.js
 * 用途: 聊天消息页、设置返回与用户主页子页面导航。
 * 架构层: 应用层子模块（由 index.js 入口接线）
 */

/* ==========================================================================
   [区域标注·已完成·index.js入口拆分] 聊天导航与子页面模块
   说明：
   1. 从 index.js 拆出聊天消息页打开/关闭、返回捕获、会话头像保存与用户主页子页面导航。
   2. 防闪屏的离屏渲染逻辑保持原样；不新增 localStorage/sessionStorage。
   3. 持久化仍只通过 DB.js / IndexedDB 的 dbGet/dbPut。
   ========================================================================== */
import {
  DATA_KEY_SESSIONS,
  DATA_KEY_MESSAGES_PREFIX,
  DATA_KEY_CHAT_PROMPT_SETTINGS,
  PANEL_KEYS,
  dbGet,
  dbPut,
  escapeHtml
} from './chat-utils.js';
import { normalizeChatPromptSettings } from './prompt.js';
import {
  getDefaultAsideSettings,
  normalizeAsideSettings,
  loadAsideModeState
} from './chat-aside.js';
import {
  renderCurrentChatMessage,
  resetMessageSelectionState
} from './chat-message.js';
import { normalizeTranslationSettings } from './chat-translation.js';
import { renderSubPage } from './profile.js';
import { refreshPanel } from './chat-shell.js';
import { prepareChatBackgroundRuntimeUrl } from './chat-beauty-settings.js';
import {
  CHAT_MESSAGE_INITIAL_VISIBLE_COUNT,
  DATA_KEY_CHAT_CONSOLE,
  DATA_KEY_CHAT_CONSOLE_ENABLED,
  DATA_KEY_CHAT_TRANSLATION_SETTINGS,
  normalizeChatConsoleLogs
} from './chat-state.js';

/* ==========================================================================
   [区域标注] 打开聊天消息页面
   说明：隐藏主界面，显示独立的聊天消息页面
   ========================================================================== */
export async function openChatMessage(container, state, db, chatId) {
  const session = state.sessions.find(s => s.id === chatId);
  if (!session) return;

  state.currentChatId = chatId;
  resetMessageSelectionState(state);
  state.stickerPanelOpen = false;
  state.stickerPanelGroupId = 'all';
  state.coffeeDockOpen = false;
  state.pendingQuote = null;
  /* [区域标注·已完成·聊天记录搜索] 进入会话时重置搜索框，避免上一个聊天的关键词残留 */
  state.chatMessageSearchOpen = false;
  state.chatMessageSearchKeyword = '';
  /* ========================================================================
     [区域标注·已完成·本次聊天记录分段加载] 进入会话重置为默认最新 100 条
     说明：只重置本次查看范围；完整聊天记录稍后仍从 IndexedDB 载入 currentMessages。
     ======================================================================== */
  state.chatMessageVisibleCount = CHAT_MESSAGE_INITIAL_VISIBLE_COUNT;

  /* [区域标注] 从 IndexedDB 加载该会话的消息记录 */
  // 这里保留赋值给 state.currentMessages 主要是为了向前兼容和其他组件（如渲染等）目前默认使用 currentMessages，
  // 实际上在 sendMessage 中我们已经支持通过 targetChatId 来独立获取，但当前活动窗口的还是放在这里。
  state.currentMessages = (await dbGet(db, DATA_KEY_MESSAGES_PREFIX(state.activeMaskId) + chatId)) || [];

  /* ========================================================================
     [区域标注·已完成·旁白模式防自动退出修复] 打开会话时恢复旁白模式状态
     说明：
     1. 旁白模式 active/settings/history 按“当前面具 + 当前会话”从 DB.js / IndexedDB 读取。
     2. 这样闲谈应用重新挂载、刷新或重新进入会话时，不会在未点击爱心的情况下自动退出旁白模式。
     3. 不使用 localStorage/sessionStorage，不写双份兜底，不使用长文本字段过滤。
     ======================================================================== */
  const asideModeState = await loadAsideModeState(db, state.activeMaskId, chatId);
  state.asideModeActive = Boolean(asideModeState?.active);
  state.asideSettings = normalizeAsideSettings(asideModeState?.settings || getDefaultAsideSettings());
  state.asideHistory = Array.isArray(asideModeState?.history) ? asideModeState.history : [];

  /* ========================================================================
     [区域标注·已完成·本次聊天背景大图修复] 加载聊天设置并恢复本地 Blob 背景运行时 URL
     说明：
     1. 聊天背景设置仍按“当前面具 + 当前会话”从 DB.js / IndexedDB 读取。
     2. 本地大图背景只在设置对象里保存 chatBackgroundMediaKey；这里在首屏渲染前读取 IndexedDB Blob 并生成 objectURL。
     3. 先恢复运行时 URL 再 renderCurrentChatMessage，避免进入消息页时背景丢失或闪一下默认底色。
     4. 不使用 localStorage/sessionStorage，不写双份存储兜底，不做长文本字段过滤。
     ======================================================================== */
  state.chatPromptSettings = normalizeChatPromptSettings(await dbGet(db, DATA_KEY_CHAT_PROMPT_SETTINGS(state.activeMaskId, chatId)));
  await prepareChatBackgroundRuntimeUrl(state, db);

  /* ========================================================================
     [区域标注·已完成·本次进入聊天消息页防闪屏修复] 先离屏渲染消息页，再同帧切换显隐
     说明：
     1. 不再先隐藏主界面后等待下一帧显示消息页，避免中间出现空白帧造成闪屏。
     2. 消息页容器先以不可见态完成渲染；下一帧同一批 DOM 操作里隐藏主界面并显示消息页。
     3. 仅调整从聊天列表进入聊天消息页的显示时序；不改其它功能，不新增任何持久化存储逻辑。
     4. 持久化仍只使用 DB.js / IndexedDB，不使用 localStorage/sessionStorage。
     ======================================================================== */
  const topBar = container.querySelector('.chat-top-bar');
  const subTabs = container.querySelector('[data-role="chat-sub-tabs"]');
  const bottomTab = container.querySelector('[data-role="bottom-tab"]');
  const panels = container.querySelectorAll('.chat-panel');
  const msgWrap = container.querySelector('[data-role="msg-page-wrap"]');

  /* ========================================================================
     [区域标注·已完成·本次控制台持久显示与后台记录修复] 进入会话时恢复控制台状态
     说明：
     1. 日志和显示开关均按“当前面具 + 当前会话”从 IndexedDB 读取。
     2. 不再因退出/重进聊天页面把已开启的控制台重置为关闭。
     3. 抽屉展开态仍为运行时临时状态，进入页面默认收起以保持界面稳定。
     ======================================================================== */
  state.chatConsoleLogs = normalizeChatConsoleLogs(await dbGet(db, DATA_KEY_CHAT_CONSOLE(state.activeMaskId, chatId)));
  state.chatConsoleEnabled = Boolean(await dbGet(db, DATA_KEY_CHAT_CONSOLE_ENABLED(state.activeMaskId, chatId)));
  state.chatConsoleExpanded = false;
  /* ===== [区域标注·已完成·语言翻译] 从 IndexedDB 加载翻译设置 ===== */
  state.translationSettings = normalizeTranslationSettings(await dbGet(db, DATA_KEY_CHAT_TRANSLATION_SETTINGS(state.activeMaskId, chatId)));

  if (msgWrap) {
    msgWrap.style.display = 'flex';
    msgWrap.style.visibility = 'hidden';
    msgWrap.style.opacity = '0';
    msgWrap.style.pointerEvents = 'none';
    renderCurrentChatMessage(container, state);
    window.requestAnimationFrame(() => {
      if (state.currentChatId !== chatId) return;

      if (topBar) topBar.style.display = 'none';
      if (subTabs) subTabs.style.display = 'none';
      if (bottomTab) bottomTab.style.display = 'none';
      panels.forEach(p => p.style.display = 'none');

      msgWrap.style.visibility = '';
      msgWrap.style.opacity = '';
      msgWrap.style.pointerEvents = '';
    });
  }

  /* [区域标注] 滚动到消息底部 */
  setTimeout(() => {
    const listArea = msgWrap?.querySelector('[data-role="msg-list"]');
    if (listArea) listArea.scrollTop = listArea.scrollHeight;
  }, 50);
}

/* ==========================================================================
   [区域标注] 关闭聊天消息页面，返回聊天列表
   ========================================================================== */
/* ==========================================================================
   [区域标注·已完成·更换/删除会话头像保存]
   说明：
   1. 角色头像只更新当前会话 session.avatar；用户头像只更新当前会话 session.userAvatar。
   2. 不修改 contacts/contact.avatar，不影响通讯录头像、联系人原始头像或全局 state.profile.avatar。
   3. 持久化只调用 dbPut → DATA_KEY_SESSIONS → DB.js / IndexedDB；不使用 localStorage/sessionStorage。
   4. 本区域同时承接“上传头像”弹窗中的删除当前会话头像能力；删除后回退到当前界面的既有初始头像/资料头像展示。
   ========================================================================== */
function getSessionAvatarInitial(name = '') {
  return escapeHtml((String(name || '?').trim() || '?').charAt(0).toUpperCase());
}

/* ========================================================================
   [区域标注·本次修改·头像与备注3点需求：当前会话角色头像删除后的资料头像回退]
   说明：
   1. 删除“当前会话单独设置”的角色头像后，只回退显示层，不改写通讯录联系人原始头像。
   2. 回退优先使用当前会话关联联系人的资料头像；只有资料头像不存在时才回退为首字占位。
   3. 本区域不使用 localStorage/sessionStorage，不写双份存储兜底；联系人数据只从现有 state.contacts 读取。
   ======================================================================== */
function getCurrentContactForSession(state, session) {
  const contacts = Array.isArray(state?.contacts) ? state.contacts : [];
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

function getSessionAvatarFallbackMarkup(state, session) {
  const contact = getCurrentContactForSession(state, session);
  const contactAvatar = String(contact?.avatar || '').trim();
  const sessionName = String(session?.name || '聊天').trim() || '聊天';

  return contactAvatar
    ? `<img src="${escapeHtml(contactAvatar)}" alt="${escapeHtml(sessionName)}">`
    : `<span>${getSessionAvatarInitial(sessionName)}</span>`;
}

function getUserAvatarFallbackMarkup(state) {
  const userName = String(state.profile?.nickname || '我');
  const profileAvatar = String(state.profile?.avatar || '').trim();
  return profileAvatar
    ? `<img src="${escapeHtml(profileAvatar)}" alt="${escapeHtml(userName)}">`
    : `<span>${escapeHtml((userName || '我').charAt(0).toUpperCase())}</span>`;
}

export async function saveCurrentChatSessionAvatar(container, state, db, avatarUrl) {
  const session = state.sessions.find(item => String(item.id) === String(state.currentChatId));
  const safeAvatarUrl = String(avatarUrl || '').trim();
  if (!session || !safeAvatarUrl) return false;

  session.avatar = safeAvatarUrl;
  session.avatarUpdatedAt = Date.now();
  await dbPut(db, DATA_KEY_SESSIONS(state.activeMaskId), state.sessions);

  const preview = container.querySelector('[data-role="msg-settings-avatar-preview-character"]');
  if (preview) {
    preview.innerHTML = `<img src="${escapeHtml(safeAvatarUrl)}" alt="${escapeHtml(session.name || '')}">`;
  }

  const topAvatar = container.querySelector('.msg-top-bar__avatar');
  if (topAvatar) {
    topAvatar.innerHTML = `<img src="${escapeHtml(safeAvatarUrl)}" alt="${escapeHtml(session.name || '')}">`;
  }

  container.querySelectorAll('.msg-bubble-row--left .msg-bubble__avatar').forEach(avatarEl => {
    avatarEl.innerHTML = `<img src="${escapeHtml(safeAvatarUrl)}" alt="${escapeHtml(session.name || '')}">`;
  });

  refreshPanel(container, state, 'chatList');
  return true;
}

export async function saveCurrentChatSessionUserAvatar(container, state, db, avatarUrl) {
  const session = state.sessions.find(item => String(item.id) === String(state.currentChatId));
  const safeAvatarUrl = String(avatarUrl || '').trim();
  if (!session || !safeAvatarUrl) return false;

  const userName = String(state.profile?.nickname || '我');
  session.userAvatar = safeAvatarUrl;
  session.userAvatarUpdatedAt = Date.now();
  await dbPut(db, DATA_KEY_SESSIONS(state.activeMaskId), state.sessions);

  const preview = container.querySelector('[data-role="msg-settings-avatar-preview-user"]');
  if (preview) {
    preview.innerHTML = `<img src="${escapeHtml(safeAvatarUrl)}" alt="${escapeHtml(userName)}">`;
  }

  container.querySelectorAll('.msg-bubble__avatar--user').forEach(avatarEl => {
    avatarEl.innerHTML = `<img src="${escapeHtml(safeAvatarUrl)}" alt="${escapeHtml(userName)}">`;
  });

  return true;
}

export async function deleteCurrentChatSessionAvatar(container, state, db) {
  const session = state.sessions.find(item => String(item.id) === String(state.currentChatId));
  if (!session) return false;

  session.avatar = '';
  session.avatarUpdatedAt = Date.now();
  await dbPut(db, DATA_KEY_SESSIONS(state.activeMaskId), state.sessions);

  const fallbackAvatarMarkup = getSessionAvatarFallbackMarkup(state, session);

  const preview = container.querySelector('[data-role="msg-settings-avatar-preview-character"]');
  if (preview) {
    preview.innerHTML = fallbackAvatarMarkup;
  }

  const topAvatar = container.querySelector('.msg-top-bar__avatar');
  if (topAvatar) {
    topAvatar.innerHTML = fallbackAvatarMarkup;
  }

  container.querySelectorAll('.msg-bubble-row--left .msg-bubble__avatar').forEach(avatarEl => {
    avatarEl.innerHTML = fallbackAvatarMarkup;
  });

  refreshPanel(container, state, 'chatList');
  return true;
}

export async function deleteCurrentChatSessionUserAvatar(container, state, db) {
  const session = state.sessions.find(item => String(item.id) === String(state.currentChatId));
  if (!session) return false;

  session.userAvatar = '';
  session.userAvatarUpdatedAt = Date.now();
  await dbPut(db, DATA_KEY_SESSIONS(state.activeMaskId), state.sessions);

  const preview = container.querySelector('[data-role="msg-settings-avatar-preview-user"]');
  if (preview) {
    preview.innerHTML = getUserAvatarFallbackMarkup(state);
  }

  container.querySelectorAll('.msg-bubble__avatar--user').forEach(avatarEl => {
    avatarEl.innerHTML = getUserAvatarFallbackMarkup(state);
  });

  return true;
}

export function closeChatMessage(container, state) {
  state.currentChatId = null;
  state.currentMessages = [];
  /* ===== 闲谈聊天设置按联系人独立存储 START ===== */
  state.chatPromptSettings = normalizeChatPromptSettings(null);
  /* ===== 闲谈聊天设置按联系人独立存储 END ===== */
  resetMessageSelectionState(state);
  state.stickerPanelOpen = false;
  state.stickerPanelGroupId = 'all';
  state.coffeeDockOpen = false;
  state.pendingQuote = null;
  /* [区域标注·已完成·聊天记录搜索] 退出消息页时清空搜索运行时状态，不写任何持久化存储 */
  state.chatMessageSearchOpen = false;
  state.chatMessageSearchKeyword = '';
  /* ========================================================================
     [区域标注·已完成·本次聊天记录分段加载] 退出消息页时恢复默认可见数量
     说明：运行时查看范围不持久化，下次进入仍默认显示最新 100 条。
     ======================================================================== */
  state.chatMessageVisibleCount = CHAT_MESSAGE_INITIAL_VISIBLE_COUNT;

  const topBar = container.querySelector('.chat-top-bar');
  const subTabs = container.querySelector('[data-role="chat-sub-tabs"]');
  const bottomTab = container.querySelector('[data-role="bottom-tab"]');
  const msgWrap = container.querySelector('[data-role="msg-page-wrap"]');

  if (topBar) topBar.style.display = '';
  if (subTabs) subTabs.style.display = state.activePanel === 'chatList' ? '' : 'none';
  if (bottomTab) bottomTab.style.display = '';

  /* [区域标注] 恢复板块显示 */
  PANEL_KEYS.forEach(k => {
    const el = container.querySelector(`[data-panel="${k}"]`);
    if (el) {
      el.style.display = '';
      el.classList.toggle('is-active', k === state.activePanel);
    }
  });

  if (msgWrap) {
    msgWrap.style.display = 'none';
    msgWrap.innerHTML = '';
  }
}

/* ========================================================================
   [区域标注·已完成·本次返回按钮点击修复] 捕获阶段返回导航
   说明：
   1. 仅拦截聊天消息页返回聊天列表按钮（data-action="msg-back"）与聊天设置页返回消息列表按钮（data-action="msg-settings-back"）。
   2. 捕获阶段立即执行导航并 stopPropagation，防止后续气泡工具栏关闭逻辑、长按逻辑或外层桌面手势层把点击吞掉。
   3. 本区域只修改运行时 UI 显隐/重渲染；不读写 localStorage/sessionStorage，也不新增 IndexedDB 写入。
   ======================================================================== */
export function handleChatReturnClickCapture(e, state, container) {
  const target = e.target?.closest?.('[data-action="msg-back"], [data-action="msg-settings-back"]');
  if (!target || !container.contains(target)) return;

  const action = String(target.dataset.action || '');
  e.preventDefault();
  e.stopPropagation();

  if (action === 'msg-back') {
    closeChatMessage(container, state);
    refreshPanel(container, state, 'chatList');
    return;
  }

  if (action === 'msg-settings-back') {
    renderCurrentChatMessage(container, state);
  }
}


/* ==========================================================================
   [区域标注·修改1] 打开子页面（钱包 / 表情包 / 聊天天数详情）
   说明：隐藏主界面元素，在内容区显示独立子页面
   ========================================================================== */
export function openSubPage(container, state, pageType) {
  state.subPageView = pageType;
  state.stickerMultiSelectMode = false;
  state.selectedStickerIds = [];
  state.favoriteMultiSelectMode = false;
  state.selectedFavoriteIds = [];

  const topBar = container.querySelector('.chat-top-bar');
  const subTabs = container.querySelector('[data-role="chat-sub-tabs"]');
  const bottomTab = container.querySelector('[data-role="bottom-tab"]');
  const panels = container.querySelectorAll('.chat-panel');
  const msgWrap = container.querySelector('[data-role="msg-page-wrap"]');

  if (topBar) topBar.style.display = 'none';
  if (subTabs) subTabs.style.display = 'none';
  if (bottomTab) bottomTab.style.display = 'none';
  panels.forEach(p => p.style.display = 'none');

  if (msgWrap) {
    msgWrap.style.display = 'flex';
    msgWrap.innerHTML = renderSubPage(state, pageType);
  }
}

/* ==========================================================================
   [区域标注·修改1] 关闭子页面，返回用户主页
   ========================================================================== */
export function closeSubPage(container, state) {
  state.subPageView = null;
  state.walletDraftCurrency = '';
  state.stickerMultiSelectMode = false;
  state.selectedStickerIds = [];
  state.favoriteMultiSelectMode = false;
  state.selectedFavoriteIds = [];

  const topBar = container.querySelector('.chat-top-bar');
  const bottomTab = container.querySelector('[data-role="bottom-tab"]');
  const msgWrap = container.querySelector('[data-role="msg-page-wrap"]');

  if (topBar) topBar.style.display = '';
  if (bottomTab) bottomTab.style.display = '';

  PANEL_KEYS.forEach(k => {
    const el = container.querySelector(`[data-panel="${k}"]`);
    if (el) {
      el.style.display = '';
      el.classList.toggle('is-active', k === state.activePanel);
    }
  });

  if (msgWrap) {
    msgWrap.style.display = 'none';
    msgWrap.innerHTML = '';
  }
}

export function rerenderCurrentSubPage(container, state) {
  const msgWrap = container.querySelector('[data-role="msg-page-wrap"]');
  if (msgWrap && state.subPageView) {
    msgWrap.innerHTML = renderSubPage(state, state.subPageView);
  }
}

/* ==========================================================================
   [区域标注·已完成·本次需求1] 收藏独立页搜索结果局部刷新
   说明：
   1. 搜索输入时只替换收藏卡片网格，不重建搜索 input。
   2. 保持移动端输入法焦点，允许连续删除多个字。
   3. 持久化仍只写 DB.js / IndexedDB，不使用 localStorage/sessionStorage。
   ========================================================================== */
export function refreshFavoriteSearchResultsOnly(container, state) {
  if (state.subPageView !== 'favorite') return;
  const currentGrid = container.querySelector('.favorite-grid');
  if (!currentGrid) return;

  const draft = document.createElement('div');
  draft.innerHTML = renderSubPage(state, 'favorite');
  const nextGrid = draft.querySelector('.favorite-grid');
  if (nextGrid) currentGrid.innerHTML = nextGrid.innerHTML;
}
