/**
 * 文件名: js/core/ui/components/Icon.js
 * 用途: 通用图标组件（桌面图标渲染辅助）。
 *       负责根据 app 元数据创建统一结构的图标 DOM，供 Desktop.js 复用。
 * 位置: /js/core/ui/components/Icon.js
 * 架构层: 外观层（UI Layer / components）
 */
export function createAppIcon(appMeta) {
  const wrapper = document.createElement('div');
  wrapper.className = 'app-icon';
  wrapper.draggable = true;
  wrapper.dataset.appId = appMeta.id;
  wrapper.title = appMeta.name;

  const button = document.createElement('button');
  button.className = 'app-icon-btn';
  button.type = 'button';
  button.setAttribute('data-open-app', appMeta.id);
  button.setAttribute('aria-label', `打开${appMeta.name}`);
  button.innerHTML = appMeta.icon;

  const label = document.createElement('span');
  label.className = 'app-icon-label';
  label.textContent = appMeta.name;

  wrapper.appendChild(button);
  wrapper.appendChild(label);

  return wrapper;
}
