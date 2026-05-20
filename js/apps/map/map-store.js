/**
 * 文件名: js/apps/map/map-store.js
 * 用途: 地图应用的数据层。封装 IndexedDB 读写，仅使用项目 DB 模块持久化。
 */

import { generateMapCoverData } from '../../core/services/PollinationsImage.js';

export const APP_ID = 'map';
export const STORE_NAME = 'appsData';
export const DATA_KEY_MAPS = 'map_global_data';

/* ==========================================================================
   [区域标注·已完成·地图真实距离比例尺换算]
   说明：生成的本地地图以 SVG 原始像素作为稳定比例尺，默认 1px ≈ 1m。
         AI 可基于地点保存的 realXMeter/realYMeter 计算地图内两点直线距离。
   ========================================================================== */
export const MAP_REAL_SCALE = {
  widthPx: 2400,
  heightPx: 1600,
  metersPerPixel: 1,
  widthMeters: 2400,
  heightMeters: 1600
};

/* ==========================================================================
   [区域标注·已完成·现代都市本地SVG地图生成器]
   说明：现代都市地图使用占比式避让生成：建筑约40%、道路约20%、绿化约30%、河流约5%、湖泊约5%。
         除“河流与道路可相交”这个例外外，河流/湖泊/建筑/绿化/道路互不重叠。
         非现代都市地图不再走本地占位图，创建/补图/重生成时统一调用 Pollinations 提示词 URL。
   ========================================================================== */
