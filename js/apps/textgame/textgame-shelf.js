/**
 * ==========================================================================
 * [区域标注·已完成·梦笺书架页面]
 * 说明：
 * 1. 负责 3x3 书架网格渲染、本地 TXT 文件导入与解析（已完成：导入前提供应用内编码预览选择，避免自动识别仍误判乱码）。
 * 2. 已完成：长按书架书籍打开梦笺应用内管理弹窗，可重命名/删除；短按仍进入阅读器。
 * 3. 书籍正文完整写入 textgame-store.js → DB.js / IndexedDB，不做长文本过滤，不写浏览器存储兜底。
 * ==========================================================================
 */

import { Icons, escapeHtml, showModal } from './textgame-ui.js';
import { getBooks, addBook, renameBook, deleteBook, getTextGameSettings, setTextGameApiProfile } from './textgame-store.js';
import { getSettingsPrimaryApiPresetsForTextGame } from './textgame-api.js';

/* ==========================================================================
   [区域标注·已完成·梦笺 TXT 编码识别]
   说明：
   1. 仅负责导入阶段的 ArrayBuffer 解码，不涉及任何持久化存储。
   2. 优先识别 UTF BOM；无 BOM 时固定显示 UTF-8 / GB18030 / GBK / Big5 / UTF-16 预览，由用户在应用内弹窗确认。
   3. 不使用 localStorage/sessionStorage，不过滤长文本，解码后的完整正文继续交给 IndexedDB 存储链路。
   ========================================================================== */
function decodeTextFileBuffer(buffer) {
  const bytes = new Uint8Array(buffer);

  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.slice(3));
  }

  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.slice(2));
  }

  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.slice(2));
  }

  return buildTextDecodeCandidates(buffer)[0]?.text || '';
}

function decodeTextByEncoding(buffer, encoding, { fatal = false } = {}) {
  return new TextDecoder(encoding, { fatal }).decode(buffer);
}

function makePreviewText(text, max = 110) {
  const normalized = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const paragraphs = normalized
    .split(/\n\s*\n+/)
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const firstParagraph = paragraphs[0] || normalized
    .split('\n')
    .map((item) => item.trim())
    .find(Boolean) || '';
  return firstParagraph.length > max ? `${firstParagraph.slice(0, max)}…` : firstParagraph || '（空白内容）';
}

function scoreDecodedTextForPreview(text, encoding) {
  const value = String(text || '');
  const replacementCount = (value.match(/\uFFFD/g) || []).length;
  const mojibakeCount = (value.match(/[锟斤拷ÃÂÐÑ]/g) || []).length;
  const controlCount = (value.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g) || []).length;
  const cjkCount = (value.match(/[\u4e00-\u9fff]/g) || []).length;
  const punctuationCount = (value.match(/[，。！？、；：“”‘’（）《》]/g) || []).length;

  return replacementCount * 100
    + mojibakeCount * 35
    + controlCount * 40
    - cjkCount * 0.25
    - punctuationCount * 0.18
    + (encoding === 'utf-8' ? 0 : 2);
}

function buildTextDecodeCandidates(buffer) {
  const encodings = ['utf-8', 'gb18030', 'gbk', 'big5', 'utf-16le', 'utf-16be'];

  return encodings.map((encoding) => {
    try {
      const text = encoding === 'utf-8'
        ? decodeUtf8ForPreview(buffer)
        : decodeTextByEncoding(buffer, encoding);
      return {
        encoding,
        label: getEncodingLabel(encoding),
        text,
        preview: makePreviewText(text),
        score: scoreDecodedTextForPreview(text, encoding)
      };
    } catch (err) {
      const text = '';
      return {
        encoding,
        label: getEncodingLabel(encoding),
        text,
        preview: '当前浏览器不支持此编码预览',
        score: Number.POSITIVE_INFINITY
      };
    }
  });
}

function decodeUtf8ForPreview(buffer) {
  try {
    return decodeTextByEncoding(buffer, 'utf-8', { fatal: true });
  } catch (err) {
    return decodeTextByEncoding(buffer, 'utf-8');
  }
}

function getEncodingLabel(encoding) {
  const labels = {
    'utf-8': 'UTF-8',
    gb18030: '简体中文 GB18030',
    gbk: '简体中文 GBK',
    big5: '繁体中文 Big5',
    'utf-16le': 'UTF-16 LE',
    'utf-16be': 'UTF-16 BE'
  };
  return labels[encoding] || encoding;
}

