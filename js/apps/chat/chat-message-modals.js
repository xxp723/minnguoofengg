// @ts-nocheck
/**
 * 文件名: js/apps/chat/chat-message-modals.js
 * 用途: 闲谈应用 — 聊天消息页弹窗子模块
 * 架构层: 应用层子模块（由 chat-message.js 统一导出）
 */

/* ==========================================================================
   [区域标注·本次拆分·chat-message.js] 消息页弹窗模块
   说明：
   1. 本文件只承接原 chat-message.js 中的消息页弹窗与头像裁剪相关逻辑。
   2. 外部仍继续从 chat-message.js 导入，避免改动无关文件的接线。
   3. 持久化仍由调用方统一通过 DB.js / IndexedDB 完成；本文件不使用 localStorage/sessionStorage。
   ========================================================================== */

import {
  TAB_ICONS,
  escapeHtml
} from './chat-utils.js';
import { getVisibleChatSessions } from './chat-list.js';
import { MSG_ICONS } from './chat-message-icons.js';
import {
  sanitizeHtmlCardDocumentForSrcdoc
} from './chat-html-card.js';
import {
  getGiftMessageDisplayText,
  isGiftMessage
} from './chat-gift.js';
import {
  isTextImageMessage
} from './chat-text-image.js';
import {
  getVoiceMessageDisplayText,
  isVoiceMessage
} from './chat-voice.js';

function getSelectedMessages(state) {
  const selectedSet = new Set((state.selectedMessageIds || []).map(String));
  return (state.currentMessages || []).filter(message => selectedSet.has(String(message.id)));
}

function getAsideSegmentsFromMessage(message = {}) {
  const rawSegments = Array.isArray(message?.asideSegments) ? message.asideSegments : [];
  const normalizedSegments = rawSegments
    .map((segment, index) => {
      const text = typeof segment === 'string' ? segment : String(segment?.text || '').trim();
      if (!text) return null;
      return {
        id: String(segment?.id || `${message?.id || 'aside'}_${index + 1}`),
        text,
        placement: String(segment?.placement || 'before') === 'after' ? 'after' : 'before'
      };
    })
    .filter(Boolean);

  if (normalizedSegments.length) return normalizedSegments;

  const legacyText = String(message?.asideText || '').trim();
  return legacyText
    ? [{
        id: String(message?.id || 'aside'),
        text: legacyText,
        placement: 'before'
      }]
    : [];
}

function getMessageDisplayTextForQuote(message = {}) {
  const type = String(message?.type || '');
  if (type === 'sticker') return `[表情包] ${String(message?.stickerName || message?.content || '表情包').trim()}`;
  if (isTextImageMessage(message)) return `[文字图] ${String(message?.textImageText || message?.content || '文字图').trim()}`;
  if (isVoiceMessage(message)) return getVoiceMessageDisplayText(message);
  if (type === 'image') return `[图片] ${String(message?.imageName || message?.content || '图片').trim()}`;
  if (type === 'transfer') return `[转账] ${String(message?.transferDisplayAmount || message?.content || '¥0.00').trim()}`;
  if (isGiftMessage(message)) return getGiftMessageDisplayText(message);
  if (type === 'card') return `[HTML卡片] ${String(message?.cardTitle || message?.content || '互动卡片').trim()}`;
  if (type === 'transfer_system' || type === 'ai_withdraw_system' || type === 'user_withdraw_system' || type === 'html_card_interaction_system') return String(message?.content || '系统提示').trim();
  return String(message?.content || '').trim();
}

/* ==========================================================================
   [区域标注·已完成·AI识图图片弹窗] 图片发送应用内弹窗
   说明：
   1. 替代原生浏览器弹窗，保持闲谈应用统一暖色主题。
   2. 用户可选择本地图片，也可输入图片 URL；确认 URL 后由 index.js 写入当前聊天消息。
   3. 本地图片读取为 data URL 后直接写入 DB.js / IndexedDB，不使用 localStorage/sessionStorage。
   ========================================================================== */
