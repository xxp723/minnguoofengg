/**
 * 文件名: js/core/logic/AppManager.js
 * 用途: 应用生命周期管理器。
 *       职责：
 *       - 从 Registry 查询应用元数据
 *       - 动态 import 应用入口模块
 *       - 调用 mount 挂载到 Window 容器
 *       - 调用 unmount 关闭并销毁实例
 *       - 监听全局 app:open / app:close 事件
 * 位置: /js/core/logic/AppManager.js
 * 架构层: 逻辑层（Logic Layer）
 */
import { Logger } from '../../utils/Logger.js';

export class AppManager {
  /**
   * @param {{
   *  registry: import('./Registry.js').Registry,
   *  windowManager: import('../ui/Window.js').WindowManager,
   *  eventBus: import('../interaction/EventBus.js').EventBus,
   *  globalMemory: import('./GlobalMemory.js').GlobalMemory,
   *  settings: import('./Settings.js').Settings,
   *  db: import('../data/DB.js').DB
   * }} deps
   */
  constructor({ registry, windowManager, eventBus, globalMemory, settings, db }) {
    this.registry = registry;
    this.windowManager = windowManager;
    this.eventBus = eventBus;
    this.globalMemory = globalMemory;
    this.settings = settings;
    this.db = db;

    /** @type {Map<string, any>} */
    this.loadedModules = new Map();
    /** @type {Map<string, any>} */
    this.mountedInstances = new Map();
    /** @type {Map<string, Promise<any>>} */
    this.openingPromises = new Map();

    this.bindEvents();

    /* ==========================================================================
       [区域标注·本次需求2·非关键应用空闲预热]
       说明：不改变任何持久化逻辑；仅在浏览器空闲时提前 import 应用入口。
             设置/世情/档案/闲谈这 4 个点名应用由 main.js 在桌面渲染前执行关键预热。
       ========================================================================== */
    this.scheduleModuleWarmup();
  }

  bindEvents() {
    this.eventBus.on('app:open', async ({ appId, openPayload }) => {
      if (!appId) return;
      await this.open(appId, openPayload);
    });

    this.eventBus.on('app:close', async ({ appId }) => {
      if (!appId) return;
      await this.close(appId);
    });
  }

  async open(appId, openPayload = null) {
    const appMeta = this.registry.get(appId);
    if (!appMeta) {
      Logger.warn(`应用未注册: ${appId}`);
      return;
    }

    // 已打开则直接聚焦；如传入定向打开参数，则交给应用实例做内部跳转。
    if (this.mountedInstances.has(appId)) {
      const instance = this.mountedInstances.get(appId);
      if (openPayload && instance && typeof instance.handleOpenPayload === 'function') {
        await instance.handleOpenPayload(openPayload);
      }
      this.windowManager.focus(appId);
      return;
    }

    // [修改标注·本次需求2] 防止桌面图标连点时重复创建同一应用窗口，避免挂载竞争导致渲染不完整/点不开
    if (this.openingPromises.has(appId)) {
      await this.openingPromises.get(appId);
      this.windowManager.focus(appId);
      return;
    }

    const openingTask = (async () => {
      try {
        /* ==========================================================================
           [区域标注·本次需求2·点击后先开窗口再挂载]
           说明：旧逻辑会等动态 import 完成后才打开窗口，容易造成“点了没反应”的体感。
                 现在窗口先响应；设置/世情/档案/闲谈会在启动阶段额外预热入口模块和关键 CSS。
           ========================================================================== */
        const modulePromise = this.loadModule(appMeta);

        /* ========================================================================
           [区域标注·已完成·地图/旧事应用窗口显示前独立样式预加载]
           说明：
           1. 地图应用与旧事（memory）应用必须在窗口显示前完成各自独立 CSS 加载，避免先出现全局 loading/全局样式再切换成应用样式。
           2. 这里只预加载 CSS 资源，不 mount 应用、不读写持久化数据，不使用 localStorage/sessionStorage。
           3. link id 与应用内部样式加载函数保持一致，避免重复插入样式表。
           ======================================================================== */
        if (appId === 'map') {
          await this.preloadStylesheet('./js/apps/map/map.css', 'map-app-css');
        }

        if (appId === 'memory') {
          await this.preloadStylesheet('./js/apps/memory/memory.css?v=20260519-grand-summary-dock-range-scroll', 'memory-app-css');
        }

        if (appId === 'chat') {
          /* [区域标注·本次需求2·闲谈样式兜底预加载] 窗口显示前确保 chat.css 可用，避免无样式闪烁。 */
          await this.preloadChatCriticalStyles();
        }

        const contentEl = this.windowManager.open(appMeta);

        if (appId === 'chat' || appId === 'map' || appId === 'memory') {
          /* [区域标注·已完成·地图/旧事/闲谈加载提示清理]
             说明：清空 Window.open 默认的全局 loading，避免地图和旧事进入时先显示全局 CSS/加载样式。 */
          contentEl.innerHTML = '';
        }

        const moduleRef = await modulePromise;
        if (!moduleRef || typeof moduleRef.mount !== 'function') {
          throw new Error(`应用入口缺少 mount 方法: ${appMeta.entry}`);
        }

        const context = {
          appId,
          appMeta,
          eventBus: this.eventBus,
          globalMemory: this.globalMemory,
          settings: this.settings,
          db: this.db,
          windowManager: this.windowManager,
          openPayload
        };

        const instance = await moduleRef.mount(contentEl, context);
        this.mountedInstances.set(appId, instance || {});

        this.eventBus.emit('app:opened', { appId, appMeta });
        Logger.info(`应用已打开: ${appMeta.name}`);
      } catch (error) {
        Logger.error(`打开应用失败: ${appId}`, error);
        this.windowManager.showError(appId, '应用启动失败，请查看日志。');
      } finally {
        this.openingPromises.delete(appId);
      }
    })();

    this.openingPromises.set(appId, openingTask);
    await openingTask;
  }

