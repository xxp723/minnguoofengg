// @ts-nocheck
/**
 * 文件名: js/apps/chat/chat-event-change.js
 * 用途: 闲谈应用 change 事件处理。
 * 架构层: 应用层子模块（由 chat-event-handlers.js 聚合导出）
 */

/* ==========================================================================
   [区域标注·已完成·chat-event-handlers.js拆分] change 事件处理
   说明：
   1. 从 chat-event-handlers.js 原样拆出 change 事件处理逻辑。
   2. 保持原有文件导入、图片读取、聊天导入与贴纸导入链路不变。
   3. 持久化仍仅使用 DB.js / IndexedDB，不引入 localStorage/sessionStorage。
   ========================================================================== */
import {
  DATA_KEY_SESSIONS,
  createUid,
  dbPut,
  escapeHtml,
  renderModalNotice,
  closeModal
} from './chat-utils.js';
/* ==========================================================================
   [区域标注·已完成·本次闲谈启动失败修复] 修正 refreshCurrentSessionLastMessage 与 resetMessageSelectionState 导入来源
   说明：
   1. 将 refreshCurrentSessionLastMessage 改为直接从 chat-message-render.js 导入。
   2. 将 resetMessageSelectionState 改为直接从 chat-message-selection.js 导入。
   3. 绕开 chat-message.js facade 导出，以彻底解决由于循环依赖导致的 ESM 实例化失败（即“启动失败”）。
   4. 持久化仍仅使用 DB.js / IndexedDB，不引入 localStorage/sessionStorage。
   ========================================================================== */
import {
  persistCurrentMessages,
  renderCurrentChatMessage,
  sendImageMessage,
  showChatAvatarCropModal
} from './chat-message.js';
import { refreshCurrentSessionLastMessage } from './chat-message-render.js';
import { resetMessageSelectionState } from './chat-message-selection.js';
import {
  normalizeMomentsComposeDraft,
  ensureMomentsComposeDraft,
  MOMENTS_COMPOSE_MAX_IMAGES,
  renderMomentsComposeIntoPage
} from './moments.js';
import {
  importStickerTextToCurrentGroup,
  readDocxText
} from './profile.js';
import {
  readAndValidateChatImportJsonFile,
  showChatExportImportNoticeModal
} from './chat-export-import.js';
import { handleChatBackgroundFileInputChange } from './chat-beauty-settings.js';
import {
  CHAT_MESSAGE_INITIAL_VISIBLE_COUNT
} from './chat-state.js';

/* ==========================================================================
   [区域标注·本次需求3] 表情包本地上传 change 处理
   说明：读取为 data URL 后仅暂存在运行时，用户点击确认才写入 IndexedDB。
   ========================================================================== */
