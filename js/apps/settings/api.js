import { Logger } from '../../utils/Logger.js';

/**
 * 文件名: js/apps/settings/api.js
 * 用途: 设置应用 - API 配置页
 * 说明:
 * 1) 仅修改本文件，不影响其它设置页/应用页
 * 2) API 设置按主 API / 副 API 独立配置
 * 3) 图标统一使用 IconPark 风格 SVG，并在 ICONS 常量中集中标注，便于后续替换
 * 4) 支持模型拉取、连接测试、顶部 API 预设选择器快速切换/新建/删除
 */

const PROVIDER_META = {
  openai: {
    id: 'openai',
    shortLabel: 'OpenAI',
    label: 'OpenAI 官方接口',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini'
  },
  gemini: {
    id: 'gemini',
    shortLabel: 'Gemini',
    label: 'Gemini 官方接口',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.0-flash'
  },
  claude: {
    id: 'claude',
    shortLabel: 'Claude',
    label: 'Claude 官方接口',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-5-haiku-latest'
  },
  deepseek: {
    id: 'deepseek',
    shortLabel: 'DeepSeek',
    label: 'DeepSeek 官方接口',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat'
  }
};

// [模块标注] 模型真实来源模块：模型列表只保留接口真实拉取结果与用户当前已选模型，不再维护旧版示例模型白名单

// IconPark SVG（统一图标风格 + 用途标注，方便后续修改）
const ICONS = {
  // IconPark: api-app / API 配置主标题
  api: `<svg viewBox="0 0 48 48" fill="none" width="18" height="18" xmlns="http://www.w3.org/2000/svg"><path d="M40 12L24 4L8 12V36L24 44L40 36V12Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M24 44V24" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M40 12L24 24" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M8 12L24 24" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`,
  // IconPark: time / 主 API 标题
  main: `<svg viewBox="0 0 48 48" fill="none" width="16" height="16" xmlns="http://www.w3.org/2000/svg"><circle cx="24" cy="24" r="18" stroke="currentColor" stroke-width="3"/><path d="M24 14V24L31 29" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  // IconPark: cycle / 副 API 标题
  secondary: `<svg viewBox="0 0 48 48" fill="none" width="16" height="16" xmlns="http://www.w3.org/2000/svg"><path d="M6 24C6 14.0589 14.0589 6 24 6C33.9411 6 42 14.0589 42 24" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M42 24C42 33.9411 33.9411 42 24 42C14.0589 42 6 33.9411 6 24" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="24" cy="24" r="4" fill="currentColor"/></svg>`,
  // IconPark: world / 全局参数与默认状态提示
  global: `<svg viewBox="0 0 48 48" fill="none" width="16" height="16" xmlns="http://www.w3.org/2000/svg"><path d="M24 44C35.0457 44 44 35.0457 44 24C44 12.9543 35.0457 4 24 4C12.9543 4 4 12.9543 4 24C4 35.0457 12.9543 44 24 44Z" stroke="currentColor" stroke-width="3"/><path d="M4 24H44" stroke="currentColor" stroke-width="3"/><path d="M24 4C24 4 32 11 32 24C32 37 24 44 24 44" stroke="currentColor" stroke-width="3"/><path d="M24 4C24 4 16 11 16 24C16 37 24 44 24 44" stroke="currentColor" stroke-width="3"/></svg>`,
  // IconPark: save / 保存相关按钮
  save: `<svg viewBox="0 0 48 48" fill="none" width="16" height="16" xmlns="http://www.w3.org/2000/svg"><path d="M10 8H34L40 14V40H10V8Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M16 8V18H30V8" stroke="currentColor" stroke-width="3"/><path d="M16 30H32" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`,
  // IconPark: storage / 已保存配置相关
  storage: `<svg viewBox="0 0 48 48" fill="none" width="16" height="16" xmlns="http://www.w3.org/2000/svg"><ellipse cx="24" cy="12" rx="14" ry="6" stroke="currentColor" stroke-width="3"/><path d="M10 12V24C10 27.3137 16.268 30 24 30C31.732 30 38 27.3137 38 24V12" stroke="currentColor" stroke-width="3"/><path d="M10 24V36C10 39.3137 16.268 42 24 42C31.732 42 38 39.3137 38 36V24" stroke="currentColor" stroke-width="3"/></svg>`,
  // IconPark: plus / 顶部 API 预设选择器的新建预设入口
  add: `<svg viewBox="0 0 48 48" fill="none" width="16" height="16" xmlns="http://www.w3.org/2000/svg"><path d="M24 8V40" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M8 24H40" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`,
  // IconPark: right / 测试连接
  test: `<svg viewBox="0 0 48 48" fill="none" width="16" height="16" xmlns="http://www.w3.org/2000/svg"><path d="M6 24H42" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M28 12L42 24L28 36" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  // IconPark: download / 拉取模型
  fetch: `<svg viewBox="0 0 48 48" fill="none" width="16" height="16" xmlns="http://www.w3.org/2000/svg"><path d="M24 6V30" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M14 20L24 30L34 20" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 38H40" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`,
  // IconPark: arrow-right / 应用已保存配置
  apply: `<svg viewBox="0 0 48 48" fill="none" width="16" height="16" xmlns="http://www.w3.org/2000/svg"><path d="M8 24H40" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M26 12L40 24L26 36" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  // IconPark: delete / 删除已保存配置
  delete: `<svg viewBox="0 0 48 48" fill="none" width="16" height="16" xmlns="http://www.w3.org/2000/svg"><path d="M10 12H38" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M18 12V8H30V12" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M14 12L16 40H32L34 12" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M20 20V32" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M28 20V32" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`,
  // IconPark: down / 下拉指示
  chevronDown: `<svg viewBox="0 0 48 48" fill="none" width="14" height="14" xmlns="http://www.w3.org/2000/svg"><path d="M36 18L24 30L12 18" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  // IconPark: check / 成功结果
  ok: `<svg viewBox="0 0 48 48" fill="none" width="14" height="14" xmlns="http://www.w3.org/2000/svg"><path d="M10 25L20 34L38 14" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  // IconPark: close-one / 错误结果
  error: `<svg viewBox="0 0 48 48" fill="none" width="14" height="14" xmlns="http://www.w3.org/2000/svg"><circle cx="24" cy="24" r="18" stroke="currentColor" stroke-width="3"/><path d="M18 18L30 30" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M30 18L18 30" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`,
  // IconPark: close / 弹窗关闭
  close: `<svg viewBox="0 0 48 48" fill="none" width="18" height="18" xmlns="http://www.w3.org/2000/svg"><path d="M14 14L34 34" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M34 14L14 34" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>`,
  // IconPark: check-one / 服务商/模型已选中状态
  selected: `<svg viewBox="0 0 48 48" fill="none" width="16" height="16" xmlns="http://www.w3.org/2000/svg"><circle cx="24" cy="24" r="18" stroke="currentColor" stroke-width="3"/><path d="M17 24L22 29L32 19" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  // IconPark: round / 服务商/模型未选中状态
  unselected: `<svg viewBox="0 0 48 48" fill="none" width="16" height="16" xmlns="http://www.w3.org/2000/svg"><circle cx="24" cy="24" r="18" stroke="currentColor" stroke-width="3"/></svg>`,
  // IconPark: openai-provider / OpenAI 服务商图标
  openai: `<svg viewBox="0 0 48 48" fill="none" width="16" height="16" xmlns="http://www.w3.org/2000/svg"><circle cx="24" cy="24" r="16" stroke="currentColor" stroke-width="3"/><path d="M24 12L34 18V30L24 36L14 30V18L24 12Z" stroke="currentColor" stroke-width="3"/></svg>`,
  // IconPark: gem / Gemini 服务商图标
  gemini: `<svg viewBox="0 0 48 48" fill="none" width="16" height="16" xmlns="http://www.w3.org/2000/svg"><path d="M24 6L28.5 19.5L42 24L28.5 28.5L24 42L19.5 28.5L6 24L19.5 19.5L24 6Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>`,
  // IconPark: square / Claude 服务商图标
  claude: `<svg viewBox="0 0 48 48" fill="none" width="16" height="16" xmlns="http://www.w3.org/2000/svg"><rect x="8" y="8" width="32" height="32" rx="10" stroke="currentColor" stroke-width="3"/><path d="M18 24H30" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`,
  // IconPark: clock / DeepSeek 服务商图标
  deepseek: `<svg viewBox="0 0 48 48" fill="none" width="16" height="16" xmlns="http://www.w3.org/2000/svg"><path d="M8 24C8 15.1634 15.1634 8 24 8C32.8366 8 40 15.1634 40 24C40 32.8366 32.8366 40 24 40" stroke="currentColor" stroke-width="3"/><path d="M24 16V24L30 28" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`
};

