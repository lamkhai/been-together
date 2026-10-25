/**
 * Bên Nhau — API đồng bộ chạy trên Google Apps Script.
 * Dữ liệu chữ nằm ở trang tính "memories"; ảnh nằm trong thư mục Drive "BenNhau-photos".
 *
 * Cài đặt (chi tiết trong README.md):
 *  1. Tạo Google Sheet mới → Tiện ích mở rộng → Apps Script → dán toàn bộ file này → Lưu.
 *  2. Chọn hàm setup → Chạy → cấp quyền. Xem "Nhật ký thực thi" để lấy MÃ BÍ MẬT.
 *  3. Triển khai → Tùy chọn triển khai mới → Ứng dụng web
 *     (Thực thi với tư cách: Tôi · Người có quyền truy cập: Bất kỳ ai) → copy URL /exec.
 *  4. Mở app → Cài đặt → dán URL + mã bí mật → Kết nối.
 */

const SHEET_NAME = 'memories';
const FOLDER_NAME = 'BenNhau-photos';
const COLS = ['id', 'type', 'title', 'date', 'countMode', 'countFirstDay', 'layout', 'slots', 'people',
  'note', 'theme', 'createdAt', 'updatedAt', 'updatedBy', 'deleted', 'deletedAt'];
const NUM_COLS = ['createdAt', 'updatedAt', 'deletedAt'];
const BOOL_COLS = ['countFirstDay', 'deleted'];
const JSON_COLS = ['slots', 'people'];
const ID_RE = /^[A-Za-z0-9-]{8,64}$/;

/** Chạy 1 lần: tạo trang tính, thư mục ảnh và mã bí mật. */
function setup() {
  const props = PropertiesService.getScriptProperties();
  let key = props.getProperty('SECRET');
  if (!key) {
    key = Utilities.getUuid().replace(/-/g, '');
    props.setProperty('SECRET', key);
  }
  sheet_();
  folder_();
  Logger.log('MÃ BÍ MẬT (dán vào app): ' + key);
}

/** Muốn thu hồi quyền của các máy đã kết nối: chạy hàm này rồi kết nối lại bằng mã mới. */
function doiMaBiMat() {
  PropertiesService.getScriptProperties().deleteProperty('SECRET');
  setup();
}

function doGet() {
  return ContentService.createTextOutput('Bên Nhau API đang chạy.');
}

function doPost(e) {
  let out;
  try {
    const req = JSON.parse(e && e.postData ? e.postData.contents : '{}');
    const secret = PropertiesService.getScriptProperties().getProperty('SECRET');
    if (!secret || req.key !== secret) throw new Error('Sai mã bí mật');
    switch (req.action) {
      case 'ping': out = {}; break;
      case 'pull': out = pull_(); break;
      case 'push': out = push_(req.rows || []); break;
      case 'putPhoto': out = putPhoto_(req.id, req.data); break;
      case 'getPhoto': out = getPhoto_(req.id); break;
      default: throw new Error('Thao tác không hợp lệ');
    }
    out.ok = true;
  } catch (err) {
    out = { ok: false, error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- Trang tính ---------- */
function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);
  const head = sh.getRange(1, 1, 1, COLS.length);
  if (head.getValues()[0].join(',') !== COLS.join(',')) {
    head.setValues([COLS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

/** Trả về toàn bộ kỷ niệm + danh sách mã ảnh đang có trên Drive. */
function pull_() {
  const sh = sheet_();
  const n = sh.getLastRow() - 1;
  const rows = [];
  if (n > 0) {
    const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
    sh.getRange(2, 1, n, COLS.length).getValues().forEach(function (v) {
      if (!v[0]) return;
      const o = {};
      COLS.forEach(function (c, i) {
        let x = v[i];
        if (x instanceof Date) x = Utilities.formatDate(x, tz, 'yyyy-MM-dd'); // ai đó gõ tay ngày vào ô
        o[c] = x;
      });
      rows.push(o);
    });
  }
  const photos = [];
  const it = folder_().searchFiles('trashed = false');
  while (it.hasNext()) {
    const name = it.next().getName();
    if (/\.jpg$/.test(name)) photos.push(name.slice(0, -4));
  }
  return { rows: rows, photos: photos };
}

/** Ghi các kỷ niệm máy gửi lên; chỉ ghi đè khi bản gửi lên mới hơn (updatedAt lớn hơn). */
function push_(rows) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sh = sheet_();
    const n = sh.getLastRow() - 1;
    const rowOf = {}, updatedOf = {};
    if (n > 0) {
      const iU = COLS.indexOf('updatedAt');
      sh.getRange(2, 1, n, COLS.length).getValues().forEach(function (v, i) {
        if (!v[0]) return;
        rowOf[v[0]] = i + 2;
        updatedOf[v[0]] = Number(v[iU]) || 0;
      });
    }
    const accepted = [], appends = [];
    rows.forEach(function (r) {
      if (!r || !ID_RE.test(String(r.id))) return;
      const id = String(r.id);
      const exists = Object.prototype.hasOwnProperty.call(rowOf, id);
      if (exists && updatedOf[id] >= (Number(r.updatedAt) || 0)) return;
      const line = toRow_(r);
      if (exists) sh.getRange(rowOf[id], 1, 1, COLS.length).setValues([line]);
      else appends.push(line);
      accepted.push(id);
    });
    if (appends.length) sh.getRange(sh.getLastRow() + 1, 1, appends.length, COLS.length).setValues(appends);
    return { accepted: accepted };
  } finally {
    lock.releaseLock();
  }
}

function toRow_(r) {
  return COLS.map(function (c) {
    let v = r[c];
    if (NUM_COLS.indexOf(c) >= 0) return Number(v) || 0;
    if (BOOL_COLS.indexOf(c) >= 0) return v === true;
    if (JSON_COLS.indexOf(c) >= 0) v = JSON.stringify(Array.isArray(v) ? v : []);
    v = v == null ? '' : String(v).slice(0, 45000);
    // Dấu ' ở đầu giữ nguyên dạng chữ: Sheet không tự đổi '2020-02-14' thành ngày hay '=…' thành công thức.
    return v === '' ? '' : "'" + v;
  });
}

/* ---------- Ảnh trên Drive ---------- */
function folder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('FOLDER_ID');
  if (id) {
    try {
      const f = DriveApp.getFolderById(id);
      if (!f.isTrashed()) return f;
    } catch (e) { /* thư mục đã bị xóa → tạo lại, app sẽ tự tải ảnh lên lại */ }
  }
  const f = DriveApp.createFolder(FOLDER_NAME);
  props.setProperty('FOLDER_ID', f.getId());
  return f;
}

function findPhoto_(id) {
  const it = folder_().getFilesByName(id + '.jpg');
  while (it.hasNext()) {
    const f = it.next();
    if (!f.isTrashed()) return f;
  }
  return null;
}

function putPhoto_(id, data) {
  if (!ID_RE.test(String(id)) || typeof data !== 'string' || !data) throw new Error('Ảnh không hợp lệ');
  if (findPhoto_(id)) return { exists: true };
  folder_().createFile(Utilities.newBlob(Utilities.base64Decode(data), 'image/jpeg', id + '.jpg'));
  return {};
}

function getPhoto_(id) {
  if (!ID_RE.test(String(id))) throw new Error('Mã ảnh không hợp lệ');
  const f = findPhoto_(id);
  return f ? { data: Utilities.base64Encode(f.getBlob().getBytes()) } : { missing: true };
}
