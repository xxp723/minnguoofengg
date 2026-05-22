/**
 * 文件名: js/apps/trace/trace-ui.js
 * 用途: 轨迹应用 UI 层。提供基础骨架，遵循现有系统 UI 风格。
 */

// IconPark SVG: plus
const PLUS_ICON = `<svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M24 12V36" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 24H36" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export function buildTraceShell() {
  return `
    <div class="trace-shell">
      <header class="trace-header">
        <h2 class="trace-header__title">轨迹</h2>
        <div class="trace-header__actions">
          <button class="ui-button primary" id="trace-add-btn" type="button" aria-label="新增轨迹">
            ${PLUS_ICON}
            <span>新增</span>
          </button>
        </div>
      </header>
      <main class="trace-body" id="trace-body">
        <!-- 动态渲染轨迹列表/网格 -->
      </main>
    </div>
  `;
}

export function renderTraceGrid(container, state) {
  const body = container.querySelector('#trace-body');
  if (!body) return;

  if (!state.traces || state.traces.length === 0) {
    body.innerHTML = `
      <div class="trace-empty">
        <p>暂无轨迹信息</p>
        <p style="font-size: 12px; margin-top: 8px;">点击右上角“新增”按钮添加轨迹，随时记录行程与规划。</p>
      </div>
    `;
    return;
  }

  // 后续可以在这里填充轨迹列表的具体 HTML
  body.innerHTML = `
    <div class="trace-empty">
      <p>轨迹列表正在建设中...</p>
    </div>
  `;
}

export function bindTraceEvents(container, state, context) {
  const addBtn = container.querySelector('#trace-add-btn');

  addBtn?.addEventListener('click', () => {
    // 后续可以引入统一弹窗组件或进入编辑页面，这里先占位
    console.log('[Trace] 点击新增轨迹');
  });
}
