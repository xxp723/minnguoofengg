/**
 * 文件名: js/apps/trace/index.js
 * 用途: 轨迹应用入口接线模块。
 *       负责加载 CSS、初始化 IndexedDB 数据、创建运行时状态、
 *       绑定/解绑事件与 AppManager 挂载生命周期。
 */

import { loadTraceData, getArchiveMasks, getContactsByMask } from './trace-store.js';
import { buildTraceShell, renderTraceGrid, bindTraceEvents } from './trace-ui.js';

/* ==========================================================================
   [区域标注·本次需求·轨迹应用加载 CSS 工具函数]
   说明：动态加载独立的 trace.css，避免无样式闪屏。
   ========================================================================== */
function loadTraceCSS(href, id) {
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

function removeTraceCSS(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

/* ==========================================================================
   [区域标注·本次需求·轨迹主页入口]
   ========================================================================== */
export async function mount(container, context) {
  // 1. 预加载轨迹应用独立 CSS
  await loadTraceCSS('./js/apps/trace/trace.css', 'trace-app-css');
  
  // 2. 读取 IndexedDB 数据及面具、联系人隔离上下文
  const db = context.db;
  const { masks, activeMaskId } = await getArchiveMasks(db);
  
  // 默认使用当前全局激活的面具，否则取第一个
  const currentMaskId = activeMaskId || (masks.length > 0 ? String(masks[0].id) : null);
  
  let contacts = [];
  if (currentMaskId) {
    contacts = await getContactsByMask(db, currentMaskId);
  }
  
  // 默认选中第一个联系人
  const currentContactId = contacts.length > 0 ? String(contacts[0].id) : null;
  
  // 加载对应面具和联系人下的专属轨迹数据
  const traceData = await loadTraceData(db, currentMaskId, currentContactId);
  
  const state = {
    destroyed: false,
    masks,
    contacts,
    activeMaskId: currentMaskId,
    activeContactId: currentContactId,
    ...traceData
  };

  // 3. 渲染应用骨架（带入 state 以渲染顶部横向头像栏和标题栏扩展）
  container.innerHTML = buildTraceShell(state);
  
  // 4. 渲染初始列表/网格
  renderTraceGrid(container, state, context);
  
  // 5. 绑定交互事件
  bindTraceEvents(container, state, context);

  return {
    state,
    destroy() {
      state.destroyed = true;
      removeTraceCSS('trace-app-css');
      container.innerHTML = '';
    }
  };
}

/* ==========================================================================
   [区域标注·本次需求·轨迹应用卸载]
   ========================================================================== */
export async function unmount(instance) {
  if (instance && typeof instance.destroy === 'function') {
    instance.destroy();
  }
}
