// @ts-nocheck
/**
 * 文件名: js/apps/chat/chat-voice.js
 * 用途: 闲谈应用 — 独立语音消息板块。
 *       负责咖啡功能区“语音”入口、应用内文字转模拟语音弹窗、语音气泡渲染与 AI 上下文文本。
 * 架构层: 应用层（闲谈子模块）
 */

import { TAB_ICONS, escapeHtml } from './chat-utils.js';

/* ==========================================================================
   [区域标注·已完成·语音板块 IconPark 图标]
   说明：
   1. 本文件内语音入口与语音气泡图案统一使用 IconPark 风格 SVG。
   2. 后续如需替换图标，只修改本区域即可。
   3. 本区域不涉及持久化存储，不使用 localStorage/sessionStorage。
   ========================================================================== */
const VOICE_ICONS = {
  voice: `<svg viewBox="0 0 48 48" fill="none"><rect x="17" y="5" width="14" height="24" rx="7" stroke="currentColor" stroke-width="3"/><path d="M10 22c0 8 6 14 14 14s14-6 14-14" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M24 36v7M17 43h14" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`,
  wave: `<svg viewBox="0 0 48 48" fill="none"><path d="M18 16c3 3 4.5 5.7 4.5 8S21 29 18 32" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M25 10c5.5 5 8 9.5 8 14s-2.5 9-8 14" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M32 5c8 7 12 13.5 12 19S40 36 32 43" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`,
  play: `<svg viewBox="0 0 48 48" fill="none"><path d="M17 12v24l20-12L17 12Z" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round"/></svg>`,
  download: `<svg viewBox="0 0 48 48" fill="none"><path d="M24 6v24" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="m14 21 10 10 10-10" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 38h28" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`,
  sparkle: `<svg viewBox="0 0 48 48" fill="none"><path d="M23 4c1.8 9.1 5.9 13.2 15 15-9.1 1.8-13.2 5.9-15 15-1.8-9.1-5.9-13.2-15-15 9.1-1.8 13.2-5.9 15-15Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M38 30c.8 4.2 2.8 6.2 7 7-4.2.8-6.2 2.8-7 7-.8-4.2-2.8-6.2-7-7 4.2-.8 6.2-2.8 7-7Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>`
};

/* ==========================================================================
   [区域标注·已完成·本次语音掉格式强容错解析]
   说明：
   1. type=voice_message 同时支持用户模拟语音与 AI 主动发送语音消息。
   2. 前端只要在 AI 文本中识别到 `[语音]` / `【语音】` 标记，就优先按语音消息解析并渲染语音气泡。
   3. 已兼容漏角色冒号、Markdown 反引号/加粗、`{时长:5}` / `{5}` / `时长:5` 等掉格式写法。
   4. voiceText/voiceDuration 随当前聊天消息统一写入 DB.js / IndexedDB；本区域不读取或写入 localStorage/sessionStorage，不做双份存储兜底，不按长文本字段过滤。
   ========================================================================== */
export function isVoiceMessage(message = {}) {
  return String(message?.type || '') === 'voice_message';
}

export function normalizeVoiceText(value = '') {
  return String(value || '').trim();
}

/* ==========================================================================
   [区域标注·已完成·本次语音转文字清洗]
   说明：
   1. 仅服务语音消息的转文字内容展示与协议入库前整理。
   2. 已清除 `{4}` / `{时长:4}` 这类时长残留，避免展开后出现在正文最前面。
   3. 已移除中英文括号及括号内动作描写，例如 `（叹气）` / `(sigh)`。
   4. 本区域只处理字符串，不涉及持久化存储，不使用 localStorage/sessionStorage。
   ========================================================================== */
