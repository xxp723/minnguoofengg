/**
 * ==========================================================================
 * [区域标注·已完成·梦笺 TXT 阅读器与穿书文游]
 * 说明：
 * 1. 支持 TXT 小说阅读、章节切分、阅读进度保存。
 * 2. 已完成：点击“从此处穿书”后以梦笺应用内弹窗展示穿书配置，不再滑到页面底部面板。
 * 3. 穿书存档只写入梦笺自身 textgame 记录；只读联动档案/闲谈/旧事。
 * 4. 不使用 localStorage/sessionStorage，不使用浏览器原生弹窗或原生选择器。
 * ==========================================================================
 */

import { Icons, escapeHtml, showModal } from './textgame-ui.js';
import { updateBookProgress, saveStoryRun, getTextGameSettings } from './textgame-store.js';
import {
  loadArchiveProfilesForTextGame,
  loadCompanionCandidatesForTextGame,
  loadCompanionMemoryForTextGame
} from './textgame-bridge.js';

function splitChapters(content) {
  const text = String(content || '').replace(/\r\n/g, '\n');
  const matches = [...text.matchAll(/(^|\n)(第[一二三四五六七八九十百千万0-9０-９]+[章节回卷部].*)/g)];
  if (!matches.length) {
    return [{ title: '正文', content: text.trim() || '（空白章节）', start: 0 }];
  }

  return matches.map((match, index) => {
    const titleStart = match.index + (match[1] ? match[1].length : 0);
    const nextStart = matches[index + 1]?.index ?? text.length;
    const title = match[2].trim();
    return {
      title,
      start: titleStart,
      content: text.slice(titleStart, nextStart).trim() || title
    };
  });
}

function makeSnippet(text, max = 900) {
  const safe = String(text || '').replace(/\s+/g, ' ').trim();
  return safe.length > max ? `${safe.slice(0, max)}…` : safe;
}

export class TextGameReader {
  constructor(container, book, { onBack } = {}) {
    this.container = container;
    this.book = book;
    this.onBack = onBack;
    this.chapters = splitChapters(book?.content || '');
    this.chapterIndex = Math.min(Math.max(Number(book?.currentChapterIndex || 0), 0), Math.max(this.chapters.length - 1, 0));
    this.selectedTravelMode = 'soul';
    this.selectedPlotMode = 'canon';
    this.selectedCompanionId = '';
    this.companions = [];
    this.activeMask = null;
    this.customChoice = '';
    this.readerControlsVisible = false;
  }

  async render() {
    await this.loadBridgeData();

    const chapter = this.chapters[this.chapterIndex] || this.chapters[0];
    this.container.innerHTML = `
      <!-- [区域标注·已完成·梦笺沉浸式阅读页] 默认隐藏顶栏/底栏，点击正文中心显示，点击非栏区域隐藏。 -->
      <div class="textgame-reader ${this.readerControlsVisible ? 'controls-visible' : ''}" data-role="reader-shell">
        <div class="textgame-reader-toolbar" data-role="reader-topbar">
          <button class="textgame-reader-back" data-action="back" aria-label="返回书架">${Icons.back}</button>
        </div>

        <article class="textgame-reader-paper" data-role="reader-paper">
          <div class="textgame-reader-body">${escapeHtml(chapter.content || '').replace(/\n/g, '<br>')}</div>
        </article>

        <div class="textgame-reader-actions" data-role="reader-bottombar">
          <button class="textgame-pill-btn" data-action="prev">${Icons.back}<span>上一章</span></button>
          <button class="textgame-pill-btn primary" data-action="travel">${Icons.magic}<span>从此处穿书</span></button>
          <button class="textgame-pill-btn" data-action="next"><span>下一章</span>${Icons.play}</button>
        </div>
      </div>
    `;

    this.bindEvents();
    await this.persistProgress();
  }

  async loadBridgeData() {
    const settings = await getTextGameSettings();
    const profiles = await loadArchiveProfilesForTextGame();
    this.activeMask = profiles.masks.find((mask) => mask.id === settings.activeMaskId) || profiles.masks[0] || null;
    this.companions = this.activeMask ? await loadCompanionCandidatesForTextGame(this.activeMask.id) : [];
    if (!this.selectedCompanionId && this.companions[0]) this.selectedCompanionId = this.companions[0].id;
  }

