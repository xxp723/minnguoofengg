/**
 * ==========================================================================
 * [区域标注·已完成·梦笺存档页面]
 * 说明：
 * 1. 展示 TXT 阅读器生成的穿书文游存档。
 * 2. 已完成：存档主页面按梦笺当前用户面具身份隔离展示，切换面具后不串档。
 * 3. 存档只来自梦笺 textgame-store.js → DB.js / IndexedDB；删除存档使用应用内自定义弹窗。
 * ==========================================================================
 */

import { Icons, escapeHtml, showModal } from './textgame-ui.js';
import { getTextGameSettings, getStoryRunsByMask, deleteStoryRun } from './textgame-store.js';

export class TextGameArchive {
  constructor(container) {
    this.container = container;
    this.runs = [];
  }

  async render() {
    /* ==========================================================================
       [区域标注·已完成·梦笺穿书存档身份隔离]
       说明：
       1. 存档主页面只展示当前梦笺用户面具身份保存的穿书存档。
       2. 切换其它用户面具身份后不显示旧身份的存档；不使用浏览器存储兜底。
       ========================================================================== */
    const settings = await getTextGameSettings();
    this.runs = settings.activeMaskId ? await getStoryRunsByMask(settings.activeMaskId) : [];

    if (!settings.activeMaskId) {
      this.container.innerHTML = `
        <div class="textgame-empty-state">
          ${Icons.user}
          <p>请先在梦笺主页选择用户面具身份<br>穿书存档会按身份隔离显示</p>
        </div>
      `;
      return;
    }

    if (!this.runs.length) {
      this.container.innerHTML = `
        <div class="textgame-empty-state">
          ${Icons.archive}
          <p>当前身份的存档夹空空如也<br>在阅读器底栏点击“存档”可保存穿书存档</p>
        </div>
      `;
      return;
    }

    this.container.innerHTML = `
      <div class="textgame-archive-list">
        ${this.runs.map((run) => this.renderRunCard(run)).join('')}
      </div>
    `;

    this.bindEvents();
  }

  renderRunCard(run) {
    const route = run.plotMode === 'canon' ? '走原著' : '改写线';
    const travel = run.travelMode === 'soul' ? '魂穿' : '身穿';
    const companionName = run?.companion?.name || '暂无同行者';

    return `
      <article class="textgame-archive-card" data-run-id="${escapeHtml(run.id)}">
        <div class="textgame-archive-card-head">
          <div>
            <h3>${escapeHtml(run.bookName || '未命名小说')}</h3>
            <p>${escapeHtml(run.chapterTitle || '故事点')}</p>
          </div>
          <button class="textgame-archive-delete" data-action="delete-run" data-run-id="${escapeHtml(run.id)}">${Icons.delete}</button>
        </div>
        <div class="textgame-archive-tags">
          <span>${escapeHtml(route)}</span>
          <span>${escapeHtml(travel)}</span>
          <span>${escapeHtml(companionName)}</span>
        </div>
        <div class="textgame-archive-snippet">${escapeHtml(run.storyPoint || '').slice(0, 160)}${String(run.storyPoint || '').length > 160 ? '…' : ''}</div>
        ${run.customChoice ? `<div class="textgame-archive-choice">${Icons.edit}<span>${escapeHtml(run.customChoice)}</span></div>` : ''}
      </article>
    `;
  }

  bindEvents() {
    this.container.querySelectorAll('[data-action="delete-run"]').forEach((button) => {
      button.addEventListener('click', () => {
        const runId = button.dataset.runId || '';
        const run = this.runs.find((item) => item.id === runId);
        if (!run) return;

        showModal({
          title: '删除存档',
          content: `确定删除《${escapeHtml(run.bookName || '未命名小说')}》的这个穿书存档吗？`,
          showCancel: true,
          confirmText: '删除',
          cancelText: '取消',
          onConfirm: async () => {
            await deleteStoryRun(runId);
            await this.render();
          }
        });
      });
    });
  }
}
