'use strict';

const { execFile } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');

/**
 * Run a PowerShell script robustly and safely.
 *
 * We write the script to a .ps1 and run it with -File rather than pushing a
 * huge string through -Command: a multi-kilobyte script (with an embedded
 * Add-Type C# block) as one command-line argument can exceed command-line
 * limits and, in some environments, leave powershell waiting on stdin.
 *
 * Safety rules:
 *  - The script text is always a constant. Any data it needs (window titles,
 *    positions…) is written to data.json next to it and read with
 *    ConvertFrom-Json — data is never pasted into the script source.
 *  - Both files live in a fresh private folder from mkdtemp (unpredictable
 *    name), removed afterwards.
 *  - powershell.exe is called by absolute path so a stray powershell.exe in
 *    the working directory or PATH can't be picked up instead.
 *
 * A hard timeout kills the process, and stdin is closed immediately so the
 * child can never block waiting for input.
 */

const POWERSHELL = path.join(process.env.SystemRoot || 'C:\\Windows',
  'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');

function removeDir(dir) {
  if (!dir) return;
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
}

/**
 * @param scriptText  constant script source; read data via
 *                    (Join-Path $PSScriptRoot 'data.json')
 * @param opts        { timeoutMs, label, data } — data is JSON-serialized
 */
function runPowerShellScript(scriptText, { timeoutMs = 15000, label = 'powershell', data } = {}) {
  return new Promise((resolve, reject) => {
    let dir;
    let file;
    try {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snappingtool-'));
      file = path.join(dir, 'script.ps1');
      // BOM helps PowerShell read UTF-8 correctly. 'wx' = fail if it exists.
      fs.writeFileSync(file, '\uFEFF' + scriptText, { encoding: 'utf8', flag: 'wx' });
      if (data !== undefined) {
        fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify(data), { encoding: 'utf8', flag: 'wx' });
      }
    } catch (e) {
      removeDir(dir);
      return reject(new Error(`Could not write PowerShell script: ${e.message}`));
    }

    const args = ['-NoProfile', '-NonInteractive', '-NoLogo', '-ExecutionPolicy', 'Bypass', '-File', file];
    const child = execFile(POWERSHELL, args, {
      maxBuffer: 12 * 1024 * 1024,
      windowsHide: true,
      timeout: timeoutMs,
      killSignal: 'SIGKILL',
    }, (err, stdout, stderr) => {
      removeDir(dir);

      if (err) {
        if (err.killed || err.signal === 'SIGKILL') {
          return reject(new Error(`${label} timed out after ${timeoutMs}ms (PowerShell was blocked or too slow).`));
        }
        return reject(new Error(`${label} failed: ${err.message}${stderr ? ' | ' + stderr.trim() : ''}`));
      }
      resolve(stdout);
    });

    // Never let the child wait on stdin.
    if (child.stdin) { try { child.stdin.end(); } catch (_) { /* ignore */ } }
  });
}

module.exports = { runPowerShellScript };
