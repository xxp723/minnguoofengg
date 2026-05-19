// @ts-nocheck
/**
 * 文件名: js/apps/chat/chat-event-click.js
 * 用途: 闲谈应用点击事件处理。
 * 架构层: 应用层子模块（由 chat-event-handlers.js 聚合导出）
 */

/* ==========================================================================
   [区域标注·已完成·chat-event-handlers.js拆分] 点击事件处理
   说明：
   1. 从 chat-event-handlers.js 原样拆出点击事件处理逻辑。
   2. 保持原有点击分支顺序、消息流转、子页面切换与 DB.js / IndexedDB 持久化调用不变。
   3. 不引入 localStorage/sessionStorage，不增加双份兜底存储。
   ========================================================================== */
import {
  TAB_ICONS,
  APP_ID,
  DATA_KEY_SESSIONS,
  DATA_KEY_HIDDEN_CHAT_IDS,
  DATA_KEY_MOMENTS,
  DATA_KEY_MESSAGES_PREFIX,
  getCurrentChatPromptSettingsKey,
  PANEL_KEYS,
  dbGet,
  dbPut,
  escapeHtml,
  normalizeStickerData,
  normalizeWalletData,
  normalizeFavoriteData,
  persistWalletData,
  persistFavoriteData,
  persistStickerData,
  createUid,
  renderModalNotice,
  closeModal
} from './chat-utils.js';
import { showAddChatModal } from './chat-list.js';
import {
  showAsideEnterModal,
  readAsideSettingsFromModal,
  showAsideExitConfirmModal,
  persistAsideModeState
} from './chat-aside.js';
import {
  openContactsAddModal,
  handleContactsClickAction
} from './contacts.js';
import {
  sendMessage,
  persistCurrentMessages,
  repairAiMessageFormatIfPossible,
  repairAiTextMessageFormatIfPossible,
  repairAiQuoteMessageFormatIfPossible,
  repairAiSystemTipFormatIfPossible,
  repairAiVoiceMessageFormatIfPossible,
  repairAiAsideMessageFormatIfPossible,
  sendStickerMessage,
  sendImageMessage,
  renderCurrentChatMessage,
  appendCurrentMessageBubble,
  refreshMessageBubbleRows,
  refreshCurrentMessageListOnly,
  updateMultiSelectActionBar,
  resetMessageSelectionState,
  getSelectedMessages,
  refreshCurrentSessionLastMessage,
  retryLatestAiReply,
  syncMessageDockOpenState,
  syncChatConsoleDock,
  renderMsgStickerPanelGrid,
  syncMountedStickerGroupButtons,
  showAiFormatRepairTypeModal,
  showAiWithdrawnMessageModal,
  showUserWithdrawMessageModal,
  showAiFormatRepairResultModal,
  showEditMessageModal,
  showEditAsideModal,
  showForwardMessagesModal,
  showMessageImageModal,
  showMessageTransferModal,
  showTransferActionModal,
  showChatAvatarSourceModal,
  showChatAvatarUrlModal,
  showChatAvatarCropModal,
  buildChatAvatarFromCropModal,
  createQuotePayloadFromMessage,
  syncPendingQuoteComposer,
  syncStickerInputSuggestions,
  syncChatMessageSearchPanel,
  scrollToChatSearchResult
} from './chat-message.js';
import {
  clearCurrentChatMessages,
  expireCurrentChatImages,
  showClearAllMessagesModal,
  showClearCurrentChatImagesModal
} from './chat-cleanup-settings.js';
import {
  buildProfileFromMask,
  showMaskSwitcherModal,
  calculateSessionRunningChatDays,
  getStickerTargetGroupId,
  getVisibleStickers,
  showCreateStickerGroupModal,
  showStickerPreviewModal,
  showStickerUploadModal,
  parseStickerUrlImportText,
  getVisibleFavoriteItems,
  addMessagesToFavorites,
  showCreateFavoriteGroupModal,
  showCreateFavoriteSubGroupModal,
  showFavoriteFilterModal,
  showFavoritePreviewModal,
  showMoveFavoriteToGroupModal,
  showWalletRechargeModal,
  showWalletCurrencyModal,
  getWalletDisplayAmount,
  formatWalletMoney
} from './profile.js';
import {
  MOMENTS_COMPOSE_MAX_IMAGES,
  normalizeMomentsComposeDraft,
  ensureMomentsComposeDraft,
  getMomentsComposeShareTarget,
  buildMomentsComposeShareMessage,
  renderMomentsComposeIntoPage,
  openMomentsComposePage,
  closeMomentsComposePage,
  openMomentsComposeImageUrlModal,
  openMomentsComposeLocationModal,
  openMomentsComposeShareModal,
  openMomentsComposeVisibilityModal,
  openMomentShareModal,
  openMomentRepostModal,
  openMomentDeleteModal,
  openInstantAutonomousMomentContactsModal,
  toggleInstantAutonomousMomentContact,
  getInstantAutonomousMomentContactIds,
  resetMomentsInteractionState,
  handleMomentsInteractionAction,
  refreshMomentsPanel
} from './moments.js';
import { handleTranslationSettingsClick } from './chat-translation.js';
import { handleChatMemorySettingsClick } from './chat-memory-settings.js';
import {
  handleAutonomousActivitySettingsClick,
  publishInstantAutonomousMomentsForContacts,
  publishMomentCommentAiInteraction,
  publishUserMomentAiInteraction
} from './chat-autonomous-activity-settings.js';
import {
  openInnerVoicePanel,
  findInnerVoiceForMessage,
  findLatestInnerVoice,
  isAssistantAvatarClick,
  getMessageIdFromAvatarClick
} from './chat-inner-voice.js';
import {
  createGiftPayRequestMessage,
  parseGiftDraftFromModal,
  sendGiftMessage,
  showMessageGiftModal
} from './chat-gift.js';
import {
  createTextImageMessage,
  openTextImagePreview,
  parseTextImageDraftFromModal,
  showTextImageModal,
  validateTextImageDraft
} from './chat-text-image.js';
import {
  createVoiceMessage,
  parseVoiceDraftFromModal,
  showVoiceMessageModal
} from './chat-voice.js';
import {
  handleSendUserPatFromBubbleToolbar,
  handleSendUserPatMessage
} from './chat-user-pat.js';
import {
  exportCurrentChatMessages,
  openChatImportJsonFilePicker,
  showChatExportFormatModal,
  showChatExportImportNoticeModal
} from './chat-export-import.js';
import { refreshPanel, switchPanel } from './chat-shell.js';
import {
  openChatMessage,
  closeChatMessage,
  openSubPage,
  closeSubPage,
  rerenderCurrentSubPage,
  saveCurrentChatSessionAvatar,
  saveCurrentChatSessionUserAvatar,
  deleteCurrentChatSessionAvatar,
  deleteCurrentChatSessionUserAvatar
} from './chat-navigation.js';
import {
  CHAT_MESSAGE_INITIAL_VISIBLE_COUNT,
  CHAT_MESSAGE_LOAD_MORE_STEP,
  addChatConsoleLog,
  persistCurrentChatConsoleLogs,
  persistCurrentChatConsoleEnabled,
  syncMessageInputAutoHeight,
  performMaskSwitch
} from './chat-state.js';

/* ==========================================================================
   [区域标注] 点击事件代理处理器
   说明：统一处理应用内所有按钮/列表项的点击事件
   ========================================================================== */
