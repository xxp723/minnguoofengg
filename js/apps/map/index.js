/**
 * 文件名: js/apps/map/index.js
 * 用途: 地图（Map）应用空白入口模块。
 *       本次仅完成应用注册与可打开的空白页面；地图 UI/CSS 留待后续单独实现。
 * 位置: /js/apps/map/index.js
 * 架构层: 应用层（由 AppManager 动态加载）
 */

/* ==========================================================================
   [区域标注·本次需求·地图空白应用入口已完成]
   说明：
   - 本模块只提供 AppManager 需要的 mount / unmount 生命周期。
   - 不写入任何 localStorage/sessionStorage，也不做双份存储兜底。
   - 当前页面保持空白，仅预留 .map-app-shell 作为后续地图 CSS/UI 的挂载根节点。
   - 后续如需制作地图 UI，可直接在本区域扩展 DOM，并单独新增/接入地图样式。
   ========================================================================== */
export async function mount(container) {
  container.replaceChildren();

  const shell = document.createElement('div');
  shell.className = 'map-app-shell';
  shell.dataset.app = 'map';

  container.appendChild(shell);

  return {
    destroy() {
      shell.remove();
    }
  };
}

export async function unmount(instance) {
  if (instance && typeof instance.destroy === 'function') {
    instance.destroy();
  }
}
