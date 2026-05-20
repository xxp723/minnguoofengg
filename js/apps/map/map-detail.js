/**
 * 文件名: js/apps/map/map-detail.js
 * 用途: 独立的地图详情页面。支持完整地图适配、双指缩放平移、添加地点标记、长按拖动地点、多选删除地点与 AI 自动生成新地点。
 */

import {
  createMapPointDraft,
  persistMapData,
  regenerateMapImage,
  updateMapPointPosition
} from './map-store.js';

/* ==========================================================================
   [区域标注·已完成·地图详情页 IconPark 图标与副API常量]
   说明：详情页新增的浮动按钮与弹窗按钮统一使用 IconPark 风格图标；AI 自动生成地点只调用副 API。
   ========================================================================== */
const DETAIL_ICONS = {
  edit: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M8 40H40" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M13 31L31.5 12.5C33.4 10.6 36.5 10.6 38.4 12.5L39.5 13.6C41.4 15.5 41.4 18.6 39.5 20.5L21 39L12 40L13 31Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M28 16L36 24" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`,
  ai: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M24 5l4.9 13.1L42 23l-13.1 4.9L24 41l-4.9-13.1L6 23l13.1-4.9L24 5Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M38 6l1.8 4.2L44 12l-4.2 1.8L38 18l-1.8-4.2L32 12l4.2-1.8L38 6Z" fill="currentColor"/></svg>`,
  multi: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M10 14H26" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M10 24H26" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M10 34H26" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M32 14L35 17L40 11" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M32 24L35 27L40 21" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M32 34L35 37L40 31" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  trash: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M9 12H39" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M19 5H29" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M34 12L32 39C31.8 41.2 29.9 43 27.7 43H20.3C18.1 43 16.2 41.2 16 39L14 12" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 19V34M28 19V34" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`
};

const DETAIL_AI_REQUEST_TIMEOUT_MS = 45000;

/* ==========================================================================
   [区域标注·已完成·独立地图详情页]
   说明：详情页使用真实图片画布承载地图；右下角新增 AI 自动生成地点、多选地点、删除地点、手动重新生成地图按钮。
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
          <svg viewBox="0 0 48 48" fill="none">
            <path d="M31 36L19 24L31 12" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <h1 class="map-detail-title">${escapeHtml(mapData.name)}</h1>
        <button class="map-detail-btn" id="map-detail-add-point" title="添加地点">
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

      <!-- [区域标注·已完成·详情页地点坐标详情卡片]
           说明：单击地点图标后显示地点名称、描述与坐标；若地点靠近页面顶部，卡片自动显示在地点下方，避免挡住坐标本身。 -->
      <div class="map-point-info-card is-hidden" id="map-point-info-card">
        <div class="map-point-info-title" id="map-point-info-title"></div>
        <div class="map-point-info-desc" id="map-point-info-desc"></div>
      </div>

      <!-- [区域标注·已完成·详情页右下角浮动操作按钮]
           说明：从上到下依次为编辑地点与比例尺、AI 自动生成新地点、多选地点、删除已选地点、重新生成地图。 -->
      <button class="map-detail-fab map-detail-edit-btn" id="map-detail-edit" type="button" title="编辑地点与比例尺" aria-label="编辑地点与比例尺">
        ${DETAIL_ICONS.edit}
      </button>

      <button class="map-detail-fab map-detail-ai-points-btn" id="map-detail-ai-points" type="button" title="AI自动生成新地点" aria-label="AI自动生成新地点">
        ${DETAIL_ICONS.ai}
      </button>

      <button class="map-detail-fab map-detail-multi-btn" id="map-detail-multi-select" type="button" title="多选地点" aria-label="多选地点">
        ${DETAIL_ICONS.multi}
      </button>

      <button class="map-detail-fab map-detail-delete-points-btn is-hidden" id="map-detail-delete-selected" type="button" title="删除选中地点" aria-label="删除选中地点">
        ${DETAIL_ICONS.trash}
      </button>

      <!-- [区域标注·已完成·详情页手动重新生成地图按钮] 右下角磨砂透明圆形按钮；不点击则地图保持原样 -->
      <button class="map-detail-fab map-detail-regen-btn" id="map-detail-regenerate" type="button" title="重新生成地图" aria-label="重新生成地图">
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

      <!-- [区域标注·已完成·详情页编辑地点与比例尺弹窗]
           说明：
           1. 弹窗顶部可自定义比例尺显示单位，例如“千米 / km”，只影响显示文本，不改变底层米制距离计算。
           2. 下方使用 iPhone 风格开关切换“一次性展示所有地点编辑窗”或“只选择一个地点编辑”。
           3. 保存后通过 persistMapData 写入 IndexedDB，不使用 localStorage/sessionStorage 或双份兜底存储。 -->
      <div class="map-modal-mask is-hidden" id="map-detail-edit-modal">
        <div class="map-modal-panel map-detail-edit-panel">
          <div class="map-modal-title">编辑地点与比例尺</div>

          <div class="map-detail-edit-section">
            <div class="map-detail-edit-section-title">比例尺显示单位</div>
            <div class="map-detail-unit-grid">
              <div class="map-modal-field">
                <label class="map-modal-label">单位名称</label>
                <input type="text" class="map-input" id="map-detail-unit-name" placeholder="例如：千米" />
              </div>
              <div class="map-modal-field">
                <label class="map-modal-label">单位符号</label>
                <input type="text" class="map-input" id="map-detail-unit-symbol" placeholder="例如：km" />
              </div>
            </div>
          </div>

          <div class="map-detail-edit-section">
            <div class="map-detail-edit-switch-row">
              <div>
                <div class="map-detail-edit-section-title">地点编辑</div>
                <div class="map-detail-edit-tip">开启后一次性展示所有地点名称和描述编辑窗</div>
              </div>
              <button class="map-ios-switch" id="map-detail-edit-all-toggle" type="button" role="switch" aria-checked="false">
                <span></span>
              </button>
            </div>

            <div class="map-detail-edit-point-picker" id="map-detail-edit-point-picker"></div>
            <div class="map-detail-edit-points" id="map-detail-edit-points"></div>
          </div>

          <div class="map-modal-hint" id="map-detail-edit-hint"></div>

          <div class="map-modal-actions">
            <button class="map-btn map-btn-cancel" id="map-detail-edit-cancel" type="button">取消</button>
            <button class="map-btn map-btn-confirm" id="map-detail-edit-save" type="button">保存</button>
          </div>
        </div>
      </div>

      <!-- [区域标注·已完成·详情页AI自动生成新地点弹窗]
           说明：
           1. 默认优先选择创建当前地图时绑定的 sourceWorldBookId；若已删除，则随机显示一本局部世界书。
           2. 只发送已开启世界书条目的标题和内容给副 API。
           3. 点击“生成地点”后只调用副 API 一次，一次性生成 5 个地点（名称 + 描述）并直接写入 IndexedDB。 -->
      <div class="map-modal-mask is-hidden" id="map-detail-ai-modal">
        <div class="map-modal-panel map-ai-modal-panel">
          <div class="map-modal-title">AI自动生成新地点</div>

          <div class="map-modal-field">
            <label class="map-modal-label">选择局部世界书</label>
            <div class="map-dropdown" id="map-detail-ai-worldbook-dropdown">
              <button class="map-dropdown-head" id="map-detail-ai-worldbook-head" type="button">
                <span class="map-dropdown-val" id="map-detail-ai-worldbook-val">请选择局部世界书</span>
                <svg viewBox="0 0 48 48" fill="none" class="map-dropdown-arrow" aria-hidden="true"><path d="M36 18L24 30L12 18" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
              <div class="map-dropdown-body is-hidden" id="map-detail-ai-worldbook-body">
                <div class="map-dropdown-list map-ai-worldbook-list" id="map-detail-ai-worldbook-list"></div>
              </div>
            </div>
          </div>

          <div class="map-ai-status" id="map-detail-ai-status">选择世界书后点击生成，将只调用副 API 一次并直接添加 5 个新地点。</div>
          <div class="map-ai-locations-preview is-hidden" id="map-detail-ai-preview"></div>
          <div class="map-modal-hint" id="map-detail-ai-hint"></div>

          <div class="map-modal-actions">
            <button class="map-btn map-btn-cancel" id="map-detail-ai-cancel" type="button">取消</button>
            <button class="map-btn map-btn-confirm" id="map-detail-ai-confirm" type="button">生成地点</button>
          </div>
        </div>
      </div>

      <!-- [区域标注·已完成·详情页删除选中地点确认弹窗] 多选后删除图标进入应用内确认弹窗，不使用浏览器原生 confirm。 -->
      <div class="map-modal-mask is-hidden" id="map-detail-delete-points-modal">
        <div class="map-modal-panel map-delete-category-panel">
          <div class="map-modal-title">删除地点</div>
          <div class="map-delete-category-text" id="map-detail-delete-points-text">确认删除已选地点吗？</div>
          <div class="map-delete-category-tip">删除后会立即同步到这张地图的 IndexedDB 数据。</div>
          <div class="map-modal-actions">
            <button class="map-btn map-btn-cancel" id="map-detail-delete-points-cancel" type="button">取消</button>
            <button class="map-btn map-btn-danger" id="map-detail-delete-points-confirm" type="button">删除</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

/* ==========================================================================
   [区域标注·已完成·地点标记渲染与真实距离/描述展示]
   说明：地点以进一步放大的定位图标和名称显示；单击地点显示应用内坐标详情卡片，连续点击两个地点显示真实距离。
   ========================================================================== */
function renderMarkers(container, mapData, options = {}) {
  const markersEl = container.querySelector('#map-detail-markers');
  if (!markersEl) return;

  const points = Array.isArray(mapData.points) ? mapData.points : [];
  const selectedSet = options.selectedPointIds instanceof Set ? options.selectedPointIds : new Set();
  const selectionMode = options.selectionMode === true;

  markersEl.innerHTML = points.map((p) => {
    const realX = Number(p.realXMeter || 0).toFixed(1);
    const realY = Number(p.realYMeter || 0).toFixed(1);
    const selectedClass = selectedSet.has(p.id) ? 'is-selected' : '';
    const selectableClass = selectionMode ? 'is-selectable' : '';
    return `
      <div class="map-point-marker ${selectedClass} ${selectableClass}" data-point-id="${escapeHtml(p.id)}" style="left: ${p.x}%; top: ${p.y}%;" aria-label="${escapeHtml(p.name)}，坐标 ${realX} 米，${realY} 米">
        <div class="map-point-icon" aria-hidden="true">
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
  const editBtn = container.querySelector('#map-detail-edit');
  const aiPointsBtn = container.querySelector('#map-detail-ai-points');
  const multiSelectBtn = container.querySelector('#map-detail-multi-select');
  const deleteSelectedBtn = container.querySelector('#map-detail-delete-selected');

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

  const editModal = container.querySelector('#map-detail-edit-modal');
  const editCancelBtn = container.querySelector('#map-detail-edit-cancel');
  const editSaveBtn = container.querySelector('#map-detail-edit-save');
  const editUnitNameInput = container.querySelector('#map-detail-unit-name');
  const editUnitSymbolInput = container.querySelector('#map-detail-unit-symbol');
  const editAllToggle = container.querySelector('#map-detail-edit-all-toggle');
  const editPointPicker = container.querySelector('#map-detail-edit-point-picker');
  const editPointsEl = container.querySelector('#map-detail-edit-points');
  const editHintEl = container.querySelector('#map-detail-edit-hint');

  const aiModal = container.querySelector('#map-detail-ai-modal');
  const aiCancelBtn = container.querySelector('#map-detail-ai-cancel');
  const aiConfirmBtn = container.querySelector('#map-detail-ai-confirm');
  const aiStatusEl = container.querySelector('#map-detail-ai-status');
  const aiHintEl = container.querySelector('#map-detail-ai-hint');
  const aiPreviewEl = container.querySelector('#map-detail-ai-preview');
  const aiWorldbookHead = container.querySelector('#map-detail-ai-worldbook-head');
  const aiWorldbookBody = container.querySelector('#map-detail-ai-worldbook-body');
  const aiWorldbookVal = container.querySelector('#map-detail-ai-worldbook-val');
  const aiWorldbookList = container.querySelector('#map-detail-ai-worldbook-list');

  const deletePointsModal = container.querySelector('#map-detail-delete-points-modal');
  const deletePointsText = container.querySelector('#map-detail-delete-points-text');
  const deletePointsCancel = container.querySelector('#map-detail-delete-points-cancel');
  const deletePointsConfirm = container.querySelector('#map-detail-delete-points-confirm');

  let tempPoint = { x: 50, y: 50 };
  let selectedPointId = null;
  let selectionMode = false;
  let selectedPointIds = new Set();
  let editShowAllPoints = false;
  let editSelectedPointId = '';

  let localBooks = [];
  let selectedBookId = '';
  let aiBusy = false;

  const renderAllMarkers = () => {
    renderMarkers(container, mapData, { selectionMode, selectedPointIds });
  };

  const closeAllDetailDropdowns = (except = null) => {
    [aiWorldbookBody].forEach((dropdown) => {
      if (dropdown && dropdown !== except) dropdown.classList.add('is-hidden');
    });
  };

  const setAiHint = (text) => {
    if (aiHintEl) aiHintEl.textContent = text || '';
  };

  const setAiStatus = (text) => {
    if (aiStatusEl) aiStatusEl.textContent = text || '';
  };

  const getDisplayDistanceUnit = () => {
    const scale = mapData.distanceScale && typeof mapData.distanceScale === 'object' ? mapData.distanceScale : {};
    return {
      name: String(scale.displayUnitName || '').trim(),
      symbol: String(scale.displayUnitSymbol || '').trim()
    };
  };

  const formatMetersByDisplayUnit = (meters, mode = 'distance') => {
    const unit = getDisplayDistanceUnit();
    const symbol = unit.symbol || (mode === 'scale' ? 'm' : '米');
    const numeric = Number(meters || 0);

    if (!unit.symbol && !unit.name) {
      if (mode === 'scale') return numeric >= 1000 ? `${(numeric / 1000).toFixed(2)}km` : `${numeric}m`;
      return numeric >= 1000 ? `${(numeric / 1000).toFixed(2)}公里` : `${numeric.toFixed(1)}米`;
    }

    const value = symbol.toLowerCase() === 'km' || unit.name === '千米' || unit.name === '公里'
      ? numeric / 1000
      : numeric;
    const fixed = Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(2).replace(/\.?0+$/, '');
    return `${fixed}${symbol || unit.name}`;
  };

  const updateDeleteSelectedButton = () => {
    if (!deleteSelectedBtn) return;
    if (!selectionMode || selectedPointIds.size === 0) {
      deleteSelectedBtn.classList.add('is-hidden');
      deleteSelectedBtn.disabled = true;
      return;
    }
    deleteSelectedBtn.classList.remove('is-hidden');
    deleteSelectedBtn.disabled = false;
    deleteSelectedBtn.title = `删除已选地点（${selectedPointIds.size}）`;
    deleteSelectedBtn.setAttribute('aria-label', `删除已选地点（${selectedPointIds.size}）`);
  };

  const setSelectionMode = (nextMode) => {
    selectionMode = nextMode === true;
    multiSelectBtn?.classList.toggle('is-active', selectionMode);

    if (!selectionMode) {
      selectedPointIds.clear();
    }

    selectedPointId = null;
    if (distanceTextEl) distanceTextEl.textContent = '';
    hidePointInfo();
    updateDeleteSelectedButton();
    renderAllMarkers();
  };

  const getPointDistanceMeters = (a, b) => {
    if (!a || !b) return 0;
    const dx = Number(a.realXMeter || 0) - Number(b.realXMeter || 0);
    const dy = Number(a.realYMeter || 0) - Number(b.realYMeter || 0);
    return Math.sqrt(dx * dx + dy * dy);
  };

  const formatDistance = (meters) => formatMetersByDisplayUnit(meters, 'distance');

  const updateScaleText = () => {
    if (!scaleMainEl) return;
    const metersPerPixel = Number(mapData.distanceScale?.metersPerPixel || 1);
    scaleMainEl.textContent = `比例尺：1px ≈ ${formatMetersByDisplayUnit(metersPerPixel, 'scale')}`;
  };

  const hidePointInfo = () => {
    if (!pointInfoCard) return;
    pointInfoCard.classList.add('is-hidden');
  };

  const positionPointInfoCard = (markerEl) => {
    if (!pointInfoCard || !pageEl || !markerEl) return;

    const pageRect = pageEl.getBoundingClientRect();
    const markerRect = markerEl.getBoundingClientRect();
    const cardWidth = 238;
    const cardHeight = pointInfoCard.offsetHeight || 92;
    const centerX = markerRect.left - pageRect.left + (markerRect.width / 2);
    const markerTop = markerRect.top - pageRect.top;
    const markerBottom = markerRect.bottom - pageRect.top;
    const shouldShowBelow = markerTop < 132;

    const left = clamp(centerX - (cardWidth / 2), 12, Math.max(12, pageRect.width - cardWidth - 12));
    let top = shouldShowBelow ? markerBottom + 12 : markerTop - cardHeight - 12;
    top = clamp(top, 72, Math.max(72, pageRect.height - cardHeight - 16));

    pointInfoCard.style.left = `${left}px`;
    pointInfoCard.style.right = 'auto';
    pointInfoCard.style.top = `${top}px`;
  };

  const showPointInfo = (point, markerEl) => {
    if (!point || !pointInfoCard) return;
    if (pointInfoTitle) pointInfoTitle.textContent = point.name || '未命名地点';
    if (pointInfoDesc) {
      const realX = Number(point.realXMeter || 0).toFixed(1);
      const realY = Number(point.realYMeter || 0).toFixed(1);
      pointInfoDesc.textContent = `${point.description || '暂无描述'}｜坐标：${realX}m, ${realY}m`;
    }
    pointInfoCard.classList.remove('is-hidden');
    positionPointInfoCard(markerEl);
  };

  const handlePointSelection = (pointId) => {
    if (!pointId) return;
    if (selectedPointIds.has(pointId)) {
      selectedPointIds.delete(pointId);
    } else {
      selectedPointIds.add(pointId);
    }
    updateDeleteSelectedButton();
    renderAllMarkers();
  };

  const handlePointClick = (pointId) => {
    const point = (mapData.points || []).find(p => p.id === pointId);
    const markerEl = container.querySelector(`.map-point-marker[data-point-id="${cssEscape(pointId)}"]`);
    if (!point || !markerEl) return;

    showPointInfo(point, markerEl);

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
    if (selectionMode) return;
    selectedPointId = null;
    if (distanceTextEl) distanceTextEl.textContent = '';
    hidePointInfo();
  };

  const closeDeletePointsModal = () => {
    deletePointsModal?.classList.add('is-hidden');
  };

  const openDeletePointsModal = () => {
    if (!selectionMode || selectedPointIds.size === 0 || !deletePointsModal) return;
    if (deletePointsText) {
      deletePointsText.textContent = selectedPointIds.size === 1
        ? '确认删除这个已选地点吗？'
        : `确认删除这 ${selectedPointIds.size} 个已选地点吗？`;
    }
    deletePointsModal.classList.remove('is-hidden');
  };

  const selectedBook = () => localBooks.find(book => book.id === selectedBookId) || null;

  const renderAiWorldbookOptions = () => {
    if (!aiWorldbookList) return;

    if (!localBooks.length) {
      aiWorldbookList.innerHTML = '<div class="map-ai-empty">暂无局部世界书</div>';
      if (aiWorldbookVal) aiWorldbookVal.textContent = '暂无局部世界书';
      return;
    }

    if (!selectedBookId) selectedBookId = chooseDefaultWorldBookId(localBooks, mapData.sourceWorldBookId);
    const book = selectedBook();
    if (aiWorldbookVal) aiWorldbookVal.textContent = book?.name || '请选择局部世界书';

    aiWorldbookList.innerHTML = localBooks.map((bookItem) => {
      const activeClass = bookItem.id === selectedBookId ? 'is-active' : '';
      const count = getEnabledWorldBookEntries(bookItem).length;
      return `<button class="map-dropdown-item ${activeClass}" data-wb-id="${escapeHtml(bookItem.id)}" type="button">
        <span>${escapeHtml(bookItem.name || '未命名世界书')}</span>
        <small>${count} 开启条目</small>
      </button>`;
    }).join('');

    aiWorldbookList.querySelectorAll('.map-dropdown-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        selectedBookId = item.dataset.wbId || '';
        if (aiPreviewEl) {
          aiPreviewEl.classList.add('is-hidden');
          aiPreviewEl.innerHTML = '';
        }
        if (aiConfirmBtn) aiConfirmBtn.textContent = '生成地点';
        setAiStatus('已选择世界书，点击生成后将只调用副 API 一次并直接添加 5 个新地点。');
        setAiHint('');
        closeAllDetailDropdowns();
        renderAiWorldbookOptions();
      });
    });
  };

  const renderAiLocationsPreview = (locations = []) => {
    if (!aiPreviewEl) return;

    if (!locations.length) {
      aiPreviewEl.innerHTML = '';
      aiPreviewEl.classList.add('is-hidden');
      return;
    }

    aiPreviewEl.classList.remove('is-hidden');
    aiPreviewEl.innerHTML = `
      <div class="map-ai-location-title">已添加的 5 个地点</div>
      <div class="map-ai-location-list">
        ${locations.map((location, index) => `
          <div class="map-ai-location-item">
            <span>${escapeHtml(location.name || `地点${index + 1}`)}</span>
            <small>${escapeHtml(location.description || '暂无描述')}</small>
          </div>
        `).join('')}
      </div>
    `;
  };

  const closeAiPointsModal = () => {
    aiModal?.classList.add('is-hidden');
    closeAllDetailDropdowns();
  };

  /* ==========================================================================
     [区域标注·已完成·详情页编辑地点与比例尺交互]
     说明：编辑弹窗只读写当前 mapData，并通过 persistMapData 同步 IndexedDB；无 Web Storage 兜底。
     ========================================================================== */
  const setEditHint = (text) => {
    if (editHintEl) editHintEl.textContent = text || '';
  };

  const renderEditPointPicker = () => {
    if (!editPointPicker) return;
    const points = Array.isArray(mapData.points) ? mapData.points : [];

    if (editShowAllPoints || !points.length) {
      editPointPicker.innerHTML = points.length ? '' : '<div class="map-detail-edit-empty">当前地图暂无地点</div>';
      return;
    }

    if (!editSelectedPointId || !points.some(point => point.id === editSelectedPointId)) {
      editSelectedPointId = points[0]?.id || '';
    }

    editPointPicker.innerHTML = points.map((point) => {
      const activeClass = point.id === editSelectedPointId ? 'is-active' : '';
      return `<button class="map-detail-edit-point-tab ${activeClass}" data-point-id="${escapeHtml(point.id)}" type="button">${escapeHtml(point.name || '未命名地点')}</button>`;
    }).join('');

    editPointPicker.querySelectorAll('.map-detail-edit-point-tab').forEach((item) => {
      item.addEventListener('click', () => {
        editSelectedPointId = item.dataset.pointId || '';
        renderEditPointPicker();
        renderEditPointEditors();
      });
    });
  };

  const renderEditPointEditors = () => {
    if (!editPointsEl) return;
    const points = Array.isArray(mapData.points) ? mapData.points : [];
    const editablePoints = editShowAllPoints
      ? points
      : points.filter(point => point.id === editSelectedPointId);

    if (!editablePoints.length) {
      editPointsEl.innerHTML = '<div class="map-detail-edit-empty">请选择一个地点进行编辑</div>';
      return;
    }

    editPointsEl.innerHTML = editablePoints.map((point, index) => `
      <div class="map-detail-edit-point-card" data-point-id="${escapeHtml(point.id)}">
        <div class="map-detail-edit-point-title">${escapeHtml(point.name || `地点${index + 1}`)}</div>
        <div class="map-modal-field">
          <label class="map-modal-label">地点名称</label>
          <input type="text" class="map-input map-detail-edit-point-name" value="${escapeHtml(point.name || '')}" placeholder="请输入地点名称" />
        </div>
        <div class="map-modal-field">
          <label class="map-modal-label">描述地点</label>
          <textarea class="map-textarea map-detail-edit-point-desc" placeholder="请输入地点描述...">${escapeHtml(point.description || '')}</textarea>
        </div>
      </div>
    `).join('');
  };

  const renderEditModalContent = () => {
    if (editAllToggle) {
      editAllToggle.classList.toggle('is-on', editShowAllPoints);
      editAllToggle.setAttribute('aria-checked', editShowAllPoints ? 'true' : 'false');
    }
    renderEditPointPicker();
    renderEditPointEditors();
  };

  const openEditModal = () => {
    const unit = getDisplayDistanceUnit();
    if (editUnitNameInput) editUnitNameInput.value = unit.name || '';
    if (editUnitSymbolInput) editUnitSymbolInput.value = unit.symbol || '';
    const points = Array.isArray(mapData.points) ? mapData.points : [];
    editSelectedPointId = points[0]?.id || '';
    editShowAllPoints = false;
    setEditHint('');
    renderEditModalContent();
    editModal?.classList.remove('is-hidden');
  };

  const closeEditModal = () => {
    editModal?.classList.add('is-hidden');
    setEditHint('');
  };

  const saveEditModal = async () => {
    const unitName = editUnitNameInput?.value?.trim() || '';
    const unitSymbol = editUnitSymbolInput?.value?.trim() || '';

    if (!mapData.distanceScale || typeof mapData.distanceScale !== 'object') {
      mapData.distanceScale = {};
    }
    mapData.distanceScale.displayUnitName = unitName;
    mapData.distanceScale.displayUnitSymbol = unitSymbol;

    const cards = Array.from(editPointsEl?.querySelectorAll('.map-detail-edit-point-card') || []);
    for (const card of cards) {
      const pointId = card.dataset.pointId || '';
      const point = (mapData.points || []).find(item => item.id === pointId);
      if (!point) continue;

      const nextName = card.querySelector('.map-detail-edit-point-name')?.value?.trim() || '';
      const nextDesc = card.querySelector('.map-detail-edit-point-desc')?.value?.trim() || '';

      if (!nextName) {
        setEditHint('地点名称不能为空');
        return;
      }

      point.name = nextName;
      point.description = nextDesc;
    }

    await persistMapData(context.db, state);
    updateScaleText();
    if (distanceTextEl) distanceTextEl.textContent = '';
    selectedPointId = null;
    hidePointInfo();
    renderAllMarkers();
    closeEditModal();
  };

  const openAiPointsModal = async () => {
    localBooks = await loadLocalWorldBooksFromDb(context.db);
    selectedBookId = chooseDefaultWorldBookId(localBooks, mapData.sourceWorldBookId);
    aiBusy = false;

    setAiHint('');
    setAiStatus(localBooks.length
      ? '选择世界书后点击生成，将只调用副 API 一次并直接添加 5 个新地点。'
      : '暂无局部世界书，请先在世情应用创建或导入局部世界书。');

    if (aiConfirmBtn) {
      aiConfirmBtn.textContent = '生成地点';
      aiConfirmBtn.disabled = !localBooks.length;
      aiConfirmBtn.classList.remove('is-loading');
    }

    if (aiPreviewEl) {
      aiPreviewEl.classList.add('is-hidden');
      aiPreviewEl.innerHTML = '';
    }

    renderAiWorldbookOptions();
    aiModal?.classList.remove('is-hidden');
  };

  updateScaleText();
  renderAllMarkers();
  updateDeleteSelectedButton();

  /* ==========================================================================
     [区域标注·已完成·地图详情页完整适配与缩放边界]
     说明：以图片真实宽高计算完整适配比例；双指缩放和单指平移后始终约束在可查看完整地图的范围内。
     ========================================================================== */
  if (viewportEl && canvasEl && imageEl && pageEl) {
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
       说明：地点确认后默认落在地图中心；长按地点图标 450ms 后可拖动，松手后写入 IndexedDB。多选模式下不触发拖动。
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

      if (!pointInfoCard?.classList.contains('is-hidden') && selectedPointId) {
        const markerEl = container.querySelector(`.map-point-marker[data-point-id="${cssEscape(selectedPointId)}"]`);
        if (markerEl) positionPointInfoCard(markerEl);
      }
    };

    const fitMapToViewport = () => {
      const rect = viewportEl.getBoundingClientRect();
      const viewportWidth = rect.width || 1;
      const viewportHeight = rect.height || 1;

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
      if (fitFrameId) cancelAnimationFrame(fitFrameId);

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
        renderAllMarkers();
      }
    };

    const handleMarkerPointerDown = (e) => {
      const marker = e.target.closest?.('.map-point-marker');
      if (!marker || selectionMode) return;

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

      if (!pendingPointId) return;

      e.preventDefault();
      e.stopPropagation();

      if (selectionMode) {
        handlePointSelection(pendingPointId);
        return;
      }

      handlePointClick(pendingPointId);
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
      if (e.target.closest?.('.map-point-marker') || e.target.closest?.('.map-detail-top-bar') || e.target.closest?.('.map-detail-scale-panel') || e.target.closest?.('.map-point-info-card') || e.target.closest?.('.map-detail-fab')) return;
      clearDistanceWhenTapMap();
    });

    viewportEl.addEventListener('touchstart', (e) => {
      if (!modal.classList.contains('is-hidden') || !editModal.classList.contains('is-hidden') || !aiModal.classList.contains('is-hidden') || !deletePointsModal.classList.contains('is-hidden') || draggingPointId || selectionMode) return;

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
      if (!modal.classList.contains('is-hidden') || !editModal.classList.contains('is-hidden') || !aiModal.classList.contains('is-hidden') || !deletePointsModal.classList.contains('is-hidden') || draggingPointId || selectionMode) return;

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

    viewportEl.addEventListener('touchend', () => {
      clearMarkerPressTimer();

      if (selectionMode) return;

      if (event?.touches?.length < 2) {
        initialPinchDistance = null;
      }
      if (event?.touches?.length === 1) {
        lastTouchX = event.touches[0].clientX;
        lastTouchY = event.touches[0].clientY;
      }
      updateTransform();
    });

    canvasEl.addEventListener('click', (e) => {
      if (hasDraggedMarker) {
        e.preventDefault();
        e.stopPropagation();
        hasDraggedMarker = false;
      }
    }, true);
  }

  // 返回主页
  backBtn?.addEventListener('click', () => {
    onBack();
  });

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

  addPointBtn?.addEventListener('click', openPointModal);
  cancelBtn?.addEventListener('click', closeModal);
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  confirmBtn?.addEventListener('click', async () => {
    const name = inputName.value.trim();
    const desc = inputDesc.value.trim();

    if (!name) {
      hintEl.textContent = '地点名称不能为空';
      return;
    }

    if (!mapData.points) mapData.points = [];
    mapData.points.push(createMapPointDraft(name, desc, tempPoint.x, tempPoint.y, mapData.distanceScale));

    await persistMapData(context.db, state);
    renderAllMarkers();
    closeModal();
  });

  /* ==========================================================================
     [区域标注·已完成·详情页编辑按钮与应用内编辑弹窗]
     说明：编辑比例尺显示单位、单个地点或全部地点名称与描述；保存后直接同步 IndexedDB。
     ========================================================================== */
  editBtn?.addEventListener('click', openEditModal);
  editCancelBtn?.addEventListener('click', closeEditModal);
  editSaveBtn?.addEventListener('click', saveEditModal);
  editModal?.addEventListener('click', (e) => {
    if (e.target === editModal) closeEditModal();
  });
  editAllToggle?.addEventListener('click', () => {
    editShowAllPoints = !editShowAllPoints;
    renderEditModalContent();
  });

  /* ==========================================================================
     [区域标注·已完成·详情页多选地点与删除图标]
     说明：点击“多选”按钮进入图标多选状态；单选/多选地点后点击删除图标，使用应用内确认弹窗删除。
     ========================================================================== */
  multiSelectBtn?.addEventListener('click', () => {
    setSelectionMode(!selectionMode);
  });

  deleteSelectedBtn?.addEventListener('click', openDeletePointsModal);
  deletePointsCancel?.addEventListener('click', closeDeletePointsModal);
  deletePointsModal?.addEventListener('click', (e) => {
    if (e.target === deletePointsModal) closeDeletePointsModal();
  });

  deletePointsConfirm?.addEventListener('click', async () => {
    if (!selectedPointIds.size) return;
    mapData.points = (Array.isArray(mapData.points) ? mapData.points : []).filter(point => !selectedPointIds.has(point.id));
    await persistMapData(context.db, state);
    closeDeletePointsModal();
    setSelectionMode(false);
    renderAllMarkers();
  });

  /* ==========================================================================
     [区域标注·已完成·详情页AI自动生成新地点]
     说明：默认回填当前地图来源世界书；若该世界书已删除则随机显示；仅把已开启条目的标题和内容发送给副 API；点击后只调用一次副 API，并把 5 个新地点直接写入 IndexedDB。
     ========================================================================== */
  aiPointsBtn?.addEventListener('click', openAiPointsModal);

  aiCancelBtn?.addEventListener('click', closeAiPointsModal);
  aiModal?.addEventListener('click', (e) => {
    if (e.target === aiModal) closeAiPointsModal();
  });

  aiWorldbookHead?.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = aiWorldbookBody?.classList.contains('is-hidden');
    closeAllDetailDropdowns(willOpen ? aiWorldbookBody : null);
    aiWorldbookBody?.classList.toggle('is-hidden');
  });

  aiConfirmBtn?.addEventListener('click', async () => {
    if (aiBusy) return;

    const book = selectedBook();
    if (!book) {
      setAiHint('请先选择局部世界书');
      return;
    }

    aiBusy = true;
    aiConfirmBtn.disabled = true;
    aiConfirmBtn.classList.add('is-loading');
    setAiHint('');
    setAiStatus('正在调用副 API 一次性生成并添加 5 个新地点，最长等待 45 秒...');

    try {
      const payload = await requestMapLocationsBySecondaryApi(context, book, mapData);
      const generatedLocations = normalizeGeneratedLocations(payload);
      const positions = distributeNewPointPositions(mapData.points || [], generatedLocations.length);

      if (!Array.isArray(mapData.points)) mapData.points = [];
      generatedLocations.forEach((location, index) => {
        const pos = positions[index] || { x: 50, y: 50 };
        mapData.points.push(createMapPointDraft(location.name, location.description, pos.x, pos.y, mapData.distanceScale));
      });

      await persistMapData(context.db, state);
      renderAllMarkers();
      renderAiLocationsPreview(generatedLocations);
      setAiStatus('已成功添加 5 个新地点，并同步写入当前地图 IndexedDB。');
      closeAiPointsModal();
    } catch (error) {
      console.error('[Map] 详情页 AI 自动生成地点失败:', error);
      setAiHint(error?.message || 'AI生成地点失败，请检查副 API 设置');
      setAiStatus('生成失败，请检查副 API 配置后重试。');
    } finally {
      aiBusy = false;
      aiConfirmBtn.disabled = false;
      aiConfirmBtn.classList.remove('is-loading');
    }
  });

  /* ==========================================================================
     [区域标注·已完成·详情页手动重新生成地图]
     说明：只有点击右下角按钮时才重新生成当前地图；同步更新详情图片与主页封面数据。
     ========================================================================== */
  regenerateBtn?.addEventListener('click', async () => {
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

/* ==========================================================================
   [区域标注·已完成·详情页世界书读取与开启条目精简区]
   说明：只读取 IndexedDB 中的局部世界书；发送给详情页地点 AI 时，只保留已开启条目的标题和内容。
   ========================================================================== */
async function loadLocalWorldBooksFromDb(db) {
  try {
    const all = await db?.getAll?.('appsData');
    const record = all?.find(item => item?.id === 'worldbook::all-books');
    const books = Array.isArray(record?.value) ? record.value : (Array.isArray(record?.data) ? record.data : []);
    return books
      .filter(book => book?.type === 'local')
      .map(book => ({
        id: String(book.id || ''),
        name: String(book.name || '未命名世界书'),
        entries: Array.isArray(book.entries) ? book.entries : []
      }))
      .filter(book => book.id);
  } catch (error) {
    console.error('[Map] 详情页读取局部世界书失败:', error);
    return [];
  }
}

function chooseDefaultWorldBookId(books, preferredBookId) {
  const list = Array.isArray(books) ? books : [];
  if (!list.length) return '';
  if (preferredBookId && list.some(book => book.id === preferredBookId)) return preferredBookId;
  const randomIndex = Math.floor(Math.random() * list.length);
  return list[randomIndex]?.id || list[0]?.id || '';
}

function getEnabledWorldBookEntries(book) {
  return (Array.isArray(book?.entries) ? book.entries : [])
    .filter(entry => entry && entry.enabled !== false)
    .map((entry, index) => ({
      title: String(entry.title || entry.name || `条目${index + 1}`).trim() || `条目${index + 1}`,
      content: String(entry.content || entry.text || entry.description || '').trim()
    }))
    .filter(entry => entry.title || entry.content);
}

function buildWorldBookPlainText(book) {
  const entries = getEnabledWorldBookEntries(book);
  if (!entries.length) return '';

  return [
    `世界书名称：${book?.name || '未命名世界书'}`,
    ...entries.map((entry, index) => [
      `条目${index + 1}：${entry.title}`,
      entry.content ? `内容：${entry.content}` : ''
    ].filter(Boolean).join('\n'))
  ].join('\n\n');
}

/* ==========================================================================
   [区域标注·已完成·详情页地点AI副API调用区]
   说明：
   1. 只读取 settings.api.secondary；不回退主 API。
   2. 只发送已开启条目的标题和内容。
   3. 每次点击只发起一次副 API 请求，并要求一次性返回 5 个地点（名称 + 描述）。
   ========================================================================== */
function trimSlash(value = '') {
  return String(value || '').replace(/\/+$/, '');
}

function normalizeSecondaryApiProfile(apiSettings = {}) {
  const secondary = apiSettings?.secondary && typeof apiSettings.secondary === 'object' ? apiSettings.secondary : {};
  const defaultBaseUrlMap = {
    openai: 'https://api.openai.com/v1',
    deepseek: 'https://api.deepseek.com/v1',
    gemini: 'https://generativelanguage.googleapis.com/v1beta',
    claude: 'https://api.anthropic.com/v1'
  };
  const provider = ['openai', 'deepseek', 'gemini', 'claude'].includes(String(secondary.provider || '').trim())
    ? String(secondary.provider || '').trim()
    : 'gemini';

  return {
    provider,
    apiKey: String(secondary.apiKey || '').trim(),
    baseUrl: trimSlash(secondary.baseUrl || defaultBaseUrlMap[provider]),
    model: String(secondary.model || '').trim()
  };
}

function extractApiErrorMessage(payload, fallback = '副 API 请求失败') {
  if (!payload) return fallback;
  const message = typeof payload === 'string'
    ? payload
    : payload?.error?.message ||
      payload?.error?.msg ||
      payload?.message ||
      payload?.detail ||
      payload?.msg ||
      fallback;
  return `副 API 服务端返回错误：${message}`;
}

function getDetailAiTemperature(global = {}) {
  const configured = Number(global.temperature ?? 0.2);
  const safeValue = Number.isFinite(configured) ? configured : 0.2;
  return Math.max(0, Math.min(0.35, safeValue));
}

function getDetailAiMaxTokens(global = {}) {
  const configured = Number(global.maxTokens ?? 900);
  const safeValue = Number.isFinite(configured) ? configured : 900;
  return Math.max(700, Math.min(1200, safeValue));
}

async function fetchDetailAiJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DETAIL_AI_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    const payload = await response.json().catch(() => null);
    return { response, payload };
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('副 API 超过 45 秒未响应，已停止等待，请稍后重试或更换更快的副 API 模型。');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function extractAiText(payload) {
  return payload?.choices?.[0]?.message?.content ||
    payload?.candidates?.[0]?.content?.parts?.map(part => part?.text || '').join('') ||
    payload?.content?.map(part => part?.text || '').join('') ||
    payload?.text ||
    '';
}

function extractJsonObject(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const source = fenced || raw;

  try {
    return JSON.parse(source);
  } catch {}

  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(source.slice(start, end + 1));
    } catch {}
  }
  return null;
}

