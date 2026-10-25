// Màn tạo / sửa kỷ niệm: loại, tiêu đề, ngày, cách đếm, bố cục, ảnh (kéo / zoom), tên, màu, ghi chú.
import { TYPES, TYPE_ORDER, LAYOUTS, THEMES, COUNT_MODES, newMemory, normalize } from './model.js';
import { todayISO } from './dates.js';
import { cardHTML, imgStyle } from './render.js';
import * as photos from './photos.js';
import { HEART, icon, toast } from './ui.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const LAYOUT_ICONS = {
  couple: `<circle cx="10" cy="18" r="7.5"/><circle cx="34" cy="18" r="7.5"/><path transform="translate(17.8 13.2) scale(.35)" d="${HEART}"/>`,
  single: '<rect x="6" y="3" width="32" height="30" rx="4"/>',
  split: '<rect x="4" y="3" width="17" height="30" rx="3"/><rect x="23" y="3" width="17" height="30" rx="3"/>',
  trio: '<rect x="4" y="3" width="17" height="12" rx="3"/><rect x="23" y="3" width="17" height="12" rx="3"/><rect x="4" y="17" width="36" height="16" rx="3"/>',
  text: '<rect x="9" y="7" width="26" height="5" rx="2.5"/><rect x="13" y="16" width="18" height="9" rx="2.5"/><rect x="11" y="28" width="22" height="3" rx="1.5"/>',
};

/**
 * Gắn màn sửa vào `root`. original = kỷ niệm cần sửa (null = tạo mới).
 * onSave(memory) được gọi với kỷ niệm đã làm sạch; ảnh mới đã được lưu vào máy trước đó.
 */
