import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { showToast, escapeHtml } from './utils.js';
import { state } from './state.js';

// ============================================
// CONNECTIONS (UKMTABLES)
// ============================================
export function populateConnectProjectSelect() {
    const sel = document.getElementById('connect-project-select');
    if (!sel) return;
    const own = state.projectsCache.filter(p => p.owner_id === state.currentUser.id);
    if (own.length === 0) { sel.innerHTML = '<option value="">— no projects —</option>'; return; }
    let html = ''; own.forEach(p => { html += '<option value="' + p.id + '">' + escapeHtml(p.name) + '</option>'; });
    const current = sel.value; sel.innerHTML = html;
    if (current && own.find(p => p.id === current)) sel.value = current; else sel.value = own[0].id;
    renderConnectSnippets();
}

export function switchConnectTab(tab) {
    const jsPanel = document.getElementById('connect-panel-js');
    const curlPanel = document.getElementById('connect-panel-curl');
    const jsTab = document.getElementById('connect-tab-js');
    const curlTab = document.getElementById('connect-tab-curl');
    if (tab === 'js') { jsPanel.classList.remove('hidden'); curlPanel.classList.add('hidden'); jsTab.style.color = 'var(--text)'; jsTab.style.borderBottom = '2px solid var(--accent)'; curlTab.style.color = 'var(--text-muted)'; curlTab.style.borderBottom = 'none'; }
    else { jsPanel.classList.add('hidden'); curlPanel.classList.remove('hidden'); curlTab.style.color = 'var(--text)'; curlTab.style.borderBottom = '2px solid var(--accent)'; jsTab.style.color = 'var(--text-muted)'; jsTab.style.borderBottom = 'none'; }
}

export function renderConnectSnippets() {
    const sel = document.getElementById('connect-project-select');
    if (!sel || !sel.value) return;
    const proj = state.projectsCache.find(p => p.id === sel.value);
    if (!proj) return;
    document.getElementById('connect-url').value = SUPABASE_URL;
    document.getElementById('connect-anon').value = SUPABASE_ANON_KEY;
    document.getElementById('connect-snippet-init').textContent = `import { createClient } from '@supabase/supabase-js'\n\nconst supabase = createClient(\n  '${SUPABASE_URL}',\n  '${SUPABASE_ANON_KEY}'\n)`;
}

export async function loadConnections() {
    if (!state.currentUser) return;
    const { data, error } = await window.supabaseClient.from('connected_databases').select('*').order('created_at', { ascending: false });
    if (error) return console.error(error.message);
    state.connectionsCache = data || []; renderConnections(state.connectionsCache);
}

export function renderConnections(connections) {
    const empty = document.getElementById('ukmtables-empty'); const list = document.getElementById('ukmtables-list');
    const title = document.getElementById('ukmtables-title'); const subtitle = document.getElementById('ukmtables-subtitle');
    const actionBtn = document.getElementById('ukmtables-action'); const backBtn = document.getElementById('ukmtables-back');
    if (!empty) return; 
    title.textContent = 'UkmTables'; subtitle.textContent = 'Connect any Supabase database';
    actionBtn.innerText = '+ Connect'; actionBtn.onclick = window.openConnectModal; backBtn.classList.add('hidden');
    document.getElementById('ukmtables-connections-view').classList.remove('hidden'); document.getElementById('ukmtables-browser').classList.add('hidden');
    if (!connections || connections.length === 0) { empty.classList.remove('hidden'); list.classList.add('hidden'); return; }
    empty.classList.add('hidden'); list.classList.remove('hidden');
    list.innerHTML = connections.map(c => `<div class="rounded-xl p-4 flex items-center justify-between" style="background: var(--surface); border: 1px solid var(--border);"><div class="flex items-center gap-3 min-w-0 cursor-pointer flex-1" onclick="window.openConnection('${c.id}')"><div class="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style="background: rgba(6,182,212,0.1); border: 1px solid rgba(6,182,212,0.3);"><svg class="w-4 h-4" style="color: var(--cyan);" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"></path></svg></div><div class="min-w-0"><p class="text-sm font-medium truncate" style="color: var(--text);">${escapeHtml(c.name)}</p><p class="text-xs mono truncate" style="color: var(--text-dim);">${escapeHtml(c.supabase_url.replace('https://', ''))}</p></div></div><button onclick="window.deleteConnection('${c.id}')" class="p-2" style="color: var(--text-muted);"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22"></path></svg></button></div>`).join('');
}