  renderTravelPanel() {
    const modeButtons = [
      ['soul', '魂穿', '使用原角色身体与身份展开剧情'],
      ['body', '身穿', '以当前面具本体进入小说世界']
    ];

    const plotButtons = [
      ['canon', '走原著', '尽量沿原著关键事件推进'],
      ['branch', '改写线', '允许偏离原著并生成新分支']
    ];

    return `
      <div class="textgame-section-title">${Icons.magic}<span>穿书配置</span></div>
      <div class="textgame-config-block">
        <div class="textgame-config-label">穿越方式</div>
        <div class="textgame-choice-row">
          ${modeButtons.map(([id, title, desc]) => `
            <button class="textgame-choice-card ${this.selectedTravelMode === id ? 'active' : ''}" data-choice-group="travel" data-choice-id="${id}">
              <b>${title}</b><em>${desc}</em>
            </button>
          `).join('')}
        </div>
      </div>

      <div class="textgame-config-block">
        <div class="textgame-config-label">剧情路线</div>
        <div class="textgame-choice-row">
          ${plotButtons.map(([id, title, desc]) => `
            <button class="textgame-choice-card ${this.selectedPlotMode === id ? 'active' : ''}" data-choice-group="plot" data-choice-id="${id}">
              <b>${title}</b><em>${desc}</em>
            </button>
          `).join('')}
        </div>
      </div>

      <div class="textgame-config-block">
        <div class="textgame-config-label">同行联系人</div>
        <div class="textgame-companion-list">
          ${this.renderCompanionList()}
        </div>
      </div>

      <div class="textgame-config-block">
        <div class="textgame-config-label">文游行动选项</div>
        <div class="textgame-option-grid">
          <button class="textgame-option-chip" data-option="观察原著情节走向">观察原著情节走向</button>
          <button class="textgame-option-chip" data-option="主动接近关键人物">主动接近关键人物</button>
          <button class="textgame-option-chip" data-option="先隐藏身份收集线索">先隐藏身份收集线索</button>
        </div>
        <textarea class="textgame-custom-choice" data-role="custom-choice" placeholder="也可以输入自定义选项，例如：我想立刻阻止这一幕发生。">${escapeHtml(this.customChoice)}</textarea>
      </div>

      <button class="textgame-start-run-btn" data-action="start-run">${Icons.check}<span>生成穿书存档</span></button>
    `;
  }

  renderCompanionList() {
    if (!this.activeMask) {
      return `<div class="textgame-empty-mini">${Icons.user}<span>请先在梦笺主页选择穿书面具。</span></div>`;
    }

    if (!this.companions.length) {
      return `<div class="textgame-empty-mini">${Icons.contact}<span>暂无可同行联系人。需要在档案中把角色绑定到当前面具，并在闲谈通讯录添加该角色联系人。</span></div>`;
    }

    return this.companions.map((item) => `
      <button class="textgame-companion-card ${item.id === this.selectedCompanionId ? 'active' : ''}" data-companion-id="${escapeHtml(item.id)}">
        <span>${Icons.contact}</span>
        <b>${escapeHtml(item.contactName || item.name)}</b>
        <em>${escapeHtml(item.identity || '已加入通讯录')}</em>
      </button>
    `).join('');
  }

