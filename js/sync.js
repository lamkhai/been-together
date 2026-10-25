// Đồng bộ với Google Sheet qua Apps Script (xem apps-script/Code.gs).
// Nguyên tắc:
//  - Dữ liệu trên máy là bản chính; cloud chỉ là bản đồng bộ.
//  - Mỗi lần đồng bộ so TOÀN BỘ: cloud thiếu gì thì máy đẩy lại (tự lành).
//  - Cloud thiếu dữ liệu KHÔNG BAO GIỜ làm mất dữ liệu trên máy; chỉ "Xóa" có chủ đích
//    (bản ghi deleted = true) mới lan sang máy kia.
//  - 2 bản khác nhau: bản sửa sau cùng (updatedAt lớn hơn) thắng.
import * as db from './db.js';
import { normalize, photoIdsOf, stripLocal, sameContent, keepPhotos } from './model.js';
import * as photos from './photos.js';

const INVITE_PREFIX = 'BENNHAU1.';
const URL_RE = /^https:\/\/script\.google\.com\/(macros|a\/macros\/[^/]+)\/s\/[\w-]+\/exec$/;
const DEV_URL_RE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/[\w/-]*exec$/; // chỉ để chạy thử trên máy tính

let api = null;      // các hàm app cung cấp: memories, putRemote, markSynced, onChange, onStatus
let cfg = null;      // { url, key }
let running = null;  // Promise của lần đồng bộ đang chạy
let again = false;
let timer = 0;
let retryTimer = 0;

export const status = { state: 'off', message: '', lastSync: 0, pending: 0 };

function set(state, message = '') {
  status.state = state;
  status.message = message;
  if (api && api.onStatus) api.onStatus(status);
}
function updatePending() {
  status.pending = api ? api.memories().filter((m) => m.syncedAt !== m.updatedAt).length : 0;
  if (api && api.onStatus) api.onStatus(status);
}

export async function init(appApi) {
  api = appApi;
  cfg = (await db.kv.get('sync')) || null;
  status.lastSync = (await db.kv.get('lastSync')) || 0;
  status.state = cfg ? 'idle' : 'off';
  updatePending();
  window.addEventListener('online', () => schedule(1000));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') schedule(500); });
  setInterval(() => { if (document.visibilityState === 'visible') schedule(0); }, 5 * 60 * 1000);
  if (cfg) schedule(800);
}

export const isConnected = () => !!cfg;

/** Hẹn đồng bộ sau `ms` (gộp nhiều thay đổi liên tiếp thành 1 lần). */
export function schedule(ms = 2000) {
  updatePending();
  if (!cfg) return;
  clearTimeout(timer);
  timer = setTimeout(syncNow, ms);
}

async function call(action, data = {}, timeoutMs = 30000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    // text/plain để không bị chặn CORS (Apps Script không xử lý yêu cầu "preflight").
    const res = await fetch(cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...data, action, key: cfg.key }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`Máy chủ báo lỗi ${res.status}`);
    let out;
    try { out = JSON.parse(await res.text()); } catch {
      throw new Error('Phản hồi lạ. Kiểm tra lại URL Web App và quyền truy cập "Anyone".');
    }
    if (!out.ok) throw new Error(out.error || 'Lỗi máy chủ');
    return out;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Mạng chậm, hết thời gian chờ');
    if (e instanceof TypeError) throw new Error('Không kết nối được tới Google (kiểm tra mạng)');
    throw e;
  } finally {
    clearTimeout(t);
  }
}

/** Kết nối tới Web App; thử gọi 1 lần trước khi lưu. */
export async function connect(url, key) {
  url = String(url || '').trim().replace(/\?.*$/, '');
  key = String(key || '').trim();
  if (!URL_RE.test(url) && !DEV_URL_RE.test(url)) {
    throw new Error('URL không đúng. URL Web App có dạng https://script.google.com/macros/s/…/exec');
  }
  if (!key) throw new Error('Thiếu mã bí mật');
  const prev = cfg;
  cfg = { url, key };
  try {
    await call('ping');
  } catch (e) {
    cfg = prev;
    throw e;
  }
  await db.kv.set('sync', cfg);
  set('idle');
  schedule(100);
}

export async function disconnect() {
  cfg = null;
  clearTimeout(timer);
  await db.kv.set('sync', null);
  set('off');
}

const b64url = (s) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s) => atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));

export function inviteCode() {
  return cfg ? INVITE_PREFIX + b64url(JSON.stringify({ u: cfg.url, k: cfg.key })) : '';
}
export function parseInvite(text) {
  const m = new RegExp(INVITE_PREFIX.replace('.', '\\.') + '([A-Za-z0-9_-]+)').exec(text || '');
  if (!m) return null;
  try {
    const o = JSON.parse(unb64url(m[1]));
    return o && o.u && o.k ? { url: o.u, key: o.k } : null;
  } catch {
    return null;
  }
}

