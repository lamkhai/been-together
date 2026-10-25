// Bên Nhau — khởi động app và điều hướng giữa các màn hình.
//  #/            trang chủ (kỷ niệm chính + sắp tới + danh sách)
//  #/m/<id>      chi tiết 1 kỷ niệm
//  #/new         tạo kỷ niệm
//  #/edit/<id>   sửa kỷ niệm
//  #/settings    cài đặt: đồng bộ, sao lưu, thùng rác
import * as db from './db.js';
import { TYPES, uuid, TRASH_DAYS, keepPhotos, photoIdsOf } from './model.js';
import { todayISO, fmtDate } from './dates.js';
import { cardHTML, listItemHTML, upcomingEvents, upcomingHTML, detailStatsHTML } from './render.js';
import { mountEditor } from './editor.js';
import * as photos from './photos.js';
import * as sync from './sync.js';
import * as backup from './backup.js';
import { esc, icon, toast, fmtSize, copyText } from './ui.js';

const VERSION = '1.1.0'; // nhớ tăng cùng VERSION trong sw.js
const DAY = 86400000;
const app = document.getElementById('app');
const state = {
  memories: new Map(), deviceId: '', featuredId: '', lastBackup: 0,
  today: todayISO(), route: '', detailId: '', curHash: '', prevHash: '',
};
const env = {
  standalone: matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
  ios: /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
};
let editor = null;
let installEvent = null;
let exportFile = null;
let hideHint = false;

/* ================= Dữ liệu ================= */
const all = () => [...state.memories.values()];
const active = () => all().filter((m) => !m.deleted).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
const inTrash = () => all().filter((m) => m.deleted && Date.now() - m.deletedAt < TRASH_DAYS * DAY).sort((a, b) => b.deletedAt - a.deletedAt);
const featured = (list) => list.find((m) => m.id === state.featuredId) || list.find((m) => m.type === 'love') || list[0];

async function store(m) {
  await db.put('memories', m);
  state.memories.set(m.id, m);
}

/** Lưu thay đổi do người dùng làm trên máy này (sẽ được đồng bộ). */
async function saveMemory(m) {
  const prev = state.memories.get(m.id);
  const now = Math.max(Date.now(), (prev ? prev.updatedAt : 0) + 1);
  const rec = { ...m, createdAt: m.createdAt || now, updatedAt: now, updatedBy: state.deviceId, syncedAt: prev ? prev.syncedAt || 0 : 0 };
  await store(rec);
  sync.schedule();
  return rec;
}

async function markSynced(id, at) {
  const m = state.memories.get(id);
  if (m && m.syncedAt !== at) await store({ ...m, syncedAt: at });
}

async function restore(id) {
  const m = state.memories.get(id);
  if (!m || !m.deleted) return;
  await saveMemory({ ...m, deleted: false, deletedAt: 0 });
  toast('Đã khôi phục');
  refresh();
}

// Xóa ảnh trên máy không còn kỷ niệm nào dùng (ảnh vẫn còn trên Drive).
async function cleanPhotos() {
  try {
    const keep = new Set();
    all().forEach((m) => { if (keepPhotos(m)) photoIdsOf(m).forEach((id) => keep.add(id)); });
    for (const id of await photos.localIds()) if (!keep.has(id)) await photos.remove(id);
  } catch (e) {
    console.warn(e);
  }
}

/* ================= Điều hướng ================= */
function route() {
  state.prevHash = state.curHash;
  state.curHash = location.hash || '#/';
  if (editor) { editor.destroy(); editor = null; }
  const h = decodeURIComponent(location.hash.slice(1)) || '/';
  let m;
  if (h === '/') show('home', renderHome);
  else if ((m = /^\/m\/(.+)$/.exec(h))) show('detail', () => renderDetail(m[1]));
  else if (h === '/new') show('editor', () => openEditor(null));
  else if ((m = /^\/edit\/(.+)$/.exec(h))) show('editor', () => openEditor(m[1]));
  else if (h === '/settings') show('settings', renderSettings);
  else location.replace('#/');
}
function show(name, render) {
  state.route = name;
  render();
  window.scrollTo(0, 0);
}
/** Quay lại màn trước nếu đúng là `to`, nếu không thì thay bằng `to` (không chồng lịch sử). */
function goBack(to) {
  if (state.prevHash === to) history.back();
  else location.replace(to);
}
/** Vẽ lại màn hiện tại (sau khi đồng bộ, qua ngày mới…). Không đụng màn đang sửa. */
function refresh() {
  const y = window.scrollY;
  if (state.route === 'home') renderHome();
  else if (state.route === 'detail') renderDetail(state.detailId);
  else if (state.route === 'settings') renderSettings();
  else return;
  window.scrollTo(0, y);
}

