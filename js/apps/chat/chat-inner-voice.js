// @ts-nocheck
/**
 * 文件名: js/apps/chat/chat-inner-voice.js
 * 用途: 闲谈应用 — "心声"面板独立模块
 *       解析 AI 回复中的心声数据、渲染心声面板、处理头像点击事件。
 * 架构层: 应用层（闲谈子模块）
 *
 * [模块标注·已修改·心声面板JS] 整个文件为心声功能独立模块，方便后续针对性修改。
 */

import { dbGet, dbPut, escapeHtml } from './chat-utils.js';

/* ==========================================================================
   [区域标注·已修改·心声面板] IconPark 图标
   说明：心声面板用到的图标统一使用 IconPark 风格 SVG。
   - heart: 心声标签图标（心形，来自 IconPark "like"）
   - chart: Now 标签图标（图表，来自 IconPark "chart-line"）
   - empty: 空状态图标（对话气泡，来自 IconPark "message"）
   - history: 历史按钮图标（来自 IconPark "history" 风格）
   - multiSelect/check/delete/download: 心声历史多选、全选、删除、下载图标（IconPark 风格）
   ========================================================================== */
const IV_ICONS = {
  heart: `<svg viewBox="0 0 48 48" fill="none"><path d="M24 42S6 30 6 17a9 9 0 0 1 18 0a9 9 0 0 1 18 0c0 13-18 25-18 25Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>`,
  chart: `<svg viewBox="0 0 48 48" fill="none"><path d="M6 6v36h36" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 34l8-12 8 6 12-18" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  empty: `<svg viewBox="0 0 48 48" fill="none"><path d="M44 6H4v30h14l6 6l6-6h14V6Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><circle cx="16" cy="21" r="2" fill="currentColor"/><circle cx="24" cy="21" r="2" fill="currentColor"/><circle cx="32" cy="21" r="2" fill="currentColor"/></svg>`,
  history: `<svg viewBox="0 0 48 48" fill="none"><path d="M24 8a16 16 0 1 1-14 8" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 8v10h10" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M24 16v10l7 4" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  multiSelect: `<svg viewBox="0 0 48 48" fill="none"><path d="M20 10h20v20H20V10Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M8 18v20h20" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M25 20l4 4l7-8" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  check: `<svg viewBox="0 0 48 48" fill="none"><path d="M10 25l10 10l18-20" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  delete: `<svg viewBox="0 0 48 48" fill="none"><path d="M8 11h32" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M19 11V7h10v4" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M14 11l2 30h16l2-30" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M21 19v14M27 19v14" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`,
  download: `<svg viewBox="0 0 48 48" fill="none"><path d="M24 6v24" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 22l10 10l10-10" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 38h32" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`
};

/* ==========================================================================
   [区域标注·已完成·本次修正：心声九段短格式协议标签定义]
   说明：
   1. AI 回复中使用 [心声]状态|动作|心情|心跳|醋意|好感|性欲|真实心声|性幻想[/心声]。
   2. 该标签在 buildAiReplyMessages 之前被提取并剥离，不显示在聊天气泡中。
   3. 解析器仍兼容旧七段/旧 JSON 心声，心声数据随消息对象写入 DB.js / IndexedDB，同时另存为独立心声历史。
   ========================================================================== */
const INNER_VOICE_OPEN_TAG = '[心声]';
const INNER_VOICE_CLOSE_TAG = '[/心声]';

/* ==========================================================================
   [区域标注·已完成·本次修正：心声异常标签兼容与性别称谓锁定工具]
   说明：
   1. 兼容 AI 偶发输出的异常心声标签，如 [\心心声]、[/心心声]、[心心声]、带空格/反斜杠的近似变体。
   2. 统一把全角竖线、换行与标签残片清理后再做九段解析，降低“掉格式”导致整块串段的概率。
   3. 为心声协议提示词提供当前用户面具姓名/性别锁定，防止把“男/双性”用户误称为“她”。
   ========================================================================== */
const INNER_VOICE_OPEN_PATTERN = /\[\s*(?:\\+|\/+)?\s*心(?:心)?声\s*\]/i;
const INNER_VOICE_CLOSE_PATTERN = /\[\s*(?:\\+|\/+)\s*心(?:心)?声\s*\]/i;

function normalizeInnerVoiceGenderValue(gender) {
  return String(gender || '').trim();
}

function resolveInnerVoiceUserReferenceOptions(options = {}) {
  const userName = String(options.userName || '').trim();
  const gender = normalizeInnerVoiceGenderValue(options.userGender);
  const isMaleLike = /男|双性/i.test(gender);
  const isFemaleLike = /女/i.test(gender) && !isMaleLike;

  if (isMaleLike) {
    return {
      userName,
      gender,
      allowedReferenceText: userName
        ? `提到用户时只能使用“${userName}”或“他”`
        : '提到用户时只能使用“他”',
      forbiddenReferenceText: '禁止使用“她”“她们”或任何女性指代',
      exampleUserRef: userName || '他'
    };
  }

  if (isFemaleLike) {
    return {
      userName,
      gender,
      allowedReferenceText: userName
        ? `提到用户时只能使用“${userName}”或“她”`
        : '提到用户时只能使用“她”',
      forbiddenReferenceText: '禁止使用“他”“他们”或任何男性指代',
      exampleUserRef: userName || '她'
    };
  }

  return {
    userName,
    gender,
    allowedReferenceText: userName
      ? `提到用户时优先且尽量直接使用“${userName}”`
      : '提到用户时优先使用明确的人名；若未知则避免随意使用“他/她”',
    forbiddenReferenceText: '禁止在性别不确定时乱用“他/她”并禁止使用“会话对象”',
    exampleUserRef: userName || '对方'
  };
}

function sanitizeInnerVoicePayloadText(raw) {
  return String(raw || '')
    .replace(/\[\s*(?:\\+|\/+)?\s*心(?:心)?声\s*\]/gi, ' ')
    .replace(/\[\s*(?:\\+|\/+)\s*心(?:心)?声\s*\]/gi, ' ')
    .replace(/[｜¦‖]/g, '|')
    .replace(/[［【｢「]/g, '[')
    .replace(/[］】｣」]/g, ']')
    .replace(/\r\n/g, '\n')
    .replace(/\n+/g, ' ')
    .replace(/\s*\|\s*/g, '|')
    .replace(/\s*[：:]\s*/g, ':')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/* ========================================================================== 
   [区域标注·已完成·本次修正：心声掉格式字段归位解析]
   说明：
   1. 专门处理“字段名混入竖线格式 / 字段顺序错乱 / 缺字段”的掉格式心声。
   2. 优先按字段名归位，避免把“105”误放进 INNER VOICE，或把“醋意|5|好感|80...”整串放进 FANTASY。
   3. 只做心声面板前端解析增强，不新增持久化存储，不使用 localStorage/sessionStorage，不写双份兜底。
   ========================================================================== */
const INNER_VOICE_FIELD_ALIASES = {
  status: ['状态', '当前状态', 'status'],
  action: ['动作', '当前动作', '正在做的动作', 'action'],
  mood: ['心情', '真实心情', 'mood'],
  heartbeat: ['心跳', '心跳频率', '心调频率', 'heartbeat', 'bpm'],
  jealousy: ['醋意', '酷意', '醋意指数', 'jealousy'],
  affection: ['好感', '好感度', 'affection'],
  desire: ['性欲', '性欲值', 'desire'],
  voice: ['真实心声', '心声', '真实想法', '内心想法', 'inner voice', 'voice'],
  fantasy: ['性幻想', '幻想', 'fantasy']
};

const INNER_VOICE_LABEL_WORDS = Object.values(INNER_VOICE_FIELD_ALIASES)
  .flat()
  .sort((a, b) => String(b).length - String(a).length)
  .map(item => String(item).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

const INNER_VOICE_LABEL_RE = new RegExp(`(${INNER_VOICE_LABEL_WORDS.join('|')})\\s*[：:]`, 'gi');

function normalizeInnerVoiceFieldKey(rawKey) {
  const key = String(rawKey || '')
    .trim()
    .replace(/^[\s"'“”‘’`~\-—_[\]【】{}()（）]+|[\s"'“”‘’`~\-—_[\]【】{}()（）]+$/g, '')
    .replace(/值|指数|频率|当前|正在做的/g, '')
    .toLowerCase();

  for (const [field, aliases] of Object.entries(INNER_VOICE_FIELD_ALIASES)) {
    if (aliases.some(alias => key === String(alias).replace(/值|指数|频率|当前|正在做的/g, '').toLowerCase())) {
      return field;
    }
  }
  return '';
}

