/**
 * 文件名: js/apps/trace/trace-location.js
 * 用途: 轨迹应用 - 位置模块。
 */
import { persistTraceData } from './trace-store.js';

/* ==========================================================================
   [区域标注·本次需求·位置模块 IconPark 图标]
   ========================================================================== */
const ICONS = {
  add: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M24 8v32M8 24h32" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`,
};

/* ==========================================================================
   [区域标注·本次需求·位置模块 UI 渲染]
   ========================================================================== */
export function renderLocation(container, state) {
  const locations = Array.isArray(state.locations) ? state.locations : [];
  
  let listHtml = '';
  if (locations.length === 0) {
    listHtml = `
      <div class="trace-empty">
        <p>暂无位置记录</p>
        <p class="trace-empty-sub">点击下方“添加”按钮记录新位置</p>
      </div>
    `;
  } else {
    listHtml = `<div class="trace-list">` + locations.map(l => `
      <div class="trace-card">
        <div class="trace-card-title">${escapeHtml(l.name || '未知地点')}</div>
        <div class="trace-card-desc">${escapeHtml(l.description || '')}</div>
      </div>
    `).join('') + `</div>`;
  }

  container.innerHTML = `
    <div class="trace-module-container">
      <div class="trace-module-content">
        ${listHtml}
      </div>
      <button class="trace-fab" id="trace-location-add-btn" aria-label="添加位置">
        ${ICONS.add}
      </button>

      <!-- 位置新增弹窗 -->
      <div class="trace-modal-mask is-hidden" id="trace-location-modal">
        <div class="trace-modal-panel">
          <div class="trace-modal-title">添加位置</div>
          <div class="trace-modal-field">
            <label class="trace-modal-label">位置名称</label>
            <input type="text" class="trace-input" id="trace-location-name" placeholder="例如：公司、家" />
          </div>
          <div class="trace-modal-field">
            <label class="trace-modal-label">详细描述</label>
            <textarea class="trace-textarea" id="trace-location-desc" placeholder="输入详细地址或描述"></textarea>
          </div>
          <div class="trace-modal-hint" id="trace-location-hint"></div>
          <div class="trace-modal-actions">
            <button class="trace-btn trace-btn-cancel" id="trace-location-cancel">取消</button>
            <button class="trace-btn trace-btn-confirm" id="trace-location-confirm">确认</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

/* ==========================================================================
   [区域标注·本次需求·位置模块交互事件绑定]
   ========================================================================== */
export function bindLocationEvents(container, state, context) {
  const addBtn = container.querySelector('#trace-location-add-btn');
  const modal = container.querySelector('#trace-location-modal');
  const cancelBtn = container.querySelector('#trace-location-cancel');
  const confirmBtn = container.querySelector('#trace-location-confirm');
  const inputName = container.querySelector('#trace-location-name');
  const inputDesc = container.querySelector('#trace-location-desc');
  const hintEl = container.querySelector('#trace-location-hint');

  const openModal = () => {
    inputName.value = '';
    inputDesc.value = '';
    hintEl.textContent = '';
    modal.classList.remove('is-hidden');
    setTimeout(() => inputName.focus(), 50);
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
    const name = inputName.value.trim();
    const desc = inputDesc.value.trim();

    if (!name) {
      hintEl.textContent = '名称不能为空';
      return;
    }

    if (!Array.isArray(state.locations)) state.locations = [];
    state.locations.push({
      id: Date.now().toString(),
      name,
      description: desc,
      createdAt: Date.now()
    });

    await persistTraceData(context.db, state);
    renderLocation(container, state);
    bindLocationEvents(container, state, context);
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
