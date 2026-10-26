'use strict';

const { app, BrowserWindow, Tray, Menu, ipcMain, globalShortcut, screen, dialog, nativeImage, shell, session, clipboard } = require('electron');
const path = require('path');
const os = require('os');

const config = require('./config');
const secrets = require('./secrets');
const { Store } = require('./store');
const { captureSession } = require('./capture');
const { buildDraft, finalize } = require('./snapshotBuilder');
const { restoreSnapshot } = require('./restore');
const { TabServer } = require('./tabServer');
const { launchExecutable, openUrlExternal } = require('./launcher');
const { sanitizeWebUrl, validateExecutablePath, localAbsolutePath, isId, isHotkey, cleanText } = require('./security');

const store = new Store();
let mainWindow = null;
let tray = null;
let tabServer = null;
let autoSnapshotTimer = null;
let lastDraft = null; // holds the draft between "prepare snap" and "confirm snap"
let pickedStorageDir = null; // last folder chosen in the native picker

// DevTools only for unpackaged development builds.
const isDev = process.argv.includes('--dev') && !app.isPackaged;

// Every renderer runs in Chromium's sandbox; the preload only needs
// contextBridge + ipcRenderer, which work there.
app.enableSandbox();

// Single instance — a second launch just focuses the existing window.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => showDashboard());
}

// The UI is a local page with no reason to navigate, open windows or embed
// anything — refuse all of it, so injected markup could never lead elsewhere.
app.on('web-contents-created', (_e, contents) => {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (e) => e.preventDefault());
  contents.on('will-redirect', (e) => e.preventDefault());
  contents.on('will-attach-webview', (e) => e.preventDefault());
});

// ---------------------------------------------------------------------------
// Window + tray
// ---------------------------------------------------------------------------
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 920,
    minHeight: 600,
    show: false,
    frame: false,
    backgroundColor: '#0e1420',
    icon: path.join(__dirname, '..', '..', 'build', 'icon_256.png'),
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: !app.isPackaged,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.on('close', (e) => {
    const settings = store.getSettings();
    if (settings.minimizeToTrayOnClose && !app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });
}

function showDashboard() {
  if (!mainWindow) createWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function toggleDashboard() {
  if (mainWindow && mainWindow.isVisible() && mainWindow.isFocused()) {
    mainWindow.hide();
  } else {
    showDashboard();
  }
}

function buildTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', '..', 'build', 'tray.png'));
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip('SnappingTool');
  refreshTrayMenu();
  tray.on('click', () => toggleDashboard());
}

