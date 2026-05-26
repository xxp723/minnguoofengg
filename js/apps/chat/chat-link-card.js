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
  const urlRegex = /(https?:\/\/[^\s]+)/i;
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
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

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
  
  const siteIcon = linkData.site === '小红书' 
    ? `<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/></svg>` 
    : `<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M22.46,6C21.69,6.35 20.86,6.58 20,6.69C20.88,6.16 21.56,5.32 21.88,4.31C21.05,4.81 20.13,5.16 19.16,5.36C18.37,4.5 17.26,4 16,4C13.65,4 11.73,5.92 11.73,8.29C11.73,8.63 11.77,8.96 11.84,9.27C8.28,9.09 5.11,7.38 3,4.79C2.63,5.42 2.42,6.16 2.42,6.94C2.42,8.43 3.17,9.75 4.33,10.5C3.62,10.5 2.96,10.3 2.38,10C2.38,10 2.38,10 2.38,10.03C2.38,12.11 3.86,13.85 5.82,14.24C5.46,14.34 5.08,14.39 4.69,14.39C4.42,14.39 4.15,14.36 3.89,14.31C4.43,16.03 6.02,17.28 7.91,17.31C6.44,18.46 4.59,19.15 2.58,19.15C2.22,19.15 1.88,19.13 1.54,19.09C3.44,20.31 5.68,21 8.12,21C16.02,21 20.33,14.46 20.33,8.79C20.33,8.6 20.33,8.42 20.32,8.23C21.16,7.63 21.88,6.87 22.46,6Z"/></svg>`;

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
