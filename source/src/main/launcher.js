'use strict';

const { spawn, execFile } = require('child_process');
const os = require('os');
const path = require('path');
const { shell } = require('electron');
const { sanitizeWebUrl, validateExecutablePath } = require('./security');

/**
 * Launching programs and URLs — never through a shell.
 *
 * Arguments go straight to CreateProcess (or ShellExecute for shortcuts), so
 * characters like & | ^ % in a URL, file name or window title stay plain text
 * instead of turning into extra cmd.exe commands. Every path and URL is
 * validated in ./security before it gets here.
 */

const isWin = os.platform() === 'win32';
const SYSTEM32 = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32');

// Keep each browser command line well under Windows' 32k character limit.
const MAX_ARGS_CHARS = 24000;

/** Spawn a detached process and resolve once it has started (or failed to). */
function spawnDetached(exe, args, cwd) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(exe, args, { cwd, detached: true, stdio: 'ignore', windowsHide: false, shell: false });
    } catch (e) {
      return resolve({ ok: false, reason: e.message });
    }
    child.once('error', (e) => resolve({ ok: false, reason: e.code || e.message }));
    child.once('spawn', () => { child.unref(); resolve({ ok: true }); });
  });
}

/**
 * Launch a program by path.
 * .exe files are spawned directly with their own folder as the working
 * directory — many apps (Electron-based ones in particular) resolve resources
 * relative to cwd. If that fails (e.g. the app needs elevation) we fall back
 * to ShellExecute, which also handles .lnk shortcuts.
 */
async function launchExecutable(p, { allowShortcuts = false } = {}) {
  const extensions = allowShortcuts ? ['.exe', '.lnk'] : ['.exe'];
  const exe = validateExecutablePath(p, { extensions });
  if (!exe) return { ok: false, reason: 'not a local program path' };

  if (isWin && path.extname(exe).toLowerCase() === '.lnk') {
    const err = await shell.openPath(exe);
    return err ? { ok: false, reason: err } : { ok: true };
  }

  const r = await spawnDetached(exe, [], path.dirname(exe));
  if (r.ok || !isWin) return r;
  const err = await shell.openPath(exe);
  return err ? { ok: false, reason: err } : { ok: true };
}

/** Open one web page in the default browser. http/https only. */
async function openUrlExternal(url) {
  const href = sanitizeWebUrl(url);
  if (!href) return { ok: false, reason: 'not a web address' };
  try {
    await shell.openExternal(href);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

// --- Browser discovery (Windows) -------------------------------------------

const BROWSER_EXES = {
  chrome: 'chrome.exe', msedge: 'msedge.exe', firefox: 'firefox.exe',
  brave: 'brave.exe', opera: 'opera.exe', vivaldi: 'vivaldi.exe',
};

function knownLocations(browser) {
  const pf = process.env.ProgramFiles || 'C:\\Program Files';
  const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const local = process.env.LOCALAPPDATA || '';
  const j = (...p) => path.join(...p);
  switch (browser) {
    case 'chrome': return [j(pf, 'Google\\Chrome\\Application\\chrome.exe'), j(pf86, 'Google\\Chrome\\Application\\chrome.exe'), j(local, 'Google\\Chrome\\Application\\chrome.exe')];
    case 'msedge': return [j(pf86, 'Microsoft\\Edge\\Application\\msedge.exe'), j(pf, 'Microsoft\\Edge\\Application\\msedge.exe')];
    case 'firefox': return [j(pf, 'Mozilla Firefox\\firefox.exe'), j(pf86, 'Mozilla Firefox\\firefox.exe')];
    case 'brave': return [j(pf, 'BraveSoftware\\Brave-Browser\\Application\\brave.exe'), j(local, 'BraveSoftware\\Brave-Browser\\Application\\brave.exe')];
    case 'opera': return [j(local, 'Programs\\Opera\\opera.exe'), j(pf, 'Opera\\opera.exe')];
    case 'vivaldi': return [j(local, 'Vivaldi\\Application\\vivaldi.exe'), j(pf, 'Vivaldi\\Application\\vivaldi.exe')];
    default: return [];
  }
}

/** Read the "App Paths" registry entry Windows itself uses to find a browser. */
function queryAppPath(root, exeName) {
  return new Promise((resolve) => {
    const key = `${root}\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exeName}`;
    execFile(path.join(SYSTEM32, 'reg.exe'), ['query', key, '/ve'], { windowsHide: true, timeout: 5000 }, (err, stdout) => {
      if (err) return resolve(null);
      const m = /REG_(?:EXPAND_)?SZ\s+(.+)$/m.exec(stdout || '');
      if (!m) return resolve(null);
      const value = m[1].trim().replace(/^"(.*)"$/, '$1')
        .replace(/%([^%]+)%/g, (all, name) => process.env[name] ?? all);
      resolve(value);
    });
  });
}

const browserCache = new Map();

async function resolveBrowserExe(browser) {
  if (browserCache.has(browser)) return browserCache.get(browser);
  const exeName = BROWSER_EXES[browser];
  let found = null;
  if (exeName) {
    const candidates = [
      await queryAppPath('HKCU', exeName),
      await queryAppPath('HKLM', exeName),
      ...knownLocations(browser),
    ];
    found = candidates.map((c) => c && validateExecutablePath(c)).find(Boolean) || null;
  }
  browserCache.set(browser, found);
  return found;
}

/** Split URLs into groups whose combined length stays under the command-line limit. */
function chunkUrls(urls) {
  const chunks = [];
  let cur = [];
  let len = 0;
  for (const u of urls) {
    if (cur.length && len + u.length + 3 > MAX_ARGS_CHARS) { chunks.push(cur); cur = []; len = 0; }
    cur.push(u);
    len += u.length + 3;
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

/**
 * Open a new browser window with the given tabs.
 * URLs are re-validated here (http/https and local file:// only), so nothing
 * can start with "-" and be read as a browser command-line switch.
 */
async function launchBrowser(browser, urls) {
  const clean = (urls || []).map((u) => sanitizeWebUrl(u, { allowFile: true })).filter(Boolean);
  if (!clean.length) return { ok: false, reason: 'no valid URLs' };

  const exe = isWin ? await resolveBrowserExe(String(browser || 'chrome').toLowerCase()) : null;
  if (!exe) {
    // Browser not found (or not Windows): hand web pages to the default browser.
    const web = clean.map((u) => sanitizeWebUrl(u)).filter(Boolean);
    for (const u of web) await openUrlExternal(u);
    return { ok: web.length > 0 };
  }

  const chunks = chunkUrls(clean);
  let ok = false;
  for (let i = 0; i < chunks.length; i++) {
    // Later chunks land in the window the first one just opened.
    const args = i === 0 ? ['--new-window', ...chunks[i]] : chunks[i];
    const r = await spawnDetached(exe, args, path.dirname(exe));
    ok = ok || r.ok;
  }
  return { ok };
}

module.exports = { launchExecutable, launchBrowser, openUrlExternal };
