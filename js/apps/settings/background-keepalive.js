/**
 * 文件名: js/apps/settings/background-keepalive.js
 * 用途: 设置应用 - 后台保活与通知模块
 *       控制开启/关闭后台保活状态、应用内横幅、系统级PWA通知。
 * 架构层: 应用层
 */

// IconPark 图标 - 保活/通知
const ICON_BELL = `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="18" height="18"><path d="M24 4C16.268 4 10 10.268 10 18V26L6 34H42L38 26V18C38 10.268 31.732 4 24 4Z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M18 34V38C18 41.3137 20.6863 44 24 44C27.3137 44 30 41.3137 30 38V34" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_PLAY = `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="18" height="18"><path d="M15 24V11.8756L25.5 17.9378L36 24L25.5 30.0622L15 36.1244V24Z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>`;
const ICON_MESSAGE = `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="18" height="18"><path d="M44 24C44 35.0457 35.0457 44 24 44C18.0222 44 12.6551 41.3789 9 37.1501L4 44L6.15571 34.5029C4.78772 31.4287 4 27.8385 4 24C4 12.9543 12.9543 4 24 4C35.0457 4 44 12.9543 44 24Z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>`;

// Base64 极简静音音频 (短静音 WAV)
const SILENT_AUDIO_B64 = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

// [区域标注·已修改] 升级“静音保活”策略
// 初始化全局音频对象，保证在整个应用生命周期中可用
if (typeof window !== 'undefined' && !window.__keepaliveAudio) {
  window.__keepaliveAudio = new Audio(SILENT_AUDIO_B64);
  window.__keepaliveAudio.loop = true;
  window.__keepaliveAudio.volume = 0.01;
}

/* ==========================================================================
   [区域标注·已完成·角色回复横幅点击跳转] 应用内横幅通知策略
   说明：
   1. 同一轮 AI 多条回复会多次调用 showInAppNotification；这里按队列逐条展示，避免只看到最后一条或多条横幅互相覆盖。
   2. 横幅支持可选 onClick 回调；闲谈应用会用它在用户点击角色回复横幅时跳转到对应角色聊天窗口。
   3. 本区域只处理运行时 DOM 与点击回调，不使用 localStorage/sessionStorage，不使用浏览器原生弹窗。
   ========================================================================== */
if (typeof window !== 'undefined' && !window.__inAppNotificationQueueState) {
  window.__inAppNotificationQueueState = {
    items: [],
    processing: false,
    activeBanner: null
  };
}

