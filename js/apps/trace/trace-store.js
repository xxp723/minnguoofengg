/**
 * 文件名: js/apps/trace/trace-store.js
 * 用途: 轨迹应用的数据层。封装 IndexedDB 读写，仅使用项目 DB 模块持久化，禁止使用 localStorage。
 */

export const APP_ID = 'trace';
export const STORE_NAME = 'appsData';

/* [区域标注·本次修改·隔离存储键名与跨应用数据获取] */
export const DATA_KEY_TRACE_OLD = (maskId, contactId) => `trace_data_${maskId || 'default'}_${contactId || 'none'}`;
export const DATA_KEY_TRACE_BASE = (maskId, contactId) => `trace_data_base_${maskId || 'default'}_${contactId || 'none'}`;
export const DATA_KEY_TRACE_SCHEDULE = (maskId, contactId, date) => `trace_schedule_${maskId || 'default'}_${contactId || 'none'}_${date}`;
export const ARCHIVE_DB_RECORD_ID = 'archive::archive-data';
export const DATA_KEY_CONTACTS = (maskId) => `chat_contacts_${maskId || 'default'}`;
export const KEY_LAST_VIEW = 'trace_last_view';

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

export async function getLastView(db) {
  const data = await dbGet(db, KEY_LAST_VIEW);
  return data || {};
}

export async function saveLastView(db, maskId, contactId) {
  await dbPut(db, KEY_LAST_VIEW, { maskId, contactId });
}

/* ==========================================================================
   [区域标注·本次修改·轨迹数据结构规范化与隔离加载]
   说明：只读写 IndexedDB，返回规范化的状态对象，分为日程、资产、位置三个模块
   ========================================================================== */
/* ==========================================================================
   [区域标注·本次新增·旧数据向后兼容迁移]
   ========================================================================== */
export async function migrateOldData(db, maskId, contactId) {
  const oldKey = DATA_KEY_TRACE_OLD(maskId, contactId);
  try {
    const record = await db.get(STORE_NAME, oldKey);
    if (!record || !record.data) return; // 没有旧数据或已迁移

    const oldData = record.data;
    
    // 1. 迁移基础数据 (资产, 位置)
    const baseKey = DATA_KEY_TRACE_BASE(maskId, contactId);
    const existingBase = await dbGet(db, baseKey);
    if (!existingBase || (!existingBase.assets?.length && !existingBase.locations?.length)) {
      await dbPut(db, baseKey, {
        hasInitialized: true,
        assets: Array.isArray(oldData.assets) ? oldData.assets : [],
        locations: Array.isArray(oldData.locations) ? oldData.locations : []
      });
    }

    // 2. 迁移旧日程数据（如果有）并根据最后更新时间归档至对应日期
    if (oldData.schedules && oldData.schedules.length > 0) {
      let targetDateStr = new Date().toISOString().split('T')[0];
      if (record.updatedAt) {
        // 利用时间戳找回该数据到底属于哪一天
        // 我们需要考虑时区偏移，直接构造 Date 获取本地日期字符串
        const upDate = new Date(record.updatedAt);
        // 如果是有效时间，则转换为 'YYYY-MM-DD' 格式
        if (!isNaN(upDate.getTime())) {
          const year = upDate.getFullYear();
          const month = String(upDate.getMonth() + 1).padStart(2, '0');
          const day = String(upDate.getDate()).padStart(2, '0');
          targetDateStr = `${year}-${month}-${day}`;
        }
      }
      
      const scheduleKey = DATA_KEY_TRACE_SCHEDULE(maskId, contactId, targetDateStr);
      const existingSchedule = await dbGet(db, scheduleKey);
      if (!existingSchedule || !existingSchedule.schedules?.length) {
        await dbPut(db, scheduleKey, {
          schedules: oldData.schedules,
          boundMapId: oldData.boundMapId || null
        });
      }
    }

    // 3. 删除旧键数据，避免重复迁移
    await db.delete(STORE_NAME, oldKey);
    console.log(`[Trace] 成功迁移并清除了旧版本数据: ${oldKey}`);
  } catch (err) {
    console.error(`[Trace] 迁移旧版本数据失败: ${oldKey}`, err);
  }
}

export function normalizeTraceData(rawData) {
  const source = rawData && typeof rawData === 'object' ? rawData : {};
  return {
    hasInitialized: true,
    schedules: Array.isArray(source.schedules) ? source.schedules : [],
    assets: Array.isArray(source.assets) ? source.assets : [],
    locations: Array.isArray(source.locations) ? source.locations : [],
    boundMapId: source.boundMapId || null
  };
}

export async function loadTraceData(db, maskId, contactId, date) {
  // 联系人为空时不加载任何有效数据，返回空结构
  if (!contactId) return normalizeTraceData(null);
  
  // 拦截：优先执行可能存在的旧数据向后兼容迁移
  await migrateOldData(db, maskId, contactId);
  
  const baseKey = DATA_KEY_TRACE_BASE(maskId, contactId);
  const baseRaw = await dbGet(db, baseKey);
  const data = normalizeTraceData(baseRaw);
  
  // 日程按天独立读取
  const scheduleKey = DATA_KEY_TRACE_SCHEDULE(maskId, contactId, date);
  const scheduleRaw = await dbGet(db, scheduleKey);
  
  if (scheduleRaw) {
    data.schedules = Array.isArray(scheduleRaw.schedules) ? scheduleRaw.schedules : [];
    data.boundMapId = scheduleRaw.boundMapId || null;
  } else {
    data.schedules = [];
    data.boundMapId = null;
  }

  return data;
}

export async function persistTraceData(db, state, maskId, contactId, date) {
  if (!contactId) return normalizeTraceData(null);
  
  const baseKey = DATA_KEY_TRACE_BASE(maskId, contactId);
  const baseData = {
    hasInitialized: true,
    assets: state.assets,
    locations: state.locations
  };
  await dbPut(db, baseKey, baseData);
  
  const scheduleKey = DATA_KEY_TRACE_SCHEDULE(maskId, contactId, date);
  const scheduleData = {
    schedules: state.schedules,
    boundMapId: state.boundMapId
  };
  await dbPut(db, scheduleKey, scheduleData);
  
  return state;
}
