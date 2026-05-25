/**
 * 文件名: js/apps/settings/background-keepalive.js
 * 用途: 设置应用 - 后台保活与通知模块
 *       控制开启/关闭后台保活状态。开启后允许闲谈应用在后台生成 AI 回复并通过浏览器通知提醒用户。
 * 架构层: 应用层
 */

// IconPark 图标 - 保活/通知
const ICON_KEEPALIVE = `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="22" height="22"><path d="M24 4C12.9543 4 4 12.9543 4 24C4 35.0457 12.9543 44 24 44C35.0457 44 44 35.0457 44 24C44 12.9543 35.0457 4 24 4Z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M24 16V24" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="24" cy="32" r="2" fill="currentColor"/></svg>`;

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&#039;');
}

/* ==========================================================================
   [区域标注·本次需求] 渲染“后台保活”板块 UI
   说明：提供独立面板，内部包含一个 iPhone 风格的滑动式开关。
   ========================================================================== */
export function renderBackgroundKeepaliveSection(state = {}) {
  const isEnabled = Boolean(state.backgroundKeepaliveEnabled);
  return `
    <!-- 后台保活设置页 -->
    <div id="settings-keepalive" class="settings-detail" style="display: none;">
      <div class="settings-detail__body">
        <section class="ui-card">
          <h3>后台保活与通知</h3>
          <p class="ui-muted" style="margin-bottom: 10px;">开启后，如果你把小手机网页切换到手机后台去浏览其它应用/网页了，闲谈应用中AI的回复依然能在后台生成，并会通过通知提醒你。</p>
          
          <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 16px;">
            <div class="ui-muted" style="font-size: 14px; color: rgba(120, 105, 85, 0.75);">启用后台保活</div>
            <label class="toggle-switch toggle-switch--theme">
              <input class="ios-switch__input" type="checkbox" id="setting-background-keepalive" ${isEnabled ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>
        </section>
      </div>
    </div>
  `;
}

/* ==========================================================================
   [区域标注·本次需求] 绑定事件与权限请求
   说明：
   1. 当用户点击开关且即将开启时，若 Notification 权限不足，则使用应用内 Modal 引导用户授权。
   2. 数据存储通过传入的 settings 接口（底层 IndexedDB），禁用 localStorage。
   ========================================================================== */
export function bindBackgroundKeepaliveEvents(container, { settings }) {
  const checkbox = container.querySelector('#setting-background-keepalive');
  if (!checkbox) return;

  checkbox.addEventListener('change', async (e) => {
    const isChecked = e.target.checked;

    if (isChecked) {
      // 检查浏览器通知权限
      if (!('Notification' in window)) {
        e.target.checked = false;
        alert('你的浏览器不支持系统通知，无法开启后台保活功能。');
        return;
      }

      // 如果没有权限，则请求权限
      if (Notification.permission !== 'granted') {
        const permission = await Notification.requestPermission();
        // 无论原先是 default 还是 denied，如果请求后不是 granted，就说明最终用户没给权限
        if (permission !== 'granted') {
          e.target.checked = false;
          alert('未能获取通知权限，无法开启后台保活通知。如果曾经拒绝过，请在浏览器设置中手动允许。');
          return;
        }
      }
    }

    // 保存设置
    try {
      await settings.update({ backgroundKeepaliveEnabled: isChecked });
    } catch (err) {
      console.error('Failed to save background keepalive settings', err);
      e.target.checked = !isChecked; // 失败恢复
    }
  });
}