export async function handleClick(e, state, container, db, eventBus, windowManager, appMeta, settingsManager) {
  /* ========================================================================
     [区域标注·已完成·心声面板] 角色头像点击事件委托 —— 打开心声面板
     ======================================================================== */
  if (state.currentChatId && isAssistantAvatarClick(e.target)) {
    e.preventDefault();
    e.stopPropagation();
    const messageId = getMessageIdFromAvatarClick(e.target);
    const messages = state.currentMessages || [];
    const innerVoice = messageId
      ? findInnerVoiceForMessage(messages, messageId)
      : findLatestInnerVoice(messages);
    if (innerVoice) {
      const innerVoiceMessage = messageId
        ? messages.find(message => String(message?.id || '') === String(messageId))
        : [...messages].reverse().find(message => message?.role === 'assistant' && message?.innerVoice);
      const currentSession = (state.sessions || []).find(session => String(session.id) === String(state.currentChatId)) || {};
      openInnerVoicePanel(container, innerVoice, {
        db,
        maskId: state.activeMaskId,
        chatId: state.currentChatId,
        chatName: String(currentSession.remark || currentSession.name || ''),
        createdAt: Number(innerVoiceMessage?.timestamp || Date.now()) || Date.now()
      });
    }
    return;
  }

  const target = e.target.closest('[data-action]');

  if (
    state.subPageView === 'favorite'
    && container.querySelector('.favorite-html-card.is-expanded')
    && !e.target.closest('.favorite-html-card')
  ) {
    e.preventDefault();
    container.querySelectorAll('.favorite-html-card.is-expanded').forEach(item => item.classList.remove('is-expanded'));
    return;
  }

  const openedMessageId = String(state.selectedMessageId || '');
  if (
    state.currentChatId
    && openedMessageId
    && !state.multiSelectMode
    && !e.target.closest('[data-role="msg-bubble-toolbar"]')
    && e.target.closest('[data-role="msg-page-wrap"]')
  ) {
    const clickedAction = String(target?.dataset?.action || '');
    const clickedMessageId = String(target?.dataset?.messageId || '');
    const previousDeleteConfirmId = state.deleteConfirmMessageId;
    const previousRewindConfirmId = state.rewindConfirmMessageId;
    const shouldBypassCloseIntercept = ['msg-back', 'msg-settings-back', 'msg-media-open-zoom', 'msg-media-close-zoom', 'open-msg-text-image-preview', 'moments-compose'].includes(clickedAction);
    if (shouldBypassCloseIntercept) {
      e.preventDefault();
      e.stopPropagation();
    }
    const shouldOnlyClose = !['msg-bubble-select', 'msg-system-tip-select'].includes(clickedAction) || clickedMessageId === openedMessageId;
    state.selectedMessageId = '';
    state.selectedAsideSegmentId = '';
    state.deleteConfirmMessageId = '';
    state.rewindConfirmMessageId = '';
    refreshMessageBubbleRows(container, state, [openedMessageId, previousDeleteConfirmId, previousRewindConfirmId, clickedMessageId]);
    if (shouldOnlyClose && !shouldBypassCloseIntercept) return;
  }

  if (!target) return;
  const action = target.dataset.action;

  switch (action) {
    case 'go-home':
      eventBus.emit('app:close', { appId: APP_ID });
      break;

    case 'switch-panel': {
      const panelKey = target.dataset.panel;
      if (panelKey && PANEL_KEYS.includes(panelKey)) {
        switchPanel(container, state, panelKey);
      }
      break;
    }

    case 'switch-sub-tab': {
      const subTab = target.dataset.subTab;
      if (subTab) {
        state.chatSubTab = subTab;
        container.querySelectorAll('.chat-tab-btn').forEach(btn => {
          btn.classList.toggle('is-active', btn.dataset.subTab === subTab);
        });
        refreshPanel(container, state, 'chatList');
      }
      break;
    }

    case 'toggle-section': {
      const key = target.dataset.sectionKey;
      if (key) {
        state.sectionCollapsed[key] = !state.sectionCollapsed[key];
        refreshPanel(container, state, 'chatList');
      }
      break;
    }

    case 'open-chat': {
      if (target.dataset.longPressTriggered === '1') {
        delete target.dataset.longPressTriggered;
        break;
      }
      const chatId = target.dataset.chatId;
      if (chatId) {
        await openChatMessage(container, state, db, chatId);
      }
      break;
    }

    case 'add-chat':
      if (state.activePanel === 'contacts') {
        openContactsAddModal(container, state);
      } else {
        showAddChatModal(container, state);
      }
      break;

    case 'moments-compose':
      openMomentsComposePage(container, state);
      break;

    /* ========================================================================
       [区域标注·已完成·朋友圈星星按钮 AI 评论接线]
       说明：
       1. 每条动态右上角星星按钮点击后，调用自主活动模块的单条动态 AI 互动入口。
       2. 评论、点赞与互评写回 DATA_KEY_MOMENTS，经 DB.js / IndexedDB 持久化；不使用 localStorage/sessionStorage。
       3. 使用后台 void 调用并局部刷新朋友圈，避免页面闪屏；无原生浏览器弹窗。
       ======================================================================== */
    case 'moment-ai-comment': {
      const momentId = String(target.dataset.momentId || '').trim();
      if (!momentId) break;
      target.disabled = true;
      target.classList.add('is-loading');
      void publishUserMomentAiInteraction({
        state,
        container,
        db,
        settingsManager,
        momentId
      }).finally(() => {
        if (!target.isConnected) return;
        target.disabled = false;
        target.classList.remove('is-loading');
      });
      break;
    }

    case 'moment-like':
    case 'moment-comment':
    case 'moment-reply-comment':
    case 'cancel-moment-reply':
    case 'moment-delete-comment':
    case 'submit-moment-comment':
      await handleMomentsInteractionAction({
        action,
        target,
        state,
        container,
        createUid,
        showNotice: message => renderModalNotice(container, message),
        persistMoments: () => dbPut(db, DATA_KEY_MOMENTS(state.activeMaskId), Array.isArray(state.moments) ? state.moments : []),
        onCommentSubmitted: action === 'submit-moment-comment'
          ? payload => publishMomentCommentAiInteraction({
              state,
              container,
              db,
              settingsManager,
              momentId: payload?.momentId,
              commentId: payload?.comment?.id || payload?.comment?.commentId || '',
              comment: payload?.comment,
              replyTarget: payload?.replyTarget || null
            })
          : null
      });
      break;

    /* ========================================================================
       [区域标注·已完成·本次朋友圈头像点击切换动态范围] 用户头像显示全部，联系人头像只显示单联系人动态
       说明：
       1. 点击用户头像时清空运行时筛选状态 state.momentsContactFilterId，恢复显示全部未删除动态。
       2. 点击联系人头像时仅显示该联系人动态；再次点击同一联系人头像时取消筛选，恢复全部动态。
       3. 仅局部刷新朋友圈面板，不新增任何 DB.js / IndexedDB 写入，不改动评论、回复、删除、分享、转发等既有逻辑。
       ======================================================================== */
    case 'show-all-moments':
      state.momentsContactFilterId = '';
      resetMomentsInteractionState(state);
      refreshMomentsPanel(container, state);
      break;

    case 'filter-moments-by-contact': {
      const contactId = String(target.dataset.contactId || '').trim();
      if (!contactId) break;
      state.momentsContactFilterId = String(state.momentsContactFilterId || '').trim() === contactId
        ? ''
        : contactId;
      resetMomentsInteractionState(state);
      refreshMomentsPanel(container, state);
      break;
    }

    /* ========================================================================
       [区域标注·已完成·本次朋友圈分享转发删除互动] 朋友圈动态分享 / 转发 / 删除
       说明：
       1. 仅接线朋友圈动态卡片上的分享、转发、删除按钮与应用内弹窗。
       2. 持久化统一走 DB.js / IndexedDB，不使用 localStorage/sessionStorage，不写双份兜底。
       3. 分享后打开目标聊天窗口；转发与删除仅局部刷新朋友圈面板，减少闪屏。
       ======================================================================== */
    case 'open-moment-share-modal': {
      const momentId = String(target.dataset.momentId || '').trim();
      if (!momentId) break;
      openMomentShareModal(container, state, momentId);
      break;
    }

    case 'open-moment-repost-modal': {
      const momentId = String(target.dataset.momentId || '').trim();
      if (!momentId) break;
      openMomentRepostModal(container, state, momentId);
      break;
    }

    case 'open-moment-delete-modal': {
      const momentId = String(target.dataset.momentId || '').trim();
      if (!momentId) break;
      openMomentDeleteModal(container, state, momentId);
      break;
    }

    case 'share-moment-to-chat': {
      const momentId = String(target.dataset.momentId || '').trim();
      const chatId = String(target.dataset.chatId || '').trim();
      const targetSession = state.sessions.find(session => String(session?.id || '') === chatId);
      const moment = (Array.isArray(state.moments) ? state.moments : []).find(item => String(item?.id || '') === momentId);

      if (!moment || !targetSession || !chatId) {
        renderModalNotice(container, '未找到可分享的目标聊天');
        break;
      }

      const now = Date.now();
      const momentText = String(moment?.content || '').trim();
      const momentImages = Array.isArray(moment?.images)
        ? moment.images.map(src => ({ src: String(src || '').trim() })).filter(item => item.src)
        : [];
      const shareMessage = {
        id: createUid('moment_share'),
        role: 'user',
        type: 'moment_share',
        momentShareMomentId: momentId,
        momentShareText: momentText,
        momentShareImageCount: momentImages.length,
        momentShareLocation: String(moment?.location || '').trim(),
        momentShareAuthorName: String(moment?.authorName || state.profile?.nickname || state.profile?.name || '当前面具身份').trim() || '当前面具身份',
        content: buildMomentsComposeShareMessage({
          text: momentText,
          images: momentImages,
          location: String(moment?.location || '').trim()
        }),
        timestamp: now
      };

      const targetKey = DATA_KEY_MESSAGES_PREFIX(state.activeMaskId) + chatId;
      const targetMessages = (await dbGet(db, targetKey)) || [];
      targetMessages.push(shareMessage);

      const nextShares = Array.isArray(moment?.shares) ? moment.shares.slice() : [];
      nextShares.push({
        id: createUid('moment_share_record'),
        chatId,
        chatName: String(targetSession.remark || targetSession.name || '').trim() || '未命名聊天',
        sharedAt: now
      });
      moment.shares = nextShares;

      targetSession.lastMessage = shareMessage.content;
      targetSession.lastTime = now;

      await Promise.all([
        dbPut(db, targetKey, targetMessages),
        dbPut(db, DATA_KEY_SESSIONS(state.activeMaskId), state.sessions),
        dbPut(db, DATA_KEY_MOMENTS(state.activeMaskId), Array.isArray(state.moments) ? state.moments : [])
      ]);

      closeModal(container);
      refreshMomentsPanel(container, state);
      refreshPanel(container, state, 'chatList');
      await openChatMessage(container, state, db, chatId);
      break;
    }

    case 'confirm-moment-repost': {
      const momentId = String(target.dataset.momentId || '').trim();
      const sourceMoment = (Array.isArray(state.moments) ? state.moments : []).find(item => String(item?.id || '') === momentId);
      if (!sourceMoment) {
        renderModalNotice(container, '未找到要转发的动态');
        break;
      }

      const input = container.querySelector('[data-role="moment-repost-text-input"]');
      const repostText = String(input?.value || '').trim();
      const now = Date.now();
      const authorName = String(state.profile?.nickname || state.profile?.name || '当前面具身份').trim() || '当前面具身份';
      const authorAvatar = String(state.profile?.avatar || '').trim();

      const nextReposts = Array.isArray(sourceMoment?.reposts) ? sourceMoment.reposts.slice() : [];
      nextReposts.push({
        id: createUid('moment_repost_record'),
        authorId: String(state.activeMaskId || '').trim(),
        authorName,
        repostedAt: now
      });
      sourceMoment.reposts = nextReposts;

      const repostMoment = {
        id: createUid('moment'),
        authorId: String(state.activeMaskId || '').trim(),
        authorName,
        authorAvatar,
        content: repostText,
        images: [],
        likes: [],
        comments: [],
        reposts: [],
        shares: [],
        createdAt: now,
        location: '',
        visibilityMode: 'public',
        visibleContactIds: [],
        visibleContactNames: [],
        repostSourceMomentId: String(sourceMoment?.id || '').trim(),
        repostSourceAuthorName: String(sourceMoment?.authorName || '原动态作者').trim() || '原动态作者',
        repostSourceContent: String(sourceMoment?.content || '').trim(),
        repostSourceImages: Array.isArray(sourceMoment?.images) ? sourceMoment.images.map(item => String(item || '').trim()).filter(Boolean) : [],
        repostSourceCreatedAt: sourceMoment?.createdAt || now,
        repostSourceLocation: String(sourceMoment?.location || '').trim()
      };

      state.moments = [repostMoment, ...(Array.isArray(state.moments) ? state.moments : [])];
      resetMomentsInteractionState(state);

      await dbPut(db, DATA_KEY_MOMENTS(state.activeMaskId), state.moments);
      closeModal(container);
      refreshMomentsPanel(container, state);
      break;
    }

    case 'confirm-delete-moment': {
      const momentId = String(target.dataset.momentId || '').trim();
      const prevMoments = Array.isArray(state.moments) ? state.moments : [];
      const nextMoments = prevMoments.filter(moment => String(moment?.id || '') !== momentId);
      if (nextMoments.length === prevMoments.length) {
        renderModalNotice(container, '未找到要删除的动态');
        break;
      }

      state.moments = nextMoments;
      state.momentsExpandedCommentIds = (Array.isArray(state.momentsExpandedCommentIds) ? state.momentsExpandedCommentIds : [])
        .map(String)
        .filter(id => id !== momentId);
      if (String(state.momentsReplyTarget?.momentId || '') === momentId) {
        state.momentsReplyTarget = null;
      }

      await dbPut(db, DATA_KEY_MOMENTS(state.activeMaskId), state.moments);
      closeModal(container);
      refreshMomentsPanel(container, state);
      break;
    }

    case 'moments-compose-back':
      closeMomentsComposePage(container, state, PANEL_KEYS);
      break;

    case 'submit-moments-compose': {
      const draft = ensureMomentsComposeDraft(state);
      const text = String(draft.text || '').trim();
      const draftImages = Array.isArray(draft.images) ? draft.images.filter(item => item?.src).slice(0, MOMENTS_COMPOSE_MAX_IMAGES) : [];
      const validVisibleContactIds = new Set(
        (Array.isArray(state.contacts) ? state.contacts : [])
          .flatMap(contact => [
            String(contact?.id || '').trim(),
            String(contact?.roleId || '').trim()
          ])
          .filter(Boolean)
      );
      const visibleContactIds = Array.from(new Set(
        (Array.isArray(draft.visibleContactIds) ? draft.visibleContactIds : [])
          .map(id => String(id || '').trim())
          .filter(id => validVisibleContactIds.has(id))
      ));

      /* ========================================================================
         [区域标注·已完成·本次朋友圈个别人可见名单与分享卡片元数据] 发布时联系人姓名快照
         说明：
         1. 仅在现有 DB.js / IndexedDB 发布写入链路中附带姓名快照。
         2. 不新增 localStorage/sessionStorage，不写双份兜底。
         3. 不使用长文本过滤逻辑，仅匹配本次已选择的通讯录联系人名称。
         ======================================================================== */
      const visibleContactIdSet = new Set(visibleContactIds.map(id => String(id || '').trim()).filter(Boolean));
      const visibleContactNames = (Array.isArray(state.contacts) ? state.contacts : [])
        .filter(contact => {
          const contactId = String(contact?.id || '').trim();
          const roleId = String(contact?.roleId || '').trim();
          return visibleContactIdSet.has(contactId) || visibleContactIdSet.has(roleId);
        })
        .map(contact => String(contact?.name || contact?.nickname || contact?.contact || '').trim())
        .filter(Boolean);

      if (!text && !draftImages.length) {
        renderModalNotice(container, '请先输入文字或添加图片');
        break;
      }

      if (draft.visibilityMode === 'contacts' && !visibleContactIds.length) {
        renderModalNotice(container, '请选择可见的通讯录联系人');
        break;
      }

      const now = Date.now();
      const authorName = String(state.profile?.nickname || state.profile?.name || '当前面具身份').trim() || '当前面具身份';
      const authorAvatar = String(state.profile?.avatar || '').trim();
      const shareTarget = getMomentsComposeShareTarget(state);
      const nextMoment = {
        id: createUid('moment'),
        authorId: String(state.activeMaskId || '').trim(),
        authorName,
        authorAvatar,
        content: text,
        images: draftImages.map(item => String(item.src || '').trim()).filter(Boolean),
        likes: [],
        comments: [],
        createdAt: now,
        location: String(draft.location || '').trim(),
        visibilityMode: draft.visibilityMode,
        visibleContactIds,
        visibleContactNames,
        shareChatId: shareTarget ? String(shareTarget.id || '').trim() : '',
        shareChatName: shareTarget ? (String(shareTarget.remark || shareTarget.name || '').trim() || '未命名聊天') : ''
      };

      state.moments = [nextMoment, ...(Array.isArray(state.moments) ? state.moments : [])];
      resetMomentsInteractionState(state);

      const tasks = [
        dbPut(db, DATA_KEY_MOMENTS(state.activeMaskId), state.moments)
      ];

      if (shareTarget) {
        const shareMessage = {
          id: createUid('moment_share'),
          role: 'user',
          type: 'moment_share',
          momentShareMomentId: nextMoment.id,
          momentShareText: text,
          momentShareImageCount: draftImages.length,
          momentShareLocation: String(draft.location || '').trim(),
          momentShareAuthorName: authorName,
          content: buildMomentsComposeShareMessage({
            ...draft,
            text,
            images: draftImages
          }),
          timestamp: now
        };
        const targetKey = DATA_KEY_MESSAGES_PREFIX(state.activeMaskId) + shareTarget.id;
        const targetMessages = (await dbGet(db, targetKey)) || [];
        targetMessages.push(shareMessage);
        shareTarget.lastMessage = shareMessage.content;
        shareTarget.lastTime = now;

        tasks.push(
          dbPut(db, targetKey, targetMessages),
          dbPut(db, DATA_KEY_SESSIONS(state.activeMaskId), state.sessions)
        );
      }

      await Promise.all(tasks);
      refreshPanel(container, state, 'moments');
      if (shareTarget) refreshPanel(container, state, 'chatList');
      closeMomentsComposePage(container, state, PANEL_KEYS, { resetDraft: true });

      /* ========================================================================
         [区域标注·已完成·朋友圈发布后 AI 即时互动触发]
         说明：
         1. 用户发布朋友圈成功写入 DB.js / IndexedDB 后，后台调用设置应用副 API 生成当前聊天角色的点赞与评论。
         2. 本功能与“主动发朋友圈”开关无关；这里只针对用户刚发布的这条朋友圈做即时互动。
         3. 若动态包含图片，由自主活动模块把图片交给支持识图的副 API；不使用 localStorage/sessionStorage，不写双份兜底。
         4. 使用 void 后台执行，不阻塞发帖页关闭与朋友圈刷新，避免页面闪屏。
         ======================================================================== */
      void publishUserMomentAiInteraction({
        state,
        container,
        db,
        settingsManager,
        momentId: nextMoment.id
      });
      break;
    }

    case 'open-moments-compose-local-picker': {
      const input = container.querySelector('[data-role="moments-compose-local-input"]');
      if (input) {
        input.value = '';
        input.click();
      }
      break;
    }

    case 'open-moments-compose-image-url-modal':
      openMomentsComposeImageUrlModal(container);
      break;

    case 'confirm-moments-compose-image-url': {
      const draft = ensureMomentsComposeDraft(state);
      if (draft.images.length >= MOMENTS_COMPOSE_MAX_IMAGES) {
        renderModalNotice(container, `最多只能添加 ${MOMENTS_COMPOSE_MAX_IMAGES} 张图片`);
        break;
      }

      const input = container.querySelector('[data-role="moments-compose-image-url-input"]');
      const imageUrl = String(input?.value || '').trim();
      if (!/^https?:\/\/\S+/i.test(imageUrl) && !/^data:image\//i.test(imageUrl)) {
        renderModalNotice(container, '请输入有效的图片 URL');
        break;
      }

      state.momentsComposeDraft = normalizeMomentsComposeDraft({
        ...draft,
        images: [
          ...draft.images,
          {
            id: createUid('moments_compose_image'),
            src: imageUrl,
            name: '链接图片'
          }
        ]
      });
      closeModal(container);
      renderMomentsComposeIntoPage(container, state);
      break;
    }

    case 'remove-moments-compose-image': {
      const imageId = String(target.dataset.imageId || '').trim();
      const draft = ensureMomentsComposeDraft(state);
      state.momentsComposeDraft = normalizeMomentsComposeDraft({
        ...draft,
        images: draft.images.filter(item => String(item?.id || '').trim() !== imageId)
      });
      renderMomentsComposeIntoPage(container, state);
      break;
    }

    case 'open-moments-compose-location-modal':
      openMomentsComposeLocationModal(container, state);
      break;

    case 'confirm-moments-compose-location': {
      const draft = ensureMomentsComposeDraft(state);
      const input = container.querySelector('[data-role="moments-compose-location-input"]');
      state.momentsComposeDraft = normalizeMomentsComposeDraft({
        ...draft,
        location: String(input?.value || '').trim()
      });
      closeModal(container);
      renderMomentsComposeIntoPage(container, state);
      break;
    }

    case 'clear-moments-compose-location': {
      const draft = ensureMomentsComposeDraft(state);
      state.momentsComposeDraft = normalizeMomentsComposeDraft({
        ...draft,
        location: ''
      });
      closeModal(container);
      renderMomentsComposeIntoPage(container, state);
      break;
    }

    case 'open-moments-compose-share-modal':
      openMomentsComposeShareModal(container, state);
      break;

    case 'select-moments-compose-share': {
      const draft = ensureMomentsComposeDraft(state);
      state.momentsComposeDraft = normalizeMomentsComposeDraft({
        ...draft,
        shareChatId: String(target.dataset.chatId || '').trim()
      });
      closeModal(container);
      renderMomentsComposeIntoPage(container, state);
      break;
    }

    case 'open-moments-compose-visibility-modal':
      openMomentsComposeVisibilityModal(container, state);
      break;

    case 'set-moments-compose-visibility-mode': {
      const draft = ensureMomentsComposeDraft(state);
      const visibilityMode = String(target.dataset.visibilityMode || 'public') === 'contacts' ? 'contacts' : 'public';
      state.momentsComposeDraft = normalizeMomentsComposeDraft({
        ...draft,
        visibilityMode,
        visibleContactIds: visibilityMode === 'contacts' ? draft.visibleContactIds : []
      });
      renderMomentsComposeIntoPage(container, state);
      openMomentsComposeVisibilityModal(container, state);
      break;
    }

    case 'toggle-moments-compose-visible-contact': {
      const draft = ensureMomentsComposeDraft(state);
      const contactId = String(target.dataset.contactId || '').trim();
      if (!contactId) break;

      const selectedSet = new Set(draft.visibleContactIds.map(id => String(id || '').trim()).filter(Boolean));
      if (selectedSet.has(contactId)) {
        selectedSet.delete(contactId);
      } else {
        selectedSet.add(contactId);
      }

      state.momentsComposeDraft = normalizeMomentsComposeDraft({
        ...draft,
        visibilityMode: 'contacts',
        visibleContactIds: Array.from(selectedSet)
      });
      renderMomentsComposeIntoPage(container, state);
      openMomentsComposeVisibilityModal(container, state);
      break;
    }

    /* ========================================================================
       [区域标注·已完成·朋友圈左上角爱心即时 AI 发布点击接线]
       说明：
       1. 仅接线朋友圈页左上角爱心按钮的多选联系人弹窗与确认发布。
       2. 确认发布后调用自主活动模块；该即时发布与“主动发朋友圈”开关无关，开关只控制后台定时发布。
       3. 发布结果通过应用内弹窗提示；不使用原生浏览器弹窗/选择器。
       4. 朋友圈持久化仍由自主活动模块统一写入 DB.js / IndexedDB，不使用 localStorage/sessionStorage。
       ======================================================================== */
    case 'open-instant-autonomous-moments-modal':
    case 'moments-notifications':
      openInstantAutonomousMomentContactsModal(container, state);
      break;

    case 'toggle-instant-autonomous-moment-contact': {
      toggleInstantAutonomousMomentContact(state, target.dataset.contactId);
      openInstantAutonomousMomentContactsModal(container, state);
      break;
    }

    case 'confirm-instant-autonomous-moments': {
      const contactIds = getInstantAutonomousMomentContactIds(state);
      if (!contactIds.length) {
        renderModalNotice(container, '请选择要发布朋友圈的通讯录联系人');
        break;
      }

      target.disabled = true;
      target.textContent = '发布中…';

      const result = await publishInstantAutonomousMomentsForContacts({
        state,
        container,
        db,
        settingsManager,
        contactIds
      });

      state.instantAutonomousMomentContactIds = [];
      refreshMomentsPanel(container, state);
      renderModalNotice(container, result.message || '朋友圈即时发布已完成');
      target.disabled = false;
      target.textContent = '立即发布';
      break;
    }

    case 'close-modal':
      closeModal(container);
      break;

    case 'select-contact-for-chat': {
      const contactId = target.dataset.contactId;
      const contact = state.contacts.find(c => c.id === contactId);
      if (contact) {
        const existedSession = state.sessions.find(s => s.id === contactId);
        if (existedSession) {
          existedSession.chatDaysAccumulated = Math.max(0, Number(existedSession.chatDaysAccumulated || 0));
          existedSession.chatDaysLastResumedAt = Date.now();
          state.hiddenChatIds = state.hiddenChatIds.filter(id => String(id) !== String(contactId));
          await Promise.all([
            dbPut(db, DATA_KEY_SESSIONS(state.activeMaskId), state.sessions),
            dbPut(db, DATA_KEY_HIDDEN_CHAT_IDS(state.activeMaskId), state.hiddenChatIds)
          ]);
        } else {
          const now = Date.now();
          const newSession = {
            id: contact.id,
            name: contact.name || '未命名',
            avatar: contact.avatar || '',
            type: 'private',
            lastMessage: '',
            lastTime: now,
            unread: 0,
            chatDaysAccumulated: 0,
            chatDaysLastResumedAt: now
          };
          state.sessions.push(newSession);
          await dbPut(db, DATA_KEY_SESSIONS(state.activeMaskId), state.sessions);
        }

        buildProfileFromMask(state);
        closeModal(container);
        refreshPanel(container, state, 'chatList');
        refreshPanel(container, state, 'profile');
        await openChatMessage(container, state, db, contact.id);
      }
      break;
    }

    case 'confirm-delete-chat-list-contact': {
      const chatId = target.dataset.chatId || '';
      const session = chatId ? state.sessions.find(item => String(item.id) === String(chatId)) : null;
      if (!session) break;

      const now = Date.now();
      session.chatDaysAccumulated = calculateSessionRunningChatDays(session, now);
      session.chatDaysLastResumedAt = 0;

      const hiddenSet = new Set(Array.isArray(state.hiddenChatIds) ? state.hiddenChatIds.map(String) : []);
      hiddenSet.add(String(chatId));
      state.hiddenChatIds = Array.from(hiddenSet);

      await Promise.all([
        dbPut(db, DATA_KEY_SESSIONS(state.activeMaskId), state.sessions),
        dbPut(db, DATA_KEY_HIDDEN_CHAT_IDS(state.activeMaskId), state.hiddenChatIds)
      ]);

      buildProfileFromMask(state);
      closeModal(container);
      refreshPanel(container, state, 'chatList');
      refreshPanel(container, state, 'profile');
      break;
    }

    case 'switch-contact-group':
    case 'create-contact-group':
    case 'confirm-create-contact-group':
    case 'confirm-delete-contact-group':
    case 'add-contact-from-search':
    case 'view-contact':
    case 'assign-contact-group':
      await handleContactsClickAction({
        action,
        target,
        state,
        container,
        db,
        refreshPanel,
        buildProfileFromMask
      });
      break;

    case 'msg-back':
      e.preventDefault();
      e.stopPropagation();
      closeChatMessage(container, state);
      refreshPanel(container, state, 'chatList');
      break;

    case 'msg-send': {
      const input = container.querySelector('[data-role="msg-input"]');
      const value = String(input?.value || '').trim();
      if (input) {
        input.value = '';
        syncMessageInputAutoHeight(input);
      }
      syncStickerInputSuggestions(container, state, '');

      await addChatConsoleLog(container, state, db, 'info', value ? `发送消息：${value}` : '发送触发：仅请求 AI 回复');

      if (value) {
        await sendMessage(container, state, db, value, settingsManager, { triggerAi: true });
      } else {
        await sendMessage(container, state, db, '', settingsManager, { skipAppendUser: true, triggerAi: true });
      }
      break;
    }

    case 'msg-coffee':
      state.coffeeDockOpen = !state.coffeeDockOpen;
      if (state.coffeeDockOpen) state.stickerPanelOpen = false;
      syncMessageDockOpenState(container, state);
      break;

    case 'open-msg-image-modal':
      showMessageImageModal(container);
      break;

    case 'open-msg-transfer-modal': {
      const walletDisplay = getWalletDisplayAmount(state.walletData || {});
      showMessageTransferModal(container, {
        balanceLabel: formatWalletMoney(walletDisplay.value, walletDisplay.currency.code),
        currencyCode: walletDisplay.currency.code
      });
      break;
    }

    case 'open-msg-text-image-modal':
      showTextImageModal(container);
      break;

    case 'open-msg-voice-modal':
      showVoiceMessageModal(container);
      break;

    case 'confirm-msg-voice': {
      if (!state.currentChatId || state.isAiSending) break;
      const voiceText = parseVoiceDraftFromModal(container);
      if (!voiceText) {
        renderModalNotice(container, '请输入语音文字内容');
        break;
      }

      const session = state.sessions.find(s => String(s.id) === String(state.currentChatId));
      const voiceMessage = createVoiceMessage(voiceText);
      if (!session || !voiceMessage) break;

      state.currentMessages.push(voiceMessage);
      state.coffeeDockOpen = false;
      state.stickerPanelOpen = false;
      session.lastMessage = '[语音]';
      session.lastTime = voiceMessage.timestamp;

      await Promise.all([
        persistCurrentMessages(state, db),
        dbPut(db, DATA_KEY_SESSIONS(state.activeMaskId), state.sessions)
      ]);

      closeModal(container);
      appendCurrentMessageBubble(container, state, voiceMessage);
      syncMessageDockOpenState(container, state);
      refreshPanel(container, state, 'chatList');
      break;
    }

    case 'confirm-msg-text-image': {
      if (!state.currentChatId || state.isAiSending) break;
      const text = parseTextImageDraftFromModal(container);
      if (!validateTextImageDraft(container, text)) break;

      const session = state.sessions.find(s => String(s.id) === String(state.currentChatId));
      const textImageMessage = createTextImageMessage(text);
      if (!session || !textImageMessage) break;

      state.currentMessages.push(textImageMessage);
      state.coffeeDockOpen = false;
      state.stickerPanelOpen = false;
      session.lastMessage = '[文字图]';
      session.lastTime = textImageMessage.timestamp;

      await Promise.all([
        persistCurrentMessages(state, db),
        dbPut(db, DATA_KEY_SESSIONS(state.activeMaskId), state.sessions)
      ]);

      closeModal(container);
      appendCurrentMessageBubble(container, state, textImageMessage);
      syncMessageDockOpenState(container, state);
      refreshPanel(container, state, 'chatList');
      break;
    }

    case 'open-msg-text-image-preview': {
      const messageId = String(target.dataset.messageId || '').trim();
      const message = (state.currentMessages || []).find(item => String(item.id) === messageId);
      if (message) {
        e.preventDefault();
        e.stopPropagation();
        openTextImagePreview(container, message);
      }
      break;
    }

    case 'open-msg-aside-modal':
      showAsideEnterModal(container, state.asideSettings);
      break;

    case 'set-aside-role-person': {
      const group = target.closest('[data-role="aside-role-person-group"]');
      if (group) {
        group.querySelectorAll('.aside-option-btn').forEach(b => b.classList.remove('is-active'));
        target.classList.add('is-active');
      }
      break;
    }

    case 'set-aside-user-person': {
      const group = target.closest('[data-role="aside-user-person-group"]');
      if (group) {
        group.querySelectorAll('.aside-option-btn').forEach(b => b.classList.remove('is-active'));
        target.classList.add('is-active');
      }
      break;
    }

    case 'set-aside-display-mode': {
      const group = target.closest('[data-role="aside-display-mode-group"]');
      if (group) {
        group.querySelectorAll('.aside-option-btn').forEach(b => b.classList.remove('is-active'));
        target.classList.add('is-active');
      }
      break;
    }

    case 'confirm-enter-aside-mode': {
      const asideSettings = readAsideSettingsFromModal(container);
      state.asideModeActive = true;
      state.asideSettings = asideSettings;
      state.asideHistory = [];
      await persistAsideModeState(db, state.activeMaskId, state.currentChatId, {
        active: true,
        settings: state.asideSettings,
        history: state.asideHistory
      });
      closeModal(container);
      renderCurrentChatMessage(container, state);
      break;
    }

    case 'exit-aside-mode':
      showAsideExitConfirmModal(container);
      break;

    case 'confirm-exit-aside-mode':
      state.asideModeActive = false;
      await persistAsideModeState(db, state.activeMaskId, state.currentChatId, {
        active: false,
        settings: state.asideSettings,
        history: state.asideHistory
      });
      closeModal(container);
      renderCurrentChatMessage(container, state);
      break;

    case 'open-msg-gift-modal': {
      const walletDisplay = getWalletDisplayAmount(state.walletData || {});
      const activeMask = (state.archiveMasks || []).find(mask => String(mask?.id || '') === String(state.activeMaskId)) || {};
      showMessageGiftModal(container, {
        balanceLabel: formatWalletMoney(walletDisplay.value, walletDisplay.currency.code),
        currencyCode: walletDisplay.currency.code,
        maskName: String(activeMask?.name || state.profile?.nickname || '当前面具身份')
      });
      break;
    }

    case 'confirm-msg-gift-buy':
    case 'request-msg-gift-pay': {
      if (!state.currentChatId) break;

      const walletDisplay = getWalletDisplayAmount(state.walletData || {});
      const draft = parseGiftDraftFromModal(container, walletDisplay, state.walletData || {});
      const giftTitle = String(draft.giftTitle || '').trim();
      const giftPrice = Number(draft.giftPrice || 0);
      const giftBaseCny = Number(draft.giftBaseCny || 0);
      const currentBaseCny = Math.max(0, Number(state.walletData?.balanceBaseCny || 0) || 0);

      if (!giftTitle) {
        renderModalNotice(container, '请输入商品名称');
        break;
      }

      if (!Number.isFinite(giftPrice) || giftPrice <= 0) {
        renderModalNotice(container, '请输入大于 0 的礼物价格');
        break;
      }

      if (!Number.isFinite(Number(draft.displayRate || 0)) || Number(draft.displayRate || 0) <= 0 || !Number.isFinite(giftBaseCny)) {
        renderModalNotice(container, '当前钱包币种汇率不可用，请先切换币种后重试');
        break;
      }

      if (giftBaseCny > currentBaseCny + 1e-8) {
        renderModalNotice(container, '礼物价格不能超过当前钱包余额');
        break;
      }

      const giftDisplayPrice = formatWalletMoney(giftPrice, draft.currencyCode);
      const normalizedDraft = {
        ...draft,
        giftDisplayPrice
      };

      if (action === 'confirm-msg-gift-buy') {
        const sent = await sendGiftMessage(container, state, db, normalizedDraft, { formatWalletMoney });
        if (!sent) {
          renderModalNotice(container, '当前聊天不存在，无法发送礼物');
          break;
        }

        const latestGiftMessage = state.currentMessages[state.currentMessages.length - 1];
        closeModal(container);
        appendCurrentMessageBubble(container, state, latestGiftMessage);
        syncMessageDockOpenState(container, state);
        refreshPanel(container, state, 'chatList');
        break;
      }

      const session = state.sessions.find(s => String(s.id) === String(state.currentChatId));
      if (!session) {
        renderModalNotice(container, '当前聊天不存在，无法发送礼物代付请求');
        break;
      }

      const giftPayRequestMessage = createGiftPayRequestMessage(normalizedDraft);
      state.currentMessages.push(giftPayRequestMessage);
      state.coffeeDockOpen = false;
      state.stickerPanelOpen = false;
      session.lastMessage = `[礼物代付请求] ${giftTitle}${giftDisplayPrice ? ` · ${giftDisplayPrice}` : ''}`;
      session.lastTime = giftPayRequestMessage.timestamp;

      await Promise.all([
        persistCurrentMessages(state, db),
        dbPut(db, DATA_KEY_SESSIONS(state.activeMaskId), state.sessions)
      ]);

      closeModal(container);
      appendCurrentMessageBubble(container, state, giftPayRequestMessage);
      syncMessageDockOpenState(container, state);
      refreshPanel(container, state, 'chatList');
      await sendMessage(container, state, db, '', settingsManager, { skipAppendUser: true, triggerAi: true });
      break;
    }

    case 'confirm-msg-transfer': {
      if (!state.currentChatId) break;
      const session = state.sessions.find(s => s.id === state.currentChatId);
      if (!session) break;

      const amountInput = container.querySelector('[data-role="msg-transfer-amount-input"]');
      const noteInput = container.querySelector('[data-role="msg-transfer-note-input"]');
      const transferAmount = Number(String(amountInput?.value || '').trim());
      const transferNote = String(noteInput?.value || '').trim();

      if (!Number.isFinite(transferAmount) || transferAmount <= 0) {
        renderModalNotice(container, '请输入大于 0 的转账金额');
        break;
      }

      const walletDisplay = getWalletDisplayAmount(state.walletData || {});
      const displayCurrencyCode = walletDisplay.currency.code;
      const rates = state.walletData?.rates && typeof state.walletData.rates === 'object' ? state.walletData.rates : {};
      const displayRate = displayCurrencyCode === 'CNY'
        ? 1
        : Math.max(0, Number(rates[displayCurrencyCode] || 0) || 0);

      if (!Number.isFinite(displayRate) || displayRate <= 0) {
        renderModalNotice(container, '当前钱包币种汇率不可用，请先切换币种后重试');
        break;
      }

      const transferBaseCny = displayCurrencyCode === 'CNY'
        ? transferAmount
        : (transferAmount / displayRate);

      const currentBaseCny = Math.max(0, Number(state.walletData?.balanceBaseCny || 0) || 0);
      if (transferBaseCny > currentBaseCny + 1e-8) {
        renderModalNotice(container, '钱包余额不足');
        break;
      }

      const now = Date.now();
      const nextBaseCny = Math.max(0, currentBaseCny - transferBaseCny);
      const transferDisplayAmount = formatWalletMoney(transferAmount, displayCurrencyCode);

      state.walletData = normalizeWalletData({
        ...state.walletData,
        balanceBaseCny: nextBaseCny,
        ledger: [
          {
            id: `wallet_ledger_${now}_${Math.random().toString(16).slice(2)}`,
            kind: 'transfer',
            direction: 'out',
            title: `转账给 ${String(session.name || '对方').trim() || '对方'}`,
            amountBaseCny: Number(transferBaseCny.toFixed(2)),
            timestamp: now
          },
          ...(Array.isArray(state.walletData?.ledger) ? state.walletData.ledger : [])
        ],
        updatedAt: now
      });

      const transferMessage = {
        id: `user_transfer_${now}_${Math.random().toString(16).slice(2)}`,
        role: 'user',
        type: 'transfer',
        transferDirection: 'outgoing',
        transferStatus: 'pending',
        transferCounterpartyName: String(session.name || '').trim(),
        content: transferDisplayAmount,
        transferDisplayAmount,
        transferCurrency: displayCurrencyCode,
        transferAmount: Number(transferAmount.toFixed(walletDisplay.currency.precision)),
        transferBaseCny: Number(transferBaseCny.toFixed(2)),
        transferNote,
        timestamp: now
      };

      state.currentMessages.push(transferMessage);
      state.coffeeDockOpen = false;
      state.stickerPanelOpen = false;
      session.lastMessage = '[转账]';
      session.lastTime = now;

      await Promise.all([
        persistWalletData(state, db),
        persistCurrentMessages(state, db),
        dbPut(db, DATA_KEY_SESSIONS(state.activeMaskId), state.sessions)
      ]);

      closeModal(container);
      renderCurrentChatMessage(container, state);
      break;
    }

    case 'confirm-send-image-url': {
      const input = container.querySelector('[data-role="msg-image-url-input"]');
      const imageUrl = String(input?.value || '').trim();
      if (!/^https?:\/\/\S+/i.test(imageUrl) && !/^data:image\//i.test(imageUrl)) {
        renderModalNotice(container, '请输入有效的图片 URL');
        break;
      }
      await sendImageMessage(container, state, db, imageUrl, settingsManager, {
        imageName: '链接图片',
        triggerAi: false
      });
      closeModal(container);
      break;
    }

    case 'msg-transfer-open-actions': {
      const messageId = String(target.dataset.messageId || '').trim();
      const transferMessage = (state.currentMessages || []).find(item => String(item.id) === messageId);
      if (!transferMessage || String(transferMessage.type || '') !== 'transfer') break;

      const transferStatus = String(transferMessage.transferStatus || 'pending').trim();
      const statusLabel = transferStatus === 'accepted' ? '已完成' : (transferStatus === 'returned' ? '已关闭' : '等待操作');
      const canOperate = transferStatus === 'pending';

      showTransferActionModal(container, {
        messageId,
        amountLabel: String(transferMessage.transferDisplayAmount || transferMessage.content || '¥0.00'),
        note: String(transferMessage.transferNote || ''),
        statusLabel,
        actionHint: canOperate ? '请选择接收或退回' : `当前转账状态：${statusLabel}`,
        canAccept: canOperate,
        canReturn: canOperate
      });
      break;
    }

    case 'msg-transfer-accept': {
      const messageId = String(target.dataset.messageId || '').trim();
      if (!messageId) break;

      const messageIndex = (state.currentMessages || []).findIndex(item => String(item.id) === messageId);
      if (messageIndex < 0) break;

      const transferMessage = state.currentMessages[messageIndex];
      if (String(transferMessage.type || '') !== 'transfer') break;
      if (String(transferMessage.transferStatus || 'pending') !== 'pending') {
        closeModal(container);
        break;
      }

      const now = Date.now();
      const transferDirection = String(transferMessage.transferDirection || '').trim() || (transferMessage.role === 'assistant' ? 'incoming' : 'outgoing');
      const transferBaseCny = Math.max(0, Number(transferMessage.transferBaseCny || 0) || 0);

      state.currentMessages[messageIndex] = {
        ...transferMessage,
        transferDirection,
        transferStatus: 'accepted',
        transferHandledAt: now
      };

      if (transferDirection === 'incoming' && transferBaseCny > 0) {
        state.walletData = normalizeWalletData({
          ...state.walletData,
          balanceBaseCny: Number(state.walletData?.balanceBaseCny || 0) + transferBaseCny,
          ledger: [
            {
              id: `wallet_ledger_${now}_${Math.random().toString(16).slice(2)}`,
              kind: 'transfer',
              direction: 'in',
              title: `收到 ${String(transferMessage.transferCounterpartyName || '对方').trim() || '对方'} 转账`,
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
        content: transferDirection === 'incoming' ? '你已接收' : '对方已接收',
        timestamp: now + 1
      });

      const session = state.sessions.find(s => s.id === state.currentChatId);
      if (session) {
        session.lastMessage = '[转账]';
        session.lastTime = now;
      }

      await Promise.all([
        persistCurrentMessages(state, db),
        dbPut(db, DATA_KEY_SESSIONS(state.activeMaskId), state.sessions),
        persistWalletData(state, db)
      ]);

      closeModal(container);
      renderCurrentChatMessage(container, state);
      break;
    }

    case 'msg-transfer-return': {
      const messageId = String(target.dataset.messageId || '').trim();
      if (!messageId) break;

      const messageIndex = (state.currentMessages || []).findIndex(item => String(item.id) === messageId);
      if (messageIndex < 0) break;

      const transferMessage = state.currentMessages[messageIndex];
      if (String(transferMessage.type || '') !== 'transfer') break;
      if (String(transferMessage.transferStatus || 'pending') !== 'pending') {
        closeModal(container);
        break;
      }

      const now = Date.now();
      const transferDirection = String(transferMessage.transferDirection || '').trim() || (transferMessage.role === 'assistant' ? 'incoming' : 'outgoing');
      const transferBaseCny = Math.max(0, Number(transferMessage.transferBaseCny || 0) || 0);

      state.currentMessages[messageIndex] = {
        ...transferMessage,
        transferDirection,
        transferStatus: 'returned',
        transferHandledAt: now
      };

      const session = state.sessions.find(s => s.id === state.currentChatId);
      const roleName = String(transferMessage.transferCounterpartyName || session?.name || '对方').trim() || '对方';

      if (transferDirection === 'outgoing' && transferBaseCny > 0) {
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
        content: transferDirection === 'incoming' ? '你已退回' : `${roleName} 已退回`,
        timestamp: now + 1
      });

      if (session) {
        session.lastMessage = '[转账]';
        session.lastTime = now;
      }

      await Promise.all([
        persistCurrentMessages(state, db),
        dbPut(db, DATA_KEY_SESSIONS(state.activeMaskId), state.sessions),
        persistWalletData(state, db)
      ]);

      closeModal(container);
      renderCurrentChatMessage(container, state);
      break;
    }

    case 'msg-sticker':
      state.stickerPanelOpen = !state.stickerPanelOpen;
      if (state.stickerPanelOpen) {
        state.coffeeDockOpen = false;
        state.stickerPanelGroupId = state.stickerPanelGroupId || normalizeStickerData(state.stickerData).activeGroupId || 'all';
      }
      syncMessageDockOpenState(container, state);
      break;

    case 'switch-msg-sticker-group':
      state.stickerPanelGroupId = target.dataset.stickerGroupId || 'all';
      renderMsgStickerPanelGrid(container, state);
      break;

    case 'send-msg-sticker':
      await sendStickerMessage(container, state, db, target.dataset.stickerId, settingsManager, { triggerAi: false });
      {
        const input = container.querySelector('[data-role="msg-input"]');
        if (input) {
          input.value = '';
          syncMessageInputAutoHeight(input);
        }
        syncStickerInputSuggestions(container, state, '');
      }
      break;

    case 'msg-magic':
      await retryLatestAiReply(container, state, db, settingsManager);
      break;

    case 'toggle-msg-search':
      e.preventDefault();
      e.stopPropagation();
      state.chatMessageSearchOpen = !state.chatMessageSearchOpen;
      if (!state.chatMessageSearchOpen) state.chatMessageSearchKeyword = '';
      syncChatMessageSearchPanel(container, state);
      break;

    case 'jump-msg-search-result': {
      e.preventDefault();
      e.stopPropagation();
      const messageId = String(target.dataset.messageId || '').trim();
      if (messageId) scrollToChatSearchResult(container, messageId);
      break;
    }

    case 'load-more-chat-messages': {
      e.preventDefault();
      e.stopPropagation();
      const total = Array.isArray(state.currentMessages) ? state.currentMessages.length : 0;
      const currentVisible = Math.max(CHAT_MESSAGE_INITIAL_VISIBLE_COUNT, Math.floor(Number(state.chatMessageVisibleCount || 0)) || CHAT_MESSAGE_INITIAL_VISIBLE_COUNT);
      state.chatMessageVisibleCount = Math.min(total, currentVisible + CHAT_MESSAGE_LOAD_MORE_STEP);
      renderCurrentChatMessage(container, state, { preservePrependPosition: true });
      break;
    }

    case 'msg-more': {
      const conversation = container.querySelector('[data-role="msg-conversation"]');
      const settingsPage = container.querySelector('[data-role="msg-settings-page"]');
      if (conversation) conversation.style.display = 'none';
      if (settingsPage) settingsPage.style.display = 'flex';
      break;
    }

    case 'open-chat-avatar-source-modal':
      showChatAvatarSourceModal(container, String(target.dataset.avatarTarget || 'character'));
      break;

    case 'open-chat-avatar-local-picker': {
      const input = container.querySelector('[data-role="msg-avatar-file-input"]');
      if (input) {
        input.value = '';
        input.dataset.avatarTarget = String(target.dataset.avatarTarget || 'character');
        input.click();
      }
      break;
    }

    case 'open-chat-avatar-url-modal':
      showChatAvatarUrlModal(container, String(target.dataset.avatarTarget || 'character'));
      break;

    /* ========================================================================
       [区域标注·本次新增·上传头像弹窗删除当前会话头像]
       说明：
       1. 仅删除当前会话 session.avatar / session.userAvatar，并通过 chat-navigation.js 内既有 DB.js / IndexedDB 链路持久化。
       2. 不修改通讯录联系人原始头像，不引入 localStorage/sessionStorage，不增加双份兜底。
       3. 删除成功后关闭当前 chat-modal；删除失败时沿用现有应用内提示文案。
       ======================================================================== */
    case 'delete-current-chat-avatar': {
      const avatarTarget = String(target.dataset.avatarTarget || 'character');
      const deleted = avatarTarget === 'user'
        ? await deleteCurrentChatSessionUserAvatar(container, state, db)
        : await deleteCurrentChatSessionAvatar(container, state, db);
      if (!deleted) {
        renderModalNotice(container, '当前会话不存在，无法删除头像');
        break;
      }
      closeModal(container);
      break;
    }

    case 'confirm-chat-avatar-url': {
      const input = container.querySelector('[data-role="chat-avatar-url-input"]');
      const modal = container.querySelector('[data-role="chat-avatar-url-modal"]');
      const avatarTarget = String(modal?.dataset.avatarTarget || 'character');
      const imageUrl = String(input?.value || '').trim();
      if (!/^https?:\/\/\S+/i.test(imageUrl) && !/^data:image\//i.test(imageUrl)) {
        renderModalNotice(container, '请输入有效的图片 URL');
        break;
      }
      showChatAvatarCropModal(container, {
        imageUrl,
        source: 'url',
        fileName: '链接头像',
        avatarTarget
      });
      break;
    }

    case 'save-chat-avatar-original':
    case 'save-chat-avatar-compressed':
    case 'save-chat-avatar-cropped': {
      try {
        const mode = action === 'save-chat-avatar-original'
          ? 'original'
          : (action === 'save-chat-avatar-compressed' ? 'compressed' : 'cropped');
        const cropModal = container.querySelector('[data-role="chat-avatar-crop-modal"]');
        const avatarTarget = String(cropModal?.dataset.avatarTarget || 'character');
        const avatarUrl = await buildChatAvatarFromCropModal(container, mode);
        if (!avatarUrl) {
          renderModalNotice(container, '头像生成失败，请重新选择图片');
          break;
        }
        const saved = avatarTarget === 'user'
          ? await saveCurrentChatSessionUserAvatar(container, state, db, avatarUrl)
          : await saveCurrentChatSessionAvatar(container, state, db, avatarUrl);
        if (!saved) {
          renderModalNotice(container, '当前会话不存在，无法保存头像');
          break;
        }
        closeModal(container);
      } catch (error) {
        renderModalNotice(container, error?.message || '头像保存失败；如使用跨域 URL，请选择“原图头像”或换用本地上传');
      }
      break;
    }

    case 'open-chat-export-modal':
      showChatExportFormatModal(container);
      break;

    case 'confirm-chat-export': {
      try {
        const format = String(target.dataset.exportFormat || '').trim();
        const count = exportCurrentChatMessages(state, format);
        showChatExportImportNoticeModal(container, {
          title: '导出完成',
          message: `已导出当前联系人 ${count} 条聊天记录。`
        });
      } catch (error) {
        showChatExportImportNoticeModal(container, {
          title: '导出失败',
          message: error?.message || '聊天记录导出失败，请稍后重试。'
        });
      }
      break;
    }

    case 'open-chat-import-json-picker':
      if (!openChatImportJsonFilePicker(container)) {
        showChatExportImportNoticeModal(container, {
          title: '导入失败',
          message: '当前页面未找到导入入口，请重新进入聊天设置页后再试。'
        });
      }
      break;

    case 'open-clear-current-chat-images-modal':
      showClearCurrentChatImagesModal(container, state);
      break;

    case 'open-clear-all-messages-modal':
      showClearAllMessagesModal(container, state);
      break;

    case 'confirm-clear-current-chat-images': {
      const { changedIds } = expireCurrentChatImages(state.currentMessages);
      if (!changedIds.length) {
        closeModal(container);
        break;
      }

      resetMessageSelectionState(state);
      refreshCurrentSessionLastMessage(state);
      await Promise.all([
        persistCurrentMessages(state, db),
        dbPut(db, DATA_KEY_SESSIONS(state.activeMaskId), state.sessions)
      ]);
      closeModal(container);
      refreshMessageBubbleRows(container, state, changedIds);
      break;
    }

    case 'confirm-clear-all-messages': {
      clearCurrentChatMessages(state);
      resetMessageSelectionState(state);
      refreshCurrentSessionLastMessage(state);
      await Promise.all([
        persistCurrentMessages(state, db),
        dbPut(db, DATA_KEY_SESSIONS(state.activeMaskId), state.sessions)
      ]);
      closeModal(container);
      renderCurrentChatMessage(container, state);
      break;
    }

    case 'msg-media-open-zoom': {
      const mediaKind = String(target.dataset.mediaKind || '').trim();
      const mediaSrc = String(target.dataset.mediaSrc || '').trim();
      const mediaSrcdoc = String(target.dataset.mediaSrcdoc || '').trim();
      const mediaAlt = String(target.dataset.mediaAlt || '').trim() || '预览内容';
      const zoomOverlay = container.querySelector('[data-role="msg-media-zoom-overlay"]');
      const zoomBody = container.querySelector('[data-role="msg-media-zoom-body"]');
      if (!zoomOverlay || !zoomBody) break;

      const isImage = mediaKind === 'image' && mediaSrc;
      const isHtmlCard = mediaKind === 'html-card' && mediaSrcdoc;
      if (!isImage && !isHtmlCard) break;

      e.preventDefault();
      e.stopPropagation();

      zoomBody.innerHTML = isImage
        ? `<img class="msg-media-zoom-image" src="${escapeHtml(mediaSrc)}" alt="${escapeHtml(mediaAlt)}" decoding="async">`
        : `
          <iframe
            class="msg-media-zoom-frame"
            sandbox="allow-forms allow-popups-to-escape-sandbox"
            loading="lazy"
            referrerpolicy="no-referrer"
            srcdoc="${escapeHtml(mediaSrcdoc)}"
            title="${escapeHtml(mediaAlt)}"></iframe>
        `;
      zoomOverlay.classList.add('is-open');
      break;
    }

    case 'msg-media-close-zoom': {
      const zoomOverlay = container.querySelector('[data-role="msg-media-zoom-overlay"]');
      const zoomBody = container.querySelector('[data-role="msg-media-zoom-body"]');
      if (!zoomOverlay || !zoomBody) break;
      e.preventDefault();
      e.stopPropagation();
      zoomOverlay.classList.remove('is-open');
      zoomBody.innerHTML = '';
      break;
    }

    case 'msg-bubble-select': {
      const messageId = String(target.dataset.messageId || '');
      if (!messageId) break;
      const asideBubble = target.closest('.msg-aside-bubble');
      const asideSegmentId = String(asideBubble?.dataset?.asideSegmentId || '').trim();
      const previousSelectedId = state.selectedMessageId;
      const previousDeleteConfirmId = state.deleteConfirmMessageId;
      const previousRewindConfirmId = state.rewindConfirmMessageId;
      state.multiSelectMode = false;
      state.selectedMessageIds = [];
      state.selectedMessageId = messageId;
      state.selectedAsideSegmentId = asideSegmentId;
      state.deleteConfirmMessageId = '';
      state.rewindConfirmMessageId = '';
      refreshMessageBubbleRows(container, state, [previousSelectedId, previousDeleteConfirmId, previousRewindConfirmId, messageId]);
      break;
    }

    case 'msg-system-tip-select': {
      const messageId = String(target.dataset.messageId || '');
      if (!messageId) break;
      const previousSelectedId = state.selectedMessageId;
      const previousDeleteConfirmId = state.deleteConfirmMessageId;
      const previousRewindConfirmId = state.rewindConfirmMessageId;
      state.multiSelectMode = false;
      state.selectedMessageIds = [];
      state.selectedMessageId = messageId;
      state.deleteConfirmMessageId = '';
      state.rewindConfirmMessageId = '';
      refreshMessageBubbleRows(container, state, [previousSelectedId, previousDeleteConfirmId, previousRewindConfirmId, messageId]);
      break;
    }

    case 'msg-bubble-fix-format':
    case 'msg-system-tip-fix-format': {
      const messageId = String(target.dataset.messageId || state.selectedMessageId || '');
      if (!messageId) break;
      showAiFormatRepairTypeModal(container, messageId);
      break;
    }

    /* ========================================================================
       [区域标注·已完成·本次角色气泡拍拍点击接线]
       说明：
       1. 仅响应角色方消息气泡功能栏的“拍拍”按钮，实际合法性由 chat-user-pat.js 再校验。
       2. 点击后追加 user_pat_system 系统提示小字，并立即以 skipAppendUser 触发下一轮 AI 回复。
       3. 设置页“拍一拍”分支不自动触发 AI，避免扩大本次修改范围。
       4. 持久化沿用 chat-user-pat.js 内 DB.js / IndexedDB 链路；不使用 localStorage/sessionStorage，不写双份兜底。
       ======================================================================== */
    case 'msg-bubble-pat': {
      const messageId = String(target.dataset.messageId || state.selectedMessageId || '').trim();
      if (!messageId || state.isAiSending) break;

      const previousSelectedId = state.selectedMessageId;
      const previousDeleteConfirmId = state.deleteConfirmMessageId;
      const previousRewindConfirmId = state.rewindConfirmMessageId;
      const sent = await handleSendUserPatFromBubbleToolbar({
        state,
        container,
        db,
        messageId
      });
      if (!sent) break;

      state.selectedMessageId = '';
      state.selectedAsideSegmentId = '';
      state.deleteConfirmMessageId = '';
      state.rewindConfirmMessageId = '';
      refreshMessageBubbleRows(container, state, [previousSelectedId, previousDeleteConfirmId, previousRewindConfirmId, messageId]);
      await sendMessage(container, state, db, '', settingsManager, { skipAppendUser: true, triggerAi: true });
      break;
    }

    case 'msg-system-tip-view-withdrawn': {
      const messageId = String(target.dataset.messageId || state.selectedMessageId || '');
      const message = (state.currentMessages || []).find(item => String(item.id) === messageId);
      if (!message || String(message.type || '') !== 'ai_withdraw_system') break;
      showAiWithdrawnMessageModal(container, message);
      break;
    }

    case 'apply-ai-format-repair': {
      const messageId = String(target.dataset.messageId || state.selectedMessageId || '');
      const repairType = String(target.dataset.repairType || 'sticker');
      const messageIndex = (state.currentMessages || []).findIndex(message => String(message.id) === messageId);
      if (messageIndex < 0) break;

      const sourceMessage = state.currentMessages[messageIndex];
      const repairedMessage = repairType === 'text'
        ? repairAiTextMessageFormatIfPossible(sourceMessage, state)
        : (repairType === 'quote'
            ? repairAiQuoteMessageFormatIfPossible(sourceMessage, state)
            : (repairType === 'system'
                ? repairAiSystemTipFormatIfPossible(sourceMessage, state)
                : (repairType === 'voice'
                    ? repairAiVoiceMessageFormatIfPossible(sourceMessage, state)
                    : (repairType === 'aside'
                        ? repairAiAsideMessageFormatIfPossible(sourceMessage, state)
                        : repairAiMessageFormatIfPossible(sourceMessage, state)))));

      const repairLabel = repairType === 'text'
        ? '文本'
        : (repairType === 'quote'
            ? '引用'
            : (repairType === 'system'
                ? '系统提示'
                : (repairType === 'voice'
                    ? '语音'
                    : (repairType === 'aside' ? '旁白' : '表情包'))));

      if (!repairedMessage) {
        showAiFormatRepairResultModal(container, {
          success: false,
          title: '无法修正',
          message: `未识别到可修复的${repairLabel}掉格式内容。请确认这条 AI 消息中仍保留对应协议残片或可匹配内容。`
        });
        break;
      }

      state.currentMessages[messageIndex] = repairedMessage;
      state.deleteConfirmMessageId = '';
      state.selectedMessageId = messageId;
      refreshCurrentSessionLastMessage(state);
      await Promise.all([
        persistCurrentMessages(state, db),
        dbPut(db, DATA_KEY_SESSIONS(state.activeMaskId), state.sessions)
      ]);
      refreshMessageBubbleRows(container, state, [messageId]);
      showAiFormatRepairResultModal(container, {
        success: true,
        title: '修正完成',
        message: `已完成${repairLabel}格式修正，并保存到当前聊天记录。`
      });
      break;
    }

    case 'msg-bubble-edit': {
      const messageId = String(target.dataset.messageId || state.selectedMessageId || '');
      const asideBubble = target.closest('.msg-aside-bubble');
      const asideSegmentId = String(
        target.dataset.asideSegmentId
        || asideBubble?.dataset?.asideSegmentId
        || state.selectedAsideSegmentId
        || ''
      ).trim();
      if (messageId && asideBubble && asideSegmentId) {
        showEditAsideModal(container, state, messageId, asideSegmentId);
        break;
      }
      if (messageId) showEditMessageModal(container, state, messageId);
      break;
    }

    case 'msg-bubble-withdraw': {
      const messageId = String(target.dataset.messageId || state.selectedMessageId || '');
      const message = (state.currentMessages || []).find(item => String(item.id) === messageId);
      if (!message || message.role !== 'user' || String(message.type || '') === 'user_withdraw_system') break;
      showUserWithdrawMessageModal(container, message);
      break;
    }

    case 'confirm-user-withdraw-message': {
      const messageId = String(target.dataset.messageId || '').trim();
      const messageIndex = (state.currentMessages || []).findIndex(message => String(message.id) === messageId);
      if (messageIndex < 0) break;

      const sourceMessage = state.currentMessages[messageIndex];
      if (!sourceMessage || sourceMessage.role !== 'user' || String(sourceMessage.type || '') === 'user_withdraw_system') break;

      const now = Date.now();
      const withdrawnVisibleToAi = String(target.dataset.aiVisible || '0') === '1';
      const withdrawnText = String(
        sourceMessage.type === 'sticker'
          ? `[表情包] ${sourceMessage.stickerName || sourceMessage.content || ''}`
          : (sourceMessage.type === 'image'
              ? `[图片] ${sourceMessage.imageName || sourceMessage.content || ''}`
              : (sourceMessage.type === 'transfer'
                  ? `[转账] ${sourceMessage.transferDisplayAmount || sourceMessage.content || ''}`
                  : (sourceMessage.content || '')))
      ).trim();

      state.currentMessages.splice(messageIndex, 1, {
        id: `user_withdraw_system_${now}_${Math.random().toString(16).slice(2)}`,
        role: 'user',
        type: 'user_withdraw_system',
        content: '你撤回了一条消息',
        withdrawnContent: withdrawnText,
        withdrawnVisibleToAi,
        withdrawnAt: now,
        originalMessageId: messageId,
        timestamp: now
      });

      resetMessageSelectionState(state);
      refreshCurrentSessionLastMessage(state);
      await Promise.all([
        persistCurrentMessages(state, db),
        dbPut(db, DATA_KEY_SESSIONS(state.activeMaskId), state.sessions)
      ]);

      closeModal(container);
      refreshCurrentMessageListOnly(container, state);
      break;
    }

    case 'msg-bubble-quote': {
      const messageId = String(target.dataset.messageId || state.selectedMessageId || '');
      const message = (state.currentMessages || []).find(item => String(item.id) === messageId);
      const session = state.sessions.find(item => String(item.id) === String(state.currentChatId)) || {};
      if (!message) break;

      const previousSelectedId = state.selectedMessageId;
      const previousDeleteConfirmId = state.deleteConfirmMessageId;
      const previousRewindConfirmId = state.rewindConfirmMessageId;
      state.pendingQuote = createQuotePayloadFromMessage(message, session, state.profile || {});
      state.selectedMessageId = '';
      state.deleteConfirmMessageId = '';
      state.rewindConfirmMessageId = '';
      state.coffeeDockOpen = false;
      state.stickerPanelOpen = false;

      syncMessageDockOpenState(container, state);
      if (!syncPendingQuoteComposer(container, state)) {
        renderCurrentChatMessage(container, state, { keepScroll: true });
      } else {
        refreshMessageBubbleRows(container, state, [previousSelectedId, previousDeleteConfirmId, previousRewindConfirmId, messageId]);
      }
      break;
    }

    case 'cancel-msg-quote': {
      state.pendingQuote = null;
      if (!syncPendingQuoteComposer(container, state)) {
        renderCurrentChatMessage(container, state, { keepScroll: true });
      }
      break;
    }

    case 'confirm-edit-message': {
      const messageId = String(target.dataset.messageId || '');
      const input = container.querySelector('[data-role="edit-message-content-input"]');
      const value = String(input?.value || '').trim();
      if (!messageId || !value) {
        renderModalNotice(container, '请输入消息内容');
        break;
      }
      const index = (state.currentMessages || []).findIndex(message => String(message.id) === messageId);
      if (index < 0) break;
      state.currentMessages[index] = { ...state.currentMessages[index], content: value, editedAt: Date.now() };
      state.selectedMessageId = messageId;
      state.selectedAsideSegmentId = '';
      state.deleteConfirmMessageId = '';
      refreshCurrentSessionLastMessage(state);
      await Promise.all([
        persistCurrentMessages(state, db),
        dbPut(db, DATA_KEY_SESSIONS(state.activeMaskId), state.sessions)
      ]);
      closeModal(container);
      refreshMessageBubbleRows(container, state, [messageId]);
      break;
    }

    case 'confirm-edit-aside': {
      const messageId = String(target.dataset.messageId || '').trim();
      const asideSegmentId = String(target.dataset.asideSegmentId || '').trim();
      const input = container.querySelector('[data-role="edit-aside-content-input"]');
      const value = String(input?.value || '').trim();
      if (!messageId || !asideSegmentId || !value) {
        renderModalNotice(container, '请输入旁白内容');
        break;
      }

      const index = (state.currentMessages || []).findIndex(message => String(message.id) === messageId);
      if (index < 0) break;

      const sourceMessage = state.currentMessages[index] || {};
      const nextAsideSegments = Array.isArray(sourceMessage.asideSegments)
        ? sourceMessage.asideSegments.map((segment, segmentIndex) => {
            const fallbackId = String(segment?.id || `${sourceMessage?.id || 'aside'}_${segmentIndex + 1}`);
            return fallbackId === asideSegmentId
              ? { ...segment, id: fallbackId, text: value }
              : { ...segment, id: fallbackId };
          })
        : [];

      const hasMatchedAsideSegment = nextAsideSegments.some(segment => String(segment?.id || '') === asideSegmentId);
      if (!hasMatchedAsideSegment && !String(sourceMessage.asideText || '').trim()) break;

      state.currentMessages[index] = {
        ...sourceMessage,
        asideSegments: hasMatchedAsideSegment ? nextAsideSegments : sourceMessage.asideSegments,
        asideText: hasMatchedAsideSegment
          ? nextAsideSegments
              .map(segment => String(segment?.text || '').trim())
              .filter(Boolean)
              .join('\n')
          : value,
        editedAt: Date.now()
      };
      state.selectedMessageId = messageId;
      state.selectedAsideSegmentId = asideSegmentId;
      state.deleteConfirmMessageId = '';
      await Promise.all([
        persistCurrentMessages(state, db),
        dbPut(db, DATA_KEY_SESSIONS(state.activeMaskId), state.sessions)
      ]);
      closeModal(container);
      refreshMessageBubbleRows(container, state, [messageId]);
      break;
    }

    case 'msg-bubble-favorite': {
      const messageId = String(target.dataset.messageId || state.selectedMessageId || '');
      if (!messageId) break;
      const message = (state.currentMessages || []).find(item => String(item.id) === messageId);
      if (!message) break;

      await addMessagesToFavorites(container, state, db, [message]);

      const previousSelectedId = state.selectedMessageId;
      const previousDeleteConfirmId = state.deleteConfirmMessageId;
      const previousRewindConfirmId = state.rewindConfirmMessageId;
      state.selectedMessageId = '';
      state.deleteConfirmMessageId = '';
      state.rewindConfirmMessageId = '';
      refreshMessageBubbleRows(container, state, [previousSelectedId, previousDeleteConfirmId, previousRewindConfirmId, messageId]);
      break;
    }

    case 'msg-bubble-copy': {
      const messageId = String(target.dataset.messageId || state.selectedMessageId || '');
      if (!messageId) break;
      const message = (state.currentMessages || []).find(item => String(item.id) === messageId);
      if (!message) break;

      const copyText = String(
        message.type === 'sticker'
          ? (message.stickerName || message.content || '')
          : (message.type === 'image'
              ? (message.imageName || message.content || '')
              : (message.type === 'transfer'
                  ? (message.transferDisplayAmount || message.content || '')
                  : (message.content || '')))
      ).trim();
      if (!copyText) break;

      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(copyText);
        } else {
          const textarea = document.createElement('textarea');
          textarea.value = copyText;
          textarea.setAttribute('readonly', 'readonly');
          textarea.style.position = 'fixed';
          textarea.style.left = '-9999px';
          textarea.style.top = '0';
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand('copy');
          textarea.remove();
        }
      } catch (error) {
        break;
      }

      const previousSelectedId = state.selectedMessageId;
      const previousDeleteConfirmId = state.deleteConfirmMessageId;
      const previousRewindConfirmId = state.rewindConfirmMessageId;
      state.selectedMessageId = '';
      state.deleteConfirmMessageId = '';
      state.rewindConfirmMessageId = '';
      refreshMessageBubbleRows(container, state, [previousSelectedId, previousDeleteConfirmId, previousRewindConfirmId, messageId]);
      break;
    }

    case 'msg-bubble-delete': {
      const messageId = String(target.dataset.messageId || state.selectedMessageId || '');
      if (!messageId) break;
      const previousSelectedId = state.selectedMessageId;
      const previousDeleteConfirmId = state.deleteConfirmMessageId;
      const previousRewindConfirmId = state.rewindConfirmMessageId;
      state.deleteConfirmMessageId = state.deleteConfirmMessageId === messageId ? '' : messageId;
      state.rewindConfirmMessageId = '';
      state.selectedMessageId = messageId;
      refreshMessageBubbleRows(container, state, [previousSelectedId, previousDeleteConfirmId, previousRewindConfirmId, messageId]);
      break;
    }

    case 'msg-system-tip-delete': {
      const messageId = String(target.dataset.messageId || state.selectedMessageId || '');
      if (!messageId) break;
      const previousSelectedId = state.selectedMessageId;
      const previousDeleteConfirmId = state.deleteConfirmMessageId;
      state.deleteConfirmMessageId = state.deleteConfirmMessageId === messageId ? '' : messageId;
      state.selectedMessageId = messageId;
      refreshMessageBubbleRows(container, state, [previousSelectedId, previousDeleteConfirmId, messageId]);
      break;
    }

    case 'msg-bubble-confirm-delete': {
      const messageId = String(target.dataset.messageId || state.deleteConfirmMessageId || state.selectedMessageId || '');
      if (!messageId || state.deleteConfirmMessageId !== messageId) break;
      state.currentMessages = (state.currentMessages || []).filter(message => String(message.id) !== messageId);
      resetMessageSelectionState(state);
      refreshCurrentSessionLastMessage(state);
      await Promise.all([
        persistCurrentMessages(state, db),
        dbPut(db, DATA_KEY_SESSIONS(state.activeMaskId), state.sessions)
      ]);
      refreshCurrentMessageListOnly(container, state);
      break;
    }

    case 'msg-bubble-rewind': {
      const messageId = String(target.dataset.messageId || state.selectedMessageId || '');
      if (!messageId) break;
      const previousSelectedId = state.selectedMessageId;
      const previousDeleteConfirmId = state.deleteConfirmMessageId;
      const previousRewindConfirmId = state.rewindConfirmMessageId;
      state.selectedMessageId = messageId;
      state.deleteConfirmMessageId = '';
      state.rewindConfirmMessageId = state.rewindConfirmMessageId === messageId ? '' : messageId;
      refreshMessageBubbleRows(container, state, [previousSelectedId, previousDeleteConfirmId, previousRewindConfirmId, messageId]);
      break;
    }

    case 'msg-bubble-confirm-rewind': {
      const messageId = String(target.dataset.messageId || state.rewindConfirmMessageId || state.selectedMessageId || '');
      if (!messageId || state.rewindConfirmMessageId !== messageId) break;
      const messageIndex = (state.currentMessages || []).findIndex(message => String(message.id) === messageId);
      if (messageIndex < 0) break;

      state.currentMessages = (state.currentMessages || []).slice(0, messageIndex + 1);
      resetMessageSelectionState(state);
      refreshCurrentSessionLastMessage(state);
      await Promise.all([
        persistCurrentMessages(state, db),
        dbPut(db, DATA_KEY_SESSIONS(state.activeMaskId), state.sessions)
      ]);
      refreshCurrentMessageListOnly(container, state);
      break;
    }

    case 'msg-system-tip-confirm-delete': {
      const messageId = String(target.dataset.messageId || state.deleteConfirmMessageId || state.selectedMessageId || '');
      if (!messageId || state.deleteConfirmMessageId !== messageId) break;
      state.currentMessages = (state.currentMessages || []).filter(message => String(message.id) !== messageId);
      resetMessageSelectionState(state);
      refreshCurrentSessionLastMessage(state);
      await Promise.all([
        persistCurrentMessages(state, db),
        dbPut(db, DATA_KEY_SESSIONS(state.activeMaskId), state.sessions)
      ]);
      refreshCurrentMessageListOnly(container, state);
      break;
    }

    case 'msg-bubble-multi': {
      const messageId = String(target.dataset.messageId || state.selectedMessageId || '');
      if (!messageId) break;
      state.selectedMessageId = '';
      state.selectedAsideSegmentId = '';
      state.deleteConfirmMessageId = '';
      state.multiSelectMode = true;
      state.selectedMessageIds = [messageId];
      renderCurrentChatMessage(container, state, { keepScroll: true });
      break;
    }

    case 'msg-multi-toggle': {
      const messageId = String(target.dataset.messageId || '');
      if (!messageId) break;
      const selectedSet = new Set((state.selectedMessageIds || []).map(String));
      if (selectedSet.has(messageId)) {
        selectedSet.delete(messageId);
      } else {
        selectedSet.add(messageId);
      }
      state.selectedMessageIds = Array.from(selectedSet);
      refreshMessageBubbleRows(container, state, [messageId]);
      updateMultiSelectActionBar(container, state);
      break;
    }

    case 'msg-multi-cancel':
      resetMessageSelectionState(state);
      renderCurrentChatMessage(container, state, { keepScroll: true });
      break;

    case 'msg-multi-delete-selected': {
      const selectedSet = new Set((state.selectedMessageIds || []).map(String));
      if (!selectedSet.size) break;
      state.currentMessages = (state.currentMessages || []).filter(message => !selectedSet.has(String(message.id)));
      resetMessageSelectionState(state);
      refreshCurrentSessionLastMessage(state);
      await Promise.all([
        persistCurrentMessages(state, db),
        dbPut(db, DATA_KEY_SESSIONS(state.activeMaskId), state.sessions)
      ]);
      renderCurrentChatMessage(container, state);
      break;
    }

    case 'msg-multi-favorite-selected': {
      const selectedMessages = getSelectedMessages(state);
      if (!selectedMessages.length) break;
      await addMessagesToFavorites(container, state, db, selectedMessages);
      resetMessageSelectionState(state);
      renderCurrentChatMessage(container, state, { keepScroll: true });
      break;
    }

    case 'msg-multi-forward':
      if ((state.selectedMessageIds || []).length) showForwardMessagesModal(container, state);
      break;

    case 'confirm-forward-messages': {
      const targetChatId = String(target.dataset.chatId || '');
      const targetSession = state.sessions.find(session => String(session.id) === targetChatId);
      const selectedMessages = getSelectedMessages(state);
      if (!targetSession || !selectedMessages.length) break;

      const targetKey = DATA_KEY_MESSAGES_PREFIX(state.activeMaskId) + targetChatId;
      const targetMessages = (await dbGet(db, targetKey)) || [];
      const now = Date.now();
      const forwardedMessages = selectedMessages.map((message, index) => ({
        id: `forward_${now}_${index}`,
        role: 'user',
        content: String(message.content || ''),
        timestamp: now + index
      })).filter(message => message.content.trim());

      targetMessages.push(...forwardedMessages);
      targetSession.lastMessage = forwardedMessages[forwardedMessages.length - 1]?.content || targetSession.lastMessage || '';
      targetSession.lastTime = now;

      await Promise.all([
        dbPut(db, targetKey, targetMessages),
        dbPut(db, DATA_KEY_SESSIONS(state.activeMaskId), state.sessions)
      ]);

      resetMessageSelectionState(state);
      closeModal(container);
      renderCurrentChatMessage(container, state);
      break;
    }

    case 'msg-settings-back':
      e.preventDefault();
      e.stopPropagation();
      renderCurrentChatMessage(container, state);
      break;

    case 'toggle-external-context':
      state.chatPromptSettings.externalContextEnabled = !state.chatPromptSettings.externalContextEnabled;
      await dbPut(db, getCurrentChatPromptSettingsKey(state), state.chatPromptSettings);
      target.classList.toggle('is-on', state.chatPromptSettings.externalContextEnabled);
      break;

    case 'toggle-show-user-avatar-to-role':
      state.chatPromptSettings.showUserAvatarToRole = !state.chatPromptSettings.showUserAvatarToRole;
      await dbPut(db, getCurrentChatPromptSettingsKey(state), state.chatPromptSettings);
      target.classList.toggle('is-on', state.chatPromptSettings.showUserAvatarToRole);
      break;

    /* ========================================================================
       [区域标注·本次修改·头像与备注3点需求：隐藏当前会话消息头像开关]
       说明：
       1. 仅写入当前面具 + 当前聊天对象的 chatPromptSettings.hideAvatars。
       2. 持久化统一走 DB.js / IndexedDB，不使用 localStorage/sessionStorage，不写双份兜底。
       3. 切换后只局部刷新当前消息列表，避免整页重建导致设置页闪屏。
       ======================================================================== */
    case 'toggle-chat-hide-avatars':
      state.chatPromptSettings.hideAvatars = !state.chatPromptSettings.hideAvatars;
      await dbPut(db, getCurrentChatPromptSettingsKey(state), state.chatPromptSettings);
      target.classList.toggle('is-on', state.chatPromptSettings.hideAvatars);
      refreshCurrentMessageListOnly(container, state);
      break;

    case 'toggle-time-awareness':
      state.chatPromptSettings.timeAwarenessEnabled = !state.chatPromptSettings.timeAwarenessEnabled;
      await dbPut(db, getCurrentChatPromptSettingsKey(state), state.chatPromptSettings);
      target.classList.toggle('is-on', state.chatPromptSettings.timeAwarenessEnabled);
      break;

    case 'toggle-html-card':
      state.chatPromptSettings.htmlCardEnabled = !state.chatPromptSettings.htmlCardEnabled;
      await dbPut(db, getCurrentChatPromptSettingsKey(state), state.chatPromptSettings);
      target.classList.toggle('is-on', state.chatPromptSettings.htmlCardEnabled);
      break;

    /* ========================================================================
       [区域标注·已完成·聊天控制/功能玩法抽屉点击接线修复]
       说明：
       1. 已修复聊天设置页“聊天控制”内四个小板块的右侧 IconPark 风格折叠按钮点击后不展开的问题。
       2. 本分支同时兼容“聊天控制”小板块与“功能玩法”拍一拍/表情包挂载抽屉，只切换当前点击项的 is-open 与 aria-expanded。
       3. 不重渲染聊天设置页，不写入 DB.js / IndexedDB，避免页面闪屏；具体设置值仍由原输入/开关逻辑持久化。
       4. 不使用 localStorage/sessionStorage，不使用原生弹窗或原生选择器。
       ======================================================================== */
    case 'toggle-settings-sticker-drawer': {
      const drawerBlock = target.closest('.msg-settings-chat-control-item, .msg-settings-feature-play-pat, .msg-settings-feature-play-sticker');
      if (!drawerBlock) break;
      const nextOpen = !drawerBlock.classList.contains('is-open');
      drawerBlock.classList.toggle('is-open', nextOpen);
      target.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
      break;
    }

    /* ========================================================================
       [区域标注·已完成·自主活动设置点击接线]
       说明：
       1. 本区只把“自主活动”模块的点击事件转交给 chat-autonomous-activity-settings.js。
       2. 实际状态规范化、抽屉同步与 DB.js / IndexedDB 持久化均在独立模块内完成。
       3. 不使用 localStorage/sessionStorage，不改动其它聊天设置分支。
       ======================================================================== */
    /* ========================================================================
       [区域标注·已完成·本次4项修改：长期记忆设置点击接线]
       说明：
       1. 本区只把“长期记忆”的自动总结、手动立即总结、人称按钮转交给 chat-memory-settings.js。
       2. 实际副 API 调用、旧事写入、应用内完成/失败提示与 DB.js / IndexedDB 持久化均在独立模块内完成。
       3. 不使用 localStorage/sessionStorage，不使用原生浏览器弹窗，不改动其它聊天设置分支。
       ======================================================================== */
    case 'toggle-long-term-memory-custom-prompt':
    case 'open-long-term-memory-manager':
    case 'toggle-long-term-memory-auto-summary':
    case 'set-long-term-memory-summary-person':
    case 'toggle-long-term-memory-manual-summary':
      await handleChatMemorySettingsClick({
        action,
        target,
        state,
        container,
        db,
        settingsManager,
        eventBus
      });
      break;

    case 'toggle-autonomous-moments':
    case 'set-autonomous-moments-interval-unit':
      await handleAutonomousActivitySettingsClick({
        action,
        target,
        state,
        container,
        db
      });
      break;

    case 'toggle-chat-console':
      state.chatConsoleEnabled = !state.chatConsoleEnabled;
      if (!state.chatConsoleEnabled) state.chatConsoleExpanded = false;
      await persistCurrentChatConsoleEnabled(state, db);
      syncChatConsoleDock(container, state);
      target.classList.toggle('is-on', state.chatConsoleEnabled);
      break;

    case 'toggle-chat-console-expand':
      state.chatConsoleExpanded = !state.chatConsoleExpanded;
      syncChatConsoleDock(container, state);
      break;

    case 'set-chat-console-filter-warn-error':
      state.chatConsoleWarnErrorOnly = true;
      syncChatConsoleDock(container, state);
      break;

    case 'set-chat-console-filter-all':
      state.chatConsoleWarnErrorOnly = false;
      syncChatConsoleDock(container, state);
      break;

    case 'clear-chat-console-logs':
      state.chatConsoleLogs = [];
      await persistCurrentChatConsoleLogs(state, db);
      syncChatConsoleDock(container, state);
      break;

    case 'copy-chat-console-logs': {
      const text = (state.chatConsoleLogs || []).map(item => `[${item.time}] ${String(item.level || 'info').toUpperCase()} ${item.text}`).join('\n');
      if (!text) break;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
        }
      } catch (_) {}
      break;
    }

    /* ========================================================================
       [区域标注·已完成·本次拍一拍独立模块发送接线]
       说明：
       1. 仅把聊天设置页“功能玩法 → 拍一拍”的发送按钮转交给 chat-user-pat.js。
       2. 消息创建、DB.js / IndexedDB 持久化、局部追加消息与聊天列表摘要刷新均在独立模块内完成。
       3. 本分支不保留拍一拍内联实现，方便下次直接修改 chat-user-pat.js。
       4. 不使用 localStorage/sessionStorage，不写双份兜底，不使用原生弹窗或原生选择器。
       ======================================================================== */
    case 'send-user-pat-message':
      await handleSendUserPatMessage({ state, container, db });
      break;

    case 'toggle-mounted-sticker-group': {
      const groupId = String(target.dataset.stickerGroupId || '').trim();
      if (!groupId) break;
      const current = new Set(Array.isArray(state.chatPromptSettings.mountedStickerGroupIds) ? state.chatPromptSettings.mountedStickerGroupIds.map(String) : []);
      if (current.has(groupId)) {
        current.delete(groupId);
      } else {
        if (groupId === 'all') {
          current.clear();
          current.add('all');
        } else {
          current.delete('all');
          current.add(groupId);
        }
      }
      state.chatPromptSettings.mountedStickerGroupIds = Array.from(current);
      await dbPut(db, getCurrentChatPromptSettingsKey(state), state.chatPromptSettings);
      syncMountedStickerGroupButtons(container, state);
      break;
    }

    case 'msg-feature-placeholder':
      break;

    case 'open-wallet':
      openSubPage(container, state, 'wallet');
      break;

    case 'open-wallet-recharge-modal':
      showWalletRechargeModal(container, state);
      break;

    case 'confirm-wallet-recharge': {
      const input = container.querySelector('[data-role="wallet-recharge-input"]');
      const amount = Number(String(input?.value || '').trim());
      if (!Number.isFinite(amount) || amount <= 0) {
        renderModalNotice(container, '请输入大于 0 的充值金额');
        break;
      }
      const now = Date.now();
      state.walletData = normalizeWalletData({
        ...state.walletData,
        balanceBaseCny: Number(state.walletData?.balanceBaseCny || 0) + amount,
        ledger: [
          {
            id: `wallet_ledger_${now}_${Math.random().toString(16).slice(2)}`,
            kind: 'recharge',
            direction: 'in',
            title: '钱包充值',
            amountBaseCny: Number(amount.toFixed(2)),
            timestamp: now
          },
          ...(Array.isArray(state.walletData?.ledger) ? state.walletData.ledger : [])
        ],
        updatedAt: now
      });
      await persistWalletData(state, db);
      closeModal(container);
      rerenderCurrentSubPage(container, state);
      break;
    }

    case 'open-wallet-currency-modal':
      state.walletDraftCurrency = String(state.walletData?.displayCurrency || 'CNY').toUpperCase();
      showWalletCurrencyModal(container, state);
      break;

    case 'select-wallet-currency': {
      const currencyCode = String(target.dataset.walletCurrency || 'CNY').toUpperCase();
      state.walletDraftCurrency = currencyCode;
      showWalletCurrencyModal(container, state);
      break;
    }

    case 'confirm-wallet-currency': {
      const nextCurrency = String(state.walletDraftCurrency || state.walletData?.displayCurrency || 'CNY').toUpperCase();
      state.walletData = normalizeWalletData({
        ...state.walletData,
        displayCurrency: nextCurrency,
        updatedAt: Date.now()
      });
      state.walletDraftCurrency = '';
      await persistWalletData(state, db);
      closeModal(container);
      rerenderCurrentSubPage(container, state);
      break;
    }

    case 'open-favorite':
      openSubPage(container, state, 'favorite');
      break;

    case 'toggle-favorite-html-card-zoom': {
      if (state.subPageView !== 'favorite') break;

      const card = target.closest('.favorite-html-card');
      if (!card) break;

      e.preventDefault();

      const isExpanded = card.classList.contains('is-expanded');
      container.querySelectorAll('.favorite-html-card.is-expanded').forEach(item => {
        if (item !== card) item.classList.remove('is-expanded');
      });
      card.classList.toggle('is-expanded', !isExpanded);
      break;
    }

    case 'jump-favorite-html-card-source': {
      if (state.subPageView !== 'favorite') break;

      e.preventDefault();
      e.stopPropagation();

      const favoriteId = String(target.dataset.favoriteId || '').trim();
      const favoriteItem = normalizeFavoriteData(state.favoriteData).items.find(item => String(item.id) === favoriteId);
      const sourceChatId = String(target.dataset.sourceChatId || favoriteItem?.sourceChatId || '').trim();
      const sourceMessageId = String(target.dataset.sourceMessageId || favoriteItem?.sourceMessageId || '').trim();
      if (!sourceChatId) break;

      state.subPageView = null;
      state.favoriteMultiSelectMode = false;
      state.selectedFavoriteIds = [];
      await openChatMessage(container, state, db, sourceChatId);

      const existingMessageIds = new Set((state.currentMessages || []).map(message => String(message.id || '')));
      const contextMessageIds = Array.isArray(favoriteItem?.sourceContextMessageIds)
        ? favoriteItem.sourceContextMessageIds.map(id => String(id || '').trim()).filter(Boolean)
        : [];
      const jumpMessageId = existingMessageIds.has(sourceMessageId)
        ? sourceMessageId
        : contextMessageIds.find(id => existingMessageIds.has(id));

      if (jumpMessageId) {
        window.setTimeout(() => scrollToChatSearchResult(container, jumpMessageId), 120);
      }
      break;
    }

    case 'open-sticker':
      openSubPage(container, state, 'sticker');
      break;

    case 'open-mask-switcher':
      showMaskSwitcherModal(container, state, db, eventBus);
      break;

    case 'open-chat-days-detail':
      openSubPage(container, state, 'chatDaysDetail');
      break;

    case 'open-friends-detail':
      switchPanel(container, state, 'contacts');
      break;

    case 'go-profile':
      closeSubPage(container, state);
      break;

    case 'switch-favorite-group': {
      if (target.dataset.longPressTriggered === '1') {
        delete target.dataset.longPressTriggered;
        break;
      }
      const data = normalizeFavoriteData(state.favoriteData);
      const groupId = target.dataset.favoriteGroupId || 'all';
      const exists = groupId === 'all' || groupId === 'html' || data.groups.some(group => group.id === groupId);
      state.favoriteData = { ...data, activeGroupId: exists ? groupId : 'all' };
      state.favoriteMultiSelectMode = false;
      state.selectedFavoriteIds = [];
      await persistFavoriteData(state, db);
      rerenderCurrentSubPage(container, state);
      break;
    }

    case 'create-favorite-group':
      showCreateFavoriteGroupModal(container);
      break;

    case 'confirm-create-favorite-group': {
      const input = container.querySelector('[data-role="favorite-group-name-input"]');
      const name = String(input?.value || '').trim();
      if (!name) {
        renderModalNotice(container, '请输入分组名称');
        break;
      }
      const data = normalizeFavoriteData(state.favoriteData);
      const group = { id: createUid('favorite_group'), name };
      state.favoriteData = { ...data, groups: [...data.groups, group], activeGroupId: group.id };
      await persistFavoriteData(state, db);
      closeModal(container);
      rerenderCurrentSubPage(container, state);
      break;
    }

    case 'confirm-delete-favorite-group': {
      const groupId = target.dataset.favoriteGroupId || '';
      const data = normalizeFavoriteData(state.favoriteData);
      if (!groupId || groupId === 'all') break;
      state.favoriteData = {
        ...data,
        groups: data.groups.filter(group => group.id !== groupId),
        subGroups: data.subGroups.map(group => group.parentGroupId === groupId ? { ...group, parentGroupId: 'all' } : group),
        items: data.items.map(item => item.groupId === groupId ? { ...item, groupId: 'all', subGroupId: '', updatedAt: Date.now() } : item),
        activeGroupId: data.activeGroupId === groupId ? 'all' : data.activeGroupId
      };
      await persistFavoriteData(state, db);
      closeModal(container);
      rerenderCurrentSubPage(container, state);
      break;
    }

    case 'toggle-favorite-search': {
      const data = normalizeFavoriteData(state.favoriteData);
      state.favoriteData = { ...data, searchOpen: !data.searchOpen };
      await persistFavoriteData(state, db);
      rerenderCurrentSubPage(container, state);
      break;
    }

    case 'open-favorite-filter':
      showFavoriteFilterModal(container, state);
      break;

    case 'set-favorite-sort': {
      const sortMode = target.dataset.favoriteSort || 'updatedAt';
      const data = normalizeFavoriteData(state.favoriteData);
      state.favoriteData = { ...data, sortMode };
      await persistFavoriteData(state, db);
      closeModal(container);
      rerenderCurrentSubPage(container, state);
      break;
    }

    case 'open-favorite-preview': {
      const favoriteId = target.dataset.favoriteId || '';
      if (favoriteId) showFavoritePreviewModal(container, state, favoriteId);
      break;
    }

    case 'toggle-favorite-item': {
      if (!state.favoriteMultiSelectMode) break;
      const favoriteId = target.dataset.favoriteId || '';
      const selected = new Set((state.selectedFavoriteIds || []).map(String));
      selected.has(favoriteId) ? selected.delete(favoriteId) : selected.add(favoriteId);
      state.selectedFavoriteIds = Array.from(selected);
      rerenderCurrentSubPage(container, state);
      break;
    }

    case 'favorite-multi-cancel':
      state.favoriteMultiSelectMode = false;
      state.selectedFavoriteIds = [];
      rerenderCurrentSubPage(container, state);
      break;

    case 'favorite-multi-select-all': {
      const visibleIds = getVisibleFavoriteItems(state).map(item => String(item.id));
      const selected = new Set((state.selectedFavoriteIds || []).map(String));
      const isAllSelected = visibleIds.length > 0 && visibleIds.every(id => selected.has(id));
      state.selectedFavoriteIds = isAllSelected ? [] : visibleIds;
      rerenderCurrentSubPage(container, state);
      break;
    }

    case 'favorite-multi-delete': {
      const selected = new Set((state.selectedFavoriteIds || []).map(String));
      if (!selected.size) break;
      const data = normalizeFavoriteData(state.favoriteData);
      state.favoriteData = { ...data, items: data.items.filter(item => !selected.has(String(item.id))) };
      state.favoriteMultiSelectMode = false;
      state.selectedFavoriteIds = [];
      await persistFavoriteData(state, db);
      rerenderCurrentSubPage(container, state);
      break;
    }

    case 'favorite-multi-group':
      if ((state.selectedFavoriteIds || []).length) showCreateFavoriteSubGroupModal(container);
      break;

    case 'favorite-multi-move':
      if ((state.selectedFavoriteIds || []).length) showMoveFavoriteToGroupModal(container, state);
      break;

    case 'confirm-move-favorite-to-group': {
      const targetGroupId = target.dataset.favoriteTargetGroupId || 'all';
      const selected = new Set((state.selectedFavoriteIds || []).map(String));
      if (!selected.size) break;
      const data = normalizeFavoriteData(state.favoriteData);
      const now = Date.now();
      state.favoriteData = {
        ...data,
        items: data.items.map(item =>
          selected.has(String(item.id))
            ? { ...item, groupId: targetGroupId, subGroupId: '', updatedAt: now }
            : item
        )
      };
      state.favoriteMultiSelectMode = false;
      state.selectedFavoriteIds = [];
      await persistFavoriteData(state, db);
      closeModal(container);
      rerenderCurrentSubPage(container, state);
      break;
    }

    case 'confirm-create-favorite-sub-group': {
      const input = container.querySelector('[data-role="favorite-sub-group-name-input"]');
      const name = String(input?.value || '').trim();
      if (!name) {
        renderModalNotice(container, '请输入小分组名称');
        break;
      }

      const data = normalizeFavoriteData(state.favoriteData);
      const selectedIds = (state.selectedFavoriteIds || []).map(String).filter(Boolean);
      const selectedItems = selectedIds
        .map(id => data.items.find(item => String(item.id) === id))
        .filter(Boolean);

      if (selectedItems.length < 2) {
        renderModalNotice(container, '请至少选择两张收藏卡片进行再分组');
        break;
      }

      const now = Date.now();
      const subGroup = { id: createUid('favorite_sub_group'), parentGroupId: data.activeGroupId || 'all', name, createdAt: now };
      const mergedMessages = [];
      selectedItems.forEach((item, itemIndex) => {
        if (itemIndex > 0) {
          mergedMessages.push({
            id: createUid('fav_separator'),
            role: 'system',
            type: 'separator',
            content: '————',
            stickerName: '',
            stickerUrl: '',
            timestamp: now + mergedMessages.length
          });
        }

        (Array.isArray(item.messages) ? item.messages : []).forEach(message => {
          mergedMessages.push({
            id: createUid('fav_msg'),
            role: String(message.role || 'user'),
            type: String(message.type || ''),
            content: String(message.type === 'sticker' ? (message.content || message.stickerName || '[表情包]') : message.content || ''),
            stickerName: String(message.stickerName || ''),
            stickerUrl: String(message.stickerUrl || ''),
            timestamp: Number(message.timestamp || now)
          });
        });
      });

      const selectedSet = new Set(selectedIds);
      const mergedItem = {
        id: createUid('favorite'),
        name,
        groupId: data.activeGroupId || 'all',
        subGroupId: subGroup.id,
        messages: mergedMessages,
        createdAt: now,
        updatedAt: now,
        sourceChatId: selectedItems.every(item => String(item.sourceChatId || '') === String(selectedItems[0]?.sourceChatId || ''))
          ? String(selectedItems[0]?.sourceChatId || '')
          : ''
      };

      state.favoriteData = {
        ...data,
        subGroups: [...data.subGroups, subGroup],
        items: [...data.items.filter(item => !selectedSet.has(String(item.id))), mergedItem]
      };
      state.favoriteMultiSelectMode = false;
      state.selectedFavoriteIds = [];
      await persistFavoriteData(state, db);
      closeModal(container);
      rerenderCurrentSubPage(container, state);
      break;
    }

    case 'switch-sticker-group': {
      if (target.dataset.longPressTriggered === '1') {
        delete target.dataset.longPressTriggered;
        break;
      }
      const groupId = target.dataset.stickerGroupId || 'all';
      const data = normalizeStickerData(state.stickerData);
      const exists = groupId === 'all' || data.groups.some(group => group.id === groupId);
      state.stickerData = { ...data, activeGroupId: exists ? groupId : 'all' };
      state.stickerMultiSelectMode = false;
      state.selectedStickerIds = [];
      await persistStickerData(state, db);
      rerenderCurrentSubPage(container, state);
      break;
    }

    case 'create-sticker-group':
      showCreateStickerGroupModal(container);
      break;

    case 'confirm-create-sticker-group': {
      const input = container.querySelector('[data-role="sticker-group-name-input"]');
      const name = String(input?.value || '').trim();
      if (!name) {
        renderModalNotice(container, '请输入分组名称');
        break;
      }

      const data = normalizeStickerData(state.stickerData);
      const group = { id: createUid('sticker_group'), name };
      state.stickerData = {
        ...data,
        groups: [...data.groups, group],
        activeGroupId: group.id
      };
      await persistStickerData(state, db);
      closeModal(container);
      rerenderCurrentSubPage(container, state);
      break;
    }

    case 'open-sticker-upload-modal':
      showStickerUploadModal(container, state);
      break;

    case 'confirm-add-local-sticker': {
      const pending = state.pendingStickerLocalFile;
      const nameInput = container.querySelector('[data-role="sticker-local-name-input"]');
      const name = String(nameInput?.value || pending?.name || '').trim();
      if (!pending?.url) {
        renderModalNotice(container, '请先选择本地表情包文件');
        break;
      }
      if (!name) {
        renderModalNotice(container, '请给这个表情包命名');
        break;
      }

      const data = normalizeStickerData(state.stickerData);
      const now = Date.now();
      state.stickerData = {
        ...data,
        items: [
          ...data.items,
          {
            id: createUid('sticker'),
            groupId: getStickerTargetGroupId(state),
            name,
            url: pending.url,
            source: 'local',
            createdAt: now
          }
        ]
      };
      state.pendingStickerLocalFile = null;
      await persistStickerData(state, db);
      closeModal(container);
      rerenderCurrentSubPage(container, state);
      break;
    }

    case 'confirm-add-url-stickers': {
      const textarea = container.querySelector('[data-role="sticker-url-import-input"]');
      const parsed = parseStickerUrlImportText(textarea?.value || '');
      if (!parsed.length) {
        renderModalNotice(container, '请输入 jpg、png、gif 格式的有效 URL；支持“描述：url”“描述 url”或完整 URL');
        break;
      }

      const data = normalizeStickerData(state.stickerData);
      const targetGroupId = getStickerTargetGroupId(state);
      const now = Date.now();
      const newItems = parsed.map((item, index) => ({
        id: createUid('sticker'),
        groupId: targetGroupId,
        name: item.name,
        url: item.url,
        source: 'url',
        createdAt: now + index
      }));

      state.stickerData = {
        ...data,
        items: [...data.items, ...newItems]
      };
      await persistStickerData(state, db);
      closeModal(container);
      rerenderCurrentSubPage(container, state);
      break;
    }

    case 'confirm-delete-sticker-group': {
      const groupId = target.dataset.stickerGroupId || '';
      const data = normalizeStickerData(state.stickerData);
      const exists = groupId && data.groups.some(group => group.id === groupId);
      if (!exists) break;

      state.stickerData = {
        ...data,
        groups: data.groups.filter(group => group.id !== groupId),
        items: data.items.map(item => item.groupId === groupId ? { ...item, groupId: 'all' } : item),
        activeGroupId: data.activeGroupId === groupId ? 'all' : data.activeGroupId
      };
      state.stickerMultiSelectMode = false;
      state.selectedStickerIds = [];
      await persistStickerData(state, db);
      closeModal(container);
      rerenderCurrentSubPage(container, state);
      break;
    }

    case 'open-sticker-preview': {
      if (state.stickerMultiSelectMode) break;
      const stickerId = String(target.dataset.stickerId || '').trim();
      if (!stickerId) break;
      if (state.stickerPreviewClickTimer) window.clearTimeout(state.stickerPreviewClickTimer);
      state.stickerPreviewClickTimer = window.setTimeout(() => {
        state.stickerPreviewClickTimer = 0;
        showStickerPreviewModal(container, state, stickerId);
      }, 260);
      break;
    }

    case 'toggle-sticker-multi-item': {
      if (!state.stickerMultiSelectMode) break;
      const stickerId = String(target.dataset.stickerId || '').trim();
      if (!stickerId) break;
      const selectedSet = new Set((state.selectedStickerIds || []).map(String));
      if (selectedSet.has(stickerId)) {
        selectedSet.delete(stickerId);
      } else {
        selectedSet.add(stickerId);
      }
      state.selectedStickerIds = Array.from(selectedSet);
      rerenderCurrentSubPage(container, state);
      break;
    }

    case 'sticker-multi-cancel':
      state.stickerMultiSelectMode = false;
      state.selectedStickerIds = [];
      rerenderCurrentSubPage(container, state);
      break;

    case 'sticker-multi-select-all': {
      const visibleStickerIds = getVisibleStickers(state).map(item => String(item.id));
      const selectedSet = new Set((state.selectedStickerIds || []).map(String));
      const isAllSelected = visibleStickerIds.length > 0 && visibleStickerIds.every(id => selectedSet.has(id));
      state.selectedStickerIds = isAllSelected ? [] : visibleStickerIds;
      rerenderCurrentSubPage(container, state);
      break;
    }

    case 'sticker-multi-delete-selected': {
      const selectedSet = new Set((state.selectedStickerIds || []).map(String));
      if (!selectedSet.size) break;
      const data = normalizeStickerData(state.stickerData);
      state.stickerData = {
        ...data,
        items: data.items.filter(item => !selectedSet.has(String(item.id)))
      };
      state.stickerMultiSelectMode = false;
      state.selectedStickerIds = [];
      await persistStickerData(state, db);
      rerenderCurrentSubPage(container, state);
      break;
    }

    case 'switch-mask': {
      const maskId = target.dataset.maskId;
      if (maskId && maskId !== state.activeMaskId) {
        await performMaskSwitch(container, state, db, eventBus, maskId);
      }
      closeModal(container);
      break;
    }

    default:
      if (state.currentChatId && action && action.startsWith('trans-')) {
        await handleTranslationSettingsClick(e, target, action, state, container, db);
      }
      break;
  }
}
