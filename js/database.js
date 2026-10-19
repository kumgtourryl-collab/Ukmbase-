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
    // (Add the rest of your snippet logic here)
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

// (Paste the rest of your Connection, Query, and Sync functions here: createConnection, deleteConnection, openConnection, selectTable, renderRows, generateSQL, loadQueryHistory, populateSyncProjectSelect, etc.)
// Just remember to change `currentUser` to `state.currentUser`, etc.
