// @ts-nocheck
/**
 * 文件名: js/apps/chat/chat-state.js
 * 用途: 闲谈运行时状态、IndexedDB 数据键、面具数据读写与档案联动清理。
 * 架构层: 应用层子模块（由 index.js 入口接线）
 */

/* ==========================================================================
   [区域标注·已完成·index.js入口拆分] 状态与数据接线模块
   说明：
   1. 从 index.js 拆出运行时状态创建、聊天控制台状态、面具数据读写与档案级联清理。
   2. 持久化统一使用 DB.js / IndexedDB 相关 dbGet/dbPut/db.put，不使用 localStorage/sessionStorage。
   3. 不写双份存储兜底，不使用长文本字段过滤逻辑。
   ========================================================================== */
import {
  ARCHIVE_DB_RECORD_ID,
  DATA_KEY_SESSIONS,
  DATA_KEY_HIDDEN_CHAT_IDS,
  DATA_KEY_CONTACTS,
  DATA_KEY_CONTACT_GROUPS,
  DATA_KEY_MOMENTS,
  DATA_KEY_MESSAGES_PREFIX,
  DATA_KEY_CHAT_PROMPT_SETTINGS,
  DATA_KEY_WALLET,
  DATA_KEY_FAVORITES,
  dbGet,
  dbPut,
  dbGetArchiveData,
  normalizeContactGroups,
  normalizeContacts,
  normalizeStickerData,
  normalizeWalletData,
  normalizeFavoriteData
} from './chat-utils.js';
import { normalizeChatPromptSettings } from './prompt.js';
import { syncChatConsoleDock } from './chat-message.js';
import { resetMessageSelectionState } from './chat-message-selection.js';
import { getDefaultAsideSettings } from './chat-aside.js';
import {
  createMomentsComposeDraft,
  createMomentsInteractionState,
  resetMomentsInteractionState
} from './moments.js';
import { buildProfileFromMask } from './profile.js';
import { buildAppShell } from './chat-shell.js';

/* ========================================================================
   [区域标注·已完成·本次控制台持久显示与后台记录修复] 聊天日志与显示开关存储键（IndexedDB）
   说明：
   1. 严格使用 DB.js / IndexedDB，不使用 localStorage/sessionStorage。
   2. chat_console 保存当前会话日志；chat_console_enabled 只保存用户是否显示聊天页控制台抽屉。
   3. 日志后台记录不依赖显示开关，用户手动关闭开关才隐藏抽屉。
   ======================================================================== */
export const DATA_KEY_CHAT_CONSOLE = (maskId, chatId) => `chat_console::${maskId || 'default'}::${chatId || 'none'}`;
export const DATA_KEY_CHAT_CONSOLE_ENABLED = (maskId, chatId) => `chat_console_enabled::${maskId || 'default'}::${chatId || 'none'}`;
export const DATA_KEY_CHAT_CONSOLE_TOKEN_USAGE = (maskId, chatId) => `chat_console_token_usage::${maskId || 'default'}::${chatId || 'none'}`;
/* ===== [区域标注·已完成·语言翻译] IndexedDB 数据键 ===== */
export const DATA_KEY_CHAT_TRANSLATION_SETTINGS = (maskId, chatId) => `chat_translation_settings::${maskId || 'default'}::${chatId || 'none'}`;

/* ===== [区域标注·本次朋友圈标题栏按钮] Moments 右侧爱心图标，仅用于朋友圈标题栏运行时显示 ===== */
export const ICON_MOMENTS_HEART = `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M15 8C8.925 8 4 12.925 4 19c0 11 13 21 20 23.326C31 40 44 30 44 19c0-6.075-4.925-11-11-11c-3.72 0-7.01 1.847-9 4.674A11.007 11.007 0 0 0 15 8Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>`;

/* ========================================================================
   [区域标注·已完成·本次聊天记录分段加载] 消息页可见数量运行时配置
   说明：
   1. 默认只让聊天界面渲染最新 100 条消息，点击“加载更多消息”后每次增加 100 条。
   2. 该值仅作为当前页面运行时查看状态，不写入 IndexedDB，也不使用 localStorage/sessionStorage。
   3. state.currentMessages 始终保留完整聊天记录，AI 历史上下文不受本区域影响。
   ======================================================================== */
