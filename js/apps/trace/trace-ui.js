/**
 * 文件名: js/apps/trace/trace-ui.js
 * 用途: 轨迹应用 UI 层。提供基础骨架，连接日程、资产、位置三个模块。
 */
import { loadTraceData, getContactsByMask } from './trace-store.js';
import { renderSchedule, bindScheduleEvents } from './trace-schedule.js';
import { renderAssets, bindAssetsEvents } from './trace-assets.js';
import { renderLocation, bindLocationEvents } from './trace-location.js';

/* ==========================================================================
   [区域标注·本次需求·IconPark 图标]
   ========================================================================== */
const ICONS = {
  schedule: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M14 4V12M34 4V12" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 12C8 10.8954 8.89543 10 10 10H38C39.1046 10 40 10.8954 40 12V42C40 43.1046 39.1046 44 38 44H10C8.89543 44 8 43.1046 8 42V12Z" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 22H40" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  assets: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M39 16V40C39 41.1046 38.1046 42 37 42H11C9.89543 42 9 41.1046 9 40V8C9 6.89543 9.89543 6 11 6H32" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M17 18H31" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M17 26H31" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M17 34H31" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M40 8H31V16H40V8Z" fill="currentColor" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>`,
  location: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M24 44C24 44 40 32 40 19C40 10.1634 32.8366 3 24 3C15.1634 3 8 10.1634 8 19C8 32 24 44 24 44Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><circle cx="24" cy="19" r="6" fill="currentColor" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>`,
  more: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M24 12C26.2091 12 28 10.2091 28 8C28 5.79086 26.2091 4 24 4C21.7909 4 20 5.79086 20 8C20 10.2091 21.7909 12 24 12Z" fill="currentColor"/><path d="M24 28C26.2091 28 28 26.2091 28 24C28 21.7909 26.2091 20 24 20C21.7909 20 20 21.7909 20 24C20 26.2091 21.7909 28 24 28Z" fill="currentColor"/><path d="M24 44C26.2091 44 28 42.2091 28 40C28 37.7909 26.2091 36 24 36C21.7909 36 20 37.7909 20 40C20 42.2091 21.7909 44 24 44Z" fill="currentColor"/></svg>`,
  pen: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M40 8C40 8 36 14 36 20C36 26 29 34 23 38C17 42 10 44 10 44C10 44 13 41 15 37C17 33 18 29 18 29C18 29 23 30 27 28C31 26 36 20 40 14C44 8 40 8 40 8Z" fill="currentColor" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M27 28L15 37" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`
};

/* ==========================================================================
   [区域标注·本次需求·应用主骨架与面具/联系人切换]
   ========================================================================== */
export function buildTraceShell(state) {
  // 生成横向联系人头像栏
  let contactsHtml = '';
  if (state.contacts && state.contacts.length > 0) {
    contactsHtml = state.contacts.map(c => {
      const isActive = String(c.id) === String(state.activeContactId) ? 'is-active' : '';
      const avatarSrc = c.avatar || '';
      const avatarContent = avatarSrc ? `<img src="${escapeHtml(avatarSrc)}" alt="avatar">` : `<span>${escapeHtml((c.name || 'U').charAt(0))}</span>`;
      return `
        <div class="trace-contact-item ${isActive}" data-contact-id="${escapeHtml(c.id)}">
          <div class="trace-contact-avatar">
            ${avatarContent}
          </div>
          <div class="trace-contact-name">${escapeHtml(c.name || '未命名')}</div>
        </div>
      `;
    }).join('');
  } else {
    contactsHtml = `<div class="trace-contact-empty">当前面具暂无联系人</div>`;
  }

  // 生成面具切换列表
  const maskListHtml = (state.masks || []).map(m => {
    const isActive = String(m.id) === String(state.activeMaskId) ? 'is-active' : '';
    return `
      <div class="trace-mask-item ${isActive}" data-mask-id="${escapeHtml(m.id)}">
        <div class="trace-mask-name">${escapeHtml(m.name || '未命名面具')}</div>
      </div>
    `;
  }).join('');

  return `
    <div class="trace-shell">
      <header class="trace-header">
        <div class="trace-header-spacer trace-header-left">
          <button class="trace-icon-btn trace-generate-btn" id="trace-schedule-generate-btn" aria-label="生成日程">
            ${ICONS.pen}
          </button>
        </div>
        <div class="trace-header__title-wrap">
          <h1 class="trace-title" id="trace-title-btn" data-action="go-home">Schedule</h1>
        </div>
        <div class="trace-header-spacer trace-header-right">
          <button class="trace-icon-btn trace-more-btn" id="trace-mask-switch-btn" aria-label="切换面具身份">
            ${ICONS.more}
          </button>
        </div>
      </header>

      <!-- 联系人横向滚动栏 -->
      <div class="trace-contacts-bar" id="trace-contacts-bar">
        ${contactsHtml}
      </div>
      
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

      <!-- 面具切换弹窗 -->
      <div class="trace-modal-mask is-hidden" id="trace-mask-modal">
        <div class="trace-modal-panel trace-mask-panel">
          <div class="trace-modal-title">切换用户面具身份</div>
          <div class="trace-mask-list" id="trace-mask-list">
            ${maskListHtml || '<div style="text-align:center;color:#999;padding:20px;">无可用面具身份</div>'}
          </div>
          <div class="trace-modal-actions">
            <button class="trace-btn trace-btn-cancel" id="trace-mask-cancel">关闭</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&': return '&' + '#38;';
      case '<': return '&' + '#60;';
      case '>': return '&' + '#62;';
      case '"': return '&' + '#34;';
      case "'": return '&' + '#39;';
      default: return char;
    }
  });
}

