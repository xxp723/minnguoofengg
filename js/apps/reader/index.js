/**
 * 文件名: js/apps/reader/index.js
 * 用途: 观书（Reader）应用占位模块。
 *       后续可在这里实现书架管理、章节阅读、进度同步与阅读主题配置等功能。
 * 位置: /js/apps/reader/index.js
 * 架构层: 应用层（由 AppManager 动态加载）
 */
export async function mount(container, context) {
  const { appMeta } = context;

  container.innerHTML = `
    <div>
      <h2 style="margin-top:0;">${appMeta.icon} ${appMeta.name}</h2>
      <div class="ui-card">
        <p>观书应用占位页</p>
        <p class="ui-muted">后续将在此处实现观书阅读器、章节目录和阅读进度管理。</p>
      </div>
    </div>
  `;

  return {
    destroy() {}
  };
}

export async function unmount(instance) {
  if (instance && typeof instance.destroy === 'function') {
    instance.destroy();
  }
}
