// Lưu dữ liệu trên máy bằng IndexedDB.
//  memories – các kỷ niệm (key: id)
//  photos   – ảnh: { id, full, thumb (ArrayBuffer), type, w, h }
//  kv       – cài đặt nhỏ (deviceId, kết nối đồng bộ, kỷ niệm chính…)

const NAME = 'ben-nhau';
const VERSION = 1;
let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('memories')) db.createObjectStore('memories', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    req.onsuccess = () => {
      const db = req.result;
      // iOS đôi khi đóng kết nối khi app chạy nền → lần sau mở lại.
      db.onclose = () => { dbPromise = null; };
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => { dbPromise = null; reject(req.error); };
  });
  return dbPromise;
}

async function run(store, mode, fn, retry = true) {
  try {
    const db = await open();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const req = fn(tx.objectStore(store));
      let result;
      if (req) req.onsuccess = () => { result = req.result; };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Không ghi được dữ liệu'));
    });
  } catch (e) {
    if (retry && e && (e.name === 'InvalidStateError' || /connection|closing/i.test(e.message || ''))) {
      dbPromise = null;
      return run(store, mode, fn, false);
    }
    throw e;
  }
}

export const get = (store, key) => run(store, 'readonly', (os) => os.get(key));
export const getAll = (store) => run(store, 'readonly', (os) => os.getAll());
export const keys = (store) => run(store, 'readonly', (os) => os.getAllKeys());
export const count = (store, key) => run(store, 'readonly', (os) => os.count(key));
export const put = (store, value, key) => run(store, 'readwrite', (os) => (key === undefined ? os.put(value) : os.put(value, key)));
export const del = (store, key) => run(store, 'readwrite', (os) => os.delete(key));

export const kv = {
  get: (k) => get('kv', k),
  set: (k, v) => put('kv', v, k),
};