/* ================= Trang chủ ================= */
function renderHome() {
  const list = active();
  const main = featured(list);
  const others = list.filter((m) => m !== main);
  const ups = upcomingEvents(list, state.today, 5);
  app.innerHTML = `
    <header class="topbar">
      <h1 class="brand">${icon('heart')}Bên Nhau</h1>
      ${syncButton()}
      <a class="icon-btn" href="#/settings" aria-label="Cài đặt">${icon('settings')}</a>
    </header>
    <main class="page">
      ${hintBanner()}
      ${main ? `
        <a class="featured" href="#/m/${main.id}">${cardHTML(main, state.today)}</a>
        ${ups.length ? `<section class="section"><h2>Sắp tới</h2>${upcomingHTML(ups)}</section>` : ''}
        ${others.length ? `<section class="section"><h2>Kỷ niệm khác</h2><ul class="mem-list">${others.map((m) => listItemHTML(m, state.today)).join('')}</ul></section>` : ''}
      ` : `
        <div class="empty-state">
          ${icon('heart')}
          <h2>Chưa có kỷ niệm nào</h2>
          <p>Bắt đầu bằng ngày hai bạn yêu nhau nhé.</p>
          <a class="btn" href="#/new">${icon('plus')} Tạo kỷ niệm đầu tiên</a>
          ${sync.isConnected() ? '' : '<p class="muted small">Đã có dữ liệu ở máy kia? Vào <a href="#/settings"><b>Cài đặt</b></a> để kết nối đồng bộ.</p>'}
        </div>
      `}
    </main>
    ${main ? `<a class="fab" href="#/new" aria-label="Thêm kỷ niệm">${icon('plus')}</a>` : ''}`;
  photos.hydrate(app);
}

function hintBanner() {
  if (env.standalone || hideHint) return '';
  const close = `<button class="icon-btn" data-action="hide-hint" aria-label="Ẩn">${icon('close')}</button>`;
  if (installEvent) {
    return `<div class="banner"><p>Cài <b>Bên Nhau</b> lên màn hình chính để mở nhanh như app.</p><button class="btn small" data-action="install">Cài đặt</button>${close}</div>`;
  }
  if (env.ios) {
    return `<div class="banner"><p>Bấm nút <b>Chia sẻ</b> → <b>Thêm vào MH chính</b> để dùng như app. Lưu ý: dữ liệu trong Safari và trong app là riêng biệt.</p>${close}</div>`;
  }
  return '';
}

/* ================= Chi tiết ================= */
function renderDetail(id) {
  state.detailId = id;
  const m = state.memories.get(id);
  if (!m || m.deleted) { location.replace('#/'); return; }
  const isMain = featured(active()) === m;
  app.innerHTML = `
    <header class="topbar">
      <button class="icon-btn" data-action="back" data-to="#/" aria-label="Quay lại">${icon('back')}</button>
      <h1 class="title">${esc(m.title)}</h1>
      <a class="icon-btn" href="#/edit/${m.id}" aria-label="Sửa">${icon('edit')}</a>
    </header>
    <main class="page">
      ${cardHTML(m, state.today)}
      ${detailStatsHTML(m, state.today)}
      ${m.note ? `<p class="note">${esc(m.note)}</p>` : ''}
      <div class="row-actions">
        <a class="btn" href="#/edit/${m.id}">${icon('edit')} Sửa kỷ niệm</a>
        <button class="btn secondary" data-action="feature" data-id="${m.id}"${isMain ? ' disabled' : ''}>${icon(isMain ? 'starFill' : 'star')} ${isMain ? 'Đang là kỷ niệm chính' : 'Đặt làm kỷ niệm chính'}</button>
        <button class="btn danger" data-action="delete" data-id="${m.id}">${icon('trash')} Xóa</button>
      </div>
    </main>`;
  photos.hydrate(app);
}

/* ================= Tạo / sửa ================= */
function openEditor(id) {
  const m = id ? state.memories.get(id) : null;
  if (id && (!m || m.deleted)) { location.replace('#/'); return; }
  editor = mountEditor(app, m, {
    onSave: async (rec) => {
      const saved = await saveMemory(rec);
      if (m) goBack(`#/m/${saved.id}`);
      else location.replace(`#/m/${saved.id}`);
      toast('Đã lưu');
    },
    onCancel: () => goBack(m ? `#/m/${m.id}` : '#/'),
  });
}

