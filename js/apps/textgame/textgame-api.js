/**
 * ==========================================================================
 * [区域标注·已完成·梦笺专用 API 配置与调用]
 * 说明：
 * 1. 只为梦笺应用读取“设置应用 / 主 API / 已保存预设”作为可选来源。
 * 2. 用户选中后复制到梦笺自身 textgame.settings.apiProfile，并通过 DB.js / IndexedDB 保存。
 * 3. 梦笺 AI 调用只读取梦笺自己的 apiProfile；未配置时停止调用并交给应用内弹窗提示。
 * 4. 不使用 localStorage/sessionStorage，不写双份兜底，不影响其它应用 API 调用。
 * ==========================================================================
 */

import { DB } from '../../core/data/DB.js';
import { getTextGameSettings } from './textgame-store.js';

const SETTINGS_STORE_NAME = 'settings';
const SETTINGS_RECORD_ID = 'global-settings';
const dbInstance = new DB();

function trimSlash(url) {
  return String(url || '').replace(/\/+$/, '');
}

function normalizeProviderId(providerId) {
  return ['openai', 'deepseek', 'gemini', 'claude'].includes(providerId) ? providerId : 'openai';
}

function extractApiErrorMessage(payload, fallback = '请求失败') {
  if (!payload) return fallback;
  if (typeof payload === 'string') return payload;
  return (
    payload?.error?.message ||
    payload?.error?.msg ||
    payload?.message ||
    payload?.detail ||
    fallback
  );
}

/* ==========================================================================
   [区域标注·已完成·梦笺读取设置应用主 API 预设]
   说明：只读取 settings.api.savedPrimaryConfigs 作为弹窗列表来源，不修改设置应用数据。
   ========================================================================== */
export async function getSettingsPrimaryApiPresetsForTextGame() {
  const settings = await dbInstance.get(SETTINGS_STORE_NAME, SETTINGS_RECORD_ID);
  const presets = Array.isArray(settings?.api?.savedPrimaryConfigs)
    ? settings.api.savedPrimaryConfigs
    : [];

  return presets
    .map((item) => ({
      id: String(item?.id || ''),
      name: String(item?.name || '未命名预设'),
      provider: normalizeProviderId(item?.provider),
      apiKey: String(item?.apiKey || ''),
      baseUrl: String(item?.baseUrl || ''),
      model: String(item?.model || ''),
      availableModels: Array.isArray(item?.availableModels) ? item.availableModels : [],
      stream: typeof item?.stream === 'boolean' ? item.stream : true
    }))
    .filter((item) => item.id && item.baseUrl && item.apiKey && item.model);
}

/* ==========================================================================
   [区域标注·已完成·梦笺 AI 请求发送]
   说明：发送前只读取梦笺 settings.apiProfile；没有梦笺配置时抛出 TEXTGAME_API_NOT_CONFIGURED。
   ========================================================================== */
export async function sendTextGameAiMessage(messages, { temperature = 0.7, maxTokens = 900 } = {}, returnFullObject = false) {
  const settings = await getTextGameSettings();
  const profile = settings?.apiProfile;

  if (!profile?.baseUrl || !profile?.apiKey || !profile?.model) {
    const error = new Error('请先在梦笺 API 配置中选择预设');
    error.code = 'TEXTGAME_API_NOT_CONFIGURED';
    throw error;
  }

  const providerId = normalizeProviderId(profile.provider);

  let result;
  switch (providerId) {
    case 'gemini':
      result = await requestGemini(profile, messages, temperature, maxTokens);
      break;
    case 'claude':
      result = await requestClaude(profile, messages, temperature, maxTokens);
      break;
    case 'deepseek':
    case 'openai':
    default:
      result = await requestOpenAiLike(profile, messages, temperature, maxTokens);
      break;
  }
  
  if (returnFullObject) {
    return result;
  }
  return result.content || '';
}

async function requestOpenAiLike(profile, messages, temperature, maxTokens) {
  const response = await fetch(`${trimSlash(profile.baseUrl)}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${profile.apiKey}`
    },
    body: JSON.stringify({
      model: profile.model,
      temperature,
      max_tokens: maxTokens,
      stream: false,
      messages
    })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(extractApiErrorMessage(payload, `HTTP ${response.status}`));
  }

  return {
    content: payload?.choices?.[0]?.message?.content || '',
    usage: payload?.usage || { total_tokens: 0 }
  };
}

async function requestGemini(profile, messages, temperature, maxTokens) {
  const prompt = messages
    .map((message) => `${message.role === 'system' ? '系统' : '用户'}：${message.content}`)
    .join('\n\n');

  const response = await fetch(
    `${trimSlash(profile.baseUrl)}/models/${encodeURIComponent(profile.model)}:generateContent?key=${encodeURIComponent(profile.apiKey)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens
        }
      })
    }
  );

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(extractApiErrorMessage(payload, `HTTP ${response.status}`));
  }

  return {
    content: payload?.candidates?.[0]?.content?.parts?.[0]?.text || '',
    usage: payload?.usageMetadata || { total_tokens: payload?.usageMetadata?.totalTokenCount || 0 }
  };
}

async function requestClaude(profile, messages, temperature, maxTokens) {
  const systemPrompt = messages.find((message) => message.role === 'system')?.content || '';
  const userMessages = messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: message.content
    }));

  const response = await fetch(`${trimSlash(profile.baseUrl)}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': profile.apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: profile.model,
      temperature,
      max_tokens: maxTokens,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages: userMessages.length ? userMessages : [{ role: 'user', content: '你好' }]
    })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(extractApiErrorMessage(payload, `HTTP ${response.status}`));
  }

  const content = payload?.content?.find?.((item) => item?.type === 'text')?.text ||
                  payload?.content?.[0]?.text || '';
                  
  const usage = {
    total_tokens: (payload?.usage?.input_tokens || 0) + (payload?.usage?.output_tokens || 0)
  };

  return {
    content,
    usage
  };
}
