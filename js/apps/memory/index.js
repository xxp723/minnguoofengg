/**
 * 文件名: js/apps/memory/index.js
 * 用途: 旧事（Memory）应用入口模块。
 * 说明:
 * 1. 本文件只负责旧事应用初始化、模块接线与事件分发。
 * 2. 持久化全部经 memory-db.js → AppDataStore → DB.js → IndexedDB。
 * 3. 弹窗全部为应用内自绘弹窗，不调用 alert/confirm/prompt，不使用浏览器原生选择器。
 */
import {
  loadMemoryBootData,
  patchMemoryItem,
  removeMemoryItem,
  upsertMemoryItem
} from './memory-db.js';
import {
  applyFormToggle,
  applyTypeChoice,
  parseMemoryForm,
  renderDeleteModal,
  renderMemoryFormModal
} from './memory-editor.js';
import { getMemoryStats } from './memory-injection.js';
import { getSelectedItems } from './memory-roles.js';
import {
  createDefaultSearchState,
  filterMemoryItems,
  patchSearchState,
  renderSearchPanel,
  resetSearchState
} from './memory-search.js';
import { renderTimeline } from './memory-timeline.js';
import {
  MEMORY_ICONS,
  buildDateText,
  createToast,
  getDateParts,
  escapeHtml,
  formatDateTime,
  renderAvatar,
  renderEmptyState,
  renderIconButton,
  renderStatCard,
  renderTimePickerModal
} from './memory-ui.js';

const MEMORY_CSS_ID = 'memory-app-css';
const MEMORY_CSS_HREF = './js/apps/memory/memory.css?v=20260519-grand-summary-dock-range-scroll';

/* ==========================================================================
   [区域标注·已完成·本次旧事防闪屏与样式版本刷新区]
   说明：
   1. 挂载旧事页面前先加载独立 CSS，避免应用窗口先显示无样式内容。
   2. 本次为“大总结底栏去背景 + 字数栏双击滑出 + 多选滚动修复”刷新 CSS 版本号；
      如果页面里已有旧 link，会替换 href，避免继续使用缓存旧样式。
   ========================================================================== */
function ensureMemoryStyles() {
  return new Promise((resolve) => {
    const existing = document.getElementById(MEMORY_CSS_ID);
    if (existing) {
      if (existing.getAttribute('href') !== MEMORY_CSS_HREF) {
        existing.dataset.loaded = '0';
        const done = () => {
          existing.dataset.loaded = '1';
          resolve();
        };
        existing.addEventListener('load', done, { once: true });
        existing.addEventListener('error', done, { once: true });
        existing.href = MEMORY_CSS_HREF;
        return;
      }

      if (existing.dataset.loaded === '1' || existing.sheet) {
        resolve();
        return;
      }
      const done = () => {
        existing.dataset.loaded = '1';
        resolve();
      };
      existing.addEventListener('load', done, { once: true });
      existing.addEventListener('error', done, { once: true });
      return;
    }

    const link = document.createElement('link');
    link.id = MEMORY_CSS_ID;
    link.rel = 'stylesheet';
    link.href = MEMORY_CSS_HREF;
    const done = () => {
      link.dataset.loaded = '1';
      resolve();
    };
    link.addEventListener('load', done, { once: true });
    link.addEventListener('error', done, { once: true });
    document.head.appendChild(link);
  });
}

/* ==========================================================================
   [区域标注·已完成·旧事首页档案用户面具联动角色区]
   说明：
   1. 首页圆形头像已改为直接读取档案应用“用户面具”板块中的 masks。
   2. 点击某个用户面具头像后，下方只展示该面具 roleBindingIds 绑定的对应角色。
   3. 本区仅读取 memory-db.js 返回的 IndexedDB 数据，不新增 localStorage/sessionStorage 或双份存储。
   ========================================================================== */
function buildIdentityGroups(masks = [], characters = [], recordsByCharacterId = {}) {
  const characterMap = new Map(characters.map((character) => [character.id, character]));

  return masks.map((mask) => {
    const boundCharacters = (Array.isArray(mask.roleBindingIds) ? mask.roleBindingIds : [])
      .map((characterId) => characterMap.get(characterId))
      .filter(Boolean)
      .map((character) => {
        const record = recordsByCharacterId?.[character.id];
        const items = Array.isArray(record?.chatMemory?.items) ? record.chatMemory.items : [];

        return {
          ...character,
          memoryCount: items.length,
          updatedAt: Number(record?.updatedAt) || 0
        };
      });

    return {
      key: mask.id,
      label: mask.name,
      avatar: mask.avatar,
      characters: boundCharacters
    };
  });
}

function getSelectedIdentity(state) {
  return (Array.isArray(state.identityGroups) ? state.identityGroups : [])
    .find((item) => item.key === state.selectedIdentityKey) || null;
}

function getSelectedCharacter(state) {
  return (Array.isArray(state.characters) ? state.characters : [])
    .find((character) => character.id === state.selectedCharacterId) || null;
}

function getRoleCardMemoryCount(state, characterId) {
  const items = Array.isArray(state.recordsByCharacterId?.[characterId]?.chatMemory?.items)
    ? state.recordsByCharacterId[characterId].chatMemory.items
    : [];
  return items.length;
}

/* ==========================================================================
   [区域标注·已完成·本次旧事标题栏返回与标题按钮区]
   说明：
   1. 旧事应用从窗口顶部接管，标题栏位置与闲谈 chat 页面一致。
   2. 子页面左侧返回按钮已由“>”改为 IconPark 风格“<”图标，透明按钮视觉见 memory.css。
   3. 首页、“xxx的记忆库”和“闲谈应用”页标题均可按需作为按钮，点击后返回小手机桌面。
   4. 本区只负责 UI 渲染与 data-action 标记，不涉及任何持久化读写。
   ========================================================================== */
