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
  saveBookSettings,
  setTravelSettings
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
    this.selectedPronoun = 'second';
    this.actionOptions = [];
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
        <div class="textgame-reader-toolbar" data-role="reader-topbar" style="display: flex; justify-content: space-between; align-items: center; padding: 0 12px;">
          <div style="display: flex; gap: 8px;">
            <button class="textgame-reader-back" data-action="back" aria-label="返回书架" style="width: 32px; height: 32px; padding: 6px;">${Icons.back}</button>
            <button class="textgame-reader-book-btn" data-action="open-book-setting" aria-label="书籍设定" style="width: 32px; height: 32px; padding: 6px;">${Icons.book}</button>
          </div>
          <button class="textgame-reader-tool-card" data-action="start-travel-now" style="width: 40px; height: 40px; border-radius: 50%; background: var(--theme-color-primary); color: #fff; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0,0,0,0.15); border: none; padding: 0; margin: 0 auto; flex-shrink: 0;" aria-label="开始穿越">
            ${Icons.play}
          </button>
          <button class="textgame-reader-more" data-action="open-run-drawer" aria-label="查看存档节点" style="width: 32px; height: 32px; padding: 6px;">${Icons.moreVertical}</button>
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
    if (settings && settings.pronoun) {
      this.selectedPronoun = settings.pronoun;
    }
    if (settings && settings.actionOptions) {
      this.actionOptions = settings.actionOptions;
    } else {
      this.actionOptions = [
        { title: '【推剧情】', content: 'user的行为和回应必须紧扣当前剧情主线，主动推进故事发展，不拖沓、不闲聊，严格读取并贴合user人设，绝对不能出现OOC情况，确保每一个回应都能让剧情自然向下延伸。' },
        { title: '【造转折】', content: 'user的行为和回应必须制造合理且符合逻辑的剧情转折，打破当前对话的平稳节奏，同时严格贴合user的性格、身份与过往设定，绝对不能OOC，让剧情进入全新的发展方向，提升故事张力。' },
        { title: '【暧昧升温】', content: 'user的行为和回应必须用含蓄、细节感拉满的暧昧方式拉近与对方的距离，贴合user人设不OOC，通过氛围营造、眼神/动作/语言的细节描写，推动感情线升温，不直白、不突兀。' },
        { title: '【自定义】', content: '在这里输入你想要的行动要求...' }
      ];
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
        <div class="textgame-config-label">人称选择</div>
        <div class="textgame-choice-row">
          <button class="textgame-choice-card ${this.selectedPronoun === 'second' ? 'active' : ''}" data-choice-group="pronoun" data-choice-id="second">
            <b>第二人称</b><em>用“你”描写用户，同行联系人用第三人称</em>
          </button>
          <button class="textgame-choice-card ${this.selectedPronoun === 'third' ? 'active' : ''}" data-choice-group="pronoun" data-choice-id="third">
            <b>第三人称</b><em>用第三人称描写用户，同行联系人用第三人称</em>
          </button>
        </div>
      </div>

      <div class="textgame-config-block">
        <div class="textgame-config-label">文游行动选项生成规则 (点击可直接编辑)</div>
        <div style="display: flex; flex-direction: column; gap: 10px;">
          ${this.actionOptions.map((opt, i) => `
            <div style="border: 1px solid rgba(36, 30, 24, 0.1); border-radius: 12px; padding: 10px; background: rgba(255, 255, 255, 0.68);">
              <input type="text" data-action-index="${i}" data-action-field="title" value="${escapeHtml(opt.title)}" style="width: 100%; font-weight: bold; border: none; background: transparent; outline: none; margin-bottom: 6px; font-size: 14px; color: #1f1b18;" placeholder="选项标题">
              <textarea data-action-index="${i}" data-action-field="content" style="width: 100%; min-height: 60px; border: none; background: transparent; outline: none; font-size: 12px; color: #6f655a; resize: vertical;" placeholder="选项内容要求...">${escapeHtml(opt.content)}</textarea>
            </div>
          `).join('')}
        </div>
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
    this.container.querySelector('[data-action="start-travel-now"]')?.addEventListener('click', () => this.openStartTravelModal());
  }

  async openStartTravelModal() {
    if (!this.activeMask) {
      showModal({ title: '无法穿越', content: '请先在梦笺主页选择用户面具身份。' });
      return;
    }

    const appSettings = await getTextGameSettings();
    if (!appSettings?.apiProfile) {
      showModal({ title: '无法穿越', content: '请先在梦笺主页的 [设置] 中配置 API 预设。' });
      return;
    }

    const chapter = this.chapters[this.chapterIndex] || this.chapters[0];
    const isSoulTravel = this.selectedTravelMode === 'soul';

    const overlay = document.createElement('div');
    overlay.className = 'textgame-modal-overlay active';
    overlay.innerHTML = `
      <div class="textgame-modal-container" style="width: 90vw; max-width: 400px; padding: 20px;">
        <div style="text-align: center; margin-bottom: 16px;">
          <h3 style="margin: 0; font-size: 18px; color: var(--theme-color-text);">${isSoulTravel ? '角色提取中...' : '剧情节点提取中...'}</h3>
          <p style="margin: 8px 0 0; font-size: 13px; color: var(--theme-color-secondary);">正在呼叫 AI 分析本章内容，请稍候</p>
        </div>
        <div style="display: flex; justify-content: center; padding: 20px 0;">
          <div style="width: 32px; height: 32px; border: 3px solid var(--theme-color-divider); border-top-color: var(--theme-color-primary); border-radius: 50%; animation: spin 1s linear infinite;"></div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    try {
      let analysisResult = null;
      if (isSoulTravel) {
         analysisResult = await this.extractSoulTravelCharacters(chapter);
      } else {
         analysisResult = await this.extractBodyTravelNodes(chapter);
      }

      if (!analysisResult || analysisResult.length === 0) {
        throw new Error('未能从本章中提取出有效信息，请尝试更换章节或重试。');
      }

      this.renderTravelSelectionModal(overlay, analysisResult, isSoulTravel);

    } catch (err) {
      console.error(err);
      overlay.remove();
      showModal({ title: '提取失败', content: err.message });
    }
  }

  async extractSoulTravelCharacters(chapter) {
    const globalWbEntries = await loadGlobalWorldbookEntriesForTextGame();
    const bookSettings = await getBookSettings(this.book.id);
    
    let contextStr = '';
    if (globalWbEntries && globalWbEntries.length > 0) {
      contextStr += '【全局设定】\n' + globalWbEntries.map(e => `[${e.name}]：${e.content}`).join('\n') + '\n\n';
    }
    if (bookSettings) {
      contextStr += '【书籍设定】\n';
      if (bookSettings.worldview) contextStr += `[世界观]：\n${bookSettings.worldview}\n`;
      if (bookSettings.characters) contextStr += `[已知角色]：\n${bookSettings.characters}\n`;
      contextStr += '\n';
    }

    const prompt = `${contextStr}请分析以下小说章节，提取出本章中出场或被提及的关键人物（必须大于2个）。
请严格按照以下 JSON 数组格式输出，不要输出任何多余内容或 markdown 标记：
[
  {
    "name": "角色姓名",
    "roleTag": "主角/配角/反派等",
    "identity": "具体身份背景",
    "corePlot": "该角色在本章的核心剧情或处境",
    "dilemma": "接下来面临的抉择或危机"
  }
]

小说名：《${this.book.name}》
本章内容片段：
${makeSnippet(chapter.content, 5000)}`;

    const response = await sendTextGameAiMessage([{ role: 'user', content: prompt }], { temperature: 0.3, maxTokens: 2000 });
    
    try {
      const match = response.match(/\[[\s\S]*\]/);
      if (!match) throw new Error('无法解析 AI 返回的 JSON 格式');
      return JSON.parse(match[0]);
    } catch (e) {
      throw new Error(`解析失败：${e.message}\nAI返回内容：${response.slice(0, 100)}...`);
    }
  }

  async extractBodyTravelNodes(chapter) {
    const globalWbEntries = await loadGlobalWorldbookEntriesForTextGame();
    const bookSettings = await getBookSettings(this.book.id);
    
    let contextStr = '';
    if (globalWbEntries && globalWbEntries.length > 0) {
      contextStr += '【全局设定】\n' + globalWbEntries.map(e => `[${e.name}]：${e.content}`).join('\n') + '\n\n';
    }
    if (bookSettings) {
      contextStr += '【书籍设定】\n';
      if (bookSettings.worldview) contextStr += `[世界观]：\n${bookSettings.worldview}\n`;
      if (bookSettings.chaptersSummary) contextStr += `[剧情主线]：\n${bookSettings.chaptersSummary}\n`;
      contextStr += '\n';
    }

    const prompt = `${contextStr}请分析以下小说章节，提取出 3 到 5 个最关键的剧情节点（可以切入的转折点或名场面）。
请严格按照以下 JSON 数组格式输出，不要输出任何多余内容或 markdown 标记：
[
  {
    "title": "节点短标题（如：初遇刺客、争夺灵宝）",
    "description": "该节点的剧情详情",
    "keyCharacters": "牵涉的关键人物",
    "entryPoint": "适合作为外部穿越者（身穿）突然降临或介入的契机"
  }
]

小说名：《${this.book.name}》
本章内容片段：
${makeSnippet(chapter.content, 5000)}`;

    const response = await sendTextGameAiMessage([{ role: 'user', content: prompt }], { temperature: 0.3, maxTokens: 2000 });
    
    try {
      const match = response.match(/\[[\s\S]*\]/);
      if (!match) throw new Error('无法解析 AI 返回的 JSON 格式');
      return JSON.parse(match[0]);
    } catch (e) {
      throw new Error(`解析失败：${e.message}\nAI返回内容：${response.slice(0, 100)}...`);
    }
  }

  renderTravelSelectionModal(overlay, list, isSoulTravel) {
    const close = () => {
      overlay.classList.remove('active');
      setTimeout(() => overlay.remove(), 240);
    };

    let itemsHtml = '';
    if (isSoulTravel) {
      itemsHtml = list.map((item, i) => `
        <div class="textgame-choice-card" style="width: 100%; text-align: left; margin-bottom: 12px; padding: 12px; height: auto;" data-select-index="${i}">
          <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px;">
            <b style="font-size: 16px;">${escapeHtml(item.name)}</b>
            <span style="font-size: 12px; color: #fff; background: var(--theme-color-primary); padding: 2px 6px; border-radius: 4px;">${escapeHtml(item.roleTag)}</span>
          </div>
          <div style="font-size: 13px; color: var(--theme-color-text); margin-bottom: 4px;"><strong>身份：</strong>${escapeHtml(item.identity)}</div>
          <div style="font-size: 13px; color: var(--theme-color-secondary); margin-bottom: 4px;"><strong>处境：</strong>${escapeHtml(item.corePlot)}</div>
          <div style="font-size: 13px; color: #e65100;"><strong>抉择：</strong>${escapeHtml(item.dilemma)}</div>
        </div>
      `).join('');
    } else {
      itemsHtml = list.map((item, i) => `
        <div class="textgame-choice-card" style="width: 100%; text-align: left; margin-bottom: 12px; padding: 12px; height: auto;" data-select-index="${i}">
          <div style="margin-bottom: 8px;">
            <b style="font-size: 16px; border-left: 3px solid var(--theme-color-primary); padding-left: 8px;">${escapeHtml(item.title)}</b>
          </div>
          <div style="font-size: 13px; color: var(--theme-color-text); margin-bottom: 4px;"><strong>牵涉：</strong>${escapeHtml(item.keyCharacters)}</div>
          <div style="font-size: 13px; color: var(--theme-color-secondary); margin-bottom: 4px;"><strong>详情：</strong>${escapeHtml(item.description)}</div>
          <div style="font-size: 13px; color: #e65100;"><strong>切入点：</strong>${escapeHtml(item.entryPoint)}</div>
        </div>
      `).join('');
    }

    overlay.innerHTML = `
      <div class="textgame-modal-container" style="width: 90vw; max-width: 500px; max-height: 85vh; display: flex; flex-direction: column; padding: 0;">
        <div class="textgame-travel-modal-head" style="padding: 16px;">
          <div class="textgame-section-title">${Icons.magic}<span>${isSoulTravel ? '选择魂穿对象' : '选择降临节点'}</span></div>
          <button class="textgame-travel-modal-close" data-action="close" title="关闭">${Icons.back}</button>
        </div>
        <div style="flex: 1; overflow-y: auto; padding: 0 16px 16px; background: rgba(0,0,0,0.02);">
          <div style="margin: 12px 0;">
             ${itemsHtml}
          </div>
        </div>
        <div style="padding: 16px; border-top: 1px solid var(--theme-color-divider); text-align: center; background: #fff;">
           <button class="textgame-reader-tool-card" data-action="confirm" style="width: 100%; max-width: 200px; margin: 0 auto; background: var(--theme-color-primary); color: #fff; padding: 12px; border-radius: 24px; font-weight: bold; opacity: 0.5; pointer-events: none;">生成剧情</button>
        </div>
      </div>
    `;

    overlay.querySelector('[data-action="close"]')?.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    let selectedData = null;
    let selectedType = isSoulTravel ? 'soul' : 'body';
    
    const confirmBtn = overlay.querySelector('[data-action="confirm"]');

    overlay.querySelectorAll('[data-select-index]').forEach((card) => {
      card.addEventListener('click', () => {
        overlay.querySelectorAll('[data-select-index]').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        selectedData = list[Number(card.dataset.selectIndex)];
        confirmBtn.style.opacity = '1';
        confirmBtn.style.pointerEvents = 'auto';
      });
    });

    confirmBtn.addEventListener('click', async () => {
      if (!selectedData) return;
      
      let finalCustomChoice = '';
      if (selectedType === 'soul') {
         finalCustomChoice = `(系统强制指令：用户决定魂穿成为【${selectedData.name}】。该角色当前身份是【${selectedData.identity}】，处境是【${selectedData.corePlot}】，面临的抉择是【${selectedData.dilemma}】。请直接以用户的视角接管该角色，展开后续剧情。)`;
      } else {
         finalCustomChoice = `(系统强制指令：用户决定以本体身穿降临到【${selectedData.title}】这一剧情节点。该节点详情：【${selectedData.description}】。切入契机：【${selectedData.entryPoint}】。请直接描写用户降临现场引发的变故，展开后续剧情。)`;
      }
      
      this.customChoice = finalCustomChoice;
      close();
      await this.startStoryRun();
    });
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
        <div class="textgame-book-setting-content" style="flex: 1; overflow-y: auto; padding: 0 16px 24px; margin-top: 16px;">
          
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
      
      // --- 重构的“递进式全书压缩提取算法” ---
      let sampleText = '';
      
      // 如果小说是散文式或未分章（只有1章或2章）
      if (this.chapters.length <= 3) {
        const fullContent = this.chapters.map(c => c.content).join('\n\n');
        // 分割成 10 个节点截取
        const sliceCount = 10;
        const sliceLength = 200;
        const step = Math.floor(fullContent.length / sliceCount);
        
        const slices = [];
        for (let i = 0; i < sliceCount; i++) {
           const start = i * step;
           slices.push(fullContent.slice(start, start + sliceLength));
        }
        
        sampleText = `【开头原文】\n${makeSnippet(fullContent, 3000)}\n\n` +
                     `【全书进程切片】\n${slices.join('\n...\n')}\n\n` +
                     `【结尾原文】\n${fullContent.slice(-1000)}`;
      } else {
        // 分章小说的智能首尾 + 大纲压缩
        const head = this.chapters.slice(0, 3); // 前 3 章
        const tail = this.chapters.slice(-1);   // 最后 1 章
        const mid = this.chapters.slice(3, -1); // 中间章节
        
        // 构建开局：3000字，结尾：1000字，中间：每章标题+100字
        const headText = head.map(c => `[${c.title}]\n${makeSnippet(c.content, 1000)}`).join('\n\n');
        const midText = mid.map(c => `[${c.title}] ${makeSnippet(c.content, 100).replace(/\n/g, ' ')}`).join('\n');
        const tailText = tail.map(c => `[${c.title}]\n${makeSnippet(c.content, 1000)}`).join('\n\n');
        
        sampleText = `【开局全文（用于提取第一人称主角及初始世界观）】\n${headText}\n\n` +
                     `【中间全书大纲脉络（梳理重要角色及剧情主线转折）】\n${midText}\n\n` +
                     `【结局全文（用于确认战力天花板及最终结局）】\n${tailText}`;
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
      const minInput = overlay.querySelector('[data-role="travel-word-min"]');
      const maxInput = overlay.querySelector('[data-role="travel-word-max"]');
      if (minInput && maxInput) {
        const min = Math.max(10, Number(minInput.value) || 600);
        const max = Math.max(min, Number(maxInput.value) || 1000);
        this.travelWordCount = [min, max];
      }
      
      await setTravelSettings({
        pronoun: this.selectedPronoun,
        actionOptions: this.actionOptions,
        travelWordCount: this.travelWordCount
      });
      
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
        if (group === 'pronoun') this.selectedPronoun = button.dataset.choiceId || 'second';
        this.renderTravelConfigOnly(overlay);
      });
    });

    overlay.querySelectorAll('[data-companion-id]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.companionId || '';
        this.selectedCompanionId = this.selectedCompanionId === id ? '' : id;
        this.renderTravelConfigOnly(overlay);
      });
    });

    overlay.querySelector('[data-action="toggle-companion-memory"]')?.addEventListener('click', () => {
      this.withCompanionMemory = !this.withCompanionMemory;
      this.renderTravelConfigOnly(overlay);
    });

    overlay.querySelectorAll('[data-action-index]').forEach((el) => {
      el.addEventListener('change', (e) => {
        const index = Number(e.target.dataset.actionIndex);
        const field = e.target.dataset.actionField;
        if (this.actionOptions[index]) {
          this.actionOptions[index][field] = e.target.value;
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
    const bookSettings = await getBookSettings(this.book.id);
    
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
      openingPrompt: this.buildOpeningPrompt(chapter, companion, memories, customChoice, globalWbEntries, bookSettings),
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
    const historyHtml = (this.activeRunData.chatHistory || []).map(msg => {
      if (msg.role === 'user') {
        return `<div style="text-align: right; margin-bottom: 12px;"><span style="display: inline-block; background: var(--theme-color-primary); color: #fff; padding: 8px 12px; border-radius: 12px 12px 0 12px;">${escapeHtml(msg.content)}</span></div>`;
      }
      
      let mainText = msg.content;
      let summaryHtml = '';
      
      const summaryMatch = mainText.match(/<<<SUMMARY_START>>>([\s\S]*?)<<<SUMMARY_END>>>/i);
      if (summaryMatch) {
        mainText = mainText.replace(summaryMatch[0], '').trim();
        const summaryText = summaryMatch[1].trim();
        if (summaryText) {
          summaryHtml = `
            <details style="margin-top: 8px; font-size: 13px; cursor: pointer; user-select: none;">
              <summary style="color: var(--theme-color-secondary); padding: 4px 8px; background: rgba(0,0,0,0.05); border-radius: 6px; display: inline-block;">
                <span style="vertical-align: middle;">展开本轮前情摘要</span>
              </summary>
              <div style="margin-top: 6px; padding: 8px; background: rgba(0,0,0,0.03); border-radius: 6px; border-left: 3px solid var(--theme-color-secondary); color: var(--theme-color-secondary); line-height: 1.5;">
                ${escapeHtml(summaryText).replace(/\n/g, '<br>')}
              </div>
            </details>
          `;
        }
      }
      
      // 提取 AI 生成的 4 个选项，不再正文中显示，改为弹窗或底部显示
      // 为防止正则过于严格导致匹配失败，此处直接用简单匹配并去除
      const optionsMatch = mainText.match(/<<<OPTIONS_START>>>([\s\S]*?)<<<OPTIONS_END>>>/i);
      if (optionsMatch) {
        mainText = mainText.replace(optionsMatch[0], '').trim();
        // 如果提取到了选项，将它们保存到 runData 中，用于顶部按钮点击时展示
        this.activeRunData.currentOptionsHtml = optionsMatch[1].trim();
      }
      
      return `<div style="text-align: left; margin-bottom: 12px;">
        <div style="display: inline-block; background: var(--theme-color-divider); color: var(--reader-color); padding: 8px 12px; border-radius: 12px 12px 12px 0; line-height: 1.6; max-width: 95%;">
          ${escapeHtml(mainText).replace(/\n/g, '<br>')}
          ${summaryHtml}
        </div>
      </div>`;
    }).join('');

    const runCount = this.activeRunData.roundCount || 1;
    const totalTokens = this.activeRunData.totalTokens || 0;
    const lastTokens = this.activeRunData.lastTokens || 0;

    this.container.innerHTML = `
      <div class="textgame-reader" style="--reader-bg:${escapeHtml(this.readerSettings.background)};--reader-color:${escapeHtml(this.readerSettings.color)};--reader-font-size:${this.readerSettings.fontSize}px; display: flex; flex-direction: column;">
        <div class="textgame-reader-toolbar" style="transform: translateY(0); display: flex; justify-content: space-between; align-items: center; padding: 0 12px;">
          <button class="textgame-reader-back" data-action="exit-run" aria-label="退出并结算" style="width: 32px; height: 32px; padding: 6px;">${Icons.close}</button>
          
          <div style="display: flex; flex-direction: column; align-items: center;">
            <div class="textgame-reader-title-box" style="font-size: 14px; max-width: 150px; text-align: center;">《${escapeHtml(this.book?.name?.replace(/\.txt$/i, ''))}》</div>
          </div>
          
          <button class="textgame-reader-tool-card" data-action="open-run-options" style="width: 32px; height: 32px; border-radius: 50%; background: var(--theme-color-primary); color: #fff; display: flex; align-items: center; justify-content: center; border: none; padding: 0;" aria-label="生成选项">
            ${Icons.list}
          </button>
        </div>
        
        <article class="textgame-reader-paper" style="flex: 1; overflow-y: auto; padding-bottom: 20px;" data-role="run-history">
          ${historyHtml || '<div style="text-align: center; color: var(--theme-color-secondary); margin-top: 40px; font-style: italic;">剧情推演中，请稍候...</div>'}
        </article>
        
      </div>
    `;
    
    const paper = this.container.querySelector('[data-role="run-history"]');
    if (paper) paper.scrollTop = paper.scrollHeight;
    
    this.container.querySelector('[data-action="exit-run"]')?.addEventListener('click', () => this.settleRun());
    this.container.querySelector('[data-action="open-run-options"]')?.addEventListener('click', () => this.openRunOptionsModal());
  }
  
  openRunOptionsModal() {
    if (!this.activeRunData) return;
    
    const runCount = this.activeRunData.roundCount || 1;
    const totalTokens = this.activeRunData.totalTokens || 0;
    const lastTokens = this.activeRunData.lastTokens || 0;
    
    // 解析 optionsHtml
    let parsedOptions = [];
    if (this.activeRunData.currentOptionsHtml) {
       // 尝试按数字或特定分隔符切分
       const rawArr = this.activeRunData.currentOptionsHtml.split(/\n(?:[1-4]\.|【选项[1-4]】|-)\s*/).filter(s => s.trim());
       parsedOptions = rawArr.map(s => s.trim().replace(/^[:：]/, '').trim());
    }
    // 兜底补齐或截断
    while(parsedOptions.length < 4) parsedOptions.push('（无明确选项建议，请使用底部自定义输入）');
    if (parsedOptions.length > 4) parsedOptions = parsedOptions.slice(0, 4);

    const overlay = document.createElement('div');
    overlay.className = 'textgame-modal-overlay active';
    overlay.innerHTML = `
      <div class="textgame-modal-container" style="width: 90vw; max-width: 500px; padding: 0; display: flex; flex-direction: column;">
        <div class="textgame-travel-modal-head" style="padding: 16px; border-bottom: 1px solid var(--theme-color-divider);">
          <div style="display: flex; flex-direction: column;">
             <span style="font-weight: bold; font-size: 16px;">第 ${runCount} 轮推进</span>
             <span style="font-size: 12px; color: var(--theme-color-secondary);">当前累计耗费 ${totalTokens} Tokens (本轮 ${lastTokens})</span>
          </div>
          <button class="textgame-travel-modal-close" data-action="close" title="关闭">${Icons.back}</button>
        </div>
        
        <div style="padding: 16px; flex: 1; overflow-y: auto;">
          <div style="font-size: 14px; font-weight: bold; margin-bottom: 12px;">请选择接下来的行动：</div>
          
          <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px;">
            ${parsedOptions.map((opt, i) => `
              <button class="textgame-choice-card" data-action="select-option" data-option-val="${escapeHtml(opt)}" style="text-align: left; padding: 12px; height: auto; display: flex; align-items: flex-start; gap: 8px;">
                 <span style="font-weight: bold; color: var(--theme-color-primary); flex-shrink: 0;">${i+1}.</span>
                 <span style="font-size: 14px; line-height: 1.5; color: var(--theme-color-text);">${escapeHtml(opt)}</span>
              </button>
            `).join('')}
          </div>
          
          <div style="border-top: 1px dashed var(--theme-color-divider); padding-top: 16px;">
            <div style="font-size: 14px; font-weight: bold; margin-bottom: 8px;">或输入自定义走向：</div>
            <textarea data-role="custom-input" placeholder="例如：拔剑指向对方，质问他的目的。" style="width: 100%; min-height: 80px; padding: 12px; border: 1px solid var(--theme-color-divider); border-radius: 12px; background: rgba(0,0,0,0.02); resize: vertical; outline: none; font-size: 14px; color: var(--theme-color-text);"></textarea>
          </div>
        </div>
        
        <div style="padding: 16px; border-top: 1px solid var(--theme-color-divider);">
          <button class="textgame-reader-tool-card" data-action="send-custom" style="width: 100%; background: var(--theme-color-primary); color: #fff; border-radius: 24px; padding: 12px; font-weight: bold; font-size: 15px;">生成后续剧情</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(overlay);

    const close = () => {
      overlay.classList.remove('active');
      setTimeout(() => overlay.remove(), 240);
    };

    overlay.querySelector('[data-action="close"]')?.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    
    overlay.querySelectorAll('[data-action="select-option"]').forEach(btn => {
       btn.addEventListener('click', () => {
          const val = btn.dataset.optionVal;
          close();
          this.advanceRunPlot(val);
       });
    });
    
    overlay.querySelector('[data-action="send-custom"]')?.addEventListener('click', () => {
       const val = overlay.querySelector('[data-role="custom-input"]')?.value?.trim();
       if (!val) {
          showModal({ title: '提示', content: '请输入自定义剧情走向。' });
          return;
       }
       close();
       this.advanceRunPlot(val);
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
      
      // --- 滑动窗口内存管理 ---
      // 1. 分离最近对话（保留最多 3 轮完整的旧对话，即 6 条，加上刚进入的这一条用户操作，最多 7 条）
      const MAX_RECENT_MSGS = 7;
      const historyLength = this.activeRunData.chatHistory.length;
      
      const recentMsgs = this.activeRunData.chatHistory.slice(-MAX_RECENT_MSGS);
      const oldMsgs = historyLength > MAX_RECENT_MSGS ? this.activeRunData.chatHistory.slice(0, historyLength - MAX_RECENT_MSGS) : [];
      
      // 2. 从被挤出滑动窗口的旧对话中，提取 AI 曾经生成的摘要，拼接成前情提要
      const oldSummaries = [];
      oldMsgs.forEach(msg => {
        if (msg.role === 'assistant') {
           const match = msg.content.match(/<<<SUMMARY_START>>>([\s\S]*?)<<<SUMMARY_END>>>/i);
           if (match && match[1].trim()) oldSummaries.push(match[1].trim());
        }
      });
      const summaryContext = oldSummaries.length > 0 
        ? `\n【前情提要（被折叠的旧剧情缩影）】\n${oldSummaries.join('\n')}\n------------------------\n`
        : '';
        
      // 3. 构建发送给 AI 的最近对话（去除其中可能存在的旧摘要格式，避免干扰 AI）
      const recentContext = recentMsgs.map(m => {
        let cleanText = m.content;
        if (m.role === 'assistant') {
           cleanText = cleanText.replace(/<<<SUMMARY_START>>>[\s\S]*?<<<SUMMARY_END>>>/gi, '').trim();
        }
        return `${m.role === 'user' ? '用户：' : '系统推演：'}${cleanText}`;
      }).join('\n\n');

      // 组装选项生成规则
      const optionsRuleStr = this.actionOptions.map((opt, i) => `选项${i+1} [${opt.title}]：${opt.content}`).join('\n');
      
      const actionPrompt = userAction === '【系统】梦境连接已建立，剧情开始推演...' 
        ? `这是开局。请根据全局背景与本章原文，直接推演并输出第一段开场剧情。然后，严格按照以下规则生成 4 个行动选项：\n${optionsRuleStr}` 
        : `用户刚才执行了：${userAction}。请严格根据前情提要和最近对话的发展逻辑，续写剧情反应。然后，严格按照以下规则生成 4 个行动选项：\n${optionsRuleStr}`;

      const prompt = `
【全局与底层上下文背景】
${this.activeRunData.openingPrompt}
${summaryContext}
【最近互动长剧情】
${recentContext}

【你的任务】
${actionPrompt}

【强制输出格式要求】
1. 前面部分自由输出剧情正文。
2. 随后，使用 <<<OPTIONS_START>>> 和 <<<OPTIONS_END>>> 标签包裹生成的 4 个行动选项内容。
3. 在输出的**绝对末尾**，你必须用 <<<SUMMARY_START>>> 和 <<<SUMMARY_END>>> 标签，将【你本次推演的这段剧情】用一句话总结成精简摘要。

输出格式示例：
(你的剧情正文...)
<<<OPTIONS_START>>>
1. 【推剧情】...
2. 【造转折】...
3. 【暧昧升温】...
4. 【自定义要求对应的行动】...
<<<OPTIONS_END>>>
<<<SUMMARY_START>>>
主角尝试隐藏身份潜入，但不慎引起了守卫的怀疑。
<<<SUMMARY_END>>>
`;
      
      const aiResponseObj = await sendTextGameAiMessage([{ role: 'user', content: prompt }], { temperature: 0.7, maxTokens: 4000 }, true);
      const response = aiResponseObj.content || aiResponseObj;
      const usage = aiResponseObj.usage || { total_tokens: 0 };
      
      this.activeRunData.chatHistory.push({ role: 'assistant', content: response });
      
      this.activeRunData.roundCount = (this.activeRunData.roundCount || 1) + 1;
      this.activeRunData.lastTokens = usage.total_tokens || 0;
      this.activeRunData.totalTokens = (this.activeRunData.totalTokens || 0) + (usage.total_tokens || 0);
      
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
          .map(m => m.content.replace(/<<<SUMMARY_START>>>[\s\S]*?<<<SUMMARY_END>>>/gi, '').trim())
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

  buildOpeningPrompt(chapter, companion, memories, customChoice, globalWbEntries = [], bookSettings = null) {
    const plotInstruction = this.selectedPlotMode === 'canon'
      ? '优先保持原著关键事件、人物动机和时间线；当用户选择干预时，再产生合理蝴蝶效应。'
      : '允许根据用户行动改写后续剧情，但需要保留小说世界观和人物性格的连续性。';

    const travelInstruction = this.selectedTravelMode === 'soul'
      ? '用户选择魂穿：让用户穿成当前情节中的某个合适人物，以该人物身份、处境和社会关系继续。'
      : '用户选择身穿：让用户以梦笺主页选择的面具本体进入小说现场，并处理身份暴露风险。';
      
    const pronounInstruction = this.selectedPronoun === 'second'
      ? '【人称要求】：在描写剧情时，必须使用第二人称“你”来称呼和描写用户的行为与心理。同行联系人始终使用第三人称描写。'
      : '【人称要求】：在描写剧情时，必须使用第三人称来称呼和描写用户的行为与心理（使用用户的名字或代词）。同行联系人始终使用第三人称描写。';

    const lines = [];
    
    if (globalWbEntries && globalWbEntries.length > 0) {
      lines.push('【全局世界书设定补充】');
      globalWbEntries.forEach(e => lines.push(`[${e.name}]：${e.content}`));
      lines.push('------------------------');
    }
    
    if (bookSettings) {
      lines.push('【小说专属设定提取】');
      if (bookSettings.worldview) lines.push(`[世界观档案]：\n${bookSettings.worldview}`);
      if (bookSettings.chaptersSummary) lines.push(`[全书剧情主线]：\n${bookSettings.chaptersSummary}`);
      if (bookSettings.characters) lines.push(`[全书重要角色]：\n${bookSettings.characters}`);
      lines.push('------------------------');
    }

    lines.push(
      `小说：《${this.book.name}》`,
      `章节/故事点：${chapter.title}`,
      `本章原文片段：\n${makeSnippet(chapter.content, 4000)}`,
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
      pronounInstruction,
      '请以文游方式推进：先叙事，再按规则生成 4 个可选行动。'
    );
    
    return lines.join('\n');
  }
}