/* ================= Cài đặt ================= */
function renderSettings() {
  const trash = inTrash();
  const on = sync.isConnected();
  app.innerHTML = `
    <header class="topbar">
      <button class="icon-btn" data-action="back" data-to="#/" aria-label="Quay lại">${icon('back')}</button>
      <h1 class="title">Cài đặt</h1>
      <span class="spacer"></span>
    </header>
    <main class="page">
      <section class="panel">
        <h2>Đồng bộ Google Sheet</h2>
        ${on ? `
          <p id="sync-line" class="sync-line">${esc(syncText())}</p>
          <div class="btn-row">
            <button class="btn" data-action="sync">${icon('sync')} Đồng bộ ngay</button>
            <button class="btn secondary" data-action="invite">${icon('share')} Gửi mã mời</button>
          </div>
          <div id="invite-box" class="field invite-box" hidden>
            <span class="field-label">Mã mời (gửi cho người kia)</span>
            <textarea class="code-box" rows="3" readonly></textarea>
          </div>
          <button class="btn ghost small" data-action="disconnect">Ngắt kết nối trên máy này</button>
        ` : `
          <p class="muted">Kết nối để hai máy dùng chung dữ liệu. Khi chưa kết nối, dữ liệu chỉ nằm trên máy này.</p>
          <label class="field"><span class="field-label">Mã mời hoặc URL Web App</span>
            <textarea id="sync-input" rows="3" placeholder="Dán mã mời (BENNHAU1.…) hoặc https://script.google.com/macros/s/…/exec" autocapitalize="off" autocomplete="off" spellcheck="false"></textarea></label>
          <label class="field" id="key-field" hidden><span class="field-label">Mã bí mật</span>
            <input id="sync-key" autocapitalize="off" autocomplete="off" spellcheck="false"></label>
          <button class="btn block" data-action="connect">${icon('cloud')} Kết nối</button>
          <p class="muted small">Cách tạo Google Sheet và Apps Script: xem file README.md.</p>
        `}
      </section>

      <section class="panel">
        <h2>Sao lưu ra file</h2>
        <p class="muted">Xuất toàn bộ kỷ niệm và ảnh ra 1 file để cất giữ (Google Drive, Zalo, máy tính…). Dùng "Nhập file" khi đổi máy hoặc cần khôi phục.${state.lastBackup ? ` Lần xuất gần nhất: ${fmtDate(todayISO(new Date(state.lastBackup)))}.` : ''}</p>
        <div class="btn-row">
          <button class="btn secondary" data-action="export">${icon('download')} Xuất file</button>
          <button class="btn secondary" data-action="import">${icon('upload')} Nhập file</button>
        </div>
        <div id="export-ready"></div>
        <input type="file" id="import-file" class="visually-hidden" accept="application/json,.json">
      </section>

      <section class="panel">
        <h2>Thùng rác</h2>
        ${trash.length ? `<ul class="trash-list">${trash.map((m) => `<li>
            <span>${TYPES[m.type].emoji} ${esc(m.title)}<small>Tự xóa hẳn sau ${Math.max(1, TRASH_DAYS - Math.floor((Date.now() - m.deletedAt) / DAY))} ngày</small></span>
            <button class="btn small secondary" data-action="restore" data-id="${m.id}">Khôi phục</button>
          </li>`).join('')}</ul>` : '<p class="muted">Trống. Kỷ niệm bị xóa sẽ nằm ở đây 30 ngày.</p>'}
      </section>

      <section class="panel">
        <h2>Cài app lên điện thoại</h2>
        <p><b>iPhone:</b> mở bằng Safari → nút <b>Chia sẻ</b> → <b>Thêm vào MH chính</b>.</p>
        <p><b>Android:</b> mở bằng Chrome → menu <b>⋮</b> → <b>Cài đặt ứng dụng</b> (hoặc <b>Thêm vào màn hình chính</b>).</p>
        ${installEvent ? `<button class="btn block" data-action="install">Cài đặt ngay</button>` : ''}
        <p class="muted small" id="storage-info"></p>
      </section>

      <p class="version">Bên Nhau · phiên bản ${VERSION}</p>
    </main>`;
  storageInfo();
}

async function storageInfo() {
  const el = document.getElementById('storage-info');
  if (!el || !navigator.storage || !navigator.storage.estimate) return;
  try {
    const est = await navigator.storage.estimate();
    const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false;
    el.textContent = `Dữ liệu trên máy: ${fmtSize(est.usage || 0)}${persisted ? ' · đã bật lưu trữ bền vững' : ''}`;
  } catch { /* bỏ qua */ }
}

