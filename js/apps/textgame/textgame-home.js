/**
 * ==========================================================================
 * [区域标注·已完成·梦笺主页]
 * 说明：
 * 1. 已完成：主页身份切换改为头像 + 姓名的主页身份卡。
 * 2. 已完成：移除“梦笺会使用……”说明文字与“可行性方案”区域。
 * 3. 选择结果只写入梦笺 textgame 记录，不修改闲谈/档案当前面具；持久化统一走 DB.js / IndexedDB。
 * ==========================================================================
 */

import { Icons, escapeHtml, showModal } from './textgame-ui.js';
import { getTextGameSettings, setTextGameActiveMask } from './textgame-store.js';
import { loadArchiveProfilesForTextGame } from './textgame-bridge.js';

export class TextGameHome {
  constructor(container) {
    this.container = container;
    this.masks = [];
    this.activeMaskId = '';
  }

  async render() {
    const settings = await getTextGameSettings();
    const profiles = await loadArchiveProfilesForTextGame();

    this.masks = profiles.masks || [];
    this.activeMaskId = settings.activeMaskId || this.masks[0]?.id || '';
    if (this.activeMaskId && settings.activeMaskId !== this.activeMaskId) {
      await setTextGameActiveMask(this.activeMaskId);
    }

    const activeMask = this.masks.find((mask) => mask.id === this.activeMaskId) || this.masks[0] || null;

    this.container.innerHTML = `
      <div class="textgame-home-panel">
        <div class="textgame-section-title">
          ${Icons.user}
          <span>主页身份</span>
        </div>
        ${this.renderHomeAvatar(activeMask)}
        <div class="textgame-mask-list">
          ${this.renderMaskCards()}
        </div>
      </div>
    `;

    this.bindEvents();
  }

  /* ==========================================================================
     [区域标注·已完成·梦笺主页头像身份卡]
     说明：
     1. 主页仅显示当前面具头像与姓名，作为梦笺内的身份入口。
     2. 下方候选面具用于切换身份；结果只保存到梦笺 IndexedDB 设置。
     3. 原说明文字与“可行性方案”区域已移除，避免误认为尚未修改。
     ========================================================================== */
  renderHomeAvatar(mask) {
    if (!mask) {
      return `
        <div class="textgame-home-avatar-card empty">
          <span class="textgame-home-avatar-main">${Icons.user}</span>
          <strong>未选择身份</strong>
        </div>
      `;
    }

    return `
      <button class="textgame-home-avatar-card" data-mask-id="${escapeHtml(mask.id)}" title="当前主页身份">
        <span class="textgame-home-avatar-main">
          ${mask.avatar ? `<img src="${escapeHtml(mask.avatar)}" alt="">` : Icons.user}
        </span>
        <strong>${escapeHtml(mask.name || '未命名面具')}</strong>
      </button>
    `;
  }

  renderMaskCards() {
    if (!this.masks.length) {
      return `
        <div class="textgame-empty-mini">
          ${Icons.user}
          <span>档案中还没有可用面具。请先到档案应用创建用户面具。</span>
        </div>
      `;
    }

    return this.masks.map((mask) => `
      <button class="textgame-mask-card ${mask.id === this.activeMaskId ? 'active' : ''}" data-mask-id="${escapeHtml(mask.id)}">
        <span class="textgame-mask-avatar">
          ${mask.avatar ? `<img src="${escapeHtml(mask.avatar)}" alt="">` : Icons.user}
        </span>
        <span class="textgame-mask-main">
          <b>${escapeHtml(mask.name || '未命名面具')}</b>
        </span>
        <span class="textgame-mask-check">${mask.id === this.activeMaskId ? Icons.check : ''}</span>
      </button>
    `).join('');
  }

  bindEvents() {
    this.container.querySelectorAll('.textgame-mask-card, .textgame-home-avatar-card[data-mask-id]').forEach((button) => {
      button.addEventListener('click', async () => {
        const maskId = button.dataset.maskId || '';
        this.activeMaskId = maskId;
        await setTextGameActiveMask(maskId);
        await this.render();
        showModal({
          title: '身份已切换',
          content: '梦笺主页身份已更新。'
        });
      });
    });
  }
}
