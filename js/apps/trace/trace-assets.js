/**
 * 文件名: js/apps/trace/trace-assets.js
 * 用途: 轨迹应用 - 资产模块。
 */
import { persistTraceData } from './trace-store.js';

/* ==========================================================================
   [区域标注·本次需求·资产模块 IconPark 图标]
   ========================================================================== */
const ICONS = {
  add: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M24 8v32M8 24h32" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`,
};

/* ==========================================================================
   [区域标注·本次需求·资产模块 UI 渲染]
   ========================================================================== */
export function renderAssets(container, state) {
  const assets = Array.isArray(state.assets) ? state.assets : [];
  
  let listHtml = '';
  if (assets.length === 0) {
    listHtml = `
      <div class="trace-empty">
        <p>暂无资产记录</p>
        <p class="trace-empty-sub">点击下方“添加”按钮记录您的资产</p>
      </div>
    `;
  } else {
    listHtml = `<div class="trace-list">` + assets.map(a => `
      <div class="trace-card">
        <div class="trace-card-title">${escapeHtml(a.name || '未命名资产')}</div>
        <div class="trace-card-desc">金额: ${escapeHtml(a.amount || '0')} | 类别: ${escapeHtml(a.category || '未分类')}</div>
      </div>
    `).join('') + `</div>`;
  }

  container.innerHTML = `
    <div class="trace-module-container">
      <div class="trace-module-content">
        ${listHtml}
      </div>
      <button class="trace-fab" id="trace-assets-add-btn" aria-label="添加资产">
        ${ICONS.add}
      </button>

      <!-- 资产新增弹窗 -->
      <div class="trace-modal-mask is-hidden" id="trace-assets-modal">
        <div class="trace-modal-panel">
          <div class="trace-modal-title">添加资产</div>
          <div class="trace-modal-field">
            <label class="trace-modal-label">资产名称</label>
            <input type="text" class="trace-input" id="trace-assets-name" placeholder="例如：工资、餐饮" />
          </div>
          <div class="trace-modal-field">
            <label class="trace-modal-label">金额</label>
            <input type="number" class="trace-input" id="trace-assets-amount" placeholder="例如：100" />
          </div>
          <div class="trace-modal-field">
            <label class="trace-modal-label">类别</label>
            <input type="text" class="trace-input" id="trace-assets-category" placeholder="例如：收入、支出" />
          </div>
          <div class="trace-modal-hint" id="trace-assets-hint"></div>
          <div class="trace-modal-actions">
            <button class="trace-btn trace-btn-cancel" id="trace-assets-cancel">取消</button>
            <button class="trace-btn trace-btn-confirm" id="trace-assets-confirm">确认</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

/* ==========================================================================
   [区域标注·本次需求·资产模块交互事件绑定]
   ========================================================================== */
export function bindAssetsEvents(container, state, context) {
  const addBtn = container.querySelector('#trace-assets-add-btn');
  const modal = container.querySelector('#trace-assets-modal');
  const cancelBtn = container.querySelector('#trace-assets-cancel');
  const confirmBtn = container.querySelector('#trace-assets-confirm');
  const inputName = container.querySelector('#trace-assets-name');
  const inputAmount = container.querySelector('#trace-assets-amount');
  const inputCategory = container.querySelector('#trace-assets-category');
  const hintEl = container.querySelector('#trace-assets-hint');

  const openModal = () => {
    inputName.value = '';
    inputAmount.value = '';
    inputCategory.value = '';
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
    const amount = inputAmount.value.trim();
    const category = inputCategory.value.trim();

    if (!state.activeContactId) {
      hintEl.textContent = '请先选择一个联系人';
      return;
    }

    if (!name || !amount) {
      hintEl.textContent = '名称和金额不能为空';
      return;
    }

    if (!Array.isArray(state.assets)) state.assets = [];
    state.assets.push({
      id: Date.now().toString(),
      name,
      amount,
      category,
      createdAt: Date.now()
    });

    await persistTraceData(context.db, state, state.activeMaskId, state.activeContactId);
    renderAssets(container, state);
    bindAssetsEvents(container, state, context);
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
