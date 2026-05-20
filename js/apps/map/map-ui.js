/**
 * 文件名: js/apps/map/map-ui.js
 * 用途: 地图应用的 UI 渲染与交互逻辑。
 */
import { persistMapData, createMapDraft } from './map-store.js';
import { buildMapDetailShell, bindMapDetailEvents } from './map-detail.js';

/* ==========================================================================
   [区域标注·已完成·地图应用 IconPark 图标集中区]
   说明：地图主页/弹窗按钮统一使用 IconPark 风格 SVG，不使用浏览器原生选择器或原生弹窗。
   ========================================================================== */
const MAP_ICONS = {
  add: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M24 8v32M8 24h32" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`,
  ai: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M24 5l4.9 13.1L42 23l-13.1 4.9L24 41l-4.9-13.1L6 23l13.1-4.9L24 5Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M38 6l1.8 4.2L44 12l-4.2 1.8L38 18l-1.8-4.2L32 12l4.2-1.8L38 6Z" fill="currentColor"/></svg>`,
  arrowDown: `<svg viewBox="0 0 48 48" fill="none" class="map-dropdown-arrow" aria-hidden="true"><path d="M36 18L24 30L12 18" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`
};

const DEFAULT_MAP_CATEGORIES = ['现代都市', '西方魔幻', '古代宫廷', '古代仙侠', '未来科幻'];

/* ==========================================================================
   [区域标注·已完成·地图骨架与渲染]
   说明：包含主页列表、手动创建弹窗、AI 自动生成地图弹窗、编辑弹窗。
   ========================================================================== */