export function showMessageImageModal(container) {
  const mask = container.querySelector('[data-role="modal-mask"]');
  const panel = container.querySelector('[data-role="modal-panel"]');
  if (!mask || !panel) return;

  panel.innerHTML = `
    <div class="chat-modal-header">
      <span>发送图片</span>
      <button class="chat-modal-close" data-action="close-modal" type="button">${TAB_ICONS.close}</button>
    </div>
    <div class="chat-modal-body">
      <div class="chat-modal-hint">选择本地图片，或粘贴图片 URL。发送后会在聊天界面显示为图片，AI 也能看到这张图。</div>
      <input class="msg-image-file-input" data-role="msg-image-file-input" type="file" accept="image/*">
      <input class="chat-modal-search" data-role="msg-image-url-input" type="url" placeholder="https://example.com/image.png">
      <div class="chat-modal-notice" data-role="modal-notice"></div>
    </div>
    <div class="chat-modal-footer">
      <button class="chat-modal-btn chat-modal-btn--secondary" data-action="close-modal" type="button">取消</button>
      <button class="chat-modal-btn chat-modal-btn--primary" data-action="confirm-send-image-url" type="button">发送链接图片</button>
    </div>
  `;

  mask.classList.remove('is-hidden');
  setTimeout(() => panel.querySelector('[data-role="msg-image-url-input"]')?.focus(), 30);
}

/* ==========================================================================
   [区域标注·已完成·本次转账需求] 聊天消息页转账应用内弹窗
   说明：
   1. 弹窗结构与闲谈应用现有 chat-modal 风格保持一致，不使用原生浏览器弹窗。
   2. 余额文案由 index.js 根据当前钱包余额与显示币种实时计算后传入。
   3. 这里只负责渲染转账弹窗，不做 localStorage/sessionStorage 读写，也不做双份存储兜底。
   ========================================================================== */
export function showMessageTransferModal(container, options = {}) {
  const mask = container.querySelector('[data-role="modal-mask"]');
  const panel = container.querySelector('[data-role="modal-panel"]');
  if (!mask || !panel) return;

  const balanceLabel = String(options.balanceLabel || '').trim() || '¥0.00';
  const currencyCode = String(options.currencyCode || 'CNY').trim().toUpperCase();

  panel.innerHTML = `
    <!-- [区域标注·已完成·本次转账需求] 聊天消息页转账弹窗 -->
    <div class="chat-modal-header">
      <span>转账</span>
      <button class="chat-modal-close" data-action="close-modal" type="button">${TAB_ICONS.close}</button>
    </div>
    <div class="chat-modal-body msg-transfer-modal-body">
      <label class="msg-transfer-modal-field">
        <span class="msg-transfer-modal-field__label">金额</span>
        <input class="chat-modal-search msg-transfer-modal-field__input"
               data-role="msg-transfer-amount-input"
               type="number"
               min="0.01"
               step="0.01"
               placeholder="输入转账金额">
      </label>
      <div class="msg-transfer-modal-balance">
        <span class="msg-transfer-modal-balance__label">钱包余额</span>
        <strong class="msg-transfer-modal-balance__amount">${escapeHtml(balanceLabel)}</strong>
        <span class="msg-transfer-modal-balance__currency">${escapeHtml(currencyCode)}</span>
      </div>
      <label class="msg-transfer-modal-field">
        <span class="msg-transfer-modal-field__label">备注</span>
        <input class="chat-modal-search msg-transfer-modal-field__input"
               data-role="msg-transfer-note-input"
               type="text"
               maxlength="60"
               placeholder="输入想要留言的话">
      </label>
      <div class="chat-modal-notice" data-role="modal-notice"></div>
    </div>
    <div class="chat-modal-footer">
      <button class="chat-modal-btn chat-modal-btn--secondary" data-action="close-modal" type="button">取消</button>
      <button class="chat-modal-btn chat-modal-btn--primary" data-action="confirm-msg-transfer" type="button">确认转账</button>
    </div>
  `;

  mask.classList.remove('is-hidden');
  setTimeout(() => panel.querySelector('[data-role="msg-transfer-amount-input"]')?.focus(), 30);
}

/* ==========================================================================
   [区域标注·已完成·本次转账弹窗去图标] 转账消息操作弹窗（接收 / 退回）
   说明：
   1. 用户点击转账消息后使用应用内弹窗处理，不使用原生浏览器弹窗。
   2. 这里只负责 UI；余额变更和消息状态持久化统一由 index.js 写入 DB.js / IndexedDB。
   3. 按照要求，去除了“接收”和“退回”按钮的图标，只留下文字。
   ========================================================================== */