function cleanInnerVoiceFieldValue(value) {
  return String(value || '')
    .replace(/\[\s*(?:\\+|\/+)?\s*心(?:心)?声\s*\]/gi, ' ')
    .replace(/\[\s*(?:\\+|\/+)\s*心(?:心)?声\s*\]/gi, ' ')
    .replace(/[｜¦‖]/g, '|')
    .replace(/[［【｢「]/g, '[')
    .replace(/[］】｣」]/g, ']')
    .replace(/^[\s"'“”‘’`~\-—_[\]【】{}()（）:：|]+|[\s"'“”‘’`~\-—_[\]【】{}()（）:：|]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function hasMeaningfulInnerVoiceData(data) {
  return Boolean(data && Object.values(data).some(value => String(value ?? '').trim()));
}

function parseInnerVoiceLabeledPayload(s) {
  const text = sanitizeInnerVoicePayloadText(s);
  if (!text) return null;

  const data = {};
  const pipeParts = text.split('|').map(part => part.trim());
  const hasPipeLabel = pipeParts.some(part => normalizeInnerVoiceFieldKey(part) || normalizeInnerVoiceFieldKey(part.split(':')[0]));

  if (hasPipeLabel) {
    for (let i = 0; i < pipeParts.length; i++) {
      const part = pipeParts[i] || '';
      const colonIndex = part.indexOf(':');
      const inlineKey = colonIndex >= 0 ? normalizeInnerVoiceFieldKey(part.slice(0, colonIndex)) : '';
      const inlineValue = colonIndex >= 0 ? part.slice(colonIndex + 1) : '';

      if (inlineKey) {
        data[inlineKey] = cleanInnerVoiceFieldValue(inlineValue || pipeParts[i + 1] || '');
        if (!inlineValue) i++;
        continue;
      }

      const field = normalizeInnerVoiceFieldKey(part);
      if (!field) continue;

      let valueParts = [];
      for (let j = i + 1; j < pipeParts.length; j++) {
        const nextPart = pipeParts[j] || '';
        const nextColonIndex = nextPart.indexOf(':');
        const nextKey = normalizeInnerVoiceFieldKey(nextPart) || (nextColonIndex >= 0 ? normalizeInnerVoiceFieldKey(nextPart.slice(0, nextColonIndex)) : '');
        if (nextKey) break;
        valueParts.push(nextPart);
        i = j;
      }
      data[field] = cleanInnerVoiceFieldValue(valueParts.join('|'));
    }
  }

  const labeledMatches = Array.from(text.matchAll(INNER_VOICE_LABEL_RE));
  if (labeledMatches.length) {
    for (let i = 0; i < labeledMatches.length; i++) {
      const match = labeledMatches[i];
      const field = normalizeInnerVoiceFieldKey(match[1]);
      if (!field) continue;
      const start = Number(match.index || 0) + String(match[0] || '').length;
      const end = i + 1 < labeledMatches.length ? Number(labeledMatches[i + 1].index || text.length) : text.length;
      const value = cleanInnerVoiceFieldValue(text.slice(start, end));
      if (value) data[field] = value;
    }
  }

  return hasMeaningfulInnerVoiceData(data) ? normalizeInnerVoiceData(data) : null;
}

/* ==========================================================================
   [区域标注·已修改·心声历史独立存储] IndexedDB 存储键与标准化
   说明：
   1. 心声历史独立保存在 DB.js / IndexedDB，不依赖 currentMessages。
   2. 清空聊天消息默认不会删除心声历史；仅在清空弹窗勾选“同步清空所有心声记录”时同步清空。
   3. 不使用 localStorage/sessionStorage，不写双份兜底存储。
   ========================================================================== */
const DATA_KEY_INNER_VOICE_HISTORY = (maskId, chatId) => `chat_inner_voice_history::${maskId || 'default'}::${chatId || 'none'}`;

function normalizeInnerVoiceHistory(raw) {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map(item => {
      const data = normalizeInnerVoiceData(item?.innerVoice || item);
      if (!data) return null;
      return {
        id: String(item?.id || `iv_${Number(item?.createdAt || Date.now())}_${Math.random().toString(16).slice(2)}`),
        maskId: String(item?.maskId || ''),
        chatId: String(item?.chatId || ''),
        chatName: String(item?.chatName || ''),
        messageId: String(item?.messageId || ''),
        roundIndex: Math.max(1, Math.floor(Number(item?.roundIndex || 1)) || 1),
        createdAt: Number(item?.createdAt || Date.now()) || Date.now(),
        innerVoice: data
      };
    })
    .filter(Boolean)
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
}

export async function loadInnerVoiceHistory(db, maskId, chatId) {
  if (!db || !chatId) return [];
  return normalizeInnerVoiceHistory(await dbGet(db, DATA_KEY_INNER_VOICE_HISTORY(maskId, chatId)));
}

async function persistInnerVoiceHistoryList(db, maskId, chatId, list) {
  if (!db || !chatId) return;
  await dbPut(db, DATA_KEY_INNER_VOICE_HISTORY(maskId, chatId), normalizeInnerVoiceHistory(list));
}

/* ==========================================================================
   [区域标注·已完成·清空聊天消息可选同步清空心声历史]
   说明：
   1. 仅在“清空聊天消息”弹窗开关开启时调用，清空当前面具 + 当前聊天窗口的心声历史。
   2. 持久化统一写入 DB.js / IndexedDB 对应心声历史键，不使用 localStorage/sessionStorage。
   3. 不写双份存储兜底，不按长文本字段过滤。
   ========================================================================== */
export async function clearInnerVoiceHistory(db, maskId, chatId) {
  if (!db || !chatId) return false;
  await dbPut(db, DATA_KEY_INNER_VOICE_HISTORY(maskId, chatId), []);
  return true;
}

/* ==========================================================================
   [区域标注·已修改·心声历史独立存储] 保存每轮生成的心声
   说明：
   1. 每次 AI 回复提取到心声后都追加到独立历史记录。
   2. 该历史与聊天消息分离；清空聊天消息仅在弹窗勾选同步清空时才会删除这里的数据。
   3. 持久化只通过 DB.js / IndexedDB；不使用 localStorage/sessionStorage。
   ========================================================================== */
export async function persistInnerVoiceHistoryEntry(db, state, innerVoice, messageId = '') {
  const data = normalizeInnerVoiceData(innerVoice);
  if (!db || !state?.currentChatId || !data) return null;

  const maskId = String(state.activeMaskId || '');
  const chatId = String(state.currentChatId || '');
  const session = (state.sessions || []).find(item => String(item.id) === chatId) || {};
  const history = await loadInnerVoiceHistory(db, maskId, chatId);
  const now = Date.now();
  const entry = {
    id: `iv_${now}_${Math.random().toString(16).slice(2)}`,
    maskId,
    chatId,
    chatName: String(session.remark || session.name || ''),
    messageId: String(messageId || ''),
    roundIndex: history.length + 1,
    createdAt: now,
    innerVoice: data
  };
  await persistInnerVoiceHistoryList(db, maskId, chatId, [entry, ...history]);
  return entry;
}

/* ==========================================================================
   [区域标注·已完成·本次修正：解析并剥离 AI 原始回复中的心声九段短格式]
   说明：
   1. 从 rawText 中提取 [心声]...[/心声] 之间的九段短格式心声。
   2. 本次已补强漏闭合标签容错：只要出现 [心声] 起始标签，就从该处剥离到 [/心声] 或文本末尾，避免心声竖线块泄漏进聊天气泡。
   3. 新协议不要求 JSON，但必须保留状态/动作/心情/心跳/醋意/好感/性欲/心声/性幻想九个面板字段。
   4. 为兼容旧回复，若内容是 JSON、旧七段短格式或“状态/动作/心情”等键值文本，仍按旧字段宽松解析。
   5. 不使用 localStorage/sessionStorage，不做双份存储兜底。
   ========================================================================== */
export function extractInnerVoiceFromRawText(rawText) {
  const text = String(rawText || '');
  const openMatch = text.match(INNER_VOICE_OPEN_PATTERN);

  if (!openMatch || typeof openMatch.index !== 'number') {
    return { innerVoice: null, cleanedText: text };
  }

  const openIndex = openMatch.index;
  const openEnd = openIndex + String(openMatch[0] || INNER_VOICE_OPEN_TAG).length;
  const afterOpenText = text.slice(openEnd);
  const closeMatch = afterOpenText.match(INNER_VOICE_CLOSE_PATTERN);
  const closeIndex = closeMatch && typeof closeMatch.index === 'number'
    ? openEnd + closeMatch.index
    : text.length;
  const closeEnd = closeMatch
    ? closeIndex + String(closeMatch[0] || INNER_VOICE_CLOSE_TAG).length
    : text.length;

  const innerVoiceText = text.slice(openEnd, closeIndex).trim();
  const cleanedText = (text.slice(0, openIndex) + text.slice(closeEnd))
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const innerVoice = parseInnerVoicePayload(innerVoiceText);
  return { innerVoice, cleanedText };
}

function parseInnerVoicePayload(raw) {
  const originalText = String(raw || '').trim();
  if (!originalText) return null;

  if (originalText.startsWith('{') && originalText.endsWith('}')) {
    try {
      const parsed = JSON.parse(originalText);
      if (parsed && typeof parsed === 'object') {
        return normalizeInnerVoiceData(parsed);
      }
    } catch (_e) {
      // JSON 解析失败时继续走宽松解析
    }
  }

  const s = sanitizeInnerVoicePayloadText(originalText);
  if (!s) return null;

  /* ========================================================================
     [区域标注·已完成·本次修正：心声掉格式解析与九段短格式归位]
     说明：
     1. 新格式为：状态|动作|心情|心跳|醋意|好感|性欲|真实心声|性幻想。
     2. 已补强掉格式兼容：字段名混入、字段顺序错乱、缺字段、中文冒号/英文冒号与全角竖线都会先尝试按字段名归位。
     3. 若没有字段名，再按九段/旧七段位置映射；第 9 段允许包含分隔符，会自动合并回性幻想正文。
     4. 仍兼容旧 JSON 与宽松键值文本，确保旧心声历史可继续读取。
     ======================================================================== */
  const labeledData = parseInnerVoiceLabeledPayload(s);
  if (labeledData) return labeledData;

  const pipeParts = s.split('|').map(part => cleanInnerVoiceFieldValue(part)).filter((part, index, arr) => part || index < arr.length - 1);
  if (pipeParts.length >= 9) {
    return normalizeInnerVoiceData({
      status: pipeParts[0],
      action: pipeParts[1],
      mood: pipeParts[2],
      heartbeat: pipeParts[3],
      jealousy: pipeParts[4],
      affection: pipeParts[5],
      desire: pipeParts[6],
      voice: pipeParts[7],
      fantasy: pipeParts.slice(8).join('|').trim()
    });
  }

  if (pipeParts.length >= 7) {
    return normalizeInnerVoiceData({
      status: pipeParts[0],
      action: pipeParts[1],
      mood: pipeParts[2],
      heartbeat: pipeParts[3],
      jealousy: pipeParts[4],
      affection: pipeParts[5],
      voice: pipeParts.slice(6).join('|').trim()
    });
  }

  return parseInnerVoiceLoose(s) || normalizeInnerVoiceData({ voice: s });
}

/* ==========================================================================
   [区域标注·已完成·本次修正：宽松解析心声数据]
   说明：
   1. 当 AI 输出旧 JSON 不够严格时（如缺引号），尝试正则提取各字段。
   2. 当 AI 按九段/旧七段短格式输出时，优先由 parseInnerVoicePayload 映射回面板全部字段。
   3. 本次已补充“性幻想”和“性欲值”字段解析。
   ========================================================================== */
function parseInnerVoiceLoose(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;

  const extract = (key) => {
    const escapedKey = String(key || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`["']?${escapedKey}["']?\\s*[：:]\\s*["']?([^"'，,}\\n\\|]+)`, 'i');
    const m = s.match(re);
    return m ? cleanInnerVoiceFieldValue(m[1] || '') : '';
  };
  const extractNum = (key, fallback = 0) => {
    const v = extract(key);
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  const labeledData = parseInnerVoiceLabeledPayload(s);
  if (labeledData) return labeledData;

  const data = {
    status: extract('状态') || extract('status'),
    action: extract('动作') || extract('action'),
    mood: extract('心情') || extract('mood'),
    heartbeat: extractNum('心跳频率') || extractNum('心调频率') || extractNum('heartbeat') || extractNum('心跳'),
    jealousy: extractNum('醋意指数') || extractNum('jealousy') || extractNum('醋意') || extractNum('酷意'),
    affection: extractNum('好感度') || extractNum('affection') || extractNum('好感'),
    desire: extractNum('性欲值') || extractNum('desire') || extractNum('性欲'),
    voice: extract('真实心声') || extract('心声') || extract('voice') || extract('真实想法'),
    fantasy: extract('性幻想') || extract('fantasy')
  };

  if (!data.voice && !data.status && !data.mood) return null;
  return normalizeInnerVoiceData(data);
}

/* ==========================================================================
   [区域标注·已完成·本次修正：心声面板标准化数据对象]
   说明：
   1. 确保所有字段存在且类型正确，限定字数范围。
   2. 本次已新增“性幻想”(≤100字) 和 “性欲值”(0-100)。
   ========================================================================== */
export function normalizeInnerVoiceData(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const clampStr = (v, max) => cleanInnerVoiceFieldValue(v).slice(0, max);
  const clampNum = (v, min, max) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : min;
  };

  return {
    status: clampStr(raw.status || raw.状态, 30),
    action: clampStr(raw.action || raw.动作, 50),
    mood: clampStr(raw.mood || raw.心情, 30),
    heartbeat: clampNum(raw.heartbeat || raw.心跳频率 || raw.心调频率 || raw.心跳, 60, 180),
    jealousy: clampNum(raw.jealousy || raw.醋意指数 || raw.醋意, 0, 100),
    affection: clampNum(raw.affection || raw.好感度 || raw.好感, 0, 100),
    desire: clampNum(raw.desire || raw.性欲值 || raw.性欲, 0, 100),
    voice: clampStr(raw.voice || raw.心声 || raw.真实想法, 150),
    fantasy: clampStr(raw.fantasy || raw.性幻想, 100)
  };
}

function isInnerVoiceAssistantSideMessage(message) {
  const role = String(message?.role || '').trim().toLowerCase();
  return role === 'assistant' || role === 'other';
}

/* ==========================================================================
   [区域标注·已完成·本次修复：左侧角色头像按用户轮次打开心声面板]
   说明：
   1. 心声数据仍挂在同一轮最后一条 assistant 消息的 innerVoice 字段。
   2. 聊天渲染层会把 role 为 assistant / other 的消息都显示为左侧角色消息，但同一轮 AI 回复中间可能夹有系统提示、卡片状态、撤回提示等非 assistant / other 记录。
   3. 因此这里不再按“左侧角色消息连续块”查找，而是按“上一条用户消息 ~ 下一条用户消息”之间的整轮区间查找，避免同一轮里前半段头像被中间消息截断而点不开。
   4. 仅读取运行时 state.currentMessages，不使用 localStorage/sessionStorage。
   ========================================================================== */
export function findInnerVoiceForMessage(messages, messageId) {
  if (!Array.isArray(messages) || !messageId) return null;

  const targetId = String(messageId);
  const targetIndex = messages.findIndex(m => String(m?.id || '') === targetId);
  if (targetIndex < 0) return null;
  if (!isInnerVoiceAssistantSideMessage(messages[targetIndex])) return null;

  let roundStart = targetIndex;
  while (roundStart > 0) {
    const prevMessage = messages[roundStart - 1];
    if (String(prevMessage?.role || '').trim().toLowerCase() === 'user') break;
    roundStart--;
  }

  let roundEnd = targetIndex;
  while (roundEnd < messages.length - 1) {
    const nextMessage = messages[roundEnd + 1];
    if (String(nextMessage?.role || '').trim().toLowerCase() === 'user') break;
    roundEnd++;
  }

  for (let i = roundEnd; i >= roundStart; i--) {
    const msg = messages[i];
    if (msg?.innerVoice && typeof msg.innerVoice === 'object') {
      return msg.innerVoice;
    }
  }
  return null;
}

/* ==========================================================================
   [区域标注·已完成·心声面板] 查找最新一条 AI 消息的心声数据
   说明：从消息列表尾部向前找第一个含 innerVoice 的 assistant 消息。
   ========================================================================== */
export function findLatestInnerVoice(messages) {
  if (!Array.isArray(messages)) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role === 'assistant' && msg?.innerVoice && typeof msg.innerVoice === 'object') {
      return msg.innerVoice;
    }
  }
  return null;
}