  /* ==========================================================================
     [区域标注·已完成·本次朋友圈独立样式预加载] 闲谈应用关键 CSS 预加载
     说明：
     1. 预加载闲谈主样式与朋友圈独立样式，避免窗口显示或首次切换朋友圈时无样式闪烁。
     2. 只处理 CSS 资源，不写任何持久化数据，不使用 localStorage/sessionStorage。
     ========================================================================== */
  async preloadChatCriticalStyles() {
    await Promise.all([
      this.preloadStylesheet('./js/apps/chat/chat.css', 'chat-app-css'),
      this.preloadStylesheet('./js/apps/chat/moments.css', 'chat-moments-css'),
      /* ======================================================================
         [区域标注·本次拆分·聊天设置页独立样式预加载]
         说明：聊天设置页与当前会话头像相关弹窗样式已拆分到独立 CSS，窗口显示前一并预加载以降低首次进入闪屏。
         ====================================================================== */
      this.preloadStylesheet('./js/apps/chat/chat-message-settings.css', 'chat-msg-settings-css')
    ]);
  }

  /* ==========================================================================
     [区域标注·已完成·地图/旧事窗口前 CSS 预加载工具]
     说明：
     1. 与应用内部样式加载函数使用同一 link id，避免重复插入样式表。
     2. 如果同 id link 已存在但 href 不是本次目标样式地址，会先更新 href 并等待加载完成，
        避免旧事继续沿用旧 link 导致独立样式不生效。
     ========================================================================== */
  preloadStylesheet(href, id) {
    return new Promise((resolve) => {
      const existing = document.getElementById(id);
      if (existing) {
        if (existing.getAttribute('href') !== href) {
          existing.dataset.loaded = '0';
          const done = () => {
            existing.dataset.loaded = '1';
            resolve();
          };
          existing.addEventListener('load', done, { once: true });
          existing.addEventListener('error', done, { once: true });
          existing.href = href;
          return;
        }

        if (existing.dataset.loaded === '1' || existing.sheet) {
          resolve();
          return;
        }
        const done = () => {
          existing.dataset.loaded = '1';
          resolve();
        };
        existing.addEventListener('load', done, { once: true });
        existing.addEventListener('error', done, { once: true });
        return;
      }

      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.id = id;
      const done = () => {
        link.dataset.loaded = '1';
        resolve();
      };
      link.addEventListener('load', done, { once: true });
      link.addEventListener('error', done, { once: true });
      document.head.appendChild(link);
    });
  }

