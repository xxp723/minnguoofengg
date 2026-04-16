/**
 * 文件名: js/apps/settings/index.js
 * 用途: 设置应用（卡片式分类界面）
 *- 首页：4个圆角卡片式分类选项（仿iPhone扁平化）
 *       - 详情页：外观设置、API设置、数据设置、日志
 * 位置: /js/apps/settings/index.js
 * 架构层: 应用层（由AppManager 动态加载）
 */
import { Logger } from '../../utils/Logger.js';

// IconPark SVG 图标定义
const ICONS = {
  appearance: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="22" height="22"><path d="M24 44C35.0457 44 44 35.0457 44 24C44 12.9543 35.0457 4 24 4C12.9543 4 4 12.9543 4 24C4 35.0457 12.9543 44 24 44Z" fill="none" stroke="#333" stroke-width="3" stroke-linejoin="round"/><path d="M24 4V24L39.5 37" stroke="#333" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M24 4C24 4 36.2 8.4 39.5 37" fill="none" stroke="#333" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="14" cy="14" r="3" fill="#F97066"/><circle cx="10" cy="26" r="3" fill="#47B881"/><circle cx="16" cy="36" r="3" fill="#6C6EC7"/><circle cx="30" cy="16" r="3" fill="#FFCB47"/></svg>`,
  api: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="22" height="22"><path d="M40 12L24 4L8 12V36L24 44L40 36V12Z" fill="none" stroke="#333" stroke-width="3" stroke-linejoin="round"/><path d="M24 44V24" stroke="#333" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M40 12L24 24" stroke="#333" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 12L24 24" stroke="#333" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M24 4V14" stroke="#333" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  data: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="22" height="22"><path d="M42 6H6V20H42V6Z" fill="none" stroke="#333" stroke-width="3" stroke-linejoin="round"/><path d="M42 28H6V42H42V28Z" fill="none" stroke="#333" stroke-width="3" stroke-linejoin="round"/><circle cx="13" cy="13" r="2" fill="#333"/><circle cx="13" cy="35" r="2" fill="#333"/><path d="M21 13H35" stroke="#333" stroke-width="3" stroke-linecap="round"/><path d="M21 35H35" stroke="#333" stroke-width="3" stroke-linecap="round"/><path d="M24 20V28" stroke="#333" stroke-width="3" stroke-linecap="round"/></svg>`,
  logs: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="22" height="22"><rect x="8" y="4" width="32" height="40" rx="2" fill="none" stroke="#333" stroke-width="3" stroke-linejoin="round"/><path d="M16 16H32" stroke="#333" stroke-width="3" stroke-linecap="round"/><path d="M16 24H32" stroke="#333" stroke-width="3" stroke-linecap="round"/><path d="M16 32H24" stroke="#333" stroke-width="3" stroke-linecap="round"/></svg>`
};

export async function mount(container, context) {
  const { settings, eventBus } = context;
  const current = await settings.getAll();

  // 当前页面状态
  let currentPage = 'home';

  // 创建主容器
  container.innerHTML = `
    <div class="settings-app-container" style="height: 100%; display: flex; flex-direction: column;">
      <!-- 首页 -->
      <div id="settings-home" class="settings-home">
        <div class="settings-cards-grid">
          <div class="settings-card" data-page="appearance">
            <div class="settings-card__icon">${ICONS.appearance}</div>
            <h3 class="settings-card__title">外观设置</h3>
          </div>
          <div class="settings-card" data-page="api">
            <div class="settings-card__icon">${ICONS.api}</div>
            <h3 class="settings-card__title">API设置</h3>
          </div>
          <div class="settings-card" data-page="data">
            <div class="settings-card__icon">${ICONS.data}</div>
            <h3 class="settings-card__title">数据设置</h3>
          </div>
          <div class="settings-card" data-page="logs">
            <div class="settings-card__icon">${ICONS.logs}</div>
            <h3 class="settings-card__title">日志</h3>
          </div>
        </div>
      </div>

      <!-- 外观设置详情页 -->
      <div id="settings-appearance" class="settings-detail">
        <div class="settings-detail__header">
          <button class="settings-detail__back">\u2190</button>
          <h3 class="settings-detail__title">外观设置</h3>
        </div>
        <div class="settings-detail__body">
          <section class="ui-card">
            <h3>主题色</h3>
            <p class="ui-muted" style="margin-bottom: 10px;">控制桌面主题色调</p>
            <label style="display:flex;align-items:center;gap:10px;font-size:13px;">
              <span style="min-width:70px;">主题色:</span>
              <input id="setting-theme-color" type="color" value="${current.appearance?.themeColor || '#4f46e5'}">
            </label>
          </section>
          <section class="ui-card">
            <h3>图标大小</h3>
            <p class="ui-muted" style="margin-bottom: 10px;">调整桌面图标尺寸</p>
            <label style="display:flex;align-items:center;gap:10px;font-size:13px;">
              <span style="min-width:70px;">图标大小:</span>
              <input id="setting-icon-size" type="number" min="40" max="96" value="${current.appearance?.iconSize || 56}" style="flex:1;">
            </label>
          </section>
          <section class="ui-card">
            <h3>状态栏</h3>
            <p class="ui-muted" style="margin-bottom: 10px;">控制顶部状态栏显示</p>
            <label style="display:flex;align-items:center;gap:10px;font-size:13px;">
              <input id="setting-status-bar" type="checkbox" ${localStorage.getItem('miniphone_status_bar_hidden') === '1' ? '' : 'checked'}>
              <span>显示顶部状态栏</span>
            </label>
          </section>
          <section class="ui-card">
            <h3>全屏显示</h3>
            <p class="ui-muted" style="margin-bottom: 10px;">去除小手机外框限制，以全屏模式显示</p>
            <label style="display:flex;align-items:center;gap:10px;font-size:13px;">
              <input id="setting-fullscreen" type="checkbox" ${localStorage.getItem('miniphone_fullscreen') === '1' ? 'checked' : ''}>
              <span>启用全屏显示模式</span>
            </label>
          </section>
          <button class="ui-button primary" id="save-appearance" style="width: 100%; margin-top: 10px;">保存外观设置</button>
        </div>
      </div>

      <!-- API设置详情页 -->
      <div id="settings-api" class="settings-detail">
        <div class="settings-detail__header">
          <button class="settings-detail__back">\u2190</button>
          <h3 class="settings-detail__title">API设置</h3>
        </div>
        <div class="settings-detail__body">
          <section class="ui-card">
            <h3>生图API</h3>
            <p class="ui-muted" style="margin-bottom: 10px;">配置文生图接口</p>
            <div style="display:grid;gap:10px;">
              <input id="api-image-url" type="text" placeholder="生图 API Base URL" value="${current.api?.textToImage?.baseUrl || ''}">
              <input id="api-image-key" type="text" placeholder="生图 API Key" value="${current.api?.textToImage?.apiKey || ''}">
            </div>
          </section>
          <section class="ui-card">
            <h3>MiniMax TTS</h3>
            <p class="ui-muted" style="margin-bottom: 10px;">配置语音合成接口</p>
            <div style="display:grid;gap:10px;">
              <input id="api-tts-url" type="text" placeholder="MiniMax TTS Base URL" value="${current.api?.minimaxTTS?.baseUrl || ''}">
              <input id="api-tts-key" type="text" placeholder="MiniMax TTS API Key" value="${current.api?.minimaxTTS?.apiKey || ''}">
            </div>
          </section>
          <button class="ui-button primary" id="save-api" style="width: 100%; margin-top: 10px;">保存 API 设置</button>
        </div>
      </div>

      <!-- 数据设置详情页 -->
      <div id="settings-data" class="settings-detail">
        <div class="settings-detail__header">
          <button class="settings-detail__back">\u2190</button>
          <h3 class="settings-detail__title">数据设置</h3>
        </div>
        <div class="settings-detail__body">
          <section class="ui-card">
            <h3>数据导入/ 导出</h3>
            <p class="ui-muted" style="margin-bottom: 10px;">导出或导入小手机本地数据（桌面配置、设置、记忆、应用数据、日志）</p>
            <div style="display:flex;gap:10px;flex-wrap:wrap;">
              <button class="ui-button" id="export-data">导出数据(JSON)</button>
              <label class="ui-button" style="cursor:pointer;">
                导入数据(JSON)
                <input id="import-file" type="file" accept=".json,application/json" style="display:none;">
              </label>
            </div>
          </section>
        </div>
      </div>

      <!-- 日志详情页 -->
      <div id="settings-logs" class="settings-detail">
        <div class="settings-detail__header">
          <button class="settings-detail__back">\u2190</button>
          <h3 class="settings-detail__title">日志</h3>
        </div>
        <div class="settings-detail__body">
          <section class="ui-card">
            <h3>系统日志</h3>
            <p class="ui-muted" style="margin-bottom: 10px;">查看系统运行时的所有日志内容</p>
            <div style="display:flex;gap:10px;margin-bottom:12px;flex-wrap:wrap;">
              <button class="ui-button" id="view-all-logs">查看全部日志</button>
              <button class="ui-button" id="view-error-logs">查看错误日志</button>
            </div>
            <div id="log-viewer-area" style="max-height:400px;overflow-y:auto;background:var(--c-white-rice);border:1px solid var(--c-gray-light);border-radius:10px;padding:12px;font-size:12px;display:none;"></div>
          </section>
        </div>
      </div>
    </div>
  `;

  // 页面导航函数
  const navigateTo = (page) => {
    const pages = ['home', 'appearance', 'api', 'data', 'logs'];
    pages.forEach(p => {
      const el = container.querySelector(`#settings-${p}`);
      if (el) {
        if (p === page) {
          el.classList.add('is-active');
          el.style.display = p === 'home' ? 'block' : 'flex';
        } else {
          el.classList.remove('is-active');
          el.style.display = 'none';
        }
      }
    });

    currentPage = page;
  };

  // 卡片点击事件
  container.querySelectorAll('.settings-card').forEach(card => {
    card.addEventListener('click', () => {
      const page = card.dataset.page;
      navigateTo(page);
    });
  });

  // 返回按钮事件
  container.querySelectorAll('.settings-detail__back').forEach(btn => {
    btn.addEventListener('click', () => {
      navigateTo('home');
    });
  });

  // 外观设置保存
  const onSaveAppearance = async () => {
    const themeColor = container.querySelector('#setting-theme-color')?.value || '#4f46e5';
    const iconSize = Number(container.querySelector('#setting-icon-size')?.value || 56);
    const statusBarChecked = container.querySelector('#setting-status-bar')?.checked;
    const fullscreenChecked = container.querySelector('#setting-fullscreen')?.checked;

    // 状态栏显示控制
    if (statusBarChecked) {
      localStorage.removeItem('miniphone_status_bar_hidden');
      document.body.classList.remove('hide-status-bar');
    } else {
      localStorage.setItem('miniphone_status_bar_hidden', '1');
      document.body.classList.add('hide-status-bar');
    }

    // 全屏显示控制
    if (fullscreenChecked) {
      localStorage.setItem('miniphone_fullscreen', '1');
      document.body.classList.add('fullscreen-mode');
    } else {
      localStorage.removeItem('miniphone_fullscreen');
      document.body.classList.remove('fullscreen-mode');
    }

    await settings.update({
      appearance: {
        ...(current.appearance || {}),
        themeColor,
        iconSize
      }
    });

    eventBus?.emit('settings:appearance-changed', { themeColor, iconSize });
    Logger.info('外观设置已保存');
  };

  // API设置保存
  const onSaveApi = async () => {
    const imageUrl = container.querySelector('#api-image-url')?.value || '';
    const imageKey = container.querySelector('#api-image-key')?.value || '';
    const ttsUrl = container.querySelector('#api-tts-url')?.value || '';
    const ttsKey = container.querySelector('#api-tts-key')?.value || '';

    await settings.update({
      api: {
        textToImage: { baseUrl: imageUrl, apiKey: imageKey },
        minimaxTTS: { baseUrl: ttsUrl, apiKey: ttsKey, voiceId: '' }
      }
    });

    Logger.info('API 设置已保存');
  };

  // 数据导出
  const onExport = async () => {
    const backup = await settings.exportAllData();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `miniphone-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);};

  // 数据导入
  const onImport = async (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const backup = JSON.parse(text);
    await settings.importAllData(backup, { overwrite: true });
    Logger.info('导入成功，请返回桌面查看最新状态');
  };

  // 日志渲染
  const renderLogs = (type) => {
    const logEl = container.querySelector('#log-viewer-area');
    if (!logEl) return;
    
    logEl.style.display = 'block';
    
    const logs = localStorage.getItem('miniphone_sys_logs') || '[]';
    let parsedLogs = [];
    try {
      parsedLogs = JSON.parse(logs);
    } catch(e) {}
    
    let filteredLogs = parsedLogs;
    if (type === 'error') {
      filteredLogs = parsedLogs.filter(l => l.level === 'error');
    }
    
    if (!filteredLogs.length) {
      logEl.innerHTML = '<div style="text-align:center;color:#999;padding:20px;">\u6682\u65E0\u76F8\u5173\u65E5\u5FD7</div>';
      return;
    }
    
    logEl.innerHTML = filteredLogs
      .reverse()
      .slice(0, 100)
      .map((item) => {
        const color = item.level === 'error' ? 'red' : (item.level === 'warn' ? 'orange' : 'inherit');
        return `<div style="margin-bottom:6px;color:${color};border-bottom:1px dashed #ccc;padding-bottom:4px;">
          [${item.level.toUpperCase()}] ${new Date(item.timestamp).toLocaleString()} <br>
          ${item.message}
          ${item.details ? `<pre style="margin:2px 0 0;white-space:pre-wrap;font-size:10px;background:#eee;padding:2px;">${JSON.stringify(item.details)}</pre>` : ''}
        </div>`;
      })
      .join('');
  };

  // 绑定事件
  container.querySelector('#save-appearance')?.addEventListener('click', onSaveAppearance);
  container.querySelector('#save-api')?.addEventListener('click', onSaveApi);
  container.querySelector('#export-data')?.addEventListener('click', onExport);
  container.querySelector('#import-file')?.addEventListener('change', onImport);
  container.querySelector('#view-all-logs')?.addEventListener('click', () => renderLogs('all'));
  container.querySelector('#view-error-logs')?.addEventListener('click', () => renderLogs('error'));

  // 初始化显示首页
  navigateTo('home');

  return {
    destroy() {
      // 清理资源
    }
  };
}

export async function unmount(instance) {
  if (instance && typeof instance.destroy === 'function') {
    instance.destroy();
  }
}
