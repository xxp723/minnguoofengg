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
  pen: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M31.1341 7.23414L40.7658 16.8659M31.1341 7.23414C33.6496 4.7186 37.728 4.7186 40.2435 7.23414L40.7658 7.75647C43.2814 10.272 43.2814 14.3504 40.7658 16.8659M31.1341 7.23414L10.3341 28.0341C9.64573 28.7225 9.2088 29.6106 9.09117 30.5756L8.03534 39.243C7.88607 40.4678 8.94857 41.4883 10.1852 41.2721L18.8475 39.7554C19.821 39.585 20.7208 39.1172 21.4194 38.4185L40.7658 16.8659" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  menu: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M7.94971 11.9497H39.9497" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M7.94971 23.9497H39.9497" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M7.94971 35.9497H39.9497" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`
};

/* ==========================================================================
   [区域标注·本次需求·应用主骨架与面具/联系人切换]
   ========================================================================== */
export function buildTraceShell(state) {
  // 当前联系人头像（仅显示一个，点击后下拉列表）
  let activeContactHtml = '';
  let contactsDropdownHtml = '';
  
  if (state.contacts && state.contacts.length > 0) {
    const activeContact = state.contacts.find(c => String(c.id) === String(state.activeContactId)) || state.contacts[0];
    if (activeContact) {
      const avatarSrc = activeContact.avatar || '';
      const avatarContent = avatarSrc ? `<img src="${escapeHtml(avatarSrc)}" alt="avatar">` : `<span>${escapeHtml((activeContact.name || 'U').charAt(0))}</span>`;
      activeContactHtml = `
        <div class="trace-active-contact-avatar" id="trace-contact-switch-btn">
          ${avatarContent}
        </div>
      `;
    }
    
    contactsDropdownHtml = `<div class="trace-dropdown-grid">` + state.contacts.map(c => {
      const isActive = String(c.id) === String(state.activeContactId) ? 'is-active' : '';
      const avatarSrc = c.avatar || '';
      const avatarContent = avatarSrc ? `<img src="${escapeHtml(avatarSrc)}" alt="avatar">` : `<span>${escapeHtml((c.name || 'U').charAt(0))}</span>`;
      return `
        <div class="trace-dropdown-grid-item ${isActive}" data-contact-id="${escapeHtml(c.id)}">
          <div class="trace-dropdown-avatar">${avatarContent}</div>
          <div class="trace-dropdown-name">${escapeHtml(c.name || '未命名')}</div>
        </div>
      `;
    }).join('') + `</div>`;
  } else {
    contactsDropdownHtml = `<div class="trace-dropdown-empty">当前面具暂无联系人</div>`;
  }

  // 生成面具切换下拉列表（带头像/首字母）
  let maskListHtml = '';
  if (state.masks && state.masks.length > 0) {
    maskListHtml = `<div class="trace-dropdown-grid">` + state.masks.map(m => {
      const isActive = String(m.id) === String(state.activeMaskId) ? 'is-active' : '';
      const avatarContent = m.avatar ? `<img src="${escapeHtml(m.avatar)}" alt="avatar">` : `<span>${escapeHtml((m.name || 'M').charAt(0))}</span>`;
      return `
        <div class="trace-dropdown-grid-item ${isActive}" data-mask-id="${escapeHtml(m.id)}">
          <div class="trace-dropdown-avatar">${avatarContent}</div>
          <div class="trace-dropdown-name">${escapeHtml(m.name || '未命名面具')}</div>
        </div>
      `;
    }).join('') + `</div>`;
  }

  // 渲染横向日历条
  const renderWeekBar = () => {
    // 默认选择今天，或者 state.selectedDate
    const targetDateStr = state.selectedDate || new Date().toISOString().split('T')[0];
    const targetDate = new Date(targetDateStr);
    
    // 找到这一周的周日
    const currentDayOfWeek = targetDate.getDay();
    const sunday = new Date(targetDate);
    sunday.setDate(targetDate.getDate() - currentDayOfWeek);
    
    const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    let html = '<div class="trace-week-bar">';
    
    for (let i = 0; i < 7; i++) {
      const d = new Date(sunday);
      d.setDate(sunday.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      const isSelected = dateStr === targetDateStr ? 'is-selected' : '';
      const dayName = days[i];
      const dateNum = d.getDate();
      
      html += `
        <div class="trace-week-day ${isSelected}" data-date="${dateStr}">
          <div class="trace-week-day-name">${dayName}</div>
          <div class="trace-week-day-num">${dateNum}</div>
        </div>
      `;
    }
    html += '</div>';
    return html;
  };

  return `
    <div class="trace-shell">
      <header class="trace-header">
        <div class="trace-header-left">
          <button class="trace-icon-btn" id="trace-date-select-btn" aria-label="选择日期">
            ${ICONS.menu}
          </button>
          <button class="trace-icon-btn trace-generate-btn" id="trace-schedule-generate-btn" aria-label="生成日程">
            ${ICONS.pen}
          </button>
        </div>
        <div class="trace-header-center">
          <h1 class="trace-title" id="trace-title-btn" data-action="go-home">Schedule</h1>
        </div>
        <div class="trace-header-right">
          ${activeContactHtml}
          <button class="trace-icon-btn trace-more-btn" id="trace-mask-switch-btn" aria-label="切换面具身份">
            ${ICONS.more}
          </button>
        </div>
      </header>

      <!-- 周视图日历条 (仅在 schedule 时显示) -->
      <div class="trace-week-container" id="trace-week-container" style="display: none;">
        ${renderWeekBar()}
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

      <!-- 全局下拉折叠菜单遮罩与面板 -->
      <div class="trace-dropdown-mask is-hidden" id="trace-dropdown-mask">
        <div class="trace-dropdown-panel" id="trace-dropdown-panel">
          <div class="trace-dropdown-header">
            <span id="trace-dropdown-title">请选择</span>
            <button class="trace-dropdown-close" id="trace-dropdown-close">&times;</button>
          </div>
          <div class="trace-dropdown-content" id="trace-dropdown-content"></div>
          <div class="trace-dropdown-footer" id="trace-dropdown-footer" style="display:none;">
            <button class="trace-btn trace-btn-confirm" id="trace-dropdown-confirm">确认</button>
          </div>
        </div>
      </div>

      <!-- 保存各种折叠菜单的模板内容，方便动态切换 -->
      <template id="tpl-mask-list">${maskListHtml || '<div class="trace-dropdown-empty">无可用面具身份</div>'}</template>
      <template id="tpl-contact-list">${contactsDropdownHtml}</template>
      <template id="tpl-date-picker">
        <div style="padding: 16px;">
          <input type="date" id="trace-date-picker-input" class="trace-input" value="${state.selectedDate || new Date().toISOString().split('T')[0]}" />
        </div>
      </template>
      <template id="tpl-map-list">
        <div style="padding: 0 16px 16px;">
          <div class="trace-modal-label">为 AI 生成日程提供地点约束</div>
          <div id="trace-map-list-container" class="trace-dropdown-list" style="max-height: 200px; overflow-y: auto;">
            <div style="text-align:center;color:#999;font-size:12px;padding:10px;">加载中...</div>
          </div>
          <div class="trace-modal-hint" id="trace-map-select-hint"></div>
        </div>
      </template>
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

  // 周视图日期点击切换
  const weekBar = container.querySelector('.trace-week-bar');
  if (weekBar) {
    weekBar.addEventListener('click', (e) => {
      const item = e.target.closest('.trace-week-day');
      if (!item) return;
      const dateStr = item.dataset.date;
      if (dateStr === state.selectedDate) return;
      
      state.selectedDate = dateStr;
      // 重新渲染当前 Tab（会触发重新加载对应日期的日程数据，虽然我们当前 state 是一起加载的，但逻辑需要对应更新）
      // TODO: 可以在此处扩展，把 dateStr 传给渲染函数，或者通过重新渲染骨架刷新 week-bar
      container.innerHTML = buildTraceShell(state);
      switchTab(container, state, state.currentTab || 'schedule', context);
      bindTraceEvents(container, state, context);
    });
  }

  // 下拉折叠菜单统一逻辑
  const dropdownMask = container.querySelector('#trace-dropdown-mask');
  const dropdownTitle = container.querySelector('#trace-dropdown-title');
  const dropdownContent = container.querySelector('#trace-dropdown-content');
  const dropdownFooter = container.querySelector('#trace-dropdown-footer');
  const dropdownClose = container.querySelector('#trace-dropdown-close');

  const showDropdown = (title, templateId, showFooter = false) => {
    dropdownTitle.textContent = title;
    const tpl = container.querySelector(`#${templateId}`);
    if (tpl) {
      dropdownContent.innerHTML = tpl.innerHTML;
    }
    dropdownFooter.style.display = showFooter ? 'block' : 'none';
    dropdownMask.classList.remove('is-hidden');
  };

  const closeDropdown = () => dropdownMask.classList.add('is-hidden');
  dropdownClose?.addEventListener('click', closeDropdown);
  dropdownMask?.addEventListener('click', (e) => {
    if (e.target === dropdownMask) closeDropdown();
  });

  // 1. 面具切换
  const maskBtn = container.querySelector('#trace-mask-switch-btn');
  maskBtn?.addEventListener('click', () => showDropdown('切换用户面具身份', 'tpl-mask-list'));

  // 2. 联系人切换
  const contactBtn = container.querySelector('#trace-contact-switch-btn');
  contactBtn?.addEventListener('click', () => showDropdown('切换联系人', 'tpl-contact-list'));

  // 3. 日期选择
  const dateBtn = container.querySelector('#trace-date-select-btn');
  dateBtn?.addEventListener('click', () => {
    showDropdown('选择日期', 'tpl-date-picker', true);
    // 绑定日期确认按钮
    const confirmBtn = dropdownFooter.querySelector('#trace-dropdown-confirm');
    const newConfirm = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirm, confirmBtn);
    
    newConfirm.addEventListener('click', () => {
      const input = dropdownContent.querySelector('#trace-date-picker-input');
      if (input && input.value) {
        state.selectedDate = input.value;
        closeDropdown();
        container.innerHTML = buildTraceShell(state);
        switchTab(container, state, state.currentTab || 'schedule', context);
        bindTraceEvents(container, state, context);
      }
    });
  });

  // 处理下拉列表中的点击事件 (代理)
  dropdownContent?.addEventListener('click', async (e) => {
    // 处理面具切换
    const maskItem = e.target.closest('[data-mask-id]');
    if (maskItem) {
      const maskId = maskItem.dataset.maskId;
      if (maskId === state.activeMaskId) {
        closeDropdown();
        return;
      }
      state.activeMaskId = maskId;
      state.contacts = await getContactsByMask(context.db, maskId);
      state.activeContactId = state.contacts.length > 0 ? String(state.contacts[0].id) : null;
      const newData = await loadTraceData(context.db, state.activeMaskId, state.activeContactId);
      Object.assign(state, newData);
      
      closeDropdown();
      container.innerHTML = buildTraceShell(state);
      switchTab(container, state, state.currentTab || 'schedule', context);
      bindTraceEvents(container, state, context);
      return;
    }

    // 处理联系人切换
    const contactItem = e.target.closest('[data-contact-id]');
    if (contactItem) {
      const contactId = contactItem.dataset.contactId;
      if (contactId === state.activeContactId) {
        closeDropdown();
        return;
      }
      state.activeContactId = contactId;
      const newData = await loadTraceData(context.db, state.activeMaskId, state.activeContactId);
      Object.assign(state, newData);
      
      closeDropdown();
      container.innerHTML = buildTraceShell(state);
      switchTab(container, state, state.currentTab || 'schedule', context);
      bindTraceEvents(container, state, context);
      return;
    }
  });
}

function switchTab(container, state, tabName, context) {
  const body = container.querySelector('#trace-body');
  const title = container.querySelector('#trace-title-btn');
  const generateBtn = container.querySelector('#trace-schedule-generate-btn');
  const dateBtn = container.querySelector('#trace-date-select-btn');
  const weekContainer = container.querySelector('#trace-week-container');
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

  // 只有在日程页面才显示羽毛笔按钮、日期选择按钮、周视图
  const isSchedule = tabName === 'schedule';
  if (generateBtn) generateBtn.style.display = isSchedule ? 'flex' : 'none';
  if (dateBtn) dateBtn.style.display = isSchedule ? 'flex' : 'none';
  if (weekContainer) weekContainer.style.display = isSchedule ? 'block' : 'none';

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
