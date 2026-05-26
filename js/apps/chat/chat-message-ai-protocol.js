// @ts-nocheck
/**
 * 文件名: js/apps/chat/chat-message-ai-protocol.js
 * 用途: 闲谈应用 — 聊天消息页 AI 协议解析与修复
 * 架构层: 应用层（闲谈子模块）
 *
 * 说明：
 * 1. 负责 AI 协议块解析、消息修复、消息拆泡、运行时排序、去回显、旁白绑定。
 * 2. 只处理运行时消息对象，不直接操作聊天页 DOM。
 * 3. 持久化仍由上层通过 DB.js / IndexedDB 统一处理，不使用 localStorage/sessionStorage。
 */

import {
  extractHtmlCardProtocolBlocks
} from './chat-html-card.js';
import {
  createAiGiftMessageFromProtocol,
  getGiftMessageDisplayText,
  isGiftMessage
} from './chat-gift.js';
import {
  createAiTextImageMessageFromProtocol,
  isTextImageMessage
} from './chat-text-image.js';
import {
  createAiVoiceMessageFromProtocol,
  isVoiceMessage,
  parseAiVoiceProtocolPayload
} from './chat-voice.js';
import { extractAsideFromRawText } from './chat-aside.js';
import { createQuotePayloadFromMessage } from './chat-message-quote.js';
import { normalizeStickerData } from './chat-utils.js';

/* ==========================================================================
   [区域标注·已完成·本次拆分] AI 协议解析与格式修复子模块
   说明：
   1. 原 chat-message.js 中的 AI 协议解析、格式修复、拆泡、排序、去回显等纯逻辑已拆分到本文件。
   2. 本文件不依赖聊天页 DOM，不直接写入 DB.js / IndexedDB，只返回运行时消息结构。
   3. chat-message.js 继续作为 facade 与发送编排入口，对外导出旧函数名，避免影响既有调用方。
   4. 后续如需调整 AI 协议兼容性，优先修改本文件。
   ========================================================================== */

/* ======================================================================== */
/* 引用/旁白/表情工具 */
/* ======================================================================== */
function getAsideSegmentsFromMessage(message = {}) {
  const segments = Array.isArray(message?.asideSegments)
    ? message.asideSegments
        .map((segment, index) => ({
          id: String(segment?.id || `${message?.id || 'aside'}_${index + 1}`),
          text: String(segment?.text || '').trim(),
          placement: String(segment?.placement || 'before') === 'after' ? 'after' : 'before'
        }))
        .filter(segment => segment.text)
    : [];

  if (segments.length) return segments;

  const asideText = String(message?.asideText || '').trim();
  return asideText ? [{ id: String(message?.id || 'aside'), text: asideText, placement: 'before' }] : [];
}

function getMountedStickerItems(state) {
  const data = normalizeStickerData(state?.stickerData);
  const mountedGroupIds = Array.isArray(state?.chatPromptSettings?.mountedStickerGroupIds)
    ? Array.from(new Set(state.chatPromptSettings.mountedStickerGroupIds.map(String).filter(Boolean)))
    : [];
  if (!mountedGroupIds.length) return [];
  if (mountedGroupIds.includes('all')) return data.items;
  return data.items.filter(item => mountedGroupIds.includes(String(item.groupId || 'all')));
}

function getStickerProtocolCandidates(token) {
  const raw = String(token || '').trim();
  if (!raw) return [];

  const cleaned = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/[`*_]+/g, '')
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .trim();

  const candidates = [
    cleaned,
    cleaned.replace(/^(?:资源\s*ID|资源Id|ID|id|表情名|名称)\s*[：:]\s*/i, '').trim()
  ];

  [...cleaned.matchAll(/(?:资源\s*ID|资源Id|ID|id|表情名|名称)\s*[：:]\s*([^；;，,\n]+)/gi)]
    .forEach(match => candidates.push(String(match[1] || '').trim()));

  [...cleaned.matchAll(/sticker_[A-Za-z0-9_:-]+/g)]
    .forEach(match => candidates.push(String(match[0] || '').trim()));

  cleaned.split(/[；;，,\s]+/).forEach(part => candidates.push(part.trim()));

  return Array.from(new Set(
    candidates
      .map(item => String(item || '').replace(/^["'“”]+|["'“”]+$/g, '').trim())
      .filter(Boolean)
  ));
}

export function resolveStickerProtocolTarget(token, state) {
  const candidates = getStickerProtocolCandidates(token);
  if (!candidates.length) return null;

  const candidateItems = getMountedStickerItems(state);
  for (const normalizedToken of candidates) {
    const byId = candidateItems.find(item => String(item.id) === normalizedToken);
    if (byId) return byId;

    const byName = candidateItems.find(item => String(item.name) === normalizedToken);
    if (byName) return byName;
  }

  return null;
}

export function normalizeStickerLooseMatchText(value) {
  return String(value || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/[`*_#"“”"'《》（）()\[\]【】{}]/g, '')
    .replace(/(?:资源\s*ID|资源Id|表情名|名称|表情包|表情|贴纸|sticker|发送|发个|发一张|来个|给你|我发|刚才|点错了|没发出去|这回|看清楚|看看|吧|啊|呀|呢|了)/gi, '')
    .replace(/[：:；;，,。.!！？?\s-]+/g, '')
    .toLowerCase()
    .trim();
}

export function findLooseStickerTargetFromText(text, state) {
  const raw = String(text || '').trim();
  if (!raw) return null;

  const exact = resolveStickerProtocolTarget(raw, state);
  if (exact) return exact;

  const mountedItems = getMountedStickerItems(state);
  if (!mountedItems.length) return null;

  const hasStickerIntent = /表情|表情包|贴纸|sticker_|资源\s*ID|资源Id|动图|发.*图|发.*包/i.test(raw);
  const rawLower = raw.toLowerCase();

  const byId = mountedItems.find(item => {
    const id = String(item.id || '').trim();
    return id && rawLower.includes(id.toLowerCase());
  });
  if (byId) return byId;

  const rawLoose = normalizeStickerLooseMatchText(raw);
  if (!rawLoose) return null;

  const byName = mountedItems.find(item => {
    const name = String(item.name || '').trim();
    const nameLoose = normalizeStickerLooseMatchText(name);
    return name && (
      raw.includes(name) ||
      (hasStickerIntent && nameLoose.length >= 2 && (rawLoose.includes(nameLoose) || nameLoose.includes(rawLoose)))
    );
  });

  return byName || null;
}

export function createStickerMessagePatchFromTarget(message, sticker) {
  if (!message || !sticker) return null;
  return {
    ...message,
    role: 'assistant',
    type: 'sticker',
    content: `[表情包] ${sticker.name}`,
    stickerId: sticker.id,
    stickerName: sticker.name,
    stickerUrl: sticker.url
  };
}

export function repairAiMessageFormatIfPossible(message, state) {
  if (!message || message.role !== 'assistant') return null;
  if (String(message.type || '') === 'sticker' && String(message.stickerUrl || '').trim()) return null;

  const sticker = findLooseStickerTargetFromText(message.content, state);
  return sticker ? createStickerMessagePatchFromTarget(message, sticker) : null;
}

/* ======================================================================== */
/* 协议清理与排序 */
/* ======================================================================== */
const AI_PROTOCOL_CLOSING_TAG_REGEX = /(?:\[\s*\/\s*(?:回复|表情|转账|礼物|红包|外卖|引用|撤回|拍一拍|语音|文字图|图片|卡片|旁白|心声)\s*\]|【\s*\/\s*(?:语音|文字图)\s*】)/gi;

function stripAiProtocolClosingTags(value = '') {
  return String(value || '').replace(AI_PROTOCOL_CLOSING_TAG_REGEX, ' ');
}

export function cleanAiProtocolBlockContent(content) {
  return stripAiProtocolClosingTags(String(content || ''))
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^\s*(?:`|\*\*)+/g, '')
    .replace(/(?:`|\*\*)+\s*$/g, '')
    .trim();
}

