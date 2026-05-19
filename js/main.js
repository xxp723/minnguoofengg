/**
 * 文件名: js/main.js
 * 用途: MiniPhone 应用启动入口。负责串联四层架构：
 *       1) 初始化数据层（IndexedDB）
 *       2) 初始化逻辑层（注册应用、加载设置、加载桌面配置）
 *       3) 初始化交互层（事件总线、手势、拖拽）
 *       4) 初始化外观层（主题、桌面渲染、窗口管理）
 *       同时注册 Service Worker，启用 PWA 离线能力。
 * 位置: /js/main.js
 * 架构层: 应用总入口（协调 UI / Interaction / Logic / Data）
 */

import { Theme } from './core/ui/Theme.js';
import { Desktop } from './core/ui/Desktop.js';
import { WindowManager } from './core/ui/Window.js';
import { DesktopEditMode } from './core/interaction/DesktopEditMode.js';

import { EventBus } from './core/interaction/EventBus.js';
import { DragDrop } from './core/interaction/DragDrop.js';
import { Gestures } from './core/interaction/Gestures.js';
import { EdgeBackGesture } from './core/interaction/gesture.js';

import { DB } from './core/data/DB.js';
import { PersistentKV } from './core/data/PersistentKV.js';

import { Registry } from './core/logic/Registry.js';
import { AppManager } from './core/logic/AppManager.js';
import { DesktopConfig } from './core/logic/DesktopConfig.js';
import { GlobalMemory } from './core/logic/GlobalMemory.js';
import { Settings } from './core/logic/Settings.js';

import { Logger } from './utils/Logger.js';

class MiniPhoneApp {
  constructor() {
    /** @type {EventBus} */
    this.eventBus = new EventBus();

    /** @type {DB} */
    this.db = new DB();

    /** @type {PersistentKV} */
    this.persistentKV = new PersistentKV(this.db);

    /** @type {Registry} */
    this.registry = new Registry();

    /** @type {Settings} */
    this.settings = new Settings(this.db, this.eventBus);

    /** @type {DesktopConfig} */
    this.desktopConfig = new DesktopConfig(this.db, this.eventBus, this.registry);

    /** @type {GlobalMemory} */
    this.globalMemory = new GlobalMemory(this.db, this.eventBus);

    /** @type {WindowManager} */
    this.windowManager = new WindowManager(
      document.getElementById('window-container'),
      this.eventBus
    );

    /** @type {AppManager} */
    this.appManager = new AppManager({
      registry: this.registry,
      windowManager: this.windowManager,
      eventBus: this.eventBus,
      globalMemory: this.globalMemory,
      settings: this.settings,
      db: this.db
    });

    /** @type {Theme} */
    this.theme = new Theme();

    /** @type {Desktop} */
    this.desktop = new Desktop(
      document.getElementById('desktop-container'),
      this.eventBus,
      this.appManager
    );

    /** @type {Gestures} */
    this.gestures = new Gestures(document.getElementById('desktop-container'), this.eventBus);

    /* ==========================================================================
       [区域标注·本次需求·iOS侧滑返回手势接入·已完成]
       说明：
       - 只接入 js/core/interaction/gesture.js 中的左侧边缘返回手势。
       - 手势模块本身不涉及任何持久化存储，不使用 localStorage/sessionStorage。
       - 不改动桌面长按、桌面分页、拖拽等其它交互逻辑。
       ========================================================================== */
    /** @type {EdgeBackGesture} */
    this.edgeBackGesture = new EdgeBackGesture(document.getElementById('screen-root'));

    /** @type {DragDrop} */
    this.dragDrop = new DragDrop(document.getElementById('desktop-container'), this.eventBus);

    this.eventBus.on('settings:changed', ({ settings }) => {
      this.theme.apply(settings?.appearance || {});
    });
    
    /** @type {DesktopEditMode} */
    this.desktopEditMode = new DesktopEditMode(
      document.getElementById('desktop-container'),
      this.eventBus,
      this.appManager,
      this.dragDrop,
      this.db,
      this.settings
    );
  }

