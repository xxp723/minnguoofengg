/**
 * 文件名: js/apps/chat/chat-link-card.js
 * 用途: 分享链接(小红书、微博)解析与卡片数据提取
 */

/* ==========================================================================
   [区域标注·本次修改·分享链接解析功能]
   说明：
   1. 识别文本中的小红书、微博链接。
   2. 优先尝试多个 Reader 代理地址，尽量绕过重定向和协议差异。
   3. 提取页面标题、正文摘要和首图，供前端渲染与 AI 上下文组装。
   4. 失败时仅返回明确兜底文案，不伪造正文。
   ========================================================================== */

function normalizeSharedLinkUrl(url) {
  const safeUrl = String(url || '').trim();
  if (!safeUrl) return '';
  if (/^https?:\/\//i.test(safeUrl)) return safeUrl;
  return `https://${safeUrl.replace(/^\/+/, '')}`;
}

function buildReaderCandidateUrls(url) {
  const normalizedUrl = normalizeSharedLinkUrl(url);
  if (!normalizedUrl) return [];

  const strippedUrl = normalizedUrl.replace(/^https?:\/\//i, '');
  return Array.from(new Set([
    `https://r.jina.ai/http://${strippedUrl}`,
    `https://r.jina.ai/https://${strippedUrl}`,
    `https://r.jina.ai/${normalizedUrl}`
  ]));
}

function cleanMarkdownText(content) {
  return String(content || '')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[.*?\]\(.*?\)/g, '')
    .replace(/[#*`_>~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractFirstImageFromMarkdown(content) {
  const safeContent = String(content || '');
  const imgRegex = /!\[.*?\]\((https?:\/\/[^\s\)]+)\)/g;
  let match;
  while ((match = imgRegex.exec(safeContent)) !== null) {
    if (!/icon|captcha|avatar|logo/i.test(match[1])) {
      return match[1];
    }
  }
  return '';
}

function parseReaderResponse(textContent) {
  const rawText = String(textContent || '').trim();
  if (!rawText) {
    return { title: '', snippet: '', imageUrl: '' };
  }

  let title = '';
  const titleMatch = rawText.match(/^Title:\s*(.+)$/im);
  if (titleMatch) {
    title = titleMatch[1].trim();
  }

  if (!title) {
    const headingMatch = rawText.match(/^#\s+(.+)$/m);
    if (headingMatch) {
      title = headingMatch[1].trim();
    }
  }

  let content = '';
  const markdownMatch = rawText.match(/^Markdown Content:\s*([\s\S]*)$/i);
  if (markdownMatch) {
    content = markdownMatch[1].trim();
  } else {
    const contentMatch = rawText.match(/^Content:\s*([\s\S]*)$/im);
    content = contentMatch ? contentMatch[1].trim() : rawText;
  }

  const imageUrl = extractFirstImageFromMarkdown(content);
  const snippet = cleanMarkdownText(content);

  if (!title && snippet) {
    title = snippet.slice(0, 20) + (snippet.length > 20 ? '...' : '');
  }

  return {
    title,
    snippet,
    imageUrl
  };
}

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
  const siteName = /xiaohongshu\.com|xhslink\.com/i.test(url) ? '小红书' : '微博';
  const candidateUrls = buildReaderCandidateUrls(url);
  let lastError = null;

  try {
    for (const targetUrl of candidateUrls) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时

      try {
        const response = await fetch(targetUrl, {
          method: 'GET',
          headers: {
            // 请求返回 Markdown 格式，以兼容重定向等复杂页面情况
            'Accept': 'text/plain',
            'X-No-Cache': 'true',
            'X-Return-Format': 'markdown'
          },
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error(`Jina API Error: ${response.status}`);
        }

        const textContent = await response.text();
        const parsed = parseReaderResponse(textContent);

        if (!parsed.title && !parsed.snippet) {
          throw new Error('Reader 返回内容为空');
        }

        return {
          url,
          title: parsed.title || `${siteName}分享`,
          snippet: parsed.snippet,
          imageUrl: parsed.imageUrl || '',
          site: siteName
        };
      } catch (error) {
        lastError = error;
      } finally {
        clearTimeout(timeoutId);
      }
    }

    throw lastError || new Error('全部 Reader 路径均失败');
  } catch (error) {
    console.error('抓取分享链接失败, 启用兜底卡片:', error);
    // 启用兜底卡片数据，确保前端始终能渲染出链接卡片，同时告知 AI 页面无法访问
    return {
      url,
      title: `${siteName}链接`,
      snippet: '由于该平台访问限制或重定向，暂时无法自动提取文字详情。',
      imageUrl: '',
      site: siteName
    };
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
      .replace(/&/g, "\u0026amp;")
      .replace(/</g, "\u0026lt;")
      .replace(/>/g, "\u0026gt;")
      .replace(/"/g, "\u0026quot;")
      .replace(/'/g, "\u0026#039;");
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
