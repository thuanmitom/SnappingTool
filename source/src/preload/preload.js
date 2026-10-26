'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/**
 * The only surface the UI can touch. Everything is an explicit, named channel
 * so there's no arbitrary IPC from the renderer — keeps the app safe and the
 * contract easy to read when maintaining.
 */
const api = {
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    save: (patch) => ipcRenderer.invoke('settings:save', patch),
  },
  snap: {
    prepare: () => ipcRenderer.invoke('snap:prepare'),
    confirm: (selection, meta) => ipcRenderer.invoke('snap:confirm', { selection, meta }),
  },
  snapshots: {
    list: () => ipcRenderer.invoke('snapshots:list'),
    get: (id) => ipcRenderer.invoke('snapshots:get', id),
    remove: (id) => ipcRenderer.invoke('snapshots:delete', id),
    rename: (id, name) => ipcRenderer.invoke('snapshots:rename', { id, name }),
    restore: (id, focusMode) => ipcRenderer.invoke('snapshots:restore', { id, focusMode }),
    pin: (id, pinned) => ipcRenderer.invoke('snapshots:pin', { id, pinned }),
    duplicate: (id) => ipcRenderer.invoke('snapshots:duplicate', id),
  },
  catalogs: {
    list: () => ipcRenderer.invoke('catalogs:list'),
    save: (cat) => ipcRenderer.invoke('catalogs:save', cat),
    remove: (id) => ipcRenderer.invoke('catalogs:delete', id),
    setMember: (catalogId, snapshotId, include) =>
      ipcRenderer.invoke('catalogs:member', { catalogId, snapshotId, include }),
  },
  quick: {
    list: () => ipcRenderer.invoke('quick:list'),
    save: (qa) => ipcRenderer.invoke('quick:save', qa),
    remove: (id) => ipcRenderer.invoke('quick:delete', id),
    run: (id) => ipcRenderer.invoke('quick:run', id),
  },
  bridge: {
    info: () => ipcRenderer.invoke('bridge:info'),
    copyCode: () => ipcRenderer.invoke('bridge:copyCode'),
    regenerate: () => ipcRenderer.invoke('bridge:regenerate'),
  },
  system: {
    resources: () => ipcRenderer.invoke('system:resources'),
    monitors: () => ipcRenderer.invoke('system:monitors'),
    tabBridge: () => ipcRenderer.invoke('system:tabBridge'),
    openDataDir: () => ipcRenderer.invoke('system:openDataDir'),
    pickStorageDir: () => ipcRenderer.invoke('system:pickStorageDir'),
  },
  window: {
    minimize: () => ipcRenderer.send('win:minimize'),
    close: () => ipcRenderer.send('win:close'),
  },
  on: (channel, cb) => {
    const allowed = ['trigger-snap', 'restore-start', 'restore-progress', 'restore-done', 'chord-armed'];
    if (!allowed.includes(channel)) return () => {};
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
};

contextBridge.exposeInMainWorld('snap', api);
