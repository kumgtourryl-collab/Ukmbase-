import { showToast, escapeHtml } from './utils.js';
import { state } from './state.js';

export async function loadProjects() {
    if (!state.currentUser) return;
    document.getElementById('projects-loading').classList.remove('hidden');
    document.getElementById('projects-grid').classList.add('hidden');
    document.getElementById('empty-state').classList.add('hidden');
    
    const { data, error } = await window.supabaseClient.from('projects').select('*').order('created_at', { ascending: false });
    
    document.getElementById('projects-loading').classList.add('hidden');
    if (error) return console.error(error);
    
    state.projectsCache = data || [];
    renderProjects(state.projectsCache);
    updateStats(state.projectsCache);
    window.populateProjectSelects();
    updateOnboardingChecklist();
}

export function renderProjects(projects) {
    const emptyState = document.getElementById('empty-state'); const grid = document.getElementById('projects-grid');
    if (!projects || projects.length === 0) { emptyState.classList.remove('hidden'); grid.classList.add('hidden'); return; }
    emptyState.classList.add('hidden'); grid.classList.remove('hidden');
    let html = '';
    projects.forEach(p => {
        const isOwned = p.owner_id === state.currentUser.id;
        const repoPill = p.github_repo ? '<span class="mono flex items-center gap-1"><svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>' + escapeHtml(p.github_repo.split('/')[1] || p.github_repo) + '</span>' : '';
        const teamBadge = !isOwned ? '<span class="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded" style="background: rgba(139,92,246,0.15); color: #8B5CF6;">Team</span>' : '';
        
        html += `<div class="feature-card rounded-xl p-5" style="background: var(--surface); border: 1px solid var(--border);" onclick="window.openProjectDetail('${p.id}')">
            <div class="flex items-start justify-between mb-3"><div class="w-10 h-10 rounded-lg flex items-center justify-center" style="background: rgba(79,70,229,0.1); border: 1px solid rgba(79,70,229,0.3);"><svg class="w-5 h-5" style="color: var(--accent);" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg></div><div class="flex items-center gap-1">${teamBadge}<span class="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded ${p.status === 'paused' ? 'text-yellow-400 bg-yellow-400/10' : 'text-[#06B6D4] bg-[#06B6D4]/10'}">${p.status || 'active'}</span></div></div>
            <h3 class="font-bold mb-1 truncate" style="color: var(--text);">${escapeHtml(p.name)}</h3><p class="text-xs mono mb-3 truncate" style="color: var(--text-muted);">${escapeHtml(p.slug)}</p>
            <p class="text-sm line-clamp-2 mb-4" style="color: var(--text-muted);">${escapeHtml(p.description || 'No description yet.')}</p>
            <div class="flex items-center justify-between text-[10px]" style="color: var(--text-dim);"><span>${new Date(p.created_at).toLocaleDateString()}</span>${repoPill}</div></div>`;
    });
    grid.innerHTML = html;
}

export function updateStats(projects) {
    const tokens = projects.reduce((s, p) => s + (Number(p.ai_tokens_used) || 0), 0);
    const syncs = projects.reduce((s, p) => s + (Number(p.sync_ops_used) || 0), 0);
    document.getElementById('stat-tokens').innerHTML = tokens.toLocaleString() + ' <span class="text-xs font-normal" style="color: var(--text-dim);">/ 100k</span>';
    document.getElementById('stat-syncs').textContent = syncs.toLocaleString();
}

export async function createProject() {
    const name = document.getElementById('project-name').value.trim(); const slug = document.getElementById('project-slug').value.trim();
    const description = document.getElementById('project-description').value.trim();
    const errEl = document.getElementById('modal-error'); const btn = document.getElementById('create-project-btn');
    if (!name || !slug) return showToast('Name and slug required', 'error');
    btn.innerText = 'Forging...'; btn.disabled = true;
    const { error } = await window.supabaseClient.from('projects').insert([{ owner_id: state.currentUser.id, name, slug, description: description || null, status: 'active' }]);
    btn.innerText = 'Forge Project'; btn.disabled = false;
    if (error) { errEl.textContent = error.message; errEl.classList.remove('hidden'); return; }
    window.closeProjectModal(); await loadProjects(); showToast('Project forged', 'success');
}

