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

    this.bindEvents();
  }

  bindEvents() {
    this.eventBus.on('app:open', async ({ appId }) => {
      if (!appId) return;
      await this.open(appId);
    });

    this.eventBus.on('app:close', async ({ appId }) => {
      if (!appId) return;
      await this.close(appId);
    });
  }

  async open(appId) {
    const appMeta = this.registry.get(appId);
    if (!appMeta) {
      Logger.warn(`应用未注册: ${appId}`);
      return;
    }

    try {
      // 已打开则直接聚焦
      if (this.mountedInstances.has(appId)) {
        this.windowManager.focus(appId);
        return;
      }

      const moduleRef = await this.loadModule(appMeta);
      if (!moduleRef || typeof moduleRef.mount !== 'function') {
        throw new Error(`应用入口缺少 mount 方法: ${appMeta.entry}`);
      }

      const contentEl = this.windowManager.open(appMeta);

      const context = {
        appId,
        appMeta,
        eventBus: this.eventBus,
        globalMemory: this.globalMemory,
        settings: this.settings,
        db: this.db,
        windowManager: this.windowManager
      };

      const instance = await moduleRef.mount(contentEl, context);
      this.mountedInstances.set(appId, instance || {});

      this.eventBus.emit('app:opened', { appId, appMeta });
      Logger.info(`应用已打开: ${appMeta.name}`);
    } catch (error) {
      Logger.error(`打开应用失败: ${appId}`, error);
      this.windowManager.showError(appId, '应用启动失败，请查看日志。');
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