export function buildMapShell() {
  return `
    <div class="map-app">
      <div class="map-top-bar">
        <button class="map-ai-generate-btn" id="map-ai-generate-btn" title="AI自动生成地图" aria-label="AI自动生成地图">
          ${MAP_ICONS.ai}
        </button>
        <div class="map-top-bar__title-wrap">
          <!-- [地图标题点击返回桌面] 标题文案已改为 Map，点击后通过 EventBus 关闭地图应用返回桌面 -->
          <h1 class="map-title" id="map-title-btn">Map</h1>
        </div>
        <button class="map-add-btn" id="map-add-btn" title="创建新地图" aria-label="创建新地图">
          ${MAP_ICONS.add}
        </button>
      </div>
      
      <div class="map-content-scroll">
        <div class="map-grid" id="map-grid-container">
          <!-- 卡片动态渲染在此处 -->
        </div>
      </div>

      <!-- [区域标注·已完成·手动创建地图弹窗] 使用应用内自定义分类选择器，不使用浏览器原生选择器。 -->
      <div class="map-modal-mask is-hidden" id="map-create-modal">
        <div class="map-modal-panel">
          <div class="map-modal-title">创建新地图</div>
          
          <div class="map-modal-field map-category-field">
            <label class="map-modal-label">分类</label>
            <div class="map-category-control">
              <div class="map-dropdown" id="map-category-dropdown">
                <button class="map-dropdown-head" id="map-dropdown-head" type="button">
                  <span class="map-dropdown-val" id="map-dropdown-val">现代都市</span>
                  ${MAP_ICONS.arrowDown}
                </button>
                <div class="map-dropdown-body is-hidden" id="map-dropdown-body">
                  <div class="map-dropdown-list" id="map-dropdown-list"></div>
                </div>
              </div>
              <button class="map-category-add-btn" id="map-btn-new-cat" type="button" title="新建分类" aria-label="新建分类">
                ${MAP_ICONS.add}
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

      <!-- [区域标注·已完成·AI自动生成地图弹窗与解析加速]
           说明：
           1. 读取世情应用里的局部世界书，只从 DB.js / IndexedDB 的 worldbook::all-books 读取。
           2. 点击“确认解析”后只调用设置应用副 API；不回退主 API，不写双份存储兜底。
           3. 只把所选局部世界书中已开启条目的“标题 + 内容”发送给 AI；不发送关闭条目、不发送关键词、不做长文本字段过滤。
           4. AI 只负责解析分类、地图名、描述和地点清单；地点坐标由前端自动分布避让，减少输出长度和 JSON 失败率。
           5. AI 解析结果以输入框形式展示：分类、地图名称、描述地图；用户可继续手动修改。
           6. 点击“创建地图”后写入地图应用 IndexedDB，并带入已自动避让过的地点图标坐标。 -->
      <div class="map-modal-mask is-hidden" id="map-ai-modal">
        <div class="map-modal-panel map-ai-modal-panel">
          <div class="map-modal-title">AI自动生成地图</div>

          <div class="map-modal-field">
            <label class="map-modal-label">选择局部世界书</label>
            <div class="map-dropdown" id="map-ai-worldbook-dropdown">
              <button class="map-dropdown-head" id="map-ai-worldbook-head" type="button">
                <span class="map-dropdown-val" id="map-ai-worldbook-val">请选择局部世界书</span>
                ${MAP_ICONS.arrowDown}
              </button>
              <div class="map-dropdown-body is-hidden" id="map-ai-worldbook-body">
                <div class="map-dropdown-list map-ai-worldbook-list" id="map-ai-worldbook-list"></div>
              </div>
            </div>
          </div>

          <div class="map-ai-status" id="map-ai-status">选择一本局部世界书后点击确认解析。</div>

          <div class="map-ai-result is-hidden" id="map-ai-result">
            <div class="map-modal-field map-category-field">
              <label class="map-modal-label">分类</label>
              <div class="map-category-control">
                <div class="map-dropdown" id="map-ai-category-dropdown">
                  <button class="map-dropdown-head" id="map-ai-category-head" type="button">
                    <span class="map-dropdown-val" id="map-ai-category-val">现代都市</span>
                    ${MAP_ICONS.arrowDown}
                  </button>
                  <div class="map-dropdown-body is-hidden" id="map-ai-category-body">
                    <div class="map-dropdown-list" id="map-ai-category-list"></div>
                  </div>
                </div>
                <button class="map-category-add-btn" id="map-ai-btn-new-cat" type="button" title="新建分类" aria-label="新建分类">
                  ${MAP_ICONS.add}
                </button>
              </div>
              <div class="map-dropdown-new is-hidden" id="map-ai-category-new-wrap">
                <input type="text" class="map-input map-input-small" id="map-ai-category-new-input" placeholder="输入新分类名称" />
                <button class="map-btn map-btn-confirm map-btn-small" id="map-ai-category-new-save" type="button">保存</button>
              </div>
            </div>

            <div class="map-modal-field">
              <label class="map-modal-label">地图名称</label>
              <input type="text" class="map-input" id="map-ai-name" placeholder="AI解析地图名称" />
            </div>

            <div class="map-modal-field">
              <label class="map-modal-label">描述地图</label>
              <textarea class="map-textarea map-ai-desc" id="map-ai-desc" maxlength="500" placeholder="AI解析地图描述，最多500字"></textarea>
            </div>

            <div class="map-ai-locations-preview" id="map-ai-locations-preview"></div>
          </div>

          <div class="map-modal-hint" id="map-ai-hint"></div>
          
          <div class="map-modal-actions">
            <button class="map-btn map-btn-cancel" id="map-ai-cancel" type="button">取消</button>
            <button class="map-btn map-btn-confirm" id="map-ai-confirm" type="button">确认解析</button>
          </div>
        </div>
      </div>

      <!-- [区域标注·已完成·分类长按删除确认弹窗] 长按展开列表中的分类后，用应用内弹窗确认删除，不使用浏览器原生 confirm。 -->
      <div class="map-modal-mask is-hidden" id="map-delete-category-modal">
        <div class="map-modal-panel map-delete-category-panel">
          <div class="map-modal-title">删除分类</div>
          <div class="map-delete-category-text">
            确认删除分类「<span id="map-delete-category-name"></span>」吗？
          </div>
          <div class="map-delete-category-tip">只会删除分类选项，不会删除已经创建的地图。</div>
          <div class="map-modal-actions">
            <button class="map-btn map-btn-cancel" id="map-delete-category-cancel" type="button">取消</button>
            <button class="map-btn map-btn-danger" id="map-delete-category-confirm" type="button">删除</button>
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
    const bg = m.imageUrl ? `style="background-image: url('${escapeAttr(m.imageUrl)}');"` : '';
    const categoryText = String(m.category || '现代都市');
    return `
      <div class="map-card" data-map-id="${escapeAttr(m.id)}">
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
   说明：包含关闭弹窗、创建数据、退出应用、AI 自动生成地图。
   ========================================================================== */
export function bindMapEvents(container, state, context) {
  const titleBtn = container.querySelector('#map-title-btn');
  const addBtn = container.querySelector('#map-add-btn');
  const aiGenerateBtn = container.querySelector('#map-ai-generate-btn');
  const modal = container.querySelector('#map-create-modal');
  const cancelBtn = container.querySelector('#map-btn-cancel');
  const confirmBtn = container.querySelector('#map-btn-confirm');
  const inputName = container.querySelector('#map-input-name');
  const inputDesc = container.querySelector('#map-input-desc');
  const hintEl = container.querySelector('#map-modal-hint');

  const dropdownHead = container.querySelector('#map-dropdown-head');
  const dropdownBody = container.querySelector('#map-dropdown-body');
  const dropdownVal = container.querySelector('#map-dropdown-val');
  const dropdownListEl = container.querySelector('#map-dropdown-list');
  const newCatBtn = container.querySelector('#map-btn-new-cat');
  const catNewWrap = container.querySelector('#map-category-new-wrap');
  const catNewInput = container.querySelector('#map-category-new-input');
  const catNewSave = container.querySelector('#map-category-new-save');

  const deleteCategoryModal = container.querySelector('#map-delete-category-modal');
  const deleteCategoryNameEl = container.querySelector('#map-delete-category-name');
  const deleteCategoryCancel = container.querySelector('#map-delete-category-cancel');
  const deleteCategoryConfirm = container.querySelector('#map-delete-category-confirm');

  let selectedCategory = '现代都市';
  let pendingDeleteCategory = '';

  if (titleBtn) {
    titleBtn.addEventListener('click', () => {
      context.eventBus?.emit('app:close', { appId: context.appId });
    });
  }

  function getCategoryList() {
    return Array.isArray(state.categories) && state.categories.length > 0
      ? state.categories
      : DEFAULT_MAP_CATEGORIES;
  }

  function closeAllDropdowns(except = null) {
    container.querySelectorAll('.map-dropdown-body').forEach((el) => {
      if (el !== except) el.classList.add('is-hidden');
    });
  }

  if (dropdownHead) {
    dropdownHead.addEventListener('click', (e) => {
      e.stopPropagation();
      if (catNewWrap) catNewWrap.classList.add('is-hidden');
      const willOpen = dropdownBody?.classList.contains('is-hidden');
      closeAllDropdowns(willOpen ? dropdownBody : null);
      dropdownBody?.classList.toggle('is-hidden');
    });
  }

  document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) return;
    const dropdown = e.target.closest?.('.map-dropdown');
    if (!dropdown) closeAllDropdowns();
  });

  function openDeleteCategoryModal(categoryName) {
    pendingDeleteCategory = String(categoryName || '').trim();
    if (!pendingDeleteCategory || !deleteCategoryModal) return;
    if (deleteCategoryNameEl) deleteCategoryNameEl.textContent = pendingDeleteCategory;
    closeAllDropdowns();
    if (catNewWrap) catNewWrap.classList.add('is-hidden');
    deleteCategoryModal.classList.remove('is-hidden');
  }

  function closeDeleteCategoryModal() {
    deleteCategoryModal?.classList.add('is-hidden');
    pendingDeleteCategory = '';
  }

  deleteCategoryCancel?.addEventListener('click', closeDeleteCategoryModal);
  deleteCategoryModal?.addEventListener('click', (e) => {
    if (e.target === deleteCategoryModal) closeDeleteCategoryModal();
  });

  deleteCategoryConfirm?.addEventListener('click', async () => {
    const target = pendingDeleteCategory;
    if (!target) return;

    const nextCategories = getCategoryList().filter(c => c !== target);
    state.categories = nextCategories.length > 0 ? nextCategories : ['现代都市'];
    if (!state.categories.includes(selectedCategory)) selectedCategory = state.categories[0] || '现代都市';

    await persistMapData(context.db, state);
    renderCategories();
    closeDeleteCategoryModal();
    if (hintEl) hintEl.textContent = '';
  });

  function renderCategories() {
    if (!dropdownListEl) return;
    const cats = getCategoryList();

    if (!cats.includes(selectedCategory)) selectedCategory = cats[0] || '现代都市';
    if (dropdownVal) dropdownVal.textContent = selectedCategory;

    dropdownListEl.innerHTML = cats.map(c => {
      const activeClass = c === selectedCategory ? 'is-active' : '';
      return `<button class="map-dropdown-item ${activeClass}" data-cat="${escapeAttr(c)}" type="button">${escapeHtml(c)}</button>`;
    }).join('');

    dropdownListEl.querySelectorAll('.map-dropdown-item').forEach(item => {
      let categoryPressTimer = null;
      const clearCategoryPressTimer = () => {
        if (categoryPressTimer) {
          clearTimeout(categoryPressTimer);
          categoryPressTimer = null;
        }
      };

      item.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        item.dataset.longPressDelete = '';
        clearCategoryPressTimer();
        categoryPressTimer = setTimeout(() => {
          item.dataset.longPressDelete = '1';
          openDeleteCategoryModal(item.dataset.cat);
        }, 600);
      });

      item.addEventListener('pointerup', clearCategoryPressTimer);
      item.addEventListener('pointercancel', clearCategoryPressTimer);
      item.addEventListener('pointerleave', clearCategoryPressTimer);

      item.addEventListener('click', (e) => {
        e.stopPropagation();
        if (item.dataset.longPressDelete === '1') {
          item.dataset.longPressDelete = '';
          return;
        }
        selectedCategory = item.dataset.cat;
        if (dropdownVal) dropdownVal.textContent = selectedCategory;
        closeAllDropdowns();
        if (catNewWrap) catNewWrap.classList.add('is-hidden');
        renderCategories();
      });
    });
  }

  newCatBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeAllDropdowns();
    catNewWrap?.classList.toggle('is-hidden');
    if (catNewInput && catNewWrap && !catNewWrap.classList.contains('is-hidden')) {
      catNewInput.value = '';
      window.requestAnimationFrame(() => catNewInput.focus());
    }
  });

  async function saveNewCategory() {
    const newCat = String(catNewInput?.value || '').trim();
    if (!newCat) {
      if (hintEl) hintEl.textContent = '分类名称不能为空';
      return;
    }

    if (!state.categories) state.categories = [];
    if (!state.categories.includes(newCat)) {
      state.categories.push(newCat);
      await persistMapData(context.db, state);
    }

    selectedCategory = newCat;
    catNewWrap?.classList.add('is-hidden');
    closeAllDropdowns();
    renderCategories();
    if (hintEl) hintEl.textContent = '';
  }

  catNewSave?.addEventListener('click', async (e) => {
    e.stopPropagation();
    await saveNewCategory();
  });

  catNewInput?.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      await saveNewCategory();
    }
  });

  addBtn?.addEventListener('click', () => {
    if (!modal) return;
    inputName.value = '';
    inputDesc.value = '';
    if (hintEl) hintEl.textContent = '';
    closeAllDropdowns();
    catNewWrap?.classList.add('is-hidden');
    selectedCategory = getCategoryList().includes(selectedCategory) ? selectedCategory : '现代都市';
    renderCategories();
    modal.classList.remove('is-hidden');
    setTimeout(() => inputName.focus(), 50);
  });

  const closeModal = () => {
    modal?.classList.add('is-hidden');
  };

  cancelBtn?.addEventListener('click', closeModal);
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  confirmBtn?.addEventListener('click', async () => {
    const name = inputName.value.trim();
    const desc = inputDesc.value.trim();

    if (!name) {
      if (hintEl) hintEl.textContent = '地图名称不能为空';
      return;
    }

    if (hintEl) hintEl.textContent = '';

    const newMap = createMapDraft(name, desc, selectedCategory);
    state.maps.push(newMap);

    await persistMapData(context.db, state);
    renderMapGrid(container, state);
    bindGridEvents(container, state, context);

    closeModal();
  });

  bindAiMapGenerator(container, state, context, {
    triggerButton: aiGenerateBtn,
    getCategoryList,
    closeAllDropdowns,
    renderHomeCategories: renderCategories
  });

  bindGridEvents(container, state, context);
}

