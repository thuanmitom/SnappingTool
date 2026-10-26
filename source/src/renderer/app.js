'use strict';

/* global window, document */
const api = window.snap;

const state = {
  view: 'home',
  snapshots: [],
  catalogs: [],
  quick: [],
  settings: null,
  profile: null,
  profiles: null,
  activeCatalog: 'all',
  search: '',
  draft: null,          // snap draft while modal open
  selection: null,      // selection map for the modal
};

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Monitor numbers come from stored data; never let a non-number reach innerHTML.
const monNo = (id) => (Number.isInteger(id) ? id : 0) + 1;
const fmtDate = (ts) => new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

// --------------------------------------------------------------------------
// Boot
// --------------------------------------------------------------------------
async function boot() {
  wireChrome();
  await refreshAll();
  render();
  pollResources();
  setInterval(pollResources, 5000);

  api.on('trigger-snap', () => startSnap());
  api.on('restore-start', (p) => showRestore(p.name));
  api.on('restore-progress', (p) => updateRestore(p));
  api.on('restore-done', (p) => hideRestore(p));
  api.on('chord-armed', (p) => toast(`${p.leader} → now press the second key…`));
}

async function refreshAll() {
  const cfg = await api.settings.get();
  state.settings = cfg.settings;
  if (cfg.storeWarnings && cfg.storeWarnings.length) toast(cfg.storeWarnings.join(' '), true, 9000);
  state.profile = cfg.profile;
  state.profiles = cfg.profiles;
  state.snapshots = await api.snapshots.list();
  state.catalogs = await api.catalogs.list();
  state.quick = await api.quick.list();
}

function wireChrome() {
  $('#btn-min').onclick = () => api.window.minimize();
  $('#btn-close').onclick = () => api.window.close();
  $('#btn-snap').onclick = () => startSnap();

  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll('.nav-item').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      state.view = btn.dataset.view;
      render();
    };
  });

  // Modal buttons.
  $('#snap-cancel').onclick = closeSnapModal;
  $('#snap-save').onclick = saveSnap;
}

// --------------------------------------------------------------------------
// Resources widget
// --------------------------------------------------------------------------
async function pollResources() {
  try {
    const r = await api.system.resources();
    const pctFree = r.totalRamGb ? Math.round((r.freeRamGb / r.totalRamGb) * 100) : 0;
    $('#res-ram').textContent = `${r.freeRamGb} / ${r.totalRamGb} GB`;
    $('#res-ram-bar').style.width = `${Math.max(4, pctFree)}%`;
    $('#res-profile').textContent = state.profile ? state.profile.label : '—';
    const bridge = await api.system.tabBridge();
    const pill = $('#bridge-pill');
    pill.textContent = bridge.connected ? 'tabs: connected' : 'tabs: off';
    pill.title = bridge.connected ? 'Browser extension is sending tabs' : 'Not receiving tabs — pair the browser extension in Settings → Browser extension';
    pill.classList.toggle('ok', bridge.connected);
  } catch (_) { /* ignore */ }
}

// --------------------------------------------------------------------------
// Router
// --------------------------------------------------------------------------
function render() {
  const c = $('#content');
  c.innerHTML = '';
  const view = { home: viewHome, catalogs: viewCatalogs, quick: viewQuick, settings: viewSettings }[state.view];
  c.appendChild(view());
}

// --------------------------------------------------------------------------
// Home / sessions
// --------------------------------------------------------------------------
function viewHome() {
  const v = el('div', 'view');

  const head = el('div', 'page-head');
  head.appendChild(el('div', '', `
    <h1 class="page-title">Sessions</h1>
    <p class="page-sub">Capture what's open now, restore it exactly later.</p>`));
  const tools = el('div', 'toolbar');
  const search = el('input', 'search');
  search.placeholder = 'Search apps, tabs, names…';
  search.value = state.search;
  search.oninput = () => { state.search = search.value; renderCards(list); };
  tools.appendChild(search);
  head.appendChild(tools);
  v.appendChild(head);

  // Catalog filter chips.
  const chips = el('div', 'chips');
  const allChip = el('button', `chip ${state.activeCatalog === 'all' ? 'is-active' : ''}`, 'All');
  allChip.onclick = () => { state.activeCatalog = 'all'; render(); };
  chips.appendChild(allChip);
  for (const cat of state.catalogs) {
    const chip = el('button', `chip ${state.activeCatalog === cat.id ? 'is-active' : ''}`, esc(cat.name));
    chip.onclick = () => { state.activeCatalog = cat.id; render(); };
    chips.appendChild(chip);
  }
  v.appendChild(chips);

  const list = el('div', 'grid');
  v.appendChild(list);
  renderCards(list);
  return v;
}

function filteredSnapshots() {
  let snaps = state.snapshots;
  if (state.activeCatalog !== 'all') {
    const cat = state.catalogs.find((c) => c.id === state.activeCatalog);
    const ids = new Set(cat ? cat.snapshotIds : []);
    snaps = snaps.filter((s) => ids.has(s.id));
  }
  const q = state.search.trim().toLowerCase();
  if (q) {
    snaps = snaps.filter((s) => {
      if (s.name.toLowerCase().includes(q)) return true;
      return (s.items || []).some((it) =>
        (it.title || '').toLowerCase().includes(q) ||
        (it.tabs || []).some((t) => (t.url || '').toLowerCase().includes(q) || (t.title || '').toLowerCase().includes(q)));
    });
  }
  return snaps;
}