export const CHAT_MESSAGE_INITIAL_VISIBLE_COUNT = 100;
export const CHAT_MESSAGE_LOAD_MORE_STEP = 100;

export function normalizeChatConsoleLogs(logs) {
  return Array.isArray(logs)
    ? logs.slice(-500).map(item => ({
        id: String(item?.id || `log_${Date.now()}_${Math.random().toString(16).slice(2)}`),
        ts: Number(item?.ts || Date.now()) || Date.now(),
        time: String(item?.time || new Date(Number(item?.ts || Date.now())).toLocaleTimeString('zh-CN', { hour12: false })),
        level: String(item?.level || 'info').toLowerCase(),
        text: String(item?.text || '')
      }))
    : [];
}

export async function persistCurrentChatConsoleLogs(state, db) {
  if (!state?.currentChatId) return;
  await dbPut(
    db,
    DATA_KEY_CHAT_CONSOLE(state.activeMaskId, state.currentChatId),
    normalizeChatConsoleLogs(state.chatConsoleLogs)
  );
}

export async function persistCurrentChatConsoleEnabled(state, db) {
  if (!state?.currentChatId) return;
  await dbPut(
    db,
    DATA_KEY_CHAT_CONSOLE_ENABLED(state.activeMaskId, state.currentChatId),
    Boolean(state.chatConsoleEnabled)
  );
}

export async function addChatConsoleLog(container, state, db, level, text) {
  if (!state?.currentChatId) return;
  const ts = Date.now();
  const entry = {
    id: `log_${ts}_${Math.random().toString(16).slice(2)}`,
    ts,
    time: new Date(ts).toLocaleTimeString('zh-CN', { hour12: false }),
    level: String(level || 'info').toLowerCase(),
    text: String(text || '').trim()
  };
  if (!entry.text) return;
  state.chatConsoleLogs = [...state.chatConsoleLogs, entry].slice(-500);
  await persistCurrentChatConsoleLogs(state, db);
  syncChatConsoleDock(container, state);
}

/* ==========================================================================
   [区域标注·已完成·聊天输入框一至三行自适应]
   说明：
   1. 仅同步闲谈消息页底部 data-role="msg-input" 的 textarea 高度。
   2. 初始一行，输入内容增多时最高三行；超过三行后 textarea 内部滚动。
   3. 不涉及任何持久化存储，不使用 localStorage/sessionStorage，不改变图标按钮尺寸。
   ========================================================================== */
export function syncMessageInputAutoHeight(input) {
  if (!input?.matches?.('[data-role="msg-input"]')) return;
  input.style.height = 'auto';
  const maxHeight = Number.parseFloat(window.getComputedStyle(input).maxHeight) || 76;
  input.style.height = `${Math.min(input.scrollHeight, maxHeight)}px`;
}

/* ==========================================================================
   [区域标注·已完成·档案联系人解绑/删除后闲谈级联清理]
   说明：
   1. 当档案应用取消当前面具绑定角色，或删除已绑定角色后，闲谈会同步清理该联系人。
   2. 清理范围仅限当前面具下的通讯录、聊天列表、隐藏列表、朋友圈、收藏来源、当前聊天消息与聊天设置。
   3. 持久化统一只写 DB.js / IndexedDB，不使用 localStorage/sessionStorage，不写双份兜底存储。
   4. 不使用长文本字段过滤逻辑；只按联系人/角色 ID 与旧数据名称做精确级联清理。
   ========================================================================== */
