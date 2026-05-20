/**
 * 文件名: js/apps/map/map-detail.js
 * 用途: 独立的地图详情页面。支持完整地图适配、双指缩放平移，并在地图图片内添加地点标记。
 */

import { persistMapData } from './map-store.js';

/* ==========================================================================
   [区域标注·已修改·独立地图详情页]
   说明：详情页使用真实图片画布承载地图，默认完整居中显示，缩放后可受边界约束地查看完整地图。
   ========================================================================== */

/**
 * 构建详情页骨架
 */
export function buildMapDetailShell(mapData) {
  const bgUrl = mapData.imageUrl || '';
  return `
    <div class="map-detail-page" id="map-detail-page">
      <!-- [区域标注·已修改·地图详情页图片画布] 使用真实图片画布，避免背景图缩放导致只显示局部 -->
      <div class="map-detail-viewport" id="map-detail-viewport">
        <div class="map-detail-canvas" id="map-detail-canvas">
          <img class="map-detail-image" id="map-detail-image" src="${escapeHtml(bgUrl)}" alt="${escapeHtml(mapData.name)}" draggable="false" />
          
          <!-- 坐标标记渲染层：与地图图片同尺寸同缩放 -->
          <div class="map-detail-markers" id="map-detail-markers"></div>
        </div>
      </div>

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
  const pageEl = container.querySelector('#map-detail-page');
  const viewportEl = container.querySelector('#map-detail-viewport');
  const canvasEl = container.querySelector('#map-detail-canvas');
  const imageEl = container.querySelector('#map-detail-image');
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

  /* ==========================================================================
     [区域标注·已修改·地图详情页完整适配与缩放边界]
     说明：以图片真实宽高计算完整适配比例，默认完整显示；双指缩放和单指平移后始终约束在可查看完整地图的范围内。
     ========================================================================== */
  if (viewportEl && canvasEl && imageEl) {
    let naturalWidth = 800;
    let naturalHeight = 800;
    let minScale = 1;
    let maxScale = 5;
    let currentScale = 1;
    let currentX = 0;
    let currentY = 0;
    let initialPinchDistance = null;
    let initialScale = 1;
    let lastTouchX = 0;
    let lastTouchY = 0;
    let pinchCenterX = 0;
    let pinchCenterY = 0;

    const applyTransform = () => {
      canvasEl.style.transform = `translate(${currentX}px, ${currentY}px) scale(${currentScale})`;
    };

    const constrainTransform = () => {
      const rect = viewportEl.getBoundingClientRect();
      const viewportWidth = rect.width || 1;
      const viewportHeight = rect.height || 1;
      const scaledWidth = naturalWidth * currentScale;
      const scaledHeight = naturalHeight * currentScale;

      if (scaledWidth <= viewportWidth) {
        currentX = (viewportWidth - scaledWidth) / 2;
      } else {
        currentX = Math.min(0, Math.max(viewportWidth - scaledWidth, currentX));
      }

      if (scaledHeight <= viewportHeight) {
        currentY = (viewportHeight - scaledHeight) / 2;
      } else {
        currentY = Math.min(0, Math.max(viewportHeight - scaledHeight, currentY));
      }
    };

    const updateTransform = () => {
      currentScale = Math.max(minScale, Math.min(currentScale, maxScale));
      constrainTransform();
      applyTransform();
    };

    const fitMapToViewport = () => {
      const rect = viewportEl.getBoundingClientRect();
      const viewportWidth = rect.width || 1;
      const viewportHeight = rect.height || 1;

      minScale = Math.min(viewportWidth / naturalWidth, viewportHeight / naturalHeight);
      maxScale = Math.max(minScale * 5, minScale + 0.01);
      currentScale = minScale;
      currentX = (viewportWidth - naturalWidth * currentScale) / 2;
      currentY = (viewportHeight - naturalHeight * currentScale) / 2;

      canvasEl.style.width = `${naturalWidth}px`;
      canvasEl.style.height = `${naturalHeight}px`;
      applyTransform();
    };

    const initImageCanvas = () => {
      naturalWidth = imageEl.naturalWidth || 800;
      naturalHeight = imageEl.naturalHeight || 800;
      fitMapToViewport();
    };

    if (imageEl.complete) {
      initImageCanvas();
    } else {
      imageEl.addEventListener('load', initImageCanvas, { once: true });
      imageEl.addEventListener('error', initImageCanvas, { once: true });
    }

    window.addEventListener('resize', fitMapToViewport);

    viewportEl.addEventListener('touchstart', (e) => {
      if (!modal.classList.contains('is-hidden')) return;

      if (e.touches.length === 2) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        initialPinchDistance = Math.sqrt(dx * dx + dy * dy);
        initialScale = currentScale;
        
        const viewportRect = viewportEl.getBoundingClientRect();
        pinchCenterX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - viewportRect.left;
        pinchCenterY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - viewportRect.top;
      } else if (e.touches.length === 1) {
        lastTouchX = e.touches[0].clientX;
        lastTouchY = e.touches[0].clientY;
      }
    }, { passive: false });

    viewportEl.addEventListener('touchmove', (e) => {
      // 处于弹窗时阻止背景的缩放和拖拽
      if (!modal.classList.contains('is-hidden')) return;

      if (e.touches.length === 2 && initialPinchDistance !== null) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const previousScale = currentScale;
        const nextScale = Math.max(minScale, Math.min(initialScale * (distance / initialPinchDistance), maxScale));
        const ratio = nextScale / previousScale;

        currentX = pinchCenterX - (pinchCenterX - currentX) * ratio;
        currentY = pinchCenterY - (pinchCenterY - currentY) * ratio;
        currentScale = nextScale;

        updateTransform();
      } else if (e.touches.length === 1) {
        e.preventDefault();
        const touchX = e.touches[0].clientX;
        const touchY = e.touches[0].clientY;
        
        currentX += touchX - lastTouchX;
        currentY += touchY - lastTouchY;
        
        lastTouchX = touchX;
        lastTouchY = touchY;
        
        updateTransform();
      }
    }, { passive: false });

    viewportEl.addEventListener('touchend', (e) => {
      if (e.touches.length < 2) {
        initialPinchDistance = null;
      }
      if (e.touches.length === 1) {
        lastTouchX = e.touches[0].clientX;
        lastTouchY = e.touches[0].clientY;
      }
      updateTransform();
    });
  }

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
        pageEl.classList.add('is-add-mode');
      } else {
        addModeBtn.classList.remove('is-active');
        pageEl.classList.remove('is-add-mode');
      }
    });
  }

  // 点击地图图片画布获取坐标
  if (canvasEl) {
    canvasEl.addEventListener('click', (e) => {
      if (!isAddMode) return;
      
      const rect = canvasEl.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;

      if (x < 0 || x > 100 || y < 0 || y > 100) return;
      
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
    pageEl.classList.remove('is-add-mode');
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