export async function handleChange(e, state, container, db) {
  const target = e.target;

  /* ==========================================================================
     [区域标注·已完成·本次新增：聊天背景本地图片 change 接线]
     说明：
     1. 仅处理“聊天美化 → 聊天背景”弹窗中的隐藏 file input。
     2. 图片读取后只暂存到 state.pendingChatBackgroundDraft；点击“确认”前不写入 IndexedDB。
     3. 不使用 localStorage/sessionStorage，不写双份兜底，不做长文本过滤。
     ========================================================================== */
  if (target?.matches?.('[data-role="chat-background-file-input"]')) {
    const file = target.files?.[0];
    if (file) handleChatBackgroundFileInputChange(file, state, container);
    target.value = '';
    return;
  }

  if (target?.matches?.('[data-role="chat-import-json-file-input"]')) {
    const file = target.files?.[0];
    if (!file) return;

    try {
      const importedMessages = await readAndValidateChatImportJsonFile(file, state);
      state.currentMessages = Array.isArray(importedMessages) ? importedMessages : [];
      resetMessageSelectionState(state);
      state.chatMessageVisibleCount = CHAT_MESSAGE_INITIAL_VISIBLE_COUNT;
      refreshCurrentSessionLastMessage(state);

      await Promise.all([
        persistCurrentMessages(state, db),
        dbPut(db, DATA_KEY_SESSIONS(state.activeMaskId), state.sessions)
      ]);

      closeModal(container);
      renderCurrentChatMessage(container, state);
    } catch (error) {
      showChatExportImportNoticeModal(container, {
        title: '导入失败',
        message: error?.message || '聊天记录导入失败，请确认 JSON 文件来源。'
      });
    } finally {
      target.value = '';
    }
    return;
  }

  if (target?.matches?.('[data-role="msg-avatar-file-input"]')) {
    const file = target.files?.[0];
    if (!file) return;

    if (!/^image\//i.test(file.type || '')) {
      renderModalNotice(container, '请选择图片文件');
      target.value = '';
      return;
    }

    const avatarTarget = String(target.dataset.avatarTarget || 'character');
    const reader = new FileReader();
    reader.onload = () => {
      const imageUrl = String(reader.result || '');
      if (!imageUrl.startsWith('data:image/')) {
        renderModalNotice(container, '图片读取失败，请重新选择');
        return;
      }
      showChatAvatarCropModal(container, {
        imageUrl,
        source: 'local',
        fileName: file.name || '本地头像',
        avatarTarget
      });
    };
    reader.onerror = () => renderModalNotice(container, '图片读取失败，请重新选择');
    reader.readAsDataURL(file);
    return;
  }

  if (target?.matches?.('[data-role="msg-image-file-input"]')) {
    const file = target.files?.[0];
    if (!file) return;

    if (!/^image\//i.test(file.type || '')) {
      renderModalNotice(container, '请选择图片文件');
      target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const imageUrl = String(reader.result || '');
      if (!imageUrl.startsWith('data:image/')) {
        renderModalNotice(container, '图片读取失败，请重新选择');
        return;
      }
      await sendImageMessage(container, state, db, imageUrl, null, {
        imageName: file.name || '本地图片',
        triggerAi: false
      });
      closeModal(container);
    };
    reader.onerror = () => renderModalNotice(container, '图片读取失败，请重新选择');
    reader.readAsDataURL(file);
    return;
  }

  if (target?.matches?.('[data-role="moments-compose-local-input"]')) {
    const file = target.files?.[0];
    if (!file) return;

    const draft = ensureMomentsComposeDraft(state);
    if (draft.images.length >= MOMENTS_COMPOSE_MAX_IMAGES) {
      renderModalNotice(container, `最多只能添加 ${MOMENTS_COMPOSE_MAX_IMAGES} 张图片`);
      target.value = '';
      return;
    }

    if (!/^image\//i.test(file.type || '')) {
      renderModalNotice(container, '请选择图片文件');
      target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const imageUrl = String(reader.result || '');
      if (!imageUrl.startsWith('data:image/')) {
        renderModalNotice(container, '图片读取失败，请重新选择');
        target.value = '';
        return;
      }

      const latestDraft = ensureMomentsComposeDraft(state);
      state.momentsComposeDraft = normalizeMomentsComposeDraft({
        ...latestDraft,
        images: [
          ...latestDraft.images,
          {
            id: createUid('moments_compose_image'),
            src: imageUrl,
            name: file.name || '本地图片'
          }
        ]
      });
      target.value = '';
      renderMomentsComposeIntoPage(container, state);
    };
    reader.onerror = () => {
      renderModalNotice(container, '图片读取失败，请重新选择');
      target.value = '';
    };
    reader.readAsDataURL(file);
    return;
  }

  if (target?.matches?.('[data-role="sticker-import-file-input"]')) {
    const file = target.files?.[0];
    if (!file) return;

    try {
      const fileName = String(file.name || '').toLowerCase();
      const text = fileName.endsWith('.docx')
        ? await readDocxText(file)
        : await file.text();
      await importStickerTextToCurrentGroup(container, state, db, text);
    } catch (error) {
      renderModalNotice(container, error?.message || '本地文件导入失败');
    } finally {
      target.value = '';
    }
    return;
  }

  if (!target?.matches?.('[data-role="sticker-local-file-input"]')) return;

  const file = target.files?.[0];
  if (!file) return;

  if (!/^image\/(jpeg|png|gif)$/i.test(file.type || '')) {
    renderModalNotice(container, '本地上传仅支持 jpg、png、gif 格式');
    target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const url = String(reader.result || '');
    state.pendingStickerLocalFile = {
      name: file.name.replace(/\.(jpg|jpeg|png|gif)$/i, ''),
      url
    };

    const nameInput = container.querySelector('[data-role="sticker-local-name-input"]');
    if (nameInput && !String(nameInput.value || '').trim()) {
      nameInput.value = state.pendingStickerLocalFile.name;
    }

    const preview = container.querySelector('[data-role="sticker-local-preview"]');
    if (preview) {
      preview.innerHTML = `
        <img src="${escapeHtml(url)}" alt="${escapeHtml(state.pendingStickerLocalFile.name)}">
        <span>${escapeHtml(state.pendingStickerLocalFile.name)}</span>
      `;
    }
  };
  reader.readAsDataURL(file);
}
