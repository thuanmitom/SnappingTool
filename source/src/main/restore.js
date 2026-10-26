'use strict';

const os = require('os');
const { launchExecutable, launchBrowser } = require('./launcher');
const { runPowerShellScript } = require('./powershell');

/**
 * Restore engine.
 *
 * Restore happens in three passes:
 *   1. Launch apps (staggered, so a weak machine isn't hit all at once).
 *   2. Launch browser windows with their tab URLs.
 *   3. Reposition every launched window to its saved rect, remapping across
 *      a changed monitor count when needed.
 *
 * We keep launch + positioning best-effort: a single app failing to start
 * never aborts the whole restore.
 *
 * Snapshot contents (paths, URLs, window titles) are treated as untrusted
 * data: launching goes through ./launcher (validated, no shell) and window
 * titles reach PowerShell only as JSON data, never as script source.
 */

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Map a saved rect to the current monitor set. */
function remapRect(item, savedMonitors, currentMonitors) {
  const saved = savedMonitors.find((m) => m.id === item.monitorId) || savedMonitors[0];
  if (!saved) return item.rect;

  // Same layout (count matches) → keep absolute coordinates.
  if (currentMonitors.length >= savedMonitors.length) {
    const target = currentMonitors.find((m) => m.id === item.monitorId) || currentMonitors[0];
    // Preserve position relative to that monitor's origin, then re-anchor.
    const relX = (item.rect.x - saved.x) / saved.width;
    const relY = (item.rect.y - saved.y) / saved.height;
    return {
      x: Math.round(target.x + relX * target.width),
      y: Math.round(target.y + relY * target.height),
      width: Math.min(item.rect.width, target.width),
      height: Math.min(item.rect.height, target.height),
    };
  }

  // Fewer monitors now → fold everything onto the primary, scaled to fit.
  const primary = currentMonitors.find((m) => m.primary) || currentMonitors[0];
  const relX = (item.rect.x - saved.x) / saved.width;
  const relY = (item.rect.y - saved.y) / saved.height;
  return {
    x: Math.round(primary.x + Math.max(0, Math.min(0.9, relX)) * primary.width),
    y: Math.round(primary.y + Math.max(0, Math.min(0.9, relY)) * primary.height),
    width: Math.min(item.rect.width, primary.width),
    height: Math.min(item.rect.height, primary.height),
  };
}

const SELF_PROCESSES = ['electron', 'snappingtool', 'snapspace'];

function isSelfApp(item) {
  const pname = (item.processName || '').toLowerCase();
  return SELF_PROCESSES.includes(pname);
}

function launchApp(item) {
  if (!item.path) return Promise.resolve({ ok: false, reason: 'no path' });
  if (isSelfApp(item)) return Promise.resolve({ ok: false, reason: 'self' }); // never relaunch ourselves
  return launchExecutable(item.path);
}

// Constant script: the targets are read from data.json written next to it by
// runPowerShellScript, so a window title can never become PowerShell code.
const REPOSITION_SCRIPT = `
$ErrorActionPreference='SilentlyContinue'
Add-Type @"
using System;using System.Runtime.InteropServices;using System.Text;
public class Mv{
 [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr l);
 public delegate bool EnumWindowsProc(IntPtr h, IntPtr l);
 [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder t, int c);
 [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr h);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h,int x,int y,int w,int ht,bool r);
 [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h,int c);
}
"@
$targets = [System.IO.File]::ReadAllText((Join-Path $PSScriptRoot 'data.json'), [System.Text.Encoding]::UTF8) | ConvertFrom-Json
$cb = {
  param($h,$l)
  if(-not [Mv]::IsWindowVisible($h)){return $true}
  $len=[Mv]::GetWindowTextLength($h); if($len -eq 0){return $true}
  $sb=New-Object System.Text.StringBuilder ($len+1)
  [Mv]::GetWindowText($h,$sb,$sb.Capacity)|Out-Null
  $t=$sb.ToString()
  foreach($tg in $targets){
    if($t -eq [string]$tg.title){
      if($tg.state -eq 'maximized'){ [Mv]::ShowWindow($h,3)|Out-Null }
      elseif($tg.state -eq 'minimized'){ [Mv]::ShowWindow($h,2)|Out-Null }
      else{ [Mv]::ShowWindow($h,1)|Out-Null; [Mv]::MoveWindow($h,[int]$tg.x,[int]$tg.y,[int]$tg.width,[int]$tg.height,$true)|Out-Null }
    }
  }
  return $true
}
[Mv]::EnumWindows($cb,[IntPtr]::Zero)|Out-Null
`;

/** Keep only well-formed placements: string title, finite numbers, known state. */
function cleanPlacements(placements) {
  const num = (v) => (Number.isFinite(v) ? Math.round(v) : 0);
  return placements
    .filter((p) => p && typeof p.title === 'string' && p.title)
    .map((p) => ({
      title: p.title.slice(0, 1024),
      state: ['maximized', 'minimized'].includes(p.state) ? p.state : 'normal',
      x: num(p.x), y: num(p.y), width: num(p.width), height: num(p.height),
    }));
}

/**
 * Reposition windows by title match, after apps have had time to open.
 * Windows-only; a no-op elsewhere.
 */
async function repositionWindows(placements) {
  const targets = cleanPlacements(placements);
  if (os.platform() !== 'win32' || !targets.length) return;
  try {
    await runPowerShellScript(REPOSITION_SCRIPT, { timeoutMs: 15000, label: 'reposition', data: targets });
  } catch (_) {
    // best-effort: positioning failure never blocks restore
  }
}

/**
 * @param snapshot   the saved snapshot
 * @param options    { restoreDelayMs, currentMonitors, onProgress }
 */
async function restoreSnapshot(snapshot, options = {}) {
  const delay = options.restoreDelayMs ?? 600;
  const currentMonitors = options.currentMonitors || snapshot.monitors || [];
  const savedMonitors = snapshot.monitors || currentMonitors;
  const progress = options.onProgress || (() => {});

  const items = (snapshot.items || []).filter((it) => it.included !== false);
  const apps = items.filter((it) => it.type === 'app');
  const browsers = items.filter((it) => it.type === 'browser');

  const placements = [];
  let done = 0;
  const total = apps.length + browsers.length;

  // Pass 1 — apps.
  for (const app of apps) {
    await launchApp(app);
    if (app.rect) {
      placements.push({
        title: app.title,
        state: app.state,
        ...remapRect(app, savedMonitors, currentMonitors),
      });
    }
    done++;
    progress({ done, total, label: app.title });
    await sleep(delay);
  }

  // Pass 2 — browser windows with their tabs.
  for (const b of browsers) {
    const urls = (b.tabs || []).filter((t) => t.included !== false).map((t) => t.url);
    if (urls.length) await launchBrowser(b.browser, urls);
    done++;
    progress({ done, total, label: `${b.browser} (${urls.length} tabs)` });
    await sleep(delay);
  }

  // Give windows a moment to finish opening, then place them.
  await sleep(Math.max(1200, delay));
  await repositionWindows(placements);

  return { launched: total };
}

module.exports = { restoreSnapshot, remapRect, cleanPlacements, REPOSITION_SCRIPT };
