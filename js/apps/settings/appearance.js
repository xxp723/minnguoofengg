import { Logger } from '../../utils/Logger.js';

const CUSTOM_WIDGET_STORAGE_KEY = 'miniphone_custom_widgets';
const CUSTOM_WIDGET_DRAFT_KEY = 'miniphone_custom_widget_draft';
const HIDDEN_WIDGET_STORAGE_KEY = 'miniphone_hidden_widget_library_ids';

// [模块标注] 组件代码编辑器默认框架模块：默认模板图标统一使用 IconPark 风格 SVG，便于继续扩展自定义组件
const DEFAULT_CUSTOM_WIDGET_TEMPLATE = `{
  "id": "custom-polaroid-note",
  "name": "自定义拍立得便签",
  "iconSvg": "<svg viewBox='0 0 48 48' fill='none' xmlns='http://www.w3.org/2000/svg'><path d='M24 6L27.0902 14.9098L36 18L27.0902 21.0902L24 30L20.9098 21.0902L12 18L20.9098 14.9098L24 6Z' stroke='currentColor' stroke-width='3' stroke-linejoin='round'/><path d='M10 34H38' stroke='currentColor' stroke-width='3' stroke-linecap='round'/><path d='M16 42H32' stroke='currentColor' stroke-width='3' stroke-linecap='round'/></svg>",
  "width": 2,
  "height": 2,
  "css": ".widget-card{height:100%;padding:12px;border-radius:22px;background:linear-gradient(180deg,#fffdf9 0%,#f0e5d8 100%);border:1px solid rgba(74,52,42,.12);box-shadow:0 10px 24px rgba(74,52,42,.12);display:flex;flex-direction:column;justify-content:space-between;color:#4A342A;}.widget-title{font-size:14px;font-weight:700;letter-spacing:.5px;}.widget-photo{height:74px;border-radius:16px;background:linear-gradient(135deg,#d8c1a8,#f5efe6);display:flex;align-items:center;justify-content:center;font-size:28px;}.widget-desc{font-size:11px;line-height:1.5;color:rgba(74,52,42,.72);}",
  "html": "<div class='widget-card'><div class='widget-title'>旅途拍立得</div><div class='widget-photo'>✦</div><div class='widget-desc'>把你的灵感、行程或纪念文字放在这里。</div></div>"
}`;

const DEFAULT_ICON_ADJUSTMENTS = {
  iconSize: 56,
  iconRadius: 18,
  iconShadowStyle: 'none',
  iconShadowSize: 18,
  iconBorderWidth: 0,
  iconBorderColor: '#d7c9b8'
};

const ICON_SHADOW_OPTIONS = [
  { value: 'none', label: '无阴影' },
  { value: 'outer', label: '外投影' },
  { value: 'inner', label: '内阴影' },
  { value: 'long', label: '长阴影' },
  { value: 'multi', label: '多重阴影' },
  { value: 'neumorphism', label: '新拟态' }
];

function getSavedCustomWidgets() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CUSTOM_WIDGET_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function saveCustomWidgets(widgets) {
  localStorage.setItem(CUSTOM_WIDGET_STORAGE_KEY, JSON.stringify(Array.isArray(widgets) ? widgets : []));
}

function getHiddenWidgetIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(HIDDEN_WIDGET_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? [...new Set(parsed.filter(Boolean))] : [];
  } catch (_) {
    return [];
  }
}

function saveHiddenWidgetIds(ids) {
  localStorage.setItem(HIDDEN_WIDGET_STORAGE_KEY, JSON.stringify([...new Set((ids || []).filter(Boolean))]));
}

function saveDraft(code) {
  localStorage.setItem(CUSTOM_WIDGET_DRAFT_KEY, code || '');
}

function getDraft() {
  return localStorage.getItem(CUSTOM_WIDGET_DRAFT_KEY) || DEFAULT_CUSTOM_WIDGET_TEMPLATE;
}

function getDefaultIconAdjustmentState(overrides = {}) {
  return {
    ...DEFAULT_ICON_ADJUSTMENTS,
    ...overrides
  };
}

function normalizeIconImages(iconImages) {
  if (!iconImages || typeof iconImages !== 'object') return {};
  return Object.fromEntries(
    Object.entries(iconImages).filter(([, value]) => String(value || '').trim())
  );
}