function getAiRuntimeProtocolOrder(message = {}, fallbackIndex = 0) {
  const value = Number(message?.__protocolOrder);
  return Number.isFinite(value) ? value : Number(fallbackIndex || 0);
}

export function sortAiMessagesByRuntimeProtocolOrder(messages = []) {
  return (Array.isArray(messages) ? messages : [])
    .map((message, index) => ({
      message,
      index,
      order: getAiRuntimeProtocolOrder(message, index)
    }))
    .sort((a, b) => (a.order - b.order) || (a.index - b.index))
    .map(item => item.message);
}

export function stripAiRuntimeProtocolOrderFields(message = {}) {
  const {
    __protocolOrder,
    __protocolEndIndex,
    __protocolIndex,
    ...cleanMessage
  } = message || {};
  return cleanMessage;
}

/* ========================================================================
   [区域标注·已完成·本次省略号规范、引号内拆泡保护与短句标点口语化]
   说明：
   1. 普通文字回复拆泡只按已有换行、显式气泡分隔符、句号/问号/叹号/省略号等自然终止符处理；普通聊天内容里的冒号不是拆泡依据。
   2. AI 可见文本中的 ... / ...... / 。。。 会统一规范为中文省略号 “……”，避免聊天气泡出现英文三个点。
   3. 成对双引号/单引号/中式引号内的文本会尽量保留在同一个气泡里；拆泡后若掉出单独的引号或纯标点+引号碎片，会并回相邻气泡。
   4. 仅对极短语气词末尾单个句号做轻量口语化修正，如“呵。”→“呵”；不改长句、不重写正常标点。
   5. 本区只影响前端运行时 AI 可见文本清洗与拆泡，不改 DB.js / IndexedDB 持久化结构。
   ======================================================================== */
function normalizeAiEllipsisText(text = '') {
  return String(text || '')
    .replace(/\.{3,}/g, '……')
    .replace(/。{3,}/g, '……')
    .replace(/…{3,}/g, '……');
}

