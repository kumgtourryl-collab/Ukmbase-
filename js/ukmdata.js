import { SUPABASE_URL } from './config.js';
import { showToast, escapeHtml, formatBytes } from './utils.js';
import { state } from './state.js';
import { aiCall, aiFormatError } from './ai.js';

// ============================================
// PROJECT SELECT & ENABLE
// ============================================
export function populateUkmDataProjectSelect() {
    const sel = document.getElementById('ukmdata-project-select'); if (!sel) return;
    const own = state.projectsCache.filter(p => p.owner_id === state.currentUser.id);
    if (own.length === 0) {
        document.getElementById('ukmdata-empty').classList.remove('hidden');
        document.getElementById('ukmdata-panel').classList.add('hidden');
        sel.innerHTML = '<option value="">— no projects —</option>';
        return;
    }
    document.getElementById('ukmdata-empty').classList.add('hidden');
    let html = ''; own.forEach(p => { html += '<option value="' + p.id + '">' + escapeHtml(p.name) + '</option>'; });
    const current = sel.value; sel.innerHTML = html;
    if (current && own.find(p => p.id === current)) sel.value = current; else sel.value = own[0].id;
    onUkmDataProjectChange();
}

export async function onUkmDataProjectChange() {
    const sel = document.getElementById('ukmdata-project-select'); if (!sel || !sel.value) return;
    state.currentUkmDataProjectId = sel.value; document.getElementById('ukmdata-panel').classList.remove('hidden');
    await loadUkmDataState();
}

export async function loadUkmDataState() {
    if (!state.currentUkmDataProjectId || !state.currentUser) return;
    const { data: schemaRow } = await window.supabaseClient.from('project_schemas').select('*').eq('project_id', state.currentUkmDataProjectId).maybeSingle();
    const cardIds = ['info', 'tables', 'sql', 'auth', 'storage', 'pages', 'crons', 'webhooks', 'mail', 'logs', 'apikeys'];

    if (!schemaRow) {
        state.ukmDataSchema = null;
        document.getElementById('ukmdata-enable-card').classList.remove('hidden');
        cardIds.forEach(id => { const el = document.getElementById('ukmdata-' + id + '-card'); if (el) el.classList.add('hidden'); });
        return;
    }

    state.ukmDataSchema = schemaRow.schema_name;
    document.getElementById('ukmdata-enable-card').classList.add('hidden');
    cardIds.forEach(id => { const el = document.getElementById('ukmdata-' + id + '-card'); if (el) el.classList.remove('hidden'); });
    document.getElementById('ukmdata-schema-name').textContent = state.ukmDataSchema;

    try { await loadUkmDataTables(); } catch(e) { console.warn('Tables missing', e); }
    try { await loadUkmDataUsers(); } catch(e) { console.warn('Users missing', e); }
    try { await loadUkmDataFiles(); } catch(e) { console.warn('Files missing', e); }
    try { await loadApiKeys(); } catch(e) { console.warn('API keys missing', e); }
    try { await loadCronJobs(); } catch(e) { console.warn('Crons missing', e); }
    try { await loadUkmDataWebhooks(); } catch(e) { console.warn('Webhooks missing', e); }
    try { await loadEmailLogs(); } catch(e) { console.warn('Emails missing', e); }
    try { await loadActivityLogs(); } catch(e) { console.warn('Logs missing', e); }
    try { await loadProjectPages(); } catch(e) { console.warn('Pages missing', e); }
}

export async function enableUkmData() {
    if (!state.currentUkmDataProjectId) return;
    const btn = document.getElementById('ukmdata-enable-btn'); btn.textContent = 'Enabling...'; btn.disabled = true;
    try {
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        const res = await fetch(SUPABASE_URL + '/functions/v1/ukmdata', { method: 'POST', headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'enable', project_id: state.currentUkmDataProjectId }) });
        const data = await res.json(); if (data.error) { showToast(data.error, 'error'); return; }
        showToast('Ukmbase Data enabled', 'success'); await loadUkmDataState();
    } catch (err) { showToast(err.message, 'error'); } finally { btn.textContent = 'Enable for this project'; btn.disabled = false; }
}

export function copyUkmDataConnection() {
    const txt = 'REST URL:    ' + SUPABASE_URL + '/rest/v1/\n' +
        'Auth URL:    ' + SUPABASE_URL + '/functions/v1/ukmauth\n' +
        'Storage URL: ' + SUPABASE_URL + '/functions/v1/ukmstore\n' +
        'Schema:      ' + (state.ukmDataSchema || '—') + '\n' +
        'Anon Key:    ' + state.currentProfile?.supabase_anon_key; // Adjust if needed
    navigator.clipboard.writeText(txt);
    showToast('Copied connection info', 'success');
}