function renderCards(container) {
  container.innerHTML = '';
  const snaps = filteredSnapshots();
  if (!snaps.length) {
    const e = el('div', 'empty');
    e.style.gridColumn = '1 / -1';
    e.innerHTML = `<span class="emoji">📸</span><h3>No sessions here yet</h3>
      <p>Open your usual apps and browser tabs, then snap them all at once!</p>`;
    const b = el('button', 'btn btn--primary', 'Snap current session ✨');
    b.onclick = () => startSnap();
    e.appendChild(b);
    container.appendChild(e);
    return;
  }
  snaps.forEach((s, i) => {
    const card = buildCard(s);
    card.style.animationDelay = `${Math.min(i * 40, 300)}ms`;
    container.appendChild(card);
  });
}

function countItems(s) {
  const apps = (s.items || []).filter((it) => it.type === 'app').length;
  const browsers = (s.items || []).filter((it) => it.type === 'browser');
  const tabs = browsers.reduce((n, b) => n + (b.tabs ? b.tabs.length : 0), 0);
  return { apps, browsers: browsers.length, tabs };
}

function buildCard(s) {
  const card = el('div', 'card');
  const { apps, tabs } = countItems(s);
  const monCount = (s.monitors || []).length;

  const top = el('div', 'card__top');
  top.appendChild(el('div', '', `
    <p class="card__name">${esc(s.name)}</p>
    <p class="card__meta">${fmtDate(s.createdAt)} · ${monCount} monitor${monCount > 1 ? 's' : ''}</p>`));
  const topRight = el('div', 'row');
  if (s.auto) topRight.appendChild(el('span', 'badge auto', 'auto'));
  const pin = el('button', `pin-btn ${s.pinned ? 'on' : ''}`, '★');
  pin.title = s.pinned ? 'Unpin' : 'Pin to top (gets a low Ctrl+Alt number)';
  pin.onclick = async (e) => {
    e.stopPropagation();
    await api.snapshots.pin(s.id, !s.pinned);
    await refreshAll(); render();
  };
  topRight.appendChild(pin);
  top.appendChild(topRight);
  card.appendChild(top);

  card.appendChild(buildSchematic(s));

  const badges = el('div', 'card__badges');
  if (s.pinned) badges.appendChild(el('span', 'badge accent', '★ pinned'));
  badges.appendChild(el('span', 'badge accent', `${apps} app${apps !== 1 ? 's' : ''}`));
  badges.appendChild(el('span', 'badge', `${tabs} tab${tabs !== 1 ? 's' : ''}`));
  card.appendChild(badges);

  const actions = el('div', 'card__actions');
  const restoreBtn = el('button', 'btn btn--primary btn--sm', 'Restore');
  restoreBtn.onclick = (e) => { e.stopPropagation(); restore(s.id); };
  const catBtn = el('button', 'btn btn--ghost btn--sm', 'Catalog');
  catBtn.onclick = (e) => { e.stopPropagation(); openCatalogPicker(s); };
  const dupBtn = el('button', 'btn btn--ghost btn--sm', 'Duplicate');
  dupBtn.onclick = async (e) => {
    e.stopPropagation();
    await api.snapshots.duplicate(s.id);
    await refreshAll(); render(); toast('Session duplicated');
  };
  const delBtn = el('button', 'btn btn--danger btn--sm', 'Delete');
  delBtn.onclick = async (e) => {
    e.stopPropagation();
    if (confirm(`Delete "${s.name}"?`)) { await api.snapshots.remove(s.id); await refreshAll(); render(); toast('Session deleted'); }
  };
  actions.appendChild(restoreBtn);
  actions.appendChild(catBtn);
  actions.appendChild(dupBtn);
  actions.appendChild(delBtn);
  card.appendChild(actions);

  card.onclick = () => openDetailView(s);
  return card;
}

/**
 * Read-only detail view: shows every app and every browser tab in a session.
 * No editing here — just a clear look at what's inside.
 */
function openDetailView(s) {
  const backdrop = el('div', 'modal-backdrop');
  const modal = el('div', 'modal');
  modal.appendChild(el('div', 'modal__head',
    `<h2>👀 ${esc(s.name)}</h2><p class="muted">${fmtDate(s.createdAt)} · read-only view</p>`));

  const body = el('div', 'modal__body');
  const apps = (s.items || []).filter((it) => it.type === 'app');
  const browsers = (s.items || []).filter((it) => it.type === 'browser');

  if (apps.length) {
    const g = el('div', 'detail-group');
    g.appendChild(el('h4', '', `Applications (${apps.length})`));
    apps.forEach((a) => {
      const row = el('div', 'detail-row');
      row.appendChild(el('span', 'dot app'));
      row.appendChild(el('div', 'txt',
        `<div class="t">${esc(a.title)}</div><div class="s">${esc(a.processName || '')} · monitor ${monNo(a.monitorId)} · ${esc(a.state || 'normal')}</div>`));
      g.appendChild(row);
    });
    body.appendChild(g);
  }

  if (browsers.length) {
    const g = el('div', 'detail-group');
    const totalTabs = browsers.reduce((n, b) => n + (b.tabs ? b.tabs.length : 0), 0);
    g.appendChild(el('h4', '', `Browser tabs (${totalTabs})`));
    browsers.forEach((b) => {
      const row = el('div', 'detail-row');
      row.appendChild(el('span', 'dot browser'));
      row.appendChild(el('div', 'txt',
        `<div class="t">${esc(b.browser)} — ${(b.tabs || []).length} tab(s)</div><div class="s">monitor ${monNo(b.monitorId)}</div>`));
      g.appendChild(row);
      const tabsWrap = el('div', 'detail-tabs');
      (b.tabs || []).forEach((t) => {
        const tr = el('div', 'detail-row');
        tr.appendChild(el('span', 'dot browser'));
        tr.appendChild(el('div', 'txt',
          `<div class="t">${esc(t.title || t.url)}</div><div class="s">${esc(t.url)}</div>`));
        tabsWrap.appendChild(tr);
      });
      g.appendChild(tabsWrap);
    });
    body.appendChild(g);
  }

  if (!apps.length && !browsers.length) {
    body.appendChild(el('div', 'empty', '<span class="emoji">🫙</span><p style="margin:0">This session is empty.</p>'));
  }
  modal.appendChild(body);

  const foot = el('div', 'modal__foot');
  const rename = el('button', 'btn btn--ghost', '✏️ Rename');
  rename.onclick = async () => { backdrop.remove(); await renameSnapshot(s); };
  const restoreBtn = el('button', 'btn btn--primary', '↻ Restore this');
  restoreBtn.onclick = () => { backdrop.remove(); restore(s.id); };
  foot.appendChild(rename);
  foot.appendChild(el('div', '', '')).style.flex = '1';
  const close = el('button', 'btn btn--ghost', 'Close');
  close.onclick = () => backdrop.remove();
  foot.appendChild(close);
  foot.appendChild(restoreBtn);
  modal.appendChild(foot);

  backdrop.appendChild(modal);
  backdrop.onclick = (e) => { if (e.target === backdrop) backdrop.remove(); };
  document.body.appendChild(backdrop);
}

