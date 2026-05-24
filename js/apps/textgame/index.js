/**
 * ==========================================================================
 * [区域标注·已完成·梦笺应用主入口]
 * 说明：
 * 1. 负责加载独立 CSS、隐藏全局标题栏、构建底部 Tab 丝滑切换框架。
 * 2. 书架可打开 TXT 阅读器；阅读器内可发起穿书文游配置。
 * 3. 仅修改梦笺应用相关区域，不改动其它应用。
 * 位置: /js/apps/textgame/index.js
 * ==========================================================================
 */

import { Icons } from './textgame-ui.js';
import { TextGameShelf } from './textgame-shelf.js';
import { TextGameArchive } from './textgame-archive.js';
import { TextGameHome } from './textgame-home.js';
import { TextGameReader } from './textgame-reader.js';
import { getBook } from './textgame-store.js';

/* ==========================================================================
   [区域标注·已完成·梦笺应用加载 CSS 工具函数]
   说明：等待 CSS 注入完成后再渲染主框架，减少进入应用时的闪屏。
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
   [区域标注·已完成·梦笺主页挂载与框架渲染]
   说明：在梦笺容器内部切换页面/阅读器，不使用浏览器原生弹窗或原生选择器。
   ========================================================================== */
export async function mount(container, context) {
  container.innerHTML = '';

  const windowContent = container.closest('.window-content') || container.parentElement;
  if (windowContent) {
    windowContent.classList.add('window-has-textgame');
    const header = windowContent.parentElement.querySelector('.app-window__header');
    if (header) {
      header.style.display = 'none';
    }
  }

  await loadTextGameCSS('./js/apps/textgame/textgame.css', 'textgame-app-css');

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
        <div class="textgame-page textgame-reader-page" id="textgame-page-reader"></div>
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

  const pageShelf = container.querySelector('#textgame-page-shelf');
  const pageArchive = container.querySelector('#textgame-page-archive');
  const pageHome = container.querySelector('#textgame-page-home');
  const pageReader = container.querySelector('#textgame-page-reader');
  const appView = container.querySelector('#textgame-app-main-view');

  const titleEl = container.querySelector('.textgame-title');
  const actionsEl = container.querySelector('.textgame-header-actions');
  const tabs = container.querySelectorAll('.textgame-tab-item');
  const pages = container.querySelectorAll('.textgame-page');
  const tabBar = container.querySelector('.textgame-tab-bar');

  let currentTab = 'shelf';
  let readerInstance = null;

  const switchTab = async (tabId) => {
    currentTab = tabId;
    readerInstance = null;
    appView?.classList.remove('textgame-reader-mode');
    tabs.forEach(tab => tab.classList.toggle('active', tab.dataset.tab === tabId));
    pages.forEach(page => page.classList.toggle('active', page.id === `textgame-page-${tabId}`));
    if (tabBar) tabBar.classList.remove('is-hidden');

    if (tabId === 'shelf') {
      titleEl.textContent = 'Bookshelf';
      /* ==========================================================================
         [区域标注·已完成·梦笺书架顶部操作按钮]
         说明：
         1. “API配置”位于“导入”左侧，只作用于梦笺应用。
         2. API配置弹窗由 TextGameShelf 读取设置应用主 API 预设并保存梦笺独立副本。
         3. 不使用浏览器原生弹窗/选择器，不涉及 localStorage/sessionStorage。
         ========================================================================== */
      actionsEl.innerHTML = `
        <button class="textgame-icon-btn textgame-api-config-btn" id="textgame-btn-api-config" title="API配置">${Icons.setting}</button>
        <button class="textgame-icon-btn" id="textgame-btn-import" title="导入 TXT">${Icons.import}</button>
      `;
      actionsEl.querySelector('#textgame-btn-api-config')?.addEventListener('click', () => shelfInstance.openApiConfigModal());
      actionsEl.querySelector('#textgame-btn-import')?.addEventListener('click', () => shelfInstance.triggerImport());
      await shelfInstance.loadBooks();
    } else if (tabId === 'archive') {
      titleEl.textContent = 'Archive';
      actionsEl.innerHTML = '';
      await archiveInstance.render();
    } else if (tabId === 'home') {
      titleEl.textContent = 'Home';
      actionsEl.innerHTML = '';
      await homeInstance.render();
    }
  };

  const openReader = async (book, runToLoad = null) => {
    currentTab = 'reader';
    appView?.classList.add('textgame-reader-mode');
    tabs.forEach(tab => tab.classList.remove('active'));
    pages.forEach(page => page.classList.toggle('active', page.id === 'textgame-page-reader'));
    if (tabBar) tabBar.classList.add('is-hidden');
    actionsEl.innerHTML = '';
    readerInstance = new TextGameReader(pageReader, book, {
      onBack: async () => {
        pageReader.innerHTML = '';
        await switchTab('shelf');
      }
    });
    
    if (runToLoad) {
      await readerInstance.loadRun(runToLoad);
    } else {
      await readerInstance.render();
    }
  };

  const shelfInstance = new TextGameShelf(pageShelf, { onOpenBook: openReader });
  const archiveInstance = new TextGameArchive(pageArchive, {
    onLoadRun: async (run) => {
      const book = await getBook(run.bookId);
      if (book) {
        await openReader(book, run);
      }
    }
  });
  const homeInstance = new TextGameHome(pageHome);

  await shelfInstance.render();
  await archiveInstance.render();
  await homeInstance.render();

  await switchTab('shelf');

  tabs.forEach(tab => {
    tab.addEventListener('click', async () => {
      if (!tab.classList.contains('active')) {
        await switchTab(tab.dataset.tab);
      }
    });
  });

  titleEl.addEventListener('click', () => {
    if (currentTab === 'reader' && readerInstance) {
      pageReader.innerHTML = '';
      switchTab('shelf');
      return;
    }

    if (context.eventBus) {
      context.eventBus.emit('app:close', { appId: context.appId || (context.appMeta && context.appMeta.id) });
    } else if (context.appManager && context.appMeta && context.appMeta.id) {
      context.appManager.closeApp(context.appMeta.id);
    }
  });

  return {
    destroy() {
      if (windowContent) {
        windowContent.classList.remove('window-has-textgame');
      }
      removeTextGameCSS('textgame-app-css');
      container.innerHTML = '';
    }
  };
}

/* ==========================================================================
   [区域标注·已完成·梦笺应用卸载]
   ========================================================================== */
export async function unmount(instance) {
  if (instance && typeof instance.destroy === 'function') {
    instance.destroy();
  }
}