// ============================================
// TABLES
// ============================================
export async function loadUkmDataTables() {
    const loading = document.getElementById('ukmdata-tables-loading');
    const list = document.getElementById('ukmdata-tables-list');
    const empty = document.getElementById('ukmdata-tables-empty');
    loading.classList.remove('hidden'); list.classList.add('hidden'); empty.classList.add('hidden');
    try {
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        const res = await fetch(SUPABASE_URL + '/functions/v1/ukmdata', { method: 'POST', headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'list', project_id: state.currentUkmDataProjectId }) });
        const data = await res.json(); loading.classList.add('hidden');
        if (data.error) return showToast(data.error, 'error');
        state.ukmDataTables = data.tables || [];
        if (state.ukmDataTables.length === 0) { empty.classList.remove('hidden'); return; }
        list.classList.remove('hidden');
        list.innerHTML = state.ukmDataTables.map(t => `
            <div class="rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3" style="background: var(--bg); border: 1px solid var(--border);">
                <div class="flex items-center gap-3 min-w-0">
                    <div class="w-8 h-8 rounded flex items-center justify-center flex-shrink-0" style="background: rgba(139,92,246,0.15);"><svg class="w-4 h-4" style="color: #8B5CF6;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M3 14h18m-9-4v8m-7-4h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg></div>
                    <div class="min-w-0"><p class="text-sm font-bold truncate mono" style="color: var(--text);">${escapeHtml(t.table_name)}</p></div>
                </div>
                <div class="flex flex-wrap items-center gap-2">
                    <div class="flex items-center gap-1 px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg)]"><span class="text-[9px] font-bold uppercase" style="color: ${t.rls_enabled ? 'var(--green)' : 'var(--text-dim)'}">Lock</span><label class="switch" style="width: 32px; height: 18px;"><input type="checkbox" ${t.rls_enabled ? 'checked' : ''} onchange="window.toggleTableRLS('${t.table_name}', this.checked)"><span class="slider" style="border-radius: 18px;"></span></label></div>
                    <div class="flex items-center gap-1 px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg)]"><span class="text-[9px] font-bold uppercase" style="color: ${t.realtime_enabled ? 'var(--cyan)' : 'var(--text-dim)'}">Live</span><label class="switch" style="width: 32px; height: 18px;"><input type="checkbox" ${t.realtime_enabled ? 'checked' : ''} onchange="window.toggleTableRealtime('${t.table_name}', this.checked)"><span class="slider" style="border-radius: 18px;"></span></label></div>
                    <button onclick="window.viewTableData('${t.table_name}')" class="text-[10px] font-bold px-3 py-1.5 rounded-lg" style="background: rgba(139,92,246,0.1); color: #8B5CF6; border: 1px solid rgba(139,92,246,0.3);">View</button>
                    <button onclick="window.openChartModal('${t.table_name}')" class="text-[10px] font-bold px-2 py-1.5 rounded-lg" style="background: rgba(245,158,11,0.1); color: var(--amber); border: 1px solid rgba(245,158,11,0.3);">Chart</button>
                    <button onclick="window.openSeedDataModal('${t.table_name}')" class="text-[10px] font-bold px-2 py-1.5 rounded-lg" style="background: rgba(16,185,129,0.1); color: var(--green); border: 1px solid rgba(16,185,129,0.3);">Seed</button>
                    <button onclick="window.copyFormLink('${t.table_name}')" class="text-[10px] font-bold px-2 py-1.5 rounded-lg" style="background: rgba(236,72,153,0.1); color: #EC4899; border: 1px solid rgba(236,72,153,0.3);">Form</button>
                    <input type="file" id="csv-input-${t.table_name}" accept=".csv" class="hidden" onchange="window.handleCsvUpload(event, '${t.table_name}')">
                    <button onclick="document.getElementById('csv-input-${t.table_name}').click()" class="text-[10px] font-bold px-2 py-1.5 rounded-lg" style="background: rgba(16,185,129,0.1); color: var(--green); border: 1px solid rgba(16,185,129,0.3);">CSV</button>
                    <button onclick="window.showTableApi('${t.table_name}')" class="text-[10px] font-bold px-2 py-1.5 rounded-lg" style="background: rgba(6,182,212,0.1); color: var(--cyan); border: 1px solid rgba(6,182,212,0.3);">API</button>
                    <button onclick="window.dropUkmDataTable('${t.table_name}')" class="p-1.5 text-red-400"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22"></path></svg></button>
                </div>
            </div>
        `).join('');
    } catch (err) { loading.classList.add('hidden'); showToast(err.message, 'error'); }
}