/** The signature monitor-topology preview. */
function buildSchematic(s) {
  const wrap = el('div', 'schematic');
  const monitors = (s.monitors && s.monitors.length) ? s.monitors : [{ id: 0, x: 0, y: 0, width: 1920, height: 1080 }];
  // Normalize the virtual desktop bounds.
  const minX = Math.min(...monitors.map((m) => m.x));
  const minY = Math.min(...monitors.map((m) => m.y));

  for (const m of monitors) {
    const mon = el('div', 'mon');
    mon.style.flex = `${m.width}`;
    // Place windows that belong to this monitor.
    for (const it of s.items || []) {
      if (it.monitorId !== m.id || !it.rect) continue;
      const w = el('div', `mon__win${it.type === 'browser' ? ' browser' : ''}`);
      const rx = (it.rect.x - m.x) / m.width;
      const ry = (it.rect.y - m.y) / m.height;
      w.style.left = `${Math.max(0, Math.min(0.92, rx)) * 100}%`;
      w.style.top = `${Math.max(0, Math.min(0.92, ry)) * 100}%`;
      w.style.width = `${Math.max(6, Math.min(60, (it.rect.width / m.width) * 100))}%`;
      w.style.height = `${Math.max(8, Math.min(70, (it.rect.height / m.height) * 100))}%`;
      mon.appendChild(w);
    }
    wrap.appendChild(mon);
  }
  return wrap;
}

async function renameSnapshot(s) {
  const name = await askText('Rename session', { initial: s.name });
  if (name && name !== s.name) {
    await api.snapshots.rename(s.id, name);
    await refreshAll(); render(); toast('Renamed');
  }
}

async function restore(id) {
  const focusMode = state.settings && state.settings.focusMode;
  const r = await api.snapshots.restore(id, focusMode);
  if (r && r.error) toast(r.error, true);
}

// --------------------------------------------------------------------------
// Catalog picker (attach a session to catalogs)
// --------------------------------------------------------------------------
function openCatalogPicker(snapshot) {
  if (!state.catalogs.length) { toast('Create a catalog first (Catalogs tab)'); return; }
  const backdrop = el('div', 'modal-backdrop');
  const modal = el('div', 'modal');
  modal.style.width = 'min(440px, 92vw)';
  modal.appendChild(el('div', 'modal__head', `<h2>Add to catalog</h2><p class="muted">${esc(snapshot.name)}</p>`));
  const body = el('div', 'modal__body');
  for (const cat of state.catalogs) {
    const inCat = cat.snapshotIds.includes(snapshot.id);
    const row = el('div', 'item');
    const check = el('div', `check ${inCat ? 'on' : ''}`, inCat ? '✓' : '');
    row.appendChild(check);
    row.appendChild(el('div', 'item__title', esc(cat.name)));
    row.onclick = async () => {
      const now = !check.classList.contains('on');
      check.classList.toggle('on', now); check.textContent = now ? '✓' : '';
      await api.catalogs.setMember(cat.id, snapshot.id, now);
      await refreshAll();
    };
    body.appendChild(row);
  }
  modal.appendChild(body);
  const foot = el('div', 'modal__foot');
  const done = el('button', 'btn btn--primary', 'Done');
  done.style.marginLeft = 'auto';
  done.onclick = () => { backdrop.remove(); render(); };
  foot.appendChild(done);
  modal.appendChild(foot);
  backdrop.appendChild(modal);
  backdrop.onclick = (e) => { if (e.target === backdrop) { backdrop.remove(); render(); } };
  document.body.appendChild(backdrop);
}

// --------------------------------------------------------------------------
// Snap flow (prepare → select → save)
// --------------------------------------------------------------------------
async function startSnap() {
  const btn = $('#btn-snap');
  btn.disabled = true; btn.style.opacity = '0.7';
  try {
    const draft = await api.snap.prepare();
    state.draft = draft;
    state.selection = draft.items.map((it) => ({
      included: true,
      tabs: it.type === 'browser' ? (it.tabs || []).map(() => true) : null,
    }));
    openSnapModal(draft);
  } catch (e) {
    toast('Could not read the current session', true);
  } finally {
    btn.disabled = false; btn.style.opacity = '1';
  }
}