export class TextGameShelf {
  constructor(container, { onOpenBook } = {}) {
    this.container = container;
    this.onOpenBook = onOpenBook;
    this.fileInput = null;
    this.books = [];
    this.longPressTimer = null;
    this.longPressTriggered = false;
  }

  async render() {
    this.container.innerHTML = `<div class="textgame-shelf-grid" id="textgame-shelf-grid"></div>`;

    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.accept = '.txt';
    this.fileInput.className = 'textgame-hidden-file';
    this.container.appendChild(this.fileInput);

    this.fileInput.addEventListener('change', this.handleFileSelect.bind(this));

    await this.loadBooks();
  }

  async loadBooks() {
    this.books = await getBooks();
    this.renderGrid();
  }

  renderGrid() {
    const grid = this.container.querySelector('#textgame-shelf-grid');
    if (!grid) return;

    if (this.books.length === 0) {
      grid.style.display = 'none';

      let emptyState = this.container.querySelector('.textgame-empty-state');
      if (!emptyState) {
        emptyState = document.createElement('div');
        emptyState.className = 'textgame-empty-state';
        emptyState.innerHTML = `
          ${Icons.emptyFolder}
          <p>书架空空如也<br>点击右上角导入 TXT 小说</p>
        `;
        this.container.appendChild(emptyState);
      }
      return;
    }

    grid.style.display = 'grid';
    const emptyState = this.container.querySelector('.textgame-empty-state');
    if (emptyState) emptyState.remove();

    grid.innerHTML = this.books.map(book => `
      <div class="textgame-book-item" data-id="${escapeHtml(book.id)}">
        <div class="textgame-book-cover" data-action="open-book" data-id="${escapeHtml(book.id)}">
          <div class="textgame-book-cover-text">${escapeHtml(book.coverText || '书')}</div>
          <div class="textgame-book-progress"><span style="width:${Math.max(0, Math.min(100, Number(book.progress || 0) * 100))}%"></span></div>
        </div>
        <div class="textgame-book-title">${escapeHtml(String(book.name || '').replace(/\.txt$/i, ''))}</div>
      </div>
    `).join('');

    /* ==========================================================================
       [区域标注·已完成·梦笺书架长按管理]
       说明：
       1. 短按书籍封面进入阅读器；长按书籍打开应用内管理弹窗，可重命名/删除。
       2. 不使用浏览器原生 prompt/confirm；重命名与删除只调用 IndexedDB 存储层。
       ========================================================================== */
    grid.querySelectorAll('[data-action="open-book"]').forEach((item) => {
      const clearLongPress = () => {
        if (this.longPressTimer) {
          clearTimeout(this.longPressTimer);
          this.longPressTimer = null;
        }
      };

      item.addEventListener('pointerdown', () => {
        clearLongPress();
        this.longPressTriggered = false;
        const book = this.books.find(b => b.id === item.dataset.id);
        if (!book) return;
        this.longPressTimer = setTimeout(() => {
          this.longPressTriggered = true;
          this.openBookManageModal(book);
        }, 560);
      });

      item.addEventListener('pointerup', clearLongPress);
      item.addEventListener('pointerleave', clearLongPress);
      item.addEventListener('pointercancel', clearLongPress);

      item.addEventListener('click', () => {
        if (this.longPressTriggered) {
          this.longPressTriggered = false;
          return;
        }
        const book = this.books.find(b => b.id === item.dataset.id);
        if (book) this.onOpenBook?.(book);
      });
    });
  }