/* ==========================================================================
   [区域标注·已完成·AI自动生成地图逻辑区：开启条目解析与加速]
   说明：
   1. 副 API 只解析所选局部世界书中已开启条目的“标题 + 内容”，不发送关键词和关闭条目。
   2. AI 只生成地图表单与地点清单，坐标由前端自动避让生成，降低响应时间和 JSON 截断/跑偏概率。
   3. 持久化只写地图 IndexedDB；不使用 localStorage/sessionStorage，不写双份存储兜底。
   ========================================================================== */
function bindAiMapGenerator(container, state, context, helpers) {
  const modal = container.querySelector('#map-ai-modal');
  const cancelBtn = container.querySelector('#map-ai-cancel');
  const confirmBtn = container.querySelector('#map-ai-confirm');
  const statusEl = container.querySelector('#map-ai-status');
  const hintEl = container.querySelector('#map-ai-hint');
  const resultEl = container.querySelector('#map-ai-result');

  const wbHead = container.querySelector('#map-ai-worldbook-head');
  const wbBody = container.querySelector('#map-ai-worldbook-body');
  const wbVal = container.querySelector('#map-ai-worldbook-val');
  const wbList = container.querySelector('#map-ai-worldbook-list');

  const catHead = container.querySelector('#map-ai-category-head');
  const catBody = container.querySelector('#map-ai-category-body');
  const catVal = container.querySelector('#map-ai-category-val');
  const catList = container.querySelector('#map-ai-category-list');
  const newCatBtn = container.querySelector('#map-ai-btn-new-cat');
  const newCatWrap = container.querySelector('#map-ai-category-new-wrap');
  const newCatInput = container.querySelector('#map-ai-category-new-input');
  const newCatSave = container.querySelector('#map-ai-category-new-save');

  const nameInput = container.querySelector('#map-ai-name');
  const descInput = container.querySelector('#map-ai-desc');
  const previewEl = container.querySelector('#map-ai-locations-preview');

  let localBooks = [];
  let selectedBookId = '';
  let selectedCategory = '现代都市';
  let parsedPayload = null;
  let isParsed = false;
  let isBusy = false;

  const setHint = (text, type = 'error') => {
    if (!hintEl) return;
    hintEl.textContent = text || '';
    hintEl.dataset.type = type;
  };

  const setStatus = (text) => {
    if (statusEl) statusEl.textContent = text || '';
  };

  const selectedBook = () => localBooks.find(book => book.id === selectedBookId) || null;

  helpers.triggerButton?.addEventListener('click', async () => {
    if (!modal) return;
    localBooks = await loadLocalWorldBooks(context.db);
    selectedBookId = localBooks[0]?.id || '';
    selectedCategory = '现代都市';
    parsedPayload = null;
    isParsed = false;
    isBusy = false;

    setHint('');
    setStatus(localBooks.length ? '选择一本局部世界书后点击确认解析，仅会发送已开启条目的标题和内容。' : '暂无局部世界书，请先在世情应用创建或导入局部世界书。');
    if (resultEl) resultEl.classList.add('is-hidden');
    if (confirmBtn) {
      confirmBtn.textContent = '确认解析';
      confirmBtn.disabled = !localBooks.length;
      confirmBtn.classList.remove('is-loading');
    }
    if (nameInput) nameInput.value = '';
    if (descInput) descInput.value = '';
    if (previewEl) previewEl.innerHTML = '';

    renderWorldBookOptions();
    renderAiCategories();
    modal.classList.remove('is-hidden');
  });

  function closeAiModal() {
    modal?.classList.add('is-hidden');
    helpers.closeAllDropdowns();
    newCatWrap?.classList.add('is-hidden');
  }

  cancelBtn?.addEventListener('click', closeAiModal);
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeAiModal();
  });

  wbHead?.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = wbBody?.classList.contains('is-hidden');
    helpers.closeAllDropdowns(willOpen ? wbBody : null);
    wbBody?.classList.toggle('is-hidden');
  });

  catHead?.addEventListener('click', (e) => {
    e.stopPropagation();
    newCatWrap?.classList.add('is-hidden');
    const willOpen = catBody?.classList.contains('is-hidden');
    helpers.closeAllDropdowns(willOpen ? catBody : null);
    catBody?.classList.toggle('is-hidden');
  });

  newCatBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    helpers.closeAllDropdowns();
    newCatWrap?.classList.toggle('is-hidden');
    if (newCatInput && newCatWrap && !newCatWrap.classList.contains('is-hidden')) {
      newCatInput.value = '';
      requestAnimationFrame(() => newCatInput.focus());
    }
  });

  async function saveAiNewCategory() {
    const newCat = String(newCatInput?.value || '').trim();
    if (!newCat) {
      setHint('分类名称不能为空');
      return;
    }

    if (!state.categories) state.categories = [];
    if (!state.categories.includes(newCat)) {
      state.categories.push(newCat);
      await persistMapData(context.db, state);
    }

    selectedCategory = newCat;
    newCatWrap?.classList.add('is-hidden');
    helpers.closeAllDropdowns();
    renderAiCategories();
    helpers.renderHomeCategories?.();
    setHint('');
  }

  newCatSave?.addEventListener('click', async (e) => {
    e.stopPropagation();
    await saveAiNewCategory();
  });

  newCatInput?.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      await saveAiNewCategory();
    }
  });

  confirmBtn?.addEventListener('click', async () => {
    if (isBusy) return;
    if (!isParsed) {
      await parseSelectedWorldBook();
      return;
    }
    await createMapFromAiResult();
  });

  function renderWorldBookOptions() {
    if (!wbList) return;

    if (!localBooks.length) {
      wbList.innerHTML = '<div class="map-ai-empty">暂无局部世界书</div>';
      if (wbVal) wbVal.textContent = '暂无局部世界书';
      return;
    }

    if (!selectedBookId) selectedBookId = localBooks[0]?.id || '';
    const book = selectedBook();
    if (wbVal) wbVal.textContent = book?.name || '请选择局部世界书';

    wbList.innerHTML = localBooks.map(bookItem => {
      const activeClass = bookItem.id === selectedBookId ? 'is-active' : '';
      const count = getEnabledWorldBookEntries(bookItem).length;
      return `<button class="map-dropdown-item ${activeClass}" data-wb-id="${escapeAttr(bookItem.id)}" type="button">
        <span>${escapeHtml(bookItem.name || '未命名世界书')}</span>
        <small>${count} 开启条目</small>
      </button>`;
    }).join('');

    wbList.querySelectorAll('.map-dropdown-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        selectedBookId = item.dataset.wbId || '';
        parsedPayload = null;
        isParsed = false;
        if (resultEl) resultEl.classList.add('is-hidden');
        if (confirmBtn) confirmBtn.textContent = '确认解析';
        if (previewEl) previewEl.innerHTML = '';
        setStatus('已选择世界书，点击确认解析。仅会发送已开启条目的标题和内容。');
        setHint('');
        helpers.closeAllDropdowns();
        renderWorldBookOptions();
      });
    });
  }

  function renderAiCategories() {
    if (!catList) return;

    const cats = helpers.getCategoryList();
    if (!cats.includes(selectedCategory)) selectedCategory = cats[0] || '现代都市';
    if (catVal) catVal.textContent = selectedCategory;

    catList.innerHTML = cats.map(c => {
      const activeClass = c === selectedCategory ? 'is-active' : '';
      return `<button class="map-dropdown-item ${activeClass}" data-cat="${escapeAttr(c)}" type="button">${escapeHtml(c)}</button>`;
    }).join('');

    catList.querySelectorAll('.map-dropdown-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        selectedCategory = item.dataset.cat || '现代都市';
        helpers.closeAllDropdowns();
        renderAiCategories();
      });
    });
  }

  async function parseSelectedWorldBook() {
    const book = selectedBook();
    if (!book) {
      setHint('请先选择局部世界书');
      return;
    }

    isBusy = true;
    confirmBtn.disabled = true;
    confirmBtn.classList.add('is-loading');
    setHint('');
    setStatus('正在调用副 API 解析已开启条目的标题和内容...');

    try {
      const payload = await requestMapPlanBySecondaryApi(context, book, helpers.getCategoryList());
      parsedPayload = normalizeAiMapPayload(payload, helpers.getCategoryList());
      selectedCategory = parsedPayload.category;
      if (!state.categories) state.categories = [];
      if (selectedCategory && !state.categories.includes(selectedCategory)) {
        state.categories.push(selectedCategory);
        await persistMapData(context.db, state);
        helpers.renderHomeCategories?.();
      }

      if (nameInput) nameInput.value = parsedPayload.name;
      if (descInput) descInput.value = parsedPayload.description;
      renderAiCategories();
      renderLocationPreview(parsedPayload.points);
      resultEl?.classList.remove('is-hidden');

      isParsed = true;
      confirmBtn.textContent = '创建地图';
      setStatus('解析完成，可手动修改下方内容后创建地图。');
    } catch (error) {
      console.error('[Map] AI 自动生成地图失败:', error);
      setHint(error?.message || 'AI解析失败，请检查副 API 设置');
      setStatus('解析失败，请检查副 API 配置后重试。');
    } finally {
      isBusy = false;
      confirmBtn.disabled = false;
      confirmBtn.classList.remove('is-loading');
    }
  }

  function renderLocationPreview(points = []) {
    if (!previewEl) return;
    if (!points.length) {
      previewEl.innerHTML = '<div class="map-ai-location-empty">AI未解析出地点，将创建空地图。</div>';
      return;
    }

    previewEl.innerHTML = `
      <div class="map-ai-location-title">已解析地点（自动避让重叠）</div>
      <div class="map-ai-location-list">
        ${points.map(point => `<div class="map-ai-location-item">
          <span>${escapeHtml(point.name || '未命名地点')}</span>
          <small>${Number(point.x).toFixed(1)}%, ${Number(point.y).toFixed(1)}%</small>
        </div>`).join('')}
      </div>
    `;
  }

  async function createMapFromAiResult() {
    const name = String(nameInput?.value || '').trim();
    const desc = String(descInput?.value || '').trim().slice(0, 500);

    if (!name) {
      setHint('地图名称不能为空');
      return;
    }

    const basePoints = parsedPayload?.points || [];
    const nextMap = createMapDraft(name, desc, selectedCategory, { points: basePoints });
    state.maps.push(nextMap);
    if (!state.categories) state.categories = [];
    if (!state.categories.includes(selectedCategory)) state.categories.push(selectedCategory);

    await persistMapData(context.db, state);
    renderMapGrid(container, state);
    bindGridEvents(container, state, context);
    closeAiModal();

    // [区域标注·已完成·AI地图创建后后台地点已生成] 地图主页创建完成后，详情页可直接看到所有地点图标。
  }
}