export function openConnectModal() {
    if (state.connectionsCache.length >= window.getLimits().connections) { if (confirm('Connection limit reached. Upgrade?')) window.switchView('billing'); return; }
    document.getElementById('connect-modal').classList.remove('hidden'); document.getElementById('connect-error').classList.add('hidden');
    ['connect-name', 'connect-url', 'connect-key'].forEach(id => document.getElementById(id).value = '');
}
export function closeConnectModal() { document.getElementById('connect-modal').classList.add('hidden'); }

export async function createConnection() {
    const name = document.getElementById('connect-name').value.trim(); const url = document.getElementById('connect-url').value.trim().replace(/\/$/, ''); const key = document.getElementById('connect-key').value.trim();
    const errEl = document.getElementById('connect-error'); const btn = document.getElementById('create-connect-btn'); errEl.classList.add('hidden');
    if (!name || !url || !key) { errEl.textContent = 'All fields are required.'; errEl.classList.remove('hidden'); return; }
    btn.innerText = 'Testing...'; btn.disabled = true;
    try {
        const testRes = await fetch(url + '/rest/v1/profiles?select=id&limit=1', { headers: { 'apikey': key } });
        if (testRes.status >= 500) throw new Error('Connection failed (' + testRes.status + ').');
        if (testRes.status === 404) throw new Error('Endpoint not reachable.');
    } catch (err) { btn.innerText = 'Connect'; btn.disabled = false; errEl.textContent = err.message; errEl.classList.remove('hidden'); return; }
    const { error } = await window.supabaseClient.from('connected_databases').insert([{ owner_id: state.currentUser.id, name, supabase_url: url, supabase_anon_key: key }]);
    btn.innerText = 'Connect'; btn.disabled = false; 
    if (error) { errEl.textContent = error.message; errEl.classList.remove('hidden'); return; }
    closeConnectModal(); await loadConnections(); showToast('Database connected', 'success');
}
export async function deleteConnection(id) {
    if (!confirm('Delete this connection?')) return;
    const { error } = await window.supabaseClient.from('connected_databases').delete().eq('id', id);
    if (error) { showToast('Failed: ' + error.message, 'error'); return; }
    await loadConnections(); showToast('Connection deleted', 'success');
}