export function cleanAiVisibleBubbleText(text) {
  return normalizeAiEllipsisText(stripAiProtocolClosingTags(String(text || '')))
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<\/?think>/gi, '')
    .replace(/^\s*(?:以下是)?(?:修正后内容|最终输出|回复格式|检查结果|修正结果|正确格式)\s*[：:]\s*/i, '')
    .replace(/^\s*(?:\*\*)?\s*`?\s*\[\s*(?:回复|表情|引用|礼物|红包|外卖|转账|撤回|拍一拍|语音|文字图|图片)\s*\]\s*(?:[^：:\n`*]{1,40}\s*[：:]\s*)?/i, '')
    .replace(/^\s*\{(?:user|assistant|role|character|mask)_[^}\n]{3,120}\}\s*/i, '')
    .replace(/(?:`|\*\*)+/g, '')
    .replace(/\[\s*消息发送时间\s*[：:][\s\S]*?\]/gi, ' ')
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !/^(思考回复内容|思考内容|检查规则|审查规则|拟定句子|检查结果|最终输出|回复格式|本轮 API 实际请求时间|最近一条已记录的用户消息发送时间|最近一条聊天记录时间|从最近一条用户消息到本轮实际请求已经过去|距上次聊天记录已经过去)\s*[：:]/.test(line))
    .map(line => line.replace(/^(?:第\s*\d+\s*条|气泡\s*\d+|[0-9]+[.)、])\s*/i, '').trim())
    .filter(line => !/^\d{4}年\d{1,2}月\d{1,2}日(?:星期[一二三四五六日天])?\s+\d{1,2}:\d{2}(?::\d{2})?\]$/.test(line))
    .filter(Boolean)
    .join('\n')
    .trim();
}

function mergeAiPunctuationOnlyBubbleFragments(parts = []) {
  const merged = [];
  (Array.isArray(parts) ? parts : []).forEach(part => {
    const value = String(part || '').trim();
    if (!value) return;

    if (merged.length && /^[.。…"“”"'‘’「」『』]+$/.test(value)) {
      merged[merged.length - 1] = `${merged[merged.length - 1]}${value}`;
      return;
    }

    merged.push(value);
  });
  return merged;
}

function getAiQuoteBalanceState(text = '') {
  const quotePairs = {
    '“': '”',
    '‘': '’',
    '「': '」',
    '『': '』'
  };
  const symmetricQuotes = new Set(['"', "'"]);
  const stack = [];

  for (const char of String(text || '')) {
    if (quotePairs[char]) {
      stack.push(quotePairs[char]);
      continue;
    }

    if (symmetricQuotes.has(char)) {
      if (stack[stack.length - 1] === char) {
        stack.pop();
      } else {
        stack.push(char);
      }
      continue;
    }

    if (stack[stack.length - 1] === char) {
      stack.pop();
    }
  }

  return stack;
}

function mergeAiQuotedBubbleFragments(parts = []) {
  const merged = [];
  let pendingText = '';
  let pendingQuoteState = [];

  const flushPending = () => {
    const value = String(pendingText || '').trim();
    if (!value) {
      pendingText = '';
      pendingQuoteState = [];
      return;
    }
    merged.push(value);
    pendingText = '';
    pendingQuoteState = [];
  };

  (Array.isArray(parts) ? parts : []).forEach(part => {
    const value = String(part || '').trim();
    if (!value) return;

    if (!pendingText) {
      pendingText = value;
      pendingQuoteState = getAiQuoteBalanceState(value);
      if (!pendingQuoteState.length) flushPending();
      return;
    }

    pendingText = `${pendingText}${value}`;
    pendingQuoteState = getAiQuoteBalanceState(pendingText);
    if (!pendingQuoteState.length) flushPending();
  });

  flushPending();
  return merged;
}

function softenShortToneParticleEnding(text = '') {
  const value = String(text || '').trim();
  if (!value) return '';

  const normalizedValue = value.replace(/[“”"'‘’「」『』（）()【】\[\]\s]/g, '');
  const shortToneParticleRegex = /^(?:呵|哈|哈哈|嘿|哼|嗯|啊|呀|哦|唔|诶|欸|嗷|喔|行|好|行啊|好啊|好呀|是啊|对啊|对呀|嗯嗯|好哦|好喔|好耶|收到|知道了|明白了|可以|可以呀|可以啊|在|在呢|来了|来了呀|拜|拜拜|晚安|早安|安安|QAQ|qaq|QAQ|www|hhh|哈哈哈|嘿嘿|呜|呜呜|唉|诶嘿|欸嘿|呵呵|哈喽|好耶|欧克)$/i;
  if (!shortToneParticleRegex.test(normalizedValue)) return value;

  return value.replace(/([。\.])$/u, '').trim();
}

export function splitStrictSentenceBubbles(text) {
  const normalized = normalizeAiEllipsisText(stripAiProtocolClosingTags(String(text || '')))
    .replace(/\*\*`?\s*\[回复\]\s*[^：:\n`]+?\s*[：:]\s*/g, '')
    .replace(/`?\*\*/g, '')
    .replace(/\r\n/g, '\n')
    .trim();

  if (!normalized) return [];

  return mergeAiQuotedBubbleFragments(
    mergeAiPunctuationOnlyBubbleFragments(
      normalized
        .replace(/([。！？!?]+)(?:\s+|(?=\S))/g, '$1\n')
        .replace(/([…]{2,}|[.。]{3,}|、、、)(?:\s+|(?=\S))/g, '$1\n')
        .split(/\n+/)
        .map(item => softenShortToneParticleEnding(item))
        .filter(Boolean)
    )
  );
}

export function extractProtocolReplyContents(text) {
  return extractAiProtocolBlocks(text)
    .filter(block => block.type === '回复')
    .map(block => String(block.content || '').trim())
    .filter(Boolean);
}

/* ========================================================================
   [区域标注·已完成·本次修复·气泡数量范围计算]
   说明：
   1. 修复了 replyBubbleMax 为 falsy 时回退到 min 导致 max=min 的 bug。
   2. 现在 replyBubbleMax 缺失时使用独立默认值 15（与 UI 设置面板意图一致），
      不再错误地回退到 min，确保用户设定的气泡范围能正确生效。
   3. 同时对 replyBubbleMin 也使用独立默认值 1，避免互相依赖。
   ======================================================================== */
export function getReplyBubbleCountRange(chatSettings = {}) {
  const DEFAULT_MIN = 1;
  const DEFAULT_MAX = 15;
  const rawMin = Number(chatSettings.replyBubbleMin);
  const rawMax = Number(chatSettings.replyBubbleMax);
  const min = Math.max(1, Number.isFinite(rawMin) && rawMin >= 1 ? Math.floor(rawMin) : DEFAULT_MIN);
  const max = Math.max(min, Number.isFinite(rawMax) && rawMax >= 1 ? Math.floor(rawMax) : DEFAULT_MAX);
  return { min, max };
}

export function sanitizeAiVisibleReply(text) {
  let value = cleanAiVisibleBubbleText(text);

  const protocolReplyMatches = extractProtocolReplyContents(value);
  if (protocolReplyMatches.length) {
    value = protocolReplyMatches
      .map(item => cleanAiVisibleBubbleText(item))
      .filter(Boolean)
      .join('\n');
  }

  return value
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

export function splitSingleBubbleForCount(text) {
  const value = softenShortToneParticleEnding(cleanAiVisibleBubbleText(text));
  if (!value) return [];

  const sentenceParts = splitStrictSentenceBubbles(value);
  if (sentenceParts.length > 1) return sentenceParts;

  const spaceParts = value
    .split(/\s+/)
    .map(item => item.trim())
    .filter(Boolean);
  if (spaceParts.length > 1) return spaceParts;

  if (value.length <= 1) return [value];

  const splitAt = Math.max(1, Math.ceil(value.length / 2));
  return [
    value.slice(0, splitAt).trim(),
    value.slice(splitAt).trim()
  ].filter(Boolean);
}

export function splitAiReplyIntoBubbles(text, chatSettings = {}) {
  const raw = sanitizeAiVisibleReply(text);
  if (!raw) return ['（AI 没有返回内容）'];

  const { min, max } = getReplyBubbleCountRange(chatSettings);

  const protocolReplyMatches = extractProtocolReplyContents(raw);

  let parts = protocolReplyMatches.length
    ? protocolReplyMatches
    : raw
        .split(/\n{2,}|(?:\s*<bubble>\s*)|(?:\s*<\/bubble>\s*)|(?:\s*\|\|\|\s*)|(?:\s*---气泡---\s*)/i)
        .map(item => item.trim())
        .filter(Boolean);

  parts = parts
    .map(part => softenShortToneParticleEnding(cleanAiVisibleBubbleText(part)))
    .filter(Boolean)
    .flatMap(part => splitStrictSentenceBubbles(part));

  while (parts.length < min) {
    let bestIndex = -1;
    let bestParts = [];
    let bestLength = 0;

    parts.forEach((item, index) => {
      const candidateParts = splitSingleBubbleForCount(item);
      if (candidateParts.length <= 1) return;
      if (String(item || '').length > bestLength) {
        bestIndex = index;
        bestParts = candidateParts;
        bestLength = String(item || '').length;
      }
    });

    if (bestIndex < 0 || bestParts.length <= 1) break;
    parts.splice(bestIndex, 1, ...bestParts);
  }

  const cleaned = parts.map(item => cleanAiVisibleBubbleText(item)).filter(Boolean);
  return cleaned.length ? cleaned.slice(0, max) : ['（AI 没有返回内容）'];
}

export function enforceAiReplyMessageCount(messages, chatSettings = {}) {
  const { min, max } = getReplyBubbleCountRange(chatSettings);
  let normalizedMessages = Array.isArray(messages)
    ? messages
        .map(message => {
          if (!message) return null;
          /* [区域标注·已完成·AI拍一拍系统小字计数] 拍一拍是系统提示小字，不参与普通 AI 回复气泡数量修正。 */
          if (String(message.type || '') === 'ai_withdraw_system' || String(message.type || '') === 'ai_pat_system') return message;
          if (message.role !== 'assistant') return null;
          if (String(message.type || '') === 'sticker' && String(message.stickerUrl || '').trim()) {
            return message;
          }
          if (isTextImageMessage(message)) {
            return message;
          }
          if (isVoiceMessage(message)) {
            return message;
          }
          if (String(message.type || '') === 'transfer') {
            return message;
          }
          if (String(message.type || '') === 'gift') {
            return message;
          }
          if (String(message.type || '') === 'red_packet') {
            return message;
          }
          if (String(message.type || '') === 'takeaway') {
            return message;
          }
          if (String(message.type || '') === 'card' && String(message.cardHtml || message.content || '').trim()) {
            return message;
          }
          const content = cleanAiVisibleBubbleText(message.content);
          if (!content && message.quote && String(message.quote.text || '').trim()) {
            return { ...message, content: '' };
          }
          return content ? { ...message, content } : null;
        })
        .filter(Boolean)
    : [];

  while (normalizedMessages.length < min) {
    let bestIndex = -1;
    let bestParts = [];
    let bestLength = 0;

    normalizedMessages.forEach((message, index) => {
      if (String(message.type || '') === 'sticker' || String(message.type || '') === 'ai_withdraw_system' || String(message.type || '') === 'ai_pat_system' || isTextImageMessage(message) || isVoiceMessage(message) || String(message.type || '') === 'card' || String(message.type || '') === 'transfer' || String(message.type || '') === 'gift' || String(message.type || '') === 'red_packet' || String(message.type || '') === 'takeaway') return;
      const parts = splitSingleBubbleForCount(message.content);
      if (parts.length <= 1) return;
      const currentLength = String(message.content || '').length;
      if (currentLength > bestLength) {
        bestIndex = index;
        bestParts = parts;
        bestLength = currentLength;
      }
    });

    if (bestIndex < 0 || bestParts.length <= 1) break;

    const baseMessage = normalizedMessages[bestIndex];
    normalizedMessages.splice(
      bestIndex,
      1,
      ...bestParts.map(content => ({
        ...baseMessage,
        content
      }))
    );
  }

  const countableMessages = normalizedMessages.filter(message => !['ai_withdraw_system', 'ai_pat_system'].includes(String(message.type || '')));
  if (countableMessages.length > max) {
    let keptCountable = 0;
    normalizedMessages = normalizedMessages.filter(message => {
      if (String(message.type || '') === 'ai_withdraw_system' || String(message.type || '') === 'ai_pat_system') return true;
      keptCountable += 1;
      return keptCountable <= max;
    });
  }

  return normalizedMessages.length
    ? normalizedMessages
    : [{ role: 'assistant', content: '（AI 没有返回内容）' }];
}

/* ======================================================================== */
/* 引用解析 */
/* ======================================================================== */
function normalizeAiQuoteLookupText(value = '') {
  return cleanAiVisibleBubbleText(value)
    .replace(/^[›>]\s*/, '')
    .replace(/^引用(?:了|自)?\s*[^：:「“"'\n]{0,40}\s*[：:]\s*/i, '')
    .replace(/[「」“”"'‘’]/g, '')
    .replace(/\s+/g, '')
    .trim();
}

function splitLooseAiQuoteBody(body = '') {
  const value = String(body || '').trim();
  if (!value) return { quoteText: '', replyText: '' };

  const firstChar = value.charAt(0);
  const quotePairs = {
    '“': '”',
    '‘': '’',
    '"': '"',
    "'": "'",
    '「': '」'
  };

  if (quotePairs[firstChar]) {
    const closeChar = quotePairs[firstChar];
    const closeIndex = value.indexOf(closeChar, 1);
    if (closeIndex > 0) {
      return {
        quoteText: value.slice(1, closeIndex).trim(),
        replyText: cleanAiVisibleBubbleText(value.slice(closeIndex + 1).replace(/^[\s：:，,。；;\-—]+/, ''))
      };
    }

    return {
      quoteText: value.slice(1).replace(/[”’"'}」]+$/g, '').trim(),
      replyText: ''
    };
  }

  const lines = value.split(/\n+/).map(item => item.trim()).filter(Boolean);
  if (lines.length > 1) {
    return {
      quoteText: lines[0].replace(/[”’"'}」]+$/g, '').trim(),
      replyText: cleanAiVisibleBubbleText(lines.slice(1).join('\n'))
    };
  }

  return {
    quoteText: value.replace(/[”’"'}」]+$/g, '').trim(),
    replyText: ''
  };
}

function parseLooseAiQuoteText(raw = '', fallbackSenderName = '') {
  const text = cleanAiProtocolBlockContent(raw)
    .replace(/^[›>]\s*/, '')
    .trim();
  if (!/引用/.test(text)) return null;

  const withoutProtocol = text.replace(/^(?:\[\s*引用\s*\]\s*)/i, '').trim();
  const quoteIdMatch = withoutProtocol.match(/\{\s*引用\s*ID\s*[：:]\s*([^}；;，,\s]+)\s*\}\s*([\s\S]*)$/i);
  if (quoteIdMatch) {
    return {
      quoteId: String(quoteIdMatch[1] || '').trim(),
      senderName: String(fallbackSenderName || '').trim(),
      quoteText: '',
      replyText: cleanAiVisibleBubbleText(quoteIdMatch[2])
    };
  }

  const colonMatch = withoutProtocol.match(/^(?:引用(?:了|自)?\s*)?([^：:「“"'\n]{0,40})\s*[：:]\s*([\s\S]*)$/i);
  if (!colonMatch) return null;

  const senderName = String(colonMatch[1] || fallbackSenderName || '')
    .replace(/^引用(?:了|自)?\s*/i, '')
    .trim();
  const { quoteText, replyText } = splitLooseAiQuoteBody(colonMatch[2]);
  if (!quoteText && !replyText) return null;

  return {
    quoteId: '',
    senderName,
    quoteText,
    replyText
  };
}

function resolveAiQuotePayloadByLooseText(state, quoteText = '', senderName = '', sourceMessageId = '') {
  const targetText = String(quoteText || '').trim();
  if (!targetText) return null;

  const session = state.sessions?.find?.(item => String(item.id) === String(state.currentChatId)) || {};
  const normalizedTarget = normalizeAiQuoteLookupText(targetText);
  const messages = Array.isArray(state.currentMessages) ? state.currentMessages : [];

  for (const message of [...messages].reverse()) {
    if (sourceMessageId && String(message?.id || '') === String(sourceMessageId)) continue;

    const payload = createQuotePayloadFromMessage(message, session, state.profile || {});
    const payloadText = String(payload?.text || '').trim();
    const normalizedPayloadText = normalizeAiQuoteLookupText(payloadText);
    const payloadSender = String(payload?.senderName || '').trim();
    const safeSender = String(senderName || '').trim();

    const textMatched = normalizedTarget
      && normalizedPayloadText
      && (normalizedPayloadText.includes(normalizedTarget) || normalizedTarget.includes(normalizedPayloadText));
    const senderMatched = !safeSender || !payloadSender || payloadSender.includes(safeSender) || safeSender.includes(payloadSender);

    if (textMatched && senderMatched) return payload;
  }

  const syntheticText = targetText.replace(/\s+/g, ' ').trim();
  return syntheticText
    ? {
        id: '',
        role: 'assistant',
        senderName: String(senderName || session?.name || '对方').trim() || '对方',
        text: syntheticText.length > 86 ? `${syntheticText.slice(0, 86)}…` : syntheticText,
        type: 'text',
        timestamp: 0
      }
    : null;
}

export function resolveAiQuotePayloadById(state, quoteId = '') {
  const targetId = String(quoteId || '').trim();
  if (!targetId) return null;
  const session = state.sessions?.find?.(item => String(item.id) === String(state.currentChatId)) || {};
  const message = (state.currentMessages || []).find(item => String(item.id) === targetId);
  return message ? createQuotePayloadFromMessage(message, session, state.profile || {}) : null;
}

/* ======================================================================== */
/* 消息格式修复 */
/* ======================================================================== */
export function repairAiTextMessageFormatIfPossible(message) {
  if (!message || message.role !== 'assistant') return null;
  if (['sticker', 'image', 'transfer', 'gift', 'red_packet', 'takeaway'].includes(String(message.type || ''))) return null;

  const before = String(message.content || '');
  const protocolBlocks = extractAiProtocolBlocks(before).filter(block => block.type === '回复');
  const protocolText = protocolBlocks
    .map(block => cleanAiVisibleBubbleText(block.content))
    .filter(Boolean)
    .join('\n');

  const after = cleanAiVisibleBubbleText(protocolText || before)
    .replace(/^\s*(?:以下是)?(?:修正后内容|最终输出|回复格式|检查结果|修正结果|正确格式)\s*[：:]\s*/i, '')
    .replace(/^\s*(?:\*\*)?\s*`?\s*\[\s*回复\s*\]\s*[^：:\n`*]+?\s*[：:]\s*/i, '')
    .replace(/^\s*(?:回复|文字|文本)\s*[：:]\s*/i, '')
    .replace(/(?:`|\*\*)+/g, '')
    .trim();

  if (!after || after === before.trim()) return null;
  return {
    ...message,
    type: '',
    content: after,
    quote: message.quote || null
  };
}

export function repairAiQuoteMessageFormatIfPossible(message, state) {
  if (!message || message.role !== 'assistant') return null;
  if (['sticker', 'image', 'transfer', 'gift', 'red_packet', 'takeaway'].includes(String(message.type || ''))) return null;

  const raw = String(message.content || '').trim();
  const quoteMatch = raw.match(/(?:\[\s*引用\s*\]\s*[^：:\n`*]+?\s*[：:]\s*)?\{\s*引用\s*ID\s*[：:]\s*([^}；;，,\s]+)\s*\}\s*([\s\S]*)$/i);
  const looseQuote = quoteMatch ? null : parseLooseAiQuoteText(raw);
  if (!quoteMatch && !looseQuote) return null;

  const quotePayload = quoteMatch
    ? resolveAiQuotePayloadById(state, quoteMatch[1])
    : resolveAiQuotePayloadByLooseText(state, looseQuote.quoteText, looseQuote.senderName, message.id);
  const replyText = cleanAiVisibleBubbleText(quoteMatch ? quoteMatch[2] : looseQuote.replyText);
  if (!quotePayload) return null;

  return {
    ...message,
    type: '',
    content: replyText,
    quote: quotePayload
  };
}

export function repairAiVoiceMessageFormatIfPossible(message) {
  if (!message || message.role !== 'assistant') return null;
  if (isVoiceMessage(message)) return null;
  if (['sticker', 'image', 'transfer', 'gift', 'card', 'red_packet', 'takeaway'].includes(String(message.type || ''))) return null;

  const raw = String(message.content || message.voiceText || '').trim();
  if (!/(?:\[\s*语音\s*\]|【\s*语音\s*】)/i.test(raw)) return null;

  const voiceBlocks = extractAiProtocolBlocks(raw).filter(block => block.type === '语音');
  const payload = voiceBlocks
    .map(block => parseAiVoiceProtocolPayload(block.content))
    .find(Boolean)
    || parseAiVoiceProtocolPayload(raw);

  if (!payload) return null;

  return {
    ...message,
    role: 'assistant',
    type: 'voice_message',
    voiceExpanded: false,
    ...payload
  };
}

export function repairAiAsideMessageFormatIfPossible(message) {
  if (!message || message.role !== 'assistant') return null;
  if (['sticker', 'image', 'transfer', 'gift', 'card', 'red_packet', 'takeaway'].includes(String(message.type || ''))) return null;

  const raw = String(message.content || '').trim();
  if (!/旁白/i.test(raw)) return null;

  const { asideText, asideSegments, cleanedText } = extractAsideFromRawText(raw);
  const normalizedSegments = (Array.isArray(asideSegments) ? asideSegments : [])
    .map((segment, index) => ({
      id: String(segment?.id || `${message.id || 'aside_repair'}_${index + 1}`),
      text: String(segment?.text || '').trim(),
      placement: 'before'
    }))
    .filter(segment => segment.text);

  if (!asideText || !normalizedSegments.length) return null;

  return {
    ...message,
    role: 'assistant',
    type: '',
    content: cleanAiVisibleBubbleText(cleanedText || ''),
    asideText,
    asideSegments: normalizedSegments
  };
}

export function repairAiSystemTipFormatIfPossible(message) {
  if (!message || String(message.type || '') !== 'ai_withdraw_system') return null;
  const withdrawnText = String(message.withdrawnContent || message.aiVisibleWithdrawnSummary || '').trim();
  if (!withdrawnText) return null;
  const roleName = String(message.withdrawnRoleName || '').trim() || '对方';
  return {
    ...message,
    role: 'user',
    type: 'ai_withdraw_system',
    content: `${roleName} 撤回了一条消息`,
    withdrawnContent: withdrawnText,
    aiVisibleWithdrawnSummary: withdrawnText,
    withdrawnRoleName: roleName
  };
}

/* ======================================================================== */
/* 回显去除 */
/* ======================================================================== */
function normalizeCurrentUserEchoCompareText(value = '') {
  return String(value || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<\/?think>/gi, '')
    .replace(/[`*_]/g, '')
    .replace(/[“”"'‘’「」『』《》〈〉（）()【】\[\]{}]/g, '')
    .replace(/[\s\u3000]+/g, '')
    .replace(/[，,。.!！？?、；;：:~～…\-—]/g, '')
    .toLowerCase()
    .trim();
}

function getCurrentUserRoundComparableTexts(currentUserRoundMessages = []) {
  return (Array.isArray(currentUserRoundMessages) ? currentUserRoundMessages : [])
    .filter(message => String(message?.role || '') === 'user' && !String(message?.type || '').trim())
    .map(message => {
      const raw = String(message?.content || '').trim();
      const normalized = normalizeCurrentUserEchoCompareText(raw);
      return raw && normalized ? { raw, normalized } : null;
    })
    .filter(Boolean)
    .sort((a, b) => (b.normalized.length - a.normalized.length) || (b.raw.length - a.raw.length));
}

function stripLeadingCurrentUserEchoFromAiText(aiText = '', currentUserTexts = []) {
  const sourceText = String(aiText || '').trim();
  const comparableTexts = Array.isArray(currentUserTexts) ? currentUserTexts : [];
  if (!sourceText || !comparableTexts.length) return sourceText;

  const getLeadingEchoCutIndex = (text, comparable) => {
    const targetNormalized = String(comparable?.normalized || '').trim();
    if (!targetNormalized) return -1;

    let collected = '';
    for (let index = 0; index < text.length; index += 1) {
      const normalizedChar = normalizeCurrentUserEchoCompareText(text.charAt(index));
      if (!normalizedChar) continue;

      collected += normalizedChar;
      if (!targetNormalized.startsWith(collected)) return -1;

      if (collected === targetNormalized) {
        let cutIndex = index + 1;
        const trailingMatch = text
          .slice(cutIndex)
          .match(/^[\s\u3000，,。.!！？?、；;：:~～…\-—"'“”‘’「」『』《》〈〉（）()【】\[\]{}]+/);
        if (trailingMatch) cutIndex += trailingMatch[0].length;
        return cutIndex;
      }
    }

    return -1;
  };

  let remaining = sourceText;
  let previousText = '';

  while (remaining && remaining !== previousText) {
    previousText = remaining;
    let matchedCutIndex = -1;

    comparableTexts.forEach(item => {
      const currentCutIndex = getLeadingEchoCutIndex(remaining, item);
      if (currentCutIndex > matchedCutIndex) matchedCutIndex = currentCutIndex;
    });

    if (matchedCutIndex < 0) break;
    remaining = remaining.slice(matchedCutIndex).trim();
  }

  return remaining;
}

export function filterCurrentUserRoundEchoFromAiMessages(aiMessages = [], currentUserRoundMessages = []) {
  const messages = Array.isArray(aiMessages) ? aiMessages : [];
  const currentUserTexts = getCurrentUserRoundComparableTexts(currentUserRoundMessages);
  if (!currentUserTexts.length) return messages;

  return messages.reduce((list, message) => {
    if (!message || String(message?.role || '') !== 'assistant') {
      list.push(message);
      return list;
    }

    if (String(message?.type || '').trim()) {
      list.push(message);
      return list;
    }

    const originalText = String(message?.content || '').trim();
    if (!originalText) {
      list.push(message);
      return list;
    }

    const normalizedOriginalText = normalizeCurrentUserEchoCompareText(originalText);
    if (currentUserTexts.some(item => item.normalized === normalizedOriginalText)) {
      return list;
    }

    const strippedText = stripLeadingCurrentUserEchoFromAiText(originalText, currentUserTexts);
    if (!strippedText) {
      return list;
    }

    list.push(strippedText === originalText ? message : { ...message, content: strippedText });
    return list;
  }, []);
}

/* ======================================================================== */
/* 协议块解析 */
/* ======================================================================== */
export function parseAiTransferProtocolPayload(content) {
  const normalized = cleanAiProtocolBlockContent(content);
  if (!normalized) return null;

  const bodyMatch = normalized.match(/\{\s*([\s\S]*?)\s*\}/);
  const body = bodyMatch ? String(bodyMatch[1] || '').trim() : normalized;
  if (!body) return null;

  const amountMatch = body.match(/金额\s*[：:]\s*([0-9]+(?:\.[0-9]{1,2})?)/i);
  if (!amountMatch) return null;

  const amount = Number(amountMatch[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const noteMatch = body.match(/备注\s*[：:]\s*([^}]*)/i);
  const transferNote = String(noteMatch?.[1] || '').trim();

  return {
    transferAmount: Number(amount.toFixed(2)),
    transferBaseCny: Number(amount.toFixed(2)),
    transferCurrency: 'CNY',
    transferDisplayAmount: `¥${amount.toFixed(2)}`,
    transferNote,
    content: `¥${amount.toFixed(2)}`
  };
}

/* ========================================================================
   [区域标注·本次修改] 解析 AI 发送红包协议
   说明：
   1. 解析格式：{金额:xxx,备注:xxx}
   2. 成功后返回红包特定的有效载荷
   ======================================================================== */
/* ========================================================================
   [区域标注·已完成·红包协议字段对齐修复]
   说明：
   1. 统一把 AI 红包协议解析结果输出为 redPacket* 字段，供消息卡片、弹窗与会话摘要直接读取。
   2. 保留 amount / remark 兼容字段，避免影响现有调用链。
   3. 不使用 localStorage/sessionStorage，不增加任何双份兜底存储。
   ======================================================================== */
export function parseAiRedPacketProtocolPayload(content) {
  const normalized = cleanAiProtocolBlockContent(content);
  if (!normalized) return null;

  const bodyMatch = normalized.match(/\{\s*([\s\S]*?)\s*\}/);
  const body = bodyMatch ? String(bodyMatch[1] || '').trim() : normalized;
  if (!body) return null;

  const amountMatch = body.match(/金额\s*[：:]\s*([0-9]+(?:\.[0-9]{1,2})?)/i);
  if (!amountMatch) return null;

  const amount = Number(amountMatch[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const noteMatch = body.match(/备注\s*[：:]\s*([^}]*)/i);
  const note = String(noteMatch?.[1] || '').trim() || '恭喜发财，大吉大利';
  const normalizedAmount = Number(amount.toFixed(2));
  const redPacketDisplayAmount = `¥${normalizedAmount.toFixed(2)}`;

  return {
    amount: normalizedAmount,
    remark: note,
    redPacketAmount: normalizedAmount,
    redPacketBaseCny: normalizedAmount,
    redPacketDisplayAmount,
    redPacketCurrency: 'CNY',
    redPacketNote: note,
    redPacketPayer: '对方',
    redPacketDirection: 'incoming',
    redPacketStatus: 'pending',
    content: `[红包] ${note}${redPacketDisplayAmount ? ` · ${redPacketDisplayAmount}` : ''}`
  };
}

export function parseAiTakeawayProtocolPayload(content) {
  const normalized = cleanAiProtocolBlockContent(content);
  if (!normalized) return null;

  const bodyMatch = normalized.match(/\{\s*([\s\S]*?)\s*\}/);
  const body = bodyMatch ? String(bodyMatch[1] || '').trim() : normalized;
  if (!body) return null;

  const actionMatch = body.match(/操作\s*[：:]\s*([^}，,;；]+)/i);
  if (actionMatch && actionMatch[1].trim() === '确认代付') {
    const idMatch = body.match(/外卖ID\s*[：:]\s*([^}，,;；]+)/i);
    return {
      takeawayAction: 'confirm_pay',
      takeawayId: idMatch ? idMatch[1].trim() : '',
      content: `[确认代付]`
    };
  }

  const nameMatch = body.match(/名称\s*[：:]\s*([^}，,;；]+)/i);
  if (!nameMatch) return null;
  const name = nameMatch[1].trim();

  const noteMatch = body.match(/备注\s*[：:]\s*([^}]*)/i);
  const takeawayNote = String(noteMatch?.[1] || '').trim();

  const priceMatch = body.match(/价格\s*[：:]\s*([0-9]+(?:\.[0-9]{1,2})?)/i);
  if (!priceMatch) return null;

  const price = Number(priceMatch[1]);
  if (!Number.isFinite(price) || price <= 0) return null;

  return {
    takeawayAction: 'order',
    takeawayTitle: name,
    takeawayPrice: Number(price.toFixed(2)),
    takeawayBaseCny: Number(price.toFixed(2)),
    takeawayCurrency: 'CNY',
    takeawayDisplayPrice: `¥${price.toFixed(2)}`,
    takeawayNote,
    content: `¥${price.toFixed(2)}`
  };
}

function parseProtocolRoleAndContent(raw = '', type = '') {
  const text = cleanAiProtocolBlockContent(raw);
  if (!text) return { roleName: '', content: '' };

  const typeName = String(type || '').trim();

  if (typeName === '引用' && /^\s*\{\s*引用\s*ID\s*[：:]/i.test(text)) {
    return { roleName: '', content: text };
  }

  const roleAndContentMatch = text.match(/^([^：:\n`*]{1,40})\s*[：:]\s*([\s\S]*)$/);
  if (roleAndContentMatch) {
    const roleName = String(roleAndContentMatch[1] || '').trim();
    const content = cleanAiProtocolBlockContent(roleAndContentMatch[2] || '');
    if (roleName) return { roleName, content };
  }

  return { roleName: '', content: text };
}

/* ========================================================================
   [区域标注·已完成·本次修改·AI拍一拍趣味系统小字协议]
   说明：
   1. 解析 AI 输出的 **`[拍一拍] 角色名：身体部位｜短趣味补充`** 协议。
   2. 已支持“身体部位｜短趣味补充”显示为：角色名拍了拍你的身体部位 + 短趣味文案。
   3. 这里只做运行时消息对象转换；最终持久化仍由上层统一写入 DB.js / IndexedDB。
   4. 不使用 localStorage/sessionStorage，不新增双份存储兜底，不使用原生浏览器弹窗。
   ======================================================================== */
function parseAiPatDisplayPayload(content = '') {
  const text = cleanAiProtocolBlockContent(content)
    .replace(/^\{\s*(?:身体部位|部位)\s*[：:]\s*/i, '')
    .replace(/\s*\}\s*$/g, '')
    .replace(/^(?:拍一拍|拍拍|戳一戳|戳戳)\s*[：:]\s*/i, '')
    .replace(/^(?:拍了拍|拍拍|戳了戳|戳戳)\s*(?:你|你的|妳|妳的)?/i, '')
    .replace(/^(?:你|你的|妳|妳的)\s*/i, '')
    .split(/\n+/)[0]
    .replace(/^[`*_#"“”'《》（）()【】\[\]{}]+|[`*_#"“”'《》（）()【】\[\]{}]+$/g, '')
    .replace(/[，,。.!！？?；;：:~～…\s]+$/g, '')
    .trim();

  if (!text) return null;

  const [rawBodyPart, ...rawExtraParts] = text.split(/[|｜]/);
  const bodyPart = String(rawBodyPart || '')
    .replace(/[，,。.!！？?；;：:~～…\s]+$/g, '')
    .trim();
  if (!bodyPart) return null;
  if (/[。！？!?；;]|(?:回复|消息|屏幕|手机|桌子|空气|快点|解释|因为|然后|顺便)/i.test(bodyPart)) return null;

  const extraText = rawExtraParts
    .join('｜')
    .replace(/^[，,。.!！？?；;\s]+/g, '')
    .replace(/[。.!！\s]+$/g, '')
    .trim();
  const safeExtraText = extraText.length > 36 ? '' : extraText;
  const extraPrefix = /^说\s*[：:]/.test(safeExtraText) ? '，' : '';

  return {
    bodyPart,
    extraText: safeExtraText,
    displayText: `${bodyPart}${safeExtraText ? `${extraPrefix}${safeExtraText}` : ''}`
  };
}

function createAiPatSystemMessageFromProtocol(block = {}) {
  const roleName = String(block?.roleName || '').trim() || '对方';
  const patPayload = parseAiPatDisplayPayload(block?.content || '');
  if (!patPayload) return null;

  return {
    role: 'user',
    type: 'ai_pat_system',
    content: `${roleName}拍了拍你的${patPayload.displayText}`,
    patRoleName: roleName,
    patBodyPart: patPayload.bodyPart,
    patExtraText: patPayload.extraText,
    __protocolOrder: getAiRuntimeProtocolOrder(block, 0),
    __protocolEndIndex: block.__protocolEndIndex
  };
}

export function extractAiProtocolBlocks(rawText) {
  const visibleText = stripAiProtocolClosingTags(String(rawText || ''))
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<\/?think>/gi, '')
    .trim();
  if (!visibleText) return [];

  const markerRegex = /(?:\*\*)?\s*`?\s*(?:\[\s*(回复|表情|转账|礼物|红包|外卖|引用|撤回|拍一拍|语音|文字图|图片|卡片)\s*\]|【\s*(语音|文字图)\s*】)\s*/g;
  const matches = [...visibleText.matchAll(markerRegex)];
  if (!matches.length) return [];

  return matches
    .map((match, index) => {
      const nextMatch = matches[index + 1];
      const contentStart = Number(match.index || 0) + String(match[0] || '').length;
      const contentEnd = nextMatch ? Number(nextMatch.index || visibleText.length) : visibleText.length;
      const type = String(match[1] || match[2] || '').trim();
      const parsed = parseProtocolRoleAndContent(visibleText.slice(contentStart, contentEnd), type);
      return {
        type,
        roleName: parsed.roleName,
        content: parsed.content,
        __protocolOrder: Number(match.index || 0) || 0,
        __protocolEndIndex: contentEnd,
        __protocolIndex: index
      };
    })
    .filter(item => item.type && item.content);
}

/* ======================================================================== */
/* 旁白绑定 */
/* ======================================================================== */
export function bindAsideSegmentsToAiMessages(aiMessages = [], asideSegments = [], displayMode = 'top', rawTextWithAside = '') {
  const messages = Array.isArray(aiMessages) ? aiMessages.map(message => ({ ...message })) : [];
  const segments = (Array.isArray(asideSegments) ? asideSegments : [])
    .map((segment, index) => ({
      id: String(segment?.id || `aside_segment_${index + 1}`),
      text: String(segment?.text || '').trim(),
      startIndex: Number(segment?.startIndex || 0) || 0,
      endIndex: Number(segment?.endIndex || segment?.startIndex || 0) || 0
    }))
    .filter(segment => segment.text);

  if (!messages.length || !segments.length) return messages;

  const attachSegment = (messageIndex, segment, placement = 'before') => {
    const index = Math.max(0, Math.min(messages.length - 1, Number(messageIndex || 0) || 0));
    const target = messages[index];
    const normalizedPlacement = placement === 'after' ? 'after' : 'before';
    const nextSegment = {
      id: `${segment.id}_${normalizedPlacement}`,
      text: segment.text,
      placement: normalizedPlacement
    };
    target.asideSegments = [...(Array.isArray(target.asideSegments) ? target.asideSegments : []), nextSegment];
    target.asideText = getAsideSegmentsFromMessage(target).map(item => item.text).join('\n');
  };

  const firstAssistantIndex = messages.findIndex(message => message?.role === 'assistant');
  const safeFirstIndex = firstAssistantIndex >= 0 ? firstAssistantIndex : 0;

  if (String(displayMode || 'top') !== 'interleave') {
    segments.forEach(segment => attachSegment(safeFirstIndex, segment, 'before'));
    return messages;
  }

  const source = String(rawTextWithAside || '');
  const protocolMarkerRegex = /(?:\*\*)?\s*`?\s*(?:\[\s*(回复|表情|转账|礼物|红包|外卖|引用|撤回|拍一拍|语音|文字图|图片|卡片)\s*\]|【\s*(语音|文字图)\s*】)\s*/g;
  const protocolMarkers = [...source.matchAll(protocolMarkerRegex)]
    .map(match => Number(match.index || 0))
    .sort((a, b) => a - b);

  if (!protocolMarkers.length) {
    segments.forEach((segment, index) => attachSegment(Math.min(index, messages.length - 1), segment, 'before'));
    return messages;
  }

  segments.forEach(segment => {
    const markersBefore = protocolMarkers.filter(position => position < segment.startIndex).length;
    if (markersBefore >= messages.length) {
      attachSegment(messages.length - 1, segment, 'after');
      return;
    }
    attachSegment(markersBefore, segment, 'before');
  });

  return messages;
}

/* ======================================================================== */
/* AI 回复消息构建 */
/* ======================================================================== */
export function buildAiReplyMessages(rawText, state, options = {}) {
  const textImageProtocolEnabled = Boolean(options.textImageProtocolEnabled);

  const htmlCardFeatureEnabled = Boolean(state?.chatPromptSettings?.htmlCardEnabled);
  const protocolBlocks = extractAiProtocolBlocks(rawText);
  const detectedHtmlCardBlocks = extractHtmlCardProtocolBlocks(rawText);
  const htmlCardBlocks = htmlCardFeatureEnabled ? detectedHtmlCardBlocks : [];
  if (!protocolBlocks.length && !htmlCardBlocks.length) {
    if (/(?:\[\s*语音\s*\]|【\s*语音\s*】)/i.test(String(rawText || ''))) {
      const voicePayload = parseAiVoiceProtocolPayload(rawText);
      if (voicePayload) {
        return enforceAiReplyMessageCount([{
          role: 'assistant',
          type: 'voice_message',
          voiceExpanded: false,
          ...voicePayload
        }], state.chatPromptSettings);
      }
    }

    if (textImageProtocolEnabled && /(?:\[\s*文字图\s*\]|【\s*文字图\s*】)/i.test(String(rawText || ''))) {
      const textImageMessage = createAiTextImageMessageFromProtocol(rawText);
      if (textImageMessage) {
        return enforceAiReplyMessageCount([textImageMessage], state.chatPromptSettings);
      }
    }

    const repairedSticker = findLooseStickerTargetFromText(rawText, state);
    if (repairedSticker) {
      return enforceAiReplyMessageCount([{
        role: 'assistant',
        type: 'sticker',
        content: `[表情包] ${repairedSticker.name}`,
        stickerId: repairedSticker.id,
        stickerName: repairedSticker.name,
        stickerUrl: repairedSticker.url
      }], state.chatPromptSettings);
    }

    return enforceAiReplyMessageCount(
      splitAiReplyIntoBubbles(rawText, state.chatPromptSettings).map(content => ({
        role: 'assistant',
        content
      })),
      state.chatPromptSettings
    );
  }

  const builtMessages = [];
  const skippedProtocolIndexes = new Set();
  let hasImageGenerationProtocol = false;
  let hasHtmlCardProtocol = false;
  protocolBlocks.forEach((block, blockIndex) => {
    if (skippedProtocolIndexes.has(Number(block?.__protocolIndex ?? blockIndex))) return;
    if (block.type === '撤回') {
      const body = cleanAiProtocolBlockContent(block.content);
      const countMatch = body.match(/条数\s*[：:]\s*(\d+)/i);
      const targetAll = /目标\s*[：:]\s*(全部|所有|all)/i.test(body);
      const countFromBody = Math.max(1, Math.floor(Number(countMatch?.[1] || 1)) || 1);
      const requestedWithdrawCount = targetAll
        ? builtMessages.filter(message => message?.role === 'assistant').length
        : countFromBody;
      const roleName = String(block.roleName || '').trim() || '对方';

      for (let i = 0; i < requestedWithdrawCount; i += 1) {
        const withdrawIndex = builtMessages
          .map((message, index) => ({ message, index }))
          .reverse()
          .find(item => item.message?.role === 'assistant')?.index;

        if (withdrawIndex === undefined) break;

        const [removedMessage] = builtMessages.splice(withdrawIndex, 1);
        const withdrawnText = String(
          removedMessage.type === 'sticker'
            ? `[表情包] ${removedMessage.stickerName || removedMessage.content || ''}`
            : (removedMessage.type === 'transfer'
                ? `[转账] ${removedMessage.transferDisplayAmount || removedMessage.content || ''}`
                : (removedMessage.type === 'gift'
                    ? getGiftMessageDisplayText(removedMessage)
                    : (removedMessage.content || '')))
        ).trim();
        if (!withdrawnText) continue;

        builtMessages.push({
          role: 'user',
          type: 'ai_withdraw_system',
          content: `${roleName} 撤回了一条消息`,
          withdrawnContent: withdrawnText,
          aiVisibleWithdrawnSummary: withdrawnText,
          withdrawnRoleName: roleName,
          __protocolOrder: getAiRuntimeProtocolOrder(block, builtMessages.length),
          __protocolEndIndex: block.__protocolEndIndex
        });
      }
      return;
    }

    if (block.type === '拍一拍') {
      const patMessage = createAiPatSystemMessageFromProtocol(block);
      if (patMessage) builtMessages.push(patMessage);
      return;
    }

    if (block.type === '表情') {
      const sticker = resolveStickerProtocolTarget(block.content, state) || findLooseStickerTargetFromText(block.content, state);
      if (sticker) {
        builtMessages.push({
          role: 'assistant',
          type: 'sticker',
          content: `[表情包] ${sticker.name}`,
          stickerId: sticker.id,
          stickerName: sticker.name,
          stickerUrl: sticker.url,
          __protocolOrder: getAiRuntimeProtocolOrder(block, builtMessages.length),
          __protocolEndIndex: block.__protocolEndIndex
        });
      }
      return;
    }

    if (block.type === '语音') {
      const voiceMessage = createAiVoiceMessageFromProtocol(block);
      if (voiceMessage) {
        builtMessages.push({
          ...voiceMessage,
          __protocolOrder: getAiRuntimeProtocolOrder(block, builtMessages.length),
          __protocolEndIndex: block.__protocolEndIndex
        });
      }
      return;
    }

    if (block.type === '文字图') {
      if (textImageProtocolEnabled) {
        const textImageMessage = createAiTextImageMessageFromProtocol(block.content);
        if (textImageMessage) {
          builtMessages.push({
            ...textImageMessage,
            __protocolOrder: getAiRuntimeProtocolOrder(block, builtMessages.length),
            __protocolEndIndex: block.__protocolEndIndex
          });
        }
      }
      return;
    }

    if (block.type === '图片') {
      hasImageGenerationProtocol = true;
      return;
    }

    if (block.type === '转账') {
      const transferPayload = parseAiTransferProtocolPayload(block.content);
      if (transferPayload) {
        builtMessages.push({
          role: 'assistant',
          type: 'transfer',
          transferDirection: 'incoming',
          transferStatus: 'pending',
          transferCounterpartyName: String(block.roleName || '').trim(),
          ...transferPayload,
          __protocolOrder: getAiRuntimeProtocolOrder(block, builtMessages.length),
          __protocolEndIndex: block.__protocolEndIndex
        });
      }
      return;
    }

    if (block.type === '礼物') {
      const giftMessage = createAiGiftMessageFromProtocol(block);
      if (giftMessage) {
        builtMessages.push({
          ...giftMessage,
          __protocolOrder: getAiRuntimeProtocolOrder(block, builtMessages.length),
          __protocolEndIndex: block.__protocolEndIndex
        });
      }
      return;
    }

    if (block.type === '红包') {
      const redPacketPayload = parseAiRedPacketProtocolPayload(block.content);
      if (redPacketPayload) {
        builtMessages.push({
          role: 'assistant',
          type: 'red_packet',
          redPacketStatus: 'pending',
          ...redPacketPayload,
          redPacketPayer: String(block.roleName || '').trim() || redPacketPayload.redPacketPayer || '对方',
          __protocolOrder: getAiRuntimeProtocolOrder(block, builtMessages.length),
          __protocolEndIndex: block.__protocolEndIndex
        });
      }
      return;
    }

    if (block.type === '外卖') {
      const takeawayPayload = parseAiTakeawayProtocolPayload(block.content);
      if (takeawayPayload) {
        builtMessages.push({
          role: 'assistant',
          type: 'takeaway',
          takeawayStatus: 'pending',
          ...takeawayPayload,
          __protocolOrder: getAiRuntimeProtocolOrder(block, builtMessages.length),
          __protocolEndIndex: block.__protocolEndIndex
        });
      }
      return;
    }

    if (block.type === '引用') {
      const quoteMatch = String(block.content || '').match(/^\s*\{\s*引用\s*ID\s*[：:]\s*([^}；;，,\s]+)\s*\}\s*([\s\S]*)$/i);
      const looseQuote = quoteMatch ? null : parseLooseAiQuoteText(block.content, block.roleName);
      const quotePayload = quoteMatch
        ? resolveAiQuotePayloadById(state, quoteMatch[1])
        : (looseQuote ? resolveAiQuotePayloadByLooseText(state, looseQuote.quoteText, looseQuote.senderName) : null);

      let replyText = cleanAiVisibleBubbleText(quoteMatch ? quoteMatch[2] : (looseQuote ? looseQuote.replyText : block.content));

      if (!replyText) {
        const nextBlock = protocolBlocks[blockIndex + 1];
        if (nextBlock?.type === '回复') {
          const nextReplyText = cleanAiVisibleBubbleText(nextBlock.content);
          if (nextReplyText) {
            replyText = nextReplyText;
            skippedProtocolIndexes.add(Number(nextBlock?.__protocolIndex ?? (blockIndex + 1)));
          }
        }
      }

      const replyParts = splitStrictSentenceBubbles(replyText);

      if (quotePayload && !replyParts.length) {
        builtMessages.push({
          role: 'assistant',
          content: '',
          quote: quotePayload,
          __protocolOrder: getAiRuntimeProtocolOrder(block, builtMessages.length),
          __protocolEndIndex: block.__protocolEndIndex
        });
        return;
      }

      replyParts.forEach((content, replyIndex) => {
        builtMessages.push({
          role: 'assistant',
          content,
          ...(quotePayload ? { quote: quotePayload } : {}),
          __protocolOrder: getAiRuntimeProtocolOrder(block, builtMessages.length) + replyIndex / 1000,
          __protocolEndIndex: block.__protocolEndIndex
        });
      });
      return;
    }

    if (block.type === '卡片') return;

    splitStrictSentenceBubbles(cleanAiVisibleBubbleText(block.content)).forEach((content, replyIndex) => {
      builtMessages.push({
        role: 'assistant',
        content,
        __protocolOrder: getAiRuntimeProtocolOrder(block, builtMessages.length) + replyIndex / 1000,
        __protocolEndIndex: block.__protocolEndIndex
      });
    });
  });

  if (htmlCardBlocks.length) {
    hasHtmlCardProtocol = true;
    htmlCardBlocks.forEach((block, index) => {
      const safeHtml = String(block?.html || '').trim();
      if (!safeHtml) return;
      builtMessages.push({
        role: 'assistant',
        type: 'card',
        content: `[HTML卡片] ${String(block?.roleName || '').trim() || '互动卡片'}`,
        cardRoleName: String(block?.roleName || '').trim(),
        cardTitle: `${String(block?.roleName || '').trim() || '互动'}的卡片`,
        cardHtml: safeHtml,
        cardOrder: index,
        __protocolOrder: Number(block?.protocolOrder ?? block?.startIndex ?? index) || 0,
        __protocolEndIndex: Number(block?.endIndex ?? block?.startIndex ?? index) || 0
      });
    });
  }

  if (!builtMessages.length && (hasImageGenerationProtocol || hasHtmlCardProtocol || detectedHtmlCardBlocks.length)) return [];

  return enforceAiReplyMessageCount(
    builtMessages.length
      ? sortAiMessagesByRuntimeProtocolOrder(builtMessages)
      : [{ role: 'assistant', content: '（AI 没有返回内容）' }],
    state.chatPromptSettings
  );
}
