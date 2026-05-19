/**
 * 文件名: js/apps/map/map-detail.js
 * 用途: 独立的地图详情页面。支持铺满整页的地图渲染，并在任意位置点击添加地点标记。
 */

import { persistMapData } from './map-store.js';

/* ==========================================================================
   [区域标注·已完成·独立地图详情页]
   说明：全屏地图展示，长按不冲突，点击添加地点。
   ========================================================================== */

/**
 * 构建详情页骨架
 */
export function buildMapDetailShell(mapData) {
  const bgUrl = mapData.imageUrl || '';
  return `
    <div class="map-detail-page" id="map-detail-page">
      <!-- 铺满整个页面的地图背景 -->
      <div class="map-detail-bg" id="map-detail-bg" style="background-image: url('${escapeHtml(bgUrl)}');"></div>
      
      <!-- 坐标标记渲染层 -->
      <div class="map-detail-markers" id="map-detail-markers"></div>

      <!-- 透明悬浮标题栏 -->
      <div class="map-detail-top-bar">
        <button class="map-detail-btn" id="map-detail-back" title="返回">
          <!-- IconPark 风格 返回 "<" -->
          <svg viewBox="0 0 48 48" fill="none">
            <path d="M31 36L19 24L31 12" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <h1 class="map-detail-title">${escapeHtml(mapData.name)}</h1>
        <button class="map-detail-btn" id="map-detail-add-point" title="添加地点">
          <!-- IconPark 风格 加号 "+" -->
          <svg viewBox="0 0 48 48" fill="none">
            <path d="M24 8V40M8 24H40" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>

      <!-- 添加地点的弹窗 -->
      <div class="map-modal-mask is-hidden" id="map-point-modal">
        <div class="map-modal-panel">
          <div class="map-modal-title">添加新地点</div>
          
          <div class="map-modal-field">
            <label class="map-modal-label">地点名称</label>
            <input type="text" class="map-input" id="map-point-name" placeholder="请输入地点名称" />
          </div>
          
          <div class="map-modal-field">
            <label class="map-modal-label">地点描述</label>
            <textarea class="map-textarea" id="map-point-desc" placeholder="请输入地点描述..."></textarea>
          </div>
          
          <div class="map-modal-hint" id="map-point-hint"></div>
          
          <div class="map-modal-actions">
            <button class="map-btn map-btn-cancel" id="map-point-cancel">取消</button>
            <button class="map-btn map-btn-confirm" id="map-point-confirm">确认</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * 渲染坐标标记
 */
function renderMarkers(container, mapData) {
  const markersEl = container.querySelector('#map-detail-markers');
  if (!markersEl) return;

  const points = mapData.points || [];
  markersEl.innerHTML = points.map(p => `
    <div class="map-point-marker" style="left: ${p.x}%; top: ${p.y}%;" title="${escapeHtml(p.name)}\n${escapeHtml(p.description)}">
      <div class="map-point-icon"></div>
      <div class="map-point-label">${escapeHtml(p.name)}</div>
    </div>
  `).join('');
}

/**
 * 绑定详情页事件
 */
export function bindMapDetailEvents(container, mapData, state, context, onBack) {
  const backBtn = container.querySelector('#map-detail-back');
  const addModeBtn = container.querySelector('#map-detail-add-point');
  const bgEl = container.querySelector('#map-detail-bg');
  const modal = container.querySelector('#map-point-modal');
  const cancelBtn = container.querySelector('#map-point-cancel');
  const confirmBtn = container.querySelector('#map-point-confirm');
  const inputName = container.querySelector('#map-point-name');
  const inputDesc = container.querySelector('#map-point-desc');
  const hintEl = container.querySelector('#map-point-hint');

  let isAddMode = false;
  let tempPoint = null;

  // 渲染初始坐标
  renderMarkers(container, mapData);

  // 返回主页
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      onBack();
    });
  }

  // 开启/关闭添加坐标模式
  if (addModeBtn) {
    addModeBtn.addEventListener('click', () => {
      isAddMode = !isAddMode;
      if (isAddMode) {
        addModeBtn.classList.add('is-active');
        container.querySelector('#map-detail-page').classList.add('is-add-mode');
      } else {
        addModeBtn.classList.remove('is-active');
        container.querySelector('#map-detail-page').classList.remove('is-add-mode');
      }
    });
  }

  // 点击地图背景获取坐标
  if (bgEl) {
    bgEl.addEventListener('click', (e) => {
      if (!isAddMode) return;
      
      const rect = bgEl.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      
      tempPoint = { x, y };
      
      // 打开弹窗
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
    tempPoint = null;
    isAddMode = false;
    addModeBtn.classList.remove('is-active');
    container.querySelector('#map-detail-page').classList.remove('is-add-mode');
  };

  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
  if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  // 确认添加坐标
  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      if (!tempPoint) return;

      const name = inputName.value.trim();
      const desc = inputDesc.value.trim();
      
      if (!name) {
        hintEl.textContent = '地点名称不能为空';
        return;
      }

      // 保存到当前地图对象
      if (!mapData.points) mapData.points = [];
      mapData.points.push({
        id: `point_${Date.now()}`,
        name,
        description: desc,
        x: tempPoint.x,
        y: tempPoint.y
      });

      // 持久化
      await persistMapData(context.db, state);
      
      // 重新渲染点
      renderMarkers(container, mapData);
      
      closeModal();
    });
  }
}

function escapeHtml(text) {
  const map = { '&': '&', '<': '<', '>': '>', '"': '"', "'": '&#39;' };
  return String(text ?? '').replace(/[&<>"']/g, c => map[c] || c);
}