function openSnapModal(draft) {
  const list = $('#snap-list');
  list.innerHTML = '';

  if (draft.note) {
    const note = el('div', 'empty');
    note.style.padding = '16px'; note.style.marginBottom = '12px';
    note.innerHTML = `<p style="margin:0">${esc(draft.note)}</p>`;
    list.appendChild(note);
  }

  const apps = draft.items.map((it, i) => ({ it, i })).filter((x) => x.it.type === 'app');
  const browsers = draft.items.map((it, i) => ({ it, i })).filter((x) => x.it.type === 'browser');

  if (apps.length) {
    list.appendChild(groupHeader('Applications', apps.map((a) => a.i)));
    apps.forEach(({ it, i }) => list.appendChild(appRow(it, i)));
  }
  if (browsers.length) {
    list.appendChild(groupHeader('Browser windows', browsers.flatMap((b) => b.i)));
    browsers.forEach(({ it, i }) => list.appendChild(browserRow(it, i)));
  }
  if (!apps.length && !browsers.length) {
    list.appendChild(el('div', 'empty', '<p style="margin:0">Nothing open was detected to capture.</p>'));
  }

  $('#snap-name').value = '';
  renderSnapCatalogRow();
  const modal = $('#snap-modal');
  modal.hidden = false;
}

/** Catalog chips inside the snap modal — assign the new session at save time. */
function renderSnapCatalogRow() {
  const row = $('#snap-catalog-row');
  if (!row) return;
  row.innerHTML = '';
  row.appendChild(el('span', 'cat-label', 'Add to catalog:'));
  if (!state.snapCatalogSel) state.snapCatalogSel = new Set();

  for (const cat of state.catalogs) {
    const on = state.snapCatalogSel.has(cat.id);
    const chip = el('button', `chip ${on ? 'is-active' : ''}`, esc(cat.name));
    chip.onclick = () => {
      if (state.snapCatalogSel.has(cat.id)) state.snapCatalogSel.delete(cat.id);
      else state.snapCatalogSel.add(cat.id);
      renderSnapCatalogRow();
    };
    row.appendChild(chip);
  }
  const addChip = el('button', 'chip', '+ New');
  addChip.onclick = async () => {
    const name = await askText('New catalog', { placeholder: 'e.g. Project A' });
    if (name) {
      const cat = await api.catalogs.save({ name });
      await refreshAll();
      state.snapCatalogSel.add(cat.id);
      renderSnapCatalogRow();
    }
  };
  row.appendChild(addChip);
}

function groupHeader(label, indices) {
  const g = el('div', 'grp');
  g.appendChild(el('span', '', label));
  const btn = el('button', '', 'Toggle all');
  btn.onclick = () => {
    const anyOff = indices.some((i) => !state.selection[i].included);
    indices.forEach((i) => { state.selection[i].included = anyOff; });
    openSnapModal(state.draft); // re-render
  };
  g.appendChild(btn);
  return g;
}

function appRow(it, i) {
  const sel = state.selection[i];
  const row = el('div', `item ${sel.included ? '' : 'off'}`);
  const check = el('div', `check ${sel.included ? 'on' : ''}`, sel.included ? '✓' : '');
  row.appendChild(check);
  const body = el('div', 'item__title');
  body.innerHTML = `${esc(it.title)}<div class="item__sub">${esc(it.processName || '')} · monitor ${monNo(it.monitorId)} · ${esc(it.state)}</div>`;
  row.appendChild(body);
  row.onclick = () => {
    sel.included = !sel.included;
    row.classList.toggle('off', !sel.included);
    check.classList.toggle('on', sel.included);
    check.textContent = sel.included ? '✓' : '';
  };
  return row;
}

function browserRow(it, i) {
  const sel = state.selection[i];
  const wrap = el('div', '');
  const row = el('div', `item ${sel.included ? '' : 'off'}`);
  const check = el('div', `check ${sel.included ? 'on' : ''}`, sel.included ? '✓' : '');
  row.appendChild(check);
  const tabCount = (it.tabs || []).length;
  row.appendChild(el('div', 'item__title', `${esc(it.browser)} <div class="item__sub">${tabCount} tab${tabCount !== 1 ? 's' : ''} · monitor ${monNo(it.monitorId)}</div>`));
  row.onclick = () => {
    sel.included = !sel.included;
    row.classList.toggle('off', !sel.included);
    check.classList.toggle('on', sel.included);
    check.textContent = sel.included ? '✓' : '';
  };
  wrap.appendChild(row);

  // Individual tabs.
  if (tabCount) {
    const tabs = el('div', 'item__tabs');
    (it.tabs || []).forEach((t, ti) => {
      const on = sel.tabs[ti];
      const tr = el('div', `item ${on ? '' : 'off'}`);
      const tc = el('div', `check ${on ? 'on' : ''}`, on ? '✓' : '');
      tr.appendChild(tc);
      tr.appendChild(el('div', 'item__title', `${esc(t.title || t.url)}<div class="item__sub">${esc(t.url)}</div>`));
      tr.onclick = () => {
        sel.tabs[ti] = !sel.tabs[ti];
        tr.classList.toggle('off', !sel.tabs[ti]);
        tc.classList.toggle('on', sel.tabs[ti]);
        tc.textContent = sel.tabs[ti] ? '✓' : '';
      };
      tabs.appendChild(tr);
    });
    wrap.appendChild(tabs);
  }
  return wrap;
}

function closeSnapModal() {
  $('#snap-modal').hidden = true;
  state.draft = null; state.selection = null; state.snapCatalogSel = null;
}