/* ================= Trạng thái đồng bộ ================= */
function syncText() {
  const s = sync.status;
  if (!sync.isConnected()) return 'Chưa kết nối đồng bộ (dữ liệu chỉ nằm trên máy này)';
  const pending = s.pending ? ` · ${s.pending} thay đổi chờ gửi` : '';
  if (s.state === 'syncing') return s.message || 'Đang đồng bộ…';
  if (s.state === 'offline') return 'Không có mạng, sẽ tự đồng bộ khi có mạng' + pending;
  if (s.state === 'error') return 'Lỗi: ' + s.message + pending;
  return (s.lastSync ? 'Đã đồng bộ lúc ' + fmtWhen(s.lastSync) : 'Chưa đồng bộ lần nào') + pending;
}
function fmtWhen(t) {
  const d = new Date(t);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return d.toDateString() === new Date().toDateString() ? hm : `${hm} ngày ${d.getDate()}/${d.getMonth() + 1}`;
}
function syncButton() {
  const s = sync.status;
  const on = sync.isConnected();
  const cls = !on ? 'off' : s.state === 'syncing' ? 'syncing' : s.state === 'error' ? 'error'
    : s.state === 'offline' ? 'offline' : s.pending ? 'pending' : 'ok';
  const label = esc(syncText());
  return `<button class="icon-btn sync-btn ${cls}" data-action="sync" aria-label="${label}" title="${label}">${icon(on ? 'sync' : 'cloudOff')}<i class="dot"></i></button>`;
}
function updateSyncUI() {
  document.querySelectorAll('.sync-btn').forEach((b) => { b.outerHTML = syncButton(); });
  const line = document.getElementById('sync-line');
  if (line) line.textContent = syncText();
}

/* ================= Thao tác ================= */
async function onClick(e) {
  const el = e.target.closest('[data-action]');
  if (!el || !app.contains(el)) return;
  const a = el.dataset.action;
  const id = el.dataset.id;

  if (a === 'back') return goBack(el.dataset.to || '#/');

  if (a === 'sync') {
    if (!sync.isConnected()) { location.hash = '#/settings'; return; }
    await sync.syncNow();
    const s = sync.status;
    toast(s.state === 'error' ? 'Lỗi đồng bộ: ' + s.message : s.state === 'offline' ? 'Không có mạng' : 'Đã đồng bộ');
    return;
  }

  if (a === 'feature') {
    state.featuredId = id;
    await db.kv.set('featuredId', id);
    renderDetail(id);
    toast('Đã đặt làm kỷ niệm chính');
    return;
  }

  if (a === 'delete') {
    const m = state.memories.get(id);
    if (!m || !confirm(`Xóa "${m.title}"?\nKỷ niệm sẽ nằm trong Thùng rác 30 ngày (Cài đặt → Thùng rác).`)) return;
    await saveMemory({ ...m, deleted: true, deletedAt: Date.now() });
    goBack('#/');
    toast('Đã chuyển vào thùng rác', { action: 'Hoàn tác', onAction: () => restore(id) });
    return;
  }

  if (a === 'restore') return restore(id);

  if (a === 'install') {
    if (!installEvent) return;
    installEvent.prompt();
    try { await installEvent.userChoice; } catch { /* bỏ qua */ }
    installEvent = null;
    refresh();
    return;
  }

  if (a === 'hide-hint') {
    hideHint = true;
    await db.kv.set('hideInstallHint', true);
    refresh();
    return;
  }

  if (a === 'connect') return connect(el);

  if (a === 'disconnect') {
    if (!confirm('Ngắt kết nối đồng bộ trên máy này? Dữ liệu trên máy vẫn giữ nguyên.')) return;
    await sync.disconnect();
    renderSettings();
    return;
  }

  if (a === 'invite') return shareInvite();

  if (a === 'export') {
    el.disabled = true;
    const old = el.innerHTML;
    el.textContent = 'Đang chuẩn bị…';
    try {
      exportFile = await backup.buildBackup(all());
      document.getElementById('export-ready').innerHTML = `<button class="btn block" data-action="export-save">${icon('share')} Lưu file sao lưu (${fmtSize(exportFile.size)})</button>`;
    } catch (err) {
      toast('Không tạo được file: ' + err.message);
    }
    el.disabled = false;
    el.innerHTML = old;
    return;
  }

  if (a === 'export-save') {
    if (!exportFile) return;
    const r = await backup.shareFile(exportFile);
    if (r === 'cancelled') return;
    state.lastBackup = Date.now();
    await db.kv.set('lastBackup', state.lastBackup);
    toast(r === 'shared' ? 'Đã gửi file sao lưu' : 'Đã tải file sao lưu về máy');
    return;
  }

  if (a === 'import') document.getElementById('import-file').click();
}

