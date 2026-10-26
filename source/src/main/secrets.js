'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { safeStorage } = require('electron');
const config = require('./config');

/**
 * Per-user secrets:
 *   dataKey   — seals snapshots / catalogs / quick actions on disk (AES-256-GCM)
 *   bridgeKey — encrypts tab data between the browser extension and the app
 *
 * They live in userData (never in the movable storage folder) and are wrapped
 * with the OS keychain via Electron safeStorage — DPAPI on Windows — so
 * another account on the PC, or a copy of the disk, can't read them.
 *
 * Call only after app 'ready' (safeStorage needs it).
 */

const KEYSTORE_FILE = 'keystore.json';
const SEAL_FORMAT = 'snappingtool-sealed';
const PAIRING_PREFIX = 'stp1';

let cache = null;

function keystorePath() {
  return path.join(config.ensureDir(config.getDataDir()), KEYSTORE_FILE);
}

function decode(raw) {
  try {
    let json;
    if (raw.protection === 'safeStorage') json = safeStorage.decryptString(Buffer.from(raw.blob, 'base64'));
    else if (raw.protection === 'none') json = Buffer.from(raw.blob, 'base64').toString('utf8');
    else return null;
    const o = JSON.parse(json);
    const dataKey = Buffer.from(o.dataKey, 'base64');
    const bridgeKey = Buffer.from(o.bridgeKey, 'base64');
    if (dataKey.length !== 32 || bridgeKey.length !== 32) return null;
    return { dataKey, bridgeKey };
  } catch (_) {
    return null;
  }
}

function persist() {
  const json = JSON.stringify({
    dataKey: cache.dataKey.toString('base64'),
    bridgeKey: cache.bridgeKey.toString('base64'),
  });
  // Without an OS keychain (some Linux setups) the key file still sits in the
  // per-user profile folder, readable by this user only.
  const useOs = safeStorage.isEncryptionAvailable();
  const out = {
    v: 1,
    protection: useOs ? 'safeStorage' : 'none',
    blob: useOs ? safeStorage.encryptString(json).toString('base64') : Buffer.from(json).toString('base64'),
  };
  const file = keystorePath();
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(out), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, file);
}

function load() {
  if (cache) return cache;
  const file = keystorePath();
  let raw = null;
  try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { raw = null; }
  if (raw) {
    const secrets = decode(raw);
    if (secrets) {
      cache = secrets;
      if (raw.protection === 'none' && safeStorage.isEncryptionAvailable()) persist(); // upgrade
      return cache;
    }
    // Unreadable (e.g. profile copied from another PC): keep it aside, start fresh.
    try { fs.renameSync(file, `${file}.unreadable-${Date.now()}`); } catch (_) { /* ignore */ }
  }
  cache = { dataKey: crypto.randomBytes(32), bridgeKey: crypto.randomBytes(32) };
  persist();
  return cache;
}

// ---- Sealed data files ------------------------------------------------------

function isSealed(obj) {
  return !!obj && typeof obj === 'object' && obj.format === SEAL_FORMAT;
}

/** Encrypt + authenticate a JSON value. `kind` is bound in, so files can't be swapped. */
function seal(value, kind) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', load().dataKey, iv);
  cipher.setAAD(Buffer.from(`${SEAL_FORMAT}:${kind}`));
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return {
    format: SEAL_FORMAT,
    v: 1,
    kind,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
  };
}

/** Reverse of seal(). Throws if the file was modified or sealed with another key. */
function unseal(obj, kind) {
  if (!isSealed(obj) || obj.v !== 1) throw new Error('not a sealed file');
  const decipher = crypto.createDecipheriv('aes-256-gcm', load().dataKey, Buffer.from(obj.iv, 'base64'));
  decipher.setAAD(Buffer.from(`${SEAL_FORMAT}:${kind}`));
  decipher.setAuthTag(Buffer.from(obj.tag, 'base64'));
  const json = Buffer.concat([decipher.update(Buffer.from(obj.data, 'base64')), decipher.final()]).toString('utf8');
  return JSON.parse(json);
}

// ---- Browser extension pairing ----------------------------------------------

function getBridgeKey() {
  return load().bridgeKey;
}

/** The code the user pastes into the extension: "stp1.<port>.<key>". */
function getPairingCode(port) {
  return `${PAIRING_PREFIX}.${port}.${getBridgeKey().toString('base64url')}`;
}

/** New bridge key — the old pairing code (and any extension using it) stops working. */
function regenerateBridgeKey() {
  load().bridgeKey = crypto.randomBytes(32);
  persist();
}

module.exports = {
  isSealed,
  seal,
  unseal,
  getBridgeKey,
  getPairingCode,
  regenerateBridgeKey,
};
