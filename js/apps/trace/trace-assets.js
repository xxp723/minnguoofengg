/**
 * 文件名: js/apps/trace/trace-assets.js
 * 用途: 轨迹应用 - 资产模块。
 */
import { persistTraceData } from './trace-store.js';

/* ==========================================================================
   [区域标注·本次需求·资产模块 UI 渲染]
   ========================================================================== */
export function renderAssets(container, state) {
  const assets = Array.isArray(state.assets) ? state.assets : [];
  
  let listHtml = '';
  if (assets.length === 0) {
    listHtml = `
      <div class="trace-empty">
        <p>暂无资产记录</p>
        <p class="trace-empty-sub">目前没有可用的资产信息</p>
      </div>
    `;
  } else {
    listHtml = `<div class="trace-list">` + assets.map(a => `
      <div class="trace-card">
        <div class="trace-card-title">${escapeHtml(a.name || '未命名资产')}</div>
        <div class="trace-card-desc">金额: ${escapeHtml(a.amount || '0')} | 类别: ${escapeHtml(a.category || '未分类')}</div>
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
   [区域标注·本次需求·资产模块交互事件绑定]
   说明：已移除手动添加按钮逻辑，保留空函数供外部调用
   ========================================================================== */
export function bindAssetsEvents(container, state, context) {
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