export async function syncArchiveBoundContactCleanup(container, state, db, archiveData, callbacks = {}) {
  const safeArchive = archiveData && typeof archiveData === 'object' ? archiveData : {};
  const masks = Array.isArray(safeArchive.masks) ? safeArchive.masks : [];
  const activeMask = masks.find(mask => String(mask?.id || '') === String(state.activeMaskId || '')) || null;
  const boundRoleIds = new Set(Array.isArray(activeMask?.roleBindingIds) ? activeMask.roleBindingIds.map(String) : []);
  const contacts = normalizeContacts(state.contacts);
  const sessions = Array.isArray(state.sessions) ? state.sessions : [];
  const hiddenChatIds = Array.isArray(state.hiddenChatIds) ? state.hiddenChatIds.map(String) : [];
  const moments = Array.isArray(state.moments) ? state.moments : [];
  const favoriteData = normalizeFavoriteData(state.favoriteData);

  const removedContactIds = new Set();
  const removedContactNames = new Set();

  contacts.forEach(contact => {
    const contactId = String(contact?.id || '').trim();
    const roleId = String(contact?.roleId || contactId).trim();
    if (!roleId || !boundRoleIds.has(roleId)) {
      if (contactId) removedContactIds.add(contactId);
      if (roleId) removedContactIds.add(roleId);
      const name = String(contact?.name || '').trim();
      if (name) removedContactNames.add(name);
    }
  });

  sessions.forEach(session => {
    const sessionId = String(session?.id || '').trim();
    const roleId = String(session?.roleId || sessionId).trim();
    const type = String(session?.type || 'private');
    if (type !== 'group' && roleId && !boundRoleIds.has(roleId)) {
      if (sessionId) removedContactIds.add(sessionId);
      if (roleId) removedContactIds.add(roleId);
      const name = String(session?.name || '').trim();
      if (name) removedContactNames.add(name);
    }
  });

  if (!removedContactIds.size) {
    state.contacts = contacts;
    state.sessions = sessions;
    state.hiddenChatIds = hiddenChatIds;
    state.moments = moments;
    state.favoriteData = favoriteData;
    return false;
  }

  const isRemovedId = value => removedContactIds.has(String(value || '').trim());
  const isRemovedName = value => {
    const name = String(value || '').trim();
    return !!name && removedContactNames.has(name);
  };

  const nextContacts = contacts.filter(contact => {
    const contactId = String(contact?.id || '').trim();
    const roleId = String(contact?.roleId || contactId).trim();
    return !isRemovedId(contactId) && !isRemovedId(roleId);
  });

  const nextSessions = sessions.filter(session => {
    const sessionId = String(session?.id || '').trim();
    const roleId = String(session?.roleId || sessionId).trim();
    return !isRemovedId(sessionId) && !isRemovedId(roleId);
  });

  const nextHiddenChatIds = hiddenChatIds.filter(id => !isRemovedId(id));

  const nextMoments = moments
    .filter(moment => {
      const authorIds = [
        moment?.authorId,
        moment?.authorRoleId,
        moment?.roleId,
        moment?.contactId,
        moment?.userId
      ];
      return !authorIds.some(isRemovedId) && !isRemovedName(moment?.authorName);
    })
    .map(moment => ({
      ...moment,
      likes: Array.isArray(moment?.likes)
        ? moment.likes.filter(like => {
            if (typeof like === 'string') return !isRemovedId(like) && !isRemovedName(like);
            return ![like?.id, like?.roleId, like?.contactId, like?.userId].some(isRemovedId) && !isRemovedName(like?.name || like?.authorName);
          })
        : moment?.likes,
      comments: Array.isArray(moment?.comments)
        ? moment.comments.filter(comment => (
            ![comment?.authorId, comment?.authorRoleId, comment?.roleId, comment?.contactId, comment?.userId].some(isRemovedId)
            && !isRemovedName(comment?.authorName)
          ))
        : moment?.comments
    }));

  const nextFavoriteData = normalizeFavoriteData({
    ...favoriteData,
    items: favoriteData.items.filter(item => !isRemovedId(item?.sourceChatId))
  });

  const removedIds = Array.from(removedContactIds);
  state.contacts = nextContacts;
  state.sessions = nextSessions;
  state.hiddenChatIds = nextHiddenChatIds;
  state.moments = nextMoments;
  state.favoriteData = nextFavoriteData;
  if (isRemovedId(state.currentChatId)) {
    callbacks?.closeChatMessage?.(container, state);
  }

  await Promise.all([
    dbPut(db, DATA_KEY_CONTACTS(state.activeMaskId), state.contacts),
    dbPut(db, DATA_KEY_SESSIONS(state.activeMaskId), state.sessions),
    dbPut(db, DATA_KEY_HIDDEN_CHAT_IDS(state.activeMaskId), state.hiddenChatIds),
    dbPut(db, DATA_KEY_MOMENTS(state.activeMaskId), state.moments),
    dbPut(db, DATA_KEY_FAVORITES(state.activeMaskId), state.favoriteData),
    ...removedIds.map(id => dbPut(db, DATA_KEY_MESSAGES_PREFIX(state.activeMaskId) + id, [])),
    ...removedIds.map(id => dbPut(db, DATA_KEY_CHAT_PROMPT_SETTINGS(state.activeMaskId, id), null))
  ]);

  return true;
}


