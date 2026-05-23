/**
 * ==========================================================================
 * [区域标注·本次需求·梦笺持久化存储层]
 * 说明：负责与 core/data/DB.js 交互，完全使用 IndexedDB，绝对禁止使用 localStorage
 * ==========================================================================
 */

import { DB } from '../../core/data/DB.js';

const APP_ID = 'textgame';
const DB_STORE_NAME = 'appsData';
let dbInstance = new DB();

/**
 * 获取梦笺应用的完整数据对象
 */
async function getTextGameData() {
  const data = await dbInstance.get(DB_STORE_NAME, APP_ID);
  if (!data) {
    return { id: APP_ID, books: [], settings: {} };
  }
  return data;
}

/**
 * 保存梦笺应用的完整数据对象
 */
async function saveTextGameData(data) {
  await dbInstance.put(DB_STORE_NAME, data);
}

/**
 * ==========================================================================
 * [区域标注·本次需求·梦笺书籍管理]
 * ==========================================================================
 */

export async function getBooks() {
  const data = await getTextGameData();
  return data.books || [];
}

export async function addBook(book) {
  const data = await getTextGameData();
  if (!data.books) data.books = [];
  
  // 简单去重：按名称和大小判断是否已存在
  const exists = data.books.some(b => b.name === book.name && b.size === book.size);
  if (exists) {
    throw new Error('该书籍已存在于书架中');
  }
  
  const newBook = {
    id: 'book_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    name: book.name,
    content: book.content, // 完整文本内容
    size: book.size,
    importDate: new Date().toISOString(),
    progress: 0,
    coverText: book.name.substring(0, 2)
  };
  
  data.books.push(newBook);
  await saveTextGameData(data);
  return newBook;
}

export async function deleteBook(bookId) {
  const data = await getTextGameData();
  if (data.books) {
    data.books = data.books.filter(b => b.id !== bookId);
    await saveTextGameData(data);
  }
}

export async function getBook(bookId) {
  const data = await getTextGameData();
  return data.books?.find(b => b.id === bookId) || null;
}