/* ==========================================================================
   [区域标注·已完成·世界书 IndexedDB 读取与开启条目精简区]
   说明：
   1. 只读取世情应用 worldbook::all-books 记录中的局部世界书；持久化访问统一走项目 DB.js / IndexedDB。
   2. 发送给地图 AI 前，只保留 enabled !== false 的开启条目，并且只发送条目标题和内容。
   3. 不发送关键词，不发送关闭条目，不使用 localStorage/sessionStorage，不做长文本/大媒体字段过滤。
   ========================================================================== */
async function loadLocalWorldBooks(db) {
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
    console.error('[Map] 读取局部世界书失败:', error);
    return [];
  }
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
   [区域标注·已完成·地图AI副API调用区：精简提示词与失败提示优化]
   说明：
   1. 只读取 settings.api.secondary；不回退主 API，不写双份请求兜底。
   2. 请求正文只包含开启世界书条目的标题和内容，不发送关键词、关闭条目或双份数据。
   3. AI 不再输出地点坐标，坐标由前端自动分布避让，减少解析耗时与无效 JSON。
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
  if (typeof payload === 'string') return payload;
  return payload?.error?.message ||
    payload?.error?.msg ||
    payload?.message ||
    payload?.detail ||
    payload?.msg ||
    fallback;
}

