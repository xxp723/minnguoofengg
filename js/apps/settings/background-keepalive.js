/**
 * 文件名: js/apps/settings/background-keepalive.js
 * 用途: 设置应用 - 后台保活与通知模块
 *       控制开启/关闭后台保活状态。开启后允许闲谈应用在后台生成 AI 回复并通过浏览器通知提醒用户。
 * 架构层: 应用层
 */

// IconPark 图标 - 保活/通知
const ICON_KEEPALIVE = `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="22" height="22"><path d="M24 4C12.9543 4 4 12.9543 4 24C4 35.0457 12.9543 44 24 44C35.0457 44 44 35.0457 44 24C44 12.9543 35.0457 4 24 4Z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M24 16V24" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="24" cy="32" r="2" fill="currentColor"/></svg>`;
const ICON_BELL = `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="18" height="18"><path d="M24 4C16.268 4 10 10.268 10 18V26L6 34H42L38 26V18C38 10.268 31.732 4 24 4Z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M18 34V38C18 41.3137 20.6863 44 24 44C27.3137 44 30 41.3137 30 38V34" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_PLAY = `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="18" height="18"><path d="M15 24V11.8756L25.5 17.9378L36 24L25.5 30.0622L15 36.1244V24Z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>`;

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
          
          <div class="appearance-inline-actions appearance-inline-actions--icon-dual" style="margin-top: 16px;">
            <button class="ui-button" type="button" id="btn-request-notification">${ICON_BELL}<span>请求通知权限</span></button>
            <button class="ui-button primary" type="button" id="btn-test-notification">${ICON_PLAY}<span>测试通知</span></button>
          </div>

          <div class="api-test-result" id="keepalive-notification-result" style="display: none; margin-top: 16px; border-radius: 12px; font-size: 12px; padding: 9px 10px; min-height: 38px; align-items: flex-start; gap: 6px;">
            <span class="api-test-result__icon" style="line-height: 0; margin-top: 1px; display: inline-flex;"></span>
            <span class="api-test-result__text"></span>
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
   4. 使用应用内提示替代原生 alert。
   ========================================================================== */
