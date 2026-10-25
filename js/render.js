// Vẽ kỷ niệm ra HTML: thẻ lớn theo bố cục, dòng danh sách, mục "Sắp tới", bảng thông tin.
import { TYPES, LAYOUTS, COUNT_MODES, labelOf } from './model.js';
import { countInfo, nextYearly, addDays, fmtNum, fmtDate, fmtYmd } from './dates.js';
import { esc, icon } from './ui.js';

/** Vị trí + độ phóng của ảnh trong 1 ô (x, y từ -1 đến 1; zoom từ 1 đến 4). */
export function imgStyle(s) {
  const pos = `${((s.x + 1) * 50).toFixed(1)}% ${((s.y + 1) * 50).toFixed(1)}%`;
  return `object-position:${pos};transform-origin:${pos};transform:scale(${(+s.zoom || 1).toFixed(3)})`;
}

/**
 * Chữ hiển thị số ngày của 1 kỷ niệm.
 * Dòng chữ trên số ngày (label) do người dùng đặt chỉ dùng ở trạng thái bình thường của cách đếm;
 * các trạng thái đặc biệt (đúng ngày, đã qua, đếm lên mà ngày ở tương lai) giữ chữ cố định.
 */
export function countView(m, today) {
  const c = countInfo(m, today);
  const t = TYPES[m.type];
  const label = labelOf(m);
  switch (c.kind) {
    case 'since':
      return {
        label, big: fmtNum(c.value), unit: 'ngày',
        sub: c.value === 0 ? 'Hôm nay là ngày đầu tiên' : `${fmtYmd(c.ymd)} · từ ${fmtDate(m.date)}`,
      };
    case 'until':
      return c.today
        ? { label: 'Chính là', big: 'Hôm nay', word: true, unit: '', sub: fmtDate(m.date, true) }
        : { label: m.countMode === 'until' ? label : 'Còn', big: fmtNum(c.value), unit: 'ngày', sub: `đến ${fmtDate(m.date, true)}` };
    case 'past':
      return { label: 'Đã qua', big: fmtNum(c.value), unit: 'ngày', sub: `kể từ ${fmtDate(m.date)}` };
    default: {
      const nth = c.nth > 0 ? ` lần thứ ${c.nth}` : '';
      return c.today
        ? { label: 'Hôm nay là', big: '🎉', unit: '', sub: `${t.yearlyLabel}${nth}` }
        : { label, big: fmtNum(c.value), unit: 'ngày', sub: `đến ${t.yearlyLabel.toLowerCase()}${nth} · ${fmtDate(c.next)}` };
    }
  }
}

const titleHTML = (m) => `<div class="card-title">${TYPES[m.type].emoji} ${esc(m.title)}</div>`;
const countHTML = (cv) => `<div class="card-label">${esc(cv.label)}</div>
  <div class="card-count"><span class="num${cv.word ? ' word' : ''}">${esc(cv.big)}</span>${cv.unit ? `<span class="unit">${esc(cv.unit)}</span>` : ''}</div>
  ${cv.sub ? `<div class="card-sub">${esc(cv.sub)}</div>` : ''}`;

function slotHTML(s, i, style, o) {
  const has = s && s.photo;
  const cls = `slot${has ? '' : ' empty'}${o.selected === i ? ' selected' : ''}`;
  const inner = has
    ? `<img data-photo="${esc(s.photo)}" data-variant="${o.variant || 'full'}" alt="" draggable="false" style="${imgStyle(s)}">`
    : o.editable ? `<span class="slot-add">${icon('image')}<small>Chọn ảnh</small></span>` : '';
  return `<div class="${cls}" data-slot="${i}"${style ? ` style="${style}"` : ''}>${inner}</div>`;
}

/**
 * Thẻ kỷ niệm lớn.
 * o.editable: đang ở màn sửa (ô trống hiện "Chọn ảnh"); o.selected: ô đang chọn để căn chỉnh.
 */
export function cardHTML(m, today, o = {}) {
  const L = LAYOUTS[m.layout] || LAYOUTS.single;
  const cv = countView(m, today);
  const slots = m.slots || [];
  const base = `card theme-${esc(m.theme)}${o.editable ? ' editing' : ''}`;

  if (m.layout === 'couple') {
    const person = (i) => {
      const name = (m.people && m.people[i] && m.people[i].name) || '';
      const label = name ? esc(name) : o.editable ? `<span class="ph">${i ? 'Em' : 'Anh'}</span>` : '';
      return `<div class="person">${slotHTML(slots[i], i, '', o)}${label ? `<div class="name">${label}</div>` : ''}</div>`;
    };
    return `<article class="${base} couple">${titleHTML(m)}
      <div class="couple-row">${person(0)}<div class="couple-heart">${icon('heart')}</div>${person(1)}</div>
      ${countHTML(cv)}</article>`;
  }

  if (m.layout === 'text' || !L.rects) {
    return `<article class="${base} text"><div class="text-emoji">${TYPES[m.type].emoji}</div>${titleHTML(m)}${countHTML(cv)}</article>`;
  }

  const empty = !o.editable && !L.rects.some((_, i) => slots[i] && slots[i].photo);
  return `<article class="${base} photo">
    <div class="card-photos">${L.rects.map((r, i) => slotHTML(slots[i], i, `left:${r[0]}%;top:${r[1]}%;width:${r[2]}%;height:${r[3]}%`, o)).join('')}</div>
    ${empty ? `<div class="card-emoji">${TYPES[m.type].emoji}</div>` : ''}
    <div class="card-shade"></div>
    <div class="card-info">${titleHTML(m)}${countHTML(cv)}</div>
  </article>`;
}

