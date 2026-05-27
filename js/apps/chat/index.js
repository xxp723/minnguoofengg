// @ts-nocheck
/**
 * 文件名: js/apps/chat/index.js
 * 用途: 闲谈应用入口接线模块。
 *       负责加载 CSS、初始化 IndexedDB 数据、创建运行时状态、
 *       绑定/解绑事件与 AppManager 挂载生命周期。
 *       主壳渲染、状态管理、导航和事件处理已拆分到：
 *       chat-shell.js / chat-state.js / chat-navigation.js / chat-event-handlers.js。
 *       使用 DB.js（IndexedDB）进行持久化存储，禁止浏览器同步键值存储。
 * 架构层: 应用层（由 AppManager 动态加载）
 */

/* ==========================================================================
   [区域标注·已完成·index.js入口拆分] 入口接线导入
   说明：
   1. index.js 只保留挂载生命周期、CSS 预加载、初始数据读取和事件绑定。
   2. 具体业务已拆分到同目录子模块，后续按职责修改对应文件。
   3. 本入口不使用 localStorage/sessionStorage，不写双份存储兜底。
   ========================================================================== */
import {
  APP_ID,
  ARCHIVE_DB_RECORD_ID,
  DATA_KEY_SESSIONS,
  DATA_KEY_HIDDEN_CHAT_IDS,
  DATA_KEY_CONTACTS,
  DATA_KEY_CONTACT_GROUPS,
  DATA_KEY_MOMENTS,
  DATA_KEY_WALLET,
  DATA_KEY_FAVORITES,
  DATA_KEY_MESSAGES_PREFIX,
  loadCSS,
  removeCSS,
  dbGet,
  dbPut,
  dbGetArchiveData,
  loadStickerDataFromDb
} from './chat-utils.js';
import { createChatListLongPressHandlers } from './chat-list.js';
import { createContactGroupLongPressHandlers } from './contacts.js';
import {
  buildProfileFromMask,
  createStickerGroupLongPressHandlers,
  createFavoriteGroupLongPressHandlers,
  createFavoriteCardLongPressHandlers
} from './profile.js';
import { buildAppShell } from './chat-shell.js';
import {
  createInitialChatState,
  saveMaskData,
  loadMaskData,
  syncArchiveBoundContactCleanup
} from './chat-state.js';
import {
  handleChatReturnClickCapture,
  closeChatMessage
} from './chat-navigation.js';
import {
  handleHtmlCardInteraction,
  handleClick,
  handleInput,
  handleKeydown,
  handleDoubleClick,
  handleChange
} from './chat-event-handlers.js';
import { initAutonomousMomentPublisher } from './chat-autonomous-activity-settings.js';

/* ==========================================================================
   [区域标注] mount — 应用挂载入口
   说明：由 AppManager 调用，接收容器元素和上下文
   ========================================================================== */
