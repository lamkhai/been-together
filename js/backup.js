// Sao lưu ra 1 file .json (gồm cả ảnh) và nhập lại từ file đó.
import { normalize, photoIdsOf, stripLocal, ID_RE } from './model.js';
import * as photos from './photos.js';
import { todayISO } from './dates.js';

/** Tạo file sao lưu (chưa lưu / chia sẻ). */
export async function buildBackup(memories) {
  const head = JSON.stringify({ app: 'ben-nhau', version: 1, exportedAt: new Date().toISOString(), memories: memories.map(stripLocal) });
  // Ghép từng phần để không phải tạo 1 chuỗi khổng lồ trong bộ nhớ.
  const parts = [head.slice(0, -1), ',"photos":{'];
  const ids = new Set();
  memories.forEach((m) => photoIdsOf(m).forEach((id) => ids.add(id)));
  let n = 0;
  for (const id of ids) {
    const b64 = await photos.base64Of(id);
    if (b64) parts.push(`${n++ ? ',' : ''}"${id}":"${b64}"`);
  }
  parts.push('}}');
  return new File(parts, `ben-nhau-sao-luu-${todayISO()}.json`, { type: 'application/json' });
}

/** Lưu file: điện thoại → menu Chia sẻ (Lưu vào Tệp, Drive, Zalo…); máy tính → tải về. */
export async function shareFile(file) {
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name });
      return 'shared';
    } catch (e) {
      if (e.name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement('a'), { href: url, download: file.name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return 'downloaded';
}

/**
 * Nhập file sao lưu: gộp vào dữ liệu đang có (không xóa gì).
 * Kỷ niệm trong file chỉ ghi đè khi mới hơn bản trên máy.
 */
export async function importBackup(file, api) {
  let data;
  try { data = JSON.parse(await file.text()); } catch {
    throw new Error('Không đọc được file (không phải file JSON).');
  }
  if (!data || data.app !== 'ben-nhau' || !Array.isArray(data.memories)) {
    throw new Error('Đây không phải file sao lưu của Bên Nhau.');
  }
  let pics = 0, mems = 0;
  for (const [id, b64] of Object.entries(data.photos || {})) {
    if (!ID_RE.test(id) || typeof b64 !== 'string' || (await photos.has(id))) continue;
    try { await photos.storeBase64(id, b64); pics++; } catch { /* ảnh hỏng → bỏ qua */ }
  }
  for (const raw of data.memories) {
    const m = normalize(raw);
    if (!m) continue;
    const local = api.get(m.id);
    if (!local || m.updatedAt > local.updatedAt) { await api.putImported(m); mems++; }
  }
  return { mems, pics };
}
