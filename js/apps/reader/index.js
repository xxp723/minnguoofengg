/**
 * ==========================================================================
 * [区域标注·本次需求·梦笺应用主入口]
 * 说明：负责加载独立 CSS、隐藏全局标题栏、构建底部 Tab 丝滑切换框架。
 * 位置: /js/apps/reader/index.js
 * ==========================================================================
 */

import { Icons } from './reader-ui.js';
import { ReaderShelf } from './reader-shelf.js';
import { ReaderArchive } from './reader-archive.js';
import { ReaderHome } from './reader-home.js';

/* ==========================================================================
   [区域标注·本次需求·梦笺应用加载 CSS 工具函数]
   ========================================================================== */
function loadReaderCSS(href, id) {
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

function removeReaderCSS(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

/* ==========================================================================
   [区域标注·本次需求·梦笺主页挂载与框架渲染]
   ========================================================================== */
export async function mount(container, context) {
  // 1. 加载独立 CSS
  await loadReaderCSS('./js/apps/reader/reader.css', 'reader-app-css');

  // 2. 隐藏全局系统标题栏（通过向外层父容器添加专属 class）
  const windowContent = container.closest('.window-content') || container.parentElement;
  if (windowContent) {
    windowContent.classList.add('window-has-reader');
  }

  // 3. 渲染主框架
  container.innerHTML = `
    <div class="reader-app-container">
      <div class="reader-header">
        <h1 class="reader-title">Bookshelf</h1>
        <div class="reader-header-actions"></div>
      </div>
      <div class="reader-content-wrapper">
        <div class="reader-page active" id="reader-page-shelf"></div>
        <div class="reader-page" id="reader-page-archive"></div>
        <div class="reader-page" id="reader-page-home"></div>
      </div>
      <div class="reader-tab-bar">
        <div class="reader-tab-item active" data-tab="shelf">
          ${Icons.shelf}
          <span class="reader-tab-text">书架</span>
        </div>
        <div class="reader-tab-item" data-tab="archive">
          ${Icons.archive}
          <span class="reader-tab-text">存档</span>
        </div>
        <div class="reader-tab-item" data-tab="home">
          ${Icons.home}
          <span class="reader-tab-text">主页</span>
        </div>
      </div>
    </div>
  `;

  // 4. 实例化子页面模块
  const pageShelf = container.querySelector('#reader-page-shelf');
  const pageArchive = container.querySelector('#reader-page-archive');
  const pageHome = container.querySelector('#reader-page-home');

  const shelfInstance = new ReaderShelf(pageShelf);
  const archiveInstance = new ReaderArchive(pageArchive);
  const homeInstance = new ReaderHome(pageHome);

  // 初始化渲染子页面
  await shelfInstance.render();
  archiveInstance.render();
  homeInstance.render();

  // 5. 绑定 Tab 切换与 Header 更新逻辑
  const titleEl = container.querySelector('.reader-title');
  const actionsEl = container.querySelector('.reader-header-actions');
  const tabs = container.querySelectorAll('.reader-tab-item');
  const pages = container.querySelectorAll('.reader-page');

  function switchTab(tabId) {
    // 切换 Tab 样式
    tabs.forEach(tab => tab.classList.toggle('active', tab.dataset.tab === tabId));
    // 切换 Page 样式
    pages.forEach(page => page.classList.toggle('active', page.id === `reader-page-${tabId}`));

    // 动态更新 Header 标题与操作栏
    if (tabId === 'shelf') {
      titleEl.textContent = 'Bookshelf';
      actionsEl.innerHTML = `<button class="reader-icon-btn" id="reader-btn-import">${Icons.import}</button>`;
      const btnImport = actionsEl.querySelector('#reader-btn-import');
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
    // 使用应用管理器关闭自己
    if (context.appManager && context.appMeta && context.appMeta.id) {
      context.appManager.closeApp(context.appMeta.id);
    }
  });

  return {
    destroy() {
      // 恢复全局系统标题栏状态
      if (windowContent) {
        windowContent.classList.remove('window-has-reader');
      }
      removeReaderCSS('reader-app-css');
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