async function saveSnap() {
  const selection = state.selection.map((s) => ({
    included: s.included,
    tabs: s.tabs ? s.tabs.map((v) => v) : null,
  }));
  const name = $('#snap-name').value.trim();
  const catalogIds = state.snapCatalogSel ? [...state.snapCatalogSel] : [];
  await api.snap.confirm(selection, { name: name || undefined, catalogIds });
  closeSnapModal();
  await refreshAll();
  state.view = 'home';
  document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('is-active', b.dataset.view === 'home'));
  render();
  toast(catalogIds.length ? 'Session saved & filed 🎉' : 'Session saved 🎉');
}

// --------------------------------------------------------------------------
// Catalogs view
// --------------------------------------------------------------------------
function viewCatalogs() {
  const v = el('div', 'view');
  const head = el('div', 'page-head');
  head.appendChild(el('div', '', `<h1 class="page-title">Catalogs</h1><p class="page-sub">Group sessions by purpose — project, study, focus.</p>`));
  const add = el('button', 'btn btn--primary', '+ New catalog');
  add.onclick = createCatalog;
  head.appendChild(add);
  v.appendChild(head);

  if (!state.catalogs.length) {
    v.appendChild(emptyBlock('No catalogs yet', 'Catalogs group your sessions — like “Client A”, “Study”, or “Deep work”.', 'Create catalog', createCatalog, '🗂️'));
    return v;
  }

  const grid = el('div', 'grid');
  for (const cat of state.catalogs) {
    const card = el('div', 'card');
    card.appendChild(el('div', 'card__top', `<div><p class="card__name">${esc(cat.name)}</p>
      <p class="card__meta">${cat.snapshotIds.length} session${cat.snapshotIds.length !== 1 ? 's' : ''}</p></div>`));
    const actions = el('div', 'card__actions');
    const open = el('button', 'btn btn--primary btn--sm', 'View sessions');
    open.onclick = () => { state.activeCatalog = cat.id; state.view = 'home'; document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('is-active', b.dataset.view === 'home')); render(); };
    const del = el('button', 'btn btn--danger btn--sm', 'Delete');
    del.onclick = async () => { if (confirm(`Delete catalog "${cat.name}"? Sessions are kept.`)) { await api.catalogs.remove(cat.id); await refreshAll(); render(); } };
    actions.appendChild(open); actions.appendChild(del);
    card.appendChild(actions);
    grid.appendChild(card);
  }
  v.appendChild(grid);
  return v;
}

/**
 * Ask the user for a line of text via a custom modal.
 * Electron does NOT support window.prompt(), so we roll our own.
 * Returns the string, or null if cancelled.
 */
function askText(title, { placeholder = '', initial = '' } = {}) {
  return new Promise((resolve) => {
    const backdrop = el('div', 'modal-backdrop');
    const modal = el('div', 'modal');
    modal.style.width = 'min(420px, 92vw)';
    modal.innerHTML = `
      <div class="modal__head"><h2>${esc(title)}</h2></div>
      <div class="modal__body" style="padding-bottom:14px">
        <input class="input" id="ask-input" style="width:100%" placeholder="${esc(placeholder)}" />
      </div>
      <div class="modal__foot"><div style="flex:1"></div>
        <button class="btn btn--ghost" id="ask-cancel">Cancel</button>
        <button class="btn btn--primary" id="ask-ok">OK</button></div>`;
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    const input = $('#ask-input', modal);
    input.value = initial;
    input.focus(); input.select();
    const close = (val) => { backdrop.remove(); resolve(val); };
    $('#ask-cancel', modal).onclick = () => close(null);
    $('#ask-ok', modal).onclick = () => close(input.value.trim() || null);
    input.onkeydown = (e) => {
      if (e.key === 'Enter') close(input.value.trim() || null);
      if (e.key === 'Escape') close(null);
    };
    backdrop.onclick = (e) => { if (e.target === backdrop) close(null); };
  });
}

async function createCatalog() {
  const name = await askText('New catalog', { placeholder: 'e.g. Project A, Deep work…' });
  if (name) { await api.catalogs.save({ name }); await refreshAll(); render(); toast('Catalog created'); }
}

// --------------------------------------------------------------------------
// Quick actions view
// --------------------------------------------------------------------------
function viewQuick() {
  const v = el('div', 'view');
  const head = el('div', 'page-head');
  head.appendChild(el('div', '', `<h1 class="page-title">Quick actions</h1><p class="page-sub">One hotkey → open a whole set of apps and URLs.</p>`));
  const add = el('button', 'btn btn--primary', '+ New action');
  add.onclick = () => openQuickActionModal(null);
  head.appendChild(add);
  v.appendChild(head);

  if (!state.quick.length) {
    v.appendChild(emptyBlock('No quick actions', 'Bind a hotkey like Ctrl+Alt+G to fire open a whole set of apps and links at once.', 'Create action', () => openQuickActionModal(null), '⚡'));
    return v;
  }

  const grid = el('div', 'grid');
  for (const qa of state.quick) {
    const targets = qaTargets(qa);
    const card = el('div', 'card');
    card.appendChild(el('div', 'card__top', `<div><p class="card__name">${esc(qa.name || targets[0]?.target || 'Quick action')}</p>
      <p class="card__meta">${esc(qa.hotkey || 'no hotkey')} · ${targets.length} target${targets.length !== 1 ? 's' : ''}</p></div>`));
    const list = el('div', 'card__meta');
    list.style.whiteSpace = 'normal';
    list.innerHTML = targets.slice(0, 3).map((t) => `<div>· ${esc(t.target)}</div>`).join('')
      + (targets.length > 3 ? `<div class="muted">…and ${targets.length - 3} more</div>` : '');
    card.appendChild(list);
    const actions = el('div', 'card__actions');
    const run = el('button', 'btn btn--primary btn--sm', 'Run');
    run.onclick = () => { api.quick.run(qa.id); toast('Running…'); };
    const edit = el('button', 'btn btn--sm', 'Edit');
    edit.onclick = () => openQuickActionModal(qa);
    const del = el('button', 'btn btn--danger btn--sm', 'Delete');
    del.onclick = async () => { await api.quick.remove(qa.id); await refreshAll(); render(); };
    actions.appendChild(run); actions.appendChild(edit); actions.appendChild(del);
    card.appendChild(actions);
    grid.appendChild(card);
  }
  v.appendChild(grid);
  return v;
}