export function sanitizeVoiceTranscriptText(value = '') {
  return normalizeVoiceText(value)
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<\/?think>/gi, '')
    .replace(/^[\s`*_#"'“”]+|[\s`*_#"'“”]+$/g, '')
    .replace(/^(?:(?:\[\s*语音\s*\]|【\s*语音\s*】)\s*)+/gi, '')
    .replace(/^[^：:\n{}]{1,40}\s*[：:]\s*(?=(?:\{\s*(?:(?:时长|duration)\s*[：:]\s*)?\d{1,2})|(?:(?:时长|duration)\s*[：:]\s*\d{1,2}))/i, '')
    .replace(/^(?:\{\s*(?:(?:时长|duration)\s*[：:]\s*)?\d{1,2}\s*(?:秒|s)?\s*\}\s*)+/gi, '')
    .replace(/^(?:(?:时长|duration)\s*[：:]\s*\d{1,2}\s*(?:秒|s)?\s*[，,;；。\s]*)+/gi, '')
    .replace(/（[^（）]*）|\([^()]*\)/g, '')
    .replace(/\s+([，。！？；：、])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function getVoiceMessageDisplayText(message = {}) {
  const text = sanitizeVoiceTranscriptText(message?.voiceText || message?.content || '');
  return `[语音] ${text || '语音消息'}`;
}

export function buildVoiceAiContent(text = '') {
  const safeText = sanitizeVoiceTranscriptText(text);
  return `用户发送了一条语音消息，语音转文字内容：${safeText}`;
}

export function createVoiceMessage(text = '', options = {}) {
  const voiceText = sanitizeVoiceTranscriptText(text);
  if (!voiceText) return null;

  const duration = Math.max(1, Math.min(60, Math.ceil(voiceText.length / 3)));
  return {
    id: `user_voice_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    role: 'user',
    type: 'voice_message',
    content: buildVoiceAiContent(voiceText),
    voiceText,
    voiceDuration: Number(options.voiceDuration || duration) || duration,
    voiceExpanded: false,
    timestamp: Date.now()
  };
}

/* ==========================================================================
   [区域标注·已完成·本次语音掉格式强容错解析]
   说明：
   1. 已支持 AI 输出的 `[语音] 角色名：{时长:xx}语音转写文本`、`[语音]{4}文本` 与 `【语音】时长:4 文本`。
   2. 只要文本里出现 `[语音]` / `【语音】` 标记，就从标记后方提取语音内容，避免 Markdown 反引号、加粗符号或前置杂字符导致掉格式。
   3. `{4}` / `{时长:4}` / `时长:4` 会被解析为 voiceDuration=4，不再掉进 voiceText 导致展开时显示在正文前。
   4. voiceText/content 均写入清洗后的转文字文本；持久化仍由聊天消息页写入 DB.js / IndexedDB。
   ========================================================================== */
export function parseAiVoiceProtocolPayload(content = '') {
  const normalized = normalizeVoiceText(content)
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<\/?think>/gi, '')
    .replace(/^[\s`*_#"'“”]+|[\s`*_#"'“”]+$/g, '')
    .trim();
  if (!normalized) return null;

  const markerMatch = normalized.match(/(?:\[\s*语音\s*\]|【\s*语音\s*】)/i);
  let candidate = (markerMatch
    ? normalized.slice(markerMatch.index + markerMatch[0].length)
    : normalized)
    .replace(/^[\s`*_#"'“”]+|[\s`*_#"'“”]+$/g, '')
    .trim();

  const durationMatch = candidate.match(/^(?:[^：:\n{}]{1,40}\s*[：:]\s*)?\{\s*(?:(?:时长|duration)\s*[：:]\s*)?(\d{1,2})\s*(?:秒|s)?\s*\}\s*([\s\S]*)$/i)
    || candidate.match(/^(?:[^：:\n{}]{1,40}\s*[：:]\s*)?(?:时长|duration)\s*[：:]\s*(\d{1,2})\s*(?:秒|s)?\s*[，,;；。\s]*([\s\S]*)$/i)
    || candidate.match(/^[^{}\n]{1,40}\s+\{\s*(?:(?:时长|duration)\s*[：:]\s*)?(\d{1,2})\s*(?:秒|s)?\s*\}\s*([\s\S]*)$/i);

  if (!durationMatch && markerMatch) {
    candidate = candidate.replace(/^[^：:\n{}]{1,40}\s*[：:]\s*/, '').trim();
  }

  const voiceText = sanitizeVoiceTranscriptText(durationMatch ? durationMatch[2] : candidate);
  if (!voiceText) return null;

  const durationFromProtocol = durationMatch ? Number(durationMatch[1]) : 0;
  const duration = Math.max(1, Math.min(60, Math.floor(durationFromProtocol || Math.ceil(voiceText.length / 3) || 1)));

  return {
    voiceText,
    voiceDuration: duration,
    content: `[语音] ${voiceText}`
  };
}

export function createAiVoiceMessageFromProtocol(block = {}) {
  const payload = parseAiVoiceProtocolPayload(block?.content || '');
  if (!payload) return null;

  return {
    role: 'assistant',
    type: 'voice_message',
    voiceRoleName: String(block?.roleName || '').trim(),
    voiceExpanded: false,
    ...payload
  };
}

/* ==========================================================================
   [区域标注·已完成·咖啡功能区语音入口]
   说明：
   1. 本按钮插入聊天消息页底栏“咖啡”功能区。
   2. 点击后由 index.js 打开 showVoiceMessageModal 应用内弹窗。
   3. 仅新增语音板块入口，不修改其它咖啡功能区板块行为。
   ========================================================================== */
export function renderVoiceFeatureButton() {
  return `
    <button class="msg-feature-dock__item" type="button" data-action="open-msg-voice-modal" data-feature="voice">
      ${VOICE_ICONS.voice}<span>语音</span>
    </button>
  `;
}

/* ==========================================================================
   [区域标注·已完成·本次语音气泡向下展开]
   说明：
   1. 用户模拟语音与 AI 主动语音共用本气泡：播放键 + 波长条 + 0:xx 秒数，默认不直接露出文字。
   2. 双击后在原语音条下方直接展开“语音转文字”区域，不覆盖主语音条，布局参考 QQ / 微信 的分层展示。
   3. 气泡宽度保持固定，不再随转文字长度变化，避免展开时气泡横向抖动或误以为大小被改动。
   4. 渲染只读取消息对象字段；持久化由 index.js 调用 DB.js / IndexedDB 完成，不使用 localStorage/sessionStorage。
   ========================================================================== */
function formatVoiceBubbleDuration(seconds = 1) {
  const safeSeconds = Math.max(1, Math.min(60, Math.floor(Number(seconds) || 1)));
  return `0:${String(safeSeconds).padStart(2, '0')}`;
}

export function renderVoiceBubble(message = {}) {
  const text = sanitizeVoiceTranscriptText(message?.voiceText || message?.content || '');
  const duration = Math.max(1, Math.min(60, Number(message?.voiceDuration || Math.ceil(text.length / 3) || 1)));
  const expanded = Boolean(message?.voiceExpanded);
  const waveBars = [18, 24, 30, 22, 34, 40, 28, 36, 44, 30, 38, 24];

  return `
    <div class="msg-voice-bubble ${expanded ? 'is-expanded' : ''}"
         data-action="toggle-msg-voice-transcript"
         data-message-id="${escapeHtml(message?.id || '')}"
         style="--msg-voice-bubble-width:220px"
         title="双击展开/收起语音转文字">
      <div class="msg-voice-bubble__main">
        <span class="msg-voice-bubble__play" aria-hidden="true">${VOICE_ICONS.play}</span>
        <span class="msg-voice-bubble__wave" aria-hidden="true">
          ${waveBars.map((height) => `<i style="--bar-height:${height}%"></i>`).join('')}
        </span>
        <span class="msg-voice-bubble__duration">${escapeHtml(formatVoiceBubbleDuration(duration))}</span>
        <span class="msg-voice-bubble__download" aria-hidden="true">${VOICE_ICONS.download}</span>
      </div>
      ${expanded ? `
        <div class="msg-voice-bubble__expand">
          <div class="msg-voice-bubble__expand-label">语音转文字</div>
          <div class="msg-voice-bubble__expand-text">${escapeHtml(text)}</div>
        </div>
      ` : ''}
    </div>
  `;
}

/* ==========================================================================
   [区域标注·已完成·语音输入应用内弹窗保存按钮去图标]
   说明：
   1. 弹窗沿用闲谈应用 chat-modal 样式，不使用浏览器原生 alert/confirm/prompt。
   2. 用户输入文字后保存为模拟语音消息，并发送到当前聊天界面。
   3. 本次已将“保存”主按钮改为纯文字，不再显示图标，只保留“保存”两个字。
   4. 弹窗本身不做持久化；保存流程由 index.js 创建消息并写入 DB.js / IndexedDB。
   ========================================================================== */
export function showVoiceMessageModal(container) {
  const mask = container.querySelector('[data-role="modal-mask"]');
  const panel = container.querySelector('[data-role="modal-panel"]');
  if (!mask || !panel) return;

  panel.innerHTML = `
    <!-- [区域标注·已完成·语音板块弹窗保存按钮去图标] 输入文字并保存为模拟语音消息 -->
    <div class="chat-modal-header">
      <span>语音</span>
      <button class="chat-modal-close" data-action="close-modal" type="button">${TAB_ICONS.close}</button>
    </div>
    <div class="chat-modal-body msg-voice-modal-body">
      <div class="chat-modal-hint">输入要模拟成语音消息的文字。保存后会发送到当前聊天界面；对方会收到“这是用户的语音消息”的上下文。</div>
      <textarea class="chat-modal-search msg-voice-modal-input"
                data-role="msg-voice-text-input"
                placeholder="输入语音转文字内容"></textarea>
      <div class="chat-modal-notice" data-role="modal-notice"></div>
    </div>
    <div class="chat-modal-footer">
      <button class="chat-modal-btn chat-modal-btn--secondary" data-action="close-modal" type="button">取消</button>
      <button class="chat-modal-btn chat-modal-btn--primary" data-action="confirm-msg-voice" type="button">保存</button>
    </div>
  `;

  mask.classList.remove('is-hidden');
  setTimeout(() => panel.querySelector('[data-role="msg-voice-text-input"]')?.focus(), 30);
}

export function parseVoiceDraftFromModal(container) {
  return normalizeVoiceText(container.querySelector('[data-role="msg-voice-text-input"]')?.value || '');
}
