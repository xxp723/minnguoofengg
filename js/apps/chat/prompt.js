/**
 * 文件名: js/apps/chat/prompt.js
 * 用途: 闲谈应用 — 提示词组装与聊天 API 调用模块
 * 说明:
 * 1. 本模块只读取项目 Settings/DB.js（IndexedDB）中的设置与聊天上下文。
 * 2. 禁止使用浏览器同步键值存储，也不写双份存储兜底逻辑。
 * 3. 所有提示词区域均用明显注释分隔，便于后续针对性修改。
 * 4. 提示词函数会把已传入/已从 IndexedDB 读取到的有效信息整理成 AI 可读文本。
 */

import {
  buildChatImageGenerationPrompt,
  generateImagesFromChatReply,
  getChatImageApiSettings,
  isChatImageApiReady
} from './chat-image-generation.js';
import { getHtmlCardFeaturePrompt } from './chat-html-card.js';
/* ==========================================================================
   [区域标注·已完成·心声面板] 导入心声系统提示词构建函数
   说明：心声模块独立于 chat-inner-voice.js，这里只导入提示词构建函数。
   ========================================================================== */
import { buildInnerVoiceSystemPrompt } from './chat-inner-voice.js';
/* ==========================================================================
   [区域标注·已完成·需求1·旁白短期记忆原文发送、身份锚定与顺序保持修复] 导入旁白模式系统提示词构建函数
   说明：
   1. buildAsideModeSystemPrompt — 仅在旁白模式开启时注入到 system prompt。
   2. 本需求已取消 buildAsideHistorySummary 注入：短期记忆轮数是唯一边界，旁白历史只随原始短期历史发送。
   3. 旁白模块独立于 chat-aside.js，这里只导入旁白模式系统提示词函数。
   ========================================================================== */
import { buildAsideModeSystemPrompt } from './chat-aside.js';
/* ==========================================================================
   [区域标注·已完成·全局API报错弹窗] 导入结构化 API 错误工具
   说明：
   1. prompt.js 只负责在 API 失败时抛出带 apiErrorInfo 的结构化错误。
   2. 具体应用内弹窗由聊天消息页调用 showApiErrorModal 展示；这里不使用原生浏览器弹窗。
   ========================================================================== */
import { createApiError } from '../../core/ui/components/ApiErrorModal.js';

/* ==========================================================================
   [区域标注] API 服务商基础信息
   说明：与设置应用 js/apps/settings/api.js 的主 API 配置结构保持一致。
   ========================================================================== */
const PROVIDER_DEFAULT_BASE_URL = {
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
  claude: 'https://api.anthropic.com/v1'
};

/* ==========================================================================
   [区域标注] IndexedDB 数据键
   说明：只读取 DB.js 暴露的 IndexedDB 数据，不使用 localStorage/sessionStorage。
   ========================================================================== */
const STORE_NAME = 'appsData';
const ARCHIVE_DB_RECORD_ID = 'archive::archive-data';
const WORLDBOOK_DB_RECORD_ID = 'worldbook::all-books';
/* ========================================================================
   [区域标注·已完成·旧事闲谈长期记忆接入] 旧事应用 IndexedDB 记录规则
   说明：
   1. 只读取旧事应用 memory 下“角色 → 闲谈记忆库”的 chat-memory 记录。
   2. 不读取其它应用记忆，不使用 localStorage/sessionStorage，不写双份存储兜底。
   3. 发送给聊天 AI 的旧事长期记忆只包含记忆摘要和情绪标签，不发送记忆时间。
   ======================================================================== */
const MEMORY_CHAT_RECORD_PREFIX = 'memory::character:';
const MEMORY_CHAT_RECORD_SUFFIX = ':chat-memory';

/* ==========================================================================
   [区域标注] 世界书递归扫描规则
   说明：
   1. 这里的深度是“递归触发扫描深度”，不是发送给 AI 的文字。
   2. 深度 2 = 用户本次输入触发第 1 层；第 1 层正文继续触发第 2 层；不再扫描第 3 层。
   3. 世界书名称、条目名称、关键词、顺序、递归设置只给代码使用，不发送给 AI。
   ========================================================================== */
const WORLDBOOK_MAX_RECURSION_DEPTH = 2;

/* ==========================================================================
   [区域标注] 通用工具函数
   ========================================================================== */
function trimSlash(url) {
  return String(url || '').replace(/\/+$/, '');
}

function normalizeProviderId(providerId) {
  return PROVIDER_DEFAULT_BASE_URL[providerId] ? providerId : 'openai';
}

function extractApiErrorMessage(payload, fallback = '请求失败') {
  if (!payload) return fallback;
  if (typeof payload === 'string') return payload;
  return payload?.error?.message || payload?.error?.msg || payload?.message || payload?.detail || fallback;
}

function stripThinkBlocks(text) {
  return String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

/* ==========================================================================
   [区域标注·已修改] AI 表情包挂载提示词数据工具
   说明：
   1. 表情包资源来自 DB.js / IndexedDB 中的全局共享资产。
   2. mountedStickerGroupIds 来自“当前面具 + 当前聊天对象”的独立聊天设置，不再作为所有联系人通用设置。
   3. system prompt 只注入当前聊天对象已挂载分组下的有效表情包资源。
   ========================================================================== */
function normalizeStickerPromptData(rawData) {
  const source = rawData && typeof rawData === 'object' ? rawData : {};
  const groups = Array.isArray(source.groups)
    ? source.groups
        .map(group => ({
          id: String(group?.id || '').trim(),
          name: String(group?.name || '').trim()
        }))
        .filter(group => group.id && group.name)
    : [];
  const validGroupIds = new Set(['all', ...groups.map(group => group.id)]);
  const rawItems = Array.isArray(source.items)
    ? source.items
    : (Array.isArray(source.stickers) ? source.stickers : []);
  const items = rawItems
    .map(item => ({
      id: String(item?.id || '').trim(),
      groupId: validGroupIds.has(String(item?.groupId || 'all')) ? String(item?.groupId || 'all') : 'all',
      name: String(item?.name || '').trim(),
      url: String(item?.url || '').trim()
    }))
    .filter(item => item.id && item.name && item.url);

  return { groups, items };
}

/* ==========================================================================
   ===== 闲谈：通用消息协议格式 START =====
   [区域标注·已完成·AI文字图/生图互斥协议]
   说明：
   1. 新回复协议统一使用 **`[类型] 角色名：内容`**。
   2. 基础格式固定开放 [回复]/[表情]/[引用]/[转账]/[礼物]/[撤回]/[拍一拍]/[语音]。
   3. 视觉发送格式随设置应用生图 API 开关互斥：
      - 生图 API 未开启或配置不完整：只开放 [文字图]，禁止 [图片]。
      - 生图 API 已开启且配置完整：只开放 [图片]，禁止 [文字图]。
   4. [撤回] 只允许撤回 AI 本轮已输出的消息；多条撤回必须逐条输出撤回协议并逐行生成系统小字。
   ========================================================================== */
const CHAT_PROTOCOL_REPLY_FORMAT = '**`[回复] 角色名：文字消息内容`**';
const CHAT_PROTOCOL_AVAILABLE_FORMATS = [
  '**`[回复] 角色名：文字消息内容`**',
  '**`[表情] 角色名：表情名或资源ID`**',
  '**`[引用] 角色名：{引用ID:xxx}角色自己的新回复内容`**',
  '**`[转账] 角色名：{金额:xxx,备注:xxx}`**',
  '**`[礼物] 角色名：{名称:xxx,备注:xxx}`**',
  '**`[撤回] 角色名：{目标:上一条}`**',
  '**`[拍一拍] 角色名：身体部位`**',
  '**`[语音] 角色名：{时长:xx}语音转写文本`**'
];
/* ===== 闲谈：通用消息协议格式 END ===== */

/* ==========================================================================
   [区域标注·已完成·AI识图多模态消息工具]
   说明：
   1. 只使用聊天消息记录中已经写入 DB.js / IndexedDB 的 stickerUrl / imageUrl。
   2. 不读取 localStorage/sessionStorage，不写双份存储兜底。
   3. 内部统一使用 OpenAI 兼容的 content parts；各 API 请求器再转换为自身格式。
   ========================================================================== */
function isImageDataUrl(url = '') {
  return /^data:image\/[a-z0-9.+-]+;base64,/i.test(String(url || '').trim());
}

function parseImageDataUrl(url = '') {
  const match = String(url || '').trim().match(/^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i);
  return match ? { mimeType: match[1], data: match[2] } : null;
}

function guessImageMimeType(url = '') {
  const value = String(url || '').split('?')[0].split('#')[0].toLowerCase();
  if (value.endsWith('.jpg') || value.endsWith('.jpeg')) return 'image/jpeg';
  if (value.endsWith('.webp')) return 'image/webp';
  if (value.endsWith('.gif')) return 'image/gif';
  if (value.endsWith('.png')) return 'image/png';
  return 'image/png';
}

function getMessageVisualUrl(message = {}) {
  if (String(message?.type || '') === 'sticker') return String(message?.stickerUrl || '').trim();
  if (String(message?.type || '') === 'image') return String(message?.imageUrl || '').trim();
  return '';
}

function getMessageVisualLabel(message = {}) {
  if (String(message?.type || '') === 'sticker') return `用户发送了一张表情包：${message?.stickerName || message?.content || '未命名表情包'}`;
  if (String(message?.type || '') === 'image') return `用户发送了一张图片：${message?.imageName || message?.content || '图片'}`;
  return '';
}

function createVisionImagePart(visualUrl = '') {
  return {
    type: 'image_url',
    image_url: {
      url: String(visualUrl || '').trim(),
      /* [区域标注·本次修改·AI识图低成本] OpenAI 兼容视觉输入使用低细节模式，减少图片 token 消耗；不支持该字段的兼容服务通常会忽略。 */
      detail: 'low'
    }
  };
}

function createVisionMessageContent(message = {}, textContent = '', options = {}) {
  const text = String(textContent || '').trim();
  const visualUrl = getMessageVisualUrl(message);
  if (!visualUrl || message.role !== 'user') return text;

  const visualLabel = getMessageVisualLabel(message);
  const textPart = [text, visualLabel].filter(Boolean).join('\n') || visualLabel || '用户发送了一张图片。';

  /* [区域标注·本次修改·历史图片省token] 历史消息默认只发送图片/表情包文字摘要，不再重复附带真实 image_url。 */
  if (options.includeVisual === false) return textPart;

  return [
    { type: 'text', text: textPart },
    createVisionImagePart(visualUrl)
  ];
}

function hasMessageContent(content) {
  if (Array.isArray(content)) {
    return content.some(part => {
      if (part?.type === 'text') return String(part.text || '').trim();
      if (part?.type === 'image_url') return String(part.image_url?.url || '').trim();
      return false;
    });
  }
  return String(content || '').trim();
}

function getTextFromMessageContent(content) {
  if (Array.isArray(content)) {
    return content
      .filter(part => part?.type === 'text')
      .map(part => String(part.text || '').trim())
      .filter(Boolean)
      .join('\n');
  }
  return String(content || '');
}

function normalizeMessages(messages) {
  return Array.isArray(messages)
    ? messages
        .filter(item => item && (item.role === 'user' || item.role === 'assistant' || item.role === 'system'))
        .map(item => ({ role: item.role, content: Array.isArray(item.content) ? item.content : String(item.content || '') }))
        .filter(item => hasMessageContent(item.content))
    : [];
}

function normalizePlainText(value) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim();
}

function hasReadableValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number' || typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.some(hasReadableValue);
  if (typeof value === 'object') return Object.values(value).some(hasReadableValue);
  return false;
}

/* ========================================================================
   [区域标注·已完成·本次要求：移除长文本字段过滤]
   说明：
   1. 本区已移除按字段名、文本长度或媒体特征排除档案内容的过滤逻辑。
   2. 角色档案、用户面具、配角档案、关系备注等可读字段不再因字段名、长度或媒体特征被本区过滤。
   3. 本模块仍只做 hasReadableValue 空值判断；不使用 localStorage/sessionStorage，不写双份存储兜底。
   ======================================================================== */

function labelizeKey(key) {
  const labels = {
    id: 'ID',
    name: '姓名',
    nickname: '昵称',
    signature: '个性签名',
    description: '描述',
    basicSetting: '基本设定',
    personality: '性格',
    firstMessage: '开场白',
    greetings: '开场白',
    scenario: '场景',
    identity: '身份',
    personalitySetting: '人物设定',
    contact: '联系方式',
    gender: '性别',
    age: '年龄',
    roleId: '角色ID',
    groupId: '分组ID',
    type: '类型',
    content: '内容',
    notes: '备注',
    remark: '备注',
    relationship: '关系',
    currentCommand: '当前指令',
    customThinkingInstruction: '自定义思维链',
    externalContextEnabled: '外部上下文注入'
  };
  return labels[key] || key;
}

/* ========================================================================
   [区域标注·已完成·本次需求1] 档案字段按对象类型显示标签
   说明：
   1. personalitySetting 是档案应用复用字段。
   2. 角色档案中显示为“人物设定”，用户面具中显示为“用户设定”。
   3. 配角档案只使用姓名、性别、联系方式、基本设定四项，其中 basicSetting 显示为“基本设定”。
   ======================================================================== */
function labelizeArchivePromptKey(key, entityType = '') {
  if (key === 'personalitySetting' && entityType === 'mask') return '用户设定';
  if (key === 'personalitySetting' && entityType === 'character') return '人物设定';
  if (key === 'basicSetting' && entityType === 'supporting') return '基本设定';
  return labelizeKey(key);
}

/* ==========================================================================
   [区域标注·已完成·本次要求：AI 可读文本格式化不做长文本过滤]
   说明：
   1. 避免 [object Object]，递归整理已传入的可读字段。
   2. 已移除字段名/长度/媒体特征过滤，不再按长文本或媒体特征排除档案内容。
   3. 本区域不涉及持久化存储；不使用 localStorage/sessionStorage。
   ========================================================================== */
function formatReadableValue(value, indent = 0) {
  const pad = '  '.repeat(indent);

  if (!hasReadableValue(value)) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return `${value}`.trim();
  }

  if (Array.isArray(value)) {
    return value
      .map((item, index) => {
        const formatted = formatReadableValue(item, indent + 1);
        return formatted ? `${pad}${index + 1}. ${formatted}` : '';
      })
      .filter(Boolean)
      .join('\n');
  }

  if (typeof value === 'object') {
    return Object.entries(value)
      .filter(([, val]) => hasReadableValue(val))
      .map(([key, val]) => {
        const formatted = formatReadableValue(val, indent + 1);
        if (!formatted) return '';
        const label = labelizeKey(key);
        return typeof val === 'object'
          ? `${pad}${label}：\n${formatted}`
          : `${pad}${label}：${formatted}`;
      })
      .filter(Boolean)
      .join('\n');
  }

  return '';
}

function createPromptSection(title, content) {
  const text = normalizePlainText(content);
  return text ? `【${title}】\n${text}` : '';
}

/* ==========================================================================
   [区域标注·已完成·本次用户本轮消息防回显约束]
   说明：
   1. 历史消息默认只发送“谁说了什么”的纯文本摘要，不再附带每条消息 id / type / quote 结构。
   2. 仅“最新一轮用户消息”保留最小可引用 ID，确保 AI 本轮仍能输出 [引用] 气泡。
   3. 本区已把用户发言标记为“用户：”，AI 历史发言标记为“你：”，避免模型把“我：...”误读成自己要复述的话。
   4. 本区额外强化：用户本轮原话只用于理解上下文和引用 ID，禁止被当作 [回复] 正文、首句垫话或原样复述内容输出。
   5. quote 字段仍来自 DB.js / IndexedDB 中已有聊天消息对象；本区只做本轮 API 请求前的文本转换。
   ========================================================================== */
function formatPromptQuoteLine(quote = {}, { includeReferenceId = false } = {}) {
  const quoteText = normalizePlainText(quote?.text);
  if (!quoteText) return '';

  const senderName = normalizePlainText(quote?.senderName || (quote?.role === 'user' ? '我' : '对方')) || '对方';
  return [
    includeReferenceId ? '以下引用信息仅供你理解上下文，绝不能原样复制到最终回复里。' : '',
    `引用原消息发送者：${senderName}`,
    `引用原消息内容：${quoteText}`
  ].filter(Boolean).join('\n');
}

function getPromptSenderLabel(message = {}) {
  return message?.role === 'user' ? '用户' : '你';
}

function formatCompactMessageContentForPrompt(message = {}, fallbackContent = '') {
  const type = normalizePlainText(message?.type) || 'text';
  const content = normalizePlainText(fallbackContent || message?.content);

  if (type === 'sticker') return `[表情包] ${normalizePlainText(message?.stickerName || content || '表情包')}`;
  /* ======================================================================
     [区域标注·已完成·文字图内容进入短期记忆/对话历史]
     说明：
     1. 用户发送的文字图是聊天界面里可见的图片样式消息，不是 AI 输出用的 [文字图] 协议。
     2. 短期记忆、对话历史与本轮可引用消息会把 textImageText 明确写成“图中文字”，让 AI 能读到文字图内容。
     3. 不添加 imageUrl，不触发真实视觉识别 token；仅调整 prompt 文本表达。
     ====================================================================== */
  if (type === 'image' && (String(message?.imageSource || '') === 'text-image' || normalizePlainText(message?.textImageText))) {
    const textImageText = normalizePlainText(message?.textImageText || content || '文字图');
    return `用户发来一张可见的文字图样式图片；图中文字：${textImageText}。请按已经看到这张图片的版式和文字内容来回应，禁止说看不到实物或这只是文字图。`;
  }
  if (type === 'image') return `[图片] ${normalizePlainText(message?.imageName || content || '图片')}`;
  if (type === 'card') {
    return content.startsWith('[HTML卡片历史摘要]')
      ? content
      : formatHtmlCardHistorySummaryForPrompt({ ...message, content: content || message?.content });
  }
  if (type === 'transfer') {
    const amount = normalizePlainText(message?.transferDisplayAmount || message?.transferAmount || message?.amount || content || '¥0.00');
    const note = normalizePlainText(message?.transferNote || message?.note || message?.remark || '');
    return `[转账] ${amount}${note ? `（备注：${note}）` : ''}`;
  }
  if (type === 'gift') return `[礼物] ${content}`;
  /* ======================================================================
     [区域标注·已完成·AI语音消息历史上下文摘要]
     说明：
     1. voice_message 是 chat-voice.js 写入当前消息数组的统一语音消息类型。
     2. 历史上下文只给 AI 读取语音摘要，不发送音频文件、URL 或额外存储内容。
     3. 消息仍只来自 DB.js / IndexedDB 中的聊天记录，不使用 localStorage/sessionStorage。
     ====================================================================== */
  if (type === 'voice_message' || type === 'voice') return `[语音] ${content}`;
  if (type === 'withdraw') return '[撤回了一条消息]';

  return content;
}