export async function mount(container, context) {
  const { appMeta, eventBus, db, windowManager, settings } = context;

  /* ==========================================================================
     [区域标注·修改5] 并行预加载 CSS + 档案数据
     说明：先加载 CSS 和档案数据，确定当前激活面具后再加载对应面具的聊天数据
     ========================================================================== */
  await Promise.all([
    loadCSS('./js/apps/chat/chat.css', 'chat-app-css'),
    /* ======================================================================
       [区域标注·已完成·本次朋友圈独立样式预加载] 朋友圈页面专用 CSS
       说明：
       1. 朋友圈 Editorial Minimal UI 样式已拆分到 moments.css。
       2. 挂载阶段与闲谈主样式并行加载，避免首次切到朋友圈时出现无样式闪屏。
       3. 仅服务朋友圈页面，不改变其它闲谈板块样式加载逻辑。
       ====================================================================== */
    loadCSS('./js/apps/chat/moments.css', 'chat-moments-css'),
    /* [区域标注·本次需求5] 等待聊天消息页 CSS 加载完成，避免首次进入消息页时未样式化 */
    loadCSS('./js/apps/chat/chat-message.css', 'chat-msg-css'),
    /* ======================================================================
       [区域标注·本次拆分·聊天设置页独立样式接线] 预加载聊天设置页独立 CSS
       说明：
       1. 聊天设置页与当前会话头像相关弹窗样式已拆分到 chat-message-settings.css。
       2. 挂载阶段并行加载，避免首次进入聊天设置页或头像来源弹窗时出现未样式化闪屏。
       3. 仅接入本次指定拆分区域，不改动任何其它持久化逻辑。
       ====================================================================== */
    loadCSS('./js/apps/chat/chat-message-settings.css', 'chat-msg-settings-css'),
    /* ======================================================================
       [区域标注·已完成·HTML卡片独立样式预加载] 聊天 HTML 卡片专用 CSS
       说明：
       1. 单独拆分 chat-html-card.css，方便后续只改 HTML 卡片样式。
       2. 挂载阶段与聊天主样式并行预加载，减少首次出现卡片时的未样式化闪屏。
       3. 仅服务本次 HTML 卡片功能，不改其它聊天功能样式加载逻辑。
       ====================================================================== */
    loadCSS('./js/apps/chat/chat-html-card.css', 'chat-html-card-css'),
    /* ======================================================================
       [区域标注·已完成·心声面板] 加载心声面板 CSS
       说明：与聊天主样式并行预加载，避免首次打开心声面板时的未样式化闪屏。
       ====================================================================== */
    loadCSS('./js/apps/chat/chat-inner-voice.css', 'chat-inner-voice-css'),
    /* ======================================================================
       [区域标注·已完成·礼物板块独立样式预加载]
       说明：礼物弹窗与礼物卡片样式拆分到 chat-gift.css，挂载时预加载以避免首次打开闪屏。
       ====================================================================== */
    loadCSS('./js/apps/chat/chat-gift.css', 'chat-gift-css'),
    /* ======================================================================
       [区域标注·已完成·文字图独立样式预加载]
       说明：文字图弹窗、拍立得气泡与无关闭按钮悬浮预览样式拆分到 chat-text-image.css，挂载时预加载以避免首次打开闪屏。
       ====================================================================== */
    loadCSS('./js/apps/chat/chat-text-image.css', 'chat-text-image-css'),
    /* ======================================================================
       [区域标注·已完成·语音板块独立样式预加载]
       说明：语音弹窗与语音气泡样式拆分到 chat-voice.css，挂载时预加载以避免首次打开闪屏。
       ====================================================================== */
    loadCSS('./js/apps/chat/chat-voice.css', 'chat-voice-css'),
    /* ======================================================================
       [区域标注·已完成·旁白模式独立样式预加载]
       说明：旁白弹窗、旁白气泡、顶栏退出按钮样式拆分到 chat-aside.css，挂载时预加载以避免首次打开闪屏。
       ====================================================================== */
    loadCSS('./js/apps/chat/chat-aside.css', 'chat-aside-css'),
    /* ======================================================================
       [区域标注·已完成·语言翻译CSS] 预加载语言翻译折叠栏 & 翻译气泡样式
       ====================================================================== */
    loadCSS('./js/apps/chat/chat-translation.css', 'chat-translation-css'),
    /* ======================================================================
       [区域标注·已完成·聊天记录导入导出CSS] 预加载设置页导入导出板块样式
       说明：样式拆分到 chat-export-import.css，挂载时预加载以避免首次进入聊天设置页闪屏。
       ====================================================================== */
    loadCSS('./js/apps/chat/chat-export-import.css', 'chat-export-import-css'),
    /* ======================================================================
       [区域标注·外卖板块独立样式预加载]
       说明：外卖弹窗与外卖气泡样式拆分到 chat-takeaway.css，挂载时预加载以避免首次打开闪屏。
       ====================================================================== */
    loadCSS('./js/apps/chat/chat-takeaway.css', 'chat-takeaway-css')
  ]);

  const archiveRecord = await dbGetArchiveData(db, ARCHIVE_DB_RECORD_ID);

  /* [修改5·修改6] 解析档案数据，获取当前激活面具 */
  const archiveData = (archiveRecord && typeof archiveRecord === 'object') ? archiveRecord : {};
  const archiveMasks = Array.isArray(archiveData.masks) ? archiveData.masks : [];
  /* [区域标注·本次需求2] 缓存角色档案，用于通过绑定角色联系方式搜索添加通讯录 */
  const archiveCharacters = Array.isArray(archiveData.characters) ? archiveData.characters : [];
  /* [区域标注·本次修改4] 缓存档案关系网络，供 prompt.js 注入用户面具身份绑定关系 */
  const archiveSupportingRoles = Array.isArray(archiveData.supportingRoles) ? archiveData.supportingRoles : [];
  const archiveRelations = Array.isArray(archiveData.relations) ? archiveData.relations : [];
  const currentActiveMaskId = archiveData.activeMaskId || '';

  /* [修改5] 按当前面具ID加载对应数据 */
  const [sessions, hiddenChatIds, contacts, contactGroups, moments, stickerData, walletData, favoriteData] = await Promise.all([
    dbGet(db, DATA_KEY_SESSIONS(currentActiveMaskId)),
    dbGet(db, DATA_KEY_HIDDEN_CHAT_IDS(currentActiveMaskId)),
    dbGet(db, DATA_KEY_CONTACTS(currentActiveMaskId)),
    dbGet(db, DATA_KEY_CONTACT_GROUPS(currentActiveMaskId)),
    dbGet(db, DATA_KEY_MOMENTS(currentActiveMaskId)),
    loadStickerDataFromDb(db),
    dbGet(db, DATA_KEY_WALLET(currentActiveMaskId)),
    dbGet(db, DATA_KEY_FAVORITES(currentActiveMaskId))
  ]);

  /* ==========================================================================
     [区域标注·已完成·index.js入口拆分] 创建运行时状态
     说明：
     1. 大型 state 对象已迁移到 chat-state.js。
     2. index.js 只负责把初始 IndexedDB 数据交给 createInitialChatState 接线。
     3. 禁止 localStorage/sessionStorage，不写双份存储兜底。
     ========================================================================== */
  const state = createInitialChatState({
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
  });
  await syncArchiveBoundContactCleanup(container, state, db, archiveData, { closeChatMessage });

  /* [修改4·修改6] 根据当前面具构建 profile 数据 */
  buildProfileFromMask(state);

  /* [区域标注] 渲染应用骨架 HTML */
  container.innerHTML = buildAppShell(state);

  /* [区域标注] 绑定全局事件代理 */
  /* ========================================================================
     [区域标注·已完成·本次返回按钮点击修复] 消息页/设置页返回按钮捕获优先处理
     说明：
     1. 在普通 click 事件代理之前，用捕获阶段优先处理 msg-back 与 msg-settings-back。
     2. 避免返回按钮点击被消息气泡工具栏关闭逻辑、长按指针逻辑或外层桌面手势层抢先消费，导致表现为点击无效。
     3. 本区域只处理这两个返回按钮的运行时导航，不新增/修改任何持久化存储逻辑；仍严格使用 DB.js / IndexedDB。
     ======================================================================== */
  const navigationClickCaptureHandler = (e) => handleChatReturnClickCapture(e, state, container);
  /* ========================================================================
     [区域标注·已完成·HTML卡片交互系统提示持久化] iframe 交互事件监听
     说明：
     1. chat-message.js 会把 HTML 卡片 iframe 内部 postMessage 转成 miniphone-html-card-interaction 事件。
     2. 这里只负责把用户在卡片里的点击/选择生成聊天中间系统提示，并写入 DB.js / IndexedDB。
     3. 不使用 localStorage/sessionStorage，不保留双份兜底存储，不使用原生浏览器弹窗。
     ======================================================================== */
  const htmlCardInteractionHandler = (e) => handleHtmlCardInteraction(e, state, container, db);
  const clickHandler = (e) => handleClick(e, state, container, db, eventBus, windowManager, appMeta, settings);
  const inputHandler = (e) => handleInput(e, state, container, db);
  const keydownHandler = (e) => handleKeydown(e, state, container, db, settings);
  /* [区域标注·已完成·HTML卡片收藏/表情包多选] 双击事件：HTML 卡片收藏写入 DB.js / IndexedDB */
  const dblClickHandler = (e) => handleDoubleClick(e, state, container, db);
  /* [区域标注·本次需求3] 表情包本地上传文件选择事件 */
  const changeHandler = (e) => handleChange(e, state, container, db);
  /* [区域标注·本次需求1] 通讯录分组长按删除事件：使用自定义应用内弹窗，不使用原生 confirm */
  const contactGroupLongPressHandlers = createContactGroupLongPressHandlers(state, container);
  /* [区域标注·本次需求3] 表情包分组长按删除事件：使用自定义应用内弹窗，不使用原生 confirm */
  const stickerGroupLongPressHandlers = createStickerGroupLongPressHandlers(state, container);
  /* [区域标注·已完成·收藏分组长按删除] 应用内确认弹窗，不使用原生 confirm */
  const favoriteGroupLongPressHandlers = createFavoriteGroupLongPressHandlers(state, container);
  /* ==========================================================================
     [区域标注·已完成·收藏卡片长按进入多选] 长按收藏卡片进入多选模式
     说明：替代原双击触发方式，长按 650ms 进入多选并默认选中当前卡片。
     ========================================================================== */
  const favoriteCardLongPressHandlers = createFavoriteCardLongPressHandlers(state, container);
  /* === [本次修改] 聊天列表长按删除联系人：应用内确认弹窗，不使用原生 confirm === */
  const chatListLongPressHandlers = createChatListLongPressHandlers(state, container);
  container.addEventListener('click', navigationClickCaptureHandler, true);
  container.addEventListener('miniphone-html-card-interaction', htmlCardInteractionHandler);
  container.addEventListener('click', clickHandler);
  container.addEventListener('input', inputHandler);
  container.addEventListener('keydown', keydownHandler);
  container.addEventListener('dblclick', dblClickHandler);
  container.addEventListener('change', changeHandler);
  container.addEventListener('pointerdown', contactGroupLongPressHandlers.pointerdown);
  container.addEventListener('pointerup', contactGroupLongPressHandlers.pointerup);
  container.addEventListener('pointercancel', contactGroupLongPressHandlers.pointercancel);
  container.addEventListener('pointerleave', contactGroupLongPressHandlers.pointerleave);
  container.addEventListener('contextmenu', contactGroupLongPressHandlers.contextmenu);
  container.addEventListener('pointerdown', stickerGroupLongPressHandlers.pointerdown);
  container.addEventListener('pointerup', stickerGroupLongPressHandlers.pointerup);
  container.addEventListener('pointercancel', stickerGroupLongPressHandlers.pointercancel);
  container.addEventListener('pointerleave', stickerGroupLongPressHandlers.pointerleave);
  container.addEventListener('contextmenu', stickerGroupLongPressHandlers.contextmenu);
  container.addEventListener('pointerdown', favoriteGroupLongPressHandlers.pointerdown);
  container.addEventListener('pointerup', favoriteGroupLongPressHandlers.pointerup);
  container.addEventListener('pointercancel', favoriteGroupLongPressHandlers.pointercancel);
  container.addEventListener('pointerleave', favoriteGroupLongPressHandlers.pointerleave);
  container.addEventListener('contextmenu', favoriteGroupLongPressHandlers.contextmenu);
  container.addEventListener('pointerdown', favoriteCardLongPressHandlers.pointerdown);
  container.addEventListener('pointerup', favoriteCardLongPressHandlers.pointerup);
  container.addEventListener('pointercancel', favoriteCardLongPressHandlers.pointercancel);
  container.addEventListener('pointerleave', favoriteCardLongPressHandlers.pointerleave);
  container.addEventListener('contextmenu', favoriteCardLongPressHandlers.contextmenu);
  container.addEventListener('pointerdown', chatListLongPressHandlers.pointerdown);
  container.addEventListener('pointerup', chatListLongPressHandlers.pointerup);
  container.addEventListener('pointercancel', chatListLongPressHandlers.pointercancel);
  container.addEventListener('pointerleave', chatListLongPressHandlers.pointerleave);
  container.addEventListener('contextmenu', chatListLongPressHandlers.contextmenu);

  /* ==========================================================================
     [区域标注·修改5] 监听档案应用面具切换事件
     说明：当用户在档案应用中切换激活面具时，自动刷新闲谈四大板块
           切换前先保存当前面具的数据，切换后加载新面具的数据
     ========================================================================== */
  const onMaskChanged = async (payload) => {
    if (state.destroyed) return;
    const newMaskId = payload?.maskId || '';
    const oldMaskId = state.activeMaskId;

    /* 保存旧面具数据 */
    await saveMaskData(state, db, oldMaskId);

    /* 更新面具 */
    state.activeMaskId = newMaskId;

    /* 重新加载档案数据以获取最新面具列表 */
    const freshArchive = await dbGetArchiveData(db, ARCHIVE_DB_RECORD_ID);
    const freshData = (freshArchive && typeof freshArchive === 'object') ? freshArchive : {};
    state.archiveMasks = Array.isArray(freshData.masks) ? freshData.masks : [];
    /* [区域标注·本次需求2] 面具切换时同步角色档案缓存 */
    state.archiveCharacters = Array.isArray(freshData.characters) ? freshData.characters : [];
    /* [区域标注·本次修改4] 面具切换时同步档案关系网络缓存 */
    state.archiveSupportingRoles = Array.isArray(freshData.supportingRoles) ? freshData.supportingRoles : [];
    state.archiveRelations = Array.isArray(freshData.relations) ? freshData.relations : [];

    /* 加载新面具的数据 */
    await loadMaskData(state, db, newMaskId);

    await syncArchiveBoundContactCleanup(container, state, db, freshData, { closeChatMessage });

    /* 重建 profile */
    buildProfileFromMask(state);

    /* 重新渲染全部板块 */
    container.innerHTML = buildAppShell(state);
  };
  eventBus.on('archive:active-mask-changed', onMaskChanged);

  /* ========================================================================
     [区域标注·已完成·档案联系人解绑/删除后闲谈级联清理事件]
     说明：
     1. 档案应用保存绑定关系或删除角色后，会通知闲谈刷新档案缓存。
     2. 闲谈只清理当前面具下已经不再绑定的联系人及其相关显示数据。
     3. 全程仅使用 DB.js / IndexedDB，不使用浏览器同步键值存储。
     ======================================================================== */
  const onArchiveDataChanged = async (payload) => {
    if (state.destroyed) return;
    const freshData = (payload?.data && typeof payload.data === 'object')
      ? payload.data
      : ((await dbGetArchiveData(db, ARCHIVE_DB_RECORD_ID)) || {});
    const freshMasks = Array.isArray(freshData.masks) ? freshData.masks : [];
    state.archiveMasks = freshMasks;
    state.archiveCharacters = Array.isArray(freshData.characters) ? freshData.characters : [];
    state.archiveSupportingRoles = Array.isArray(freshData.supportingRoles) ? freshData.supportingRoles : [];
    state.archiveRelations = Array.isArray(freshData.relations) ? freshData.relations : [];

    const changed = await syncArchiveBoundContactCleanup(container, state, db, freshData, { closeChatMessage });
    if (!changed) return;

    buildProfileFromMask(state);
    container.innerHTML = buildAppShell(state);
  };
  eventBus.on('archive:data-changed', onArchiveDataChanged);

  /* ========================================================================
     [区域标注·本次修改·外卖配送完成事件接线]
     说明：
     1. 监听 document 上派发的 takeaway-delivery-complete 事件。
     2. 更新对应消息的外卖状态并写入 DB.js / IndexedDB。
     3. 局部更新气泡状态避免重排闪屏。
     ======================================================================== */
  const onTakeawayDeliveryComplete = async (e) => {
    if (state.destroyed) return;
    const { messageId, status } = e.detail || {};
    if (!messageId) return;

    let updated = false;
    state.currentMessages = (state.currentMessages || []).map(msg => {
      if (String(msg.id) === String(messageId) && String(msg.type) === 'takeaway') {
        updated = true;
        return { ...msg, takeawayStatus: status };
      }
      return msg;
    });

    if (!updated) return;

    if (state.currentChatId) {
      await dbPut(db, DATA_KEY_MESSAGES_PREFIX(state.activeMaskId) + state.currentChatId, state.currentMessages);
    }

    const row = container.querySelector(`.msg-bubble-row[data-message-id="${CSS.escape(messageId)}"]`);
    if (row) {
      const statusSpan = row.querySelector('.msg-takeaway-bubble__status');
      if (statusSpan) {
        if (status === 'completed') {
          statusSpan.textContent = '已送达';
          statusSpan.className = 'msg-takeaway-bubble__status msg-takeaway-bubble__status--completed';
        } else if (status === 'timeout') {
          statusSpan.textContent = '已超时';
          statusSpan.className = 'msg-takeaway-bubble__status msg-takeaway-bubble__status--timeout';
        }
      }
    }
  };
  document.addEventListener('takeaway-delivery-complete', onTakeawayDeliveryComplete);

  /* ========================================================================
     [区域标注·已完成·自主活动主动发朋友圈后台接线]
     说明：
     1. 仅接入“自主活动/主动发朋友圈”后台调度，具体提示词、副 API 调用与朋友圈 IndexedDB 写入均在 chat-autonomous-activity-settings.js。
     2. 开关关闭时调度不会注入提示词、不会调用 API 发布朋友圈。
     3. 本入口只负责生命周期创建与销毁；不使用 localStorage/sessionStorage，不写双份存储兜底。
     ======================================================================== */
  const autonomousMomentPublisher = initAutonomousMomentPublisher({
    state,
    container,
    db,
    settingsManager: settings
  });

  /* [区域标注] 返回实例（含 destroy 清理函数） */
  return {
    destroy() {
      state.destroyed = true;
      container.removeEventListener('click', navigationClickCaptureHandler, true);
      container.removeEventListener('miniphone-html-card-interaction', htmlCardInteractionHandler);
      container.removeEventListener('click', clickHandler);
      container.removeEventListener('input', inputHandler);
      container.removeEventListener('keydown', keydownHandler);
      container.removeEventListener('dblclick', dblClickHandler);
      container.removeEventListener('change', changeHandler);
      container.removeEventListener('pointerdown', contactGroupLongPressHandlers.pointerdown);
      container.removeEventListener('pointerup', contactGroupLongPressHandlers.pointerup);
      container.removeEventListener('pointercancel', contactGroupLongPressHandlers.pointercancel);
      container.removeEventListener('pointerleave', contactGroupLongPressHandlers.pointerleave);
      container.removeEventListener('contextmenu', contactGroupLongPressHandlers.contextmenu);
      container.removeEventListener('pointerdown', stickerGroupLongPressHandlers.pointerdown);
      container.removeEventListener('pointerup', stickerGroupLongPressHandlers.pointerup);
      container.removeEventListener('pointercancel', stickerGroupLongPressHandlers.pointercancel);
      container.removeEventListener('pointerleave', stickerGroupLongPressHandlers.pointerleave);
      container.removeEventListener('contextmenu', stickerGroupLongPressHandlers.contextmenu);
      container.removeEventListener('pointerdown', favoriteGroupLongPressHandlers.pointerdown);
      container.removeEventListener('pointerup', favoriteGroupLongPressHandlers.pointerup);
      container.removeEventListener('pointercancel', favoriteGroupLongPressHandlers.pointercancel);
      container.removeEventListener('pointerleave', favoriteGroupLongPressHandlers.pointerleave);
      container.removeEventListener('contextmenu', favoriteGroupLongPressHandlers.contextmenu);
      container.removeEventListener('pointerdown', favoriteCardLongPressHandlers.pointerdown);
      container.removeEventListener('pointerup', favoriteCardLongPressHandlers.pointerup);
      container.removeEventListener('pointercancel', favoriteCardLongPressHandlers.pointercancel);
      container.removeEventListener('pointerleave', favoriteCardLongPressHandlers.pointerleave);
      container.removeEventListener('contextmenu', favoriteCardLongPressHandlers.contextmenu);
      container.removeEventListener('pointerdown', chatListLongPressHandlers.pointerdown);
      container.removeEventListener('pointerup', chatListLongPressHandlers.pointerup);
      container.removeEventListener('pointercancel', chatListLongPressHandlers.pointercancel);
      container.removeEventListener('pointerleave', chatListLongPressHandlers.pointerleave);
      container.removeEventListener('contextmenu', chatListLongPressHandlers.contextmenu);
      eventBus.off('archive:active-mask-changed', onMaskChanged);
      eventBus.off('archive:data-changed', onArchiveDataChanged);
      document.removeEventListener('takeaway-delivery-complete', onTakeawayDeliveryComplete);
      autonomousMomentPublisher.destroy();
      removeCSS('chat-app-css');
      removeCSS('chat-moments-css');
      removeCSS('chat-msg-css');
      /* [区域标注·本次拆分·聊天设置页独立样式接线] 卸载聊天设置页独立 CSS */
      removeCSS('chat-msg-settings-css');
      removeCSS('chat-html-card-css');
      removeCSS('chat-gift-css');
      removeCSS('chat-text-image-css');
      removeCSS('chat-voice-css');
      removeCSS('chat-inner-voice-css');
      removeCSS('chat-aside-css');
      removeCSS('chat-translation-css');
      removeCSS('chat-export-import-css');
      removeCSS('chat-takeaway-css');
    }
  };
}

/* ==========================================================================
   [区域标注] unmount — 应用卸载
   ========================================================================== */
export async function unmount(instance) {
  if (instance && typeof instance.destroy === 'function') {
    instance.destroy();
  }
}
