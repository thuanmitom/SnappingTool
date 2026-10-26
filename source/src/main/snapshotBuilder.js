'use strict';

/**
 * Turn a raw capture (apps, browser windows, browser tabs) into the flat,
 * storable snapshot structure the rest of the app understands.
 *
 * Stored snapshot shape:
 * {
 *   id, name, createdAt, auto, monitors: [...],
 *   items: [
 *     { type:'app', title, path, processName, monitorId, rect, state, included },
 *     { type:'browser', browser, monitorId, rect, state, included,
 *       tabs:[ { url, title, included } ] }
 *   ]
 * }
 *
 * Everything defaults to included:true; the pre-snap selection UI flips these.
 */

function buildDraft(capture) {
  const items = [];

  for (const app of capture.apps) {
    items.push({
      type: 'app',
      title: app.title,
      path: app.path,
      processName: app.processName,
      monitorId: app.monitorId,
      rect: app.rect,
      state: app.state,
      included: true,
    });
  }

  // Pair OS browser windows with tab lists from the extension.
  // The extension reports windows in z-order; we pair by index as a pragmatic
  // heuristic (exact hWnd↔windowId mapping isn't exposed to extensions).
  const tabWindowsByBrowser = {};
  for (const bt of capture.browserTabs || []) {
    tabWindowsByBrowser[bt.browser] = bt.windows || [];
  }

  const usedTabWindows = {};
  for (const bw of capture.browserWindows) {
    const browser = (bw.processName || 'chrome').toLowerCase()
      .replace('msedge', 'msedge'); // keep process name as browser key
    const list = tabWindowsByBrowser[normalizeBrowser(browser)] || [];
    const idx = usedTabWindows[browser] = (usedTabWindows[browser] ?? -1) + 1;
    const tabWin = list[idx];
    const tabs = (tabWin && tabWin.tabs ? tabWin.tabs : []).map((t) => ({
      url: t.url, title: t.title, included: true,
    }));

    items.push({
      type: 'browser',
      browser: normalizeBrowser(browser),
      monitorId: bw.monitorId,
      rect: bw.rect,
      state: bw.state,
      title: bw.title,
      tabs,
      included: true,
    });
  }

  // If the OS gave no browser windows but the extension did (non-Windows demo),
  // still surface the tabs so restore works.
  if (!capture.browserWindows.length) {
    for (const bt of capture.browserTabs || []) {
      for (const win of bt.windows || []) {
        items.push({
          type: 'browser',
          browser: normalizeBrowser(bt.browser),
          monitorId: 0,
          rect: null,
          state: 'normal',
          title: `${bt.browser} window`,
          tabs: (win.tabs || []).map((t) => ({ url: t.url, title: t.title, included: true })),
          included: true,
        });
      }
    }
  }

  return {
    monitors: capture.monitors,
    items,
    platform: capture.platform,
    note: capture.note,
  };
}

function normalizeBrowser(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('edge') || n === 'msedge') return 'msedge';
  if (n.includes('firefox')) return 'firefox';
  if (n.includes('brave')) return 'brave';
  if (n.includes('opera')) return 'opera';
  if (n.includes('vivaldi')) return 'vivaldi';
  return 'chrome';
}

/** Apply a selection map (from the UI) and finalize a snapshot for saving. */
function finalize(draft, selection, meta) {
  const items = draft.items
    .map((item, i) => {
      const sel = selection && selection[i];
      if (!sel) return item;
      const next = { ...item, included: sel.included !== false };
      if (item.type === 'browser' && Array.isArray(sel.tabs)) {
        next.tabs = item.tabs.map((t, ti) => ({
          ...t,
          included: sel.tabs[ti] !== false,
        }));
      }
      return next;
    })
    .filter((item) => item.included);

  return {
    name: (meta && meta.name) || defaultName(),
    createdAt: Date.now(),
    auto: !!(meta && meta.auto),
    monitors: draft.monitors,
    items,
  };
}

function defaultName() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `Session ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

module.exports = { buildDraft, finalize, normalizeBrowser };