/* ==========================================================================
   [区域标注·本次需求·模块调度与事件绑定]
   ========================================================================== */
export function renderTraceGrid(container, state, context) {
  // 首次渲染默认展示日程模块
  switchTab(container, state, 'schedule', context);
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
      state.currentTab = tab.dataset.tab;
      // 移除所有 active
      tabs.forEach(t => t.classList.remove('is-active'));
      // 为当前选中项添加 active
      tab.classList.add('is-active');
      
      switchTab(container, state, state.currentTab, context);
    });
  });

  // 联系人点击切换
  const contactsBar = container.querySelector('#trace-contacts-bar');
  if (contactsBar) {
    contactsBar.addEventListener('click', async (e) => {
      const item = e.target.closest('.trace-contact-item');
      if (!item) return;

      const contactId = item.dataset.contactId;
      if (contactId === state.activeContactId) return;

      // 更新选中状态
      contactsBar.querySelectorAll('.trace-contact-item').forEach(el => el.classList.remove('is-active'));
      item.classList.add('is-active');

      state.activeContactId = contactId;
      // 加载新联系人的数据
      const newData = await loadTraceData(context.db, state.activeMaskId, state.activeContactId);
      Object.assign(state, newData);
      
      // 刷新当前 Tab 视图
      switchTab(container, state, state.currentTab || 'schedule', context);
    });
  }

  // 面具切换弹窗逻辑
  const maskBtn = container.querySelector('#trace-mask-switch-btn');
  const maskModal = container.querySelector('#trace-mask-modal');
  const maskCancel = container.querySelector('#trace-mask-cancel');
  const maskList = container.querySelector('#trace-mask-list');

  maskBtn?.addEventListener('click', () => maskModal?.classList.remove('is-hidden'));
  maskCancel?.addEventListener('click', () => maskModal?.classList.add('is-hidden'));
  maskModal?.addEventListener('click', (e) => {
    if (e.target === maskModal) maskModal.classList.add('is-hidden');
  });

  maskList?.addEventListener('click', async (e) => {
    const item = e.target.closest('.trace-mask-item');
    if (!item) return;

    const maskId = item.dataset.maskId;
    if (maskId === state.activeMaskId) {
      maskModal?.classList.add('is-hidden');
      return;
    }

    // 更新面具激活状态 UI
    maskList.querySelectorAll('.trace-mask-item').forEach(el => el.classList.remove('is-active'));
    item.classList.add('is-active');

    state.activeMaskId = maskId;
    // 加载该面具下的联系人
    state.contacts = await getContactsByMask(context.db, maskId);
    state.activeContactId = state.contacts.length > 0 ? String(state.contacts[0].id) : null;
    
    // 重新拉取新联系人的数据
    const newData = await loadTraceData(context.db, state.activeMaskId, state.activeContactId);
    Object.assign(state, newData);

    maskModal?.classList.add('is-hidden');

    // 完全重新渲染骨架
    container.innerHTML = buildTraceShell(state);
    switchTab(container, state, state.currentTab || 'schedule', context);
    bindTraceEvents(container, state, context);
  });
}

function switchTab(container, state, tabName, context) {
  const body = container.querySelector('#trace-body');
  const title = container.querySelector('#trace-title-btn');
  // 此时 container 是最外层的 trace-shell，可以直接查找
  const generateBtn = container.querySelector('#trace-schedule-generate-btn');
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

  // 只有在日程页面才显示羽毛笔生成按钮
  if (generateBtn) {
    generateBtn.style.display = tabName === 'schedule' ? 'flex' : 'none';
  }

  // 根据 tab 渲染对应模块
  if (tabName === 'schedule') {
    renderSchedule(body, state);
    // 把最外层 container 传进去绑定事件，否则无法绑定顶部羽毛笔按钮
    if (context) bindScheduleEvents(container, body, state, context);
  } else if (tabName === 'assets') {
    renderAssets(body, state);
    if (context) bindAssetsEvents(body, state, context);
  } else if (tabName === 'location') {
    renderLocation(body, state);
    if (context) bindLocationEvents(body, state, context);
  }
}