export function showTransferActionModal(container, options = {}) {
  const mask = container.querySelector('[data-role="modal-mask"]');
  const panel = container.querySelector('[data-role="modal-panel"]');
  if (!mask || !panel) return;

  const messageId = String(options.messageId || '').trim();
  const amountLabel = String(options.amountLabel || '').trim() || '¥0.00';
  const noteLabel = String(options.note || '').trim();
  const statusLabel = String(options.statusLabel || '').trim() || '待处理';
  const actionHint = String(options.actionHint || '').trim() || '请选择处理方式';
  const canAccept = Boolean(options.canAccept);
  const canReturn = Boolean(options.canReturn);

  panel.innerHTML = `
    <div class="chat-modal-header">
      <span>转账操作</span>
      <button class="chat-modal-close" data-action="close-modal" type="button">${TAB_ICONS.close}</button>
    </div>
    <div class="chat-modal-body msg-transfer-action-modal-body">
      <div class="msg-transfer-action-card">
        <div class="msg-transfer-action-card__row">
          <span class="msg-transfer-action-card__label">金额</span>
          <strong class="msg-transfer-action-card__amount">${escapeHtml(amountLabel)}</strong>
        </div>
        <div class="msg-transfer-action-card__row">
          <span class="msg-transfer-action-card__label">状态</span>
          <span class="msg-transfer-action-card__status">${escapeHtml(statusLabel)}</span>
        </div>
        ${noteLabel ? `<div class="msg-transfer-action-card__note">${escapeHtml(noteLabel)}</div>` : ''}
      </div>
      <div class="chat-modal-notice">${escapeHtml(actionHint)}</div>
    </div>
    <div class="chat-modal-footer">
      ${canReturn ? `<button class="chat-modal-btn chat-modal-btn--secondary" data-action="msg-transfer-return" data-message-id="${escapeHtml(messageId)}" type="button"><span>退回</span></button>` : ''}
      ${canAccept ? `<button class="chat-modal-btn chat-modal-btn--primary" data-action="msg-transfer-accept" data-message-id="${escapeHtml(messageId)}" type="button"><span>接收</span></button>` : ''}
    </div>
  `;

  mask.classList.remove('is-hidden');
}

/* ==========================================================================
   [区域标注·已完成·头像来源选择弹窗去图标去说明文字与删除当前会话头像]
   说明：
   1. 点击聊天设置页中的角色头像或用户头像后，先打开应用内来源选择弹窗，不直接暴露原生输入控件。
   2. “本地上传 / URL 图床”按钮已按本次要求去除图标与说明文字，仅保留标题；“本地上传”主按钮改为主题色样式。
   3. 头部新增删除当前会话头像图标按钮，位置位于关闭按钮左侧；删除后由调用方回退到当前界面的既有初始头像/资料头像展示。
   4. 真正保存或删除仍由调用方写入当前 session.avatar / session.userAvatar 并持久化到 DB.js / IndexedDB。
   5. 不使用 localStorage/sessionStorage，不改动其它头像或资料页逻辑。
   ========================================================================== */
export function showChatAvatarSourceModal(container, avatarTarget = 'character') {
  const mask = container.querySelector('[data-role="modal-mask"]');
  const panel = container.querySelector('[data-role="modal-panel"]');
  if (!mask || !panel) return;

  const safeAvatarTarget = String(avatarTarget || 'character') === 'user' ? 'user' : 'character';
  const targetLabel = safeAvatarTarget === 'user' ? '用户头像' : '角色头像';

  panel.innerHTML = `
    <!-- [区域标注·已完成·头像来源选择弹窗去图标去说明文字与删除当前会话头像] 当前会话头像来源选择 -->
    <div class="chat-modal-header">
      <span>上传头像</span>
      <div class="msg-avatar-source-header-actions">
        <button
          class="chat-modal-close msg-avatar-source-delete"
          data-action="delete-current-chat-avatar"
          data-avatar-target="${escapeHtml(safeAvatarTarget)}"
          type="button"
          aria-label="删除当前会话${escapeHtml(targetLabel)}">${MSG_ICONS.delete}</button>
        <button class="chat-modal-close" data-action="close-modal" type="button">${TAB_ICONS.close}</button>
      </div>
    </div>
    <div class="chat-modal-body msg-avatar-source-modal" data-role="chat-avatar-source-modal" data-avatar-target="${escapeHtml(safeAvatarTarget)}">
      <div class="chat-modal-hint">为当前会话的${escapeHtml(targetLabel)}选择上传方式。</div>
      <div class="msg-avatar-source-options">
        <button
          class="msg-avatar-source-option msg-avatar-source-option--primary"
          data-action="open-chat-avatar-local-picker"
          data-avatar-target="${escapeHtml(safeAvatarTarget)}"
          type="button">
          <span class="msg-avatar-source-option__content">
            <strong>本地上传</strong>
          </span>
        </button>
        <button
          class="msg-avatar-source-option"
          data-action="open-chat-avatar-url-modal"
          data-avatar-target="${escapeHtml(safeAvatarTarget)}"
          type="button">
          <span class="msg-avatar-source-option__content">
            <strong>URL 图床</strong>
          </span>
        </button>
      </div>
    </div>
  `;

  mask.classList.remove('is-hidden');
}

