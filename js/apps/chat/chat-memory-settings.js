// @ts-nocheck
/**
 * 文件名: js/apps/chat/chat-memory-settings.js
 * 用途: 闲谈应用 — 聊天设置页“记忆设置”独立 UI 与长期记忆总结模块
 * 架构层: 应用层（闲谈子模块）
 */

import {
  TAB_ICONS,
  dbGet,
  dbPut,
  escapeHtml,
  getCurrentChatPromptSettingsKey
} from './chat-utils.js';
import { upsertMemoryItem } from '../memory/memory-db.js';

/* ==========================================================================
   [区域标注·已修改·记忆设置独立模块总说明]
   说明：
   1. 本模块负责聊天设置页“记忆设置”板块：短期记忆 UI、长期记忆 UI、长期记忆总结触发与旧事写入。
   2. “长期记忆”已接入：总结轮数保存、自动总结开关、手动总结一次性触发。
   3. 总结只调用设置应用里的副 API 配置，不回退主 API，不写双份请求兜底。
   4. 总结结果通过旧事应用 memory-db.js 写入 DB.js / IndexedDB；不使用 localStorage/sessionStorage。
   5. 不使用 alert/confirm/prompt 或浏览器原生选择器；完成提示统一使用闲谈应用内弹窗样式。
   6. 不做长文本字段过滤，不截断持久化字段。
   ========================================================================== */

const ICONPARK_ARROW_RIGHT = `
  <svg viewBox="0 0 48 48" fill="none">
    <path d="M19 12l12 12-12 12" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
`;

const DEFAULT_LONG_TERM_MEMORY_SETTINGS = Object.freeze({
  longTermMemorySummaryRounds: 3,
  longTermMemoryAutoSummaryEnabled: false,
  longTermMemoryManualSummaryEnabled: false,
  longTermMemoryLastAutoSummaryRoundIndex: 0,
  longTermMemorySummaryPerson: 'third',
  longTermMemorySummaryMinWords: '100',
  longTermMemorySummaryMaxWords: '200',
  longTermMemoryCustomSummaryPrompt: ''
});

/* ==========================================================================
   [区域标注·已完成·本次自定义长期记忆设置规范化与持久化]
   说明：
   1. 只规范化长期记忆相关字段，不改动其它聊天设置字段。
   2. “总结轮数”允许留空；留空时自动/手动总结均不执行，不强制回填默认数字。
   3. “自定义字数范围”默认 100-200 字，输入框不做前端限制，原样保存用户填写文本。
   4. “自定义总结词”原样保存；有内容时用于替代默认长期记忆总结提示词主体。
   5. 所有字段写入当前面具 + 当前聊天对象的 chatPromptSettings，经 DB.js / IndexedDB 持久化；不使用 localStorage/sessionStorage。
   ========================================================================== */
function normalizeLongTermMemorySettings(source = {}) {
  const settings = source && typeof source === 'object' ? source : {};
  const hasRoundsValue = Object.prototype.hasOwnProperty.call(settings, 'longTermMemorySummaryRounds');
  const rawRoundsText = hasRoundsValue ? String(settings.longTermMemorySummaryRounds ?? '').trim() : '';
  const rawRoundsNumber = Number(rawRoundsText);
  const rawLastAutoRoundIndex = Number(settings.longTermMemoryLastAutoSummaryRoundIndex || 0);
  const rawSummaryPerson = String(settings.longTermMemorySummaryPerson || DEFAULT_LONG_TERM_MEMORY_SETTINGS.longTermMemorySummaryPerson).trim();

  return {
    longTermMemorySummaryRounds: hasRoundsValue && rawRoundsText === ''
      ? ''
      : (Number.isFinite(rawRoundsNumber)
          ? Math.max(0, Math.floor(rawRoundsNumber))
          : DEFAULT_LONG_TERM_MEMORY_SETTINGS.longTermMemorySummaryRounds),
    longTermMemoryAutoSummaryEnabled: Boolean(settings.longTermMemoryAutoSummaryEnabled),
    longTermMemoryManualSummaryEnabled: Boolean(settings.longTermMemoryManualSummaryEnabled),
    longTermMemoryLastAutoSummaryRoundIndex: Number.isFinite(rawLastAutoRoundIndex)
      ? Math.max(0, Math.floor(rawLastAutoRoundIndex))
      : 0,
    longTermMemorySummaryPerson: ['first', 'third'].includes(rawSummaryPerson)
      ? rawSummaryPerson
      : DEFAULT_LONG_TERM_MEMORY_SETTINGS.longTermMemorySummaryPerson,
    longTermMemorySummaryMinWords: Object.prototype.hasOwnProperty.call(settings, 'longTermMemorySummaryMinWords')
      ? String(settings.longTermMemorySummaryMinWords ?? '')
      : DEFAULT_LONG_TERM_MEMORY_SETTINGS.longTermMemorySummaryMinWords,
    longTermMemorySummaryMaxWords: Object.prototype.hasOwnProperty.call(settings, 'longTermMemorySummaryMaxWords')
      ? String(settings.longTermMemorySummaryMaxWords ?? '')
      : DEFAULT_LONG_TERM_MEMORY_SETTINGS.longTermMemorySummaryMaxWords,
    longTermMemoryCustomSummaryPrompt: String(settings.longTermMemoryCustomSummaryPrompt ?? DEFAULT_LONG_TERM_MEMORY_SETTINGS.longTermMemoryCustomSummaryPrompt)
  };
}