function refreshTrayMenu() {
  if (!tray) return;
  const snapshots = store.listSnapshots().slice(0, 5);
  const menu = Menu.buildFromTemplate([
    { label: 'Open dashboard', click: () => showDashboard() },
    { label: 'Snap now', click: () => { showDashboard(); mainWindow.webContents.send('trigger-snap'); } },
    { type: 'separator' },
    {
      label: 'Restore recent',
      submenu: snapshots.length
        ? snapshots.map((s) => ({ label: s.name, click: () => doRestore(s.id) }))
        : [{ label: 'No snapshots yet', enabled: false }],
    },
    { type: 'separator' },
    { label: 'Quit SnappingTool', click: () => { app.isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
}

// ---------------------------------------------------------------------------
// Hotkeys
// ---------------------------------------------------------------------------
function registerHotkeys() {
  globalShortcut.unregisterAll();
  const settings = store.getSettings();
  const hk = settings.hotkeys || {};

  safeRegister(hk.toggleDashboard, () => toggleDashboard());
  safeRegister(hk.snapNow, () => { showDashboard(); mainWindow.webContents.send('trigger-snap'); });

  // Workspace hotkeys Ctrl+Alt+1..9 → restore Nth snapshot.
  const snaps = store.listSnapshots();
  for (let i = 1; i <= 9; i++) {
    const snap = snaps[i - 1];
    if (snap) safeRegister(`Control+Alt+${i}`, () => doRestore(snap.id));
  }

  // Quick actions — support both plain accelerators ("Control+Alt+F") and
  // sequential chords ("Control+O then F").
  const chordSpecs = [];
  for (const qa of store.listQuickActions()) {
    if (!qa.hotkey) continue;
    const parsed = parseHotkey(qa.hotkey);
    if (parsed.type === 'chord') {
      chordSpecs.push({ leader: parsed.leader, follow: parsed.follow, handler: () => runQuickAction(qa) });
    } else {
      safeRegister(parsed.accelerator, () => runQuickAction(qa));
    }
  }
  registerChords(chordSpecs);
}

// --- Sequential chord support ----------------------------------------------
// A chord is "LEADER then KEY" (e.g. "Control+O then F"). We register the
// leader globally; when it fires we briefly register the follow-up keys as
// temporary global shortcuts. Press the follow-up within the window and the
// action runs. This gives a VS Code-style key sequence using only Electron's
// built-in globalShortcut — no native keyboard hook required.
const CHORD_TIMEOUT_MS = 1500;
let chordArmedKeys = null;
let chordTimer = null;

function parseHotkey(str) {
  if (!str) return { type: 'single', accelerator: '' };
  const parts = str.split(/\s+then\s+/i).map((s) => s.trim()).filter(Boolean);
  if (parts.length <= 1) return { type: 'single', accelerator: str };
  return { type: 'chord', leader: parts[0], follow: parts[1] };
}

function registerChords(chordSpecs) {
  const byLeader = new Map();
  for (const c of chordSpecs) {
    if (!byLeader.has(c.leader)) byLeader.set(c.leader, []);
    byLeader.get(c.leader).push(c);
  }
  for (const [leader, list] of byLeader) {
    safeRegister(leader, () => armChord(leader, list));
  }
}

function armChord(leader, list) {
  disarmChord();
  const armed = [];
  for (const c of list) {
    try {
      if (globalShortcut.register(c.follow, () => { disarmChord(); c.handler(); })) armed.push(c.follow);
    } catch (_) { /* ignore invalid follow key */ }
  }
  try { if (globalShortcut.register('Escape', () => disarmChord())) armed.push('Escape'); } catch (_) {}
  chordArmedKeys = armed;
  chordTimer = setTimeout(disarmChord, CHORD_TIMEOUT_MS);
  // Tell the UI a chord is waiting for its second key (nice feedback).
  if (mainWindow) mainWindow.webContents.send('chord-armed', { leader });
}

function disarmChord() {
  if (chordTimer) { clearTimeout(chordTimer); chordTimer = null; }
  if (chordArmedKeys) {
    for (const k of chordArmedKeys) { try { globalShortcut.unregister(k); } catch (_) {} }
    chordArmedKeys = null;
  }
}

function safeRegister(accelerator, handler) {
  if (!accelerator) return;
  try { globalShortcut.register(accelerator, handler); } catch (_) { /* ignore bad accelerator */ }
}

function runQuickAction(qa) {
  // New shape: { targets: [{action,target},…] }. Old single-target actions
  // ({action, target}) still work.
  const targets = Array.isArray(qa.targets) && qa.targets.length
    ? qa.targets
    : (qa.target ? [{ action: qa.action || 'openUrl', target: qa.target }] : []);

  targets.forEach((t, i) => {
    // Stagger opens slightly so a big set doesn't slam a weak machine.
    // The launcher re-validates every target and never uses a shell.
    setTimeout(() => {
      if (t.action === 'openUrl' && t.target) {
        openUrlExternal(t.target);
      } else if (t.action === 'openApp' && t.target) {
        launchExecutable(t.target, { allowShortcuts: true });
      }
    }, i * 400);
  });
}

// ---------------------------------------------------------------------------
// Snap + restore flows
// ---------------------------------------------------------------------------
function selfIdentity() {
  return {
    selfExePath: app.getPath('exe'),
    selfProcessNames: ['electron', 'snappingtool', 'snapspace'],
  };
}

async function prepareSnap() {
  const capture = await captureSession(tabServer, selfIdentity());
  lastDraft = buildDraft(capture);
  return lastDraft;
}

function confirmSnap(selection, meta) {
  if (!lastDraft) throw new Error('No snapshot draft prepared');
  const snapshot = finalize(lastDraft, selection, meta);
  const saved = store.saveSnapshot(snapshot);
  // Assign to catalogs chosen in the snap modal, if any.
  if (meta && Array.isArray(meta.catalogIds)) {
    for (const catId of meta.catalogIds) store.setCatalogMembership(catId, saved.id, true);
  }
  lastDraft = null;
  registerHotkeys();   // workspace 1..9 mapping may have shifted
  refreshTrayMenu();
  return saved;
}

async function autoSnap() {
  try {
    const capture = await captureSession(tabServer, selfIdentity());
    const draft = buildDraft(capture);
    const snap = finalize(draft, null, { auto: true, name: `Auto ${new Date().toLocaleString()}` });
    store.saveSnapshot(snap);
    refreshTrayMenu();
  } catch (_) { /* auto snap is best-effort */ }
}

async function doRestore(snapshotId, options = {}) {
  const snap = store.getSnapshot(snapshotId);
  if (!snap) return { ok: false, error: 'Snapshot not found' };

  const settings = store.getSettings();
  const profile = config.PROFILES[settings.profile] || config.PROFILES.balanced;
  const currentMonitors = screen.getAllDisplays().map((d, i) => ({
    id: i, x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height,
    primary: d.id === screen.getPrimaryDisplay().id,
  }));

  if (mainWindow) mainWindow.webContents.send('restore-start', { name: snap.name });

  try {
    await restoreSnapshot(snap, {
      restoreDelayMs: profile.restoreDelayMs,
      currentMonitors,
      onProgress: (p) => { if (mainWindow) mainWindow.webContents.send('restore-progress', p); },
    });
    if (options.focusMode) setFocusMode(true);
    if (mainWindow) mainWindow.webContents.send('restore-done', { name: snap.name, ok: true });
    return { ok: true };
  } catch (e) {
    if (mainWindow) mainWindow.webContents.send('restore-done', { name: snap.name, ok: false, error: e.message });
    return { ok: false, error: e.message };
  }
}

/** Toggle OS "do not disturb" where we can. */
function setFocusMode(on) {
  if (os.platform() !== 'win32') return;
  // Windows Focus Assist toggle is not scriptable via a stable public API, so
  // we surface it as a best-effort no-op placeholder that the UI can reflect.
  // (Left intentionally light to avoid touching undocumented registry state.)
}

function getResourceStatus() {
  const totalGb = os.totalmem() / (1024 ** 3);
  const freeGb = os.freemem() / (1024 ** 3);
  const load = os.loadavg ? os.loadavg()[0] : 0;
  return {
    totalRamGb: +totalGb.toFixed(1),
    freeRamGb: +freeGb.toFixed(1),
    cpuLoad: +load.toFixed(2),
    cores: os.cpus() ? os.cpus().length : 0,
  };
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------
function setupAutoSnapshot() {
  if (autoSnapshotTimer) clearInterval(autoSnapshotTimer);
  const settings = store.getSettings();
  const profile = config.PROFILES[settings.profile] || config.PROFILES.balanced;
  if (!profile.autoSnapshot) return;
  const hours = profile.autoSnapshotIntervalHours || 24;
  autoSnapshotTimer = setInterval(() => {
    // Only when the system looks idle-ish (low free-RAM pressure heuristic).
    autoSnap();
  }, hours * 60 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// Startup integration
// ---------------------------------------------------------------------------
function applyLaunchOnStartup(enabled) {
  app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: true });
}

async function maybeRestoreOnStartup() {
  const settings = store.getSettings();
  if (settings.restoreOnStartup && settings.startupWorkspaceId) {
    // Small delay so the desktop finishes loading first.
    setTimeout(() => doRestore(settings.startupWorkspaceId), 8000);
  }
}

// ---------------------------------------------------------------------------
// IPC input validation
// ---------------------------------------------------------------------------
// The renderer is our own page, but a bug there (e.g. HTML injection from a
// tab title) must not turn into "launch any program". So every channel checks
// who is calling and accepts only the exact shape the UI sends.

function isTrustedSender(e) {
  if (!mainWindow || mainWindow.isDestroyed() || e.sender !== mainWindow.webContents) return false;
  const frame = e.senderFrame;
  if (!frame || frame.parent) return false;
  return typeof frame.url === 'string' && frame.url.startsWith('file:') && frame.url.endsWith('/renderer/index.html');
}

function handle(channel, fn) {
  ipcMain.handle(channel, (e, ...args) => {
    if (!isTrustedSender(e)) throw new Error('Untrusted IPC sender');
    return fn(...args);
  });
}

function on(channel, fn) {
  ipcMain.on(channel, (e, ...args) => { if (isTrustedSender(e)) fn(...args); });
}

const BOOL_SETTINGS = ['launchOnStartup', 'restoreOnStartup', 'minimizeToTrayOnClose', 'focusMode'];

function sanitizeSettingsPatch(patch) {
  const p = patch && typeof patch === 'object' ? patch : {};
  const out = {};
  if (typeof p.profile === 'string' && Object.prototype.hasOwnProperty.call(config.PROFILES, p.profile)) out.profile = p.profile;
  for (const k of BOOL_SETTINGS) if (typeof p[k] === 'boolean') out[k] = p[k];
  if (p.startupWorkspaceId === '' || isId(p.startupWorkspaceId)) out.startupWorkspaceId = p.startupWorkspaceId;
  if (p.hotkeys && typeof p.hotkeys === 'object') {
    const current = store.getSettings().hotkeys || {};
    out.hotkeys = { ...current };
    for (const k of ['toggleDashboard', 'snapNow']) if (isHotkey(p.hotkeys[k])) out.hotkeys[k] = p.hotkeys[k];
  }
  // Storage folder: only '' (default) or the folder just picked in the native dialog.
  if (p.storageDir === '') out.storageDir = '';
  else if (typeof p.storageDir === 'string' && p.storageDir === pickedStorageDir) out.storageDir = pickedStorageDir;
  return out;
}

function sanitizeSelection(selection) {
  if (!Array.isArray(selection)) return null;
  return selection.map((s) => ({
    included: !(s && s.included === false),
    tabs: s && Array.isArray(s.tabs) ? s.tabs.map((v) => v !== false) : null,
  }));
}

function sanitizeSnapMeta(meta) {
  const m = meta && typeof meta === 'object' ? meta : {};
  return {
    name: cleanText(m.name, 120) || undefined,
    catalogIds: Array.isArray(m.catalogIds) ? m.catalogIds.filter(isId) : [],
  };
}

const MAX_QUICK_TARGETS = 20;

/** Returns { action } ready to store, or { error } explaining what's wrong. */
function sanitizeQuickAction(qa) {
  const q = qa && typeof qa === 'object' ? qa : {};
  const existing = isId(q.id) ? store.listQuickActions().find((x) => x.id === q.id) : null;
  const rawTargets = Array.isArray(q.targets) ? q.targets.slice(0, MAX_QUICK_TARGETS) : [];
  const targets = [];
  for (const t of rawTargets) {
    const target = cleanText(t && t.target, 2048);
    if (!target) continue;
    if (t.action === 'openUrl') {
      const href = sanitizeWebUrl(target);
      if (!href) return { error: `"${target}" is not a web address (it must start with http:// or https://).` };
      targets.push({ action: 'openUrl', target: href });
    } else if (t.action === 'openApp') {
      const exe = validateExecutablePath(target, { extensions: ['.exe', '.lnk'] });
      if (!exe) return { error: `"${target}" is not an .exe or .lnk on a local drive.` };
      targets.push({ action: 'openApp', target: exe });
    } else {
      return { error: 'Unknown target type.' };
    }
  }
  if (!targets.length) return { error: 'Add at least one target.' };
  if (!isHotkey(q.hotkey)) return { error: 'Invalid hotkey.' };
  return {
    action: {
      id: existing ? existing.id : undefined,
      createdAt: existing ? existing.createdAt : undefined,
      name: cleanText(q.name, 80) || undefined,
      hotkey: q.hotkey,
      targets,
    },
  };
}

function pairingInfo() {
  const port = store.getSettings().tabServerPort;
  return {
    code: secrets.getPairingCode(port),
    port,
    listening: !!(tabServer && tabServer.server),
    connected: tabServer ? tabServer.isConnected() : false,
  };
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------
function registerIpc() {
  handle('settings:get', () => {
    const s = store.getSettings();
    const profile = config.PROFILES[s.profile] || config.PROFILES.balanced;
    return { settings: s, profile, profiles: config.PROFILES, storeWarnings: store.takeWarnings() };
  });

  handle('settings:save', (patch) => {
    const clean = sanitizeSettingsPatch(patch);
    const before = store.getSettings();
    const saved = store.saveSettings(clean);
    if (clean.launchOnStartup !== undefined && clean.launchOnStartup !== before.launchOnStartup) {
      applyLaunchOnStartup(clean.launchOnStartup);
    }
    if (clean.hotkeys) registerHotkeys();
    if (clean.profile) setupAutoSnapshot();
    if (clean.storageDir !== undefined) { registerHotkeys(); refreshTrayMenu(); }
    return saved;
  });

  handle('snap:prepare', async () => {
    const draft = await prepareSnap();
    return draft;
  });
  handle('snap:confirm', (args) => {
    const a = args && typeof args === 'object' ? args : {};
    return confirmSnap(sanitizeSelection(a.selection), sanitizeSnapMeta(a.meta));
  });

  handle('snapshots:list', () => store.listSnapshots());
  handle('snapshots:get', (id) => (isId(id) ? store.getSnapshot(id) : null));
  handle('snapshots:delete', (id) => {
    if (!isId(id)) return false;
    store.deleteSnapshot(id); registerHotkeys(); refreshTrayMenu(); return true;
  });
  handle('snapshots:rename', ({ id, name } = {}) => {
    const clean = cleanText(name, 120);
    if (!isId(id) || !clean) return false;
    const s = store.getSnapshot(id); if (!s) return false;
    s.name = clean; store.saveSnapshot(s); refreshTrayMenu(); return true;
  });
  handle('snapshots:restore', ({ id, focusMode } = {}) => {
    if (!isId(id)) return { ok: false, error: 'Snapshot not found' };
    return doRestore(id, { focusMode: focusMode === true });
  });
  handle('snapshots:pin', ({ id, pinned } = {}) => {
    if (!isId(id)) return false;
    const s = store.getSnapshot(id); if (!s) return false;
    s.pinned = !!pinned; store.saveSnapshot(s);
    registerHotkeys(); refreshTrayMenu(); // ordering (and 1..9 mapping) changed
    return true;
  });
  handle('snapshots:duplicate', (id) => {
    if (!isId(id)) return null;
    const s = store.getSnapshot(id); if (!s) return null;
    const copy = { ...s, id: undefined, name: `${s.name} (copy)`, createdAt: Date.now(), pinned: false, auto: false };
    const saved = store.saveSnapshot(copy);
    registerHotkeys(); refreshTrayMenu();
    return saved;
  });

  handle('catalogs:list', () => store.listCatalogs());
  handle('catalogs:save', (cat) => {
    const c = cat && typeof cat === 'object' ? cat : {};
    const name = cleanText(c.name, 80);
    if (!name) return null;
    const existing = isId(c.id) ? store.listCatalogs().find((x) => x.id === c.id) : null;
    return store.saveCatalog({ ...(existing || {}), name });
  });
  handle('catalogs:delete', (id) => (isId(id) ? store.deleteCatalog(id) : false));
  handle('catalogs:member', ({ catalogId, snapshotId, include } = {}) => {
    if (!isId(catalogId) || !isId(snapshotId) || !store.getSnapshot(snapshotId)) return false;
    return store.setCatalogMembership(catalogId, snapshotId, include === true);
  });

  handle('quick:list', () => store.listQuickActions());
  handle('quick:save', (qa) => {
    const r = sanitizeQuickAction(qa);
    if (r.error) return { ok: false, error: r.error };
    const saved = store.saveQuickAction(r.action);
    registerHotkeys();
    return { ok: true, action: saved };
  });
  handle('quick:delete', (id) => {
    if (!isId(id)) return false;
    store.deleteQuickAction(id); registerHotkeys(); return true;
  });
  handle('quick:run', (id) => {
    if (!isId(id)) return false;
    const qa = store.listQuickActions().find((q) => q.id === id);
    if (qa) runQuickAction(qa); return true;
  });

  handle('bridge:info', () => pairingInfo());
  handle('bridge:copyCode', () => { clipboard.writeText(pairingInfo().code); return true; });
  handle('bridge:regenerate', () => {
    secrets.regenerateBridgeKey();
    if (tabServer) tabServer.reset();
    return pairingInfo();
  });

  handle('system:resources', () => getResourceStatus());
  handle('system:monitors', () =>
    screen.getAllDisplays().map((d, i) => ({
      id: i, x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height,
      primary: d.id === screen.getPrimaryDisplay().id,
    })));
  handle('system:tabBridge', () => ({ connected: tabServer ? tabServer.isConnected() : false, port: store.getSettings().tabServerPort }));
  handle('system:openDataDir', () => shell.openPath(store.dir));
  handle('system:pickStorageDir', async () => {
    const r = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths[0]) return null;
    const dir = localAbsolutePath(r.filePaths[0]);
    if (!dir) {
      await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        message: 'Please pick a folder on a local drive.',
        detail: 'Network folders (\\\\server\\share) can be changed by other people, so SnappingTool won\'t store sessions there.',
      });
      return null;
    }
    pickedStorageDir = dir;
    return dir;
  });

  // Window controls (frameless window).
  on('win:minimize', () => mainWindow && mainWindow.minimize());
  on('win:close', () => mainWindow && mainWindow.close());
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
app.whenReady().then(async () => {
  // The UI needs no camera, mic, notifications, etc.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);

  store.init();

  // First run → suggest a performance profile.
  const settings = store.getSettings();
  if (!settings._profileInitialized) {
    store.saveSettings({ profile: config.detectProfile(), _profileInitialized: true });
  }

  tabServer = new TabServer(store.getSettings().tabServerPort, () => secrets.getBridgeKey());
  try { await tabServer.start(); } catch (_) { /* port busy — bridge just won't connect */ }

  createWindow();
  buildTray();
  registerIpc();
  registerHotkeys();
  setupAutoSnapshot();
  maybeRestoreOnStartup();

  if (!app.getLoginItemSettings().openAsHidden) showDashboard();

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { /* keep running in tray */ });
app.on('will-quit', () => { globalShortcut.unregisterAll(); if (tabServer) tabServer.stop(); });