/** Normalize old single-target actions into the new multi-target shape. */
function qaTargets(qa) {
  if (Array.isArray(qa.targets) && qa.targets.length) return qa.targets;
  if (qa.target) return [{ action: qa.action || 'openUrl', target: qa.target }];
  return [];
}

/** Create OR edit a quick action. Pass null to create. */
function openQuickActionModal(existing) {
  const targets = existing ? qaTargets(existing).map((t) => ({ ...t })) : [{ action: 'openUrl', target: '' }];
  let hotkey = existing ? (existing.hotkey || '') : '';

  const backdrop = el('div', 'modal-backdrop');
  const modal = el('div', 'modal');
  modal.style.width = 'min(540px, 92vw)';
  modal.appendChild(el('div', 'modal__head',
    `<h2>${existing ? 'Edit quick action' : 'New quick action'}</h2>
     <p class="muted">All targets open together when the hotkey fires.</p>`));

  const body = el('div', 'modal__body');

  // Name.
  const nameRow = el('div', 'field');
  nameRow.appendChild(el('div', '', `<div class="field__label">Name</div>`));
  const nameInput = el('input', 'input');
  nameInput.placeholder = 'e.g. Morning setup';
  nameInput.value = existing ? (existing.name || '') : '';
  nameRow.appendChild(nameInput);
  body.appendChild(nameRow);

  // Hotkey (recorded, not typed).
  const hkRow = el('div', 'field');
  hkRow.appendChild(el('div', '', `<div class="field__label">Hotkey</div><div class="field__desc">One combo (Ctrl+Alt+F) or a sequence: Ctrl+O then F</div>`));
  hkRow.appendChild(hotkeyRecorder(hotkey, (v) => { hotkey = v; }));
  body.appendChild(hkRow);

  // Targets list.
  const targetsWrap = el('div', '');
  body.appendChild(el('div', 'grp', '<span>Targets</span>'));
  body.appendChild(targetsWrap);

  function renderTargets() {
    targetsWrap.innerHTML = '';
    targets.forEach((t, i) => {
      const row = el('div', 'item');
      row.style.gap = '8px';
      const type = el('select', 'input');
      type.style.minWidth = '110px';
      type.innerHTML = `<option value="openUrl">URL</option><option value="openApp">App</option>`;
      type.value = t.action;
      type.onchange = () => { t.action = type.value; input.placeholder = t.action === 'openUrl' ? 'https://…' : 'C:\\…\\app.exe'; };
      const input = el('input', 'input');
      input.style.flex = '1'; input.style.minWidth = '0';
      input.placeholder = t.action === 'openUrl' ? 'https://…' : 'C:\\…\\app.exe';
      input.value = t.target;
      input.oninput = () => { t.target = input.value; };
      const rm = el('button', 'btn btn--danger btn--sm', '✕');
      rm.onclick = () => { targets.splice(i, 1); if (!targets.length) targets.push({ action: 'openUrl', target: '' }); renderTargets(); };
      row.appendChild(type); row.appendChild(input); row.appendChild(rm);
      targetsWrap.appendChild(row);
    });
    const addBtn = el('button', 'btn btn--ghost btn--sm', '+ Add target');
    addBtn.style.marginTop = '4px';
    addBtn.onclick = () => { targets.push({ action: 'openUrl', target: '' }); renderTargets(); };
    targetsWrap.appendChild(addBtn);
  }
  renderTargets();

  modal.appendChild(body);
  const foot = el('div', 'modal__foot');
  foot.innerHTML = '<div style="flex:1"></div>';
  const cancel = el('button', 'btn btn--ghost', 'Cancel');
  cancel.onclick = () => backdrop.remove();
  const save = el('button', 'btn btn--primary', existing ? 'Save changes' : 'Save action');
  save.onclick = async () => {
    const clean = targets.filter((t) => t.target.trim()).map((t) => ({ action: t.action, target: t.target.trim() }));
    if (!clean.length) { toast('Add at least one target', true); return; }
    const r = await api.quick.save({
      id: existing ? existing.id : undefined,
      name: nameInput.value.trim() || undefined,
      hotkey,
      targets: clean,
    });
    if (!r || !r.ok) { toast((r && r.error) || 'Could not save this action', true, 6000); return; }
    backdrop.remove();
    await refreshAll(); render(); toast(existing ? 'Action updated' : 'Quick action saved');
  };
  foot.appendChild(cancel); foot.appendChild(save);
  modal.appendChild(foot);
  backdrop.appendChild(modal);
  backdrop.onclick = (e) => { if (e.target === backdrop) backdrop.remove(); };
  document.body.appendChild(backdrop);
}

