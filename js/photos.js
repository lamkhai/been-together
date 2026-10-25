// Ảnh: nén khi chọn, lưu trên máy (IndexedDB), lấy địa chỉ để hiển thị.
// Mỗi ảnh có mã riêng (UUID) và không bao giờ bị sửa → chỉ tải lên / tải về 1 lần.
import * as db from './db.js';
import { uuid } from './model.js';

const FULL = 1600;   // cạnh dài tối đa của ảnh lưu
const THUMB = 400;   // ảnh nhỏ cho danh sách
const urls = new Map();   // 'id:full' | 'id:thumb' → object URL
const temp = new Map();   // ảnh vừa chọn trong màn sửa, chưa lưu

function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => resolve({ img, done: () => URL.revokeObjectURL(url) });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Không đọc được ảnh này (có thể là ảnh HEIC). Hãy chọn ảnh JPG hoặc PNG.'));
    };
    img.src = url;
  });
}

// Vẽ lại ảnh với cạnh dài tối đa `max`. Trình duyệt tự xoay đúng chiều;
// vẽ lại cũng xóa thông tin EXIF/GPS trong ảnh.
function draw(src, max) {
  const w = src.naturalWidth || src.width;
  const h = src.naturalHeight || src.height;
  const s = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * s));
  c.height = Math.max(1, Math.round(h * s));
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

function encode(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Không nén được ảnh'))), 'image/jpeg', quality);
  });
}

const release = (c) => { c.width = 0; c.height = 0; }; // giải phóng bộ nhớ (quan trọng trên iPhone)

/** Nén ảnh người dùng chọn → { id, full, thumb, w, h } (chưa lưu). */
export async function processFile(file) {
  if (!file) throw new Error('Chưa chọn ảnh');
  const { img, done } = await loadImage(file);
  try {
    const big = draw(img, FULL);
    const full = await encode(big, 0.8);
    const small = draw(big, THUMB);
    const thumb = await encode(small, 0.75);
    const p = { id: uuid(), full, thumb, w: big.width, h: big.height };
    release(big);
    release(small);
    return p;
  } finally {
    done();
  }
}

export function addTemp(p) { temp.set(p.id, p); }
export function dropTemp(id) { if (temp.delete(id)) forget(id); }

/** Lưu ảnh tạm (vừa chọn) vào máy. */
export async function saveTemp(id) {
  const p = temp.get(id);
  if (!p) return;
  await db.put('photos', { id, full: await p.full.arrayBuffer(), thumb: await p.thumb.arrayBuffer(), type: 'image/jpeg', w: p.w, h: p.h });
  temp.delete(id);
}

function forget(id) {
  for (const v of ['full', 'thumb']) {
    const k = `${id}:${v}`;
    if (urls.has(k)) { URL.revokeObjectURL(urls.get(k)); urls.delete(k); }
  }
}

export const cachedUrl = (id, variant = 'full') => urls.get(`${id}:${variant}`) || '';

export async function photoUrl(id, variant = 'full') {
  const k = `${id}:${variant}`;
  if (urls.has(k)) return urls.get(k);
  let blob;
  const t = temp.get(id);
  if (t) blob = variant === 'thumb' ? t.thumb : t.full;
  else {
    const r = await db.get('photos', id);
    if (!r) return '';
    blob = new Blob([variant === 'thumb' ? r.thumb : r.full], { type: r.type || 'image/jpeg' });
  }
  if (!urls.has(k)) urls.set(k, URL.createObjectURL(blob));
  return urls.get(k);
}

/** Gắn ảnh vào các thẻ <img data-photo="…"> trong `root`. Ảnh chưa có trên máy → hiện dấu ☁. */
export function hydrate(root) {
  root.querySelectorAll('img[data-photo]').forEach((img) => {
    const id = img.dataset.photo;
    const variant = img.dataset.variant || 'full';
    const cached = cachedUrl(id, variant);
    if (cached) { img.src = cached; return; }
    photoUrl(id, variant)
      .then((u) => { if (u) img.src = u; else img.parentElement.classList.add('missing'); })
      .catch(() => img.parentElement.classList.add('missing'));
  });
}

export const localIds = () => db.keys('photos');
export async function has(id) { return temp.has(id) || (await db.count('photos', id)) > 0; }
export async function remove(id) { forget(id); await db.del('photos', id); }

function bufToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function base64ToBuf(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out.buffer;
}

/** Ảnh lớn dạng base64 (để gửi lên Drive hoặc ghi vào file sao lưu). */
export async function base64Of(id) {
  const r = await db.get('photos', id);
  return r ? bufToBase64(r.full) : '';
}

/** Lưu ảnh nhận được dạng base64 (từ Drive hoặc file sao lưu), tự tạo ảnh nhỏ. */
export async function storeBase64(id, b64) {
  const buf = base64ToBuf(b64);
  const { img, done } = await loadImage(new Blob([buf], { type: 'image/jpeg' }));
  try {
    const small = draw(img, THUMB);
    const thumb = await encode(small, 0.75);
    release(small);
    await db.put('photos', { id, full: buf, thumb: await thumb.arrayBuffer(), type: 'image/jpeg', w: img.naturalWidth, h: img.naturalHeight });
  } finally {
    done();
  }
}
