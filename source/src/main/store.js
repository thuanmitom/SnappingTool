'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');
const secrets = require('./secrets');

/**
 * Lightweight JSON store. We deliberately avoid native SQLite bindings so that
 * `npm install` never needs a C++ toolchain — this keeps setup friction near
 * zero for people cloning from GitHub. Data volume here is tiny (config-like),
 * so JSON is more than fast enough.
 *
 * Files live under the storage dir:
 *   snapshots.json    — { [id]: snapshot }
 *   catalogs.json     — { [id]: catalog }
 *   quickActions.json — { [id]: quickAction }
 * and settings.json lives in userData.
 *
 * Snapshots and quick actions say which programs to launch, and the storage
 * dir can be moved anywhere — so those files are sealed (AES-256-GCM, key in
 * ./secrets). A file that wasn't written by this app for this user — edited,
 * copied in from elsewhere, or dropped into a shared folder — fails to open,
 * is set aside as *.rejected-<time> and ignored. Sealing also keeps tab URLs
 * (which can carry login tokens) unreadable on disk.
 */

const KINDS = ['snapshots', 'catalogs', 'quickActions'];

function uid(prefix) {
  return `${prefix || 'id'}_${crypto.randomBytes(6).toString('hex')}`;
}

function readJson(file, fallback) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

function writeJsonAtomic(file, data) {
  // Write to a temp file then rename — avoids a corrupt file if the app is
  // killed mid-write.
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

/** Build a { [id]: value } map that can't be hijacked through "__proto__" keys. */
function toMap(obj) {
  const out = Object.create(null);
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj)) if (v && typeof v === 'object') out[k] = v;
  }
  return out;
}

class Store {
  constructor() {
    this.settings = null;
    this.dir = null;
    this.files = {};
    this.warnings = [];
    this._allowLegacy = false;
  }

  init() {
    // Load settings first (may point storage elsewhere).
    const userDataDir = config.ensureDir(config.getDataDir());
    const settingsFile = path.join(userDataDir, 'settings.json');
    this.settings = { ...config.DEFAULT_SETTINGS, ...readJson(settingsFile, {}) };
    this._settingsFile = settingsFile;
    this._pointFiles();
    this._migrateToSealed();
    return this;
  }

  _pointFiles() {
    this.dir = config.getStorageDir(this.settings);
    this.files = {
      snapshots: path.join(this.dir, 'snapshots.json'),
      catalogs: path.join(this.dir, 'catalogs.json'),
      quickActions: path.join(this.dir, 'quickActions.json'),
    };
  }

  /**
   * One-time upgrade from the old plain-JSON files. Plain JSON is accepted
   * only during this step; afterwards only sealed files are trusted.
   */
  _migrateToSealed() {
    if (this.settings.sealedStorage) return;
    this._allowLegacy = true;
    try {
      for (const kind of KINDS) {
        if (fs.existsSync(this.files[kind])) this._write(kind, this._read(kind));
      }
    } finally {
      this._allowLegacy = false;
    }
    this.saveSettings({ sealedStorage: true });
  }

  _read(kind) {
    const file = this.files[kind];
    let raw;
    try { raw = fs.readFileSync(file, 'utf8'); } catch (_) { return toMap(null); } // missing = empty
    let parsed;
    try { parsed = JSON.parse(raw); } catch (_) { return this._quarantine(kind, 'is not valid JSON'); }

    if (secrets.isSealed(parsed)) {
      try { return toMap(secrets.unseal(parsed, kind)); } catch (_) {
        return this._quarantine(kind, 'was modified or sealed by another user/PC');
      }
    }
    if (this._allowLegacy) return toMap(parsed);
    return this._quarantine(kind, 'was not written by SnappingTool');
  }

  _write(kind, data) {
    writeJsonAtomic(this.files[kind], secrets.seal({ ...data }, kind));
  }

  /** Move an untrusted file out of the way (never overwrite it) and remember why. */
  _quarantine(kind, why) {
    const file = this.files[kind];
    const dest = `${file}.rejected-${Date.now()}`;
    try { fs.renameSync(file, dest); } catch (_) { /* ignore */ }
    this.warnings.push(`${path.basename(file)} ${why}, so it was ignored and set aside as ${path.basename(dest)}.`);
    return toMap(null);
  }

