// Tính ngày. Mọi ngày là chuỗi 'YYYY-MM-DD' (không có giờ) nên không bị lệch múi giờ.

const DAY = 86400000;
const pad = (n) => String(n).padStart(2, '0');

export function parse(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
}
export const iso = (p) => `${String(p.y).padStart(4, '0')}-${pad(p.m)}-${pad(p.d)}`;
export const todayISO = (now = new Date()) => iso({ y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() });

export const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export const daysInMonth = (y, m) => [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];

const toNum = (p) => Math.round(Date.UTC(p.y, p.m - 1, p.d) / DAY);
function fromNum(n) {
  const d = new Date(n * DAY);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}

/** Số ngày từ a đến b (b - a). */
export const diffDays = (a, b) => toNum(parse(b)) - toNum(parse(a));
export const addDays = (s, n) => iso(fromNum(toNum(parse(s)) + n));

// Cộng k tháng; ngày bị "tràn" thì lùi về cuối tháng (31/1 + 1 tháng = 29/2 hoặc 28/2).
function addMonths(p, k) {
  const t = p.y * 12 + p.m - 1 + k;
  const y = Math.floor(t / 12);
  const m = t - y * 12 + 1;
  return { y, m, d: Math.min(p.d, daysInMonth(y, m)) };
}

/** Khoảng cách a → b (a <= b) dạng năm / tháng / ngày. */
export function ymd(a, b) {
  const pa = parse(a), pb = parse(b);
  let k = (pb.y - pa.y) * 12 + (pb.m - pa.m);
  if (toNum(addMonths(pa, k)) > toNum(pb)) k--;
  return { years: Math.floor(k / 12), months: k % 12, days: toNum(pb) - toNum(addMonths(pa, k)) };
}

// Ngày kỷ niệm trong năm y (29/2 → 28/2 ở năm không nhuận).
const onYear = (p, y) => ({ y, m: p.m, d: Math.min(p.d, daysInMonth(y, p.m)) });

/** Lần lặp lại hằng năm kế tiếp (tính cả hôm nay). nth = lần thứ mấy. */
export function nextYearly(s, today) {
  const p = parse(s), t = parse(today);
  let y = t.y;
  let occ = onYear(p, y);
  if (toNum(occ) < toNum(t)) occ = onYear(p, ++y);
  return { date: iso(occ), daysLeft: toNum(occ) - toNum(t), nth: y - p.y };
}

/**
 * Kết quả đếm của 1 kỷ niệm vào ngày `today`:
 *  since  – đã qua `value` ngày (đếm lên)
 *  until  – còn `value` ngày (đếm ngược; ngày đã chọn ở tương lai)
 *  past   – kỷ niệm đếm ngược nhưng ngày đã qua `value` ngày
 *  yearly – còn `value` ngày tới lần lặp kế tiếp
 */
export function countInfo(m, today) {
  if (m.countMode === 'yearly') {
    const n = nextYearly(m.date, today);
    return { kind: 'yearly', value: n.daysLeft, today: n.daysLeft === 0, nth: n.nth, next: n.date };
  }
  const d = diffDays(m.date, today);
  if (m.countMode === 'until' || d < 0) {
    if (d <= 0) return { kind: 'until', value: -d || 0, today: d === 0 };
    return { kind: 'past', value: d };
  }
  const extra = m.countFirstDay ? 1 : 0;
  return { kind: 'since', value: d + extra, ymd: ymd(m.date, extra ? addDays(today, 1) : today) };
}

const nf = new Intl.NumberFormat('vi-VN');
export const fmtNum = (n) => nf.format(n);

const WEEKDAYS = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
export function fmtDate(s, withWeekday = false) {
  const p = parse(s);
  if (!p) return '';
  const text = `${pad(p.d)}/${pad(p.m)}/${p.y}`;
  return withWeekday ? `${WEEKDAYS[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()]}, ${text}` : text;
}

export function fmtYmd({ years, months, days }) {
  const parts = [];
  if (years) parts.push(`${years} năm`);
  if (months) parts.push(`${months} tháng`);
  if (days || !parts.length) parts.push(`${days} ngày`);
  return parts.join(' ');
}
