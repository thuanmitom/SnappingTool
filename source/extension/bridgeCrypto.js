'use strict';

/**
 * SnappingTool Tab Bridge — pairing + encryption helpers.
 * Shared by the service worker (importScripts) and the options page.
 *
 * The pairing code shown in SnappingTool → Settings looks like
 *   stp1.<port>.<43-char base64url key>
 * Tab data is encrypted with AES-256-GCM under that key before it is sent, so
 * only the paired SnappingTool app can read it — not another program that
 * happens to be listening on the port — and the app rejects anything not
 * encrypted with the key.
 */
(function (root) {
  const AAD = new TextEncoder().encode('snappingtool-tabs-v1');

  function b64urlToBytes(s) {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function bytesToB64(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin);
  }

  /** "stp1.<port>.<key>" → { port, keyBytes }, or null if malformed. */
  function parsePairingCode(code) {
    const m = /^stp1\.(\d{4,5})\.([A-Za-z0-9_-]{43})$/.exec(String(code || '').trim());
    if (!m) return null;
    const port = Number(m[1]);
    if (port < 1024 || port > 65535) return null;
    const keyBytes = b64urlToBytes(m[2]);
    if (keyBytes.length !== 32) return null;
    return { port, keyBytes };
  }

  async function encryptPayload(keyBytes, obj) {
    const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plain = new TextEncoder().encode(JSON.stringify(obj));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: AAD }, key, plain));
    return { v: 1, iv: bytesToB64(iv), ct: bytesToB64(ct) };
  }

  /** Encrypt and POST tab data. Resolves { ok, status } — never throws. */
  async function sendTabs(pairing, payload) {
    try {
      const body = await encryptPayload(pairing.keyBytes, payload);
      const res = await fetch(`http://127.0.0.1:${pairing.port}/tabs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { ok: res.ok, status: res.status };
    } catch (_) {
      return { ok: false, status: 0 }; // app not running / port closed
    }
  }

  root.SnapBridge = { parsePairingCode, encryptPayload, sendTabs };
})(typeof self !== 'undefined' ? self : globalThis);
