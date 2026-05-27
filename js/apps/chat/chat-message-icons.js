// @ts-nocheck

/**
 * 文件名: js/apps/chat/chat-message-icons.js
 * 用途: 闲谈应用 — 聊天消息页图标常量
 * 说明：
 *   1. 这里集中存放聊天消息页与其拆分子模块共用的 IconPark 风格 SVG。
 *   2. 仅做静态 SVG 常量导出，不涉及任何持久化存储。
 *   3. 后续如需新增按钮图标，优先放到这里统一维护。
 */

export const MSG_ICONS = {
  /* ========================================================================
     [区域标注·本次修改·外卖功能] IconPark — 外卖按钮图标
     说明：用于聊天消息页咖啡功能区“外卖”板块。
     ======================================================================== */
  takeaway: `<svg viewBox="0 0 48 48" fill="none"><path d="M4 28h8l4-14h16l4 14h8" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="16" cy="36" r="6" stroke="currentColor" stroke-width="3"/><circle cx="36" cy="36" r="6" stroke="currentColor" stroke-width="3"/><path d="M16 14h16v14H16z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>`,
  back: `<svg viewBox="0 0 48 48" fill="none"><path d="M32 36L20 24l12-12" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  send: `<svg viewBox="0 0 48 48" fill="none"><path d="M43 5L25 43l-5-18L2 20L43 5Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M20 25l23-20" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`,
  magicWand: `<svg viewBox="0 0 48 48" fill="none"><path d="M43 5L5 43" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M35 5l8 8" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M20 6l2 6l6 2l-6 2l-2 6l-2-6l-6-2l6-2l2-6Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M36 24l1.5 4l4 1.5l-4 1.5l-1.5 4l-1.5-4l-4-1.5l4-1.5l1.5-4Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>`,
  coffee: `<svg viewBox="0 0 48 48" fill="none"><path d="M6 20h28v14a8 8 0 0 1-8 8H14a8 8 0 0 1-8-8V20Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M34 24h4a6 6 0 0 1 0 12h-4" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 6v6M20 6v6M28 6v6" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`,
  /* ========================================================================
     [区域标注·已完成·AI识图图片入口] IconPark — 图片按钮图标
     说明：用于聊天消息页咖啡功能区“图片”板块，图标来源保持 IconPark 风格。
     ======================================================================== */
  image: `<svg viewBox="0 0 48 48" fill="none"><path d="M6 10h36v28H6V10Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M14 30l7-8l6 6l5-5l8 9" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="17" cy="18" r="3" stroke="currentColor" stroke-width="3"/></svg>`,
  more: `<svg viewBox="0 0 48 48" fill="none"><circle cx="12" cy="24" r="3" fill="currentColor"/><circle cx="24" cy="24" r="3" fill="currentColor"/><circle cx="36" cy="24" r="3" fill="currentColor"/></svg>`,
  /* ========================================================================
     [区域标注·已完成·聊天记录搜索] IconPark — 顶栏搜索按钮图标
     说明：用于聊天消息界面顶栏三点按钮左侧的聊天记录搜索入口；仅运行时筛选当前消息数组，不涉及持久化存储。
     ======================================================================== */
  search: `<svg viewBox="0 0 48 48" fill="none"><path d="M21 38c9.389 0 17-7.611 17-17S30.389 4 21 4S4 11.611 4 21s7.611 17 17 17Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M33 33l11 11" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  emptyChat: `<svg viewBox="0 0 48 48" fill="none"><path d="M44 6H4v30h14l6 6l6-6h14V6Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><circle cx="16" cy="21" r="2" fill="currentColor"/><circle cx="24" cy="21" r="2" fill="currentColor"/><circle cx="32" cy="21" r="2" fill="currentColor"/></svg>`,
  sticker: `<svg viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="19" stroke="currentColor" stroke-width="3"/><path d="M16 29c2 4 14 4 16 0" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="17" cy="20" r="2.5" fill="currentColor"/><circle cx="31" cy="20" r="2.5" fill="currentColor"/></svg>`,
  wallet: `<svg viewBox="0 0 48 48" fill="none"><path d="M6 14h36v28H6V14Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M10 14V8h26v6" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M32 28h10v8H32a4 4 0 0 1 0-8Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>`,
  bolt: `<svg viewBox="0 0 48 48" fill="none"><path d="M28 4L10 28h14l-4 16l18-24H24l4-16Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>`,
  /* ========================================================================
     [区域标注·已完成·旁白板块入口] IconPark — 旁白按钮图标
     说明：用于聊天消息页咖啡功能区第二行"旁白"板块，图标来源保持 IconPark 风格。
     ======================================================================== */
  aside: `<svg viewBox="0 0 48 48" fill="none"><path d="M10 8h28a2 2 0 0 1 2 2v20a2 2 0 0 1-2 2H26l-8 8v-8h-8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M18 17h12M18 23h8" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`,

  /* ========================================================================
     [区域标注·已完成·电话功能] IconPark — 电话按钮图标
     说明：用于聊天消息页咖啡功能区第三行"电话"板块，图标已改为电话筒（听筒）样式。
     ======================================================================== */
  phone: `<svg viewBox="0 0 48 48" fill="none"><path d="M8 30H14C15.1046 30 16 29.1046 16 28V22C16 20.8954 15.1046 20 14 20H8C6.89543 20 6 20.8954 6 22V28C6 29.1046 6.89543 30 8 30Z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M40 30H34C32.8954 30 32 29.1046 32 28V22C32 20.8954 32.8954 20 34 20H40C41.1046 20 42 20.8954 42 22V28C42 29.1046 41.1046 30 40 30Z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M24 6C14.0589 6 6 14.0589 6 24" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M42 24C42 14.0589 33.9411 6 24 6" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,

  /* ==========================================================================
     [区域标注·本次修改3] 消息气泡功能栏 IconPark 图标
     说明：单击消息气泡后显示，含修正、删除和多选；“修正”用于 AI 表情包格式补全。
     ========================================================================== */
  fixFormat: `<svg viewBox="0 0 48 48" fill="none"><path d="M8 36l4 4l10-10" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M28 6l4 8l8 4l-8 4l-4 8l-4-8l-8-4l8-4l4-8Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M36 30l2 4l4 2l-4 2l-2 4l-2-4l-4-2l4-2l2-4Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>`,
  delete: `<svg viewBox="0 0 48 48" fill="none"><path d="M8 11h32" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M19 11V7h10v4" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M14 11l2 30h16l2-30" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M21 19v14M27 19v14" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`,
  multiSelect: `<svg viewBox="0 0 48 48" fill="none"><path d="M20 10h20v20H20V10Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M8 18v20h20" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M25 20l4 4l7-8" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  /* [区域标注·已完成·气泡编辑收藏] IconPark — 编辑 / 收藏按钮图标 */
  edit: `<svg viewBox="0 0 48 48" fill="none"><path d="M8 34v6h6L38 16l-6-6L8 34Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M29 13l6 6" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`,
  favorite: `<svg viewBox="0 0 48 48" fill="none"><path d="M24 6l5.6 11.4L42 19.2l-9 8.8l2.1 12.4L24 34.5l-11.1 5.9L15 28l-9-8.8l12.4-1.8L24 6Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>`,
  forward: `<svg viewBox="0 0 48 48" fill="none"><path d="M28 10l12 12l-12 12" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M40 22H20c-8 0-12 4-12 12v4" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  check: `<svg viewBox="0 0 48 48" fill="none"><path d="M10 25l10 10l18-20" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  close: `<svg viewBox="0 0 48 48" fill="none"><path d="M14 14l20 20M34 14L14 34" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`,
  broom: `<svg viewBox="0 0 48 48" fill="none"><path d="M30 6l12 12" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M27 9l12 12L18 42H8v-10L27 9Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M12 32l4 4M19 25l4 4" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`,
  undo: `<svg viewBox="0 0 48 48" fill="none"><path d="M16 14H6v10" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 24c3-9 10-14 20-14c8 0 14 3 18 9" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M42 34c-3 5-8 8-14 8c-8 0-14-3-18-9" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`,
  /* ========================================================================
     [区域标注·已完成·消息回溯] IconPark — 气泡功能栏回溯按钮图标
     说明：用于从当前消息气泡向后删除聊天记录；仅更新当前消息数组并写入 DB.js / IndexedDB。
     ======================================================================== */
  rewind: `<svg viewBox="0 0 48 48" fill="none"><path d="M21 14L8 24l13 10V14Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M40 14L27 24l13 10V14Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>`,
  /* ========================================================================
     [区域标注·已完成·用户消息撤回] IconPark — 用户气泡撤回按钮图标
     说明：仅用于用户方消息气泡功能栏；不涉及任何持久化存储读写。
     ======================================================================== */
  withdraw: `<svg viewBox="0 0 48 48" fill="none"><path d="M18 12H8v10" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 22c4-9 12-14 23-12c8 2 13 8 13 16c0 10-8 17-18 17c-5 0-10-2-14-5" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M31 18L21 28M21 18l10 10" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`,
  /* ========================================================================
     [区域标注·已完成·本次角色气泡拍拍] IconPark — 角色消息气泡功能栏“拍拍”按钮图标
     说明：仅用于角色方消息气泡功能栏触发 QQ/微信式拍一拍；不涉及任何持久化存储读写。
     ======================================================================== */
  pat: `<svg viewBox="0 0 48 48" fill="none"><path d="M16 25c-4 0-7-3-7-7s3-7 7-7c2.2 0 4.2 1 5.5 2.6" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M28 12c3.3 0 6 2.7 6 6v2" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M14 25v5c0 7.2 5.8 13 13 13h2c6.1 0 11-4.9 11-11v-8c0-2.2-1.8-4-4-4c-1 0-2 .4-2.7 1.1" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M22 24V10a4 4 0 0 1 8 0v13M30 23v-7a4 4 0 0 1 8 0v9" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M6 34c3 2 5 2 8 0M5 40c4 2.5 8 2.5 12 0" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`,
  /* [区域标注·已完成·气泡功能区复制] IconPark — 复制按钮图标 */
  copy: `<svg viewBox="0 0 48 48" fill="none"><path d="M16 16V8h24v24h-8" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M8 16h24v24H8V16Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>`,
  /* ========================================================================
     [区域标注·已完成·引用回复] IconPark — 引用按钮图标
     说明：用于消息气泡第二行“引用”按钮；引用数据随消息对象写入 DB.js / IndexedDB。
     ======================================================================== */
  quote: `<svg viewBox="0 0 48 48" fill="none"><path d="M18 10H8v12h10v16H8" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M40 10H30v12h10v16H30" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  /* ========================================================================
     [区域标注·已完成·AI本轮撤回] IconPark — 系统提示修正/查看撤回图标
     说明：服务 AI 撤回系统提示的查看弹窗与“修正→系统提示”；不涉及额外存储。
     ======================================================================== */
  systemTip: `<svg viewBox="0 0 48 48" fill="none"><path d="M8 8h32v26H18L8 42V8Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M16 18h16M16 26h10" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`,
  /* ========================================================================
     [区域标注·已完成·本次语音掉格式修正入口] IconPark — 文本 / 语音修正按钮图标
     说明：
     1. 用于“修正”分类弹窗的文本格式与语音格式修复。
     2. “语音”修正会把含 [语音] / 【语音】残片的 AI 文字气泡转为语音气泡。
     3. 本区域不涉及任何持久化存储读写；保存仍由 index.js 写入 DB.js / IndexedDB。
     ======================================================================== */
  textRepair: `<svg viewBox="0 0 48 48" fill="none"><path d="M8 10h32M14 10v28M34 10v28M10 38h12M26 38h12" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  voiceRepair: `<svg viewBox="0 0 48 48" fill="none"><rect x="17" y="5" width="14" height="24" rx="7" stroke="currentColor" stroke-width="3"/><path d="M10 22c0 8 6 14 14 14s14-6 14-14" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M24 36v7M17 43h14" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`,
  /* ========================================================================
     [区域标注·已完成·当前会话头像设置] IconPark — 头像上传 / 链接 / 裁剪图标
     说明：仅用于聊天设置页“当前会话联系人头像”区域；不涉及其它资料头像。
     ======================================================================== */
  userAvatar: `<svg viewBox="0 0 48 48" fill="none"><path d="M24 24a9 9 0 1 0 0-18a9 9 0 0 0 0 18Z" stroke="currentColor" stroke-width="3"/><path d="M8 42a16 16 0 0 1 32 0" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`,
  upload: `<svg viewBox="0 0 48 48" fill="none"><path d="M24 6v26" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M14 16L24 6l10 10" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 34v8h32v-8" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  link: `<svg viewBox="0 0 48 48" fill="none"><path d="M19 29l10-10" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M21 14l3-3a10 10 0 0 1 14 14l-3 3" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M27 34l-3 3a10 10 0 0 1-14-14l3-3" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  crop: `<svg viewBox="0 0 48 48" fill="none"><path d="M12 4v32a8 8 0 0 0 8 8h24" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M4 12h24a8 8 0 0 1 8 8v24" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M18 18h12v12H18V18Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>`,
  /* ========================================================================
     [区域标注·已完成·本次控制台日志开关] IconPark — 控制台日志抽屉图标
     说明：仅服务聊天设置页“查看控制台日志”与聊天页底栏上方日志抽屉。
     ======================================================================== */
  monitor: `<svg viewBox="0 0 48 48" fill="none"><rect x="6" y="8" width="36" height="24" rx="3" stroke="currentColor" stroke-width="3"/><path d="M24 32v8M16 40h16" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M14 24l6-7l5 5l9-10" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  warning: `<svg viewBox="0 0 48 48" fill="none"><path d="M24 6l18 32H6L24 6Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M24 18v10" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="24" cy="33" r="2" fill="currentColor"/></svg>`
};
