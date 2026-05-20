/**
 * 文件名: js/core/services/PollinationsImage.js
 * 用途: 全局 Pollinations 图像生成封装模块。
 *       不保存二进制，不使用 localStorage/sessionStorage。
 */

/* ==========================================================================
   [区域标注·已修改·Pollinations图片服务]
   说明：提供构建 URL 和后台预加载的功能。更新了地图生图提示词。
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
 * @param {string} category 地图分类
 * @returns {object} { prompt, seed, url }
 */
export function generateMapCoverData(mapName, mapDesc, category = '现代都市') {
  const seed = Math.floor(Math.random() * 1000000);
  const safeName = String(mapName || '未命名地图').trim();
  const safeDesc = String(mapDesc || '').trim();
  const safeCategory = String(category || '现代都市').trim();

  /* ==========================================================================
     [区域标注·已完成·地图应用 Pollinations 分类生图提示词]
     说明：
     1. 除“现代都市”外的地图封面统一调用 pollinations.ai，不再生成本地占位底色。
     2. 提示词严格合并地图分类、地图名称与描述详情，要求输出可作为地图详情页背景的俯视 2D 地图。
     3. 本函数只构建 URL 并触发预加载，不做任何 Web Storage 持久化。
     ========================================================================== */
  const categoryPromptMap = {
    西方魔幻: 'western high fantasy realm map, medieval kingdoms, castles, villages, ancient forests, rivers, mountain ranges, ruins, magic academy landmarks',
    古代宫廷: 'ancient imperial palace and capital map, palace complex, city walls, royal gardens, markets, temples, canals, official residences, ceremonial roads',
    古代仙侠: 'xianxia cultivation world map, immortal mountains, sect grounds, cloud bridges, sacred forests, spirit lakes, ancient formations, cave dwellings',
    未来科幻: 'futuristic science fiction city and region map, spaceport districts, neon transit lines, domes, research zones, energy towers, orbital elevator landmarks'
  };

  const categoryStyle = categoryPromptMap[safeCategory] || `${safeCategory} themed fictional world map`;
  const prompt = [
    `Create a clean top-down 2D illustrated map for category: ${safeCategory}.`,
    `Map name: ${safeName}.`,
    `Map description to follow strictly: ${safeDesc || 'No extra description provided; infer coherent terrain and landmarks from the category.'}`,
    `Visual requirements: ${categoryStyle}.`,
    'The image must look like a readable fantasy/game map background: clear roads or paths, rivers or terrain boundaries, districts and landmarks, balanced spacing, no text labels, no UI panels, no characters, no photorealistic scene, no 3D perspective, no isometric view.',
    'Use harmonious soft colors, high detail, top-down cartographic composition, suitable for placing location pin icons on top.'
  ].join(' ');

  const url = buildPollinationsImageUrl(prompt, { seed, width: 1024, height: 1024 });

  preloadPollinationsImage(url);

  return { prompt, seed, url };
}