function escapeHtml(value) {
  const amp = String.fromCharCode(38);
  return String(value || '')
    .replace(/&/g, `${amp}amp;`)
    .replace(/</g, `${amp}lt;`)
    .replace(/>/g, `${amp}gt;`)
    .replace(/"/g, `${amp}quot;`)
    .replace(/'/g, `${amp}#39;`);
}

function parseCustomWidgetCode(source) {
  const text = String(source || '').trim();
  if (!text) {
    throw new Error('请先输入组件代码');
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (_) {
    throw new Error('组件代码格式无效，请使用页面给出的 JSON 模板');
  }

  const id = String(data.id || '').trim();
  const name = String(data.name || '').trim();
  const html = String(data.html || '').trim();
  const css = String(data.css || '').trim();
  const iconSvg = String(data.iconSvg || '').trim();
  const width = Math.max(1, Math.min(4, Number(data.width) || 2));
  const height = Math.max(1, Math.min(3, Number(data.height) || 2));

  if (!id) throw new Error('组件代码缺少 id');
  if (!name) throw new Error('组件代码缺少 name');
  if (!html) throw new Error('组件代码缺少 html');
  if (!css) throw new Error('组件代码缺少 css');

  return {
    id,
    name,
    html,
    css,
    iconSvg,
    width,
    height,
    source: text
  };
}

function getBaseLibraryWidgets(icons) {
  return [
    {
      id: 'clock',
      name: '时钟',
      source: 'system',
      width: 4,
      height: 1,
      iconSvg: icons.clockWidget,
      description: '当前桌面已有组件，已纳入统一组件库。'
    },
    {
      id: 'avatar',
      name: '头像框',
      source: 'system',
      width: 2,
      height: 2,
      iconSvg: icons.avatarWidget,
      description: '保留原有头像框组件，并支持在编辑模式中重排。'
    },
    {
      id: 'news',
      name: '报纸',
      source: 'system',
      width: 2,
      height: 2,
      iconSvg: icons.newsWidget,
      description: '保留原有报纸组件，并纳入统一组件管理。'
    },
    {
      id: 'ticket1',
      name: '船票',
      source: 'system',
      width: 4,
      height: 2,
      iconSvg: icons.shipTicketWidget,
      description: '保留原有船票组件，可在桌面内移动位置。'
    },
    {
      id: 'ticket2',
      name: '戏票',
      source: 'system',
      width: 4,
      height: 2,
      iconSvg: icons.theatreTicketWidget,
      description: '保留原有戏票组件，可在编辑模式内添加与移除。'
    },
    {
      id: 'music',
      name: '音乐',
      source: 'builtin',
      width: 2,
      height: 2,
      iconSvg: icons.musicWidget,
      description: '新版 2×2 音乐组件，仅保留封面、歌曲名、滑动开关与进度显示区域。'
    },
    {
      id: 'calendar',
      name: '日历',
      source: 'builtin',
      width: 2,
      height: 2,
      iconSvg: icons.calendarWidget,
      description: '仿手机日历小组件，适合放在桌面卡片区域。'
    },
    {
      id: 'polaroid',
      name: '拍立得',
      source: 'builtin',
      width: 2,
      height: 2,
      iconSvg: icons.polaroidWidget,
      description: '仿照片卡片式组件，用于展示纪念图像与注记。'
    },
    {
      id: 'profile',
      name: '个人名片',
      source: 'builtin',
      width: 2,
      height: 2,
      iconSvg: icons.profileWidget,
      description: '展示昵称、身份标签与一句简介的卡片式组件。'
    },
    {
      id: 'todo',
      name: '待办事项',
      source: 'builtin',
      width: 2,
      height: 2,
      iconSvg: icons.todoWidget,
      description: '仿系统待办卡片，可展示当天任务列表。'
    },
    {
      id: 'memo',
      name: '快捷标签',
      source: 'builtin',
      width: 2,
      height: 2,
      iconSvg: icons.memoWidget,
      description: '仿轻量记事卡片，用来显示摘要与关键词。'
    }
  ];
}

function getAllLibraryWidgets(icons, options = {}) {
  const { includeHidden = false } = options;
  const customWidgets = getSavedCustomWidgets().map((widget) => ({
    id: widget.id,
    name: widget.name,
    source: 'custom',
    width: widget.width,
    height: widget.height,
    iconSvg: widget.iconSvg || icons.widgetCustom,
    description: '已加入组件库，可在桌面编辑模式中添加与排列。长按卡片可单独删除，也可使用多选删除。'
  }));

  const allWidgets = [...getBaseLibraryWidgets(icons), ...customWidgets];
  if (includeHidden) return allWidgets;

  const hiddenIds = new Set(getHiddenWidgetIds());
  return allWidgets.filter((widget) => !hiddenIds.has(widget.id));
}

function getLibraryWidgetMap(icons, options = {}) {
  return new Map(getAllLibraryWidgets(icons, options).map((item) => [item.id, item]));
}

function getSourceLabel(source) {
  if (source === 'custom') return '自定义';
  if (source === 'builtin') return '内建';
  return '系统';
}

function renderCustomWidgetPreview(parsed) {
  if (!parsed) {
    return `
      <div class="custom-widget-preview-shell is-empty">
        <div class="custom-widget-preview-empty">打开预览开关后，将在这里显示新组件预览</div>
      </div>
    `;
  }

  return `
    <div class="custom-widget-preview-shell">
      <div class="custom-widget-preview-meta">
        <span>${parsed.name}</span>
        <span>${parsed.width}×${parsed.height}</span>
      </div>
      <div class="custom-widget-preview-canvas widget-renderer widget-renderer--preview">
        <style>${parsed.css}</style>
        ${parsed.html}
      </div>
    </div>
  `;
}

function renderWidgetLibraryItems(icons) {
  const widgets = getAllLibraryWidgets(icons);

  if (!widgets.length) {
    return `<div class="component-library-empty">当前组件库为空，保存自定义组件或恢复默认组件后会显示在这里。</div>`;
  }

  return widgets.map((widget) => `
    <article
      class="component-library-card component-library-card--${widget.source}"
      data-widget-library-id="${widget.id}"
      data-widget-library-source="${widget.source}"
      tabindex="0"
      role="button"
      aria-label="${getSourceLabel(widget.source)}组件：${widget.name}"
    >
      <div class="component-library-card__select-indicator">${icons.checkmark}</div>
      <div class="component-library-card__head">
        <div class="component-library-card__badge">${getSourceLabel(widget.source)}</div>
        <div class="component-library-card__size">${widget.width}×${widget.height}</div>
      </div>
      <div class="component-library-card__title-row">
        <div class="component-library-card__icon">${widget.iconSvg || icons.widgetCustom}</div>
        <div>
          <h4 class="component-library-card__title">${widget.name}</h4>
          <p class="component-library-card__desc">${widget.description}</p>
        </div>
      </div>
    </article>
  `).join('');
}

function renderManagedImageField({
  title,
  inputId,
  fileId,
  previewId,
  removeId,
  value = '',
  hint
}) {
  const hasValue = !!String(value || '').trim();

  return `
    <div class="appearance-resource-card">
      <div class="appearance-resource-card__head">
        <div>
          <h4>${title}</h4>
          <p>${hint || '支持上传本地图片或粘贴 URL 链接。'}</p>
        </div>
      </div>
      <div class="appearance-resource-card__preview ${hasValue ? 'has-image' : ''}" id="${previewId}" style="${hasValue ? `background-image:url('${escapeHtml(value)}');` : ''}">
        ${hasValue ? '' : '<span>暂无图片</span>'}
      </div>
      <div class="appearance-resource-card__actions">
        <label class="ui-button" for="${fileId}">上传本地图片</label>
        <input id="${fileId}" type="file" accept="image/*" style="display:none;" />
        <button class="ui-button" type="button" data-resource-target="${inputId}">使用 URL 链接</button>
        <button class="ui-button danger" type="button" id="${removeId}">删除</button>
      </div>
      <input id="${inputId}" type="url" value="${escapeHtml(value)}" placeholder="https://example.com/image.jpg" />
    </div>
  `;
}

function renderIconQuickTile({ app, value = '' }) {
  const hasValue = !!String(value || '').trim();

  return `
    <button
      class="appearance-icon-grid__item ${hasValue ? 'has-image' : ''}"
      type="button"
      data-icon-editor-trigger="${app.id}"
      aria-label="编辑 ${app.name} 图标"
    >
      <span class="appearance-icon-grid__preview">
        ${hasValue
          ? `<img class="appearance-icon-grid__img" src="${escapeHtml(value)}" alt="${escapeHtml(app.name)}">`
          : `<span class="appearance-icon-grid__glyph">${app.icon || ''}</span>`}
      </span>
      <span class="appearance-icon-grid__label">${escapeHtml(app.name)}</span>
    </button>
  `;
}

function renderShadowStyleOptions(icons, selectedValue) {
  return ICON_SHADOW_OPTIONS.map((option) => `
    <button
      type="button"
      class="appearance-shadow-option ${selectedValue === option.value ? 'is-selected' : ''}"
      data-shadow-style="${option.value}"
      aria-pressed="${selectedValue === option.value ? 'true' : 'false'}"
    >
      <span class="appearance-shadow-option__state">
        ${selectedValue === option.value ? icons.selected : icons.unselected}
      </span>
      <span class="appearance-shadow-option__label">${option.label}</span>
    </button>
  `).join('');
}

function renderSliderField({ id, label, value, min, max, step = 1 }) {
  return `
    <label class="appearance-form-field appearance-form-field--slider">
      <span>${label}</span>
      <div class="appearance-slider-wrap">
        <input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}">
        <strong data-range-value="${id}">${value}</strong>
      </div>
    </label>
  `;
}

export function renderAppearanceSections({ current, icons, apps = [] }) {
  const customDraft = getDraft();
  const appearance = current.appearance || {};
  const iconImages = normalizeIconImages(appearance.iconImages);
  const iconAdjustments = getDefaultIconAdjustmentState(appearance);

  return `
      <!-- 外观设置详情页（改为卡片式分类） -->
      <div id="settings-appearance" class="settings-detail">
        <div class="settings-detail__body">
          <div class="settings-cards-grid">
            <div class="settings-card" data-page="appearance-ui">
              <div class="settings-card__icon">${icons.ui}</div>
              <h3 class="settings-card__title">界面设置</h3>
            </div>
            <div class="settings-card" data-page="appearance-wallpaper">
              <div class="settings-card__icon">${icons.wallpaper}</div>
              <h3 class="settings-card__title">壁纸设置</h3>
            </div>
            <div class="settings-card" data-page="appearance-icon">
              <div class="settings-card__icon">${icons.icon}</div>
              <h3 class="settings-card__title">图标设置</h3>
            </div>
            <div class="settings-card" data-page="appearance-widget">
              <div class="settings-card__icon">${icons.widget}</div>
              <h3 class="settings-card__title">组件设置</h3>
            </div>
          </div>
        </div>
      </div>

      <!-- 界面设置子页面 -->
      <div id="settings-appearance-ui" class="settings-detail">
        <div class="settings-detail__body">
          <!-- [模块标注] 界面设置开关模块：界面设置中的滑动开关统一复用组件库的暖棕色系开关颜色 -->
          <section class="ui-card">
            <h3>顶部状态栏显示</h3>
            <p class="ui-muted" style="margin-bottom: 10px;">控制顶部状态栏是否显示</p>
            <label style="display:flex;align-items:center;justify-content:space-between;font-size:13px;">
              <span>显示顶部状态栏</span>
              <label class="toggle-switch toggle-switch--theme">
                <input id="setting-status-bar" type="checkbox" ${localStorage.getItem('miniphone_status_bar_hidden') === '1' ? '' : 'checked'}>
                <span class="toggle-slider"></span>
              </label>
            </label>
          </section>
          <section class="ui-card">
            <h3>全屏显示</h3>
            <p class="ui-muted" style="margin-bottom: 10px;">去除小手机外框限制，以全屏模式显示</p>
            <label style="display:flex;align-items:center;justify-content:space-between;font-size:13px;">
              <span>启用全屏显示模式</span>
              <label class="toggle-switch toggle-switch--theme">
                <input id="setting-fullscreen" type="checkbox" ${localStorage.getItem('miniphone_fullscreen') === '1' ? 'checked' : ''}>
                <span class="toggle-slider"></span>
              </label>
            </label>
          </section>
          <button class="ui-button primary" id="save-ui-settings" style="width: 100%; margin-top: 10px;">保存界面设置</button>
        </div>
      </div>

      <!-- 壁纸设置子页面 -->
      <div id="settings-appearance-wallpaper" class="settings-detail">
        <div class="settings-detail__body">
          <!-- [模块标注] 壁纸设置模块：桌面壁纸 / 锁屏壁纸分别独立配置、上传、URL 与删除 -->
          <section class="ui-card">
            <h3>壁纸设置</h3>
            <p class="ui-muted" style="margin-bottom: 10px;">桌面壁纸和锁屏壁纸均支持本地上传、URL 链接与删除。全屏模式下状态栏区域也会一并应用对应壁纸。</p>
            <div class="appearance-settings-stack">
              ${renderManagedImageField({
                title: '桌面壁纸',
                inputId: 'setting-desktop-wallpaper',
                fileId: 'setting-desktop-wallpaper-file',
                previewId: 'setting-desktop-wallpaper-preview',
                removeId: 'remove-desktop-wallpaper',
                value: appearance.desktopWallpaper || appearance.wallpaper || '',
                hint: '应用到桌面、状态栏与全屏模式下的主界面背景。'
              })}
              ${renderManagedImageField({
                title: '锁屏壁纸',
                inputId: 'setting-lockscreen-wallpaper',
                fileId: 'setting-lockscreen-wallpaper-file',
                previewId: 'setting-lockscreen-wallpaper-preview',
                removeId: 'remove-lockscreen-wallpaper',
                value: appearance.lockscreenWallpaper || '',
                hint: '预留给锁屏全屏背景；未设置时自动沿用桌面壁纸。'
              })}
            </div>
          </section>
          <button class="ui-button primary" id="save-wallpaper-settings" style="width: 100%; margin-top: 10px;">保存壁纸设置</button>
        </div>
      </div>

      <!-- 图标设置子页面 -->
      <div id="settings-appearance-icon" class="settings-detail">
        <div class="settings-detail__body">
          <!-- [模块标注] 快捷更换图标图片模块：按应用图标网格逐个打开编辑弹窗，便于后续继续维护单图标图片入口 -->
          <section class="ui-card">
            <h3>快捷更换图标图片</h3>
            <p class="ui-muted" style="margin-bottom: 10px;">点击任意图标，即可单独为该应用上传本地图片或填写 URL 链接；不会再用同一张图覆盖所有图标。</p>
            <div class="appearance-icon-grid">
              ${apps.map((app) => renderIconQuickTile({
                app,
                value: iconImages[app.id] || ''
              })).join('')}
            </div>
            <div aria-hidden="true" style="display:none;">
              ${apps.map((app) => `<input id="setting-icon-image-${app.id}" type="hidden" value="${escapeHtml(iconImages[app.id] || '')}">`).join('')}
            </div>
            <!-- [模块标注] 图标图片设置双按钮同排模块：仅控制“保存设置 / 重置所有图标图片”同一行展示，便于后续单独调整 -->
            <div class="appearance-inline-actions appearance-inline-actions--icon-dual">
              <button class="ui-button primary" id="save-custom-icon-settings">${icons.saveWidget}<span>保存设置</span></button>
              <button class="ui-button" id="reset-custom-icon-settings" type="button">${icons.closeSmall}<span>重置所有图标图片</span></button>
            </div>
          </section>

          <!-- [模块标注] 图标美化模块：统一控制图标大小、圆角、阴影与边框，滑杆与阴影选项样式可在此区域独立微调 -->
          <section class="ui-card">
            <h3>图标美化</h3>
            <p class="ui-muted" style="margin-bottom: 10px;">统一调整桌面与 Dock 图标的尺寸、圆角、阴影和边框样式。</p>
            <div class="appearance-form-grid">
              ${renderSliderField({
                id: 'setting-icon-radius',
                label: '圆角大小',
                value: iconAdjustments.iconRadius,
                min: 0,
                max: 32
              })}
              ${renderSliderField({
                id: 'setting-icon-shadow-size',
                label: '阴影强度',
                value: iconAdjustments.iconShadowSize,
                min: 0,
                max: 40
              })}
              ${renderSliderField({
                id: 'setting-icon-size',
                label: '图标大小',
                value: iconAdjustments.iconSize,
                min: 40,
                max: 96
              })}
              ${renderSliderField({
                id: 'setting-icon-border-width',
                label: '边框粗细',
                value: iconAdjustments.iconBorderWidth,
                min: 0,
                max: 8
              })}
              <div class="appearance-form-field">
                <span>阴影样式</span>
                <input id="setting-icon-shadow-style" type="hidden" value="${iconAdjustments.iconShadowStyle}">
                <div class="appearance-shadow-options" role="radiogroup" aria-label="阴影样式">
                  ${renderShadowStyleOptions(icons, iconAdjustments.iconShadowStyle)}
                </div>
              </div>
              <label class="appearance-form-field">
                <span>边框颜色</span>
                <input id="setting-icon-border-color" type="color" value="${iconAdjustments.iconBorderColor}">
              </label>
            </div>
            <!-- [模块标注] 图标美化双按钮同排模块：仅控制“保存图标设置 / 恢复默认”同一行展示，便于后续单独调整 -->
            <div class="appearance-inline-actions appearance-inline-actions--icon-dual">
              <button class="ui-button primary" id="save-icon-settings">${icons.saveWidget}<span>保存图标设置</span></button>
              <button class="ui-button" id="reset-icon-adjustments" type="button">${icons.closeSmall}<span>恢复默认</span></button>
            </div>
          </section>
        </div>
      </div>

      <!-- [模块标注] 组件设置入口页：入口卡片图标统一使用 IconPark 风格 SVG -->
      <div id="settings-appearance-widget" class="settings-detail">
        <div class="settings-detail__body">
          <div class="settings-cards-grid">
            <div class="settings-card" data-page="appearance-widget-library">
              <div class="settings-card__icon">${icons.widgetLibrary}</div>
              <h3 class="settings-card__title">组件库</h3>
            </div>
            <div class="settings-card" data-page="appearance-widget-custom">
              <div class="settings-card__icon">${icons.widgetCustom}</div>
              <h3 class="settings-card__title">自定义</h3>
            </div>
          </div>
        </div>
      </div>

      <!-- [模块标注] 组件库说明页：组件库操作按钮图标统一使用 IconPark 风格 SVG -->
      <div id="settings-appearance-widget-library" class="settings-detail">
        <div class="settings-detail__body">
          <section class="ui-card">
            <h3>组件库</h3>
            <p class="ui-muted" style="margin-bottom: 10px;">以下组件均可在桌面编辑模式的“添加应用与组件”中添加，并支持自由排列组合。当前页面的长按单删与多选删除，已统一覆盖系统组件、内建组件与自定义组件。</p>
          </section>

          <section class="ui-card">
            <div class="component-library-section-head">
              <div>
                <h3>全部组件</h3>
                <p class="ui-muted" style="margin-bottom: 0;">长按任意组件卡片可单独删除；点击“多选删除”后可批量移除。被删除的组件会同步从桌面与编辑模式组件列表中移除。</p>
              </div>
              <div class="component-library-controls">
                <button class="ui-button" type="button" id="custom-widget-select-toggle">${icons.multiSelect}<span>多选删除</span></button>
                <button class="ui-button" type="button" id="custom-widget-select-cancel" style="display:none;">${icons.closeSmall}<span>取消</span></button>
                <button class="ui-button danger" type="button" id="custom-widget-bulk-delete" style="display:none;">${icons.delete}<span>删除已选</span></button>
              </div>
            </div>
            <div id="custom-widget-library-list" class="component-library-grid">
              ${renderWidgetLibraryItems(icons)}
            </div>
          </section>
        </div>
      </div>

      <!-- [模块标注] 自定义页：组件代码编辑器与保存按钮图标统一使用 IconPark 风格 SVG -->
      <div id="settings-appearance-widget-custom" class="settings-detail">
        <div class="settings-detail__body">
          <style>
            #settings-appearance-widget-custom .custom-widget-toggle .toggle-switch .toggle-slider {
              background: rgba(125, 125, 130, 0.38);
              box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08);
            }

            #settings-appearance-widget-custom .custom-widget-toggle .toggle-switch .toggle-slider::before {
              box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
            }

            #settings-appearance-widget-custom .custom-widget-toggle .toggle-switch input:checked + .toggle-slider {
              background: var(--ui-switch-on, #B59375);
            }
          </style>
          <section class="ui-card">
            <h3>自定义组件代码样式</h3>
            <p class="ui-muted" style="margin-bottom: 10px;">支持导入 / 导出本地组件代码文件。请使用 JSON 模板定义组件信息，并在 css 中只编写组件内部样式，避免污染全局样式。已导入的自定义组件在桌面上单击后，也会使用统一弹窗风格进行编辑。</p>
            <div class="custom-widget-spec">
              <div class="custom-widget-spec__item"><strong>id：</strong> 唯一标识，建议使用 <code>custom-</code> 前缀</div>
              <div class="custom-widget-spec__item"><strong>name：</strong> 组件名称，将显示在组件库与桌面编辑面板</div>
              <div class="custom-widget-spec__item"><strong>width / height：</strong> 组件占用网格大小，宽 1-4，高 1-3</div>
              <div class="custom-widget-spec__item"><strong>iconSvg：</strong> 组件库展示图标，建议使用 IconPark 风格 SVG</div>
              <div class="custom-widget-spec__item"><strong>css：</strong> 只写组件内部样式，推荐类名前缀使用 <code>widget-</code></div>
              <div class="custom-widget-spec__item"><strong>html：</strong> 组件内部结构，系统会放入独立预览容器中渲染</div>
            </div>
          </section>

          <section class="ui-card">
            <div class="custom-widget-toolbar">
              <div>
                <h3 style="margin-bottom: 4px;">组件代码编辑器</h3>
                <p class="ui-muted">标题栏右侧提供导入 / 导出按钮，位置位于“自定义”标题与返回桌面的门图标之间。</p>
              </div>
              <label class="custom-widget-toggle">
                <span>预览</span>
                <label class="toggle-switch toggle-switch--theme">
                  <input id="custom-widget-preview-toggle" type="checkbox">
                  <span class="toggle-slider"></span>
                </label>
              </label>
            </div>

            <textarea
              id="custom-widget-code"
              class="custom-widget-code"
              spellcheck="false"
              placeholder="请粘贴自定义组件代码模板"
            >${escapeHtml(customDraft)}</textarea>

            <div id="custom-widget-preview-wrap" class="custom-widget-preview-wrap" style="display:none;">
              ${renderCustomWidgetPreview(null)}
            </div>

            <div class="custom-widget-actions">
              <button class="ui-button primary" id="custom-widget-save">${icons.saveWidget}<span>加入组件库</span></button>
            </div>
          </section>
        </div>
      </div>
  `;
}

function updateManagedImagePreview(container, inputId, previewId) {
  const input = container.querySelector(`#${inputId}`);
  const preview = container.querySelector(`#${previewId}`);
  if (!input || !preview) return;
  const value = String(input.value || '').trim();

  preview.classList.toggle('has-image', !!value);
  preview.style.backgroundImage = value ? `url("${value}")` : '';
  preview.innerHTML = value ? '' : '<span>暂无图片</span>';
}

function bindManagedImageField(container, { inputId, fileId, previewId, removeId }) {
  const input = container.querySelector(`#${inputId}`);
  const fileInput = container.querySelector(`#${fileId}`);
  const removeBtn = container.querySelector(`#${removeId}`);
  const urlBtn = container.querySelector(`[data-resource-target="${inputId}"]`);

  updateManagedImagePreview(container, inputId, previewId);

  input?.addEventListener('input', () => {
    updateManagedImagePreview(container, inputId, previewId);
  });

  fileInput?.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      input.value = String(reader.result || '');
      updateManagedImagePreview(container, inputId, previewId);
      fileInput.value = '';
    };
    reader.readAsDataURL(file);
  });

  urlBtn?.addEventListener('click', () => {
    input?.focus();
  });

  removeBtn?.addEventListener('click', () => {
    if (input) input.value = '';
    if (fileInput) fileInput.value = '';
    updateManagedImagePreview(container, inputId, previewId);
  });
}

