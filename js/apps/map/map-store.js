/**
 * 文件名: js/apps/map/map-store.js
 * 用途: 地图应用的数据层。封装 IndexedDB 读写，不使用 localStorage/sessionStorage。
 */

export const APP_ID = 'map';
export const STORE_NAME = 'appsData';
export const DATA_KEY_MAPS = 'map_global_data';

/* ==========================================================================
   [区域标注·已修改·本地SVG地图生成器]
   说明：生成类似高德/百度地图样式的纯2D矢量地图作为封面，替代远端AI生图。
   ========================================================================== */
function generateLocalMapCoverData(mapName, mapDesc) {
  const seed = Math.floor(Math.random() * 1000000);
  // 用SVG硬编码绘制一个仿高德/百度的标准平面地图
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
  <!-- 背景底色 -->
  <rect width="100%" height="100%" fill="#eef2f5"/>
  
  <!-- 水系 (河流) -->
  <path d="M-50,250 Q150,200 200,850" stroke="#c0dbf9" stroke-width="80" fill="none" stroke-linecap="round"/>
  <path d="M500,850 Q550,600 850,500" stroke="#c0dbf9" stroke-width="60" fill="none" stroke-linecap="round"/>
  
  <!-- 绿地/公园 -->
  <path d="M50,50 L250,30 L280,180 L100,200 Z" fill="#d2edcd" />
  <path d="M600,100 L750,80 L780,280 L580,250 Z" fill="#d2edcd" />
  <path d="M350,650 L550,600 L580,780 L380,800 Z" fill="#d2edcd" />

  <!-- 建筑方块 (浅灰蓝色) -->
  <g fill="#dde4ec" rx="4">
    <rect x="350" y="50" width="80" height="120" />
    <rect x="450" y="60" width="100" height="80" />
    <rect x="80" y="300" width="100" height="100" />
    <rect x="200" y="320" width="80" height="80" />
    <rect x="350" y="250" width="120" height="150" />
    <rect x="500" y="280" width="100" height="100" />
    <rect x="650" y="250" width="80" height="180" />
    <rect x="80" y="500" width="150" height="120" />
    <rect x="250" y="550" width="80" height="100" />
    <rect x="650" y="550" width="120" height="100" />
    <rect x="680" y="700" width="80" height="80" />
  </g>

  <!-- 道路网 (白色粗线) -->
  <g stroke="#ffffff" stroke-linecap="square">
    <path d="M320,-20 L320,820" stroke-width="32" />
    <path d="M-20,450 L820,450" stroke-width="32" />
    <path d="M-20,220 L320,220" stroke-width="24" />
    <path d="M600,-20 L600,450" stroke-width="24" />
    <path d="M320,680 L820,680" stroke-width="24" />
  </g>

</svg>`;

  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  return {
    prompt: 'local_svg_map_v2',
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
   [区域标注·已完成·地图数据结构规范化]
   说明：只读写 IndexedDB，包含默认的现代都市封面方块
   ========================================================================== */
export function normalizeMapData(rawData) {
  const source = rawData && typeof rawData === 'object' ? rawData : {};
  let maps = Array.isArray(source.maps) ? source.maps : [];

  // 如果 maps 完全为空，添加默认方块
  if (maps.length === 0 && !source.hasInitialized) {
    const defaultName = '现代都市';
    const defaultDesc = '默认现代都市地图';
    const cover = generateLocalMapCoverData(defaultName, defaultDesc);
    maps.push({
      id: `map_default_${Date.now()}`,
      name: defaultName,
      description: defaultDesc,
      createdAt: Date.now(),
      imageUrl: cover.url,
      imagePrompt: cover.prompt,
      imageSeed: cover.seed,
      points: []
    });
  }

  // 整理数据字段，如果有地图缺失 imageUrl 则补充生成
  // 同时如果旧数据包含 "rpg style" 等旧提示词，强制更新为新风格
  let needsSave = false;
  maps = maps.map(m => {
    const mapName = String(m.name || '未命名地图').trim();
    const mapDesc = String(m.description || '').trim();
    const mapObj = {
      id: String(m.id || `map_${Date.now()}_${Math.random().toString(16).slice(2)}`),
      name: mapName,
      description: mapDesc,
      createdAt: Number(m.createdAt || Date.now()),
      points: Array.isArray(m.points) ? m.points : []
    };

    // [区域标注·已修改·强制更新旧地图数据到新的本地SVG样式]
    // 如果不是最新版的本地 SVG (v2)，则重写为本地地图
    const isOldStyle = m.imagePrompt !== 'local_svg_map_v2';

    if (!m.imageUrl || isOldStyle) {
      const cover = generateLocalMapCoverData(mapName, mapDesc);
      mapObj.imageUrl = cover.url;
      mapObj.imagePrompt = cover.prompt;
      mapObj.imageSeed = cover.seed;
      needsSave = true;
    } else {
      mapObj.imageUrl = m.imageUrl;
      mapObj.imagePrompt = m.imagePrompt || '';
      mapObj.imageSeed = m.imageSeed || 0;
    }

    return mapObj;
  });

  return {
    hasInitialized: true,
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

export function createMapDraft(name, description) {
  const mapName = String(name || '').trim();
  const mapDesc = String(description || '').trim();
  const cover = generateLocalMapCoverData(mapName, mapDesc);
  
  return {
    id: `map_custom_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    name: mapName,
    description: mapDesc,
    createdAt: Date.now(),
    imageUrl: cover.url,
    imagePrompt: cover.prompt,
    imageSeed: cover.seed,
    points: []
  };
}
