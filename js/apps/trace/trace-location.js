/**
 * 文件名: js/apps/trace/trace-location.js
 * 用途: 轨迹应用 - 位置模块。
 */
import { persistTraceData } from './trace-store.js';

/* ==========================================================================
   [区域标注·本次需求·位置模块 UI 渲染]
   ========================================================================== */
export function renderLocation(container, state) {
  const locations = Array.isArray(state.locations) ? state.locations : [];
  
  let listHtml = '';
  if (locations.length === 0) {
    listHtml = `
      <div class="trace-empty">
        <p>暂无位置记录</p>
        <p class="trace-empty-sub">目前没有可用的位置信息</p>
      </div>
    `;
  } else {
    listHtml = `<div class="trace-list">` + locations.map(l => `
      <div class="trace-card">
        <div class="trace-card-title">${escapeHtml(l.name || '未知地点')}</div>
        <div class="trace-card-desc">${escapeHtml(l.description || '')}</div>
      </div>
    `).join('') + `</div>`;
  }

  container.innerHTML = `
    <div class="trace-module-container">
      <div class="trace-module-content">
        ${listHtml}
      </div>
    </div>
  `;
}

/* ==========================================================================
   [区域标注·本次需求·位置模块交互事件绑定]
   说明：已移除手动添加按钮逻辑，保留空函数供外部调用
   ========================================================================== */
export function bindLocationEvents(container, state, context) {
  // 无附加交互事件
}

function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&': return '&' + '#38;';
      case '<': return '&' + '#60;';
      case '>': return '&' + '#62;';
      case '"': return '&' + '#34;';
      case "'": return '&' + '#39;';
      default: return char;
    }
  });
}