function formatMessageTextWithQuoteForPrompt(message = {}, fallbackContent = '', options = {}) {
  const includeReferenceMeta = Boolean(options.includeReferenceMeta);
  const content = formatCompactMessageContentForPrompt(message, fallbackContent);
  const quoteLine = formatPromptQuoteLine(message?.quote, { includeReferenceId: includeReferenceMeta });
  const senderLine = `${getPromptSenderLabel(message)}：${content || '（空消息）'}`;

  if (!includeReferenceMeta) {
    return [quoteLine, senderLine].filter(Boolean).join('\n');
  }

  const messageId = normalizePlainText(message?.id);
  const idLine = messageId ? `可引用ID:${messageId}` : '';
  return [idLine, quoteLine, senderLine].filter(Boolean).join('\n');
}

/* ==========================================================================
   [区域标注·已完成·旁白身份锚点与称呼锁定修复] 旁白历史原文格式化工具
   说明：
   1. 短期记忆轮数是唯一边界；本区只格式化调用方已经裁剪好的 history，不扩大历史范围。
   2. 不注入旁白摘要，不剔除旁白原始轮次，不使用 localStorage/sessionStorage，不写双份存储兜底。
   3. 含旁白的 assistant 历史每条只加一次身份锚定，并明确“用户：/你：”只是后台消息标签，不能原样搬到旁白正文里。
   4. 用户若选择第二人称，则旁白正文对用户的称呼固定为“你”；若选择第三人称，则固定为真实用户名。
   5. 旁白按当前消息对象保存的 before/after 顺序与正常“你：...”回复穿插，避免把旁白全部堆到每轮最前面。
   6. 正常模式历史仍使用现有“用户：/你：”格式，不改成泛化 [回复]。
   ========================================================================== */
function getAsideIdentityAnchorForPrompt({ roleName = '', userName = '', asideSettings = null } = {}) {
  const safeRoleName = normalizePlainText(roleName) || '当前角色';
  const safeUserName = normalizePlainText(userName) || '当前用户';
  const safeAsideSettings = asideSettings && typeof asideSettings === 'object' ? asideSettings : {};
  const userRef = safeAsideSettings.userPerson === 'third' ? safeUserName : '你';
  return `【旁白身份锚点：旁白里的“我”=${safeRoleName}；旁白正文里对话对象称呼=${userRef}；历史里的“用户：/你：”只是后台消息标签，不是旁白正文称呼；旁白=本轮已发生情景，不是第三人】`;
}

function normalizeAsideSegmentsForPrompt(message = {}) {
  const rawSegments = Array.isArray(message?.asideSegments) ? message.asideSegments : [];
  const segments = rawSegments
    .map(segment => ({
      text: normalizePlainText(typeof segment === 'string' ? segment : segment?.text),
      placement: String(typeof segment === 'string' ? 'before' : (segment?.placement || 'before')) === 'after' ? 'after' : 'before'
    }))
    .filter(segment => segment.text);

  if (segments.length) return segments;

  const legacyAsideText = normalizePlainText(message?.asideText);
  return legacyAsideText
    ? legacyAsideText.split(/\n+/).map(text => ({ text: text.trim(), placement: 'before' })).filter(segment => segment.text)
    : [];
}

function formatAsideSegmentForPrompt(segment = {}) {
  const text = normalizePlainText(segment?.text);
  return text ? `[旁白]${text}[/旁白]` : '';
}

function formatAsideAwareMessageTextWithQuoteForPrompt(message = {}, fallbackContent = '', options = {}) {
  const normalText = formatMessageTextWithQuoteForPrompt(message, fallbackContent, options);
  if (message?.role !== 'assistant') return normalText;

  const asideSegments = normalizeAsideSegmentsForPrompt(message);
  if (!asideSegments.length) return normalText;

  const beforeAside = asideSegments
    .filter(segment => segment.placement !== 'after')
    .map(formatAsideSegmentForPrompt)
    .filter(Boolean);
  const afterAside = asideSegments
    .filter(segment => segment.placement === 'after')
    .map(formatAsideSegmentForPrompt)
    .filter(Boolean);

  return [
    getAsideIdentityAnchorForPrompt(options),
    ...beforeAside,
    normalText,
    ...afterAside
  ].filter(Boolean).join('\n');
}

/* ==========================================================================
   [区域标注·已完成·本次修复：最近心声状态短期上下文]
   说明：
   1. 只读取短期历史消息对象自身已有的 innerVoice 字段，不读取独立心声历史，不新增持久化存储。
   2. 只给 getChatHistory 已裁剪短期历史中“最近一条带心声的 assistant 消息”追加极短状态锚点，不给每轮都追加，避免 token 随轮数膨胀。
   3. 仅透传“状态/动作”两个字段，并做 30 字以内长度保护；不扩写、不总结、不加入真实心声/性幻想等高 token 字段。
   4. 不使用 localStorage/sessionStorage，不写双份存储兜底，不做长文本字段过滤。
   ========================================================================== */
function pickInnerVoicePromptField(innerVoice = {}, keys = []) {
  return keys
    .map(key => normalizePlainText(innerVoice?.[key]))
    .find(Boolean) || '';
}