if (typeof window !== 'undefined' && !window.showInAppNotification) {
  window.showInAppNotification = (title, body, iconUrl, options = {}) => {
    const queueState = window.__inAppNotificationQueueState;
    if (!queueState) return;

    const notificationOptions = options && typeof options === 'object' ? options : {};

    queueState.items.push({
      title: String(title || ''),
      body: String(body || ''),
      iconUrl: String(iconUrl || ''),
      onClick: typeof notificationOptions.onClick === 'function' ? notificationOptions.onClick : null
    });

    const processQueue = () => {
      if (queueState.processing) return;
      if (!queueState.items.length) return;
      if (!document.body) {
        window.requestAnimationFrame(processQueue);
        return;
      }

      queueState.processing = true;
      const nextItem = queueState.items.shift();
      const banner = document.createElement('div');
      queueState.activeBanner = banner;

      // 仿照 iOS 原生顶部横幅风格，保持设置应用内卡片主题，不使用浏览器原生弹窗。
      banner.style.cssText = `
        position: fixed;
        top: -120px;
        left: 50%;
        transform: translateX(-50%);
        width: 92%;
        max-width: 420px;
        background: rgba(255, 255, 255, 0.95);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12), 0 1px 4px rgba(0,0,0,0.05);
        border-radius: 20px;
        padding: 14px 16px;
        display: flex;
        align-items: center;
        gap: 14px;
        z-index: 2147483647;
        transition: top 0.42s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.22s ease;
        pointer-events: auto;
        cursor: pointer;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        opacity: 0;
      `;

      const iconStr = nextItem.iconUrl
        ? `<img src="${escapeHtml(nextItem.iconUrl)}" alt="" style="width: 42px; height: 42px; border-radius: 10px; object-fit: cover; flex-shrink: 0; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">`
        : '';

      banner.innerHTML = `
        ${iconStr}
        <div style="display: flex; flex-direction: column; gap: 4px; overflow: hidden;">
          <div style="font-size: 15px; font-weight: 600; color: #000; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(nextItem.title)}</div>
          <div style="font-size: 14px; color: #444; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${escapeHtml(nextItem.body)}</div>
        </div>
      `;

      document.body.appendChild(banner);

      let isHiding = false;
      const hide = () => {
        if (isHiding) return;
        isHiding = true;
        banner.style.opacity = '0';
        banner.style.top = '-120px';
        window.setTimeout(() => {
          if (queueState.activeBanner === banner) queueState.activeBanner = null;
          if (banner.parentNode) banner.parentNode.removeChild(banner);
          queueState.processing = false;
          if (queueState.items.length) window.setTimeout(processQueue, 80);
        }, 420);
      };

      let timer = window.setTimeout(hide, 4000);

      /* ======================================================================
         [区域标注·已完成·角色回复横幅点击跳转] 横幅点击处理
         说明：点击角色回复横幅时先执行调用方传入的 onClick（闲谈中用于进入对应聊天窗口），再隐藏当前条并继续展示队列。
         ====================================================================== */
      banner.addEventListener('click', () => {
        window.clearTimeout(timer);
        if (typeof nextItem.onClick === 'function') {
          try {
            nextItem.onClick();
          } catch (error) {
            console.error('应用内横幅点击回调执行失败:', error);
          }
        }
        hide();
      });

      // 向上滑动隐藏当前条。
      let startY = 0;
      banner.addEventListener('touchstart', (e) => {
        startY = e.touches[0].clientY;
      }, { passive: true });
      banner.addEventListener('touchmove', (e) => {
        const currentY = e.touches[0].clientY;
        if (startY - currentY > 10) {
          window.clearTimeout(timer);
          hide();
        }
      }, { passive: true });

      window.requestAnimationFrame(() => {
        banner.style.opacity = '1';
        banner.style.top = '16px';
      });
    };

    processQueue();
  };
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* ==========================================================================
   [区域标注·已完成·纯前端后台保活增强] AI 请求期间的静音保活脉冲
   说明：
   1. 闲谈主 API 请求开始后会调用本函数，主动维持静音音频播放，并在支持的环境中尝试 Wake Lock。
   2. 这是纯前端“尽量保活”：能提高部分安卓/桌面浏览器后台继续执行 fetch 的概率，
      但不能突破 iOS/安卓系统冻结网页、暂停 JS 或断开网络请求的硬限制。
   3. 本区域不使用 localStorage/sessionStorage，不写入任何双份存储兜底；AI 任务状态仍由聊天模块走 DB.js / IndexedDB。
   ========================================================================== */
export function startBackgroundKeepalivePulse(reason = 'ai-request') {
  const releaseFns = [];
  const normalizedReason = String(reason || 'ai-request').trim() || 'ai-request';

  if (typeof window === 'undefined') {
    return () => {};
  }

  const audio = window.__keepaliveAudio;
  if (audio && typeof audio.play === 'function') {
    try {
      audio.loop = true;
      audio.volume = 0.01;
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(err => {
          console.warn(`[后台保活] 静音音频保活被浏览器拦截(${normalizedReason}):`, err);
        });
      }
    } catch (err) {
      console.warn(`[后台保活] 静音音频保活启动失败(${normalizedReason}):`, err);
    }
  }

  if (typeof navigator !== 'undefined' && navigator.wakeLock && typeof navigator.wakeLock.request === 'function') {
    let wakeLockSentinel = null;
    let released = false;

    navigator.wakeLock.request('screen')
      .then(sentinel => {
        wakeLockSentinel = sentinel;
        sentinel.addEventListener?.('release', () => {
          wakeLockSentinel = null;
        });
      })
      .catch(err => {
        console.warn(`[后台保活] Wake Lock 不可用或被拒绝(${normalizedReason}):`, err);
      });

    releaseFns.push(() => {
      released = true;
      if (wakeLockSentinel && typeof wakeLockSentinel.release === 'function') {
        wakeLockSentinel.release().catch(() => {});
      }
      wakeLockSentinel = null;
    });

    const restoreWakeLock = () => {
      if (released || document.visibilityState === 'hidden' || wakeLockSentinel) return;
      navigator.wakeLock.request('screen')
        .then(sentinel => {
          wakeLockSentinel = sentinel;
        })
        .catch(() => {});
    };

    document.addEventListener('visibilitychange', restoreWakeLock);
    releaseFns.push(() => document.removeEventListener('visibilitychange', restoreWakeLock));
  }

  return () => {
    releaseFns.forEach(fn => {
      try {
        fn();
      } catch (_err) {}
    });
  };
}

/* ==========================================================================
   [区域标注·本次需求] 渲染“后台保活与通知”板块 UI
   说明：提供独立面板，分为“静音保活”、“网页内横幅通知”和“系统消息通知”。
   ========================================================================== */