export function generateLocalMapCoverData(mapName, category) {
  const seed = Math.floor(Math.random() * 1000000);

  if (category !== '现代都市') {
    // [区域标注·已完成·非现代都市禁用本地占位图] 非现代都市地图由 createMapImageData 调用 Pollinations，不在这里生成占位底色。
    return generateMapCoverData(mapName, '', category);
  }

  /* ==========================================================================
     [区域标注·已完成·现代都市占比式避让地图生成]
     说明：按近似视觉占比生成：建筑 40%、道路 20%、绿化带 30%、河流 5%、湖泊 5%。
           通过矩形保留区避让，保证：
           1. 除“河流与道路可相交”外，河流/湖泊/建筑/绿化/道路互不重叠。
           2. 湖泊、绿化带、建筑不会压住道路；建筑也不会压住河流/湖泊/绿化带。
           3. 允许在周围或附近相邻，但不互相压盖。
     ========================================================================== */
  const W = 2400;
  const H = 1600;
  const TOTAL_AREA = W * H;
  const SVG_NS_PROMPT = 'urban_svg_map_v8_ratio_strict_avoid';

  let currentSeed = seed;
  const rand = () => {
    currentSeed = (currentSeed * 9301 + 49297) % 233280;
    return currentSeed / 233280;
  };
  const between = (min, max) => min + rand() * (max - min);
  const pick = arr => arr[Math.floor(rand() * arr.length)];
  const round = value => Math.round(value * 10) / 10;

  const roadRects = [];
  const waterRects = [];
  const parkRects = [];
  const buildingRects = [];

  function rectsOverlap(a, b, gap = 0) {
    return !(
      a.x + a.w + gap <= b.x ||
      b.x + b.w + gap <= a.x ||
      a.y + a.h + gap <= b.y ||
      b.y + b.h + gap <= a.y
    );
  }

  function overlapsAny(rect, list, gap = 0) {
    return list.some(item => rectsOverlap(rect, item, gap));
  }

  function rectArea(rect) {
    return Math.max(0, rect.w) * Math.max(0, rect.h);
  }

  function addRect(rect, list) {
    const normalized = {
      x: round(rect.x),
      y: round(rect.y),
      w: round(rect.w),
      h: round(rect.h)
    };
    list.push(normalized);
    return normalized;
  }

  function isFreeForWater(rect, gap = 0) {
    return !overlapsAny(rect, roadRects, gap) && !overlapsAny(rect, waterRects, gap) && !overlapsAny(rect, parkRects, gap) && !overlapsAny(rect, buildingRects, gap);
  }

  function isFreeForPark(rect, gap = 0) {
    return !overlapsAny(rect, roadRects, gap) && !overlapsAny(rect, waterRects, gap) && !overlapsAny(rect, buildingRects, gap);
  }

  function isFreeForBuilding(rect, gap = 0) {
    return !overlapsAny(rect, roadRects, gap) && !overlapsAny(rect, waterRects, gap) && !overlapsAny(rect, parkRects, gap) && !overlapsAny(rect, buildingRects, gap);
  }

  // [区域标注·已完成·道路20%占比生成] 道路先生成保留区，湖泊/绿化/建筑均不会压到道路上。
  let roadsSvg = '';
  const roadFill = '#FFFFFF';
  const roadBorder = '#CFE6CE';
  const avenueFill = '#FFF8DF';
  const verticalRoads = [
    { x: 230, w: 58 },
    { x: 585, w: 52 },
    { x: 950, w: 58 },
    { x: 1325, w: 52 },
    { x: 1710, w: 58 },
    { x: 2085, w: 52 }
  ].map(r => ({ x: r.x + between(-18, 18), y: 0, w: r.w, h: H }));

  const horizontalRoads = [
    { y: 150, h: 52 },
    { y: 390, h: 58 },
    { y: 675, h: 52 },
    { y: 955, h: 58 },
    { y: 1240, h: 52 },
    { y: 1460, h: 44 }
  ].map(r => ({ x: 0, y: r.y + between(-16, 16), w: W, h: r.h }));

  [...verticalRoads, ...horizontalRoads].forEach(rect => addRect(rect, roadRects));

  // [区域标注·已完成·道路交叉口打通渲染] 先统一画道路外沿，再统一画道路核心层，避免交汇处出现“一条路盖住另一条路”的压盖感。
  roadRects.forEach((rect) => {
    const isVertical = rect.h > rect.w;
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;

    if (isVertical) {
      roadsSvg += `<path d="M${round(cx)},0 L${round(cx)},${H}" stroke="${roadBorder}" stroke-width="${round(rect.w)}" stroke-linecap="butt"/>`;
    } else {
      roadsSvg += `<path d="M0,${round(cy)} L${W},${round(cy)}" stroke="${roadBorder}" stroke-width="${round(rect.h)}" stroke-linecap="butt"/>`;
    }
  });

  roadRects.forEach((rect) => {
    const isVertical = rect.h > rect.w;
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    const core = Math.max(10, (isVertical ? rect.w : rect.h) - 16);

    if (isVertical) {
      roadsSvg += `<path d="M${round(cx)},0 L${round(cx)},${H}" stroke="${roadFill}" stroke-width="${round(core)}" stroke-linecap="butt"/>`;
    } else {
      roadsSvg += `<path d="M0,${round(cy)} L${W},${round(cy)}" stroke="${roadFill}" stroke-width="${round(core)}" stroke-linecap="butt"/>`;
    }
  });

  // [区域标注·已完成·河流5%与湖泊5%严格避让生成] 河流变细；河流可与道路相交，其它元素之间不重叠。
  let waterSvg = '';
  const riverHorizontal = rand() > 0.45;
  const riverBand = riverHorizontal
    ? addRect({ x: 0, y: between(560, 920), w: W, h: 90 }, waterRects)
    : addRect({ x: between(840, 1340), y: 0, w: 90, h: H }, waterRects);

  if (riverHorizontal) {
    const y = riverBand.y + riverBand.h / 2;
    const riverWidth = 58;
    const riverOuterWidth = 72;
    waterSvg += `
    <path d="M-120,${round(y)} C${round(W * 0.22)},${round(y - 18)} ${round(W * 0.62)},${round(y + 20)} ${W + 120},${round(y - 10)}" fill="none" stroke="#C9EAF3" stroke-width="${riverOuterWidth}" stroke-linecap="round"/>
    <path d="M-120,${round(y)} C${round(W * 0.22)},${round(y - 18)} ${round(W * 0.62)},${round(y + 20)} ${W + 120},${round(y - 10)}" fill="none" stroke="#A9DCEB" stroke-width="${riverWidth}" stroke-linecap="round"/>`;
  } else {
    const x = riverBand.x + riverBand.w / 2;
    const riverWidth = 58;
    const riverOuterWidth = 72;
    waterSvg += `
    <path d="M${round(x)},-120 C${round(x - 18)},${round(H * 0.24)} ${round(x + 20)},${round(H * 0.62)} ${round(x - 10)},${H + 120}" fill="none" stroke="#C9EAF3" stroke-width="${riverOuterWidth}" stroke-linecap="round"/>
    <path d="M${round(x)},-120 C${round(x - 18)},${round(H * 0.24)} ${round(x + 20)},${round(H * 0.62)} ${round(x - 10)},${H + 120}" fill="none" stroke="#A9DCEB" stroke-width="${riverWidth}" stroke-linecap="round"/>`;
  }

  let lakeArea = 0;
  const targetLakeArea = TOTAL_AREA * 0.05;
  for (let attempt = 0; attempt < 180 && lakeArea < targetLakeArea; attempt++) {
    const rect = {
      x: between(90, W - 330),
      y: between(90, H - 230),
      w: between(160, 300),
      h: between(90, 180)
    };

    if (!isFreeForWater(rect, 22)) continue;

    const lake = addRect(rect, waterRects);
    lakeArea += rectArea(lake);
    const cx = lake.x + lake.w / 2;
    const cy = lake.y + lake.h / 2;
    waterSvg += `
    <ellipse cx="${round(cx)}" cy="${round(cy)}" rx="${round(lake.w / 2)}" ry="${round(lake.h / 2)}" fill="#B8E3EE" opacity="0.94"/>
    <ellipse cx="${round(cx - lake.w * 0.08)}" cy="${round(cy - lake.h * 0.12)}" rx="${round(lake.w * 0.25)}" ry="${round(lake.h * 0.18)}" fill="#D9F2F6" opacity="0.48"/>`;
  }

  // [区域标注·已完成·绿化30%占比生成] 绿化带与道路/湖泊/河流/建筑均不重叠，可相邻分布。
  let parksSvg = '';
  const parkColors = ['#CFE8C8', '#D8ECD0', '#C9E3B9', '#BFDDB6'];
  let parkArea = 0;
  const targetParkArea = TOTAL_AREA * 0.30;

  for (let attempt = 0; attempt < 760 && parkArea < targetParkArea; attempt++) {
    const rect = {
      x: between(50, W - 470),
      y: between(50, H - 300),
      w: between(170, 440),
      h: between(95, 270)
    };

    if (!isFreeForPark(rect, 14)) continue;

    const park = addRect(rect, parkRects);
    parkArea += rectArea(park);
    const color = pick(parkColors);
    parksSvg += `
    <path d="M${round(park.x + park.w * 0.08)},${round(park.y + park.h * 0.25)}
             Q${round(park.x + park.w * 0.25)},${round(park.y - park.h * 0.04)} ${round(park.x + park.w * 0.58)},${round(park.y + park.h * 0.08)}
             Q${round(park.x + park.w * 1.02)},${round(park.y + park.h * 0.2)} ${round(park.x + park.w * 0.9)},${round(park.y + park.h * 0.62)}
             Q${round(park.x + park.w * 0.78)},${round(park.y + park.h * 1.05)} ${round(park.x + park.w * 0.38)},${round(park.y + park.h * 0.9)}
             Q${round(park.x - park.w * 0.03)},${round(park.y + park.h * 0.78)} ${round(park.x + park.w * 0.08)},${round(park.y + park.h * 0.25)} Z"
          fill="${color}" opacity="0.92"/>`;

    const pathY = park.y + park.h * between(0.38, 0.68);
    parksSvg += `<path d="M${round(park.x + park.w * 0.16)},${round(pathY)} C${round(park.x + park.w * 0.38)},${round(pathY - park.h * 0.16)} ${round(park.x + park.w * 0.58)},${round(pathY + park.h * 0.18)} ${round(park.x + park.w * 0.86)},${round(pathY)}" fill="none" stroke="#F8F4E8" stroke-width="6" stroke-linecap="round" opacity="0.72"/>`;
  }

  // [区域标注·已完成·建筑40%占比生成] 建筑只在剩余空地中生成，不与河流/湖泊/绿化/道路重叠。
  let buildingsSvg = '';
  const buildingColors = ['#E8ECF1', '#F0F0ED', '#EAEAF1', '#EBF2F6', '#EFE6DA', '#EDE4D8'];
  const strokeColor = '#D5DADF';
  let buildingArea = 0;
  const targetBuildingArea = TOTAL_AREA * 0.40;

  for (let attempt = 0; attempt < 3800 && buildingArea < targetBuildingArea; attempt++) {
    const rect = {
      x: between(28, W - 150),
      y: between(28, H - 130),
      w: between(44, 120),
      h: between(36, 108)
    };

    if (!isFreeForBuilding(rect, 7)) continue;

    const building = addRect(rect, buildingRects);
    buildingArea += rectArea(building);
    const color = pick(buildingColors);
    const radius = rand() > 0.86 ? 8 : 2;
    buildingsSvg += `<rect x="${building.x}" y="${building.y}" width="${building.w}" height="${building.h}" rx="${radius}" fill="${color}" stroke="${strokeColor}" stroke-width="1.2"/>`;

    if (rand() > 0.72 && building.w > 70 && building.h > 50) {
      buildingsSvg += `<rect x="${round(building.x + building.w * 0.18)}" y="${round(building.y + building.h * 0.18)}" width="${round(building.w * 0.64)}" height="${round(building.h * 0.64)}" fill="#FFFFFF" opacity="0.45"/>`;
    }
  }

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="100%" height="100%" fill="#F4F7F5"/>
  <g id="map-river-ratio-5-and-lake-ratio-5">${waterSvg}</g>
  <g id="map-parks-ratio-30">${parksSvg}</g>
  <g id="map-roads-ratio-20">${roadsSvg}</g>
  <g id="map-buildings-ratio-40">${buildingsSvg}</g>
</svg>`;

  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  return {
    prompt: SVG_NS_PROMPT,
    seed,
    url
  };
}

/* ==========================================================================
   [区域标注·已完成·地图应用 IndexedDB 专用读写]
   说明：直接读写 DB.js 中 appsData 仓库，不接入 Web Storage 兜底。
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
      distanceScale: normalizeMapDistanceScale(),
      points: []
    });
  }

  // 整理数据字段，如果有地图缺失 imageUrl 则补充生成
  let needsSave = false;
  maps = maps.map(m => {
    const mapName = String(m.name || '未命名地图').trim();
    const mapCategory = String(m.category || '现代都市').trim();
    const distanceScale = normalizeMapDistanceScale(m.distanceScale);
    const mapObj = {
      id: String(m.id || `map_${Date.now()}_${Math.random().toString(16).slice(2)}`),
      name: mapName,
      category: mapCategory,
      description: String(m.description || '').trim(),
      createdAt: Number(m.createdAt || Date.now()),
      sourceWorldBookId: String(m.sourceWorldBookId || m.worldbookId || '').trim(),
      distanceScale,
      points: Array.isArray(m.points) ? m.points.map(point => normalizeMapPoint(point, distanceScale)) : []
    };

    // [区域标注·已完成·旧封面升级与非现代都市 Pollinations 补图]
    const promptText = String(m.imagePrompt || '');
    const isOldStyle = mapCategory === '现代都市'
      ? m.imagePrompt !== 'urban_svg_map_v8_ratio_strict_avoid'
      : !m.imageUrl || promptText.startsWith('placeholder_') || m.imagePrompt === 'urban_svg_map_v8_ratio_strict_avoid';

    if (!m.imageUrl || isOldStyle) {
      const cover = createMapImageData(mapName, mapObj.description, mapCategory);
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

/* ==========================================================================
   [区域标注·已完成·地图地点真实距离字段规范化]
   说明：地点持久化时保留 x/y 百分比坐标，并同步 realXMeter/realYMeter，禁止使用任何 Web Storage 兜底。
   ========================================================================== */
export function normalizeMapDistanceScale(scale) {
  const source = scale && typeof scale === 'object' ? scale : {};
  const metersPerPixel = Number(source.metersPerPixel || MAP_REAL_SCALE.metersPerPixel) || 1;
  const widthPx = Number(source.widthPx || MAP_REAL_SCALE.widthPx) || MAP_REAL_SCALE.widthPx;
  const heightPx = Number(source.heightPx || MAP_REAL_SCALE.heightPx) || MAP_REAL_SCALE.heightPx;

  return {
    widthPx,
    heightPx,
    metersPerPixel,
    widthMeters: widthPx * metersPerPixel,
    heightMeters: heightPx * metersPerPixel
  };
}

export function normalizeMapPoint(point, distanceScale = MAP_REAL_SCALE) {
  const source = point && typeof point === 'object' ? point : {};
  const scale = normalizeMapDistanceScale(distanceScale);
  const x = Math.max(0, Math.min(100, Number(source.x || 0)));
  const y = Math.max(0, Math.min(100, Number(source.y || 0)));

  return {
    id: String(source.id || `point_${Date.now()}_${Math.random().toString(16).slice(2)}`),
    name: String(source.name || '').trim(),
    description: String(source.description || '').trim(),
    x,
    y,
    realXMeter: Math.round((x / 100) * scale.widthMeters * 100) / 100,
    realYMeter: Math.round((y / 100) * scale.heightMeters * 100) / 100,
    metersPerPixel: scale.metersPerPixel
  };
}

export function createMapPointDraft(name, description, x, y, scale = MAP_REAL_SCALE) {
  const normalizedScale = normalizeMapDistanceScale(scale);
  const normalizedX = Math.max(0, Math.min(100, Number(x || 0)));
  const normalizedY = Math.max(0, Math.min(100, Number(y || 0)));

  return normalizeMapPoint({
    id: `point_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    name,
    description,
    x: normalizedX,
    y: normalizedY,
    realXMeter: (normalizedX / 100) * normalizedScale.widthMeters,
    realYMeter: (normalizedY / 100) * normalizedScale.heightMeters,
    metersPerPixel: normalizedScale.metersPerPixel
  }, normalizedScale);
}

