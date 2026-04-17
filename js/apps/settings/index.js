/**
 * 文件名: js/apps/settings/index.js
 * 用途: 设置应用（卡片式分类界面）
 *- 首页：4个圆角卡片式分类选项（仿iPhone扁平化）
 *       - 详情页：外观设置、API设置、数据设置、日志
 * 位置: /js/apps/settings/index.js
 * 架构层: 应用层（由AppManager 动态加载）
 */
import {
  renderAppearanceSections,
  bindAppearanceEvents,
  getAppearanceCustomWidgetState
} from './appearance.js';
import { renderApiSection, bindApiEvents } from './api.js';
import { renderDataSection, bindDataEvents } from './data.js';
import { renderLogsSection, bindLogsEvents } from './logs.js';

const {
  defaultTemplate,
  getSavedCustomWidgets
} = getAppearanceCustomWidgetState();

// IconPark SVG 图标定义
const ICONS = {
  appearance: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="22" height="22"><path d="M24 44C35.0457 44 44 35.0457 44 24C44 12.9543 35.0457 4 24 4C12.9543 4 4 12.9543 4 24C4 35.0457 12.9543 44 24 44Z" fill="none" stroke="#333" stroke-width="3" stroke-linejoin="round"/><path d="M24 4V24L39.5 37" stroke="#333" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M24 4C24 4 36.2 8.4 39.5 37" fill="none" stroke="#333" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="14" cy="14" r="3" fill="#F97066"/><circle cx="10" cy="26" r="3" fill="#47B881"/><circle cx="16" cy="36" r="3" fill="#6C6EC7"/><circle cx="30" cy="16" r="3" fill="#FFCB47"/></svg>`,
  api: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="22" height="22"><path d="M40 12L24 4L8 12V36L24 44L40 36V12Z" fill="none" stroke="#333" stroke-width="3" stroke-linejoin="round"/><path d="M24 44V24" stroke="#333" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M40 12L24 24" stroke="#333" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 12L24 24" stroke="#333" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M24 4V14" stroke="#333" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  data: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="22" height="22"><path d="M42 6H6V20H42V6Z" fill="none" stroke="#333" stroke-width="3" stroke-linejoin="round"/><path d="M42 28H6V42H42V28Z" fill="none" stroke="#333" stroke-width="3" stroke-linejoin="round"/><circle cx="13" cy="13" r="2" fill="#333"/><circle cx="13" cy="35" r="2" fill="#333"/><path d="M21 13H35" stroke="#333" stroke-width="3" stroke-linecap="round"/><path d="M21 35H35" stroke="#333" stroke-width="3" stroke-linecap="round"/><path d="M24 20V28" stroke="#333" stroke-width="3" stroke-linecap="round"/></svg>`,
  logs: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="22" height="22"><rect x="8" y="4" width="32" height="40" rx="2" fill="none" stroke="#333" stroke-width="3" stroke-linejoin="round"/><path d="M16 16H32" stroke="#333" stroke-width="3" stroke-linecap="round"/><path d="M16 24H32" stroke="#333" stroke-width="3" stroke-linecap="round"/><path d="M16 32H24" stroke="#333" stroke-width="3" stroke-linecap="round"/></svg>`,
  ui: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="22" height="22"><rect x="6" y="6" width="36" height="36" rx="3" fill="none" stroke="#333" stroke-width="3" stroke-linejoin="round"/><path d="M6 18H42" stroke="#333" stroke-width="3" stroke-linecap="round"/><path d="M18 18V42" stroke="#333" stroke-width="3" stroke-linecap="round"/><circle cx="12" cy="12" r="2" fill="#F97066"/><circle cx="19" cy="12" r="2" fill="#FFCB47"/><circle cx="26" cy="12" r="2" fill="#47B881"/></svg>`,
  wallpaper: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="22" height="22"><rect x="6" y="6" width="36" height="36" rx="3" fill="none" stroke="#333" stroke-width="3" stroke-linejoin="round"/><path d="M6 34L16 24L24 32L32 22L42 34" stroke="#333" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="17" cy="17" r="4" fill="none" stroke="#333" stroke-width="3"/></svg>`,
  icon: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="22" height="22"><rect x="6" y="6" width="14" height="14" rx="4" fill="none" stroke="#333" stroke-width="3" stroke-linejoin="round"/><rect x="28" y="6" width="14" height="14" rx="4" fill="none" stroke="#333" stroke-width="3" stroke-linejoin="round"/><rect x="6" y="28" width="14" height="14" rx="4" fill="none" stroke="#333" stroke-width="3" stroke-linejoin="round"/><rect x="28" y="28" width="14" height="14" rx="4" fill="none" stroke="#333" stroke-width="3" stroke-linejoin="round"/></svg>`,
  widget: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="22" height="22"><rect x="6" y="8" width="36" height="30" rx="6" stroke="#333" stroke-width="3" stroke-linejoin="round"/><path d="M6 20H42" stroke="#333" stroke-width="3" stroke-linecap="round"/><path d="M18 20V38" stroke="#333" stroke-width="3" stroke-linecap="round"/><circle cx="14" cy="14" r="2" fill="#FFCB47"/><circle cx="22" cy="14" r="2" fill="#47B881"/></svg>`,
  widgetLibrary: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="22" height="22"><rect x="6" y="6" width="16" height="16" rx="4" stroke="#333" stroke-width="3"/><rect x="26" y="6" width="16" height="10" rx="4" stroke="#333" stroke-width="3"/><rect x="26" y="20" width="16" height="22" rx="4" stroke="#333" stroke-width="3"/><rect x="6" y="26" width="16" height="16" rx="4" stroke="#333" stroke-width="3"/></svg>`,
  widgetCustom: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="22" height="22"><path d="M24 6L27.0902 14.9098L36 18L27.0902 21.0902L24 30L20.9098 21.0902L12 18L20.9098 14.9098L24 6Z" stroke="#333" stroke-width="3" stroke-linejoin="round"/><path d="M10 34H38" stroke="#333" stroke-width="3" stroke-linecap="round"/><path d="M16 42H32" stroke="#333" stroke-width="3" stroke-linecap="round"/></svg>`,
  import: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="18" height="18"><path d="M24 6V30" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 16L24 6L34 16" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 38H38" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M14 30V38H34V30" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>`,
  export: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="18" height="18"><path d="M24 30V6" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 20L24 30L34 20" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 38H38" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M14 30V38H34V30" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>`,
  previewToggle: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="18" height="18"><path d="M4 24C8 16 15 12 24 12C33 12 40 16 44 24C40 32 33 36 24 36C15 36 8 32 4 24Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><circle cx="24" cy="24" r="6" stroke="currentColor" stroke-width="3"/></svg>`,
  saveWidget: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="18" height="18"><path d="M10 8H34L40 14V40H10V8Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M16 8V18H30V8" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M16 30H32" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M16 24H24" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`,
  multiSelect: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="18" height="18"><rect x="6" y="8" width="12" height="12" rx="2" stroke="currentColor" stroke-width="3"/><path d="M12 14L14.5 16.5L18 12" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><rect x="6" y="28" width="12" height="12" rx="2" stroke="currentColor" stroke-width="3"/><rect x="28" y="8" width="14" height="14" rx="2" stroke="currentColor" stroke-width="3"/><rect x="28" y="28" width="14" height="14" rx="2" stroke="currentColor" stroke-width="3"/></svg>`,
  delete: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="18" height="18"><path d="M9 10H39" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M20 20V33" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M28 20V33" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M14 10L16 39H32L34 10" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M19 10V6H29V10" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>`,
  closeSmall: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="18" height="18"><path d="M14 14L34 34" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M34 14L14 34" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`,
  checkmark: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="16" height="16"><path d="M10 25L20 34L38 14" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  clockWidget: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="20" height="20"><circle cx="24" cy="24" r="16" stroke="#333" stroke-width="3"/><path d="M24 15V24L30 28" stroke="#333" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  avatarWidget: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect x="10" y="6" width="28" height="36" rx="6" stroke="#333" stroke-width="3"/><circle cx="24" cy="18" r="6" stroke="#333" stroke-width="3"/><path d="M16 34C18 29.5 21 28 24 28C27 28 30 29.5 32 34" stroke="#333" stroke-width="3" stroke-linecap="round"/></svg>`,
  newsWidget: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="20" height="20"><path d="M10 10H34V38H14C11.7909 38 10 36.2091 10 34V10Z" stroke="#333" stroke-width="3" stroke-linejoin="round"/><path d="M34 14H38V34C38 36.2091 36.2091 38 34 38" stroke="#333" stroke-width="3" stroke-linejoin="round"/><path d="M16 18H28" stroke="#333" stroke-width="3" stroke-linecap="round"/><path d="M16 24H28" stroke="#333" stroke-width="3" stroke-linecap="round"/><path d="M16 30H24" stroke="#333" stroke-width="3" stroke-linecap="round"/></svg>`,
  shipTicketWidget: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="20" height="20"><path d="M6 18H42V34H6V18Z" stroke="#333" stroke-width="3" stroke-linejoin="round"/><path d="M12 12H36" stroke="#333" stroke-width="3" stroke-linecap="round"/><path d="M14 26H20" stroke="#333" stroke-width="3" stroke-linecap="round"/><path d="M28 26H34" stroke="#333" stroke-width="3" stroke-linecap="round"/></svg>`,
  theatreTicketWidget: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="20" height="20"><path d="M10 12H38V36H10V12Z" stroke="#333" stroke-width="3" stroke-linejoin="round"/><path d="M18 12V36" stroke="#333" stroke-width="3"/><path d="M24 20H30" stroke="#333" stroke-width="3" stroke-linecap="round"/><path d="M24 28H30" stroke="#333" stroke-width="3" stroke-linecap="round"/></svg>`,
  musicWidget: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="20" height="20"><path d="M32 8V28" stroke="#333" stroke-width="3" stroke-linecap="round"/><path d="M18 12L32 8V18L18 22V12Z" stroke="#333" stroke-width="3" stroke-linejoin="round"/><circle cx="16" cy="30" r="5" stroke="#333" stroke-width="3"/><circle cx="32" cy="34" r="5" stroke="#333" stroke-width="3"/></svg>`,
  calendarWidget: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect x="8" y="10" width="32" height="30" rx="4" stroke="#333" stroke-width="3"/><path d="M8 18H40" stroke="#333" stroke-width="3"/><path d="M16 6V14" stroke="#333" stroke-width="3" stroke-linecap="round"/><path d="M32 6V14" stroke="#333" stroke-width="3" stroke-linecap="round"/><path d="M18 26H24" stroke="#333" stroke-width="3" stroke-linecap="round"/></svg>`,
  polaroidWidget: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="20" height="20"><path d="M10 8H38V40H10V8Z" stroke="#333" stroke-width="3" stroke-linejoin="round"/><path d="M16 14H32V26H16V14Z" stroke="#333" stroke-width="3"/><path d="M16 32H28" stroke="#333" stroke-width="3" stroke-linecap="round"/></svg>`,
  profileWidget: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect x="8" y="10" width="32" height="28" rx="6" stroke="#333" stroke-width="3"/><circle cx="18" cy="20" r="4" stroke="#333" stroke-width="3"/><path d="M14 30C15.5 27 18 26 20 26C22 26 24.5 27 26 30" stroke="#333" stroke-width="3" stroke-linecap="round"/><path d="M29 18H34" stroke="#333" stroke-width="3" stroke-linecap="round"/><path d="M29 26H34" stroke="#333" stroke-width="3" stroke-linecap="round"/></svg>`,
  todoWidget: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect x="10" y="8" width="28" height="32" rx="4" stroke="#333" stroke-width="3"/><path d="M17 8V14" stroke="#333" stroke-width="3" stroke-linecap="round"/><path d="M31 8V14" stroke="#333" stroke-width="3" stroke-linecap="round"/><path d="M16 22L19 25L24 19" stroke="#333" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M28 22H33" stroke="#333" stroke-width="3" stroke-linecap="round"/></svg>`,
  memoWidget: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="20" height="20"><path d="M12 8H36V40H12V8Z" stroke="#333" stroke-width="3" stroke-linejoin="round"/><path d="M18 18H30" stroke="#333" stroke-width="3" stroke-linecap="round"/><path d="M18 24H30" stroke="#333" stroke-width="3" stroke-linecap="round"/><path d="M18 30H26" stroke="#333" stroke-width="3" stroke-linecap="round"/></svg>`
};

export async function mount(container, context) {
  const { settings, eventBus, windowManager, appId } = context;
  const current = await settings.getAll();
  const importInputId = `settings-custom-widget-import-${appId}`;

  // 当前页面状态
  let currentPage = 'home';

  const getCustomCodeEl = () => container.querySelector('#custom-widget-code');

  const syncCustomWidgetLibrary = () => {
    const list = container.querySelector('#custom-widget-library-list');
    if (!list) return;

    const widgets = getSavedCustomWidgets();
    if (!widgets.length) {
      list.innerHTML = `<div class="component-library-empty">当前还没有导入过自定义组件，保存后会同步出现在组件库与桌面编辑模式。</div>`;
      return;
    }

    list.innerHTML = widgets.map((widget) => `
      <article class="component-library-card component-library-card--custom">
        <div class="component-library-card__head">
          <div class="component-library-card__badge">自定义</div>
          <div class="component-library-card__size">${widget.width}×${widget.height}</div>
        </div>
        <div class="component-library-card__title-row">
          <div class="component-library-card__icon">${widget.iconSvg || '✦'}</div>
          <div>
            <h4 class="component-library-card__title">${widget.name}</h4>
            <p class="component-library-card__desc">已加入组件库，可在桌面编辑模式中添加与排列。</p>
          </div>
        </div>
      </article>
    `).join('');
  };

  const triggerPreviewRefresh = () => {
    const codeEl = getCustomCodeEl();
    const previewToggle = container.querySelector('#custom-widget-preview-toggle');
    if (!codeEl) return;

    if (previewToggle?.checked) {
      codeEl.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };

  const ensureImportInput = () => {
    let input = container.querySelector(`#${importInputId}`);
    if (input) return input;

    input = document.createElement('input');
    input.type = 'file';
    input.id = importInputId;
    input.accept = '.json,.txt,.css';
    input.style.display = 'none';

    input.addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const text = await file.text();
      const codeEl = getCustomCodeEl();
      if (codeEl) {
        codeEl.value = text || defaultTemplate;
      }
      triggerPreviewRefresh();
      input.value = '';
    });

    container.appendChild(input);
    return input;
  };

  const exportCustomWidgetCode = () => {
    const code = getCustomCodeEl()?.value || defaultTemplate;
    const blob = new Blob([code], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'miniphone-custom-widget.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  const updateHeaderActions = (page) => {
    if (!windowManager?.setHeaderActions) return;

    if (page === 'appearance-widget-custom') {
      const win = windowManager.windows?.get?.(appId);
      win?.classList.add('app-window--widget-custom');
      windowManager.setHeaderActions(appId, [
        {
          label: '导入本地组件代码文件',
          className: 'is-import',
          icon: ICONS.import,
          onClick: () => ensureImportInput().click()
        },
        {
          label: '导出到本地组件代码文件',
          className: 'is-export',
          icon: ICONS.export,
          onClick: exportCustomWidgetCode
        }
      ]);
      return;
    }

    const win = windowManager.windows?.get?.(appId);
    win?.classList.remove('app-window--widget-custom');
    windowManager.setHeaderActions(appId, []);
  };

  // 创建主容器
  container.innerHTML = `
    <div class="settings-app-container" style="height: 100%; display: flex; flex-direction: column;">
      <!-- 首页 -->
      <div id="settings-home" class="settings-home">
        <div class="settings-cards-grid">
          <div class="settings-card" data-page="appearance">
            <div class="settings-card__icon">${ICONS.appearance}</div>
            <h3 class="settings-card__title">外观设置</h3>
          </div>
          <div class="settings-card" data-page="api">
            <div class="settings-card__icon">${ICONS.api}</div>
            <h3 class="settings-card__title">API设置</h3>
          </div>
          <div class="settings-card" data-page="data">
            <div class="settings-card__icon">${ICONS.data}</div>
            <h3 class="settings-card__title">数据设置</h3>
          </div>
          <div class="settings-card" data-page="logs">
            <div class="settings-card__icon">${ICONS.logs}</div>
            <h3 class="settings-card__title">日志</h3>
          </div>
        </div>
      </div>

      ${renderAppearanceSections({ current, icons: ICONS })}
      ${renderApiSection({ current })}
      ${renderDataSection()}
      ${renderLogsSection()}
    </div>
  `;

  ensureImportInput();

  // 页面导航函数
  const navigateTo = (page) => {
    const pages = {
      home: '设置',
      appearance: '外观设置',
      'appearance-ui': '界面设置',
      'appearance-wallpaper': '壁纸设置',
      'appearance-icon': '图标设置',
      'appearance-widget': '组件设置',
      'appearance-widget-library': '组件库',
      'appearance-widget-custom': '自定义',
      api: 'API设置',
      data: '数据设置',
      logs: '日志'
    };

    // 确定返回目标
    const backTargets = {
      appearance: 'home',
      'appearance-ui': 'appearance',
      'appearance-wallpaper': 'appearance',
      'appearance-icon': 'appearance',
      'appearance-widget': 'appearance',
      'appearance-widget-library': 'appearance-widget',
      'appearance-widget-custom': 'appearance-widget',
      api: 'home',
      data: 'home',
      logs: 'home'
    };

    Object.keys(pages).forEach((p) => {
      const el = container.querySelector(`#settings-${p}`);
      if (el) {
        if (p === page) {
          el.classList.add('is-active');
          el.style.display = p === 'home' ? 'block' : 'flex';
        } else {
          el.classList.remove('is-active');
          el.style.display = 'none';
        }
      }
    });

    if (windowManager) {
      windowManager.setTitle(appId, pages[page]);
      windowManager.setBackAction(appId, page === 'home' ? null : () => navigateTo(backTargets[page]));
    }

    updateHeaderActions(page);
    currentPage = page;
  };

  // 卡片点击事件（首页 + 外观设置子页面）
  container.querySelectorAll('.settings-card').forEach((card) => {
    card.addEventListener('click', () => {
      const page = card.dataset.page;
      navigateTo(page);
    });
  });

  // [模块标注] 自定义组件同步模块：保存后刷新组件库展示
  eventBus?.on?.('desktop:custom-widgets-changed', () => {
    syncCustomWidgetLibrary();
  });

  // 绑定拆分后的模块事件
  bindAppearanceEvents(container, { settings, eventBus, current, icons: ICONS });
  bindApiEvents(container, { settings });
  bindDataEvents(container, { settings });
  bindLogsEvents(container);

  // 初始化显示首页
  navigateTo('home');

  return {
    destroy() {
      windowManager?.setHeaderActions?.(appId, []);
    }
  };
}

export async function unmount(instance) {
  if (instance && typeof instance.destroy === 'function') {
    instance.destroy();
  }
}