async function requestMapLocationsBySecondaryApi(context, book, mapData) {
  const allSettings = await context.settings?.getAll?.();
  const profile = normalizeSecondaryApiProfile(allSettings?.api || {});
  const global = allSettings?.api?.global || {};
  const temperature = getDetailAiTemperature(global);
  const maxTokens = getDetailAiMaxTokens(global);

  if (!profile.apiKey) throw new Error('副 API Key 不能为空');
  if (!profile.model) throw new Error('请先在设置应用选择副 API 模型');

  const promptText = buildDetailAiPrompt(book, mapData);
  if (!promptText) throw new Error('该局部世界书没有开启条目，无法生成新地点');

  if (profile.provider === 'gemini') {
    const { response, payload } = await fetchDetailAiJson(`${trimSlash(profile.baseUrl)}/models/${encodeURIComponent(profile.model)}:generateContent?key=${encodeURIComponent(profile.apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: promptText }] }],
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
          responseMimeType: 'application/json'
        }
      })
    });
    if (!response.ok) throw new Error(extractApiErrorMessage(payload, `副 API 请求失败（HTTP ${response.status}）`));
    const aiText = extractAiText(payload);
    if (!String(aiText || '').trim()) throw new Error('副 API 返回为空，请检查模型是否可用');
    const parsed = extractJsonObject(aiText);
    if (!parsed) throw new Error('副 API 没有返回有效 JSON，可能是模型输出了说明文字或响应被截断');
    return parsed;
  }

  if (profile.provider === 'claude') {
    const { response, payload } = await fetchDetailAiJson(`${trimSlash(profile.baseUrl)}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': profile.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: profile.model,
        max_tokens: maxTokens,
        temperature,
        messages: [{ role: 'user', content: promptText }]
      })
    });
    if (!response.ok) throw new Error(extractApiErrorMessage(payload, `副 API 请求失败（HTTP ${response.status}）`));
    const aiText = extractAiText(payload);
    if (!String(aiText || '').trim()) throw new Error('副 API 返回为空，请检查模型是否可用');
    const parsed = extractJsonObject(aiText);
    if (!parsed) throw new Error('副 API 没有返回有效 JSON，可能是模型输出了说明文字或响应被截断');
    return parsed;
  }

  const { response, payload } = await fetchDetailAiJson(`${trimSlash(profile.baseUrl)}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${profile.apiKey}`
    },
    body: JSON.stringify({
      model: profile.model,
      temperature,
      max_tokens: maxTokens,
      stream: false,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: promptText }]
    })
  });
  if (!response.ok) throw new Error(extractApiErrorMessage(payload, `副 API 请求失败（HTTP ${response.status}）`));
  const aiText = extractAiText(payload);
  if (!String(aiText || '').trim()) throw new Error('副 API 返回为空，请检查模型是否可用');
  const parsed = extractJsonObject(aiText);
  if (!parsed) throw new Error('副 API 没有返回有效 JSON，可能是模型输出了说明文字或响应被截断');
  return parsed;
}