export function updateMapPointPosition(point, x, y, scale = MAP_REAL_SCALE) {
  if (!point) return null;

  const updated = createMapPointDraft(point.name, point.description, x, y, scale);
  point.x = updated.x;
  point.y = updated.y;
  point.realXMeter = updated.realXMeter;
  point.realYMeter = updated.realYMeter;
  point.metersPerPixel = updated.metersPerPixel;
  return point;
}

/* ==========================================================================
   [区域标注·已完成·地图封面生成路由]
   说明：现代都市使用本地 SVG 严格避让生成；其它分类使用 Pollinations.ai，并把分类、名称、描述写入提示词。
   ========================================================================== */
export function createMapImageData(mapName, mapDesc, category) {
  const safeCategory = String(category || '现代都市').trim();
  if (safeCategory === '现代都市') {
    return generateLocalMapCoverData(mapName, safeCategory);
  }
  return generateMapCoverData(mapName, mapDesc, safeCategory);
}

export function regenerateMapImage(mapObj) {
  const cover = createMapImageData(mapObj?.name || '未命名地图', mapObj?.description || '', mapObj?.category || '现代都市');
  return {
    imageUrl: cover.url,
    imagePrompt: cover.prompt,
    imageSeed: cover.seed,
    distanceScale: normalizeMapDistanceScale(mapObj?.distanceScale)
  };
}

export async function persistMapData(db, state) {
  const data = normalizeMapData(state);
  await dbPut(db, DATA_KEY_MAPS, data);
  return data;
}

export function createMapDraft(name, description, category, options = {}) {
  const mapName = String(name || '').trim();
  const mapDesc = String(description || '').trim();
  const mapCategory = String(category || '现代都市').trim();
  const cover = createMapImageData(mapName, mapDesc, mapCategory);

  return {
    id: `map_custom_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    name: mapName,
    category: mapCategory,
    description: mapDesc,
    createdAt: Date.now(),
    sourceWorldBookId: String(options.sourceWorldBookId || '').trim(),
    imageUrl: cover.url,
    imagePrompt: cover.prompt,
    imageSeed: cover.seed,
    distanceScale: normalizeMapDistanceScale(options.distanceScale),
    points: Array.isArray(options.points) ? options.points.map(point => normalizeMapPoint(point, normalizeMapDistanceScale(options.distanceScale))) : []
  };
}