/* ==========================================================================
   [区域标注·已完成·更换会话头像弹窗：角色/用户头像]
   说明：
   1. 角色头像与用户头像的 URL 输入、裁剪预览、原图头像/自动压缩均使用应用内弹窗，不使用原生浏览器弹窗。
   2. 弹窗只产生待保存头像数据；真正保存由调用方更新当前 session.avatar / session.userAvatar 并写入 DB.js / IndexedDB。
   3. URL 原图模式直接保存 URL；裁剪/压缩模式通过 canvas 输出 data:image/jpeg。
   ========================================================================== */
export function showChatAvatarUrlModal(container, avatarTarget = 'character') {
  const mask = container.querySelector('[data-role="modal-mask"]');
  const panel = container.querySelector('[data-role="modal-panel"]');
  if (!mask || !panel) return;

  panel.innerHTML = `
    <!-- [区域标注·已完成·当前会话头像URL输入弹窗按钮缩小去图标] -->
    <div class="chat-modal-header">
      <span>头像 URL</span>
      <button class="chat-modal-close" data-action="close-modal" type="button">${TAB_ICONS.close}</button>
    </div>
    <div class="chat-modal-body" data-role="chat-avatar-url-modal" data-avatar-target="${escapeHtml(String(avatarTarget || 'character'))}">
      <div class="chat-modal-hint">粘贴图片链接后进入裁剪预览。保存后仅更新当前聊天会话头像。</div>
      <input class="chat-modal-search" data-role="chat-avatar-url-input" type="url" placeholder="https://example.com/avatar.png">
      <div class="chat-modal-notice" data-role="modal-notice"></div>
    </div>
    <div class="chat-modal-footer">
      <button class="chat-modal-btn chat-modal-btn--secondary" data-action="close-modal" type="button">取消</button>
      <button class="chat-modal-btn chat-modal-btn--primary msg-avatar-url-modal-btn" data-action="confirm-chat-avatar-url" type="button">继续</button>
    </div>
  `;

  mask.classList.remove('is-hidden');
  setTimeout(() => panel.querySelector('[data-role="chat-avatar-url-input"]')?.focus(), 30);
}

export function showChatAvatarCropModal(container, { imageUrl = '', source = 'local', fileName = '', avatarTarget = 'character' } = {}) {
  const mask = container.querySelector('[data-role="modal-mask"]');
  const panel = container.querySelector('[data-role="modal-panel"]');
  const safeImageUrl = String(imageUrl || '').trim();
  if (!mask || !panel || !safeImageUrl) return;

  panel.innerHTML = `
    <!-- [区域标注·已完成·当前会话头像裁剪弹窗按钮缩小去图标] -->
    <div class="chat-modal-header">
      <span>裁剪头像</span>
      <button class="chat-modal-close" data-action="close-modal" type="button">${TAB_ICONS.close}</button>
    </div>
    <div class="chat-modal-body msg-avatar-crop-modal-body"
         data-role="chat-avatar-crop-modal"
         data-avatar-target="${escapeHtml(String(avatarTarget || 'character'))}"
         data-avatar-source="${escapeHtml(source)}"
         data-avatar-file-name="${escapeHtml(fileName)}"
         data-avatar-original-url="${escapeHtml(safeImageUrl)}">
      <div class="chat-modal-hint">拖动下方滑杆自由调整裁剪区域；可选择保留原图或自动压缩，避免图片过大造成卡顿。</div>
      <div class="msg-avatar-crop-stage">
        <img class="msg-avatar-crop-image" data-role="chat-avatar-crop-image" src="${escapeHtml(safeImageUrl)}" alt="头像预览">
        <div class="msg-avatar-crop-frame">${MSG_ICONS.crop}</div>
      </div>
      <div class="msg-avatar-crop-controls">
        <label class="msg-avatar-crop-field"><span>缩放</span><input data-role="chat-avatar-crop-zoom" type="range" min="1" max="3" step="0.01" value="1"></label>
        <label class="msg-avatar-crop-field"><span>横向</span><input data-role="chat-avatar-crop-x" type="range" min="-100" max="100" step="1" value="0"></label>
        <label class="msg-avatar-crop-field"><span>纵向</span><input data-role="chat-avatar-crop-y" type="range" min="-100" max="100" step="1" value="0"></label>
      </div>
      <div class="chat-modal-notice" data-role="modal-notice"></div>
    </div>
    <div class="chat-modal-footer msg-avatar-crop-footer">
      <button class="chat-modal-btn chat-modal-btn--secondary" data-action="save-chat-avatar-original" type="button">原图头像</button>
      <button class="chat-modal-btn chat-modal-btn--secondary" data-action="save-chat-avatar-compressed" type="button">自动压缩图片</button>
      <button class="chat-modal-btn chat-modal-btn--primary" data-action="save-chat-avatar-cropped" type="button">保存使用</button>
    </div>
  `;

  mask.classList.remove('is-hidden');
  updateChatAvatarCropPreview(container);
}

