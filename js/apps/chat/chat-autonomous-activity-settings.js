// @ts-nocheck
/**
 * 文件名: js/apps/chat/chat-autonomous-activity-settings.js
 * 用途: 闲谈应用 — 聊天设置页“自主活动”独立功能模块
 * 架构层: 应用层（闲谈子模块）
 */

import {
  DATA_KEY_MOMENTS,
  DATA_KEY_MESSAGES_PREFIX,
  DATA_KEY_CHAT_PROMPT_SETTINGS,
  STORE_NAME,
  dbGet,
  dbPut,
  escapeHtml,
  getCurrentChatPromptSettingsKey,
  createUid
} from './chat-utils.js';
import { refreshMomentsPanel } from './moments.js';

/* ==========================================================================
   [区域标注·已完成·自主活动设置默认值]
   说明：
   1. 本模块集中管理聊天设置页“自主活动”区域，方便后续针对性修改。
   2. 当前设置按“当前面具 + 当前聊天对象”写入 chatPromptSettings。
   3. 持久化统一通过 dbPut -> DB.js / IndexedDB；不使用 localStorage/sessionStorage，不写双份存储兜底。
   4. 默认关闭“主动发朋友圈”；默认时间间隔为 1 小时。
   ========================================================================== */
export const DEFAULT_AUTONOMOUS_ACTIVITY_SETTINGS = Object.freeze({
  autonomousMomentsEnabled: false,
  autonomousMomentsIntervalValue: 1,
  autonomousMomentsIntervalUnit: 'hour'
});

export const AUTONOMOUS_ACTIVITY_INTERVAL_UNITS = Object.freeze([
  { value: 'minute', label: '分钟' },
  { value: 'hour', label: '小时' }
]);

const WORLDBOOK_DB_RECORD_ID = 'worldbook::all-books';
const AUTONOMOUS_MOMENTS_META_KEY = (maskId, chatId) => `chat_autonomous_moments_meta_${maskId || 'default'}_${chatId || 'default'}`;

function isValidAutonomousActivityUnit(unit = '') {
  return AUTONOMOUS_ACTIVITY_INTERVAL_UNITS.some(item => item.value === unit);
}

/* ==========================================================================
   [区域标注·已完成·自主活动设置规范化]
   说明：
   1. 只规范化“自主活动”相关字段，不改动其它聊天设置字段。
   2. 时间间隔数值最小为 1；单位仅允许“分钟 / 小时”两种应用内分段按钮值。
   3. 不使用浏览器原生选择器，不使用浏览器原生弹窗。
   ========================================================================== */
export function normalizeAutonomousActivitySettings(source = {}) {
  const settings = source && typeof source === 'object' ? source : {};
  const rawValue = Number(settings.autonomousMomentsIntervalValue ?? DEFAULT_AUTONOMOUS_ACTIVITY_SETTINGS.autonomousMomentsIntervalValue);
  const intervalValue = Number.isFinite(rawValue)
    ? Math.max(1, Math.floor(rawValue))
    : DEFAULT_AUTONOMOUS_ACTIVITY_SETTINGS.autonomousMomentsIntervalValue;
  const rawUnit = String(settings.autonomousMomentsIntervalUnit || DEFAULT_AUTONOMOUS_ACTIVITY_SETTINGS.autonomousMomentsIntervalUnit);

  return {
    autonomousMomentsEnabled: Boolean(settings.autonomousMomentsEnabled),
    autonomousMomentsIntervalValue: intervalValue,
    autonomousMomentsIntervalUnit: isValidAutonomousActivityUnit(rawUnit)
      ? rawUnit
      : DEFAULT_AUTONOMOUS_ACTIVITY_SETTINGS.autonomousMomentsIntervalUnit
  };
}

function ensureStateAutonomousActivitySettings(state) {
  if (!state.chatPromptSettings || typeof state.chatPromptSettings !== 'object') {
    state.chatPromptSettings = {};
  }

  const normalized = normalizeAutonomousActivitySettings(state.chatPromptSettings);
  Object.assign(state.chatPromptSettings, normalized);
  return normalized;
}

async function persistAutonomousActivitySettings(state, db) {
  await dbPut(db, getCurrentChatPromptSettingsKey(state), state.chatPromptSettings);
}

/* ==========================================================================
   [区域标注·已完成·自主活动主动发朋友圈后台工具]
   说明：
   1. 本区只服务“主动发朋友圈”：间隔换算、IndexedDB 元数据、AI 返回 JSON 提取与副 API 请求。
   2. API 配置只读取设置应用里的 settings.api.secondary；不回退主 API，不写双份请求兜底。
   3. 朋友圈、世界书、聊天记录等持久化读写统一走 DB.js / IndexedDB；不使用 localStorage/sessionStorage。
   4. 不使用原生弹窗；后台失败只静默记录到 console，避免打断用户与造成页面闪屏。
   ========================================================================== */
function getAutonomousMomentsIntervalMs(settings = {}) {
  const normalized = normalizeAutonomousActivitySettings(settings);
  const value = Math.max(1, Number(normalized.autonomousMomentsIntervalValue || 1) || 1);
  return normalized.autonomousMomentsIntervalUnit === 'minute'
    ? value * 60 * 1000
    : value * 60 * 60 * 1000;
}

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
    temperature: Number.isFinite(Number(apiSettings?.global?.temperature)) ? Number(apiSettings.global.temperature) : 0.8,
    maxTokens: Math.max(256, Math.min(2048, Number(apiSettings?.global?.maxTokens || 1024) || 1024))
  };
}

function extractApiErrorMessage(payload, fallback = 'API 请求失败') {
  if (!payload) return fallback;
  if (typeof payload === 'string') return payload;
  return payload?.error?.message || payload?.error?.msg || payload?.message || payload?.detail || fallback;
}

async function requestAutonomousMomentsOpenAiLike(profile, messages) {
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
  if (!response.ok) {
    throw new Error(extractApiErrorMessage(payload, `HTTP ${response.status}`));
  }

  return String(payload?.choices?.[0]?.message?.content || '').trim();
}

