'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const { localAbsolutePath } = require('./security');

/**
 * Central configuration and adaptive performance profiling.
 *
 * We keep all filesystem paths in one place so storage location is easy to
 * change (see settings.storageDir override) and easy to reason about.
 */

const PROFILES = {
  lite: {
    id: 'lite',
    label: 'Lite',
    autoSnapshot: false,
    thumbnails: false,          // schematic vector preview only
    maxSnapshots: 5,
    restoreDelayMs: 1500,       // longer stagger so weak machines cope
  },
  balanced: {
    id: 'balanced',
    label: 'Balanced',
    autoSnapshot: true,
    autoSnapshotIntervalHours: 24,
    thumbnails: true,
    maxSnapshots: 20,
    restoreDelayMs: 800,
  },
  full: {
    id: 'full',
    label: 'Full',
    autoSnapshot: true,
    autoSnapshotIntervalHours: 6,
    thumbnails: true,
    maxSnapshots: 0,            // 0 = unlimited (disk-bound only)
    restoreDelayMs: 400,
  },
};

/** Suggest a profile from the machine's specs. Never forced — only a default. */
function detectProfile() {
  const totalRamGb = os.totalmem() / (1024 ** 3);
  const cores = os.cpus() ? os.cpus().length : 2;

  let freeDiskGb = Infinity;
  try {
    // Best-effort; not all platforms expose this cheaply, so guard it.
    const stat = fs.statfsSync ? fs.statfsSync(getDataDir()) : null;
    if (stat) freeDiskGb = (stat.bavail * stat.bsize) / (1024 ** 3);
  } catch (_) { /* ignore — treat disk as non-constraining */ }

  if (totalRamGb <= 4 || cores <= 2 || freeDiskGb < 2) return 'lite';
  if (totalRamGb <= 8) return 'balanced';
  return 'full';
}

function getDataDir() {
  // userData is per-user and writable on every OS.
  const base = app ? app.getPath('userData') : path.join(os.homedir(), '.snappingtool');
  return base;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Resolve the active storage directory, honouring a user override.
 * Only a plain local folder is accepted — a network share (\\server\…) falls
 * back to the default, so session data is never read from someone else's box.
 */
function getStorageDir(settings) {
  const override = settings && typeof settings.storageDir === 'string' ? settings.storageDir.trim() : '';
  const dir = (override && localAbsolutePath(override)) || path.join(getDataDir(), 'data');
  return ensureDir(dir);
}

const DEFAULT_SETTINGS = {
  profile: 'balanced',
  theme: 'dark',
  storageDir: '',                 // empty = default under userData
  launchOnStartup: false,
  restoreOnStartup: false,        // auto-restore a chosen workspace at boot
  startupWorkspaceId: '',
  minimizeToTrayOnClose: true,
  tabServerPort: 47615,           // localhost bridge for the browser extension
  sealedStorage: false,           // set once data files are migrated to the sealed format
  hotkeys: {
    toggleDashboard: 'Control+Alt+Space',
    snapNow: 'Control+Alt+S',
  },
  // Per-profile knobs get merged from PROFILES at load time.
};

module.exports = {
  PROFILES,
  DEFAULT_SETTINGS,
  detectProfile,
  getDataDir,
  getStorageDir,
  ensureDir,
};