/** Ảnh đại diện cho danh sách: ảnh ở ô lớn nhất của bố cục. */
function coverPhoto(m) {
  const rects = (LAYOUTS[m.layout] || {}).rects;
  const area = (i) => (rects && rects[i] ? rects[i][2] * rects[i][3] : 0);
  return (m.slots || [])
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s && s.photo)
    .sort((a, b) => area(b.i) - area(a.i))
    .map(({ s }) => s)[0];
}

/** 1 dòng trong danh sách kỷ niệm. */
export function listItemHTML(m, today) {
  const t = TYPES[m.type];
  const c = countInfo(m, today);
  const photo = coverPhoto(m);
  const [big, small] = c.kind === 'since' ? [fmtNum(c.value), 'ngày']
    : c.kind === 'past' ? [fmtNum(c.value), 'ngày trước']
      : c.today ? ['🎉', 'hôm nay'] : [fmtNum(c.value), 'ngày nữa'];
  return `<li><a class="mem-item" href="#/m/${m.id}">
    <span class="thumb theme-${esc(m.theme)}">${photo ? `<img data-photo="${esc(photo.photo)}" data-variant="thumb" alt="">` : t.emoji}</span>
    <span class="mi-body"><span class="mi-title">${esc(m.title)}</span><span class="mi-sub">${t.emoji} ${t.label} · ${fmtDate(m.date)}</span></span>
    <span class="mi-count"><b>${big}</b><small>${small}</small></span>
  </a></li>`;
}

/** Các mốc sắp tới: tròn trăm ngày, tròn năm, sinh nhật, ngày đếm ngược. */
export function upcomingEvents(list, today, limit = 5) {
  const out = [];
  for (const m of list) {
    const t = TYPES[m.type];
    const c = countInfo(m, today);
    if (c.kind === 'since') {
      const n = Math.max(100, Math.ceil(c.value / 100) * 100);
      const label = `${fmtNum(n)} ngày`;
      out.push({ m, label, text: `${label} · ${m.title}`, left: n - c.value, date: addDays(today, n - c.value) });
      const y = nextYearly(m.date, today);
      if (y.nth > 0) out.push({ m, label: `${y.nth} năm`, text: `${y.nth} năm · ${m.title}`, left: y.daysLeft, date: y.date });
    } else if (c.kind === 'until') {
      out.push({ m, label: '', text: m.title, left: c.value, date: m.date });
    } else if (c.kind === 'yearly') {
      const label = `${t.yearlyLabel}${c.nth > 0 ? ` lần thứ ${c.nth}` : ''}`;
      out.push({ m, label, text: c.nth > 0 ? `${m.title} · lần thứ ${c.nth}` : m.title, left: c.value, date: c.next });
    }
  }
  return out.filter((e) => e.left <= 366).sort((a, b) => a.left - b.left).slice(0, limit);
}

export function upcomingHTML(events) {
  return `<ul class="up-list">${events.map((e) => `<li><a class="up-item" href="#/m/${e.m.id}">
    <span class="up-days${e.left === 0 ? ' today' : ''}">${e.left === 0 ? '<b>Hôm nay</b>' : `<b>${fmtNum(e.left)}</b><small>ngày nữa</small>`}</span>
    <span class="up-body"><span class="up-title">${TYPES[e.m.type].emoji} ${esc(e.text)}</span>
    <span class="up-date">${fmtDate(e.date, true)}</span></span>
  </a></li>`).join('')}</ul>`;
}

/** Bảng thông tin ở màn chi tiết. */
export function detailStatsHTML(m, today) {
  const c = countInfo(m, today);
  const rows = [['Ngày', fmtDate(m.date, true)]];
  if (c.kind === 'since') {
    rows.push([labelOf(m), `${fmtNum(c.value)} ngày`]);
    if (c.value >= 7) rows.push(['Tức là', `${fmtYmd(c.ymd)} (${fmtNum(Math.floor(c.value / 7))} tuần)`]);
    for (const e of upcomingEvents([m], today, 2)) rows.push([e.left === 0 ? 'Hôm nay' : `Còn ${fmtNum(e.left)} ngày`, `tròn ${e.label} · ${fmtDate(e.date)}`]);
  } else if (c.kind === 'yearly') {
    rows.push(['Lần tới', `${fmtDate(c.next, true)}${c.nth > 0 ? ` (lần thứ ${c.nth})` : ''}`]);
    rows.push(['Còn', c.today ? 'Hôm nay 🎉' : `${fmtNum(c.value)} ngày`]);
  } else if (c.kind === 'until') {
    rows.push(['Còn', c.today ? 'Hôm nay' : `${fmtNum(c.value)} ngày`]);
  } else {
    rows.push(['Đã qua', `${fmtNum(c.value)} ngày`]);
  }
  rows.push(['Cách đếm', COUNT_MODES[m.countMode] + (m.countMode === 'since' && m.countFirstDay ? ' (tính cả ngày đầu)' : '')]);
  return `<dl class="stats">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
}
