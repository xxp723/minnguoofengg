/**
 * ==========================================================================
 * [区域标注·本次需求·梦笺应用主入口]
 * 说明：负责加载独立 CSS、隐藏全局标题栏、构建底部 Tab 丝滑切换框架。
 * 位置: /js/apps/textgame/index.js
 * ==========================================================================
 */

import { Icons } from './textgame-ui.js';
import { TextGameShelf } from './textgame-shelf.js';
import { TextGameArchive } from './textgame-archive.js';
import { TextGameHome } from './textgame-home.js';

/* ==========================================================================
   [区域标注·本次需求·梦笺应用加载 CSS 工具函数]
   ========================================================================== */
function loadTextGameCSS(href, id) {
  return new Promise((resolve) => {
    let existing = document.getElementById(id);
    if (existing) {
      if (existing.dataset.loaded === '1' || existing.sheet) {
        existing.dataset.loaded = '1';
        return resolve();
      }
      existing.addEventListener('load', () => { existing.dataset.loaded = '1'; resolve(); }, { once: true });
      existing.addEventListener('error', () => { existing.dataset.loaded = '1'; resolve(); }, { once: true });
      return;
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.id = id;
    link.addEventListener('load', () => { link.dataset.loaded = '1'; resolve(); }, { once: true });
    link.addEventListener('error', () => { link.dataset.loaded = '1'; resolve(); }, { once: true });
    document.head.appendChild(link);
  });
}

function removeTextGameCSS(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

/* ==========================================================================
   [区域标注·本次需求·梦笺主页挂载与框架渲染]
   ========================================================================== */
export async function mount(container, context) {
  // [修改标注·梦笺应用·优化加载速度]
  // 1. 优先加载独立 CSS，确保隔离和隐藏全局样式，防止闪烁
  await loadTextGameCSS('./js/apps/textgame/textgame.css', 'textgame-app-css');

  const windowContent = container.closest('.window-content') || container.parentElement;
  if (windowContent) {
    // 已经通过 app-window[data-app-id="textgame"] 覆盖，保留该类名如果以后还要用
    windowContent.classList.add('window-has-textgame');
  }

  // 2. 注入骨架/基本框架
  container.innerHTML = `
    <div class="textgame-app-container" id="textgame-app-main-view">
      <div class="textgame-header">
        <h1 class="textgame-title">Bookshelf</h1>
        <div class="textgame-header-actions"></div>
      </div>
      <div class="textgame-content-wrapper">
        <div class="textgame-page active" id="textgame-page-shelf"></div>
        <div class="textgame-page" id="textgame-page-archive"></div>
        <div class="textgame-page" id="textgame-page-home"></div>
      </div>
      <div class="textgame-tab-bar">
        <div class="textgame-tab-item active" data-tab="shelf">
          ${Icons.shelf}
          <span class="textgame-tab-text">书架</span>
        </div>
        <div class="textgame-tab-item" data-tab="archive">
          ${Icons.archive}
          <span class="textgame-tab-text">存档</span>
        </div>
        <div class="textgame-tab-item" data-tab="home">
          ${Icons.home}
          <span class="textgame-tab-text">主页</span>
        </div>
      </div>
    </div>
  `;

  // 4. 实例化子页面模块
  const pageShelf = container.querySelector('#textgame-page-shelf');
  const pageArchive = container.querySelector('#textgame-page-archive');
  const pageHome = container.querySelector('#textgame-page-home');

  const shelfInstance = new TextGameShelf(pageShelf);
  const archiveInstance = new TextGameArchive(pageArchive);
  const homeInstance = new TextGameHome(pageHome);

  // 初始化渲染子页面
  await shelfInstance.render();
  archiveInstance.render();
  homeInstance.render();

  // 5. 绑定 Tab 切换与 Header 更新逻辑
  const titleEl = container.querySelector('.textgame-title');
  const actionsEl = container.querySelector('.textgame-header-actions');
  const tabs = container.querySelectorAll('.textgame-tab-item');
  const pages = container.querySelectorAll('.textgame-page');

  function switchTab(tabId) {
    // 切换 Tab 样式
    tabs.forEach(tab => tab.classList.toggle('active', tab.dataset.tab === tabId));
    // 切换 Page 样式
    pages.forEach(page => page.classList.toggle('active', page.id === `textgame-page-${tabId}`));

    // 动态更新 Header 标题与操作栏
    if (tabId === 'shelf') {
      titleEl.textContent = 'Bookshelf';
      actionsEl.innerHTML = `<button class="textgame-icon-btn" id="textgame-btn-import">${Icons.import}</button>`;
      const btnImport = actionsEl.querySelector('#textgame-btn-import');
      if (btnImport) {
        btnImport.addEventListener('click', () => shelfInstance.triggerImport());
      }
      // 切换回书架时刷新列表
      shelfInstance.loadBooks();
    } else if (tabId === 'archive') {
      titleEl.textContent = 'Archive';
      actionsEl.innerHTML = '';
    } else if (tabId === 'home') {
      titleEl.textContent = 'Home';
      actionsEl.innerHTML = '';
    }
  }

  // 默认激活书架 Tab
  switchTab('shelf');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      if (!tab.classList.contains('active')) {
        switchTab(tab.dataset.tab);
      }
    });
  });

  // 6. 绑定点击花体标题返回桌面
  titleEl.addEventListener('click', () => {
    // 使用事件总线通知桌面关闭应用
    if (context.eventBus) {
      context.eventBus.emit('app:close', { appId: context.appId || (context.appMeta && context.appMeta.id) });
    } else if (context.appManager && context.appMeta && context.appMeta.id) {
      context.appManager.closeApp(context.appMeta.id);
    }
  });

  return {
    destroy() {
      // 恢复全局系统标题栏状态
      if (windowContent) {
        windowContent.classList.remove('window-has-textgame');
      }
      removeTextGameCSS('textgame-app-css');
      container.innerHTML = '';
    }
  };
}

/* ==========================================================================
   [区域标注·本次需求·梦笺应用卸载]
   ========================================================================== */
export async function unmount(instance) {
  if (instance && typeof instance.destroy === 'function') {
    instance.destroy();
  }
}
