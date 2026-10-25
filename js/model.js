// Cấu trúc 1 kỷ niệm, danh sách loại kỷ niệm và bố cục.
// Muốn thêm loại / bố cục mới: chỉ cần thêm 1 mục vào TYPES / LAYOUTS.
import { daysInMonth, iso } from './dates.js';

export const TYPES = {
  love: { label: 'Yêu nhau', emoji: '❤️', title: 'Ngày yêu nhau', mode: 'since', layouts: ['couple', 'single', 'split'], theme: 'rose', sinceLabel: 'Đã bên nhau', yearlyLabel: 'Kỷ niệm' },
  wedding: { label: 'Ngày cưới', emoji: '💍', title: 'Ngày cưới', mode: 'since', layouts: ['couple', 'single'], theme: 'gold', sinceLabel: 'Đã cưới được', yearlyLabel: 'Kỷ niệm ngày cưới' },
  birthday: { label: 'Sinh nhật', emoji: '🎂', title: 'Sinh nhật', mode: 'yearly', layouts: ['single', 'text'], theme: 'sky', sinceLabel: 'Đã qua', yearlyLabel: 'Sinh nhật' },
  firstMeet: { label: 'Lần đầu gặp', emoji: '🌸', title: 'Lần đầu gặp nhau', mode: 'since', layouts: ['single', 'split', 'trio'], theme: 'peach', sinceLabel: 'Đã quen nhau', yearlyLabel: 'Kỷ niệm' },
  trip: { label: 'Chuyến đi', emoji: '✈️', title: 'Chuyến đi', mode: 'since', layouts: ['single', 'split', 'trio'], theme: 'mint', sinceLabel: 'Đã qua', yearlyLabel: 'Kỷ niệm' },
  custom: { label: 'Tùy chỉnh', emoji: '⭐', title: 'Kỷ niệm', mode: 'since', layouts: ['single', 'couple', 'split', 'trio', 'text'], theme: 'lilac', sinceLabel: 'Đã qua', yearlyLabel: 'Kỷ niệm' },
};
export const TYPE_ORDER = Object.keys(TYPES);

// rects: vị trí từng ô ảnh theo % [trái, trên, rộng, cao]. "couple" và "text" có cách vẽ riêng.
export const LAYOUTS = {
  couple: { label: '2 người', slots: 2 },
  single: { label: '1 ảnh', slots: 1, rects: [[0, 0, 100, 100]] },
  split: { label: 'Chia đôi', slots: 2, rects: [[0, 0, 50, 100], [50, 0, 50, 100]] },
  trio: { label: '3 ảnh', slots: 3, rects: [[0, 0, 50, 42], [50, 0, 50, 42], [0, 42, 100, 58]] },
  text: { label: 'Chỉ chữ', slots: 0 },
};

export const THEMES = ['rose', 'peach', 'gold', 'mint', 'sky', 'lilac', 'night'];
export const COUNT_MODES = { since: 'Đếm lên', until: 'Đếm ngược', yearly: 'Hằng năm' };
export const TRASH_DAYS = 30;
export const ID_RE = /^[A-Za-z0-9-]{8,64}$/;

export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 15) | 64;
  b[8] = (b[8] & 63) | 128;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function newMemory(type = 'love', date = '') {
  const t = TYPES[type];
  return {
    id: uuid(), type, title: t.title, date, countMode: t.mode, countFirstDay: false,
    layout: t.layouts[0], slots: [], people: [{ name: '' }, { name: '' }], note: '', theme: t.theme,
    createdAt: 0, updatedAt: 0, updatedBy: '', deleted: false, deletedAt: 0,
  };
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const num = (v) => (Number.isFinite(+v) ? +v : 0);
const str = (v, max) => (v == null ? '' : String(v)).slice(0, max);
const bool = (v) => v === true || v === 'true' || v === 'TRUE';
function list(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    try { const a = JSON.parse(v); return Array.isArray(a) ? a : []; } catch { return []; }
  }
  return [];
}
// Nhận 'YYYY-MM-DD' (hoặc 'DD/MM/YYYY' nếu ai đó sửa tay trong Sheet).
function normDate(v) {
  if (typeof v !== 'string') return null;
  let y, mo, d, m;
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v.trim()))) [y, mo, d] = [+m[1], +m[2], +m[3]];
  else if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v.trim()))) [d, mo, y] = [+m[1], +m[2], +m[3]];
  else return null;
  if (y < 1900 || y > 2200 || mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
  return iso({ y, m: mo, d });
}

/** Làm sạch dữ liệu từ bất kỳ nguồn nào (máy, Sheet, file sao lưu). Trả về null nếu hỏng. */
export function normalize(r) {
  if (!r || typeof r !== 'object') return null;
  const id = str(r.id, 64).trim();
  const date = normDate(r.date);
  if (!ID_RE.test(id) || !date) return null;
  const type = TYPES[r.type] ? r.type : 'custom';
  const t = TYPES[type];
  const people = list(r.people);
  return {
    id, type,
    title: str(r.title, 80).trim() || t.title,
    date,
    countMode: COUNT_MODES[r.countMode] ? r.countMode : t.mode,
    countFirstDay: bool(r.countFirstDay),
    layout: LAYOUTS[r.layout] ? r.layout : t.layouts[0],
    slots: list(r.slots).slice(0, 3).map((s) => ({
      photo: s && ID_RE.test(String(s.photo)) ? String(s.photo) : null,
      x: clamp(num(s && s.x), -1, 1),
      y: clamp(num(s && s.y), -1, 1),
      zoom: clamp(num(s && s.zoom) || 1, 1, 4),
    })),
    people: [0, 1].map((i) => ({ name: str(people[i] && people[i].name, 40) })),
    note: str(r.note, 5000),
    theme: THEMES.includes(r.theme) ? r.theme : t.theme,
    createdAt: num(r.createdAt),
    updatedAt: num(r.updatedAt),
    updatedBy: str(r.updatedBy, 64),
    deleted: bool(r.deleted),
    deletedAt: num(r.deletedAt),
  };
}

/** Bỏ các trường chỉ dùng trên máy (syncedAt). */
export function stripLocal(m) {
  const { syncedAt, ...rest } = m;
  return rest;
}

export function sameContent(a, b) {
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

export const photoIdsOf = (m) => (m.slots || []).map((s) => s && s.photo).filter(Boolean);

/** Ảnh của kỷ niệm còn cần giữ không (chưa xóa, hoặc còn trong thùng rác). */
export const keepPhotos = (m, now = Date.now()) => !m.deleted || now - m.deletedAt < TRASH_DAYS * 86400000;
