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
    <div id="settings-keepalive" class="settings-page" style="display: none;">
      <div class="settings-form-group">
        <div class="settings-form-group__header">
          <span class="settings-form-group__icon">${ICON_KEEPALIVE}</span>
          <h4 class="settings-form-group__title">后台保活与通知</h4>
        </div>
        <p class="settings-form-group__desc">开启后，如果你把小手机网页切换到手机后台去浏览其它应用/网页了，闲谈应用中AI的回复依然能在后台生成，并会通过通知提醒你。</p>
        
        <div class="settings-row">
          <div class="settings-row__content">
            <div class="settings-row__title">启用后台保活</div>
            <div class="settings-row__desc">允许后台生成并在收到回复时弹窗通知</div>
          </div>
          <div class="settings-row__action">
            <label class="ui-switch">
              <input type="checkbox" id="setting-background-keepalive" ${isEnabled ? 'checked' : ''}>
              <span class="ui-switch__slider"></span>
            </label>
          </div>
        </div>
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

  // 自定义应用内确认弹窗
  const showPermissionModal = () => {
    return new Promise((resolve) => {
      const modalHtml = `
        <div class="chat-modal" id="keepalive-permission-modal">
          <div class="chat-modal__backdrop"></div>
          <div class="chat-modal__content">
            <h3 class="chat-modal__title">需要通知权限</h3>
            <p class="chat-modal__text">为了在后台通知你 AI 回复了消息，我们需要申请浏览器的通知权限。请在接下来的浏览器提示中选择“允许”。</p>
            <div class="chat-modal__actions">
              <button class="ui-button ui-button--ghost" data-action="cancel">取消</button>
              <button class="ui-button ui-button--primary" data-action="confirm">去授权</button>
            </div>
          </div>
        </div>
      `;
      document.body.insertAdjacentHTML('beforeend', modalHtml);
      const modalEl = document.getElementById('keepalive-permission-modal');
      
      const cleanup = () => {
        if (modalEl) modalEl.remove();
      };

      modalEl.querySelector('[data-action="cancel"]').addEventListener('click', () => {
        cleanup();
        resolve(false);
      });

      modalEl.querySelector('[data-action="confirm"]').addEventListener('click', () => {
        cleanup();
        resolve(true);
      });
    });
  };

  checkbox.addEventListener('change', async (e) => {
    const isChecked = e.target.checked;

    if (isChecked) {
      // 检查浏览器通知权限
      if (!('Notification' in window)) {
        alert('你的浏览器不支持系统通知。'); // 提示不支持，无法用内建的
        e.target.checked = false;
        return;
      }

      if (Notification.permission === 'default') {
        const userAgreed = await showPermissionModal();
        if (!userAgreed) {
          e.target.checked = false;
          return;
        }

        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          e.target.checked = false;
          return;
        }
      } else if (Notification.permission === 'denied') {
        // 如果被拒了，我们只能重置开关并用应用内弹窗告知
        e.target.checked = false;
        const deniedModalHtml = `
          <div class="chat-modal" id="keepalive-denied-modal">
            <div class="chat-modal__backdrop"></div>
            <div class="chat-modal__content">
              <h3 class="chat-modal__title">通知权限被拒绝</h3>
              <p class="chat-modal__text">你之前拒绝了通知权限。请在浏览器设置中手动允许本网站发送通知后，再来开启此功能。</p>
              <div class="chat-modal__actions">
                <button class="ui-button ui-button--primary" data-action="close">我知道了</button>
              </div>
            </div>
          </div>
        `;
        document.body.insertAdjacentHTML('beforeend', deniedModalHtml);
        const deniedModalEl = document.getElementById('keepalive-denied-modal');
        deniedModalEl.querySelector('[data-action="close"]').addEventListener('click', () => {
          deniedModalEl.remove();
        });
        return;
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
