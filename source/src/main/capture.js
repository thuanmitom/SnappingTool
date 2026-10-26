'use strict';

const os = require('os');
const { runPowerShellScript } = require('./powershell');

/**
 * Capture engine.
 *
 * Windows path: a single PowerShell call returns every visible top-level
 * window (title, process name, executable path, bounds, maximized/minimized
 * state) plus the monitor layout. We do it in one call so capture is a single
 * short-lived process rather than continuous polling — important for weak
 * machines (see docs: performance profiles).
 *
 * Other OSes: window geometry needs platform-specific work (Accessibility API
 * on macOS, X11/Wayland on Linux) that isn't in this MVP. The app still runs;
 * capture returns the monitor layout and an empty app list with a clear note,
 * so the UI and browser-tab capture remain fully usable for the demo.
 */

const PS_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class Win {
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool GetWindowPlacement(IntPtr hWnd, ref WINDOWPLACEMENT lpwndpl);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
  [StructLayout(LayoutKind.Sequential)] public struct WINDOWPLACEMENT {
    public int length; public int flags; public int showCmd;
    public POINT ptMinPosition; public POINT ptMaxPosition; public RECT rcNormalPosition;
  }
}
"@

# --- Monitors ---
Add-Type -AssemblyName System.Windows.Forms
$monitors = @()
$i = 0
foreach ($s in [System.Windows.Forms.Screen]::AllScreens) {
  $monitors += [PSCustomObject]@{
    id = $i; x = $s.Bounds.X; y = $s.Bounds.Y;
    width = $s.Bounds.Width; height = $s.Bounds.Height; primary = $s.Primary
  }
  $i++
}

# --- Windows ---
$results = New-Object System.Collections.ArrayList
$seen = @{}
$callback = {
  param($hWnd, $lParam)
  if (-not [Win]::IsWindowVisible($hWnd)) { return $true }
  $len = [Win]::GetWindowTextLength($hWnd)
  if ($len -eq 0) { return $true }
  $sb = New-Object System.Text.StringBuilder ($len + 1)
  [Win]::GetWindowText($hWnd, $sb, $sb.Capacity) | Out-Null
  $title = $sb.ToString()
  if ([string]::IsNullOrWhiteSpace($title)) { return $true }

  $procId = 0
  [Win]::GetWindowThreadProcessId($hWnd, [ref]$procId) | Out-Null
  $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
  if ($null -eq $proc) { return $true }
  $pname = $proc.ProcessName
  if ($pname -in @('explorer','TextInputHost','ApplicationFrameHost','SystemSettings','ShellExperienceHost')) { return $true }

  $exe = ''
  try { $exe = $proc.MainModule.FileName } catch {}

  $r = New-Object Win+RECT
  [Win]::GetWindowRect($hWnd, [ref]$r) | Out-Null

  $wp = New-Object Win+WINDOWPLACEMENT
  $wp.length = [System.Runtime.InteropServices.Marshal]::SizeOf($wp)
  [Win]::GetWindowPlacement($hWnd, [ref]$wp) | Out-Null
  $state = switch ($wp.showCmd) { 2 {'minimized'} 3 {'maximized'} default {'normal'} }

  $key = "$pname|$title"
  if ($seen.ContainsKey($key)) { return $true }
  $seen[$key] = $true

  [void]$results.Add([PSCustomObject]@{
    title = $title; processName = $pname; path = $exe;
    x = $r.Left; y = $r.Top; width = ($r.Right - $r.Left); height = ($r.Bottom - $r.Top);
    state = $state
  })
  return $true
}
[Win]::EnumWindows($callback, [IntPtr]::Zero) | Out-Null

[PSCustomObject]@{ monitors = $monitors; windows = $results } | ConvertTo-Json -Depth 5 -Compress
`;

const BROWSER_PROCESSES = ['chrome', 'msedge', 'firefox', 'brave', 'opera', 'vivaldi'];

async function runPowerShell() {
  const stdout = await runPowerShellScript(PS_SCRIPT, { timeoutMs: 15000, label: 'capture' });
  const trimmed = (stdout || '').trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed);
  } catch (e) {
    throw new Error('Failed to parse capture output: ' + e.message);
  }
}

/** Which monitor does a window sit on? Pick the monitor with the most overlap. */
function assignMonitor(win, monitors) {
  let best = monitors.find((m) => m.primary) || monitors[0] || { id: 0 };
  let bestArea = -1;
  for (const m of monitors) {
    const ox = Math.max(0, Math.min(win.x + win.width, m.x + m.width) - Math.max(win.x, m.x));
    const oy = Math.max(0, Math.min(win.y + win.height, m.y + m.height) - Math.max(win.y, m.y));
    const area = ox * oy;
    if (area > bestArea) { bestArea = area; best = m; }
  }
  return best.id;
}

/**
 * Capture the current desktop session.
 * @param {object} tabProvider  something with getTabs() -> array of browser windows
 * @param {object} opts         { selfExePath, selfProcessNames: [] } — windows to exclude
 */
async function captureSession(tabProvider, opts = {}) {
  const platform = os.platform();
  let monitors = [{ id: 0, x: 0, y: 0, width: 1920, height: 1080, primary: true }];
  let windows = [];
  let note = '';

  if (platform === 'win32') {
    try {
      const data = await runPowerShell();
      // PowerShell's ConvertTo-Json serializes a 1-element array as a bare
      // object, so coerce everything back to arrays.
      const toArray = (x) => (Array.isArray(x) ? x : x ? [x] : []);
      const mon = toArray(data.monitors);
      monitors = mon.length ? mon : monitors;
      windows = toArray(data.windows);
    } catch (e) {
      note = 'Could not read window list from Windows. Try running the app once as the same user that owns your other apps.';
    }
  } else {
    note = `Window capture on ${platform} is not supported in this build yet — browser tabs still work. See docs/USAGE.md.`;
  }

  // Never capture our own window. Otherwise restore would relaunch the app's
  // Electron host with no arguments and show the blank Electron welcome screen.
  const selfExe = (opts.selfExePath || '').toLowerCase();
  const selfNames = (opts.selfProcessNames || ['electron', 'snappingtool', 'snapspace'])
    .map((n) => n.toLowerCase());
  const isSelf = (w) => {
    const pname = (w.processName || '').toLowerCase();
    const wpath = (w.path || '').toLowerCase();
    if (selfExe && wpath && wpath === selfExe) return true;
    if (selfNames.includes(pname)) return true;
    return false;
  };

  // Split windows into browsers and regular apps.
  const apps = [];
  const browserWindows = [];
  for (const w of windows) {
    if (isSelf(w)) continue; // skip our own window
    const monitorId = assignMonitor(w, monitors);
    const item = {
      title: w.title,
      processName: w.processName,
      path: w.path,
      monitorId,
      rect: { x: w.x, y: w.y, width: w.width, height: w.height },
      state: w.state,
    };
    if (BROWSER_PROCESSES.includes((w.processName || '').toLowerCase())) {
      browserWindows.push(item);
    } else {
      apps.push(item);
    }
  }

  // Merge live tab data from the extension bridge (if connected).
  let browserTabs = [];
  try {
    browserTabs = tabProvider ? await tabProvider.getTabs() : [];
  } catch (_) { browserTabs = []; }

  return {
    capturedAt: Date.now(),
    platform,
    monitors,
    apps,
    browserWindows,     // geometry of browser windows (from OS)
    browserTabs,        // urls/titles per window (from extension)
    note,
  };
}

module.exports = { captureSession, BROWSER_PROCESSES };
