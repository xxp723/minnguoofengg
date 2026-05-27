// @ts-nocheck
/**
 * 文件名: js/apps/chat/chat-html-card.js
 * 用途: 闲谈应用 — AI HTML 卡片协议解析与渲染工具（独立模块）
 * 说明：
 * 1. 本模块只负责“HTML卡片”相关逻辑，便于后续单独维护。
 * 2. 不涉及任何持久化存储读写；持久化统一由 chat-message.js / index.js 走 DB.js（IndexedDB）。
 * 3. 卡片渲染使用 sandbox iframe，保证可交互点击且不污染外层页面样式。
 */

/* ==========================================================================
   [区域标注·已完成·HTML卡片] 协议正文提取与基础清理
   说明：
   1. 支持 AI 在 [卡片] 协议中直接给出 HTML 片段。
   2. 若包裹在 ```html ... ``` 代码块中会自动剥离围栏。
   3. 已修复 HTML 最后一个标签后残留 `**、**、句号等 Markdown/标点尾巴导致卡片下方多出符号的问题。
   ========================================================================== */
const HTML_CARD_CHAT_PROTOCOL_MARKER_REGEX = /\[(回复|表情|转账|引用|撤回|图片|卡片)\]\s*([^：:\n`*]+?)\s*[：:]\s*/g;

function getHtmlCardProtocolBoundaryIndex(text = '', markerIndex = 0) {
  const value = String(text || '');
  let index = Math.max(0, Math.min(Number(markerIndex || 0), value.length));

  while (index > 0 && /[ \t\f\v`*_~]/.test(value.charAt(index - 1))) {
    index -= 1;
  }

  return index;
}

function getHtmlCardChatProtocolMarkers(text = '') {
  const value = String(text || '');
  const markerRegex = new RegExp(HTML_CARD_CHAT_PROTOCOL_MARKER_REGEX.source, 'g');

  return [...value.matchAll(markerRegex)].map(match => ({
    type: String(match[1] || '').trim(),
    roleName: String(match[2] || '').trim(),
    index: Number(match.index || 0),
    boundaryIndex: getHtmlCardProtocolBoundaryIndex(value, Number(match.index || 0)),
    markerText: String(match[0] || '')
  }));
}

function shouldStripHtmlCardTrailingProtocolMarker(text = '', marker = {}) {
  const value = String(text || '');
  const boundaryIndex = Number(marker.boundaryIndex || 0);
  const before = value.slice(0, boundaryIndex);
  const beforeTrimmed = before.trimEnd();

  if (!beforeTrimmed || !/<[a-z][\s\S]*?>/i.test(beforeTrimmed)) return false;
  if (/[\r\n]$/.test(before)) return true;

  return beforeTrimmed.endsWith('>');
}

/* ========================================================================
   [区域标注·已完成·HTML卡片尾部协议清理]
   说明：
   1. 修复 AI 把 [卡片] 后续 [回复]/[表情]/[转账]/[引用]/[撤回]/[图片] 协议继续拼在 HTML 后面，导致 iframe 底部掉格式显示的问题。
   2. 渲染旧消息时也会在显示层截掉尾部聊天协议；不迁移、不回写、不新增任何存储。
   3. 不使用 localStorage/sessionStorage，不做双份兜底，不按长文本字段过滤。
   ======================================================================== */
export function stripHtmlCardTrailingChatProtocols(raw = '') {
  const value = String(raw || '').trim();
  if (!value) return '';

  const trailingProtocol = getHtmlCardChatProtocolMarkers(value)
    .find(marker => marker.type !== '卡片' && shouldStripHtmlCardTrailingProtocolMarker(value, marker));

  return trailingProtocol
    ? value.slice(0, trailingProtocol.boundaryIndex).trim()
    : value;
}

/* ========================================================================
   [区域标注·已完成·HTML卡片尾部Markdown标点残留清理]
   说明：
   1. 修复 AI 将 [卡片] HTML 包在 **`...`** 里时，最后一个 HTML 标签后残留 `**、**、句号等符号并显示在卡片下方的问题。
   2. 只在最后一个 HTML 闭合尖括号之后清理“纯 Markdown 包裹符/常见句末标点/空白”的尾巴，不触碰 HTML 标签内部内容。
   3. 本区域只影响 HTML 卡片显示层解析；不读写 localStorage/sessionStorage，不做双份存储兜底，不按长文本字段过滤。
   ======================================================================== */