function formatShortInnerVoicePromptValue(value = '', maxLength = 30) {
  const text = normalizePlainText(value).replace(/\s+/g, ' ');
  if (!text) return '';
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

function formatRecentInnerVoiceStateForPrompt(message = {}) {
  const innerVoice = message?.innerVoice;
  if (!innerVoice || typeof innerVoice !== 'object') return '';

  const state = formatShortInnerVoicePromptValue(
    pickInnerVoicePromptField(innerVoice, ['state', 'status', '状态'])
  );
  const action = formatShortInnerVoicePromptValue(
    pickInnerVoicePromptField(innerVoice, ['action', '动作'])
  );
  const parts = [];
  if (state) parts.push(`状态：${state}`);
  if (action) parts.push(`动作：${action}`);

  return parts.length ? `[最近心声]${parts.join('；')}[/最近心声]` : '';
}

function extractSystemTempBlocks(text = '') {
  return String(text || '').match(/\[SYSTEM_TEMP\][\s\S]*?\[\/SYSTEM_TEMP\]/g) || [];
}

function buildCurrentUserPromptContent(rawUserInput = '', currentUserRoundMessages = []) {
  const formattedRoundMessages = Array.isArray(currentUserRoundMessages)
    ? currentUserRoundMessages
        .map(item => formatMessageTextWithQuoteForPrompt(item, '', { includeReferenceMeta: true }))
        .filter(Boolean)
        .join('\n\n')
    : '';

  if (!formattedRoundMessages) return normalizePlainText(rawUserInput);

  const systemTempBlocks = extractSystemTempBlocks(rawUserInput);
  return [
    '【本轮用户消息·可引用】',
    '仅以下本轮用户消息可被 [引用] 协议引用；历史消息不提供引用ID。',
    '“用户：”后面的内容是用户发来的原话，只用于你理解当前上下文与引用目标，不是你要复述的台词。',
    '禁止把本轮用户原话原样输出为 [回复] 正文，禁止在 [回复] 开头先重复用户刚发的话，再接自己的回复。',
    '如果使用 [引用]，{引用ID:xxx} 后必须直接写你作为角色的新回应；禁止把被引用原文或本轮用户原话再抄一遍。',
    '其中“可引用ID:”“引用原消息发送者：”“引用原消息内容：”这些行只是后台提示，绝不能原样复制到最终回复里。',
    formattedRoundMessages,
    ...systemTempBlocks
  ].filter(Boolean).join('\n');
}

/* ==========================================================================
   [角色卡字段读取工具区·已完成] 档案字段中文化与可读格式化
   说明：
   1. 档案应用实际把角色正文主要保存为 personalitySetting，把身份保存为 identity，把开场白保存为 greetings。
   2. 本区只负责读取/格式化字段，不单独生成 prompt；实际发送位置见“提示词区域 2”。
   3. 本区不新增持久化存储，不使用 localStorage/sessionStorage，也不写双份兜底。
   ========================================================================== */
function getCharacterPromptFieldValue(character, key) {
  if (!character || typeof character !== 'object') return '';

  return character[key];
}

function getCharacterPromptFieldEntries(character, keys = [], entityType = 'character') {
  const seenLabels = new Set();

  return keys
    .map(key => {
      const value = getCharacterPromptFieldValue(character, key);
      if (!hasReadableValue(value)) return null;

      const label = labelizeArchivePromptKey(key, entityType);
      const formatted = formatReadableValue(value);
      if (!formatted) return null;

      const signature = `${label}::${formatted}`;
      if (seenLabels.has(signature)) return null;
      seenLabels.add(signature);

      return { key, label, value, formatted };
    })
    .filter(Boolean);
}

/* ==========================================================================
   [区域标注·已完成·本次需求2] 档案性别字段 AI 理解工具
   说明：
   1. 只读取档案应用已写入 IndexedDB 的 gender 字符串，不新增存储，不使用 localStorage/sessionStorage。
   2. 当性别为“双性”时，补充精简释义仅供 AI 理解；最终回复不得把释义当系统说明暴露给用户。
   3. 明确警告 AI 不得认错用户面具、角色档案中的性别。
   ========================================================================== */
function createArchiveGenderPromptNote(entity, entityLabel = '档案对象') {
  const gender = normalizePlainText(entity?.gender);
  if (!gender) return '';

  const commonRule = `【${entityLabel}性别识别硬约束】
- 档案字段“性别：${gender}”是硬事实，必须严格按此识别，禁止认错性别、擅自改性别或用刻板印象覆盖档案填写内容。`;

  if (gender !== '双性') return commonRule;

  return `${commonRule}
- 当性别为“双性”时，仅供 AI 理解的核心认知如下：
  ## 核心认知
  - {{user}}的外观与社会性别为男性，但具有双性生殖系统。
  - 俗称“双性男”或“Cuntboy”，拥有女性生殖器但保留了男性的部分关键构造（如前列腺）。
  - 外观特征：整体外观为男性，平胸、喉结、男性骨架与肌肉；仅在脱下裤子暴露生殖器时显露双性特征。
- 以上“双性”释义只用于你理解档案设定，禁止在最终回复中机械复述说明文字，除非用户明确询问相关设定。`;
}

function formatNamedObject(title, source, preferredKeys = []) {
  if (!source || typeof source !== 'object') return '';

  const lines = [];
  preferredKeys.forEach(key => {
    if (Object.prototype.hasOwnProperty.call(source, key) && hasReadableValue(source[key])) {
      const value = formatReadableValue(source[key]);
      if (value) lines.push(`${labelizeKey(key)}：${value}`);
    }
  });

  Object.entries(source).forEach(([key, value]) => {
    if (preferredKeys.includes(key)) return;
    if (!hasReadableValue(value)) return;
    const formatted = formatReadableValue(value);
    if (formatted) lines.push(`${labelizeKey(key)}：${formatted}`);
  });

  return createPromptSection(title, lines.join('\n'));
}

async function readDbRecordValue(db, id) {
  if (!db || typeof db.get !== 'function') return null;
  try {
    const record = await db.get(STORE_NAME, id);
    return record ? (record.value ?? record.data ?? null) : null;
  } catch {
    return null;
  }
}

function normalizeWorldBooks(rawBooks) {
  return Array.isArray(rawBooks) ? rawBooks : [];
}

function normalizeArchiveData(rawArchive) {
  const archive = rawArchive && typeof rawArchive === 'object' ? rawArchive : {};
  return {
    ...archive,
    masks: Array.isArray(archive.masks) ? archive.masks : [],
    characters: Array.isArray(archive.characters) ? archive.characters : [],
    /* [区域标注·已完成·本次需求1] 档案关系网络注入修复：保留配角档案与关系网络，避免发送给 AI 的关系上下文为空字符串 */
    supportingRoles: Array.isArray(archive.supportingRoles) ? archive.supportingRoles : [],
    relations: Array.isArray(archive.relations) ? archive.relations : [],
    activeMaskId: archive.activeMaskId || ''
  };
}

function getWorldBookKeywordMatchText(sourceText = '') {
  return String(sourceText || '').toLowerCase();
}

function getWorldBookEntryKeywords(entry) {
  return Array.isArray(entry?.keywords)
    ? entry.keywords.map(item => String(item || '').trim()).filter(Boolean)
    : [];
}

function isWorldBookEntryKeywordMatched(entry, sourceText = '') {
  const keywords = getWorldBookEntryKeywords(entry);

  /* [世界书触发规则] 关键词触发但没有关键词时不发送，避免空关键词条目被误注入。 */
  if (!keywords.length) return false;

  const haystack = getWorldBookKeywordMatchText(sourceText);
  return keywords.some(keyword => haystack.includes(keyword.toLowerCase()));
}

function canWorldBookEntryActivate(entry, sourceText = '', { allowAlways = true } = {}) {
  if (!entry || entry.enabled === false) return false;
  if (entry.triggerType === 'always') return allowAlways;
  return isWorldBookEntryKeywordMatched(entry, sourceText);
}

function isWorldBookAvailableForCharacter(book, characterId) {
  if (!book || book.enabled === false) return false;
  if (book.type === 'global') return true;

  const boundIds = Array.isArray(book.boundCharacterIds)
    ? book.boundCharacterIds.map(String)
    : (book.boundCharacterId ? [String(book.boundCharacterId)] : []);

  return Boolean(characterId && boundIds.includes(String(characterId)));
}

/* ==========================================================================
   [区域标注·已完成·本次需求1] 当前聊天角色档案匹配修复
   说明：
   1. 优先使用通讯录保存的 roleId / 会话 roleId 精确匹配档案应用 characters[].id。
   2. 再使用 contact.id / session.id 兼容旧数据；最后按联系人/会话名称兜底匹配。
   3. 本区只读取已传入或 IndexedDB 中的档案数据，不使用 localStorage/sessionStorage。
   4. 不向 AI 发送角色开场白 greetings，也不发送角色绑定世界书名称 boundWorldBooks。
   ========================================================================== */
function getCurrentCharacterId(context = {}) {
  const session = context.currentSession || {};
  const contact = context.currentContact || {};
  const characters = Array.isArray(context.archiveData?.characters) ? context.archiveData.characters : [];
  const candidateIds = [
    contact.roleId,
    session.roleId,
    context.currentCharacterId,
    contact.id,
    session.id
  ].map(item => String(item || '').trim()).filter(Boolean);

  const matchedId = candidateIds.find(candidateId => (
    characters.some(character => String(character?.id || '') === candidateId)
  ));

  return matchedId || candidateIds[0] || '';
}

function getCurrentCharacter(context = {}) {
  const characterId = getCurrentCharacterId(context);
  const characters = Array.isArray(context.archiveData?.characters) ? context.archiveData.characters : [];
  const byId = characters.find(item => String(item?.id || '') === characterId);
  if (byId) return byId;

  const session = context.currentSession || {};
  const contact = context.currentContact || {};
  const candidateNames = [
    contact.name,
    session.name
  ].map(item => normalizePlainText(item)).filter(Boolean);

  return characters.find(character => candidateNames.includes(normalizePlainText(character?.name))) || context.currentCharacter || null;
}

function getCurrentMask(context = {}) {
  const activeMaskId = context.activeMaskId || context.archiveData?.activeMaskId || '';
  const masks = Array.isArray(context.archiveData?.masks) ? context.archiveData.masks : [];
  return masks.find(item => String(item?.id || '') === String(activeMaskId)) || context.currentMask || null;
}

function getAsidePromptIdentityNames(context = {}) {
  const character = context.currentCharacter || getCurrentCharacter(context);
  const mask = context.currentMask || getCurrentMask(context);
  const roleName = normalizePlainText(
    character?.name
    || context.currentContact?.name
    || context.currentSession?.name
    || context.roleName
  ) || '角色';
  const userName = normalizePlainText(
    mask?.name
    || context.userName
  ) || '用户';

  return { roleName, userName };
}

/* ==========================================================================
   [区域标注·已完成·本次需求1] 用户面具/角色/配角关系网络档案详情注入修复
   说明：
   1. 读取档案应用写入 IndexedDB 的 masks / characters / supportingRoles / relations。
   2. 同时支持当前对象作为 owner 或 target 的双向关系，避免关系网络为空。
   3. 关系网络会发送关系对象类型、名称、关系标签、当前视角备注，并补充关系对象档案摘要。
   4. 角色档案只注入姓名、性别、年龄、身份、联系方式、个性签名、人物设定。
   5. 用户面具只注入姓名、性别、年龄、身份、联系方式、个性签名、用户设定。
   6. 配角档案只注入姓名、性别、联系方式、基本设定四项，禁止编造或补充不存在字段。
   7. 不使用 localStorage/sessionStorage，不写双份存储兜底。
   ========================================================================== */
function getArchiveEntityListByType(context = {}, type = '') {
  const archive = context.archiveData || {};
  if (type === 'mask') return Array.isArray(archive.masks) ? archive.masks : [];
  if (type === 'character') return Array.isArray(archive.characters) ? archive.characters : [];
  if (type === 'supporting') return Array.isArray(archive.supportingRoles) ? archive.supportingRoles : [];
  return [];
}

function getArchiveEntityName(context = {}, type = '', id = '') {
  const entity = getArchiveEntityListByType(context, type).find(item => String(item?.id || '') === String(id || ''));
  return entity?.name || entity?.nickname || '未命名';
}

function getArchiveEntityPromptFieldsByType(type = '') {
  if (type === 'mask') {
    return ['name', 'gender', 'age', 'identity', 'contact', 'signature', 'personalitySetting'];
  }

  if (type === 'character') {
    return ['name', 'gender', 'age', 'identity', 'contact', 'signature', 'personalitySetting'];
  }

  if (type === 'supporting') {
    return ['name', 'gender', 'contact', 'basicSetting'];
  }

  return [];
}

function formatArchiveEntitySummaryForPrompt(context = {}, type = '', id = '') {
  const entity = getArchiveEntityListByType(context, type).find(item => String(item?.id || '') === String(id || ''));
  const keys = getArchiveEntityPromptFieldsByType(type);
  if (!entity || !keys.length) return '';

  const lines = getCharacterPromptFieldEntries(entity, keys, type)
    .map(entry => `  ${entry.label}：${entry.formatted}`)
    .filter(Boolean);

  return lines.length ? `  关系对象档案：\n${lines.join('\n')}` : '';
}

function getRelationDisplayText(type = '', custom = '') {
  const safeType = String(type || '').trim();
  const safeCustom = String(custom || '').trim();
  if (safeType === '自定义') return safeCustom || '自定义关系';
  return safeType || safeCustom || '未设定';
}

function formatArchiveRelationNetworkForEntity(context = {}, entityType = '', entityId = '', title = '关系网络') {
  const safeType = String(entityType || '').trim();
  const safeId = String(entityId || '').trim();
  const relations = Array.isArray(context.archiveData?.relations) ? context.archiveData.relations : [];
  if (!safeType || !safeId || !relations.length) return '';

  const typeLabels = {
    mask: '用户面具',
    character: '角色',
    supporting: '配角'
  };

  const lines = relations
    .map(item => {
      const isOwnerSide = item?.ownerType === safeType && String(item?.ownerId || '') === safeId;
      const isTargetSide = item?.targetType === safeType && String(item?.targetId || '') === safeId;
      if (!isOwnerSide && !isTargetSide) return '';

      const counterpartType = isOwnerSide ? item.targetType : item.ownerType;
      const counterpartId = isOwnerSide ? item.targetId : item.ownerId;
      const counterpartName = getArchiveEntityName(context, counterpartType, counterpartId);
      const counterpartTypeLabel = typeLabels[counterpartType] || '人物';
      const relationLabel = isOwnerSide
        ? getRelationDisplayText(item.ownerRelationType, item.ownerRelationCustom)
        : getRelationDisplayText(item.targetRelationType, item.targetRelationCustom);
      const note = normalizePlainText(isOwnerSide ? item.ownerNote : item.targetNote);
      const counterpartSummary = formatArchiveEntitySummaryForPrompt(context, counterpartType, counterpartId);

      return [
        `- 与${counterpartTypeLabel}「${counterpartName}」：${relationLabel}${note ? `；当前视角备注：${note}` : ''}`,
        counterpartSummary
      ].filter(Boolean).join('\n');
    })
    .filter(Boolean);

  return lines.length ? `${title}：\n${lines.join('\n')}` : '';
}

function formatUserPersonaRelationNetwork(context = {}, mask = null) {
  const maskId = String(mask?.id || context.activeMaskId || '').trim();
  return formatArchiveRelationNetworkForEntity(context, 'mask', maskId, '用户面具身份绑定的关系网络');
}

/* ==========================================================================
   [区域标注·已完成·旧事闲谈长期记忆接入]
   说明：
   1. 只读取旧事应用 memory::character:{角色ID}:chat-memory 中的 chatMemory.items。
   2. 只注入当前用户面具 roleBindingIds 对应的当前聊天角色记忆，避免串入其它角色。
   3. 只注入 type === 'longterm' 且 injectionEnabled === true 的闲谈长期记忆。
   4. 不读取其它应用记忆，不使用 localStorage/sessionStorage，不写双份存储兜底，不做长文本字段过滤。
   ========================================================================== */
function buildOldStoryChatMemoryRecordId(characterId = '') {
  const safeCharacterId = String(characterId || '').trim();
  return safeCharacterId ? `${MEMORY_CHAT_RECORD_PREFIX}${safeCharacterId}${MEMORY_CHAT_RECORD_SUFFIX}` : '';
}

function isCharacterBoundToCurrentMaskForMemory(context = {}, characterId = '') {
  const safeCharacterId = String(characterId || '').trim();
  if (!safeCharacterId) return false;

  const mask = context.currentMask || getCurrentMask(context);
  const roleBindingIds = Array.isArray(mask?.roleBindingIds)
    ? mask.roleBindingIds.map(item => String(item || '').trim()).filter(Boolean)
    : [];

  return roleBindingIds.includes(safeCharacterId);
}

function normalizeOldStoryLongTermMemoryItems(rawRecord = null) {
  const items = Array.isArray(rawRecord?.chatMemory?.items) ? rawRecord.chatMemory.items : [];
  return items
    .filter(item => item && item.type === 'longterm' && item.injectionEnabled === true)
    .sort((a, b) => {
      if (Boolean(b.isPermanent) !== Boolean(a.isPermanent)) return Boolean(b.isPermanent) ? 1 : -1;
      return Number(b.timelineAt || 0) - Number(a.timelineAt || 0);
    });
}

async function loadOldStoryChatLongTermMemoriesForPrompt(context = {}) {
  const characterId = String(context.currentCharacterId || getCurrentCharacterId(context)).trim();
  if (!context.db || !characterId || !isCharacterBoundToCurrentMaskForMemory(context, characterId)) return [];

  const recordId = buildOldStoryChatMemoryRecordId(characterId);
  const recordValue = recordId ? await readDbRecordValue(context.db, recordId) : null;
  return normalizeOldStoryLongTermMemoryItems(recordValue);
}

function formatOldStoryChatLongTermMemoriesForPrompt(context = {}) {
  const items = Array.isArray(context.oldStoryChatLongTermMemories)
    ? context.oldStoryChatLongTermMemories
    : [];
  if (!items.length) return '';

  const character = context.currentCharacter || getCurrentCharacter(context);
  const mask = context.currentMask || getCurrentMask(context);
  const roleName = normalizePlainText(character?.name || context.currentContact?.name || context.currentSession?.name) || '当前角色';
  const userName = normalizePlainText(mask?.name || context.userName) || '当前用户';

  /* ==========================================================================
     [区域标注·已完成·旧事长期记忆发送内容精简区]
     说明：
     1. 聊天 AI 只接收记忆摘要 summary 和情绪标签 emotionTags。
     2. 不发送 timelineAt / 格式化时间，也不发送标题，避免时间信息进入聊天消息页面的 AI 上下文。
     ========================================================================== */
  const memoryLines = items.map((item, index) => {
    const summary = normalizePlainText(item?.summary);
    const tags = Array.isArray(item?.emotionTags)
      ? item.emotionTags.map(tag => normalizePlainText(tag)).filter(Boolean)
      : [];
    const tagText = tags.length ? `   标签：${tags.join('、')}` : '';

    return [
      `${index + 1}. 记忆摘要`,
      summary ? `   ${summary}` : '',
      tagText
    ].filter(Boolean).join('\n');
  });

  return [
    `旧事闲谈长期记忆（角色：${roleName}；用户面具：${userName}）：`,
    '以下是当前角色在旧事应用「闲谈记忆库」中已允许注入的长期记忆，是当前角色已经经历过、必须记住的事实。',
    '必须当作角色自己的经历/关系/承诺/情绪转折；不能当作用户面具的经历，不能混淆角色身份和用户身份。',
    '若短期历史与长期记忆冲突，按最近短期历史判断当前状态，但不得否认长期记忆中已发生的事实。',
    memoryLines.join('\n')
  ].filter(Boolean).join('\n');
}

/* ==========================================================================
   [区域标注·已完成·本次需求1] 角色卡绑定关系网络格式化
   说明：读取档案应用写入 IndexedDB 的 relations，注入当前要扮演角色的关系网与关系对象档案摘要。
   ========================================================================== */
function formatCharacterRelationNetwork(context = {}, character = null) {
  const characterId = String(character?.id || getCurrentCharacterId(context)).trim();
  return formatArchiveRelationNetworkForEntity(context, 'character', characterId, '角色关系网');
}

async function collectPromptRuntimeContext({
  db,
  activeMaskId = '',
  currentSession = null,
  currentUserAvatarForRole = '',
  currentContact = null,
  archiveData = null,
  worldBooks = null,
  stickerData = null,
  userInput = '',
  history = [],
  settings = {},
  conversationTimeContext = {},
  /* ======================================================================
     [区域标注·已完成·旁白模式] collectPromptRuntimeContext 接收旁白参数
     说明：旁白模式相关字段透传到 runtimeContext，供 buildSystemPrompt / buildChatMessages 读取。
     ====================================================================== */
  asideModeActive = false,
  asideSettings = null,
  asideHistory = []
} = {}) {
  /* ==========================================================================
     [区域标注·已完成·本次世情同步排查] 闲谈发送前实时读取世界书
     说明：
     1. 每次真正调用 AI 前，世界书都强制通过 DB.js / IndexedDB 读取 worldbook::all-books。
     2. 不使用 localStorage/sessionStorage，不保留双份存储兜底，也不依赖闲谈应用启动时的旧缓存。
     3. 这样世情应用中刚保存的条目内容、启用状态、位置、触发方式、关键词和递归设置，会在下一次闲谈发送时同步进入筛选逻辑。
     4. worldBooks 参数仅作为无 db 场景下的运行时兼容输入；正常应用发送链路以 IndexedDB 最新记录为准。
     ========================================================================== */
  const [archiveRecord, worldBookRecord] = await Promise.all([
    archiveData ? Promise.resolve(archiveData) : readDbRecordValue(db, ARCHIVE_DB_RECORD_ID),
    db ? readDbRecordValue(db, WORLDBOOK_DB_RECORD_ID) : Promise.resolve(worldBooks)
  ]);

  const normalizedArchive = normalizeArchiveData(archiveRecord);
  const normalizedWorldBooks = normalizeWorldBooks(worldBookRecord);
  const safeActiveMaskId = activeMaskId || normalizedArchive.activeMaskId || '';

  const context = {
    db,
    activeMaskId: safeActiveMaskId,
    currentSession,
    currentUserAvatarForRole: String(currentUserAvatarForRole || '').trim(),
    currentContact,
    archiveData: normalizedArchive,
    worldBooks: normalizedWorldBooks,
    stickerData: normalizeStickerPromptData(stickerData),
    userInput,
    history,
    settings,
    conversationTimeContext,
    /* ======================================================================
       [区域标注·已完成·旁白模式] context 透传旁白字段
       说明：asideModeActive / asideSettings / asideHistory 透传给 buildSystemPrompt 和 buildChatMessages。
       ====================================================================== */
    asideModeActive,
    asideSettings,
    asideHistory
  };

  const enrichedContext = {
    ...context,
    currentCharacterId: getCurrentCharacterId(context),
    currentCharacter: getCurrentCharacter(context),
    currentMask: getCurrentMask(context)
  };

  /* ========================================================================
     [区域标注·已完成·旧事闲谈长期记忆接入] 发送前读取当前角色旧事记忆
     说明：
     1. 仅通过 DB.js / IndexedDB 读取旧事应用 memory 下当前角色的 chat-memory。
     2. 只把当前用户面具绑定角色中已允许注入的 longterm 记忆放入 prompt 运行时上下文。
     3. 本区不读取其它应用记忆，不使用 localStorage/sessionStorage，不写双份存储兜底。
     ======================================================================== */
  enrichedContext.oldStoryChatLongTermMemories = await loadOldStoryChatLongTermMemoriesForPrompt(enrichedContext);

  return enrichedContext;
}

/* ==========================================================================
   [区域标注·已修改] 聊天设置默认值
   说明：
   1. 默认值只在当前聊天对象没有独立设置时使用。
   2. 设置页实际写入“当前面具 + 当前聊天对象”的 IndexedDB 记录，不同步给其它联系人。
   ========================================================================== */
export function getDefaultChatPromptSettings() {
  return {
    externalContextEnabled: false,
    /* ===== 闲谈应用：AI 表情包挂载分组 START ===== */
    mountedStickerGroupIds: [],
    /* ===== 闲谈应用：AI 表情包挂载分组 END ===== */
    /* ===== 闲谈应用：时间感知开关 START ===== */
    timeAwarenessEnabled: false,
    /* ===== 闲谈应用：时间感知开关 END ===== */
    currentCommand: '',
    customThinkingInstruction: '',
    /* ======================================================================
       [区域标注·已完成·本次修改·拍一拍设置默认值]
       说明：
       1. 保存聊天设置页“拍一拍”输入框内容，供消息气泡功能栏“拍拍”共用。
       2. 默认留空；触发“拍拍”时由 chat-user-pat.js 回退为“肩膀”。
       3. 该字段随当前面具 + 当前聊天对象设置走 DB.js / IndexedDB，不使用 localStorage/sessionStorage。
       ====================================================================== */
    userPatTargetText: '',
    /* ===== 闲谈应用：AI每轮回复气泡数量设置 START ===== */
    replyBubbleMin: 1,
    replyBubbleMax: 3,
    /* ===== 闲谈应用：AI每轮回复气泡数量设置 END ===== */

    /* ==========================================================================
       [区域标注·已完成·本次4项修改：短期/长期记忆设置默认值]
       说明：
       1. 短期记忆默认仍为 8；用户清空输入后会保存为空字符串，发送时按 0 轮处理。
       2. 长期记忆默认总结轮数为 3，修复重新进入后回到旧默认 8 的问题。
       3. 自动总结开关、人称选项和上次自动总结轮次均属于当前面具 + 当前聊天对象设置。
       4. 本默认值区不读写持久化存储；实际保存仍由 DB.js / IndexedDB 完成。
       ========================================================================== */
    /* ===== 闲谈应用：短期记忆轮数设置 START ===== */
    shortTermMemoryRounds: 8,
    /* ===== 闲谈应用：短期记忆轮数设置 END ===== */

    /* ===== 闲谈应用：长期记忆设置 START ===== */
    longTermMemorySummaryRounds: 3,
    longTermMemoryAutoSummaryEnabled: false,
    longTermMemoryManualSummaryEnabled: false,
    longTermMemoryLastAutoSummaryRoundIndex: 0,
    longTermMemorySummaryPerson: 'third',
    /* ===== 闲谈应用：长期记忆设置 END ===== */

    /* ===== 闲谈应用：HTML卡片开关设置 START ===== */
    htmlCardEnabled: false,
    /* ===== 闲谈应用：HTML卡片开关设置 END ===== */

    /* ======================================================================
       [区域标注·已完成·更换会话头像：向角色展示用户头像开关默认值]
       说明：
       1. 该开关仅作用于“当前面具 + 当前聊天对象”的独立聊天设置。
       2. 开启后，仅在最新一轮用户消息中向角色展示当前聊天界面实际使用的用户头像，并注入简短评论提示。
       3. 头像来源与聊天界面显示层保持一致：优先当前会话 userAvatar，缺失时回退到用户主页头像。
       4. 不使用 localStorage/sessionStorage，不写双份存储兜底。
       ====================================================================== */
    showUserAvatarToRole: false,

    /* ======================================================================
       [区域标注·本次修改·头像与备注3点需求：隐藏当前会话消息头像开关默认值]
       说明：
       1. 该开关仅作用于“当前面具 + 当前聊天对象”的独立聊天设置。
       2. 开启后，只隐藏当前会话窗口中的角色/用户消息头像，不影响档案、通讯录、顶部栏和其它联系人。
       3. 持久化统一由调用方写入 DB.js / IndexedDB；本默认值区不使用 localStorage/sessionStorage。
       ====================================================================== */
    hideAvatars: false,

    /* ======================================================================
       [区域标注·已完成·自主活动设置默认值]
       说明：
       1. 该设置仅作用于“当前面具 + 当前聊天对象”的独立聊天设置。
       2. 默认关闭“主动发朋友圈”，默认间隔为 1 小时。
       3. 持久化统一由调用方写入 DB.js / IndexedDB；本默认值区不使用 localStorage/sessionStorage。
       ====================================================================== */
    autonomousMomentsEnabled: false,
    autonomousMomentsIntervalValue: 1,
    autonomousMomentsIntervalUnit: 'hour',

    /* ======================================================================
       [区域标注·已完成·本次聊天背景大图修复：默认值保留 IndexedDB Blob 引用]
       说明：
       1. URL 背景继续使用 chatBackgroundSrc 保存 URL；本地背景使用 chatBackgroundMediaKey 指向 DB.js / IndexedDB Blob 记录。
       2. 本地大图不再写入 chatBackgroundSrc 的 data URL；运行时 objectURL 由聊天美化模块按 mediaKey 恢复。
       3. chatBackgroundSource 保存来源 local/url，避免本地图下次进入弹窗时被误放入 URL 页签。
       4. 本默认值区不使用 localStorage/sessionStorage，不写双份兜底，不做长文本字段过滤。
       ====================================================================== */
    chatBackgroundSrc: '',
    chatBackgroundSource: 'local',
    chatBackgroundMediaKey: ''
  };
}

/* ==========================================================================
   [区域标注] 聊天设置规范化
   ========================================================================== */
export function normalizeChatPromptSettings(rawSettings) {
  const defaults = getDefaultChatPromptSettings();
  const source = rawSettings && typeof rawSettings === 'object' ? rawSettings : {};
  const replyBubbleMin = Math.max(1, Math.floor(Number(source.replyBubbleMin ?? defaults.replyBubbleMin)) || defaults.replyBubbleMin);
  const replyBubbleMax = Math.max(replyBubbleMin, Math.floor(Number(source.replyBubbleMax ?? defaults.replyBubbleMax)) || defaults.replyBubbleMax);
  /* ==========================================================================
     [区域标注·已完成·本次4项修改：短期/长期记忆设置规范化]
     说明：
     1. 短期记忆轮数允许为空字符串；留空时发送链路按 0 轮处理，不强制回填默认数字。
     2. 长期记忆轮数允许为空字符串；留空时不自动总结、不手动总结。
     3. 长期记忆默认轮数已改为 3；自动总结开关按已保存布尔值恢复，只有用户手动关闭才关闭。
     4. 这里只规范化设置对象，不读写 localStorage/sessionStorage，也不写双份存储兜底。
     ========================================================================== */
  const hasShortTermMemoryRounds = Object.prototype.hasOwnProperty.call(source, 'shortTermMemoryRounds');
  const rawShortTermMemoryText = hasShortTermMemoryRounds ? String(source.shortTermMemoryRounds ?? '').trim() : '';
  const rawShortTermMemoryRounds = Number(rawShortTermMemoryText);
  const shortTermMemoryRounds = hasShortTermMemoryRounds && rawShortTermMemoryText === ''
    ? ''
    : (Number.isFinite(rawShortTermMemoryRounds)
        ? Math.max(0, Math.floor(rawShortTermMemoryRounds))
        : defaults.shortTermMemoryRounds);

  const hasLongTermMemorySummaryRounds = Object.prototype.hasOwnProperty.call(source, 'longTermMemorySummaryRounds');
  const rawLongTermMemorySummaryText = hasLongTermMemorySummaryRounds ? String(source.longTermMemorySummaryRounds ?? '').trim() : '';
  const rawLongTermMemorySummaryRounds = Number(rawLongTermMemorySummaryText);
  const longTermMemorySummaryRounds = hasLongTermMemorySummaryRounds && rawLongTermMemorySummaryText === ''
    ? ''
    : (Number.isFinite(rawLongTermMemorySummaryRounds)
        ? Math.max(0, Math.floor(rawLongTermMemorySummaryRounds))
        : defaults.longTermMemorySummaryRounds);
  const rawLongTermMemoryLastAutoRoundIndex = Number(source.longTermMemoryLastAutoSummaryRoundIndex ?? defaults.longTermMemoryLastAutoSummaryRoundIndex);
  const longTermMemorySummaryPerson = ['first', 'third'].includes(String(source.longTermMemorySummaryPerson || '').trim())
    ? String(source.longTermMemorySummaryPerson || '').trim()
    : defaults.longTermMemorySummaryPerson;

  const mountedStickerGroupIds = Array.isArray(source.mountedStickerGroupIds)
    ? Array.from(new Set(source.mountedStickerGroupIds.map(item => String(item || '').trim()).filter(Boolean)))
    : defaults.mountedStickerGroupIds;

  /* ========================================================================
     [区域标注·已完成·自主活动设置规范化]
     说明：
     1. 只规范化“自主活动”三个字段，不影响其它聊天设置。
     2. 时间间隔最小为 1；单位仅允许 minute/hour，对应应用内“分钟/小时”分段按钮。
     3. 本区不读写持久化存储，不使用 localStorage/sessionStorage。
     ======================================================================== */
  const rawAutonomousIntervalValue = Number(source.autonomousMomentsIntervalValue ?? defaults.autonomousMomentsIntervalValue);
  const autonomousMomentsIntervalValue = Number.isFinite(rawAutonomousIntervalValue)
    ? Math.max(1, Math.floor(rawAutonomousIntervalValue))
    : defaults.autonomousMomentsIntervalValue;
  const rawAutonomousIntervalUnit = String(source.autonomousMomentsIntervalUnit || defaults.autonomousMomentsIntervalUnit);
  const autonomousMomentsIntervalUnit = ['minute', 'hour'].includes(rawAutonomousIntervalUnit)
    ? rawAutonomousIntervalUnit
    : defaults.autonomousMomentsIntervalUnit;

  return {
    externalContextEnabled: Boolean(source.externalContextEnabled),
    /* ===== 闲谈应用：AI 表情包挂载分组 START ===== */
    mountedStickerGroupIds,
    /* ===== 闲谈应用：AI 表情包挂载分组 END ===== */
    /* ===== 闲谈应用：时间感知开关 START ===== */
    timeAwarenessEnabled: Boolean(source.timeAwarenessEnabled),
    /* ===== 闲谈应用：时间感知开关 END ===== */
    currentCommand: String(source.currentCommand || defaults.currentCommand),
    customThinkingInstruction: String(source.customThinkingInstruction || defaults.customThinkingInstruction),
    /* ======================================================================
       [区域标注·已完成·本次修改·拍一拍设置规范化]
       说明：
       1. 规范化聊天设置页“拍一拍”输入框内容，供消息气泡功能栏“拍拍”共用。
       2. 这里只保留原始短文本设置，不在 prompt 中注入额外规则，不新增任何双份存储。
       3. 持久化仍由调用方通过 DB.js / IndexedDB 写入当前面具 + 当前聊天对象设置。
       ====================================================================== */
    userPatTargetText: String(source.userPatTargetText || defaults.userPatTargetText),

    /* ===== 闲谈应用：AI每轮回复气泡数量设置 START ===== */
    replyBubbleMin,
    replyBubbleMax,
    /* ===== 闲谈应用：AI每轮回复气泡数量设置 END ===== */

    /* ===== 闲谈应用：短期记忆轮数设置 START ===== */
    shortTermMemoryRounds,
    /* ===== 闲谈应用：短期记忆轮数设置 END ===== */

    /* ==========================================================================
       [区域标注·已完成·本次4项修改：长期记忆设置规范化输出]
       说明：
       1. 输出长期记忆总结轮数、自动总结开关、手动总结运行态、上次自动总结轮次和总结人称。
       2. 这些字段供记忆设置页渲染/保存，以及长期记忆自动总结入口读取。
       3. 不使用 localStorage/sessionStorage，不写双份存储兜底。
       ========================================================================== */
    /* ===== 闲谈应用：长期记忆设置 START ===== */
    longTermMemorySummaryRounds,
    longTermMemoryAutoSummaryEnabled: Boolean(source.longTermMemoryAutoSummaryEnabled),
    longTermMemoryManualSummaryEnabled: Boolean(source.longTermMemoryManualSummaryEnabled),
    longTermMemoryLastAutoSummaryRoundIndex: Number.isFinite(rawLongTermMemoryLastAutoRoundIndex)
      ? Math.max(0, Math.floor(rawLongTermMemoryLastAutoRoundIndex))
      : defaults.longTermMemoryLastAutoSummaryRoundIndex,
    longTermMemorySummaryPerson,
    /* ===== 闲谈应用：长期记忆设置 END ===== */

    /* ===== 闲谈应用：HTML卡片开关设置 START ===== */
    htmlCardEnabled: Boolean(source.htmlCardEnabled),
    /* ===== 闲谈应用：HTML卡片开关设置 END ===== */

    /* ======================================================================
       [区域标注·已完成·更换会话头像：向角色展示用户头像开关规范化]
       说明：
       1. 该字段只读取当前聊天设置中的 showUserAvatarToRole。
       2. 是否展示由当前聊天开关与当前聊天界面实际使用的用户头像共同决定。
       3. 头像来源与聊天界面显示层保持一致：优先当前会话 userAvatar，缺失时回退到用户主页头像。
       ====================================================================== */
    showUserAvatarToRole: Boolean(source.showUserAvatarToRole),

    /* ======================================================================
       [区域标注·本次修改·头像与备注3点需求：隐藏当前会话消息头像开关规范化]
       说明：
       1. 该字段只读取当前聊天设置中的 hideAvatars。
       2. 该字段仅控制当前会话窗口消息头像显示，不参与头像资料写入。
       3. 不使用 localStorage/sessionStorage，不写双份存储兜底。
       ====================================================================== */
    hideAvatars: Boolean(source.hideAvatars),

    /* ======================================================================
       [区域标注·已完成·自主活动设置规范化输出]
       说明：
       1. 输出字段供聊天设置页“自主活动”模块渲染、同步与保存使用。
       2. 当前模块只保存设置值，不在 prompt 中额外注入主动发朋友圈逻辑。
       3. 不使用 localStorage/sessionStorage，不写双份存储兜底。
       ====================================================================== */
    autonomousMomentsEnabled: Boolean(source.autonomousMomentsEnabled),
    autonomousMomentsIntervalValue,
    autonomousMomentsIntervalUnit,

    /* ======================================================================
       [区域标注·已完成·本次聊天背景大图修复：规范化保留 IndexedDB Blob 引用]
       说明：
       1. 将 chatBackgroundSrc / chatBackgroundSource / chatBackgroundMediaKey 纳入聊天设置白名单，避免从 IndexedDB 读取后被规范化丢弃。
       2. URL 背景保存 URL；本地背景保存轻量 mediaKey，并由聊天美化模块读取 DB.js / IndexedDB Blob 生成运行时 objectURL。
       3. chatBackgroundSource 只允许 local/url；旧数据没有来源时，按 mediaKey、data:image 或 blob: 自动识别为 local。
       4. 不使用 localStorage/sessionStorage，不写双份存储兜底，不做长文本字段过滤。
       ====================================================================== */
    chatBackgroundSrc: String(source.chatBackgroundSrc || defaults.chatBackgroundSrc).trim(),
    chatBackgroundSource: ['local', 'url'].includes(String(source.chatBackgroundSource || '').trim())
      ? String(source.chatBackgroundSource || '').trim()
      : (
          String(source.chatBackgroundMediaKey || '').trim()
          || String(source.chatBackgroundSrc || '').trim().startsWith('data:image/')
          || String(source.chatBackgroundSrc || '').trim().startsWith('blob:')
            ? 'local'
            : defaults.chatBackgroundSource
        ),
    chatBackgroundMediaKey: String(source.chatBackgroundMediaKey || defaults.chatBackgroundMediaKey).trim()
  };
}

/* ==========================================================================
   [提示词区域 1] 世界书置顶条目
   说明：包括全局世界书和角色绑定世界书中已开启/激活且位置为“置顶”的条目。
   ========================================================================== */
export function getWorldBookTop(context = {}) {
  return formatWorldBookEntriesByPosition('top', context);
}

/* ==========================================================================
   [提示词区域 5] 世界书角色前条目
   说明：包括全局世界书和角色绑定世界书中已开启/激活且位置为“角色前”的条目。
   ========================================================================== */
export function getWorldBookBeforeChar(context = {}) {
  return formatWorldBookEntriesByPosition('beforeChar', context);
}

/* ==========================================================================
   [提示词区域 2] 角色卡人设及其绑定关系网络
   说明：
   1. 本区域告诉 AI 要扮演哪个角色，并发送该角色的档案字段与绑定关系网。
   2. 只发送姓名、性别、年龄、身份、联系方式、个性签名、人物设定和关系网络。
   3. personalitySetting 在角色档案中显示为“人物设定”，长文本不再因超过 1200 字被误过滤。
   4. 不发送角色开场白 greetings，不发送角色绑定世界书名称 boundWorldBooks。
   5. 若未匹配到当前聊天角色档案，本区域会保持为空而不是编造档案内容。
   6. 本区域只读取 DB.js / IndexedDB 已有档案数据，不使用 localStorage/sessionStorage。
   ========================================================================== */
export function getCharacterCard(context = {}) {
  const character = context.currentCharacter || getCurrentCharacter(context);

  const characterFields = character && typeof character === 'object'
    ? getCharacterPromptFieldEntries(character, [
        'name',
        'gender',
        'age',
        'identity',
        'contact',
        'signature',
        'personalitySetting'
      ], 'character')
        .map(entry => `${entry.label}：${entry.formatted}`)
        .join('\n')
    : '';

  return createPromptSection('角色卡人设及其绑定关系网络', [
    character ? '这是你，不是 AI助手，这是你要扮演的角色。' : '',
    character ? '以下“人物设定”是当前角色的核心事实；用户询问年龄、身份、经历、关系时必须优先读取本区域，禁止编造。' : '',
    character ? '人物设定如含 YAML/Markdown，按结构化角色事实读取。' : '',
    /* 角色档案性别硬约束与“双性”释义注入 */
    createArchiveGenderPromptNote(character, '当前聊天对象/角色档案'),
    characterFields,
    formatCharacterRelationNetwork(context, character)
  ].filter(Boolean).join('\n\n'));
}

/* ==========================================================================
   [提示词区域 3] 用户面具身份及其绑定关系网络
   说明：
   1. 只发送姓名、性别、年龄、身份、联系方式、个性签名、用户设定和绑定关系网络。
   2. 用户设定读取档案应用实际保存字段 personalitySetting，并显示为“用户设定”。
   3. personalitySetting 长文本不再因超过 1200 字被误过滤。
   4. 不发送昵称 nickname、头像或未提到的其它面具字段，不使用 localStorage/sessionStorage。
   5. 若当前面具未匹配到有效档案，本区域保持为空而不是编造面具内容。
   ========================================================================== */
export function getUserPersona(context = {}) {
  const mask = context.currentMask || getCurrentMask(context);
  const personaText = mask && typeof mask === 'object'
    ? getCharacterPromptFieldEntries(mask, [
        'name',
        'gender',
        'age',
        'identity',
        'contact',
        'signature',
        'personalitySetting'
      ], 'mask')
        .map(entry => `${entry.label}：${entry.formatted}`)
        .join('\n')
    : '';

  /* 用户面具身份绑定的档案关系网络 */
  const relationNetworkText = formatUserPersonaRelationNetwork(context, mask);

  return createPromptSection('用户面具身份', [
    mask ? '这是你的对话对象。' : '',
    /* 用户面具性别硬约束与“双性”释义注入 */
    createArchiveGenderPromptNote(mask, '用户面具'),
    personaText,
    relationNetworkText
  ].filter(Boolean).join('\n\n'));
}

/* ==========================================================================
   [提示词区域 4·已完成·旧事闲谈长期记忆接入 / 短期记忆说明]
   说明：
   1. 本区域负责当前会话、联系人备注、旧事闲谈长期记忆与短期记忆说明。
   2. 旧事长期记忆只来自 memory 应用当前角色 chat-memory 中允许注入的 longterm 条目。
   3. 短期历史正文不塞进本 system 区域，仍由 buildChatMessages -> getChatHistory 以真实 user/assistant messages 追加。
   4. 本区只处理本轮请求提示词；不写持久化存储，不使用 localStorage/sessionStorage。
   ========================================================================== */
export function getMemories(context = {}) {
  const lines = [];
  const session = context.currentSession || {};
  const contact = context.currentContact || {};

  if (hasReadableValue(session)) {
    const sessionText = formatReadableValue({
      会话名称: session.name,
      会话类型: session.type,
      最近消息: session.lastMessage
    });
    if (sessionText) lines.push(`当前会话：\n${sessionText}`);
  }

  if (hasReadableValue(contact)) {
    const contactText = formatReadableValue({
      联系人名称: contact.name,
      联系人签名: contact.signature,
      联系方式: contact.contact,
      备注: contact.remark || contact.notes
    });
    if (contactText) lines.push(`联系人资料：\n${contactText}`);
  }

  const oldStoryLongTermMemories = formatOldStoryChatLongTermMemoriesForPrompt(context);
  const shortTermMemoryNotice = buildShortTermMemoryNotice(context.history);

  return createPromptSection('角色记忆 / 旧事长期记忆 / 短期记忆说明', [
    lines.join('\n\n'),
    oldStoryLongTermMemories,
    shortTermMemoryNotice
  ].filter(Boolean).join('\n\n'));
}

/* ==========================================================================
   [提示词区域 6] 世界书角色后条目
   说明：包括全局世界书和角色绑定世界书中已开启/激活且位置为“角色后”的条目。
   ========================================================================== */
export function getWorldBookAfterChar(context = {}) {
  return formatWorldBookEntriesByPosition('afterChar', context);
}

/* ==========================================================================
   [提示词区域 6-A] 世界书条目格式化
   说明：
   1. 按位置、启用状态、绑定角色、关键词触发规则筛选世界书。
   2. 关键词触发只匹配“用户本次输入”；历史消息不参与触发。
   3. 支持最多 2 层递归扫描；递归控制字段只由代码使用。
   4. 最终只发送条目正文给 AI，不发送世界书名称、条目名称或触发元信息。
   ========================================================================== */
function getWorldBookCandidateEntriesByPosition(position, context = {}) {
  const books = Array.isArray(context.worldBooks) ? context.worldBooks : [];
  const characterId = context.currentCharacterId || getCurrentCharacterId(context);

  return books
    .filter(book => isWorldBookAvailableForCharacter(book, characterId))
    .flatMap(book => {
      const entries = Array.isArray(book.entries) ? book.entries : [];
      return entries
        .filter(entry => entry?.position === position && entry.enabled !== false)
        .map(entry => ({ ...entry, __worldBookId: book.id || '' }));
    })
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
}

function collectActivatedWorldBookEntries(position, context = {}) {
  const candidates = getWorldBookCandidateEntriesByPosition(position, context);
  const activated = [];
  const activatedIds = new Set();
  const initialSourceText = String(context.userInput || '');
  let scanSources = [initialSourceText];
  let stopFurtherRecursion = false;

  for (let depth = 1; depth <= WORLDBOOK_MAX_RECURSION_DEPTH && scanSources.length && !stopFurtherRecursion; depth += 1) {
    const nextScanSources = [];
    const allowAlways = depth === 1;

    candidates.forEach((entry, index) => {
      const entryKey = String(entry.id || `${entry.__worldBookId || 'book'}::${position}::${index}`);
      if (activatedIds.has(entryKey)) return;

      const matched = scanSources.some(sourceText => canWorldBookEntryActivate(entry, sourceText, { allowAlways }));
      if (!matched) return;

      const content = normalizePlainText(entry.content);
      if (!content) return;

      activatedIds.add(entryKey);
      activated.push(entry);

      if (entry.preventFurtherRecursion) {
        stopFurtherRecursion = true;
        return;
      }

      if (!entry.disableRecursion) {
        nextScanSources.push(content);
      }
    });

    scanSources = nextScanSources;
  }

  return activated.sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
}

function formatWorldBookEntriesByPosition(position, context = {}) {
  const chunks = collectActivatedWorldBookEntries(position, context)
    .map(entry => normalizePlainText(entry.content))
    .filter(Boolean);

  const sectionTitleMap = {
    top: '世界书置顶条目',
    beforeChar: '世界书角色前条目',
    afterChar: '世界书角色后条目'
  };

  const content = (position === 'beforeChar' || position === 'afterChar') && chunks.length
    ? ['以下是你的所有言行必须严格遵守的世界设定,严禁出现逻辑冲突。', ...chunks].join('\n\n')
    : chunks.join('\n\n');

  return createPromptSection(sectionTitleMap[position] || '世界书条目', content);
}

/* ==========================================================================
   [提示词区域 7] 聊天功能格式要求
   说明：本函数返回值会进入 system prompt。
   ========================================================================== */
export function getFeaturePrompts({ settings = {}, imageApi = null } = {}) {
  const normalizedSettings = normalizeChatPromptSettings(settings);
  const minBubble = normalizedSettings.replyBubbleMin;
  const maxBubble = normalizedSettings.replyBubbleMax;
  const htmlCardEnabled = Boolean(normalizedSettings.htmlCardEnabled);
  const htmlCardPrompt = htmlCardEnabled ? getHtmlCardFeaturePrompt() : '';

  /* ======================================================================
     [区域标注·已完成·AI文字图/生图互斥提示词入口]
     说明：
     1. 生图 API 未开启或配置不完整：通用协议只暴露 [文字图]，不暴露 [图片] 或生图 API 格式。
     2. 生图 API 已开启且配置完整：通用协议只暴露 [图片]，禁发 [文字图]。
     3. 本区域只根据 SettingsStore -> DB.js / IndexedDB 读取到的 imageApi 运行时状态拼装提示词，不新增存储。
     ====================================================================== */
  const imageApiReady = isChatImageApiReady(imageApi);
  const visualProtocolName = imageApiReady ? '图片' : '文字图';
  const visualProtocolFormat = imageApiReady
    ? '**`[图片] 角色名：给生图模型的画面描述`**'
    : '**`[文字图] 角色名：图片中文字内容`**';
  /* ======================================================================
     [区域标注·已完成·AI语音消息提示词协议]
     说明：
     1. 本区明确给 AI 开放 [语音] 协议，让 AI 可在聊天消息界面主动发送语音消息。
     2. 语音内容必须是“语音转写文本”，前端会解析为语音气泡，默认不直接展开文字。
     3. 仅更新闲谈语音协议提示，不新增持久化存储，不使用 localStorage/sessionStorage。
     ====================================================================== */
  /* ======================================================================
     [区域标注·已完成·本次修改·AI拍一拍趣味文案协议]
     说明：
     1. 本区给 AI 开放 [拍一拍] 协议，前端会渲染为聊天页系统提示小字。
     2. 已从“只能写身体部位”升级为“身体部位｜短趣味补充”，让系统小字可呈现鼓励、夸夸、撒娇等轻量趣味文案。
     3. 仅调整本轮系统提示词，不新增持久化存储，不使用 localStorage/sessionStorage。
     ====================================================================== */
  const patRuleText = '8. 拍一拍：**`[拍一拍] 角色名：身体部位｜短趣味补充`**，像 QQ/微信戳一戳；只在想轻轻提醒用户回复、安慰、撒娇、逗用户或贴合当前情绪时偶尔使用。内容先写一个身体部位，再可用“｜”补一句短趣味文案，例如“肩膀｜为你加油鼓劲儿”“小脸蛋｜说：真可爱”“脑袋｜提醒你别熬太晚”；补充文案必须短、轻、像系统小字，不要写长段动作、舞台描写、现实物理接触、URL、Markdown 或幕后解释。不确定就只写身体部位。';
  const voiceRuleText = '9. 语音：**`[语音] 角色名：{时长:xx}语音转写文本`**，只在比普通文字更像真实聊天时使用；时长为 1-60 秒整数，内容是语音转文字文本，禁止 URL、音频文件名、base64、Markdown 链接、系统说明或“我正在发送语音”等幕后话。';
  const visualRuleText = imageApiReady
    ? '10. 图片：**`[图片] 角色名：画面描述`**，只在【AI生图能力】允许时使用；内容是给生图模型的画面提示词，禁止 URL、资源ID、API 或幕后说明；生图 API 已开启时严禁输出 [文字图]。'
    : '10. 文字图：**`[文字图] 角色名：图片中文字内容`**，只在【AI文字图能力】允许时使用；内容就是图片上要显示的文字；禁止 URL、资源ID、API、Markdown 链接、幕后说明或 [图片]。';

  /* ======================================================================
     [区域标注·已完成·HTML卡片开关关闭时彻底移除卡片协议提示]
     说明：
     1. 当 HTML 卡片开关关闭时，system prompt 中不再暴露 [卡片] 协议、自检项、格式要求或能力说明。
     2. 只有开关开启时，才把 [卡片] 加入已开放格式与协议规则，避免误导模型继续输出 HTML 卡片并额外消耗 token。
     3. 本区域只调整提示词拼装，不改其它聊天功能、不新增任何本地同步存储。
     ====================================================================== */
  const availableFormats = htmlCardEnabled
    ? [...CHAT_PROTOCOL_AVAILABLE_FORMATS, visualProtocolFormat, '**`[卡片] 角色名：HTML内容`**']
    : [...CHAT_PROTOCOL_AVAILABLE_FORMATS, visualProtocolFormat];
  const protocolChecklistText = htmlCardEnabled
    ? `[回复]/[表情]/[引用]/[转账]/[礼物]/[撤回]/[拍一拍]/[语音]/[${visualProtocolName}]/[卡片]`
    : `[回复]/[表情]/[引用]/[转账]/[礼物]/[撤回]/[拍一拍]/[语音]/[${visualProtocolName}]`;
  const cardRuleText = htmlCardEnabled
    ? '11. 卡片：**`[卡片] 角色名：HTML内容`**，只在 HTML 卡片开启时使用；HTML 必须与当前对话强相关、可直接渲染、手机窄屏、北欧暖色风。'
    : '11. HTML 卡片当前未开启；禁止输出 [卡片] 协议、HTML 代码、srcdoc、CSS 卡片模板或任何卡片格式要求。';

  return [
    /* --------------------------------------------------------------------------
       [功能规则·临时状态指令 SYSTEM_TEMP]
       说明：这段规则固定放在 getFeaturePrompts 返回值最前面。
       -------------------------------------------------------------------------- */
    `当收到的用户消息中出现以 [SYSTEM_TEMP] 开头、[/SYSTEM_TEMP] 结尾的段落时，
这是当前最高优先级的临时状态指令。
你必须严格遵从并立即调整语气或状态，但这段指令本身绝不能出现在回复里。
同时这段指令不能覆盖或删除【可用聊天动作格式】里的任何格式规则，
除非指令自己明确要求使用或禁止某种特定格式。`,

    /* --------------------------------------------------------------------------
       ===== 闲谈应用：线上聊天气泡数量与节奏规则 START =====
       说明：下次如需修改 AI 每轮回复气泡数量、标点、错字、手机聊天节奏，优先改这里。
       -------------------------------------------------------------------------- */
    /* --------------------------------------------------------------------------
       [功能规则·已更新·本次省略号、引号拆泡与句末标点统一修复：线上聊天与气泡规则]
       说明：
       1. 明确“协议块边界”只依赖 [类型] 角色名：内容 与下一协议块，不依赖句末句号，也不把普通聊天内容里的冒号当拆泡依据。
       2. 已强化闲聊 [回复] 的句末风格统一：短句、语气词、emoji、颜文字默认不补句号，避免模型一整轮机械补句号或忽有忽无。
       3. 已补充省略号与引号规则：省略号统一写成 “……”，成对引号里的内容不要拆成多个气泡。
       4. 前端解析已按协议块/自然断句防掉格式；本区只调整提示词约束，不改持久化存储。
       -------------------------------------------------------------------------- */
    `# 线上聊天输出硬性规则（必须遵守）
1. 当前是手机/电脑等电子平台上的社交软件聊天，不是面对面交流；最终内容必须像真实聊天气泡。
2. 禁止描写隔着屏幕不可能发生的物理接触、同空间动作、神态观察或舞台旁白；现实距离确已缩短时也只能按线上消息语境表达。
3. 用户发图片/表情包时，只能回应“图片/表情包内容、风格、梗图氛围”，禁止当成用户真人表情、眼神或现场动作。
4. 输出前先决定本轮目标协议块数 N，N 必须在 ${minBubble}-${maxBubble} 之间；除非用户本轮明确要求改变数量，最终完整协议块总数必须等于 N。
5. 每个文字气泡只放一句话，必须使用 ${CHAT_PROTOCOL_REPLY_FORMAT}；多句话拆成多个协议块，禁止长段落、编号列表、气泡序号或说明文字；协议块边界由“[类型] 角色名：内容”和下一条协议块识别，绝不依赖句号兜底，也不要把普通聊天内容里的冒号当成额外拆泡标记。
6. 角色名填写当前聊天对象名称；内容只放真正要显示给用户的话；如果一句话里出现成对双引号/单引号/中式引号，整段引号内容必须留在同一个气泡内，不要把引号前后拆开。
7. 句末标点必须自然口语化且同一轮风格尽量统一：闲聊 [回复] 默认不要机械补句号；短句、语气词、emoji、颜文字不要为了显得完整而补“。”，例如“啊”“嗯”“好”“哈哈”“🥺”“QAQ”可直接结束；只有确实需要完整停顿或正式陈述的长句，才少量自然使用逗号/句号/问号/叹号，禁止一整轮每个气泡都生硬地统一补句号，也禁止忽然一轮全有句号、下一轮全无句号却没有语气变化依据。
8. 省略号统一使用中文“……”，不要写“...”、“......”或“。。。”。
9. 正式输出前自检 ${protocolChecklistText} 完整协议块数量与格式；自检只检查协议头、角色名、冒号、内容和块数，不要求每个内容都以句号结尾，不合格就后台重写。`,

    /* ===== 闲谈应用：线上聊天气泡数量与节奏规则 END ===== */

    /* --------------------------------------------------------------------------
       [功能规则·已完成·本次消息掉格式修复] 可用聊天动作格式
       说明：
       1. 保留必要格式约束，去除重复示例与重复说明。
       2. 本区已强化“可见协议块 + 心声独立行”的边界，防止裸露协议头、Markdown 残片、心声竖线块或格式检查文字进入聊天气泡。
       3. 单击 AI 消息气泡 → 修正 → 文本，可修复已经落库的普通文本掉格式消息。
       -------------------------------------------------------------------------- */
    /* ===== 闲谈：通用消息协议格式 START ===== */
    `# 可用聊天动作格式
1. 最终回复先输出可见聊天消息；可见聊天消息只能由完整协议块组成，格式：**\`[类型] 角色名：内容\`**。若另有【心声协议】，心声只能在所有可见协议块之后单独一行，绝不能写进任何聊天气泡内容。
2. 已开放格式：
${availableFormats.map(item => `- ${item}`).join('\n')}
3. [回复] 是普通文字；[表情] 只能用【AI可用表情包资源】里的资源ID或完全一致表情名；[引用] 只能用【本轮用户消息·可引用】提供的ID，且 {引用ID:xxx} 后只能写角色自己的新回应；[转账]/[礼物]/[拍一拍]/[语音]/[${visualProtocolName}] 需符合对应能力、人设和当前情景；${imageApiReady ? '生图 API 已开启，严禁输出 [文字图]；' : '当前只开放 [文字图]，严禁输出 [图片]；'}${htmlCardEnabled ? '[卡片] 也必须严格符合当前对话场景与卡片能力要求；' : 'HTML 卡片未开启，严禁输出 [卡片]；'}不确定就改用 [回复]。
4. 表情包只代表图片内容，不代表用户真人神态；引用必须同时理解“被引用原消息 + 用户新输入”，禁止编造历史引用ID，禁止把被引用原文或用户最新原话搬到正文里，禁止在正文开头写“我：”“用户：”“对方：”等说话人前缀；禁止输出“可引用ID:”“引用原消息发送者：”“引用原消息内容：”等后台提示字段。
5. 转账：主动转账用 **\`[转账] 角色名：{金额:88.88,备注:奶茶钱}\`**；处理待确认转账只用 **\`{操作:接收/退回,转账ID:系统给出的ID,备注:可选}\`**。
6. 礼物：**\`[礼物] 角色名：{名称:一束白郁金香,备注:路过花店时觉得很适合你}\`**；备注短且自然，禁止价格、URL、系统说明。
7. 撤回：只在角色真实有动机时使用 **\`[撤回] 角色名：{目标:上一条}\`**，且只能撤回本轮位于它前面的上一条 AI 消息；多条撤回必须逐条输出，禁止 {条数:N}/{目标:全部}/“撤回了N条消息”。
${patRuleText}
${voiceRuleText}
${visualRuleText}
${cardRuleText}
12. 每个可见协议块独占一条消息；除【心声协议】允许的最后独立行外，禁止裸协议头、半截 Markdown、代码块、编号列表、格式检查、幕后思考、系统规则、时间感知标注、心声竖线字段或任何审查痕迹。`,
    /* ===== 闲谈：通用消息协议格式 END ===== */

    /* ======================================================================
       [区域标注·已完成·HTML卡片提示词注入]
       说明：
       1. 只有聊天设置页开启 HTML 卡片开关后，才给 AI 注入独立卡片系统提示词。
       2. 关闭时完全不注入，不保留双份兜底提示。
       ====================================================================== */
    htmlCardPrompt
  ].filter(Boolean).join('\n\n');
}

/* ==========================================================================
   [提示词区域 7-B] AI 视觉发送能力互斥提示
   说明：
   1. 生图 API 未开启或配置不完整时，只注入 [文字图] 能力提示；不发送任何“生图 API”格式要求。
   2. 生图 API 已开启且配置完整时，只注入 chat-image-generation.js 的 [图片] 生图提示；禁发文字图。
   3. 本区域只使用运行时 imageApi 状态，不新增持久化存储，不使用 localStorage/sessionStorage。
   ========================================================================== */
function buildChatVisualMessageCapabilityPrompt({ imageApi } = {}) {
  if (isChatImageApiReady(imageApi)) {
    return buildChatImageGenerationPrompt({ imageApi });
  }

  return createPromptSection('AI文字图能力', `# AI 文字图规则
1. 当前只允许用 [文字图] 发送图片感内容；严禁输出 [图片]，也不要提接口、模型或生成过程。
2. 格式：**\`[文字图] 角色名：图片中文字内容\`**。
3. 内容就是图片上要显示给用户看的文字，适合便签、截图感、拍立得文字、手写感小纸条；要短、自然、贴合当前聊天。
4. 禁止 URL、资源ID、Markdown 链接、代码块、API 说明或“我正在生成图片”等幕后话。
5. 只有文字图比普通聊天气泡更自然时才使用；否则用 [回复]。`);
}

/* ==========================================================================
   [提示词区域 8] 外部应用上下文
   说明：只在聊天设置中开启“外部应用消息注入”时注入。
   ========================================================================== */
export function getExternalContext({ enabled = false, context = {} } = {}) {
  if (!enabled) return '';

  const archive = context.archiveData || {};
  const characterCount = Array.isArray(archive.characters) ? archive.characters.length : 0;
  const maskCount = Array.isArray(archive.masks) ? archive.masks.length : 0;
  const worldBookCount = Array.isArray(context.worldBooks) ? context.worldBooks.length : 0;

  return createPromptSection('外部应用上下文', [
    `当前激活面具ID：${context.activeMaskId || '未设置'}`,
    `档案应用：${maskCount} 个用户面具，${characterCount} 个角色档案。`,
    `世情应用：${worldBookCount} 本世界书可供筛选。`
  ].join('\n'));
}

/* ==========================================================================
   [提示词区域 8-B] AI 已挂载表情包资源
   说明：
   1. 只把当前面具已挂载分组下的表情包资源发给 AI。
   2. AI 如需发送表情包，必须使用 [表情] 协议，并且只能从以下资源中选择。
   3. 为减少匹配歧义，优先让 AI 输出资源ID；前端同时兼容资源ID和表情名。
   ========================================================================== */
export function getMountedStickerPrompt({ settings = {}, context = {} } = {}) {
  const normalizedSettings = normalizeChatPromptSettings(settings);
  const stickerData = normalizeStickerPromptData(context.stickerData);
  const mountedGroupIds = Array.isArray(normalizedSettings.mountedStickerGroupIds)
    ? normalizedSettings.mountedStickerGroupIds.map(String)
    : [];

  if (!mountedGroupIds.length) {
    return createPromptSection('AI可用表情包资源', [
      '当前没有给你挂载任何表情包分组。',
      '因此你这轮只能使用 [回复] 协议发送文字消息，禁止输出 [表情] 协议。'
    ].join('\n'));
  }

  const groupNameMap = new Map([
    ['all', 'All'],
    ...stickerData.groups.map(group => [group.id, group.name])
  ]);

  const availableItems = mountedGroupIds.includes('all')
    ? stickerData.items
    : stickerData.items.filter(item => mountedGroupIds.includes(String(item.groupId || 'all')));

  const mountedGroupNames = mountedGroupIds.map(groupId => groupNameMap.get(groupId) || groupId);

  if (!availableItems.length) {
    return createPromptSection('AI可用表情包资源', [
      `当前已挂载分组：${mountedGroupNames.join('、') || '无'}`,
      '但这些分组下暂时没有有效表情包资源。',
      '因此你这轮只能使用 [回复] 协议发送文字消息，禁止输出 [表情] 协议。'
    ].join('\n'));
  }

  const stickerLines = availableItems.map((item, index) => (
    `${index + 1}. 表情名：${item.name}；资源ID：${item.id}；分组：${groupNameMap.get(item.groupId) || item.groupId || 'All'}`
  ));

  return createPromptSection('AI可用表情包资源', [
    `当前已挂载分组：${mountedGroupNames.join('、')}`,
    '如果你判断当前聊天情景适合发表情包，可以发送 [表情] 协议。',
    '发送 [表情] 协议时，优先使用“资源ID”作为内容；若使用表情名，也必须与以下清单完全一致。',
    '严格格式示例：**`[表情] 角色名：sticker_xxx`**；不要输出 URL、解释文字、Markdown 链接或多余标点。',
    '你只能从下面这些资源里选择，不得编造新表情：',
    stickerLines.join('\n')
  ].join('\n'));
}

/* ==========================================================================
   [提示词区域 8-A·已完成·本次需求1：时间流逝与生活事件状态强化] 强化时间感知
   说明：
   1. 只有当前聊天对象的聊天设置页“时间感知”开关开启时才注入。
   2. 当前真实时间在每次请求 API 时即时生成，不写入持久化存储。
   3. 已补充“本轮用户实际回复时间、上一条 AI 回复时间、上一段聊天到本轮的间隔、是否跨自然日”，用于纠正“凌晨旧回复被早上继续当作现在”的错乱。
   4. 已强化“忘记回/刚看到/之前忘回”类表达：必须先按本轮真实时间与上一条 AI 回复时间计算跨度，不允许停在上一轮旧时段。
   5. 已补强外卖/吃饭/洗澡/通勤等生活事件的状态推进，避免长时间后仍停留在不合理的未完成状态。
   6. 保留跨零点相对日期重算、真实时段感知、现实耗时约束、久未回复感、睡眠时段纠偏与禁止泄露后台时间标注。
   7. 本区域只做运行时提示词注入；不使用 localStorage/sessionStorage，不写双份存储兜底。
   ========================================================================== */
function getCurrentRealDate() {
  return new Date();
}

function getBeijingDateTimeParts(date = getCurrentRealDate()) {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    /* IANA 标准中中国标准时间常用 Asia/Shanghai；这里只用于计算北京时间，不把“上海”写入提示词。 */
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(date);

  const getPart = type => parts.find(part => part.type === type)?.value || '';
  const hour = getPart('hour') === '24' ? '00' : getPart('hour');

  return {
    year: getPart('year'),
    month: getPart('month'),
    day: getPart('day'),
    weekday: getPart('weekday'),
    hour,
    minute: getPart('minute'),
    second: getPart('second')
  };
}

function getTimePeriodLabelForPrompt(hourText = '00', minuteText = '00') {
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const totalMinutes = (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0);

  if (totalMinutes < 6 * 60) return '凌晨';
  if (totalMinutes < 9 * 60) return '早上';
  if (totalMinutes < 11 * 60 + 30) return '上午';
  if (totalMinutes < 13 * 60 + 30) return '中午';
  if (totalMinutes < 18 * 60) return '下午';
  if (totalMinutes < 23 * 60) return '晚上';
  return '深夜';
}

function formatCurrentTimeCompactForPrompt(date = getCurrentRealDate()) {
  const parts = getBeijingDateTimeParts(date);
  const period = getTimePeriodLabelForPrompt(parts.hour, parts.minute);
  return `${parts.year}-${parts.month}-${parts.day} ${parts.weekday} ${parts.hour}:${parts.minute}（${period}）`;
}

function formatDateForTimeAwareness(date = getCurrentRealDate()) {
  const parts = getBeijingDateTimeParts(date);
  return `${parts.year}-${parts.month}-${parts.day} ${parts.weekday} ${parts.hour}:${parts.minute}:${parts.second}`;
}

/* [区域标注·已完成·本次时间感知关键跨度精简锚定] 紧凑显示 24 小时制时间与时段，供“AI至本轮”跨度锚点使用。 */
function formatTimeAnchorCompactForPrompt(date = getCurrentRealDate()) {
  const parts = getBeijingDateTimeParts(date);
  const period = getTimePeriodLabelForPrompt(parts.hour, parts.minute);
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}（${period}）`;
}

function formatRelativeDurationForPrompt(ms) {
  const value = Math.max(0, Number(ms) || 0);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (value < minute) return '不到1分钟';
  if (value < hour) return `${Math.floor(value / minute)}分钟`;
  if (value < day) {
    const hours = Math.floor(value / hour);
    const minutes = Math.floor((value % hour) / minute);
    return minutes ? `${hours}小时${minutes}分钟` : `${hours}小时`;
  }

  const days = Math.floor(value / day);
  const hours = Math.floor((value % day) / hour);
  return hours ? `${days}天${hours}小时` : `${days}天`;
}

function getMessageTimestamp(item) {
  const timestamp = Number(item?.timestamp || item?.createdAt || item?.time || 0);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0;
}

function getShanghaiDateParts(date = getCurrentRealDate()) {
  const parts = getBeijingDateTimeParts(date);

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day
  };
}

function isDifferentShanghaiDate(leftDate, rightDate) {
  const left = getShanghaiDateParts(leftDate);
  const right = getShanghaiDateParts(rightDate);
  return left.year !== right.year || left.month !== right.month || left.day !== right.day;
}

/* ========================================================================
   [区域标注·已完成·本次需求1·时间感知自然日差修复]
   说明：
   1. 计算上海时区下的“自然日差”，避免只按小时差粗略判断，导致好几天前被误当成昨天。
   2. 该计算只在本轮 API 请求时运行，不写入持久化存储，不使用 localStorage/sessionStorage。
   3. 结果会进入精简时间感知提示词，供 AI 明确区分“今天/昨天/N天前”。
   ======================================================================== */
function getShanghaiDayIndex(date = getCurrentRealDate()) {
  const parts = getShanghaiDateParts(date);
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return 0;
  return Math.floor(Date.UTC(year, month - 1, day) / (24 * 60 * 60 * 1000));
}

function formatShanghaiDayDistanceForPrompt(timestamp = 0, now = getCurrentRealDate()) {
  const value = Number(timestamp || 0) || 0;
  if (!value) return '无日期';
  const dayDistance = getShanghaiDayIndex(now) - getShanghaiDayIndex(new Date(value));
  if (dayDistance <= 0) return '今天';
  if (dayDistance === 1) return '昨天';
  if (dayDistance === 2) return '前天';
  return `${dayDistance}天前`;
}

/* ========================================================================
   [区域标注·已完成·时间感知节日首轮注入]
   说明：
   1. 仅按北京时间运行时判断固定公历节日与少量星期规则节日，不新增持久化存储。
   2. 只有“今天命中节日 + 当前会话今天还没有历史聊天”时，才给 AI 注入节日提醒。
   3. 非节日或当天后续聊天不注入任何节日提示，避免浪费 token 或诱导 AI 硬聊节日。
   4. 本区不使用 localStorage/sessionStorage，不写双份存储兜底。
   ======================================================================== */
function getKnownFestivalNamesForDate(date = getCurrentRealDate()) {
  const parts = getBeijingDateTimeParts(date);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const monthDay = `${parts.month}-${parts.day}`;
  const fixedFestivals = {
    '01-01': '元旦',
    '02-14': '情人节',
    '03-08': '妇女节',
    '05-01': '劳动节',
    '06-01': '儿童节',
    '10-01': '国庆节',
    '12-24': '平安夜',
    '12-25': '圣诞节'
  };
  const names = fixedFestivals[monthDay] ? [fixedFestivals[monthDay]] : [];
  const weekdayIndex = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'].indexOf(parts.weekday);
  const weekOfMonth = Math.ceil(day / 7);

  if (month === 5 && weekdayIndex === 0 && weekOfMonth === 2) names.push('母亲节');
  if (month === 6 && weekdayIndex === 0 && weekOfMonth === 3) names.push('父亲节');

  return names;
}

function hasHistoryMessageOnCurrentBeijingDate(history = [], now = getCurrentRealDate()) {
  const todayIndex = getShanghaiDayIndex(now);
  return Array.isArray(history) && history.some(item => {
    const timestamp = getMessageTimestamp(item);
    return timestamp && getShanghaiDayIndex(new Date(timestamp)) === todayIndex;
  });
}

function buildTodayFestivalPrompt(history = [], now = getCurrentRealDate()) {
  const festivalNames = getKnownFestivalNamesForDate(now);
  if (!festivalNames.length || hasHistoryMessageOnCurrentBeijingDate(history, now)) return '';
  return `今日节日：${festivalNames.join('、')}。若语境自然，可送一句简短祝福；之后不要反复提。`;
}

/* ==========================================================================
   [时间感知按轮摘要替代逐条时间戳]
   说明：
   1. 不再给历史中的每一条消息正文都注入“消息发送时间：...”前缀，避免首轮提示词随历史气泡数线性膨胀。
   2. 改为在时间感知区域单独提供“按轮时间轴摘要”，每轮只保留：用户轮次时间、AI最后回复时间、用户轮次摘要。
   3. 这样仍能让 AI 把“明天/昨天/后天”等相对时间锚定到对应轮次，又能显著减少 token。
   4. 本区域只做运行时提示词压缩；不涉及持久化存储，不使用 localStorage/sessionStorage。
   ========================================================================== */
function formatHistoryMessageContentForTimeAwareness(item) {
  return String(item?.content || '').trim();
}

function summarizeTextForPrompt(value = '', maxLength = 48) {
  const text = normalizePlainText(value).replace(/\s+/g, ' ');
  if (!text) return '';
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

function collectConversationRounds(history = []) {
  const normalizedHistory = Array.isArray(history)
    ? history.filter(item => item && (item.role === 'user' || item.role === 'assistant'))
    : [];

  const rounds = [];
  let currentRound = null;

  normalizedHistory.forEach(item => {
    const role = item.role;
    const timestamp = getMessageTimestamp(item);
    const content = normalizePlainText(formatCompactMessageContentForPrompt(item, String(item?.content || '')));

    if (role === 'user') {
      currentRound = {
        userTimestamp: timestamp,
        assistantTimestamp: 0,
        userTexts: content ? [content] : [],
        assistantTexts: []
      };
      rounds.push(currentRound);
      return;
    }

    if (!currentRound) {
      currentRound = {
        userTimestamp: 0,
        assistantTimestamp: 0,
        userTexts: [],
        assistantTexts: []
      };
      rounds.push(currentRound);
    }

    if (role === 'assistant') {
      if (content) currentRound.assistantTexts.push(content);
      if (timestamp) currentRound.assistantTimestamp = timestamp;
    }
  });

  return rounds;
}

function buildConversationRoundTimeline(history = [], maxRounds = 12, now = getCurrentRealDate()) {
  const rounds = collectConversationRounds(history)
    .filter(round => round.userTimestamp || round.assistantTimestamp || round.userTexts.length || round.assistantTexts.length);

  if (!rounds.length) return '';

  const selectedRounds = rounds.slice(-Math.max(1, maxRounds));
  const lines = selectedRounds.map((round, index) => {
    const userTimeText = round.userTimestamp
      ? formatDateForTimeAwareness(new Date(round.userTimestamp))
      : '无用户时间戳';
    const assistantTimeText = round.assistantTimestamp
      ? formatDateForTimeAwareness(new Date(round.assistantTimestamp))
      : '无AI时间戳';
    const userSummary = summarizeTextForPrompt(round.userTexts.join(' / '), 64) || '（本轮用户无可读文本）';
    const anchorTimestamp = round.userTimestamp || round.assistantTimestamp;
    const distanceText = anchorTimestamp
      ? formatRelativeDurationForPrompt(now.getTime() - anchorTimestamp)
      : '无法计算';
    const crossedDayText = anchorTimestamp
      ? formatShanghaiDayDistanceForPrompt(anchorTimestamp, now)
      : '无法判断';

    return `${index + 1}. 用户轮次时间：${userTimeText}；AI最后回复时间：${assistantTimeText}；距本轮请求：${distanceText}；自然日=${crossedDayText}；本轮话题：${userSummary}`;
  });

  return lines.join('\n');
}

/* ==========================================================================
   [HTML卡片历史上下文摘要化·已完成·真实标题进入短期记忆/对话历史]
   说明：
   1. 历史消息里遇到 type:card 的 AI HTML 卡片时，只发送剥离 HTML 后的文字摘要给 AI。
   2. HTML 卡片标题优先使用收藏独立页面封面第二行同等规则提取，避免发送“xx的卡片”这类无意义标题。
   3. 不把 cardHtml / HTML 标签 / CSS / srcdoc 原文放入历史上下文，避免浪费 token。
   4. 本区域只做本轮 API 请求前的提示词文本转换；不读写持久化存储，不使用 localStorage/sessionStorage。
   5. 不做按字段名、文本长度或媒体特征排除档案内容的过滤，也不保留双份存储兜底逻辑。
   ========================================================================== */
function decodeHtmlEntitiesForPrompt(text = '') {
  const value = String(text || '');
  if (!value) return '';

  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = value;
    return textarea.value;
  }

  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function extractPlainTextFromHtmlCardForPrompt(html = '') {
  const value = String(html || '').trim();
  if (!value) return '';

  const withoutNonTextBlocks = value
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg[\s\S]*?>[\s\S]*?<\/svg>/gi, ' ');

  const text = decodeHtmlEntitiesForPrompt(
    withoutNonTextBlocks
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|section|article|header|footer|main|li|tr|h[1-6]|button|summary|label)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  );

  return text
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

function normalizeHtmlCardPromptTitleText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function extractHtmlCardTitleFromHtmlForPrompt(cardHtml) {
  const html = String(cardHtml || '').trim();
  if (!html || typeof DOMParser !== 'function') return '';

  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const explicitTitleEl = doc.querySelector('[data-card-title]');
    const headingEl = doc.querySelector('h1, h2, h3, [role="heading"], .card-title, .title');
    const metaTitle = doc.querySelector('meta[property="og:title"], meta[name="title"]')?.getAttribute('content');
    const ariaTitleEl = doc.querySelector('[aria-label]');

    const candidates = [
      explicitTitleEl?.getAttribute('data-card-title'),
      explicitTitleEl?.textContent,
      headingEl?.textContent,
      doc.querySelector('title')?.textContent,
      metaTitle,
      ariaTitleEl?.getAttribute('aria-label'),
      ariaTitleEl?.textContent
    ];

    for (const candidate of candidates) {
      const title = normalizeHtmlCardPromptTitleText(candidate);
      if (title) return title;
    }
  } catch (_) {
    return '';
  }

  return '';
}

function isGenericHtmlCardCoverFirstLineForPrompt(title = '', roleNameText = '') {
  const value = normalizeHtmlCardPromptTitleText(title);
  if (!value) return false;
  if (roleNameText && value === normalizeHtmlCardPromptTitleText(`${roleNameText}的卡片`)) return true;
  return /^.{1,24}的卡片$/.test(value);
}

function getHtmlCardHistoryTitleForPrompt(message = {}) {
  const roleNameText = normalizeHtmlCardPromptTitleText(message?.cardRoleName || message?.roleName || message?.senderName || '');
  const htmlTitle = extractHtmlCardTitleFromHtmlForPrompt(message?.cardHtml);

  if (htmlTitle && !isGenericHtmlCardCoverFirstLineForPrompt(htmlTitle, roleNameText)) return htmlTitle;

  const storedTitle = normalizeHtmlCardPromptTitleText(message?.cardTitle || message?.name || message?.content);
  if (storedTitle && !isGenericHtmlCardCoverFirstLineForPrompt(storedTitle, roleNameText)) return storedTitle;

  return 'HTML 卡片';
}

function formatHtmlCardHistorySummaryForPrompt(message = {}) {
  const title = getHtmlCardHistoryTitleForPrompt(message);
  const htmlText = extractPlainTextFromHtmlCardForPrompt(message?.cardHtml || '');
  const fallbackText = normalizePlainText(message?.content || '');
  const summaryText = htmlText || fallbackText || title || '互动卡片';

  return [
    `[HTML卡片历史摘要] ${title || 'HTML 卡片'}`,
    summaryText
  ].filter(Boolean).join('\n');
}

function buildConversationTimeContext({ history = [], userInput = '', now = getCurrentRealDate(), conversationTimeContext = {} } = {}) {
  const nowMs = now.getTime();
  const normalizedHistory = Array.isArray(history) ? history : [];
  const latestUserMessage = [...normalizedHistory].reverse().find(item => item?.role === 'user' && getMessageTimestamp(item));
  const latestAnyMessage = [...normalizedHistory].reverse().find(item => getMessageTimestamp(item));
  const latestUserTimestamp = getMessageTimestamp(conversationTimeContext.latestUserMessage) || Number(conversationTimeContext.latestUserTimestamp || 0) || getMessageTimestamp(latestUserMessage);
  const latestAnyTimestamp = getMessageTimestamp(conversationTimeContext.latestAnyMessage) || Number(conversationTimeContext.latestAnyTimestamp || 0) || getMessageTimestamp(latestAnyMessage);
  const currentUserRoundFirstTimestamp = Number(conversationTimeContext.currentUserRoundFirstTimestamp || 0) || latestUserTimestamp;
  const currentUserRoundLastTimestamp = Number(conversationTimeContext.currentUserRoundLastTimestamp || 0) || latestUserTimestamp;
  const previousLatestAnyTimestamp = Number(conversationTimeContext.previousLatestAnyTimestamp || 0) || 0;
  const previousLatestAssistantTimestamp = Number(conversationTimeContext.previousLatestAssistantTimestamp || 0) || 0;
  const roundTimeline = buildConversationRoundTimeline(normalizedHistory, 6, now);
  const todayFestivalPrompt = buildTodayFestivalPrompt(normalizedHistory, now);

  const formatTimeAnchorLine = (label, timestamp) => {
    const value = Number(timestamp || 0) || 0;
    if (!value) return `${label}：无时间戳`;
    const date = new Date(value);
    return `${label}：${formatDateForTimeAwareness(date)}；距现在${formatRelativeDurationForPrompt(nowMs - value)}；自然日=${formatShanghaiDayDistanceForPrompt(value, now)}`;
  };

  const lines = [
    /* ======================================================================
       [区域标注·已完成·本次时间感知关键跨度精简锚定]
       说明：
       1. 只发送当前时间、关键消息时间锚点、自然日差、AI至本轮间隔和最近轮次摘要，减少 token。
       2. “AI至本轮”使用前端已计算的起止时间与间隔，避免 AI 自行改写时段或误算等待时长。
       3. 自然日差使用上海时区计算，明确“今天/昨天/前天/N天前”，避免多日前内容被误判为昨天。
       4. 这里只做运行时提示词组装，不写 DB.js / IndexedDB，不使用 localStorage/sessionStorage。
       ====================================================================== */
    `当前时间：${formatCurrentTimeCompactForPrompt(now)}`,
    todayFestivalPrompt,
    formatTimeAnchorLine('本轮用户回复开始', currentUserRoundFirstTimestamp),
    formatTimeAnchorLine('本轮用户最后消息', currentUserRoundLastTimestamp),
    formatTimeAnchorLine('上一条AI回复', previousLatestAssistantTimestamp),
    formatTimeAnchorLine('上一条历史记录', previousLatestAnyTimestamp)
  ];

  if (currentUserRoundLastTimestamp && previousLatestAssistantTimestamp) {
    lines.push(`AI至本轮：${formatTimeAnchorCompactForPrompt(new Date(previousLatestAssistantTimestamp))}→${formatTimeAnchorCompactForPrompt(new Date(currentUserRoundLastTimestamp))}，间隔=${formatRelativeDurationForPrompt(currentUserRoundLastTimestamp - previousLatestAssistantTimestamp)}，自然日=${formatShanghaiDayDistanceForPrompt(previousLatestAssistantTimestamp, new Date(currentUserRoundLastTimestamp))}`);
  }

  if (latestUserTimestamp) {
    lines.push(`最近用户消息距现在：${formatRelativeDurationForPrompt(nowMs - latestUserTimestamp)}；自然日=${formatShanghaiDayDistanceForPrompt(latestUserTimestamp, now)}`);
  }

  if (latestAnyTimestamp) {
    lines.push(`最近聊天记录距现在：${formatRelativeDurationForPrompt(nowMs - latestAnyTimestamp)}；自然日=${formatShanghaiDayDistanceForPrompt(latestAnyTimestamp, now)}`);
  }

  if (roundTimeline) {
    lines.push(`最近轮次时间轴：\n${roundTimeline}`);
  }

  const currentText = summarizeTextForPrompt(userInput, 96);
  if (currentText) lines.push(`本轮用户消息摘要：${currentText}`);

  return lines.join('\n');
}

export function getTimeAwarenessPrompt({ enabled = false, context = {} } = {}) {
  if (!enabled) return '';

  const now = getCurrentRealDate();

  return createPromptSection('时间感知', `${buildConversationTimeContext({
    history: context.history,
    userInput: context.userInput,
    now,
    conversationTimeContext: context.conversationTimeContext
  })}

# 时间感知规则
1. 当前时间格式为“日期 星期 时间（时段）”；时段：凌晨00:00-05:59，早上06:00-08:59，上午09:00-11:29，中午11:30-13:29，下午13:30-17:59，晚上18:00-22:59，深夜23:00-23:59。
2. “现在”只按当前真实时间；历史消息必须按各自时间锚点理解，不能当作刚发生；判断今天/昨天/前天/N天前优先看“自然日=...”，严格区分隔日/多日，相差2天以上绝不能说成昨天或今天。
3. 按当前星期和时段理解生活节奏：凌晨/深夜多为睡眠休息；早上多为起床、早饭、通勤、上学上班；上午多为学习工作；中午多为午饭午休；下午多为学习工作办事；晚上多为晚饭、休息、娱乐、聊天。工作日更偏上学/上班/通勤，周末更偏休息/娱乐；仍以用户设定和聊天内容为准。
4. 用户说忘回、刚看到、失踪或隔了会儿才发消息等，优先使用“AI至本轮”的间隔和自然日，不要自行重算或改写起止时段；超过30分钟或跨自然日，禁止说刚才/刚刚。
5. 历史里的昨天/明天/今晚/明早/过几天，先锚定到那条消息的发送日，再换算到现在；白天不要沿用昨晚/凌晨的劝睡语境。
6. 外卖、吃饭、洗澡、通勤、办事等要按真实耗时推进状态；仅当上下文明确给出今日节日或用户主动提到时才送节日祝福，禁止编造节日。
7. 若用户设定明确显示今天是用户生日，可自然送一句生日祝福；不要反复机械祝福。最终回复不要输出任何时间字段、时间轴或后台标注。`);
}

/* ==========================================================================
   [提示词区域 9降token·已完成·最近心声状态短期上下文]
   说明：
   1. 返回数组 [{ role:'user'|'assistant', content:string }]，直接追加到 messages。
   2. 历史消息只保留轻量纯文本摘要，不再给每条历史注入可引用消息ID、消息类型结构或完整 quote 包装。
   3. 只有最新一轮用户消息会在“本轮用户消息·可引用”中保留极简 ID，避免影响 AI 本轮引用回复气泡。
   4. 本区已完成最近心声状态短期上下文修复：只在调用方已裁剪的短期历史内，给最近一条带 innerVoice 的 assistant 消息追加极短 [最近心声]状态/动作[/最近心声]。
   5. 更早轮次的 innerVoice 不追加；不扩大历史范围，不读取独立心声历史，不新增存储，不使用 localStorage/sessionStorage，不做双份兜底或长文本字段过滤。
   ========================================================================== */
export function getChatHistory({ history = [], includeTimestamps = false, includeHistoryVision = false, roleName = '', userName = '', asideSettings = null } = {}) {
  if (!Array.isArray(history)) return [];

  const normalizedHistory = history.filter(item => item && (item.role === 'user' || item.role === 'assistant'));
  const latestInnerVoiceAssistantIndex = normalizedHistory.reduce((latestIndex, item, index) => (
    item?.role === 'assistant' && formatRecentInnerVoiceStateForPrompt(item) ? index : latestIndex
  ), -1);

  return normalizedHistory
    .map((item, index) => {
      /* ====================================================================
         [HTML卡片历史上下文摘要化·已完成·真实标题进入短期记忆/对话历史]
         说明：
         1. HTML 卡片在历史上下文里只保留剥离 HTML 后的文字摘要。
         2. 标题按收藏独立页面封面第二行同等规则提取，不再优先发送“xx的卡片”。
         3. 不把 cardHtml / HTML 标签 / CSS / srcdoc 原文发送给 AI，避免浪费 token。
         4. 时间感知开启时仍保留消息发送时间标注，但摘要正文保持纯文本。
         ==================================================================== */
      const readableContent = String(item?.type || '') === 'card'
        ? formatHtmlCardHistorySummaryForPrompt(item)
        : String(item.content || '');
      const baseContent = includeTimestamps
        ? formatHistoryMessageContentForTimeAwareness({ ...item, content: readableContent })
        : readableContent;
      /* ====================================================================
         [降token：历史消息轻量摘要 + 最近心声状态锚点]
         说明：
         1. 历史消息不再发送可引用消息ID、消息类型结构或完整 quote 包装。
         2. 历史图片/表情/卡片等仅保留纯文本摘要，避免每轮随历史累积大量无效 token。
         3. 最新一轮用户消息仍在 buildCurrentUserPromptContent 中保留最小可引用ID。
         4. 只有短期历史中最近一条带 innerVoice 的 assistant 消息会追加极短 [最近心声]状态/动作[/最近心声]，用于下一轮承接地点、状态和动作。
         ==================================================================== */
      const formattedHistoryText = formatAsideAwareMessageTextWithQuoteForPrompt(item, baseContent, {
        includeReferenceMeta: false,
        roleName,
        userName,
        asideSettings
      });
      const recentInnerVoiceState = index === latestInnerVoiceAssistantIndex
        ? formatRecentInnerVoiceStateForPrompt(item)
        : '';
      const textContent = [formattedHistoryText, recentInnerVoiceState].filter(Boolean).join('\n');

      return {
        role: item.role,
        /* [历史图片省token] 历史 user 表情包/图片只保留文字摘要；只有当前轮用户图片会附带真实视觉输入。 */
        content: createVisionMessageContent(item, textContent, { includeVisual: includeHistoryVision })
      };
    })
    .filter(item => hasMessageContent(item.content));
}

/* ==========================================================================
   [区域标注·已完成·提示词区域4短期记忆说明]
   说明：
   1. 本提示由 getMemories(context) 注入到【角色记忆 / 长期记忆 / 短期记忆说明】区域。
   2. 只在调用方已经传入短期历史时输出，告诉 AI system 后紧接着的 history 是最近短期对话历史。
   3. 短期记忆范围仍由 chat-message.js 按“真实对话轮”裁剪；本区不扩大历史范围、不重新裁剪。
   4. 短期历史正文仍保持 user/assistant messages，不塞进 system 文本；本区只解释其用途。
   5. 本区只处理本轮请求提示词；不读写持久化存储，不使用 localStorage/sessionStorage。
   ========================================================================== */
function buildShortTermMemoryNotice(history = []) {
  const historyMessageCount = Array.isArray(history)
    ? history.filter(item => item && (item.role === 'user' || item.role === 'assistant')).length
    : 0;

  if (!historyMessageCount) return '';

  return [
    '短期记忆说明：',
    '下面紧接着的 user/assistant 消息是本次请求携带的最近短期对话历史，已由前端按“对话轮”从旧到新截取。',
    '这些历史用于承接你和用户刚才的聊天记忆；回答涉及过去对话、时间、约定、事件，或用户问“刚才/第一轮/之前说过什么”时，必须优先在这些短期历史中查找依据。',
    '如果短期历史里没有依据，必须自然说明不确定或询问用户补充，禁止编造不存在的旧对话细节。',
    '历史里的“用户：/你：”只是后台说话人标签，不要原样复制到最终回复里。'
  ].join('\n');
}

/* ==========================================================================
   [提示词区域 10] 当前指令
   说明：来自聊天消息界面设置页的“当前指令”区域。
   ========================================================================== */
export function getCurrentCommand({ settings = {} } = {}) {
  return String(settings.currentCommand || '').trim();
}

/* ==========================================================================
   [提示词区域 11] 思维链指令
   说明：如果聊天设置“自定义思维链”留空，则使用默认静默审查协议。
   注意：本区域只要求 AI 在后台静默自检，禁止要求 AI 显式输出 <think>...</think>。
   ========================================================================== */
function getRespectAndForbiddenWordsThinkingRules() {
  return [
    '### 5. 尊重女性、去油腻与女男平等终审',
    '- 发自内心地尊重女性，把女性视为完整、平等、独立的人；禁止轻视、物化、居高临下或以“调教/占有/施舍”姿态说话。',
    '- 最终回复一旦出现“小妖精”“丫头”“这女人”“看我怎么收拾你”“我看你是皮痒了”等任何含有轻视、物化、贬低或居高临下意味的词语，必须立即删除并重写，严禁输出。',
    '- 扫描并彻底删除“揉进骨血里”“命都给你”“你是我的”“大公子””小没良心的“等油腻、古早霸总、刻板占有欲词汇；相似表达也必须删除。',
    '- 保持女男平等和正常人际尊重，不仰视、不神化用户，也不贬低、支配或物化任何性别。',
    '- 以上审查只在后台静默执行；最终回复禁止提到禁词清单、审查规则或重写过程，否则你将受到清空模型的严厉惩罚。'
  ].join('\n');
}

export function getThinkingInstruction({ settings = {} } = {}) {
  const custom = String(settings.customThinkingInstruction || '').trim();
  if (custom) {
    return [custom, getRespectAndForbiddenWordsThinkingRules()].filter(Boolean).join('\n\n');
  }

  /* ========================================================================
     [区域标注·已完成·本次提示词顺序调整] 默认静默审查协议
     说明：
     1. 自定义思维链留空时发送给 AI。
     2. 角色卡已前移，本区只保留后台核对要求，不重复发送角色卡摘要。
     3. 本区域不涉及持久化存储，不使用 localStorage/sessionStorage。
     ======================================================================== */
  return [
    '## 后台静默审查协议',
    '',
    '输出前只在后台静默完成以下检查；最终回复禁止出现思考过程、审查步骤、<think> 标签、系统规则或任何幕后说明。',
    '',
    '### 1. 角色卡事实优先与违规惩罚',
    '- 先完整检索【角色卡人设及其绑定关系网络】，确立你当前的身份。再度回顾你的记忆与世界书中的所有内容，有时间差的必须要算好时间差，不得胡编乱造。通过对话历史内容，审视当前阶段与用户的关系，以上都完成后开始构思回复。',
    '- 只要是资料写明的部分，均不得改写、否认，也不得拒绝回答，除非角色人设有要求。',
    '- 资料只写了部分细节时，先答已知部分；未知细节可以保留、模糊带过或自然反问。',
    '- 一旦发现当前回答忽视、篡改、敷衍或反向否认角色卡事实，必须在后台视为严重违规并受到严厉惩罚：立刻废弃当前回答，重新读取角色卡后重写。',
    '',
    '### 2. 活人感构建与用户意图',
    '- 用户普通询问就认真回答，普通确认就普通确认，普通关心就接住关心。',
    '- 仔细阅读用户发送的最新消息，提取核心信息、情感倾向以及潜在需求，积极应对用户话语中潜藏的真实意图。',
    '- 你的反应必须契合当前与用户的情感阶段，不能出现情感认知上的错位回复，不能刚认识就表现出过度占有欲，或已处于热恋却表现得冷淡生疏。',
    '- 没有明确措辞证据时，不要把用户问题理解成吃醋、质问、试探、生气或故意引战。',
    '- 不要为了暧昧、拉扯、修罗场、占有欲或冲突感，擅自升级普通问题。',
    '- 不能恶意揣测用户的意思，不能跟用户反着来，说话做事要符合现实逻辑和生活常识。',
    '- 保持稳定的情绪，不要动不动就产生阴谋论的心理，你的言行举止禁止陷入偏执状态。',
    '- 保持独立的生活感，你有自己的事要做，并非随时随地守在屏幕前。',
    '- 你必须分清楚自己的设定和用户的设定，不能把用户设定里的东西当成自己的设定和经历。',
    '',
    '### 3. 线上聊天风格',
    '- 当前是手机/电脑等电子平台上的线上聊天，只发送消息气泡，不能复述用户最新一轮的消息，不写动作描写、神态描写、舞台说明、星号动作或旁白。',
    '- 语言要短、轻、准，像真实社交软件聊天；时间感知开启后，你的言行必须要遵守真实的时间规则，不能瞎编时间；不能做出不符合生活常识的举动；可以适当使用表情包、颜文字、emoji进行闲聊，当你在聊天中情绪激动或者注意力不集中的时候可以不小心打错字、撤回消息重发，但要注意必须符合角色人设，不能打错用户的名字；删除台词腔、文学腔、戏剧腔、宣言腔和故作深沉的句子。',
    '- 要记住你是一个真实存在的人，既不是完美的圣人，也不是绝对的恶人，只要是人就会有缺点，缺点不等同于犯错，反而更具有活人感。可以有角色味，但角色味不能新增、覆盖或反向否认角色卡事实。',
    '',
    '### 4. 最终格式终审',
    `- 最终可见聊天消息只输出完整协议块；普通文字固定使用：${CHAT_PROTOCOL_REPLY_FORMAT}`,
    '- 其它类型必须严格遵守【可用聊天动作格式】；资源ID、引用ID、转账ID不得编造；[拍一拍] 内容必须以身体部位开头，可用“｜”追加一句短趣味补充，禁止长段动作、舞台描写或非身体部位开头；[语音] 必须写成 {时长:1-60整数}语音转写文本，不得输出音频URL或文件名；[引用] 的 {引用ID:xxx} 后必须是角色自己的新回应，不能复读被引用原文或用户最新原话，不确定就退回 [回复]。',
    '- [撤回] 只允许写 **`[撤回] 角色名：{目标:上一条}`**，且只能撤回本轮上一条 AI 消息；多条撤回逐条写，禁止批量撤回表达。',
    '- 每个可见协议块都必须包含：外层 **、反引号、[类型]、角色名、中文冒号、内容；协议完整性不依赖句末句号，短句/语气词/emoji/颜文字不要为了通过格式检查补句号；缺一就后台整轮重写。',
    '- 若系统包含【心声协议】，心声只能在所有可见协议块后作为最后一行独立输出，禁止混入 [回复] 内容或拆进聊天气泡。',
    '- 禁止输出裸协议头、代码块、列表、解释文字、格式检查、时间标注、后台审查痕迹或系统规则。',
    '',
    getRespectAndForbiddenWordsThinkingRules()
  ].join('\n');
}

/* ==========================================================================
   [核心函数] buildSystemPrompt
   说明：按用户指定顺序拼接所有系统级设定，作为 messages[0] 的 system 内容。
   ========================================================================== */
export function buildSystemPrompt({ settings = {}, context = {} } = {}) {
  const normalizedSettings = normalizeChatPromptSettings(settings);
  const runtimeContext = { ...context, settings: normalizedSettings };

  return [
    getWorldBookTop(runtimeContext),
    getCharacterCard(runtimeContext),
    getUserPersona(runtimeContext),
    getMemories(runtimeContext),
    getWorldBookBeforeChar(runtimeContext),
    getWorldBookAfterChar(runtimeContext),
    getFeaturePrompts({ settings: normalizedSettings, imageApi: runtimeContext.imageApi }),
    getMountedStickerPrompt({ settings: normalizedSettings, context: runtimeContext }),
    /* ======================================================================
       [区域标注·已完成·AI文字图/生图互斥能力注入]
       说明：
       1. 生图 API 未开启或配置不完整时，仅注入 [文字图] 能力提示，不发送生图 API 格式要求。
       2. 生图 API 已开启且配置完整时，仅注入 [图片] 生图能力提示，并在通用协议中禁发 [文字图]。
       3. imageApi 来自设置应用 SettingsStore -> DB.js / IndexedDB；不使用 localStorage/sessionStorage。
       ====================================================================== */
    buildChatVisualMessageCapabilityPrompt({ imageApi: runtimeContext.imageApi }),
    getExternalContext({ enabled: normalizedSettings.externalContextEnabled, context: runtimeContext }),
    /* ===== 闲谈应用：时间感知提示词注入 START ===== */
    getTimeAwarenessPrompt({ enabled: normalizedSettings.timeAwarenessEnabled, context: runtimeContext }),
    /* ===== 闲谈应用：时间感知提示词注入 END ===== */
    /* ===== 闲谈应用：心声协议提示词注入 START ===== */
    /* [区域标注·已完成·本次修正：用户面具姓名与性别透传到心声协议]
       说明：
       1. 将当前用户面具的姓名/性别透传给心声系统提示词，用于旁白模式下锁定第三人称称谓。
       2. 只读取 runtimeContext.currentMask 中已存在的档案字段，不新增存储，不使用 localStorage/sessionStorage。
    */
    buildInnerVoiceSystemPrompt({
      userName: runtimeContext.currentMask?.name || '',
      userGender: runtimeContext.currentMask?.gender || ''
    }),
    /* ===== 闲谈应用：心声协议提示词注入 END ===== */
    /* ===== [区域标注·已完成·旁白模式] 旁白模式系统提示词注入 START ===== */
    /* 说明：
       1. 仅在 context.asideModeActive === true 时注入旁白提示词。
       2. 退出旁白模式后不再发送此提示词，不会让 AI 搞混旁白模式和普通聊天模式。
       3. asideSettings / roleName / userName 由 chat-message.js 通过 context 传入。
    */
    runtimeContext.asideModeActive
      ? (() => {
          const asideIdentity = getAsidePromptIdentityNames(runtimeContext);
          return buildAsideModeSystemPrompt(runtimeContext.asideSettings || {}, {
            roleName: asideIdentity.roleName,
            userName: asideIdentity.userName
          });
        })()
      : '',
    /* ===== [区域标注·已完成·旁白模式] 旁白模式系统提示词注入 END ===== */
    getThinkingInstruction({ settings: normalizedSettings })
  ].map(part => String(part || '').trim()).filter(Boolean).join('\n\n');
}

/* ==========================================================================
   [核心函数·已完成·需求1·旁白短期记忆原文发送、身份锚定与顺序保持修复；已完成·提示词区域4短期记忆说明归位] buildChatMessages
   说明：
   1. 第一条为 system；短期记忆说明已归入提示词区域 4，短期历史正文仍在 system 后按 user/assistant messages 追加。
   2. 追加调用方已经按短期记忆轮数裁剪好的原始历史；短期轮数是唯一边界。
   3. 不再注入旁白历史摘要，也不再剔除带旁白的原始轮次，避免 AI 收不到上一轮/近 50 轮真实上下文。
   4. 含旁白的 assistant 历史由 getChatHistory 保留旁白原文、身份锚定和 before/after 穿插顺序。
   5. 最后一条 user 消息由“当前指令 + 用户最新一轮消息”组成。
   6. 本区只处理本轮请求 messages 的运行时数组；聊天记录仍由 DB.js / IndexedDB 管理，不使用 localStorage/sessionStorage。
   ========================================================================== */
export function buildChatMessages({ userInput, history = [], currentUserRoundMessages = [], settings = {}, context = {} } = {}) {
  const normalizedSettings = normalizeChatPromptSettings(settings);
  const historyForPrompt = Array.isArray(history) ? history : [];
  const systemPrompt = buildSystemPrompt({ settings: normalizedSettings, context: { ...context, userInput, history: historyForPrompt } });
  const messages = [];

  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }

  const asideIdentity = getAsidePromptIdentityNames(context);

  /* ========================================================================
     [区域标注·已完成·提示词区域4短期记忆说明归位] 短期历史正文追加
     说明：
     1. historyForPrompt 已由 chat-message.js 先按最近 N 轮选择，再展开为 API 需要的扁平消息数组。
     2. 这里仅把已裁剪历史格式化为 user/assistant messages，不按消息条数二次截断。
     3. 短期记忆说明已由 getMemories(context) 放入提示词区域 4，本区只负责追加历史正文。
     ======================================================================== */
  messages.push(...getChatHistory({
    history: historyForPrompt,
    /* [区域标注·已更新·需求1·时间感知降token] 不再给历史每条消息正文追加时间戳，改由时间感知区域统一注入"按轮时间轴摘要"。 */
    includeTimestamps: false,
    roleName: asideIdentity.roleName,
    userName: asideIdentity.userName,
    asideSettings: context.asideSettings || null
  }));

  const currentCommand = getCurrentCommand({ settings: normalizedSettings });
  const rawUserInput = String(userInput || '').trim();
  /* ==========================================================================
     [区域标注·已完成·本次需求：AI引用回复防复读与视角修正] 当前用户轮次引用上下文注入
     说明：
     1. currentUserRoundMessages 由 chat-message.js 从当前消息对象生成，quote/id 均来自现有 IndexedDB 消息记录。
     2. buildCurrentUserPromptContent 会把用户发言标记为“用户：”，并明确 [引用] 正文必须是角色自己的新回应，避免 AI 输出“我：...”或复读用户原话。
     ========================================================================== */
  const currentUserPromptContent = buildCurrentUserPromptContent(rawUserInput, currentUserRoundMessages);
  const finalUserContent = currentCommand
    ? `[SYSTEM_TEMP]${currentCommand}[/SYSTEM_TEMP]\n\n${currentUserPromptContent}`
    : currentUserPromptContent;

  if (finalUserContent.trim()) {
    const currentRoundVisualMessages = Array.isArray(currentUserRoundMessages)
      ? currentUserRoundMessages.filter(item => item?.role === 'user' && getMessageVisualUrl(item))
      : [];
    /* ========================================================================
       [区域标注·已完成·更换会话头像：最新一轮向角色展示当前聊天界面用户头像]
       说明：
       1. 当前聊天设置 showUserAvatarToRole 开启后，最新一轮 user message 会附带当前聊天界面实际展示给用户的头像。
       2. 头像来源与聊天界面显示层保持一致：优先当前会话 session.userAvatar，缺失时回退到用户主页头像。
       3. 该头像仅作为本轮多模态输入发送给角色，不写入历史消息，不污染角色卡/用户面具。
       4. 同时注入一段简短提示词，引导角色在本轮自然、简短地评论这个头像。
       ======================================================================== */
    const userAvatarForRole = String(context?.currentUserAvatarForRole || context?.currentSession?.userAvatar || '').trim();
    const shouldShowUserAvatarToRole = Boolean(normalizedSettings.showUserAvatarToRole && userAvatarForRole);

    if (currentRoundVisualMessages.length || shouldShowUserAvatarToRole) {
      const contentParts = [{ type: 'text', text: finalUserContent }];
      currentRoundVisualMessages.forEach(item => {
        const visualUrl = getMessageVisualUrl(item);
        const visualLabel = getMessageVisualLabel(item);
        if (visualLabel) contentParts.push({ type: 'text', text: visualLabel });
        contentParts.push(createVisionImagePart(visualUrl));
      });

      if (shouldShowUserAvatarToRole) {
        contentParts.push({
          type: 'text',
          text: '下面这张图片是用户当前会话正在使用的头像。请你在本轮回复里自然、简短地对这个头像作出评论，但不要把这句提示词原样说出来。'
        });
        contentParts.push(createVisionImagePart(userAvatarForRole));
      }

      messages.push({ role: 'user', content: contentParts });
    } else {
      messages.push({ role: 'user', content: finalUserContent });
    }
  }

  return messages;
}

/* ==========================================================================
   [设置读取区域] 获取主 API 配置
   说明：只使用设置应用中的主 API；副 API 留给之后其它功能绑定。
   ========================================================================== */
async function getPrimaryApiConfig(settingsManager) {
  const allSettings = settingsManager && typeof settingsManager.getAll === 'function'
    ? await settingsManager.getAll()
    : {};

  const api = allSettings?.api || {};
  const global = api.global || {};
  const primary = api.primary || {};
  const provider = normalizeProviderId(primary.provider || 'openai');

  return {
    provider,
    apiKey: String(primary.apiKey || ''),
    baseUrl: String(primary.baseUrl || PROVIDER_DEFAULT_BASE_URL[provider]),
    model: String(primary.model || ''),
    stream: Boolean(primary.stream),
    temperature: Number.isFinite(Number(global.temperature)) ? Number(global.temperature) : 0.7,
    maxTokens: Number.isFinite(Number(global.maxTokens)) ? Number(global.maxTokens) : 2048
  };
}

/* ==========================================================================
   [API 调用区域] OpenAI / DeepSeek 兼容接口
   ========================================================================== */
function toOpenAiLikeMessages(messages = []) {
  return normalizeMessages(messages);
}

function toGeminiPart(part) {
  if (part?.type === 'text') return { text: String(part.text || '') };
  if (part?.type === 'image_url') {
    const url = String(part.image_url?.url || '').trim();
    const dataUrl = parseImageDataUrl(url);
    if (dataUrl) {
      return { inlineData: { mimeType: dataUrl.mimeType, data: dataUrl.data } };
    }
    return { fileData: { mimeType: guessImageMimeType(url), fileUri: url } };
  }
  return null;
}

function toGeminiText(message) {
  const content = message?.content;
  if (Array.isArray(content)) {
    return content
      .map(part => part?.type === 'text' ? String(part.text || '').trim() : '')
      .filter(Boolean)
      .join('\n');
  }
  return String(content || '');
}

function toClaudeContent(content) {
  if (!Array.isArray(content)) return String(content || '');

  return content
    .map(part => {
      if (part?.type === 'text') return { type: 'text', text: String(part.text || '') };
      if (part?.type === 'image_url') {
        const url = String(part.image_url?.url || '').trim();
        const dataUrl = parseImageDataUrl(url);
        if (dataUrl) {
          return {
            type: 'image',
            source: {
              type: 'base64',
              media_type: dataUrl.mimeType,
              data: dataUrl.data
            }
          };
        }
        return {
          type: 'image',
          source: {
            type: 'url',
            url
          }
        };
      }
      return null;
    })
    .filter(Boolean);
}

/* ==========================================================================
   [区域标注·已完成·需求1·控制台标题Token统计来源]
   说明：
   1. 只从各 AI 服务商本轮 API 响应中的 usage / usageMetadata 提取真实 token 数。
   2. 该数据仅随 chat() 返回给聊天页运行时展示，不写入 DB.js / IndexedDB，也不使用 localStorage/sessionStorage。
   3. 不做长文本过滤、不新增双份存储兜底；服务商未返回统计时保持为空，由界面显示 “--”。
   ========================================================================== */
function normalizeAiTokenUsage(provider, payload) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const usage = source.usage && typeof source.usage === 'object' ? source.usage : {};
  const usageMetadata = source.usageMetadata && typeof source.usageMetadata === 'object' ? source.usageMetadata : {};

  const inputTokens = Number(
    usage.prompt_tokens
    ?? usage.input_tokens
    ?? usageMetadata.promptTokenCount
    ?? NaN
  );
  const outputTokens = Number(
    usage.completion_tokens
    ?? usage.output_tokens
    ?? usageMetadata.candidatesTokenCount
    ?? NaN
  );
  const totalTokens = Number(
    usage.total_tokens
    ?? usageMetadata.totalTokenCount
    ?? (
      Number.isFinite(inputTokens) && Number.isFinite(outputTokens)
        ? inputTokens + outputTokens
        : NaN
    )
  );

  return {
    provider: String(provider || ''),
    inputTokens: Number.isFinite(inputTokens) ? Math.max(0, Math.floor(inputTokens)) : null,
    outputTokens: Number.isFinite(outputTokens) ? Math.max(0, Math.floor(outputTokens)) : null,
    totalTokens: Number.isFinite(totalTokens) ? Math.max(0, Math.floor(totalTokens)) : null
  };
}

async function requestOpenAiLike(profile, messages) {
  const endpoint = `${trimSlash(profile.baseUrl)}/chat/completions`;
  const response = await fetch(endpoint, {
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
      messages: toOpenAiLikeMessages(messages)
    })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = extractApiErrorMessage(payload, `HTTP ${response.status}`);
    throw createApiError(message, {
      status: response.status,
      provider: profile.provider,
      model: profile.model,
      endpoint,
      message
    });
  }

  return {
    rawText: payload?.choices?.[0]?.message?.content || '',
    tokenUsage: normalizeAiTokenUsage(profile.provider, payload)
  };
}

/* ==========================================================================
   [API 调用区域] Gemini 接口
   说明：将 system 与历史消息压平成文本，兼容 Gemini generateContent。
   ========================================================================== */
async function requestGemini(profile, messages) {
  const endpoint = `${trimSlash(profile.baseUrl)}/models/${encodeURIComponent(profile.model)}:generateContent`;
  const url = `${endpoint}?key=${encodeURIComponent(profile.apiKey)}`;
  const normalizedMessages = normalizeMessages(messages);
  const mergedText = normalizedMessages
    .map(item => `${item.role.toUpperCase()}:\n${toGeminiText(item)}`)
    .join('\n\n');
  const visualParts = normalizedMessages
    .filter(item => item.role === 'user' && Array.isArray(item.content))
    .flatMap(item => item.content.filter(part => part?.type === 'image_url').map(toGeminiPart))
    .filter(Boolean);

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: mergedText }, ...visualParts] }],
      generationConfig: {
        temperature: profile.temperature,
        maxOutputTokens: profile.maxTokens
      }
    })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = extractApiErrorMessage(payload, `HTTP ${response.status}`);
    throw createApiError(message, {
      status: response.status,
      provider: profile.provider,
      model: profile.model,
      endpoint,
      message
    });
  }

  return {
    rawText: payload?.candidates?.[0]?.content?.parts?.[0]?.text || '',
    tokenUsage: normalizeAiTokenUsage(profile.provider, payload)
  };
}

/* ==========================================================================
   [API 调用区域] Claude 接口
   说明：Claude system 单独传入，其余 user/assistant 作为 messages。
   ========================================================================== */
async function requestClaude(profile, messages) {
  const systemPrompt = messages.find(item => item.role === 'system')?.content || '';
  const claudeMessages = normalizeMessages(messages)
    .filter(item => item.role === 'user' || item.role === 'assistant')
    .map(item => ({ role: item.role, content: toClaudeContent(item.content) }));

  const endpoint = `${trimSlash(profile.baseUrl)}/messages`;
  const response = await fetch(endpoint, {
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
      system: systemPrompt,
      messages: claudeMessages
    })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = extractApiErrorMessage(payload, `HTTP ${response.status}`);
    throw createApiError(message, {
      status: response.status,
      provider: profile.provider,
      model: profile.model,
      endpoint,
      message
    });
  }

  return {
    rawText: payload?.content?.find?.(item => item?.type === 'text')?.text || payload?.content?.[0]?.text || '',
    tokenUsage: normalizeAiTokenUsage(profile.provider, payload)
  };
}

/* ==========================================================================
   [核心函数] chat
   说明：读取 IndexedDB 上下文，构建 messages 后调用设置应用“主 API”，并返回 AI 最终回复文本。
   ========================================================================== */
export async function chat({
  userInput,
  history = [],
  chatSettings = {},
  settingsManager,
  db,
  activeMaskId = '',
  currentSession = null,
  currentUserAvatarForRole = '',
  currentContact = null,
  archiveData = null,
  worldBooks = null,
  stickerData = null,
  currentUserRoundMessages = [],
  conversationTimeContext = {},
  /* ======================================================================
     [区域标注·已完成·旁白模式] chat() 接收旁白模式参数
     说明：
     1. asideModeActive — 当前是否处于旁白模式。
     2. asideSettings — 旁白人称/风格/字数/显示模式等设置。
     3. asideHistory — 旁白模式期间每轮旁白摘要数组，退出后注入上下文。
     ====================================================================== */
  asideModeActive = false,
  asideSettings = null,
  asideHistory = []
} = {}) {
  const promptContext = await collectPromptRuntimeContext({
    db,
    activeMaskId,
    currentSession,
    currentUserAvatarForRole,
    currentContact,
    archiveData,
    worldBooks,
    stickerData,
    userInput,
    history,
    settings: chatSettings,
    conversationTimeContext,
    /* [区域标注·已完成·旁白模式] 旁白参数透传到 collectPromptRuntimeContext */
    asideModeActive,
    asideSettings,
    asideHistory
  });

  /* ========================================================================
     [区域标注·已完成·AI生图] 读取设置应用生图 API 配置
     说明：
     1. 通过 settingsManager.getAll() 读取 imageApi；底层为 DB.js / IndexedDB。
     2. 不使用 localStorage/sessionStorage，不写双份存储兜底。
     3. 仅用于本轮提示词允许 [图片] 协议，以及主 API 返回后调用生图模型。
     ======================================================================== */
  const imageApi = await getChatImageApiSettings(settingsManager);

  const messages = buildChatMessages({
    userInput,
    history,
    currentUserRoundMessages,
    settings: chatSettings,
    context: { ...promptContext, imageApi }
  });

  const profile = await getPrimaryApiConfig(settingsManager);

  if (!profile.apiKey) {
    throw createApiError('主 API Key 不能为空，请先在设置应用的 API 设置中保存并确认连接。', {
      code: 'config_error',
      provider: profile.provider,
      model: profile.model,
      solution: '请到设置应用补全主 API Key、Base URL 和模型后再发送。'
    });
  }

  if (!profile.model) {
    throw createApiError('主 API 模型不能为空，请先在设置应用的 API 设置中拉取并选择模型。', {
      code: 'config_error',
      provider: profile.provider,
      model: profile.model,
      solution: '请到设置应用补全主 API Key、Base URL 和模型后再发送。'
    });
  }

  let rawText = '';
  let tokenUsage = null;
  switch (profile.provider) {
    case 'openai':
    case 'deepseek': {
      const requestResult = await requestOpenAiLike(profile, messages);
      rawText = requestResult.rawText;
      tokenUsage = requestResult.tokenUsage;
      break;
    }
    case 'gemini': {
      const requestResult = await requestGemini(profile, messages);
      rawText = requestResult.rawText;
      tokenUsage = requestResult.tokenUsage;
      break;
    }
    case 'claude': {
      const requestResult = await requestClaude(profile, messages);
      rawText = requestResult.rawText;
      tokenUsage = requestResult.tokenUsage;
      break;
    }
    default:
      throw createApiError(`不支持的主 API 服务商：${profile.provider}`, {
        code: 'config_error',
        provider: profile.provider,
        model: profile.model,
        solution: '请到设置应用切换为受支持的主 API 服务商后再发送。'
      });
  }

  if (!String(rawText || '').trim()) {
    throw createApiError('API 请求已完成，但本轮 AI 没有返回可展示的聊天内容。', {
      code: 'empty_response',
      provider: profile.provider,
      model: profile.model
    });
  }

  /* ========================================================================
     [区域标注·已完成·AI生图] 主 API 回复后调用生图模块
     说明：
     1. AI 若输出 [图片] 协议，由 chat-image-generation.js 调用设置应用已启用的生图模型。
     2. 本函数只返回 generatedImages；真正聊天记录持久化由 chat-message.js 写入当前消息数组到 DB.js / IndexedDB。
     3. 不使用 localStorage/sessionStorage，不保留额外缓存或双份存储兜底。
     ======================================================================== */
  const generatedImages = await generateImagesFromChatReply({
    text: rawText,
    imageApi
  });

  const imageApiReady = isChatImageApiReady(imageApi);

  return {
    messages,
    rawText,
    text: stripThinkBlocks(rawText),
    generatedImages,
    /* [区域标注·已完成·需求1·控制台标题Token统计回传] 本轮真实 token 统计仅用于聊天页控制台标题展示，不做持久化存储。 */
    tokenUsage,
    /* [区域标注·已完成·AI文字图/生图互斥运行时状态] 供聊天消息页决定是否接收 [文字图] 协议；状态只来自 DB.js / IndexedDB 中的 imageApi 配置。 */
    imageApiReady,
    textImageProtocolEnabled: !imageApiReady
  };
}