function buildDetailAiPrompt(book, mapData) {
  const worldBookText = buildWorldBookPlainText(book);
  if (!worldBookText) return '';

  const existingNames = (Array.isArray(mapData?.points) ? mapData.points : [])
    .map(point => String(point?.name || '').trim())
    .filter(Boolean);

  return [
    '你是地图应用的地点生成器。请根据局部世界书中已开启条目的标题和内容，为当前地图一次性生成 5 个新地点。',
    '只返回 JSON，不要 Markdown，不要解释，不要输出 JSON 以外的字符。',
    `当前地图名称：${String(mapData?.name || '未命名地图')}`,
    `当前地图分类：${String(mapData?.category || '现代都市')}`,
    `当前地图描述：${String(mapData?.description || '暂无描述')}`,
    existingNames.length ? `当前地图已有地点：${existingNames.join('、')}` : '当前地图还没有地点。',
    'JSON格式：{"locations":[{"name":"地点名称","description":"不超过40字的地点描述"}]}',
    '要求：',
    '1. 必须返回 5 个地点。',
    '2. 每个地点都要与世界书和当前地图相关。',
    '3. 不要与已有地点重名，不要重复。',
    '4. description 不超过 40 字。',
    '5. 只写 name 和 description，不要写坐标。',
    '',
    '局部世界书已开启条目：',
    worldBookText
  ].join('\n');
}