async function connect(btn) {
  const raw = document.getElementById('sync-input').value.trim();
  const invite = sync.parseInvite(raw);
  const url = invite ? invite.url : raw;
  const key = invite ? invite.key : document.getElementById('sync-key').value.trim();
  if (!url) { toast('Hãy dán mã mời hoặc URL Web App'); return; }
  if (!key) { document.getElementById('key-field').hidden = false; toast('Nhập thêm mã bí mật'); return; }
  btn.disabled = true;
  btn.textContent = 'Đang kết nối…';
  try {
    await sync.connect(url, key);
    toast('Đã kết nối, đang đồng bộ…');
    renderSettings();
  } catch (e) {
    toast(e.message);
    btn.disabled = false;
    btn.innerHTML = `${icon('cloud')} Kết nối`;
  }
}

async function shareInvite() {
  const code = sync.inviteCode();
  const box = document.getElementById('invite-box');
  if (box) { box.hidden = false; box.querySelector('textarea').value = code; }
  const text = `Mã mời app Bên Nhau:\n${code}\n\nMở app → Cài đặt → dán mã vào ô "Mã mời" → Kết nối.`;
  if (navigator.share) {
    try { await navigator.share({ text }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  toast((await copyText(code)) ? 'Đã sao chép mã mời' : 'Hãy sao chép mã ở ô bên dưới');
}

function onInput(e) {
  if (e.target.id === 'sync-input') {
    document.getElementById('key-field').hidden = !/^https?:\/\//i.test(e.target.value.trim());
  }
}

async function onChange(e) {
  if (e.target.id !== 'import-file') return;
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const r = await backup.importBackup(file, {
      get: (id) => state.memories.get(id),
      putImported: (m) => store({ ...m, syncedAt: 0 }),
    });
    toast(`Đã nhập ${r.mems} kỷ niệm, ${r.pics} ảnh`);
    sync.schedule(500);
    renderSettings();
  } catch (err) {
    toast(err.message);
  }
}

/* ================= PWA, qua ngày mới ================= */
function setupPWA() {
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('Service worker:', e));
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) toast('Đã có bản cập nhật mới', { action: 'Tải lại', onAction: () => location.reload(), duration: 15000 });
    });
  }
  // Xin trình duyệt không tự dọn dữ liệu của app khi máy đầy bộ nhớ.
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installEvent = e;
    if (state.route === 'home' || state.route === 'settings') refresh();
  });
  window.addEventListener('appinstalled', () => { installEvent = null; refresh(); });
}

function watchDay() {
  const tick = () => {
    const t = todayISO();
    if (t !== state.today) { state.today = t; refresh(); }
  };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tick(); });
  const arm = () => {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 2);
    setTimeout(() => { tick(); arm(); }, next - now);
  };
  arm();
}

/* ================= Khởi động ================= */
async function boot() {
  try {
    state.deviceId = (await db.kv.get('deviceId')) || '';
    if (!state.deviceId) { state.deviceId = uuid(); await db.kv.set('deviceId', state.deviceId); }
    state.featuredId = (await db.kv.get('featuredId')) || '';
    state.lastBackup = (await db.kv.get('lastBackup')) || 0;
    hideHint = !!(await db.kv.get('hideInstallHint'));
    for (const m of await db.getAll('memories')) state.memories.set(m.id, m);
  } catch (e) {
    app.innerHTML = `<div class="empty-state"><h2>Không mở được dữ liệu</h2><p>${esc(e.message)}</p>
      <p class="muted">Nếu đang dùng chế độ duyệt web riêng tư, hãy mở bằng cửa sổ thường.</p></div>`;
    return;
  }
  window.addEventListener('hashchange', route);
  app.addEventListener('click', onClick);
  app.addEventListener('input', onInput);
  app.addEventListener('change', onChange);
  route();
  await cleanPhotos();
  await sync.init({
    memories: all,
    putRemote: (r) => store({ ...r, syncedAt: r.updatedAt }),
    markSynced,
    onChange: refresh,
    onStatus: updateSyncUI,
  });
  setupPWA();
  watchDay();
}

boot();
