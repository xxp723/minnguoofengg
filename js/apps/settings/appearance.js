import { Logger } from '../../utils/Logger.js';

const CUSTOM_WIDGET_STORAGE_KEY = 'miniphone_custom_widgets';
const CUSTOM_WIDGET_DRAFT_KEY = 'miniphone_custom_widget_draft';

const DEFAULT_CUSTOM_WIDGET_TEMPLATE = `{
  "id": "custom-polaroid-note",
  "name": "自定义拍立得便签",
  "iconSvg": "<svg viewBox='0 0 48 48' fill='none' xmlns='http://www.w3.org/2000/svg'><path d='M10 8H38V40H10V8Z' stroke='currentColor' stroke-width='3' stroke-linejoin='round'/><path d='M16 14H32V26H16V14Z' stroke='currentColor' stroke-width='3' stroke-linejoin='round'/><path d='M16 32H28' stroke='currentColor' stroke-width='3' stroke-linecap='round'/></svg>",
  "width": 2,
  "height": 2,
  "css": ".widget-card{height:100%;padding:12px;border-radius:22px;background:linear-gradient(180deg,#fffdf9 0%,#f0e5d8 100%);border:1px solid rgba(74,52,42,.12);box-shadow:0 10px 24px rgba(74,52,42,.12);display:flex;flex-direction:column;justify-content:space-between;color:#4A342A;}.widget-title{font-size:14px;font-weight:700;letter-spacing:.5px;}.widget-photo{height:74px;border-radius:16px;background:linear-gradient(135deg,#d8c1a8,#f5efe6);display:flex;align-items:center;justify-content:center;font-size:28px;}.widget-desc{font-size:11px;line-height:1.5;color:rgba(74,52,42,.72);}",
  "html": "<div class='widget-card'><div class='widget-title'>旅途拍立得</div><div class='widget-photo'>✦</div><div class='widget-desc'>把你的灵感、行程或纪念文字放在这里。</div></div>"
}`;

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

function saveDraft(code) {
  localStorage.setItem(CUSTOM_WIDGET_DRAFT_KEY, code || '');
}

function getDraft() {
  return localStorage.getItem(CUSTOM_WIDGET_DRAFT_KEY) || DEFAULT_CUSTOM_WIDGET_TEMPLATE;
}

