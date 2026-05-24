/**
 * ==========================================================================
 * [区域标注·已完成·梦笺书架页面]
 * 说明：
 * 1. 负责 3x3 书架网格渲染、本地 TXT 文件导入与解析（已完成：导入前提供应用内编码预览选择，避免自动识别仍误判乱码）。
 * 2. 点击书籍进入 TXT 阅读器；删除使用梦笺自定义弹窗，不使用浏览器原生弹窗。
 * 3. 书籍正文完整写入 textgame-store.js → DB.js / IndexedDB，不做长文本过滤，不写浏览器存储兜底。
 * ==========================================================================
 */

import { Icons, escapeHtml, showModal } from './textgame-ui.js';
import { getBooks, addBook, deleteBook } from './textgame-store.js';

/* ==========================================================================
   [区域标注·已完成·梦笺 TXT 编码识别]
   说明：
   1. 仅负责导入阶段的 ArrayBuffer 解码，不涉及任何持久化存储。
   2. 优先识别 UTF BOM；无 BOM 时生成 UTF-8 / GB18030 / GBK / Big5 等候选预览，由用户在应用内弹窗确认。
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

function makePreviewText(text, max = 260) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return value.length > max ? `${value.slice(0, max)}…` : value || '（空白内容）';
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
  const candidates = [];

  encodings.forEach((encoding) => {
    try {
      const text = decodeTextByEncoding(buffer, encoding, { fatal: encoding === 'utf-8' });
      candidates.push({
        encoding,
        label: getEncodingLabel(encoding),
        text,
        preview: makePreviewText(text),
        score: scoreDecodedTextForPreview(text, encoding)
      });
    } catch (err) {
      // 当前编码无法严格解码时跳过，由其它候选继续提供预览。
    }
  });

  return candidates
    .filter((candidate, index, list) => list.findIndex((item) => item.text === candidate.text) === index)
    .sort((a, b) => a.score - b.score);
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
        <button class="textgame-book-delete" data-action="delete-book" data-id="${escapeHtml(book.id)}" title="删除">${Icons.delete}</button>
        <div class="textgame-book-cover" data-action="open-book" data-id="${escapeHtml(book.id)}">
          <div class="textgame-book-cover-text">${escapeHtml(book.coverText || '书')}</div>
          <div class="textgame-book-progress"><span style="width:${Math.max(0, Math.min(100, Number(book.progress || 0) * 100))}%"></span></div>
        </div>
        <div class="textgame-book-title">${escapeHtml(String(book.name || '').replace(/\.txt$/i, ''))}</div>
      </div>
    `).join('');

    grid.querySelectorAll('[data-action="open-book"]').forEach((item) => {
      item.addEventListener('click', () => {
        const book = this.books.find(b => b.id === item.dataset.id);
        if (book) this.onOpenBook?.(book);
      });
    });

    grid.querySelectorAll('[data-action="delete-book"]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const bookId = button.dataset.id;
        const book = this.books.find(b => b.id === bookId);
        if (!book) return;

        showModal({
          title: '确认删除',
          content: `确定要从书架移除《${escapeHtml(book.name)}》吗？关联的穿书存档也会一起移除。`,
          showCancel: true,
          confirmText: '确认删除',
          cancelText: '取消',
          onConfirm: async () => {
            await deleteBook(bookId);
            await this.loadBooks();
          }
        });
      });
    });
  }

  triggerImport() {
    if (this.fileInput) {
      this.fileInput.click();
    }
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
     1. 自动识别无法覆盖所有 TXT 来源；这里改为导入前显示多个编码预览。
     2. 用户可在梦笺应用内弹窗中选择正确预览后再写入 IndexedDB，避免乱码正文被保存。
     3. 弹窗不使用浏览器原生选择器，不使用 localStorage/sessionStorage，不做长文本过滤。
     ========================================================================== */
  openEncodingImportModal(file, buffer) {
    const candidates = buildTextDecodeCandidates(buffer);
    let selectedEncoding = candidates[0]?.encoding || 'utf-8';

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