export function openCreateTableModal() {
    if (!state.ukmDataSchema) return showToast('Enable Ukmbase Data first', 'error');
    document.getElementById('create-table-modal').classList.remove('hidden');
    document.getElementById('new-table-name').value = '';
    document.getElementById('new-table-columns').innerHTML = '';
    state.ukmDataColumnCounter = 0; addColumnRow();
}
export function closeCreateTableModal() { document.getElementById('create-table-modal').classList.add('hidden'); }
export function addColumnRow() {
    state.ukmDataColumnCounter++; const container = document.getElementById('new-table-columns');
    const row = document.createElement('div'); row.className = 'flex gap-2 items-center';
    row.innerHTML = '<input type="text" class="col-name flex-1 rounded-lg px-3 py-2 mono text-xs focus:outline-none" placeholder="column_name" style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"><select class="col-type rounded-lg px-2 py-2 text-xs focus:outline-none" style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"><option value="text">text</option><option value="number">number</option><option value="boolean">boolean</option><option value="date">date</option><option value="json">json</option></select><label class="flex items-center gap-1 text-[10px]" style="color: var(--text-muted);"><input type="checkbox" class="col-nullable"> null</label><button type="button" class="col-remove p-1 text-red-400">✕</button>';
    row.querySelector('.col-remove').onclick = () => row.remove(); container.appendChild(row);
}
export async function createUkmDataTable() {
    const name = document.getElementById('new-table-name').value.trim().toLowerCase();
    const errEl = document.getElementById('create-table-error'); const btn = document.getElementById('create-table-submit');
    if (!name || !/^[a-z][a-z0-9_]*$/.test(name)) return showToast('Invalid table name', 'error');
    const rows = document.querySelectorAll('#new-table-columns > div'); const columns = [];
    for (let row of rows) {
        const colName = row.querySelector('.col-name').value.trim();
        if (colName) columns.push({ name: colName, type: row.querySelector('.col-type').value, nullable: row.querySelector('.col-nullable').checked });
    }
    if (columns.length === 0) return showToast('Add at least one column', 'error');
    btn.textContent = 'Creating...'; btn.disabled = true;
    try {
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        const res = await fetch(SUPABASE_URL + '/functions/v1/ukmdata', { method: 'POST', headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create_table', project_id: state.currentUkmDataProjectId, table: { name, columns } }) });
        const data = await res.json(); if (data.error) throw new Error(data.error);
        closeCreateTableModal(); showToast('Table created!', 'success'); await loadUkmDataTables();
    } catch (err) { errEl.textContent = err.message; errEl.classList.remove('hidden'); } finally { btn.textContent = 'Create Table'; btn.disabled = false; }
}

export async function toggleTableRLS(tableName, isEnabled) {
    try {
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        await fetch(SUPABASE_URL + '/functions/v1/ukmdata', { method: 'POST', headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'toggle_rls', project_id: state.currentUkmDataProjectId, table_name: tableName, enable: isEnabled }) });
        showToast(isEnabled ? 'Table locked' : 'Table public', 'success'); loadUkmDataTables();
    } catch (err) { showToast(err.message, 'error'); loadUkmDataTables(); }
}
export async function toggleTableRealtime(tableName, isEnabled) {
    try {
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        await fetch(SUPABASE_URL + '/functions/v1/ukmdata', { method: 'POST', headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'toggle_realtime', project_id: state.currentUkmDataProjectId, table_name: tableName, enable: isEnabled }) });
        showToast(isEnabled ? 'Realtime enabled' : 'Realtime disabled', 'success'); loadUkmDataTables();
    } catch (err) { showToast(err.message, 'error'); loadUkmDataTables(); }
}
export async function dropUkmDataTable(name) {
    if (!confirm('Delete this table?')) return;
    try {
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        await fetch(SUPABASE_URL + '/functions/v1/ukmdata', { method: 'POST', headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'drop_table', project_id: state.currentUkmDataProjectId, table_name: name }) });
        showToast('Table deleted', 'success'); await loadUkmDataTables();
    } catch (err) { showToast(err.message, 'error'); }
}
