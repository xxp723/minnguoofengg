/**
 * 文件名: js/apps/map/map-store.js
 * 用途: 地图应用的数据层。封装 IndexedDB 读写，不使用 localStorage/sessionStorage。
 */

export const APP_ID = 'map';
export const STORE_NAME = 'appsData';
export const DATA_KEY_MAPS = 'map_global_data';

/* ==========================================================================
   [区域标注·已修改·本地SVG地图生成器]
   说明：每次新建“现代都市”地图时，随机生成道路、水系、建筑和绿地的排布。
         如果选择其他分类，则不使用这套封面地图，生成一张基础底色占位图。
   ========================================================================== */
function generateLocalMapCoverData(mapName, category) {
  const seed = Math.floor(Math.random() * 1000000);
  
  if (category !== '现代都市') {
    // 其他分类不予使用现代都市地图，使用分类底色+文字占位
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
  <rect width="100%" height="100%" fill="#E6DCD2"/>
  <!-- <text x="50%" y="50%" font-size="48" fill="#5C4B43" text-anchor="middle">${category}</text> -->
</svg>`;
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    return { prompt: `placeholder_${category}`, seed, url };
  }

  // 现代都市：排列组合生成
  const hLines = [];
  const vLines = [];
  // 随机横纵道路 3~6 条
  for(let i = 0; i < 3 + Math.floor(Math.random() * 4); i++) hLines.push(100 + Math.random() * 600);
  for(let i = 0; i < 3 + Math.floor(Math.random() * 4); i++) vLines.push(100 + Math.random() * 600);

  // 随机水系 1~2条
  let rivers = '';
  for(let i = 0; i < 1 + Math.floor(Math.random() * 2); i++) {
    const startY = 100 + Math.random() * 600;
    const midX = 200 + Math.random() * 400;
    const midY = 100 + Math.random() * 600;
    const endY = 100 + Math.random() * 600;
    rivers += `<path d="M-50,${startY} Q${midX},${midY} 850,${endY}" stroke="#c0dbf9" stroke-width="${40 + Math.random() * 40}" fill="none" stroke-linecap="round"/>\n`;
  }
  
  // 随机绿地
  let parks = '';
  for(let i = 0; i < 3 + Math.floor(Math.random() * 4); i++) {
    const cx = 50 + Math.random() * 700;
    const cy = 50 + Math.random() * 700;
    const r = 40 + Math.random() * 80;
    parks += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#d2edcd" />\n`;
  }

  // 随机建筑块
  let buildings = '';
  for(let i = 0; i < 15 + Math.floor(Math.random() * 10); i++) {
    const x = 30 + Math.random() * 700;
    const y = 30 + Math.random() * 700;
    const w = 30 + Math.random() * 80;
    const h = 30 + Math.random() * 100;
    buildings += `<rect x="${x}" y="${y}" width="${w}" height="${h}" />\n`;
  }

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
  <rect width="100%" height="100%" fill="#eef2f5"/>
  ${rivers}
  ${parks}
  <g fill="#dde4ec" rx="4">
    ${buildings}
  </g>
  <g stroke="#ffffff" stroke-linecap="square">
    ${hLines.map(y => `<path d="M-20,${y} L820,${y}" stroke-width="${16 + Math.random() * 16}" />`).join('\n')}
    ${vLines.map(x => `<path d="M${x},-20 L${x},820" stroke-width="${16 + Math.random() * 16}" />`).join('\n')}
  </g>
</svg>`;

  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  return {
    prompt: 'urban_svg_map_v3',
    seed: seed,
    url: url
  };
}

/* ==========================================================================
   [区域标注·已完成·地图应用 IndexedDB 专用读写]
   说明：直接读写 DB.js 中 appsData 仓库，禁用 localStorage
   ========================================================================== */
export async function dbGet(db, key) {
  try {
    const record = await db.get(STORE_NAME, key);
    // 兼容取值逻辑，优先用 record.data
    return record ? (record.data ?? record.value ?? null) : null;
  } catch (error) {
    console.error(`[Map] DB 读失败: ${key}`, error);
    return null;
  }
}

export async function dbPut(db, key, data) {
  try {
    await db.put(STORE_NAME, {
      id: key,
      appId: APP_ID,
      data: data,
      updatedAt: Date.now()
    });
  } catch (error) {
    console.error(`[Map] DB 写入失败: ${key}`, error);
  }
}

/* ==========================================================================
   [区域标注·已修改·地图数据结构规范化]
   说明：只读写 IndexedDB，包含默认的分类和地图封面方块
   ========================================================================== */
export function normalizeMapData(rawData) {
  const source = rawData && typeof rawData === 'object' ? rawData : {};
  let maps = Array.isArray(source.maps) ? source.maps : [];
  let categories = Array.isArray(source.categories) && source.categories.length > 0 
    ? source.categories 
    : ['现代都市', '西方魔幻', '古代宫廷', '古代仙侠'];

  // 如果 maps 完全为空，添加默认方块
  if (maps.length === 0 && !source.hasInitialized) {
    const defaultName = '我的城市';
    const defaultCategory = '现代都市';
    const cover = generateLocalMapCoverData(defaultName, defaultCategory);
    maps.push({
      id: `map_default_${Date.now()}`,
      name: defaultName,
      category: defaultCategory,
      description: '默认地图',
      createdAt: Date.now(),
      imageUrl: cover.url,
      imagePrompt: cover.prompt,
      imageSeed: cover.seed,
      points: []
    });
  }

  // 整理数据字段，如果有地图缺失 imageUrl 则补充生成
  let needsSave = false;
  maps = maps.map(m => {
    const mapName = String(m.name || '未命名地图').trim();
    const mapCategory = String(m.category || '现代都市').trim();
    const mapObj = {
      id: String(m.id || `map_${Date.now()}_${Math.random().toString(16).slice(2)}`),
      name: mapName,
      category: mapCategory,
      description: String(m.description || '').trim(),
      createdAt: Number(m.createdAt || Date.now()),
      points: Array.isArray(m.points) ? m.points : []
    };

    // [区域标注·已修改·强制更新旧地图数据到新的本地随机生成排布样式]
    const isOldStyle = m.imagePrompt !== 'urban_svg_map_v3' && !String(m.imagePrompt || '').startsWith('placeholder_');

    if (!m.imageUrl || isOldStyle) {
      const cover = generateLocalMapCoverData(mapName, mapCategory);
      mapObj.imageUrl = cover.url;
      mapObj.imagePrompt = cover.prompt;
      mapObj.imageSeed = cover.seed;
      needsSave = true;
    } else {
      mapObj.imageUrl = m.imageUrl;
      mapObj.imagePrompt = m.imagePrompt || '';
      mapObj.imageSeed = m.imageSeed || 0;
    }

    // 检查是否有缺失类别的需要保存分类集合
    if (!categories.includes(mapCategory)) {
      categories.push(mapCategory);
      needsSave = true;
    }

    return mapObj;
  });

  // 如果原始数据里没有 categories 这个数组，肯定要保存一次
  if (!Array.isArray(source.categories)) {
    needsSave = true;
  }

  return {
    hasInitialized: true,
    categories,
    maps,
    _needsSave: needsSave // 内部标记，如果补齐了旧数据，可以在 load 时顺便回写
  };
}

export async function loadMapData(db) {
  const raw = await dbGet(db, DATA_KEY_MAPS);
  const data = normalizeMapData(raw);
  
  if (data._needsSave) {
    delete data._needsSave;
    await dbPut(db, DATA_KEY_MAPS, data);
  } else {
    delete data._needsSave;
  }
  
  return data;
}

export async function persistMapData(db, state) {
  const data = normalizeMapData(state);
  await dbPut(db, DATA_KEY_MAPS, data);
  return data;
}

export function createMapDraft(name, description, category) {
  const mapName = String(name || '').trim();
  const mapDesc = String(description || '').trim();
  const mapCategory = String(category || '现代都市').trim();
  const cover = generateLocalMapCoverData(mapName, mapCategory);
  
  return {
    id: `map_custom_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    name: mapName,
    category: mapCategory,
    description: mapDesc,
    createdAt: Date.now(),
    imageUrl: cover.url,
    imagePrompt: cover.prompt,
    imageSeed: cover.seed,
    points: []
  };
}
