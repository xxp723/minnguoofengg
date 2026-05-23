/**
 * ==========================================================================
 * [区域标注·本次需求·梦笺书架页面]
 * 说明：负责书架网格渲染、本地 TXT 文件导入与解析（支持 GBK / UTF-8）
 * ==========================================================================
 */

import { Icons, showModal } from './textgame-ui.js';
import { getBooks, addBook, deleteBook } from './textgame-store.js';

export class TextGameShelf {
  constructor(container) {
    this.container = container;
    this.fileInput = null;
    this.books = [];
  }

  async render() {
    this.container.innerHTML = `<div class="textgame-shelf-grid" id="textgame-shelf-grid"></div>`;
    
    // 初始化隐藏的文件输入框
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
          <p>书架空空如也<br>点击右上角导入书籍</p>
        `;
        this.container.appendChild(emptyState);
      }
      return;
    }

    grid.style.display = 'grid';
    const emptyState = this.container.querySelector('.textgame-empty-state');
    if (emptyState) emptyState.remove();

    grid.innerHTML = this.books.map(book => `
      <div class="textgame-book-item" data-id="${book.id}">
        <div class="textgame-book-cover">
          <div class="textgame-book-cover-text">${book.coverText}</div>
        </div>
        <div class="textgame-book-title">${book.name.replace('.txt', '')}</div>
      </div>
    `).join('');

    // 绑定长按删除事件（由于暂无长按指令，此处简化为点击询问打开还是删除，实际可后续在手势库里补充）
    const items = grid.querySelectorAll('.textgame-book-item');
    items.forEach(item => {
      item.addEventListener('click', () => {
        const bookId = item.dataset.id;
        const book = this.books.find(b => b.id === bookId);
        
        showModal({
          title: '书籍操作',
          content: `要对《${book.name}》进行什么操作？`,
          showCancel: true,
          confirmText: '开始阅读',
          cancelText: '删除书籍',
          onConfirm: () => {
             showModal({ title: '提示', content: '阅读器功能将在后续章节完善。' });
          },
          onCancel: async () => {
            // 再次确认删除
            showModal({
              title: '确认删除',
              content: `确定要从书架移除《${book.name}》吗？`,
              showCancel: true,
              confirmText: '确认删除',
              cancelText: '取消',
              onConfirm: async () => {
                await deleteBook(bookId);
                await this.loadBooks();
              }
            });
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

    // 清空 input 值，防止选择同一个文件不触发 change
    event.target.value = '';

    if (!file.name.toLowerCase().endsWith('.txt')) {
      showModal({ title: '格式错误', content: '目前仅支持导入 txt 格式文件。' });
      return;
    }

    const reader = new FileReader();

    // 探测编码（简单实现：尝试用 utf-8 读取，如果包含替换字符或乱码特征，重新用 gbk 读）
    // 为了更稳妥，这里直接读取为 ArrayBuffer，然后进行简单的编码判断
    reader.onload = async (e) => {
      const buffer = e.target.result;
      const textDecoderUtf8 = new TextDecoder('utf-8', { fatal: true });
      let text = '';
      let isUtf8 = true;
      
      try {
        text = textDecoderUtf8.decode(buffer);
      } catch (err) {
        isUtf8 = false;
      }

      if (!isUtf8) {
        const textDecoderGbk = new TextDecoder('gbk');
        text = textDecoderGbk.decode(buffer);
      }

      try {
        await addBook({
          name: file.name,
          content: text,
          size: file.size
        });
        showModal({ title: '导入成功', content: `《${file.name}》已添加到书架。` });
        await this.loadBooks();
      } catch (err) {
        showModal({ title: '导入失败', content: err.message });
      }
    };

    reader.onerror = () => {
      showModal({ title: '读取失败', content: '无法读取文件内容。' });
    };

    reader.readAsArrayBuffer(file);
  }
}