function getMapAiMaxTokens(global = {}) {
  const configured = Number(global.maxTokens ?? 2048);
  const safeValue = Number.isFinite(configured) ? configured : 2048;
  return Math.max(1200, Math.min(4096, safeValue));
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

async function requestMapPlanBySecondaryApi(context, book, categories) {
  const allSettings = await context.settings?.getAll?.();
  const profile = normalizeSecondaryApiProfile(allSettings?.api || {});
  const global = allSettings?.api?.global || {};
  const temperature = Number(global.temperature ?? 0.7);
  const maxTokens = getMapAiMaxTokens(global);

  if (!profile.apiKey) throw new Error('副 API Key 不能为空');
  if (!profile.model) throw new Error('请先在设置应用选择副 API 模型');

  const promptText = buildAiMapPrompt(book, categories);
  if (!promptText) throw new Error('该局部世界书没有开启条目，无法解析地图');

  if (profile.provider === 'gemini') {
    const response = await fetch(`${trimSlash(profile.baseUrl)}/models/${encodeURIComponent(profile.model)}:generateContent?key=${encodeURIComponent(profile.apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: promptText }] }],
        generationConfig: { temperature, maxOutputTokens: maxTokens }
      })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(extractApiErrorMessage(payload, `副 API 请求失败（HTTP ${response.status}）`));
    const aiText = extractAiText(payload);
    if (!String(aiText || '').trim()) throw new Error('副 API 返回为空，请检查模型是否可用');
    const parsed = extractJsonObject(aiText);
    if (!parsed) throw new Error('副 API 没有返回有效 JSON，可能是模型输出了说明文字或响应被截断');
    return parsed;
  }

  if (profile.provider === 'claude') {
    const response = await fetch(`${trimSlash(profile.baseUrl)}/messages`, {
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
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(extractApiErrorMessage(payload, `副 API 请求失败（HTTP ${response.status}）`));
    const aiText = extractAiText(payload);
    if (!String(aiText || '').trim()) throw new Error('副 API 返回为空，请检查模型是否可用');
    const parsed = extractJsonObject(aiText);
    if (!parsed) throw new Error('副 API 没有返回有效 JSON，可能是模型输出了说明文字或响应被截断');
    return parsed;
  }

  const response = await fetch(`${trimSlash(profile.baseUrl)}/chat/completions`, {
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
      messages: [{ role: 'user', content: promptText }]
    })
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(extractApiErrorMessage(payload, `副 API 请求失败（HTTP ${response.status}）`));
  const aiText = extractAiText(payload);
  if (!String(aiText || '').trim()) throw new Error('副 API 返回为空，请检查模型是否可用');
  const parsed = extractJsonObject(aiText);
  if (!parsed) throw new Error('副 API 没有返回有效 JSON，可能是模型输出了说明文字或响应被截断');
  return parsed;
}

function buildAiMapPrompt(book, categories) {
  const worldBookText = buildWorldBookPlainText(book);
  if (!worldBookText) return '';

  return [
    '你是地图应用的世界书解析器。请根据局部世界书中已开启条目的标题和内容，生成游戏/剧情地图 JSON。',
    '只返回 JSON，不要 Markdown，不要解释，不要输出 JSON 以外的字符。',
    `已有地图分类：${categories.join('、')}`,
    'JSON格式：{"category":"分类","name":"地图名称","description":"不超过500字的地图描述","locations":[{"name":"地点名称","description":"地点描述"}]}',
    '要求：',
    '1. category 优先从已有分类中选择；都不适合时写一个短分类名。',
    '2. description 概括地貌、势力/区域关系和主要氛围，不超过500字。',
    '3. locations 只列出世界书中明确或强相关的重要地点，建议 5-14 个，最多不要超过18个。',
    '4. 每个地点只写 name 和 description，不要写 x/y 坐标。',
    '5. 不要添加和世界书无关的地点。',
    '',
    '局部世界书已开启条目：',
    worldBookText
  ].join('\n');
}

/* ==========================================================================
   [区域标注·已完成·AI地图结果规范化与地点避让区]
   说明：AI 只需返回地点清单；若旧模型仍返回坐标也会兼容读取，并统一在前端重新避让，确保地点图标合理分散不重合。
   ========================================================================== */
function normalizeAiMapPayload(payload, categories) {
  const category = String(payload?.category || '').trim() || categories[0] || '现代都市';
  const name = String(payload?.name || payload?.mapName || 'AI生成地图').trim();
  const description = String(payload?.description || payload?.desc || '').trim().slice(0, 500);
  const rawLocations = Array.isArray(payload?.locations) ? payload.locations : (Array.isArray(payload?.points) ? payload.points : []);
  const points = distributeAiLocations(rawLocations);

  return {
    category,
    name,
    description,
    points
  };
}

function distributeAiLocations(locations = []) {
  const safeLocations = locations
    .map((item, index) => ({
      name: String(item?.name || `地点${index + 1}`).trim(),
      description: String(item?.description || item?.desc || '').trim(),
      x: Number(item?.x),
      y: Number(item?.y)
    }))
    .filter(item => item.name)
    .slice(0, 24);

  const placed = [];
  const count = safeLocations.length;
  const minDistance = count > 16 ? 11 : count > 10 ? 13 : 16;

  safeLocations.forEach((item, index) => {
    const fallback = getGridPosition(index, count);
    let best = {
      x: Number.isFinite(item.x) ? clamp(item.x, 8, 92) : fallback.x,
      y: Number.isFinite(item.y) ? clamp(item.y, 10, 90) : fallback.y
    };

    if (hasNearbyPoint(best, placed, minDistance)) {
      best = findOpenPosition(index, count, placed, minDistance);
    }

    placed.push({
      name: item.name,
      description: item.description,
      x: best.x,
      y: best.y
    });
  });

  return placed;
}

function getGridPosition(index, count) {
  const cols = Math.ceil(Math.sqrt(Math.max(1, count) * 1.35));
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

  for (let ring = 1; ring <= 9; ring++) {
    const radius = ring * 5;
    for (let step = 0; step < 12; step++) {
      const angle = ((step / 12) * Math.PI * 2) + (index * 0.73);
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

/* ==========================================================================
   [区域标注·已完成·地图卡片事件]
   说明：单击进入详情页，长按编辑地图信息。
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
    editModal?.classList.add('is-hidden');
    currentEditMapId = null;
  };

  editCancel?.addEventListener('click', closeEditModal);
  editModal?.addEventListener('click', e => {
    if (e.target === editModal) closeEditModal();
  });

  if (editConfirm) {
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
        await persistMapData(context.db, state);
        renderMapGrid(container, state);
        bindGridEvents(container, state, context);
      }
      closeEditModal();
    });
  }

  cards.forEach(card => {
    const mapId = card.dataset.mapId;
    let pressTimer = null;
    let isLongPress = false;

    const startPress = () => {
      isLongPress = false;
      pressTimer = setTimeout(() => {
        isLongPress = true;
        currentEditMapId = mapId;
        const mapObj = state.maps.find(m => m.id === mapId);
        if (mapObj && editModal) {
          editName.value = mapObj.name || '';
          editDesc.value = mapObj.description || '';
          editHint.textContent = '';
          editModal.classList.remove('is-hidden');
        }
      }, 500);
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

    card.addEventListener('mouseup', () => {
      cancelPress();
      if (!isLongPress) enterMapDetail(container, state, context, mapId);
    });
    card.addEventListener('touchend', () => {
      cancelPress();
      if (!isLongPress) enterMapDetail(container, state, context, mapId);
    });
  });
}

function enterMapDetail(container, state, context, mapId) {
  const mapObj = state.maps.find(m => m.id === mapId);
  if (!mapObj) return;

  const appDiv = container.querySelector('.map-app');
  if (appDiv) appDiv.style.display = 'none';

  let detailDiv = container.querySelector('.map-detail-wrapper');
  if (!detailDiv) {
    detailDiv = document.createElement('div');
    detailDiv.className = 'map-detail-wrapper';
    container.appendChild(detailDiv);
  }

  detailDiv.innerHTML = buildMapDetailShell(mapObj);
  detailDiv.style.display = 'block';

  bindMapDetailEvents(detailDiv, mapObj, state, context, () => {
    detailDiv.style.display = 'none';
    detailDiv.innerHTML = '';
    if (appDiv) {
      appDiv.style.display = 'block';
      renderMapGrid(container, state);
      bindGridEvents(container, state, context);
    }
  });
}

function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&': return '&' + 'amp;';
      case '<': return '&' + 'lt;';
      case '>': return '&' + 'gt;';
      case '"': return '&' + 'quot;';
      case "'": return '&' + '#39;';
      default: return char;
    }
  });
}

function escapeAttr(text) {
  return escapeHtml(text).replace(/`/g, '&#96;');
}
