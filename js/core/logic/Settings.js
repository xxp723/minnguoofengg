/**
 * 文件名: js/core/logic/Settings.js
 * 用途: 全局设置管理器。
 *       管理外观设置、API设置（Base URL / Key）、语音与生图配置，并提供导入/导出能力。
 *       与 SettingsStore 交互持久化，同时通过 EventBus 广播设置变更。
 * 位置: /js/core/logic/Settings.js
 * 架构层: 逻辑层（Logic Layer）
 */
import { SettingsStore } from '../data/SettingsStore.js';
import { DesktopStore } from '../data/DesktopStore.js';
import { MemoryStore } from '../data/MemoryStore.js';
import { AppDataStore } from '../data/AppDataStore.js';
import { Logger } from '../../utils/Logger.js';

export class Settings {
  /**
   * @param {import('../data/DB.js').DB} db
   * @param {import('../interaction/EventBus.js').EventBus} [eventBus]
   */
  constructor(db, eventBus = null) {
    this.store = new SettingsStore(db);
    this.desktopStore = new DesktopStore(db);
    this.memoryStore = new MemoryStore(db);
    this.appDataStore = new AppDataStore(db);
    this.eventBus = eventBus;
  }

  getDefaultSettings() {
    return {
      appearance: {
        wallpaper: '',
        desktopWallpaper: '',
        lockscreenWallpaper: '',
        themeColor: '#4f46e5',
        iconSize: 56,
        iconImage: '',
        iconImages: {},
        iconRadius: 18,
        iconShadowStyle: 'outer',
        iconShadowSize: 18,
        iconBorderWidth: 0,
        iconBorderColor: '#d7c9b8'
      },
      api: {
        textToImage: { baseUrl: '', apiKey: '' },
        minimaxTTS: { baseUrl: '', apiKey: '', voiceId: '' }
      },
      features: {
        offlineMode: true
      }
    };
  }

  async initDefaults() {
    const existing = await this.store.getSettings();
    if (existing) return existing;

    const defaults = this.getDefaultSettings();
    return this.store.saveSettings(defaults);
  }

  async getAll() {
    return (await this.store.getSettings()) || this.getDefaultSettings();
  }

  async update(partialSettings) {
    const next = await this.store.patchSettings(partialSettings);
    if (this.eventBus) {
      this.eventBus.emit('settings:changed', { settings: next });
    }
    return next;
  }

  /**
   * 导出所有核心数据（桌面配置、设置、记忆、应用私有数据、错误日志）
   */
  async exportAllData() {
    const settings = await this.store.getSettings();
    const desktop = await this.desktopStore.getConfig();
    const memories = await this.memoryStore.getAllMemories();
    const appsData = await this.appDataStore.getAll();

    let logs = [];
    try {
      logs = JSON.parse(localStorage.getItem('miniphone:error-logs') || '[]');
    } catch {
      logs = [];
    }

    return {
      meta: {
        app: 'MiniPhone',
        version: 1,
        exportedAt: Date.now()
      },
      data: {
        settings,
        desktop,
        memories,
        appsData,
        logs
      }
    };
  }

  /**
   * 导入数据（可按需覆盖）
   * @param {any} backup
   * @param {{overwrite?: boolean}} options
   */
  async importAllData(backup, options = {}) {
    const { overwrite = true } = options;
    if (!backup || !backup.data) {
      throw new Error('导入数据格式错误');
    }

    const { settings, desktop, memories, appsData, logs } = backup.data;

    if (overwrite) {
      await this.memoryStore.clearAll();
      await this.appDataStore.db.clear('appsData');
    }

    if (settings) await this.store.saveSettings(settings);
    if (desktop) await this.desktopStore.saveConfig(desktop);

    if (Array.isArray(memories)) {
      for (const item of memories) {
        await this.memoryStore.setMemory(item.key, item.value, item.sourceApp || 'import');
      }
    }

    if (Array.isArray(appsData)) {
      for (const item of appsData) {
        await this.appDataStore.set(item.appId, item.key, item.value);
      }
    }

    if (Array.isArray(logs)) {
      localStorage.setItem('miniphone:error-logs', JSON.stringify(logs.slice(0, 200)));
    }

    Logger.info('导入数据完成');
    if (this.eventBus) {
      this.eventBus.emit('settings:imported', {});
      this.eventBus.emit('desktop:changed', {});
      this.eventBus.emit('memory:updated', { sourceApp: 'import' });
    }

    return true;
  }
}
