'use strict';

/* global SnapBridge, chrome */
const input = document.getElementById('code');
const status = document.getElementById('status');

function show(text, ok) {
  status.textContent = text;
  status.className = ok ? 'ok' : 'err';
}

chrome.storage.local.get('pairingCode').then(({ pairingCode }) => {
  if (pairingCode) {
    input.value = pairingCode;
    show('Paired. Tabs are being shared with SnappingTool.', true);
  }
});

document.getElementById('save').onclick = async () => {
  const code = input.value.trim();
  if (!SnapBridge.parsePairingCode(code)) {
    show('That doesn\'t look like a pairing code. Copy it again from SnappingTool → Settings → Browser extension.', false);
    return;
  }
  await chrome.storage.local.set({ pairingCode: code });
  const r = await chrome.runtime.sendMessage({ type: 'sync-now' });
  if (r && r.ok) show('Connected ✓ — SnappingTool now sees your tabs.', true);
  else if (r && r.status === 401) show('SnappingTool rejected this code. It may have been regenerated — copy the current one from Settings.', false);
  else show('Saved, but SnappingTool isn\'t reachable right now. Make sure the app is running; the extension will keep retrying.', false);
};

document.getElementById('unpair').onclick = async () => {
  await chrome.storage.local.remove('pairingCode');
  input.value = '';
  show('Unpaired. No tab data will be sent.', false);
};
