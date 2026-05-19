/**
 * 文件名: js/apps/map/map-ui.js
 * 用途: 地图应用的 UI 渲染与交互逻辑。
 */
import { persistMapData, createMapDraft } from './map-store.js';

/* ==========================================================================
   [区域标注·已完成·地图骨架与渲染]
   ========================================================================== */
export function buildMapShell() {
  return `
    <div class="map-app">
      <div class="map-top-bar">
        <div class="map-top-bar__title-wrap">
          <!-- 标题点击返回桌面 -->
          <h1 class="map-title" id="map-title-btn">map</h1>
        </div>
        <button class="map-add-btn" id="map-add-btn" title="创建新地图">
          <!-- IconPark 风格加号 -->
          <svg viewBox="0 0 48 48" fill="none">
            <path d="M24 8v32M8 24h32" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
      
      <div class="map-content-scroll">
        <div class="map-grid" id="map-grid-container">
          <!-- 卡片动态渲染在此处 -->
        </div>
      </div>

      <!-- 创建弹窗 -->
      <div class="map-modal-mask is-hidden" id="map-create-modal">
        <div class="map-modal-panel">
          <div class="map-modal-title">创建新地图</div>
          
          <div class="map-modal-field">
            <label class="map-modal-label">地图名称</label>
            <input type="text" class="map-input" id="map-input-name" placeholder="请输入地图名称" />
          </div>
          
          <div class="map-modal-field">
            <label class="map-modal-label">描述地图</label>
            <textarea class="map-textarea" id="map-input-desc" placeholder="请输入地图描述..."></textarea>
          </div>
          
          <div class="map-modal-hint" id="map-modal-hint"></div>
          
          <div class="map-modal-actions">
            <button class="map-btn map-btn-cancel" id="map-btn-cancel">取消</button>
            <button class="map-btn map-btn-confirm" id="map-btn-confirm">确认</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function renderMapGrid(container, state) {
  const grid = container.querySelector('#map-grid-container');
  if (!grid) return;

  const maps = Array.isArray(state.maps) ? state.maps : [];
  
  grid.innerHTML = maps.map(m => `
    <div class="map-card" data-map-id="${m.id}">
      <div class="map-card-cover"></div>
      <div class="map-card-info">
        <div class="map-card-title">${escapeHtml(m.name)}</div>
        <div class="map-card-desc">${escapeHtml(m.description || '暂无描述')}</div>
      </div>
    </div>
  `).join('');
}

/* ==========================================================================
   [区域标注·已完成·交互事件绑定]
   说明：包含关闭弹窗、创建数据、退出应用等
   ========================================================================== */
export function bindMapEvents(container, state, context) {
  const titleBtn = container.querySelector('#map-title-btn');
  const addBtn = container.querySelector('#map-add-btn');
  const modal = container.querySelector('#map-create-modal');
  const cancelBtn = container.querySelector('#map-btn-cancel');
  const confirmBtn = container.querySelector('#map-btn-confirm');
  const inputName = container.querySelector('#map-input-name');
  const inputDesc = container.querySelector('#map-input-desc');
  const hintEl = container.querySelector('#map-modal-hint');

  // 辅助函数：转义 HTML 实体
  function escapeHtml(text) {
    const map = { '&': '&', '<': '<', '>': '>', '"': '"', "'": '&#39;' };
    return String(text ?? '').replace(/[&<>"']/g, c => map[c] || c);
  }

  // 点击标题直接返回桌面
  if (titleBtn) {
    titleBtn.addEventListener('click', () => {
      // 模拟点击窗口关闭按钮
      const closeBtn = document.querySelector('.app-window[data-app-id="map"] .window-header__btn-close');
      if (closeBtn) closeBtn.click();
    });
  }

  // 打开弹窗
  if (addBtn && modal) {
    addBtn.addEventListener('click', () => {
      inputName.value = '';
      inputDesc.value = '';
      hintEl.textContent = '';
      modal.classList.remove('is-hidden');
      setTimeout(() => inputName.focus(), 50);
    });
  }

  // 关闭弹窗
  const closeModal = () => {
    modal.classList.add('is-hidden');
  };

  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

  // 点击遮罩关闭弹窗
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  }

  // 确认创建地图
  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      const name = inputName.value.trim();
      const desc = inputDesc.value.trim();
      
      if (!name) {
        hintEl.textContent = '地图名称不能为空';
        return;
      }
      
      hintEl.textContent = '';
      
      // 生成新地图对象
      const newMap = createMapDraft(name, desc);
      state.maps.push(newMap);
      
      // 更新持久化与视图
      await persistMapData(context.db, state);
      renderMapGrid(container, state);
      
      closeModal();
    });
  }
}

function escapeHtml(text) {
  const map = { '&': '&', '<': '<', '>': '>', '"': '"', "'": '&#39;' };
  return String(text ?? '').replace(/[&<>"']/g, c => map[c] || c);
}