  /* ==========================================================================
     [区域标注·本次需求·常用及地图旧事轨迹应用点击即进预热]
     说明：
     - 预热用户点名的设置、世情、档案、闲谈、地图、旧事、轨迹应用。
     - 只提前加载入口模块和关键 CSS；不 mount、不读写持久化数据。
     - 持久化仍统一使用项目 DB/IndexedDB 链路，不引入浏览器同步存储。
     ========================================================================== */
  async warmupCriticalApps(appIds = ['settings', 'worldbook', 'archive', 'chat', 'map', 'memory', 'trace']) {
    const cssTasks = [
      this.preloadStylesheet('./js/apps/chat/chat.css', 'chat-app-css'),
      /* ======================================================================
         [区域标注·已完成·本次朋友圈独立样式预加载] 预热朋友圈独立 CSS
         说明：与闲谈主样式同时预热，避免首次进入朋友圈板块出现无样式闪屏。
         ====================================================================== */
      this.preloadStylesheet('./js/apps/chat/moments.css', 'chat-moments-css'),
      this.preloadStylesheet('./js/apps/chat/chat-message.css', 'chat-msg-css'),
      /* ======================================================================
         [区域标注·本次拆分·聊天设置页独立样式预加载]
         说明：关键应用预热阶段同步预加载聊天设置页独立 CSS，避免首次进入设置页或头像弹窗时无样式闪屏。
         ====================================================================== */
      this.preloadStylesheet('./js/apps/chat/chat-message-settings.css', 'chat-msg-settings-css'),
      this.preloadStylesheet('./js/apps/archive/archive.css', 'archive-app-css'),
      this.preloadStylesheet('./js/apps/worldbook/worldbook.css', 'worldbook-app-css'),
      /* ======================================================================
         [区域标注·本次需求·预加载地图旧事轨迹应用CSS]
         说明：避免这些应用在初次加载时出现无样式闪屏。
         ====================================================================== */
      this.preloadStylesheet('./js/apps/map/map.css', 'map-app-css'),
      this.preloadStylesheet('./js/apps/memory/memory.css?v=20260519-grand-summary-dock-range-scroll', 'memory-app-css'),
      this.preloadStylesheet('./js/apps/trace/trace.css', 'trace-app-css')
    ];

    const moduleTasks = appIds
      .map((appId) => this.registry.get(appId))
      .filter(Boolean)
      .map((appMeta) => this.loadModule(appMeta));

    await Promise.allSettled([...cssTasks, ...moduleTasks]);
  }

  /* ==========================================================================
     [区域标注·本次需求2·非关键应用空闲预热]
     说明：只做动态 import 缓存，不挂载应用、不读写持久化数据。
     ========================================================================== */
  scheduleModuleWarmup() {
    const run = () => {
      void this.warmupRegisteredAppModules();
    };

    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(run, { timeout: 1500 });
      return;
    }

    setTimeout(run, 600);
  }

  async warmupRegisteredAppModules() {
    try {
      /* ==========================================================================
         [区域标注·本次需求·空闲预热过滤]
         说明：
         - 过滤掉已经在关键应用预热阶段加载过的应用。
         ========================================================================== */
      const criticalAppIds = new Set(['settings', 'worldbook', 'archive', 'chat', 'map', 'memory', 'trace']);
      const apps = this.registry.getAll().filter((appMeta) => !criticalAppIds.has(appMeta.id));
      await Promise.allSettled(apps.map((appMeta) => this.loadModule(appMeta)));
    } catch (error) {
      Logger.warn('应用模块预热失败', error);
    }
  }

  async close(appId) {
    try {
      const instance = this.mountedInstances.get(appId);
      const moduleRef = this.loadedModules.get(appId);

      if (moduleRef && typeof moduleRef.unmount === 'function') {
        await moduleRef.unmount(instance);
      }

      this.mountedInstances.delete(appId);
      this.windowManager.close(appId);

      this.eventBus.emit('app:closed', { appId });
      Logger.info(`应用已关闭: ${appId}`);
    } catch (error) {
      Logger.error(`关闭应用失败: ${appId}`, error);
    }
  }

  async loadModule(appMeta) {
    if (this.loadedModules.has(appMeta.id)) {
      return this.loadedModules.get(appMeta.id);
    }

    const moduleRef = await import(appMeta.entry);
    this.loadedModules.set(appMeta.id, moduleRef);
    return moduleRef;
  }
}
