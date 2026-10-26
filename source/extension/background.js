'use strict';

/**
 * SnappingTool Tab Bridge — background service worker.
 *
 * Collects the current tabs (grouped by browser window) and POSTs them to the
 * SnappingTool desktop app, which listens on http://127.0.0.1:<port>/tabs.
 *
 * Nothing is sent until the extension is paired: the user copies the pairing
 * code from SnappingTool → Settings into this extension's options page. Tab
 * data is then encrypted with that code's key (see bridgeCrypto.js), so only
 * the paired app on this computer can read it.
 *
 * Privacy: data never leaves your machine. It only ever goes to localhost.
 * We send URL + title only — no cookies, history or page content.
 */

importScripts('bridgeCrypto.js');

// Skip internal pages that can't be meaningfully restored.
function keepTab(url) {
  if (!url) return false;
  return /^https?:\/\//i.test(url) || /^file:\/\//i.test(url);
}

async function getPairing() {
  const { pairingCode } = await chrome.storage.local.get('pairingCode');
  return SnapBridge.parsePairingCode(pairingCode);
}

/** Send the current tabs. Resolves { ok, status, paired }. */
async function collectAndSend() {
  try {
    const pairing = await getPairing();
    if (!pairing) return { ok: false, status: 0, paired: false };

    const wins = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
    const windows = wins.map((w) => ({
      focused: w.focused,
      tabs: (w.tabs || [])
        .filter((t) => keepTab(t.url))
        .map((t) => ({ url: t.url, title: t.title || t.url })),
    })).filter((w) => w.tabs.length);

    // Detect which browser we are (best effort via user agent).
    let browser = 'chrome';
    const ua = navigator.userAgent || '';
    if (/Edg\//.test(ua)) browser = 'msedge';
    else if (/OPR\//.test(ua)) browser = 'opera';
    else if (/Brave/.test(ua)) browser = 'brave';
    else if (/Vivaldi/.test(ua)) browser = 'vivaldi';

    const r = await SnapBridge.sendTabs(pairing, { ts: Date.now(), browser, windows });
    return { ...r, paired: true };
  } catch (_) {
    // App not running or bridge off — nothing to do; try again next tick.
    return { ok: false, status: 0, paired: true };
  }
}

// Push on relevant events (debounced) and on a steady heartbeat so the app
// always has data less than 30s old (its freshness window).
let debounce = null;
function schedule() {
  clearTimeout(debounce);
  debounce = setTimeout(collectAndSend, 800);
}

chrome.tabs.onCreated.addListener(schedule);
chrome.tabs.onRemoved.addListener(schedule);
chrome.tabs.onUpdated.addListener((_id, info) => { if (info.url || info.status === 'complete') schedule(); });
chrome.tabs.onActivated.addListener(schedule);
chrome.windows.onCreated.addListener(schedule);
chrome.windows.onRemoved.addListener(schedule);

chrome.runtime.onInstalled.addListener(async (details) => {
  const pairing = await getPairing();
  if (!pairing && details.reason === 'install') chrome.runtime.openOptionsPage();
  collectAndSend();
});
chrome.runtime.onStartup.addListener(collectAndSend);

// Clicking the toolbar icon opens the pairing page.
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

// The options page asks for an immediate sync to test a freshly pasted code.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !msg || msg.type !== 'sync-now') return false;
  collectAndSend().then(sendResponse);
  return true; // async response
});

// Heartbeat via alarms (service workers can be suspended).
chrome.alarms.create('heartbeat', { periodInMinutes: 0.25 });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'heartbeat') collectAndSend(); });

// Kick once on load.
collectAndSend();
