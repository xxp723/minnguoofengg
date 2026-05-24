/**
 * ==========================================================================
 * [区域标注·已完成·梦笺主页]
 * 说明：
 * 1. 主页用于梦笺独立选择“穿书时的用户面具身份”。
 * 2. 选择结果只写入梦笺 textgame 记录，不修改闲谈/档案当前面具。
 * 3. 所有持久化统一走 textgame-store.js → DB.js / IndexedDB。
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

    this.container.innerHTML = `
      <div class="textgame-home-panel">
        <div class="textgame-section-title">
          ${Icons.user}
          <span>穿书身份</span>
        </div>
        <div class="textgame-home-desc">
          梦笺会使用这里独立选择的面具作为“你”进入小说，不会影响闲谈当前用户主页面具。
        </div>
        <div class="textgame-mask-list">
          ${this.renderMaskCards()}
        </div>
        <div class="textgame-plan-card">
          <div class="textgame-plan-title">${Icons.magic}<span>可行性方案</span></div>
          <ol>
            <li>导入 TXT 小说后，梦笺按章节/片段切分文本，并保存阅读进度。</li>
            <li>在阅读器中选择故事点、穿越方式、原著跟随度与同行联系人。</li>
            <li>同行联系人只从“当前梦笺面具绑定角色 + 已加入闲谈通讯录”的候选中读取。</li>
            <li>生成穿书存档时写入小说片段、用户面具快照、同行角色必要设定与旧事记忆摘要。</li>
            <li>文游选项支持系统建议选项与用户自定义输入，可选择走原著或改写剧情。</li>
          </ol>
        </div>
      </div>
    `;

    this.bindEvents();
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
          <b>${escapeHtml(mask.name)}</b>
          <em>${escapeHtml(mask.identity || mask.signature || '未填写身份说明')}</em>
        </span>
        <span class="textgame-mask-check">${mask.id === this.activeMaskId ? Icons.check : ''}</span>
      </button>
    `).join('');
  }

  bindEvents() {
    this.container.querySelectorAll('.textgame-mask-card').forEach((button) => {
      button.addEventListener('click', async () => {
        const maskId = button.dataset.maskId || '';
        this.activeMaskId = maskId;
        await setTextGameActiveMask(maskId);
        await this.render();
        showModal({
          title: '身份已切换',
          content: '梦笺穿书身份已更新。这个选择不会同步修改闲谈或档案应用的当前面具。'
        });
      });
    });
  }
}
