import { Logger } from '../../utils/Logger.js';

export function renderAppearanceSections({ current, icons }) {
  return `
      <!-- 外观设置详情页（改为卡片式分类） -->
      <div id="settings-appearance" class="settings-detail">
        <div class="settings-detail__body">
          <div class="settings-cards-grid">
            <div class="settings-card" data-page="appearance-ui">
              <div class="settings-card__icon">${icons.ui}</div>
              <h3 class="settings-card__title">界面设置</h3>
            </div>
            <div class="settings-card" data-page="appearance-wallpaper">
              <div class="settings-card__icon">${icons.wallpaper}</div>
              <h3 class="settings-card__title">壁纸设置</h3>
            </div>
            <div class="settings-card" data-page="appearance-icon">
              <div class="settings-card__icon">${icons.icon}</div>
              <h3 class="settings-card__title">图标设置</h3>
            </div>
          </div>
        </div>
      </div>

      <!-- 界面设置子页面 -->
      <div id="settings-appearance-ui" class="settings-detail">
        <div class="settings-detail__body">
          <section class="ui-card">
            <h3>顶部状态栏显示</h3>
            <p class="ui-muted" style="margin-bottom: 10px;">控制顶部状态栏是否显示</p>
            <label style="display:flex;align-items:center;justify-content:space-between;font-size:13px;">
              <span>显示顶部状态栏</span>
              <label class="toggle-switch">
                <input id="setting-status-bar" type="checkbox" ${localStorage.getItem('miniphone_status_bar_hidden') === '1' ? '' : 'checked'}>
                <span class="toggle-slider"></span>
              </label>
            </label>
          </section>
          <section class="ui-card">
            <h3>全屏显示</h3>
            <p class="ui-muted" style="margin-bottom: 10px;">去除小手机外框限制，以全屏模式显示</p>
            <label style="display:flex;align-items:center;justify-content:space-between;font-size:13px;">
              <span>启用全屏显示模式</span>
              <label class="toggle-switch">
                <input id="setting-fullscreen" type="checkbox" ${localStorage.getItem('miniphone_fullscreen') === '1' ? 'checked' : ''}>
                <span class="toggle-slider"></span>
              </label>
            </label>
          </section>
          <button class="ui-button primary" id="save-ui-settings" style="width: 100%; margin-top: 10px;">保存界面设置</button>
        </div>
      </div>

      <!-- 壁纸设置子页面 -->
      <div id="settings-appearance-wallpaper" class="settings-detail">
        <div class="settings-detail__body">
          <section class="ui-card">
            <h3>壁纸设置</h3>
            <p class="ui-muted" style="margin-bottom: 10px;">自定义桌面壁纸（功能开发中）</p>
            <div style="text-align:center;color:#B2967D;padding:30px 0;font-size:13px;">暂未开放，敬请期待</div>
          </section>
        </div>
      </div>

      <!-- 图标设置子页面 -->
      <div id="settings-appearance-icon" class="settings-detail">
        <div class="settings-detail__body">
          <section class="ui-card">
            <h3>图标大小</h3>
            <p class="ui-muted" style="margin-bottom: 10px;">调整桌面图标尺寸</p>
            <label style="display:flex;align-items:center;gap:10px;font-size:13px;">
              <span style="min-width:70px;">图标大小:</span>
              <input id="setting-icon-size" type="number" min="40" max="96" value="${current.appearance?.iconSize || 56}" style="flex:1;">
            </label>
          </section>
          <button class="ui-button primary" id="save-icon-settings" style="width: 100%; margin-top: 10px;">保存图标设置</button>
        </div>
      </div>
  `;
}

export function bindAppearanceEvents(container, { settings, eventBus, current }) {
  const onSaveUiSettings = async () => {
    const statusBarChecked = container.querySelector('#setting-status-bar')?.checked;
    const fullscreenChecked = container.querySelector('#setting-fullscreen')?.checked;

    if (statusBarChecked) {
      localStorage.removeItem('miniphone_status_bar_hidden');
      document.body.classList.remove('hide-status-bar');
    } else {
      localStorage.setItem('miniphone_status_bar_hidden', '1');
      document.body.classList.add('hide-status-bar');
    }

    if (fullscreenChecked) {
      localStorage.setItem('miniphone_fullscreen', '1');
      document.body.classList.add('fullscreen-mode');
    } else {
      localStorage.removeItem('miniphone_fullscreen');
      document.body.classList.remove('fullscreen-mode');
    }

    Logger.info('界面设置已保存');
  };

  const onSaveIconSettings = async () => {
    const iconSize = Number(container.querySelector('#setting-icon-size')?.value || 56);

    await settings.update({
      appearance: {
        ...(current.appearance || {}),
        iconSize
      }
    });

    eventBus?.emit('settings:appearance-changed', { iconSize });
    Logger.info('图标设置已保存');
  };

  container.querySelector('#save-ui-settings')?.addEventListener('click', onSaveUiSettings);
  container.querySelector('#save-icon-settings')?.addEventListener('click', onSaveIconSettings);
}
