/**
 * ==========================================================================
 * [区域标注·已完成·梦笺 TXT 阅读器与穿书文游]
 * 说明：
 * 1. 支持 TXT 小说阅读、多格式章节切分、阅读进度保存。
 * 2. 已完成：阅读页顶栏含返回、书名圆角框、右侧竖向更多按钮；更多按钮打开当前小说/当前面具身份的穿书存档抽屉。
 * 3. 已完成：底栏改为方框式控制面板，含阅读进度、上一章/下一章、目录、阅读设置、穿越设置、存档。
 * 4. 穿书存档只写入梦笺自身 textgame 记录，并按梦笺当前用户面具身份隔离显示；不使用 localStorage/sessionStorage。
 * ==========================================================================
 */

import { Icons, escapeHtml, showModal } from './textgame-ui.js';
import {
  updateBookProgress,
  saveStoryRun,
  getTextGameSettings,
  getStoryRunsByBookAndMask
} from './textgame-store.js';
import {
  loadArchiveProfilesForTextGame,
  loadCompanionCandidatesForTextGame,
  loadCompanionMemoryForTextGame
} from './textgame-bridge.js';

/* ==========================================================================
   [区域标注·已完成·梦笺多格式章节目录解析]
   说明：
   1. 支持中文“第n章/回/节/卷/部”、卷/正文/番外/楔子/序章/后记等常见格式。
   2. 支持英文 Chapter / CHAPTER / Part / Book / Prologue / Epilogue 等格式。
   3. 仅匹配行首短标题，降低正文误判；不涉及持久化存储，不过滤长文本正文。
   ========================================================================== */