function renderMemoryTopBar({ title = 'Memory', backAction = '', titleAction = '', leftActions = '', rightActions = '' } = {}) {
  const titleNode = titleAction
    ? `<button class="memory-chat-top-bar__title" type="button" data-action="${escapeHtml(titleAction)}" aria-label="返回小手机桌面">${escapeHtml(title)}</button>`
    : `<div class="memory-chat-top-bar__title">${escapeHtml(title)}</div>`;

  return `
    <header class="memory-chat-top-bar">
      ${backAction
        ? `<button class="memory-top-back" type="button" data-action="${escapeHtml(backAction)}" aria-label="返回上一级">${MEMORY_ICONS.back}</button>`
        : ''}
      ${leftActions ? `<div class="memory-chat-top-bar__left-actions">${leftActions}</div>` : ''}
      <div class="memory-chat-top-bar__title-wrap">
        ${titleNode}
      </div>
      ${rightActions ? `<div class="memory-chat-top-bar__actions">${rightActions}</div>` : ''}
    </header>
  `;
}

/* ==========================================================================
   [区域标注·已完成·旧事统计展示区]
   说明：闲谈记忆页统计文案已同步为“总记忆数 / 允许注入 / 重点长期 / 补充候选”，
         对应本次“重点固定靠前注入、普通允许注入靠后”的精简口径。
   ========================================================================== */
function renderStats(items) {
  const stats = getMemoryStats(items);
  return `
    <section class="memory-stats">
      ${renderStatCard('总记忆数', stats.total)}
      ${renderStatCard('允许注入', stats.injected)}
      ${renderStatCard('重点长期', stats.focusLongterm)}
      ${renderStatCard('补充候选', stats.supplemental)}
    </section>
  `;
}

/* ==========================================================================
   [区域标注·已完成·旧事副API大总结调用区]
   说明：
   1. 大总结只读取设置应用“API设置”的副 API 配置，经 context.settings.getAll() 进入 SettingsStore/DB.js/IndexedDB 链路。
   2. 不使用 localStorage/sessionStorage，不写双份存储，也不做长文本字段过滤兜底。
   3. 请求结果由 index.js 写回 memory-db.js → AppDataStore → DB.js → IndexedDB。
   ========================================================================== */
const GRAND_SUMMARY_PROMPT = `你是【记忆档案管理员】。请清洗并重组以下 AI 记忆碎片：
1. 字数范围：最终大总结必须控制在{{WORD_RANGE}}字内。
2. 时间轴合并：提取日期；同一日期的事件必须合并为一条，禁止重复日期标题；按时间先后排序。
3. 去噪精简：剔除问候、吃喝拉撒、无意义打闹和流水账；保留关系确立、准确金额、重大争吵/和好、称呼变化、亲密互动（隐晦概括）、重要承诺或决定；每天不超过60字。
4. 人称适配：原文以“我”互动为主则用第一人称；原文全是名字则用第三人称。
5. 只输出纯文本，不要开场白或结束语；格式：[日期]:[事件概括]

现在处理以下记忆文本：`;

function trimApiSlash(url) {
  return String(url || '').replace(/\/+$/, '');
}

function extractApiText(payload) {
  return (
    payload?.choices?.[0]?.message?.content ||
    payload?.candidates?.[0]?.content?.parts?.[0]?.text ||
    payload?.content?.find?.((item) => item?.type === 'text')?.text ||
    payload?.content?.[0]?.text ||
    ''
  );
}

function extractApiError(payload, fallback = '副 API 请求失败') {
  return payload?.error?.message || payload?.error?.msg || payload?.message || payload?.detail || fallback;
}

async function requestGrandSummaryOpenAiLike(profile, global, promptText) {
  const response = await fetch(`${trimApiSlash(profile.baseUrl)}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${profile.apiKey}`
    },
    body: JSON.stringify({
      model: profile.model,
      temperature: Number(global?.temperature ?? 0.7),
      max_tokens: Number(global?.maxTokens ?? 2048),
      stream: false,
      messages: [{ role: 'user', content: promptText }]
    })
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(extractApiError(payload, `HTTP ${response.status}`));
  return extractApiText(payload);
}

async function requestGrandSummaryGemini(profile, global, promptText) {
  const response = await fetch(`${trimApiSlash(profile.baseUrl)}/models/${encodeURIComponent(profile.model)}:generateContent?key=${encodeURIComponent(profile.apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: promptText }] }],
      generationConfig: {
        temperature: Number(global?.temperature ?? 0.7),
        maxOutputTokens: Number(global?.maxTokens ?? 2048)
      }
    })
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(extractApiError(payload, `HTTP ${response.status}`));
  return extractApiText(payload);
}

async function requestGrandSummaryClaude(profile, global, promptText) {
  const response = await fetch(`${trimApiSlash(profile.baseUrl)}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': profile.apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: profile.model,
      temperature: Number(global?.temperature ?? 0.7),
      max_tokens: Number(global?.maxTokens ?? 2048),
      messages: [{ role: 'user', content: promptText }]
    })
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(extractApiError(payload, `HTTP ${response.status}`));
  return extractApiText(payload);
}

function getGrandSummaryWordRange(state) {
  const minText = String(state.grandSummaryWordMin ?? '100').trim();
  const maxText = String(state.grandSummaryWordMax ?? '200').trim();
  const min = Number.parseInt(minText, 10);
  const max = Number.parseInt(maxText, 10);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max <= 0) {
    return { min: 100, max: 200, label: '100-200', usedFallback: true };
  }
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  return { min: low, max: high, label: `${low}-${high}`, usedFallback: false };
}