// --------------------------------------------------------------------------
// Settings view
// --------------------------------------------------------------------------
function viewSettings() {
  const v = el('div', 'view');
  v.appendChild(el('div', 'page-head', `<div><h1 class="page-title">Settings</h1><p class="page-sub">Behaviour, performance and storage.</p></div>`));
  const s = state.settings;

  // Performance profile.
  const perf = el('div', 'panel');
  perf.innerHTML = `<h3>Performance profile</h3><p class="muted">Balances features against how much CPU, RAM and disk SnappingTool uses.</p>`;
  const profRow = el('div', 'field');
  const sel = el('select', 'input');
  for (const key of Object.keys(state.profiles)) {
    const o = document.createElement('option');
    o.value = key; o.textContent = state.profiles[key].label + (key === s.profile ? '' : '');
    if (key === s.profile) o.selected = true;
    sel.appendChild(o);
  }
  sel.onchange = async () => { await api.settings.save({ profile: sel.value }); await refreshAll(); pollResources(); render(); toast('Profile updated'); };
  profRow.appendChild(el('div', '', `<div class="field__label">Active profile</div><div class="field__desc">Lite = weakest machines · Full = fastest</div>`));
  profRow.appendChild(sel);
  perf.appendChild(profRow);
  v.appendChild(perf);

  // Behaviour.
  const beh = el('div', 'panel');
  beh.innerHTML = `<h3>Behaviour</h3>`;
  beh.appendChild(toggleField('Launch on startup', 'Start SnappingTool hidden in the tray when you log in.', s.launchOnStartup, (val) => saveSetting({ launchOnStartup: val })));
  beh.appendChild(toggleField('Minimize to tray on close', 'The X button hides the window instead of quitting.', s.minimizeToTrayOnClose, (val) => saveSetting({ minimizeToTrayOnClose: val })));
  beh.appendChild(toggleField('Focus mode on restore', 'Silence other-app notifications where the OS allows it.', !!s.focusMode, (val) => saveSetting({ focusMode: val })));
  // Restore on startup + pick workspace.
  const rowStartup = el('div', 'field');
  rowStartup.appendChild(el('div', '', `<div class="field__label">Restore a session at startup</div><div class="field__desc">Auto-open a chosen session ~8s after login.</div>`));
  const startWrap = el('div', 'row');
  const startSel = el('select', 'input');
  const none = document.createElement('option'); none.value = ''; none.textContent = '— none —'; startSel.appendChild(none);
  for (const snap of state.snapshots) {
    const o = document.createElement('option'); o.value = snap.id; o.textContent = snap.name;
    if (snap.id === s.startupWorkspaceId) o.selected = true;
    startSel.appendChild(o);
  }
  startSel.onchange = () => saveSetting({ startupWorkspaceId: startSel.value, restoreOnStartup: !!startSel.value });
  startWrap.appendChild(startSel);
  rowStartup.appendChild(startWrap);
  beh.appendChild(rowStartup);
  v.appendChild(beh);

  // Hotkeys.
  const hk = el('div', 'panel');
  hk.innerHTML = `<h3>Global hotkeys</h3><p class="muted">Work anywhere, even when the window is hidden. Sessions 1–9 map to Ctrl+Alt+1…9 automatically.</p>`;
  hk.appendChild(hotkeyField('Toggle dashboard', s.hotkeys.toggleDashboard, (val) => saveSetting({ hotkeys: { ...s.hotkeys, toggleDashboard: val } })));
  hk.appendChild(hotkeyField('Snap now', s.hotkeys.snapNow, (val) => saveSetting({ hotkeys: { ...s.hotkeys, snapNow: val } })));
  v.appendChild(hk);

  // Browser extension pairing.
  const br = el('div', 'panel');
  br.innerHTML = `<h3>Browser extension</h3><p class="muted">The tab bridge only accepts tabs encrypted with this pairing code. Paste it into the extension (click its toolbar icon). Keep it private — anyone with it can feed tabs to SnappingTool.</p>`;
  const brRow = el('div', 'field');
  const codeBox = el('input', 'input');
  codeBox.readOnly = true;
  codeBox.style.flex = '1';
  codeBox.style.fontFamily = 'monospace';
  codeBox.value = '…';
  brRow.appendChild(codeBox);
  const brBtns = el('div', 'row');
  const copyBtn = el('button', 'btn btn--sm', 'Copy pairing code');
  copyBtn.onclick = async () => { await api.bridge.copyCode(); toast('Pairing code copied'); };
  const regenBtn = el('button', 'btn btn--ghost btn--sm', 'New code');
  regenBtn.onclick = async () => {
    if (!confirm('Create a new pairing code? The extension will stop sending tabs until you paste the new code into it.')) return;
    const info = await api.bridge.regenerate();
    codeBox.value = info.code;
    toast('New pairing code created');
  };
  brBtns.appendChild(copyBtn); brBtns.appendChild(regenBtn);
  brRow.appendChild(brBtns);
  br.appendChild(brRow);
  api.bridge.info().then((info) => { codeBox.value = info.code; });
  v.appendChild(br);

  // Storage.
  const st = el('div', 'panel');
  st.innerHTML = `<h3>Storage</h3><p class="muted">Where sessions are saved. Move this to another drive if space is tight.</p>`;
  const stRow = el('div', 'field');
  stRow.appendChild(el('div', '', `<div class="field__label">Data folder</div><div class="field__desc">${esc(s.storageDir || 'Default (app data)')}</div>`));
  const stBtns = el('div', 'row');
  const openBtn = el('button', 'btn btn--ghost btn--sm', 'Open');
  openBtn.onclick = () => api.system.openDataDir();
  const changeBtn = el('button', 'btn btn--sm', 'Change…');
  changeBtn.onclick = async () => { const dir = await api.system.pickStorageDir(); if (dir) { await api.settings.save({ storageDir: dir }); await refreshAll(); render(); toast('Storage folder changed'); } };
  stBtns.appendChild(openBtn); stBtns.appendChild(changeBtn);
  stRow.appendChild(stBtns);
  st.appendChild(stRow);
  v.appendChild(st);

  return v;
}