export function renderBackgroundKeepaliveSection(state = {}) {
  const isKeepaliveEnabled = Boolean(state.backgroundKeepaliveEnabled);
  const isInAppEnabled = state.inAppNotificationEnabled !== false; // 默认开启

  const hasSystemNotif = 'Notification' in window;
  const sysPerm = hasSystemNotif ? Notification.permission : '不支持';
  const permColor = !hasSystemNotif || sysPerm === 'denied' ? '#ff3b30' : (sysPerm === 'granted' ? '#34c759' : '#ff9500');

  return `
    <!-- 后台保活设置页 -->
    <div id="settings-keepalive" class="settings-detail" style="display: none;">
      <div class="settings-detail__body" style="padding-bottom: 40px;">
        
        <!-- [区域标注·已修改] 重新布局：静音保活板块 -->
        <section class="ui-card">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
            <h3 style="margin: 0;">静音保活</h3>
          </div>
          <div style="font-size: 13px; color: #666; margin-bottom: 16px; display: flex; gap: 8px;">
            <span>状态: <span id="keepalive-status-text" class="${isKeepaliveEnabled ? 'ui-theme-color' : 'ui-muted'}">${isKeepaliveEnabled ? '已开启' : '未开启'}</span></span>
            <span class="ui-muted">|</span>
            <span>播放态: <span id="keepalive-play-text" class="ui-muted">未播放</span></span>
          </div>

          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
            <div class="ui-muted" style="font-size: 14px; color: rgba(120, 105, 85, 0.75);">启用静音保活</div>
            <label class="toggle-switch toggle-switch--theme">
              <input class="ios-switch__input" type="checkbox" id="setting-background-keepalive" ${isKeepaliveEnabled ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>
          
          <p class="ui-muted" style="font-size: 12px; border-top: 1px solid rgba(0,0,0,0.05); padding-top: 12px; margin-bottom: 0;">通过循环播放内嵌静音音频尝试后台保活。不保证所有机型有效。</p>
        </section>

        <!-- [区域标注·已修改] 重新布局：网页内横幅通知板块 (破壁新功能) -->
        <section class="ui-card" style="margin-top: 16px;">
          <h3 style="margin-bottom: 12px;">网页内横幅通知 (推荐)</h3>
          <div style="font-size: 13px; color: #666; margin-bottom: 16px;">
            <span>状态: <span id="inapp-status-text" class="${isInAppEnabled ? 'ui-theme-color' : 'ui-muted'}">${isInAppEnabled ? '已开启' : '未开启'}</span></span>
          </div>

          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
            <div class="ui-muted" style="font-size: 14px; color: rgba(120, 105, 85, 0.75);">启用横幅通知</div>
            <label class="toggle-switch toggle-switch--theme">
              <input class="ios-switch__input" type="checkbox" id="setting-inapp-notification" ${isInAppEnabled ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>

          <div class="appearance-inline-actions" style="margin-bottom: 12px;">
            <button class="ui-button" type="button" id="btn-test-inapp-notification" style="width: 100%; justify-content: center;">${ICON_MESSAGE}<span style="margin-left: 4px;">测试横幅弹窗</span></button>
          </div>

          <p class="ui-muted" style="font-size: 12px; border-top: 1px solid rgba(0,0,0,0.05); padding-top: 12px; margin-bottom: 0;">在网页打开时不依赖系统权限，当收到新消息时从屏幕顶部优雅滑出横幅。</p>
        </section>

        <!-- [区域标注·已修改] 重新布局：系统消息通知板块 (PWA) -->
        <section class="ui-card" style="margin-top: 16px;">
          <h3 style="margin-bottom: 12px;">系统通知 (需添加到主屏幕)</h3>
          <div style="font-size: 13px; color: #666; margin-bottom: 16px; display: flex; gap: 8px;">
            <span>支持: <span class="${hasSystemNotif ? 'ui-theme-color' : 'ui-muted'}">${hasSystemNotif ? '是' : '否'}</span></span>
            <span class="ui-muted">|</span>
            <span>权限: <span id="system-perm-text" class="ui-muted">${sysPerm}</span></span>
          </div>
          
          <div class="appearance-inline-actions appearance-inline-actions--icon-dual" style="margin-bottom: 12px;">
            <button class="ui-button" type="button" id="btn-request-notification" style="flex: 1; padding: 0 8px;"><span>开启通知</span></button>
            <button class="ui-button primary" type="button" id="btn-test-notification" style="flex: 1; padding: 0 8px;"><span>测试系统弹窗</span></button>
          </div>

          <div class="api-test-result" id="keepalive-notification-result" style="display: none; margin-bottom: 12px; border-radius: 12px; font-size: 12px; padding: 9px 10px; min-height: 38px; align-items: flex-start; gap: 6px;">
            <span class="api-test-result__icon" style="line-height: 0; margin-top: 1px; display: inline-flex;"></span>
            <span class="api-test-result__text"></span>
          </div>

          <p class="ui-muted" style="font-size: 12px; border-top: 1px solid rgba(0,0,0,0.05); padding-top: 12px; margin-bottom: 0;">用于完全退后台时的系统级提醒。您的设备限制极其严格，必须将当前网页<b>【添加到主屏幕】</b>后，才能绕过拦截发出通知！</p>
        </section>

      </div>
    </div>
  `;
}