  async init() {
    try {
      Logger.info('MiniPhone 启动中...');

      // 1) 初始化 IndexedDB
      await this.db.init();

      // 2) 初始化统一持久化入口
      window.__MINIPHONE_PERSISTENT_KV__ = this.persistentKV;

      // 3) 初始化逻辑层数据
      await this.settings.initDefaults();
      await this.registry.initDefaults();

      /* ==========================================================================
         [区域标注·本次需求2·设置世情档案闲谈点击即进预热]
         说明：
         - Registry 初始化后立即预热用户点名的 4 个应用入口模块与关键 CSS。
         - 这里只做资源加载缓存，不 mount 应用、不读写业务数据。
         - 持久化仍统一走项目 DB/IndexedDB 链路，不引入浏览器同步存储。
         ========================================================================== */
      await this.appManager.warmupCriticalApps(['settings', 'worldbook', 'archive', 'chat']);

      await this.desktopConfig.initDefaults();
      await this.globalMemory.init();

      // 4) 应用主题
      const currentSettings = await this.settings.getAll();
      this.theme.apply(currentSettings.appearance || {});

      // 4.5) [模块标注] 启动时恢复界面设置（全屏、状态栏）模块：从持久化设置中读取并还原 body class
      if (currentSettings.appearance?.fullscreen) {
        document.body.classList.add('fullscreen-mode');
      }
      if (currentSettings.appearance?.statusBarHidden) {
        document.body.classList.add('hide-status-bar');
      }

      /* ==========================================================================
         [区域标注·本次需求·地图图标图片美化启动同步·已完成]
         说明：
         - 启动阶段先把 settings.appearance.iconImages 同步给桌面渲染器，再渲染桌面。
         - 确保“图标设置 > 快捷更换图标图片”里保存的地图 appId=map 自定义图标能首屏直接生效，避免先显示默认图标再刷新造成闪屏。
         - 持久化仍只读取 settings（db.js / IndexedDB），不使用 localStorage/sessionStorage，不写双份兜底存储。
         ========================================================================== */
      this.desktop.setIconImages(currentSettings.appearance?.iconImages || {});

      // 5) 渲染桌面
      const desktopState = await this.desktopConfig.getConfig();
      this.desktop.render(desktopState);

      /* ==========================================================================
         [区域标注·本次需求1·桌面应用一次性加载修复]
         说明：
         - 桌面基础 DOM 渲染后，立即等待 DesktopEditMode 从 db.js / IndexedDB 读取已保存布局。
         - 在启动完成与防白屏遮罩移除前套用最新布局，避免刷新后先显示默认几个应用，
           随后才出现其它应用的分段加载现象。
         - 不使用 localStorage/sessionStorage，不写双份兜底存储。
         ========================================================================== */
      await this.desktopEditMode.initializeAfterDesktopRender();

      /* ==========================================================================
         [区域标注·本次反馈修复·桌面直接显示最新配置]
         说明：
         - index.html 启动期会隐藏整机界面，避免出现“只有状态栏、电量，
           桌面区域空白”的中间态。
         - 必须等 db.js / IndexedDB 中的最新桌面编辑布局与 Dock 状态套用完成后，
           才移除启动隐藏标记，让用户一次性看到完整最新桌面。
         - 禁止使用 localStorage/sessionStorage，不写双份兜底存储。
         ========================================================================== */
      this.revealDesktopAfterLatestLayoutReady();

      // 6) 绑定交互
      this.gestures.bind();

      /* ==========================================================================
         [区域标注·本次需求·iOS侧滑返回手势启用·已完成]
         说明：
         - 在桌面基础交互之后启用左侧边缘侧滑返回。
         - 仅响应左边缘 20px 内起始的右滑，不影响普通滚动与内部横向滚动容器。
         ========================================================================== */
      this.edgeBackGesture.bind();

      this.dragDrop.bind();

      // 7) 状态栏时间刷新
      this.setupClock();
      this.setupBattery();

      // 8) 注册 service worker
      await this.registerServiceWorker();

      // 移除防白屏过渡
      const splash = document.getElementById('sys-boot-splash');
      if (splash) {
        splash.style.display = 'none';
      }

      Logger.info('MiniPhone 启动完成');
      this.eventBus.emit('app:ready', { time: Date.now() });
      window.__MINIPHONE_APP_READY__ = true;
    } catch (error) {
      this.revealDesktopAfterLatestLayoutReady();
      window.__MINIPHONE_PERSISTENT_KV__ = null;
      Logger.error('MiniPhone 启动失败', error);
      window.__MINIPHONE_APP_READY__ = false;
    }
  }

  revealDesktopAfterLatestLayoutReady() {
    document.documentElement.removeAttribute('data-desktop-layout-booting');
  }

  setupClock() {
    const update = () => {
      // 在这里可以增加获取本地设置自定义时间偏移的逻辑
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const timeStr = `${hh}:${mm}`;
      
      const topTimeEl = document.getElementById('sys-time');
      if (topTimeEl) topTimeEl.textContent = timeStr;

      // 更新第一页的 Widget 时钟
      const widgetTime = document.getElementById('widget-time');
      if (widgetTime) widgetTime.textContent = timeStr;

      const widgetDate = document.getElementById('widget-date');
      if (widgetDate) {
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        const date = now.getDate();
        const days = ['日', '一', '二', '三', '四', '五', '六'];
        const day = days[now.getDay()];
        widgetDate.textContent = `${year}年${month}月${date}日 星期${day}`;
      }
    };

    update();
    setInterval(update, 10000);
  }

  setupBattery() {
    const batteryLevelEl = document.getElementById('battery-level');
    if (!batteryLevelEl) return;

    if ('getBattery' in navigator) {
      navigator.getBattery().then(battery => {
        const updateBattery = () => {
          batteryLevelEl.style.width = (battery.level * 100) + '%';
          if (battery.level <= 0.2) {
            batteryLevelEl.style.background = '#e74c3c'; // 低电量红色提示
          } else {
            batteryLevelEl.style.background = 'var(--c-text-main)'; // 恢复默认深色
          }
        };
        updateBattery();
        battery.addEventListener('levelchange', updateBattery);
      });
    } else {
      // 不支持 API 时默认显示 80%
      batteryLevelEl.style.width = '80%';
    }
  }

  async registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    try {
      await navigator.serviceWorker.register('/service-worker.js');
      Logger.info('Service Worker 注册成功');
    } catch (error) {
      Logger.warn('Service Worker 注册失败', error);
    }
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  const app = new MiniPhoneApp();
  await app.init();
});