function toggleField(label, desc, value, onChange) {
  const row = el('div', 'field');
  row.appendChild(el('div', '', `<div class="field__label">${esc(label)}</div><div class="field__desc">${esc(desc)}</div>`));
  const t = el('button', `toggle ${value ? 'on' : ''}`);
  t.onclick = () => { const now = !t.classList.contains('on'); t.classList.toggle('on', now); onChange(now); };
  row.appendChild(t);
  return row;
}

/**
 * Press-to-record hotkey input supporting TWO styles:
 *
 *  1. A single combo — one or more modifiers + a key (e.g. Control+Alt+Shift+F).
 *     Works as a true global shortcut (fires even when the app is hidden).
 *
 *  2. A sequential chord — press a first combo, then a second key
 *     (e.g. "Control+O then F", VS Code style). The app arms the follow-up key
 *     for ~1.5s after the leader fires.
 *
 * How to record: press your first combo (needs a modifier). To make it a
 * sequence, just press one more key right after. Press again to start over.
 * Escape clears the field.
 */
function hotkeyRecorder(value, onChange) {
  const input = el('input', 'input');
  input.value = value || '';
  input.readOnly = true;
  input.style.cursor = 'pointer';
  input.placeholder = 'Click here, then press keys';

  const MOD_KEYS = ['Control', 'Alt', 'Shift', 'Meta', 'AltGraph', 'CapsLock'];
  // stage: 0 = empty, 1 = have a single combo, 2 = full chord (leader + follow)
  let stage = value ? (/\s+then\s+/i.test(value) ? 2 : 1) : 0;
  let leader = value ? value.split(/\s+then\s+/i)[0] : '';

  input.onfocus = () => { input.placeholder = 'Press a combo… (then a 2nd key for a sequence)'; };
  input.onblur = () => { input.placeholder = 'Click here, then press keys'; };

  input.onkeydown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') { stage = 0; leader = ''; input.value = ''; onChange(''); return; }

    const held = [];
    if (e.ctrlKey) held.push('Control');
    if (e.altKey) held.push('Alt');
    if (e.shiftKey) held.push('Shift');
    if (e.metaKey) held.push('Super');

    if (MOD_KEYS.includes(e.key)) {
      if (stage === 0) input.value = held.length ? held.join('+') + '+…' : '…';
      return;
    }

    let key = e.key;
    if (key === ' ') key = 'Space';
    else if (key.length === 1) key = key.toUpperCase();
    key = key.replace(/^Arrow/, '');

    if (stage === 0 || stage === 2) {
      // Start a fresh combo. A leader needs a modifier to be global-registerable.
      if (!held.length) {
        toast('Start with a modifier: e.g. Ctrl+Alt+F, or Ctrl+O then F for a sequence.', true);
        return;
      }
      leader = [...held, key].join('+');
      input.value = leader;
      onChange(leader);
      stage = 1;
    } else if (stage === 1) {
      // Second press → turn it into a sequential chord. Follow key can be bare.
      const combo = `${leader} then ${key}`;
      input.value = combo;
      onChange(combo);
      stage = 2;
    }
  };
  return input;
}

function hotkeyField(label, value, onChange) {
  const row = el('div', 'field');
  row.appendChild(el('div', '', `<div class="field__label">${esc(label)}</div><div class="field__desc">One combo (Ctrl+Alt+F) or a sequence — press Ctrl+O then F</div>`));
  row.appendChild(hotkeyRecorder(value, onChange));
  return row;
}

async function saveSetting(patch) {
  await api.settings.save(patch);
  await refreshAll();
  toast('Saved');
}

// --------------------------------------------------------------------------
// Shared UI helpers
// --------------------------------------------------------------------------
function emptyBlock(title, text, btnLabel, onClick, emoji) {
  const e = el('div', 'empty');
  e.innerHTML = `<span class="emoji">${emoji || '✨'}</span><h3>${esc(title)}</h3><p>${esc(text)}</p>`;
  const b = el('button', 'btn btn--primary', btnLabel);
  b.onclick = onClick;
  e.appendChild(b);
  return e;
}

let toastTimer = null;
function toast(msg, isErr, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `toast ${isErr ? 'err' : ''}`;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

let restoreSafetyTimer = null;
function showRestore(name) {
  $('#restore-title').textContent = 'Restoring session';
  $('#restore-sub').textContent = name || '';
  $('#restore-bar').style.width = '0%';
  $('#restore-overlay').hidden = false;
  // Safety net: if the main process never reports back (e.g. a stuck
  // external process), force-close after 25s instead of hanging forever.
  clearTimeout(restoreSafetyTimer);
  restoreSafetyTimer = setTimeout(() => {
    $('#restore-overlay').hidden = true;
    toast('Restore is taking too long and was stopped. Check the app for what actually opened.', true);
  }, 25000);
}
function updateRestore(p) {
  const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
  $('#restore-bar').style.width = `${pct}%`;
  $('#restore-sub').textContent = p.label || '';
}
function hideRestore(p) {
  clearTimeout(restoreSafetyTimer);
  $('#restore-bar').style.width = '100%';
  setTimeout(async () => {
    $('#restore-overlay').hidden = true;
    if (p && p.ok === false) {
      toast(`Restore failed: ${p.error || 'unknown error'}`, true);
    } else {
      toast('Session restored');
    }
    await refreshAll();
  }, 500);
}

boot();
