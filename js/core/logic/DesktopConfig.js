/**
 * 文件名: js/core/logic/DesktopConfig.js
 * 用途: 桌面配置管理器。
 *       管理桌面布局、图标位置、多屏数据、壁纸和图标尺寸等配置。
 *       配置变更后自动持久化到 DesktopStore，并通过 EventBus 通知 UI 重渲染。
 * 位置: /js/core/logic/DesktopConfig.js
 * 架构层: 逻辑层（Logic Layer）
 */
import { DesktopStore } from '../data/DesktopStore.js';
import { Logger } from '../../utils/Logger.js';

export class DesktopConfig {
  /**
   * @param {import('../data/DB.js').DB} db
   * @param {import('../interaction/EventBus.js').EventBus} eventBus
   * @param {import('./Registry.js').Registry} registry
   */
  constructor(db, eventBus, registry) {
    this.store = new DesktopStore(db);
    this.eventBus = eventBus;
    this.registry = registry;
    this.config = null;

    this.bindEvents();
  }

  bindEvents() {
    this.eventBus.on('desktop:icon-move', async ({ fromAppId, toAppId }) => {
      await this.moveIcon(fromAppId, toAppId);
    });
  }

  getDefaultConfig() {
    return {
      wallpaper: '', /* 空则使用 CSS 默认壁纸 */
      themeColor: '#D2C5B5',
      pages: [
        {
          id: 'page-1',
          appIds: ['chat', 'archive', 'forum', 'reader']
        },
        {
          id: 'page-2',
          appIds: ['doujin', 'textgame', 'game']
        }
      ],
      widgets: []
    };
  }

  async initDefaults() {
    const existing = await this.store.getConfig();
    
    // 检查旧配置的结构，如果存在但不是分多页的结构，则强制重置以防页面渲染白屏
    // 例如旧版 pages[0].id 是 'page-1' 但只含有所有应用
    if (existing && existing.pages && existing.pages.length === 2 && existing.pages[0].appIds.includes('archive')) {
      this.config = existing;
      return existing;
    }

    const defaults = this.getDefaultConfig();
    await this.store.saveConfig(defaults);
    this.config = { id: 'desktop-config', ...defaults };
    return this.config;
  }

  async getConfig() {
    if (this.config) return this.config;
    this.config = await this.store.getConfig();
    return this.config;
  }

  async setConfig(nextConfig) {
    this.config = await this.store.saveConfig(nextConfig);
    this.eventBus.emit('desktop:changed', { config: this.config });
    return this.config;
  }

  async addAppToDesktop(appId, pageIndex = 0) {
    const config = await this.getConfig();
    const next = structuredClone(config);
    if (!next.pages[pageIndex]) {
      next.pages[pageIndex] = { id: `page-${pageIndex + 1}`, appIds: [] };
    }

    const exists = next.pages.some((page) => page.appIds.includes(appId));
    if (!exists) {
      next.pages[pageIndex].appIds.push(appId);
      return this.setConfig(next);
    }
    return config;
  }

  async removeAppFromDesktop(appId) {
    const config = await this.getConfig();
    const next = structuredClone(config);

    next.pages.forEach((page) => {
      page.appIds = page.appIds.filter((id) => id !== appId);
    });

    return this.setConfig(next);
  }

  async moveIcon(fromAppId, toAppId) {
    try {
      const config = await this.getConfig();
      const next = structuredClone(config);

      for (const page of next.pages) {
        const fromIndex = page.appIds.indexOf(fromAppId);
        const toIndex = page.appIds.indexOf(toAppId);
        if (fromIndex >= 0 && toIndex >= 0) {
          page.appIds.splice(fromIndex, 1);
          page.appIds.splice(toIndex, 0, fromAppId);
          await this.setConfig(next);
          return next;
        }
      }

      return config;
    } catch (error) {
      Logger.error('移动桌面图标失败', error);
      return this.config;
    }
  }
}