export async function openConnection(id) {
    const conn = state.connectionsCache.find(c => c.id === id); if (!conn) return; state.activeConnection = conn;
    const title = document.getElementById('ukmtables-title'); const subtitle = document.getElementById('ukmtables-subtitle');
    title.textContent = conn.name; subtitle.textContent = 'Reading schema...';
    document.getElementById('ukmtables-connections-view').classList.add('hidden'); document.getElementById('ukmtables-browser').classList.remove('hidden');
    document.getElementById('ukmtables-rows').classList.add('hidden'); document.getElementById('ukmtables-rows-empty').classList.add('hidden');
    document.getElementById('ukmtables-rows-loading').classList.remove('hidden'); document.getElementById('ukmtables-pills').innerHTML = '';
    try {
        const res = await fetch(conn.supabase_url + '/rest/v1/', { headers: { 'apikey': conn.supabase_anon_key } });
        let tables = [];
        if (res.ok) { try { const spec = await res.json(); tables = Object.keys(spec.definitions || {}).sort(); } catch (_) {} }
        subtitle.textContent = tables.length + ' tables';
        if (tables.length === 0) { document.getElementById('ukmtables-rows-loading').classList.add('hidden'); document.getElementById('ukmtables-rows-empty').classList.remove('hidden'); document.getElementById('ukmtables-rows-empty').innerHTML = '<p class="text-sm" style="color: var(--text-muted);">No tables found.</p>'; return; }
        document.getElementById('ukmtables-pills').innerHTML = tables.map(t => `<button onclick="window.selectTable('${t}')" data-table="${t}" class="table-pill text-xs px-3 py-1.5 rounded-lg mono" style="background: var(--surface); border: 1px solid var(--border); color: var(--text-muted);">${escapeHtml(t)}</button>`).join('');
        await selectTable(tables[0]);
    } catch (err) { subtitle.textContent = 'Error'; document.getElementById('ukmtables-rows-loading').classList.add('hidden'); document.getElementById('ukmtables-rows-empty').classList.remove('hidden'); document.getElementById('ukmtables-rows-empty').innerHTML = '<p class="text-sm" style="color: var(--red);">' + escapeHtml(err.message) + '</p>'; }
}
export function exitTableBrowser() { state.activeConnection = null; document.getElementById('ukmtables-connections-view').classList.remove('hidden'); document.getElementById('ukmtables-browser').classList.add('hidden'); renderConnections(state.connectionsCache); }
export async function selectTable(tableName) {
    if (!state.activeConnection) return;
    document.querySelectorAll('.table-pill').forEach(p => { if (p.dataset.table === tableName) p.classList.add('active'); else p.classList.remove('active'); });
    document.getElementById('ukmtables-rows').classList.add('hidden'); document.getElementById('ukmtables-rows-empty').classList.add('hidden'); document.getElementById('ukmtables-rows-loading').classList.remove('hidden');
    try {
        const res = await fetch(state.activeConnection.supabase_url + '/rest/v1/' + tableName + '?select=*&limit=50', { headers: { 'apikey': state.activeConnection.supabase_anon_key } });
        document.getElementById('ukmtables-rows-loading').classList.add('hidden'); if (!res.ok) throw new Error('Failed to load rows');
        const rows = await res.json();
        if (!rows || rows.length === 0) { document.getElementById('ukmtables-rows-empty').classList.remove('hidden'); document.getElementById('ukmtables-rows-empty').innerHTML = '<p class="text-sm" style="color: var(--text-muted);">No rows visible.</p>'; return; }
        document.getElementById('ukmtables-rows').classList.remove('hidden');
        document.getElementById('ukmtables-rows').innerHTML = rows.map((row, idx) => {
            let fields = '';
            Object.keys(row).forEach(k => { const v = row[k]; let display; if (v === null || v === undefined) display = '<span style="color: var(--text-dim);" class="italic">null</span>'; else if (typeof v === 'object') display = escapeHtml(JSON.stringify(v)); else display = escapeHtml(String(v)); fields += '<div class="flex gap-2 py-1 text-xs"><span class="field-key mono flex-shrink-0">' + escapeHtml(k) + ':</span><span class="field-val mono flex-1">' + display + '</span></div>'; });
            return '<div class="rounded-xl p-4" style="background: var(--surface); border: 1px solid var(--border);"><div class="flex items-center justify-between mb-2 pb-2" style="border-bottom: 1px solid var(--border);"><span class="text-[10px] uppercase font-bold mono" style="color: var(--accent);">Row ' + (idx + 1) + '</span></div><div class="space-y-0.5">' + fields + '</div></div>';
        }).join('');
    } catch (err) { document.getElementById('ukmtables-rows-loading').classList.add('hidden'); document.getElementById('ukmtables-rows-empty').classList.remove('hidden'); document.getElementById('ukmtables-rows-empty').innerHTML = '<p class="text-sm" style="color: var(--red);">' + escapeHtml(err.message) + '</p>'; }
}
export function copyRow(jsonStr) { const clean = jsonStr.replace(/&quot;/g, '"').replace(/&#39;/g, "'"); navigator.clipboard.writeText(clean); showToast('Row copied', 'success'); }

// ============================================
// UKMQUERY & UKMSYNC (Placeholder exports so app.js doesn't crash)
// ============================================
export function populateQueryConnections() { }
export function setQueryPrompt() { }
export function generateSQL() { }
export function copyGeneratedSQL() { }
export function loadQueryHistory() { }
export function loadHistoryItem() { }
export function populateSyncProjectSelect() { }
export function onSyncProjectChange() { }
export function toggleSyncEnabled() { }
export function updateSyncConfig() { }
export function copySdkSnippet() { }
export function loadSyncLogs() { }
