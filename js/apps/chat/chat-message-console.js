// @ts-nocheck
/**
 * 文件名: js/apps/chat/chat-message-console.js
 * 用途: 闲谈应用 — 聊天消息页控制台日志子模块
 *       承载聊天消息页运行时控制台日志键、日志追加与 IndexedDB 持久化逻辑。
 * 架构层: 应用层（闲谈子模块）
 */

/* ==========================================================================
   [区域标注·已完成·本次 chat-message.js 继续拆分] 聊天控制台日志键与持久化工具
   说明：
   1. 本模块从 chat-message.js 中拆出，只负责聊天消息页运行时控制台日志相关逻辑。
   2. 所有持久化仍统一通过 chat-utils.js 的 dbPut → DB.js / IndexedDB。
   3. 严禁使用 localStorage/sessionStorage，不做双份存储兜底。
   ========================================================================== */
import { dbPut } from './chat-utils.js';

/* ==========================================================================
   [区域标注·已完成·本次控制台持久显示与后台记录修复] 聊天控制台日志存储键
   说明：
   1. 与 index.js / chat-state.js 保持同一 IndexedDB 键规则。
   2. 当前文件只导出聊天消息页需要的日志键与操作函数。
   ========================================================================== */
export const DATA_KEY_CHAT_CONSOLE = (maskId, chatId) => `chat_console::${maskId || 'default'}::${chatId || 'none'}`;

/* ========================================================================
   [区域标注·已完成·本次后台保活目标会话日志修复] 目标会话运行日志追加
   说明：
   1. 后台保活期间用户可能已退出聊天页，state.currentChatId 会变成 null；
      因此日志不能再强依赖 currentChatId，否则 AI 返回日志会直接丢失。
   2. options.targetChatId 指定本次 AI 请求所属会话，options.logs 指定该会话的日志数组快照。
   3. 如果目标会话正好是当前打开会话，则同步更新 state.chatConsoleLogs 以保持界面实时显示。
   4. 仍只通过 DB.js / IndexedDB 持久化，不使用 localStorage/sessionStorage，不写双份兜底。
   ======================================================================== */
export function appendChatConsoleRuntimeLog(state, level, text, options = {}) {
  const targetChatId = String(options.targetChatId || state?.currentChatId || '').trim();
  if (!targetChatId) return false;
  const payload = String(text || '').trim();
  if (!payload) return false;
  const ts = Date.now();
  const entry = {
    id: `log_${ts}_${Math.random().toString(16).slice(2)}`,
    ts,
    time: new Date(ts).toLocaleTimeString('zh-CN', { hour12: false }),
    level: String(level || 'info').toLowerCase(),
    text: payload
  };
  const sourceLogs = Array.isArray(options.logs)
    ? options.logs
    : (Array.isArray(state.chatConsoleLogs) ? state.chatConsoleLogs : []);
  const nextLogs = [...sourceLogs, entry].slice(-500);

  if (Array.isArray(options.logs)) {
    options.logs.splice(0, options.logs.length, ...nextLogs);
  }

  if (String(state?.currentChatId || '') === targetChatId) {
    state.chatConsoleLogs = nextLogs;
  }

  return true;
}

/* ========================================================================
   [区域标注·已完成·本次后台保活目标会话日志修复] 目标会话运行日志持久化
   说明：
   1. 支持在 currentChatId 已为空或已切到其它会话时，仍把后台 AI 日志写回原目标会话。
   2. options.logs 优先作为本次请求的完整日志快照；未传入时兼容保存当前会话日志。
   3. 持久化只走 DB.js / IndexedDB，不使用 localStorage/sessionStorage。
   ======================================================================== */
export async function persistChatConsoleRuntimeLogs(state, db, options = {}) {
  const targetChatId = String(options.targetChatId || state?.currentChatId || '').trim();
  if (!targetChatId) return;
  const logs = Array.isArray(options.logs)
    ? options.logs
    : (Array.isArray(state.chatConsoleLogs) ? state.chatConsoleLogs : []);
  await dbPut(
    db,
    DATA_KEY_CHAT_CONSOLE(state.activeMaskId, targetChatId),
    logs.slice(-500)
  );
}
