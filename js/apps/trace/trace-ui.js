/**
 * 文件名: js/apps/trace/trace-ui.js
 * 用途: 轨迹应用 UI 层。提供基础骨架，连接日程、资产、位置三个模块。
 */
import { renderSchedule, bindScheduleEvents } from './trace-schedule.js';
import { renderAssets, bindAssetsEvents } from './trace-assets.js';
import { renderLocation, bindLocationEvents } from './trace-location.js';

/* ==========================================================================
   [区域标注·本次需求·底部 Tab 栏 IconPark 图标]
   ========================================================================== */
const ICONS = {
  schedule: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M14 4V12M34 4V12" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 12C8 10.8954 8.89543 10 10 10H38C39.1046 10 40 10.8954 40 12V42C40 43.1046 39.1046 44 38 44H10C8.89543 44 8 43.1046 8 42V12Z" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 22H40" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  assets: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M39 16V40C39 41.1046 38.1046 42 37 42H11C9.89543 42 9 41.1046 9 40V8C9 6.89543 9.89543 6 11 6H32" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M17 18H31" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M17 26H31" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M17 34H31" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M40 8H31V16H40V8Z" fill="currentColor" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>`,
  location: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M24 44C24 44 40 32 40 19C40 10.1634 32.8366 3 24 3C15.1634 3 8 10.1634 8 19C8 32 24 44 24 44Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><circle cx="24" cy="19" r="6" fill="currentColor" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>`
};

/* ==========================================================================
   [区域标注·本次需求·应用主骨架]
   ========================================================================== */
export function buildTraceShell() {
  return `
    <div class="trace-shell">
      <header class="trace-header">
        <div class="trace-header-spacer"></div>
        <div class="trace-header__title-wrap">
          <h1 class="trace-title" id="trace-title-btn" data-action="go-home">Schedule</h1>
        </div>
        <div class="trace-header-spacer"></div>
      </header>
      
      <main class="trace-body" id="trace-body">
        <!-- 动态渲染当前选中的模块 -->
      </main>

      <nav class="trace-tabbar">
        <button class="trace-tab-item is-active" data-tab="schedule">
          <span class="trace-tab-icon">${ICONS.schedule}</span>
          <span class="trace-tab-text">日程</span>
        </button>
        <button class="trace-tab-item" data-tab="assets">
          <span class="trace-tab-icon">${ICONS.assets}</span>
          <span class="trace-tab-text">资产</span>
        </button>
        <button class="trace-tab-item" data-tab="location">
          <span class="trace-tab-icon">${ICONS.location}</span>
          <span class="trace-tab-text">位置</span>
        </button>
      </nav>
    </div>
  `;
}

/* ==========================================================================
   [区域标注·本次需求·模块调度与事件绑定]
   ========================================================================== */
export function renderTraceGrid(container, state) {
  // 首次渲染默认展示日程模块
  switchTab(container, state, 'schedule', null);
}

export function bindTraceEvents(container, state, context) {
  const titleBtn = container.querySelector('#trace-title-btn');
  const tabs = container.querySelectorAll('.trace-tab-item');

  // 点击标题栏返回桌面
  if (titleBtn) {
    titleBtn.addEventListener('click', () => {
      context.eventBus?.emit('app:close', { appId: context.appId });
    });
  }

  // 底部 Tab 切换
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.dataset.tab;
      // 移除所有 active
      tabs.forEach(t => t.classList.remove('is-active'));
      // 为当前选中项添加 active
      tab.classList.add('is-active');
      
      switchTab(container, state, targetTab, context);
    });
  });
}

function switchTab(container, state, tabName, context) {
  const body = container.querySelector('#trace-body');
  const title = container.querySelector('#trace-title-btn');
  if (!body) return;

  // 标题映射
  const titleMap = {
    schedule: 'Schedule',
    assets: 'Assets',
    location: 'Location'
  };
  
  if (title) {
    title.textContent = titleMap[tabName] || 'Trace';
  }

  // 根据 tab 渲染对应模块
  if (tabName === 'schedule') {
    renderSchedule(body, state);
    if (context) bindScheduleEvents(body, state, context);
  } else if (tabName === 'assets') {
    renderAssets(body, state);
    if (context) bindAssetsEvents(body, state, context);
  } else if (tabName === 'location') {
    renderLocation(body, state);
    if (context) bindLocationEvents(body, state, context);
  }
}
