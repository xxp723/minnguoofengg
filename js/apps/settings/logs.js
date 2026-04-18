export function renderLogsSection() {
  return `
      <!-- 日志详情页 -->
      <div id="settings-logs" class="settings-detail">
        <div class="settings-detail__body">
          <style>
            #settings-logs .logs-card-title {
              text-align: left;
            }
          </style>
          <section class="ui-card">
            <h3 class="logs-card-title">查看日志</h3>
            <p class="ui-muted" style="margin-bottom: 10px;">查看系统运行时的所有日志内容</p>
            <div style="display:flex;gap:10px;margin-bottom:12px;flex-wrap:wrap;">
              <button class="ui-button" id="view-all-logs">查看全部日志</button>
              <button class="ui-button" id="view-error-logs">查看错误日志</button>
            </div>
            <div id="log-viewer-area" style="max-height:400px;overflow-y:auto;background:var(--c-white-rice);border:1px solid var(--c-gray-light);border-radius:10px;padding:12px;font-size:12px;display:none;"></div>
          </section>
        </div>
      </div>
  `;
}

export function bindLogsEvents(container) {
  const renderLogs = (type) => {
    const logEl = container.querySelector('#log-viewer-area');
    if (!logEl) return;

    logEl.style.display = 'block';
    const logs = localStorage.getItem('miniphone_sys_logs') || '[]';
    let parsedLogs = [];
    try {
      parsedLogs = JSON.parse(logs);
    } catch (e) {}

    let filteredLogs = parsedLogs;
    if (type === 'error') {
      filteredLogs = parsedLogs.filter((l) => l.level === 'error');
    }

    if (!filteredLogs.length) {
      logEl.innerHTML = '<div style="text-align:center;color:#999;padding:20px;">暂无相关日志</div>';
      return;
    }

    logEl.innerHTML = filteredLogs
      .reverse()
      .slice(0, 100)
      .map((item) => {
        const color = item.level === 'error' ? 'red' : item.level === 'warn' ? 'orange' : 'inherit';
        return `<div style="margin-bottom:6px;color:${color};border-bottom:1px dashed #ccc;padding-bottom:4px;">
          [${item.level.toUpperCase()}] ${new Date(item.timestamp).toLocaleString()} <br>
          ${item.message}${item.details ? `<pre style="margin:2px 0 0;white-space:pre-wrap;font-size:10px;background:#eee;padding:2px;">${JSON.stringify(item.details)}</pre>` : ''}
        </div>`;
      })
      .join('');
  };

  container.querySelector('#view-all-logs')?.addEventListener('click', () => renderLogs('all'));
  container.querySelector('#view-error-logs')?.addEventListener('click', () => renderLogs('error'));
}
