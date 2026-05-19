// @ts-nocheck
/**
 * 文件名: js/apps/chat/chat-message-settings.js
 * 用途: 闲谈应用 — 聊天消息页的独立聊天设置页面渲染模块
 * 架构层: 应用层（闲谈子模块）
 */

import { escapeHtml } from './chat-utils.js';
import { MSG_ICONS } from './chat-message-icons.js';
import { renderTranslationSettingsHtml } from './chat-translation.js';
import { renderAutonomousActivitySettingsSection } from './chat-autonomous-activity-settings.js';
import { renderChatMemorySettingsSection } from './chat-memory-settings.js';
import { renderUserPatSettingsSection } from './chat-user-pat.js';

/* ==========================================================================
   [区域标注·已完成·本次拆分] 独立聊天设置页面
   说明：
   1. 本模块只负责渲染聊天消息页 settings 页面 HTML，三点按钮进入与返回事件仍由原事件代理处理。
   2. 所有 data-role / data-action / class 保持原样，确保 chat-message.js 与 index.js 的既有接线不变。
   3. 设置保存逻辑仍由 index.js 写入 DB.js / IndexedDB；本模块不读写 localStorage/sessionStorage。
   ========================================================================== */
export function renderChatMessageSettingsPage({
  session = {},
  name = '聊天',
  chatSettings = {},
  options = {},
  stickerGroups = [],
  mountedStickerGroupIds = [],
  chatConsoleEnabled = false
} = {}) {
  /* ========================================================================
     [区域标注·本次修改·头像与备注3点需求：设置页双头像显示数据]
     说明：
     1. 角色名称固定显示当前联系人的本名 session.name，不使用备注优先的 name。
     2. 用户名称固定显示用户主页显示名，优先 nickname，其次 name，最后回退“我”。
     3. 角色头像删除当前会话覆盖后，设置页预览优先回退到联系人资料头像，而不是直接回退单字占位。
     4. 用户头像删除当前会话覆盖后，继续回退到用户主页头像。
     ======================================================================== */
  const roleDisplayName = String(session.name || '聊天').trim() || '聊天';
  const userDisplayName = String(options.userProfile?.nickname || options.userProfile?.name || '我').trim() || '我';
  const currentContact = options.currentContact || {};
  const contactAvatar = String(
    currentContact.avatar
    || options.contactAvatar
    || ''
  ).trim();
  const characterAvatarSrc = String(session.avatar || contactAvatar || '').trim();
  const userAvatarSrc = String(session.userAvatar || options.userProfile?.avatar || '').trim();
  const characterAvatarMarkup = characterAvatarSrc
    ? `<img src="${escapeHtml(characterAvatarSrc)}" alt="${escapeHtml(roleDisplayName)}">`
    : `<span>${escapeHtml((roleDisplayName || '?').charAt(0).toUpperCase())}</span>`;
  const userAvatarMarkup = userAvatarSrc
    ? `<img src="${escapeHtml(userAvatarSrc)}" alt="${escapeHtml(userDisplayName)}">`
    : `<span>${escapeHtml((userDisplayName || '我').charAt(0).toUpperCase())}</span>`;

  return `
    <div class="msg-settings-page" data-role="msg-settings-page" style="display:none;">
      <div class="msg-settings-header">
        <button class="msg-settings-header__back" data-action="msg-settings-back" type="button">${MSG_ICONS.back}</button>
        <div class="msg-settings-header__title">聊天设置</div>
      </div>
      <div class="msg-settings-body">
        <!-- ==================================================================
             [区域标注·已完成·本次修改1与修改2：双头像回退/隐藏头像说明文字移除]
             说明：
             1. 本区域只修改当前聊天会话的 session.avatar / session.userAvatar / session.remark，与聊天设置 showUserAvatarToRole / hideAvatars。
             2. 删除当前会话角色头像后，显示层优先回退到通讯录/联系人资料头像；删除当前会话用户头像后，显示层回退到用户主页头像。
             3. 角色名称固定显示当前联系人的本名 session.name，不显示备注；用户名称固定显示用户主页显示名。
             4. “隐藏头像”小板块说明性文字已按本次要求移除，仅保留标题与开关。
             5. 不写入 contacts、contact.avatar、state.profile.avatar；持久化统一走 DB.js / IndexedDB。
             6. 不使用 localStorage/sessionStorage；头像点击后仅打开应用内来源选择弹窗。
             ================================================================== -->
        <section class="msg-settings-avatar-section">
          <div class="msg-settings-section-title">头像与备注</div>
          <section class="msg-settings-card msg-settings-avatar-card">
            <input data-role="msg-avatar-file-input" type="file" accept="image/*" hidden>
            <div class="msg-settings-avatar-block">
              <div class="msg-settings-avatar-grid">
                <div class="msg-settings-avatar-item">
                  <button
                    class="msg-settings-avatar-preview msg-settings-avatar-preview-btn"
                    data-action="open-chat-avatar-source-modal"
                    data-avatar-target="character"
                    data-role="msg-settings-avatar-preview-character"
                    type="button"
                    aria-label="更换角色头像">
                    ${characterAvatarMarkup}
                  </button>
                  <div class="msg-settings-avatar-label">${escapeHtml(roleDisplayName)}</div>
                </div>
                <div class="msg-settings-avatar-item">
                  <button
                    class="msg-settings-avatar-preview msg-settings-avatar-preview-btn"
                    data-action="open-chat-avatar-source-modal"
                    data-avatar-target="user"
                    data-role="msg-settings-avatar-preview-user"
                    type="button"
                    aria-label="更换用户头像">
                    ${userAvatarMarkup}
                  </button>
                  <div class="msg-settings-avatar-label">${escapeHtml(userDisplayName)}</div>
                </div>
              </div>
            </div>
            <div class="msg-settings-avatar-divider"></div>
            <div class="msg-settings-row msg-settings-avatar-switch-row">
              <div class="msg-settings-card__title">向角色展示头像</div>
              <button class="msg-ios-switch ${chatSettings.showUserAvatarToRole ? 'is-on' : ''}" data-action="toggle-show-user-avatar-to-role" type="button" aria-label="向角色展示头像"></button>
            </div>
            <div class="msg-settings-avatar-divider"></div>
            <div class="msg-settings-row msg-settings-avatar-switch-row">
              <div class="msg-settings-avatar-switch-copy">
                <div class="msg-settings-card__title">隐藏头像</div>
              </div>
              <button class="msg-ios-switch ${chatSettings.hideAvatars ? 'is-on' : ''}" data-action="toggle-chat-hide-avatars" type="button" aria-label="隐藏头像"></button>
            </div>
            <div class="msg-settings-avatar-divider"></div>
            <div class="msg-settings-remark-row">
              <div class="msg-settings-card__title">备注</div>
              <input
                class="msg-settings-input msg-settings-input--inline"
                data-role="msg-session-remark"
                type="text"
                placeholder="输入当前会话备注（仅本地显示）"
                value="${escapeHtml(session.remark || '')}">
            </div>
          </section>
        </section>

        ${renderAutonomousActivitySettingsSection(chatSettings)}

        <!-- ==================================================================
             [区域标注·已完成·本次更新：聊天控制移出短期记忆]
             说明：
             1. 本区域当前只保留“每轮回复气泡数量 / 自定义思维链 / 当前指令 / 查看控制台日志”同一“聊天控制”板块。
             2. “短期记忆”已按本次要求移入下方“记忆设置”板块，并由 chat-memory-settings.js 独立渲染，方便后续单独修改。
             3. 外层布局参考“头像与备注”：左上角标题 + 暖色设置卡片 + 行分割线。
             4. “每轮回复气泡数量 / 自定义思维链 / 当前指令”使用右侧 IconPark 风格 “>” 折叠按钮，并向下抽屉式展开原输入内容。
             5. “查看控制台日志”保留原 data-action="toggle-chat-console" 与 chatConsoleEnabled 逻辑，仅保留在本板块内。
             6. 板块内已移除说明性文字；原 data-role / data-action 保持不变，不改变既有保存与控制逻辑。
             7. 本区域不读写 localStorage/sessionStorage，不写双份兜底；持久化仍由既有事件逻辑写入 DB.js / IndexedDB。
             ================================================================== -->
        <section class="msg-settings-chat-control-section">
          <div class="msg-settings-section-title">聊天控制</div>
          <section class="msg-settings-card msg-settings-chat-control-card">
            <div class="msg-settings-chat-control-item">
              <button
                class="msg-settings-row msg-settings-chat-control-toggle"
                data-action="toggle-settings-sticker-drawer"
                type="button"
                aria-label="展开每轮回复气泡数量"
                aria-expanded="false">
                <span class="msg-settings-card__title">每轮回复气泡数量</span>
                <span class="msg-settings-chat-control-arrow" aria-hidden="true">
                  <svg viewBox="0 0 48 48" fill="none">
                    <path d="M19 12l12 12-12 12" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </span>
              </button>
              <div class="msg-settings-chat-control-drawer" data-role="settings-reply-bubble-drawer">
                <div class="msg-settings-chat-control-drawer__inner">
                  <div class="msg-settings-number-grid">
                    <label class="msg-settings-number-field">
                      <span>最低</span>
                      <input class="msg-settings-number-input" data-role="msg-reply-bubble-min" type="number" min="1" step="1" value="${escapeHtml(chatSettings.replyBubbleMin || 1)}">
                    </label>
                    <label class="msg-settings-number-field">
                      <span>最高</span>
                      <input class="msg-settings-number-input" data-role="msg-reply-bubble-max" type="number" min="1" step="1" value="${escapeHtml(chatSettings.replyBubbleMax || 3)}">
                    </label>
                  </div>
                </div>
              </div>
            </div>
            <div class="msg-settings-avatar-divider"></div>
            <div class="msg-settings-chat-control-item">
              <button
                class="msg-settings-row msg-settings-chat-control-toggle"
                data-action="toggle-settings-sticker-drawer"
                type="button"
                aria-label="展开自定义思维链"
                aria-expanded="false">
                <span class="msg-settings-card__title">自定义思维链</span>
                <span class="msg-settings-chat-control-arrow" aria-hidden="true">
                  <svg viewBox="0 0 48 48" fill="none">
                    <path d="M19 12l12 12-12 12" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </span>
              </button>
              <div class="msg-settings-chat-control-drawer" data-role="settings-custom-thinking-drawer">
                <div class="msg-settings-chat-control-drawer__inner">
                  <textarea class="msg-settings-textarea" data-role="msg-custom-thinking" placeholder="【静默审查】输出前先在后台核对角色卡事实、已知细节、情感事实和消息格式；最终只输出符合通用消息协议的可见回复，禁止输出 <think>、审查步骤或幕后说明。">${escapeHtml(chatSettings.customThinkingInstruction || '')}</textarea>
                </div>
              </div>
            </div>
            <div class="msg-settings-avatar-divider"></div>
            <div class="msg-settings-chat-control-item">
              <button
                class="msg-settings-row msg-settings-chat-control-toggle"
                data-action="toggle-settings-sticker-drawer"
                type="button"
                aria-label="展开当前指令"
                aria-expanded="false">
                <span class="msg-settings-card__title">当前指令</span>
                <span class="msg-settings-chat-control-arrow" aria-hidden="true">
                  <svg viewBox="0 0 48 48" fill="none">
                    <path d="M19 12l12 12-12 12" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </span>
              </button>
              <div class="msg-settings-chat-control-drawer" data-role="settings-current-command-drawer">
                <div class="msg-settings-chat-control-drawer__inner">
                  <textarea class="msg-settings-textarea" data-role="msg-current-command" placeholder="输入仅对下一次/当前状态生效的临时指令">${escapeHtml(chatSettings.currentCommand || '')}</textarea>
                </div>
              </div>
            </div>
            <div class="msg-settings-avatar-divider"></div>
            <div class="msg-settings-row msg-settings-chat-control-console-row">
              <div class="msg-settings-card__title">查看控制台日志</div>
              <button class="msg-ios-switch ${chatConsoleEnabled ? 'is-on' : ''}" data-action="toggle-chat-console" type="button" aria-label="查看控制台日志"></button>
            </div>
          </section>
        </section>

        ${renderChatMemorySettingsSection(chatSettings)}

        <!-- ==================================================================
             [区域标注·已完成·外部注入独立板块]
             说明：
             1. 本区域已按要求将“外部应用消息注入”单列为“外部注入”板块。
             2. 外层布局参考“自主活动”：左上角标题 + 暖色设置卡片 + 右侧 iPhone 风格滑动开关。
             3. 板块内已移除说明性文字，仅保留设置项标题与原有开关。
             4. 保持原 data-action="toggle-external-context" 与 chatSettings.externalContextEnabled 逻辑不变。
             5. 本区域不读写 localStorage/sessionStorage；持久化仍由原事件逻辑写入 DB.js / IndexedDB。
             ================================================================== -->
        <section class="msg-settings-avatar-section">
          <div class="msg-settings-section-title">外部注入</div>
          <section class="msg-settings-card msg-settings-avatar-card">
            <div class="msg-settings-row msg-settings-avatar-switch-row">
              <div class="msg-settings-card__title">外部应用消息注入</div>
              <button class="msg-ios-switch ${chatSettings.externalContextEnabled ? 'is-on' : ''}" data-action="toggle-external-context" type="button" aria-label="外部应用消息注入"></button>
            </div>
          </section>
        </section>

        <!-- ==================================================================
             [区域标注·已完成·时间设定独立板块]
             说明：
             1. 本区域已按要求将原“时间感知”单列为“时间设定”板块。
             2. 外层布局参考“自主活动/头像与备注”：左上角标题 + 暖色设置卡片 + 右侧 iPhone 风格滑动开关。
             3. 板块内已移除说明性文字，仅保留设置项标题与原有开关。
             4. 保持原 data-action="toggle-time-awareness" 与 chatSettings.timeAwarenessEnabled 逻辑不变。
             5. 本区域不读写 localStorage/sessionStorage；持久化仍由原事件逻辑写入 DB.js / IndexedDB。
             ================================================================== -->
        <section class="msg-settings-avatar-section">
          <div class="msg-settings-section-title">时间设定</div>
          <section class="msg-settings-card msg-settings-avatar-card">
            <div class="msg-settings-row msg-settings-avatar-switch-row">
              <div class="msg-settings-card__title">时间感知</div>
              <button class="msg-ios-switch ${chatSettings.timeAwarenessEnabled ? 'is-on' : ''}" data-action="toggle-time-awareness" type="button" aria-label="时间感知"></button>
            </div>
          </section>
        </section>

        <!-- ==================================================================
             [区域标注·已完成·功能玩法合并板块] HTML卡片开关 + 拍一拍 + 表情包挂载抽屉
             说明：
             1. 本区域已按本次要求把“HTML卡片”“拍一拍”和“表情包挂载”合并到同一“功能玩法”板块。
             2. “拍一拍”设置区已按本次修改移除发送按钮，只填写消息气泡功能栏“拍拍”共用的部位/文案。
             3. “拍拍”触发后的 user_pat_system 消息由 chat-user-pat.js 通过 currentMessages 与 DB.js / IndexedDB 保存，不使用 localStorage/sessionStorage，不写双份兜底。
             4. “HTML卡片”继续使用原 data-action="toggle-html-card"，持久化仍由 index.js 写入 DB.js / IndexedDB。
             5. “表情包挂载”继续使用原 data-action="toggle-mounted-sticker-group" 与分组 id，不改变挂载逻辑。
             6. 拍一拍与表情包列表均通过右侧 IconPark 风格 “>” 折叠按钮抽屉式展开；板块内不使用原生弹窗或原生选择器。
             ================================================================== -->
        <section class="msg-settings-feature-play-section">
          <div class="msg-settings-section-title">功能玩法</div>
          <section class="msg-settings-card msg-settings-feature-play-card">
            <div class="msg-settings-row msg-settings-avatar-switch-row">
              <div class="msg-settings-card__title">HTML卡片</div>
              <button class="msg-ios-switch ${chatSettings.htmlCardEnabled ? 'is-on' : ''}" data-action="toggle-html-card" type="button" aria-label="HTML卡片"></button>
            </div>
            <div class="msg-settings-avatar-divider"></div>
            ${renderUserPatSettingsSection(roleDisplayName, chatSettings.userPatTargetText || '')}
            <div class="msg-settings-avatar-divider"></div>
            <div class="msg-settings-feature-play-sticker">
              <button
                class="msg-settings-row msg-settings-feature-play-sticker-toggle"
                data-action="toggle-settings-sticker-drawer"
                type="button"
                aria-label="展开表情包挂载"
                aria-expanded="false">
                <span class="msg-settings-card__title">表情包挂载</span>
                <span class="msg-settings-feature-play-arrow" aria-hidden="true">
                  <svg viewBox="0 0 48 48" fill="none">
                    <path d="M19 12l12 12-12 12" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </span>
              </button>
              <div class="msg-settings-feature-play-drawer" data-role="settings-sticker-drawer">
                <div class="msg-settings-feature-play-drawer__inner">
                  <div class="msg-settings-sticker-groups">
                    ${stickerGroups.length
                      ? stickerGroups.map(group => `
                          <button class="msg-settings-sticker-group-btn ${mountedStickerGroupIds.includes(group.id) ? 'is-active' : ''}"
                                  data-action="toggle-mounted-sticker-group"
                                  data-sticker-group-id="${escapeHtml(group.id)}"
                                  type="button">
                            ${escapeHtml(group.name)}
                          </button>
                        `).join('')
                      : `<div class="msg-settings-sticker-empty">暂无可挂载的表情包分组</div>`}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </section>

        <!-- ==========================================================================
             [区域标注·已完成·双语模式设置布局] 双语模式板块
             说明：
             1. 本板块由 chat-translation.js 的 renderTranslationSettingsHtml() 生成，已从原“语言翻译”折叠栏改为“双语模式”统一板块。
             2. 板块布局参考“自主活动”：左上角标题 + 暖色设置卡片 + 右侧 iPhone 风格滑动开关。
             3. 原“>”折叠按钮已移除；点击右侧滑动开关后，原有翻译配置内容向下抽屉式展开/收起。
             4. 翻译设置仍独立存储于 IndexedDB，键名 chat_translation_settings::*；不新增 localStorage/sessionStorage 逻辑。
             ========================================================================== -->
        ${renderTranslationSettingsHtml(options.translationSettings, session, options.userProfile?.avatar, options.userProfile?.nickname)}

        <!-- ==================================================================
             [区域标注·已完成·聊天消息合并板块]
             说明：
             1. 本区域已按本次要求将原“聊天记录导入导出”和底部“清理本窗口图片 / 清空聊天消息”合并为同一个“聊天消息”板块。
             2. 板块固定保留在聊天设置页最下方，结构参考“聊天控制”：左上角标题 + 暖色卡片 + 行分割线 + 右侧 IconPark 风格 “>” 按钮。
             3. 板块内仅列出“导出聊天记录 / 导入聊天记录 / 清理本窗口图片 / 清空聊天消息”四个入口，已移除说明性文字和原有图标。
             4. 四个入口保留原 data-action，不改变导出、导入、清理图片、清空消息的既有逻辑。
             5. 导入 JSON 继续复用隐藏 input；读取、校验和持久化仍由既有逻辑通过 DB.js / IndexedDB 完成。
             6. 本区域不读写 localStorage/sessionStorage，不写双份兜底，不使用原生浏览器弹窗。
             ================================================================== -->
        <section class="msg-settings-chat-message-section">
          <div class="msg-settings-section-title">聊天消息</div>
          <section class="msg-settings-card msg-settings-chat-message-card">
            <button class="msg-settings-row msg-settings-chat-message-action" data-action="open-chat-export-modal" type="button" aria-label="导出聊天记录">
              <span class="msg-settings-card__title">导出聊天记录</span>
              <span class="msg-settings-chat-message-arrow" aria-hidden="true">
                <svg viewBox="0 0 48 48" fill="none">
                  <path d="M19 12l12 12-12 12" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </span>
            </button>
            <div class="msg-settings-avatar-divider"></div>
            <button class="msg-settings-row msg-settings-chat-message-action" data-action="open-chat-import-json-picker" type="button" aria-label="导入聊天记录">
              <span class="msg-settings-card__title">导入聊天记录</span>
              <span class="msg-settings-chat-message-arrow" aria-hidden="true">
                <svg viewBox="0 0 48 48" fill="none">
                  <path d="M19 12l12 12-12 12" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </span>
            </button>
            <div class="msg-settings-avatar-divider"></div>
            <button class="msg-settings-row msg-settings-chat-message-action" data-action="open-clear-current-chat-images-modal" type="button" aria-label="清理本窗口图片">
              <span class="msg-settings-card__title">清理本窗口图片</span>
              <span class="msg-settings-chat-message-arrow" aria-hidden="true">
                <svg viewBox="0 0 48 48" fill="none">
                  <path d="M19 12l12 12-12 12" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </span>
            </button>
            <div class="msg-settings-avatar-divider"></div>
            <button class="msg-settings-row msg-settings-chat-message-action msg-settings-chat-message-action--danger" data-action="open-clear-all-messages-modal" type="button" aria-label="清空聊天消息">
              <span class="msg-settings-card__title">清空聊天消息</span>
              <span class="msg-settings-chat-message-arrow" aria-hidden="true">
                <svg viewBox="0 0 48 48" fill="none">
                  <path d="M19 12l12 12-12 12" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </span>
            </button>
            <input data-role="chat-import-json-file-input" type="file" accept="application/json,.json" hidden>
          </section>
        </section>
      </div>
    </div>
  `;
}
