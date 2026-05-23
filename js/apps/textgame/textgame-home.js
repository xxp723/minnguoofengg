/**
 * ==========================================================================
 * [区域标注·本次需求·梦笺主页]
 * 说明：主页功能占位
 * ==========================================================================
 */

import { Icons } from './textgame-ui.js';

export class TextGameHome {
  constructor(container) {
    this.container = container;
  }

  render() {
    this.container.innerHTML = `
      <div class="textgame-empty-state">
        ${Icons.home}
        <p>梦笺主页<br>这里将用于展示阅读统计、推荐内容或动态</p>
      </div>
    `;
  }
}
