/**
 * 文件名: js/apps/map/map-ui.js
 * 用途: 地图应用的 UI 渲染与交互逻辑。
 */
import { persistMapData, createMapDraft } from './map-store.js';
import { generateMapCoverData } from '../../core/services/PollinationsImage.js';
import { buildMapDetailShell, bindMapDetailEvents } from './map-detail.js';

/* ==========================================================================
   [区域标注·已完成·地图骨架与渲染]
   说明：包含主页列表、创建弹窗、编辑弹窗
   ========================================================================== */
export function buildMapShell() {
  return `
    <div class="map-app">
      <div class="map-top-bar">
        <div class="map-top-bar__title-wrap">
          <!-- [地图标题点击返回桌面] 标题文案已改为 Map，点击后通过 EventBus 关闭地图应用返回桌面 -->
          <h1 class="map-title" id="map-title-btn">Map</h1>
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
          
          <!-- [区域标注·已完成·创建地图分类选择与新建分类区域] -->
          <div class="map-modal-field map-category-field">
            <label class="map-modal-label">分类</label>
            <div class="map-category-control">
              <div class="map-dropdown" id="map-category-dropdown">
                <button class="map-dropdown-head" id="map-dropdown-head" type="button">
                  <span class="map-dropdown-val" id="map-dropdown-val">现代都市</span>
                  <!-- IconPark 风格下拉箭头 -->
                  <svg viewBox="0 0 48 48" fill="none" class="map-dropdown-arrow" aria-hidden="true">
                    <path d="M36 18L24 30L12 18" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
                <div class="map-dropdown-body is-hidden" id="map-dropdown-body">
                  <div class="map-dropdown-list" id="map-dropdown-list">
                    <!-- 分类列表动态渲染 -->
                  </div>
                </div>
              </div>
              <button class="map-category-add-btn" id="map-btn-new-cat" type="button" title="新建分类" aria-label="新建分类">
                <!-- IconPark 风格加号 -->
                <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
                  <path d="M24 5V43M5 24H43" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            </div>
            <div class="map-dropdown-new is-hidden" id="map-category-new-wrap">
              <input type="text" class="map-input map-input-small" id="map-category-new-input" placeholder="输入新分类名称" />
              <button class="map-btn map-btn-confirm map-btn-small" id="map-category-new-save" type="button">保存</button>
            </div>
          </div>

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

      <!-- [区域标注·已完成·地图卡片编辑信息弹窗] -->
      <div class="map-modal-mask is-hidden" id="map-edit-modal">
        <div class="map-modal-panel">
          <div class="map-modal-title">编辑地图信息</div>
          
          <div class="map-modal-field">
            <label class="map-modal-label">地图名称</label>
            <input type="text" class="map-input" id="map-edit-name" placeholder="请输入地图名称" />
          </div>
          
          <div class="map-modal-field">
            <label class="map-modal-label">描述地图</label>
            <textarea class="map-textarea" id="map-edit-desc" placeholder="请输入地图描述..."></textarea>
          </div>
          
          <div class="map-modal-hint" id="map-edit-hint"></div>
          
          <div class="map-modal-actions">
            <button class="map-btn map-btn-cancel" id="map-edit-cancel">取消</button>
            <button class="map-btn map-btn-confirm" id="map-edit-confirm">确认</button>
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

  grid.innerHTML = maps.map(m => {
    const bg = m.imageUrl ? `style="background-image: url('${escapeHtml(m.imageUrl)}');"` : '';
    // [区域标注·已修改·卡片封面信息展示] 仅显示名称与分类，不显示描述
    const categoryText = String(m.category || '现代都市');
    return `
      <div class="map-card" data-map-id="${m.id}">
        <div class="map-card-cover" ${bg}></div>
        <div class="map-card-info">
          <div class="map-card-title">${escapeHtml(m.name)}</div>
          <div class="map-card-desc map-card-category">${escapeHtml(categoryText)}</div>
        </div>
      </div>
    `;
  }).join('');
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

  // [区域标注·已完成·创建地图分类 DOM] 自定义分类选择器与新建分类按钮，不使用浏览器原生选择器。
  const dropdownHead = container.querySelector('#map-dropdown-head');
  const dropdownBody = container.querySelector('#map-dropdown-body');
  const dropdownVal = container.querySelector('#map-dropdown-val');
  const dropdownListEl = container.querySelector('#map-dropdown-list');
  const newCatBtn = container.querySelector('#map-btn-new-cat');
  const catNewWrap = container.querySelector('#map-category-new-wrap');
  const catNewInput = container.querySelector('#map-category-new-input');
  const catNewSave = container.querySelector('#map-category-new-save');

  let selectedCategory = '现代都市';

  // 辅助函数：转义 HTML 实体
  function escapeHtml(text) {
    const map = { '&': '&', '<': '<', '>': '>', '"': '"', "'": '&#39;' };
    return String(text ?? '').replace(/[&<>"']/g, c => map[c] || c);
  }

  // [区域标注·已完成·地图标题点击返回桌面事件] 不再模拟旧关闭按钮，统一通过 AppManager 监听的 app:close 事件返回桌面
  if (titleBtn) {
    titleBtn.addEventListener('click', () => {
      context.eventBus?.emit('app:close', { appId: context.appId });
    });
  }

  // [区域标注·已完成·创建地图分类下拉交互]
  if (dropdownHead) {
    dropdownHead.addEventListener('click', (e) => {
      e.stopPropagation();
      if (catNewWrap) catNewWrap.classList.add('is-hidden');
      dropdownBody.classList.toggle('is-hidden');
    });
  }

  // 点击外部收起菜单
  document.addEventListener('click', (e) => {
    if (dropdownBody && !dropdownBody.classList.contains('is-hidden')) {
      const dropdown = container.querySelector('#map-category-dropdown');
      if (dropdown && !dropdown.contains(e.target)) {
        dropdownBody.classList.add('is-hidden');
      }
    }
  });

  // [区域标注·已完成·渲染创建地图分类列表]
  function renderCategories() {
    if (!dropdownListEl) return;
    const cats = Array.isArray(state.categories) && state.categories.length > 0
      ? state.categories
      : ['现代都市', '西方魔幻', '古代宫廷', '古代仙侠', '未来科幻'];

    if (!cats.includes(selectedCategory)) {
      selectedCategory = cats[0] || '现代都市';
    }

    if (dropdownVal) dropdownVal.textContent = selectedCategory;

    dropdownListEl.innerHTML = cats.map(c => {
      const activeClass = c === selectedCategory ? 'is-active' : '';
      return `<button class="map-dropdown-item ${activeClass}" data-cat="${escapeHtml(c)}" type="button">${escapeHtml(c)}</button>`;
    }).join('');

    const items = dropdownListEl.querySelectorAll('.map-dropdown-item');
    items.forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        selectedCategory = item.dataset.cat;
        if (dropdownVal) dropdownVal.textContent = selectedCategory;
        if (dropdownBody) dropdownBody.classList.add('is-hidden');
        if (catNewWrap) catNewWrap.classList.add('is-hidden');
        renderCategories();
      });
    });
  }

  // [区域标注·已完成·新建分类展开交互] 使用应用内输入区域，不使用 prompt。
  if (newCatBtn) {
    newCatBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (dropdownBody) dropdownBody.classList.add('is-hidden');
      if (catNewWrap) catNewWrap.classList.toggle('is-hidden');
      if (catNewInput && catNewWrap && !catNewWrap.classList.contains('is-hidden')) {
        catNewInput.value = '';
        window.requestAnimationFrame(() => catNewInput.focus());
      }
    });
  }

  // [区域标注·已完成·新建分类 IndexedDB 保存] 新分类保存到地图应用数据，方便下次直接选择。
  async function saveNewCategory() {
    const newCat = String(catNewInput?.value || '').trim();
    if (!newCat) {
      hintEl.textContent = '分类名称不能为空';
      return;
    }

    if (!state.categories) state.categories = [];
    if (!state.categories.includes(newCat)) {
      state.categories.push(newCat);
      await persistMapData(context.db, state);
    }

    selectedCategory = newCat;
    if (catNewWrap) catNewWrap.classList.add('is-hidden');
    if (dropdownBody) dropdownBody.classList.add('is-hidden');
    renderCategories();
    hintEl.textContent = '';
  }

  if (catNewSave) {
    catNewSave.addEventListener('click', async (e) => {
      e.stopPropagation();
      await saveNewCategory();
    });
  }

  if (catNewInput) {
    catNewInput.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        await saveNewCategory();
      }
    });
  }

  // 打开弹窗
  if (addBtn && modal) {
    addBtn.addEventListener('click', () => {
      inputName.value = '';
      inputDesc.value = '';
      hintEl.textContent = '';
      if (dropdownBody) dropdownBody.classList.add('is-hidden');
      if (catNewWrap) catNewWrap.classList.add('is-hidden');
      selectedCategory = Array.isArray(state.categories) && state.categories.includes(selectedCategory)
        ? selectedCategory
        : '现代都市';
      renderCategories();
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

      // [区域标注·已完成·带分类创建地图对象]
      const newMap = createMapDraft(name, desc, selectedCategory);
      state.maps.push(newMap);

      // 更新持久化与视图
      await persistMapData(context.db, state);
      renderMapGrid(container, state);
      bindGridEvents(container, state, context);

      closeModal();
    });
  }

  // 初次绑定网格卡片事件
  bindGridEvents(container, state, context);
}

/* ==========================================================================
   [区域标注·已完成·地图卡片事件]
   说明：单击进入详情页，长按编辑地图信息
   ========================================================================== */
function bindGridEvents(container, state, context) {
  const cards = container.querySelectorAll('.map-card');
  const editModal = container.querySelector('#map-edit-modal');
  const editName = container.querySelector('#map-edit-name');
  const editDesc = container.querySelector('#map-edit-desc');
  const editHint = container.querySelector('#map-edit-hint');
  const editCancel = container.querySelector('#map-edit-cancel');
  const editConfirm = container.querySelector('#map-edit-confirm');

  let currentEditMapId = null;

  const closeEditModal = () => {
    if (editModal) editModal.classList.add('is-hidden');
    currentEditMapId = null;
  };

  if (editCancel) editCancel.addEventListener('click', closeEditModal);
  if (editModal) editModal.addEventListener('click', e => {
    if (e.target === editModal) closeEditModal();
  });

  if (editConfirm) {
    // 移除旧事件防止重复绑定
    const newConfirm = editConfirm.cloneNode(true);
    editConfirm.parentNode.replaceChild(newConfirm, editConfirm);
    newConfirm.addEventListener('click', async () => {
      if (!currentEditMapId) return;
      const name = editName.value.trim();
      const desc = editDesc.value.trim();
      if (!name) {
        editHint.textContent = '地图名称不能为空';
        return;
      }
      editHint.textContent = '';

      const mapObj = state.maps.find(m => m.id === currentEditMapId);
      if (mapObj) {
        mapObj.name = name;
        mapObj.description = desc;
        // 只有名称或描述改变且想要重新生成封面时才生成，这里可以保留原图，也可重新生成
        // 如果想按需更新，目前只更新文字信息
        await persistMapData(context.db, state);
        renderMapGrid(container, state);
        bindGridEvents(container, state, context); // 重新绑定
      }
      closeEditModal();
    });
  }

  cards.forEach(card => {
    const mapId = card.dataset.mapId;
    let pressTimer = null;
    let isLongPress = false;

    const startPress = (e) => {
      isLongPress = false;
      pressTimer = setTimeout(() => {
        isLongPress = true;
        // 触发长按编辑
        currentEditMapId = mapId;
        const mapObj = state.maps.find(m => m.id === mapId);
        if (mapObj && editModal) {
          editName.value = mapObj.name || '';
          editDesc.value = mapObj.description || '';
          editHint.textContent = '';
          editModal.classList.remove('is-hidden');
        }
      }, 500); // 500ms 长按
    };

    const cancelPress = () => {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    };

    card.addEventListener('mousedown', startPress);
    card.addEventListener('touchstart', startPress, { passive: true });

    card.addEventListener('mousemove', cancelPress);
    card.addEventListener('touchmove', cancelPress, { passive: true });

    card.addEventListener('mouseup', (e) => {
      cancelPress();
      if (!isLongPress) {
        // 单击：进入详情页
        enterMapDetail(container, state, context, mapId);
      }
    });
    card.addEventListener('touchend', (e) => {
      cancelPress();
      if (!isLongPress) {
        // 单击：进入详情页
        // touchend 时可能也会触发 click，阻止穿透可在需要时 e.preventDefault()，但 passive 为 true 时不可
        enterMapDetail(container, state, context, mapId);
      }
    });
  });
}

function enterMapDetail(container, state, context, mapId) {
  const mapObj = state.maps.find(m => m.id === mapId);
  if (!mapObj) return;

  const appDiv = container.querySelector('.map-app');
  if (appDiv) appDiv.style.display = 'none'; // 隐藏主页

  // 创建详情页容器
  let detailDiv = container.querySelector('.map-detail-wrapper');
  if (!detailDiv) {
    detailDiv = document.createElement('div');
    detailDiv.className = 'map-detail-wrapper';
    container.appendChild(detailDiv);
  }

  detailDiv.innerHTML = buildMapDetailShell(mapObj);
  detailDiv.style.display = 'block';

  // 绑定详情页事件并提供返回回调
  bindMapDetailEvents(detailDiv, mapObj, state, context, () => {
    detailDiv.style.display = 'none';
    detailDiv.innerHTML = ''; // 清理详情页
    if (appDiv) {
      appDiv.style.display = 'block';
      // 返回主页时重新渲染主页以更新可能有变化的标记数量等
      renderMapGrid(container, state);
      bindGridEvents(container, state, context);
    }
  });
}

function escapeHtml(text) {
  const map = { '&': '&', '<': '<', '>': '>', '"': '"', "'": '&#39;' };
  return String(text ?? '').replace(/[&<>"']/g, c => map[c] || c);
}
