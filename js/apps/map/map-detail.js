/**
 * 文件名: js/apps/map/map-detail.js
 * 用途: 独立的地图详情页面。支持完整地图适配、双指缩放平移、添加地点标记、长按拖动地点与手动重新生成地图。
 */

import {
  createMapPointDraft,
  persistMapData,
  regenerateMapImage,
  updateMapPointPosition
} from './map-store.js';

/* ==========================================================================
   [区域标注·已完成·独立地图详情页]
   说明：详情页使用真实图片画布承载地图；右上角可添加地点，右下角可手动重新生成地图。
   ========================================================================== */

/**
 * 构建详情页骨架
 */
export function buildMapDetailShell(mapData) {
  const bgUrl = mapData.imageUrl || '';
  return `
    <div class="map-detail-page" id="map-detail-page">
      <!-- [区域标注·已完成·地图详情页图片画布] 使用真实图片画布，避免背景图缩放导致只显示局部 -->
      <div class="map-detail-viewport" id="map-detail-viewport">
        <div class="map-detail-canvas" id="map-detail-canvas">
          <img class="map-detail-image" id="map-detail-image" src="${escapeHtml(bgUrl)}" alt="${escapeHtml(mapData.name)}" draggable="false" />
          
          <!-- [区域标注·已完成·地点标记渲染层] 与地图图片同尺寸同缩放，支持长按拖动地点 -->
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

      <!-- [区域标注·已完成·详情页地图换算比例尺与两点距离] 固定在标题栏下方；点击两个地点后显示真实距离 -->
      <div class="map-detail-scale-panel" id="map-detail-scale-panel">
        <span class="map-detail-scale-main" id="map-detail-scale-main">比例尺：1px ≈ 1m</span>
        <span class="map-detail-distance-text" id="map-detail-distance-text"></span>
      </div>

      <!-- [区域标注·已完成·详情页地点描述卡片] 单击地点图标后显示地点名称与描述，不使用浏览器原生弹窗 -->
      <div class="map-point-info-card is-hidden" id="map-point-info-card">
        <div class="map-point-info-title" id="map-point-info-title"></div>
        <div class="map-point-info-desc" id="map-point-info-desc"></div>
      </div>

      <!-- [区域标注·已完成·详情页手动重新生成地图按钮] 右下角磨砂透明圆形按钮；不点击则地图保持原样 -->
      <button class="map-detail-regen-btn" id="map-detail-regenerate" type="button" title="重新生成地图" aria-label="重新生成地图">
        <!-- IconPark 风格刷新/重做图标 -->
        <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
          <path d="M36.7 15.3C33.8 11.4 29.2 9 24 9C15.7 9 9 15.7 9 24C9 32.3 15.7 39 24 39C31.1 39 37 34.1 38.6 27.5" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M38 9V17H30" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>

      <!-- [区域标注·已完成·详情页添加地点弹窗] 应用内弹窗，不使用浏览器原生弹窗或选择器 -->
      <div class="map-modal-mask is-hidden" id="map-point-modal">
        <div class="map-modal-panel">
          <div class="map-modal-title">添加新地点</div>
          
          <div class="map-modal-field">
            <label class="map-modal-label">地点名称</label>
            <input type="text" class="map-input" id="map-point-name" placeholder="请输入地点名称" />
          </div>
          
          <div class="map-modal-field">
            <label class="map-modal-label">描述地点</label>
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

/* ==========================================================================
   [区域标注·已完成·地点标记渲染与真实距离/描述展示]
   说明：地点以定位图标显示；单击地点显示应用内描述卡片，连续点击两个地点显示真实距离。
   ========================================================================== */
function renderMarkers(container, mapData) {
  const markersEl = container.querySelector('#map-detail-markers');
  if (!markersEl) return;

  const points = mapData.points || [];
  markersEl.innerHTML = points.map(p => {
    const realX = Number(p.realXMeter || 0).toFixed(1);
    const realY = Number(p.realYMeter || 0).toFixed(1);
    return `
      <div class="map-point-marker" data-point-id="${escapeHtml(p.id)}" style="left: ${p.x}%; top: ${p.y}%;" aria-label="${escapeHtml(p.name)}，坐标 ${realX} 米，${realY} 米">
        <div class="map-point-icon" aria-hidden="true">
          <!-- IconPark 风格定位图标 -->
          <svg viewBox="0 0 48 48" fill="none">
            <path d="M24 44C24 44 39 30 39 18C39 9.7 32.3 3 24 3C15.7 3 9 9.7 9 18C9 30 24 44 24 44Z" fill="currentColor"/>
            <path d="M24 24C27.3 24 30 21.3 30 18C30 14.7 27.3 12 24 12C20.7 12 18 14.7 18 18C18 21.3 20.7 24 24 24Z" fill="#FFFFFF"/>
          </svg>
        </div>
        <div class="map-point-label">${escapeHtml(p.name)}</div>
      </div>
    `;
  }).join('');
}

/**
 * 绑定详情页事件
 */
export function bindMapDetailEvents(container, mapData, state, context, onBack) {
  const backBtn = container.querySelector('#map-detail-back');
  const addPointBtn = container.querySelector('#map-detail-add-point');
  const regenerateBtn = container.querySelector('#map-detail-regenerate');
  const pageEl = container.querySelector('#map-detail-page');
  const viewportEl = container.querySelector('#map-detail-viewport');
  const canvasEl = container.querySelector('#map-detail-canvas');
  const imageEl = container.querySelector('#map-detail-image');
  const scaleMainEl = container.querySelector('#map-detail-scale-main');
  const distanceTextEl = container.querySelector('#map-detail-distance-text');
  const pointInfoCard = container.querySelector('#map-point-info-card');
  const pointInfoTitle = container.querySelector('#map-point-info-title');
  const pointInfoDesc = container.querySelector('#map-point-info-desc');
  const modal = container.querySelector('#map-point-modal');
  const cancelBtn = container.querySelector('#map-point-cancel');
  const confirmBtn = container.querySelector('#map-point-confirm');
  const inputName = container.querySelector('#map-point-name');
  const inputDesc = container.querySelector('#map-point-desc');
  const hintEl = container.querySelector('#map-point-hint');

  let tempPoint = { x: 50, y: 50 };
  let selectedPointId = null;

  // 渲染初始坐标
  renderMarkers(container, mapData);

  /* ==========================================================================
     [区域标注·已完成·比例尺与地点单击距离计算]
     说明：固定显示地图换算方法；单击地点显示描述，连续单击两个地点后显示两点真实距离。
   ========================================================================== */
  const getPointDistanceMeters = (a, b) => {
    if (!a || !b) return 0;
    const dx = Number(a.realXMeter || 0) - Number(b.realXMeter || 0);
    const dy = Number(a.realYMeter || 0) - Number(b.realYMeter || 0);
    return Math.sqrt(dx * dx + dy * dy);
  };

  const formatDistance = (meters) => {
    if (meters >= 1000) return `${(meters / 1000).toFixed(2)}公里`;
    return `${meters.toFixed(1)}米`;
  };

  const updateScaleText = () => {
    if (!scaleMainEl) return;
    const metersPerPixel = Number(mapData.distanceScale?.metersPerPixel || 1);
    scaleMainEl.textContent = `比例尺：1px ≈ ${metersPerPixel >= 1000 ? `${(metersPerPixel / 1000).toFixed(2)}km` : `${metersPerPixel}m`}`;
  };

  const hidePointInfo = () => {
    if (pointInfoCard) pointInfoCard.classList.add('is-hidden');
  };

  const showPointInfo = (point) => {
    if (!point || !pointInfoCard) return;
    if (pointInfoTitle) pointInfoTitle.textContent = point.name || '未命名地点';
    if (pointInfoDesc) {
      const realX = Number(point.realXMeter || 0).toFixed(1);
      const realY = Number(point.realYMeter || 0).toFixed(1);
      pointInfoDesc.textContent = `${point.description || '暂无描述'}｜坐标：${realX}m, ${realY}m`;
    }
    pointInfoCard.classList.remove('is-hidden');
  };

  const handlePointClick = (pointId) => {
    const point = (mapData.points || []).find(p => p.id === pointId);
    if (!point) return;

    showPointInfo(point);

    if (selectedPointId && selectedPointId !== pointId) {
      const previous = (mapData.points || []).find(p => p.id === selectedPointId);
      if (previous && distanceTextEl) {
        distanceTextEl.textContent = `${previous.name}距离${point.name}有${formatDistance(getPointDistanceMeters(previous, point))}`;
      }
    } else if (distanceTextEl) {
      distanceTextEl.textContent = '';
    }

    selectedPointId = pointId;
  };

  const clearDistanceWhenTapMap = () => {
    selectedPointId = null;
    if (distanceTextEl) distanceTextEl.textContent = '';
    hidePointInfo();
  };

  updateScaleText();

  /* ==========================================================================
     [区域标注·已完成·地图详情页完整适配与缩放边界]
     说明：以图片真实宽高计算完整适配比例；双指缩放和单指平移后始终约束在可查看完整地图的范围内。
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

    /* ==========================================================================
       [区域标注·已完成·详情页添加地点长按拖动]
       说明：地点确认后默认落在地图中心；长按地点图标 450ms 后可拖动，松手后写入 IndexedDB。
       ========================================================================== */
    let draggingPointId = null;
    let markerPressTimer = null;
    let hasDraggedMarker = false;

    const getCanvasPercentFromClient = (clientX, clientY) => {
      const rect = canvasEl.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * 100;
      const y = ((clientY - rect.top) / rect.height) * 100;
      return {
        x: Math.max(0, Math.min(100, x)),
        y: Math.max(0, Math.min(100, y))
      };
    };

    const applyTransform = () => {
      canvasEl.style.left = `${currentX}px`;
      canvasEl.style.top = `${currentY}px`;
      canvasEl.style.transform = `scale(${currentScale})`;
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

      // [区域标注·已完成·详情页地图铺满屏幕] 地图至少铺满屏幕，避免黑边/空隙。
      minScale = Math.max(viewportWidth / naturalWidth, viewportHeight / naturalHeight);
      maxScale = Math.max(minScale * 5, minScale + 0.01);
      currentScale = minScale;
      currentX = (viewportWidth - naturalWidth * currentScale) / 2;
      currentY = (viewportHeight - naturalHeight * currentScale) / 2;

      canvasEl.style.width = `${naturalWidth}px`;
      canvasEl.style.height = `${naturalHeight}px`;
      applyTransform();
    };

    let fitFrameId = null;
    const scheduleFitMapToViewport = () => {
      if (fitFrameId) {
        cancelAnimationFrame(fitFrameId);
      }

      fitFrameId = requestAnimationFrame(() => {
        fitFrameId = null;

        const rect = viewportEl.getBoundingClientRect();
        if (rect.width <= 1 || rect.height <= 1) {
          scheduleFitMapToViewport();
          return;
        }

        fitMapToViewport();
      });
    };

    const initImageCanvas = () => {
      naturalWidth = imageEl.naturalWidth || 800;
      naturalHeight = imageEl.naturalHeight || 800;
      scheduleFitMapToViewport();
    };

    const clearMarkerPressTimer = () => {
      if (markerPressTimer) {
        clearTimeout(markerPressTimer);
        markerPressTimer = null;
      }
    };

    const finishMarkerDrag = async () => {
      if (!draggingPointId) return;
      const movedPointId = draggingPointId;
      draggingPointId = null;
      pageEl.classList.remove('is-dragging-point');

      const point = (mapData.points || []).find(p => p.id === movedPointId);
      if (point) {
        updateMapPointPosition(point, point.x, point.y, mapData.distanceScale);
        await persistMapData(context.db, state);
        renderMarkers(container, mapData);
      }
    };

    const handleMarkerPointerDown = (e) => {
      const marker = e.target.closest?.('.map-point-marker');
      if (!marker) return;

      e.preventDefault();
      e.stopPropagation();
      hasDraggedMarker = false;
      clearMarkerPressTimer();

      markerPressTimer = setTimeout(() => {
        draggingPointId = marker.dataset.pointId || '';
        pageEl.classList.add('is-dragging-point');
      }, 450);
    };

    const handleMarkerPointerMove = (e) => {
      if (!draggingPointId) return;

      e.preventDefault();
      e.stopPropagation();

      const point = (mapData.points || []).find(p => p.id === draggingPointId);
      if (!point) return;

      const next = getCanvasPercentFromClient(e.clientX, e.clientY);
      updateMapPointPosition(point, next.x, next.y, mapData.distanceScale);
      hasDraggedMarker = true;

      const marker = container.querySelector(`.map-point-marker[data-point-id="${cssEscape(draggingPointId)}"]`);
      if (marker) {
        marker.style.left = `${point.x}%`;
        marker.style.top = `${point.y}%`;
      }
    };

    const handleMarkerPointerUp = async (e) => {
      const marker = e.target.closest?.('.map-point-marker');
      const pendingPointId = marker?.dataset?.pointId || '';
      clearMarkerPressTimer();

      if (draggingPointId) {
        e.preventDefault();
        e.stopPropagation();
        await finishMarkerDrag();
        return;
      }

      if (pendingPointId) {
        e.preventDefault();
        e.stopPropagation();
        handlePointClick(pendingPointId);
      }
    };

    if (imageEl.complete) {
      initImageCanvas();
    } else {
      imageEl.addEventListener('load', initImageCanvas, { once: true });
      imageEl.addEventListener('error', initImageCanvas, { once: true });
    }

    window.addEventListener('resize', scheduleFitMapToViewport);

    canvasEl.addEventListener('pointerdown', handleMarkerPointerDown);
    window.addEventListener('pointermove', handleMarkerPointerMove, { passive: false });
    window.addEventListener('pointerup', handleMarkerPointerUp, { passive: false });
    window.addEventListener('pointercancel', handleMarkerPointerUp, { passive: false });

    viewportEl.addEventListener('pointerdown', (e) => {
      if (e.target.closest?.('.map-point-marker') || e.target.closest?.('.map-detail-top-bar') || e.target.closest?.('.map-detail-scale-panel') || e.target.closest?.('.map-point-info-card') || e.target.closest?.('.map-detail-regen-btn')) return;
      clearDistanceWhenTapMap();
    });

    viewportEl.addEventListener('touchstart', (e) => {
      if (!modal.classList.contains('is-hidden') || draggingPointId) return;

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
      // 处于弹窗或拖动地点时阻止背景的缩放和拖拽
      if (!modal.classList.contains('is-hidden') || draggingPointId) return;

      clearMarkerPressTimer();

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
      clearMarkerPressTimer();

      if (e.touches.length < 2) {
        initialPinchDistance = null;
      }
      if (e.touches.length === 1) {
        lastTouchX = e.touches[0].clientX;
        lastTouchY = e.touches[0].clientY;
      }
      updateTransform();
    });

    // 防止长按地点后触发普通点击
    canvasEl.addEventListener('click', (e) => {
      if (hasDraggedMarker) {
        e.preventDefault();
        e.stopPropagation();
        hasDraggedMarker = false;
      }
    }, true);
  }

  // 返回主页
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      onBack();
    });
  }

  /* ==========================================================================
     [区域标注·已完成·详情页添加地点弹窗与中心落点]
     说明：点击右上角 + 直接打开应用内弹窗；确认后地点默认落在地图中心，可再长按拖动。
     ========================================================================== */
  const openPointModal = () => {
    tempPoint = { x: 50, y: 50 };
    inputName.value = '';
    inputDesc.value = '';
    hintEl.textContent = '';
    modal.classList.remove('is-hidden');
    requestAnimationFrame(() => inputName.focus());
  };

  const closeModal = () => {
    modal.classList.add('is-hidden');
    tempPoint = { x: 50, y: 50 };
  };

  if (addPointBtn) {
    addPointBtn.addEventListener('click', openPointModal);
  }

  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
  if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  // 确认添加坐标
  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      const name = inputName.value.trim();
      const desc = inputDesc.value.trim();
      
      if (!name) {
        hintEl.textContent = '地点名称不能为空';
        return;
      }

      // 保存到当前地图对象，使用 IndexedDB 数据层；不接入 Web Storage 兜底。
      if (!mapData.points) mapData.points = [];
      mapData.points.push(createMapPointDraft(name, desc, tempPoint.x, tempPoint.y, mapData.distanceScale));

      await persistMapData(context.db, state);
      renderMarkers(container, mapData);
      closeModal();
    });
  }

  /* ==========================================================================
     [区域标注·已完成·详情页手动重新生成地图]
     说明：只有点击右下角按钮时才重新生成当前地图；同步更新详情图片与主页封面数据。
     ========================================================================== */
  if (regenerateBtn && imageEl) {
    regenerateBtn.addEventListener('click', async () => {
      if (regenerateBtn.classList.contains('is-loading')) return;

      regenerateBtn.classList.add('is-loading');
      regenerateBtn.disabled = true;

      const nextImage = regenerateMapImage(mapData);
      mapData.imageUrl = nextImage.imageUrl;
      mapData.imagePrompt = nextImage.imagePrompt;
      mapData.imageSeed = nextImage.imageSeed;
      mapData.distanceScale = nextImage.distanceScale;
      updateScaleText();
      if (distanceTextEl) distanceTextEl.textContent = '';
      hidePointInfo();
      selectedPointId = null;

      await persistMapData(context.db, state);

      imageEl.addEventListener('load', () => {
        regenerateBtn.classList.remove('is-loading');
        regenerateBtn.disabled = false;
      }, { once: true });
      imageEl.addEventListener('error', () => {
        regenerateBtn.classList.remove('is-loading');
        regenerateBtn.disabled = false;
      }, { once: true });

      imageEl.src = mapData.imageUrl;
    });
  }
}

function cssEscape(value) {
  if (window.CSS && typeof window.CSS.escape === 'function') {
    return window.CSS.escape(value);
  }
  return String(value).replace(/["\\]/g, '\\$&');
}

function escapeHtml(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(text ?? '').replace(/[&<>"']/g, c => map[c] || c);
}
