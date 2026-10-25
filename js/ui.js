// Tiện ích giao diện: icon, thông báo nhỏ (toast), chống chèn mã HTML.

export function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export const HEART = 'M12 20.5C5.5 16 3 12.6 3 9.2 3 6.6 5 4.5 7.6 4.5c1.8 0 3.3 1 4.4 2.6 1.1-1.6 2.6-2.6 4.4-2.6 2.6 0 4.6 2.1 4.6 4.7 0 3.4-2.5 6.8-9 11.3z';
const STAR = 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z';
const CLOUD = 'M7 18.5h10.5a4 4 0 0 0 .4-8 6 6 0 0 0-11.6 1.3A3.4 3.4 0 0 0 7 18.5z';

// Icon nét (stroke)
const LINE = {
  back: '<path d="M15 18l-6-6 6-6"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  star: `<path d="${STAR}"/>`,
  settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  sync: '<path d="M20 12a8 8 0 0 0-14.3-4.9"/><path d="M4 3.5v4h4"/><path d="M4 12a8 8 0 0 0 14.3 4.9"/><path d="M20 20.5v-4h-4"/>',
  cloud: `<path d="${CLOUD}"/>`,
  cloudOff: `<path d="${CLOUD}"/><path d="M4 4l16 16"/>`,
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  share: '<path d="M12 15V3.5M8 7.5l4-4 4 4"/><path d="M5 11.5V20h14v-8.5"/>',
  download: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5"/><path d="M5 19.5h14"/>',
  upload: '<path d="M12 15V4M7.5 8.5L12 4l4.5 4.5"/><path d="M5 19.5h14"/>',
  image: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.5"/><path d="M20.5 16l-4.5-4.5L8 19"/>',
};
// Icon tô đặc (fill)
const FILL = {
  heart: `<path d="${HEART}"/>`,
  starFill: `<path d="${STAR}"/>`,
};

export function icon(name) {
  if (FILL[name]) return `<svg class="ic" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${FILL[name]}</svg>`;
  return `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${LINE[name] || ''}</svg>`;
}

let toastTimer = 0;
export function toast(msg, opts = {}) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.innerHTML = `<span>${esc(msg)}</span>${opts.action ? `<button type="button">${esc(opts.action)}</button>` : ''}`;
  const hide = () => el.classList.remove('show');
  if (opts.action) el.querySelector('button').onclick = () => { hide(); if (opts.onAction) opts.onAction(); };
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hide, opts.duration || (opts.action ? 8000 : 3200));
}

export function fmtSize(bytes) {
  return bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(bytes / 1024)) + ' KB';
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}