/* ==========================================================================
   [区域标注·已完成·index.js入口拆分] 创建闲谈运行时状态
   说明：
   1. 原 index.js 内的大型 state 对象已迁移到本函数，入口文件只负责传入初始数据并接线。
   2. 本函数只组装运行时状态；持久化仍统一由 DB.js / IndexedDB 调度。
   3. 禁止 localStorage/sessionStorage，不写双份存储兜底。
   ========================================================================== */
export function createInitialChatState({
  db,
  currentActiveMaskId,
  archiveMasks,
  archiveCharacters,
  archiveSupportingRoles,
  archiveRelations,
  sessions,
  hiddenChatIds,
  contacts,
  contactGroups,
  moments,
  stickerData,
  walletData,
  favoriteData
}) {
  /* [区域标注] 应用状态对象 */
  return {
    /* [已完成·HTML卡片收藏] 缓存 db 引用，供 handleDoubleClick 等非闭包函数使用 */
    _db: db,
    activePanel: 'chatList',        // 当前激活的板块
    chatSubTab: 'all',              // 聊天列表子TAB: all / private / group
    chatSearchKeyword: '',          // 聊天列表搜索词
    sectionCollapsed: {},           // 折叠状态 {private: false, group: false}
    sessions: sessions || [],       // 聊天会话列表
    /* === [本次修改] 聊天列表长按删除联系人：隐藏列表单独持久化，避免删除通讯录/消息/聊天设置 === */
    hiddenChatIds: Array.isArray(hiddenChatIds) ? hiddenChatIds.map(String) : [],
    contacts: normalizeContacts(contacts), // 通讯录好友列表
    /* [区域标注·本次需求1] 通讯录自定义分组；All 为固定默认分组，不写入数组 */
    contactGroups: normalizeContactGroups(contactGroups),
    activeContactGroupId: 'all',
    moments: moments || [],         // 朋友圈动态列表
    /* ========================================================================
       [区域标注·已完成·本次朋友圈独立发帖页] 朋友圈发帖页运行时状态
       说明：
       1. 仅服务朋友圈独立发帖页，不影响聊天/通讯录/用户主页其它区域。
       2. 草稿、可见范围、多图列表都只保存在当前运行时；正式发送后才统一写入 DB.js / IndexedDB。
       3. 严禁使用 localStorage/sessionStorage，不做双份存储兜底。
       ======================================================================== */
    momentsComposeOpen: false,
    momentsComposeDraft: {
      text: '',
      images: [],
      location: '',
      shareChatId: '',
      visibilityMode: 'public',
      visibleContactIds: []
    },
    /* ========================================================================
       [区域标注·已完成·本次朋友圈点赞评论互动模块化接线] 朋友圈互动运行时 UI 状态
       说明：
       1. index.js 仅挂载评论展开、回复目标等运行时状态。
       2. 点赞、评论展开、发表评论与回复评论的主要逻辑已移至 moments.js。
       3. 数据本体统一通过接线回调写入 DATA_KEY_MOMENTS(activeMaskId) 的 IndexedDB 记录。
       4. 不使用 localStorage/sessionStorage，不做双份存储兜底。
       ======================================================================== */
    ...createMomentsInteractionState(),
    profile: {},                    // 用户资料（由面具数据生成）
    currentChatId: null,            // 当前打开的聊天会话 ID（null 表示未打开）
    currentMessages: [],            // 当前聊天消息列表
    /* ========================================================================
       [区域标注·已完成·本次聊天记录分段加载] 当前聊天界面可见消息数量
       说明：只影响当前页面渲染多少条历史消息；不裁剪 currentMessages，不影响 AI 上下文。
       ======================================================================== */
    chatMessageVisibleCount: CHAT_MESSAGE_INITIAL_VISIBLE_COUNT,
    destroyed: false,               // 是否已销毁
    /* [修改5] 当前激活面具ID */
    activeMaskId: currentActiveMaskId,
    /* [修改5] 档案面具列表缓存 */
    archiveMasks: archiveMasks,
    /* [区域标注·本次需求2] 档案角色列表缓存，用于通讯录搜索 */
    archiveCharacters: archiveCharacters,
    /* [区域标注·本次修改4] 档案配角与关系网络缓存，用于提示词用户面具身份关系网络 */
    archiveSupportingRoles: archiveSupportingRoles,
    archiveRelations: archiveRelations,
    /* [区域标注·已修改] 聊天提示词设置：打开具体聊天对象时按“当前面具 + 当前联系人”从 IndexedDB 读取 */
    chatPromptSettings: normalizeChatPromptSettings(null),
    /* [区域标注·本次需求3] 表情包分组与条目：全局共享资产，只从 IndexedDB 读取 */
    stickerData: normalizeStickerData(stickerData),
    /* ==========================================================================
       [区域标注·已完成·本次钱包需求] 钱包页运行时状态
       说明：
       1. 钱包余额基础值、显示币种、汇率设置统一只从 DB.js / IndexedDB 读取。
       2. walletDraftCurrency 仅用于弹窗中的临时选择态，不做双份存储。
       ========================================================================== */
    walletData: normalizeWalletData(walletData),
    walletDraftCurrency: '',
    /* [区域标注·已完成·收藏运行时状态] 收藏页数据与选择状态，持久化只走 DB.js / IndexedDB */
    favoriteData: normalizeFavoriteData(favoriteData),
    favoriteMultiSelectMode: false,
    selectedFavoriteIds: [],
    /* [区域标注·本次需求3] 聊天消息页表情包面板运行时状态 */
    stickerPanelOpen: false,
    stickerPanelGroupId: normalizeStickerData(stickerData).activeGroupId || 'all',
    coffeeDockOpen: false,
    /* ======================================================================
       [区域标注·已完成·旁白模式防自动退出修复] 旁白模式运行时状态字段
       说明：
       1. asideModeActive — 当前会话是否处于旁白模式（打开会话时会从 IndexedDB 恢复）。
       2. asideSettings — 旁白人称/风格/字数/显示模式等设置对象。
       3. asideHistory — 旁白模式期间每轮旁白摘要数组，随旁白状态一起写入 IndexedDB。
       4. 只有点击顶栏爱心并确认退出，才会将 active:false 持久化。
       ====================================================================== */
    asideModeActive: false,
    asideSettings: getDefaultAsideSettings(),
    asideHistory: [],
    /* [区域标注·本次需求] 聊天 API 调用状态 */
    isAiSending: false,
    /* ==========================================================================
       [区域标注·本次需求5] 消息气泡选择状态
       说明：仅保存在运行时；消息持久化仍只写 DB.js / IndexedDB。
       ========================================================================== */
    selectedMessageId: '',
    /* ========================================================================
       [区域标注·已完成·本次旁白功能栏编辑指向修复] 当前选中的旁白段 id
       说明：
       1. 用于区分当前打开工具栏的是普通消息气泡还是旁白气泡。
       2. 仅运行时保存，不写入 DB.js / IndexedDB。
       ======================================================================== */
    selectedAsideSegmentId: '',
    multiSelectMode: false,
    selectedMessageIds: [],
    /* ===== 闲谈：删除消息二次确认 START ===== */
    deleteConfirmMessageId: '',
    /* ===== 闲谈：删除消息二次确认 END ===== */
    /* ========================================================================
       [区域标注·已完成·消息回溯] 气泡功能栏回溯二次确认状态
       说明：
       1. 仅运行时保存当前等待“确认回溯”的消息 ID。
       2. 确认后删除该消息之后的所有消息（含系统小字），并统一写入 DB.js / IndexedDB。
       3. 不使用 localStorage/sessionStorage，不做双份存储兜底。
       ======================================================================== */
    rewindConfirmMessageId: '',
    /* ========================================================================
       [区域标注·已完成·引用回复] 当前输入栏待引用对象
       说明：仅运行时保存；发送消息时 quote 字段随消息对象写入 DB.js / IndexedDB。
       ======================================================================== */
    pendingQuote: null,
    /* ========================================================================
       [区域标注·已完成·聊天记录搜索] 消息页搜索运行时状态
       说明：
       1. 仅在当前聊天消息页运行时保存搜索框开合与关键词，不做持久化存储。
       2. 搜索范围包含用户与 AI 消息气泡；点击结果后回滚到对应消息位置。
       3. 不使用 localStorage/sessionStorage，不使用原生浏览器弹窗或原生选择器。
       ======================================================================== */
    chatMessageSearchOpen: false,
    chatMessageSearchKeyword: '',
    /* [修改4] 用于子页面导航的堆栈标记 */
    subPageView: null,              // null | 'wallet' | 'sticker' | 'chatDaysDetail'
    /* [区域标注·本次需求2] 表情包独立页多选删除运行时状态 */
    stickerMultiSelectMode: false,
    selectedStickerIds: [],
    /* [区域标注·本次需求3] 表情包本地上传临时预览，不持久化；确认后才写入 IndexedDB */
    pendingStickerLocalFile: null,
    /* [区域标注·本次需求3] 表情包独立页单击放大预览延迟计时器；仅运行时使用，不持久化 */
    stickerPreviewClickTimer: 0,

    /* ========================================================================
       [区域标注·已完成·本次控制台持久显示与后台记录修复] 聊天页控制台日志状态
       说明：
       1. chatConsoleEnabled 仅表示控制台抽屉是否显示，按当前会话写入 IndexedDB。
       2. chatConsoleLogs 始终后台记录当前会话日志，最多 500 条。
       3. 禁止 localStorage/sessionStorage，也不做双份存储兜底。
       ======================================================================== */
    chatConsoleEnabled: false,
    chatConsoleExpanded: false,
    chatConsoleWarnErrorOnly: false,
    chatConsoleLogs: [],
    /* [区域标注·已完成·本次后台重进Token恢复] 最新一轮 AI token 用量；按当前面具 + 会话写入 IndexedDB，重进会话可恢复标题显示。 */
    chatConsoleTokenUsage: null,
    /* ===== [区域标注·已完成·语言翻译] 翻译设置状态 ===== */
    translationSettings: null
  };
}