function splitChapters(content) {
  const text = String(content || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = text.split('\n');
  const matches = [];
  let offset = 0;

  lines.forEach((line) => {
    const rawLine = line || '';
    const trimmed = rawLine.trim();
    if (isChapterTitleLine(trimmed)) {
      matches.push({
        index: offset + rawLine.indexOf(trimmed),
        title: trimmed
      });
    }
    offset += rawLine.length + 1;
  });

  if (!matches.length) {
    return [{ title: '正文', content: text.trim() || '（空白章节）', start: 0 }];
  }

  return matches.map((match, index) => {
    const nextStart = matches[index + 1]?.index ?? text.length;
    return {
      title: match.title,
      start: match.index,
      content: text.slice(match.index, nextStart).trim() || match.title
    };
  });
}

function isChapterTitleLine(line) {
  if (!line || line.length > 42) return false;
  if (/[。！？!?；;，,]{2,}/.test(line)) return false;

  const chineseNumber = '零〇一二两三四五六七八九十百千万亿0-9０-９';
  const romanNumber = 'IVXLCDMivxlcdm';
  const patterns = [
    new RegExp(`^第[${chineseNumber}]+\\s*[章节回卷部篇节集幕].{0,24}$`),
    new RegExp(`^(正文|番外|外传|卷|篇|部)\\s*[${chineseNumber}]+.{0,24}$`),
    new RegExp(`^第[${chineseNumber}]+\\s*(卷|部|篇)\\s*.{0,24}$`),
    /^(楔子|序章|序幕|序言|前言|引子|终章|尾声|后记|番外)(\s*[:：·\-—].{0,24}|.{0,18})?$/,
    new RegExp(`^(chapter|chap\\.|ch\\.)\\s+([0-9０-９]+|[${romanNumber}]+|one|two|three|four|five|six|seven|eight|nine|ten)\\b.{0,24}$`, 'i'),
    new RegExp(`^(part|book|volume)\\s+([0-9０-９]+|[${romanNumber}]+|one|two|three|four|five|six|seven|eight|nine|ten)\\b.{0,24}$`, 'i'),
    /^(prologue|epilogue|preface|afterword)(\s*[:：·\-—].{0,24}|.{0,18})?$/i
  ];

  return patterns.some((pattern) => pattern.test(line));
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
    this.readerSettings = {
      background: '#faf9f7',
      color: '#302923',
      fontSize: 16
    };
  }

  async render() {
    await this.loadBridgeData();

    const chapter = this.chapters[this.chapterIndex] || this.chapters[0];
    const progressPercent = this.getProgressPercent();

    this.container.innerHTML = `
      <!-- [区域标注·已完成·梦笺沉浸式阅读页] 顶栏/底栏默认隐藏，点击正文中心显示；顶栏含书名与当前小说存档抽屉入口。 -->
      <div class="textgame-reader ${this.readerControlsVisible ? 'controls-visible' : ''}" data-role="reader-shell" style="--reader-bg:${escapeHtml(this.readerSettings.background)};--reader-color:${escapeHtml(this.readerSettings.color)};--reader-font-size:${this.readerSettings.fontSize}px;">
        <div class="textgame-reader-toolbar" data-role="reader-topbar">
          <button class="textgame-reader-back" data-action="back" aria-label="返回书架">${Icons.back}</button>
          <div class="textgame-reader-title-box" title="${escapeHtml(this.book?.name || '未命名小说')}">${escapeHtml(String(this.book?.name || '未命名小说').replace(/\.txt$/i, ''))}</div>
          <button class="textgame-reader-more" data-action="open-run-drawer" aria-label="查看存档节点">${Icons.moreVertical}</button>
        </div>

        <article class="textgame-reader-paper" data-role="reader-paper">
          <div class="textgame-reader-body">${escapeHtml(chapter.content || '').replace(/\n/g, '<br>')}</div>
        </article>

        <div class="textgame-reader-actions textgame-reader-control-panel" data-role="reader-bottombar">
          <div class="textgame-reader-progress-head">
            <button class="textgame-reader-step-btn" data-action="prev" aria-label="上一章">${Icons.back}</button>
            <div class="textgame-reader-progress-main">
              <div class="textgame-reader-progress-label">
                <span>${escapeHtml(chapter.title || '正文')}</span>
                <em>${progressPercent}%</em>
              </div>
              <input class="textgame-reader-progress-range" data-action="jump-progress" type="range" min="0" max="${Math.max(this.chapters.length - 1, 0)}" step="1" value="${this.chapterIndex}">
            </div>
            <button class="textgame-reader-step-btn" data-action="next" aria-label="下一章">${Icons.next}</button>
          </div>
          <div class="textgame-reader-tool-grid">
            <button class="textgame-reader-tool-card" data-action="open-toc">${Icons.list}<span>目录</span></button>
            <button class="textgame-reader-tool-card" data-action="open-reader-settings">${Icons.setting}<span>阅读设置</span></button>
            <button class="textgame-reader-tool-card" data-action="travel">${Icons.magic}<span>穿越设置</span></button>
            ${this.activeMask ? `<button class="textgame-reader-tool-card" data-action="save-run">${Icons.save}<span>存档</span></button>` : ''}
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
    await this.persistProgress();
  }

  async loadBridgeData() {
    const settings = await getTextGameSettings();
    const profiles = await loadArchiveProfilesForTextGame();
    this.activeMask = settings.activeMaskId
      ? profiles.masks.find((mask) => mask.id === settings.activeMaskId) || null
      : null;
    this.companions = this.activeMask ? await loadCompanionCandidatesForTextGame(this.activeMask.id) : [];
    if (!this.selectedCompanionId && this.companions[0]) this.selectedCompanionId = this.companions[0].id;
  }

  getProgressPercent() {
    if (this.chapters.length <= 1) return 100;
    return Math.round((this.chapterIndex / (this.chapters.length - 1)) * 100);
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
       1. 点击小说正文/中心区域显示顶栏和方框底栏；再次点击非顶栏/底栏区域时隐藏。
       2. 顶栏/底栏按钮点击不触发显示状态切换，避免返回、翻章、穿书、存档误操作。
       3. 不使用浏览器原生弹窗/选择器，不涉及 localStorage/sessionStorage。
       ========================================================================== */
    readerShell?.addEventListener('click', (event) => {
      if (event.target.closest('[data-role="reader-topbar"], [data-role="reader-bottombar"]')) return;
      this.setReaderControlsVisible(!this.readerControlsVisible);
    });

    this.container.querySelector('[data-action="back"]')?.addEventListener('click', () => this.onBack?.());
    this.container.querySelector('[data-action="prev"]')?.addEventListener('click', () => this.goToChapter(this.chapterIndex - 1));
    this.container.querySelector('[data-action="next"]')?.addEventListener('click', () => this.goToChapter(this.chapterIndex + 1));
    this.container.querySelector('[data-action="jump-progress"]')?.addEventListener('change', (event) => {
      this.goToChapter(Number(event.target.value || 0));
    });
    this.container.querySelector('[data-action="travel"]')?.addEventListener('click', () => this.openTravelModal());
    this.container.querySelector('[data-action="save-run"]')?.addEventListener('click', () => this.openSaveRunConfirmModal());
    this.container.querySelector('[data-action="open-toc"]')?.addEventListener('click', () => this.openTocModal());
    this.container.querySelector('[data-action="open-reader-settings"]')?.addEventListener('click', () => this.openReaderSettingsModal());
    this.container.querySelector('[data-action="open-run-drawer"]')?.addEventListener('click', () => this.openRunDrawer());
  }

  async goToChapter(index) {
    const nextIndex = Math.min(Math.max(Number(index || 0), 0), Math.max(this.chapters.length - 1, 0));
    if (nextIndex === this.chapterIndex) return;
    this.chapterIndex = nextIndex;
    this.readerControlsVisible = false;
    await this.render();
  }

  setReaderControlsVisible(isVisible) {
    this.readerControlsVisible = Boolean(isVisible);
    this.container.querySelector('[data-role="reader-shell"]')?.classList.toggle('controls-visible', this.readerControlsVisible);
  }

  openTocModal() {
    const overlay = document.createElement('div');
    overlay.className = 'textgame-modal-overlay textgame-toc-modal-overlay';
    overlay.innerHTML = `
      <div class="textgame-modal-container textgame-toc-modal-container">
        <div class="textgame-travel-modal-head">
          <div class="textgame-section-title">${Icons.list}<span>目录</span></div>
          <button class="textgame-travel-modal-close" data-action="close-toc-modal" title="关闭">${Icons.back}</button>
        </div>
        <div class="textgame-toc-list">
          ${this.chapters.map((chapter, index) => `
            <button class="textgame-toc-item ${index === this.chapterIndex ? 'active' : ''}" data-chapter-index="${index}">
              <b>${escapeHtml(chapter.title || `第 ${index + 1} 章`)}</b>
              <em>${Math.round(this.chapters.length <= 1 ? 100 : (index / (this.chapters.length - 1)) * 100)}%</em>
            </button>
          `).join('')}
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('active'));

    const close = () => {
      overlay.classList.remove('active');
      setTimeout(() => overlay.remove(), 240);
    };

    overlay.querySelector('[data-action="close-toc-modal"]')?.addEventListener('click', close);
    overlay.querySelectorAll('[data-chapter-index]').forEach((button) => {
      button.addEventListener('click', async () => {
        const index = Number(button.dataset.chapterIndex || 0);
        close();
        await this.goToChapter(index);
      });
    });
  }

  openReaderSettingsModal() {
    const backgrounds = ['#faf9f7', '#f4efe6', '#eef3ef', '#1f1b18'];
    const colors = ['#302923', '#5a4032', '#26352d', '#f6efe6'];

    const overlay = document.createElement('div');
    overlay.className = 'textgame-modal-overlay textgame-reader-settings-modal-overlay';
    overlay.innerHTML = `
      <div class="textgame-modal-container textgame-reader-settings-modal-container">
        <div class="textgame-travel-modal-head">
          <div class="textgame-section-title">${Icons.setting}<span>阅读设置</span></div>
          <button class="textgame-travel-modal-close" data-action="close-reader-settings" title="关闭">${Icons.back}</button>
        </div>
        <div class="textgame-config-block">
          <div class="textgame-config-label">页面背景</div>
          <div class="textgame-color-row">
            ${backgrounds.map((color) => `<button class="textgame-color-dot ${this.readerSettings.background === color ? 'active' : ''}" style="--dot-color:${color}" data-bg="${color}" aria-label="背景颜色"></button>`).join('')}
          </div>
        </div>
        <div class="textgame-config-block">
          <div class="textgame-config-label">字体颜色</div>
          <div class="textgame-color-row">
            ${colors.map((color) => `<button class="textgame-color-dot ${this.readerSettings.color === color ? 'active' : ''}" style="--dot-color:${color}" data-color="${color}" aria-label="字体颜色"></button>`).join('')}
          </div>
        </div>
        <div class="textgame-config-block">
          <div class="textgame-config-label">字体大小</div>
          <div class="textgame-font-size-row">
            <button class="textgame-reader-step-btn" data-font-size="-1">${Icons.back}</button>
            <strong>${this.readerSettings.fontSize}px</strong>
            <button class="textgame-reader-step-btn" data-font-size="1">${Icons.next}</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('active'));

    const close = () => {
      overlay.classList.remove('active');
      setTimeout(() => overlay.remove(), 240);
    };
    const refresh = () => {
      this.readerControlsVisible = true;
      close();
      this.render();
    };

    overlay.querySelector('[data-action="close-reader-settings"]')?.addEventListener('click', close);
    overlay.querySelectorAll('[data-bg]').forEach((button) => {
      button.addEventListener('click', () => {
        this.readerSettings.background = button.dataset.bg || this.readerSettings.background;
        refresh();
      });
    });
    overlay.querySelectorAll('[data-color]').forEach((button) => {
      button.addEventListener('click', () => {
        this.readerSettings.color = button.dataset.color || this.readerSettings.color;
        refresh();
      });
    });
    overlay.querySelectorAll('[data-font-size]').forEach((button) => {
      button.addEventListener('click', () => {
        this.readerSettings.fontSize = Math.min(24, Math.max(13, this.readerSettings.fontSize + Number(button.dataset.fontSize || 0)));
        refresh();
      });
    });
  }

  /* ==========================================================================
     [区域标注·已完成·从此处穿书弹窗]
     说明：
     1. 底栏“穿越设置”打开梦笺自定义弹窗，用于设置穿越方式/剧情路线/同行联系人/行动选项。
     2. 弹窗内复用 IconPark 图标、选择卡片与联系人卡片；保存穿书存档由底栏“存档”确认触发。
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

  /* ==========================================================================
     [区域标注·已完成·梦笺底栏确认保存穿书存档]
     说明：
     1. 底栏“存档”只保存穿书文游存档，不创建阅读存档/书签。
     2. 保存前使用梦笺应用内确认弹窗；保存后写入 storyRuns 并按当前用户面具身份隔离展示。
     3. 不使用浏览器原生 confirm，不使用 localStorage/sessionStorage。
     ========================================================================== */
  openSaveRunConfirmModal() {
    if (!this.activeMask) {
      showModal({ title: '无法存档', content: '请先在梦笺主页选择用户面具身份。' });
      return;
    }

    const chapter = this.chapters[this.chapterIndex] || this.chapters[0];
    const companion = this.companions.find((item) => item.id === this.selectedCompanionId) || null;
    const route = this.selectedPlotMode === 'canon' ? '走原著' : '改写线';
    const travel = this.selectedTravelMode === 'soul' ? '魂穿' : '身穿';

    showModal({
      title: '保存穿书存档',
      content: `
        <div class="textgame-run-confirm">
          <p>小说：${escapeHtml(this.book.name || '未命名小说')}</p>
          <p>章节：${escapeHtml(chapter.title || '故事点')}</p>
          <p>身份：${escapeHtml(this.activeMask.name || '未命名面具')}</p>
          <p>配置：${escapeHtml(route)} / ${escapeHtml(travel)} / ${escapeHtml(companion?.name || '暂无同行者')}</p>
        </div>
      `,
      showCancel: true,
      confirmText: '确认存档',
      cancelText: '取消',
      onConfirm: async () => {
        await this.startStoryRun();
      }
    });
  }

  async startStoryRun(activeOverlay = null) {
    const chapter = this.chapters[this.chapterIndex] || this.chapters[0];
    const companion = this.companions.find((item) => item.id === this.selectedCompanionId) || null;
    const memories = companion ? await loadCompanionMemoryForTextGame(companion.id) : [];
    const input = activeOverlay?.querySelector('[data-role="custom-choice"]') || document.querySelector('.textgame-travel-modal-overlay [data-role="custom-choice"]');
    const customChoice = String(input?.value || this.customChoice || '').trim();
    this.customChoice = customChoice;

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
      title: '穿书存档已保存',
      content: `
        <div class="textgame-run-created">
          <p>已从《${escapeHtml(this.book.name)}》「${escapeHtml(chapter.title)}」保存穿书存档。</p>
          <p>路线：${this.selectedPlotMode === 'canon' ? '走原著' : '改写线'} / ${this.selectedTravelMode === 'soul' ? '魂穿' : '身穿'}</p>
          <p>身份：${escapeHtml(this.activeMask?.name || '未命名面具')}</p>
          <p>存档号：${escapeHtml(run.id)}</p>
        </div>
      `
    });
  }

  async openRunDrawer() {
    const existing = document.querySelector('.textgame-run-drawer-overlay');
    if (existing) existing.remove();

    const runs = this.activeMask ? await getStoryRunsByBookAndMask(this.book.id, this.activeMask.id) : [];

    const overlay = document.createElement('div');
    overlay.className = 'textgame-run-drawer-overlay';
    overlay.innerHTML = `
      <div class="textgame-run-drawer-mask" data-action="close-run-drawer"></div>
      <aside class="textgame-run-drawer-panel">
        <div class="textgame-run-drawer-head">
          <div>
            <b>${Icons.archive}<span>存档节点</span></b>
            <p>${escapeHtml(String(this.book?.name || '未命名小说').replace(/\.txt$/i, ''))}</p>
          </div>
          <button class="textgame-run-drawer-close" data-action="close-run-drawer">${Icons.back}</button>
        </div>
        <div class="textgame-run-drawer-list">
          ${runs.length ? runs.map((run) => this.renderRunNode(run)).join('') : `
            <div class="textgame-empty-mini">${Icons.archive}<span>${this.activeMask ? '当前身份暂无这本小说的穿书存档。' : '请先在梦笺主页选择用户面具身份。'}</span></div>
          `}
        </div>
      </aside>
    `;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('active'));

    const close = () => {
      overlay.classList.remove('active');
      setTimeout(() => overlay.remove(), 240);
    };

    overlay.querySelectorAll('[data-action="close-run-drawer"]').forEach((item) => {
      item.addEventListener('click', close);
    });
  }

  renderRunNode(run) {
    const route = run.plotMode === 'canon' ? '走原著' : '改写线';
    const travel = run.travelMode === 'soul' ? '魂穿' : '身穿';
    const created = run.createdAt ? new Date(run.createdAt).toLocaleString('zh-CN', { hour12: false }) : '';

    return `
      <article class="textgame-run-node-card">
        <h4>${escapeHtml(run.chapterTitle || '故事点')}</h4>
        <div class="textgame-archive-tags">
          <span>${escapeHtml(route)}</span>
          <span>${escapeHtml(travel)}</span>
          <span>${escapeHtml(run?.companion?.name || '暂无同行者')}</span>
        </div>
        <p>${escapeHtml(run.storyPoint || '').slice(0, 96)}${String(run.storyPoint || '').length > 96 ? '…' : ''}</p>
        <em>${escapeHtml(created)}</em>
      </article>
    `;
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