export function bindBackgroundKeepaliveEvents(container, { settings }) {
  const resultEl = container.querySelector('#keepalive-notification-result');
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
    } else {
      resultEl.style.background = 'rgba(215, 201, 184, 0.18)';
      resultEl.style.color = 'rgba(74, 52, 42, 0.84)';
      resultEl.querySelector('.api-test-result__icon').innerHTML = ICON_BELL;
    }
    resultEl.querySelector('.api-test-result__text').innerHTML = escapeHtml(text);
  };

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
        showResult('error', '你的浏览器或设备不支持系统级网页通知 (如部分手机内置浏览器)。');
        return;
      }
      
      if (Notification.permission === 'granted') {
        showResult('success', '已开启通知权限，无需再次请求。');
        return;
      }

      try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          showResult('success', '通知权限已开启！后台消息将会通过系统通知提醒你。');
        } else if (permission === 'denied') {
          showResult('error', '通知权限被拒绝。如果您曾在地址栏手动开启，请【刷新当前网页】后重试！(注意：iOS Safari 需将网页添加到主屏幕才能使用通知)');
        } else {
          showResult('error', '未能获取通知权限，请检查浏览器设置。');
        }
      } catch (e) {
        showResult('error', '请求通知权限时发生错误，您的环境可能不支持。');
        console.error(e);
      }
    });
  }

  // 测试通知按钮
  if (btnTest) {
    btnTest.addEventListener('click', async () => {
      if (!('Notification' in window)) {
        showResult('error', '你的浏览器不支持系统通知。');
        return;
      }

      if (Notification.permission === 'granted') {
        showResult('success', '准备发送通知...');
        
        const title = '后台保活测试';
        // 修复相对路径问题：使用 href 以确保在子目录下也能正确解析
        const iconUrl = new URL('assets/icons/icon-192.png', window.location.href).href;
        const options = {
          body: '如果你能看到这条消息，说明浏览器通知功能正常！',
          icon: iconUrl,
          vibrate: [200, 100, 200]
        };

        function fallbackNotification(reason) {
          try {
            new Notification(title, options);
            showResult('success', `尝试原生发送 (${reason})。若无弹窗，可能被系统拦截或禁用。`);
          } catch (e) {
            showResult('error', `原生发送失败: ${e.message} [SW原因: ${reason}]`);
          }
        }

        if ('serviceWorker' in navigator) {
          let fallbackTriggered = false;
          let swAttempts = [];

          // 增加超时机制：考虑到我们可能需要现场重新注册，给足 1500ms
          const fallbackTimer = setTimeout(() => {
            fallbackTriggered = true;
            fallbackNotification(`SW处理超时1500ms [${swAttempts.join(',')}]`);
          }, 1500);

          // 封装执行通知的逻辑
          const executeShowNotification = (reg, source) => {
            if (!reg || typeof reg.showNotification !== 'function') {
              swAttempts.push(`${source}_invalid`);
              return false;
            }
            clearTimeout(fallbackTimer);
            reg.showNotification(title, options).then(() => {
              showResult('success', `测试通知已发送 (SW_${source})。如果没弹窗，请检查手机系统通知设置。`);
            }).catch(err => {
              swAttempts.push(`${source}_err:` + err.message);
              fallbackNotification(`SW_${source}发送报错:${err.message}`);
            });
            return true;
          };

          // 尝试一：通过 getRegistration
          navigator.serviceWorker.getRegistration().then(reg => {
            if (fallbackTriggered) return;
            swAttempts.push('getReg_ok');

            if (reg) {
              if (!executeShowNotification(reg, 'reg')) {
                fallbackNotification('reg_no_showNotification');
              }
            } else {
              // 关键修复：如果在 PWA 环境下 getRegistration 返回 null，则说明当前 Scope 下没找到 SW
              // 我们必须当场按照 main.js 的规则强行注册一个，然后发送！
              // [区域标注·已修改] 修正 SW 注册路径，确保在根目录和子目录部署都能正确找到 service-worker.js
              swAttempts.push('reg_null');
              const swUrl = new URL('service-worker.js', window.location.href).href;
              const scopeUrl = new URL('./', window.location.href).pathname;
              
              swAttempts.push(`try_register`);
              navigator.serviceWorker.register(swUrl, { scope: scopeUrl }).then(newReg => {
                if (fallbackTriggered) return;
                swAttempts.push('register_ok');
                
                // 注册完后可能需要等它 active 才能 showNotification
                if (newReg.active) {
                  if (!executeShowNotification(newReg, 'newReg_active')) {
                     fallbackNotification('newReg_no_showNotification');
                  }
                } else {
                  // 如果没 active，等 ready
                  swAttempts.push('wait_ready');
                  navigator.serviceWorker.ready.then(readyReg => {
                    if (fallbackTriggered) return;
                    swAttempts.push('ready_ok');
                    if (!executeShowNotification(readyReg, 'ready')) {
                      fallbackNotification('ready_no_showNotification');
                    }
                  }).catch(err => {
                    if (fallbackTriggered) return;
                    clearTimeout(fallbackTimer);
                    fallbackNotification(`ready报错:${err.message}`);
                  });
                }
              }).catch(err => {
                if (fallbackTriggered) return;
                clearTimeout(fallbackTimer);
                swAttempts.push('register_err');
                fallbackNotification(`补注册SW失败:${err.message}`);
              });
            }
          }).catch(err => {
            swAttempts.push('getReg_err');
            if (fallbackTriggered) return;
            clearTimeout(fallbackTimer);
            fallbackNotification(`getReg报错:${err.message}`);
          });
        } else {
          fallbackNotification('环境不支持SW');
        }

      } else {
        showResult('error', '未开启通知权限，请先点击“请求通知权限”进行授权。');
      }
    });
  }
}
