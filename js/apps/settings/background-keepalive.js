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
   [区域标注·本次需求] 渲染“后台保活与通知”板块 UI
   说明：提供独立面板，内部包含后台保活与消息通知两个小版块。
   ========================================================================== */
export function renderBackgroundKeepaliveSection(state = {}) {
  const isEnabled = Boolean(state.backgroundKeepaliveEnabled);
  return `
    <!-- 后台保活设置页 -->
    <div id="settings-keepalive" class="settings-detail" style="display: none;">
      <div class="settings-detail__body">
        
        <!-- 后台保活板块 -->
        <section class="ui-card">
          <h3>后台保活</h3>
          <p class="ui-muted" style="margin-bottom: 10px;">开启后，即使页面在后台也能保持运行，联系人的回复依然会生成，主动发朋友圈等调用API的行为也能在后台进行。</p>
          
          <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 16px;">
            <div class="ui-muted" style="font-size: 14px; color: rgba(120, 105, 85, 0.75);">启用后台保活</div>
            <label class="toggle-switch toggle-switch--theme">
              <input class="ios-switch__input" type="checkbox" id="setting-background-keepalive" ${isEnabled ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>
        </section>

        <!-- 消息通知板块 -->
        <section class="ui-card" style="margin-top: 16px;">
          <h3>消息通知</h3>
          <p class="ui-muted" style="margin-bottom: 10px;">开启浏览器通知权限后，联系人在后台发送的消息将通过系统通知提醒你。</p>
          
          <div style="display: flex; gap: 10px; margin-top: 16px;">
            <button class="ui-btn ui-btn--primary" id="btn-request-notification" style="flex: 1;">请求通知权限</button>
            <button class="ui-btn ui-btn--secondary" id="btn-test-notification" style="flex: 1;">测试通知</button>
          </div>
        </section>

      </div>
    </div>
  `;
}

/* ==========================================================================
   [区域标注·本次需求] 绑定事件与权限请求
   说明：
   1. 开关仅负责控制持久化状态，不耦合权限请求。
   2. 权限请求按钮单独点击触发浏览器原生通知授权。
   3. 测试按钮检测权限并发送通知验证。
   ========================================================================== */
export function bindBackgroundKeepaliveEvents(container, { settings }) {
  const checkbox = container.querySelector('#setting-background-keepalive');
  const btnRequest = container.querySelector('#btn-request-notification');
  const btnTest = container.querySelector('#btn-test-notification');

  // 后台保活开关 - 只保存状态，不强绑授权
  if (checkbox) {
    checkbox.addEventListener('change', async (e) => {
      const isChecked = e.target.checked;
      try {
        await settings.update({ backgroundKeepaliveEnabled: isChecked });
      } catch (err) {
        console.error('Failed to save background keepalive settings', err);
        e.target.checked = !isChecked; // 失败恢复
      }
    });
  }

  // 请求通知权限按钮
  if (btnRequest) {
    btnRequest.addEventListener('click', async () => {
      if (!('Notification' in window)) {
        alert('你的浏览器不支持系统通知。');
        return;
      }
      
      if (Notification.permission === 'granted') {
        alert('已开启通知权限，无需再次请求。');
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        alert('通知权限已开启！后台消息将会通过系统弹窗提醒你。');
      } else {
        alert('未能获取通知权限。如果曾经拒绝过，请在浏览器设置中手动允许。');
      }
    });
  }

  // 测试通知按钮
  if (btnTest) {
    btnTest.addEventListener('click', () => {
      if (!('Notification' in window)) {
        alert('你的浏览器不支持系统通知。');
        return;
      }

      if (Notification.permission === 'granted') {
        new Notification('后台保活测试', {
          body: '如果你能看到这条消息，说明浏览器通知功能正常！',
        });
      } else {
        alert('未开启通知权限，请先点击“请求通知权限”进行授权。');
      }
    });
  }
}