async function runGrandSummaryWithSecondaryApi(settingsStore, selectedItems, wordRangeLabel = '100-200') {
  const allSettings = await settingsStore?.getAll?.();
  const api = allSettings?.api || {};
  const profile = api.secondary || {};
  const provider = profile.provider || 'gemini';

  if (!profile.apiKey) throw new Error('请先在设置应用的 API设置 中填写副 API Key');
  if (!profile.baseUrl) throw new Error('请先在设置应用的 API设置 中填写副 API 地址');
  if (!profile.model) throw new Error('请先在设置应用的 API设置 中选择副 API 模型');

  const memoryText = selectedItems
    .map((item, index) => `记忆#${index + 1}\n日期：${formatDateTime(item.timelineAt)}\n摘要：${item.summary || ''}`)
    .join('\n\n---\n\n');
  const promptText = `${GRAND_SUMMARY_PROMPT.replace('{{WORD_RANGE}}', wordRangeLabel)}\n\n${memoryText}`;

  const text = provider === 'gemini'
    ? await requestGrandSummaryGemini(profile, api.global, promptText)
    : provider === 'claude'
      ? await requestGrandSummaryClaude(profile, api.global, promptText)
      : await requestGrandSummaryOpenAiLike(profile, api.global, promptText);

  const summary = String(text || '').trim();
  if (!summary) throw new Error('副 API 没有返回大总结内容');
  return summary;
}

/* ==========================================================================
   [区域标注·已完成·本次旧事大总结底栏去背景、字数栏双击滑出与多选滚动修复区]
   说明：
   1. 大总结模式底部只固定显示“全选 / 总结 / 删除 / 回溯 / 取消”操作栏，已去除底栏外层背景感。
   2. 自定义字数栏默认隐藏；双击底栏后向上滑出，再次双击底栏后向下收回。
   3. 底栏按钮只保留文字；字数输入框不设置 maxlength/min/max/pattern/step 等输入限制，不使用浏览器原生选择器。
   4. 总结、删除、回溯的持久化仍由点击事件统一走 memory-db.js → DB.js / IndexedDB，不使用同步存储或双份兜底。
   ========================================================================== */
function renderGrandSummaryBar(state, visibleItems = []) {
  if (!state.grandSummaryMode) return '';

  const count = state.grandSummarySelectedIds?.size || 0;
  const busy = Boolean(state.grandSummaryBusy);
  const total = Array.isArray(visibleItems) ? visibleItems.length : 0;
  const allSelected = total > 0 && count >= total;
  const message = state.grandSummaryMessage || '可多选/全选记忆后进行总结或删除。';

  const rangeVisible = Boolean(state.grandSummaryRangeVisible);

  return `
    <section class="memory-grand-summary-dock ${rangeVisible ? 'is-range-visible' : ''}" aria-live="polite">
      <div class="memory-grand-summary-range" aria-hidden="${rangeVisible ? 'false' : 'true'}">
        <span class="memory-grand-summary-range__label">总结字数</span>
        <input class="memory-grand-summary-range__input" type="text" inputmode="numeric" data-grand-summary-word-field="min" value="${escapeHtml(state.grandSummaryWordMin ?? '100')}" aria-label="大总结最少字数">
        <span class="memory-grand-summary-range__dash">-</span>
        <input class="memory-grand-summary-range__input" type="text" inputmode="numeric" data-grand-summary-word-field="max" value="${escapeHtml(state.grandSummaryWordMax ?? '200')}" aria-label="大总结最多字数">
        <span class="memory-grand-summary-range__unit">字</span>
      </div>
      <div class="memory-grand-summary-bar">
        <span class="memory-grand-summary-bar__count">已选 ${escapeHtml(count)} 条</span>
        <button class="memory-grand-summary-bar__btn" type="button" data-action="select-all-grand-summary" ${busy || !total ? 'disabled' : ''}>
          <span>${allSelected ? '取消全选' : '全选'}</span>
        </button>
        <button class="memory-grand-summary-bar__btn" type="button" data-action="run-grand-summary" ${busy ? 'disabled' : ''}>
          <span>${busy ? '总结中' : '总结'}</span>
        </button>
        <button class="memory-grand-summary-bar__btn memory-grand-summary-bar__btn--danger" type="button" data-action="delete-grand-summary-selected" ${busy || !count ? 'disabled' : ''}>
          <span>删除</span>
        </button>
        <button class="memory-grand-summary-bar__btn" type="button" data-action="open-grand-summary-rollback" ${busy || !state.grandSummaryRollback ? 'disabled' : ''}>
          <span>回溯</span>
        </button>
        <button class="memory-grand-summary-bar__btn" type="button" data-action="cancel-grand-summary" ${busy ? 'disabled' : ''}>
          <span>取消</span>
        </button>
        <span class="memory-grand-summary-bar__message">${escapeHtml(message)}</span>
      </div>
    </section>
  `;
}

function renderGrandSummaryRollbackModal(state) {
  if (state.modal?.kind !== 'grand-summary-rollback') return '';

  return `
    <section class="memory-form-modal memory-grand-summary-rollback-modal" role="dialog" aria-modal="true" aria-label="回溯大总结">
      <div class="memory-form-modal__panel memory-form-modal__panel--compact">
        <div class="memory-form-modal__head">
          <h3>回溯大总结</h3>
          ${renderIconButton({ action: 'close-modal', icon: MEMORY_ICONS.close, label: '关闭回溯确认' })}
        </div>
        <div class="memory-delete-preview">
          ${renderEmptyState('回到本次大总结之前', '将恢复本次大总结前选中的记忆内容与条数。', MEMORY_ICONS.warning)}
        </div>
        <div class="memory-form-modal__foot">
          <button class="memory-secondary-btn" type="button" data-action="close-modal">取消</button>
          <button class="memory-primary-btn" type="button" data-action="confirm-grand-summary-rollback">确认回溯</button>
        </div>
      </div>
    </section>
  `;
}

/* ==========================================================================
   [区域标注·已完成·旧事首页档案用户面具渲染区]
   说明：
   1. 已去除“身份面具与角色记忆库”文字行。
   2. “Memory”标题可点击关闭旧事并返回小手机桌面。
   3. 圆形头像链接档案应用用户面具；点击头像后，下方展示该面具绑定角色。
   ========================================================================== */
