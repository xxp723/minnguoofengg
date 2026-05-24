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
  getStoryRunsByBookAndMask,
  setReaderSettings,
  setTravelWordCount,
  getBookSettings,
  saveBookSettings
} from './textgame-store.js';
import {
  loadArchiveProfilesForTextGame,
  loadCompanionCandidatesForTextGame,
  loadCompanionMemoryForTextGame,
  loadGlobalWorldbookEntriesForTextGame
} from './textgame-bridge.js';
import { sendTextGameAiMessage } from './textgame-api.js';

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
    this.withCompanionMemory = true;
    this.travelWordCount = [600, 1000];
  }

  async render() {
    await this.loadBridgeData();

    const chapter = this.chapters[this.chapterIndex] || this.chapters[0];
    const progressPercent = this.getProgressPercent();
    
    // 如果存在进行中的穿书，拦截显示
    if (this.activeRunId) {
       this.renderActiveRunMode();
       return;
    }

    this.container.innerHTML = `
      <!-- [区域标注·已完成·梦笺沉浸式阅读页] 顶栏/底栏默认隐藏，点击正文中心显示；顶栏含书名与当前小说存档抽屉入口。 -->
      <div class="textgame-reader ${this.readerControlsVisible ? 'controls-visible' : ''}" data-role="reader-shell" style="--reader-bg:${escapeHtml(this.readerSettings.background)};--reader-color:${escapeHtml(this.readerSettings.color)};--reader-font-size:${this.readerSettings.fontSize}px;">
        <div class="textgame-reader-toolbar" data-role="reader-topbar">
          <button class="textgame-reader-back" data-action="back" aria-label="返回书架">${Icons.back}</button>
          <button class="textgame-reader-book-btn" data-action="open-book-setting" aria-label="书籍设定">${Icons.book}</button>
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
    
    if (settings && settings.readerSettings) {
      this.readerSettings = { ...this.readerSettings, ...settings.readerSettings };
    }
    if (settings && settings.travelWordCount) {
      this.travelWordCount = settings.travelWordCount;
    }
    
    const profiles = await loadArchiveProfilesForTextGame();
    this.activeMask = settings.activeMaskId
      ? profiles.masks.find((mask) => mask.id === settings.activeMaskId) || null
      : null;
    this.companions = this.activeMask ? await loadCompanionCandidatesForTextGame(this.activeMask.id) : [];
    this.globalTravelPrompt = settings.globalTravelPrompt || '';
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
      <div class="textgame-section-title">${Icons.magic}<span>穿越设置</span></div>
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
        ${this.selectedCompanionId ? `
          <div class="textgame-config-switch-row" data-action="toggle-companion-memory" style="margin-top: 12px; display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 13px;">让联系人携带记忆</span>
            <label class="textgame-switch" style="pointer-events: none;">
              <input type="checkbox" ${this.withCompanionMemory ? 'checked' : ''}>
              <span class="textgame-slider"></span>
            </label>
          </div>
        ` : ''}
      </div>

      <!-- [区域标注·已完成·梦笺穿越字数设置] -->
      <div class="textgame-config-block">
        <div class="textgame-config-label">字数设置 (建议 600-1000)</div>
        <div class="textgame-word-count-row" style="display: flex; gap: 8px; align-items: center; margin-top: 8px;">
          <input type="number" data-role="travel-word-min" class="textgame-custom-choice" style="width: 80px; min-height: 36px; height: 36px; padding: 4px 12px; text-align: center; border-radius: 20px;" value="${this.travelWordCount[0]}" min="100" max="3000" step="100">
          <span style="color: var(--theme-color-secondary);">至</span>
          <input type="number" data-role="travel-word-max" class="textgame-custom-choice" style="width: 80px; min-height: 36px; height: 36px; padding: 4px 12px; text-align: center; border-radius: 20px;" value="${this.travelWordCount[1]}" min="100" max="3000" step="100">
          <span style="color: var(--theme-color-secondary);">字</span>
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
        <span class="textgame-companion-avatar" style="border-radius: 50%; overflow: hidden; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; background-color: var(--theme-color-divider);">
          ${item.avatar ? `<img src="${escapeHtml(item.avatar)}" alt="" style="width:100%;height:100%;object-fit:cover;">` : Icons.user}
        </span>
        <b>${escapeHtml(item.contactName || item.name)}</b>
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
    this.container.querySelector('[data-action="open-book-setting"]')?.addEventListener('click', () => this.openBookSettingModal());
  }

  async openBookSettingModal() {
    /* ==========================================================================
       [区域标注·已完成·梦笺高级杂志风格设定页]
       说明：
       1. 独立全屏或大尺寸模态框展示小说的世界观、章节摘要、重要角色。
       2. 包含“生成设定”入口，调用大模型提取（待实现具体逻辑）。
       ========================================================================== */
    const existing = document.querySelector('.textgame-book-setting-overlay');
    if (existing) existing.remove();
    
    // 拉取并渲染已有的设定数据
    const settings = await getBookSettings(this.book.id);
    const worldviewStr = settings?.worldview ? escapeHtml(settings.worldview).replace(/\n/g, '<br>') : '<p style="color: var(--theme-color-secondary); font-style: italic; text-align: center;">暂无世界观设定。点击右上角“AI 提取”自动生成。</p>';
    const summaryStr = settings?.chaptersSummary ? escapeHtml(settings.chaptersSummary).replace(/\n/g, '<br>') : '<p style="color: var(--theme-color-secondary); font-style: italic; text-align: center;">暂无章节提要。需先执行 AI 提取。</p>';
    const charactersStr = settings?.characters ? escapeHtml(settings.characters).replace(/\n/g, '<br>') : '<p style="color: var(--theme-color-secondary); font-style: italic; text-align: center;">暂无人物情报。需先执行 AI 提取。</p>';

    const overlay = document.createElement('div');
    overlay.className = 'textgame-modal-overlay textgame-book-setting-overlay active';
    overlay.innerHTML = `
      <div class="textgame-modal-container textgame-book-setting-container" style="width: 90vw; height: 85vh; max-width: 600px; display: flex; flex-direction: column; padding: 0;">
        <div class="textgame-travel-modal-head" style="padding: 16px;">
          <div class="textgame-section-title">${Icons.book}<span>书籍设定</span></div>
          <button class="textgame-travel-modal-close" data-action="close-book-setting" title="关闭">${Icons.back}</button>
        </div>
        <div class="textgame-book-setting-content" style="flex: 1; overflow-y: auto; padding: 0 16px 24px;">
          
          <div class="textgame-book-setting-magazine-header" style="text-align: center; margin-bottom: 30px; border-bottom: 2px solid var(--theme-color-primary); padding-bottom: 20px;">
            <h1 style="font-size: 28px; font-weight: bold; font-family: serif; margin-bottom: 8px; color: var(--theme-color-primary);">${escapeHtml(this.book?.name || '未命名小说')}</h1>
            <p style="font-size: 14px; color: var(--theme-color-secondary); letter-spacing: 2px;">WORLD SETTINGS & ARCHIVES</p>
          </div>

          <div class="textgame-book-setting-section" style="margin-bottom: 24px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
              <h3 style="font-size: 18px; font-weight: 600; border-left: 4px solid var(--theme-color-primary); padding-left: 8px;">世界观档案</h3>
              <button class="textgame-reader-tool-card" style="width: auto; padding: 4px 12px; min-height: 32px;" data-action="generate-worldview">${Icons.sparkle}<span>AI 提取</span></button>
            </div>
            <div class="textgame-book-setting-card" data-role="view-worldview" style="background: var(--theme-color-divider); padding: 16px; border-radius: 12px; font-size: 14px; line-height: 1.6;">
              ${worldviewStr}
            </div>
          </div>

          <div class="textgame-book-setting-section" style="margin-bottom: 24px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
              <h3 style="font-size: 18px; font-weight: 600; border-left: 4px solid var(--theme-color-primary); padding-left: 8px;">章节提要</h3>
            </div>
            <div class="textgame-book-setting-card" data-role="view-summary" style="background: var(--theme-color-divider); padding: 16px; border-radius: 12px; font-size: 14px; line-height: 1.6;">
               ${summaryStr}
            </div>
          </div>

          <div class="textgame-book-setting-section" style="margin-bottom: 24px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
              <h3 style="font-size: 18px; font-weight: 600; border-left: 4px solid var(--theme-color-primary); padding-left: 8px;">登场人物</h3>
            </div>
            <div class="textgame-book-setting-card" data-role="view-characters" style="background: var(--theme-color-divider); padding: 16px; border-radius: 12px; font-size: 14px; line-height: 1.6;">
               ${charactersStr}
            </div>
          </div>

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
    
    overlay.querySelector('.textgame-book-setting-container')?.addEventListener('click', (event) => event.stopPropagation());
    overlay.querySelector('[data-action="close-book-setting"]')?.addEventListener('click', close);
    
    const generateBtn = overlay.querySelector('[data-action="generate-worldview"]');
    generateBtn?.addEventListener('click', async () => {
      const confirmStr = settings ? '覆盖重新提取会消耗较多 Token，确认要重新分析本书吗？' : '即将使用当前 API 预设分析全书，提取世界观与重要角色。可能需要数分钟且消耗较多 Token。是否继续？';
      showModal({
        title: 'AI 全书设定提取',
        content: confirmStr,
        showCancel: true,
        confirmText: '开始提取',
        onConfirm: () => this.executeAIWorldviewExtraction(overlay, generateBtn)
      });
    });
  }
  
  async executeAIWorldviewExtraction(overlay, btnNode) {
    try {
      btnNode.innerHTML = `<span style="animation: spin 1s linear infinite; display: inline-block;">↻</span><span>分析中...</span>`;
      btnNode.style.pointerEvents = 'none';
      btnNode.style.opacity = '0.7';
      
      const appSettings = await getTextGameSettings();
      if (!appSettings?.apiProfile) throw new Error('请先在梦笺主页的 [设置] 中配置 API 预设。');
      
      // 减少发给大模型的字数，避免因为单次请求输入过长、或包含触发 API 安全审核的敏感词语，导致 API 返回空数据拦截。
      let sampleText = '';
      if (this.chapters.length <= 6) {
        sampleText = this.chapters.map(c => `【${c.title}】\n${makeSnippet(c.content, 1000)}`).join('\n\n');
      } else {
        const head = [this.chapters[0], this.chapters[1]];
        const midIdx = Math.floor(this.chapters.length / 2);
        const mid = [this.chapters[midIdx], this.chapters[midIdx + 1]];
        const tail = [this.chapters[this.chapters.length - 2], this.chapters[this.chapters.length - 1]];
        sampleText = [...head, ...mid, ...tail].map(c => `【${c.title}】\n${makeSnippet(c.content, 500)}`).join('\n\n...\n\n');
      }
      
      // 修改提示词：使用英文字母与特殊符号的强制定界符，防止大模型魔改中文标题导致正则失效。
      // 获取全局世界书顶部已开启条目
      const globalWbEntries = await loadGlobalWorldbookEntriesForTextGame();
      const wbPrompt = globalWbEntries.length > 0
        ? `【全局设定补充参考】\n${globalWbEntries.map(e => `[${e.name}]：${e.content}`).join('\n')}\n\n`
        : '';

      const prompt = `${wbPrompt}请根据以下小说的抽样章节片段，提取并归纳本书的设定信息。
请严格按照以下格式输出你的结果，不要输出任何多余的废话和 markdown 标记！

<<<WORLDVIEW_START>>>
在这里写下小说的背景设定、力量体系、时代背景等宏观世界观介绍...
<<<WORLDVIEW_END>>>

<<<SUMMARY_START>>>
在这里写下从已提供的片段中归纳出的剧情主线和早期冲突...
<<<SUMMARY_END>>>

<<<CHARACTERS_START>>>
在这里罗列片段中出现的重要角色及其身份特征（如：姓名 - 身份 - 性格）...
<<<CHARACTERS_END>>>

小说名：《${this.book.name}》
抽样内容：
${sampleText}`;
      
      // 调用基础的统一 LLM 接口：必须传入更大的 maxTokens（默认是900），否则大模型很容易在中途被截断，并且如果因为太长报错会直接返回空字符串
      const response = await sendTextGameAiMessage([{ role: 'user', content: prompt }], { temperature: 0.7, maxTokens: 4000 });
      
      // 最后再加一层防守：如果连大模型都没有返回任何实质内容，说明遭到了底层 API 的拦截（例如 Gemini 的安全机制）
      if (!response || !response.trim()) {
        throw new Error('大模型返回了空数据。可能是小说的内容触发了该模型厂商的敏感词安全拦截机制，或者请求/生成的字数超限。请在设置中更换其他大模型尝试。');
      }

      // 提取函数：优先使用严谨定界符；若大模型未遵循，则降级使用中文正则或按顺序切分。
      const extractField = (responseStr, enStart, enEnd, cnKeywords) => {
        const enMatch = responseStr.match(new RegExp(`${enStart}([\\s\\S]*?)${enEnd}`, 'i'));
        if (enMatch && enMatch[1].trim()) return enMatch[1].trim();
        
        // 降级：匹配大模型可能擅自使用的中文标题（如 "【世界观】", "### 登场人物" 等）
        const keywordPattern = cnKeywords.join('|');
        const cnMatch = responseStr.match(new RegExp(`(?:^|\\n)[#\\s\\*\\[【「]*(?:${keywordPattern})[\\s\\]】」]*[：:]?\\s*\\n([\\s\\S]*?)(?=(?:\\n[#\\s\\*\\[【「]*(?:世界观|章节|剧情|登场|人物))|$)`, 'i'));
        if (cnMatch && cnMatch[1].trim()) return cnMatch[1].trim();
        
        return '';
      };
      
      let parsed = {
        worldview: extractField(response, '<<<WORLDVIEW_START>>>', '<<<WORLDVIEW_END>>>', ['世界观档案', '世界观', '背景设定']),
        chaptersSummary: extractField(response, '<<<SUMMARY_START>>>', '<<<SUMMARY_END>>>', ['章节提要', '剧情主线', '章节概要', '剧情摘要']),
        characters: extractField(response, '<<<CHARACTERS_START>>>', '<<<CHARACTERS_END>>>', ['登场人物', '重要角色', '角色介绍'])
      };
      
      // 极限兜底：如果三个字段都没提取到任何东西，说明大模型输出了一大段毫无排版的纯文本
      if (!parsed.worldview && !parsed.chaptersSummary && !parsed.characters) {
         parsed.worldview = response.trim();
         parsed.chaptersSummary = '（未提取到符合格式的相关信息，请参考上方原始返回文本）';
         parsed.characters = '（未提取到符合格式的相关信息，请参考上方原始返回文本）';
      } else {
         // 部分缺失的补充
         if (!parsed.worldview) parsed.worldview = '（未提取到专属世界观段落，大模型可能合并输出了信息）';
         if (!parsed.chaptersSummary) parsed.chaptersSummary = '（未提取到专属章节提要段落）';
         if (!parsed.characters) parsed.characters = '（未提取到专属登场人物段落）';
      }
      
      await saveBookSettings(this.book.id, {
        worldview: parsed.worldview,
        chaptersSummary: parsed.chaptersSummary,
        characters: parsed.characters
      });
      
      // 更新视图
      const newSettings = await getBookSettings(this.book.id);
      
      const renderField = (fieldValue, emptyTip) => {
        return fieldValue ? escapeHtml(fieldValue).replace(/\n/g, '<br>') : `<p style="color: var(--theme-color-secondary); font-style: italic; text-align: center;">${emptyTip}</p>`;
      };
      
      overlay.querySelector('[data-role="view-worldview"]').innerHTML = renderField(newSettings.worldview, '暂无世界观设定。点击右上角“AI 提取”自动生成。');
      overlay.querySelector('[data-role="view-summary"]').innerHTML = renderField(newSettings.chaptersSummary, '暂无章节提要。需先执行 AI 提取。');
      overlay.querySelector('[data-role="view-characters"]').innerHTML = renderField(newSettings.characters, '暂无人物情报。需先执行 AI 提取。');
      
      showModal({ title: '提取成功', content: '书籍设定已更新并保存。' });
      
    } catch (err) {
      console.error(err);
      showModal({ title: '提取失败', content: err.message });
    } finally {
      btnNode.innerHTML = `${Icons.sparkle}<span>重新提取</span>`;
      btnNode.style.pointerEvents = 'auto';
      btnNode.style.opacity = '1';
    }
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
    /* ==========================================================================
       [区域标注·已完成·梦笺阅读页目录弹窗]
       说明：
       1. 点击“目录”后使用梦笺应用内弹窗，不使用浏览器原生弹窗/选择器。
       2. 已完成：点击弹窗内容外的遮罩区域可关闭弹窗。
       3. 已完成：弹窗创建时直接带 active 状态，避免先透明再显示造成阅读页闪屏。
       ========================================================================== */
    const existing = document.querySelector('.textgame-toc-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'textgame-modal-overlay textgame-toc-modal-overlay active';
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

    const close = () => {
      overlay.classList.remove('active');
      setTimeout(() => overlay.remove(), 240);
    };

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close();
    });
    overlay.querySelector('.textgame-toc-modal-container')?.addEventListener('click', (event) => event.stopPropagation());
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
    const refresh = async () => {
      this.readerControlsVisible = true;
      close();
      await setReaderSettings(this.readerSettings);
      this.render();
    };

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close();
    });
    overlay.querySelector('.textgame-reader-settings-modal-container')?.addEventListener('click', (event) => {
      if (!event.target.closest('button')) {
        event.stopPropagation();
      }
    });
    
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
     2. 已完成：点击弹窗内容外遮罩区域可关闭，并保留当前自定义输入。
     3. 已完成：弹窗创建时直接带 active 状态，避免先透明再显示造成阅读页闪屏。
     4. 不使用浏览器原生弹窗/选择器，不涉及 localStorage/sessionStorage。
     ========================================================================== */
  openTravelModal() {
    const existing = document.querySelector('.textgame-travel-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'textgame-modal-overlay textgame-travel-modal-overlay active';
    overlay.innerHTML = `
      <div class="textgame-modal-container textgame-travel-modal-container">
        <div class="textgame-travel-modal-head">
          <div class="textgame-section-title">${Icons.magic}<span>穿越设置</span></div>
          <button class="textgame-travel-modal-close" data-action="close-travel-modal" title="关闭">${Icons.back}</button>
        </div>
        <div class="textgame-travel-panel" data-role="travel-panel">
          ${this.renderTravelPanel()}
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    this.bindTravelModalEvents(overlay);
  }

  closeTravelModal(overlay = document.querySelector('.textgame-travel-modal-overlay')) {
    if (!overlay) return;
    overlay.classList.remove('active');
    setTimeout(() => overlay.remove(), 240);
  }

  bindTravelModalEvents(overlay) {
    const closeWithDraft = async () => {
      this.customChoice = overlay.querySelector('[data-role="custom-choice"]')?.value || '';
      
      const minInput = overlay.querySelector('[data-role="travel-word-min"]');
      const maxInput = overlay.querySelector('[data-role="travel-word-max"]');
      if (minInput && maxInput) {
        const min = Math.max(10, Number(minInput.value) || 600);
        const max = Math.max(min, Number(maxInput.value) || 1000);
        this.travelWordCount = [min, max];
        await setTravelWordCount(min, max);
      }
      
      this.closeTravelModal(overlay);
    };

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closeWithDraft();
    });

    overlay.querySelector('.textgame-travel-modal-container')?.addEventListener('click', (event) => event.stopPropagation());

    overlay.querySelector('[data-action="close-travel-modal"]')?.addEventListener('click', closeWithDraft);

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
        const id = button.dataset.companionId || '';
        this.selectedCompanionId = this.selectedCompanionId === id ? '' : id;
        this.customChoice = overlay.querySelector('[data-role="custom-choice"]')?.value || '';
        this.renderTravelConfigOnly(overlay);
      });
    });

    overlay.querySelector('[data-action="toggle-companion-memory"]')?.addEventListener('click', () => {
      this.withCompanionMemory = !this.withCompanionMemory;
      this.customChoice = overlay.querySelector('[data-role="custom-choice"]')?.value || '';
      this.renderTravelConfigOnly(overlay);
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
    const memories = (companion && this.withCompanionMemory) ? await loadCompanionMemoryForTextGame(companion.id) : [];
    const globalWbEntries = await loadGlobalWorldbookEntriesForTextGame();
    
    const overlayRef = activeOverlay || document.querySelector('.textgame-travel-modal-overlay');
    const input = overlayRef?.querySelector('[data-role="custom-choice"]');
    const customChoice = String(input?.value || this.customChoice || '').trim();
    this.customChoice = customChoice;

    if (overlayRef) {
      const minInput = overlayRef.querySelector('[data-role="travel-word-min"]');
      const maxInput = overlayRef.querySelector('[data-role="travel-word-max"]');
      if (minInput && maxInput) {
        const min = Math.max(10, Number(minInput.value) || 600);
        const max = Math.max(min, Number(maxInput.value) || 1000);
        this.travelWordCount = [min, max];
        await setTravelWordCount(min, max);
      }
    }

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
      openingPrompt: this.buildOpeningPrompt(chapter, companion, memories, customChoice, globalWbEntries),
      chatHistory: [] // 留着存放后续生成的全新剧情
    });

    this.closeTravelModal(activeOverlay);
    
    // 直接进入沉浸式截断阅读模式
    this.activeRunId = run.id;
    this.activeRunData = run;
    await this.render();
    
    // 自动发起第一轮请求，AI 会顺着 openingPrompt 直接续写
    this.advanceRunPlot('【系统】梦境连接已建立，剧情开始推演...');
  }
  
  /* ==========================================================================
     [区域标注·已完成·梦笺沉浸式截断阅读与结算导出]
     说明：
     1. 从当前节点开始隐藏原版正文，显示独立的新剧情和对话。
     2. 底部带有选项生成面板。
     3. 结束穿越后提供结算弹窗，保存为全新的 TXT 同人小说。
     ========================================================================== */
  renderActiveRunMode() {
    // 将整个聊天记录拼接渲染
    const historyHtml = (this.activeRunData.chatHistory || []).map(msg => {
      if (msg.role === 'user') {
        return `<div style="text-align: right; margin-bottom: 12px;"><span style="display: inline-block; background: var(--theme-color-primary); color: #fff; padding: 8px 12px; border-radius: 12px 12px 0 12px;">${escapeHtml(msg.content)}</span></div>`;
      }
      return `<div style="text-align: left; margin-bottom: 12px;"><span style="display: inline-block; background: var(--theme-color-divider); color: var(--reader-color); padding: 8px 12px; border-radius: 12px 12px 12px 0; line-height: 1.6;">${escapeHtml(msg.content).replace(/\n/g, '<br>')}</span></div>`;
    }).join('');

    this.container.innerHTML = `
      <div class="textgame-reader" style="--reader-bg:${escapeHtml(this.readerSettings.background)};--reader-color:${escapeHtml(this.readerSettings.color)};--reader-font-size:${this.readerSettings.fontSize}px; display: flex; flex-direction: column;">
        <div class="textgame-reader-toolbar" style="transform: translateY(0); display: flex; justify-content: space-between; position: relative;">
          <button class="textgame-reader-back" data-action="exit-run" aria-label="退出并结算">${Icons.close}<span>结束穿越</span></button>
          <div class="textgame-reader-title-box" style="flex: 1; text-align: center;">正在体验《${escapeHtml(this.book?.name?.replace(/\.txt$/i, ''))}》</div>
          <div style="width: 48px;"></div>
        </div>
        
        <article class="textgame-reader-paper" style="flex: 1; overflow-y: auto; padding-bottom: 80px;" data-role="run-history">
          ${historyHtml || '<div style="text-align: center; color: var(--theme-color-secondary); margin-top: 40px; font-style: italic;">剧情生成中，请稍候...</div>'}
        </article>
        
        <div style="position: absolute; bottom: 0; left: 0; width: 100%; background: var(--reader-bg); padding: 12px; border-top: 1px solid var(--theme-color-divider); display: flex; gap: 8px; box-sizing: border-box;">
           <input type="text" data-role="run-input" placeholder="输入你想做的事..." style="flex: 1; height: 36px; padding: 0 12px; border-radius: 18px; border: 1px solid var(--theme-color-divider); background: transparent; color: var(--reader-color);">
           <button class="textgame-reader-tool-card" style="width: auto; padding: 0 16px; border-radius: 18px;" data-action="run-send">${Icons.play}</button>
        </div>
      </div>
    `;
    
    // 自动滚动到底部
    const paper = this.container.querySelector('[data-role="run-history"]');
    if (paper) paper.scrollTop = paper.scrollHeight;
    
    this.container.querySelector('[data-action="exit-run"]')?.addEventListener('click', () => this.settleRun());
    
    const sendBtn = this.container.querySelector('[data-action="run-send"]');
    const input = this.container.querySelector('[data-role="run-input"]');
    
    const handleSend = () => {
      const val = String(input.value || '').trim();
      if (!val) return;
      input.value = '';
      this.advanceRunPlot(val);
    };
    
    sendBtn?.addEventListener('click', handleSend);
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });
  }
  
  async advanceRunPlot(userAction) {
    if (!this.activeRunData) return;
    
    // 追加用户消息并渲染
    if (userAction !== '【系统】梦境连接已建立，剧情开始推演...') {
      this.activeRunData.chatHistory.push({ role: 'user', content: userAction });
      this.renderActiveRunMode();
    }
    
    const sendBtn = this.container.querySelector('[data-action="run-send"]');
    if (sendBtn) sendBtn.style.opacity = '0.5', sendBtn.style.pointerEvents = 'none';
    
    try {
      const appSettings = await getTextGameSettings();
      if (!appSettings?.apiProfile) throw new Error('未配置 API 预设');
      
      const prompt = `
【上下文背景】
${this.activeRunData.openingPrompt}

【历史对话】
${this.activeRunData.chatHistory.map(m => `${m.role === 'user' ? '用户：' : 'AI：'}${m.content}`).join('\n')}

${userAction === '【系统】梦境连接已建立，剧情开始推演...' ? '请直接输出第一段开场剧情和3个行动选项。' : `用户刚才执行了：${userAction}。请根据上下文，续写这一段剧情反应并给出接下来的3个选项。`}
`;
      
      const response = await sendTextGameAiMessage([{ role: 'user', content: prompt }]);
      
      this.activeRunData.chatHistory.push({ role: 'assistant', content: response });
      
      // 持久化到穿书存档
      await saveStoryRun(this.activeRunData);
      
      this.renderActiveRunMode();
      
    } catch (err) {
      console.error(err);
      showModal({ title: '剧情生成失败', content: err.message });
    } finally {
      const btn = this.container.querySelector('[data-action="run-send"]');
      if (btn) btn.style.opacity = '1', btn.style.pointerEvents = 'auto';
    }
  }
  
  async settleRun() {
    showModal({
      title: '结束穿越并结算',
      content: '确认要结束当前的沉浸式穿越吗？结束之后，系统将自动把这段由你创造的独立剧情打包成一本新的同人小说供你下载。',
      showCancel: true,
      confirmText: '结束穿越',
      onConfirm: async () => {
        if (!this.activeRunData) return;
        
        // 组装文本
        const rawContent = (this.activeRunData.chatHistory || [])
          .filter(m => m.role === 'assistant')
          .map(m => m.content)
          .join('\n\n=================================\n\n');
          
        const filename = `[同人]《${this.book.name.replace(/\.txt$/i, '')}》${this.activeMask ? this.activeMask.name : '未知'}的穿越篇章.txt`;
        
        // 纯前端下载 Blob
        const blob = new Blob([rawContent], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 100);
        
        // 清理状态并返回正常阅读模式
        this.activeRunId = null;
        this.activeRunData = null;
        this.readerControlsVisible = true;
        await this.render();
      }
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

  buildOpeningPrompt(chapter, companion, memories, customChoice, globalWbEntries = []) {
    const plotInstruction = this.selectedPlotMode === 'canon'
      ? '优先保持原著关键事件、人物动机和时间线；当用户选择干预时，再产生合理蝴蝶效应。'
      : '允许根据用户行动改写后续剧情，但需要保留小说世界观和人物性格的连续性。';

    const travelInstruction = this.selectedTravelMode === 'soul'
      ? '用户选择魂穿：让用户穿成当前情节中的某个合适人物，以该人物身份、处境和社会关系继续。'
      : '用户选择身穿：让用户以梦笺主页选择的面具本体进入小说现场，并处理身份暴露风险。';

    const lines = [];
    
    if (globalWbEntries && globalWbEntries.length > 0) {
      lines.push('【全局世界书设定补充】');
      globalWbEntries.forEach(e => lines.push(`[${e.name}]：${e.content}`));
      lines.push('------------------------');
    }

    lines.push(
      `小说：《${this.book.name}》`,
      `章节/故事点：${chapter.title}`,
      `原文片段：${makeSnippet(chapter.content, 1200)}`,
      `穿越方式：${travelInstruction}`,
      `剧情路线：${plotInstruction}`,
      companion ? `同行者：${companion.name}（${companion.identity || '无身份备注'}）` : '同行者：暂无',
      memories.length ? `同行者旧事记忆摘要：${memories.map((item) => item.summary).join('；')}` : '同行者旧事记忆摘要：暂无'
    );
    
    if (this.globalTravelPrompt) {
      lines.push(`用户全局指令：${this.globalTravelPrompt}`);
    }
    
    lines.push(
      customChoice ? `用户自定义行动：${customChoice}` : '用户自定义行动：未填写',
      `字数要求：生成的剧情及行动选项总字数需控制在 ${this.travelWordCount[0]} 到 ${this.travelWordCount[1]} 字之间。`,
      '请以文游方式推进：先叙事，再给出 3 个可选行动，并允许用户自定义输入。'
    );
    
    return lines.join('\n');
  }
}