export function mountEditor(root, original, { onSave, onCancel }) {
  const isNew = !original;
  const draft = original ? JSON.parse(JSON.stringify(original)) : newMemory('love', todayISO());
  draft.people = [0, 1].map((i) => ({ name: (draft.people && draft.people[i] && draft.people[i].name) || '' }));
  // Giữ ảnh của cả 3 ô, để đổi bố cục qua lại không mất ảnh.
  const pool = [0, 1, 2].map((i) => (draft.slots && draft.slots[i] && draft.slots[i].photo ? { ...draft.slots[i] } : null));
  const touched = { title: !isNew, mode: !isNew, theme: !isNew };
  const tempIds = new Set();
  let selected = -1;
  let pickSlot = -1;
  let saving = false;
  const snapshot = () => JSON.stringify([draft, pool]);
  const initial = snapshot();

  // Gắn vào 1 phần tử mới: khi rời màn sửa, phần tử bị bỏ đi cùng mọi trình nghe sự kiện.
  const host = document.createElement('div');
  host.innerHTML = `
    <header class="topbar">
      <button class="icon-btn" data-ed="cancel" aria-label="Hủy">${icon('close')}</button>
      <h1 class="title">${isNew ? 'Kỷ niệm mới' : 'Sửa kỷ niệm'}</h1>
      <button class="btn small" data-ed="save">Lưu</button>
    </header>
    <main class="page editor">
      <section class="field"><span class="field-label">Loại kỷ niệm</span><div class="chips" id="ed-types"></div></section>
      <label class="field"><span class="field-label">Tiêu đề</span><input id="ed-title" maxlength="80" enterkeyhint="done"></label>
      <label class="field"><span class="field-label">Ngày</span><input id="ed-date" type="date" min="1900-01-01" max="2200-12-31"></label>
      <section class="field">
        <span class="field-label">Cách đếm</span>
        <div class="seg" id="ed-modes"></div>
        <label class="check" id="ed-first-wrap"><input type="checkbox" id="ed-first"> Tính ngày đầu tiên là ngày 1</label>
      </section>
      <section class="field"><span class="field-label">Bố cục</span><div class="layouts" id="ed-layouts"></div></section>
      <section class="field">
        <span class="field-label">Ảnh</span>
        <p class="hint" id="ed-hint"></p>
        <div class="preview" id="ed-preview"></div>
        <div class="slot-tools" id="ed-tools"></div>
      </section>
      <section class="field" id="ed-names">
        <span class="field-label">Tên hai người</span>
        <div class="two"><input id="ed-name0" maxlength="40" placeholder="Anh"><input id="ed-name1" maxlength="40" placeholder="Em"></div>
      </section>
      <section class="field"><span class="field-label">Màu nền</span><div class="swatches" id="ed-themes"></div></section>
      <label class="field"><span class="field-label">Ghi chú</span><textarea id="ed-note" rows="3" maxlength="5000" placeholder="Vài dòng về kỷ niệm này…"></textarea></label>
      <button class="btn block" data-ed="save">${icon('check')} Lưu kỷ niệm</button>
      <input type="file" id="ed-file" class="visually-hidden" accept="image/*">
    </main>`;
  root.replaceChildren(host);

  const $ = (sel) => host.querySelector(sel);
  const preview = $('#ed-preview');
  $('#ed-title').value = draft.title;
  $('#ed-date').value = draft.date;
  $('#ed-name0').value = draft.people[0].name;
  $('#ed-name1').value = draft.people[1].name;
  $('#ed-note').value = draft.note || '';

  /* ---------- Vẽ từng phần ---------- */
  function renderTypes() {
    $('#ed-types').innerHTML = TYPE_ORDER.map((t) => `<button type="button" class="chip${draft.type === t ? ' on' : ''}" data-type="${t}">${TYPES[t].emoji} ${TYPES[t].label}</button>`).join('');
  }
  function renderModes() {
    $('#ed-modes').innerHTML = Object.entries(COUNT_MODES).map(([k, v]) => `<button type="button" class="${draft.countMode === k ? 'on' : ''}" data-mode="${k}">${v}</button>`).join('');
    $('#ed-first-wrap').hidden = draft.countMode !== 'since';
    $('#ed-first').checked = !!draft.countFirstDay;
  }
  function renderLayouts() {
    $('#ed-layouts').innerHTML = TYPES[draft.type].layouts.map((l) => `<button type="button" class="lay${draft.layout === l ? ' on' : ''}" data-layout="${l}">
      <svg viewBox="0 0 44 36" fill="currentColor" aria-hidden="true">${LAYOUT_ICONS[l]}</svg><span>${LAYOUTS[l].label}</span></button>`).join('');
    $('#ed-names').hidden = draft.layout !== 'couple';
  }
  function renderThemes() {
    $('#ed-themes').innerHTML = THEMES.map((t) => `<button type="button" class="swatch theme-${t}${draft.theme === t ? ' on' : ''}" data-theme="${t}" aria-label="Màu ${t}"></button>`).join('');
  }
  function previewMemory() {
    return {
      ...draft,
      title: draft.title.trim() || TYPES[draft.type].title,
      date: draft.date || todayISO(),
      slots: pool.slice(0, LAYOUTS[draft.layout].slots),
    };
  }
  function renderPreview() {
    preview.innerHTML = cardHTML(previewMemory(), todayISO(), { editable: true, selected });
    photos.hydrate(preview);
    const n = LAYOUTS[draft.layout].slots;
    $('#ed-hint').textContent = n === 0 ? 'Bố cục này không dùng ảnh.'
      : selected >= 0 ? 'Kéo để căn ảnh, chụm 2 ngón hoặc dùng thanh trượt để phóng to.'
        : 'Chạm vào ô để chọn ảnh. Chạm vào ảnh đã chọn để căn chỉnh.';
  }
  function renderTools() {
    const s = selected >= 0 ? pool[selected] : null;
    $('#ed-tools').innerHTML = s ? `
      <label class="zoom"><span>−</span><input type="range" id="ed-zoom" min="1" max="4" step="0.01" value="${s.zoom}" aria-label="Phóng to"><span>+</span></label>
      <div class="btn-row">
        <button type="button" class="btn small secondary" data-ed="replace">Đổi ảnh</button>
        <button type="button" class="btn small secondary" data-ed="reset">Căn giữa</button>
        <button type="button" class="btn small danger" data-ed="remove">Bỏ ảnh</button>
        <button type="button" class="btn small" data-ed="done">Xong</button>
      </div>` : '';
  }
  const select = (i) => { selected = i; renderPreview(); renderTools(); };

  function setType(type) {
    const t = TYPES[type];
    draft.type = type;
    if (!touched.title) { draft.title = t.title; $('#ed-title').value = t.title; }
    if (!touched.mode) draft.countMode = t.mode;
    if (!touched.theme) draft.theme = t.theme;
    if (!t.layouts.includes(draft.layout)) { draft.layout = t.layouts[0]; selected = -1; }
    renderTypes(); renderModes(); renderLayouts(); renderThemes(); renderPreview(); renderTools();
  }

  /* ---------- Chọn ảnh ---------- */
  function pick(i) {
    pickSlot = i;
    const input = $('#ed-file');
    input.value = '';
    input.click();
  }
  async function handleFile(file) {
    const i = pickSlot;
    pickSlot = -1;
    if (!file || i < 0) return;
    const slotEl = preview.querySelector(`.slot[data-slot="${i}"]`);
    if (slotEl) slotEl.classList.add('loading');
    try {
      const p = await photos.processFile(file);
      photos.addTemp(p);
      tempIds.add(p.id);
      pool[i] = { photo: p.id, x: 0, y: 0, zoom: 1 };
      selected = i;
    } catch (e) {
      toast(e.message || 'Không đọc được ảnh');
    }
    renderPreview();
    renderTools();
  }

  /* ---------- Kéo / chụm để căn ảnh ---------- */
  const pointers = new Map();
  let lastDist = 0;
  function slotParts(i) {
    const el = preview.querySelector(`.slot[data-slot="${i}"]`);
    return { el, img: el && el.querySelector('img') };
  }
  function applyStyle() {
    const { img } = slotParts(selected);
    if (img) img.style.cssText = imgStyle(pool[selected]);
  }
  function panBy(dx, dy) {
    const s = pool[selected];
    const { el, img } = slotParts(selected);
    if (!s || !img || !img.naturalWidth) return;
    const W = el.clientWidth, H = el.clientHeight;
    const base = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    const overX = img.naturalWidth * base * s.zoom - W;
    const overY = img.naturalHeight * base * s.zoom - H;
    if (overX > 0.5) s.x = clamp(s.x - (2 * dx) / overX, -1, 1);
    if (overY > 0.5) s.y = clamp(s.y - (2 * dy) / overY, -1, 1);
    applyStyle();
  }
  function zoomBy(f) {
    const s = pool[selected];
    if (!s) return;
    s.zoom = clamp(s.zoom * f, 1, 4);
    applyStyle();
    const range = $('#ed-zoom');
    if (range) range.value = s.zoom;
  }
  preview.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('.slot.selected');
    if (!el) return;
    e.preventDefault();
    try { el.setPointerCapture(e.pointerId); } catch { /* bỏ qua */ }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    lastDist = 0;
  });
  preview.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId) || selected < 0) return;
    const prev = pointers.get(e.pointerId);
    const cur = { x: e.clientX, y: e.clientY };
    pointers.set(e.pointerId, cur);
    if (pointers.size === 1) panBy(cur.x - prev.x, cur.y - prev.y);
    else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (lastDist) zoomBy(d / lastDist);
      lastDist = d;
    }
  });
  const release = (e) => { pointers.delete(e.pointerId); if (pointers.size < 2) lastDist = 0; };
  preview.addEventListener('pointerup', release);
  preview.addEventListener('pointercancel', release);
  preview.addEventListener('wheel', (e) => {
    if (!e.target.closest('.slot.selected')) return;
    e.preventDefault();
    zoomBy(Math.exp(-e.deltaY * 0.002));
  }, { passive: false });
  const blockPageZoom = (e) => { if (selected >= 0) e.preventDefault(); };
  document.addEventListener('gesturestart', blockPageZoom); // Safari: chụm ảnh không phóng cả trang

  /* ---------- Sự kiện ---------- */
  host.addEventListener('click', (e) => {
    const t = e.target;
    let el;
    if ((el = t.closest('[data-type]'))) return setType(el.dataset.type);
    if ((el = t.closest('[data-mode]'))) {
      draft.countMode = el.dataset.mode; touched.mode = true;
      renderModes(); renderPreview();
      return;
    }
    if ((el = t.closest('[data-layout]'))) {
      draft.layout = el.dataset.layout; selected = -1;
      renderLayouts(); renderPreview(); renderTools();
      return;
    }
    if ((el = t.closest('[data-theme]'))) {
      draft.theme = el.dataset.theme; touched.theme = true;
      renderThemes(); renderPreview();
      return;
    }
    if ((el = t.closest('[data-ed]'))) return action(el.dataset.ed);
    if (preview.contains(t)) {
      const slotEl = t.closest('.slot');
      if (!slotEl) { if (selected >= 0) select(-1); return; }
      const i = +slotEl.dataset.slot;
      if (!pool[i]) pick(i);
      else if (selected !== i) select(i);
    }
  });
  host.addEventListener('input', (e) => {
    const id = e.target.id;
    if (id === 'ed-title') { draft.title = e.target.value; touched.title = true; renderPreview(); }
    else if (id === 'ed-date') { draft.date = e.target.value; renderPreview(); }
    else if (id === 'ed-name0' || id === 'ed-name1') { draft.people[+id.slice(-1)].name = e.target.value; renderPreview(); }
    else if (id === 'ed-note') draft.note = e.target.value;
    else if (id === 'ed-zoom' && pool[selected]) { pool[selected].zoom = +e.target.value; applyStyle(); }
  });
  host.addEventListener('change', (e) => {
    if (e.target.id === 'ed-first') { draft.countFirstDay = e.target.checked; renderPreview(); }
    else if (e.target.id === 'ed-file') handleFile(e.target.files && e.target.files[0]);
  });

  function dropUnused(keep) {
    for (const id of tempIds) if (!keep.has(id)) photos.dropTemp(id);
    tempIds.clear();
  }

  async function action(a) {
    if (a === 'cancel') {
      if (snapshot() !== initial && !confirm('Bỏ các thay đổi chưa lưu?')) return;
      onCancel();
    } else if (a === 'save') {
      save();
    } else if (a === 'replace') {
      pick(selected);
    } else if (a === 'remove') {
      pool[selected] = null;
      select(-1);
    } else if (a === 'reset') {
      Object.assign(pool[selected], { x: 0, y: 0, zoom: 1 });
      select(selected);
    } else if (a === 'done') {
      select(-1);
    }
  }

  async function save() {
    if (saving) return;
    if (!draft.date) { toast('Hãy chọn ngày'); $('#ed-date').focus(); return; }
    const n = LAYOUTS[draft.layout].slots;
    const m = normalize({
      ...draft,
      note: (draft.note || '').trim(),
      people: draft.people.map((p) => ({ name: p.name.trim() })),
      slots: pool.slice(0, n).map((s) => s || { photo: null, x: 0, y: 0, zoom: 1 }),
    });
    if (!m) { toast('Ngày không hợp lệ'); return; }
    saving = true;
    host.querySelectorAll('[data-ed="save"]').forEach((b) => { b.disabled = true; });
    try {
      const used = new Set(m.slots.map((s) => s.photo).filter(Boolean));
      for (const id of used) if (tempIds.has(id)) await photos.saveTemp(id);
      dropUnused(used);
      await onSave(m);
    } catch (e) {
      saving = false;
      host.querySelectorAll('[data-ed="save"]').forEach((b) => { b.disabled = false; });
      toast('Không lưu được: ' + e.message);
    }
  }

  renderTypes(); renderModes(); renderLayouts(); renderThemes(); renderPreview(); renderTools();

  return {
    destroy() {
      document.removeEventListener('gesturestart', blockPageZoom);
      dropUnused(new Set());
    },
  };
}
