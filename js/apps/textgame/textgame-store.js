/**
 * ==========================================================================
 * [区域标注·已完成·梦笺持久化存储层]
 * 说明：
 * 1. 梦笺所有书籍、阅读进度、穿书存档、主页独立面具设置统一写入 DB.js / IndexedDB。
 * 2. 禁止使用 localStorage/sessionStorage。
 * 3. 不写双份存储兜底，不做长文本字段过滤，TXT 正文完整保存在梦笺自身记录中。
 * 位置: /js/apps/textgame/textgame-store.js
 * ==========================================================================
 */

import { DB } from '../../core/data/DB.js';

const APP_ID = 'textgame';
const DB_STORE_NAME = 'appsData';
let dbInstance = new DB();

function nowIso() {
  return new Date().toISOString();
}

function uid(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

/* ==========================================================================
   [区域标注·已完成·梦笺数据结构规范化]
   说明：
   1. settings.activeMaskId 为梦笺主页独立选择的用户面具，不同步闲谈/档案当前面具。
   2. books 保存 TXT 小说及阅读进度。
   3. storyRuns 保存穿书文游存档。
   ========================================================================== */
function normalizeTextGameData(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    id: APP_ID,
    appId: APP_ID,
    books: Array.isArray(source.books) ? source.books : [],
    storyRuns: Array.isArray(source.storyRuns) ? source.storyRuns : [],
    settings: {
      activeMaskId: String(source?.settings?.activeMaskId || '')
    },
    updatedAt: source.updatedAt || Date.now()
  };
}

/**
 * 获取梦笺应用的完整数据对象
 */
export async function getTextGameData() {
  const record = await dbInstance.get(DB_STORE_NAME, APP_ID);
  return normalizeTextGameData(record || null);
}

/**
 * 保存梦笺应用的完整数据对象
 */
export async function saveTextGameData(data) {
  const normalized = normalizeTextGameData(data);
  normalized.updatedAt = Date.now();
  await dbInstance.put(DB_STORE_NAME, normalized);
  return normalized;
}

/* ==========================================================================
   [区域标注·已完成·梦笺独立面具选择持久化]
   说明：
   1. 仅保存到梦笺 settings.activeMaskId。
   2. 不修改 archive::archive-data 的 activeMaskId，不影响闲谈用户主页当前面具。
   ========================================================================== */
export async function getTextGameSettings() {
  const data = await getTextGameData();
  return data.settings;
}

export async function setTextGameActiveMask(maskId) {
  const data = await getTextGameData();
  data.settings.activeMaskId = String(maskId || '');
  await saveTextGameData(data);
  return data.settings.activeMaskId;
}

/**
 * ==========================================================================
 * [区域标注·已完成·梦笺书籍管理]
 * 说明：
 * 1. 书架支持长按管理弹窗中的重命名/删除。
 * 2. 重命名与删除都只更新 IndexedDB 中的梦笺 books/storyRuns 数据，不写浏览器存储兜底。
 * ==========================================================================
 */

export async function getBooks() {
  const data = await getTextGameData();
  return data.books || [];
}

export async function addBook(book) {
  const data = await getTextGameData();
  if (!data.books) data.books = [];

  const exists = data.books.some(b => b.name === book.name && b.size === book.size);
  if (exists) {
    throw new Error('该书籍已存在于书架中');
  }

  const safeName = String(book.name || '未命名.txt');
  const newBook = {
    id: uid('book'),
    name: safeName,
    content: String(book.content || ''),
    size: Number(book.size || 0),
    importDate: nowIso(),
    progress: 0,
    currentChapterIndex: 0,
    coverText: safeName.replace(/\.txt$/i, '').substring(0, 2) || '书'
  };

  data.books.push(newBook);
  await saveTextGameData(data);
  return newBook;
}

export async function renameBook(bookId, name) {
  const safeName = String(name || '').trim();
  if (!safeName) {
    throw new Error('书名不能为空');
  }

  const data = await getTextGameData();
  let updatedBook = null;

  data.books = (data.books || []).map((book) => {
    if (book.id !== bookId) return book;
    updatedBook = {
      ...book,
      name: safeName,
      coverText: safeName.replace(/\.txt$/i, '').substring(0, 2) || '书',
      updatedAt: nowIso()
    };
    return updatedBook;
  });

  if (!updatedBook) {
    throw new Error('未找到该书籍');
  }

  data.storyRuns = (data.storyRuns || []).map((run) => (
    run.bookId === bookId
      ? { ...run, bookName: safeName, updatedAt: run.updatedAt || nowIso() }
      : run
  ));

  await saveTextGameData(data);
  return updatedBook;
}

export async function deleteBook(bookId) {
  const data = await getTextGameData();
  data.books = (data.books || []).filter(b => b.id !== bookId);
  data.storyRuns = (data.storyRuns || []).filter(run => run.bookId !== bookId);
  await saveTextGameData(data);
}

export async function getBook(bookId) {
  const data = await getTextGameData();
  return data.books?.find(b => b.id === bookId) || null;
}

/* ==========================================================================
   [区域标注·已完成·梦笺阅读进度]
   说明：阅读器翻页/切章时只更新梦笺书籍记录，不写其它存储。
   ========================================================================== */
export async function updateBookProgress(bookId, patch = {}) {
  const data = await getTextGameData();
  data.books = (data.books || []).map((book) => {
    if (book.id !== bookId) return book;
    return {
      ...book,
      progress: Number.isFinite(Number(patch.progress)) ? Number(patch.progress) : Number(book.progress || 0),
      currentChapterIndex: Number.isFinite(Number(patch.currentChapterIndex)) ? Number(patch.currentChapterIndex) : Number(book.currentChapterIndex || 0),
      updatedAt: nowIso()
    };
  });
  await saveTextGameData(data);
}

/* ==========================================================================
   [区域标注·已完成·梦笺穿书存档]
   说明：
   1. activeMaskSnapshot = 梦笺主页当前用户面具身份。
   2. companion.roleArchive = 同行联系人角色身份。
   3. 不保存联系人头像、联系方式、签名、开场白，也不保存其它用户面具身份。
   ========================================================================== */
export async function getStoryRuns() {
  const data = await getTextGameData();
  return data.storyRuns || [];
}

export async function getStoryRunsByMask(maskId) {
  const activeMaskId = String(maskId || '');
  const data = await getTextGameData();
  return (data.storyRuns || []).filter((run) => String(run?.activeMaskSnapshot?.id || '') === activeMaskId);
}

export async function getStoryRunsByBookAndMask(bookId, maskId) {
  const activeMaskId = String(maskId || '');
  const data = await getTextGameData();
  return (data.storyRuns || []).filter((run) => (
    run.bookId === bookId
    && String(run?.activeMaskSnapshot?.id || '') === activeMaskId
  ));
}

export async function saveStoryRun(run) {
  const data = await getTextGameData();
  const safeRun = {
    ...run,
    id: run.id || uid('run'),
    updatedAt: nowIso(),
    createdAt: run.createdAt || nowIso()
  };

  const index = (data.storyRuns || []).findIndex(item => item.id === safeRun.id);
  if (index >= 0) data.storyRuns[index] = safeRun;
  else data.storyRuns.unshift(safeRun);

  await saveTextGameData(data);
  return safeRun;
}

export async function deleteStoryRun(runId) {
  const data = await getTextGameData();
  data.storyRuns = (data.storyRuns || []).filter(run => run.id !== runId);
  await saveTextGameData(data);
}
