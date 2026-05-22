/**
 * 文件名: js/apps/trace/trace-store.js
 * 用途: 轨迹应用的数据层。封装 IndexedDB 读写，仅使用项目 DB 模块持久化，禁止使用 localStorage。
 */

export const APP_ID = 'trace';
export const STORE_NAME = 'appsData';

/* [区域标注·本次修改·隔离存储键名与跨应用数据获取] */
export const DATA_KEY_TRACE = (maskId, contactId) => `trace_data_${maskId || 'default'}_${contactId || 'none'}`;
export const ARCHIVE_DB_RECORD_ID = 'archive::archive-data';
export const DATA_KEY_CONTACTS = (maskId) => `chat_contacts_${maskId || 'default'}`;

/* ==========================================================================
   [区域标注·本次需求·轨迹应用 IndexedDB 专用读写]
   说明：直接读写 DB.js 中 appsData 仓库，不接入 Web Storage 兜底。
   ========================================================================== */
export async function dbGet(db, key) {
  try {
    const record = await db.get(STORE_NAME, key);
    // 兼容取值逻辑，优先用 record.data
    return record ? (record.data ?? record.value ?? null) : null;
  } catch (error) {
    console.error(`[Trace] DB 读失败: ${key}`, error);
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
    console.error(`[Trace] DB 写入失败: ${key}`, error);
  }
}

/* [区域标注·本次修改·读取档案面具及通讯录联系人] */
export async function getArchiveMasks(db) {
  const record = await dbGet(db, ARCHIVE_DB_RECORD_ID);
  const data = record && typeof record === 'object' ? record : {};
  const masks = Array.isArray(data.masks) ? data.masks : [];
  const activeMaskId = String(data.activeMaskId || '').trim();
  return { masks, activeMaskId };
}

export async function getContactsByMask(db, maskId) {
  const contacts = await dbGet(db, DATA_KEY_CONTACTS(maskId));
  return Array.isArray(contacts) ? contacts : [];
}

/* ==========================================================================
   [区域标注·本次修改·轨迹数据结构规范化与隔离加载]
   说明：只读写 IndexedDB，返回规范化的状态对象，分为日程、资产、位置三个模块
   ========================================================================== */
export function normalizeTraceData(rawData) {
  const source = rawData && typeof rawData === 'object' ? rawData : {};
  return {
    hasInitialized: true,
    schedules: Array.isArray(source.schedules) ? source.schedules : [],
    assets: Array.isArray(source.assets) ? source.assets : [],
    locations: Array.isArray(source.locations) ? source.locations : []
  };
}

export async function loadTraceData(db, maskId, contactId) {
  // 联系人为空时不加载任何有效数据，返回空结构
  if (!contactId) return normalizeTraceData(null);
  
  const key = DATA_KEY_TRACE(maskId, contactId);
  const raw = await dbGet(db, key);
  const data = normalizeTraceData(raw);

  // 初次加载时如果不存在数据，初始化空数组并保存一次
  if (!raw) {
    await dbPut(db, key, data);
  }

  return data;
}

export async function persistTraceData(db, state, maskId, contactId) {
  if (!contactId) return normalizeTraceData(null);
  
  const key = DATA_KEY_TRACE(maskId, contactId);
  const data = normalizeTraceData(state);
  await dbPut(db, key, data);
  return data;
}