function stripHtmlCardTrailingMarkdownPunctuation(raw = '') {
  const value = String(raw || '').trim();
  if (!value) return '';

  const lastTagEndIndex = value.lastIndexOf('>');
  if (lastTagEndIndex < 0 || lastTagEndIndex >= value.length - 1) return value;

  const body = value.slice(0, lastTagEndIndex + 1).trimEnd();
  const tail = value.slice(lastTagEndIndex + 1).trim();

  return tail && /^[`*_~"'“”‘’。，、；;：:,.!！?？…·\-\s]+$/.test(tail)
    ? body.trim()
    : value;
}

export function normalizeHtmlCardProtocolContent(raw = '') {
  let value = String(raw || '').trim();
  if (!value) return '';

  value = value
    .replace(/^```html\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  return stripHtmlCardTrailingMarkdownPunctuation(stripHtmlCardTrailingChatProtocols(value));
}

/* ==========================================================================
   [区域标注·已更新·本次需求1·HTML卡片提示词精简与深度交互强化] HTML 卡片系统提示词
   说明：
   1. 只有聊天设置页开启 HTML 卡片开关后，prompt.js 才会注入本提示词。
   2. 融入可交互深层 HTML+CSS+JS 规范，强化沉浸式滚动、状态机及动效约束，增加场景库指引。
   3. 卡片正文仍只能是 HTML，左对齐无缩进，禁止混入 Markdown 围栏或后续协议。
   4. 不涉及持久化存储；不使用 localStorage/sessionStorage，不写双份存储兜底。
   ========================================================================== */
export function getHtmlCardFeaturePrompt() {
  return [
    '【深度交互HTML卡片生成规范】',
    '你必须经常且主动地使用 [卡片] 协议，通过互动装置、小游戏、拟真设备等形式为聊天不断制造惊喜和趣味。不要只在用户要求时才发，把它作为你日常表达的常规形态。',
    '严格格式：**`[卡片] 角色名：HTML文档`**。必须输出完整的<!DOCTYPE html>文档结构。',
    '代码必须全部左对齐，严禁任何缩进！严禁包含Markdown围栏、解释文字或附加聊天协议。',
    '【内容设定】',
    '卡片内容必须与角色人设、会话对象、世界书、历史对话和当前消息高度一致，严禁脱离剧情凭空生成。',
    '可参考以下场景库进行创意生成（不限于）：',
    '1. 社交/APP（微信/推特/网易云/朋友圈/匿名论坛等，模拟真实UI与红点，日韩场景带机翻感）',
    '2. 电子设备（旧按键手机/系统终端/游戏机/AppleWatch等）',
    '3. 纸质书写（手写信/考卷/拍立得/规则怪谈等）',
    '4. 交互游戏（盲盒/抽奖/经营/桌宠等）',
    '5. 特殊风格（古风/SCP/WindowsXP等）。',
    '【布局与样式】',
    '必须响应式，max-width:500px-800px，居中单容器。',
    'body标签禁止使用vh，必须设为 overflow:auto; height:auto; background:transparent; 严禁设背景色。所有视觉背景和投影(0 4px 6px)加在内部.container上。',
    '定制沉浸式滚动条(::-webkit-scrollbar)或隐藏。',
    '严禁使用 h1-h4，标题强制使用 <p class="title-custom">。',
    '【交互与动画】',
    '严禁 transition，所有动态效果必须通过 @keyframes 动画或 JS 切换 class 实现。',
    '交互模式二选一：模式A(单屏聚合，多点交互，模拟真实APP如Toast/红点) 或 模式B(线性叙事，完整状态机：封面->互动->不可逆结果变化)。严禁点击即结束的伪交互。',
    '触感反馈：所有可点击元素必须有 :active { transform: scale(0.95); }。',
    'DOM策略：预渲染所有可能出现的元素(弹窗/结果)并默认隐藏，JS切class控制流程以防止闪屏。严禁 innerHTML 或 createElement。',
    '严禁原生 alert/confirm/prompt，严禁原生选择器，请自定义应用内弹窗及组件。开关按键参考iPhone滑动开关，图标参考IconPark。',
    '【资源规范】',
    '严禁引用外部CSS/JS。',
    '图像：CSS/SVG绘图优先。如需AI图像(仅风景/氛围，禁人物)，格式: https://gen.pollinations.ai/image/英文提示词?width=1920&height=1080&model=zimage&key=sk_J4QOO1aRAS3avP9yr0YbaA6z9mgMjtpM',
    '音频：需交互音效时，必须使用 Web Audio API 动态生成，严禁外部音频文件或Base64。'
  ].join('\n');
}

/* ==========================================================================
   [区域标注·已完成·HTML卡片按协议原文顺序显示] 协议块提取
   说明：
   1. 从 AI 原始文本中提取 [卡片] 角色名：HTML正文。
   2. 本区域已修复“卡片后续 [回复]/[表情]/[转账]/[引用]/[撤回]/[图片] 协议被塞进 iframe”的掉格式问题。
   3. 卡片正文只截取到下一条任意聊天协议开始处；兼容协议头前面带 **、反引号、空格等 Markdown 残片的情况。
   4. 已保留 startIndex/protocolOrder 运行时顺序信息，供聊天界面把 HTML 卡片插回 AI 原文所在位置，不再强制落到本轮最下方。
   5. 不涉及任何持久化存储；不使用 localStorage/sessionStorage，不做双份兜底。
   ========================================================================== */
export function extractHtmlCardProtocolBlocks(rawText = '') {
  const visibleText = String(rawText || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<\/?think>/gi, '')
    .trim();
  if (!visibleText) return [];

  const protocolMarkers = getHtmlCardChatProtocolMarkers(visibleText);
  const cardMarkers = protocolMarkers.filter(marker => marker.type === '卡片');
  if (!cardMarkers.length) return [];

  return cardMarkers
    .map((marker) => {
      const contentStart = marker.index + marker.markerText.length;
      const nextProtocolMarker = protocolMarkers.find(item => item.index > marker.index);
      const contentEnd = nextProtocolMarker ? nextProtocolMarker.boundaryIndex : visibleText.length;
      const html = normalizeHtmlCardProtocolContent(visibleText.slice(contentStart, contentEnd));
      return {
        type: 'card',
        roleName: marker.roleName,
        html,
        startIndex: marker.index,
        endIndex: contentEnd,
        protocolOrder: marker.index
      };
    })
    .filter(item => item.html);
}

/* ==========================================================================
   [区域标注·已完成·HTML卡片主题色对齐全局Root] iframe 内部格式保护样式
   说明：
   1. 已为 HTML 卡片统一注入最小格式保护层，防止长文本、表格、图片、代码块横向撑破聊天卡片。
   2. 已对齐 css/styles.css 的 :root 主题色：Linen #F5F1EA、Khaki #D7C9B8、Espresso #4A342A、Cocoa #7D5A44。
   3. 已补充不突兀的莫兰迪暖色扩展变量，便于下次直接调整 HTML 卡片色系。
   4. 卡片默认纸面改为纯色，卡片阴影按需求保留；不修改持久化，不使用 localStorage/sessionStorage。
   ========================================================================== */
const HTML_CARD_FORMAT_ENFORCER_STYLE = `<style data-miniphone-card-format-enforcer="true">
  :root{
    color-scheme:light;
    --card-bg:#F5F1EA;
    --card-surface:#fffdf8;
    --card-surface-2:#D7C9B8;
    --card-border:rgba(125,90,68,.18);
    --card-text:#4A342A;
    --card-sub:#7D5A44;
    --card-accent:#B2967D;
    --card-accent-soft:rgba(178,150,125,.16);
    --card-morandi-sage:#A8A08D;
    --card-morandi-clay:#B2967D;
    --card-morandi-rose:#C8A99A;
    --card-shadow:0 10px 28px rgba(74,52,42,.10);
    --card-radius:20px;
  }
  *,*::before,*::after{
    box-sizing:border-box;
    max-width:100%;
  }
  html,body{
    width:100%;
    max-width:100%;
    margin:0;
    padding:0;
    overflow-x:hidden;
    background:transparent;
    font-family:"PingFang SC","Microsoft YaHei",sans-serif;
    color:var(--card-text);
  }
  body{
    min-height:0;
  }
  .miniphone-html-card-root{
    width:100%;
    max-width:100%;
    overflow:hidden;
  }
  .miniphone-html-card-root,
  .miniphone-html-card-root *{
    overflow-wrap:anywhere;
    word-break:break-word;
  }
  .miniphone-html-card-root > :where(article,section,main,div):first-child:last-child:not(.nordic-card){
    width:100%;
    border-radius:var(--card-radius);
    border:1px solid var(--card-border);
    background:var(--card-surface);
    box-shadow:var(--card-shadow);
    padding:14px;
    overflow:hidden;
  }
  img,svg,video,canvas{
    max-width:100%;
    height:auto;
  }
  table{
    width:100%;
    max-width:100%;
    table-layout:fixed;
    border-collapse:collapse;
  }
  th,td{
    overflow-wrap:anywhere;
    word-break:break-word;
  }
  pre,code{
    white-space:pre-wrap;
    overflow-wrap:anywhere;
    word-break:break-word;
  }
  button,input,textarea,select{
    max-width:100%;
    font:inherit;
  }
</style>`;

function injectHtmlCardFormatEnforcerStyle(documentHtml = '') {
  const value = String(documentHtml || '');
  if (!value || /data-miniphone-card-format-enforcer/i.test(value)) return value;

  if (/<\/head>/i.test(value)) {
    return value.replace(/<\/head>/i, `${HTML_CARD_FORMAT_ENFORCER_STYLE}\n</head>`);
  }

  return `${HTML_CARD_FORMAT_ENFORCER_STYLE}\n${value}`;
}

/* ==========================================================================
   [区域标注·已完成·HTML卡片主题色对齐全局Root] HTML 骨架补全
   说明：
   1. 允许 AI 只输出局部 HTML；这里自动补齐最小可渲染文档结构。
   2. 已统一包裹 .miniphone-html-card-root 并注入格式保护样式，防止聊天界面 HTML 卡片掉格式。
   3. 默认 HTML 卡片主题色已对齐 css/styles.css 的 :root 色板，并提供莫兰迪暖色扩展变量。
   ========================================================================== */
export function buildHtmlCardDocument(html = '') {
  const body = normalizeHtmlCardProtocolContent(html);
  if (!body) return '';

  const hasHtmlTag = /<html[\s>]/i.test(body);
  if (hasHtmlTag) return injectHtmlCardFormatEnforcerStyle(body);

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    :root{
      color-scheme: light;
      --card-bg:#F5F1EA;
      --card-surface:#fffdf8;
      --card-surface-2:#D7C9B8;
      --card-border:rgba(125,90,68,.18);
      --card-text:#4A342A;
      --card-sub:#7D5A44;
      --card-accent:#B2967D;
      --card-accent-soft:rgba(178,150,125,.16);
      --card-morandi-sage:#A8A08D;
      --card-morandi-clay:#B2967D;
      --card-morandi-rose:#C8A99A;
      --card-shadow:0 10px 28px rgba(74,52,42,.10);
      --card-radius:20px;
    }
    *,*::before,*::after{
      box-sizing:border-box;
      max-width:100%;
    }
    html,body{
      margin:0;
      padding:0;
      background:transparent;
      font-family:"PingFang SC","Microsoft YaHei",sans-serif;
      color:var(--card-text);
    }
    body{
      min-height:0;
      padding:0;
      overflow-x:hidden;
    }
    .miniphone-html-card-root{
      width:100%;
      max-width:100%;
      overflow:hidden;
    }
    .miniphone-html-card-root,
    .miniphone-html-card-root *{
      overflow-wrap:anywhere;
      word-break:break-word;
    }
    .miniphone-html-card-root > :where(article,section,main,div):first-child:last-child:not(.nordic-card){
      width:100%;
      border-radius:var(--card-radius);
      border:1px solid var(--card-border);
      background:var(--card-surface);
      box-shadow:var(--card-shadow);
      padding:14px;
      overflow:hidden;
    }
    .nordic-card{
      width:100%;
      border-radius:var(--card-radius);
      border:1px solid var(--card-border);
      background:var(--card-surface);
      box-shadow:var(--card-shadow);
      padding:14px;
      overflow:hidden;
    }
    .nordic-card h1,.nordic-card h2,.nordic-card h3{
      margin:0 0 8px;
      font-weight:700;
      letter-spacing:.02em;
    }
    .nordic-card p{
      margin:0 0 8px;
      line-height:1.6;
      color:var(--card-sub);
    }
    .nordic-card small,.nordic-card .muted{
      color:var(--card-sub);
    }
    .nordic-card .row{
      display:flex;
      align-items:flex-start;
      justify-content:space-between;
      gap:10px;
      padding:8px 0;
      border-bottom:1px dashed rgba(109,95,82,.18);
    }
    .nordic-card .row:last-child{border-bottom:none}
    .nordic-card .pill,
    .nordic-card .tag{
      display:inline-flex;
      align-items:center;
      gap:6px;
      min-height:28px;
      padding:6px 10px;
      border-radius:999px;
      background:var(--card-accent-soft);
      color:var(--card-text);
      font-size:12px;
    }
    .nordic-card button,
    .nordic-card .btn{
      appearance:none;
      border:none;
      border-radius:999px;
      padding:8px 12px;
      background:var(--card-accent);
      color:#fff;
      cursor:pointer;
      font:inherit;
      transition:transform .16s ease,opacity .16s ease,filter .16s ease;
    }
    .nordic-card button:active,
    .nordic-card .btn:active{
      transform:scale(.98);
      filter:brightness(.98);
    }
    .nordic-card input,
    .nordic-card textarea,
    .nordic-card select{
      width:100%;
      border:1px solid var(--card-border);
      border-radius:14px;
      background:rgba(255,255,255,.72);
      padding:10px 12px;
      color:var(--card-text);
      font:inherit;
      outline:none;
    }
    .nordic-card a{
      color:var(--card-text);
    }
    .nordic-card details{
      border:1px solid var(--card-border);
      border-radius:14px;
      padding:10px 12px;
      background:rgba(255,255,255,.55);
    }
    .nordic-card summary{
      cursor:pointer;
      user-select:none;
      font-weight:600;
    }
    img,svg,video,canvas{
      max-width:100%;
      height:auto;
    }
    table{
      width:100%;
      max-width:100%;
      table-layout:fixed;
      border-collapse:collapse;
    }
    th,td{
      overflow-wrap:anywhere;
      word-break:break-word;
    }
    pre,code{
      white-space:pre-wrap;
      overflow-wrap:anywhere;
      word-break:break-word;
    }
  </style>
</head>
<body>
  <main class="miniphone-html-card-root">
    ${body}
  </main>
</body>
</html>`;
}

/* ==========================================================================
   [区域标注·已完成·HTML卡片按钮交互修复] iframe 内部点击/选择交互 postMessage 脚本片段
   说明：
   1. 此脚本在 sanitize 之后追加到 </body> 前，确保不被清理掉。
   2. iframe 内部监听 button / a / summary / 表单控件等轻互动元素，点击后给元素添加可见反馈。
   3. 本次已补强移动端点击桥接：覆盖 pointerup / click / change / 键盘触发，并做短时间去重，修复“点卡片内按钮没反应”。
   4. 同时为未声明 type 的 button 自动补上 type="button"，避免按钮处于 form 内时触发提交刷新，导致交互看起来失效。
   5. 交互结果通过 postMessage 发给父页面，由 chat-message.js / index.js 转成聊天系统提示并写入 DB.js / IndexedDB。
   6. 本区域不使用 localStorage/sessionStorage，不使用原生浏览器弹窗，不做双份存储兜底。
   ========================================================================== */
const HTML_CARD_INTERACTION_BRIDGE_SCRIPT = `
<script data-card-interaction-bridge="true">
(function(){
  var lastInteractionAt = 0;
  var lastInteractionKey = '';

  function getText(el){
    if(!el) return '';
    var text = (el.innerText || el.textContent || el.getAttribute('aria-label') || el.getAttribute('title') || el.value || '').replace(/\\s+/g, ' ').trim();
    return text.length > 80 ? text.slice(0, 80) + '…' : text;
  }

  function getInteractiveTarget(start){
    if(!start || !start.closest) return null;
    return start.closest('button,a,summary,label,input,textarea,select,[role="button"],[role="switch"],[role="checkbox"],[role="radio"],[tabindex],.btn,.button,[data-action]');
  }

  function normalizeButtonTypes(){
    document.querySelectorAll('button:not([type])').forEach(function(button){
      button.setAttribute('type', 'button');
    });
  }

  function markInteracted(el){
    if(!el || !el.classList) return;
    el.classList.add('miniphone-card-interacted');
    if(el.matches && el.matches('button,[role="button"],[role="switch"],.btn,.button')){
      var pressed = el.getAttribute('aria-pressed') === 'true';
      el.setAttribute('aria-pressed', pressed ? 'false' : 'true');
    }
    window.setTimeout(function(){ el.classList.remove('miniphone-card-interacted'); }, 1200);
  }

  function describeInteraction(el, eventType){
    var tag = String(el && el.tagName || '').toLowerCase();
    var role = String(el && el.getAttribute && el.getAttribute('role') || '').toLowerCase();
    var text = getText(el);
    var value = '';
    var checked = false;

    if(el && /^(input|textarea|select)$/.test(tag)){
      value = String(el.value || '').trim();
      checked = Boolean(el.checked);
      if(!text){
        var label = el.id ? document.querySelector('label[for="' + String(el.id).replace(/"/g, '\\\\"') + '"]') : null;
        text = getText(label) || el.getAttribute('placeholder') || el.getAttribute('name') || tag;
      }
    }

    return {
      type: '__miniphone_card_interaction__',
      eventType: eventType,
      tagName: tag,
      role: role,
      text: text || value || tag || 'HTML卡片元素',
      value: value.length > 80 ? value.slice(0, 80) + '…' : value,
      checked: checked,
      timestamp: Date.now()
    };
  }

  function shouldSkipDuplicate(el, eventType){
    var now = Date.now();
    var key = [
      String(el && el.tagName || '').toLowerCase(),
      getText(el),
      String(el && el.getAttribute && el.getAttribute('role') || '').toLowerCase()
    ].join('::');
    if((now - lastInteractionAt) < 320 && key === lastInteractionKey){
      return true;
    }
    lastInteractionAt = now;
    lastInteractionKey = key;
    return false;
  }

  function postInteraction(el, eventType){
    if(!el || shouldSkipDuplicate(el, eventType)) return;
    parent.postMessage(describeInteraction(el, eventType), '*');
  }

  var style = document.createElement('style');
  style.setAttribute('data-miniphone-card-interaction-feedback', 'true');
  style.textContent = '.miniphone-card-interacted{filter:brightness(.96);box-shadow:0 0 0 3px rgba(199,154,102,.20),0 8px 18px rgba(61,52,45,.10)!important;transform:translateY(1px) scale(.99);transition:transform .16s ease,box-shadow .16s ease,filter .16s ease;}';
  document.head.appendChild(style);

  normalizeButtonTypes();

  document.addEventListener('pointerup', function(event){
    var target = getInteractiveTarget(event.target);
    if(!target) return;
    if(target.matches && target.matches('a')){
      event.preventDefault();
    }
    markInteracted(target);
    postInteraction(target, 'pointerup');
  }, true);

  document.addEventListener('click', function(event){
    var target = getInteractiveTarget(event.target);
    if(!target) return;
    if(target.matches && target.matches('a')){
      event.preventDefault();
    }
    markInteracted(target);
    postInteraction(target, 'click');
  }, true);

  document.addEventListener('keydown', function(event){
    if(event.key !== 'Enter' && event.key !== ' ') return;
    var target = getInteractiveTarget(event.target);
    if(!target) return;
    markInteracted(target);
    postInteraction(target, 'keydown');
  }, true);

  /* ========================================================================
     [区域标注·已完成·HTML卡片iframe双击收藏桥接]
     说明：iframe 内部双击不会冒泡到父页面，因此通过 postMessage 通知父页面触发收藏逻辑。
     ======================================================================== */
  document.addEventListener('dblclick', function(event){
    parent.postMessage({
      type: '__miniphone_card_dblclick__',
      timestamp: Date.now()
    }, '*');
  }, true);

  document.addEventListener('change', function(event){
    var target = getInteractiveTarget(event.target);
    if(!target) return;
    markInteracted(target);
    postInteraction(target, 'change');
  }, true);
})();
</script>`;

/* ==========================================================================
   [区域标注·已完成·HTML卡片] iframe 自适应高度 postMessage 脚本片段
   说明：
   1. 此脚本在 sanitize 之后追加到 </body> 前，确保不被清理掉。
   2. iframe 内部通过 postMessage 向父页面报告 body 实际高度。
   3. 父页面（chat-message.js）中的 message 监听器据此动态设置 iframe 高度。
   4. 使用 ResizeObserver + 初始延迟双重机制，兼容动态内容和首次渲染。
   ========================================================================== */
const HTML_CARD_HEIGHT_REPORTER_SCRIPT = `
<script data-card-height-reporter="true">
(function(){
  function reportHeight(){
    var h = Math.max(
      document.body.scrollHeight || 0,
      document.body.offsetHeight || 0,
      document.documentElement.scrollHeight || 0
    );
    if(h > 0) parent.postMessage({type:'__miniphone_card_height__', height: h}, '*');
  }
  if(typeof ResizeObserver !== 'undefined'){
    new ResizeObserver(function(){ reportHeight(); }).observe(document.body);
  }
  window.addEventListener('load', function(){ setTimeout(reportHeight, 60); });
  setTimeout(reportHeight, 120);
  setTimeout(reportHeight, 500);
})();
</script>`;

function appendTrustedHtmlCardRuntimeScripts(documentHtml = '') {
  const value = String(documentHtml || '');
  const trustedRuntimeScripts = HTML_CARD_INTERACTION_BRIDGE_SCRIPT + HTML_CARD_HEIGHT_REPORTER_SCRIPT;

  if (!value) return trustedRuntimeScripts;

  if (/<\/body>/i.test(value)) {
    return value.replace(/<\/body>/i, `${trustedRuntimeScripts}\n</body>`);
  }

  if (/<\/html>/i.test(value)) {
    return value.replace(/<\/html>/i, `${trustedRuntimeScripts}\n</html>`);
  }

  return `${value}\n${trustedRuntimeScripts}`;
}

/* ==========================================================================
   [区域标注·已完成·本次需求1·HTML卡片渲染外露脚本文本修复] iframe srcdoc 安全净化
   说明：
   1. 已修复聊天消息界面里的 HTML 卡片偶发把 `document.write / document.close` 包装脚本尾巴当成普通文本显示，导致卡片渲染失败的问题。
   2. 改为先构建并净化正常 HTML 文档，再把受信任的交互桥接与高度上报脚本直接追加到文档尾部，不再使用 document.write 二次包裹整份 HTML。
   3. 仍然继续拦截外部脚本、iframe 嵌套、原生弹窗 API、顶层窗口访问与危险 target 跳转，保证卡片运行边界。
   4. 已在净化后再次确保格式保护样式存在，兼容 AI 输出完整 HTML 文档的情况。
   5. 不做双份存储，不引入原生浏览器弹窗，不使用 localStorage/sessionStorage。
   ========================================================================== */
export function sanitizeHtmlCardDocumentForSrcdoc(html = '') {
  const documentHtml = buildHtmlCardDocument(html);
  if (!documentHtml) return '';

  let sanitized = documentHtml
    .replace(/<script\b[^>]*\bsrc\s*=\s*(".*?"|'.*?'|[^\s>]+)[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, '')
    .replace(/\balert\s*\(/gi, 'void(')
    .replace(/\bconfirm\s*\(/gi, 'void(')
    .replace(/\bprompt\s*\(/gi, 'void(')
    .replace(/\bwindow\.open\s*\(/gi, 'void(')
    .replace(/\btop\s*\./gi, 'window.')
    .replace(/\bparent\s*\./gi, 'window.')
    .replace(/<a([^>]*?)target\s*=\s*["']?_top["']?([^>]*)>/gi, '<a$1$2>')
    .replace(/<a([^>]*?)target\s*=\s*["']?_parent["']?([^>]*)>/gi, '<a$1$2>')
    .replace(/<a([^>]*?)href\s*=\s*["']\s*javascript:[^"']*["']([^>]*)>/gi, '<a$1$2>');

  sanitized = injectHtmlCardFormatEnforcerStyle(sanitized);

  return appendTrustedHtmlCardRuntimeScripts(sanitized);
}