function renderIdentityHome(state) {
  const identities = Array.isArray(state.identityGroups) ? state.identityGroups : [];
  const selectedIdentity = getSelectedIdentity(state);

  const identityRail = identities.length
    ? identities.map((identity) => {
      const active = identity.key === state.selectedIdentityKey;
      return `
        <button
          class="memory-identity-chip ${active ? 'is-active' : ''}"
          type="button"
          data-action="select-identity"
          data-id="${escapeHtml(identity.key)}"
          aria-label="查看${escapeHtml(identity.label)}绑定的角色"
        >
          ${renderAvatar({ name: identity.label, avatar: identity.avatar }, 'memory-identity-chip__avatar')}
          <span class="memory-identity-chip__name">${escapeHtml(identity.label)}</span>
        </button>
      `;
    }).join('')
    : renderEmptyState(
      '暂无用户面具',
      '请先在档案应用的用户面具板块创建面具，旧事会自动读取并展示。',
      MEMORY_ICONS.user
    );

  const roleCards = selectedIdentity
    ? (
      selectedIdentity.characters.length
        ? selectedIdentity.characters.map((character) => `
          <button
            class="memory-role-card"
            type="button"
            data-action="open-role-library"
            data-id="${escapeHtml(character.id)}"
          >
            <div class="memory-role-card__head">
              ${renderAvatar(character, 'memory-role-card__avatar')}
              <div class="memory-role-card__title-wrap">
                <div class="memory-role-card__title">${escapeHtml(character.name)}</div>
                <div class="memory-role-card__sub">${escapeHtml(selectedIdentity.label)}</div>
              </div>
            </div>
            <div class="memory-role-card__line"></div>
            <div class="memory-role-card__foot">
              <span>${escapeHtml(getRoleCardMemoryCount(state, character.id))} 条记忆</span>
              <span>${escapeHtml(character.updatedAt ? formatDateTime(character.updatedAt) : '暂无更新')}</span>
            </div>
          </button>
        `).join('')
        : `
          <section class="memory-role-placeholder">
            ${renderEmptyState('暂无绑定角色', '这个用户面具还没有在档案应用中绑定对应角色。', MEMORY_ICONS.chat)}
          </section>
        `
    )
    : `
      <section class="memory-role-placeholder">
        ${renderEmptyState('请选择用户面具', '点击上方圆形用户面具头像后，在这里查看该面具绑定的对应角色。', MEMORY_ICONS.chat)}
      </section>
    `;

  return `
    <section class="memory-home">
      ${renderMemoryTopBar({ title: 'Memory', titleAction: 'close-memory' })}
      <section class="memory-identity-rail" aria-label="档案用户面具头像区">
        ${identityRail}
      </section>
      <section class="memory-role-cards" aria-label="用户面具绑定角色区">
        ${roleCards}
      </section>
    </section>
  `;
}

/* ==========================================================================
   [区域标注·已完成·本次角色记忆库页面区]
   说明：
   1. 标题为“xxx的记忆库”，点击标题可返回小手机桌面。
   2. 左侧为透明无圆形背景的“<”返回按钮；应用卡片一行两列，目前只提供闲谈应用入口。
   ========================================================================== */
function renderRoleLibrary(state) {
  const character = getSelectedCharacter(state);

  if (!character) {
    return renderEmptyState('角色不存在', '请选择有效角色后再进入记忆库。', MEMORY_ICONS.warning);
  }

  return `
    <section class="memory-library">
      ${renderMemoryTopBar({ title: `${character.name}的记忆库`, backAction: 'back-to-home', titleAction: 'close-memory' })}
      <section class="memory-library-grid">
        <button class="memory-app-card is-chat" type="button" data-action="open-chat-memory" data-id="${escapeHtml(character.id)}">
          <div class="memory-app-card__icon">${MEMORY_ICONS.chat}</div>
          <div class="memory-app-card__title">闲谈应用</div>
          <div class="memory-app-card__desc">查看与搜索该角色的闲谈记忆</div>
        </button>
        <article class="memory-app-card is-placeholder" aria-hidden="true">
          <div class="memory-app-card__icon">${MEMORY_ICONS.memory}</div>
          <div class="memory-app-card__title">敬请期待</div>
          <div class="memory-app-card__desc">其它应用记忆卡片后续扩展</div>
        </article>
      </section>
    </section>
  `;
}

/* ==========================================================================
   [区域标注·已完成·本次单个应用记忆页标题栏操作区]
   说明：
   1. 标题显示当前进入的应用名“闲谈应用”，点击标题可返回小手机桌面。
   2. 标题左侧透明“<”按钮返回角色记忆库。
   3. 新建记忆入口已从右下角迁移到标题栏最右侧“+”IconPark 图标按钮。
   4. “+”左侧已加入放大镜 IconPark 图标按钮，用于展开/收起记忆搜索栏。
   5. 本区只负责 UI 入口与 data-action 标记，不涉及持久化读写。
   ========================================================================== */
function renderChatMemory(state) {
  const character = getSelectedCharacter(state);
  if (!character) {
    return renderEmptyState('角色不存在', '请选择有效角色后再查看闲谈记忆。', MEMORY_ICONS.warning);
  }

  const items = getSelectedItems(state);
  const filteredItems = filterMemoryItems(items, state.search);
  const searchExpanded = Boolean(state.searchExpanded);

  /* [区域标注·已完成·本次旧事大总结入口标题左侧均衡区]
     说明：大总结按钮已移到标题栏左侧并使用 IconPark 风格图标，右侧只保留“搜索”和“+”，
     标题栏左右视觉更均衡；后续调用设置应用 API设置 的副 API，不使用 localStorage/sessionStorage。 */
  const leftBarActions = `
    ${renderIconButton({
      action: 'open-grand-summary',
      icon: MEMORY_ICONS.summarize,
      label: state.grandSummaryMode ? '正在大总结多选' : '大总结',
      extraClass: `memory-top-action memory-grand-summary-entry ${state.grandSummaryMode ? 'is-active' : ''}`
    })}
  `;

  const topBarActions = `
    ${renderIconButton({
      action: 'toggle-search',
      icon: MEMORY_ICONS.search,
      label: searchExpanded ? '收起搜索栏' : '展开搜索栏',
      extraClass: `memory-top-action ${searchExpanded ? 'is-active' : ''}`
    })}
    ${renderIconButton({
      action: 'open-add',
      icon: MEMORY_ICONS.add,
      label: '新建记忆',
      extraClass: 'memory-top-action'
    })}
  `;

  return `
    <section class="memory-chat-page ${searchExpanded ? 'is-search-open' : ''}">
      ${renderMemoryTopBar({
        title: '闲谈应用',
        backAction: 'back-to-library',
        titleAction: 'close-memory',
        leftActions: leftBarActions,
        rightActions: topBarActions
      })}
      ${searchExpanded ? renderSearchPanel(state.search) : ''}
      ${renderStats(items)}
      <section class="memory-items">
        ${renderTimeline(filteredItems, {
          grandSummaryMode: state.grandSummaryMode,
          selectedIds: state.grandSummarySelectedIds
        })}
      </section>
      ${renderGrandSummaryBar(state, filteredItems)}
    </section>
  `;
}