function ensureAppearanceConfirmModal(container, icons) {
  let modal = container.querySelector('#appearance-confirm-modal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'appearance-confirm-modal';
  modal.className = 'managed-resource-modal hidden';
  modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = `
    <div class="managed-resource-modal__mask"></div>
    <div class="managed-resource-modal__panel" role="dialog" aria-modal="true" aria-labelledby="appearance-confirm-title">
      <div class="managed-resource-modal__header">
        <span id="appearance-confirm-title">确认操作</span>
        <button type="button" class="managed-resource-modal__close" id="appearance-confirm-cancel" aria-label="关闭确认弹窗">
          ${icons.closeSmall}
        </button>
      </div>
      <div class="managed-resource-modal__body">
        <p class="managed-resource-modal__hint" id="appearance-confirm-message">确认继续此操作？</p>
        <div class="appearance-inline-actions">
          <button type="button" class="ui-button" id="appearance-confirm-secondary">取消</button>
          <button type="button" class="ui-button danger" id="appearance-confirm-primary">确认</button>
        </div>
      </div>
    </div>
  `;
  container.appendChild(modal);
  return modal;
}

function showAppearanceConfirm(container, icons, message, onConfirm) {
  const modal = ensureAppearanceConfirmModal(container, icons);
  const messageEl = modal.querySelector('#appearance-confirm-message');
  const primaryBtn = modal.querySelector('#appearance-confirm-primary');
  const cancelBtn = modal.querySelector('#appearance-confirm-cancel');
  const secondaryBtn = modal.querySelector('#appearance-confirm-secondary');
  const mask = modal.querySelector('.managed-resource-modal__mask');

  const close = () => {
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    primaryBtn?.removeEventListener('click', handleConfirm);
    cancelBtn?.removeEventListener('click', close);
    secondaryBtn?.removeEventListener('click', close);
    mask?.removeEventListener('click', close);
  };

  const handleConfirm = () => {
    close();
    onConfirm?.();
  };

  messageEl.textContent = message || '确认继续此操作？';
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');

  primaryBtn?.addEventListener('click', handleConfirm);
  cancelBtn?.addEventListener('click', close);
  secondaryBtn?.addEventListener('click', close);
  mask?.addEventListener('click', close);
}

function ensureIconResourceModal(container, icons) {
  let modal = container.querySelector('#appearance-icon-resource-modal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'appearance-icon-resource-modal';
  modal.className = 'managed-resource-modal hidden';
  modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = `
    <div class="managed-resource-modal__mask"></div>
    <div class="managed-resource-modal__panel" role="dialog" aria-modal="true" aria-labelledby="appearance-icon-resource-title">
      <div class="managed-resource-modal__header">
        <span id="appearance-icon-resource-title">编辑图标</span>
        <button type="button" class="managed-resource-modal__close" id="appearance-icon-resource-close" aria-label="关闭图标编辑弹窗">
          ${icons.closeSmall}
        </button>
      </div>
      <div class="managed-resource-modal__body">
        <div class="appearance-icon-editor">
          <div class="appearance-icon-editor__hero">
            <div class="appearance-icon-editor__preview" id="appearance-icon-editor-preview"></div>
            <div class="appearance-icon-editor__meta">
              <strong id="appearance-icon-editor-name">应用图标</strong>
              <p id="appearance-icon-editor-hint">支持本地上传图片，也支持填写网络图片链接。</p>
            </div>
          </div>
          <input id="appearance-icon-editor-file" type="file" accept="image/*" style="display:none;" />
          <div class="short-action-row">
            <button class="ui-button" type="button" id="appearance-icon-editor-upload">${icons.uploadLocal}<span>上传本地图片</span></button>
            <button class="ui-button danger" type="button" id="appearance-icon-editor-delete">${icons.delete}<span>删除</span></button>
          </div>
          <!-- [模块标注] 图标编辑弹窗 URL 输入模块：保留唯一 URL 录入入口，后续如需调整输入框视觉只改这一块 -->
          <label class="appearance-form-field appearance-form-field--icon-editor-url">
            <span>URL 链接</span>
            <input id="appearance-icon-editor-url" type="url" placeholder="https://example.com/image.jpg" />
          </label>
          <!-- [模块标注] 图标编辑弹窗主操作模块：仅保留关闭图标与“应用到该图标”，避免与取消按钮重复 -->
          <div class="appearance-inline-actions appearance-inline-actions--icon-editor-submit">
            <button class="ui-button primary" type="button" id="appearance-icon-editor-save">${icons.saveWidget}<span>应用到该图标</span></button>
          </div>
        </div>
      </div>
    </div>
  `;

  container.appendChild(modal);
  return modal;
}

export function bindAppearanceEvents(container, { settings, eventBus, current, icons, apps = [] }) {
  let isSelectionMode = false;
  let selectedWidgetIds = new Set();
  let activeIconEditorAppId = '';

  const appMap = new Map((apps || []).map((app) => [app.id, app]));
  const iconEditorModal = ensureIconResourceModal(container, icons);

  const getWidgetCards = () => Array.from(container.querySelectorAll('[data-widget-library-id]'));

  const emitCustomWidgetsChanged = (widgets) => {
    eventBus?.emit('desktop:custom-widgets-changed', { widgets });
  };

  const emitWidgetLibraryChanged = (removedIds = []) => {
    eventBus?.emit('desktop:widget-library-changed', {
      widgets: getSavedCustomWidgets(),
      hiddenIds: getHiddenWidgetIds(),
      removedIds: Array.isArray(removedIds) ? removedIds : []
    });
  };

  const getIconImageInput = (appId) => container.querySelector(`#setting-icon-image-${appId}`);

  const getIconTileValue = (appId) => String(getIconImageInput(appId)?.value || '').trim();

  const renderIconTileVisual = (app, value) => {
    if (!app) return '';
    return value
      ? `<img class="appearance-icon-grid__img" src="${escapeHtml(value)}" alt="${escapeHtml(app.name)}">`
      : `<span class="appearance-icon-grid__glyph">${app.icon || ''}</span>`;
  };

  const renderIconEditorVisual = (app, value) => {
    if (!app) return '';
    return value
      ? `<img class="appearance-icon-editor__img" src="${escapeHtml(value)}" alt="${escapeHtml(app.name)}">`
      : `<span class="appearance-icon-editor__glyph">${app.icon || ''}</span>`;
  };

  const updateIconTilePreview = (appId) => {
    const app = appMap.get(appId);
    const tile = container.querySelector(`[data-icon-editor-trigger="${appId}"]`);
    const preview = tile?.querySelector('.appearance-icon-grid__preview');
    if (!app || !tile || !preview) return;

    const value = getIconTileValue(appId);
    tile.classList.toggle('has-image', !!value);
    preview.innerHTML = renderIconTileVisual(app, value);
  };

  const updateAllIconTilePreviews = () => {
    apps.forEach((app) => updateIconTilePreview(app.id));
  };

  const syncShadowStyleOptions = () => {
    const hiddenInput = container.querySelector('#setting-icon-shadow-style');
    const value = String(hiddenInput?.value || DEFAULT_ICON_ADJUSTMENTS.iconShadowStyle);

    container.querySelectorAll('[data-shadow-style]').forEach((button) => {
      const selected = button.getAttribute('data-shadow-style') === value;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
      const state = button.querySelector('.appearance-shadow-option__state');
      if (state) {
        state.innerHTML = selected ? icons.selected : icons.unselected;
      }
    });
  };

  const closeIconEditorModal = () => {
    activeIconEditorAppId = '';
    iconEditorModal.classList.add('hidden');
    iconEditorModal.setAttribute('aria-hidden', 'true');
    const fileInput = iconEditorModal.querySelector('#appearance-icon-editor-file');
    if (fileInput) fileInput.value = '';
  };

  const syncIconEditorModal = (appId, nextValue) => {
    const app = appMap.get(appId);
    if (!app) return;

    const preview = iconEditorModal.querySelector('#appearance-icon-editor-preview');
    const nameEl = iconEditorModal.querySelector('#appearance-icon-editor-name');
    const urlInput = iconEditorModal.querySelector('#appearance-icon-editor-url');
    const titleEl = iconEditorModal.querySelector('#appearance-icon-resource-title');

    if (preview) preview.innerHTML = renderIconEditorVisual(app, nextValue);
    if (nameEl) nameEl.textContent = app.name;
    if (titleEl) titleEl.textContent = `编辑 ${app.name} 图标`;
    if (urlInput && urlInput.value !== nextValue) {
      urlInput.value = nextValue;
    }
  };

  const openIconEditorModal = (appId) => {
    const app = appMap.get(appId);
    if (!app) return;

    activeIconEditorAppId = appId;
    const currentValue = getIconTileValue(appId);
    syncIconEditorModal(appId, currentValue);
    iconEditorModal.classList.remove('hidden');
    iconEditorModal.setAttribute('aria-hidden', 'false');
  };

  const updateBulkDeleteButtonState = () => {
    const bulkDeleteBtn = container.querySelector('#custom-widget-bulk-delete');
    if (!bulkDeleteBtn) return;
    const count = selectedWidgetIds.size;
    bulkDeleteBtn.disabled = count === 0;
    bulkDeleteBtn.innerHTML = `${icons.delete}<span>${count > 0 ? `删除已选（${count}）` : '删除已选'}</span>`;
  };

  const renderSelectionState = () => {
    const list = container.querySelector('#custom-widget-library-list');
    const selectToggle = container.querySelector('#custom-widget-select-toggle');
    const cancelBtn = container.querySelector('#custom-widget-select-cancel');
    const bulkDeleteBtn = container.querySelector('#custom-widget-bulk-delete');

    if (list) {
      list.classList.toggle('is-selection-mode', isSelectionMode);
    }

    if (selectToggle) {
      selectToggle.style.display = isSelectionMode ? 'none' : '';
    }
    if (cancelBtn) {
      cancelBtn.style.display = isSelectionMode ? '' : 'none';
    }
    if (bulkDeleteBtn) {
      bulkDeleteBtn.style.display = isSelectionMode ? '' : 'none';
    }

    getWidgetCards().forEach((card) => {
      const widgetId = card.getAttribute('data-widget-library-id');
      const checked = !!widgetId && selectedWidgetIds.has(widgetId);
      card.classList.toggle('is-selectable', isSelectionMode);
      card.classList.toggle('is-selected', checked);
      card.setAttribute('aria-pressed', checked ? 'true' : 'false');
    });

    updateBulkDeleteButtonState();
  };

  const toggleWidgetSelection = (widgetId) => {
    if (!widgetId) return;
    if (selectedWidgetIds.has(widgetId)) {
      selectedWidgetIds.delete(widgetId);
    } else {
      selectedWidgetIds.add(widgetId);
    }
    renderSelectionState();
  };

  const deleteWidgetLibraryItems = (widgetIds) => {
    const ids = Array.from(new Set((widgetIds || []).filter(Boolean)));
    if (!ids.length) return;

    const currentCustomWidgets = getSavedCustomWidgets();
    const customIdSet = new Set(currentCustomWidgets.map((item) => item.id));
    const customIds = ids.filter((id) => customIdSet.has(id));
    const builtinOrSystemIds = ids.filter((id) => !customIdSet.has(id));

    const nextCustomWidgets = currentCustomWidgets.filter((item) => !customIds.includes(item.id));
    saveCustomWidgets(nextCustomWidgets);

    const hiddenIds = new Set(getHiddenWidgetIds());
    builtinOrSystemIds.forEach((id) => hiddenIds.add(id));
    customIds.forEach((id) => hiddenIds.delete(id));
    saveHiddenWidgetIds([...hiddenIds]);

    selectedWidgetIds = new Set([...selectedWidgetIds].filter((id) => !ids.includes(id)));
    updateWidgetLibraryList();
    emitCustomWidgetsChanged(nextCustomWidgets);
    emitWidgetLibraryChanged(ids);
    Logger.info(`已删除 ${ids.length} 个组件`);
  };

  const bindWidgetLibraryInteractions = () => {
    getWidgetCards().forEach((card) => {
      let pressTimer = null;
      let longPressTriggered = false;

      const clearPressTimer = () => {
        if (pressTimer) {
          clearTimeout(pressTimer);
          pressTimer = null;
        }
      };

      const widgetId = card.getAttribute('data-widget-library-id');

      card.addEventListener('click', (event) => {
        event.preventDefault();
        if (!widgetId) return;

        if (isSelectionMode) {
          toggleWidgetSelection(widgetId);
          return;
        }

        if (longPressTriggered) {
          longPressTriggered = false;
        }
      });

      const startPress = () => {
        if (isSelectionMode || !widgetId) return;
        clearPressTimer();
        pressTimer = setTimeout(() => {
          longPressTriggered = true;
          const libraryMap = getLibraryWidgetMap(icons, { includeHidden: true });
          const hit = libraryMap.get(widgetId);
          if (!hit) return;
          showAppearanceConfirm(
            container,
            icons,
            `确定要删除组件“${hit.name}”吗？此操作会把该组件从组件库和桌面中移除。`,
            () => deleteWidgetLibraryItems([widgetId])
          );
        }, 550);
      };

      card.addEventListener('mousedown', startPress);
      card.addEventListener('touchstart', startPress, { passive: true });
      card.addEventListener('mouseup', clearPressTimer);
      card.addEventListener('mouseleave', clearPressTimer);
      card.addEventListener('touchend', clearPressTimer);
      card.addEventListener('touchcancel', clearPressTimer);
      card.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        if (isSelectionMode && widgetId) {
          toggleWidgetSelection(widgetId);
        }
      });
    });
  };

  const updateWidgetLibraryList = () => {
    const list = container.querySelector('#custom-widget-library-list');
    if (!list) return;
    list.innerHTML = renderWidgetLibraryItems(icons);
    bindWidgetLibraryInteractions();
    renderSelectionState();
  };

  const updatePreview = () => {
    const code = container.querySelector('#custom-widget-code')?.value || '';
    const previewToggle = container.querySelector('#custom-widget-preview-toggle');
    const previewWrap = container.querySelector('#custom-widget-preview-wrap');
    if (!previewWrap || !previewToggle) return;

    saveDraft(code);

    if (!previewToggle.checked) {
      previewWrap.style.display = 'none';
      previewWrap.innerHTML = renderCustomWidgetPreview(null);
      return;
    }

    previewWrap.style.display = 'block';

    try {
      const parsed = parseCustomWidgetCode(code);
      previewWrap.innerHTML = renderCustomWidgetPreview(parsed);
    } catch (error) {
      previewWrap.innerHTML = `
        <div class="custom-widget-preview-shell is-empty">
          <div class="custom-widget-preview-empty">${error.message}</div>
        </div>
      `;
    }
  };

  const syncRangeValue = (id) => {
    const input = container.querySelector(`#${id}`);
    const valueEl = container.querySelector(`[data-range-value="${id}"]`);
    if (!input || !valueEl) return;

    const update = () => {
      const min = Number(input.min || 0);
      const max = Number(input.max || 100);
      const value = Number(input.value || min);
      const progress = max <= min ? 0 : ((value - min) / (max - min)) * 100;
      valueEl.textContent = input.value;
      input.style.setProperty('--range-progress', `${progress}%`);
    };

    update();
    input.addEventListener('input', update);
  };

  const collectIconImages = () => {
    const entries = apps.map((app) => [app.id, getIconTileValue(app.id)]);
    return normalizeIconImages(Object.fromEntries(entries));
  };

  const syncIconImagesToLocalStorage = (iconImages) => {
    apps.forEach((app) => {
      const value = String(iconImages[app.id] || '').trim();
      const storageKey = `miniphone_app_icon_${app.id}`;
      if (value) {
        localStorage.setItem(storageKey, value);
      } else {
        localStorage.removeItem(storageKey);
      }
    });
  };

  const onSaveUiSettings = async () => {
    const statusBarChecked = container.querySelector('#setting-status-bar')?.checked;
    const fullscreenChecked = container.querySelector('#setting-fullscreen')?.checked;

    if (statusBarChecked) {
      localStorage.removeItem('miniphone_status_bar_hidden');
      document.body.classList.remove('hide-status-bar');
    } else {
      localStorage.setItem('miniphone_status_bar_hidden', '1');
      document.body.classList.add('hide-status-bar');
    }

    if (fullscreenChecked) {
      localStorage.setItem('miniphone_fullscreen', '1');
      document.body.classList.add('fullscreen-mode');
    } else {
      localStorage.removeItem('miniphone_fullscreen');
      document.body.classList.remove('fullscreen-mode');
    }

    Logger.info('界面设置已保存');
  };

  const onSaveWallpaperSettings = async () => {
    const desktopWallpaper = String(container.querySelector('#setting-desktop-wallpaper')?.value || '').trim();
    const lockscreenWallpaper = String(container.querySelector('#setting-lockscreen-wallpaper')?.value || '').trim();

    // [模块标注] 壁纸兼容存储模块：同步写入静态预览脚本兼容 key，确保全屏与状态栏区域读取到最新桌面 / 锁屏壁纸
    if (desktopWallpaper) {
      localStorage.setItem('miniphone_wallpaper', desktopWallpaper);
    } else {
      localStorage.removeItem('miniphone_wallpaper');
    }

    if (lockscreenWallpaper) {
      localStorage.setItem('miniphone_lockscreen_wallpaper', lockscreenWallpaper);
    } else {
      localStorage.removeItem('miniphone_lockscreen_wallpaper');
    }

    await settings.update({
      appearance: {
        ...(current.appearance || {}),
        wallpaper: desktopWallpaper,
        desktopWallpaper,
        lockscreenWallpaper
      }
    });

    current.appearance = {
      ...(current.appearance || {}),
      wallpaper: desktopWallpaper,
      desktopWallpaper,
      lockscreenWallpaper
    };

    eventBus?.emit('settings:appearance-changed', {
      wallpaper: desktopWallpaper,
      desktopWallpaper,
      lockscreenWallpaper
    });
    Logger.info('壁纸设置已保存');
  };

  const onSaveCustomIconSettings = async () => {
    const iconImages = collectIconImages();
    syncIconImagesToLocalStorage(iconImages);

    await settings.update({
      appearance: {
        ...(current.appearance || {}),
        iconImage: '',
        iconImages
      }
    });

    current.appearance = {
      ...(current.appearance || {}),
      iconImage: '',
      iconImages
    };

    eventBus?.emit('settings:appearance-changed', { iconImage: '', iconImages });
    Logger.info('图标图片设置已保存');
  };

  const onResetCustomIconSettings = async () => {
    apps.forEach((app) => {
      const input = getIconImageInput(app.id);
      if (input) input.value = '';
      localStorage.removeItem(`miniphone_app_icon_${app.id}`);
    });

    updateAllIconTilePreviews();

    await settings.update({
      appearance: {
        ...(current.appearance || {}),
        iconImage: '',
        iconImages: {}
      }
    });

    current.appearance = {
      ...(current.appearance || {}),
      iconImage: '',
      iconImages: {}
    };

    eventBus?.emit('settings:appearance-changed', { iconImage: '', iconImages: {} });
    Logger.info('所有自定义图标图片已恢复默认');
  };

  const onSaveIconSettings = async () => {
    const iconSize = Number(container.querySelector('#setting-icon-size')?.value || DEFAULT_ICON_ADJUSTMENTS.iconSize);
    const iconRadius = Number(container.querySelector('#setting-icon-radius')?.value || DEFAULT_ICON_ADJUSTMENTS.iconRadius);
    const iconShadowStyle = String(container.querySelector('#setting-icon-shadow-style')?.value || DEFAULT_ICON_ADJUSTMENTS.iconShadowStyle);
    const iconShadowSize = Number(container.querySelector('#setting-icon-shadow-size')?.value || DEFAULT_ICON_ADJUSTMENTS.iconShadowSize);
    const iconBorderWidth = Number(container.querySelector('#setting-icon-border-width')?.value || DEFAULT_ICON_ADJUSTMENTS.iconBorderWidth);
    const iconBorderColor = String(container.querySelector('#setting-icon-border-color')?.value || DEFAULT_ICON_ADJUSTMENTS.iconBorderColor);

    await settings.update({
      appearance: {
        ...(current.appearance || {}),
        iconSize,
        iconRadius,
        iconShadowStyle,
        iconShadowSize,
        iconBorderWidth,
        iconBorderColor
      }
    });

    current.appearance = {
      ...(current.appearance || {}),
      iconSize,
      iconRadius,
      iconShadowStyle,
      iconShadowSize,
      iconBorderWidth,
      iconBorderColor
    };

    eventBus?.emit('settings:appearance-changed', {
      iconSize,
      iconRadius,
      iconShadowStyle,
      iconShadowSize,
      iconBorderWidth,
      iconBorderColor
    });
    Logger.info('图标样式设置已保存');
  };

  const onResetIconAdjustments = async () => {
    const defaults = getDefaultIconAdjustmentState();

    const setField = (id, value) => {
      const input = container.querySelector(`#${id}`);
      if (!input) return;
      input.value = value;
      const min = Number(input.min || 0);
      const max = Number(input.max || 100);
      const numericValue = Number(value || min);
      const progress = max <= min ? 0 : ((numericValue - min) / (max - min)) * 100;
      input.style.setProperty('--range-progress', `${progress}%`);
      const valueEl = container.querySelector(`[data-range-value="${id}"]`);
      if (valueEl) valueEl.textContent = String(value);
    };

    setField('setting-icon-size', defaults.iconSize);
    setField('setting-icon-radius', defaults.iconRadius);
    setField('setting-icon-shadow-size', defaults.iconShadowSize);
    setField('setting-icon-border-width', defaults.iconBorderWidth);

    const shadowStyle = container.querySelector('#setting-icon-shadow-style');
    if (shadowStyle) shadowStyle.value = defaults.iconShadowStyle;

    const borderColor = container.querySelector('#setting-icon-border-color');
    if (borderColor) borderColor.value = defaults.iconBorderColor;

    syncShadowStyleOptions();

    await settings.update({
      appearance: {
        ...(current.appearance || {}),
        ...defaults
      }
    });

    current.appearance = {
      ...(current.appearance || {}),
      ...defaults
    };

    eventBus?.emit('settings:appearance-changed', { ...defaults });
    Logger.info('图标美化已恢复默认');
  };

  const onSaveCustomWidget = () => {
    try {
      const code = container.querySelector('#custom-widget-code')?.value || '';
      const parsed = parseCustomWidgetCode(code);
      const saved = getSavedCustomWidgets().filter((item) => item.id !== parsed.id);

      saved.push(parsed);
      saveCustomWidgets(saved);
      saveDraft(code);

      const hiddenIds = new Set(getHiddenWidgetIds());
      hiddenIds.delete(parsed.id);
      saveHiddenWidgetIds([...hiddenIds]);

      updateWidgetLibraryList();
      updatePreview();

      emitCustomWidgetsChanged(saved);
      emitWidgetLibraryChanged([]);
      Logger.info(`自定义组件已加入组件库: ${parsed.name}`);
    } catch (error) {
      Logger.error(error.message);
    }
  };

  bindManagedImageField(container, {
    inputId: 'setting-desktop-wallpaper',
    fileId: 'setting-desktop-wallpaper-file',
    previewId: 'setting-desktop-wallpaper-preview',
    removeId: 'remove-desktop-wallpaper'
  });
  bindManagedImageField(container, {
    inputId: 'setting-lockscreen-wallpaper',
    fileId: 'setting-lockscreen-wallpaper-file',
    previewId: 'setting-lockscreen-wallpaper-preview',
    removeId: 'remove-lockscreen-wallpaper'
  });

  syncRangeValue('setting-icon-size');
  syncRangeValue('setting-icon-radius');
  syncRangeValue('setting-icon-shadow-size');
  syncRangeValue('setting-icon-border-width');
  syncShadowStyleOptions();
  updateAllIconTilePreviews();

  container.querySelectorAll('[data-icon-editor-trigger]').forEach((trigger) => {
    trigger.addEventListener('click', () => {
      const appId = trigger.getAttribute('data-icon-editor-trigger');
      if (appId) openIconEditorModal(appId);
    });
  });

  iconEditorModal.querySelector('#appearance-icon-editor-upload')?.addEventListener('click', () => {
    iconEditorModal.querySelector('#appearance-icon-editor-file')?.click();
  });

  iconEditorModal.querySelector('#appearance-icon-editor-delete')?.addEventListener('click', () => {
    if (!activeIconEditorAppId) return;
    const urlInput = iconEditorModal.querySelector('#appearance-icon-editor-url');
    if (urlInput) urlInput.value = '';
    syncIconEditorModal(activeIconEditorAppId, '');
  });

  iconEditorModal.querySelector('#appearance-icon-editor-file')?.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (!file || !activeIconEditorAppId) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const urlInput = iconEditorModal.querySelector('#appearance-icon-editor-url');
      if (urlInput) urlInput.value = result;
      syncIconEditorModal(activeIconEditorAppId, result);
      event.target.value = '';
    };
    reader.readAsDataURL(file);
  });

  iconEditorModal.querySelector('#appearance-icon-editor-url')?.addEventListener('input', (event) => {
    if (!activeIconEditorAppId) return;
    syncIconEditorModal(activeIconEditorAppId, String(event.target.value || '').trim());
  });

  iconEditorModal.querySelector('#appearance-icon-editor-save')?.addEventListener('click', () => {
    if (!activeIconEditorAppId) return;
    const input = getIconImageInput(activeIconEditorAppId);
    const urlInput = iconEditorModal.querySelector('#appearance-icon-editor-url');
    const nextValue = String(urlInput?.value || '').trim();
    if (input) input.value = nextValue;
    updateIconTilePreview(activeIconEditorAppId);
    closeIconEditorModal();
  });

  iconEditorModal.querySelector('#appearance-icon-resource-close')?.addEventListener('click', closeIconEditorModal);
  iconEditorModal.querySelector('.managed-resource-modal__mask')?.addEventListener('click', closeIconEditorModal);

  container.querySelectorAll('[data-shadow-style]').forEach((button) => {
    button.addEventListener('click', () => {
      const hiddenInput = container.querySelector('#setting-icon-shadow-style');
      if (!hiddenInput) return;
      hiddenInput.value = button.getAttribute('data-shadow-style') || DEFAULT_ICON_ADJUSTMENTS.iconShadowStyle;
      syncShadowStyleOptions();
    });
  });

  container.querySelector('#save-ui-settings')?.addEventListener('click', onSaveUiSettings);
  container.querySelector('#save-wallpaper-settings')?.addEventListener('click', onSaveWallpaperSettings);
  container.querySelector('#save-custom-icon-settings')?.addEventListener('click', onSaveCustomIconSettings);
  container.querySelector('#reset-custom-icon-settings')?.addEventListener('click', onResetCustomIconSettings);
  container.querySelector('#save-icon-settings')?.addEventListener('click', onSaveIconSettings);
  container.querySelector('#reset-icon-adjustments')?.addEventListener('click', onResetIconAdjustments);
  container.querySelector('#custom-widget-save')?.addEventListener('click', onSaveCustomWidget);
  container.querySelector('#custom-widget-preview-toggle')?.addEventListener('change', updatePreview);
  container.querySelector('#custom-widget-code')?.addEventListener('input', (event) => {
    saveDraft(event.target.value);
    const previewToggle = container.querySelector('#custom-widget-preview-toggle');
    if (previewToggle?.checked) {
      updatePreview();
    }
  });

  container.querySelector('#custom-widget-select-toggle')?.addEventListener('click', () => {
    isSelectionMode = true;
    selectedWidgetIds.clear();
    renderSelectionState();
  });

  container.querySelector('#custom-widget-select-cancel')?.addEventListener('click', () => {
    isSelectionMode = false;
    selectedWidgetIds.clear();
    renderSelectionState();
  });

  container.querySelector('#custom-widget-bulk-delete')?.addEventListener('click', () => {
    const ids = [...selectedWidgetIds];
    if (!ids.length) return;
    showAppearanceConfirm(container, icons, `确定要删除已选中的 ${ids.length} 个组件吗？`, () => {
      deleteWidgetLibraryItems(ids);
      isSelectionMode = false;
      selectedWidgetIds.clear();
      renderSelectionState();
    });
  });

  updateWidgetLibraryList();
}

export function getAppearanceCustomWidgetState() {
  return {
    storageKey: CUSTOM_WIDGET_STORAGE_KEY,
    draftKey: CUSTOM_WIDGET_DRAFT_KEY,
    hiddenKey: HIDDEN_WIDGET_STORAGE_KEY,
    defaultTemplate: DEFAULT_CUSTOM_WIDGET_TEMPLATE,
    getSavedCustomWidgets,
    saveCustomWidgets,
    getHiddenWidgetIds,
    saveHiddenWidgetIds,
    parseCustomWidgetCode
  };
}
