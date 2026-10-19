(function() {
    // 1. Get config from the script tag
    const scriptTag = document.currentScript || document.querySelector('script[data-ukm-project]');
    if (!scriptTag) return console.warn('UkmSync: Script tag missing.');

    const config = {
        project: scriptTag.getAttribute('data-ukm-project'),
        supabaseUrl: scriptTag.getAttribute('data-ukm-supabase-url'),
        anonKey: scriptTag.getAttribute('data-ukm-anon-key'),
        enabled: scriptTag.getAttribute('data-ukm-enabled') === 'true',
        pollMs: parseInt(scriptTag.getAttribute('data-ukm-poll-ms') || '15000', 10)
    };

    if (!config.enabled) return console.log('UkmSync: Sync is disabled in dashboard.');
    if (!config.supabaseUrl || !config.anonKey) return console.error('UkmSync: Missing URL or Key.');

    console.log('⚡ UkmSync SDK Initialized for Project:', config.project);

    // 2. IndexedDB Setup
    const DB_NAME = 'ukmsync_db';
    const STORE_NAME = 'offline_queue';

    function openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, 1);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                }
            };
        });
    }

    async function queueRequest(req) {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.add(req);
        return new Promise(resolve => tx.oncomplete = resolve);
    }

    async function getQueuedRequests() {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();
        return new Promise((resolve) => {
            request.onsuccess = () => resolve(request.result || []);
        });
    }

    async function removeQueuedRequest(id) {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(id);
    }

    // 3. The Sync Engine
    let isSyncing = false;
    
    async function processQueue() {
        if (isSyncing || !navigator.onLine) return;
        isSyncing = true;

        const queue = await getQueuedRequests();
        if (queue.length === 0) {
            isSyncing = false;
            return;
        }

        console.log(`📡 UkmSync: Found ${queue.length} offline operations. Syncing...`);

        for (const item of queue) {
            try {
                // Reconstruct the fetch request
                const originalUrl = item.url;
                const options = {
                    method: item.method,
                    headers: item.headers,
                    body: item.body
                };

                const res = await fetch(originalUrl, options);
                
                // If successful (or 400-level error like duplicate, just drop it), remove from queue
                if (res.ok || (res.status >= 400 && res.status < 500)) {
                    await removeQueuedRequest(item.id);
                }
            } catch (err) {
                console.warn('UkmSync: Sync failed, will retry later.', err);
                break; // Stop processing if network drops again
            }
        }

        isSyncing = false;
        if ((await getQueuedRequests()).length === 0) {
            console.log('✅ UkmSync: All offline data synced successfully!');
        }
    }

    window.addEventListener('online', processQueue);
    setInterval(processQueue, config.pollMs);

    // 4. The Fetch Interceptor
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const [resource, options = {}] = args;
        const url = typeof resource === 'string' ? resource : resource.url;
        const method = (options.method || 'GET').toUpperCase();

        // We only care about modifying requests to THIS project's Supabase REST API
        // And only write operations (POST, PUT, PATCH, DELETE)
        const isSupabaseRest = url.includes(config.supabaseUrl) && url.includes('/rest/v1/');
        const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

        if (isSupabaseRest && isWrite && !navigator.onLine) {
            console.log('🔌 UkmSync: Offline - Intercepted write to', url.split('/rest/v1/')[1]);
            
            // Queue it
            await queueRequest({
                url: url,
                method: method,
                headers: options.headers || {},
                body: options.body || null
            });

            // Return a fake "Success" response to the app so the UI doesn't break
            return new Response(JSON.stringify({ ok: true, offline: true }), {
                status: 201,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // If online, proceed normally
        return originalFetch.apply(this, args);
    };

    // Try to sync immediately on load
    if (navigator.onLine) processQueue();
})();
