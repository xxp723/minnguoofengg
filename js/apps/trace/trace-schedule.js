/**
 * 文件名: js/apps/trace/trace-schedule.js
 * 用途: 轨迹应用 - 日程模块。
 */
import { persistTraceData } from './trace-store.js';

/* ==========================================================================
   [区域标注·本次需求·日程模块 IconPark 图标]
   ========================================================================== */
const ICONS = {
  add: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M24 8v32M8 24h32" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`,
};

/* ==========================================================================
   [区域标注·本次需求·日程模块 UI 渲染]
   ========================================================================== */
export function renderSchedule(container, state) {
  const schedules = Array.isArray(state.schedules) ? state.schedules : [];
  
  let listHtml = '';
  if (schedules.length === 0) {
    listHtml = `
      <div class="trace-empty">
        <p>暂无日程信息</p>
        <p class="trace-empty-sub">点击下方“添加”按钮记录新日程</p>
      </div>
    `;
  } else {
    listHtml = `<div class="trace-list">` + schedules.map(s => `
      <div class="trace-card">
        <div class="trace-card-title">${escapeHtml(s.title || '未命名日程')}</div>
        <div class="trace-card-desc">${escapeHtml(s.content || '')}</div>
      </div>
    `).join('') + `</div>`;
  }

  container.innerHTML = `
    <div class="trace-module-container">
      <div class="trace-module-content">
        ${listHtml}
      </div>
      <button class="trace-fab" id="trace-schedule-add-btn" aria-label="添加日程">
        ${ICONS.add}
      </button>
      
      <!-- 日程新增弹窗 -->
      <div class="trace-modal-mask is-hidden" id="trace-schedule-modal">
        <div class="trace-modal-panel">
          <div class="trace-modal-title">添加日程</div>
          <div class="trace-modal-field">
            <label class="trace-modal-label">标题</label>
            <input type="text" class="trace-input" id="trace-schedule-title" placeholder="日程标题" />
          </div>
          <div class="trace-modal-field">
            <label class="trace-modal-label">内容</label>
            <textarea class="trace-textarea" id="trace-schedule-content" placeholder="日程内容"></textarea>
          </div>
          <div class="trace-modal-hint" id="trace-schedule-hint"></div>
          <div class="trace-modal-actions">
            <button class="trace-btn trace-btn-cancel" id="trace-schedule-cancel">取消</button>
            <button class="trace-btn trace-btn-confirm" id="trace-schedule-confirm">确认</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

/* ==========================================================================
   [区域标注·本次需求·日程模块交互事件绑定]
   ========================================================================== */
export function bindScheduleEvents(container, state, context) {
  const addBtn = container.querySelector('#trace-schedule-add-btn');
  const modal = container.querySelector('#trace-schedule-modal');
  const cancelBtn = container.querySelector('#trace-schedule-cancel');
  const confirmBtn = container.querySelector('#trace-schedule-confirm');
  const inputTitle = container.querySelector('#trace-schedule-title');
  const inputContent = container.querySelector('#trace-schedule-content');
  const hintEl = container.querySelector('#trace-schedule-hint');

  const openModal = () => {
    inputTitle.value = '';
    inputContent.value = '';
    hintEl.textContent = '';
    modal.classList.remove('is-hidden');
    setTimeout(() => inputTitle.focus(), 50);
  };

  const closeModal = () => {
    modal.classList.add('is-hidden');
  };

  addBtn?.addEventListener('click', openModal);
  cancelBtn?.addEventListener('click', closeModal);
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  confirmBtn?.addEventListener('click', async () => {
    const title = inputTitle.value.trim();
    const content = inputContent.value.trim();

    if (!state.activeContactId) {
      hintEl.textContent = '请先选择一个联系人';
      return;
    }

    if (!title) {
      hintEl.textContent = '标题不能为空';
      return;
    }

    if (!Array.isArray(state.schedules)) state.schedules = [];
    state.schedules.push({
      id: Date.now().toString(),
      title,
      content,
      createdAt: Date.now()
    });

    await persistTraceData(context.db, state, state.activeMaskId, state.activeContactId);
    renderSchedule(container, state);
    bindScheduleEvents(container, state, context);
  });
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
