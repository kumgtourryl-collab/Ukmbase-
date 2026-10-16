/* ============================================================
   UkmSync SDK — v1.0
   Offline-first sync for Ukmbase projects.
   Drop into any web app:
     <script src="...ukmsync.js"
             data-ukm-project="my-app"
             data-ukm-supabase-url="https://xxx.supabase.co"
             data-ukm-anon-key="sb_..."
             defer></script>
   ============================================================ */

(function () {
  'use strict';

  // ----------------------------------------------------------
  // CONFIG — read from the <script> tag that loaded us
  // ----------------------------------------------------------
  var scriptEl = document.currentScript;
  if (!scriptEl) {
    // Fallback: find the last script with data-ukm-project
    var all = document.getElementsByTagName('script');
    for (var i = all.length - 1; i >= 0; i--) {
      if (all[i].hasAttribute('data-ukm-project')) { scriptEl = all[i]; break; }
    }
  }

  if (!scriptEl) {
    console.warn('[UkmSync] No config script tag found. Aborting.');
    return;
  }

  var CONFIG = {
    projectSlug: scriptEl.getAttribute('data-ukm-project') || 'unknown',
    supabaseUrl: scriptEl.getAttribute('data-ukm-supabase-url') || '',
    anonKey:     scriptEl.getAttribute('data-ukm-anon-key') || '',
    enabled:     (scriptEl.getAttribute('data-ukm-enabled') || 'true') === 'true',
    strategy:    scriptEl.getAttribute('data-ukm-strategy') || 'last-write-wins',
    tables:      (scriptEl.getAttribute('data-ukm-tables') || '').split(',').map(function (t) { return t.trim(); }).filter(Boolean),
    pollMs:      parseInt(scriptEl.getAttribute('data-ukm-poll-ms'), 10) || 15000,
    logToServer: (scriptEl.getAttribute('data-ukm-log') || 'true') === 'true',
  };

  if (!CONFIG.supabaseUrl || !CONFIG.anonKey) {
    console.warn('[UkmSync] Missing supabase URL or anon key. Aborting.');
    return;
  }

  var DB_NAME = 'ukmsync_' + CONFIG.projectSlug;
  var DB_VERSION = 1;
  var QUEUE_STORE = 'queue';
  var CACHE_STORE = 'cache';

  var _db = null;
  var _online = navigator.onLine;
  var _pollTimer = null;
  var _syncing = false;
  var _statusListeners = [];
  var _syncListeners = [];

  // ----------------------------------------------------------
  // IndexedDB helpers
  // ----------------------------------------------------------
  function openDb() {
    return new Promise(function (resolve, reject) {
      if (_db) return resolve(_db);
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(QUEUE_STORE)) {
          var qs = db.createObjectStore(QUEUE_STORE, { keyPath: 'id', autoIncrement: true });
          qs.createIndex('table', 'table', { unique: false });
        }
        if (!db.objectStoreNames.contains(CACHE_STORE)) {
          db.createObjectStore(CACHE_STORE, { keyPath: 'key' });
        }
      };
      req.onsuccess = function () { _db = req.result; resolve(_db); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function tx(store, mode, fn) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(store, mode);
        var s = t.objectStore(store);
        var result = fn(s);
        t.oncomplete = function () { resolve(result && result.result !== undefined ? result.result : result); };
        t.onerror = function () { reject(t.error); };
      });
    });
  }

  function queueAdd(op) {
    return tx([QUEUE_STORE], 'readwrite', function (s) { return s.add(op); });
  }
  function queueGetAll() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(QUEUE_STORE, 'readonly');
        var r = t.objectStore(QUEUE_STORE).getAll();
        r.onsuccess = function () { resolve(r.result || []); };
        r.onerror = function () { reject(r.error); };
      });
    });
  }
  function queueDelete(id) {
    return tx([QUEUE_STORE], 'readwrite', function (s) { return s.delete(id); });
  }
  function cacheSet(key, value) {
    return tx([CACHE_STORE], 'readwrite', function (s) { return s.put({ key: key, value: value, ts: Date.now() }); });
  }
  function cacheGet(key) {
    return openDb().then(function (db) {
      return new Promise(function (resolve) {
        var t = db.transaction(CACHE_STORE, 'readonly');
        var r = t.objectStore(CACHE_STORE).get(key);
        r.onsuccess = function () { resolve(r.result ? r.result.value : null); };
        r.onerror = function () { resolve(null); };
      });
    });
  }

  // ----------------------------------------------------------
  // Supabase REST helpers
  // ----------------------------------------------------------
  function restHeaders(extra) {
    var h = {
      'apikey': CONFIG.anonKey,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    };
    if (CONFIG.anonKey.indexOf('sb_publishable_') !== 0) {
      h['Authorization'] = 'Bearer ' + CONFIG.anonKey;
    }
    if (extra) { for (var k in extra) h[k] = extra[k]; }
    return h;
  }

  function restUrl(path) {
    return CONFIG.supabaseUrl + '/rest/v1/' + path;
  }

  async function serverInsert(table, data) {
    var res = await fetch(restUrl(table), {
      method: 'POST',
      headers: restHeaders(),
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Insert failed (' + res.status + '): ' + await res.text());
    return res.json();
  }

  async function serverUpdate(table, id, patch) {
    var res = await fetch(restUrl(table + '?id=eq.' + encodeURIComponent(id)), {
      method: 'PATCH',
      headers: restHeaders(),
      body: JSON.stringify(patch)
    });
    if (!res.ok) throw new Error('Update failed (' + res.status + '): ' + await res.text());
    return res.json();
  }

  async function serverDelete(table, id) {
    var res = await fetch(restUrl(table + '?id=eq.' + encodeURIComponent(id)), {
      method: 'DELETE',
      headers: restHeaders({ 'Prefer': 'return=minimal' })
    });
    if (!res.ok && res.status !== 204) throw new Error('Delete failed (' + res.status + ')');
    return true;
  }

  async function serverSelect(table, options) {
    options = options || {};
    var qs = 'select=*';
    if (options.limit) qs += '&limit=' + options.limit;
    if (options.order) qs += '&order=' + options.order;
    if (options.eq) {
      Object.keys(options.eq).forEach(function (k) {
        qs += '&' + k + '=eq.' + encodeURIComponent(options.eq[k]);
      });
    }
    var res = await fetch(restUrl(table + '?' + qs), { headers: restHeaders() });
    if (!res.ok) throw new Error('Select failed (' + res.status + ')');
    return res.json();
  }

  // ----------------------------------------------------------
  // Log to server
  // ----------------------------------------------------------
  async function logEvent(eventType, table, recordCount, message, clientId) {
    if (!CONFIG.logToServer) return;
    try {
      // Look up project by slug first — but for MVP we just trust the slug
      // The server side RLS accepts any insert to sync_logs.
      // We need the project_id. For MVP, use a lightweight convention:
      // the SDK will be given project id in a future version.
      // For now, skip the project link and just log to console.
      console.log('[UkmSync:' + eventType + ']', table || '', recordCount || '', message || '');
    } catch (e) {}
  }

  // ----------------------------------------------------------
  // Status
  // ----------------------------------------------------------
  function emitStatus(status) {
    _statusListeners.forEach(function (cb) { try { cb(status); } catch (e) {} });
  }

  function getStatus() {
    return {
      online: _online,
      syncing: _syncing,
      queueLength: _queueLength,
      lastSyncAt: _lastSyncAt,
      project: CONFIG.projectSlug
    };
  }

  var _queueLength = 0;
  var _lastSyncAt = null;

  // ----------------------------------------------------------
  // Core: enqueue a write
  // ----------------------------------------------------------
  async function enqueue(op) {
    if (!CONFIG.enabled) return null;
    var record = {
      table: op.table,
      operation: op.operation, // insert | update | delete
      data: op.data,
      id: op.id,
      queuedAt: Date.now()
    };
    var id = await queueAdd(record);
    record.id = id;
    _queueLength++;
    emitStatus(getStatus());
    logEvent('queued', op.table, 1, op.operation);
    scheduleSync();
    return id;
  }

  // ----------------------------------------------------------
  // Core: process the queue
  // ----------------------------------------------------------
  async function processQueue() {
    if (_syncing) return;
    if (!_online) return;
    if (!CONFIG.enabled) return;

    _syncing = true;
    emitStatus(getStatus());

    try {
      var items = await queueGetAll();
      if (items.length === 0) {
        _syncing = false;
        emitStatus(getStatus());
        return;
      }

      items.sort(function (a, b) { return a.queuedAt - b.queuedAt; });

      for (var i = 0; i < items.length; i++) {
        var op = items[i];
        try {
          if (op.operation === 'insert') {
            await serverInsert(op.table, op.data);
          } else if (op.operation === 'update') {
            await serverUpdate(op.table, op.id, op.data);
          } else if (op.operation === 'delete') {
            await serverDelete(op.table, op.id);
          }
          await queueDelete(op.id);
          _queueLength = Math.max(0, _queueLength - 1);
          logEvent('synced', op.table, 1, op.operation);
          emitStatus(getStatus());
        } catch (err) {
          logEvent('error', op.table, 1, err.message);
          console.warn('[UkmSync] Failed to sync item', op, err);
          // Stop processing further items to preserve order
          break;
        }
      }

      _lastSyncAt = new Date().toISOString();
      _syncListeners.forEach(function (cb) { try { cb(getStatus()); } catch (e) {} });
    } finally {
      _syncing = false;
      emitStatus(getStatus());
    }
  }

  // ----------------------------------------------------------
  // Polling + online/offline
  // ----------------------------------------------------------
  var _debounceTimer = null;
  function scheduleSync() {
    if (_debounceTimer) clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(function () { processQueue(); }, 800);
  }

  function startPolling() {
    if (_pollTimer) clearInterval(_pollTimer);
    _pollTimer = setInterval(function () {
      if (_online) processQueue();
    }, CONFIG.pollMs);
  }

  window.addEventListener('online', function () {
    _online = true;
    emitStatus(getStatus());
    logEvent('pull', null, 0, 'back online');
    processQueue();
  });
  window.addEventListener('offline', function () {
    _online = false;
    emitStatus(getStatus());
  });

  // ----------------------------------------------------------
  // Public API — UkmSync global
  // ----------------------------------------------------------
  var UkmSync = {
    config: CONFIG,

    insert: function (table, data) {
      return enqueue({ table: table, operation: 'insert', data: data });
    },

    update: function (table, id, patch) {
      return enqueue({ table: table, operation: 'update', id: id, data: patch });
    },

    remove: function (table, id) {
      return enqueue({ table: table, operation: 'delete', id: id });
    },
    // alias
    delete: function (table, id) { return UkmSync.remove(table, id); },

    select: async function (table, options) {
      var cacheKey = 'select:' + table + ':' + JSON.stringify(options || {});
      if (!_online) {
        var cached = await cacheGet(cacheKey);
        return cached || [];
      }
      try {
        var rows = await serverSelect(table, options);
        await cacheSet(cacheKey, rows);
        logEvent('pull', table, rows.length, 'select');
        return rows;
      } catch (err) {
        var cached = await cacheGet(cacheKey);
        if (cached) return cached;
        throw err;
      }
    },

    sync: function () { return processQueue(); },

    status: function () { return getStatus(); },

    onStatusChange: function (cb) {
      _statusListeners.push(cb);
      cb(getStatus());
      return function () { _statusListeners = _statusListeners.filter(function (f) { return f !== cb; }); };
    },

    onSync: function (cb) {
      _syncListeners.push(cb);
      return function () { _syncListeners = _syncListeners.filter(function (f) { return f !== cb; }); };
    },

    queueLength: function () { return _queueLength; },

    clearQueue: async function () {
      var items = await queueGetAll();
      for (var i = 0; i < items.length; i++) await queueDelete(items[i].id);
      _queueLength = 0;
      emitStatus(getStatus());
    }
  };

  // ----------------------------------------------------------
  // Boot
  // ----------------------------------------------------------
  (async function boot() {
    try {
      await openDb();
      var items = await queueGetAll();
      _queueLength = items.length;
    } catch (e) {
      console.warn('[UkmSync] IndexedDB unavailable, running online-only.', e);
    }
    emitStatus(getStatus());
    startPolling();
    if (_online && CONFIG.enabled) processQueue();
    console.log('[UkmSync] Ready. Project:', CONFIG.projectSlug, '| strategy:', CONFIG.strategy, '| enabled:', CONFIG.enabled);
  })();

  // Expose globally
  window.UkmSync = UkmSync;

})();