function formatHistoryTime(ts) {
  const d = new Date(Number(ts || Date.now()));
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* ==========================================================================
   [区域标注·已完成·心声面板日期时间与下载] 日期格式与 TXT 下载
   说明：
   1. 当前心声面板显示完整日期时间，历史列表仍保留紧凑时间。
   2. 下载按钮只读取 DB.js / IndexedDB 中的心声历史，不新增任何持久化存储。
   3. TXT 内容按日期从早到晚排列；不使用 localStorage/sessionStorage。
   ========================================================================== */
function formatPanelDateTime(ts) {
  const d = new Date(Number(ts || Date.now()));
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function buildInnerVoiceDownloadText(items = []) {
  const sorted = normalizeInnerVoiceHistory(items).slice().sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
  return sorted.map(item => {
    const data = normalizeInnerVoiceData(item.innerVoice) || {};
    return [
      `日期时间：${formatPanelDateTime(item.createdAt)}`,
      `轮次：#${Number(item.roundIndex || 1)}`,
      `状态：${data.status || '……'}`,
      `动作：${data.action || '……'}`,
      `心情：${data.mood || '……'}`,
      `心跳频率：${Number(data.heartbeat || 0)} bpm`,
      `醋意指数：${Number(data.jealousy || 0)}%`,
      `好感度：${Number(data.affection || 0)}%`,
      `心声：${data.voice || '……'}`
    ].join('\n');
  }).join('\n\n------------------------------\n\n');
}

function downloadInnerVoiceHistoryTxt(items = [], chatName = '') {
  const text = buildInnerVoiceDownloadText(items);
  if (!text.trim()) return;
  const safeName = String(chatName || '心声历史').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 32) || '心声历史';
  const fileName = `${safeName}_${formatPanelDateTime(Date.now()).replace(/[/: ]/g, '-')}.txt`;
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 800);
}