/**
 * So dữ liệu máy với dữ liệu cloud (hàm thuần, dễ kiểm thử).
 *  save   – bản cloud mới hơn → lưu vào máy
 *  push   – bản máy mới hơn, hoặc cloud đang thiếu → gửi lên
 *  synced – 2 bên giống nhau → chỉ đánh dấu đã đồng bộ
 */
export function planMerge(localList, serverRows) {
  const local = new Map(localList.map((m) => [m.id, m]));
  const best = new Map();
  for (const raw of serverRows || []) {
    const l = raw && typeof raw === 'object' ? local.get(String(raw.id || '').trim()) : null;
    // Ghép lên bản trên máy: cột nào Sheet chưa có (Apps Script bản cũ) thì giữ giá trị trên máy.
    const r = normalize(l ? { ...l, ...raw } : raw);
    if (!r) continue; // dòng hỏng (vd. sửa tay sai) → coi như cloud thiếu, máy sẽ đẩy lại
    const b = best.get(r.id);
    if (!b || r.updatedAt > b.updatedAt) best.set(r.id, r);
  }
  const save = [], push = [], synced = [];
  for (const r of best.values()) {
    const l = local.get(r.id);
    if (!l || r.updatedAt > l.updatedAt) save.push(r);
    else if (l.updatedAt > r.updatedAt) push.push(l);
    else if (l.syncedAt !== l.updatedAt) synced.push(l);
    else if (!sameContent(l, r)) save.push(r); // ai đó sửa tay trong Sheet
  }
  for (const l of local.values()) if (!best.has(l.id)) push.push(l);
  return { save, push, synced };
}

export function syncNow() {
  if (!cfg) return Promise.resolve();
  if (running) { again = true; return running; }
  if (navigator.onLine === false) { set('offline'); updatePending(); return Promise.resolve(); }
  running = (async () => {
    set('syncing', 'Đang đồng bộ…');
    try {
      const pulled = await call('pull');
      const plan = planMerge(api.memories(), pulled.rows);
      for (const r of plan.save) await api.putRemote(r);
      for (const l of plan.synced) await api.markSynced(l.id, l.updatedAt);

      // Ảnh cần giữ = ảnh của các kỷ niệm chưa xóa hoặc còn trong thùng rác.
      const onServer = new Set(pulled.photos || []);
      const onDevice = new Set(await photos.localIds());
      const wanted = new Set();
      for (const m of api.memories()) if (keepPhotos(m)) photoIdsOf(m).forEach((id) => wanted.add(id));

      // 1) Tải lên ảnh cloud chưa có (trước khi gửi kỷ niệm dùng ảnh đó).
      const ups = [...wanted].filter((id) => !onServer.has(id) && onDevice.has(id));
      for (let i = 0; i < ups.length; i++) {
        set('syncing', `Đang tải ảnh lên ${i + 1}/${ups.length}…`);
        await call('putPhoto', { id: ups[i], data: await photos.base64Of(ups[i]) }, 120000);
      }

      // 2) Gửi các kỷ niệm máy mới hơn / cloud đang thiếu.
      if (plan.push.length) {
        set('syncing', 'Đang gửi thay đổi…');
        const rows = plan.push.map(stripLocal);
        const res = await call('push', { rows }, 60000);
        const sentAt = new Map(rows.map((r) => [r.id, r.updatedAt]));
        const accepted = res.accepted || [];
        for (const id of accepted) await api.markSynced(id, sentAt.get(id));
        if (accepted.length < rows.length) again = true; // cloud có bản mới hơn → kéo về ở lần sau
      }

      // 3) Tải về ảnh máy chưa có.
      const downs = [...wanted].filter((id) => !onDevice.has(id) && onServer.has(id));
      let got = 0;
      for (let i = 0; i < downs.length; i++) {
        set('syncing', `Đang tải ảnh về ${i + 1}/${downs.length}…`);
        try {
          const r = await call('getPhoto', { id: downs[i] }, 120000);
          if (r.data) { await photos.storeBase64(downs[i], r.data); got++; }
        } catch (e) {
          console.warn('Không tải được ảnh', downs[i], e);
        }
      }

      status.lastSync = Date.now();
      await db.kv.set('lastSync', status.lastSync);
      set('ok');
      if (plan.save.length || got) api.onChange();
    } catch (e) {
      set(navigator.onLine === false ? 'offline' : 'error', e.message);
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => schedule(0), 2 * 60 * 1000);
    } finally {
      running = null;
      updatePending();
      if (again) { again = false; schedule(500); }
    }
  })();
  return running;
}