  bindEvents() {
    const readerShell = this.container.querySelector('[data-role="reader-shell"]');

    /* ==========================================================================
       [区域标注·已完成·梦笺沉浸式阅读页交互]
       说明：
       1. 点击小说正文/中心区域显示顶栏和底栏；再次点击非顶栏/底栏页面区域时隐藏。
       2. 顶栏/底栏按钮点击不触发显示状态切换，避免返回、翻章、穿书误操作。
       3. 不使用浏览器原生弹窗/选择器，不涉及 localStorage/sessionStorage。
       ========================================================================== */
    readerShell?.addEventListener('click', (event) => {
      if (event.target.closest('[data-role="reader-topbar"], [data-role="reader-bottombar"]')) return;
      this.setReaderControlsVisible(!this.readerControlsVisible);
    });

    this.container.querySelector('[data-action="back"]')?.addEventListener('click', () => this.onBack?.());
    this.container.querySelector('[data-action="prev"]')?.addEventListener('click', async () => {
      if (this.chapterIndex <= 0) return;
      this.chapterIndex -= 1;
      this.readerControlsVisible = false;
      await this.render();
    });
    this.container.querySelector('[data-action="next"]')?.addEventListener('click', async () => {
      if (this.chapterIndex >= this.chapters.length - 1) return;
      this.chapterIndex += 1;
      this.readerControlsVisible = false;
      await this.render();
    });
    this.container.querySelector('[data-action="travel"]')?.addEventListener('click', () => {
      this.openTravelModal();
    });

    this.container.querySelectorAll('[data-choice-group]').forEach((button) => {
      button.addEventListener('click', () => {
        const group = button.dataset.choiceGroup;
        if (group === 'travel') this.selectedTravelMode = button.dataset.choiceId || 'soul';
        if (group === 'plot') this.selectedPlotMode = button.dataset.choiceId || 'canon';
        this.customChoice = this.container.querySelector('[data-role="custom-choice"]')?.value || '';
        this.renderTravelConfigOnly();
      });
    });

    this.container.querySelectorAll('[data-companion-id]').forEach((button) => {
      button.addEventListener('click', () => {
        this.selectedCompanionId = button.dataset.companionId || '';
        this.customChoice = this.container.querySelector('[data-role="custom-choice"]')?.value || '';
        this.renderTravelConfigOnly();
      });
    });

    this.container.querySelectorAll('[data-option]').forEach((button) => {
      button.addEventListener('click', () => {
        const input = this.container.querySelector('[data-role="custom-choice"]');
        if (input) input.value = button.dataset.option || '';
      });
    });

    this.container.querySelector('[data-action="start-run"]')?.addEventListener('click', () => this.startStoryRun());
  }

  setReaderControlsVisible(isVisible) {
    this.readerControlsVisible = Boolean(isVisible);
    this.container.querySelector('[data-role="reader-shell"]')?.classList.toggle('controls-visible', this.readerControlsVisible);
  }