/* ==========================================================================
   [区域标注·已完成·本次修正：心声面板渲染 HTML]
   说明：
   1. 两个标签页显示为加粗英文花体字："Voice" 和 "Now"（"数据"仅改面板显示为"Now"）。
   2. Voice 页已新增“性幻想”板块；Now 页已新增“性欲值”进度条和数值显示。
   3. [已完成·本次修正：心声面板标题与板块间距] Voice 页性幻想标题显示为英文 FANTASY，具体字体和间距由 chat-inner-voice.css 统一控制。
   4. "历史/多选/下载"图标按钮统一放在标签下方同一行，仅显示图标。
   5. 当前心声面板显示日期和时间；点击面板外遮罩区域自动关闭。
   ========================================================================== */
export function renderInnerVoicePanel(innerVoice, activeTab = 'voice', options = {}) {
  if (!innerVoice) {
    return renderEmptyInnerVoicePanel();
  }

  const data = normalizeInnerVoiceData(innerVoice);
  if (!data) return renderEmptyInnerVoicePanel();

  const isVoiceTab = activeTab === 'voice';
  const isDataTab = activeTab === 'data';
  const displayTime = formatPanelDateTime(options.createdAt || Date.now());

  // 心跳频率进度条：60-180 bpm 映射到 0-100%
  const heartbeatPercent = Math.round(((data.heartbeat - 60) / 120) * 100);
  const heartbeatWidth = Math.max(2, Math.min(100, heartbeatPercent));

  // [已完成·本次修正：性欲值进度条] 0-100 直接映射 Now 页进度条宽度。
  const desireWidth = Math.max(2, data.desire);

  return `
    <div class="iv-panel is-open" data-role="iv-panel" data-iv-view="current">
      <div class="iv-panel-header">
        <div class="iv-tabs">
          <div class="iv-tabs__track">
            <button class="iv-tab ${isVoiceTab ? 'is-active' : ''}" data-action="iv-switch-tab" data-iv-tab="voice" type="button">${IV_ICONS.heart}Voice</button>
            <button class="iv-tab ${isDataTab ? 'is-active' : ''}" data-action="iv-switch-tab" data-iv-tab="data" type="button">${IV_ICONS.chart}Now</button>
          </div>
        </div>
      </div>
      <div class="iv-toolbar" data-role="iv-toolbar">
        <button class="iv-toolbar-btn" data-action="iv-show-history" type="button" aria-label="心声历史" title="心声历史">${IV_ICONS.history}</button>
        <button class="iv-toolbar-btn" data-action="iv-toggle-multi" type="button" aria-label="多选" title="多选">${IV_ICONS.multiSelect}</button>
        <button class="iv-toolbar-btn" data-action="iv-download-history" type="button" aria-label="下载心声历史" title="下载心声历史">${IV_ICONS.download}</button>
        <span class="iv-toolbar-spacer"></span>
      </div>
      <div class="iv-panel-time" data-role="iv-panel-time">${escapeHtml(displayTime)}</div>
      <div class="iv-tab-body">
        <div class="iv-tab-page ${isVoiceTab ? 'is-active' : ''}" data-iv-page="voice">
          <div class="iv-cell iv-voice-cell">
            <span class="iv-cell__label">INNER VOICE</span>
            <div class="iv-cell__text">${escapeHtml(data.voice || '……')}</div>
          </div>
          <div class="iv-cell iv-fantasy-cell">
            <span class="iv-cell__label">FANTASY</span>
            <div class="iv-cell__text">${escapeHtml(data.fantasy || '……')}</div>
          </div>
        </div>
        <div class="iv-tab-page ${isDataTab ? 'is-active' : ''}" data-iv-page="data">
          <div class="iv-grid-row">
            <div class="iv-cell">
              <span class="iv-cell__label">STATUS</span>
              <div class="iv-cell__text">${escapeHtml(data.status || '……')}</div>
            </div>
            <div class="iv-cell">
              <span class="iv-cell__label">MOOD</span>
              <div class="iv-cell__text">${escapeHtml(data.mood || '……')}</div>
            </div>
          </div>
          <div class="iv-cell iv-action-cell">
            <span class="iv-cell__label">ACTION</span>
            <div class="iv-cell__text">${escapeHtml(data.action || '……')}</div>
          </div>
          <div class="iv-meters">
            <span class="iv-cell__label">METERS</span>
            <div class="iv-meter iv-meter--heartbeat">
              <div class="iv-meter__header">
                <span class="iv-meter__name">心跳频率</span>
                <span class="iv-meter__value">${data.heartbeat} bpm</span>
              </div>
              <div class="iv-meter__bar">
                <div class="iv-meter__fill" style="width:${heartbeatWidth}%"></div>
              </div>
            </div>
            <div class="iv-meter iv-meter--jealousy">
              <div class="iv-meter__header">
                <span class="iv-meter__name">醋意指数</span>
                <span class="iv-meter__value">${data.jealousy}%</span>
              </div>
              <div class="iv-meter__bar">
                <div class="iv-meter__fill" style="width:${Math.max(2, data.jealousy)}%"></div>
              </div>
            </div>
            <div class="iv-meter iv-meter--affection">
              <div class="iv-meter__header">
                <span class="iv-meter__name">好感度</span>
                <span class="iv-meter__value">${data.affection}%</span>
              </div>
              <div class="iv-meter__bar">
                <div class="iv-meter__fill" style="width:${Math.max(2, data.affection)}%"></div>
              </div>
            </div>
            <div class="iv-meter iv-meter--desire">
              <div class="iv-meter__header">
                <span class="iv-meter__name">性欲值</span>
                <span class="iv-meter__value">${data.desire}%</span>
              </div>
              <div class="iv-meter__bar">
                <div class="iv-meter__fill" style="width:${desireWidth}%"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

/* ==========================================================================
   [区域标注·已完成·心声面板] 空状态面板
   说明：与主面板保持一致的游戏机风格加粗英文花体标签，按钮为同一行纯图标。
   ========================================================================== */
function renderEmptyInnerVoicePanel() {
  return `
    <div class="iv-panel is-open" data-role="iv-panel" data-iv-view="current">
      <div class="iv-panel-header">
        <div class="iv-tabs">
          <div class="iv-tabs__track">
            <button class="iv-tab is-active" data-action="iv-switch-tab" data-iv-tab="voice" type="button">${IV_ICONS.heart}Voice</button>
            <button class="iv-tab" data-action="iv-switch-tab" data-iv-tab="data" type="button">${IV_ICONS.chart}Now</button>
          </div>
        </div>
      </div>
      <div class="iv-toolbar" data-role="iv-toolbar">
        <button class="iv-toolbar-btn" data-action="iv-show-history" type="button" aria-label="心声历史" title="心声历史">${IV_ICONS.history}</button>
        <button class="iv-toolbar-btn" data-action="iv-toggle-multi" type="button" aria-label="多选" title="多选">${IV_ICONS.multiSelect}</button>
        <button class="iv-toolbar-btn" data-action="iv-download-history" type="button" aria-label="下载心声历史" title="下载心声历史">${IV_ICONS.download}</button>
        <span class="iv-toolbar-spacer"></span>
      </div>
      <div class="iv-panel-time" data-role="iv-panel-time">${escapeHtml(formatPanelDateTime(Date.now()))}</div>
      <div class="iv-tab-body">
        <div class="iv-tab-page is-active" data-iv-page="voice">
          <div class="iv-empty">
            <span class="iv-empty__icon">${IV_ICONS.empty}</span>
            暂无心声数据<br>等待角色的下一次回复
          </div>
        </div>
        <div class="iv-tab-page" data-iv-page="data">
          <div class="iv-empty">
            <span class="iv-empty__icon">${IV_ICONS.empty}</span>
            暂无数据
          </div>
        </div>
      </div>
    </div>
  `;
}

/* ==========================================================================
   [区域标注·已完成·心声历史视图] 渲染历史列表
   说明：历史视图用于观看过往心声，并支持同一行图标按钮完成多选/全选/删除/下载。
   ========================================================================== */
function renderInnerVoiceHistoryPanel(history = [], options = {}) {
  const multiMode = Boolean(options.multiMode);
  const selectedIds = new Set(Array.isArray(options.selectedIds) ? options.selectedIds.map(String) : []);
  const items = normalizeInnerVoiceHistory(history);
  const allSelected = items.length > 0 && items.every(item => selectedIds.has(String(item.id)));

  return `
    <div class="iv-panel is-open" data-role="iv-panel" data-iv-view="history" data-iv-multi="${multiMode ? '1' : '0'}">
      <div class="iv-panel-header">
        <div class="iv-tabs">
          <div class="iv-tabs__track">
            <button class="iv-tab is-active" data-action="iv-show-current" type="button">${IV_ICONS.heart}Voice</button>
            <button class="iv-tab" data-action="iv-show-current" type="button">${IV_ICONS.chart}Now</button>
          </div>
        </div>
      </div>
      <div class="iv-toolbar" data-role="iv-toolbar">
        <button class="iv-toolbar-btn is-active" data-action="iv-show-current" type="button" aria-label="返回当前心声" title="返回当前心声">${IV_ICONS.history}</button>
        <button class="iv-toolbar-btn ${multiMode ? 'is-active' : ''}" data-action="iv-toggle-multi" type="button" aria-label="${multiMode ? '取消多选' : '多选'}" title="${multiMode ? '取消多选' : '多选'}">${IV_ICONS.multiSelect}</button>
        ${multiMode ? `
          <button class="iv-toolbar-btn" data-action="iv-select-all" type="button" aria-label="${allSelected ? '取消全选' : '全选'}" title="${allSelected ? '取消全选' : '全选'}">${IV_ICONS.check}</button>
          <button class="iv-toolbar-btn iv-toolbar-btn--danger" data-action="iv-open-delete-confirm" type="button" aria-label="删除选中心声" title="删除选中心声" ${selectedIds.size ? '' : 'disabled'}>${IV_ICONS.delete}</button>
        ` : ''}
        <button class="iv-toolbar-btn" data-action="iv-download-history" type="button" aria-label="下载心声历史" title="下载心声历史">${IV_ICONS.download}</button>
        <span class="iv-toolbar-spacer"></span>
      </div>
      <div class="iv-tab-body">
        <div class="iv-tab-page is-active">
          ${items.length ? `
            <div class="iv-history-list" data-role="iv-history-list">
              ${items.map(item => {
                const data = normalizeInnerVoiceData(item.innerVoice);
                const selected = selectedIds.has(String(item.id));
                return `
                  <button class="iv-history-item ${selected ? 'is-selected' : ''}"
                          data-action="${multiMode ? 'iv-toggle-history-item' : 'iv-view-history-item'}"
                          data-iv-history-id="${escapeHtml(item.id)}"
                          type="button">
                    ${multiMode ? `
                      <span class="iv-history-checkbox ${selected ? 'is-checked' : ''}">
                        ${IV_ICONS.check}
                      </span>
                    ` : ''}
                    <span class="iv-history-content">
                      <span class="iv-history-voice">${escapeHtml(data?.voice || '……')}</span>
                      <span class="iv-history-meta">
                        <span>#${Number(item.roundIndex || 1)}</span>
                        <span>${escapeHtml(formatHistoryTime(item.createdAt))}</span>
                        <span>心跳 ${Number(data?.heartbeat || 0)} bpm</span>
                      </span>
                    </span>
                  </button>
                `;
              }).join('')}
            </div>
          ` : `
            <div class="iv-empty">
              <span class="iv-empty__icon">${IV_ICONS.empty}</span>
              暂无心声历史<br>每轮 AI 回复生成后会自动保存在这里
            </div>
          `}
        </div>
      </div>
    </div>
  `;
}

function renderInnerVoiceDeleteConfirm(count = 0) {
  return `
    <div class="iv-confirm-overlay is-open" data-role="iv-confirm-overlay">
      <div class="iv-confirm-dialog">
        <div class="iv-confirm-title">确认删除心声历史</div>
        <div class="iv-confirm-msg">将删除已选中的 ${Number(count || 0)} 条心声历史。删除后不可恢复。</div>
        <div class="iv-confirm-actions">
          <button class="iv-confirm-btn" data-action="iv-close-delete-confirm" type="button">取消</button>
          <button class="iv-confirm-btn iv-confirm-btn--danger" data-action="iv-confirm-delete-history" type="button">确认删除</button>
        </div>
      </div>
    </div>
  `;
}

/* ==========================================================================
   [区域标注·已修改·心声面板] 打开心声面板
   说明：
   1. 在聊天消息页容器中插入遮罩层 + 面板 DOM。
   2. 点击遮罩层自动关闭面板（不设关闭按钮）。
   3. 标签切换、历史、多选、全选、删除确认均在本模块内部处理。
   4. 心声历史只读写 DB.js / IndexedDB，不使用 localStorage/sessionStorage。
   ========================================================================== */
export function openInnerVoicePanel(container, innerVoice, options = {}) {
  closeInnerVoicePanel(container);

  const overlay = document.createElement('div');
  overlay.className = 'iv-overlay is-open';
  overlay.dataset.role = 'iv-overlay';
  overlay.__ivState = {
    innerVoice: normalizeInnerVoiceData(innerVoice),
    db: options.db || null,
    maskId: String(options.maskId || ''),
    chatId: String(options.chatId || ''),
    history: [],
    multiMode: false,
    selectedIds: [],
    currentTimestamp: Number(options.createdAt || Date.now()) || Date.now(),
    chatName: String(options.chatName || '')
  };

  overlay.innerHTML = renderInnerVoicePanel(innerVoice, 'voice', { createdAt: overlay.__ivState.currentTimestamp });

  overlay.addEventListener('click', async (e) => {
    if (e.target === overlay) {
      closeInnerVoicePanel(container);
      return;
    }

    const target = e.target.closest('[data-action]');
    if (!target || !overlay.contains(target)) return;

    const action = String(target.dataset.action || '');
    if (!action.startsWith('iv-')) return;

    e.preventDefault();
    e.stopPropagation();

    const ivState = overlay.__ivState || {};
    if (action === 'iv-switch-tab') {
      switchInnerVoiceTab(overlay, String(target.dataset.ivTab || 'voice'));
      return;
    }

    if (action === 'iv-show-history') {
      ivState.history = await loadInnerVoiceHistory(ivState.db, ivState.maskId, ivState.chatId);
      ivState.multiMode = false;
      ivState.selectedIds = [];
      overlay.innerHTML = renderInnerVoiceHistoryPanel(ivState.history, ivState);
      return;
    }

    if (action === 'iv-show-current') {
      ivState.multiMode = false;
      ivState.selectedIds = [];
      overlay.innerHTML = renderInnerVoicePanel(ivState.innerVoice, 'voice', { createdAt: ivState.currentTimestamp });
      return;
    }

    if (action === 'iv-toggle-multi') {
      ivState.history = await loadInnerVoiceHistory(ivState.db, ivState.maskId, ivState.chatId);
      ivState.multiMode = !ivState.multiMode;
      ivState.selectedIds = [];
      overlay.innerHTML = renderInnerVoiceHistoryPanel(ivState.history, ivState);
      return;
    }

    if (action === 'iv-select-all') {
      const ids = normalizeInnerVoiceHistory(ivState.history).map(item => String(item.id));
      const selected = new Set((ivState.selectedIds || []).map(String));
      const allSelected = ids.length > 0 && ids.every(id => selected.has(id));
      ivState.selectedIds = allSelected ? [] : ids;
      overlay.innerHTML = renderInnerVoiceHistoryPanel(ivState.history, ivState);
      return;
    }

    if (action === 'iv-toggle-history-item') {
      const id = String(target.dataset.ivHistoryId || '');
      const selected = new Set((ivState.selectedIds || []).map(String));
      selected.has(id) ? selected.delete(id) : selected.add(id);
      ivState.selectedIds = Array.from(selected);
      overlay.innerHTML = renderInnerVoiceHistoryPanel(ivState.history, ivState);
      return;
    }

    if (action === 'iv-view-history-item') {
      const id = String(target.dataset.ivHistoryId || '');
      const entry = normalizeInnerVoiceHistory(ivState.history).find(item => String(item.id) === id);
      if (entry?.innerVoice) {
        ivState.innerVoice = normalizeInnerVoiceData(entry.innerVoice);
        ivState.currentTimestamp = Number(entry.createdAt || Date.now()) || Date.now();
        ivState.multiMode = false;
        ivState.selectedIds = [];
        overlay.innerHTML = renderInnerVoicePanel(ivState.innerVoice, 'voice', { createdAt: ivState.currentTimestamp });
      }
      return;
    }

    if (action === 'iv-download-history') {
      ivState.history = await loadInnerVoiceHistory(ivState.db, ivState.maskId, ivState.chatId);
      const selected = new Set((ivState.selectedIds || []).map(String));
      const sourceItems = normalizeInnerVoiceHistory(ivState.history);
      const downloadItems = selected.size
        ? sourceItems.filter(item => selected.has(String(item.id)))
        : sourceItems;
      downloadInnerVoiceHistoryTxt(downloadItems, ivState.chatName || '心声历史');
      return;
    }

    if (action === 'iv-open-delete-confirm') {
      const count = (ivState.selectedIds || []).length;
      if (!count) return;
      overlay.insertAdjacentHTML('beforeend', renderInnerVoiceDeleteConfirm(count));
      return;
    }

    if (action === 'iv-close-delete-confirm') {
      overlay.querySelector('[data-role="iv-confirm-overlay"]')?.remove();
      return;
    }

    if (action === 'iv-confirm-delete-history') {
      const selected = new Set((ivState.selectedIds || []).map(String));
      const nextHistory = normalizeInnerVoiceHistory(ivState.history).filter(item => !selected.has(String(item.id)));
      await persistInnerVoiceHistoryList(ivState.db, ivState.maskId, ivState.chatId, nextHistory);
      ivState.history = nextHistory;
      ivState.selectedIds = [];
      ivState.multiMode = false;
      overlay.innerHTML = renderInnerVoiceHistoryPanel(ivState.history, ivState);
    }
  });

  container.appendChild(overlay);
}

/* ==========================================================================
   [区域标注·已完成·心声面板] 关闭心声面板
   ========================================================================== */
export function closeInnerVoicePanel(container) {
  const overlay = container.querySelector('[data-role="iv-overlay"]');
  if (!overlay) return;
  overlay.classList.remove('is-open');
  const panel = overlay.querySelector('[data-role="iv-panel"]');
  if (panel) panel.classList.remove('is-open');
  setTimeout(() => overlay.remove(), 250);
}

/* ==========================================================================
   [区域标注·已完成·心声面板] 标签页切换
   ========================================================================== */
function switchInnerVoiceTab(overlayOrPanel, tabId) {
  const root = overlayOrPanel.querySelector?.('[data-role="iv-panel"]') || overlayOrPanel;

  root.querySelectorAll('.iv-tab').forEach(tab => {
    tab.classList.toggle('is-active', String(tab.dataset.ivTab || '') === tabId);
  });
  root.querySelectorAll('.iv-tab-page').forEach(page => {
    page.classList.toggle('is-active', String(page.dataset.ivPage || '') === tabId);
  });
}

/* ==========================================================================
   [区域标注·已完成·本次修正：心声称谓锁定与短期剧情连续性锚点]
   说明：
   1. 本函数返回追加到 AI 系统提示词中的心声格式要求。
   2. 本次已完成称谓锁定：根据当前用户面具姓名/性别，把心声里对用户的第三人称指代锁定为“他/她/用户名字”，防止把“男/双性”用户误写成“她”。
   3. 本区继续保留短期剧情连续性锚点修复：心声生成前必须先抽取最近一轮的地点、姿态、动作、已完成事件与线上/线下状态，再在该锚点上顺推。
   4. 已明确禁止无依据跳场景、跳地点、回退已完成动作，避免上一轮在晚宴/门边/车里，下一轮突然出现在书房或倒退回车内。
   5. 已明确禁止使用“会话对象”，避免 AI 可见回复叫对用户名字、心声却把用户写成泛称。
   6. 继续禁止在心声里用“你/你们”，保持心声第三人称表达；未改动存储、弹窗、图标或其它聊天逻辑。
   ========================================================================== */
export function buildInnerVoiceSystemPrompt(options = {}) {
  const referenceOptions = resolveInnerVoiceUserReferenceOptions(options);

  return `
【心声协议·强制】
每轮回复都必须在本轮所有可见协议块最后，额外追加且只追加 1 段心声：
[心声]状态|动作|心情|心跳|醋意|好感|性欲|真实心声|性幻想[/心声]

九段含义：
1. 状态：角色当前状态，第一人称，≤30字。
2. 动作：角色正在做的动作，第一人称，≤50字。
3. 心情：没说出口的真实心情，第一人称，≤30字，可自然加入1个emoji。
4. 心跳：整数 bpm，60-180。
5. 醋意：整数，0-100。
6. 好感：整数，0-100。
7. 性欲：整数，0-100。
8. 真实心声：第一人称，≤150字，要体现与表面消息的反差；${referenceOptions.allowedReferenceText}；${referenceOptions.forbiddenReferenceText}；禁止使用“会话对象”，不要用“你/你们”。
9. 性幻想：第一人称，≤100字，必须符合角色人设与当前关系阶段；若提到用户，同样遵守上一条称谓锁定。

历史连续性硬规则：
- 生成心声前必须先读取最近短期对话历史，尤其是上一轮用户消息、上一轮 AI 可见回复、上一轮旁白以及上一轮心声中的地点、姿态、动作、正在做的事和刚发生的事件。
- 写心声前先在后台建立“连续性锚点”：当前地点/空间、角色姿态、角色正在做的动作、上一轮已经完成的动作、与用户的相对位置、当前是线上聊天还是线下同场景。心声的状态、动作、真实心声、性幻想都必须围绕这个锚点继续。
- 状态、动作、真实心声、性幻想都必须从最近一轮已发生内容自然顺滑推进；没有用户明确推动、时间足够经过、交通/转场过程或历史证据时，禁止突然换地点、突然换场景、突然完成长距离移动、突然从线下回到线上，或把上一轮已经完成的动作改回未发生。
- 如果上一轮角色在门边、车里、书房、卧室、路上等具体场景，本轮必须默认仍在该场景或其合理下一步；除非历史或本轮用户明确给出转场原因。
- 如果上一轮写“还在车里/走到门边/已经下车/已经进屋/已经坐下”等状态或完成动作，本轮只能承接其结果继续写，不能倒退成“已经下车后又还在车里”“已经到门边后又回到远处”“已经进屋后又没进屋”。
- 如果本轮用户只是在聊天、确认、追问或发表情，没有推动线下行动，就只在原场景内写微动作、情绪和屏幕回复反应，不主动开新地点。
- 历史有冲突时，以最近一轮原文为准；无法判断时宁可保守承接“还在刚才的位置/继续刚才的动作”，不要编造新场景。

强格式规则：
- [心声] 与 [/心声] 必须完全照写，不能改字、漏写、错写、加空格或标准标签以外的变体符号。
- 心声块必须放在本轮最后，且单独一行；不能放进 [回复]/[引用]/[卡片] 等任何可见协议块里。
- 心声块内部必须正好 9 段，也就是正好 8 个英文竖线 |；不得缺段，不得多段。
- 九段内容里禁止再出现 |、[、]、换行、Markdown、代码块、字段名、JSON、解释或任何检查文字。
- 如果某段没那么强烈，也必须按规则正常填写，不能留空，不能省略整段。
- 心声只针对最新一轮用户消息生成，并结合角色人设与会话历史；禁止臆造本轮未出现的图片、表情、语音、转账、礼物或现场行为。
- 可见回复写完后，最后直接补这一行心声，不要在心声前后再加任何别的文本。

示例：
[心声]焦躁地等待${referenceOptions.exampleUserRef}的回复ing|一边吃东西，一边盯着屏幕等${referenceOptions.exampleUserRef}的下一条消息|面上平静，心里其实很害羞🥺|96|14|78|21|表面还在装无所谓，其实已经开始反复回想${referenceOptions.exampleUserRef}刚才那句话了|脑子里短暂闪过把${referenceOptions.exampleUserRef}抱进怀里哄好的画面，又立刻被自己压下去[/心声]
`.trim();
}

/* ==========================================================================
   [区域标注·已完成·心声面板] 判断消息气泡行中的头像是否为 AI 角色头像
   说明：只有左侧（非用户方）头像才触发心声面板。
   ========================================================================== */
export function isAssistantAvatarClick(target) {
  if (!target) return false;
  const avatar = target.closest('.msg-bubble__avatar');
  if (!avatar) return false;
  if (avatar.classList.contains('msg-bubble__avatar--user')) return false;
  const row = avatar.closest('.msg-bubble-row');
  if (!row) return false;
  return row.classList.contains('msg-bubble-row--left');
}

/* ==========================================================================
   [区域标注·已完成·心声面板] 从头像点击事件获取关联消息 ID
   ========================================================================== */
export function getMessageIdFromAvatarClick(target) {
  const row = target.closest('.msg-bubble-row[data-message-id]');
  return row ? String(row.dataset.messageId || '') : '';
}