  openBookManageModal(book) {
    const existing = document.querySelector('.textgame-book-manage-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'textgame-modal-overlay textgame-book-manage-modal-overlay';
    overlay.innerHTML = `
      <div class="textgame-modal-container textgame-book-manage-modal-container">
        <div class="textgame-book-manage-head">
          <div class="textgame-book-manage-title">${Icons.book}<span>管理小说</span></div>
          <button class="textgame-book-manage-close" data-action="close-book-manage" title="关闭">${Icons.back}</button>
        </div>
        <div class="textgame-book-manage-cover">
          <div>${escapeHtml(book.coverText || '书')}</div>
          <strong>${escapeHtml(String(book.name || '').replace(/\.txt$/i, ''))}</strong>
        </div>
        <label class="textgame-form-label" for="textgame-rename-book-input">重命名</label>
        <input class="textgame-form-input" id="textgame-rename-book-input" data-role="rename-input" value="${escapeHtml(String(book.name || '').replace(/\.txt$/i, ''))}" maxlength="80">
        <div class="textgame-book-manage-actions">
          <button class="textgame-start-run-btn" data-action="confirm-rename-book">${Icons.edit}<span>确认重命名</span></button>
          <button class="textgame-danger-btn" data-action="confirm-delete-book">${Icons.delete}<span>删除小说</span></button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('active'));

    const close = () => {
      overlay.classList.remove('active');
      setTimeout(() => overlay.remove(), 240);
    };

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close();
    });
    overlay.querySelector('.textgame-book-manage-modal-container')?.addEventListener('click', (event) => {
      if (!event.target.closest('button')) {
        event.stopPropagation();
      }
    });

    overlay.querySelector('[data-action="close-book-manage"]')?.addEventListener('click', close);
    overlay.querySelector('[data-action="confirm-rename-book"]')?.addEventListener('click', async () => {
      const input = overlay.querySelector('[data-role="rename-input"]');
      const nextName = String(input?.value || '').trim();
      try {
        await renameBook(book.id, nextName);
        close();
        await this.loadBooks();
      } catch (err) {
        showModal({ title: '重命名失败', content: escapeHtml(err.message || '无法重命名该小说。') });
      }
    });

    overlay.querySelector('[data-action="confirm-delete-book"]')?.addEventListener('click', () => {
      showModal({
        title: '确认删除',
        content: `确定要从书架移除《${escapeHtml(book.name)}》吗？关联的穿书存档也会一起移除。`,
        showCancel: true,
        confirmText: '确认删除',
        cancelText: '取消',
        onConfirm: async () => {
          await deleteBook(book.id);
          close();
          await this.loadBooks();
        }
      });
    });
  }

  triggerImport() {
    if (this.fileInput) {
      this.fileInput.click();
    }
  }

  /* ==========================================================================
     [区域标注·已完成·梦笺书架 API 配置弹窗]
     说明：
     1. 书架页“API配置”按钮读取设置应用主 API 已保存预设，只在梦笺应用内展示。
     2. 选中预设后复制到梦笺自身 settings.apiProfile，并通过 textgame-store.js → DB.js / IndexedDB 保存。
     3. 梦笺后续 AI 调用只使用该副本；不修改设置应用和其它应用 API，不使用 localStorage/sessionStorage。
     ========================================================================== */
  async openApiConfigModal() {
    const existing = document.querySelector('.textgame-api-modal-overlay');
    if (existing) existing.remove();

    let presets = [];
    let settings = null;
    try {
      [presets, settings] = await Promise.all([
        getSettingsPrimaryApiPresetsForTextGame(),
        getTextGameSettings()
      ]);
    } catch (err) {
      showModal({ title: 'API配置', content: escapeHtml(err.message || '无法读取 API 预设。') });
      return;
    }

    const currentProfileId = String(settings?.apiProfile?.id || '');

    const overlay = document.createElement('div');
    overlay.className = 'textgame-modal-overlay textgame-api-modal-overlay active';
    overlay.innerHTML = `
      <div class="textgame-modal-container textgame-api-modal-container">
        <div class="textgame-api-modal-head">
          <div class="textgame-api-modal-title">${Icons.setting}<span>API配置</span></div>
          <button class="textgame-api-modal-close" data-action="close-api-modal" title="关闭">${Icons.back}</button>
        </div>
        <div class="textgame-api-preset-list">
          ${presets.length ? presets.map((preset) => `
            <button class="textgame-api-preset-card ${preset.id === currentProfileId ? 'active' : ''}" data-api-preset-id="${escapeHtml(preset.id)}">
              <span>${Icons.setting}</span>
              <b>${escapeHtml(preset.name)}</b>
              <em>${escapeHtml(preset.model)}</em>
              ${preset.id === currentProfileId ? `<i>${Icons.check}</i>` : ''}
            </button>
          `).join('') : `
            <div class="textgame-empty-mini">${Icons.setting}<span>暂无主 API 预设</span></div>
          `}
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
    overlay.querySelector('.textgame-api-modal-container')?.addEventListener('click', (event) => event.stopPropagation());
    overlay.querySelector('[data-action="close-api-modal"]')?.addEventListener('click', close);

    overlay.querySelectorAll('[data-api-preset-id]').forEach((button) => {
      button.addEventListener('click', async () => {
        const preset = presets.find((item) => item.id === button.dataset.apiPresetId);
        if (!preset) return;

        try {
          await setTextGameApiProfile(preset);
          close();
          showModal({ title: 'API配置', content: `已选择：${escapeHtml(preset.name)}` });
        } catch (err) {
          showModal({ title: '保存失败', content: escapeHtml(err.message || '无法保存 API 配置。') });
        }
      });
    });
  }


  async handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    event.target.value = '';

    if (!file.name.toLowerCase().endsWith('.txt')) {
      showModal({ title: '格式错误', content: '目前仅支持导入 txt 格式文件。' });
      return;
    }

    const reader = new FileReader();

    reader.onload = async (e) => {
      const buffer = e.target.result;
      this.openEncodingImportModal(file, buffer);
    };

    reader.onerror = () => {
      showModal({ title: '读取失败', content: '无法读取文件内容。' });
    };

    reader.readAsArrayBuffer(file);
  }

