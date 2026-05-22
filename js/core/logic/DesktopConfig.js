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
          /* [区域标注·本次需求·默认配置增加轨迹应用] */
          appIds: ['doujin', 'textgame', 'game', 'trace']
        }
      ],
      widgets: []
    };
  }

  /* ==========================================================================
     [区域标注·本次需求1·桌面应用一次性同步渲染]
     说明：
     - 刷新后桌面首屏只渲染配置里的 appIds；旧 IndexedDB 配置可能缺少后来注册的应用。
     - 这里在首次 render 前，用 Registry 中的已注册应用补齐桌面配置并写回 IndexedDB。
     - 只使用项目 DB/IndexedDB 持久化链路；不引入浏览器同步存储或双份兜底存储。
     ========================================================================== */
  async initDefaults() {
    const existing = await this.store.getConfig();

    // 已有配置结构有效时保留用户原顺序，仅补齐缺失的已注册应用，避免刷新后图标分批出现。
    if (existing && Array.isArray(existing.pages) && existing.pages.length > 0
        && existing.pages.every(p => p && Array.isArray(p.appIds))) {
      const synced = await this.ensureRegisteredAppsOnDesktop(existing);
      this.config = synced;
      return synced;
    }

    const defaults = await this.ensureRegisteredAppsOnDesktop(this.getDefaultConfig());
    this.config = { id: 'desktop-config', ...defaults };
    return this.config;
  }

  /* ==========================================================================
     [区域标注·本次需求1·补齐已注册桌面应用]
     说明：把 Registry 中存在但桌面 pages 尚未包含的应用追加到最后一页，
           保持用户已有图标顺序不变，并在首次桌面渲染前完成保存。
     ========================================================================== */
  async ensureRegisteredAppsOnDesktop(config) {
    const next = structuredClone(config);
    const pages = Array.isArray(next.pages) ? next.pages : [];
    if (!pages.length) {
      pages.push({ id: 'page-1', appIds: [] });
    }

    const registeredAppIds = this.registry.getAll().map((app) => app.id);
    const desktopAppIds = new Set(pages.flatMap((page) => page.appIds || []));
    const missingAppIds = registeredAppIds.filter((appId) => !desktopAppIds.has(appId));

    if (!missingAppIds.length) {
      return config;
    }

    const targetPage = pages[pages.length - 1];
    targetPage.appIds = [...(targetPage.appIds || []), ...missingAppIds];
    next.pages = pages;

    return this.store.saveConfig(next);
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
