/**
 * 文件名: js/apps/trace/index.js
 * 用途: 轨迹应用入口接线模块。
 *       负责加载 CSS、初始化 IndexedDB 数据、创建运行时状态、
 *       绑定/解绑事件与 AppManager 挂载生命周期。
 */

import { loadTraceData, getArchiveMasks, getContactsByMask, getLastView, saveLastView } from './trace-store.js';
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
  const lastView = await getLastView(db);
  
  /* ==========================================================================
     [区域标注·本次修改·面具优先级调整]
     说明：轨迹应用必须优先强制跟随全局闲谈面具 activeMaskId，其次才是缓存。
     ========================================================================== */
  let currentMaskId = activeMaskId;
  if (!currentMaskId || !masks.some(m => String(m.id) === currentMaskId)) {
    currentMaskId = masks.length > 0 ? String(masks[0].id) : null;
  }
  
  let contacts = [];
  if (currentMaskId) {
    contacts = await getContactsByMask(db, currentMaskId);
  }
  
  // 优先使用上次浏览的联系人，否则选第一个
  let currentContactId = lastView.contactId;
  if (!currentContactId || !contacts.some(c => String(c.id) === currentContactId)) {
    currentContactId = contacts.length > 0 ? String(contacts[0].id) : null;
  }
  
  // 默认选中的日期为今天
  const todayStr = new Date().toISOString().split('T')[0];
  
  // 加载对应面具、联系人、日期下的专属轨迹数据
  const traceData = await loadTraceData(db, currentMaskId, currentContactId, todayStr);
  
  // 保存这次的访问记录
  if (currentMaskId && currentContactId) {
    await saveLastView(db, currentMaskId, currentContactId);
  }
  
  const state = {
    destroyed: false,
    masks,
    contacts,
    activeMaskId: currentMaskId,
    activeContactId: currentContactId,
    selectedDate: todayStr,
    ...traceData
  };

  // 3. 渲染应用骨架（带入 state 以渲染顶部横向头像栏和标题栏扩展）
  container.innerHTML = buildTraceShell(state);
  
  // 4. 渲染初始列表/网格
  renderTraceGrid(container, state, context);
  
  // 5. 绑定交互事件
  bindTraceEvents(container, state, context);

  /* ==========================================================================
     [区域标注·本次修改·全局面具同步监听]
     说明：监听闲谈应用等全局的面具切换事件，进行后台数据更新和 UI 重绘。
     ========================================================================== */
  const onActiveMaskChanged = async (payload) => {
    if (state.destroyed) return;
    const newMaskId = String(payload.maskId);
    if (newMaskId === state.activeMaskId) return;

    state.activeMaskId = newMaskId;
    state.contacts = await getContactsByMask(db, newMaskId);
    
    // 尝试恢复该面具下的上次联系人
    const updatedLastView = await getLastView(db);
    let newContactId = updatedLastView.contactId;
    if (!newContactId || !state.contacts.some(c => String(c.id) === newContactId)) {
      newContactId = state.contacts.length > 0 ? String(state.contacts[0].id) : null;
    }
    state.activeContactId = newContactId;

    if (state.activeMaskId && state.activeContactId) {
      await saveLastView(db, state.activeMaskId, state.activeContactId);
    }
    
    const newData = await loadTraceData(db, state.activeMaskId, state.activeContactId, state.selectedDate);
    Object.assign(state, newData);
    
    container.innerHTML = buildTraceShell(state);
    renderTraceGrid(container, state, context);
    bindTraceEvents(container, state, context);
  };

  context.eventBus?.on('archive:active-mask-changed', onActiveMaskChanged);

  return {
    state,
    destroy() {
      state.destroyed = true;
      context.eventBus?.off('archive:active-mask-changed', onActiveMaskChanged);
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
