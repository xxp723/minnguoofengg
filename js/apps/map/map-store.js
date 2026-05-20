/**
 * 文件名: js/apps/map/map-store.js
 * 用途: 地图应用的数据层。封装 IndexedDB 读写，不使用 localStorage/sessionStorage。
 */

export const APP_ID = 'map';
export const STORE_NAME = 'appsData';
export const DATA_KEY_MAPS = 'map_global_data';

/* ==========================================================================
   [区域标注·已完成·本地SVG地图生成器]
   说明：每次新建“现代都市”地图时，使用随机种子生成不同的现代都市地图。
         现代都市分支已处理：道路不重叠、无桥梁、细河流、湖泊/绿化/建筑互相避让、
         建筑不铺满街区；其他分类只生成基础底色占位图。
   ========================================================================== */
function generateLocalMapCoverData(mapName, category) {
  const seed = Math.floor(Math.random() * 1000000);

  if (category !== '现代都市') {
    // 其他分类不予使用现代都市地图，使用分类底色占位
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="1600" viewBox="0 0 2400 1600">
  <rect width="100%" height="100%" fill="#D7C9B8"/>
</svg>`;
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    return { prompt: `placeholder_${category}`, seed, url };
  }

  /* ==========================================================================
     [区域标注·已完成·现代都市随机组合地图]
     说明：生成仿现实城市街区的随机 SVG 地图：
           1. 主/次道路基于坐标去重与最小间距生成，避免道路重叠。
           2. 不绘制桥梁；道路在河流上方正常穿过但不额外显示桥梁结构。
           3. 河流保持细窄；湖泊、绿化、建筑通过保留区碰撞检测互相避让。
           4. 建筑按街区内多个小楼块分布，保留空地，不占满整个小区域块。
     ========================================================================== */
  const W = 2400;
  const H = 1600;
  const SVG_NS_PROMPT = 'urban_svg_map_v5';

  let currentSeed = seed;
  const rand = () => {
    currentSeed = (currentSeed * 9301 + 49297) % 233280;
    return currentSeed / 233280;
  };
  const between = (min, max) => min + rand() * (max - min);
  const pick = arr => arr[Math.floor(rand() * arr.length)];
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const round = value => Math.round(value * 10) / 10;

  const reservedAreas = [];

  function rectsOverlap(a, b, gap = 0) {
    return !(
      a.x + a.w + gap < b.x ||
      b.x + b.w + gap < a.x ||
      a.y + a.h + gap < b.y ||
      b.y + b.h + gap < a.y
    );
  }

  function pointInRect(point, rect, gap = 0) {
    return (
      point.x >= rect.x - gap &&
      point.x <= rect.x + rect.w + gap &&
      point.y >= rect.y - gap &&
      point.y <= rect.y + rect.h + gap
    );
  }

  function circleRectOverlap(circle, rect, gap = 0) {
    const nearestX = clamp(circle.x, rect.x, rect.x + rect.w);
    const nearestY = clamp(circle.y, rect.y, rect.y + rect.h);
    return Math.hypot(circle.x - nearestX, circle.y - nearestY) <= circle.r + gap;
  }

  function isRectReserved(rect, gap = 0) {
    return reservedAreas.some(area => {
      if (area.type === 'rect') return rectsOverlap(rect, area, gap);
      if (area.type === 'circle') return circleRectOverlap(area, rect, gap);
      return false;
    });
  }

  // [区域标注·已完成·细河流生成] 河流宽度保持细窄，不显示桥梁。
  const isHorizontalRiver = rand() > 0.45;
  const riverWidth = Math.round(between(46, 70));
  const riverPts = isHorizontalRiver
    ? [
        { x: -120, y: between(260, H - 260) },
        { x: between(W * 0.28, W * 0.42), y: between(220, H - 220) },
        { x: between(W * 0.58, W * 0.72), y: between(220, H - 220) },
        { x: W + 120, y: between(260, H - 260) }
      ]
    : [
        { x: between(360, W - 360), y: -120 },
        { x: between(280, W - 280), y: between(H * 0.26, H * 0.42) },
        { x: between(280, W - 280), y: between(H * 0.58, H * 0.74) },
        { x: between(360, W - 360), y: H + 120 }
      ];

  function distToSegment(p, v, w) {
    const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
    if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = clamp(t, 0, 1);
    return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
  }

  function distToRiver(p) {
    let d = Infinity;
    for (let i = 0; i < riverPts.length - 1; i++) {
      d = Math.min(d, distToSegment(p, riverPts[i], riverPts[i + 1]));
    }
    return d;
  }

  function rectNearRiver(rect, gap = 0) {
    const points = [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.w, y: rect.y },
      { x: rect.x, y: rect.y + rect.h },
      { x: rect.x + rect.w, y: rect.y + rect.h },
      { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }
    ];
    return points.some(point => distToRiver(point) < riverWidth / 2 + gap);
  }

  const riverPath = `M${round(riverPts[0].x)},${round(riverPts[0].y)} C${round(riverPts[1].x)},${round(riverPts[1].y)} ${round(riverPts[2].x)},${round(riverPts[2].y)} ${round(riverPts[3].x)},${round(riverPts[3].y)}`;
  let waterSvg = `
    <path d="${riverPath}" fill="none" stroke="#C9EAF3" stroke-width="${riverWidth + 10}" stroke-linecap="round"/>
    <path d="${riverPath}" fill="none" stroke="#A9DCEB" stroke-width="${riverWidth}" stroke-linecap="round"/>`;

  // [区域标注·已完成·湖泊生成避让] 湖泊作为水域保留区，后续绿化和建筑不会压在湖泊下方。
  const lakeCount = 2 + Math.floor(rand() * 2);
  for (let i = 0; i < lakeCount; i++) {
    let placed = false;
    for (let attempt = 0; attempt < 28 && !placed; attempt++) {
      const rx = between(95, 180);
      const ry = between(55, 112);
      const cx = between(180 + rx, W - 180 - rx);
      const cy = between(160 + ry, H - 160 - ry);
      const rect = { x: cx - rx, y: cy - ry, w: rx * 2, h: ry * 2 };

      if (rectNearRiver(rect, 90) || isRectReserved(rect, 80)) continue;

      reservedAreas.push({ type: 'circle', x: cx, y: cy, r: Math.max(rx, ry), role: 'lake' });
      waterSvg += `
    <ellipse cx="${round(cx)}" cy="${round(cy)}" rx="${round(rx)}" ry="${round(ry)}" fill="#B8E3EE" opacity="0.92"/>
    <ellipse cx="${round(cx - rx * 0.15)}" cy="${round(cy - ry * 0.18)}" rx="${round(rx * 0.55)}" ry="${round(ry * 0.38)}" fill="#D9F2F6" opacity="0.45"/>`;
      placed = true;
    }
  }

  // [区域标注·已完成·道路无重叠生成] 同向道路通过最小间距过滤，主路/次路统一分层绘制。
  function addRoad(roads, value, minGap, min, max) {
    const clipped = clamp(value, min, max);
    if (roads.every(existing => Math.abs(existing - clipped) >= minGap)) {
      roads.push(clipped);
      return true;
    }
    return false;
  }

  const hRoads = [];
  const vRoads = [];
  const hMainCount = 4 + Math.floor(rand() * 2);
  const vMainCount = 5 + Math.floor(rand() * 3);

  for (let i = 1; i <= hMainCount; i++) {
    addRoad(hRoads, (H / (hMainCount + 1)) * i + between(-55, 55), 150, 110, H - 110);
  }
  for (let i = 1; i <= vMainCount; i++) {
    addRoad(vRoads, (W / (vMainCount + 1)) * i + between(-70, 70), 160, 120, W - 120);
  }

  const extraH = 4 + Math.floor(rand() * 4);
  const extraV = 6 + Math.floor(rand() * 5);
  for (let i = 0; i < extraH; i++) addRoad(hRoads, between(130, H - 130), 118, 110, H - 110);
  for (let i = 0; i < extraV; i++) addRoad(vRoads, between(140, W - 140), 122, 120, W - 120);

  hRoads.sort((a, b) => a - b);
  vRoads.sort((a, b) => a - b);

  const hBounds = [0, ...hRoads, H];
  const vBounds = [0, ...vRoads, W];
  const mainRoadWidth = 26;
  const roadCoreWidth = 18;
  const minorRoadWidth = 15;
  const minorCoreWidth = 10;

  let roadsSvg = '';
  const roadBorderColor = '#CFE6CE';
  const roadFillColor = '#FFFFFF';
  const avenueFillColor = '#FFF8DF';

  hRoads.forEach((y, index) => {
    const width = index % 3 === 0 ? mainRoadWidth + 5 : mainRoadWidth;
    roadsSvg += `<path d="M0,${round(y)} L${W},${round(y)}" stroke="${roadBorderColor}" stroke-width="${width}" stroke-linecap="butt"/>`;
  });
  vRoads.forEach((x, index) => {
    const width = index % 3 === 1 ? mainRoadWidth + 5 : mainRoadWidth;
    roadsSvg += `<path d="M${round(x)},0 L${round(x)},${H}" stroke="${roadBorderColor}" stroke-width="${width}" stroke-linecap="butt"/>`;
  });
  hRoads.forEach((y, index) => {
    roadsSvg += `<path d="M0,${round(y)} L${W},${round(y)}" stroke="${index % 3 === 0 ? avenueFillColor : roadFillColor}" stroke-width="${roadCoreWidth}" stroke-linecap="butt"/>`;
  });
  vRoads.forEach((x, index) => {
    roadsSvg += `<path d="M${round(x)},0 L${round(x)},${H}" stroke="${index % 3 === 1 ? avenueFillColor : roadFillColor}" stroke-width="${roadCoreWidth}" stroke-linecap="butt"/>`;
  });

  // [区域标注·已完成·绿化生成避让] 绿地先于建筑生成并加入保留区，建筑不会覆盖绿地。
  let parksSvg = '';
  const parkColors = ['#CFE8C8', '#D8ECD0', '#C9E3B9'];
  const parkCount = 7 + Math.floor(rand() * 5);

  for (let i = 0; i < parkCount; i++) {
    let placed = false;
    for (let attempt = 0; attempt < 36 && !placed; attempt++) {
      const w = between(145, 340);
      const h = between(90, 230);
      const x = between(80, W - w - 80);
      const y = between(80, H - h - 80);
      const rect = { x, y, w, h };

      if (rectNearRiver(rect, 24) || isRectReserved(rect, 56)) continue;

      reservedAreas.push({ type: 'rect', ...rect, role: 'park' });
      const color = pick(parkColors);
      parksSvg += `
    <path d="M${round(x + w * 0.08)},${round(y + h * 0.28)}
             Q${round(x + w * 0.24)},${round(y - h * 0.04)} ${round(x + w * 0.58)},${round(y + h * 0.08)}
             Q${round(x + w * 1.02)},${round(y + h * 0.18)} ${round(x + w * 0.9)},${round(y + h * 0.58)}
             Q${round(x + w * 0.78)},${round(y + h * 1.04)} ${round(x + w * 0.42)},${round(y + h * 0.92)}
             Q${round(x - w * 0.04)},${round(y + h * 0.82)} ${round(x + w * 0.08)},${round(y + h * 0.28)} Z"
          fill="${color}" opacity="0.9"/>`;

      const pathCount = 1 + Math.floor(rand() * 3);
      for (let p = 0; p < pathCount; p++) {
        const py = y + h * between(0.32, 0.72);
        parksSvg += `<path d="M${round(x + w * 0.16)},${round(py)} C${round(x + w * 0.38)},${round(py - h * 0.18)} ${round(x + w * 0.58)},${round(py + h * 0.2)} ${round(x + w * 0.84)},${round(py)}" fill="none" stroke="#F8F4E8" stroke-width="6" stroke-linecap="round" opacity="0.72"/>`;
      }

      placed = true;
    }
  }

  // [区域标注·已完成·街区建筑合理分布] 建筑避开水域/绿地，按街区留白分布，不铺满小区块。
  let buildingsSvg = '';
  let minorRoadsSvg = '';
  const bColors = ['#E8ECF1', '#F0F0ED', '#EAEAF1', '#EBF2F6', '#EFE6DA'];
  const strokeColor = '#D5DADF';

  for (let row = 0; row < hBounds.length - 1; row++) {
    for (let col = 0; col < vBounds.length - 1; col++) {
      const cellX = vBounds[col] + mainRoadWidth / 2;
      const cellY = hBounds[row] + mainRoadWidth / 2;
      const cellW = vBounds[col + 1] - vBounds[col] - mainRoadWidth;
      const cellH = hBounds[row + 1] - hBounds[row] - mainRoadWidth;

      if (cellW < 115 || cellH < 105) continue;

      const cellRect = { x: cellX, y: cellY, w: cellW, h: cellH };
      if (isRectReserved(cellRect, 4) && rand() < 0.55) continue;

      const hasInnerHorizontal = cellH > 240 && rand() > 0.42;
      const hasInnerVertical = cellW > 260 && rand() > 0.36;

      if (hasInnerHorizontal) {
        const y = cellY + cellH * between(0.42, 0.58);
        minorRoadsSvg += `<path d="M${round(cellX + 14)},${round(y)} L${round(cellX + cellW - 14)},${round(y)}" stroke="${roadBorderColor}" stroke-width="${minorRoadWidth}" stroke-linecap="round"/>`;
        minorRoadsSvg += `<path d="M${round(cellX + 14)},${round(y)} L${round(cellX + cellW - 14)},${round(y)}" stroke="${roadFillColor}" stroke-width="${minorCoreWidth}" stroke-linecap="round"/>`;
      }
      if (hasInnerVertical) {
        const x = cellX + cellW * between(0.42, 0.58);
        minorRoadsSvg += `<path d="M${round(x)},${round(cellY + 14)} L${round(x)},${round(cellY + cellH - 14)}" stroke="${roadBorderColor}" stroke-width="${minorRoadWidth}" stroke-linecap="round"/>`;
        minorRoadsSvg += `<path d="M${round(x)},${round(cellY + 14)} L${round(x)},${round(cellY + cellH - 14)}" stroke="${roadFillColor}" stroke-width="${minorCoreWidth}" stroke-linecap="round"/>`;
      }

      const margin = between(18, 34);
      const innerX = cellX + margin;
      const innerY = cellY + margin;
      const innerW = cellW - margin * 2;
      const innerH = cellH - margin * 2;
      if (innerW < 70 || innerH < 70) continue;

      const density = between(0.48, 0.68);
      const cols = Math.max(1, Math.floor(innerW / between(76, 118)));
      const rows = Math.max(1, Math.floor(innerH / between(72, 108)));
      const lotW = innerW / cols;
      const lotH = innerH / rows;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (rand() > density) continue;

          const padX = between(9, Math.max(10, lotW * 0.22));
          const padY = between(9, Math.max(10, lotH * 0.22));
          const bw = lotW - padX * 2;
          const bh = lotH - padY * 2;
          if (bw < 24 || bh < 24) continue;

          const bx = innerX + c * lotW + padX + between(-4, 4);
          const by = innerY + r * lotH + padY + between(-4, 4);
          const buildingRect = { x: bx, y: by, w: bw, h: bh };
          const center = { x: bx + bw / 2, y: by + bh / 2 };

          if (rectNearRiver(buildingRect, 44) || distToRiver(center) < riverWidth / 2 + 50 || isRectReserved(buildingRect, 16)) {
            continue;
          }

          const color = pick(bColors);
          const rx = bw > 42 && bh > 42 ? 6 : 4;
          const typeRoll = rand();

          if (typeRoll > 0.84 && bw > 48 && bh > 48) {
            buildingsSvg += `<rect x="${round(bx)}" y="${round(by)}" width="${round(bw)}" height="${round(bh)}" fill="${color}" stroke="${strokeColor}" stroke-width="1.4" rx="${rx}"/>`;
            buildingsSvg += `<rect x="${round(bx + bw * 0.18)}" y="${round(by + bh * 0.18)}" width="${round(bw * 0.64)}" height="${round(bh * 0.64)}" fill="#FFFFFF" opacity="0.55" rx="3"/>`;
          } else if (typeRoll > 0.68 && bw > 58) {
            buildingsSvg += `<rect x="${round(bx)}" y="${round(by)}" width="${round(bw * 0.44)}" height="${round(bh)}" fill="${color}" stroke="${strokeColor}" stroke-width="1.3" rx="${rx}"/>`;
            buildingsSvg += `<rect x="${round(bx + bw * 0.56)}" y="${round(by)}" width="${round(bw * 0.44)}" height="${round(bh)}" fill="${color}" stroke="${strokeColor}" stroke-width="1.3" rx="${rx}"/>`;
          } else {
            buildingsSvg += `<rect x="${round(bx)}" y="${round(by)}" width="${round(bw)}" height="${round(bh)}" fill="${color}" stroke="${strokeColor}" stroke-width="1.3" rx="${rx}"/>`;
          }
        }
      }
    }
  }

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="100%" height="100%" fill="#F4F7F5"/>
  <g id="map-parks">${parksSvg}</g>
  <g id="map-water">${waterSvg}</g>
  <g id="map-buildings">${buildingsSvg}</g>
  <g id="map-minor-roads">${minorRoadsSvg}</g>
  <g id="map-main-roads">${roadsSvg}</g>
</svg>`;

  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  return {
    prompt: SVG_NS_PROMPT,
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

    // [区域标注·已完成·旧封面升级到现代都市 v5 随机组合样式]
    const isOldStyle = m.imagePrompt !== 'urban_svg_map_v5' && !String(m.imagePrompt || '').startsWith('placeholder_');

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