/* ==========================================================================
   [区域标注·修改5] 保存当前面具的聊天数据到 IndexedDB
   说明：在切换面具前调用，确保旧面具的数据不会丢失
   ========================================================================== */
export async function saveMaskData(state, db, maskId) {
  await Promise.all([
    dbPut(db, DATA_KEY_SESSIONS(maskId), state.sessions),
    /* === [本次修改] 聊天列表长按删除联系人：隐藏状态保存到 IndexedDB === */
    dbPut(db, DATA_KEY_HIDDEN_CHAT_IDS(maskId), state.hiddenChatIds),
    dbPut(db, DATA_KEY_CONTACTS(maskId), state.contacts),
    /* [区域标注·本次需求1] 持久化通讯录自定义分组到 IndexedDB（禁止浏览器同步键值存储） */
    dbPut(db, DATA_KEY_CONTACT_GROUPS(maskId), state.contactGroups),
    dbPut(db, DATA_KEY_MOMENTS(maskId), state.moments),
    /* [区域标注·已完成·本次钱包需求] 切换面具前保存当前面具钱包数据 */
    dbPut(db, DATA_KEY_WALLET(maskId), normalizeWalletData(state.walletData)),
    /* [区域标注·已完成·收藏持久化] 切换面具前保存当前面具收藏数据 */
    dbPut(db, DATA_KEY_FAVORITES(maskId), normalizeFavoriteData(state.favoriteData))
  ]);
}

