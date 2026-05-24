/**
 * ==========================================================================
 * [区域标注·已完成·梦笺主页]
 * 说明：
 * 1. 已完成：主页只显示头像 + 姓名身份卡，不再在卡片下方陈列全部面具。
 * 2. 已完成：点击身份卡后使用梦笺应用内弹窗切换用户面具身份。
 * 3. 已完成：移除“主页身份”标题图标、“梦笺会使用……”说明文字与“可行性方案”区域。
 * 4. 选择结果只写入梦笺 textgame 记录，不修改闲谈/档案当前面具；持久化统一走 DB.js / IndexedDB。
 * ==========================================================================
 */

import { Icons, escapeHtml, showModal } from './textgame-ui.js';
import { getTextGameSettings, setTextGameActiveMask, setGlobalTravelPrompt } from './textgame-store.js';
import { loadArchiveProfilesForTextGame } from './textgame-bridge.js';

export class TextGameHome {
  constructor(container) {
    this.container = container;
    this.masks = [];
    this.activeMaskId = '';
    this.globalTravelPrompt = '';
  }

  async render() {
    const settings = await getTextGameSettings();
    const profiles = await loadArchiveProfilesForTextGame();

    this.masks = profiles.masks || [];
    this.activeMaskId = settings.activeMaskId || this.masks[0]?.id || '';
    this.globalTravelPrompt = settings.globalTravelPrompt || '';
    
    if (this.activeMaskId && settings.activeMaskId !== this.activeMaskId) {
      await setTextGameActiveMask(this.activeMaskId);
    }

    const activeMask = this.masks.find((mask) => mask.id === this.activeMaskId) || this.masks[0] || null;

    this.container.innerHTML = `
      <div class="textgame-home-panel">
        ${this.renderHomeAvatar(activeMask)}
        
        <!-- [区域标注·已完成·梦笺全局穿越指令词] -->
        <button class="textgame-home-prompt-bar" data-action="open-prompt-modal">
          <div class="textgame-home-prompt-left">
            <span class="textgame-home-prompt-icon">${Icons.magic}</span>
            <div class="textgame-home-prompt-text">
              <span class="textgame-home-prompt-title">穿越指令词</span>
              <span class="textgame-home-prompt-desc">${this.globalTravelPrompt ? escapeHtml(this.globalTravelPrompt).substring(0, 12) + (this.globalTravelPrompt.length > 12 ? '...' : '') : '设置全局剧情偏好'}</span>
            </div>
          </div>
          <span class="textgame-home-prompt-arrow">${Icons.next}</span>
        </button>
      </div>
    `;

    this.bindEvents();
  }

  /* ==========================================================================
     [区域标注·已完成·梦笺主页头像身份卡]
     说明：
     1. 主页仅显示当前面具头像与姓名，作为梦笺内的身份入口。
     2. 点击身份卡后打开梦笺应用内弹窗切换面具，不在卡片下方陈列全部面具。
     3. 原“主页身份”标题图标、说明文字与“可行性方案”区域已移除，避免误认为尚未修改。
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
      <button class="textgame-home-avatar-card" data-action="open-mask-modal" title="切换用户面具身份">
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
    this.container.querySelector('[data-action="open-mask-modal"]')?.addEventListener('click', () => {
      this.openMaskModal();
    });
    this.container.querySelector('[data-action="open-prompt-modal"]')?.addEventListener('click', () => {
      this.openPromptModal();
    });
  }

  /* ==========================================================================
     [区域标注·已完成·梦笺主页全局穿越指令词弹窗]
     说明：
     1. 用于设置全局的穿越指令，如文笔偏好、细节描写控制。
     2. 不使用原生 prompt 弹窗，使用梦笺统一 UI 样式，点击外部可关闭。
     ========================================================================== */
  openPromptModal() {
    const existing = document.querySelector('.textgame-prompt-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'textgame-modal-overlay textgame-prompt-modal-overlay active';
    overlay.innerHTML = `
      <div class="textgame-modal-container textgame-prompt-modal-container">
        <div class="textgame-prompt-modal-head">
          <div class="textgame-prompt-modal-title">${Icons.magic}<span>穿越指令词</span></div>
          <button class="textgame-prompt-modal-close" data-action="close-prompt-modal" title="关闭">${Icons.back}</button>
        </div>
        <div class="textgame-prompt-modal-body">
          <div class="textgame-prompt-modal-desc">
            此指令将作用于所有面具身份的穿越剧情生成，可用于控制文笔偏好、细节描写等。
          </div>
          <textarea class="textgame-prompt-modal-textarea" data-role="global-prompt-input" placeholder="例如：多一些对话描写，少一些景色描写...">${escapeHtml(this.globalTravelPrompt)}</textarea>
          <button class="textgame-prompt-modal-save" data-action="save-prompt">${Icons.check}<span>保存配置</span></button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const close = () => {
      overlay.classList.remove('active');
      setTimeout(() => overlay.remove(), 240);
    };

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close();
    });
    overlay.querySelector('.textgame-prompt-modal-container')?.addEventListener('click', (e) => e.stopPropagation());

    overlay.querySelector('[data-action="close-prompt-modal"]')?.addEventListener('click', close);
    overlay.querySelector('[data-action="save-prompt"]')?.addEventListener('click', async () => {
      const input = overlay.querySelector('[data-role="global-prompt-input"]');
      const val = input ? input.value.trim() : '';
      this.globalTravelPrompt = val;
      await setGlobalTravelPrompt(val);
      close();
      showModal({
        title: '保存成功',
        content: '全局穿越指令词已更新。'
      });
    });
  }

  /* ==========================================================================
     [区域标注·已完成·梦笺主页身份切换弹窗]
     说明：
     1. 点击主页身份卡后弹出面具切换面板，不在主页直接陈列全部身份。
     2. 弹窗使用梦笺自定义 UI，不使用浏览器原生弹窗或原生选择器。
     3. 切换结果只写入梦笺 IndexedDB 设置，不改动闲谈/档案当前面具。
     ========================================================================== */
  openMaskModal() {
    const existing = document.querySelector('.textgame-mask-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'textgame-modal-overlay textgame-mask-modal-overlay';
    overlay.innerHTML = `
      <div class="textgame-modal-container textgame-mask-modal-container">
        <div class="textgame-mask-modal-head">
          <div class="textgame-mask-modal-title">${Icons.user}<span>切换用户面具身份</span></div>
          <button class="textgame-mask-modal-close" data-action="close-mask-modal" title="关闭">${Icons.back}</button>
        </div>
        <div class="textgame-mask-modal-list">
          ${this.renderMaskCards()}
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('active'));

    overlay.querySelector('[data-action="close-mask-modal"]')?.addEventListener('click', () => {
      this.closeMaskModal(overlay);
    });

    overlay.querySelectorAll('.textgame-mask-card').forEach((button) => {
      button.addEventListener('click', async () => {
        const maskId = button.dataset.maskId || '';
        this.activeMaskId = maskId;
        await setTextGameActiveMask(maskId);
        this.closeMaskModal(overlay);
        await this.render();
        showModal({
          title: '身份已切换',
          content: '梦笺主页身份已更新。'
        });
      });
    });
  }

  closeMaskModal(overlay = document.querySelector('.textgame-mask-modal-overlay')) {
    if (!overlay) return;
    overlay.classList.remove('active');
    setTimeout(() => overlay.remove(), 240);
  }
}
