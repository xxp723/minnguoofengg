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
         生成横向大地图 (2400x1600)，符合真实路网排布与色彩。
         如果选择其他分类，则不使用这套封面地图，生成一张基础底色占位图。
   ========================================================================== */
function generateLocalMapCoverData(mapName, category) {
  const seed = Math.floor(Math.random() * 1000000);
  
  if (category !== '现代都市') {
    // 其他分类不予使用现代都市地图，使用分类底色+文字占位
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="1600" viewBox="0 0 2400 1600">
  <rect width="100%" height="100%" fill="#D7C9B8"/>
</svg>`;
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    return { prompt: `placeholder_${category}`, seed, url };
  }

  // 现代都市：排列组合生成更真实的横向大图
  const W = 2400;
  const H = 1600;

  let currentSeed = seed;
  const rand = () => {
    currentSeed = (currentSeed * 9301 + 49297) % 233280;
    return currentSeed / 233280;
  };

  // 1. 水系 (横贯或纵贯的大河)
  let rivers = '';
  for (let i = 0; i < 2; i++) {
    let y1 = rand() * H;
    let y2 = rand() * H;
    let cy = rand() * H;
    let cx = W / 2;
    rivers += `<path d="M-100,${y1} Q${cx},${cy} ${W+100},${y2}" fill="none" stroke="#A4C8D5" stroke-width="140" stroke-linecap="round"/>`;
  }

  // 2. 绿地公园
  let parks = '';
  for (let i = 0; i < 8; i++) {
    parks += `<circle cx="${rand()*W}" cy="${rand()*H}" r="${120 + rand()*250}" fill="#CDE0C4" />`;
  }

  // 3. 道路网格计算
  const hRoads = [];
  const vRoads = [];
  // 横纵向的主干道
  for(let i=0; i<6 + Math.floor(rand()*4); i++) hRoads.push(rand() * H);
  for(let i=0; i<10 + Math.floor(rand()*6); i++) vRoads.push(rand() * W);
  // 确保有边界和排序
  hRoads.push(0, H);
  vRoads.push(0, W);
  hRoads.sort((a,b)=>a-b);
  vRoads.sort((a,b)=>a-b);

  let roads = '';
  // 绘制路网 (双层描边实现道路外观)
  hRoads.forEach(y => { 
    roads += `<path d="M0,${y} L${W},${y}" stroke="#D1C9B8" stroke-width="36"/>`;
    roads += `<path d="M0,${y} L${W},${y}" stroke="#FFFFFF" stroke-width="28"/>`; 
  });
  vRoads.forEach(x => { 
    roads += `<path d="M${x},0 L${x},${H}" stroke="#D1C9B8" stroke-width="36"/>`;
    roads += `<path d="M${x},0 L${x},${H}" stroke="#FFFFFF" stroke-width="28"/>`; 
  });

  // 4. 建筑群 (在道路切分的街区内生成)
  let buildings = '';
  for (let i=0; i<hRoads.length-1; i++) {
    for (let j=0; j<vRoads.length-1; j++) {
      if (rand() > 0.25) { // 75% 的街区有建筑
        let rw = vRoads[j+1] - vRoads[j];
        let rh = hRoads[i+1] - hRoads[i];
        if (rw > 80 && rh > 80) { // 街区足够大
          let bx = vRoads[j] + 24;
          let by = hRoads[i] + 24;
          let bw = rw - 48;
          let bh = rh - 48;
          // 有一定几率将街区内切割为两个建筑块
          if (bw > 200 && rand() > 0.5) {
            buildings += `<rect x="${bx}" y="${by}" width="${bw/2-10}" height="${bh}" fill="#E8E3D9" stroke="#D1C9B8" stroke-width="3" rx="12"/>`;
            buildings += `<rect x="${bx + bw/2 + 10}" y="${by}" width="${bw/2-10}" height="${bh}" fill="#E8E3D9" stroke="#D1C9B8" stroke-width="3" rx="12"/>`;
          } else {
            buildings += `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="#E8E3D9" stroke="#D1C9B8" stroke-width="3" rx="12"/>`;
          }
        }
      }
    }
  }

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="100%" height="100%" fill="#F3F0E6"/>
  ${rivers}
  ${parks}
  <g>
    ${buildings}
  </g>
  <g>
    ${roads}
  </g>
</svg>`;

  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  return {
    prompt: 'urban_svg_map_v4',
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
    : ['现代都市', '西方魔幻', '古代宫廷', '古代仙侠', '未来科幻'];

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
    const isOldStyle = m.imagePrompt !== 'urban_svg_map_v4' && !String(m.imagePrompt || '').startsWith('placeholder_');

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