export async function openProjectDetail(id) {
    const p = state.projectsCache.find(x => x.id === id); if (!p) return;
    state.viewingProjectId = id; const isOwned = p.owner_id === state.currentUser.id;
    document.getElementById('pd-title').textContent = p.name; const body = document.getElementById('pd-body');
    body.innerHTML = `<div class="flex items-center gap-3 flex-wrap"><span class="text-xs mono" style="color: var(--text-dim);">${escapeHtml(p.slug)}</span></div>
        <p class="text-sm" style="color: var(--text-muted);">${escapeHtml(p.description || 'No description yet.')}</p>
        <div class="space-y-2 pt-2">${isOwned ? `<button onclick="window.openProjectEdit('${p.id}')" class="w-full font-bold py-3 rounded-lg text-white" style="background: var(--accent);">Edit Project</button><button onclick="window.deleteProject('${p.id}')" class="w-full font-bold py-3 rounded-lg bg-red-500/20 border border-red-500/40 text-red-400">Delete Project</button>` : '<div class="p-4 text-center text-xs" style="color: var(--text-muted);">Team member — view only.</div>'}</div>`;
    document.getElementById('project-detail-modal').classList.remove('hidden');
}

export async function loadTeam() {
    if (!state.currentUser) return;
    const { data } = await window.supabaseClient.from('team_members').select('*').eq('owner_id', state.currentUser.id).order('invited_at', { ascending: false });
    state.teamCache = data || [];
}

export async function checkForPendingInvites() {
    if (!state.currentUser || !state.currentUser.email) return;
    const { data } = await window.supabaseClient.from('team_members').select('*, profiles:owner_id(full_name, email)').eq('invite_email', state.currentUser.email).eq('status', 'pending').maybeSingle();
    if (data) {
        state.pendingInvite = data;
        const ownerName = data.profiles?.full_name || data.profiles?.email || 'A user';
        document.getElementById('invite-banner-text').innerHTML = `<strong>${escapeHtml(ownerName)}</strong> has invited you to join their team as a <strong>${escapeHtml(data.role)}</strong>.`;
        document.getElementById('team-invite-banner').classList.remove('hidden');
    }
}

// --- ONBOARDING CHECKLIST ---
export function updateOnboardingChecklist() {
    const checklist = document.getElementById('onboarding-checklist');
    if (!checklist) return;

    // Check Step 1: Project created?
    const hasProjects = state.projectsCache.length > 0;
    const icon1 = document.getElementById('step-1-icon');
    const text1 = document.getElementById('step-1-text');
    if (icon1 && text1) {
        icon1.innerHTML = hasProjects ? '✓' : '1';
        icon1.style.background = hasProjects ? 'var(--green)' : 'var(--bg)';
        icon1.style.color = hasProjects ? 'white' : 'var(--text-muted)';
        icon1.style.borderColor = hasProjects ? 'var(--green)' : 'var(--border)';
        text1.style.textDecoration = hasProjects ? 'line-through' : 'none';
        text1.style.color = hasProjects ? 'var(--text-dim)' : 'var(--text)';
    }

    // Check Step 2: UkmData enabled?
    const hasData = state.ukmDataSchema !== null;
    const icon2 = document.getElementById('step-2-icon');
    const text2 = document.getElementById('step-2-text');
    if (icon2 && text2) {
        icon2.innerHTML = hasData ? '✓' : '2';
        icon2.style.background = hasData ? 'var(--green)' : 'var(--bg)';
        icon2.style.color = hasData ? 'white' : 'var(--text-muted)';
        icon2.style.borderColor = hasData ? 'var(--green)' : 'var(--border)';
        text2.style.textDecoration = hasData ? 'line-through' : 'none';
        text2.style.color = hasData ? 'var(--text-dim)' : 'var(--text)';
    }

    // Check Step 3: AI used?
    const hasChatted = state.chatHistory.length > 0;
    const icon3 = document.getElementById('step-3-icon');
    const text3 = document.getElementById('step-3-text');
    if (icon3 && text3) {
        icon3.innerHTML = hasChatted ? '✓' : '3';
        icon3.style.background = hasChatted ? 'var(--green)' : 'var(--bg)';
        icon3.style.color = hasChatted ? 'white' : 'var(--text-muted)';
        icon3.style.borderColor = hasChatted ? 'var(--green)' : 'var(--border)';
        text3.style.textDecoration = hasChatted ? 'line-through' : 'none';
        text3.style.color = hasChatted ? 'var(--text-dim)' : 'var(--text)';
    }

    // Hide checklist if all 3 are done
    if (hasProjects && hasData && hasChatted) {
        checklist.style.display = 'none';
    }
}