function getLongTermMemorySummaryRoundCount(settings = {}) {
  const rawValue = settings?.longTermMemorySummaryRounds;
  if (rawValue === '' || rawValue === null || rawValue === undefined) return 0;

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

function ensureLongTermMemorySettings(state = {}) {
  if (!state.chatPromptSettings || typeof state.chatPromptSettings !== 'object') {
    state.chatPromptSettings = {};
  }

  const normalized = normalizeLongTermMemorySettings(state.chatPromptSettings);
  Object.assign(state.chatPromptSettings, normalized);
  return normalized;
}

async function persistLongTermMemorySettings(state = {}, db = null) {
  await dbPut(db, getCurrentChatPromptSettingsKey(state), state.chatPromptSettings);
}

/* ==========================================================================
   [区域标注·已完成·长期记忆副 API 请求工具]
   说明：
   1. 只读取 settings.api.secondary；不回退主 API，不做双份请求兜底。
   2. 支持 openai/deepseek/gemini/claude，与设置应用副 API 结构保持一致。
   3. 请求结果只用于生成旧事记忆条目，不写入聊天记录，不使用 localStorage/sessionStorage。
   ========================================================================== */
function trimSlash(url = '') {
  return String(url || '').replace(/\/+$/, '');
}

function normalizeSecondaryApiProfile(apiSettings = {}) {
  const secondary = apiSettings?.secondary && typeof apiSettings.secondary === 'object' ? apiSettings.secondary : {};
  const provider = ['openai', 'deepseek', 'gemini', 'claude'].includes(String(secondary.provider || '').trim())
    ? String(secondary.provider || '').trim()
    : 'gemini';

  const defaultBaseUrlMap = {
    openai: 'https://api.openai.com/v1',
    deepseek: 'https://api.deepseek.com/v1',
    gemini: 'https://generativelanguage.googleapis.com/v1beta',
    claude: 'https://api.anthropic.com/v1'
  };

  return {
    provider,
    apiKey: String(secondary.apiKey || '').trim(),
    baseUrl: trimSlash(secondary.baseUrl || defaultBaseUrlMap[provider]),
    model: String(secondary.model || '').trim(),
    stream: false,
    temperature: Number.isFinite(Number(apiSettings?.global?.temperature)) ? Number(apiSettings.global.temperature) : 0.7,
    maxTokens: Math.max(256, Math.min(2048, Number(apiSettings?.global?.maxTokens || 1024) || 1024))
  };
}

function extractApiErrorMessage(payload, fallback = 'API 请求失败') {
  if (!payload) return fallback;
  if (typeof payload === 'string') return payload;
  return payload?.error?.message || payload?.error?.msg || payload?.message || payload?.detail || fallback;
}

async function requestLongTermMemoryOpenAiLike(profile, messages) {
  const response = await fetch(`${trimSlash(profile.baseUrl)}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${profile.apiKey}`
    },
    body: JSON.stringify({
      model: profile.model,
      temperature: profile.temperature,
      max_tokens: profile.maxTokens,
      stream: false,
      messages
    })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(extractApiErrorMessage(payload, `HTTP ${response.status}`));
  return String(payload?.choices?.[0]?.message?.content || '').trim();
}

function getSecondaryMessageContentText(content) {
  if (Array.isArray(content)) {
    return content
      .map(part => {
        if (typeof part === 'string') return part;
        if (part?.type === 'text') return String(part.text || '');
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return String(content || '');
}

async function requestLongTermMemoryGemini(profile, messages) {
  const parts = [];
  messages.forEach(item => {
    const roleLabel = item.role === 'system' ? '系统' : '用户';
    parts.push({ text: `${roleLabel}：${getSecondaryMessageContentText(item.content)}\n\n` });
  });

  const url = `${trimSlash(profile.baseUrl)}/models/${encodeURIComponent(profile.model)}:generateContent?key=${encodeURIComponent(profile.apiKey)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        temperature: profile.temperature,
        maxOutputTokens: profile.maxTokens
      }
    })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(extractApiErrorMessage(payload, `HTTP ${response.status}`));
  return String(payload?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
}

async function requestLongTermMemoryClaude(profile, messages) {
  const system = messages
    .filter(item => item.role === 'system')
    .map(item => getSecondaryMessageContentText(item.content))
    .filter(Boolean)
    .join('\n\n');
  const userText = messages
    .filter(item => item.role !== 'system')
    .map(item => getSecondaryMessageContentText(item.content))
    .filter(Boolean)
    .join('\n\n');

  const response = await fetch(`${trimSlash(profile.baseUrl)}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': profile.apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: profile.model,
      temperature: profile.temperature,
      max_tokens: profile.maxTokens,
      system,
      messages: [{ role: 'user', content: [{ type: 'text', text: userText || '请按要求返回 JSON。' }] }]
    })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(extractApiErrorMessage(payload, `HTTP ${response.status}`));
  return String(payload?.content?.find?.(item => item?.type === 'text')?.text || payload?.content?.[0]?.text || '').trim();
}

async function requestLongTermMemoryBySecondaryApi(profile, messages) {
  if (!profile.apiKey) throw new Error('副 API Key 不能为空');
  if (!profile.model) throw new Error('请先在设置应用选择副 API 模型');

  if (profile.provider === 'gemini') return requestLongTermMemoryGemini(profile, messages);
  if (profile.provider === 'claude') return requestLongTermMemoryClaude(profile, messages);
  return requestLongTermMemoryOpenAiLike(profile, messages);
}

function extractJsonObjectFromAiText(text = '') {
  const raw = String(text || '').trim();
  if (!raw) return null;

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;
  try {
    const parsed = JSON.parse(candidate);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch (_) {}

  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(candidate.slice(start, end + 1));
      if (parsed && typeof parsed === 'object') return parsed;
    } catch (_) {}
  }

  return null;
}

/* ==========================================================================
   [区域标注·已完成·长期记忆消息轮次截取与日期来源同步]
   说明：
   1. 一轮 = 连续 user 消息组 + 后续连续 assistant 消息组；系统提示类消息不单独计轮。
   2. 自动总结截取“总结轮数”设定的最新 N 轮；手动总结截取“最新一轮 + 之前 N 轮”。
   3. 每条待总结消息会附带真实发送日期时间，确保旧事“记忆摘要”可总结出年月日。
   4. 这里只读取当前 state.currentMessages 或 IndexedDB 中当前聊天消息，不写聊天记录。
   ========================================================================== */
function formatMemorySummaryDateTime(timestamp = Date.now()) {
  const date = new Date(Number(timestamp || 0) || Date.now());
  const pad = number => String(number).padStart(2, '0');
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatMemorySummaryDate(timestamp = Date.now()) {
  const date = new Date(Number(timestamp || 0) || Date.now());
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function getRoundMemoryTimestamp(round = {}) {
  const timestamps = [
    ...(Array.isArray(round.userMessages) ? round.userMessages : []),
    ...(Array.isArray(round.assistantMessages) ? round.assistantMessages : [])
  ].map(item => Number(item?.timestamp || 0) || 0).filter(Boolean);

  return timestamps.length ? Math.min(...timestamps) : Number(round.startedAt || Date.now()) || Date.now();
}

function getMessageMemoryText(message = {}) {
  const type = String(message?.type || '').trim();
  if (type === 'sticker') return `[表情包] ${String(message?.stickerName || message?.content || '').trim()}`;
  if (type === 'image') return `[图片] ${String(message?.imageName || message?.content || '').trim()}`;
  if (type === 'transfer') return `[转账] ${String(message?.transferDisplayAmount || message?.content || '').trim()}`;
  if (type === 'gift') return `[礼物] ${String(message?.giftTitle || message?.content || '').trim()}`;
  if (type === 'voice') return `[语音] ${String(message?.content || '').trim()}`;
  if (type === 'user_withdraw_system' || type === 'ai_withdraw_system') return `[撤回提示] ${String(message?.content || '').trim()}`;
  return String(message?.content || '').trim();
}

function buildConversationRounds(messages = []) {
  const rounds = [];
  let currentRound = null;
  let phase = '';

  (Array.isArray(messages) ? messages : []).forEach(message => {
    const role = String(message?.role || '').trim();
    if (role !== 'user' && role !== 'assistant') return;

    const text = getMessageMemoryText(message);
    if (!text) return;

    if (role === 'user') {
      if (!currentRound || phase === 'assistant') {
        currentRound = { userMessages: [], assistantMessages: [], startedAt: Number(message?.timestamp || Date.now()) || Date.now() };
        rounds.push(currentRound);
      }
      currentRound.userMessages.push({ ...message, __memoryText: text });
      phase = 'user';
      return;
    }

    if (!currentRound) {
      currentRound = { userMessages: [], assistantMessages: [], startedAt: Number(message?.timestamp || Date.now()) || Date.now() };
      rounds.push(currentRound);
    }
    currentRound.assistantMessages.push({ ...message, __memoryText: text });
    phase = 'assistant';
  });

  return rounds.filter(round => round.userMessages.length || round.assistantMessages.length);
}

function formatRoundsForSummary(rounds = [], session = {}, mask = {}, character = null) {
  /* [区域标注·已完成·旧事摘要年月日同步 + 长期记忆角色大名锁定]
     说明：
     1. 长期记忆总结里的角色姓名优先使用档案 characters[].name，不使用用户给角色的备注，也不使用人设里的昵称。
     2. 每条消息前附带“YYYY年M月D日 HH:mm”，让副 API 有明确日期来源，旧事“记忆摘要”可保留年月日。 */
  const roleName = String(character?.name || session?.name || '角色').trim() || '角色';
  const userName = String(mask?.name || mask?.nickname || '用户').trim() || '用户';

  const formatLine = (name, item) => {
    const timestamp = Number(item?.timestamp || 0) || 0;
    const timeText = timestamp ? `（${formatMemorySummaryDateTime(timestamp)}）` : '';
    return `- ${timeText}${name}：${item.__memoryText}`;
  };

  return (Array.isArray(rounds) ? rounds : [])
    .map((round, index) => {
      const roundDate = formatMemorySummaryDate(getRoundMemoryTimestamp(round));
      const userText = round.userMessages.map(item => formatLine(userName, item)).join('\n') || `- ${userName}：（无）`;
      const assistantText = round.assistantMessages.map(item => formatLine(roleName, item)).join('\n') || `- ${roleName}：（无）`;
      return `【第 ${index + 1} 轮｜${roundDate}】\n${userText}\n${assistantText}`;
    })
    .join('\n\n');
}

function getCurrentSessionForMemory(state = {}) {
  const currentChatId = String(state.currentChatId || '').trim();
  return (Array.isArray(state.sessions) ? state.sessions : []).find(session => String(session?.id || '') === currentChatId) || null;
}

function getContactForMemory(state = {}, session = {}) {
  const sessionId = String(session?.id || state.currentChatId || '').trim();
  return (Array.isArray(state.contacts) ? state.contacts : []).find(contact => String(contact?.id || '') === sessionId) || null;
}

function getCharacterForMemory(state = {}, session = {}, contact = {}) {
  const candidateIds = [
    contact?.roleId,
    session?.roleId,
    contact?.characterId,
    session?.characterId,
    contact?.id,
    session?.id
  ].map(item => String(item || '').trim()).filter(Boolean);
  const characters = Array.isArray(state.archiveCharacters) ? state.archiveCharacters : [];
  return characters.find(character => candidateIds.includes(String(character?.id || '').trim())) || null;
}

function getMaskForMemory(state = {}) {
  const maskId = String(state.activeMaskId || '').trim();
  return (Array.isArray(state.archiveMasks) ? state.archiveMasks : []).find(mask => String(mask?.id || '') === maskId) || null;
}

function ensureSummaryContainsMemoryDate(summary = '', timestamp = Date.now()) {
  const text = String(summary || '').trim();
  if (!text) return '';
  if (/\d{4}年\d{1,2}月\d{1,2}日/.test(text)) return text;
  return `${formatMemorySummaryDate(timestamp)}，${text}`;
}

function buildLongTermMemoryPrompt({
  roundsText = '',
  session = {},
  character = null,
  mask = null,
  source = 'auto',
  summaryPerson = 'third',
  minWords = DEFAULT_LONG_TERM_MEMORY_SETTINGS.longTermMemorySummaryMinWords,
  maxWords = DEFAULT_LONG_TERM_MEMORY_SETTINGS.longTermMemorySummaryMaxWords,
  customSummaryPrompt = ''
} = {}) {
  /* [区域标注·已完成·旧事记忆摘要新口径同步]
     说明：
     1. 默认总结提示词已同步为旧事“记忆摘要”口径：摘要正文必须带年月日，不再要求生成标题。
     2. 必须覆盖时间（年月日）、地点、人物、经过、情绪；不遗漏输入中明确出现的信息。
     3. “自定义总结词”填写后会替代默认长期记忆总结提示词主体；输出 JSON 格式、人称和角色大名规则仍保留。
     4. “自定义字数范围”原样写入提示词，不限制输入框内容，不使用 localStorage/sessionStorage。
  */
  const roleName = String(character?.name || session?.name || '当前角色').trim() || '当前角色';
  const userName = String(mask?.name || mask?.nickname || '用户').trim() || '用户';
  const summaryRangeText = `${String(minWords ?? '').trim() || DEFAULT_LONG_TERM_MEMORY_SETTINGS.longTermMemorySummaryMinWords}到${String(maxWords ?? '').trim() || DEFAULT_LONG_TERM_MEMORY_SETTINGS.longTermMemorySummaryMaxWords}字`;
  const customPrompt = String(customSummaryPrompt || '').trim();
  const defaultSummaryPrompt = `请生成客观、完整的长期记忆摘要。不要使用单个词概括；使用包含“主体+动作+上下文”的详细短语或连贯句子。重点记录关键事件、约定、关系变化与情绪状态。摘要正文必须写清楚输入中的年月日、地点、人物、经过、情绪；没有明确出现的项目写“未明确”，不要编造。`;
  const summaryPrompt = customPrompt || defaultSummaryPrompt;
  const personRule = summaryPerson === 'first'
    ? `总结人称：使用角色第一人称。摘要中把角色「${roleName}」写作“我”，并以第三人称「${userName}」指代用户，保持客观长期记忆口吻。`
    : `总结人称：使用第三人称。摘要中以第三人称「${roleName}」指代角色，以第三人称「${userName}」指代用户，保持客观长期记忆口吻。`;

  return [
    {
      role: 'system',
      content: `你是旧事应用的闲谈长期记忆自动解析器。请把给定聊天轮次解析成一条适合保存到“旧事 → 闲谈记忆库”的长期记忆。

总结要求：
${summaryPrompt}

硬性规则：
1. 只根据输入聊天内容总结，不要编造不存在的事件。
2. 摘要必须客观、精简、完整，不加入未在聊天中出现的主观判断。
3. 摘要必须保留事件经过、关系变化、关键承诺、情绪变化和后续可能影响对话的事实。
4. 不要出现“AI、模型、API、系统、提示词、自动解析”等出戏词。
5. 不要使用 Markdown，不要解释。
6. 只输出一个 JSON 对象，格式严格为：
{"summary":"包含年月日的${summaryRangeText}长期记忆摘要","emotionTags":["标签1","标签2"],"type":"longterm","isPermanent":false,"isHighPriority":false}
7. 不要输出 title；emotionTags 最多 6 个，短词即可。
8. ${personRule}
9. 角色姓名必须是「${roleName}」这个大名；禁止把用户备注、联系人备注或昵称当作角色姓名。`
    },
    {
      role: 'user',
      content: `【总结触发方式】
${source === 'manual' ? '手动总结' : '自动总结'}

【角色】
${roleName}

【用户面具】
${userName}

【需要解析为旧事长期记忆的聊天轮次】
${roundsText}

请返回旧事记忆 JSON。`
    }
  ];
}

function normalizeMemorySummaryPayload(rawPayload = {}, fallbackText = '', fallbackTimestamp = Date.now()) {
  /* [区域标注·已完成·旧事记忆摘要保存新口径同步]
     说明：
     1. 闲谈长期记忆保存到旧事时不再生成/传入 title，跟随旧事应用当前“记忆摘要”口径。
     2. 如果副 API 漏掉年月日，这里只给 summary 前补本次总结轮次的真实日期，避免旧事“记忆摘要”缺日期。
     3. 仍通过 memory-db.js / DB.js / IndexedDB 写入；不使用 localStorage/sessionStorage，不写双份兜底。 */
  const rawSummary = String(rawPayload?.summary || rawPayload?.content || fallbackText || '').trim();
  const summary = ensureSummaryContainsMemoryDate(rawSummary, fallbackTimestamp);
  if (!summary) return null;

  const tags = Array.isArray(rawPayload?.emotionTags)
    ? rawPayload.emotionTags
    : (Array.isArray(rawPayload?.tags) ? rawPayload.tags : []);

  return {
    summary,
    emotionTags: tags.map(item => String(item || '').trim()).filter(Boolean).slice(0, 6),
    type: 'longterm',
    isPermanent: Boolean(rawPayload?.isPermanent),
    isHighPriority: Boolean(rawPayload?.isHighPriority),
    injectionEnabled: true,
    timelineAt: Date.now()
  };
}

/* ========================================================================
   [区域标注·已完成·长期记忆总结结果应用内弹窗]
   说明：
   1. 手动总结与自动总结的完成/失败提示统一走闲谈应用 chat-modal 样式。
   2. 不使用 alert/confirm/prompt，不使用浏览器原生选择器。
   3. 仅展示总结结果，不读写任何持久化存储；旧事写入仍由 memory-db.js / DB.js / IndexedDB 处理。
   ======================================================================== */
function showLongTermMemoryResultModal(container, { title = '长期记忆', message = '' } = {}) {
  const mask = container?.querySelector?.('[data-role="modal-mask"]');
  const panel = container?.querySelector?.('[data-role="modal-panel"]');
  if (!mask || !panel) return false;

  panel.innerHTML = `
    <!-- [区域标注·已完成·长期记忆总结结果弹窗] -->
    <div class="chat-modal-header">
      <span>${escapeHtml(title)}</span>
      <button class="chat-modal-close" data-action="close-modal" type="button">${TAB_ICONS.close}</button>
    </div>
    <div class="chat-modal-body">
      <div class="chat-modal-hint">${escapeHtml(message || '操作已完成。')}</div>
    </div>
    <div class="chat-modal-footer">
      <button class="chat-modal-btn chat-modal-btn--primary" data-action="close-modal" type="button">知道了</button>
    </div>
  `;
  mask.classList.remove('is-hidden');
  return true;
}

function showLongTermMemoryCompletionModal(container, { source = 'auto', count = 1 } = {}) {
  showLongTermMemoryResultModal(container, {
    title: `${source === 'manual' ? '手动总结' : '自动总结'}完成`,
    message: `已保存 ${count} 条长期记忆到旧事应用。`
  });
}

function showLongTermMemoryFailureModal(container, { source = 'auto', message = '' } = {}) {
  showLongTermMemoryResultModal(container, {
    title: `${source === 'manual' ? '手动总结' : '自动总结'}失败`,
    message: message || '没有生成可保存的长期记忆，请检查副 API 配置后重试。'
  });
}

async function summarizeAndSaveLongTermMemory({
  state = {},
  container = null,
  db = null,
  settingsManager = null,
  source = 'auto',
  rounds = [],
  targetSession = null
} = {}) {
  const summaryTriggeredAt = Date.now();
  const session = targetSession || getCurrentSessionForMemory(state);
  if (!session || !rounds.length) return false;

  const contact = getContactForMemory(state, session);
  const character = getCharacterForMemory(state, session, contact);
  const characterId = String(character?.id || contact?.roleId || session?.roleId || session?.id || '').trim();
  if (!characterId) return false;

  const mask = getMaskForMemory(state);
  const allSettings = settingsManager && typeof settingsManager.getAll === 'function'
    ? await settingsManager.getAll()
    : {};
  const profile = normalizeSecondaryApiProfile(allSettings?.api || {});
  if (!profile.apiKey || !profile.model) return false;

  const settings = ensureLongTermMemorySettings(state);
  const roundsText = formatRoundsForSummary(rounds, session, mask, character);
  if (!roundsText.trim()) throw new Error('没有可用于总结的聊天内容');

  const rawText = await requestLongTermMemoryBySecondaryApi(
    profile,
    buildLongTermMemoryPrompt({
      roundsText,
      session,
      character,
      mask,
      source,
      summaryPerson: settings.longTermMemorySummaryPerson,
      minWords: settings.longTermMemorySummaryMinWords,
      maxWords: settings.longTermMemorySummaryMaxWords,
      customSummaryPrompt: settings.longTermMemoryCustomSummaryPrompt
    })
  );
  const parsed = normalizeMemorySummaryPayload(
    extractJsonObjectFromAiText(rawText),
    rawText,
    getRoundMemoryTimestamp(rounds[0])
  );
  if (!parsed) throw new Error('副 API 没有返回可保存的长期记忆内容');

  await upsertMemoryItem(db, characterId, {
    ...parsed,
    id: `chat-longterm-${String(state.activeMaskId || 'default')}-${String(session.id || 'chat')}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    summary: parsed.summary,
    timelineAt: summaryTriggeredAt
  });

  showLongTermMemoryCompletionModal(container, { source, count: 1 });
  return true;
}

/* ==========================================================================
   [区域标注·已完成·长期记忆自动总结入口]
   说明：
   1. sendMessage 成功完成一轮 AI 回复后调用本入口；只有开启自动总结且达到轮数要求才会请求副 API。
   2. 用 longTermMemoryLastAutoSummaryRoundIndex 记录上次自动总结轮次，避免同一批聊天重复沉淀。
   3. 成功后写入旧事应用并弹出应用内完成提示；失败只记录 console，不打断聊天页。
   ========================================================================== */
export async function maybeRunAutoLongTermMemorySummary({
  state = {},
  container = null,
  db = null,
  settingsManager = null,
  targetChatId = null,
  targetMessages = null
} = {}) {
  try {
    const isCurrentChat = !targetChatId || targetChatId === state.currentChatId;
    let settings = ensureLongTermMemorySettings(state);
    
    if (!isCurrentChat) {
      const rawSettings = await dbGet(db, `chat_prompt_settings::${state.activeMaskId}::${targetChatId}`);
      settings = normalizeLongTermMemorySettings(rawSettings || {});
    }

    if (!settings.longTermMemoryAutoSummaryEnabled) return false;

    const messages = targetMessages || state.currentMessages || [];
    const rounds = buildConversationRounds(messages);
    const totalRounds = rounds.length;
    const requiredRounds = getLongTermMemorySummaryRoundCount(settings);
    if (requiredRounds <= 0) return false;

    const lastAutoRoundIndex = Math.max(0, Number(settings.longTermMemoryLastAutoSummaryRoundIndex || 0) || 0);

    if (totalRounds < requiredRounds || totalRounds - lastAutoRoundIndex < requiredRounds) {
      return false;
    }

    const selectedRounds = rounds.slice(-requiredRounds);
    
    let sessionForMemory = getCurrentSessionForMemory(state);
    if (!isCurrentChat) {
      sessionForMemory = state.sessions.find(s => s.id === targetChatId) || null;
    }

    const saved = await summarizeAndSaveLongTermMemory({
      state,
      container,
      db,
      settingsManager,
      source: 'auto',
      rounds: selectedRounds,
      targetSession: sessionForMemory
    });

    if (saved) {
      if (isCurrentChat) {
        state.chatPromptSettings.longTermMemoryLastAutoSummaryRoundIndex = totalRounds;
        await persistLongTermMemorySettings(state, db);
      } else {
        const key = `chat_prompt_settings::${state.activeMaskId}::${targetChatId}`;
        const rawSettings = await dbGet(db, key) || {};
        rawSettings.longTermMemoryLastAutoSummaryRoundIndex = totalRounds;
        await dbPut(db, key, rawSettings);
      }
    } else {
      if (isCurrentChat) showLongTermMemoryFailureModal(container, { source: 'auto' });
    }

    return saved;
  } catch (error) {
    console.warn('[Chat] 长期记忆自动总结失败:', error);
    showLongTermMemoryFailureModal(container, {
      source: 'auto',
      message: error?.message || '请检查副 API 配置后重试。'
    });
    return false;
  }
}

/* ==========================================================================
   [区域标注·已完成·长期记忆手动总结入口]
   说明：
   1. 用户开启“手动总结”开关后立即后台调用副 API。
   2. 手动范围 = 最新一轮对话 + 之前 N 轮对话；N 来自“总结轮数”输入。
   3. 完成后开关自动复位，并显示应用内完成弹窗；不使用原生浏览器弹窗。
   ========================================================================== */
async function runManualLongTermMemorySummary({
  state = {},
  container = null,
  db = null,
  settingsManager = null
} = {}) {
  const settings = ensureLongTermMemorySettings(state);
  const rounds = buildConversationRounds(state.currentMessages || []);
  const requiredRounds = getLongTermMemorySummaryRoundCount(settings);
  if (requiredRounds <= 0) {
    throw new Error('请先填写总结轮数；留空时不会执行总结。');
  }

  const selectedRounds = rounds.slice(-(requiredRounds + 1));

  if (!selectedRounds.length) {
    throw new Error('当前聊天还没有可总结的对话。');
  }

  return summarizeAndSaveLongTermMemory({
    state,
    container,
    db,
    settingsManager,
    source: 'manual',
    rounds: selectedRounds
  });
}

/* ==========================================================================
   [区域标注·已修改·记忆设置板块入口]
   说明：
   1. 样式参考“聊天控制”板块：左上角标题 + 暖色卡片 + 行分割线 + IconPark 风格右箭头抽屉。
   2. 开关统一复用聊天设置页 iPhone 风格 .msg-ios-switch。
   3. 长期记忆设置已接入 DB.js / IndexedDB 保存与副 API 总结，不使用 localStorage/sessionStorage。
   ========================================================================== */
export function renderChatMemorySettingsSection(chatSettings = {}) {
  return `
    <!-- ==================================================================
         [区域标注·已修改·聊天设置页记忆设置板块]
         说明：
         1. 本板块由 chat-memory-settings.js 独立渲染，位于“聊天控制”板块下方。
         2. “短期记忆”继续复用原有保存链路；“长期记忆”已接入自动/手动总结与旧事保存。
         3. 不新增 localStorage/sessionStorage，不新增持久化兜底，不使用原生弹窗或原生选择器。
         ================================================================== -->
    <section class="msg-settings-chat-control-section msg-settings-memory-section">
      <div class="msg-settings-section-title">记忆设置</div>
      <section class="msg-settings-card msg-settings-chat-control-card msg-settings-memory-card">
        ${renderShortTermMemoryItem(chatSettings)}
        <div class="msg-settings-avatar-divider"></div>
        ${renderLongTermMemoryItem(chatSettings)}
      </section>
    </section>
  `;
}

/* ==========================================================================
   [区域标注·已完成·本次迁移：短期记忆小版块]
   说明：
   1. 本小版块已从“聊天控制”迁移到“记忆设置”。
   2. 原 data-role="msg-short-term-memory-rounds" 保持不变，既有保存逻辑继续按原链路写入 DB.js / IndexedDB。
   3. 这里只移动 UI，不修改短期记忆按轮截取、提示词拼装或任何持久化代码。
   ========================================================================== */
function renderShortTermMemoryItem(chatSettings = {}) {
  return `
    <div class="msg-settings-chat-control-item">
      <button
        class="msg-settings-row msg-settings-chat-control-toggle"
        data-action="toggle-settings-sticker-drawer"
        type="button"
        aria-label="展开短期记忆"
        aria-expanded="false">
        <span class="msg-settings-card__title">短期记忆</span>
        <span class="msg-settings-chat-control-arrow" aria-hidden="true">
          ${ICONPARK_ARROW_RIGHT}
        </span>
      </button>
      <div class="msg-settings-chat-control-drawer" data-role="settings-short-term-memory-drawer">
        <div class="msg-settings-chat-control-drawer__inner">
          <label class="msg-settings-number-field msg-settings-number-field--full">
            <span>发送之前轮数</span>
            <input class="msg-settings-number-input" data-role="msg-short-term-memory-rounds" type="text" inputmode="numeric" value="${escapeHtml(chatSettings.shortTermMemoryRounds ?? '')}">
          </label>
        </div>
      </div>
    </div>
  `;
}

/* ==========================================================================
   [区域标注·已完成·本次长期记忆自定义设置小版块]
   说明：
   1. “总结轮数”保存到当前聊天对象 chatPromptSettings.longTermMemorySummaryRounds，允许留空；留空时不自动总结、不手动总结。
   2. “总结人称”下方已加入“自定义字数范围”，默认 100-200 字，输入框不做限制，原样保存。
   3. “自定义总结词”为抽屉式折叠栏；填写后替代默认长期记忆总结提示词主体，不填则使用默认提示词。
   4. “管理记忆”位于“手动总结”下方，点击直接跳转旧事应用该角色的闲谈应用记忆库页面。
   5. 所有设置经 DB.js / IndexedDB 持久化；不使用 localStorage/sessionStorage，不使用原生弹窗或原生选择器。
   ========================================================================== */
function renderLongTermMemoryItem(chatSettings = {}) {
  const settings = normalizeLongTermMemorySettings(chatSettings);
  const summaryPerson = settings.longTermMemorySummaryPerson;

  return `
    <div class="msg-settings-chat-control-item" data-role="settings-long-term-memory-item">
      <button
        class="msg-settings-row msg-settings-chat-control-toggle"
        data-action="toggle-settings-sticker-drawer"
        type="button"
        aria-label="展开长期记忆"
        aria-expanded="false">
        <span class="msg-settings-card__title">长期记忆</span>
        <span class="msg-settings-chat-control-arrow" aria-hidden="true">
          ${ICONPARK_ARROW_RIGHT}
        </span>
      </button>
      <div class="msg-settings-chat-control-drawer" data-role="settings-long-term-memory-drawer">
        <div class="msg-settings-chat-control-drawer__inner">
          <label class="msg-settings-number-field msg-settings-number-field--full">
            <span>总结轮数</span>
            <input class="msg-settings-number-input" data-role="msg-long-term-memory-summary-rounds" type="text" inputmode="numeric" value="${escapeHtml(settings.longTermMemorySummaryRounds)}">
          </label>
          <div class="msg-long-term-memory-person-field">
            <span>总结人称</span>
            <div class="msg-long-term-memory-person-group" data-role="msg-long-term-memory-summary-person-group">
              <button
                class="msg-long-term-memory-person-btn ${summaryPerson === 'first' ? 'is-active' : ''}"
                data-action="set-long-term-memory-summary-person"
                data-summary-person="first"
                type="button">第一人称</button>
              <button
                class="msg-long-term-memory-person-btn ${summaryPerson === 'third' ? 'is-active' : ''}"
                data-action="set-long-term-memory-summary-person"
                data-summary-person="third"
                type="button">第三人称</button>
            </div>
          </div>
          <div class="msg-long-term-memory-word-range">
            <span>自定义字数范围</span>
            <div class="msg-long-term-memory-word-range__inputs">
              <input class="msg-settings-number-input" data-role="msg-long-term-memory-summary-min-words" type="text" value="${escapeHtml(settings.longTermMemorySummaryMinWords)}" aria-label="长期记忆总结最少字数">
              <span class="msg-long-term-memory-word-range__dash">-</span>
              <input class="msg-settings-number-input" data-role="msg-long-term-memory-summary-max-words" type="text" value="${escapeHtml(settings.longTermMemorySummaryMaxWords)}" aria-label="长期记忆总结最多字数">
              <span class="msg-long-term-memory-word-range__unit">字</span>
            </div>
          </div>
          <div class="msg-settings-avatar-divider"></div>
          <div class="msg-settings-chat-control-item msg-long-term-memory-custom-prompt-item" data-role="settings-long-term-memory-custom-prompt-item">
            <button
              class="msg-settings-row msg-settings-chat-control-toggle msg-long-term-memory-custom-prompt-toggle"
              data-action="toggle-settings-sticker-drawer"
              type="button"
              aria-label="展开自定义总结词"
              aria-expanded="false">
              <span class="msg-settings-card__title">自定义总结词</span>
              <span class="msg-settings-chat-control-arrow" aria-hidden="true">
                ${ICONPARK_ARROW_RIGHT}
              </span>
            </button>
            <div class="msg-settings-chat-control-drawer" data-role="settings-long-term-memory-custom-prompt-drawer">
              <div class="msg-settings-chat-control-drawer__inner">
                <textarea class="msg-settings-textarea msg-long-term-memory-custom-prompt-textarea" data-role="msg-long-term-memory-custom-summary-prompt" placeholder="不填写时使用默认长期记忆总结提示词">${escapeHtml(settings.longTermMemoryCustomSummaryPrompt)}</textarea>
              </div>
            </div>
          </div>
          <div class="msg-settings-avatar-divider"></div>
          <div class="msg-settings-row msg-settings-chat-control-console-row">
            <div class="msg-settings-card__title">自动总结</div>
            <button
              class="msg-ios-switch ${settings.longTermMemoryAutoSummaryEnabled ? 'is-on' : ''}"
              data-action="toggle-long-term-memory-auto-summary"
              type="button"
              aria-label="自动总结"
              aria-pressed="${settings.longTermMemoryAutoSummaryEnabled ? 'true' : 'false'}"></button>
          </div>
          <div class="msg-settings-avatar-divider"></div>
          <div class="msg-settings-row msg-settings-chat-control-console-row">
            <div class="msg-settings-card__title">手动总结</div>
            <button
              class="msg-long-term-memory-manual-btn ${settings.longTermMemoryManualSummaryEnabled ? 'is-loading' : ''}"
              data-action="toggle-long-term-memory-manual-summary"
              type="button"
              aria-label="立即手动总结">${settings.longTermMemoryManualSummaryEnabled ? '总结中…' : '立即总结'}</button>
          </div>
          <div class="msg-settings-avatar-divider"></div>
          <button
            class="msg-settings-row msg-long-term-memory-manage-row"
            data-action="open-long-term-memory-manager"
            type="button"
            aria-label="管理记忆">
            <span class="msg-settings-card__title">管理记忆</span>
            <span class="msg-settings-chat-control-arrow" aria-hidden="true">
              ${ICONPARK_ARROW_RIGHT}
            </span>
          </button>
        </div>
      </div>
    </div>
  `;
}

/* ==========================================================================
   [区域标注·已完成·长期记忆设置局部同步]
   说明：
   1. 只同步长期记忆输入框和两个 iPhone 风格开关，不重绘整个聊天设置页，避免闪屏。
   2. 本函数不做持久化；持久化由输入/点击事件函数负责。
   ========================================================================== */
export function syncLongTermMemorySettingsSection(container, state) {
  const item = container?.querySelector?.('[data-role="settings-long-term-memory-item"]');
  if (!item) return;

  const settings = ensureLongTermMemorySettings(state);
  const roundsInput = item.querySelector('[data-role="msg-long-term-memory-summary-rounds"]');
  const minWordsInput = item.querySelector('[data-role="msg-long-term-memory-summary-min-words"]');
  const maxWordsInput = item.querySelector('[data-role="msg-long-term-memory-summary-max-words"]');
  const customPromptInput = item.querySelector('[data-role="msg-long-term-memory-custom-summary-prompt"]');
  const autoSwitch = item.querySelector('[data-action="toggle-long-term-memory-auto-summary"]');
  const manualButton = item.querySelector('[data-action="toggle-long-term-memory-manual-summary"]');
  const personButtons = item.querySelectorAll('[data-action="set-long-term-memory-summary-person"]');

  if (roundsInput && String(roundsInput.value) !== String(settings.longTermMemorySummaryRounds)) {
    roundsInput.value = String(settings.longTermMemorySummaryRounds);
  }

  if (minWordsInput && String(minWordsInput.value) !== String(settings.longTermMemorySummaryMinWords)) {
    minWordsInput.value = String(settings.longTermMemorySummaryMinWords);
  }

  if (maxWordsInput && String(maxWordsInput.value) !== String(settings.longTermMemorySummaryMaxWords)) {
    maxWordsInput.value = String(settings.longTermMemorySummaryMaxWords);
  }

  if (customPromptInput && String(customPromptInput.value) !== String(settings.longTermMemoryCustomSummaryPrompt)) {
    customPromptInput.value = String(settings.longTermMemoryCustomSummaryPrompt);
  }

  if (autoSwitch) {
    autoSwitch.classList.toggle('is-on', settings.longTermMemoryAutoSummaryEnabled);
    autoSwitch.setAttribute('aria-pressed', settings.longTermMemoryAutoSummaryEnabled ? 'true' : 'false');
  }

  if (manualButton) {
    manualButton.classList.toggle('is-loading', settings.longTermMemoryManualSummaryEnabled);
    manualButton.textContent = settings.longTermMemoryManualSummaryEnabled ? '总结中…' : '立即总结';
  }

  personButtons.forEach(button => {
    const isActive = String(button.dataset.summaryPerson || '') === settings.longTermMemorySummaryPerson;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

/* ==========================================================================
   [区域标注·已完成·长期记忆自定义输入事件接线]
   说明：
   1. 处理“长期记忆 → 总结轮数 / 自定义字数范围 / 自定义总结词”的输入保存。
   2. “总结轮数”允许留空；留空保存为空字符串，表示不执行长期记忆总结。
   3. “自定义字数范围”和“自定义总结词”不做输入限制、不截断，原样写入 DB.js / IndexedDB。
   4. 不使用 localStorage/sessionStorage，不写双份兜底，不使用长文本字段过滤。
   ========================================================================== */
export function handleChatMemorySettingsInput(e, state, container, db) {
  const target = e?.target;
  if (!target?.matches?.([
    '[data-role="msg-long-term-memory-summary-rounds"]',
    '[data-role="msg-long-term-memory-summary-min-words"]',
    '[data-role="msg-long-term-memory-summary-max-words"]',
    '[data-role="msg-long-term-memory-custom-summary-prompt"]'
  ].join(','))) return false;

  ensureLongTermMemorySettings(state);

  if (target.matches('[data-role="msg-long-term-memory-summary-rounds"]')) {
    const rawText = String(target.value ?? '').trim();
    const rawNumber = Number(rawText);
    state.chatPromptSettings.longTermMemorySummaryRounds = rawText === ''
      ? ''
      : (Number.isFinite(rawNumber) ? Math.max(0, Math.floor(rawNumber)) : '');
  } else if (target.matches('[data-role="msg-long-term-memory-summary-min-words"]')) {
    state.chatPromptSettings.longTermMemorySummaryMinWords = String(target.value ?? '');
  } else if (target.matches('[data-role="msg-long-term-memory-summary-max-words"]')) {
    state.chatPromptSettings.longTermMemorySummaryMaxWords = String(target.value ?? '');
  } else if (target.matches('[data-role="msg-long-term-memory-custom-summary-prompt"]')) {
    state.chatPromptSettings.longTermMemoryCustomSummaryPrompt = String(target.value ?? '');
  }

  ensureLongTermMemorySettings(state);
  dbPut(db, getCurrentChatPromptSettingsKey(state), state.chatPromptSettings);
  syncLongTermMemorySettingsSection(container, state);
  return true;
}

/* ==========================================================================
   [区域标注·已完成·长期记忆点击事件接线]
   说明：
   1. 处理“自动总结”滑动开关与“手动总结”一次性触发开关。
   2. 所有设置变更立即保存到 DB.js / IndexedDB。
   3. 手动总结后台执行，完成后应用内弹窗提示并复位开关；不使用原生浏览器弹窗。
   ========================================================================== */
export async function handleChatMemorySettingsClick({
  action = '',
  target = null,
  state = {},
  container = null,
  db = null,
  settingsManager = null,
  eventBus = null
} = {}) {
  if (action === 'toggle-long-term-memory-auto-summary') {
    ensureLongTermMemorySettings(state);
    state.chatPromptSettings.longTermMemoryAutoSummaryEnabled = !state.chatPromptSettings.longTermMemoryAutoSummaryEnabled;
    ensureLongTermMemorySettings(state);
    await persistLongTermMemorySettings(state, db);
    syncLongTermMemorySettingsSection(container, state);
    return true;
  }

  if (action === 'set-long-term-memory-summary-person') {
    ensureLongTermMemorySettings(state);
    const nextPerson = String(target?.dataset?.summaryPerson || '').trim();
    if (!['first', 'third'].includes(nextPerson)) return true;

    state.chatPromptSettings.longTermMemorySummaryPerson = nextPerson;
    ensureLongTermMemorySettings(state);
    await persistLongTermMemorySettings(state, db);
    syncLongTermMemorySettingsSection(container, state);
    return true;
  }

  if (action === 'open-long-term-memory-manager') {
    const session = getCurrentSessionForMemory(state);
    const contact = getContactForMemory(state, session);
    const character = getCharacterForMemory(state, session, contact);
    const characterId = String(character?.id || contact?.roleId || session?.roleId || '').trim();

    if (!characterId) {
      showLongTermMemoryResultModal(container, {
        title: '管理记忆',
        message: '当前聊天未找到对应角色，无法跳转旧事记忆库。'
      });
      return true;
    }

    const openPayload = {
      stage: 'chat-memory',
      characterId,
      identityId: String(state.activeMaskId || '').trim()
    };

    (eventBus || state?.eventBus)?.emit?.('app:open', { appId: 'memory', openPayload });
    return true;
  }

  if (action === 'toggle-long-term-memory-manual-summary') {
    ensureLongTermMemorySettings(state);
    if (state.chatPromptSettings.longTermMemoryManualSummaryEnabled) return true;

    state.chatPromptSettings.longTermMemoryManualSummaryEnabled = true;
    await persistLongTermMemorySettings(state, db);
    syncLongTermMemorySettingsSection(container, state);

    target?.setAttribute?.('disabled', 'disabled');
    try {
      const saved = await runManualLongTermMemorySummary({ state, container, db, settingsManager });
      if (!saved) {
        showLongTermMemoryFailureModal(container, { source: 'manual' });
      }
    } catch (error) {
      console.warn('[Chat] 长期记忆手动总结失败:', error);
      showLongTermMemoryFailureModal(container, {
        source: 'manual',
        message: error?.message || '请检查副 API 配置后重试。'
      });
    } finally {
      state.chatPromptSettings.longTermMemoryManualSummaryEnabled = false;
      await persistLongTermMemorySettings(state, db);
      target?.removeAttribute?.('disabled');
      syncLongTermMemorySettingsSection(container, state);
    }

    return true;
  }

  return false;
}
