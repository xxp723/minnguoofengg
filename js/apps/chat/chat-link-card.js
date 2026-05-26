/**
 * 文件名: js/apps/chat/chat-link-card.js
 * 用途: 分享链接(小红书、微博)解析与卡片数据提取
 */

/* ==========================================================================
   [区域标注·本次修改·分享链接解析功能]
   说明：
   1. 识别文本中的小红书、微博链接。
   2. 调用 Jina Reader API 获取页面内容。
   3. 返回清洗后的链接元数据，供前端渲染与 AI 上下文组装。
   ========================================================================== */

export function detectSharedLink(text) {
  const safeText = String(text || '');
  // 优化正则，排除中文与全角标点，遇到即停止匹配
  const urlRegex = /(https?:\/\/[a-zA-Z0-9-._~:/?#[\]@!$&'()*+,;=%]+)/i;
  const match = safeText.match(urlRegex);
  if (!match) return null;

  const url = match[1];
  // 匹配小红书或微博域名
  if (/xiaohongshu\.com|xhslink\.com|weibo\.com|m\.weibo\.cn|weibo\.cn/i.test(url)) {
    return url;
  }
  return null;
}

export async function fetchLinkCardData(url) {
  if (!url) return null;

  try {
    const targetUrl = `https://r.jina.ai/${url}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-No-Cache': 'true', // 要求 Jina 返回新鲜数据
        'X-Return-Format': 'markdown'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Jina API Error: ${response.status}`);
    }

    const data = await response.json();
    const result = data?.data || data; // 兼容 Jina 返回的 JSON 结构

    // 提取所需字段
    let title = String(result.title || '').trim();
    let content = String(result.content || '').trim();
    let imageUrl = String(result.image || '').trim(); // Jina API 可能返回首图

    // 如果 Jina 没有直接返回 imageUrl，尝试从 Markdown 内容中提取第一张图片
    if (!imageUrl && content) {
      const imgMatch = content.match(/!\[.*?\]\((https?:\/\/[^\s\)]+)\)/);
      if (imgMatch) {
        imageUrl = imgMatch[1];
      }
    }

    // 清理正文：去除 markdown 图片语法，限制长度
    let snippet = content
      .replace(/!\[.*?\]\(.*?\)/g, '') // 去除图片链接
      .replace(/\[.*?\]\(.*?\)/g, '') // 去除普通链接
      .replace(/[#*`_>~]/g, '') // 去除基础 Markdown 符号
      .replace(/\s+/g, ' ')
      .trim();

    // 限制摘要长度
    if (snippet.length > 300) {
      snippet = snippet.slice(0, 300) + '...';
    }

    if (!title && snippet) {
      title = snippet.slice(0, 20) + '...';
    }

    if (!title && !snippet) {
      return null;
    }

    return {
      url,
      title: title || '分享链接',
      snippet,
      imageUrl,
      site: /xiaohongshu\.com|xhslink\.com/i.test(url) ? '小红书' : '微博'
    };
  } catch (error) {
    console.error('抓取分享链接失败:', error);
    return null;
  }
}

export function formatLinkDataForAiRound(linkData) {
  if (!linkData) return '';
  return `[用户分享的网页内容 - ${linkData.site}]
标题: ${linkData.title}
内容: ${linkData.snippet}
`;
}

export function formatLinkDataForAiHistory(linkData) {
  if (!linkData) return '';
  // 历史上下文中大幅精简，节省 token
  const shortSnippet = linkData.snippet.length > 50 ? linkData.snippet.slice(0, 50) + '...' : linkData.snippet;
  return `[分享了${linkData.site}] ${linkData.title} - ${shortSnippet}`;
}

export function isLinkCardMessage(message) {
  return message && message.linkData && message.linkData.url;
}

export function renderLinkCardBubble(message) {
  const linkData = message.linkData;
  if (!linkData) return '';
  
  // 统一使用 IconPark 的 link 图标
  const siteIcon = `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true" width="14" height="14" style="flex-shrink:0;"><path d="M14 25C14 25 15.0514 29.5332 19 30.9999C22.9486 32.4666 31 32 34 26C37 20 33 16 33 16" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M34 23C34 23 32.9486 18.4668 29 17.0001C25.0514 15.5334 17 16 14 22C11 28 15 32 15 32" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  const escapeHtml = (str) => {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  const hasImage = !!linkData.imageUrl;
  const cardClass = hasImage ? 'msg-link-card' : 'msg-link-card msg-link-card--no-image';

  return `
    <div class="msg-link-card-wrap">
      <a href="${escapeHtml(linkData.url)}" target="_blank" class="${cardClass}" rel="noopener noreferrer">
        ${hasImage ? `
          <div class="msg-link-card__cover">
            <img src="${escapeHtml(linkData.imageUrl)}" alt="封面" loading="lazy">
          </div>
        ` : ''}
        <div class="msg-link-card__content">
          <div class="msg-link-card__site">
            ${siteIcon}
            <span>${escapeHtml(linkData.site)}</span>
          </div>
          <div class="msg-link-card__title">${escapeHtml(linkData.title)}</div>
          <div class="msg-link-card__snippet">${escapeHtml(linkData.snippet)}</div>
        </div>
      </a>
    </div>
  `;
}

export function getLinkCardMessageDisplayText(message) {
  if (!message || !message.linkData) return '[分享链接]';
  return `[分享链接] ${message.linkData.title}`;
}
