/**
 * 文件名: js/apps/map/index.js
 * 用途: 地图应用入口接线模块。
 *       负责加载 CSS、初始化 IndexedDB 数据、创建运行时状态、
 *       绑定/解绑事件与 AppManager 挂载生命周期。
 */
import { loadMapData } from './map-store.js';
import { buildMapShell, renderMapGrid, bindMapEvents } from './map-ui.js';

/* ==========================================================================
   [区域标注·已完成·地图应用加载 CSS 工具函数]
   说明：动态加载独立的 map.css，避免无样式闪屏。
   ========================================================================== */
function loadMapCSS(href, id) {
  return new Promise((resolve) => {
    let existing = document.getElementById(id);
    if (existing) {
      if (existing.dataset.loaded === '1' || existing.sheet) {
        existing.dataset.loaded = '1';
        return resolve();
      }
      existing.addEventListener('load', () => { existing.dataset.loaded = '1'; resolve(); }, { once: true });
      existing.addEventListener('error', () => { existing.dataset.loaded = '1'; resolve(); }, { once: true });
      return;
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.id = id;
    link.addEventListener('load', () => { link.dataset.loaded = '1'; resolve(); }, { once: true });
    link.addEventListener('error', () => { link.dataset.loaded = '1'; resolve(); }, { once: true });
    document.head.appendChild(link);
  });
}

function removeMapCSS(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

/* ==========================================================================
   [区域标注·已完成·地图主页入口]
   ========================================================================== */
export async function mount(container, context) {
  // 1. 预加载地图应用独立 CSS
  await loadMapCSS('./js/apps/map/map.css', 'map-app-css');
  
  // 2. 读取 IndexedDB 数据
  const db = context.db;
  const mapData = await loadMapData(db);
  
  const state = {
    destroyed: false,
    ...mapData
  };

  // 3. 渲染应用骨架
  container.innerHTML = buildMapShell();
  
  // 4. 渲染初始卡片网格
  renderMapGrid(container, state);
  
  // 5. 绑定交互事件
  bindMapEvents(container, state, context);

  return {
    state,
    destroy() {
      state.destroyed = true;
      removeMapCSS('map-app-css');
      container.innerHTML = '';
    }
  };
}

/* ==========================================================================
   [区域标注·已完成·地图应用卸载]
   ========================================================================== */
export async function unmount(instance) {
  if (instance && typeof instance.destroy === 'function') {
    instance.destroy();
  }
}
