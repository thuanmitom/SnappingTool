'use strict';

const http = require('http');
const crypto = require('crypto');
const { sanitizeWebUrl } = require('./security');

/**
 * Localhost bridge for the browser extension.
 *
 * The extension POSTs its current tabs to http://127.0.0.1:<port>/tabs.
 * We hold the latest payload in memory and hand it to the capture engine on
 * demand. This is deliberately simpler than Chrome Native Messaging: no
 * registry keys, no manifest path registration.
 *
 * Bound to 127.0.0.1 only — but a localhost port is still reachable by every
 * web page the user opens (in any browser), every program and every other
 * Windows account on the PC. So the bridge trusts nothing about a connection:
 *
 *  - The body must be AES-256-GCM encrypted with the pairing key the user
 *    copies from Settings into the extension. Without the key nothing is
 *    accepted, and a program squatting on this port while the app is closed
 *    only ever receives ciphertext.
 *  - No CORS headers; requests carrying a web page Origin, a foreign Host
 *    (DNS rebinding) or a non-JSON Content-Type are refused outright.
 *  - Old or replayed messages are refused (timestamp must move forward).
 *  - Tab data is validated before use: http(s)/local file URLs only, capped sizes.
 */

const AAD = Buffer.from('snappingtool-tabs-v1');
const MAX_BODY = 2 * 1024 * 1024;
const MAX_WINDOWS = 50;
const MAX_TABS_PER_WINDOW = 500;
const MAX_TITLE = 500;
const MAX_CLOCK_SKEW_MS = 2 * 60 * 1000;
const FRESH_MS = 30_000;
const BROWSERS = ['chrome', 'msedge', 'firefox', 'brave', 'opera', 'vivaldi'];

/** Keep only well-formed windows/tabs with safe URLs. */
function sanitizeWindows(windows) {
  if (!Array.isArray(windows)) return [];
  return windows.slice(0, MAX_WINDOWS).map((w) => ({
    focused: !!(w && w.focused),
    tabs: (w && Array.isArray(w.tabs) ? w.tabs : []).slice(0, MAX_TABS_PER_WINDOW).map((t) => {
      const url = sanitizeWebUrl(t && t.url, { allowFile: true });
      if (!url) return null;
      const title = t && typeof t.title === 'string' && t.title ? t.title.slice(0, MAX_TITLE) : url;
      return { url, title };
    }).filter(Boolean),
  })).filter((w) => w.tabs.length);
}

class TabServer {
  /**
   * @param port    localhost port to listen on
   * @param getKey  () => 32-byte Buffer — the current pairing key
   */
  constructor(port, getKey) {
    this.port = port;
    this.getKey = getKey;
    this.latest = { updatedAt: 0, windows: [] };
    this.lastTs = 0;
    this.server = null;
  }

  start() {
    if (this.server) return Promise.resolve(this.port);
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this._handle(req, res));
      this.server.requestTimeout = 10_000;
      this.server.headersTimeout = 5_000;
      this.server.maxConnections = 32;
      this.server.on('error', (e) => { this.server = null; reject(e); });
      this.server.listen(this.port, '127.0.0.1', () => resolve(this.port));
    });
  }

  stop() {
    if (this.server) { this.server.close(); this.server = null; }
  }

  _reply(res, status, body) {
    if (res.headersSent) return;
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(body ? JSON.stringify(body) : undefined);
  }

  _handle(req, res) {
    // Web pages always send their own Origin; the extension sends chrome-extension://…
    const origin = req.headers.origin;
    if (origin && !/^(chrome|moz)-extension:\/\/[a-z0-9-]+$/i.test(origin)) return this._reply(res, 403);

    // DNS rebinding: only accept requests addressed to the loopback address itself.
    const host = String(req.headers.host || '');
    if (host !== `127.0.0.1:${this.port}` && host !== `localhost:${this.port}`) return this._reply(res, 403);

    if (req.method !== 'POST' || req.url !== '/tabs') return this._reply(res, 404);
    if (!/^application\/json\s*(;|$)/i.test(String(req.headers['content-type'] || ''))) return this._reply(res, 415);
    if (Number(req.headers['content-length'] || 0) > MAX_BODY) return this._reply(res, 413);

    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { this._reply(res, 413); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (size > MAX_BODY) return;
      let payload;
      try {
        payload = this._open(Buffer.concat(chunks).toString('utf8'));
      } catch (_) {
        return this._reply(res, 401, { ok: false, error: 'not paired' });
      }

      const ts = Number(payload.ts);
      if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > MAX_CLOCK_SKEW_MS || ts <= this.lastTs) {
        return this._reply(res, 409, { ok: false, error: 'stale' });
      }
      this.lastTs = ts;

      const browser = String(payload.browser || 'chrome').toLowerCase();
      this.latest = {
        updatedAt: Date.now(),
        browser: BROWSERS.includes(browser) ? browser : 'chrome',
        windows: sanitizeWindows(payload.windows),
      };
      this._reply(res, 200, { ok: true });
    });
  }

  /** Decrypt { v:1, iv, ct } (ct = ciphertext || 16-byte GCM tag, as WebCrypto emits). */
  _open(text) {
    const key = this.getKey();
    if (!key || key.length !== 32) throw new Error('no key');
    const msg = JSON.parse(text);
    if (!msg || msg.v !== 1 || typeof msg.iv !== 'string' || typeof msg.ct !== 'string') throw new Error('bad message');
    const iv = Buffer.from(msg.iv, 'base64');
    const ct = Buffer.from(msg.ct, 'base64');
    if (iv.length !== 12 || ct.length < 17) throw new Error('bad message');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(AAD);
    decipher.setAuthTag(ct.subarray(ct.length - 16));
    const plain = Buffer.concat([decipher.update(ct.subarray(0, ct.length - 16)), decipher.final()]);
    const payload = JSON.parse(plain.toString('utf8'));
    if (!payload || typeof payload !== 'object') throw new Error('bad payload');
    return payload;
  }

  /** Return tab data if it's fresh (last 30s), else empty. */
  async getTabs() {
    if (!this.isConnected()) return [];
    return [{ browser: this.latest.browser, windows: this.latest.windows }];
  }

  isConnected() {
    return Date.now() - this.latest.updatedAt < FRESH_MS;
  }

  /** Forget everything received so far (e.g. after the pairing key changes). */
  reset() {
    this.latest = { updatedAt: 0, windows: [] };
  }
}

module.exports = { TabServer, sanitizeWindows };
