/**
 * ==========================================================================
 * [区域标注·本次需求·梦笺存档页面]
 * 说明：存档功能占位
 * ==========================================================================
 */

import { Icons } from './reader-ui.js';

export class ReaderArchive {
  constructor(container) {
    this.container = container;
  }

  render() {
    this.container.innerHTML = `
      <div class="reader-empty-state">
        ${Icons.archive}
        <p>存档夹空空如也<br>这里将用于保存阅读片段或高亮书签</p>
      </div>
    `;
  }
}