function renderMainByStage(state) {
  if (state.loading) {
    /* ========================================================================
       [区域标注·已完成·旧事入口无加载文案防闪屏区]
       说明：
       1. 旧事窗口显示前已由 AppManager 预加载 memory.css，这里不再渲染“正在读取旧事”加载卡片。
       2. 数据读取期间保持旧事独立 CSS 背景空壳，读取完成后直接显示正式页面，避免全局/加载界面晃眼。
       3. 本区不涉及持久化读写；旧事数据仍走 memory-db.js → DB.js / IndexedDB。
       ======================================================================== */
    return '';
  }

  if (state.stage === 'role-library') {
    return renderRoleLibrary(state);
  }

  if (state.stage === 'chat-memory') {
    return renderChatMemory(state);
  }

  return renderIdentityHome(state);
}

function renderApp(root, state) {
  root.innerHTML = `
    <div class="memory-shell">
      <main class="memory-layout memory-layout--single">
        ${renderMainByStage(state)}
      </main>
    </div>
    ${renderMemoryFormModal(state)}
    ${renderDeleteModal(state)}
    ${renderGrandSummaryRollbackModal(state)}
    ${renderTimePickerModal(state.timePicker)}
  `;
}

/* ==========================================================================
   [区域标注·已完成·旧事入口接线区]
   说明：index.js 只保留接线与页面状态机，持久化仍全部走 memory-db.js（IndexedDB）。
   ========================================================================== */