function getSecondaryMessageContentText(content) {
  if (Array.isArray(content)) {
    return content
      .map(part => {
        if (typeof part === 'string') return part;
        if (part?.type === 'text') return String(part.text || '');
        if (part?.type === 'image_url') return `[朋友圈图片] ${String(part.image_url?.url || '').trim()}`;
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return String(content || '');
}

function isImageDataUrl(url = '') {
  return /^data:image\/[a-z0-9.+-]+;base64,/i.test(String(url || '').trim());
}

function parseImageDataUrl(url = '') {
  const match = String(url || '').trim().match(/^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i);
  return match ? { mimeType: match[1], data: match[2] } : null;
}

function getImageMimeTypeFromUrl(url = '') {
  const value = String(url || '').split('?')[0].split('#')[0].toLowerCase();
  if (isImageDataUrl(value)) return parseImageDataUrl(url)?.mimeType || 'image/png';
  if (value.endsWith('.jpg') || value.endsWith('.jpeg')) return 'image/jpeg';
  if (value.endsWith('.webp')) return 'image/webp';
  if (value.endsWith('.gif')) return 'image/gif';
  if (value.endsWith('.png')) return 'image/png';
  return 'image/png';
}

function toGeminiContentPart(part) {
  if (typeof part === 'string') return { text: part };
  if (part?.type === 'text') return { text: String(part.text || '') };
  if (part?.type === 'image_url') {
    const url = String(part.image_url?.url || '').trim();
    if (!url) return null;
    const dataUrl = parseImageDataUrl(url);
    if (dataUrl) {
      return {
        inlineData: {
          mimeType: dataUrl.mimeType,
          data: dataUrl.data
        }
      };
    }
    return {
      fileData: {
        mimeType: getImageMimeTypeFromUrl(url),
        fileUri: url
      }
    };
  }
  return null;
}

function toClaudeContentBlock(part) {
  if (typeof part === 'string') return { type: 'text', text: part };
  if (part?.type === 'text') return { type: 'text', text: String(part.text || '') };
  if (part?.type === 'image_url') {
    const url = String(part.image_url?.url || '').trim();
    if (!url) return null;
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
}

async function requestAutonomousMomentsGemini(profile, messages) {
  const parts = [];
  messages.forEach(item => {
    const roleLabel = item.role === 'system' ? '系统' : '用户';
    parts.push({ text: `${roleLabel}：` });
    if (Array.isArray(item.content)) {
      item.content.map(toGeminiContentPart).filter(Boolean).forEach(part => parts.push(part));
    } else {
      parts.push({ text: getSecondaryMessageContentText(item.content) });
    }
    parts.push({ text: '\n\n' });
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
  if (!response.ok) {
    throw new Error(extractApiErrorMessage(payload, `HTTP ${response.status}`));
  }

  return String(payload?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
}

async function requestAutonomousMomentsClaude(profile, messages) {
  const system = messages
    .filter(item => item.role === 'system')
    .map(item => getSecondaryMessageContentText(item.content))
    .filter(Boolean)
    .join('\n\n');
  const userContent = messages
    .filter(item => item.role !== 'system')
    .flatMap(item => Array.isArray(item.content)
      ? item.content.map(toClaudeContentBlock).filter(Boolean)
      : [{ type: 'text', text: getSecondaryMessageContentText(item.content) }])
    .filter(part => part?.type !== 'text' || String(part.text || '').trim());
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
      messages: [{ role: 'user', content: userContent.length ? userContent : [{ type: 'text', text: '请按要求返回 JSON。' }] }]
    })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(extractApiErrorMessage(payload, `HTTP ${response.status}`));
  }

  return String(payload?.content?.find?.(item => item?.type === 'text')?.text || payload?.content?.[0]?.text || '').trim();
}

async function requestAutonomousMomentsBySecondaryApi(profile, messages) {
  if (!profile.apiKey) throw new Error('副 API Key 不能为空');
  if (!profile.model) throw new Error('请先在设置应用选择副 API 模型');

  if (profile.provider === 'gemini') return requestAutonomousMomentsGemini(profile, messages);
  if (profile.provider === 'claude') return requestAutonomousMomentsClaude(profile, messages);
  return requestAutonomousMomentsOpenAiLike(profile, messages);
}

function extractJsonObjectFromAiText(text = '') {
  const raw = String(text || '').trim();
  if (!raw) return null;

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;
  const direct = (() => {
    try { return JSON.parse(candidate); } catch { return null; }
  })();
  if (direct && typeof direct === 'object') return direct;

  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(candidate.slice(start, end + 1)); } catch { return null; }
  }

  return null;
}

async function readRawDbRecordValue(db, key) {
  if (!db || !key) return null;
  try {
    const record = await db.get(STORE_NAME, key);
    return record ? (record.data ?? record.value ?? null) : null;
  } catch {
    return null;
  }
}

function getSessionForAutonomousMoments(state = {}) {
  const currentChatId = String(state.currentChatId || '').trim();
  if (!currentChatId) return null;
  return (Array.isArray(state.sessions) ? state.sessions : []).find(session => String(session?.id || '') === currentChatId) || null;
}

/* ==========================================================================
   [区域标注·已完成·朋友圈星星按钮与 AI 动态评论补齐] 互动角色会话兜底选择
   说明：
   1. 用户发布动态、点击动态右上角星星、AI 发布动态后的评论补齐，都优先使用当前聊天角色调用副 API。
   2. 若当前未打开聊天会话，则从聊天列表中选取一个不是动态发布者的联系人角色，避免原先无 currentChatId 时直接不调 API。
   3. 只读取运行时 state.sessions / state.contacts，不做任何持久化写入，不使用 localStorage/sessionStorage。
   ========================================================================== */
function getSessionForMomentAiInteraction(state = {}, moment = {}) {
  const currentSession = getSessionForAutonomousMoments(state);
  if (currentSession) return currentSession;

  const sessions = Array.isArray(state.sessions) ? state.sessions : [];
  if (!sessions.length) return null;

  const authorCandidates = new Set([
    moment?.authorId,
    moment?.authorRoleId,
    moment?.roleId,
    moment?.contactId,
    moment?.userId
  ].map(item => String(item || '').trim()).filter(Boolean));

  return sessions.find(session => {
    const sessionIds = [
      session?.id,
      session?.roleId,
      session?.characterId
    ].map(item => String(item || '').trim()).filter(Boolean);
    return sessionIds.length && !sessionIds.some(id => authorCandidates.has(id));
  }) || sessions[0] || null;
}

function getContactForAutonomousMoments(state = {}, session = {}) {
  const sessionId = String(session?.id || state.currentChatId || '').trim();
  return (Array.isArray(state.contacts) ? state.contacts : []).find(contact => String(contact?.id || '') === sessionId) || null;
}

function getCharacterForAutonomousMoments(state = {}, session = {}, contact = {}) {
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

function getMaskForAutonomousMoments(state = {}) {
  const maskId = String(state.activeMaskId || '').trim();
  return (Array.isArray(state.archiveMasks) ? state.archiveMasks : []).find(mask => String(mask?.id || '') === maskId) || null;
}

function formatEntityForPrompt(entity = {}, fallbackName = '未命名') {
  if (!entity || typeof entity !== 'object') return fallbackName;
  const lines = [
    `名称：${String(entity.name || entity.nickname || entity.remark || fallbackName).trim() || fallbackName}`,
    entity.gender ? `性别：${entity.gender}` : '',
    entity.age ? `年龄：${entity.age}` : '',
    entity.personality ? `性格：${entity.personality}` : '',
    entity.description ? `描述：${entity.description}` : '',
    entity.background ? `背景：${entity.background}` : '',
    entity.prompt ? `人设提示：${entity.prompt}` : '',
    entity.profile ? `档案：${entity.profile}` : ''
  ].filter(Boolean);
  return lines.join('\n');
}

function getLatestOneDayMessages(messages = [], now = Date.now()) {
  const source = Array.isArray(messages) ? messages : [];
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  const withRecentTimestamp = source.filter(item => {
    const timestamp = Number(item?.timestamp || item?.createdAt || 0) || 0;
    return timestamp >= oneDayAgo;
  });
  return (withRecentTimestamp.length ? withRecentTimestamp : source.slice(-30)).slice(-80);
}

function formatMessagesForAutonomousPrompt(messages = []) {
  return (Array.isArray(messages) ? messages : [])
    .map(item => {
      const role = item?.role === 'assistant' ? '角色' : (item?.role === 'user' ? '用户' : '系统');
      const type = String(item?.type || '').trim();
      const content = String(
        type === 'sticker'
          ? `[表情包] ${item?.stickerName || item?.content || ''}`
          : (type === 'image'
              ? `[图片] ${item?.imageName || item?.content || ''}`
              : (item?.content || ''))
      ).trim();
      return content ? `${role}：${content}` : '';
    })
    .filter(Boolean)
    .join('\n');
}

/* ==========================================================================
   [区域标注·已完成·本次朋友圈动态互动提示词与识图工具]
   说明：
   1. 本区只服务“用户发布动态后的角色互动”“联系人发布动态后的评论区互评/回评”“用户评论后的角色回评”。
   2. 提示词中明确区分用户、动态发布者、当前回复角色、其它通讯录联系人与可补充的配角，避免回复对象混淆与 OOC。
   3. 若朋友圈带图，会把图片作为视觉输入交给支持识图的副 API；不使用长文本/大媒体字段过滤。
   4. 最终点赞、评论、回复仍写回朋友圈 IndexedDB 记录；不使用 localStorage/sessionStorage。
   ========================================================================== */
function normalizeMomentImagesForVision(images = []) {
  return (Array.isArray(images) ? images : [])
    .map(item => String(item || '').trim())
    .filter(Boolean);
}

function formatContactsForMomentInteraction(contacts = [], { excludeIds = [] } = {}) {
  const excluded = new Set((Array.isArray(excludeIds) ? excludeIds : []).map(id => String(id || '').trim()).filter(Boolean));
  const lines = (Array.isArray(contacts) ? contacts : [])
    .map((item, index) => {
      const ids = [
        item?.id,
        item?.roleId,
        item?.characterId
      ].map(value => String(value || '').trim()).filter(Boolean);
      if (ids.some(id => excluded.has(id))) return '';
      const name = String(item?.name || item?.nickname || item?.contact || item?.remark || `联系人${index + 1}`).trim() || `联系人${index + 1}`;
      const meta = [
        `authorId候选：${ids.join(' / ') || name}`,
        item?.remark ? `备注：${item.remark}` : '',
        item?.description ? `描述：${item.description}` : '',
        item?.personality ? `性格：${item.personality}` : ''
      ].filter(Boolean).join('；');
      return `- ${name}（${meta}）`;
    })
    .filter(Boolean);

  return lines.length
    ? lines.join('\n')
    : '通讯录里没有其它可直接参与互动的联系人；如需要烘托真实感，可按关系网/世界书补充少量有姓名的配角或路人。';
}

function buildUserMomentInteractionPrompt({ character, mask, session, contact, contacts, worldBooks, messages, moment }) {
  const roleName = String(character?.name || contact?.name || session?.remark || session?.name || '当前角色').trim() || '当前角色';
  const roleId = String(character?.id || contact?.roleId || session?.id || roleName).trim() || roleName;
  const userName = String(mask?.name || mask?.nickname || '用户面具身份').trim() || '用户面具身份';
  const momentAuthorName = String(moment?.authorName || userName).trim() || userName;
  const isUserMoment = String(moment?.authorId || '') === String(mask?.id || mask?.maskId || '') || !String(moment?.autonomousSource || '').trim();
  const publisherLabel = isUserMoment ? `${momentAuthorName}（用户）` : `${momentAuthorName}（朋友圈联系人）`;
  const conversationText = formatMessagesForAutonomousPrompt(messages) || '最近一天暂无可用聊天内容。';
  const worldBookText = summarizeWorldBooksForAutonomousPrompt(worldBooks, { character, session, contact }) || '当前没有命中的世界书条目。';
  const momentText = String(moment?.content || '').trim() || '（动态没有写文字）';
  const momentLocation = String(moment?.location || '').trim();
  const images = normalizeMomentImagesForVision(moment?.images);
  const commentsText = JSON.stringify(Array.isArray(moment?.comments) ? moment.comments : [], null, 2);
  const otherContactsText = formatContactsForMomentInteraction(contacts, { excludeIds: [roleId] });
  const userParts = [
    {
      type: 'text',
      text: `【当前要互动的核心角色】
角色名：${roleName}
角色ID：${roleId}
${formatEntityForPrompt(character || contact || session, roleName)}

【用户面具身份】
${formatEntityForPrompt(mask, userName)}

【其它可参与评论区互动的人】
${otherContactsText}

【世界书条目】
${worldBookText}

【最近一天与用户的对话】
${conversationText}

【当前朋友圈动态】
发布者：${publisherLabel}
动态ID：${String(moment?.id || '').trim()}
文案：${momentText}
${momentLocation ? `地点：${momentLocation}` : '地点：无'}
图片数量：${images.length}
当前评论区（若为空则代表你是较早互动的人）：
${commentsText}

${images.length ? '下面附带的图片就是这条朋友圈配图，请结合图像内容、文案、关系与评论区一起生成互动。' : '这条朋友圈没有图片，请只根据文案、关系与评论区生成互动。'}

请以“${roleName}”的身份，在不 OOC 的前提下生成真实朋友圈互动。`
    },
    ...images.map(url => ({
      type: 'image_url',
      image_url: { url }
    }))
  ];

  return [
    {
      role: 'system',
      content: `你正在扮演“${roleName}”。现在的任务是：对“${momentAuthorName}”刚发布的朋友圈做一次完整评论区互动生成。

你必须严格分清楚：
1. 动态发布者 = ${momentAuthorName}；发布者可能是用户，也可能是通讯录联系人。
2. 你当前扮演的“${roleName}” = 主要互动角色，可以点赞、评论，也可以在评论区回复别人。
3. 除发布者之外，评论区里还可能出现其它通讯录联系人，若通讯录人数不足，也可以根据关系网和世界书补充少量有姓名配角/路人。
4. 不要把“谁在回复谁”搞混，不要让其它联系人冒充发布者。

硬性规则：
1. 所有互动必须符合“${roleName}”的人设、与用户关系、世界书背景和最近一天对话氛围，不能 OOC。
2. 你需要一次性返回“生成结果”，但这些互动会被系统分条依次展示，所以内容必须像真实朋友圈评论区，可有先后承接。
3. 允许生成：点赞列表、评论列表、针对某条评论的回复列表。评论区可以有“${roleName}”本人，也可以有其它联系人/配角。
4. 若通讯录里只有一个联系人，可以按关系网/世界书补充少量路人或有姓名配角来评论/点赞，但要自然，不要喧宾夺主。
5. 评论和回复要短、自然、有熟人感；可以关心、调侃、接梗、吐槽、跟评，但不要写成长文。
6. 如果有图片，必须结合图片内容；不要空泛夸图。
7. 禁止出现“AI、模型、API、系统、提示词、生成、设定要求、识图”等出戏词。
8. 不要使用 Markdown，不要解释。
9. 只输出一个 JSON 对象，格式必须严格为：
{"likes":[{"id":"点赞者ID","name":"点赞者名字"}],"comments":[{"authorId":"评论者ID","authorName":"评论者名字","content":"评论内容","replies":[{"authorId":"回复者ID","authorName":"回复者名字","content":"回复内容"}]}],"directReplies":[]}
10. comments 里的 replies 表示“对这条新评论的后续回复”。
11. 若某部分没有内容，返回空数组。
12. 不要输出 JSON 以外的任何字符。`
    },
    {
      role: 'user',
      content: userParts
    }
  ];
}

function buildMomentCommentReplyPrompt({
  actor = {},
  actorContext = {},
  mask = {},
  worldBooks = [],
  messages = [],
  moment = {},
  targetComment = {},
  contacts = []
}) {
  const actorName = String(actor?.name || actor?.authorName || actor?.nickname || '当前回复角色').trim() || '当前回复角色';
  const actorId = String(actor?.id || actor?.authorId || actor?.roleId || actorName).trim() || actorName;
  const userName = String(mask?.name || mask?.nickname || '用户面具身份').trim() || '用户面具身份';
  const commentAuthorName = String(targetComment?.authorName || '评论者').trim() || '评论者';
  const commentAuthorId = String(targetComment?.authorId || commentAuthorName).trim() || commentAuthorName;
  const conversationText = formatMessagesForAutonomousPrompt(messages) || '最近一天暂无可用聊天内容。';
  const worldBookText = summarizeWorldBooksForAutonomousPrompt(worldBooks, actorContext) || '当前没有命中的世界书条目。';
  const otherContactsText = formatContactsForMomentInteraction(contacts, { excludeIds: [actorId, commentAuthorId] });
  const momentCommentsText = JSON.stringify(Array.isArray(moment?.comments) ? moment.comments : [], null, 2);

  return [
    {
      role: 'system',
      content: `你正在扮演“${actorName}”，现在要在朋友圈评论区里回复别人。

你必须严格分清楚：
1. 动态发布者是谁。
2. 当前需要回复的目标评论作者是谁。
3. 你自己是谁。
4. 其它联系人只是评论区旁观者或跟评者，不能和发布者/目标评论作者混淆。

硬性规则：
1. 回复内容必须符合“${actorName}”的人设、关系、世界书和最近对话氛围，不能 OOC。
2. 如果目标评论作者是用户，表示你在回复用户；如果目标评论作者不是用户，表示你在回复评论区里的其它角色。
3. 可以顺带生成一两条其它人的跟评/补充回复，但主回复必须清晰指向目标评论。
4. 回复要像真实朋友圈评论区，短、自然、有承接感。
5. 禁止出现“AI、模型、API、系统、提示词、生成、设定要求”等出戏词。
6. 不要使用 Markdown，不要解释。
7. 只输出一个 JSON 对象，格式必须严格为：
{"replies":[{"commentId":"要回复的评论ID","authorId":"回复者ID","authorName":"回复者名字","content":"回复内容"}],"comments":[{"authorId":"跟评者ID","authorName":"跟评者名字","content":"新增评论内容","replies":[]}]}
8. replies 里第一条必须是“${actorName}”对目标评论的回复；comments 是可选新增跟评。
9. 不要输出 JSON 以外的任何字符。`
    },
    {
      role: 'user',
      content: `【当前回复角色】
角色名：${actorName}
角色ID：${actorId}
${formatEntityForPrompt(actor, actorName)}

【用户面具身份】
${formatEntityForPrompt(mask, userName)}

【目标评论作者】
作者名：${commentAuthorName}
作者ID：${commentAuthorId}

【其它可能参与互动的人】
${otherContactsText}

【世界书条目】
${worldBookText}

【最近一天与用户的对话】
${conversationText}

【当前朋友圈动态】
发布者：${String(moment?.authorName || userName).trim() || userName}
动态ID：${String(moment?.id || '').trim()}
文案：${String(moment?.content || '').trim() || '（无正文）'}

【当前评论区】
${momentCommentsText}

【本次必须回复的目标评论】
评论ID：${String(targetComment?.id || '').trim()}
评论作者：${commentAuthorName}
评论内容：${String(targetComment?.content || '').trim() || '（无内容）'}

请生成“${actorName}”的回复，并严格区分回复对象。`
    }
  ];
}

/* ==========================================================================
   [区域标注·已完成·本次朋友圈互动结果解析与逐条入场写回工具]
   说明：
   1. 本区只服务朋友圈互动结果的 JSON 解析、评论定位、逐条展示写回与局部刷新。
   2. 生成仍为一次性副 API 返回，但点赞、评论、回复会按顺序逐条出现，营造真实感。
   3. 持久化统一走 DB.js / IndexedDB，不使用 localStorage/sessionStorage，不写双份兜底。
   ========================================================================== */
function sleepForMomentInteraction(ms = 180) {
  return new Promise(resolve => window.setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function normalizeMomentInteractionPlanPayload(rawPayload = {}) {
  const likes = Array.isArray(rawPayload?.likes) ? rawPayload.likes : [];
  const comments = Array.isArray(rawPayload?.comments) ? rawPayload.comments : [];
  const directReplies = Array.isArray(rawPayload?.directReplies)
    ? rawPayload.directReplies
    : (Array.isArray(rawPayload?.replies) ? rawPayload.replies : []);

  return {
    likes: likes
      .map(item => ({
        id: String(item?.id || item?.authorId || item?.viewerId || '').trim(),
        name: String(item?.name || item?.authorName || item?.nickname || '').trim()
      }))
      .filter(item => item.id || item.name),
    comments: comments
      .map(item => {
        const content = String(item?.content || item?.text || '').trim();
        if (!content) return null;
        return {
          id: String(item?.id || '').trim(),
          authorId: String(item?.authorId || item?.id || '').trim(),
          authorName: String(item?.authorName || item?.name || '').trim(),
          content: content.slice(0, 120),
          replies: Array.isArray(item?.replies)
            ? item.replies.map(reply => {
                const replyContent = String(reply?.content || reply?.text || '').trim();
                if (!replyContent) return null;
                return {
                  commentId: String(reply?.commentId || item?.id || '').trim(),
                  authorId: String(reply?.authorId || '').trim(),
                  authorName: String(reply?.authorName || reply?.name || '').trim(),
                  content: replyContent.slice(0, 120)
                };
              }).filter(Boolean)
            : []
        };
      })
      .filter(Boolean),
    directReplies: directReplies
      .map(item => {
        const content = String(item?.content || item?.text || '').trim();
        if (!content) return null;
        return {
          commentId: String(item?.commentId || '').trim(),
          authorId: String(item?.authorId || item?.id || '').trim(),
          authorName: String(item?.authorName || item?.name || '').trim(),
          content: content.slice(0, 120)
        };
      })
      .filter(Boolean)
  };
}

function findMomentCommentById(moment = {}, commentId = '') {
  const safeCommentId = String(commentId || '').trim();
  if (!safeCommentId) return null;
  return (Array.isArray(moment?.comments) ? moment.comments : []).find(comment => String(comment?.id || '') === safeCommentId) || null;
}

function ensureMomentCommentReplies(comment) {
  if (!comment || typeof comment !== 'object') return [];
  if (!Array.isArray(comment.replies)) comment.replies = [];
  return comment.replies;
}

async function persistAndRefreshMomentInteractions({ state, db, container } = {}) {
  await dbPut(db, DATA_KEY_MOMENTS(state.activeMaskId), Array.isArray(state.moments) ? state.moments : []);
  if (container?.isConnected && state.activePanel === 'moments') {
    refreshMomentsPanel(container, state);
  }
}

async function applyMomentInteractionPlanSequentially({
  state = {},
  db = null,
  container = null,
  moment = null,
  plan = {},
  actorId = '',
  actorName = '',
  fallbackReplyTargetCommentId = ''
} = {}) {
  if (!moment || typeof moment !== 'object') return false;

  const likes = Array.isArray(moment.likes) ? moment.likes.slice() : [];
  const comments = Array.isArray(moment.comments) ? moment.comments.slice() : [];
  let changed = false;

  const saveStep = async (shouldDelay = true) => {
    await persistAndRefreshMomentInteractions({ state, db, container });
    if (shouldDelay) await sleepForMomentInteraction(160);
  };

  for (const like of Array.isArray(plan.likes) ? plan.likes : []) {
    const nextLikeId = String(like?.id || actorId || '').trim();
    const nextLikeName = String(like?.name || actorName || '').trim() || actorName || '匿名';
    const alreadyLiked = likes.some(item => {
      if (typeof item === 'string' || typeof item === 'number') return String(item) === nextLikeId;
      return String(item?.id || item?.viewerId || item?.authorId || '') === nextLikeId;
    });
    if (alreadyLiked) continue;

    likes.push({
      id: nextLikeId,
      name: nextLikeName,
      likedAt: Date.now(),
      source: 'moment-ai-interaction'
    });
    moment.likes = likes.slice();
    changed = true;
    await saveStep();
  }

  for (const commentItem of Array.isArray(plan.comments) ? plan.comments : []) {
    const nextCommentId = String(commentItem?.id || createUid('moment_comment')).trim();
    const nextComment = {
      id: nextCommentId,
      authorId: String(commentItem?.authorId || actorId || '').trim() || actorId,
      authorName: String(commentItem?.authorName || actorName || '').trim() || actorName || '匿名',
      content: String(commentItem?.content || '').trim().slice(0, 120),
      createdAt: Date.now(),
      replies: [],
      autonomousSource: 'moment-ai-interaction'
    };
    if (!nextComment.content) continue;

    comments.push(nextComment);
    moment.comments = comments;
    changed = true;
    await saveStep();

    for (const replyItem of Array.isArray(commentItem?.replies) ? commentItem.replies : []) {
      const targetCommentId = String(replyItem?.commentId || nextComment.id || fallbackReplyTargetCommentId).trim();
      const targetComment = findMomentCommentById(moment, targetCommentId) || nextComment;
      const targetReplies = ensureMomentCommentReplies(targetComment);
      const replyContent = String(replyItem?.content || '').trim().slice(0, 120);
      if (!replyContent) continue;

      targetReplies.push({
        id: createUid('moment_reply'),
        commentId: targetCommentId,
        authorId: String(replyItem?.authorId || actorId || '').trim() || actorId,
        authorName: String(replyItem?.authorName || actorName || '').trim() || actorName || '匿名',
        content: replyContent,
        createdAt: Date.now(),
        autonomousSource: 'moment-ai-interaction'
      });
      changed = true;
      await saveStep();
    }
  }

  for (const replyItem of Array.isArray(plan.directReplies) ? plan.directReplies : []) {
    const targetCommentId = String(replyItem?.commentId || fallbackReplyTargetCommentId || '').trim();
    const targetComment = findMomentCommentById(moment, targetCommentId);
    if (!targetComment) continue;

    const replyContent = String(replyItem?.content || '').trim().slice(0, 120);
    if (!replyContent) continue;

    const targetReplies = ensureMomentCommentReplies(targetComment);
    targetReplies.push({
      id: createUid('moment_reply'),
      commentId: targetCommentId,
      authorId: String(replyItem?.authorId || actorId || '').trim() || actorId,
      authorName: String(replyItem?.authorName || actorName || '').trim() || actorName || '匿名',
      content: replyContent,
      createdAt: Date.now(),
      autonomousSource: 'moment-ai-interaction'
    });
    changed = true;
    await saveStep();
  }

  if (changed) {
    moment.likes = likes;
    moment.comments = comments;
    await persistAndRefreshMomentInteractions({ state, db, container });
  }

  return changed;
}

/* ==========================================================================
   [区域标注·已完成·AI朋友圈世界书完整注入与批量去重工具]
   说明：
   1. 自主活动/即时发布均不再限制世界书本数，也不限制每本世界书的启用条目数量。
   2. 只筛选世界书自身 enabled !== false、条目 enabled !== false；不做长文本/大媒体字段过滤。
   3. 全局世界书（无绑定角色）与角色绑定世界书统一按世界书 id 去重；批量即时发布同一批副 API 请求内同一本世界书正文只发送一次。
   4. 世界书数据只从 DB.js / IndexedDB 读取，不使用 localStorage/sessionStorage。
   ========================================================================== */
function getWorldBookStableId(book = {}, index = 0) {
  return String(book?.id || book?.archiveSourceKey || book?.name || book?.title || `worldbook-${index}`).trim() || `worldbook-${index}`;
}

function getWorldBookBoundCharacterIds(book = {}) {
  return Array.from(new Set(
    (Array.isArray(book?.boundCharacterIds) ? book.boundCharacterIds : (book?.boundCharacterId ? [book.boundCharacterId] : []))
      .map(id => String(id || '').trim())
      .filter(Boolean)
  ));
}

function getMomentCharacterCandidateIds(character = null, session = {}, contact = {}) {
  return Array.from(new Set([
    character?.id,
    contact?.roleId,
    session?.roleId,
    contact?.characterId,
    session?.characterId,
    contact?.id,
    session?.id
  ].map(item => String(item || '').trim()).filter(Boolean)));
}

function isWorldBookApplicableToMomentContext(book = {}, candidateIds = []) {
  if (!book || typeof book !== 'object') return false;
  if (book.enabled === false) return false;

  const boundIds = getWorldBookBoundCharacterIds(book);
  if (!boundIds.length) return true;

  const candidateSet = new Set((Array.isArray(candidateIds) ? candidateIds : []).map(id => String(id || '').trim()).filter(Boolean));
  return boundIds.some(id => candidateSet.has(id));
}

function getApplicableWorldBooksForMoment(worldBooks = [], { character = null, session = {}, contact = {} } = {}) {
  const books = Array.isArray(worldBooks) ? worldBooks : [];
  const candidateIds = getMomentCharacterCandidateIds(character, session, contact);
  return books
    .map((book, index) => ({ book, index, stableId: getWorldBookStableId(book, index) }))
    .filter(item => isWorldBookApplicableToMomentContext(item.book, candidateIds));
}

function formatWorldBookForAutonomousPrompt(book = {}, index = 0) {
  const stableId = getWorldBookStableId(book, index);
  const bookName = String(book?.name || book?.title || '世界书').trim() || '世界书';
  const boundIds = getWorldBookBoundCharacterIds(book);
  const scopeText = boundIds.length ? `绑定角色ID：${boundIds.join(', ')}` : '全局世界书：适用于本批任务中所有联系人';
  const entries = Array.isArray(book?.entries) ? book.entries : [];
  const entryText = entries
    .filter(entry => entry && entry.enabled !== false)
    .map((entry, entryIndex) => {
      const title = String(entry.title || entry.name || `条目${entryIndex + 1}`).trim() || `条目${entryIndex + 1}`;
      const content = String(entry.content || entry.text || entry.description || '').trim();
      const keywords = Array.isArray(entry.keywords) && entry.keywords.length
        ? `关键词：${entry.keywords.map(keyword => String(keyword || '').trim()).filter(Boolean).join('、')}`
        : '';
      return [
        `- ${title}`,
        keywords ? `  ${keywords}` : '',
        content ? `  内容：${content}` : ''
      ].filter(Boolean).join('\n');
    })
    .filter(Boolean)
    .join('\n');

  return [
    `【${bookName}】`,
    `世界书ID：${stableId}`,
    scopeText,
    entryText || '（本世界书当前没有启用条目）'
  ].filter(Boolean).join('\n');
}

function summarizeWorldBooksForAutonomousPrompt(worldBooks = [], context = {}) {
  return getApplicableWorldBooksForMoment(worldBooks, context)
    .map(item => formatWorldBookForAutonomousPrompt(item.book, item.index))
    .filter(Boolean)
    .join('\n\n');
}

/* ==========================================================================
   [区域标注·已完成·AI自主/单选发布朋友圈提示词]
   说明：
   1. 本提示词用于“主动发朋友圈”后台定时发布，以及朋友圈爱心按钮单联系人即时发布。
   2. 爱心按钮即时发布不依赖聊天设置里的“主动发朋友圈”开关；二者分别对应被动即时触发与主动定时触发。
   3. 世界书完整注入：命中的全局/角色绑定世界书全部发送，启用条目全部发送，不再截断 6 本/8 条。
   4. 提示词要求 AI 严格返回单条 JSON 对象，便于写入朋友圈 IndexedDB 记录；不暴露 API、系统、提示词或生成过程。
   ========================================================================== */
function buildAutonomousMomentsPrompt({ character, mask, session, contact, worldBooks, messages }) {
  const roleName = String(character?.name || contact?.name || session?.remark || session?.name || '当前角色').trim() || '当前角色';
  const userName = String(mask?.name || mask?.nickname || '用户面具身份').trim() || '用户面具身份';
  const conversationText = formatMessagesForAutonomousPrompt(messages) || '最近一天暂无可用聊天内容。';
  const worldBookText = summarizeWorldBooksForAutonomousPrompt(worldBooks, { character, session, contact }) || '当前没有命中的世界书条目。';

  return [
    {
      role: 'system',
      content: `你正在扮演“${roleName}”。现在需要你以这个角色本人的身份，主动发布一条朋友圈动态。

硬性规则：
1. 这是单人朋友圈生成任务：只为“${roleName}”生成一条朋友圈，不要生成多条。
2. 只根据角色人设、用户面具身份、世界书条目、最近一天对话内容来写。
3. 动态要像角色自己自然发布的日常、感想、吐槽、分享或隐晦情绪，不要像剧情总结。
4. 可以含蓄提到与“${userName}”相关的情绪或事件，但不要替用户发言，不要泄露后台资料。
5. 禁止出现“AI、模型、API、系统、提示词、生成、设定要求”等出戏词。
6. 不要使用 Markdown，不要解释。
7. 只输出一个 JSON 对象，格式必须是：
{"content":"朋友圈正文，1到120字","location":"可选地点，没有就留空"}
8. 不要输出 JSON 以外的任何字符。`
    },
    {
      role: 'user',
      content: `【角色人设】
${formatEntityForPrompt(character || contact || session, roleName)}

【用户面具身份】
${formatEntityForPrompt(mask, userName)}

【世界书条目】
${worldBookText}

【最近一天与用户的对话】
${conversationText}

请现在只为“${roleName}”生成一条符合角色状态的朋友圈动态。`
    }
  ];
}

/* ==========================================================================
   [区域标注·已完成·朋友圈爱心多选批量提示词]
   说明：
   1. 仅用于朋友圈左上角爱心按钮多选联系人即时发布；每批最多 4 个联系人调用一次副 API。
   2. 同一批次中用户设定只发送一次；全局世界书只发送一次；多个联系人共用的角色绑定世界书按 id 去重后只发送一次。
   3. 每位联系人仍单独携带自己的角色人设、适用世界书引用、最新一天对话，提示词明确要求逐联系人独立生成，避免串戏。
   4. 返回必须是 {"moments":[...]}，每条结果带 contactId；后续写入仍走 DB.js / IndexedDB。
   ========================================================================== */
function buildBatchAutonomousMomentsPrompt({ mask, items = [], worldBooks = [] }) {
  const userName = String(mask?.name || mask?.nickname || '用户面具身份').trim() || '用户面具身份';
  const uniqueWorldBookMap = new Map();

  (Array.isArray(items) ? items : []).forEach(item => {
    getApplicableWorldBooksForMoment(worldBooks, {
      character: item.character,
      session: item.session,
      contact: item.contact
    }).forEach(worldBookItem => {
      if (!uniqueWorldBookMap.has(worldBookItem.stableId)) {
        uniqueWorldBookMap.set(worldBookItem.stableId, worldBookItem);
      }
    });
  });

  const sharedWorldBookText = Array.from(uniqueWorldBookMap.values())
    .map(item => formatWorldBookForAutonomousPrompt(item.book, item.index))
    .filter(Boolean)
    .join('\n\n') || '本批联系人没有命中的世界书条目。';

  const contactTasksText = (Array.isArray(items) ? items : []).map((item, index) => {
    const roleName = String(item.character?.name || item.contact?.name || item.session?.remark || item.session?.name || `联系人${index + 1}`).trim() || `联系人${index + 1}`;
    const worldBookRefs = getApplicableWorldBooksForMoment(worldBooks, {
      character: item.character,
      session: item.session,
      contact: item.contact
    }).map(worldBookItem => {
      const name = String(worldBookItem.book?.name || worldBookItem.book?.title || '世界书').trim() || '世界书';
      return `${worldBookItem.stableId}（${name}）`;
    });
    return `【联系人任务 ${index + 1}】
contactId：${item.contactId}
角色名：${roleName}
适用世界书引用：${worldBookRefs.length ? worldBookRefs.join('；') : '无'}
角色人设：
${formatEntityForPrompt(item.character || item.contact || item.session, roleName)}

最近一天与用户的对话：
${formatMessagesForAutonomousPrompt(item.messages) || '最近一天暂无可用聊天内容。'}`;
  }).join('\n\n');

  const expectedIds = (Array.isArray(items) ? items : []).map(item => item.contactId).join('、');

  return [
    {
      role: 'system',
      content: `你正在执行“批量生成朋友圈动态”任务。本次会给出多位联系人，但必须分别为每位联系人独立生成一条朋友圈。

硬性规则：
1. 这是多联系人批量任务，不是群聊，不是共同发帖，不要把多位联系人合并成同一条动态。
2. 必须为每个 contactId 各生成一条朋友圈；返回数量必须等于本批联系人数量。
3. 每条朋友圈只能使用该 contactId 对应联系人的角色人设、适用世界书引用、最近一天对话来写；共享用户设定和共享世界书只作为公共背景。
4. 不要把 A 联系人的语气、经历、对话或情绪写到 B 联系人的朋友圈里。
5. 不要在某位联系人的朋友圈里提到其它被选择联系人，除非该联系人自己的对话或人设里自然出现。
6. 动态要像角色自己自然发布的日常、感想、吐槽、生活分享或隐晦情绪，有互动感，但不要像剧情总结。
7. 可以含蓄体现与“${userName}”相关的情绪或事件，但不要替用户发言，不要泄露后台资料。
8. 禁止出现“AI、模型、API、系统、提示词、生成、设定要求”等出戏词。
9. 不要使用 Markdown，不要解释。
10. 只输出一个 JSON 对象，格式必须是：
{"moments":[{"contactId":"联系人ID","content":"该联系人自己的朋友圈正文，1到120字","location":"可选地点，没有就留空"}]}
11. contactId 只能使用以下值，不能新增、改写或遗漏：${expectedIds || '无'}。
12. 不要输出 JSON 以外的任何字符。`
    },
    {
      role: 'user',
      content: `【共享用户面具身份，只发送一次，适用于本批所有联系人】
${formatEntityForPrompt(mask, userName)}

【共享世界书，只发送一次；包含全局世界书和本批联系人命中的角色绑定世界书，已按世界书ID去重】
${sharedWorldBookText}

【联系人任务列表：请逐个 contactId 独立生成，不要混淆】
${contactTasksText}

请严格按 contactId 分别生成朋友圈动态，并返回 JSON。`
    }
  ];
}

function normalizeAutonomousMomentPayload(rawPayload = {}) {
  const content = String(rawPayload?.content || rawPayload?.text || rawPayload?.moment || '').trim();
  const location = String(rawPayload?.location || '').trim();
  if (!content) return null;

  return {
    content: content.slice(0, 240),
    location: location.slice(0, 40)
  };
}

function normalizeBatchAutonomousMomentPayload(rawPayload = {}) {
  const moments = Array.isArray(rawPayload?.moments)
    ? rawPayload.moments
    : (Array.isArray(rawPayload) ? rawPayload : []);
  return moments
    .map(item => ({
      contactId: String(item?.contactId || item?.id || '').trim(),
      ...normalizeAutonomousMomentPayload(item)
    }))
    .filter(item => item.contactId && item.content);
}

async function loadAutonomousMomentsSettingsForCurrentChat(state, db) {
  const currentKey = getCurrentChatPromptSettingsKey(state);
  const stored = await dbGet(db, currentKey);
  if (stored && typeof stored === 'object') {
    state.chatPromptSettings = {
      ...(state.chatPromptSettings || {}),
      ...stored
    };
  }
  return ensureStateAutonomousActivitySettings(state);
}

async function loadMessagesForAutonomousMoments(state, db, session) {
  if (String(state.currentChatId || '') === String(session?.id || '') && Array.isArray(state.currentMessages) && state.currentMessages.length) {
    return state.currentMessages;
  }
  return (await dbGet(db, `${DATA_KEY_MESSAGES_PREFIX(state.activeMaskId)}${session.id}`)) || [];
}

async function publishAutonomousMomentForSession({
  state,
  container,
  db,
  session,
  settings,
  profile,
  source = 'chat-autonomous-activity'
} = {}) {
  if (!session) return false;

  const normalizedSettings = normalizeAutonomousActivitySettings(settings || {});
  if (!normalizedSettings.autonomousMomentsEnabled) return false;
  if (!profile?.apiKey || !profile?.model) return false;

  const now = Date.now();
  const contact = getContactForAutonomousMoments(state, session);
  const character = getCharacterForAutonomousMoments(state, session, contact);
  const mask = getMaskForAutonomousMoments(state);
  const [worldBooks, messages] = await Promise.all([
    readRawDbRecordValue(db, WORLDBOOK_DB_RECORD_ID),
    loadMessagesForAutonomousMoments(state, db, session)
  ]);

  const promptMessages = buildAutonomousMomentsPrompt({
    character,
    mask,
    session,
    contact,
    worldBooks: Array.isArray(worldBooks) ? worldBooks : [],
    messages: getLatestOneDayMessages(messages, now)
  });
  const rawText = await requestAutonomousMomentsBySecondaryApi(profile, promptMessages);
  const parsed = normalizeAutonomousMomentPayload(extractJsonObjectFromAiText(rawText));
  if (!parsed) return false;

  const roleName = String(character?.name || contact?.name || session?.remark || session?.name || '角色').trim() || '角色';
  const roleAvatar = String(contact?.avatar || session?.avatar || character?.avatar || '').trim();
  const nextMoment = {
    id: createUid('moment'),
    authorId: String(character?.id || contact?.roleId || session?.id || '').trim(),
    authorName: roleName,
    authorAvatar: roleAvatar,
    content: parsed.content,
    images: [],
    likes: [],
    comments: [],
    reposts: [],
    shares: [],
    createdAt: now,
    location: parsed.location,
    visibilityMode: 'public',
    visibleContactIds: [],
    visibleContactNames: [],
    autonomousSource: source
  };

  const currentMoments = Array.isArray(state.moments)
    ? state.moments
    : ((await dbGet(db, DATA_KEY_MOMENTS(state.activeMaskId))) || []);
  state.moments = [nextMoment, ...currentMoments];
  await dbPut(db, DATA_KEY_MOMENTS(state.activeMaskId), state.moments);

  if (container?.isConnected && state.activePanel === 'moments') {
    refreshMomentsPanel(container, state);
  }

  await dbPut(db, AUTONOMOUS_MOMENTS_META_KEY(state.activeMaskId, session.id), {
    lastPublishedAt: now,
    lastMomentId: nextMoment.id,
    updatedAt: now
  });

  return true;
}

async function publishAutonomousMoment({ state, container, db, settingsManager }) {
  const session = getSessionForAutonomousMoments(state);
  if (!session) return false;

  const settings = await loadAutonomousMomentsSettingsForCurrentChat(state, db);
  if (!settings.autonomousMomentsEnabled) return false;

  const allSettings = settingsManager && typeof settingsManager.getAll === 'function'
    ? await settingsManager.getAll()
    : {};
  const profile = normalizeSecondaryApiProfile(allSettings?.api || {});

  return publishAutonomousMomentForSession({
    state,
    container,
    db,
    session,
    settings,
    profile,
    source: 'chat-autonomous-activity'
  });
}

/* ==========================================================================
   [区域标注·已完成·朋友圈左上角爱心即时 AI 发布]
   说明：
   1. 本区只服务朋友圈页面左上角“爱心”按钮选择通讯录联系人后即时发布朋友圈。
   2. 爱心按钮即时发布会直接生成并写入朋友圈动态，不再要求联系人聊天设置里的“主动发朋友圈”开关开启。
   3. 即时发布与“主动发朋友圈”开关没有前后因果关系：爱心按钮是被动即时触发，开关只控制后台主动定时发布。
   4. 单选/多选统一按批次调用副 API；每批最多 4 位联系人，并在同批次内让用户设定、全局世界书、共用角色世界书只发送一次。
   5. 批量提示词明确要求 AI 按 contactId 分别为每位联系人生成动态，避免把多位联系人当群聊、共同发帖或互相串戏。
   6. AI 生成朋友圈动态仅调用设置应用里的副 API；朋友圈写入统一走 DB.js / IndexedDB；不使用 localStorage/sessionStorage，不做长文本/大媒体字段过滤。
   ========================================================================== */
const INSTANT_AUTONOMOUS_MOMENTS_BATCH_SIZE = 4;

function getSessionForInstantAutonomousMoment(state = {}, contact = {}) {
  const contactId = String(contact?.id || contact?.roleId || '').trim();
  const sessions = Array.isArray(state.sessions) ? state.sessions : [];
  const existed = sessions.find(session => String(session?.id || '') === contactId);
  if (existed) return existed;

  return {
    id: contactId,
    name: String(contact?.name || contact?.nickname || contact?.contact || '未命名联系人').trim() || '未命名联系人',
    remark: String(contact?.remark || '').trim(),
    avatar: String(contact?.avatar || '').trim(),
    roleId: String(contact?.roleId || '').trim(),
    characterId: String(contact?.characterId || '').trim()
  };
}

function createAutonomousMomentRecord({
  state = {},
  session = {},
  contact = null,
  character = null,
  parsed = {},
  now = Date.now(),
  source = 'chat-autonomous-activity'
} = {}) {
  const roleName = String(character?.name || contact?.name || session?.remark || session?.name || '角色').trim() || '角色';
  const roleAvatar = String(contact?.avatar || session?.avatar || character?.avatar || '').trim();

  return {
    id: createUid('moment'),
    authorId: String(character?.id || contact?.roleId || session?.id || '').trim(),
    authorName: roleName,
    authorAvatar: roleAvatar,
    content: parsed.content,
    images: [],
    likes: [],
    comments: [],
    reposts: [],
    shares: [],
    createdAt: now,
    location: parsed.location,
    visibilityMode: 'public',
    visibleContactIds: [],
    visibleContactNames: [],
    autonomousSource: source
  };
}

function chunkInstantAutonomousMomentItems(items = [], size = INSTANT_AUTONOMOUS_MOMENTS_BATCH_SIZE) {
  const chunks = [];
  const safeSize = Math.max(1, Number(size) || INSTANT_AUTONOMOUS_MOMENTS_BATCH_SIZE);
  for (let index = 0; index < items.length; index += safeSize) {
    chunks.push(items.slice(index, index + safeSize));
  }
  return chunks;
}

async function collectInstantAutonomousMomentItems({
  state = {},
  db = null,
  selectedIds = [],
  result = {}
} = {}) {
  const contacts = Array.isArray(state.contacts) ? state.contacts : [];
  const items = [];

  for (const selectedId of selectedIds) {
    const contact = contacts.find(item => {
      const id = String(item?.id || '').trim();
      const roleId = String(item?.roleId || '').trim();
      return id === selectedId || roleId === selectedId;
    });

    if (!contact) {
      result.failed += 1;
      continue;
    }

    const session = getSessionForInstantAutonomousMoment(state, contact);
    if (!String(session?.id || '').trim()) {
      result.failed += 1;
      continue;
    }

    const now = Date.now();
    const [messages] = await Promise.all([
      loadMessagesForAutonomousMoments(state, db, session)
    ]);
    const character = getCharacterForAutonomousMoments(state, session, contact);
    items.push({
      contactId: String(session.id || selectedId).trim(),
      session,
      contact,
      character,
      messages: getLatestOneDayMessages(messages, now)
    });
  }

  return items;
}

async function persistInstantAutonomousMomentRecords({
  state = {},
  db = null,
  recordItems = [],
  now = Date.now()
} = {}) {
  const safeRecordItems = (Array.isArray(recordItems) ? recordItems : [])
    .filter(item => item?.record?.content && item?.sourceItem?.session?.id);
  if (!safeRecordItems.length) return 0;

  const safeRecords = safeRecordItems.map(item => item.record);
  const currentMoments = Array.isArray(state.moments)
    ? state.moments
    : ((await dbGet(db, DATA_KEY_MOMENTS(state.activeMaskId))) || []);
  state.moments = [...safeRecords, ...currentMoments];
  await dbPut(db, DATA_KEY_MOMENTS(state.activeMaskId), state.moments);

  await Promise.all(safeRecordItems.map(item => {
    const sessionId = String(item.sourceItem?.session?.id || '').trim();
    if (!sessionId) return Promise.resolve();
    return dbPut(db, AUTONOMOUS_MOMENTS_META_KEY(state.activeMaskId, sessionId), {
      lastPublishedAt: now,
      lastMomentId: item.record.id,
      updatedAt: now
    });
  }));

  return safeRecords.length;
}

async function publishInstantAutonomousMomentBatch({
  state = {},
  db = null,
  profile = null,
  mask = null,
  worldBooks = [],
  items = []
} = {}) {
  const now = Date.now();
  const promptMessages = buildBatchAutonomousMomentsPrompt({
    mask,
    items,
    worldBooks
  });
  const rawText = await requestAutonomousMomentsBySecondaryApi(profile, promptMessages);
  const parsedItems = normalizeBatchAutonomousMomentPayload(extractJsonObjectFromAiText(rawText));
  const parsedByContactId = new Map(parsedItems.map(item => [String(item.contactId || '').trim(), item]));
  const recordItems = [];

  (Array.isArray(items) ? items : []).forEach(item => {
    const parsed = parsedByContactId.get(String(item.contactId || '').trim());
    if (!parsed) return;
    recordItems.push({
      sourceItem: item,
      record: createAutonomousMomentRecord({
        state,
        session: item.session,
        contact: item.contact,
        character: item.character,
        parsed,
        now,
        source: 'moments-heart-instant-batch'
      })
    });
  });

  return {
    now,
    recordItems
  };
}

/* ==========================================================================
   [区域标注·已完成·朋友圈星星按钮与 AI 动态评论补齐] 单条动态 AI 评论/互评入口
   说明：
   1. 本入口同时服务：用户发朋友圈后的即时互动、动态右上角星星按钮手动触发、AI 发布朋友圈后的评论补齐。
   2. 若当前未打开聊天会话，会自动选择一个不是动态发布者的联系人角色，修复原先没有 currentChatId 时不调用 API 的问题。
   3. AI 生成的点赞、评论、互相回复统一写回 DATA_KEY_MOMENTS，经 DB.js / IndexedDB 持久化；不使用 localStorage/sessionStorage。
   ========================================================================== */
export async function publishUserMomentAiInteraction({
  state = {},
  container = null,
  db = null,
  settingsManager = null,
  momentId = ''
} = {}) {
  const safeMomentId = String(momentId || '').trim();
  if (!safeMomentId) return false;

  try {
    const allSettings = settingsManager && typeof settingsManager.getAll === 'function'
      ? await settingsManager.getAll()
      : {};
    const profile = normalizeSecondaryApiProfile(allSettings?.api || {});
    if (!profile.apiKey || !profile.model) return false;

    const now = Date.now();
    const mask = getMaskForAutonomousMoments(state);
    const storedMoments = await dbGet(db, DATA_KEY_MOMENTS(state.activeMaskId));
    const moments = Array.isArray(storedMoments)
      ? storedMoments
      : (Array.isArray(state.moments) ? state.moments : []);
    const targetMoment = moments.find(moment => String(moment?.id || '') === safeMomentId);
    if (!targetMoment) return false;
    state.moments = moments;

    const session = getSessionForMomentAiInteraction(state, targetMoment);
    if (!session) return false;

    const contact = getContactForAutonomousMoments(state, session);
    const character = getCharacterForAutonomousMoments(state, session, contact);
    const [worldBooks, messages] = await Promise.all([
      readRawDbRecordValue(db, WORLDBOOK_DB_RECORD_ID),
      loadMessagesForAutonomousMoments(state, db, session)
    ]);

    const promptMessages = buildUserMomentInteractionPrompt({
      character,
      mask,
      session,
      contact,
      contacts: Array.isArray(state.contacts) ? state.contacts : [],
      worldBooks: Array.isArray(worldBooks) ? worldBooks : [],
      messages: getLatestOneDayMessages(messages, now),
      moment: targetMoment
    });
    const rawText = await requestAutonomousMomentsBySecondaryApi(profile, promptMessages);
    const parsed = normalizeMomentInteractionPlanPayload(extractJsonObjectFromAiText(rawText));
    if (!parsed) return false;

    const roleId = String(character?.id || contact?.roleId || session?.id || 'moment_ai_interactor').trim() || 'moment_ai_interactor';
    const roleName = String(character?.name || contact?.name || session?.remark || session?.name || '角色').trim() || '角色';

    await applyMomentInteractionPlanSequentially({
      state,
      db,
      container,
      moment: targetMoment,
      plan: {
        likes: Array.isArray(parsed.likes) && parsed.likes.length ? parsed.likes : [{ id: roleId, name: roleName }],
        comments: Array.isArray(parsed.comments) ? parsed.comments : [],
        directReplies: Array.isArray(parsed.directReplies) ? parsed.directReplies : []
      },
      actorId: roleId,
      actorName: roleName
    });

    state.moments = moments;
    await dbPut(db, DATA_KEY_MOMENTS(state.activeMaskId), state.moments);

    if (container?.isConnected && state.activePanel === 'moments') {
      refreshMomentsPanel(container, state);
    }

    return true;
  } catch (error) {
    console.warn('[Chat] 用户发布朋友圈后的 AI 即时互动失败:', error);
    return false;
  }
}

export async function publishMomentCommentAiInteraction({
  state = {},
  container = null,
  db = null,
  settingsManager = null,
  momentId = '',
  commentId = '',
  comment = null,
  replyTarget = null
} = {}) {
  const safeMomentId = String(momentId || '').trim();
  const safeCommentId = String(commentId || comment?.id || '').trim();
  if (!safeMomentId || !safeCommentId) return false;

  try {
    const session = getSessionForAutonomousMoments(state);
    if (!session) return false;

    const allSettings = settingsManager && typeof settingsManager.getAll === 'function'
      ? await settingsManager.getAll()
      : {};
    const profile = normalizeSecondaryApiProfile(allSettings?.api || {});
    if (!profile.apiKey || !profile.model) return false;

    const now = Date.now();
    const contact = getContactForAutonomousMoments(state, session);
    const character = getCharacterForAutonomousMoments(state, session, contact);
    const mask = getMaskForAutonomousMoments(state);
    const [worldBooks, messages, storedMoments] = await Promise.all([
      readRawDbRecordValue(db, WORLDBOOK_DB_RECORD_ID),
      loadMessagesForAutonomousMoments(state, db, session),
      dbGet(db, DATA_KEY_MOMENTS(state.activeMaskId))
    ]);

    const moments = Array.isArray(storedMoments)
      ? storedMoments
      : (Array.isArray(state.moments) ? state.moments : []);
    const targetMoment = moments.find(moment => String(moment?.id || '') === safeMomentId);
    if (!targetMoment) return false;
    state.moments = moments;

    const replyTargetCommentId = String(replyTarget?.commentId || '').trim();
    const targetComment = replyTargetCommentId
      ? findMomentCommentById(targetMoment, replyTargetCommentId)
      : (
          comment && typeof comment === 'object' && Array.isArray(comment?.replies)
            ? comment
            : findMomentCommentById(targetMoment, safeCommentId)
        );
    if (!targetComment) return false;

    const promptMessages = buildMomentCommentReplyPrompt({
      actor: character || contact || session,
      actorContext: { character, session, contact },
      mask,
      worldBooks: Array.isArray(worldBooks) ? worldBooks : [],
      messages: getLatestOneDayMessages(messages, now),
      moment: targetMoment,
      targetComment,
      contacts: Array.isArray(state.contacts) ? state.contacts : []
    });

    const rawText = await requestAutonomousMomentsBySecondaryApi(profile, promptMessages);
    const parsed = normalizeMomentInteractionPlanPayload(extractJsonObjectFromAiText(rawText));
    if (!parsed) return false;

    const actorId = String(character?.id || contact?.roleId || session?.id || safeCommentId).trim() || safeCommentId;
    const actorName = String(character?.name || contact?.name || session?.remark || session?.name || '角色').trim() || '角色';

    await applyMomentInteractionPlanSequentially({
      state,
      db,
      container,
      moment: targetMoment,
      plan: parsed,
      actorId,
      actorName,
      fallbackReplyTargetCommentId: replyTargetCommentId || safeCommentId
    });

    state.moments = moments;
    await dbPut(db, DATA_KEY_MOMENTS(state.activeMaskId), state.moments);

    if (container?.isConnected && state.activePanel === 'moments') {
      refreshMomentsPanel(container, state);
    }

    return true;
  } catch (error) {
    console.warn('[Chat] 用户评论后的 AI 回复失败:', error);
    return false;
  }
}

export async function publishInstantAutonomousMomentsForContacts({
  state = {},
  container = null,
  db = null,
  settingsManager = null,
  contactIds = []
} = {}) {
  const selectedIds = Array.from(new Set(
    (Array.isArray(contactIds) ? contactIds : [])
      .map(id => String(id || '').trim())
      .filter(Boolean)
  ));

  const result = {
    total: selectedIds.length,
    published: 0,
    failed: 0,
    message: ''
  };

  if (!selectedIds.length) {
    result.message = '请选择要发布朋友圈的通讯录联系人';
    return result;
  }

  const allSettings = settingsManager && typeof settingsManager.getAll === 'function'
    ? await settingsManager.getAll()
    : {};
  const profile = normalizeSecondaryApiProfile(allSettings?.api || {});
  if (!profile.apiKey || !profile.model) {
    result.failed = selectedIds.length;
    result.message = '请先在设置应用配置副 API Key 和模型';
    return result;
  }

  const eligibleItems = await collectInstantAutonomousMomentItems({
    state,
    db,
    selectedIds,
    result
  });

  if (!eligibleItems.length) {
    result.message = '未能发布朋友圈动态，请检查联系人设置';
    return result;
  }

  const mask = getMaskForAutonomousMoments(state);
  const worldBooks = await readRawDbRecordValue(db, WORLDBOOK_DB_RECORD_ID);
  const batches = chunkInstantAutonomousMomentItems(eligibleItems);

  for (const batchItems of batches) {
    try {
      const batchResult = await publishInstantAutonomousMomentBatch({
        state,
        db,
        profile,
        mask,
        worldBooks: Array.isArray(worldBooks) ? worldBooks : [],
        items: batchItems
      });

      const persisted = await persistInstantAutonomousMomentRecords({
        state,
        db,
        recordItems: batchResult.recordItems,
        now: batchResult.now
      });
      result.published += persisted;
      result.failed += Math.max(0, batchItems.length - persisted);

      /* ======================================================================
         [区域标注·已完成·AI 发布朋友圈后评论与互评补齐]
         说明：
         1. AI 联系人发布朋友圈写入 DB.js / IndexedDB 后，立即复用单条动态 AI 互动入口生成评论、点赞与互相回复。
         2. 这里不依赖“主动发朋友圈”开关；只补齐本次爱心即时发布产生的动态评论区。
         3. 使用后台 await 顺序执行，避免并发覆盖同一 DATA_KEY_MOMENTS 记录；不使用 localStorage/sessionStorage。
         ====================================================================== */
      for (const item of Array.isArray(batchResult.recordItems) ? batchResult.recordItems : []) {
        const momentId = String(item?.record?.id || '').trim();
        if (!momentId) continue;
        await publishUserMomentAiInteraction({
          state,
          container,
          db,
          settingsManager,
          momentId
        });
      }
    } catch (error) {
      console.warn('[Chat] 朋友圈爱心即时 AI 发布失败:', error);
      result.failed += batchItems.length;
    }
  }

  if (container?.isConnected && state.activePanel === 'moments') {
    refreshMomentsPanel(container, state);
  }

  result.message = result.published
    ? `已发布 ${result.published} 条朋友圈动态${result.failed ? `，${result.failed} 位发布失败` : ''}`
    : '未能发布朋友圈动态，请检查副 API 与联系人设置';
  return result;
}

/* ==========================================================================
   [区域标注·已完成·自主活动主动发朋友圈后台调度]
   说明：
   1. 闲谈应用启动后由 index.js 最小接入本调度；业务逻辑仍集中在本文件。
   2. 开关开启且到达间隔后，才会在后台调用设置应用副 API 并写入朋友圈 IndexedDB。
   3. 调度只使用 setTimeout / visibilitychange / pageshow 进行前端运行时补偿；网页完全关闭期间不会伪造后台线程。
   4. 关闭开关会停止后续调用；不会回退主 API，不使用 localStorage/sessionStorage。
   ========================================================================== */
export function initAutonomousMomentPublisher({
  state = {},
  container = null,
  db = null,
  settingsManager = null
} = {}) {
  let timer = 0;
  let running = false;
  let destroyed = false;

  const clearTimer = () => {
    if (timer) window.clearTimeout(timer);
    timer = 0;
  };

  const schedule = (delay = 30000) => {
    if (destroyed) return;
    clearTimer();
    timer = window.setTimeout(() => {
      void checkAndPublish();
    }, Math.max(1000, Number(delay) || 30000));
  };

  const checkAndPublish = async () => {
    if (destroyed || running || state.destroyed) return;
    running = true;
    try {
      const session = getSessionForAutonomousMoments(state);
      if (!session) {
        schedule(60000);
        return;
      }

      const settings = await loadAutonomousMomentsSettingsForCurrentChat(state, db);
      const intervalMs = getAutonomousMomentsIntervalMs(settings);
      if (!settings.autonomousMomentsEnabled) {
        schedule(Math.min(intervalMs, 5 * 60 * 1000));
        return;
      }

      const metaKey = AUTONOMOUS_MOMENTS_META_KEY(state.activeMaskId, session.id);
      const meta = (await dbGet(db, metaKey)) || {};
      const lastPublishedAt = Number(meta.lastPublishedAt || 0) || 0;
      const now = Date.now();
      const dueAt = lastPublishedAt > 0 ? lastPublishedAt + intervalMs : now + intervalMs;

      if (now >= dueAt) {
        await publishAutonomousMoment({ state, container, db, settingsManager });
        schedule(intervalMs);
        return;
      }

      schedule(Math.min(Math.max(1000, dueAt - now), 5 * 60 * 1000));
    } catch (error) {
      console.warn('[Chat] 自主活动主动发朋友圈后台发布失败:', error);
      schedule(60000);
    } finally {
      running = false;
    }
  };

  const onVisibilityOrPageShow = () => {
    /* ========================================================================
       [区域标注·本次需求] 后台保活通知触发点 (仅聊天自动回复在 chat-message.js 触发)
       这里原为判断是否回到前台以触发主动发朋友圈检查。保留此处的可见性判断逻辑。
       ======================================================================== */
    if (document.visibilityState === 'hidden') return;
    void checkAndPublish();
  };

  document.addEventListener('visibilitychange', onVisibilityOrPageShow);
  window.addEventListener('pageshow', onVisibilityOrPageShow);

  schedule(2500);

  return {
    destroy() {
      destroyed = true;
      clearTimer();
      document.removeEventListener('visibilitychange', onVisibilityOrPageShow);
      window.removeEventListener('pageshow', onVisibilityOrPageShow);
    },
    checkNow() {
      return checkAndPublish();
    }
  };
}

/* ==========================================================================
   [区域标注·已完成·自主活动设置渲染]
   说明：
   1. 参考“头像与备注”板块：外层标题在左上方，内部使用同款暖色卡片与 iPhone 风格滑动开关。
   2. 开启“主动发朋友圈”后，详细设置以抽屉方式向下展开。
   3. 单位选择使用应用内分段按钮，不使用浏览器原生 select。
   4. 本渲染函数不读写持久化存储；保存由本模块事件函数写入 DB.js / IndexedDB。
   ========================================================================== */
export function renderAutonomousActivitySettingsSection(chatSettings = {}) {
  const settings = normalizeAutonomousActivitySettings(chatSettings);
  const drawerId = 'msg-autonomous-activity-drawer';
  const isEnabled = Boolean(settings.autonomousMomentsEnabled);

  return `
        <!-- ==================================================================
             [区域标注·已完成·自主活动主动发朋友圈设置模块]
             说明：
             1. 本区域已拆分到 chat-autonomous-activity-settings.js，后续修改“自主活动/主动发朋友圈”优先改该模块。
             2. “主动发朋友圈”开关与时间间隔保存到当前聊天对象 chatPromptSettings。
             3. 持久化统一走 DB.js / IndexedDB；不使用 localStorage/sessionStorage，不写双份存储兜底。
             4. 单位切换使用应用内分段按钮，不使用浏览器原生选择器。
             5. 开关开启后才会由本模块后台调度注入 AI 自主发布朋友圈提示词，并只调用设置应用副 API。
             ================================================================== -->
        <section class="msg-settings-avatar-section msg-autonomous-activity-section" data-role="msg-autonomous-activity-section">
          <div class="msg-settings-section-title">自主活动</div>
          <section class="msg-settings-card msg-settings-avatar-card msg-autonomous-activity-card">
            <div class="msg-settings-row msg-settings-avatar-switch-row">
              <div class="msg-settings-avatar-switch-copy">
                <div class="msg-settings-card__title">主动发朋友圈</div>
                <div class="msg-settings-card__desc">开启后，角色会按设定间隔主动发布朋友圈动态。</div>
              </div>
              <button
                class="msg-ios-switch ${isEnabled ? 'is-on' : ''}"
                data-action="toggle-autonomous-moments"
                type="button"
                aria-label="主动发朋友圈"
                aria-controls="${drawerId}"
                aria-expanded="${isEnabled ? 'true' : 'false'}"></button>
            </div>
            <div
              class="msg-autonomous-activity-drawer ${isEnabled ? 'is-open' : ''}"
              id="${drawerId}"
              data-role="msg-autonomous-activity-drawer"
              aria-hidden="${isEnabled ? 'false' : 'true'}">
              <div class="msg-settings-avatar-divider"></div>
              <div class="msg-autonomous-activity-drawer__inner">
                <div class="msg-settings-card__title">角色主动发布朋友圈动态的时间间隔</div>
                <div class="msg-autonomous-activity-interval-row">
                  <label class="msg-settings-number-field msg-autonomous-activity-interval-value">
                    <span>间隔数值</span>
                    <input
                      class="msg-settings-number-input"
                      data-role="msg-autonomous-moments-interval-value"
                      type="number"
                      inputmode="numeric"
                      min="1"
                      step="1"
                      value="${escapeHtml(settings.autonomousMomentsIntervalValue)}">
                  </label>
                  <div class="msg-autonomous-activity-unit-field">
                    <span>时间单位</span>
                    <div class="msg-autonomous-activity-unit-group" data-role="msg-autonomous-moments-unit-group">
                      ${AUTONOMOUS_ACTIVITY_INTERVAL_UNITS.map(unit => `
                        <button
                          class="msg-autonomous-activity-unit-btn ${settings.autonomousMomentsIntervalUnit === unit.value ? 'is-active' : ''}"
                          data-action="set-autonomous-moments-interval-unit"
                          data-autonomous-unit="${escapeHtml(unit.value)}"
                          type="button">
                          ${escapeHtml(unit.label)}
                        </button>
                      `).join('')}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </section>`;
}

/* ==========================================================================
   [区域标注·已完成·自主活动设置局部同步]
   说明：
   1. 只同步“自主活动”设置区域的开关、抽屉和单位按钮，不重渲染整个聊天页，避免页面闪屏。
   2. 本函数不做持久化；持久化由点击/输入事件函数负责。
   ========================================================================== */
export function syncAutonomousActivitySettingsSection(container, state) {
  const section = container?.querySelector?.('[data-role="msg-autonomous-activity-section"]');
  if (!section) return;

  const settings = ensureStateAutonomousActivitySettings(state);
  const switchButton = section.querySelector('[data-action="toggle-autonomous-moments"]');
  const drawer = section.querySelector('[data-role="msg-autonomous-activity-drawer"]');
  const valueInput = section.querySelector('[data-role="msg-autonomous-moments-interval-value"]');

  if (switchButton) {
    switchButton.classList.toggle('is-on', settings.autonomousMomentsEnabled);
    switchButton.setAttribute('aria-expanded', settings.autonomousMomentsEnabled ? 'true' : 'false');
  }

  if (drawer) {
    drawer.classList.toggle('is-open', settings.autonomousMomentsEnabled);
    drawer.setAttribute('aria-hidden', settings.autonomousMomentsEnabled ? 'false' : 'true');
  }

  if (valueInput && String(valueInput.value) !== String(settings.autonomousMomentsIntervalValue)) {
    valueInput.value = String(settings.autonomousMomentsIntervalValue);
  }

  section.querySelectorAll('[data-action="set-autonomous-moments-interval-unit"]').forEach(button => {
    button.classList.toggle('is-active', String(button.dataset.autonomousUnit || '') === settings.autonomousMomentsIntervalUnit);
  });
}

/* ==========================================================================
   [区域标注·已完成·自主活动设置点击事件接线]
   说明：
   1. 处理“主动发朋友圈”滑动开关与“分钟 / 小时”单位按钮。
   2. 所有变更立即保存到 DB.js / IndexedDB。
   3. 不使用 localStorage/sessionStorage，不使用浏览器原生弹窗或原生选择器。
   ========================================================================== */
export async function handleAutonomousActivitySettingsClick({
  action = '',
  target = null,
  state = {},
  container = null,
  db = null
} = {}) {
  if (action === 'toggle-autonomous-moments') {
    ensureStateAutonomousActivitySettings(state);
    state.chatPromptSettings.autonomousMomentsEnabled = !state.chatPromptSettings.autonomousMomentsEnabled;
    ensureStateAutonomousActivitySettings(state);
    await persistAutonomousActivitySettings(state, db);
    syncAutonomousActivitySettingsSection(container, state);
    return true;
  }

  if (action === 'set-autonomous-moments-interval-unit') {
    const unit = String(target?.dataset?.autonomousUnit || '').trim();
    if (!isValidAutonomousActivityUnit(unit)) return true;

    ensureStateAutonomousActivitySettings(state);
    state.chatPromptSettings.autonomousMomentsIntervalUnit = unit;
    ensureStateAutonomousActivitySettings(state);
    await persistAutonomousActivitySettings(state, db);
    syncAutonomousActivitySettingsSection(container, state);
    return true;
  }

  return false;
}

/* ==========================================================================
   [区域标注·已完成·自主活动输入事件接线]
   说明：
   1. 处理“角色主动发布朋友圈动态的时间间隔”数值输入。
   2. 数值最小为 1，保存到当前聊天对象 chatPromptSettings。
   3. 持久化统一走 DB.js / IndexedDB；不使用 localStorage/sessionStorage。
   ========================================================================== */
export function handleAutonomousActivitySettingsInput(e, state, container, db) {
  const target = e?.target;
  if (!target?.matches?.('[data-role="msg-autonomous-moments-interval-value"]')) return false;

  ensureStateAutonomousActivitySettings(state);
  const rawValue = Number(target.value || DEFAULT_AUTONOMOUS_ACTIVITY_SETTINGS.autonomousMomentsIntervalValue);
  const nextValue = Number.isFinite(rawValue)
    ? Math.max(1, Math.floor(rawValue))
    : DEFAULT_AUTONOMOUS_ACTIVITY_SETTINGS.autonomousMomentsIntervalValue;

  state.chatPromptSettings.autonomousMomentsIntervalValue = nextValue;
  ensureStateAutonomousActivitySettings(state);

  if (String(target.value) !== String(nextValue)) {
    target.value = String(nextValue);
  }

  dbPut(db, getCurrentChatPromptSettingsKey(state), state.chatPromptSettings);
  syncAutonomousActivitySettingsSection(container, state);
  return true;
}