  /* ==========================================================================
     [区域标注·已完成·从此处穿书弹窗]
     说明：
     1. 点击阅读页“从此处穿书”后打开梦笺自定义弹窗，不再滚动到页面底部配置面板。
     2. 弹窗内仍复用 IconPark 图标、选择卡片、联系人卡片和生成存档逻辑。
     3. 不使用浏览器原生弹窗/选择器，不涉及 localStorage/sessionStorage。
     ========================================================================== */
  openTravelModal() {
    const existing = document.querySelector('.textgame-travel-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'textgame-modal-overlay textgame-travel-modal-overlay';
    overlay.innerHTML = `
      <div class="textgame-modal-container textgame-travel-modal-container">
        <div class="textgame-travel-modal-head">
          <div class="textgame-section-title">${Icons.magic}<span>穿书配置</span></div>
          <button class="textgame-travel-modal-close" data-action="close-travel-modal" title="关闭">${Icons.back}</button>
        </div>
        <div class="textgame-travel-panel" data-role="travel-panel">
          ${this.renderTravelPanel()}
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('active'));
    this.bindTravelModalEvents(overlay);
  }

  closeTravelModal(overlay = document.querySelector('.textgame-travel-modal-overlay')) {
    if (!overlay) return;
    overlay.classList.remove('active');
    setTimeout(() => overlay.remove(), 240);
  }

  bindTravelModalEvents(overlay) {
    overlay.querySelector('[data-action="close-travel-modal"]')?.addEventListener('click', () => {
      this.customChoice = overlay.querySelector('[data-role="custom-choice"]')?.value || '';
      this.closeTravelModal(overlay);
    });

    overlay.querySelectorAll('[data-choice-group]').forEach((button) => {
      button.addEventListener('click', () => {
        const group = button.dataset.choiceGroup;
        if (group === 'travel') this.selectedTravelMode = button.dataset.choiceId || 'soul';
        if (group === 'plot') this.selectedPlotMode = button.dataset.choiceId || 'canon';
        this.customChoice = overlay.querySelector('[data-role="custom-choice"]')?.value || '';
        this.renderTravelConfigOnly(overlay);
      });
    });

    overlay.querySelectorAll('[data-companion-id]').forEach((button) => {
      button.addEventListener('click', () => {
        this.selectedCompanionId = button.dataset.companionId || '';
        this.customChoice = overlay.querySelector('[data-role="custom-choice"]')?.value || '';
        this.renderTravelConfigOnly(overlay);
      });
    });

    overlay.querySelectorAll('[data-option]').forEach((button) => {
      button.addEventListener('click', () => {
        const input = overlay.querySelector('[data-role="custom-choice"]');
        if (input) {
          input.value = button.dataset.option || '';
          this.customChoice = input.value;
        }
      });
    });

    overlay.querySelector('[data-action="start-run"]')?.addEventListener('click', async () => {
      this.customChoice = overlay.querySelector('[data-role="custom-choice"]')?.value || '';
      await this.startStoryRun(overlay);
    });
  }

  renderTravelConfigOnly(overlay = document.querySelector('.textgame-travel-modal-overlay')) {
    const panel = overlay?.querySelector('[data-role="travel-panel"]');
    if (!panel) return;
    panel.innerHTML = this.renderTravelPanel();
    this.bindTravelModalEvents(overlay);
  }

  async persistProgress() {
    const progress = this.chapters.length <= 1 ? 1 : this.chapterIndex / (this.chapters.length - 1);
    await updateBookProgress(this.book.id, {
      progress,
      currentChapterIndex: this.chapterIndex
    });
  }

  async startStoryRun(activeOverlay = null) {
    const chapter = this.chapters[this.chapterIndex] || this.chapters[0];
    const companion = this.companions.find((item) => item.id === this.selectedCompanionId) || null;
    const memories = companion ? await loadCompanionMemoryForTextGame(companion.id) : [];
    const input = activeOverlay?.querySelector('[data-role="custom-choice"]') || this.container.querySelector('[data-role="custom-choice"]');
    const customChoice = String(input?.value || '').trim();

    const run = await saveStoryRun({
      bookId: this.book.id,
      bookName: this.book.name,
      chapterIndex: this.chapterIndex,
      chapterTitle: chapter.title,
      storyPoint: makeSnippet(chapter.content),
      travelMode: this.selectedTravelMode,
      plotMode: this.selectedPlotMode,
      customChoice,
      activeMaskSnapshot: this.activeMask ? {
        id: this.activeMask.id,
        name: this.activeMask.name,
        identity: this.activeMask.identity,
        signature: this.activeMask.signature
      } : null,
      companion: companion ? {
        roleId: companion.id,
        name: companion.name,
        identity: companion.identity,
        roleArchive: {
          id: companion.roleArchive.id,
          name: companion.roleArchive.name,
          identity: companion.roleArchive.identity,
          personality: companion.roleArchive.personality,
          background: companion.roleArchive.background,
          prompt: companion.roleArchive.prompt
        },
        memorySummaries: memories
      } : null,
      openingPrompt: this.buildOpeningPrompt(chapter, companion, memories, customChoice)
    });

    this.closeTravelModal(activeOverlay);

    showModal({
      title: '穿书存档已生成',
      content: `
        <div class="textgame-run-created">
          <p>已从《${escapeHtml(this.book.name)}》「${escapeHtml(chapter.title)}」生成文游存档。</p>
          <p>路线：${this.selectedPlotMode === 'canon' ? '走原著' : '改写线'} / ${this.selectedTravelMode === 'soul' ? '魂穿' : '身穿'}</p>
          <p>存档号：${escapeHtml(run.id)}</p>
        </div>
      `
    });
  }

  buildOpeningPrompt(chapter, companion, memories, customChoice) {
    const plotInstruction = this.selectedPlotMode === 'canon'
      ? '优先保持原著关键事件、人物动机和时间线；当用户选择干预时，再产生合理蝴蝶效应。'
      : '允许根据用户行动改写后续剧情，但需要保留小说世界观和人物性格的连续性。';

    const travelInstruction = this.selectedTravelMode === 'soul'
      ? '用户选择魂穿：让用户穿成当前情节中的某个合适人物，以该人物身份、处境和社会关系继续。'
      : '用户选择身穿：让用户以梦笺主页选择的面具本体进入小说现场，并处理身份暴露风险。';

    return [
      `小说：《${this.book.name}》`,
      `章节/故事点：${chapter.title}`,
      `原文片段：${makeSnippet(chapter.content, 1200)}`,
      `穿越方式：${travelInstruction}`,
      `剧情路线：${plotInstruction}`,
      companion ? `同行者：${companion.name}（${companion.identity || '无身份备注'}）` : '同行者：暂无',
      memories.length ? `同行者旧事记忆摘要：${memories.map((item) => item.summary).join('；')}` : '同行者旧事记忆摘要：暂无',
      customChoice ? `用户自定义行动：${customChoice}` : '用户自定义行动：未填写',
      '请以文游方式推进：先叙事，再给出 3 个可选行动，并允许用户自定义输入。'
    ].join('\n');
  }
}
