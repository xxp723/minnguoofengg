/**
 * ==========================================================================
 * [区域标注·本次需求·梦笺 UI 组件库]
 * 说明：包含通用 IconPark SVG、自定义弹窗生成器、滑动开关组件等
 * ==========================================================================
 */

/**
 * ==========================================================================
 * [区域标注·本次需求·梦笺 SVG 图标库 (IconPark)]
 * ==========================================================================
 */
export const Icons = {
  import: `<svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M24 44C35.0457 44 44 35.0457 44 24C44 12.9543 35.0457 4 24 4C12.9543 4 4 12.9543 4 24C4 35.0457 12.9543 44 24 44Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M24 16V32" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 24L24 32L32 24" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  shelf: `<svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 39V12C10 10.8954 10.8954 10 12 10H36C37.1046 10 38 10.8954 38 12V39" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M24 20H16" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M32 20H28" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M32 28H16" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 39H42" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  archive: `<svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M38 14H10C8.89543 14 8 14.8954 8 16V40C8 41.1046 8.89543 42 10 42H38C39.1046 42 40 41.1046 40 40V16C40 14.8954 39.1046 14 38 14Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M14 14V8C14 6.89543 14.8954 6 16 6H32C33.1046 6 34 6.89543 34 8V14" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M17 22L31 22" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  home: `<svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 18V42H39V18L24 6L9 18Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M19 29V42H29V29H19Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M9 42H39" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>`,
  emptyFolder: `<svg width="64" height="64" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 8C5 6.89543 5.89543 6 7 6H19L24 12H41C42.1046 12 43 12.8954 43 14V40C43 41.1046 42.1046 42 41 42H7C5.89543 42 5 41.1046 5 40V8Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M24 22V32" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M19 27H29" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  book: `<svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 40C8 36 8 10 8 10C8 6.68629 10.6863 4 14 4H40V34H14C10.6863 34 8 36.6863 8 40Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M8 40C8 43.3137 10.6863 46 14 46H40V34H14C10.6863 34 8 36.6863 8 40Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/></svg>`
};

/**
 * ==========================================================================
 * [区域标注·本次需求·梦笺自定义弹窗]
 * 说明：替代浏览器原生的 alert / confirm，采用杂志风格 UI
 * ==========================================================================
 */
export function showModal({ title = '提示', content = '', showCancel = false, confirmText = '确定', cancelText = '取消', onConfirm, onCancel }) {
  const overlay = document.createElement('div');
  overlay.className = 'textgame-modal-overlay';
  
  overlay.innerHTML = `
    <div class="textgame-modal-container">
      <div class="textgame-modal-title">${title}</div>
      <div class="textgame-modal-content">${content}</div>
      <div class="textgame-modal-actions">
        ${showCancel ? `<button class="textgame-modal-btn textgame-modal-btn-cancel">${cancelText}</button>` : ''}
        <button class="textgame-modal-btn textgame-modal-btn-confirm">${confirmText}</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // 触发过渡动画
  requestAnimationFrame(() => {
    overlay.classList.add('active');
  });

  const close = () => {
    overlay.classList.remove('active');
    setTimeout(() => overlay.remove(), 300);
  };

  const btnConfirm = overlay.querySelector('.textgame-modal-btn-confirm');
  btnConfirm.addEventListener('click', () => {
    close();
    if (onConfirm) onConfirm();
  });

  if (showCancel) {
    const btnCancel = overlay.querySelector('.textgame-modal-btn-cancel');
    btnCancel.addEventListener('click', () => {
      close();
      if (onCancel) onCancel();
    });
  }
}

/**
 * ==========================================================================
 * [区域标注·本次需求·梦笺开关组件渲染]
 * 说明：返回 HTML 字符串，仿 iOS 滑动开关
 * ==========================================================================
 */
export function renderSwitch(id, isChecked) {
  return `
    <label class="textgame-switch">
      <input type="checkbox" id="${id}" ${isChecked ? 'checked' : ''}>
      <span class="textgame-slider"></span>
    </label>
  `;
}
