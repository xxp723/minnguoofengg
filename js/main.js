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

import { DB } from './core/data/DB.js';

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

    /** @type {Registry} */
    this.registry = new Registry();

    /** @type {Settings} */
    this.settings = new Settings(this.db);

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

    /** @type {DragDrop} */
    this.dragDrop = new DragDrop(document.getElementById('desktop-container'), this.eventBus);
    
    /** @type {DesktopEditMode} */
    this.desktopEditMode = new DesktopEditMode(
      document.getElementById('desktop-container'), 
      this.eventBus, 
      this.appManager, 
      this.dragDrop
    );
  }

  async init() {
    try {
      Logger.info('MiniPhone 启动中...');

      // 1) 初始化 IndexedDB
      await this.db.init();

      // 2) 初始化逻辑层数据
      await this.settings.initDefaults();
      await this.registry.initDefaults();
      await this.desktopConfig.initDefaults();
      await this.globalMemory.init();

      // 3) 应用主题
      const currentSettings = await this.settings.getAll();
      this.theme.apply(currentSettings.appearance || {});

      // 4) 渲染桌面
      const desktopState = await this.desktopConfig.getConfig();
      this.desktop.render(desktopState);

      // 5) 绑定交互
      this.gestures.bind();
      this.dragDrop.bind();

      // 6) 状态栏时间刷新
      this.setupClock();
      this.setupBattery();

      // 7) 注册 service worker
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
      Logger.error('MiniPhone 启动失败', error);
      window.__MINIPHONE_APP_READY__ = false;
    }
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
