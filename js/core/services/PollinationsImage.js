/**
 * 文件名: js/core/services/PollinationsImage.js
 * 用途: 全局 Pollinations 图像生成封装模块。
 *       不保存二进制，不使用 localStorage/sessionStorage。
 */

/* ==========================================================================
   [区域标注·已完成·Pollinations图片服务]
   说明：提供构建 URL 和后台预加载的功能。
   ========================================================================== */

/**
 * 构建 Pollinations 免费生图 URL
 * @param {string} prompt 提示词
 * @param {object} options 配置项 (width, height, seed, model, nologo 等)
 * @returns {string} 完整的图片 URL
 */
export function buildPollinationsImageUrl(prompt, options = {}) {
  const {
    width = 1024,
    height = 1024,
    seed = Math.floor(Math.random() * 1000000),
    model = 'flux',
    nologo = true
  } = options;

  const encodedPrompt = encodeURIComponent(prompt.trim() || 'random image');
  const baseUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}`;
  
  // 拼接查询参数
  const params = new URLSearchParams({
    width,
    height,
    seed,
    model,
    nologo
  });

  // 如果以后官方要求 apiKey，可在这里添加 params.append('token', 'YOUR_KEY')

  return `${baseUrl}?${params.toString()}`;
}

/**
 * 后台预加载 Pollinations 图片
 * 触发网络请求开始生成，不需要等待完成
 * @param {string} url 要预加载的 URL
 */
export function preloadPollinationsImage(url) {
  if (!url) return;
  const img = new Image();
  img.src = url;
}

/**
 * 为地图应用构建专用的生图提示词和 URL
 * @param {string} mapName 地图名称
 * @param {string} mapDesc 地图描述
 * @returns {object} { prompt, seed, url }
 */
export function generateMapCoverData(mapName, mapDesc) {
  const seed = Math.floor(Math.random() * 1000000);
  // 严格要求平面2D街道地图，不要3D高楼，参考高德地图样式
  const prompt = `A completely flat 2D top-down street map of ${mapName || 'city'}, exactly like standard Amap or Google Maps mobile navigation UI. No 3D buildings, no isometric view. Only flat colored shapes: light grey blocks, white thick intersecting roads, flat green park areas, flat light blue river or lake water, clean layout. ${mapDesc || ''}`;
  const url = buildPollinationsImageUrl(prompt, { seed, width: 1024, height: 1024 });
  
  preloadPollinationsImage(url);

  return { prompt, seed, url };
}
