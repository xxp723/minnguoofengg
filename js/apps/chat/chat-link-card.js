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

export function formatLinkDataForHistory(linkData) {
  if (!linkData) return '';
  // 历史上下文中大幅精简，节省 token
  const shortSnippet = linkData.snippet.length > 50 ? linkData.snippet.slice(0, 50) + '...' : linkData.snippet;
  return `[分享了${linkData.site}] ${linkData.title} - ${shortSnippet}`;
}