  /** Warnings collected since the last call (shown once in the UI). */
  takeWarnings() {
    const w = this.warnings;
    this.warnings = [];
    return w;
  }

  // ---- Settings ---------------------------------------------------------
  getSettings() {
    return { ...this.settings };
  }

  saveSettings(patch) {
    this.settings = { ...this.settings, ...patch };
    writeJsonAtomic(this._settingsFile, this.settings);
    // Storage dir may have changed.
    this._pointFiles();
    return this.getSettings();
  }

  // ---- Snapshots --------------------------------------------------------
  listSnapshots() {
    const all = this._read('snapshots');
    // Pinned first, then newest. This ordering also drives the Ctrl+Alt+1..9
    // hotkey mapping, so pinning a session gives it a stable low number.
    return Object.values(all).sort((a, b) =>
      ((b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)) || ((b.createdAt || 0) - (a.createdAt || 0)));
  }

  getSnapshot(id) {
    const all = this._read('snapshots');
    return all[id] || null;
  }

  saveSnapshot(snapshot) {
    const all = this._read('snapshots');
    if (!snapshot.id) snapshot.id = uid('snap');
    if (!snapshot.createdAt) snapshot.createdAt = Date.now();
    all[snapshot.id] = snapshot;
    this._write('snapshots', all);
    this._enforceRetention(all);
    return snapshot;
  }

  deleteSnapshot(id) {
    const all = this._read('snapshots');
    delete all[id];
    this._write('snapshots', all);
    // Detach from any catalog it belonged to.
    const catalogs = this._read('catalogs');
    let changed = false;
    for (const c of Object.values(catalogs)) {
      const before = c.snapshotIds.length;
      c.snapshotIds = c.snapshotIds.filter((s) => s !== id);
      if (c.snapshotIds.length !== before) changed = true;
    }
    if (changed) this._write('catalogs', catalogs);
    return true;
  }

  /** Keep only the newest N auto-snapshots when a profile caps the count. */
  _enforceRetention(all) {
    const profile = config.PROFILES[this.settings.profile] || config.PROFILES.balanced;
    const max = profile.maxSnapshots;
    if (!max || max <= 0) return; // unlimited
    // Only auto-created snapshots are pruned; manual ones are always kept.
    const auto = Object.values(all)
      .filter((s) => s.auto)
      .sort((a, b) => b.createdAt - a.createdAt);
    if (auto.length <= max) return;
    for (const old of auto.slice(max)) delete all[old.id];
    this._write('snapshots', all);
  }

  // ---- Catalogs ---------------------------------------------------------
  listCatalogs() {
    const all = this._read('catalogs');
    return Object.values(all).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  }

  saveCatalog(catalog) {
    const all = this._read('catalogs');
    if (!catalog.id) catalog.id = uid('cat');
    if (!catalog.createdAt) catalog.createdAt = Date.now();
    if (!Array.isArray(catalog.snapshotIds)) catalog.snapshotIds = [];
    all[catalog.id] = catalog;
    this._write('catalogs', all);
    return catalog;
  }

  deleteCatalog(id) {
    const all = this._read('catalogs');
    delete all[id];
    this._write('catalogs', all);
    return true;
  }

  setCatalogMembership(catalogId, snapshotId, include) {
    const all = this._read('catalogs');
    const cat = all[catalogId];
    if (!cat) return false;
    const set = new Set(cat.snapshotIds);
    if (include) set.add(snapshotId); else set.delete(snapshotId);
    cat.snapshotIds = [...set];
    this._write('catalogs', all);
    return true;
  }

  // ---- Quick actions ----------------------------------------------------
  listQuickActions() {
    const all = this._read('quickActions');
    return Object.values(all).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  }

  saveQuickAction(action) {
    const all = this._read('quickActions');
    if (!action.id) action.id = uid('qa');
    if (!action.createdAt) action.createdAt = Date.now();
    all[action.id] = action;
    this._write('quickActions', all);
    return action;
  }

  deleteQuickAction(id) {
    const all = this._read('quickActions');
    delete all[id];
    this._write('quickActions', all);
    return true;
  }
}

module.exports = { Store, uid };
