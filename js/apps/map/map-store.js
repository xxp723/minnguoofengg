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

  // [区域标注·已修改·现代都市：仿高德地图风格排布，清新浅色调，无桥梁，道路无重叠，建筑避水]
  const W = 2400;
  const H = 1600;

  let currentSeed = seed;
  const rand = () => {
    currentSeed = (currentSeed * 9301 + 49297) % 233280;
    return currentSeed / 233280;
  };

  // 生成河流骨架 (两段平滑贝塞尔曲线或折线)
  const isHorizontalRiver = rand() > 0.5;
  let riverPts = [];
  if (isHorizontalRiver) {
    riverPts = [
      {x: -100, y: rand() * H},
      {x: W/2 + (rand()-0.5)*400, y: rand() * H},
      {x: W + 100, y: rand() * H}
    ];
  } else {
    riverPts = [
      {x: rand() * W, y: -100},
      {x: rand() * W + (rand()-0.5)*400, y: H/2},
      {x: rand() * W, y: H + 100}
    ];
  }
  const riverWidth = 140;

  // 河流 SVG (浅蓝色)
  let riversSvg = `<path d="M${riverPts[0].x},${riverPts[0].y} Q${riverPts[1].x},${riverPts[1].y} ${riverPts[2].x},${riverPts[2].y}" fill="none" stroke="#B0E0E6" stroke-width="${riverWidth}" stroke-linecap="round"/>`;

  // 辅助函数：点到贝塞尔曲线(近似为两段线段)的距离估算，用于避水
  function distToSegment(p, v, w) {
    const l2 = (v.x - w.x)**2 + (v.y - w.y)**2;
    if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
    let t = ((p.x - v.x)*(w.x - v.x) + (p.y - v.y)*(w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (v.x + t*(w.x - v.x)), p.y - (v.y + t*(w.y - v.y)));
  }
  function distToRiver(p) {
    // 因为使用 Q 曲线，用控制点构成的两段线段做近似距离
    const d1 = distToSegment(p, riverPts[0], riverPts[1]);
    const d2 = distToSegment(p, riverPts[1], riverPts[2]);
    return Math.min(d1, d2);
  }

  // 绿地 (公园) - 清新浅绿色
  let parksSvg = '';
  for (let i = 0; i < 8; i++) {
    const cx = rand()*W, cy = rand()*H, r = 120 + rand()*250;
    // 增加一点不规则形状
    parksSvg += `<path d="M${cx},${cy-r} Q${cx+r},${cy-r/2} ${cx+r},${cy} Q${cx+r/2},${cy+r} ${cx},${cy+r} Q${cx-r},${cy+r/2} ${cx-r},${cy} Q${cx-r/2},${cy-r} ${cx},${cy-r} Z" fill="#D3E9D3" opacity="0.8"/>`;
  }

  // 道路生成，防重叠逻辑：保证道路间距至少 > minGap
  const hRoads = [];
  const vRoads = [];
  const minGap = 120;
  
  // 生成横向道路
  for(let i=0; i<8 + Math.floor(rand()*4); i++) {
    let candidate = rand() * H;
    if (hRoads.every(y => Math.abs(y - candidate) > minGap)) {
      hRoads.push(candidate);
    }
  }
  // 生成纵向道路
  for(let i=0; i<12 + Math.floor(rand()*6); i++) {
    let candidate = rand() * W;
    if (vRoads.every(x => Math.abs(x - candidate) > minGap)) {
      vRoads.push(candidate);
    }
  }

  hRoads.push(0, H);
  vRoads.push(0, W);
  hRoads.sort((a,b)=>a-b);
  vRoads.sort((a,b)=>a-b);

  const mainRoadWidth = 24;
  const innerRoadWidth = 16;
  // 道路颜色：仿高德，浅绿色边框，白色/浅黄色内芯
  const roadBorderColor = "#B4E1C6"; // 浅绿色描边
  const roadFillColor = "#FFFFFF";

  let roadsSvg = '';
  // 先画所有底边 (形成统一的边框效果)
  hRoads.forEach(y => { if(y>0 && y<H) roadsSvg += `<path d="M0,${y} L${W},${y}" stroke="${roadBorderColor}" stroke-width="${mainRoadWidth}"/>`; });
  vRoads.forEach(x => { if(x>0 && x<W) roadsSvg += `<path d="M${x},0 L${x},${H}" stroke="${roadBorderColor}" stroke-width="${mainRoadWidth}"/>`; });
  
  // 再画所有内层 (形成道路交叉口无缝连接)
  hRoads.forEach(y => { if(y>0 && y<H) roadsSvg += `<path d="M0,${y} L${W},${y}" stroke="${roadFillColor}" stroke-width="${innerRoadWidth}"/>`; });
  vRoads.forEach(x => { if(x>0 && x<W) roadsSvg += `<path d="M${x},0 L${x},${H}" stroke="${roadFillColor}" stroke-width="${innerRoadWidth}"/>`; });

  // 建筑区块生成
  let buildingsSvg = '';
  // 建筑颜色，极浅灰、浅米色、浅蓝色
  const bColors = ['#E8ECF1', '#F0F0ED', '#EAEAF1', '#EBF2F6'];
  
  for (let i=0; i<hRoads.length-1; i++) {
    for (let j=0; j<vRoads.length-1; j++) {
      let cellX = vRoads[j] + mainRoadWidth/2;
      let cellY = hRoads[i] + mainRoadWidth/2;
      let cellW = vRoads[j+1] - vRoads[j] - mainRoadWidth;
      let cellH = hRoads[i+1] - hRoads[i] - mainRoadWidth;

      if (cellW > 60 && cellH > 60) {
        let cols = Math.max(1, Math.floor(cellW / (50 + rand()*30)));
        let rows = Math.max(1, Math.floor(cellH / (50 + rand()*30)));
        let bW = cellW / cols;
        let bH = cellH / rows;

        for (let r=0; r<rows; r++) {
          for (let c=0; c<cols; c++) {
            if (rand() > 0.3) { // 70% 概率生成建筑
              let bx = cellX + c*bW + 8;
              let by = cellY + r*bH + 8;
              let bw = bW - 16;
              let bh = bH - 16;
              
              if (bw > 20 && bh > 20) {
                let center = {x: bx + bw/2, y: by + bh/2};
                // 确保不建在河里，留出一定河岸距离
                if (distToRiver(center) > riverWidth/2 + 20) {
                  let bColor = bColors[Math.floor(rand() * bColors.length)];
                  let strokeColor = "#D4DAE0"; // 极浅的灰色建筑描边
                  
                  let typeRoll = rand();
                  if (typeRoll > 0.8 && bw > 40 && bh > 40) {
                    buildingsSvg += `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="${bColor}" stroke="${strokeColor}" stroke-width="1.5" rx="6"/>`;
                    buildingsSvg += `<rect x="${bx+8}" y="${by+8}" width="${bw-16}" height="${bh-16}" fill="#FFFFFF" opacity="0.6" rx="3"/>`;
                  } else {
                    buildingsSvg += `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="${bColor}" stroke="${strokeColor}" stroke-width="1.5" rx="4"/>`;
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  // 底色为极浅的蓝灰白，仿高德地图默认底色
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="100%" height="100%" fill="#F1F4F6"/>
  ${parksSvg}
  ${riversSvg}
  <g>${buildingsSvg}</g>
  <g>${roadsSvg}</g>
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
