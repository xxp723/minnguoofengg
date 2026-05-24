/**
 * ==========================================================================
 * [区域标注·已完成·梦笺书架页面]
 * 说明：
 * 1. 负责 3x3 书架网格渲染、本地 TXT 文件导入与解析（已完成：自动识别 BOM / UTF-8 / GBK-ANSI，降低乱码概率）。
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
   2. 优先识别 UTF BOM；无 BOM 时在 UTF-8 与 GBK/ANSI 之间按乱码评分择优。
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

  const candidates = [];
  try {
    candidates.push({
      encoding: 'utf-8',
      text: new TextDecoder('utf-8', { fatal: true }).decode(buffer)
    });
  } catch (err) {
    candidates.push({
      encoding: 'utf-8',
      text: new TextDecoder('utf-8').decode(buffer)
    });
  }

  candidates.push({
    encoding: 'gbk',
    text: new TextDecoder('gbk').decode(buffer)
  });

  return candidates
    .map((candidate) => ({ ...candidate, score: scoreDecodedText(candidate.text, candidate.encoding) }))
    .sort((a, b) => a.score - b.score)[0]?.text || '';
}

function scoreDecodedText(text, encoding) {
  const value = String(text || '');
  const replacementCount = (value.match(/\uFFFD/g) || []).length;
  const suspiciousCount = (value.match(/[锟斤拷]/g) || []).length;
  const cjkCount = (value.match(/[\u4e00-\u9fff]/g) || []).length;
  const mojibakeCount = (value.match(/[ÃÂÐÑ]/g) || []).length;
  const controlCount = (value.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g) || []).length;

  return replacementCount * 80
    + suspiciousCount * 25
    + mojibakeCount * 12
    + controlCount * 30
    - cjkCount * 0.18
    + (encoding === 'utf-8' ? 0 : 1);
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
      const text = decodeTextFileBuffer(buffer);

      try {
        await addBook({
          name: file.name,
          content: text,
          size: file.size
        });
        showModal({ title: '导入成功', content: `《${escapeHtml(file.name)}》已添加到书架。` });
        await this.loadBooks();
      } catch (err) {
        showModal({ title: '导入失败', content: escapeHtml(err.message || '无法导入该文件。') });
      }
    };

    reader.onerror = () => {
      showModal({ title: '读取失败', content: '无法读取文件内容。' });
    };

    reader.readAsArrayBuffer(file);
  }
}