/* ==========================================================================
   [区域标注·修改5] 加载指定面具的聊天数据
   说明：在切换面具后调用，从 IndexedDB 恢复该面具的数据
   ========================================================================== */
export async function loadMaskData(state, db, maskId) {
  const [sessions, hiddenChatIds, contacts, contactGroups, moments, walletData, favoriteData] = await Promise.all([
    dbGet(db, DATA_KEY_SESSIONS(maskId)),
    dbGet(db, DATA_KEY_HIDDEN_CHAT_IDS(maskId)),
    dbGet(db, DATA_KEY_CONTACTS(maskId)),
    dbGet(db, DATA_KEY_CONTACT_GROUPS(maskId)),
    dbGet(db, DATA_KEY_MOMENTS(maskId)),
    dbGet(db, DATA_KEY_WALLET(maskId)),
    dbGet(db, DATA_KEY_FAVORITES(maskId))
  ]);
  state.sessions = sessions || [];
  /* === [本次修改] 聊天列表长按删除联系人：切换面具时恢复对应隐藏状态 === */
  state.hiddenChatIds = Array.isArray(hiddenChatIds) ? hiddenChatIds.map(String) : [];
  state.contacts = normalizeContacts(contacts);
  /* [区域标注·本次需求1] 切换面具时同步加载该面具的通讯录分组 */
  state.contactGroups = normalizeContactGroups(contactGroups);
  state.activeContactGroupId = 'all';
  state.moments = moments || [];
  state.momentsComposeOpen = false;
  state.momentsComposeDraft = createMomentsComposeDraft();
  resetMomentsInteractionState(state);
  state.currentChatId = null;
  state.currentMessages = [];
  state.chatMessageVisibleCount = CHAT_MESSAGE_INITIAL_VISIBLE_COUNT;
  resetMessageSelectionState(state);
  /* [区域标注·已完成·本次钱包需求] 切换面具时同步加载对应钱包数据 */
  state.walletData = normalizeWalletData(walletData);
  state.walletDraftCurrency = '';
  state.favoriteData = normalizeFavoriteData(favoriteData);
  state.favoriteMultiSelectMode = false;
  state.selectedFavoriteIds = [];
  /* [区域标注·已修改] 聊天提示词设置已改为按“当前面具 + 当前聊天对象”独立读取；切换面具时不再加载面具级通用设置 */
  state.chatPromptSettings = normalizeChatPromptSettings(null);
  state.pendingStickerLocalFile = null;
  state.stickerPanelOpen = false;
  state.stickerPanelGroupId = 'all';
  state.coffeeDockOpen = false;
  state.pendingQuote = null;
  state.stickerMultiSelectMode = false;
  state.selectedStickerIds = [];
}