function normalizeGeneratedLocations(payload) {
  const locations = Array.isArray(payload?.locations) ? payload.locations : (Array.isArray(payload?.points) ? payload.points : []);
  const normalized = locations
    .map((item, index) => ({
      name: String(item?.name || `新地点${index + 1}`).trim(),
      description: String(item?.description || item?.desc || '').trim().slice(0, 40)
    }))
    .filter(item => item.name)
    .slice(0, 5);

  if (normalized.length < 5) {
    throw new Error('副 API 未返回完整的 5 个地点，请重试。');
  }

  return normalized;
}

/* ==========================================================================
   [区域标注·已完成·详情页AI地点坐标分散区]
   说明：AI 只生成地点名称和描述；地点坐标由前端自动避让分散，避免与现有图标重叠。
   ========================================================================== */
function distributeNewPointPositions(existingPoints = [], count = 0) {
  const placed = (Array.isArray(existingPoints) ? existingPoints : []).map(point => ({
    x: clamp(Number(point?.x || 0), 6, 94),
    y: clamp(Number(point?.y || 0), 8, 92)
  }));

  const nextPoints = [];
  const total = Math.max(placed.length + count, count, 1);
  const minDistance = total > 12 ? 12 : 14;

  for (let index = 0; index < count; index++) {
    const point = findOpenPosition(placed.length + index, total, placed, minDistance);
    placed.push(point);
    nextPoints.push(point);
  }

  return nextPoints;
}