/* ==========================================================================
   [区域标注·本次需求] 绑定事件与逻辑执行
   ========================================================================== */
export function bindBackgroundKeepaliveEvents(container, { settings }) {
  // === 1. 静音保活逻辑 ===
  const keepaliveCheckbox = container.querySelector('#setting-background-keepalive');
  const playText = container.querySelector('#keepalive-play-text');
  const statusText = container.querySelector('#keepalive-status-text');

  const updateAudioState = (isPlaying) => {
    if (!playText) return;
    if (isPlaying) {
      playText.textContent = '正在循环';
      playText.className = 'ui-theme-color';
    } else {
      playText.textContent = '未播放';
      playText.className = 'ui-muted';
    }
  };

  const tryPlayKeepalive = () => {
    if (window.__keepaliveAudio) {
      window.__keepaliveAudio.play().then(() => {
        updateAudioState(true);
      }).catch((err) => {
        console.warn('静音音频播放被拦截:', err);
        if (playText) {
          playText.textContent = '播放被拦截(需交互)';
          playText.className = 'ui-muted';
        }
      });
    }
  };

  const stopKeepalive = () => {
    if (window.__keepaliveAudio) {
      window.__keepaliveAudio.pause();
      window.__keepaliveAudio.currentTime = 0;
      updateAudioState(false);
    }
  };

  if (keepaliveCheckbox) {
    // 初始化同步音频状态
    if (keepaliveCheckbox.checked && window.__keepaliveAudio && !window.__keepaliveAudio.paused) {
      updateAudioState(true);
    } else if (keepaliveCheckbox.checked) {
      tryPlayKeepalive();
    }

    keepaliveCheckbox.addEventListener('change', async (e) => {
      const isChecked = e.target.checked;
      
      if (statusText) {
        statusText.textContent = isChecked ? '已开启' : '未开启';
        statusText.className = isChecked ? 'ui-theme-color' : 'ui-muted';
      }

      if (isChecked) {
        tryPlayKeepalive();
      } else {
        stopKeepalive();
      }

      try {
        await settings.update({ backgroundKeepaliveEnabled: isChecked });
      } catch (err) {
        console.error('Failed to save background keepalive settings', err);
      }
    });
  }

  // === 2. 网页内横幅通知逻辑 ===
  const inAppCheckbox = container.querySelector('#setting-inapp-notification');
  const inAppStatusText = container.querySelector('#inapp-status-text');
  const btnTestInApp = container.querySelector('#btn-test-inapp-notification');

  if (inAppCheckbox) {
    inAppCheckbox.addEventListener('change', async (e) => {
      const isChecked = e.target.checked;
      if (inAppStatusText) {
        inAppStatusText.textContent = isChecked ? '已开启' : '未开启';
        inAppStatusText.className = isChecked ? 'ui-theme-color' : 'ui-muted';
      }
      try {
        await settings.update({ inAppNotificationEnabled: isChecked });
      } catch (err) {
        console.error('Failed to save inApp notification settings', err);
      }
    });
  }

  if (btnTestInApp) {
    btnTestInApp.addEventListener('click', () => {
      if (window.showInAppNotification) {
        const iconUrl = new URL('assets/icons/icon-192.png', window.location.href).href;
        window.showInAppNotification('网页内通知测试', '这是一条独立的网页内横幅通知！不受设备权限限制，只要不退后台就能随时触发，赶紧去聊天里体验吧。', iconUrl);
      }
    });
  }

  // === 3. 系统消息通知 (PWA) 逻辑 ===
  const btnRequest = container.querySelector('#btn-request-notification');
  const btnTest = container.querySelector('#btn-test-notification');
  const sysPermText = container.querySelector('#system-perm-text');
  const resultEl = container.querySelector('#keepalive-notification-result');

  const updateSystemPermUI = () => {
    if (!sysPermText || !('Notification' in window)) return;
    const perm = Notification.permission;
    sysPermText.textContent = perm;
    sysPermText.className = perm === 'granted' ? 'ui-theme-color' : 'ui-muted';
  };

  const showResult = (status, text) => {
    if (!resultEl) return;
    resultEl.style.display = 'flex';
    resultEl.className = 'api-test-result';
    
    if (status === 'success') {
      resultEl.style.background = 'rgba(74, 52, 42, 0.1)';
      resultEl.style.color = 'var(--c-text-main, #4A342A)';
      resultEl.querySelector('.api-test-result__icon').innerHTML = ICON_BELL;
    } else if (status === 'error') {
      resultEl.style.background = 'rgba(192, 57, 43, 0.1)';
      resultEl.style.color = '#9f2c21';
      resultEl.querySelector('.api-test-result__icon').innerHTML = ICON_BELL;
    }
    resultEl.querySelector('.api-test-result__text').innerHTML = escapeHtml(text);
  };

  if (btnRequest) {
    btnRequest.addEventListener('click', async () => {
      if (!('Notification' in window)) {
        showResult('error', '不支持系统级网页通知。');
        return;
      }
      if (Notification.permission === 'granted') {
        showResult('success', '已开启通知权限，请点击“测试弹窗”验证。');
        return;
      }
      try {
        const permission = await Notification.requestPermission();
        updateSystemPermUI();
        if (permission === 'granted') {
          showResult('success', '通知权限已开启！');
        } else {
          showResult('error', '通知权限被拒绝或忽略。');
        }
      } catch (e) {
        showResult('error', '请求权限失败，环境限制。');
      }
    });
  }

  if (btnTest) {
    btnTest.addEventListener('click', async () => {
      if (!('Notification' in window)) {
        showResult('error', '浏览器不支持系统通知。');
        return;
      }

      if (Notification.permission !== 'granted') {
        showResult('error', '请先点击左侧按钮开启通知权限。');
        return;
      }

      showResult('success', '正在尝试发送系统弹窗...');
      const title = '系统后台通知测试';
      const iconUrl = new URL('assets/icons/icon-192.png', window.location.href).href;
      const options = {
        body: '这是系统级通知！如果在应用退后台后能看到，说明 PWA 配置成功。',
        icon: iconUrl,
        vibrate: [200, 100, 200]
      };

      if (!('serviceWorker' in navigator)) {
        showResult('error', '环境不支持 Service Worker，无法发送系统通知。');
        return;
      }

      // 终极强制接管并提示添加主屏幕
      const forceActiveAndShow = (reg) => {
        if (!reg || typeof reg.showNotification !== 'function') {
          showResult('error', 'Service Worker 注册对象无效。');
          return;
        }

        if (reg.active) {
          reg.showNotification(title, options)
             .then(() => showResult('success', '系统测试通知已发送！如果没有弹出，说明当前环境必须将网页【添加到主屏幕】。'))
             .catch(err => showResult('error', `发送受限: ${err.message}。强烈建议将应用【添加到主屏幕】。`));
          return;
        }

        const pendingWorker = reg.installing || reg.waiting;
        if (pendingWorker) {
          showResult('success', 'Worker 正在准备中，强制接管...');
          pendingWorker.postMessage({ type: 'SKIP_WAITING' });
          
          const onControllerChange = () => {
            navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
            reg.showNotification(title, options)
               .then(() => showResult('success', '系统测试通知已发送！'))
               .catch(err => showResult('error', `发送受限: ${err.message}。强烈建议将应用【添加到主屏幕】。`));
          };
          
          navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
          
          setTimeout(() => {
            navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
            reg.showNotification(title, options)
               .catch(err => showResult('error', `系统级发送被拒: ${err.message}。您的设备要求必须【添加到主屏幕】才能系统通知。`));
          }, 3000);
        } else {
           showResult('error', 'Registration 中找不到可用的 Worker。');
        }
      };

      navigator.serviceWorker.getRegistration().then(reg => {
        if (reg) {
          forceActiveAndShow(reg);
        } else {
          showResult('success', '正在补注册 SW...');
          const swUrl = new URL('service-worker.js', window.location.href).href;
          const scopeUrl = new URL('./', window.location.href).pathname;
          navigator.serviceWorker.register(swUrl, { scope: scopeUrl }).then(newReg => {
            forceActiveAndShow(newReg);
          }).catch(err => {
            showResult('error', `SW 注册失败: ${err.message}`);
          });
        }
      }).catch(err => {
        showResult('error', `获取 SW 状态出错: ${err.message}`);
      });
    });
  }
}