/* ==========================================================================
   [区域标注·修改4·修改5] 执行面具切换
   说明：保存旧面具数据 → 更新面具ID → 加载新面具数据 → 重建profile → 重渲染
         同时通知档案应用更新 activeMaskId
   ========================================================================== */
export async function performMaskSwitch(container, state, db, eventBus, newMaskId) {
  const oldMaskId = state.activeMaskId;

  /* [修改5] 保存旧面具数据 */
  await saveMaskData(state, db, oldMaskId);

  /* 更新面具ID */
  state.activeMaskId = newMaskId;

  /* [区域标注·已完成·本次面具持久化修复] 将新激活面具写回档案应用的 IndexedDB 记录，避免下次进入闲谈时回到默认面具 */
  try {
    const latestArchive = await dbGetArchiveData(db, ARCHIVE_DB_RECORD_ID);
    const nextArchiveData = {
      ...(latestArchive && typeof latestArchive === 'object' ? latestArchive : {}),
      activeMaskId: newMaskId
    };
    /* ======================================================================
       [修改标注·已完成·本次需求1·档案主记录写回修复]
       说明：
       1. 切换闲谈用户面具时需要同步档案应用的 activeMaskId。
       2. archive::archive-data 是档案应用主记录，必须保持档案应用使用的 value 结构。
       3. 禁止用闲谈 dbPut() 写该记录；dbPut() 会写成 data 字段并覆盖原 value，
          导致档案应用重进后读不到 masks/characters，页面回到初始状态。
       4. 本区只使用 DB.js / IndexedDB，不使用 localStorage/sessionStorage，也不写双份存储。
       5. 若 IndexedDB 中已存在旧错误 data 结构，上方 dbGetArchiveData 已兼容读出，
          此处会统一修正回 value 结构。
       ====================================================================== */
    await db?.put?.('appsData', {
      id: ARCHIVE_DB_RECORD_ID,
      appId: 'archive',
      key: 'archive-data',
      value: nextArchiveData,
      updatedAt: Date.now()
    });
  } catch (_) {
    // 保持界面流程继续执行，避免面具切换被持久化失败阻断
  }

  /* [修改5] 加载新面具数据 */
  await loadMaskData(state, db, newMaskId);

  /* [修改4·修改6] 重建 profile */
  buildProfileFromMask(state);

  /* 通知档案应用同步 activeMaskId */
  eventBus.emit('archive:active-mask-changed', { maskId: newMaskId });

  /* 重新渲染全部板块 */
  container.innerHTML = buildAppShell(state);
}