function getGridPosition(index, count) {
  const cols = Math.ceil(Math.sqrt(Math.max(1, count) * 1.3));
  const rows = Math.ceil(Math.max(1, count) / cols);
  const col = index % cols;
  const row = Math.floor(index / cols);
  return {
    x: 12 + ((col + 0.5) / cols) * 76,
    y: 14 + ((row + 0.5) / rows) * 72
  };
}

function hasNearbyPoint(point, placed, minDistance) {
  return placed.some(item => {
    const dx = item.x - point.x;
    const dy = item.y - point.y;
    return Math.sqrt(dx * dx + dy * dy) < minDistance;
  });
}

function findOpenPosition(index, count, placed, minDistance) {
  const base = getGridPosition(index, count);
  const candidates = [base];

  for (let ring = 1; ring <= 10; ring++) {
    const radius = ring * 5;
    for (let step = 0; step < 12; step++) {
      const angle = ((step / 12) * Math.PI * 2) + (index * 0.61);
      candidates.push({
        x: clamp(base.x + Math.cos(angle) * radius, 8, 92),
        y: clamp(base.y + Math.sin(angle) * radius, 10, 90)
      });
    }
  }

  return candidates.find(candidate => !hasNearbyPoint(candidate, placed, minDistance)) || base;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function cssEscape(value) {
  if (window.CSS && typeof window.CSS.escape === 'function') {
    return window.CSS.escape(value);
  }
  return String(value).replace(/["\\]/g, '\\$&');
}

function escapeHtml(text) {
  const map = { '&': '&', '<': '<', '>': '>', '"': '"', "'": '&#39;' };
  return String(text ?? '').replace(/[&<>"']/g, c => map[c] || c);
}