function safeParseJSON(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function clampNumber(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function clampInt(value, min, max, fallback) {
  const num = parseInt(value, 10);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function escapeHtml(text) {
  return String(text || '')
    .replaceAll('&', '\u0026amp;')
    .replaceAll('<', '\u0026lt;')
    .replaceAll('>', '\u0026gt;')
    .replaceAll('"', '\u0026quot;')
    .replaceAll("'", '\u0026#39;');
}

function trimSlash(url) {
  return String(url || '').replace(/\/+$/, '');
}

function normalizeProviderId(providerId, fallback = 'openai') {
  return PROVIDER_META[providerId] ? providerId : fallback;
}

function getDefaultProfileConfig(providerId = 'openai') {
  const safeProviderId = normalizeProviderId(providerId, 'openai');
  const meta = PROVIDER_META[safeProviderId];
  return {
    provider: safeProviderId,
    apiKey: '',
    baseUrl: meta.defaultBaseUrl,
    model: '',
    availableModels: [],
    stream: true
  };
}

function getDefaultApiSettings() {
  return {
    version: 3,
    activeProfile: 'primary',
    primary: getDefaultProfileConfig('openai'),
    secondary: getDefaultProfileConfig('gemini'),
    global: {
      temperature: 0.7,
      maxTokens: 2048,
      useGlobalTemperature: true,
      useGlobalMaxTokens: true
    },
    savedPrimaryConfigs: []
  };
}

function uniqueStrings(values) {
  return [...new Set((values || []).filter(Boolean).map((item) => String(item).trim()).filter(Boolean))];
}

function mergeModelOptions(providerId, models, selectedModel) {
  return uniqueStrings([...(models || []), selectedModel]);
}

function normalizeProfileConfig(profileInput, fallbackProvider = 'openai') {
  const provider = normalizeProviderId(profileInput?.provider, fallbackProvider);
  const defaults = getDefaultProfileConfig(provider);
  const model = profileInput?.model || defaults.model;
  return {
    provider,
    apiKey: profileInput?.apiKey || '',
    baseUrl: profileInput?.baseUrl || PROVIDER_META[provider].defaultBaseUrl,
    model,
    // [模块标注] API 模型列表同步模块：仅合并已保存的真实模型与当前选中模型，不再清洗或兼容旧版示例模型结构
    availableModels: mergeModelOptions(
      provider,
      profileInput?.availableModels,
      model
    ),
    stream: typeof profileInput?.stream === 'boolean' ? profileInput.stream : true
  };
}

function normalizeSavedPrimaryConfigs(rawList) {
  if (!Array.isArray(rawList)) return [];
  return rawList
    .map((item, index) => {
      const profile = normalizeProfileConfig(item, item?.provider || 'openai');
      const providerMeta = PROVIDER_META[profile.provider];
      const name =
        item?.name ||
        `${providerMeta.shortLabel} · ${profile.model || providerMeta.defaultModel} · ${index + 1}`;
      return {
        id: item?.id || `saved-${Date.now()}-${index}`,
        name,
        provider: profile.provider,
        apiKey: profile.apiKey,
        baseUrl: profile.baseUrl,
        model: profile.model,
        availableModels: profile.availableModels,
        stream: profile.stream
      };
    })
    .slice(0, 20);
}

function normalizeApiSettings(inputApi) {
  const defaults = getDefaultApiSettings();
  const source =
    inputApi && typeof inputApi === 'object'
      ? inputApi
      : {};

  // [模块标注] API 设置新版结构入口模块：只读取 version 3 的 primary / secondary 结构，旧 providers 结构不再做兜底迁移
  const primary = normalizeProfileConfig(source.primary, defaults.primary.provider);
  const secondary = normalizeProfileConfig(source.secondary, defaults.secondary.provider);

  return {
    version: 3,
    activeProfile: source.activeProfile === 'secondary' ? 'secondary' : 'primary',
    primary,
    secondary,
    global: {
      temperature: clampNumber(source?.global?.temperature, 0, 2, defaults.global.temperature),
      maxTokens: clampInt(source?.global?.maxTokens, 1, 32768, defaults.global.maxTokens),
      useGlobalTemperature: true,
      useGlobalMaxTokens: true
    },
    savedPrimaryConfigs: normalizeSavedPrimaryConfigs(source?.savedPrimaryConfigs)
  };
}

function renderProviderIcon(providerId) {
  return ICONS[providerId] || ICONS.api;
}

function renderModelOptions(profile) {
  const models = mergeModelOptions(profile.provider, profile.availableModels, profile.model);
  if (!models.length) {
    return '<option value="" selected>请先拉取模型</option>';
  }

  return models
    .map((model) => {
      const selectedAttr = model === profile.model ? 'selected' : '';
      return `<option value="${escapeHtml(model)}" ${selectedAttr}>${escapeHtml(model)}</option>`;
    })
    .join('');
}

// ===== 设置：API 预设折叠选择器（已完成·本次预设名称显示与图标移除） START =====
// 说明：该区域只负责渲染主 API 预设入口；预设选择项已显示名称并去除图标，存储仍通过 settings.update -> SettingsStore/DB.js/IndexedDB，不使用 localStorage/sessionStorage。
function renderSavedPrimaryConfigs(savedPrimaryConfigs) {
  const savedItems = savedPrimaryConfigs
    .map((item) => {
      const providerMeta = PROVIDER_META[item.provider] || PROVIDER_META.openai;
      return `
        <div class="api-preset-option" data-saved-primary-id="${escapeHtml(item.id)}">
          <button class="api-preset-option__main" type="button" data-action="apply-saved-primary" data-saved-id="${escapeHtml(item.id)}">
            <span class="api-preset-option__content">
              <span class="api-preset-option__title">${escapeHtml(item.name)}</span>
              <span class="api-preset-option__meta">${escapeHtml(providerMeta.shortLabel)} · ${escapeHtml(item.model || '未设置模型')}</span>
            </span>
            <span class="api-preset-option__apply">${ICONS.apply}</span>
          </button>
          <button class="api-preset-option__delete" type="button" data-action="delete-saved-primary" data-saved-id="${escapeHtml(item.id)}" aria-label="删除预设 ${escapeHtml(item.name)}">
            ${ICONS.delete}
          </button>
        </div>
      `;
    })
    .join('');

  return `
    <div class="api-preset-panel">
      <div class="api-preset-new">
        <button class="api-preset-new__button" type="button" data-action="new-primary-preset" aria-label="新建 API 预设">
          <span class="api-preset-new__icon">${ICONS.add}</span>
          <span class="api-preset-new__title">新建预设</span>
        </button>
        <div class="api-preset-dropdown">
          <button
            class="api-preset-dropdown__trigger"
            type="button"
            data-action="toggle-primary-preset-menu"
            aria-expanded="false"
            ${savedPrimaryConfigs.length ? '' : 'disabled'}
          >
            <span>${savedPrimaryConfigs.length ? '选择已保存预设' : '暂无已保存预设'}</span>
            <span class="api-preset-dropdown__arrow">${ICONS.chevronDown}</span>
          </button>
          <div class="api-preset-dropdown__menu hidden" data-primary-preset-menu>
            ${
              savedPrimaryConfigs.length
                ? savedItems
                : `
                  <div class="api-empty-state">
                    <span class="api-empty-state__icon">${ICONS.storage}</span>
                    <span>当前还没有已保存的 API 预设</span>
                  </div>
                `
            }
          </div>
        </div>
      </div>
    </div>
  `;
}
// ===== 设置：API 预设折叠选择器（已完成·本次预设名称显示与图标移除） END =====

function renderProviderTrigger(profileKey, profile) {
  const providerMeta = PROVIDER_META[profile.provider];
  return `
    <button
      class="api-provider-trigger"
      id="api-${profileKey}-provider-trigger"
      type="button"
      data-action="open-provider-modal"
      data-profile="${profileKey}"
      aria-haspopup="dialog"
    >
      <span class="api-provider-trigger__main">
        <span class="api-provider-trigger__icon">${renderProviderIcon(profile.provider)}</span>
        <span class="api-provider-trigger__text">${escapeHtml(providerMeta.shortLabel)}</span>
      </span>
      <span class="api-provider-trigger__meta">${escapeHtml(providerMeta.label)}</span>
    </button>
  `;
}

// [模块标注] 模型选择极简触发器模块：去除左侧三横杠图标，仅保留模型名、省略显示与右侧数量/箭头
// [模块标注] 模型名称省略模块：模型名过长时固定单行并以 … 省略，便于后续仅调整这一处
function renderModelTrigger(profileKey, profile) {
  const models = mergeModelOptions(profile.provider, profile.availableModels, profile.model);
  const selectedModel = profile.model || '';
  const hasModels = models.length > 0;
  return `
    <button
      class="api-model-trigger ${hasModels ? '' : 'is-empty'}"
      id="api-${profileKey}-model-trigger"
      type="button"
      data-action="open-model-modal"
      data-profile="${profileKey}"
      aria-haspopup="dialog"
    >
      <span class="api-model-trigger__main">
        <span class="api-model-trigger__text" title="${escapeHtml(selectedModel || '请先拉取模型')}">${escapeHtml(selectedModel || '请先拉取模型')}</span>
      </span>
      <span class="api-model-trigger__side">
        <span class="api-model-trigger__meta">${hasModels ? `共 ${models.length} 个` : '暂无模型'}</span>
        <span class="api-model-trigger__arrow">${ICONS.chevronDown}</span>
      </span>
    </button>
  `;
}

function renderProviderModalOptions(selectedProvider) {
  return Object.keys(PROVIDER_META)
    .map((id) => {
      const provider = PROVIDER_META[id];
      const isSelected = selectedProvider === id;
      return `
        <button
          class="api-provider-option ${isSelected ? 'is-selected' : ''}"
          type="button"
          data-action="choose-provider"
          data-provider="${id}"
        >
          <span class="api-provider-option__main">
            <span class="api-provider-option__icon">${renderProviderIcon(id)}</span>
            <span class="api-provider-option__label">${escapeHtml(provider.shortLabel)}</span>
          </span>
          <span class="api-provider-option__desc">${escapeHtml(provider.label)}</span>
          <span class="api-provider-option__check">${isSelected ? ICONS.selected : ICONS.unselected}</span>
        </button>
      `;
    })
    .join('');
}

// [模块标注] 模型项极简展示模块：模型弹窗内仅展示模型名与选中状态，不显示三横杠图标与模型来源文案
function renderModelModalOptions(profile) {
  const models = mergeModelOptions(profile.provider, profile.availableModels, profile.model);

  if (!models.length) {
    return `
      <div class="api-model-empty-state">
        <span class="api-model-empty-state__icon">${ICONS.model}</span>
        <span>当前没有可选模型，请先点击“拉取模型”</span>
      </div>
    `;
  }

  return models
    .map((model) => {
      const isSelected = model === profile.model;
      return `
        <button
          class="api-model-option ${isSelected ? 'is-selected' : ''}"
          type="button"
          data-action="choose-model"
          data-model="${escapeHtml(model)}"
        >
          <span class="api-model-option__main">
            <span class="api-model-option__label">${escapeHtml(model)}</span>
          </span>
          <span class="api-model-option__check">${isSelected ? ICONS.selected : ICONS.unselected}</span>
        </button>
      `;
    })
    .join('');
}

function renderProviderModal() {
  return `
    <div id="api-provider-modal" class="api-provider-modal hidden" aria-hidden="true" data-profile="">
      <div class="api-provider-modal__mask" data-action="close-provider-modal"></div>
      <div class="api-provider-modal__panel" role="dialog" aria-modal="true" aria-labelledby="api-provider-modal-title">
        <div class="api-provider-modal__header">
          <span id="api-provider-modal-title">选择 API 服务商接口</span>
          <button type="button" class="api-provider-modal__close" data-action="close-provider-modal" aria-label="关闭服务商选择弹窗">
            <span class="api-provider-modal__close-icon">${ICONS.close}</span>
          </button>
        </div>
        <div class="api-provider-modal__body">
          <p class="api-provider-modal__hint">切换服务商后，将自动替换 API 地址，并清空原有密钥与模型列表。</p>
          <div id="api-provider-modal-options" class="api-provider-modal__options"></div>
        </div>
      </div>
    </div>
  `;
}

// [模块标注] 模型弹窗极简标题模块：移除顶部说明文案，仅保留标题与可滚动模型列表
function renderModelModal() {
  return `
    <div id="api-model-modal" class="api-model-modal hidden" aria-hidden="true" data-profile="">
      <div class="api-model-modal__mask" data-action="close-model-modal"></div>
      <div class="api-model-modal__panel" role="dialog" aria-modal="true" aria-labelledby="api-model-modal-title">
        <div class="api-model-modal__header">
          <span id="api-model-modal-title">选择模型</span>
          <button type="button" class="api-model-modal__close" data-action="close-model-modal" aria-label="关闭模型选择弹窗">
            <span class="api-model-modal__close-icon">${ICONS.close}</span>
          </button>
        </div>
        <div class="api-model-modal__body">
          <div id="api-model-modal-options" class="api-model-modal__options"></div>
        </div>
      </div>
    </div>
  `;
}

function renderProfileSection(profileKey, title, icon, profile, { isPrimary = false } = {}) {
  const providerMeta = PROVIDER_META[profile.provider];
  return `
    <section class="ui-card api-section-card" data-profile-section="${profileKey}">
      <div class="api-section-head">
        <h3 class="api-section-title">
          ${icon}
          <span>${title}</span>
        </h3>
        <span class="api-provider-badge">
          <span class="api-provider-badge__icon">${renderProviderIcon(profile.provider)}</span>
          <span>${escapeHtml(providerMeta.shortLabel)}</span>
        </span>
      </div>

      <div class="api-field-group">
        <label class="api-label" for="api-${profileKey}-provider-trigger">API 服务商接口</label>
        ${renderProviderTrigger(profileKey, profile)}
      </div>

      <div class="api-field-group">
        <label class="api-label" for="api-${profileKey}-url">API 地址</label>
        <input
          id="api-${profileKey}-url"
          class="api-input"
          type="text"
          value="${escapeHtml(profile.baseUrl)}"
          placeholder="${escapeHtml(providerMeta.defaultBaseUrl)}"
          data-profile-base-url="${profileKey}"
        >
      </div>

      <div class="api-field-group">
        <label class="api-label" for="api-${profileKey}-key">API 密钥</label>
        <input
          id="api-${profileKey}-key"
          class="api-input"
          type="password"
          value="${escapeHtml(profile.apiKey || '')}"
          placeholder="请输入 ${escapeHtml(providerMeta.shortLabel)} API Key"
          autocomplete="off"
        >
      </div>

      <div class="api-field-group">
        <label class="api-label" for="api-${profileKey}-model-trigger">模型选择</label>
        <div class="api-inline-actions">
          <div class="api-model-picker">
            <select id="api-${profileKey}-model" class="api-select api-select--hidden" aria-hidden="true" tabindex="-1">
              ${renderModelOptions(profile)}
            </select>
            ${renderModelTrigger(profileKey, profile)}
          </div>
          <button class="ui-button api-btn api-btn--ghost api-btn--compact" type="button" data-action="fetch-models" data-profile="${profileKey}">
            <span class="api-btn__icon">${ICONS.fetch}</span>
            <span>拉取模型</span>
          </button>
        </div>
      </div>

      <div class="api-row-between">
        <span class="api-label">流式输出（Stream）</span>
        <label class="ios-switch">
          <input id="api-${profileKey}-stream" class="ios-switch__input" type="checkbox" ${profile.stream ? 'checked' : ''}>
          <span class="ios-switch__slider"></span>
        </label>
      </div>

      <div class="api-actions api-actions--two-column">
        <button class="ui-button api-btn" data-action="save-profile" data-profile="${profileKey}" type="button">
          <span class="api-btn__icon">${ICONS.save}</span>
          <span>保存${isPrimary ? '主' : '副'}API</span>
        </button>
        <button class="ui-button api-btn api-btn--ghost" data-action="test-profile" data-profile="${profileKey}" type="button">
          <span class="api-btn__icon">${ICONS.test}</span>
          <span>测试连接</span>
        </button>
        ${
          isPrimary
            ? `
              <div class="api-preset-save-row api-actions__full">
                <input
                  id="api-primary-preset-name"
                  class="api-input api-preset-name-input"
                  type="text"
                  value=""
                  placeholder="输入预设名字"
                  autocomplete="off"
                >
                <button class="ui-button api-btn api-btn--ghost" data-action="save-primary-preset" type="button">
                  <span class="api-btn__icon">${ICONS.storage}</span>
                  <span>保存为预设</span>
                </button>
              </div>
            `
            : `
              <div class="api-actions__placeholder api-actions__full"></div>
            `
        }
      </div>

      <div class="api-test-result" id="api-${profileKey}-result">
        <span class="api-test-result__icon">${ICONS.global}</span>
        <span class="api-test-result__text">尚未操作</span>
      </div>
    </section>
  `;
}

export function renderApiSection({ current }) {
  const api = normalizeApiSettings(current?.api);

  return `
      <div id="settings-api" class="settings-detail">
        <div class="settings-detail__body">
          <style>
            #settings-api .settings-detail__body { gap: 10px; }

            #settings-api .api-section-card {
              margin-bottom: 12px;
            }

            #settings-api .api-section-head {
              display: flex;
              align-items: flex-start;
              justify-content: space-between;
              gap: 10px;
              margin-bottom: 12px;
            }

            #settings-api .api-section-title {
              display: flex;
              align-items: center;
              flex-wrap: wrap;
              gap: 6px;
              margin: 0;
              font-size: 14px;
              font-weight: 700;
              color: var(--c-text-main, #4A342A);
            }

            #settings-api .api-section-title svg { color: currentColor; }

            #settings-api .api-provider-badge {
              display: inline-flex;
              align-items: center;
              gap: 6px;
              padding: 6px 10px;
              border-radius: 999px;
              background: rgba(215, 201, 184, 0.22);
              color: var(--c-text-main, #4A342A);
              font-size: 11px;
              white-space: nowrap;
              border: 1px solid rgba(125, 90, 68, 0.14);
            }

            #settings-api .api-provider-badge__icon,
            #settings-api .api-preset-new__icon,
            #settings-api .api-preset-dropdown__arrow,
            #settings-api .api-preset-option__icon,
            #settings-api .api-preset-option__apply,
            #settings-api .api-preset-option__delete,
            #settings-api .api-empty-state__icon,
            #settings-api .api-provider-trigger__icon,
            #settings-api .api-provider-option__icon,
            #settings-api .api-provider-option__check,
            #settings-api .api-provider-modal__close-icon,
            #settings-api .api-model-trigger__arrow,
            #settings-api .api-model-option__check,
            #settings-api .api-model-empty-state__icon,
            #settings-api .api-model-modal__close-icon {
              line-height: 0;
              display: inline-flex;
            }

            #settings-api .api-field-group {
              display: grid;
              gap: 6px;
              margin-bottom: 10px;
            }

            #settings-api .api-label {
              font-size: 12px;
              color: rgba(74, 52, 42, 0.76);
            }

            #settings-api .api-label-row {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 8px;
            }

            #settings-api .api-inline-value {
              font-size: 12px;
              font-weight: 700;
              color: var(--c-text-main, #4A342A);
            }

            #settings-api .api-inline-actions {
              display: grid;
              grid-template-columns: minmax(0, 1fr) auto;
              gap: 8px;
              align-items: center;
            }

            #settings-api .api-input,
            #settings-api .api-select,
            #settings-api .api-provider-trigger,
            #settings-api .api-model-trigger {
              width: 100%;
              min-height: 38px;
              border: 1px solid rgba(125, 90, 68, 0.2);
              border-radius: 12px;
              background: var(--c-bg-wallpaper, #F5F1EA);
              padding: 8px 10px;
              font-size: 12px;
              color: var(--c-text-main, #4A342A);
              outline: none;
              box-sizing: border-box;
              font-family: var(--font-retro);
            }

            #settings-api .api-provider-trigger {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 12px;
              cursor: pointer;
              text-align: left;
            }

            #settings-api .api-provider-trigger__main {
              display: inline-flex;
              align-items: center;
              gap: 8px;
              min-width: 0;
            }

            #settings-api .api-provider-trigger__text {
              font-weight: 700;
            }

            #settings-api .api-provider-trigger__meta {
              color: rgba(74, 52, 42, 0.62);
              font-size: 11px;
              text-align: right;
            }

            #settings-api .api-model-picker {
              position: relative;
              min-width: 0;
            }

            #settings-api .api-select--hidden {
              position: absolute;
              inset: 0;
              opacity: 0;
              pointer-events: none;
            }

            #settings-api .api-model-trigger {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 12px;
              cursor: pointer;
              text-align: left;
            }

            #settings-api .api-model-trigger__main {
              display: flex;
              align-items: center;
              min-width: 0;
              flex: 1 1 auto;
              overflow: hidden;
            }

            /* [模块标注] 模型选择框省略样式模块：仅控制模型选择框内长模型名的单行省略，不影响其他控件 */
            #settings-api .api-model-trigger__text {
              display: block;
              min-width: 0;
              max-width: 100%;
              width: 100%;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
              font-weight: 700;
            }

            #settings-api .api-model-trigger__side {
              display: inline-flex;
              align-items: center;
              justify-content: flex-end;
              gap: 8px;
              flex: 0 0 auto;
              margin-left: 8px;
              white-space: nowrap;
            }

            #settings-api .api-model-trigger__meta {
              font-size: 11px;
              color: rgba(74, 52, 42, 0.62);
            }

            #settings-api .api-model-trigger.is-empty .api-model-trigger__text,
            #settings-api .api-model-trigger.is-empty .api-model-trigger__meta {
              color: rgba(74, 52, 42, 0.56);
            }

            #settings-api .api-input:focus,
            #settings-api .api-select:focus,
            #settings-api .api-provider-trigger:focus,
            #settings-api .api-model-trigger:focus {
              border-color: var(--c-border, #7D5A44);
              box-shadow: 0 0 0 3px rgba(125, 90, 68, 0.12);
            }

            #settings-api .api-range {
              width: 100%;
              accent-color: var(--c-text-main, #4A342A);
            }

            #settings-api .api-row-between {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 12px;
              margin-bottom: 10px;
            }

            #settings-api .ios-switch {
              position: relative;
              display: inline-block;
              width: 52px;
              height: 30px;
              flex: 0 0 auto;
            }

            #settings-api .ios-switch__input {
              opacity: 0;
              width: 0;
              height: 0;
            }

            #settings-api .ios-switch__slider {
              position: absolute;
              inset: 0;
              background: rgba(125, 125, 130, 0.38);
              border-radius: 999px;
              transition: all 0.2s ease;
              box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08);
            }

            #settings-api .ios-switch__slider::before {
              content: "";
              position: absolute;
              left: 3px;
              top: 3px;
              width: 24px;
              height: 24px;
              border-radius: 50%;
              background: #fff;
              transition: transform 0.2s ease;
              box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
            }

            #settings-api .ios-switch__input:checked + .ios-switch__slider {
              background: var(--c-text-main, #1a1a1a);
            }

            #settings-api .ios-switch__input:checked + .ios-switch__slider::before {
              transform: translateX(22px);
            }

            #settings-api .api-actions {
              display: grid;
              gap: 8px;
            }

            #settings-api .api-actions--two-column {
              grid-template-columns: 1fr 1fr;
            }

            #settings-api .api-actions__full {
              grid-column: 1 / -1;
            }

            #settings-api .api-actions__placeholder {
              display: block;
            }

            #settings-api .api-btn {
              display: inline-flex;
              align-items: center;
              justify-content: center;
              gap: 6px;
              min-height: 38px;
              border-radius: 12px;
              border: 1px solid transparent;
              background: var(--c-text-main, #4A342A);
              color: var(--c-white-rice, #F5F1EA);
              font-size: 12px;
              font-weight: 700;
              cursor: pointer;
              font-family: var(--font-retro);
            }

            #settings-api .api-btn--ghost {
              background: rgba(215, 201, 184, 0.32);
              color: var(--c-text-main, #4A342A);
              border-color: rgba(125, 90, 68, 0.12);
            }

            #settings-api .api-btn--danger {
              background: rgba(192, 57, 43, 0.12);
              color: #9f2c21;
              border-color: rgba(192, 57, 43, 0.12);
            }

            #settings-api .api-btn--compact {
              min-width: 108px;
              padding: 0 12px;
            }

            #settings-api .api-btn--small {
              min-height: 34px;
              padding: 0 12px;
            }

            #settings-api .api-btn[disabled] {
              opacity: 0.55;
              cursor: not-allowed;
            }

            #settings-api .api-btn__icon {
              line-height: 0;
              display: inline-flex;
            }

            #settings-api .api-test-result {
              display: flex;
              align-items: flex-start;
              gap: 6px;
              border-radius: 12px;
              font-size: 12px;
              line-height: 1.5;
              padding: 9px 10px;
              background: rgba(215, 201, 184, 0.18);
              color: rgba(74, 52, 42, 0.84);
              min-height: 38px;
              margin-top: 10px;
            }

            #settings-api .api-test-result__icon {
              line-height: 0;
              margin-top: 1px;
              display: inline-flex;
            }

            #settings-api .api-test-result.is-success {
              background: rgba(74, 52, 42, 0.1);
              color: var(--c-text-main, #4A342A);
            }

            #settings-api .api-test-result.is-error {
              background: rgba(192, 57, 43, 0.1);
              color: #9f2c21;
            }

            #settings-api .api-test-result.is-loading {
              background: rgba(125, 90, 68, 0.12);
              color: var(--c-text-main, #4A342A);
            }

            #settings-api .api-empty-state {
              display: flex;
              align-items: center;
              gap: 8px;
              min-height: 42px;
              padding: 10px 12px;
              border-radius: 12px;
              background: rgba(215, 201, 184, 0.16);
              color: rgba(74, 52, 42, 0.76);
              font-size: 12px;
            }

            /* ===== 设置：API 预设折叠选择器样式（已完成·本次预设名称显示与图标移除） START =====
               说明：仅作用于 API 设置页顶部预设区域和主 API“保存为预设”行；预设项已去除服务商图标，名称短时一行、长时最多两行显示。 */
            #settings-api .api-preset-panel {
              display: grid;
              gap: 10px;
            }

            #settings-api .api-preset-new {
              display: grid;
              grid-template-columns: auto minmax(0, 1fr);
              gap: 10px;
              align-items: center;
              width: 100%;
              min-width: 0;
              padding: 10px;
              border: 1px dashed rgba(125, 90, 68, 0.14);
              border-radius: 16px;
              background: rgba(215, 201, 184, 0.24);
              color: var(--c-text-main, #4A342A);
              box-sizing: border-box;
            }

            #settings-api .api-preset-new__button,
            #settings-api .api-preset-dropdown__trigger,
            #settings-api .api-preset-option__main,
            #settings-api .api-preset-option__delete {
              color: var(--c-text-main, #4A342A);
              cursor: pointer;
              font-family: var(--font-retro);
            }

            #settings-api .api-preset-new__button {
              display: inline-flex;
              align-items: center;
              gap: 7px;
              min-height: 32px;
              padding: 0 10px 0 6px;
              border: 0;
              border-radius: 999px;
              background: rgba(245, 241, 234, 0.72);
              font-size: 13px;
              font-weight: 700;
              white-space: nowrap;
            }

            #settings-api .api-preset-new__button:active,
            #settings-api .api-preset-dropdown__trigger:active,
            #settings-api .api-preset-option__main:active,
            #settings-api .api-preset-option__delete:active {
              transform: translateY(1px);
            }

            #settings-api .api-preset-new__icon {
              width: 24px;
              height: 24px;
              border-radius: 999px;
              align-items: center;
              justify-content: center;
              background: var(--c-text-main, #4A342A);
              color: var(--c-white-rice, #F5F1EA);
              flex: 0 0 auto;
            }

            #settings-api .api-preset-new__icon svg {
              width: 13px;
              height: 13px;
            }

            #settings-api .api-preset-dropdown {
              position: relative;
              min-width: 0;
            }

            #settings-api .api-preset-dropdown__trigger {
              width: 100%;
              min-height: 34px;
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 8px;
              padding: 0 10px;
              border: 1px solid rgba(125, 90, 68, 0.14);
              border-radius: 12px;
              background: rgba(245, 241, 234, 0.86);
              font-size: 12px;
              font-weight: 700;
              text-align: left;
            }

            #settings-api .api-preset-dropdown__trigger[disabled] {
              opacity: 0.62;
              cursor: not-allowed;
            }

            #settings-api .api-preset-dropdown__arrow {
              color: rgba(74, 52, 42, 0.74);
              transition: transform 0.18s ease;
            }

            #settings-api .api-preset-dropdown__trigger[aria-expanded="true"] .api-preset-dropdown__arrow {
              transform: rotate(180deg);
            }

            #settings-api .api-preset-dropdown__menu {
              position: absolute;
              z-index: 8;
              top: calc(100% + 8px);
              left: 0;
              right: 0;
              display: grid;
              gap: 8px;
              max-height: 230px;
              overflow-y: auto;
              padding: 8px;
              border: 1px solid rgba(125, 90, 68, 0.14);
              border-radius: 16px;
              background: #fffdf8;
              box-shadow: 0 14px 32px rgba(84, 58, 44, 0.16);
            }

            #settings-api .api-preset-dropdown__menu.hidden {
              display: none;
            }

            #settings-api .api-preset-option {
              display: grid;
              grid-template-columns: minmax(0, 1fr) auto;
              gap: 6px;
              align-items: stretch;
            }

            #settings-api .api-preset-option__main {
              display: grid;
              grid-template-columns: minmax(0, 1fr) auto;
              gap: 8px;
              align-items: center;
              min-width: 0;
              padding: 9px 10px;
              border: 1px solid rgba(125, 90, 68, 0.12);
              border-radius: 13px;
              background: rgba(245, 241, 234, 0.86);
              text-align: left;
            }

            #settings-api .api-preset-option__content {
              min-width: 0;
              display: grid;
              gap: 3px;
            }

            #settings-api .api-preset-option__title {
              min-width: 0;
              display: -webkit-box;
              overflow: hidden;
              -webkit-box-orient: vertical;
              -webkit-line-clamp: 2;
              white-space: normal;
              overflow-wrap: anywhere;
              line-height: 1.35;
              font-size: 12px;
              font-weight: 700;
            }

            #settings-api .api-preset-option__meta {
              min-width: 0;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            }

            #settings-api .api-preset-option__meta {
              font-size: 11px;
              color: rgba(74, 52, 42, 0.68);
            }

            #settings-api .api-preset-option__apply {
              color: rgba(74, 52, 42, 0.74);
            }

            #settings-api .api-preset-option__delete {
              width: 36px;
              min-height: 100%;
              border: 1px solid rgba(192, 57, 43, 0.12);
              border-radius: 13px;
              background: rgba(192, 57, 43, 0.1);
              color: #9f2c21;
              align-items: center;
              justify-content: center;
            }

            #settings-api .api-preset-save-row {
              display: grid;
              grid-template-columns: minmax(0, 1fr) auto;
              gap: 8px;
              align-items: center;
            }

            #settings-api .api-preset-name-input {
              min-height: 38px;
            }
            /* ===== 设置：API 预设折叠选择器样式（已完成·本次预设名称显示与图标移除） END ===== */

            #settings-api .api-provider-modal,
            #settings-api .api-model-modal {
              position: fixed;
              inset: 0;
              z-index: 1200;
            }

            #settings-api .api-provider-modal.hidden,
            #settings-api .api-model-modal.hidden {
              display: none;
            }

            #settings-api .api-provider-modal__mask,
            #settings-api .api-model-modal__mask {
              position: absolute;
              inset: 0;
              background: rgba(34, 24, 18, 0.22);
              backdrop-filter: blur(4px);
            }

            #settings-api .api-provider-modal__panel,
            #settings-api .api-model-modal__panel {
              position: relative;
              width: min(420px, calc(100vw - 32px));
              margin: 72px auto 0;
              background: #fffdf8;
              border: 1px solid rgba(125, 90, 68, 0.16);
              border-radius: 24px;
              box-shadow: 0 18px 40px rgba(84, 58, 44, 0.18);
              overflow: hidden;
            }

            /* [模块标注] 模型弹窗滚动模块：模型列表过长时仅列表区域纵向滚动，不影响弹窗头部 */
            #settings-api .api-model-modal__panel {
              max-height: min(620px, calc(100vh - 96px));
              display: flex;
              flex-direction: column;
            }

            #settings-api .api-provider-modal__header,
            #settings-api .api-model-modal__header {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 12px;
              padding: 18px 18px 12px;
              border-bottom: 1px solid rgba(125, 90, 68, 0.08);
              color: var(--c-text-main, #4A342A);
              font-size: 16px;
              font-weight: 700;
            }

            #settings-api .api-provider-modal__close,
            #settings-api .api-model-modal__close {
              border: 0;
              width: 34px;
              height: 34px;
              border-radius: 999px;
              background: rgba(215, 201, 184, 0.28);
              color: var(--c-text-main, #4A342A);
              display: inline-flex;
              align-items: center;
              justify-content: center;
              cursor: pointer;
            }

            #settings-api .api-provider-modal__close:active,
            #settings-api .api-model-modal__close:active {
              background: rgba(215, 201, 184, 0.46);
            }

            #settings-api .api-provider-modal__body,
            #settings-api .api-model-modal__body {
              display: flex;
              flex-direction: column;
              gap: 12px;
              padding: 16px 18px 18px;
            }

            #settings-api .api-model-modal__body {
              flex: 1 1 auto;
              min-height: 0;
              padding-top: 14px;
            }

            #settings-api .api-provider-modal__hint,
            #settings-api .api-model-modal__hint {
              margin: 0;
              font-size: 12px;
              line-height: 1.6;
              color: rgba(74, 52, 42, 0.72);
            }

            #settings-api .api-provider-modal__options,
            #settings-api .api-model-modal__options {
              display: grid;
              gap: 10px;
            }

            #settings-api .api-model-modal__options {
              flex: 1 1 auto;
              min-height: 0;
              max-height: min(420px, calc(100vh - 220px));
              overflow-y: auto;
              padding-right: 2px;
            }

            #settings-api .api-provider-option,
            #settings-api .api-model-option {
              width: 100%;
              display: grid;
              grid-template-columns: minmax(0, 1fr) auto;
              gap: 8px 12px;
              align-items: center;
              padding: 14px 14px;
              border-radius: 18px;
              border: 1px solid rgba(125, 90, 68, 0.14);
              background: rgba(245, 241, 234, 0.86);
              color: var(--c-text-main, #4A342A);
              text-align: left;
              cursor: pointer;
            }

            #settings-api .api-model-option {
              gap: 12px;
              padding: 15px 14px;
            }

            #settings-api .api-provider-option.is-selected,
            #settings-api .api-model-option.is-selected {
              border-color: rgba(74, 52, 42, 0.26);
              background: rgba(215, 201, 184, 0.34);
            }

            #settings-api .api-provider-option__main,
            #settings-api .api-model-option__main {
              display: inline-flex;
              align-items: center;
              gap: 8px;
              min-width: 0;
              font-size: 13px;
              font-weight: 700;
            }

            /* [模块标注] 模型名省略显示模块：弹窗内外的模型名均保持单行省略 */
            #settings-api .api-provider-option__label,
            #settings-api .api-model-option__label {
              min-width: 0;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            }

            #settings-api .api-provider-option__desc {
              grid-column: 1 / 2;
              font-size: 11px;
              color: rgba(74, 52, 42, 0.68);
            }

            #settings-api .api-provider-option__check,
            #settings-api .api-model-option__check {
              grid-column: 2 / 3;
              grid-row: 1 / span 2;
              color: var(--c-text-main, #4A342A);
              justify-self: end;
              align-self: center;
            }

            #settings-api .api-model-option__check {
              grid-row: 1 / 2;
            }

            #settings-api .api-model-empty-state {
              display: flex;
              align-items: center;
              gap: 8px;
              min-height: 42px;
              padding: 12px 14px;
              border-radius: 18px;
              border: 1px solid rgba(125, 90, 68, 0.14);
              background: rgba(245, 241, 234, 0.86);
              color: rgba(74, 52, 42, 0.72);
              font-size: 12px;
              line-height: 1.6;
            }

            @media (max-width: 420px) {
              #settings-api .api-inline-actions {
                grid-template-columns: 1fr;
              }

              #settings-api .api-actions--two-column {
                grid-template-columns: 1fr;
              }

              #settings-api .api-actions__full {
                grid-column: auto;
              }

              #settings-api .api-saved-item {
                flex-direction: column;
                align-items: stretch;
              }

              #settings-api .api-saved-item__actions {
                justify-content: stretch;
              }

              #settings-api .api-saved-item__actions .api-btn {
                width: 100%;
              }

              #settings-api .api-provider-trigger,
              #settings-api .api-model-trigger {
                align-items: flex-start;
                flex-direction: column;
              }

              #settings-api .api-provider-trigger__meta {
                text-align: left;
              }

              #settings-api .api-model-trigger__side {
                width: 100%;
                justify-content: space-between;
              }

              #settings-api .api-provider-modal__panel,
              #settings-api .api-model-modal__panel {
                width: calc(100vw - 24px);
                margin-top: 48px;
              }
            }
          </style>

          <!-- ===== 设置：API 预设折叠选择器（已完成·本次预设名称显示与图标移除） START =====
               说明：已保存预设不再直接陈列；在“新建预设”同栏折叠选择，选择项已去除图标并显示预设名称，长名称最多两行。 -->
          <section class="ui-card api-section-card">
            <div class="api-section-head">
              <h3 class="api-section-title">
                ${ICONS.storage}
                <span>API预设配置</span>
              </h3>
            </div>
            <div id="api-saved-primary-configs">
              ${renderSavedPrimaryConfigs(api.savedPrimaryConfigs)}
            </div>
          </section>
          <!-- ===== 设置：API 预设折叠选择器（已完成·本次预设名称显示与图标移除） END ===== -->

          ${renderProfileSection('primary', '主API设置', ICONS.main, api.primary, { isPrimary: true })}

          ${renderProfileSection('secondary', '副API设置', ICONS.secondary, api.secondary)}

          <section class="ui-card api-section-card">
            <div class="api-section-head">
              <h3 class="api-section-title">
                ${ICONS.global}
                <span>全局模型参数</span>
              </h3>
              <label class="ios-switch">
                <input id="api-default-primary" class="ios-switch__input" type="checkbox" ${api.activeProfile === 'primary' ? 'checked' : ''}>
                <span class="ios-switch__slider"></span>
              </label>
            </div>

            <div class="api-row-between" style="margin-top: -4px;">
              <span class="api-label">默认响应通道使用主 API</span>
              <span class="api-inline-value">${api.activeProfile === 'primary' ? '主API' : '副API'}</span>
            </div>

            <div class="api-field-group">
              <div class="api-label-row">
                <label class="api-label" for="api-global-temperature">统一温度（Temperature）</label>
                <span class="api-inline-value" id="api-global-temperature-value">${Number(api.global.temperature).toFixed(1)}</span>
              </div>
              <input
                id="api-global-temperature"
                type="range"
                min="0"
                max="2"
                step="0.1"
                value="${Number(api.global.temperature).toFixed(1)}"
                class="api-range"
              >
            </div>

            <div class="api-field-group" style="margin-bottom:0;">
              <label class="api-label" for="api-global-max-tokens">统一最大生成长度（maxTokens）</label>
              <input id="api-global-max-tokens" class="api-input" type="number" min="1" max="32768" value="${api.global.maxTokens}">
            </div>
          </section>

          ${renderProviderModal()}
          ${renderModelModal()}
        </div>
      </div>
  `;
}

function getProfileConfigFromForm(container, profileKey, fallbackProfile) {
  const trigger = container.querySelector(`#api-${profileKey}-provider-trigger`);
  const provider = normalizeProviderId(
    trigger?.dataset?.provider,
    fallbackProfile?.provider || 'openai'
  );
  const baseUrl = container.querySelector(`#api-${profileKey}-url`)?.value?.trim() || '';
  const apiKey = container.querySelector(`#api-${profileKey}-key`)?.value?.trim() || '';
  const model = container.querySelector(`#api-${profileKey}-model`)?.value?.trim() || '';
  const availableModels = Array.from(
    container.querySelectorAll(`#api-${profileKey}-model option`)
  )
    .map((option) => option.value)
    .filter(Boolean);

  return normalizeProfileConfig(
    {
      provider,
      apiKey,
      baseUrl: baseUrl || PROVIDER_META[provider].defaultBaseUrl,
      model,
      availableModels,
      stream: !!container.querySelector(`#api-${profileKey}-stream`)?.checked
    },
    provider
  );
}

function collectApiStateFromForm(container, fallbackApi) {
  const normalizedFallback = normalizeApiSettings(fallbackApi);

  return {
    version: 3,
    activeProfile: container.querySelector('#api-default-primary')?.checked ? 'primary' : 'secondary',
    primary: getProfileConfigFromForm(container, 'primary', normalizedFallback.primary),
    secondary: getProfileConfigFromForm(container, 'secondary', normalizedFallback.secondary),
    global: {
      temperature: clampNumber(
        container.querySelector('#api-global-temperature')?.value,
        0,
        2,
        normalizedFallback.global.temperature
      ),
      maxTokens: clampInt(
        container.querySelector('#api-global-max-tokens')?.value,
        1,
        32768,
        normalizedFallback.global.maxTokens
      ),
      useGlobalTemperature: true,
      useGlobalMaxTokens: true
    },
    savedPrimaryConfigs: normalizeSavedPrimaryConfigs(normalizedFallback.savedPrimaryConfigs)
  };
}

function setResultByProfile(container, profileKey, status, text) {
  const resultEl = container.querySelector(`#api-${profileKey}-result`);
  if (!resultEl) return;

  resultEl.classList.remove('is-success', 'is-error', 'is-loading');
  if (status === 'success') resultEl.classList.add('is-success');
  if (status === 'error') resultEl.classList.add('is-error');
  if (status === 'loading') resultEl.classList.add('is-loading');

  const icon = status === 'success' ? ICONS.ok : status === 'error' ? ICONS.error : ICONS.global;
  resultEl.innerHTML = `
    <span class="api-test-result__icon">${icon}</span>
    <span class="api-test-result__text">${escapeHtml(text)}</span>
  `;
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

async function requestOpenAiLike(baseUrl, apiKey, model, temperature, maxTokens) {
  const url = `${trimSlash(baseUrl)}/chat/completions`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: maxTokens,
      stream: false,
      messages: [{ role: 'user', content: '你好' }]
    })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(extractApiErrorMessage(payload, `HTTP ${response.status}`));
  }

  const text = payload?.choices?.[0]?.message?.content || '';
  return text || '请求成功（无文本内容）';
}

async function requestGemini(baseUrl, apiKey, model, temperature, maxTokens) {
  const url = `${trimSlash(baseUrl)}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: '你好' }] }],
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens
      }
    })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(extractApiErrorMessage(payload, `HTTP ${response.status}`));
  }

  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return text || '请求成功（无文本内容）';
}

async function requestClaude(baseUrl, apiKey, model, temperature, maxTokens) {
  const url = `${trimSlash(baseUrl)}/messages`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: '你好' }]
    })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(extractApiErrorMessage(payload, `HTTP ${response.status}`));
  }

  const text =
    payload?.content?.find?.((item) => item?.type === 'text')?.text ||
    payload?.content?.[0]?.text ||
    '';
  return text || '请求成功（无文本内容）';
}

async function fetchOpenAiLikeModels(baseUrl, apiKey) {
  const response = await fetch(`${trimSlash(baseUrl)}/models`, {
    headers: {
      Authorization: `Bearer ${apiKey}`
    }
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(extractApiErrorMessage(payload, `HTTP ${response.status}`));
  }

  return uniqueStrings((payload?.data || []).map((item) => item?.id)).sort();
}

async function fetchGeminiModels(baseUrl, apiKey) {
  const response = await fetch(`${trimSlash(baseUrl)}/models?key=${encodeURIComponent(apiKey)}`);
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(extractApiErrorMessage(payload, `HTTP ${response.status}`));
  }

  return uniqueStrings(
    (payload?.models || []).map((item) => String(item?.name || '').replace(/^models\//, ''))
  ).sort();
}

async function fetchClaudeModels(baseUrl, apiKey) {
  const response = await fetch(`${trimSlash(baseUrl)}/models`, {
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    }
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(extractApiErrorMessage(payload, `HTTP ${response.status}`));
  }

  return uniqueStrings([
    ...(payload?.data || []).map((item) => item?.id),
    ...(payload?.models || []).map((item) => item?.id)
  ]).sort();
}

async function fetchModelsByProvider(providerId, baseUrl, apiKey) {
  if (!apiKey) {
    throw new Error('API Key 不能为空');
  }

  switch (providerId) {
    case 'openai':
      return fetchOpenAiLikeModels(baseUrl || PROVIDER_META.openai.defaultBaseUrl, apiKey);
    case 'deepseek':
      return fetchOpenAiLikeModels(baseUrl || PROVIDER_META.deepseek.defaultBaseUrl, apiKey);
    case 'gemini':
      return fetchGeminiModels(baseUrl || PROVIDER_META.gemini.defaultBaseUrl, apiKey);
    case 'claude':
      return fetchClaudeModels(baseUrl || PROVIDER_META.claude.defaultBaseUrl, apiKey);
    default:
      throw new Error(`不支持的服务商: ${providerId}`);
  }
}

async function testProviderRequest(profileConfig, globalConfig) {
  const providerId = normalizeProviderId(profileConfig.provider, 'openai');
  const effectiveTemperature = globalConfig.temperature;
  const effectiveMaxTokens = 16;

  if (!profileConfig.apiKey) {
    throw new Error('API Key 不能为空');
  }

  if (!profileConfig.model) {
    throw new Error('请先拉取并选择模型');
  }

  switch (providerId) {
    case 'openai':
      return requestOpenAiLike(
        profileConfig.baseUrl || PROVIDER_META.openai.defaultBaseUrl,
        profileConfig.apiKey,
        profileConfig.model,
        effectiveTemperature,
        effectiveMaxTokens
      );
    case 'deepseek':
      return requestOpenAiLike(
        profileConfig.baseUrl || PROVIDER_META.deepseek.defaultBaseUrl,
        profileConfig.apiKey,
        profileConfig.model,
        effectiveTemperature,
        effectiveMaxTokens
      );
    case 'gemini':
      return requestGemini(
        profileConfig.baseUrl || PROVIDER_META.gemini.defaultBaseUrl,
        profileConfig.apiKey,
        profileConfig.model,
        effectiveTemperature,
        effectiveMaxTokens
      );
    case 'claude':
      return requestClaude(
        profileConfig.baseUrl || PROVIDER_META.claude.defaultBaseUrl,
        profileConfig.apiKey,
        profileConfig.model,
        effectiveTemperature,
        effectiveMaxTokens
      );
    default:
      throw new Error(`不支持的服务商: ${providerId}`);
  }
}

function updateModelTrigger(container, profileKey) {
  const trigger = container.querySelector(`#api-${profileKey}-model-trigger`);
  const select = container.querySelector(`#api-${profileKey}-model`);
  const providerTrigger = container.querySelector(`#api-${profileKey}-provider-trigger`);
  if (!trigger || !select) return;

  const providerId = normalizeProviderId(providerTrigger?.dataset?.provider, 'openai');
  const models = Array.from(select.options)
    .map((option) => option.value)
    .filter(Boolean);
  const selectedModel = select.value || '';
  const hasModels = models.length > 0;

  trigger.classList.toggle('is-empty', !hasModels);
  trigger.innerHTML = `
    <span class="api-model-trigger__main">
      <span class="api-model-trigger__text" title="${escapeHtml(selectedModel || '请先拉取模型')}">${escapeHtml(selectedModel || '请先拉取模型')}</span>
    </span>
    <span class="api-model-trigger__side">
      <span class="api-model-trigger__meta">${hasModels ? `共 ${models.length} 个` : '暂无模型'}</span>
      <span class="api-model-trigger__arrow">${ICONS.chevronDown}</span>
    </span>
  `;
  trigger.dataset.provider = providerId;
}

function setModelSelectOptions(container, profileKey, providerId, models, selectedModel) {
  const select = container.querySelector(`#api-${profileKey}-model`);
  if (!select) return;

  const merged = mergeModelOptions(providerId, models, selectedModel);
  const nextSelected = merged.includes(selectedModel) ? selectedModel : (merged[0] || '');
  if (!merged.length) {
    select.innerHTML = '<option value="" selected>请先拉取模型</option>';
    select.value = '';
    updateModelTrigger(container, profileKey);
    return;
  }

  select.innerHTML = merged
    .map((model) => {
      const selectedAttr = model === nextSelected ? 'selected' : '';
      return `<option value="${escapeHtml(model)}" ${selectedAttr}>${escapeHtml(model)}</option>`;
    })
    .join('');
  select.value = nextSelected;
  updateModelTrigger(container, profileKey);
}

function updateProviderTrigger(container, profileKey, providerId) {
  const trigger = container.querySelector(`#api-${profileKey}-provider-trigger`);
  if (!trigger) return;
  const providerMeta = PROVIDER_META[providerId];
  trigger.dataset.provider = providerId;
  trigger.innerHTML = `
    <span class="api-provider-trigger__main">
      <span class="api-provider-trigger__icon">${renderProviderIcon(providerId)}</span>
      <span class="api-provider-trigger__text">${escapeHtml(providerMeta.shortLabel)}</span>
    </span>
    <span class="api-provider-trigger__meta">${escapeHtml(providerMeta.label)}</span>
  `;
}

function fillProfileForm(container, profileKey, profileConfig) {
  const normalized = normalizeProfileConfig(profileConfig, profileConfig?.provider || 'openai');
  const urlInput = container.querySelector(`#api-${profileKey}-url`);
  const keyInput = container.querySelector(`#api-${profileKey}-key`);
  const streamInput = container.querySelector(`#api-${profileKey}-stream`);
  const badge = container.querySelector(`[data-profile-section="${profileKey}"] .api-provider-badge`);

  updateProviderTrigger(container, profileKey, normalized.provider);

  if (urlInput) {
    urlInput.value = normalized.baseUrl;
    urlInput.placeholder = PROVIDER_META[normalized.provider].defaultBaseUrl;
    urlInput.dataset.provider = normalized.provider;
  }
  if (keyInput) keyInput.value = normalized.apiKey;
  if (streamInput) streamInput.checked = normalized.stream;
  setModelSelectOptions(
    container,
    profileKey,
    normalized.provider,
    normalized.availableModels,
    normalized.model
  );

  if (badge) {
    badge.innerHTML = `
      <span class="api-provider-badge__icon">${renderProviderIcon(normalized.provider)}</span>
      <span>${escapeHtml(PROVIDER_META[normalized.provider].shortLabel)}</span>
    `;
  }
}

function switchProviderProfile(container, profileKey, nextProvider) {
  const providerId = normalizeProviderId(nextProvider, 'openai');
  const nextProfile = getDefaultProfileConfig(providerId);
  fillProfileForm(container, profileKey, nextProfile);
  setResultByProfile(
    container,
    profileKey,
    'success',
    `已切换到 ${PROVIDER_META[providerId].shortLabel} 接口，地址已自动替换，密钥与模型已清空`
  );
}

// ===== 设置：API 预设折叠选择器刷新（已完成·本次预设名称显示与图标移除） START =====
function renderSavedPrimaryConfigsInto(container, apiState) {
  const host = container.querySelector('#api-saved-primary-configs');
  if (!host) return;
  host.innerHTML = renderSavedPrimaryConfigs(apiState.savedPrimaryConfigs || []);
}
// ===== 设置：API 预设折叠选择器刷新（已完成·本次预设名称显示与图标移除） END =====

function buildSavedPrimaryPreset(profileConfig, existingCount, presetName = '') {
  const normalized = normalizeProfileConfig(profileConfig, profileConfig?.provider || 'openai');
  const providerMeta = PROVIDER_META[normalized.provider];
  return {
    id: `saved-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: presetName.trim() || `${providerMeta.shortLabel} · ${normalized.model || '未设置模型'} · ${existingCount + 1}`,
    provider: normalized.provider,
    apiKey: normalized.apiKey,
    baseUrl: normalized.baseUrl,
    model: normalized.model,
    availableModels: normalized.availableModels,
    stream: normalized.stream
  };
}

function openProviderModal(container, profileKey) {
  const modal = container.querySelector('#api-provider-modal');
  const optionsHost = container.querySelector('#api-provider-modal-options');
  if (!modal || !optionsHost || !profileKey) return;

  const trigger = container.querySelector(`#api-${profileKey}-provider-trigger`);
  const selectedProvider = normalizeProviderId(trigger?.dataset?.provider, 'openai');
  modal.dataset.profile = profileKey;
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  optionsHost.innerHTML = renderProviderModalOptions(selectedProvider);
}

function closeProviderModal(container) {
  const modal = container.querySelector('#api-provider-modal');
  const optionsHost = container.querySelector('#api-provider-modal-options');
  if (!modal || !optionsHost) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  modal.dataset.profile = '';
  optionsHost.innerHTML = '';
}

function openModelModal(container, profileKey) {
  const modal = container.querySelector('#api-model-modal');
  const optionsHost = container.querySelector('#api-model-modal-options');
  const select = container.querySelector(`#api-${profileKey}-model`);
  const providerTrigger = container.querySelector(`#api-${profileKey}-provider-trigger`);
  if (!modal || !optionsHost || !select || !profileKey) return;

  const profile = {
    provider: normalizeProviderId(providerTrigger?.dataset?.provider, 'openai'),
    model: select.value || '',
    availableModels: Array.from(select.options)
      .map((option) => option.value)
      .filter(Boolean)
  };

  modal.dataset.profile = profileKey;
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  optionsHost.innerHTML = renderModelModalOptions(profile);
}

function closeModelModal(container) {
  const modal = container.querySelector('#api-model-modal');
  const optionsHost = container.querySelector('#api-model-modal-options');
  if (!modal || !optionsHost) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  modal.dataset.profile = '';
  optionsHost.innerHTML = '';
}

export function bindApiEvents(container, { settings }) {
  let currentApiCache = null;

  settings
    .getAll()
    .then((all) => {
      currentApiCache = normalizeApiSettings(all?.api);
    })
    .catch(() => {
      currentApiCache = normalizeApiSettings({});
    });

  const updateRangeValue = (inputSelector, outputSelector) => {
    const input = container.querySelector(inputSelector);
    const output = container.querySelector(outputSelector);
    if (!input || !output) return;
    const sync = () => {
      output.textContent = Number(input.value || 0).toFixed(1);
    };
    input.addEventListener('input', sync);
    sync();
  };

  updateRangeValue('#api-global-temperature', '#api-global-temperature-value');

  const saveAllApiSettings = async (saveNote = 'API 设置已保存') => {
    const fallback = currentApiCache || normalizeApiSettings({});
    const nextApi = collectApiStateFromForm(container, fallback);

    await settings.update({ api: nextApi });
    currentApiCache = nextApi;

    Logger.info(saveNote);
    return nextApi;
  };

  /* ===== 设置：全局模型参数持久化与应用 START =====
     说明：
     1. “全局模型参数”里的 temperature / maxTokens / 默认响应通道改动后立即保存到 SettingsStore。
     2. SettingsStore 底层使用项目 DB.js / IndexedDB；这里不使用 localStorage/sessionStorage。
     3. 闲谈主 API 调用会从 prompt.js 的 getPrimaryApiConfig() 读取 api.global.temperature/maxTokens。
     4. 这里修复 maxTokens 修改后退出设置再进入又回到 2048 的问题：之前只有点击“保存主/副API”才会写入全局参数。
     ===== 设置：全局模型参数持久化与应用 END ===== */
  let globalSettingsSaveTimer = null;
  const scheduleGlobalSettingsSave = (saveNote = '全局模型参数已保存') => {
    if (globalSettingsSaveTimer) window.clearTimeout(globalSettingsSaveTimer);
    globalSettingsSaveTimer = window.setTimeout(async () => {
      try {
        await saveAllApiSettings(saveNote);
      } catch (error) {
        Logger.error('全局模型参数保存失败', error);
      }
    }, 260);
  };

  const syncActiveProfileLabel = () => {
    const input = container.querySelector('#api-default-primary');
    const label = input?.closest?.('.api-section-card')?.querySelector('.api-row-between .api-inline-value');
    if (label) label.textContent = input?.checked ? '主API' : '副API';
  };

  const globalTemperatureInput = container.querySelector('#api-global-temperature');
  const globalMaxTokensInput = container.querySelector('#api-global-max-tokens');
  const defaultPrimaryInput = container.querySelector('#api-default-primary');

  globalTemperatureInput?.addEventListener('input', () => {
    scheduleGlobalSettingsSave('全局 Temperature 已保存');
  });

  globalMaxTokensInput?.addEventListener('input', () => {
    scheduleGlobalSettingsSave('全局 maxTokens 已保存');
  });

  globalMaxTokensInput?.addEventListener('change', () => {
    const fallback = currentApiCache || normalizeApiSettings({});
    const normalized = clampInt(
      globalMaxTokensInput.value,
      1,
      32768,
      normalizeApiSettings(fallback).global.maxTokens
    );
    globalMaxTokensInput.value = String(normalized);
    scheduleGlobalSettingsSave('全局 maxTokens 已保存');
  });

  defaultPrimaryInput?.addEventListener('change', async () => {
    syncActiveProfileLabel();
    try {
      await saveAllApiSettings('默认响应通道已保存');
    } catch (error) {
      Logger.error('默认响应通道保存失败', error);
    }
  });
  syncActiveProfileLabel();

  ['primary', 'secondary'].forEach((profileKey) => {
    const trigger = container.querySelector(`#api-${profileKey}-provider-trigger`);
    const urlInput = container.querySelector(`#api-${profileKey}-url`);
    if (trigger) {
      trigger.dataset.provider = normalizeProviderId(trigger.dataset.provider, 'openai');
    }
    if (urlInput) {
      urlInput.dataset.provider = trigger?.dataset?.provider || 'openai';
    }
    updateModelTrigger(container, profileKey);
  });

  container.querySelectorAll('[data-action="save-profile"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const profileKey = btn.getAttribute('data-profile');
      if (!profileKey) return;

      try {
        await saveAllApiSettings(`${profileKey === 'primary' ? '主' : '副'} API 配置已保存`);
        setResultByProfile(
          container,
          profileKey,
          'success',
          `${profileKey === 'primary' ? '主' : '副'} API 配置已保存`
        );
      } catch (error) {
        setResultByProfile(container, profileKey, 'error', `保存失败：${error?.message || '未知错误'}`);
      }
    });
  });

  container.querySelectorAll('[data-action="fetch-models"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const profileKey = btn.getAttribute('data-profile');
      if (!profileKey) return;

      const fallback = currentApiCache || normalizeApiSettings({});
      const snapshot = collectApiStateFromForm(container, fallback);
      const profileConfig = snapshot[profileKey];

      btn.setAttribute('disabled', 'disabled');
      setResultByProfile(container, profileKey, 'loading', '正在拉取模型列表...');

      try {
        const models = await fetchModelsByProvider(
          profileConfig.provider,
          profileConfig.baseUrl,
          profileConfig.apiKey
        );
        if (!models.length) {
          throw new Error('未获取到可用模型');
        }

        const selectedModel = models.includes(profileConfig.model) ? profileConfig.model : models[0];
        setModelSelectOptions(
          container,
          profileKey,
          profileConfig.provider,
          models,
          selectedModel
        );

        if (currentApiCache) {
          currentApiCache[profileKey] = normalizeProfileConfig(
            {
              ...currentApiCache[profileKey],
              ...profileConfig,
              availableModels: models,
              model: selectedModel
            },
            profileConfig.provider
          );
        }

        const modelModal = container.querySelector('#api-model-modal');
        if (modelModal?.dataset?.profile === profileKey && !modelModal.classList.contains('hidden')) {
          openModelModal(container, profileKey);
        }

        setResultByProfile(
          container,
          profileKey,
          'success',
          `模型拉取成功，共 ${models.length} 个`
        );
      } catch (error) {
        setResultByProfile(
          container,
          profileKey,
          'error',
          `拉取失败：${error?.message || '未知错误'}`
        );
      } finally {
        btn.removeAttribute('disabled');
      }
    });
  });

  container.querySelectorAll('[data-action="test-profile"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const profileKey = btn.getAttribute('data-profile');
      if (!profileKey) return;

      const fallback = currentApiCache || normalizeApiSettings({});
      const snapshot = collectApiStateFromForm(container, fallback);
      const profileConfig = snapshot[profileKey];
      const startAt = performance.now();

      btn.setAttribute('disabled', 'disabled');
      setResultByProfile(container, profileKey, 'loading', '正在测试连接...');

      try {
        const text = await testProviderRequest(profileConfig, snapshot.global);
        const cost = Math.max(1, Math.round(performance.now() - startAt));
        const preview = String(text || '').slice(0, 120);
        setResultByProfile(container, profileKey, 'success', `成功（${cost}ms）：${preview}`);
      } catch (error) {
        const cost = Math.max(1, Math.round(performance.now() - startAt));
        setResultByProfile(
          container,
          profileKey,
          'error',
          `失败（${cost}ms）：${error?.message || '未知错误'}`
        );
      } finally {
        btn.removeAttribute('disabled');
      }
    });
  });

  // ===== 设置：API 预设按名称保存（已完成·本次按名称保存与折叠选择） START =====
  // 说明：保存预设只写入 settings.update({ api })，即项目 IndexedDB 持久化链路；不使用浏览器 localStorage/sessionStorage。
  container.querySelector('[data-action="save-primary-preset"]')?.addEventListener('click', async () => {
    try {
      const fallback = currentApiCache || normalizeApiSettings({});
      const snapshot = collectApiStateFromForm(container, fallback);
      const presetNameInput = container.querySelector('#api-primary-preset-name');
      const presetName = presetNameInput?.value?.trim() || '';

      if (!presetName) {
        setResultByProfile(container, 'primary', 'error', '请先输入预设名字');
        return;
      }

      const nextApi = {
        ...snapshot,
        savedPrimaryConfigs: normalizeSavedPrimaryConfigs(snapshot.savedPrimaryConfigs)
      };

      const duplicateIndex = nextApi.savedPrimaryConfigs.findIndex(
        (item) =>
          item.provider === snapshot.primary.provider &&
          item.baseUrl === snapshot.primary.baseUrl &&
          item.model === snapshot.primary.model &&
          item.apiKey === snapshot.primary.apiKey
      );

      if (duplicateIndex >= 0) {
        setResultByProfile(container, 'primary', 'success', '当前主 API 配置已存在于已保存列表');
        return;
      }

      nextApi.savedPrimaryConfigs = [
        buildSavedPrimaryPreset(snapshot.primary, nextApi.savedPrimaryConfigs.length, presetName),
        ...nextApi.savedPrimaryConfigs
      ].slice(0, 20);

      await settings.update({ api: nextApi });
      currentApiCache = nextApi;

      if (presetNameInput) presetNameInput.value = '';
      renderSavedPrimaryConfigsInto(container, nextApi);
      setResultByProfile(container, 'primary', 'success', `已保存预设：${presetName}`);
    } catch (error) {
      setResultByProfile(container, 'primary', 'error', `保存失败：${error?.message || '未知错误'}`);
    }
  });
  // ===== 设置：API 预设按名称保存（已完成·本次按名称保存与折叠选择） END =====

  container.addEventListener('click', async (event) => {
    const target = event.target.closest([
      '[data-action="new-primary-preset"]',
      '[data-action="toggle-primary-preset-menu"]',
      '[data-action="apply-saved-primary"]',
      '[data-action="delete-saved-primary"]',
      '[data-action="open-provider-modal"]',
      '[data-action="close-provider-modal"]',
      '[data-action="choose-provider"]',
      '[data-action="open-model-modal"]',
      '[data-action="close-model-modal"]',
      '[data-action="choose-model"]'
    ].join(', '));
    if (!target) return;

    const action = target.getAttribute('data-action');

    // ===== 设置：API 预设折叠选择/新建/删除事件（已完成·本次按名称保存与折叠选择） START =====
    if (action === 'new-primary-preset') {
      fillProfileForm(container, 'primary', getDefaultProfileConfig('openai'));
      const presetNameInput = container.querySelector('#api-primary-preset-name');
      if (presetNameInput) presetNameInput.value = '';
      setResultByProfile(container, 'primary', 'success', '已新建预设草稿，请填写 URL、Key、模型和预设名字后保存');
      return;
    }

    if (action === 'toggle-primary-preset-menu') {
      const menu = container.querySelector('[data-primary-preset-menu]');
      if (!menu) return;
      const isOpen = !menu.classList.contains('hidden');
      menu.classList.toggle('hidden', isOpen);
      target.setAttribute('aria-expanded', String(!isOpen));
      return;
    }
    // ===== 设置：API 预设折叠选择/新建/删除事件（已完成·本次按名称保存与折叠选择） END =====

    if (action === 'open-provider-modal') {
      const profileKey = target.getAttribute('data-profile');
      if (!profileKey) return;
      openProviderModal(container, profileKey);
      return;
    }

    if (action === 'close-provider-modal') {
      closeProviderModal(container);
      return;
    }

    if (action === 'choose-provider') {
      const modal = container.querySelector('#api-provider-modal');
      const profileKey = modal?.dataset?.profile;
      const providerId = target.getAttribute('data-provider');
      if (!profileKey || !providerId) return;
      switchProviderProfile(container, profileKey, providerId);
      closeProviderModal(container);
      return;
    }

    if (action === 'open-model-modal') {
      const profileKey = target.getAttribute('data-profile');
      if (!profileKey) return;
      openModelModal(container, profileKey);
      return;
    }

    if (action === 'close-model-modal') {
      closeModelModal(container);
      return;
    }

    if (action === 'choose-model') {
      const modal = container.querySelector('#api-model-modal');
      const profileKey = modal?.dataset?.profile;
      const model = target.getAttribute('data-model');
      const select = profileKey ? container.querySelector(`#api-${profileKey}-model`) : null;
      if (!profileKey || !model || !select) return;
      select.value = model;
      updateModelTrigger(container, profileKey);
      setResultByProfile(container, profileKey, 'success', `已选择模型：${model}`);
      closeModelModal(container);
      return;
    }

    const savedId = target.getAttribute('data-saved-id');
    if (!savedId) return;

    const fallback = currentApiCache || normalizeApiSettings({});
    const snapshot = normalizeApiSettings(fallback);
    const savedItem = snapshot.savedPrimaryConfigs.find((item) => item.id === savedId);

    if (!savedItem) {
      setResultByProfile(container, 'primary', 'error', '未找到目标已保存配置');
      return;
    }

    if (action === 'apply-saved-primary') {
      fillProfileForm(container, 'primary', savedItem);
      const presetNameInput = container.querySelector('#api-primary-preset-name');
      const menu = container.querySelector('[data-primary-preset-menu]');
      const menuTrigger = container.querySelector('[data-action="toggle-primary-preset-menu"]');
      if (presetNameInput) presetNameInput.value = savedItem.name;
      if (menu) menu.classList.add('hidden');
      if (menuTrigger) menuTrigger.setAttribute('aria-expanded', 'false');
      setResultByProfile(container, 'primary', 'success', `已应用预设：${savedItem.name}`);
      return;
    }

    if (action === 'delete-saved-primary') {
      try {
        const nextApi = {
          ...snapshot,
          savedPrimaryConfigs: snapshot.savedPrimaryConfigs.filter((item) => item.id !== savedId)
        };
        await settings.update({ api: nextApi });
        currentApiCache = nextApi;
        renderSavedPrimaryConfigsInto(container, nextApi);
        setResultByProfile(container, 'primary', 'success', `已删除：${savedItem.name}`);
      } catch (error) {
        setResultByProfile(container, 'primary', 'error', `删除失败：${error?.message || '未知错误'}`);
      }
    }
  });
}