export function updateChatAvatarCropPreview(container) {
  const panel = container.querySelector('[data-role="modal-panel"]');
  const image = panel?.querySelector('[data-role="chat-avatar-crop-image"]');
  if (!image) return;
  const zoom = Number(panel.querySelector('[data-role="chat-avatar-crop-zoom"]')?.value || 1);
  const offsetX = Number(panel.querySelector('[data-role="chat-avatar-crop-x"]')?.value || 0);
  const offsetY = Number(panel.querySelector('[data-role="chat-avatar-crop-y"]')?.value || 0);
  image.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${zoom})`;
}

export async function buildChatAvatarFromCropModal(container, mode = 'cropped') {
  const panel = container.querySelector('[data-role="modal-panel"]');
  const modal = panel?.querySelector('[data-role="chat-avatar-crop-modal"]');
  const originalUrl = String(modal?.dataset?.avatarOriginalUrl || '').trim();
  if (!modal || !originalUrl) return '';

  if (mode === 'original') return originalUrl;

  const image = panel.querySelector('[data-role="chat-avatar-crop-image"]');
  if (!image) return '';
  await new Promise((resolve, reject) => {
    if (image.complete && image.naturalWidth > 0) {
      resolve();
      return;
    }
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('图片加载失败，请重新选择'));
  });

  const size = mode === 'compressed' ? 256 : 320;
  const quality = mode === 'compressed' ? 0.72 : 0.9;
  const zoom = Math.max(1, Number(panel.querySelector('[data-role="chat-avatar-crop-zoom"]')?.value || 1));
  const offsetX = Number(panel.querySelector('[data-role="chat-avatar-crop-x"]')?.value || 0);
  const offsetY = Number(panel.querySelector('[data-role="chat-avatar-crop-y"]')?.value || 0);
  const stageSize = 220;
  const naturalWidth = image.naturalWidth || size;
  const naturalHeight = image.naturalHeight || size;
  const baseScale = Math.max(stageSize / naturalWidth, stageSize / naturalHeight) * zoom;
  const sourceSize = size / baseScale;
  const centerX = naturalWidth / 2 - offsetX / baseScale;
  const centerY = naturalHeight / 2 - offsetY / baseScale;
  const sx = Math.max(0, Math.min(naturalWidth - sourceSize, centerX - sourceSize / 2));
  const sy = Math.max(0, Math.min(naturalHeight - sourceSize, centerY - sourceSize / 2));
  const sw = Math.min(sourceSize, naturalWidth - sx);
  const sh = Math.min(sourceSize, naturalHeight - sy);

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f8f4ef';
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, size, size);
  return canvas.toDataURL('image/jpeg', quality);
}

export function showAiFormatRepairTypeModal(container, messageId = '') {
  const mask = container.querySelector('[data-role="modal-mask"]');
  const panel = container.querySelector('[data-role="modal-panel"]');
  const safeMessageId = String(messageId || '').trim();
  if (!mask || !panel || !safeMessageId) return;

  panel.innerHTML = `
    <!-- ======================================================================
         [区域标注·已完成·本次旁白掉格式修正入口] AI 消息格式修正类别选择
         说明：
         1. “引用”按钮已支持把出现“引用/引用了”文字的 AI 普通气泡修正为引用气泡。
         2. “语音”按钮专门把含 [语音] / 【语音】残片的 AI 文字气泡修正为语音气泡。
         3. “旁白”按钮专门把露出“旁白”字样或 [旁白] 残片的 AI 普通气泡修正为旁白气泡。
         4. “系统提示”按钮专门修复 ai_withdraw_system 中间小字格式。
         5. 仍由 index.js 调用对应 repairAi*FormatIfPossible 后写入 DB.js / IndexedDB。
         6. 不使用 localStorage/sessionStorage，不做双份存储兜底。
         ====================================================================== -->
    <div class="chat-modal-header">
      <span>选择修正类别</span>
      <button class="chat-modal-close" data-action="close-modal" type="button">${TAB_ICONS.close}</button>
    </div>
    <div class="chat-modal-body">
      <div class="chat-modal-hint">如果普通文字气泡里露出了“旁白”字样，请选择“旁白”；露出“引用/引用了”请选择“引用”；露出 [语音] 请选择“语音”；普通回复协议掉格式请选择“文本”。修复后只更新当前消息，并通过 DB.js / IndexedDB 保存。</div>
      <div class="msg-format-repair-grid">
        <button class="msg-format-repair-option" data-action="apply-ai-format-repair" data-repair-type="sticker" data-message-id="${escapeHtml(safeMessageId)}" type="button">
          <span class="msg-format-repair-option__icon">${MSG_ICONS.sticker}</span>
          <strong>表情包</strong>
          <em>修复表情包协议或关键词</em>
        </button>
        <button class="msg-format-repair-option" data-action="apply-ai-format-repair" data-repair-type="text" data-message-id="${escapeHtml(safeMessageId)}" type="button">
          <span class="msg-format-repair-option__icon">${MSG_ICONS.textRepair}</span>
          <strong>文本</strong>
          <em>修复裸露协议/修正后内容</em>
        </button>
        <button class="msg-format-repair-option" data-action="apply-ai-format-repair" data-repair-type="voice" data-message-id="${escapeHtml(safeMessageId)}" type="button">
          <span class="msg-format-repair-option__icon">${MSG_ICONS.voiceRepair}</span>
          <strong>语音</strong>
          <em>修复 [语音] 为语音气泡</em>
        </button>
        <button class="msg-format-repair-option" data-action="apply-ai-format-repair" data-repair-type="quote" data-message-id="${escapeHtml(safeMessageId)}" type="button">
          <span class="msg-format-repair-option__icon">${MSG_ICONS.quote}</span>
          <strong>引用</strong>
          <em>修复“引用”文字为引用气泡</em>
        </button>
        <button class="msg-format-repair-option" data-action="apply-ai-format-repair" data-repair-type="aside" data-message-id="${escapeHtml(safeMessageId)}" type="button">
          <span class="msg-format-repair-option__icon">${MSG_ICONS.aside}</span>
          <strong>旁白</strong>
          <em>修复“旁白”文字为旁白气泡</em>
        </button>
        <button class="msg-format-repair-option" data-action="apply-ai-format-repair" data-repair-type="system" data-message-id="${escapeHtml(safeMessageId)}" type="button">
          <span class="msg-format-repair-option__icon">${MSG_ICONS.systemTip}</span>
          <strong>系统提示</strong>
          <em>修复撤回小字格式</em>
        </button>
      </div>
      <div class="chat-modal-notice" data-role="modal-notice"></div>
    </div>
    <div class="chat-modal-footer">
      <button class="chat-modal-btn chat-modal-btn--secondary" data-action="close-modal" type="button">取消</button>
    </div>
  `;

  mask.classList.remove('is-hidden');
}

/* ========================================================================
   [区域标注·已完成·用户消息撤回] 用户消息撤回确认弹窗
   说明：
   1. 使用闲谈应用内 chat-modal 样式，不使用浏览器原生弹窗或原生选择器。
   2. 用户可选择“AI 不可见 / AI 可见”；真正撤回和 IndexedDB 持久化由 index.js 处理。
   3. 点击撤回按钮只打开本弹窗，不重绘聊天页，避免闪屏。
   ======================================================================== */
export function showUserWithdrawMessageModal(container, message = {}) {
  const mask = container.querySelector('[data-role="modal-mask"]');
  const panel = container.querySelector('[data-role="modal-panel"]');
  const messageId = String(message?.id || '').trim();
  if (!mask || !panel || !messageId) return;

  panel.innerHTML = `
    <!-- [区域标注·已完成·用户消息撤回] 应用内撤回确认弹窗 -->
    <div class="chat-modal-header">
      <span>撤回消息</span>
      <button class="chat-modal-close" data-action="close-modal" type="button">${TAB_ICONS.close}</button>
    </div>
    <div class="chat-modal-body">
      <div class="chat-modal-hint">撤回后聊天界面会显示“你撤回了一条消息”。请选择下一轮对方回复时是否允许对方看见这条被撤回的原文。</div>
      <div class="msg-withdrawn-content">${escapeHtml(getMessageDisplayTextForQuote(message) || '（空消息）')}</div>
    </div>
    <div class="chat-modal-footer msg-user-withdraw-modal-footer">
      <button class="chat-modal-btn chat-modal-btn--secondary msg-user-withdraw-modal-btn" data-action="confirm-user-withdraw-message" data-message-id="${escapeHtml(messageId)}" data-ai-visible="0" type="button">撤回，对方不可见</button>
      <button class="chat-modal-btn chat-modal-btn--primary msg-user-withdraw-modal-btn" data-action="confirm-user-withdraw-message" data-message-id="${escapeHtml(messageId)}" data-ai-visible="1" type="button">撤回，对方可见</button>
    </div>
  `;

  mask.classList.remove('is-hidden');
}

/* ========================================================================
   [区域标注·已完成·本次撤回弹窗称谓文案调整] 对方撤回查看弹窗
   说明：你点击对方撤回系统提示后查看原文；应用内弹窗，不使用原生浏览器弹窗。
   ======================================================================== */
export function showAiWithdrawnMessageModal(container, message = {}) {
  const mask = container.querySelector('[data-role="modal-mask"]');
  const panel = container.querySelector('[data-role="modal-panel"]');
  if (!mask || !panel) return;

  panel.innerHTML = `
    <!-- [区域标注·已完成·本次撤回弹窗称谓文案调整] 对方撤回查看弹窗 -->
    <div class="chat-modal-header">
      <span>撤回的消息</span>
      <button class="chat-modal-close" data-action="close-modal" type="button">${TAB_ICONS.close}</button>
    </div>
    <div class="chat-modal-body">
      <div class="chat-modal-hint">这条内容已被对方撤回；你可查看原文，后续对方只能看到自己撤回了什么。</div>
      <div class="msg-withdrawn-content">${escapeHtml(message.withdrawnContent || message.aiVisibleWithdrawnSummary || '')}</div>
    </div>
    <div class="chat-modal-footer">
      <button class="chat-modal-btn chat-modal-btn--primary" data-action="close-modal" type="button">知道了</button>
    </div>
  `;

  mask.classList.remove('is-hidden');
}

export function showAiFormatRepairResultModal(container, { success = false, title = '', message = '' } = {}) {
  const mask = container.querySelector('[data-role="modal-mask"]');
  const panel = container.querySelector('[data-role="modal-panel"]');
  if (!mask || !panel) return;

  panel.innerHTML = `
    <!-- [区域标注·已完成·本次修正分类弹窗] AI 消息格式修正结果提示弹窗 -->
    <div class="chat-modal-header">
      <span>${escapeHtml(title || (success ? '修正完成' : '无法修正'))}</span>
      <button class="chat-modal-close" data-action="close-modal" type="button">${TAB_ICONS.close}</button>
    </div>
    <div class="chat-modal-body">
      <div class="chat-modal-hint">${escapeHtml(message || (success ? '已将这条 AI 消息修正为表情包消息。' : '未识别到可匹配的已挂载表情包格式或关键词。'))}</div>
    </div>
    <div class="chat-modal-footer">
      <button class="chat-modal-btn chat-modal-btn--primary" data-action="close-modal" type="button">知道了</button>
    </div>
  `;

  mask.classList.remove('is-hidden');
}

export function showEditMessageModal(container, state, messageId) {
  const mask = container.querySelector('[data-role="modal-mask"]');
  const panel = container.querySelector('[data-role="modal-panel"]');
  const message = (state.currentMessages || []).find(item => String(item.id) === String(messageId));
  if (!mask || !panel || !message) return;

  panel.innerHTML = `
    <!-- ======================================================================
         [区域标注·已完成·普通气泡编辑弹窗] 编辑聊天气泡正文
         说明：仅编辑 message.content；旁白编辑请看下方 showEditAsideModal。
         ====================================================================== -->
    <div class="chat-modal-header">
      <span>编辑消息</span>
      <button class="chat-modal-close" data-action="close-modal" type="button">${TAB_ICONS.close}</button>
    </div>
    <div class="chat-modal-body">
      <textarea class="chat-modal-search" data-role="edit-message-content-input" maxlength="2000" style="min-height:108px;resize:none;">${escapeHtml(message.content || '')}</textarea>
      <div class="chat-modal-notice" data-role="modal-notice"></div>
    </div>
    <div class="chat-modal-footer">
      <button class="chat-modal-btn chat-modal-btn--secondary" data-action="close-modal" type="button">取消</button>
      <button class="chat-modal-btn chat-modal-btn--primary" data-action="confirm-edit-message" data-message-id="${escapeHtml(messageId)}" type="button">保存</button>
    </div>
  `;
  mask.classList.remove('is-hidden');
  setTimeout(() => panel.querySelector('[data-role="edit-message-content-input"]')?.focus(), 30);
}

/* ==========================================================================
   [区域标注·已完成·本次旁白编辑弹窗指向修复] 旁白专用编辑弹窗
   说明：
   1. 只读取并编辑 owner 消息上的 asideSegments[].text / 兼容 asideText，不读取 message.content。
   2. 弹窗沿用闲谈应用 chat-modal 主题样式，不使用浏览器原生弹窗或原生选择器。
   3. 保存 action 为 confirm-edit-aside，由 index.js 写回 currentMessages 并通过 DB.js / IndexedDB 持久化。
   ========================================================================== */
export function showEditAsideModal(container, state, messageId, asideSegmentId) {
  const mask = container.querySelector('[data-role="modal-mask"]');
  const panel = container.querySelector('[data-role="modal-panel"]');
  const message = (state.currentMessages || []).find(item => String(item.id) === String(messageId));
  const safeAsideSegmentId = String(asideSegmentId || '').trim();
  const asideSegment = getAsideSegmentsFromMessage(message)
    .find(segment => String(segment.id || '') === safeAsideSegmentId);
  if (!mask || !panel || !message || !asideSegment) return;

  panel.innerHTML = `
    <!-- ======================================================================
         [区域标注·已完成·本次旁白编辑弹窗指向修复] 编辑旁白内容
         说明：此弹窗只编辑当前旁白段文本，不会改动所属 AI 消息正文 content。
         ====================================================================== -->
    <div class="chat-modal-header">
      <span>编辑旁白</span>
      <button class="chat-modal-close" data-action="close-modal" type="button">${TAB_ICONS.close}</button>
    </div>
    <div class="chat-modal-body">
      <textarea class="chat-modal-search" data-role="edit-aside-content-input" maxlength="2000" style="min-height:108px;resize:none;">${escapeHtml(asideSegment.text || '')}</textarea>
      <div class="chat-modal-notice" data-role="modal-notice"></div>
    </div>
    <div class="chat-modal-footer">
      <button class="chat-modal-btn chat-modal-btn--secondary" data-action="close-modal" type="button">取消</button>
      <button class="chat-modal-btn chat-modal-btn--primary" data-action="confirm-edit-aside" data-message-id="${escapeHtml(messageId)}" data-aside-segment-id="${escapeHtml(safeAsideSegmentId)}" type="button">保存</button>
    </div>
  `;
  mask.classList.remove('is-hidden');
  setTimeout(() => panel.querySelector('[data-role="edit-aside-content-input"]')?.focus(), 30);
}

export function showFavoriteSavedModal(container, count) {
  const mask = container.querySelector('[data-role="modal-mask"]');
  const panel = container.querySelector('[data-role="modal-panel"]');
  if (!mask || !panel) return;

  panel.innerHTML = `
    <div class="chat-modal-header">
      <span>收藏完成</span>
      <button class="chat-modal-close" data-action="close-modal" type="button">${TAB_ICONS.close}</button>
    </div>
    <div class="chat-modal-body"><div class="chat-modal-hint">已收藏 ${Number(count || 0)} 条消息，可在用户主页“收藏”折叠栏中查看。</div></div>
    <div class="chat-modal-footer"><button class="chat-modal-btn chat-modal-btn--primary" data-action="close-modal" type="button">知道了</button></div>
  `;
  mask.classList.remove('is-hidden');
}

export function showForwardMessagesModal(container, state) {
  const mask = container.querySelector('[data-role="modal-mask"]');
  const panel = container.querySelector('[data-role="modal-panel"]');
  if (!mask || !panel) return;

  const selectedMessages = getSelectedMessages(state);
  const targets = getVisibleChatSessions(state).filter(session => String(session.id) !== String(state.currentChatId));

  const targetHtml = targets.length
    ? targets.map(session => `
        <!-- [区域标注·本次需求5] 可转发联系人：${escapeHtml(session.name || '未命名')} -->
        <button class="chat-forward-target" data-action="confirm-forward-messages" data-chat-id="${escapeHtml(session.id)}" type="button">
          <span class="chat-forward-target__avatar">
            ${session.avatar
              ? `<img src="${escapeHtml(session.avatar)}" alt="${escapeHtml(session.name || '')}">`
              : escapeHtml((session.name || '?').charAt(0).toUpperCase())}
          </span>
          <span class="chat-forward-target__name">${escapeHtml(session.name || '未命名')}</span>
          <span class="chat-forward-target__icon">${TAB_ICONS.forward}</span>
        </button>
      `).join('')
    : `<div class="chat-modal-hint">暂无其它可转发的聊天联系人。</div>`;

  panel.innerHTML = `
    <!-- [区域标注·本次需求5] 多选消息转发弹窗 -->
    <div class="chat-modal-header">
      <span>转发 ${selectedMessages.length} 条消息</span>
      <button class="chat-modal-close" data-action="close-modal" type="button">${TAB_ICONS.close}</button>
    </div>
    <div class="chat-modal-body">
      ${targetHtml}
    </div>
  `;

  mask.classList.remove('is-hidden');
}
