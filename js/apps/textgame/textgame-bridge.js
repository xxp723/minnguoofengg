/**
 * ==========================================================================
 * [区域标注·已完成·梦笺只读联动桥]
 * 说明：
 * 1. 只读取档案、闲谈通讯录、旧事记忆的 IndexedDB 数据，用于梦笺穿书配置。
 * 2. 本文件不写入档案/闲谈/旧事数据；梦笺自身持久化请走 textgame-store.js。
 * 3. 禁止使用 localStorage/sessionStorage；不写双份兜底存储。
 * 位置: /js/apps/textgame/textgame-bridge.js
 * ==========================================================================
 */

import { DB } from '../../core/data/DB.js';

const DB_STORE_NAME = 'appsData';
const ARCHIVE_RECORD_ID = 'archive::archive-data';
const MEMORY_APP_ID = 'memory';

const dbInstance = new DB();

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeArchiveRecord(record) {
  const value = record?.value ?? record?.data ?? {};
  const characters = Array.isArray(value?.characters) ? value.characters : [];
  const masks = Array.isArray(value?.masks) ? value.masks : [];
  return { masks, characters };
}

function normalizeMask(item = {}) {
  return {
    id: normalizeText(item.id),
    name: normalizeText(item.name) || '未命名面具',
    avatar: normalizeText(item.avatar),
    identity: normalizeText(item.identity),
    signature: normalizeText(item.signature),
    roleBindingIds: Array.isArray(item.roleBindingIds)
      ? item.roleBindingIds.map((id) => normalizeText(id)).filter(Boolean)
      : []
  };
}

function normalizeCharacter(item = {}) {
  return {
    id: normalizeText(item.id),
    name: normalizeText(item.name) || '未命名角色',
    avatar: normalizeText(item.avatar),
    identity: normalizeText(item.identity),
    signature: normalizeText(item.signature),
    contact: normalizeText(item.contact),
    greeting: normalizeText(item.greeting),
    prompt: normalizeText(item.prompt),
    personality: normalizeText(item.personality),
    background: normalizeText(item.background)
  };
}

/* ==========================================================================
   [区域标注·已完成·梦笺档案面具读取]
   说明：
   1. 读取档案应用 archive::archive-data 主记录。
   2. 梦笺可在主页独立选择面具，但不会修改档案应用 activeMaskId。
   ========================================================================== */
export async function loadArchiveProfilesForTextGame() {
  const record = await dbInstance.get(DB_STORE_NAME, ARCHIVE_RECORD_ID);
  const archive = normalizeArchiveRecord(record);
  const characters = archive.characters.map(normalizeCharacter).filter((item) => item.id);
  const characterIds = new Set(characters.map((item) => item.id));
  const masks = archive.masks
    .map(normalizeMask)
    .filter((item) => item.id)
    .map((mask) => ({
      ...mask,
      roleBindingIds: mask.roleBindingIds.filter((id) => characterIds.has(id))
    }));

  return { masks, characters };
}

/* ==========================================================================
   [区域标注·已完成·梦笺闲谈通讯录读取]
   说明：
   1. 读取当前梦笺面具对应的 chat_contacts_${maskId}。
   2. 只返回已添加到通讯录、且能匹配到档案绑定角色 contact 字段的同行候选人。
   3. 不复制联系人头像、联系方式、签名、开场白到梦笺存档；只在配置界面展示。
   ========================================================================== */
export async function loadCompanionCandidatesForTextGame(maskId) {
  const activeMaskId = normalizeText(maskId);
  const { masks, characters } = await loadArchiveProfilesForTextGame();
  const activeMask = masks.find((mask) => mask.id === activeMaskId) || null;
  if (!activeMask) return [];

  const boundRoleIds = new Set(activeMask.roleBindingIds || []);
  const boundRoles = characters.filter((role) => boundRoleIds.has(role.id));
  const contactsKey = `chat_contacts_${activeMaskId || 'default'}`;
  const contactRecord = await dbInstance.get(DB_STORE_NAME, contactsKey);
  const contacts = Array.isArray(contactRecord?.data) ? contactRecord.data : [];

  return boundRoles
    .map((role) => {
      const matchedContact = contacts.find((contact) => normalizeText(contact?.number) === normalizeText(role.contact));
      if (!matchedContact) return null;
      return {
        id: role.id,
        name: role.name,
        identity: role.identity,
        roleArchive: role,
        contactName: normalizeText(matchedContact.name) || role.name,
        contactNumber: normalizeText(matchedContact.number),
        inContacts: true
      };
    })
    .filter(Boolean);
}

/* ==========================================================================
   [区域标注·已完成·梦笺旧事记忆读取]
   说明：
   1. 按同行角色 id 只读取旧事应用 character:${characterId}:chat-memory。
   2. 读取结果用于生成穿书上下文，不改写旧事记忆。
   ========================================================================== */
export async function loadCompanionMemoryForTextGame(characterId) {
  const safeCharacterId = normalizeText(characterId);
  if (!safeCharacterId) return [];

  const memoryKey = `${MEMORY_APP_ID}::character:${safeCharacterId}:chat-memory`;
  const record = await dbInstance.get(DB_STORE_NAME, memoryKey);
  const items = Array.isArray(record?.value?.chatMemory?.items)
    ? record.value.chatMemory.items
    : [];

  return items
    .map((item) => ({
      id: normalizeText(item.id),
      title: normalizeText(item.title),
      summary: normalizeText(item.summary),
      type: normalizeText(item.type) || 'longterm',
      isHighPriority: Boolean(item.isHighPriority),
      isPermanent: Boolean(item.isPermanent),
      timelineAt: Number(item.timelineAt || 0)
    }))
    .filter((item) => item.id && item.summary)
    .sort((a, b) => Number(b.isHighPriority) - Number(a.isHighPriority) || Number(b.timelineAt) - Number(a.timelineAt))
    .slice(0, 12);
}
