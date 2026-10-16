/* ============================================================
   UkmSync SDK — v2.0 (backend-connected)
   Offline-first sync for Ukmbase projects.
   Drop into any web app:
     <script src="...ukmsync.js"
             data-ukm-project="my-app"
             data-ukm-backend-url="https://ukmsync-server.onrender.com"
             data-ukm-supabase-url="https://xxx.supabase.co"
             data-ukm-anon-key="sb_..."
             defer></script>
   ============================================================ */

(function () {
  'use strict';

  // ----------------------------------------------------------
  // CONFIG
  // ----------------------------------------------------------
  var scriptEl = document.currentScript;
  if (!scriptEl) {
    var all = document.getElementsByTagName('script');
    for (var i = all.length - 1; i >= 0; i--) {
      if (all[i].hasAttribute('data-ukm-project')) { scriptEl = all[i]; break; }
    }
  }
  if (!scriptEl) { console.warn('[UkmSync] No config script tag found.'); return; }

  var CONFIG = {
    projectSlug: scriptEl.getAttribute('data-ukm-project') || 'unknown',
    backendUrl:  (scriptEl.getAttribute('data-ukm-backend-url') || '').replace(/\/$/, ''),
    supabaseUrl: scriptEl.getAttribute('data-ukm-supabase-url') || '',
    anonKey:     scriptEl.getAttribute('data-ukm-anon-key') || '',
    enabled:     (scriptEl.getAttribute('data-ukm-enabled') || 'true') === 'true',
    strategy:    scriptEl.getAttribute('data-ukm-strategy') || 'last-write-wins',
    tables:      (scriptEl.getAttribute('data-ukm-tables') || '').split(',').map(function (t) { return t.trim(); }).filter(Boolean),
    pollMs:      parseInt(scriptEl.getAttribute('data-ukm-poll-ms'), 10) || 15000,
    logToServer: (scriptEl.getAttribute('data-ukm-log') || 'true') === 'true',
    clientId:    'cli_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
  };

  if (!CONFIG.supabaseUrl || !CONFIG.anonKey) {
    console.warn('[UkmSync] Missing supabase URL or anon key.'); return;
  }

  var DB_NAME = 'ukmsync_' + CONFIG.projectSlug;
  var DB_VERSION = 1;
  var QUEUE_STORE = 'queue';
  var CACHE_STORE = 'cache';

  var _db = null;
  var _online = navigator.onLine;
  var _pollTimer = null;
  var _syncing = false;
  var _queueLength = 0;
  var _lastSyncAt = null;
  var _projectId = null;
  var _logBuffer = [];
  var _logFlushTimer = null;
  var _statusListeners = [];
  var _syncListeners = [];
  var _pendingLogs = [];

  // ----------------------------------------------------------
  // IndexedDB
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

  function queueAdd(op) { return tx([QUEUE_STORE], 'readwrite', function (s) { return s.add(op); }); }
  function queueDelete(id) { return tx([QUEUE_STORE], 'readwrite', function (s) { return s.delete(id); }); }
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
  // Supabase REST
  // ----------------------------------------------------------
  function restHeaders(extra) {
    var h = { 'apikey': CONFIG.anonKey, 'Content-Type': 'application/json', 'Prefer': 'return=representation' };
    if (CONFIG.anonKey.indexOf('sb_publishable_') !== 0) h['Authorization'] = 'Bearer ' + CONFIG.anonKey;
    if (extra) { for (var k in extra) h[k] = extra[k]; }
    return h;
  }
  function restUrl(path) { return CONFIG.supabaseUrl + '/rest/v1/' + path; }

  async function serverInsert(table, data) {
    var res = await fetch(restUrl(table), { method: 'POST', headers: restHeaders(), body: JSON.stringify(data) });
    if (!res.ok) throw new Error('Insert failed (' + res.status + '): ' + await res.text());
    return res.json();
  }
  async function serverUpdate(table, id, patch) {
    var res = await fetch(restUrl(table + '?id=eq.' + encodeURIComponent(id)), { method: 'PATCH', headers: restHeaders(), body: JSON.stringify(patch) });
    if (!res.ok) throw new Error('Update failed (' + res.status + '): ' + await res.text());
    return res.json();
  }
  async function serverDelete(table, id) {
    var res = await fetch(restUrl(table + '?id=eq.' + encodeURIComponent(id)), { method: 'DELETE', headers: restHeaders({ 'Prefer': 'return=minimal' }) });
    if (!res.ok && res.status !== 204) throw new Error('Delete failed (' + res.status + ')');
    return true;
  }
  async function serverSelect(table, options) {
    options = options || {};
    var qs = 'select=*';
    if (options.limit) qs += '&limit=' + options.limit;
    if (options.order) qs += '&order=' + options.order;
    if (options.eq) {
      Object.keys(options.eq).forEach(function (k) { qs += '&' + k + '=eq.' + encodeURIComponent(options.eq[k]); });
    }
    var res = await fetch(restUrl(table + '?' + qs), { headers: restHeaders() });
    if (!res.ok) throw new Error('Select failed (' + res.status + ')');
    return res.json();
  }

  // ----------------------------------------------------------
  // Backend: lookup
  // ----------------------------------------------------------
  async function backendLookup() {
    if (!CONFIG.backendUrl) return null;
    try {
      var res = await fetch(CONFIG.backendUrl + '/api/sync/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: CONFIG.projectSlug })
      });
      if (!res.ok) return null;
      var data = await res.json();
      if (data && data.project_id) {
        _projectId = data.project_id;
        if (data.config) {
          if (typeof data.config.enabled === 'boolean') CONFIG.enabled = data.config.enabled;
          if (data.config.conflict_strategy) CONFIG.strategy = data.config.conflict_strategy;
          if (Array.isArray(data.config.tables_to_sync) && data.config.tables_to_sync.length) CONFIG.tables = data.config.tables_to_sync;
          if (data.config.poll_interval_ms) CONFIG.pollMs = data.config.poll_interval_ms;
        }
        console.log('[UkmSync] Backend linked. Project:', data.project_name, '(' + _projectId + ')');
      }
      return data;
    } catch (e) {
      console.warn('[UkmSync] Backend lookup failed. Running offline-first only.', e.message);
      return null;
    }
  }

  // ----------------------------------------------------------
  // Backend: log to server (batched)
  // ----------------------------------------------------------
  function logEvent(eventType, table, recordCount, message) {
    // Always log to console too
    console.log('[UkmSync:' + eventType + ']', table || '', recordCount || '', message || '');

    if (!CONFIG.logToServer || !CONFIG.backendUrl || !_projectId) return;

    _logBuffer.push({
      project_id: _projectId,
      client_id: CONFIG.clientId,
      event_type: eventType,
      table_name: table || null,
      record_count: recordCount || 0,
      message: message || null
    });

    // Cap buffer to avoid unbounded growth
    if (_logBuffer.length > 50) _logBuffer = _logBuffer.slice(-50);

    scheduleLogFlush();
  }

  function scheduleLogFlush() {
    if (_logFlushTimer) return;
    _logFlushTimer = setTimeout(flushLogs, 1500);
  }

  async function flushLogs() {
    _logFlushTimer = null;
    if (_logBuffer.length === 0) return;
    if (!_online) return;

    var batch = _logBuffer.slice();
    _logBuffer = [];

    try {
      var res = await fetch(CONFIG.backendUrl + '/api/sync/log/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: batch })
      });
      if (!res.ok) throw new Error('Log batch failed: ' + res.status);
    } catch (e) {
      // Requeue on failure (cap again)
      _logBuffer = batch.concat(_logBuffer).slice(-50);
      console.warn('[UkmSync] Log flush failed, requeued:', e.message);
    }
  }

  // ----------------------------------------------------------
  // Status
  // ----------------------------------------------------------
  function getStatus() {
    return {
      online: _online,
      syncing: _syncing,
      queueLength: _queueLength,
      lastSyncAt: _lastSyncAt,
      project: CONFIG.projectSlug,
      projectId: _projectId,
      clientId: CONFIG.clientId,
      backendLinked: !!_projectId
    };
  }
  function emitStatus() {
    var s = getStatus();
    _statusListeners.forEach(function (cb) { try { cb(s); } catch (e) {} });
  }

  // ----------------------------------------------------------
  // Enqueue writes
  // ----------------------------------------------------------
  async function enqueue(op) {
    if (!CONFIG.enabled) return null;
    var record = {
      table: op.table,
      operation: op.operation,
      data: op.data,
      id: op.id,
      queuedAt: Date.now()
    };
    var id = await queueAdd(record);
    record.id = id;
    _queueLength++;
    emitStatus();
    logEvent('queued', op.table, 1, op.operation);
    scheduleSync();
    return id;
  }

  // ----------------------------------------------------------
  // Process queue
  // ----------------------------------------------------------
  async function processQueue() {
    if (_syncing || !_online || !CONFIG.enabled) return;
    _syncing = true;
    emitStatus();

    try {
      var items = await queueGetAll();
      if (items.length === 0) { _syncing = false; emitStatus(); return; }
      items.sort(function (a, b) { return a.queuedAt - b.queuedAt; });

      for (var i = 0; i < items.length; i++) {
        var op = items[i];
        try {
          if (op.operation === 'insert') await serverInsert(op.table, op.data);
          else if (op.operation === 'update') await serverUpdate(op.table, op.id, op.data);
          else if (op.operation === 'delete') await serverDelete(op.table, op.id);
          await queueDelete(op.id);
          _queueLength = Math.max(0, _queueLength - 1);
          logEvent('synced', op.table, 1, op.operation);
          emitStatus();
        } catch (err) {
          logEvent('error', op.table, 1, err.message);
          console.warn('[UkmSync] Item failed:', op, err);
          break; // preserve order
        }
      }

      _lastSyncAt = new Date().toISOString();
      _syncListeners.forEach(function (cb) { try { cb(getStatus()); } catch (e) {} });
      flushLogs();
    } finally {
      _syncing = false;
      emitStatus();
    }
  }

  var _debounceTimer = null;
  function scheduleSync() {
    if (_debounceTimer) clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(processQueue, 800);
  }

  function startPolling() {
    if (_pollTimer) clearInterval(_pollTimer);
    _pollTimer = setInterval(function () { if (_online) processQueue(); }, CONFIG.pollMs);
  }

  window.addEventListener('online', function () {
    _online = true; emitStatus();
    logEvent('pull', null, 0, 'back online');
    processQueue();
  });
  window.addEventListener('offline', function () {
    _online = false; emitStatus();
  });

  // ----------------------------------------------------------
  // Public API
  // ----------------------------------------------------------
  var UkmSync = {
    config: CONFIG,

    insert: function (table, data) { return enqueue({ table: table, operation: 'insert', data: data }); },
    update: function (table, id, patch) { return enqueue({ table: table, operation: 'update', id: id, data: patch }); },
    remove: function (table, id) { return enqueue({ table: table, operation: 'delete', id: id }); },
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
        var cached2 = await cacheGet(cacheKey);
        if (cached2) return cached2;
        throw err;
      }
    },

    sync: function () { return processQueue(); },
    status: function () { return getStatus(); },

    onStatusChange: function (cb) {
      _statusListeners.push(cb); cb(getStatus());
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
      _queueLength = 0; emitStatus();
    },

    // Manual log hook — for app code to note events
    log: function (eventType, table, recordCount, message) {
      logEvent(eventType, table, recordCount, message);
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

    // Try to link to backend
    await backendLookup();

    emitStatus();
    startPolling();
    if (_online && CONFIG.enabled) processQueue();

    console.log('[UkmSync] Ready. Project:', CONFIG.projectSlug,
      '| backend:', CONFIG.backendUrl ? 'linked' : 'none',
      '| strategy:', CONFIG.strategy,
      '| enabled:', CONFIG.enabled);
  })();

  window.UkmSync = UkmSync;
})();