  /* ==========================================================================
     [区域标注·已完成·梦笺 TXT 编码预览导入弹窗]
     说明：
     1. 自动识别无法覆盖所有 TXT 来源；这里改为导入前固定显示多个编码的第一段预览。
     2. 用户可在梦笺应用内弹窗中选择正确预览后再写入 IndexedDB，避免乱码正文被保存。
     3. 弹窗不使用浏览器原生选择器，不使用 localStorage/sessionStorage，不做长文本过滤。
     ========================================================================== */
  openEncodingImportModal(file, buffer) {
    const candidates = buildTextDecodeCandidates(buffer);
    const suggestedCandidate = [...candidates].sort((a, b) => a.score - b.score)[0];
    let selectedEncoding = suggestedCandidate?.encoding || 'utf-8';

    const existing = document.querySelector('.textgame-encoding-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'textgame-modal-overlay textgame-encoding-modal-overlay';

    const renderOptions = () => candidates.map((candidate) => `
      <button class="textgame-encoding-option ${candidate.encoding === selectedEncoding ? 'active' : ''}" data-encoding="${escapeHtml(candidate.encoding)}">
        <span class="textgame-encoding-name">${escapeHtml(candidate.label)}</span>
        <span class="textgame-encoding-preview">${escapeHtml(candidate.preview)}</span>
      </button>
    `).join('');

    overlay.innerHTML = `
      <div class="textgame-modal-container textgame-encoding-modal-container">
        <div class="textgame-encoding-modal-head">
          <div class="textgame-encoding-modal-title">${Icons.book}<span>选择 TXT 编码</span></div>
          <button class="textgame-encoding-modal-close" data-action="close-encoding-modal" title="取消">${Icons.back}</button>
        </div>
        <div class="textgame-encoding-tip">
          如果预览仍是乱码，请点选其它编码；确认后才会保存到梦笺书架。
        </div>
        <div class="textgame-encoding-list" data-role="encoding-list">
          ${renderOptions()}
        </div>
        <button class="textgame-start-run-btn" data-action="confirm-encoding-import">${Icons.check}<span>确认导入</span></button>
      </div>
    `;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('active'));

    const close = () => {
      overlay.classList.remove('active');
      setTimeout(() => overlay.remove(), 240);
    };

    const bindOptionEvents = () => {
      overlay.querySelectorAll('.textgame-encoding-option').forEach((button) => {
        button.addEventListener('click', () => {
          selectedEncoding = button.dataset.encoding || selectedEncoding;
          const list = overlay.querySelector('[data-role="encoding-list"]');
          if (list) {
            list.innerHTML = renderOptions();
            bindOptionEvents();
          }
        });
      });
    };

    bindOptionEvents();

    overlay.querySelector('[data-action="close-encoding-modal"]')?.addEventListener('click', close);

    overlay.querySelector('[data-action="confirm-encoding-import"]')?.addEventListener('click', async () => {
      const candidate = candidates.find((item) => item.encoding === selectedEncoding) || candidates[0];
      if (!candidate) {
        showModal({ title: '导入失败', content: '无法解析该 TXT 文件。' });
        close();
        return;
      }

      try {
        await addBook({
          name: file.name,
          content: candidate.text,
          size: file.size
        });
        close();
        showModal({ title: '导入成功', content: `《${escapeHtml(file.name)}》已按 ${escapeHtml(candidate.label)} 添加到书架。` });
        await this.loadBooks();
      } catch (err) {
        close();
        showModal({ title: '导入失败', content: escapeHtml(err.message || '无法导入该文件。') });
      }
    });
  }
}
