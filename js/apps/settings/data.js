import { Logger } from '../../utils/Logger.js';

export function renderDataSection() {
  return `
      <!-- 数据设置详情页 -->
      <div id="settings-data" class="settings-detail">
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
  `;
}

export function bindDataEvents(container, { settings }) {
  const onExport = async () => {
    const backup = await settings.exportAllData();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `miniphone-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onImport = async (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const backup = JSON.parse(text);
    await settings.importAllData(backup, { overwrite: true });
    Logger.info('导入成功，请返回桌面查看最新状态');
  };

  container.querySelector('#export-data')?.addEventListener('click', onExport);
  container.querySelector('#import-file')?.addEventListener('change', onImport);
}