function escapeHtml(value) {
  const amp = String.fromCharCode(38);
  return String(value || '')
    .replace(/&/g, `${amp}amp;`)
    .replace(/</g, `${amp}lt;`)
    .replace(/>/g, `${amp}gt;`);
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

function renderCustomWidgetLibraryItems(icons) {
  const widgets = getSavedCustomWidgets();

  if (!widgets.length) {
    return `<div class="component-library-empty">当前还没有导入过自定义组件，保存后会同步出现在组件库与桌面编辑模式。</div>`;
  }

  return widgets.map((widget) => `
    <article
      class="component-library-card component-library-card--custom"
      data-custom-widget-id="${widget.id}"
      tabindex="0"
      role="button"
      aria-label="自定义组件：${widget.name}"
    >
      <div class="component-library-card__select-indicator">${icons.checkmark}</div>
      <div class="component-library-card__head">
        <div class="component-library-card__badge">自定义</div>
        <div class="component-library-card__size">${widget.width}×${widget.height}</div>
      </div>
      <div class="component-library-card__title-row">
        <div class="component-library-card__icon">${widget.iconSvg || icons.widgetCustom}</div>
        <div>
          <h4 class="component-library-card__title">${widget.name}</h4>
          <p class="component-library-card__desc">已加入组件库，可在桌面编辑模式中添加与排列。长按卡片可单独删除，也可使用多选删除。</p>
        </div>
      </div>
    </article>
  `).join('');
}

export function renderAppearanceSections({ current, icons }) {
  const customDraft = getDraft();

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
          <section class="ui-card">
            <h3>顶部状态栏显示</h3>
            <p class="ui-muted" style="margin-bottom: 10px;">控制顶部状态栏是否显示</p>
            <label style="display:flex;align-items:center;justify-content:space-between;font-size:13px;">
              <span>显示顶部状态栏</span>
              <label class="toggle-switch">
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
              <label class="toggle-switch">
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
          <section class="ui-card">
            <h3>壁纸设置</h3>
            <p class="ui-muted" style="margin-bottom: 10px;">自定义桌面壁纸（功能开发中）</p>
            <div style="text-align:center;color:#B2967D;padding:30px 0;font-size:13px;">暂未开放，敬请期待</div>
          </section>
        </div>
      </div>

      <!-- 图标设置子页面 -->
      <div id="settings-appearance-icon" class="settings-detail">
        <div class="settings-detail__body">
          <section class="ui-card">
            <h3>图标大小</h3>
            <p class="ui-muted" style="margin-bottom: 10px;">调整桌面图标尺寸</p>
            <label style="display:flex;align-items:center;gap:10px;font-size:13px;">
              <span style="min-width:70px;">图标大小:</span>
              <input id="setting-icon-size" type="number" min="40" max="96" value="${current.appearance?.iconSize || 56}" style="flex:1;">
            </label>
          </section>
          <button class="ui-button primary" id="save-icon-settings" style="width: 100%; margin-top: 10px;">保存图标设置</button>
        </div>
      </div>

      <!-- [模块标注] 组件设置入口页 -->
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

      <!-- [模块标注] 组件库说明页 -->
      <div id="settings-appearance-widget-library" class="settings-detail">
        <div class="settings-detail__body">
          <section class="ui-card">
            <h3>组件库</h3>
            <p class="ui-muted" style="margin-bottom: 10px;">以下组件均可在桌面编辑模式的“添加应用与组件”中添加，并支持自由排列组合。所有新增操作图标均统一使用 IconPark 风格图案。</p>
            <div class="component-library-grid">
              <article class="component-library-card">
                <div class="component-library-card__head">
                  <div class="component-library-card__badge">系统</div>
                  <div class="component-library-card__size">4×1</div>
                </div>
                <div class="component-library-card__title-row">
                  <div class="component-library-card__icon">${icons.clockWidget}</div>
                  <div>
                    <h4 class="component-library-card__title">时钟</h4>
                    <p class="component-library-card__desc">当前桌面已有组件，已纳入统一组件库。</p>
                  </div>
                </div>
              </article>
              <article class="component-library-card">
                <div class="component-library-card__head">
                  <div class="component-library-card__badge">系统</div>
                  <div class="component-library-card__size">2×2</div>
                </div>
                <div class="component-library-card__title-row">
                  <div class="component-library-card__icon">${icons.avatarWidget}</div>
                  <div>
                    <h4 class="component-library-card__title">头像框</h4>
                    <p class="component-library-card__desc">保留原有头像框组件，并支持在编辑模式中重排。</p>
                  </div>
                </div>
              </article>
              <article class="component-library-card">
                <div class="component-library-card__head">
                  <div class="component-library-card__badge">系统</div>
                  <div class="component-library-card__size">2×2</div>
                </div>
                <div class="component-library-card__title-row">
                  <div class="component-library-card__icon">${icons.newsWidget}</div>
                  <div>
                    <h4 class="component-library-card__title">报纸</h4>
                    <p class="component-library-card__desc">保留原有报纸组件，并纳入统一组件管理。</p>
                  </div>
                </div>
              </article>
              <article class="component-library-card">
                <div class="component-library-card__head">
                  <div class="component-library-card__badge">系统</div>
                  <div class="component-library-card__size">4×2</div>
                </div>
                <div class="component-library-card__title-row">
                  <div class="component-library-card__icon">${icons.shipTicketWidget}</div>
                  <div>
                    <h4 class="component-library-card__title">船票</h4>
                    <p class="component-library-card__desc">保留原有船票组件，可在桌面内移动位置。</p>
                  </div>
                </div>
              </article>
              <article class="component-library-card">
                <div class="component-library-card__head">
                  <div class="component-library-card__badge">系统</div>
                  <div class="component-library-card__size">4×2</div>
                </div>
                <div class="component-library-card__title-row">
                  <div class="component-library-card__icon">${icons.theatreTicketWidget}</div>
                  <div>
                    <h4 class="component-library-card__title">戏票</h4>
                    <p class="component-library-card__desc">保留原有戏票组件，可在编辑模式内添加与移除。</p>
                  </div>
                </div>
              </article>
              <article class="component-library-card">
                <div class="component-library-card__head">
                  <div class="component-library-card__badge">系统</div>
                  <div class="component-library-card__size">4×2</div>
                </div>
                <div class="component-library-card__title-row">
                  <div class="component-library-card__icon">${icons.musicWidget}</div>
                  <div>
                    <h4 class="component-library-card__title">音乐</h4>
                    <p class="component-library-card__desc">仿手机播放器卡片，包含封面、进度与播放状态。</p>
                  </div>
                </div>
              </article>
              <article class="component-library-card">
                <div class="component-library-card__head">
                  <div class="component-library-card__badge">系统</div>
                  <div class="component-library-card__size">2×2</div>
                </div>
                <div class="component-library-card__title-row">
                  <div class="component-library-card__icon">${icons.calendarWidget}</div>
                  <div>
                    <h4 class="component-library-card__title">日历</h4>
                    <p class="component-library-card__desc">仿手机日历小组件，适合放在桌面卡片区域。</p>
                  </div>
                </div>
              </article>
              <article class="component-library-card">
                <div class="component-library-card__head">
                  <div class="component-library-card__badge">系统</div>
                  <div class="component-library-card__size">2×2</div>
                </div>
                <div class="component-library-card__title-row">
                  <div class="component-library-card__icon">${icons.polaroidWidget}</div>
                  <div>
                    <h4 class="component-library-card__title">拍立得</h4>
                    <p class="component-library-card__desc">仿照片卡片式组件，用于展示纪念图像与注记。</p>
                  </div>
                </div>
              </article>
              <article class="component-library-card">
                <div class="component-library-card__head">
                  <div class="component-library-card__badge">系统</div>
                  <div class="component-library-card__size">2×2</div>
                </div>
                <div class="component-library-card__title-row">
                  <div class="component-library-card__icon">${icons.profileWidget}</div>
                  <div>
                    <h4 class="component-library-card__title">个人名片</h4>
                    <p class="component-library-card__desc">展示昵称、身份标签与一句简介的卡片式组件。</p>
                  </div>
                </div>
              </article>
              <article class="component-library-card">
                <div class="component-library-card__head">
                  <div class="component-library-card__badge">系统</div>
                  <div class="component-library-card__size">2×2</div>
                </div>
                <div class="component-library-card__title-row">
                  <div class="component-library-card__icon">${icons.todoWidget}</div>
                  <div>
                    <h4 class="component-library-card__title">待办事项</h4>
                    <p class="component-library-card__desc">仿系统待办卡片，可展示当天任务列表。</p>
                  </div>
                </div>
              </article>
              <article class="component-library-card">
                <div class="component-library-card__head">
                  <div class="component-library-card__badge">系统</div>
                  <div class="component-library-card__size">2×2</div>
                </div>
                <div class="component-library-card__title-row">
                  <div class="component-library-card__icon">${icons.memoWidget}</div>
                  <div>
                    <h4 class="component-library-card__title">快捷标签</h4>
                    <p class="component-library-card__desc">仿轻量记事卡片，用来显示摘要与关键词。</p>
                  </div>
                </div>
              </article>
            </div>
          </section>

          <section class="ui-card">
            <div class="component-library-section-head">
              <div>
                <h3>已导入的自定义组件</h3>
                <p class="ui-muted" style="margin-bottom: 0;">这里会展示你从“自定义”保存进组件库的项目，它们同样会出现在桌面编辑模式中。长按可单独删除，也可多选后批量删除。</p>
              </div>
              <div class="component-library-controls">
                <button class="ui-button" type="button" id="custom-widget-select-toggle">${icons.multiSelect}<span>多选删除</span></button>
                <button class="ui-button" type="button" id="custom-widget-select-cancel" style="display:none;">${icons.closeSmall}<span>取消</span></button>
                <button class="ui-button danger" type="button" id="custom-widget-bulk-delete" style="display:none;">${icons.delete}<span>删除已选</span></button>
              </div>
            </div>
            <div id="custom-widget-library-list" class="component-library-grid">
              ${renderCustomWidgetLibraryItems(icons)}
            </div>
          </section>
        </div>
      </div>

      <!-- [模块标注] 自定义页 -->
      <div id="settings-appearance-widget-custom" class="settings-detail">
        <div class="settings-detail__body">
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
                <p class="ui-muted">标题栏右侧提供导入 / 导出按钮，位置位于返回键左侧。</p>
              </div>
              <label class="custom-widget-toggle">
                <span>预览</span>
                <label class="toggle-switch">
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

export function bindAppearanceEvents(container, { settings, eventBus, current, icons }) {
  let isSelectionMode = false;
  let selectedWidgetIds = new Set();

  const getCustomWidgetCards = () => Array.from(container.querySelectorAll('[data-custom-widget-id]'));

  const emitCustomWidgetsChanged = (widgets) => {
    eventBus?.emit('desktop:custom-widgets-changed', { widgets });
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

    getCustomWidgetCards().forEach((card) => {
      const widgetId = card.getAttribute('data-custom-widget-id');
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

  const deleteCustomWidgets = (widgetIds) => {
    const ids = Array.from(new Set((widgetIds || []).filter(Boolean)));
    if (!ids.length) return;

    const saved = getSavedCustomWidgets();
    const next = saved.filter((item) => !ids.includes(item.id));
    saveCustomWidgets(next);
    selectedWidgetIds = new Set([...selectedWidgetIds].filter((id) => !ids.includes(id)));
    updateCustomWidgetLibraryList();
    emitCustomWidgetsChanged(next);
    Logger.info(`已删除 ${ids.length} 个自定义组件`);
  };

  const bindCustomWidgetLibraryInteractions = () => {
    getCustomWidgetCards().forEach((card) => {
      let pressTimer = null;
      let longPressTriggered = false;

      const clearPressTimer = () => {
        if (pressTimer) {
          clearTimeout(pressTimer);
          pressTimer = null;
        }
      };

      const widgetId = card.getAttribute('data-custom-widget-id');

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
          const currentWidgets = getSavedCustomWidgets();
          const hit = currentWidgets.find((item) => item.id === widgetId);
          if (!hit) return;
          const confirmed = window.confirm(`确定要删除组件“${hit.name}”吗？此操作只删除该自定义组件。`);
          if (confirmed) {
            deleteCustomWidgets([widgetId]);
          }
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

  const updateCustomWidgetLibraryList = () => {
    const list = container.querySelector('#custom-widget-library-list');
    if (!list) return;
    list.innerHTML = renderCustomWidgetLibraryItems(icons);
    bindCustomWidgetLibraryInteractions();
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

  const onSaveIconSettings = async () => {
    const iconSize = Number(container.querySelector('#setting-icon-size')?.value || 56);

    await settings.update({
      appearance: {
        ...(current.appearance || {}),
        iconSize
      }
    });

    eventBus?.emit('settings:appearance-changed', { iconSize });
    Logger.info('图标设置已保存');
  };

  const onSaveCustomWidget = () => {
    try {
      const code = container.querySelector('#custom-widget-code')?.value || '';
      const parsed = parseCustomWidgetCode(code);
      const saved = getSavedCustomWidgets().filter((item) => item.id !== parsed.id);

      saved.push(parsed);
      saveCustomWidgets(saved);
      saveDraft(code);
      updateCustomWidgetLibraryList();
      updatePreview();

      emitCustomWidgetsChanged(saved);
      Logger.info(`自定义组件已加入组件库: ${parsed.name}`);
    } catch (error) {
      Logger.error(error.message);
    }
  };

  container.querySelector('#save-ui-settings')?.addEventListener('click', onSaveUiSettings);
  container.querySelector('#save-icon-settings')?.addEventListener('click', onSaveIconSettings);
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
    const confirmed = window.confirm(`确定要删除已选中的 ${ids.length} 个自定义组件吗？`);
    if (!confirmed) return;
    deleteCustomWidgets(ids);
    isSelectionMode = false;
    selectedWidgetIds.clear();
    renderSelectionState();
  });

  updateCustomWidgetLibraryList();
}

export function getAppearanceCustomWidgetState() {
  return {
    storageKey: CUSTOM_WIDGET_STORAGE_KEY,
    draftKey: CUSTOM_WIDGET_DRAFT_KEY,
    defaultTemplate: DEFAULT_CUSTOM_WIDGET_TEMPLATE,
    getSavedCustomWidgets,
    saveCustomWidgets,
    parseCustomWidgetCode
  };
}
