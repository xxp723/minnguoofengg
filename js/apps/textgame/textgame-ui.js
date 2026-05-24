/**
 * ==========================================================================
 * [区域标注·已完成·梦笺 UI 组件库]
 * 说明：包含通用 IconPark SVG、自定义应用内弹窗、滑动开关组件等。
 * 注意：梦笺弹窗不使用浏览器原生 alert/confirm/prompt/select。
 * ==========================================================================
 */

/**
 * ==========================================================================
 * [区域标注·已完成·梦笺 SVG 图标库 (IconPark)]
 * 说明：梦笺所有按钮图案统一使用 IconPark 风格 SVG。
 * ==========================================================================
 */
export const Icons = {
  import: `<svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M24 44C35.0457 44 44 35.0457 44 24C44 12.9543 35.0457 4 24 4C12.9543 4 4 12.9543 4 24C4 35.0457 12.9543 44 24 44Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M24 16V32" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 24L24 32L32 24" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  shelf: `<svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 39V12C10 10.8954 10.8954 10 12 10H36C37.1046 10 38 10.8954 38 12V39" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M24 20H16" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M32 20H28" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M32 28H16" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 39H42" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  archive: `<svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M38 14H10C8.89543 14 8 14.8954 8 16V40C8 41.1046 8.89543 42 10 42H38C39.1046 42 40 41.1046 40 40V16C40 14.8954 39.1046 14 38 14Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M14 14V8C14 6.89543 14.8954 6 16 6H32C33.1046 6 34 6.89543 34 8V14" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M17 22L31 22" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  home: `<svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 18V42H39V18L24 6L9 18Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M19 29V42H29V29H19Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M9 42H39" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>`,
  emptyFolder: `<svg width="64" height="64" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 8C5 6.89543 5.89543 6 7 6H19L24 12H41C42.1046 12 43 12.8954 43 14V40C43 41.1046 42.1046 42 41 42H7C5.89543 42 5 41.1046 5 40V8Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M24 22V32" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M19 27H29" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  book: `<svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 40C8 36 8 10 8 10C8 6.68629 10.6863 4 14 4H40V34H14C10.6863 34 8 36.6863 8 40Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M8 40C8 43.3137 10.6863 46 14 46H40V34H14C10.6863 34 8 36.6863 8 40Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/></svg>`,
  sparkle: `<svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M24 4L27 16L39 19L27 22L24 34L21 22L9 19L21 16L24 4Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M34 31L35.5 37L41.5 38.5L35.5 40L34 46L32.5 40L26.5 38.5L32.5 37L34 31Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M12 33L13 37L17 38L13 39L12 43L11 39L7 38L11 37L12 33Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/></svg>`,
  close: `<svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14 14L34 34" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 34L34 14" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  play: `<svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M16 10V38L38 24L16 10Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/></svg>`,
  back: `<svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M31 36L19 24L31 12" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  delete: `<svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 10H39" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M20 20V34" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M28 20V34" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M12 10L14 42H34L36 10" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M18 10L20 6H28L30 10" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/></svg>`,
  user: `<svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M24 24C29.5228 24 34 19.5228 34 14C34 8.47715 29.5228 4 24 4C18.4772 4 14 8.47715 14 14C14 19.5228 18.4772 24 24 24Z" fill="none" stroke="currentColor" stroke-width="4"/><path d="M6 44C7.9895 35.9411 15.2153 30 24 30C32.7847 30 40.0105 35.9411 42 44" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>`,
  contact: `<svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="8" y="5" width="32" height="38" rx="3" fill="none" stroke="currentColor" stroke-width="4"/><path d="M18 19H30" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M18 29H26" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M4 14H8M4 24H8M4 34H8" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>`,
  magic: `<svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18 30L32 16" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M28 12L36 20" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 38L18 30" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M12 8V14M9 11H15M38 30V38M34 34H42" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>`,
  edit: `<svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 40H16L38 18L30 10L8 32V40Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M27 13L35 21" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>`,
  moreVertical: `<svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M24 12C26.2091 12 28 10.2091 28 8C28 5.79086 26.2091 4 24 4C21.7909 4 20 5.79086 20 8C20 10.2091 21.7909 12 24 12Z" fill="currentColor"/><path d="M24 28C26.2091 28 28 26.2091 28 24C28 21.7909 26.2091 20 24 20C21.7909 20 20 21.7909 20 24C20 26.2091 21.7909 28 24 28Z" fill="currentColor"/><path d="M24 44C26.2091 44 28 42.2091 28 40C28 37.7909 26.2091 36 24 36C21.7909 36 20 37.7909 20 40C20 42.2091 21.7909 44 24 44Z" fill="currentColor"/></svg>`,
  list: `<svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 12H40" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M12 24H40" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M12 36H40" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M6 12H6.02" stroke="currentColor" stroke-width="6" stroke-linecap="round"/><path d="M6 24H6.02" stroke="currentColor" stroke-width="6" stroke-linecap="round"/><path d="M6 36H6.02" stroke="currentColor" stroke-width="6" stroke-linecap="round"/></svg>`,
  setting: `<svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M19.4 6L18.2 11.1C17.4 11.4 16.7 11.8 16 12.2L11.1 10.6L6.5 18.5L10.3 22C10.2 22.7 10.2 23.3 10.2 24C10.2 24.7 10.2 25.3 10.3 26L6.5 29.5L11.1 37.4L16 35.8C16.7 36.2 17.4 36.6 18.2 36.9L19.4 42H28.6L29.8 36.9C30.6 36.6 31.3 36.2 32 35.8L36.9 37.4L41.5 29.5L37.7 26C37.8 25.3 37.8 24.7 37.8 24C37.8 23.3 37.8 22.7 37.7 22L41.5 18.5L36.9 10.6L32 12.2C31.3 11.8 30.6 11.4 29.8 11.1L28.6 6H19.4Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M24 30C27.3137 30 30 27.3137 30 24C30 20.6863 27.3137 18 24 18C20.6863 18 18 20.6863 18 24C18 27.3137 20.6863 30 24 30Z" fill="none" stroke="currentColor" stroke-width="4"/></svg>`,
  save: `<svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 6H34L42 14V42H10V6Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M16 6V20H32V6" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M16 42V30H32V42" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/></svg>`,
  next: `<svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M17 12L29 24L17 36" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  palette: `<svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M24 44C12.9543 44 4 35.4934 4 25C4 14.5066 12.9543 6 24 6C35.0457 6 44 13.6112 44 23C44 29 40 31 36 31H32.5C30.0147 31 28 33.0147 28 35.5C28 37.9853 26 44 24 44Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M14 23C15.1046 23 16 22.1046 16 21C16 19.8954 15.1046 19 14 19C12.8954 19 12 19.8954 12 21C12 22.1046 12.8954 23 14 23Z" fill="currentColor"/><path d="M22 17C23.1046 17 24 16.1046 24 15C24 13.8954 23.1046 13 22 13C20.8954 13 20 13.8954 20 15C20 16.1046 20.8954 17 22 17Z" fill="currentColor"/><path d="M32 21C33.1046 21 34 20.1046 34 19C34 17.8954 33.1046 17 32 17C30.8954 17 30 17.8954 30 19C30 20.1046 30.8954 21 32 21Z" fill="currentColor"/></svg>`,
  check: `<svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 25L20 35L38 15" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`
};

