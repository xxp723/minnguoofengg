/**
 * 文件名: js/apps/map/map-store.js
 * 用途: 地图应用的数据层。封装 IndexedDB 读写，不使用 localStorage/sessionStorage。
 */

export const APP_ID = 'map';
export const STORE_NAME = 'appsData';
export const DATA_KEY_MAPS = 'map_global_data';

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
    maps.push({
      id: `map_default_${Date.now()}`,
      name: '现代都市',
      description: '默认现代都市地图',
      createdAt: Date.now()
    });
  }

  // 整理数据字段
  maps = maps.map(m => ({
    id: String(m.id || `map_${Date.now()}_${Math.random().toString(16).slice(2)}`),
    name: String(m.name || '未命名地图').trim(),
    description: String(m.description || '').trim(),
    createdAt: Number(m.createdAt || Date.now())
  }));

  return {
    hasInitialized: true,
    maps
  };
}

export async function loadMapData(db) {
  const raw = await dbGet(db, DATA_KEY_MAPS);
  return normalizeMapData(raw);
}

export async function persistMapData(db, state) {
  const data = normalizeMapData(state);
  await dbPut(db, DATA_KEY_MAPS, data);
  return data;
}

export function createMapDraft(name, description) {
  return {
    id: `map_custom_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    name: String(name || '').trim(),
    description: String(description || '').trim(),
    createdAt: Date.now()
  };
}
