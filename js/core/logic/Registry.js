/**
 * 文件名: js/core/logic/Registry.js
 * 用途: 应用注册表。
 *       维护所有可用应用的元数据（id, name, icon, entry）。
 *       AppManager 通过 Registry 查询应用入口路径并动态加载。
 * 位置: /js/core/logic/Registry.js
 * 架构层: 逻辑层（Logic Layer）
 */

/**
 * IconPark 图标 HTML 映射
 * 使用 IconPark 开源图标库的 SVG 内联图标
 * 图标来源: https://iconpark.oceanengine.com/
 */
const ICONPARK_ICONS = {
  /* 设置 - Setting (齿轮) */
  settings: '<svg width="28" height="28" viewBox="0 0 48 48" fill="none"><path transform="translate(2, 0)" d="M18.3 6.1L17 11.4a13 13 0 0 0-4.4 2.5l-5.1-1.7L4 18.5l3.8 3.6a13 13 0 0 0 0 3.8L4 29.5l3.5 6.3l5.1-1.7a13 13 0 0 0 4.4 2.5l1.3 5.3h7.4l1.3-5.3a13 13 0 0 0 4.4-2.5l5.1 1.7l3.5-6.3l-3.8-3.6a13 13 0 0 0 0-3.8l3.8-3.6l-3.5-6.3l-5.1 1.7a13 13 0 0 0-4.4-2.5L25.7 6.1h-7.4Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><circle cx="24" cy="24" r="5" stroke="currentColor" stroke-width="3"/></svg>',

  /* 闲谈 - Chat (消息气泡) */
  chat: '<svg width="28" height="28" viewBox="0 0 48 48" fill="none"><path d="M44 6H4v28h14l6 8l6-8h14V6Z" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><line x1="14" y1="18" x2="34" y2="18" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><line x1="14" y1="26" x2="28" y2="26" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',

  /* 档案 - FolderOpen (文件夹) */
  archive: '<svg width="28" height="28" viewBox="0 0 48 48" fill="none"><rect x="4" y="10" width="40" height="6" rx="1" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M8 16v22h32V16" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><line x1="20" y1="26" x2="28" y2="26" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',

  /* 旧事 - Time (时钟) */
  memory: '<svg width="28" height="28" viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="20" stroke="currentColor" stroke-width="3"/><polyline points="24,14 24,24 32,30" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',

  /* 茶馆 - People (人群) */
  forum: '<svg width="28" height="28" viewBox="0 0 48 48" fill="none"><circle cx="24" cy="12" r="6" stroke="currentColor" stroke-width="3"/><path d="M36 42c0-6.6-5.4-12-12-12S12 35.4 12 42" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="39" cy="14" r="4" stroke="currentColor" stroke-width="3"/><path d="M44 38c0-4-2.7-7-6-7" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="9" cy="14" r="4" stroke="currentColor" stroke-width="3"/><path d="M4 38c0-4 2.7-7 6-7" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',

  /* 世情 - Earth (地球) */
  worldbook: '<svg width="28" height="28" viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="20" stroke="currentColor" stroke-width="3"/><ellipse cx="24" cy="24" rx="9" ry="20" stroke="currentColor" stroke-width="3"/><line x1="6" y1="18" x2="42" y2="18" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><line x1="6" y1="30" x2="42" y2="30" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',

  /* 观书 - BookOpen (打开的书) */
  reader: '<svg width="28" height="28" viewBox="0 0 48 48" fill="none"><path d="M4 8h16c2.2 0 4 1.8 4 4v28c-2.2-2-5.4-2-8-2H4V8Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M44 8H28c-2.2 0-4 1.8-4 4v28c2.2-2 5.4-2 8-2h12V8Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>',

  /* 戏笔 - Write (毛笔/编辑) */
  doujin: '<svg width="28" height="28" viewBox="0 0 48 48" fill="none"><path d="M7 42l3-12L34 6l6 6L16 36L7 42Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><line x1="30" y1="10" x2="38" y2="18" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><line x1="10" y1="30" x2="18" y2="38" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',

  /* 梦笺 - Notes (文档/笺) */
  textgame: '<svg width="28" height="28" viewBox="0 0 48 48" fill="none"><rect x="8" y="4" width="32" height="40" rx="2" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><line x1="16" y1="14" x2="32" y2="14" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><line x1="16" y1="22" x2="32" y2="22" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><line x1="16" y1="30" x2="26" y2="30" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',

  /* 游戏 - GameHandle (游戏手柄) */
  game: '<svg width="28" height="28" viewBox="0 0 48 48" fill="none"><rect x="4" y="14" width="40" height="22" rx="8" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><circle cx="16" cy="25" r="3" stroke="currentColor" stroke-width="3"/><circle cx="32" cy="25" r="3" stroke="currentColor" stroke-width="3"/><line x1="23" y1="21" x2="25" y2="21" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><line x1="23" y1="29" x2="25" y2="29" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>'
};

export class Registry {
  constructor() {
    /** @type {Map<string, {id:string,name:string,icon:string,entry:string}>} */
    this.apps = new Map();
  }

  async initDefaults() {
    const defaultApps = [
      { id: 'settings', name: '设置', icon: ICONPARK_ICONS.settings, entry: '../../apps/settings/index.js' },
      { id: 'chat', name: '闲谈', icon: ICONPARK_ICONS.chat, entry: '../../apps/chat/index.js' },
      { id: 'archive', name: '档案', icon: ICONPARK_ICONS.archive, entry: '../../apps/archive/index.js' },
      { id: 'memory', name: '旧事', icon: ICONPARK_ICONS.memory, entry: '../../apps/memory/index.js' },
      { id: 'forum', name: '茶馆', icon: ICONPARK_ICONS.forum, entry: '../../apps/forum/index.js' },
      { id: 'worldbook', name: '世情', icon: ICONPARK_ICONS.worldbook, entry: '../../apps/worldbook/index.js' },
      { id: 'reader', name: '观书', icon: ICONPARK_ICONS.reader, entry: '../../apps/reader/index.js' },
      { id: 'doujin', name: '戏笔', icon: ICONPARK_ICONS.doujin, entry: '../../apps/doujin/index.js' },
      { id: 'textgame', name: '梦笺', icon: ICONPARK_ICONS.textgame, entry: '../../apps/textgame/index.js' },
      { id: 'game', name: '游戏', icon: ICONPARK_ICONS.game, entry: '../../apps/game/index.js' }
    ];

    defaultApps.forEach((app) => this.register(app));
  }

  register(appMeta) {
    this.apps.set(appMeta.id, appMeta);
    return appMeta;
  }

  unregister(appId) {
    this.apps.delete(appId);
  }

  get(appId) {
    return this.apps.get(appId) || null;
  }

  getAll() {
    return Array.from(this.apps.values());
  }

  has(appId) {
    return this.apps.has(appId);
  }
}