export function escapeHtml(text) {
  const map = {
    '&': String.fromCharCode(38) + 'amp;',
    '<': String.fromCharCode(38) + 'lt;',
    '>': String.fromCharCode(38) + 'gt;',
    '"': String.fromCharCode(38) + 'quot;',
    "'": String.fromCharCode(38) + '#39;'
  };
  return String(text ?? '').replace(/[&<>"']/g, (c) => map[c] || c);
}

/**
 * ==========================================================================
 * [区域标注·已完成·梦笺自定义弹窗]
 * 说明：替代浏览器原生 alert / confirm / prompt，采用梦笺杂志风格 UI。
 * ==========================================================================
 */
export function showModal({ title = '提示', content = '', showCancel = false, confirmText = '确定', cancelText = '取消', onConfirm, onCancel }) {
  const overlay = document.createElement('div');
  overlay.className = 'textgame-modal-overlay';

  overlay.innerHTML = `
    <div class="textgame-modal-container">
      <div class="textgame-modal-title">${escapeHtml(title)}</div>
      <div class="textgame-modal-content">${content}</div>
      <div class="textgame-modal-actions">
        ${showCancel ? `<button class="textgame-modal-btn textgame-modal-btn-cancel">${escapeHtml(cancelText)}</button>` : ''}
        <button class="textgame-modal-btn textgame-modal-btn-confirm">${escapeHtml(confirmText)}</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  requestAnimationFrame(() => {
    overlay.classList.add('active');
  });

  const close = () => {
    overlay.classList.remove('active');
    setTimeout(() => overlay.remove(), 240);
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
 * [区域标注·已完成·梦笺开关组件渲染]
 * 说明：返回 HTML 字符串，仿 iPhone iOS 滑动开关。
 * ==========================================================================
 */
export function renderSwitch(id, isChecked) {
  return `
    <label class="textgame-switch">
      <input type="checkbox" id="${escapeHtml(id)}" ${isChecked ? 'checked' : ''}>
      <span class="textgame-slider"></span>
    </label>
  `;
}