export async function mount(container, context) {
  await ensureMemoryStyles();

  const state = {
    appMeta: context.appMeta,
    db: context.db,
    characters: [],
    masks: [],
    identityGroups: [],
    recordsByCharacterId: {},
    eventBus: context.eventBus,
    selectedIdentityKey: '',
    selectedCharacterId: '',
    stage: 'home',
    search: createDefaultSearchState(),
    searchExpanded: false,
    grandSummaryMode: false,
    grandSummarySelectedIds: new Set(),
    grandSummaryBusy: false,
    grandSummaryMessage: '',
    grandSummaryWordMin: '100',
    grandSummaryWordMax: '200',
    grandSummaryRangeVisible: false,
    grandSummaryRollback: null,
    settings: context.settings,
    modal: null,
    timePicker: null,
    loading: true
  };

  container.classList.add('memory-app');
  renderApp(container, state);

  const toast = createToast(container);

  const refreshBootData = async ({ keepSelection = true } = {}) => {
    state.loading = true;
    renderApp(container, state);
    try {
      const bootData = await loadMemoryBootData(state.db);
      state.characters = bootData.characters;
      state.masks = bootData.masks;
      state.recordsByCharacterId = bootData.recordsByCharacterId;
      state.identityGroups = buildIdentityGroups(state.masks, state.characters, state.recordsByCharacterId);

      /* [区域标注·已完成·本次旧事首页默认面具选择区]
         说明：进入 Memory 后如果已存在用户面具，默认选中第一个面具并直接展示其绑定角色；
         只有完全没有面具时才显示“请选择用户面具”的空状态。 */
      if (!keepSelection) {
        state.selectedIdentityKey = state.identityGroups[0]?.key || '';
        state.selectedCharacterId = '';
        state.stage = 'home';
      } else {
        if (!state.selectedIdentityKey && state.identityGroups.length) {
          state.selectedIdentityKey = state.identityGroups[0]?.key || '';
        }
        if (state.selectedIdentityKey && !state.identityGroups.some((item) => item.key === state.selectedIdentityKey)) {
          state.selectedIdentityKey = state.identityGroups[0]?.key || '';
        }
        if (state.selectedCharacterId && !state.characters.some((item) => item.id === state.selectedCharacterId)) {
          state.selectedCharacterId = '';
          state.stage = 'home';
        }
      }
    } catch (error) {
      state.characters = [];
      state.masks = [];
      state.identityGroups = [];
      state.recordsByCharacterId = {};
      toast.show('旧事读取失败，请查看日志');
      console.error('[memory] load failed', error);
    } finally {
      state.loading = false;
      renderApp(container, state);
    }
  };

  const refreshRecordsOnly = async () => {
    const bootData = await loadMemoryBootData(state.db);
    state.characters = bootData.characters;
    state.masks = bootData.masks;
    state.recordsByCharacterId = bootData.recordsByCharacterId;
    state.identityGroups = buildIdentityGroups(state.masks, state.characters, state.recordsByCharacterId);
  };

  /* ========================================================================
     [区域标注·已完成·旧事记忆卡片快捷操作与滚动保持区]
     说明：
     1. 允许注入、切换类型均写入 memory-db.js → IndexedDB，不使用同步存储或双份兜底。
     2. 允许注入与切换类型重新渲染后恢复单个应用记忆页滚动位置，避免页面闪回顶部。
     3. 切换类型按“长期记忆 → 重点长期 → 待确认 → 长期记忆”循环。
     ======================================================================== */
  const getChatPageScrollTop = () => container.querySelector('.memory-chat-page')?.scrollTop || 0;

  const renderKeepingChatScroll = (scrollTop) => {
    renderApp(container, state);
    const page = container.querySelector('.memory-chat-page');
    if (page) {
      page.scrollTop = scrollTop;
      requestAnimationFrame(() => {
        page.scrollTop = scrollTop;
      });
    }
  };

  const getNextMemoryTypePatch = (item) => {
    if (item?.type === 'longterm' && !item.isPermanent) {
      return {
        type: 'longterm',
        isPermanent: true,
        isHighPriority: true,
        injectionEnabled: true
      };
    }

    if (item?.type === 'longterm' && item.isPermanent) {
      return {
        type: 'pending',
        isPermanent: false,
        isHighPriority: false,
        injectionEnabled: false
      };
    }

    return {
      type: 'longterm',
      isPermanent: false,
      isHighPriority: false,
      injectionEnabled: true
    };
  };

  const getItemById = (id) => getSelectedItems(state).find((item) => item.id === id) || null;

  const resetGrandSummaryState = () => {
    state.grandSummaryMode = false;
    state.grandSummarySelectedIds = new Set();
    state.grandSummaryBusy = false;
    state.grandSummaryMessage = '';
    state.grandSummaryRangeVisible = false;
    state.grandSummaryRollback = null;
  };

  /* ========================================================================
     [区域标注·已完成·闲谈管理记忆定向打开旧事闲谈记忆库]
     说明：
     1. 支持 AppManager 通过 openPayload 定向打开旧事应用到指定角色的“闲谈应用”记忆库页面。
     2. 本区只切换旧事应用运行时页面状态，不新增任何持久化读写。
     3. 仍然只使用 memory-db.js → DB.js / IndexedDB 读取启动数据；不使用 localStorage/sessionStorage。
     ======================================================================== */
  const handleOpenPayload = async (openPayload = {}) => {
    const characterId = String(openPayload?.characterId || '').trim();
    if (!characterId) return false;

    if (state.loading) {
      await refreshRecordsOnly().catch(() => {});
      state.loading = false;
    }

    const identityId = String(openPayload?.identityId || '').trim();
    if (identityId && state.identityGroups.some((item) => String(item.key || '') === identityId)) {
      state.selectedIdentityKey = identityId;
    } else {
      const matchedIdentity = state.identityGroups.find((identity) =>
        (Array.isArray(identity.characters) ? identity.characters : [])
          .some((character) => String(character?.id || '') === characterId)
      );
      state.selectedIdentityKey = matchedIdentity?.key || state.selectedIdentityKey || state.identityGroups[0]?.key || '';
    }

    state.selectedCharacterId = characterId;
    state.stage = String(openPayload?.stage || '') === 'role-library' ? 'role-library' : 'chat-memory';
    resetSearchState(state);
    state.searchExpanded = false;
    resetGrandSummaryState();
    state.modal = null;
    renderApp(container, state);
    return true;
  };

  const getGrandSummarySelectableItems = () => filterMemoryItems(getSelectedItems(state), state.search);

  const getGrandSummarySelectedItems = () => {
    const ids = state.grandSummarySelectedIds || new Set();
    return getSelectedItems(state)
      .filter((item) => ids.has(item.id))
      .sort((a, b) => Number(a.timelineAt || 0) - Number(b.timelineAt || 0));
  };

  const closeModal = () => {
    const scrollTop = Number(state.modal?.returnScrollTop) || getChatPageScrollTop();
    state.modal = null;
    renderKeepingChatScroll(scrollTop);
  };

  const handleClick = async (event) => {
    const actionEl = event.target.closest('[data-action]');
    if (!actionEl || !container.contains(actionEl)) return;

    const action = actionEl.dataset.action;
    const id = actionEl.dataset.id;

    if (action === 'close-memory') {
      state.eventBus?.emit('app:close', { appId: state.appMeta?.id || 'memory' });
      return;
    }

    if (action === 'select-identity') {
      state.selectedIdentityKey = id || '';
      state.modal = null;
      renderApp(container, state);
      return;
    }

    if (action === 'open-role-library') {
      state.selectedCharacterId = id || '';
      state.stage = 'role-library';
      resetSearchState(state);
      state.searchExpanded = false;
      resetGrandSummaryState();
      state.modal = null;
      renderApp(container, state);
      return;
    }

    if (action === 'open-chat-memory') {
      state.selectedCharacterId = id || state.selectedCharacterId;
      state.stage = 'chat-memory';
      resetSearchState(state);
      state.searchExpanded = false;
      resetGrandSummaryState();
      state.modal = null;
      renderApp(container, state);
      return;
    }

    if (action === 'back-to-home') {
      state.stage = 'home';
      state.selectedCharacterId = '';
      resetSearchState(state);
      state.searchExpanded = false;
      resetGrandSummaryState();
      state.modal = null;
      renderApp(container, state);
      return;
    }

    if (action === 'back-to-library') {
      state.stage = 'role-library';
      resetSearchState(state);
      state.searchExpanded = false;
      resetGrandSummaryState();
      state.modal = null;
      renderApp(container, state);
      return;
    }

    if (action === 'open-grand-summary') {
      state.grandSummaryMode = !state.grandSummaryMode;
      state.grandSummarySelectedIds = new Set();
      state.grandSummaryBusy = false;
      state.grandSummaryRangeVisible = false;
      state.grandSummaryMessage = state.grandSummaryMode ? '选择 2 条以上记忆后开始大总结。' : '';
      renderApp(container, state);
      return;
    }

    if (action === 'cancel-grand-summary') {
      resetGrandSummaryState();
      renderApp(container, state);
      return;
    }

    if (action === 'select-all-grand-summary') {
      if (!state.grandSummaryMode || state.grandSummaryBusy) return;
      const selectableItems = getGrandSummarySelectableItems();
      const selectableIds = selectableItems.map((item) => item.id);
      const current = state.grandSummarySelectedIds || new Set();
      const allSelected = selectableIds.length > 0 && selectableIds.every((itemId) => current.has(itemId));
      state.grandSummarySelectedIds = allSelected ? new Set() : new Set(selectableIds);
      state.grandSummaryMessage = allSelected ? '已取消全选。' : '已全选当前筛选结果。';
      renderApp(container, state);
      return;
    }

    if (action === 'toggle-grand-summary-item') {
      if (!state.grandSummaryMode || state.grandSummaryBusy || !id) return;
      const next = new Set(state.grandSummarySelectedIds || []);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      state.grandSummarySelectedIds = next;
      state.grandSummaryMessage = '选择完成后点击“开始大总结”。';
      renderApp(container, state);
      return;
    }

    if (action === 'delete-grand-summary-selected') {
      if (!state.grandSummaryMode || state.grandSummaryBusy) return;
      const selectedItems = getGrandSummarySelectedItems();
      if (!selectedItems.length) {
        state.grandSummaryMessage = '请先选择要删除的记忆。';
        toast.show('请先选择记忆');
        renderApp(container, state);
        return;
      }

      const scrollTop = getChatPageScrollTop();
      state.grandSummaryBusy = true;
      state.grandSummaryMessage = '正在删除选中的记忆...';
      renderKeepingChatScroll(scrollTop);

      for (const item of selectedItems) {
        await removeMemoryItem(state.db, state.selectedCharacterId, item.id);
      }

      await refreshRecordsOnly();
      resetGrandSummaryState();
      toast.show('已删除选中记忆');
      renderKeepingChatScroll(scrollTop);
      return;
    }

    if (action === 'run-grand-summary') {
      if (!state.grandSummaryMode || state.grandSummaryBusy) return;
      const selectedItems = getGrandSummarySelectedItems();
      if (selectedItems.length < 2) {
        state.grandSummaryMessage = '至少选择 2 条记忆才能合并。';
        toast.show('至少选择 2 条记忆');
        renderApp(container, state);
        return;
      }

      const scrollTop = getChatPageScrollTop();
      state.grandSummaryBusy = true;
      state.grandSummaryMessage = '正在调用副 API 合并去重精简...';
      renderKeepingChatScroll(scrollTop);

      try {
        const wordRange = getGrandSummaryWordRange(state);
        if (wordRange.usedFallback) {
          toast.show('字数范围已按默认100-200字处理');
        }
        const rollbackSnapshot = {
          characterId: state.selectedCharacterId,
          items: selectedItems.map((item) => ({ ...item })),
          keeperId: selectedItems[0]?.id || ''
        };

        const summary = await runGrandSummaryWithSecondaryApi(state.settings, selectedItems, wordRange.label);
        const keeper = selectedItems[0];
        await patchMemoryItem(state.db, state.selectedCharacterId, keeper.id, {
          summary,
          title: summary.slice(0, 18),
          type: 'longterm',
          isPermanent: true,
          isHighPriority: true,
          injectionEnabled: true,
          timelineAt: keeper.timelineAt
        });

        const removeIds = selectedItems.map((item) => item.id).filter((itemId) => itemId !== keeper.id);
        for (const removeId of removeIds) {
          await removeMemoryItem(state.db, state.selectedCharacterId, removeId);
        }

        await refreshRecordsOnly();
        state.grandSummaryRollback = rollbackSnapshot;
        state.grandSummaryMode = true;
        state.grandSummarySelectedIds = new Set();
        state.grandSummaryBusy = false;
        state.grandSummaryMessage = '已完成大总结，可点击“回溯”恢复本次大总结前的样子。';
        toast.show('大总结已替换选中记忆');
        renderKeepingChatScroll(scrollTop);
      } catch (error) {
        state.grandSummaryBusy = false;
        state.grandSummaryMessage = error?.message || '大总结失败，请检查副 API 设置';
        toast.show(state.grandSummaryMessage);
        renderKeepingChatScroll(scrollTop);
        console.error('[memory] grand summary failed', error);
      }
      return;
    }

    if (action === 'open-grand-summary-rollback') {
      if (!state.grandSummaryRollback || state.grandSummaryBusy) return;
      const scrollTop = getChatPageScrollTop();
      state.modal = { kind: 'grand-summary-rollback', returnScrollTop: scrollTop };
      renderKeepingChatScroll(scrollTop);
      return;
    }

    if (action === 'confirm-grand-summary-rollback') {
      if (!state.grandSummaryRollback || state.grandSummaryBusy) return;
      const scrollTop = Number(state.modal?.returnScrollTop) || getChatPageScrollTop();
      const snapshot = state.grandSummaryRollback;
      state.grandSummaryBusy = true;
      state.grandSummaryMessage = '正在回溯到本次大总结之前...';
      state.modal = null;
      renderKeepingChatScroll(scrollTop);

      if (snapshot.keeperId) {
        await removeMemoryItem(state.db, snapshot.characterId, snapshot.keeperId);
      }
      for (const item of snapshot.items || []) {
        await upsertMemoryItem(state.db, snapshot.characterId, item);
      }

      await refreshRecordsOnly();
      state.grandSummaryRollback = null;
      state.grandSummaryMode = true;
      state.grandSummarySelectedIds = new Set();
      state.grandSummaryBusy = false;
      state.grandSummaryMessage = '已回溯到本次大总结之前。';
      toast.show('已完成回溯');
      renderKeepingChatScroll(scrollTop);
      return;
    }

    if (action === 'toggle-search') {
      state.searchExpanded = !state.searchExpanded;
      renderApp(container, state);
      return;
    }

    if (action === 'set-time-preset') {
      patchSearchState(state, { timePreset: actionEl.dataset.preset || 'all' });
      state.searchExpanded = true;
      renderApp(container, state);
      return;
    }

    if (action === 'open-time-picker') {
      const field = actionEl.dataset.pickerField || '';
      const input = actionEl.parentElement?.querySelector(`input[name="${field}"]`);
      const includeTime = actionEl.dataset.pickerIncludeTime === 'true';
      const endOfDay = actionEl.dataset.pickerEndOfDay === 'true';
      const value = input?.value || '';
      state.timePicker = {
        field,
        searchField: actionEl.dataset.pickerSearchField || '',
        includeTime,
        endOfDay,
        value,
        parts: getDateParts(value, { includeTime, endOfDay })
      };
      renderApp(container, state);
      return;
    }

    if (action === 'close-time-picker') {
      state.timePicker = null;
      renderApp(container, state);
      return;
    }

    if (action === 'set-time-picker-part') {
      if (!state.timePicker) return;
      state.timePicker.parts = {
        ...getDateParts(state.timePicker.value, {
          includeTime: state.timePicker.includeTime,
          endOfDay: state.timePicker.endOfDay
        }),
        ...(state.timePicker.parts || {}),
        [actionEl.dataset.pickerPart || '']: actionEl.dataset.pickerValue || ''
      };
      state.timePicker.value = buildDateText(state.timePicker.parts, {
        includeTime: state.timePicker.includeTime,
        endOfDay: state.timePicker.endOfDay
      });
      renderApp(container, state);
      return;
    }

    if (action === 'apply-time-picker') {
      if (!state.timePicker) return;
      const value = state.timePicker.value || buildDateText(state.timePicker.parts || {}, {
        includeTime: state.timePicker.includeTime,
        endOfDay: state.timePicker.endOfDay
      });
      if (state.timePicker.searchField) {
        patchSearchState(state, { [state.timePicker.searchField]: value });
      } else if (state.modal?.kind === 'form' && state.timePicker.field === 'timelineAt') {
        state.modal.draftTimelineAt = value;
      }
      state.timePicker = null;
      renderApp(container, state);
      return;
    }

    if (action === 'open-add') {
      state.modal = { kind: 'form', item: null, draftTimelineAt: formatDateTime(Date.now()) };
      renderApp(container, state);
      return;
    }

    if (action === 'open-edit') {
      const scrollTop = getChatPageScrollTop();
      state.modal = { kind: 'form', item: getItemById(id), draftTimelineAt: '', returnScrollTop: scrollTop };
      renderKeepingChatScroll(scrollTop);
      return;
    }

    if (action === 'open-delete') {
      const scrollTop = getChatPageScrollTop();
      state.modal = { kind: 'delete', item: getItemById(id), returnScrollTop: scrollTop };
      renderKeepingChatScroll(scrollTop);
      return;
    }

    if (action === 'close-modal') {
      closeModal();
      return;
    }

    if (action === 'confirm-delete') {
      const scrollTop = Number(state.modal?.returnScrollTop) || getChatPageScrollTop();
      await removeMemoryItem(state.db, state.selectedCharacterId, id);
      await refreshRecordsOnly();
      state.modal = null;
      toast.show('已删除记忆');
      renderKeepingChatScroll(scrollTop);
      return;
    }

    if (action === 'cycle-memory-type') {
      const item = getItemById(id);
      if (!item) return;
      const scrollTop = getChatPageScrollTop();
      await patchMemoryItem(state.db, state.selectedCharacterId, id, getNextMemoryTypePatch(item));
      await refreshRecordsOnly();
      toast.show('已切换记忆类型');
      renderKeepingChatScroll(scrollTop);
      return;
    }

    if (action === 'toggle-injection') {
      const item = getItemById(id);
      if (!item) return;
      const scrollTop = getChatPageScrollTop();
      await patchMemoryItem(state.db, state.selectedCharacterId, id, { injectionEnabled: !item.injectionEnabled });
      await refreshRecordsOnly();
      renderKeepingChatScroll(scrollTop);
      return;
    }

    if (action === 'choose-memory-type') {
      applyTypeChoice(actionEl);
      return;
    }

    if (action === 'form-toggle') {
      applyFormToggle(actionEl);
    }
  };

  const handleDoubleClick = (event) => {
    const dockBar = event.target.closest('.memory-grand-summary-bar');
    if (!dockBar || !container.contains(dockBar) || !state.grandSummaryMode) return;
    if (event.target.closest('button, input, textarea')) return;

    state.grandSummaryRangeVisible = !state.grandSummaryRangeVisible;
    renderKeepingChatScroll(getChatPageScrollTop());
  };

  const handleInput = (event) => {
    const wordField = event.target?.dataset?.grandSummaryWordField;
    if (wordField === 'min' || wordField === 'max') {
      if (wordField === 'min') {
        state.grandSummaryWordMin = event.target.value;
      } else {
        state.grandSummaryWordMax = event.target.value;
      }
      return;
    }

    const field = event.target?.dataset?.searchField;
    if (!field) return;
    patchSearchState(state, { [field]: event.target.value });
    renderApp(container, state);
  };

  const handleSubmit = async (event) => {
    const form = event.target.closest('[data-memory-form]');
    if (!form) return;

    event.preventDefault();
    if (!state.selectedCharacterId) return;

    const item = parseMemoryForm(form);
    if (!item.summary) {
      toast.show('请填写记忆摘要');
      return;
    }

    const scrollTop = Number(state.modal?.returnScrollTop) || getChatPageScrollTop();
    await upsertMemoryItem(state.db, state.selectedCharacterId, item);
    await refreshRecordsOnly();
    state.modal = null;
    toast.show('已保存记忆');
    renderKeepingChatScroll(scrollTop);
  };

  container.addEventListener('click', handleClick);
  container.addEventListener('dblclick', handleDoubleClick);
  container.addEventListener('input', handleInput);
  container.addEventListener('submit', handleSubmit);

  await refreshBootData({ keepSelection: false });
  if (context.openPayload) {
    await handleOpenPayload(context.openPayload);
  }

  return {
    handleOpenPayload,
    destroy() {
      container.removeEventListener('click', handleClick);
      container.removeEventListener('dblclick', handleDoubleClick);
      container.removeEventListener('input', handleInput);
      container.removeEventListener('submit', handleSubmit);
      toast.destroy();
      container.classList.remove('memory-app');
      container.innerHTML = '';
    }
  };
}

export async function unmount(instance) {
  if (instance && typeof instance.destroy === 'function') {
    instance.destroy();
  }
}
