// ============================================
// 1. CONFIG & STATE
// ============================================
const SUPABASE_URL = 'https://dwjyzqsrzdgnpwibnyjn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_4vcPyg62OqmfwNaHxx0CGA_a7O0_NJV';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const state = {
    currentUser: null, currentProfile: null, showingDashboardFor: null, pendingInvite: null,
    authMode: 'login', inRecoveryMode: false, projectsCache: [], connectionsCache: [],
    teamCache: [], chatHistory: [], allUsersCache: [], syncConfigCache: null,
    activeConnection: null, lastGeneratedSQL: '', viewingProjectId: null, linkingProjectId: null,
    currentSyncProjectId: null, currentUkmDataProjectId: null, ukmDataSchema: null,
    ukmDataTables: [], ukmDataUsers: [], ukmDataFiles: [], ukmDataColumnCounter: 0,
    currentTableData: [], currentTableName: null, editingRowId: null, impersonatingUserId: null,
    currentChartData: null, currentSeedTable: null, currentUpgradePlan: null
};

const PLAN_LIMITS = {
    free: { projects: 2, connections: 3, repos: 1, seats: 1 }, pro: { projects: 20, connections: 20, repos: 10, seats: 1 },
    team: { projects: 100, connections: 100, repos: 50, seats: 3 }, enterprise: { projects: 999, connections: 999, repos: 999, seats: 999 },
    staff: { projects: 999, connections: 999, repos: 999, seats: 999 }
};
const STAFF_ROLES = ['owner', 'admin', 'support'];
const PLAN_PRICES = { free: { label: '$0/mo' }, pro: { label: '$19/mo' }, team: { label: '$79/mo' }, enterprise: { label: 'Custom' } };
const SUPPORT_EMAIL = 'rrrylukm@gmail.com';
const SUPPORT_WA_INTL = '263774739401';

// ============================================
// 2. ERROR CATCHER & UTILS
// ============================================
let jsErrorBanner = null; let jsErrorTimer = null;
window.onerror = function(msg, url, line) {
    if (!jsErrorBanner) {
        jsErrorBanner = document.createElement('div');
        jsErrorBanner.style.cssText = 'position:fixed;bottom:10px;left:10px;right:10px;background:rgba(239,68,68,0.95);color:white;padding:12px;z-index:999999;font-size:12px;border-radius:8px;font-family:monospace;box-shadow:0 4px 20px rgba(0,0,0,0.4);';
        document.body.appendChild(jsErrorBanner);
    }
    jsErrorBanner.innerHTML = '<strong>JS Error:</strong> ' + msg + '<br><span style="font-size:10px;">Line ' + line + ' - ' + url + '</span>';
    clearTimeout(jsErrorTimer);
    jsErrorTimer = setTimeout(() => { if (jsErrorBanner) { jsErrorBanner.remove(); jsErrorBanner = null; } }, 10000);
    return false;
};

function showToast(message, type = 'success', duration = 3000) {
    const container = document.getElementById('toast-container'); if (!container) return;
    const toast = document.createElement('div'); toast.className = 'toast ' + type; toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'all 0.3s ease'; setTimeout(() => toast.remove(), 300); }, duration);
}
function escapeHtml(str) { return str ? String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;') : ''; }
function formatBytes(b) { const n = Number(b) || 0; if (n < 1024) return n + ' B'; if (n < 1048576) return (n / 1024).toFixed(1) + ' KB'; return (n / 1048576).toFixed(2) + ' MB'; }
function supportWhatsAppLink(msg) { return 'https://wa.me/' + SUPPORT_WA_INTL + '?text=' + encodeURIComponent(msg || 'Hi Ukmbase support'); }
function supportEmailLink(sub) { return 'mailto:' + SUPPORT_EMAIL + '?subject=' + encodeURIComponent(sub || 'Ukmbase support'); }
function getHeaders(key) { const h = { 'apikey': key }; if (key.indexOf('sb_publishable_') !== 0) h['Authorization'] = 'Bearer ' + key; return h; }

function getLimits() {
    if (state.currentProfile && STAFF_ROLES.includes(state.currentProfile.role)) return PLAN_LIMITS.staff;
    return PLAN_LIMITS[state.currentProfile?.plan || 'free'] || PLAN_LIMITS.free;
}
function getTeamSeatsUsed() { return 1 + state.teamCache.filter(m => m.status === 'active').length; }
function canCreateProject() { return state.projectsCache.length < getLimits().projects; }
function canCreateConnection() { return state.connectionsCache.length < getLimits().connections; }

function copyToClipboard(id, btn) {
    const el = document.getElementById(id); if (!el) return;
    navigator.clipboard.writeText(el.value || el.textContent);
    const orig = btn.innerText; btn.innerText = 'Copied!'; setTimeout(() => btn.innerText = orig, 1500);
}
function copyToClipboardText(text) { navigator.clipboard.writeText(text); showToast('Copied to clipboard!'); }

// ============================================
// 3. THEME & NAVIGATION
// ============================================
function initTheme() { applyTheme(localStorage.getItem('ukmbase-theme') || 'dark'); }
function applyTheme(theme) {
    if (theme === 'light') document.documentElement.setAttribute('data-theme', 'light');
    else document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('ukmbase-theme', theme);
    const sun = document.getElementById('theme-icon-sun'); const moon = document.getElementById('theme-icon-moon');
    if (sun && moon) {
        if (theme === 'light') { sun.classList.remove('hidden'); moon.classList.add('hidden'); }
        else { sun.classList.add('hidden'); moon.classList.remove('hidden'); }
    }
    const label = document.getElementById('settings-theme-label'); if (label) label.textContent = theme === 'light' ? 'Light' : 'Dark';
}
function toggleTheme() { const cur = localStorage.getItem('ukmbase-theme') || 'dark'; applyTheme(cur === 'dark' ? 'light' : 'dark'); showToast('Switched theme'); }

function showLandingView() {
    state.showingDashboardFor = null;
    document.getElementById('landing-view').classList.remove('hidden'); document.getElementById('auth-view').classList.add('hidden'); document.getElementById('dashboard-view').classList.add('hidden');
    document.querySelectorAll('[id^="public-"]').forEach(el => el.classList.add('hidden'));
}
function showAuthView() {
    document.getElementById('landing-view').classList.add('hidden'); document.getElementById('auth-view').classList.remove('hidden'); document.getElementById('dashboard-view').classList.add('hidden');
    setAuthMode('login');
}
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('-translate-x-full'); }

function switchView(view) {
    const views = ['overview', 'ukmai', 'ukmquery', 'ukmsync', 'ukmdata', 'ukmtables', 'connect', 'ukmpay', 'team', 'billing', 'settings', 'owner'];
    views.forEach(v => {
        const el = document.getElementById('view-' + v); const nav = document.getElementById('nav-' + v);
        if (!el) return;
        if (v === view) { el.classList.remove('hidden'); if (nav) { nav.classList.add('sidebar-active'); nav.style.color = 'var(--text)'; } }
        else { el.classList.add('hidden'); if (nav) { nav.classList.remove('sidebar-active'); nav.style.color = 'var(--text-muted)'; } }
    });
    if (view === 'ukmpay') { loadPayments(); loadPlans(); }
    if (view === 'ukmtables') { loadConnections(); }
    if (view === 'ukmquery') { loadConnections().then(() => { populateQueryConnections(); loadQueryHistory(); }); }
    if (view === 'ukmsync') { populateSyncProjectSelect(); }
    if (view === 'ukmdata') { populateUkmDataProjectSelect(); }
    if (view === 'connect') { populateConnectProjectSelect(); }
    if (view === 'team') { renderTeam(); }
    if (view === 'settings') { renderSettings(); }
    if (view === 'billing') { renderBilling(); }
    if (view === 'owner') { loadOwnerConsole(); }
    document.getElementById('sidebar').classList.add('-translate-x-full');
}

// ============================================
// 4. AUTH & PROFILE
// ============================================
function setAuthMode(mode) {
    document.getElementById('auth-email').parentElement.classList.remove('hidden');
    document.getElementById('auth-password').parentElement.parentElement.classList.remove('hidden');
    document.getElementById('auth-submit').classList.remove('hidden');
    document.getElementById('forgot-password-view').classList.add('hidden');
    const np = document.getElementById('new-password-view'); if (np) np.classList.add('hidden');

    state.authMode = mode; const isSignup = mode === 'signup';
    document.getElementById('field-fullname').classList.toggle('hidden', !isSignup);
    document.getElementById('field-confirm').classList.toggle('hidden', !isSignup);
    document.getElementById('strength-meter').classList.toggle('hidden', !isSignup);
    document.getElementById('auth-submit').textContent = isSignup ? 'Create Account' : 'Sign In';
    document.getElementById('tab-login').classList.toggle('active', !isSignup);
    document.getElementById('tab-signup').classList.toggle('active', isSignup);
    document.getElementById('auth-error').classList.add('hidden');
    document.getElementById('auth-success').classList.add('hidden');
}
function togglePassword(id, btn) { const i = document.getElementById(id); const p = i.type === 'password'; i.type = p ? 'text' : 'password'; btn.style.color = p ? 'var(--accent)' : 'var(--text-dim)'; }
function updateStrength() {
    const pwd = document.getElementById('auth-password').value; let score = 0;
    if (pwd.length >= 8) score++; if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score++; if (/\d/.test(pwd)) score++; if (/[^A-Za-z0-9]/.test(pwd)) score++; if (pwd.length >= 12) score++;
    const colors = ['#EF4444', '#EF4444', '#F59E0B', '#06B6D4', '#10B981', '#10B981']; const labels = ['Too short', 'Weak', 'Fair', 'Good', 'Strong', 'Excellent'];
    for (let i = 1; i <= 5; i++) { const bar = document.getElementById('sb-' + i); if (bar) bar.style.background = i <= score ? colors[score] : 'var(--border)'; }
    const labelEl = document.getElementById('strength-label'); if (labelEl) { labelEl.textContent = pwd ? labels[score] : 'Password strength'; labelEl.style.color = pwd ? colors[score] : 'var(--text-dim)'; }
}
async function handleAuthSubmit() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const errEl = document.getElementById('auth-error'); const succEl = document.getElementById('auth-success');
    errEl.classList.add('hidden'); succEl.classList.add('hidden');
    if (!email || !password) { errEl.textContent = 'Please fill in all fields.'; errEl.classList.remove('hidden'); return; }

    if (state.authMode === 'login') {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) { errEl.textContent = error.message; errEl.classList.remove('hidden'); }
        else { showDashboardView(data.user); }
    } else {
        const fullName = document.getElementById('auth-fullname').value.trim();
        const confirm = document.getElementById('auth-confirm').value;
        if (!fullName) { errEl.textContent = 'Name required.'; errEl.classList.remove('hidden'); return; }
        if (password !== confirm) { errEl.textContent = 'Passwords do not match.'; errEl.classList.remove('hidden'); return; }
        const { data, error } = await supabaseClient.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
        if (error) { errEl.textContent = error.message; errEl.classList.remove('hidden'); }
        else if (data.session) { showDashboardView(data.user); }
        else { succEl.textContent = 'Account created! Check your email.'; succEl.classList.remove('hidden'); }
    }
}
async function signInWithProvider(provider) { const { error } = await supabaseClient.auth.signInWithOAuth({ provider, options: { redirectTo: window.location.origin + window.location.pathname } }); if (error) showToast(error.message, 'error'); }
async function handleLogout() { await supabaseClient.auth.signOut(); state.currentUser = null; state.currentProfile = null; showLandingView(); showToast('Signed out'); }

function showForgotPasswordView() {
    document.getElementById('auth-email').parentElement.classList.add('hidden'); document.getElementById('auth-password').parentElement.parentElement.classList.add('hidden'); document.getElementById('auth-submit').classList.add('hidden');
    document.getElementById('forgot-password-view').classList.remove('hidden'); document.getElementById('reset-error').classList.add('hidden'); document.getElementById('reset-success').classList.add('hidden');
}
function hideForgotPasswordView() {
    document.getElementById('auth-email').parentElement.classList.remove('hidden'); document.getElementById('auth-password').parentElement.parentElement.classList.remove('hidden'); document.getElementById('auth-submit').classList.remove('hidden');
    document.getElementById('forgot-password-view').classList.add('hidden');
}
async function sendPasswordReset() {
    const email = document.getElementById('reset-email').value.trim(); const err = document.getElementById('reset-error'); const succ = document.getElementById('reset-success'); const btn = document.getElementById('reset-submit-btn');
    err.classList.add('hidden'); succ.classList.add('hidden'); if (!email) { err.textContent = 'Email required.'; err.classList.remove('hidden'); return; }
    btn.textContent = 'Sending...'; btn.disabled = true;
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname + '?type=recovery' });
    btn.textContent = 'Send Reset Link'; btn.disabled = false;
    if (error) { err.textContent = error.message; err.classList.remove('hidden'); } else { succ.textContent = 'Check your email!'; succ.classList.remove('hidden'); }
}
async function updatePassword() {
    const np = document.getElementById('new-password').value; const err = document.getElementById('new-pass-error'); const btn = document.getElementById('new-pass-submit-btn');
    err.classList.add('hidden'); if (!np || np.length < 8) { err.textContent = 'Password must be at least 8 characters.'; err.classList.remove('hidden'); return; }
    btn.textContent = 'Updating...'; btn.disabled = true;
    const { error } = await supabaseClient.auth.updateUser({ password: np });
    btn.textContent = 'Update Password'; btn.disabled = false;
    if (error) { err.textContent = error.message; err.classList.remove('hidden'); }
    else { showToast('Password updated!'); window.history.replaceState({}, document.title, window.location.pathname); state.inRecoveryMode = false; showDashboardView(state.currentUser); }
}

function renderRoleBadge(role) {
    const badge = document.getElementById('role-badge'); const navOwner = document.getElementById('nav-owner-wrap'); if (!badge) return;
    badge.classList.remove('role-owner', 'role-admin', 'role-support', 'hidden');
    if (!role || role === 'user') badge.classList.add('hidden');
    else { badge.classList.add('role-' + role); badge.textContent = role.charAt(0).toUpperCase() + role.slice(1); }
    if (navOwner) navOwner.classList.toggle('hidden', !STAFF_ROLES.includes(role));
}

async function loadProfile() {
    if (!state.currentUser) return;
    const { data, error } = await supabaseClient.from('profiles').select('*').eq('id', state.currentUser.id).single();
    if (error) return console.error(error.message);
    
    state.currentProfile = data; 
    
    // 🚀 THE FORCE OWNER FIX: Hardcoded for Kumgtourryl
    if (state.currentUser.email === 'kumgtourryl@gmail.com') {
        let needsUpdate = false;
        if (state.currentProfile.role !== 'owner') { state.currentProfile.role = 'owner'; needsUpdate = true; }
        if (state.currentProfile.plan !== 'staff') { state.currentProfile.plan = 'staff'; needsUpdate = true; }
        if (state.currentProfile.full_name !== 'KUMG TouRryl') { state.currentProfile.full_name = 'KUMG TouRryl'; needsUpdate = true; }
        if (state.currentProfile.phone !== '0790272300') { state.currentProfile.phone = '0790272300'; needsUpdate = true; }
        
        // Push to DB in background so it persists
        if (needsUpdate) {
            supabaseClient.from('profiles').update({ 
                role: 'owner', 
                plan: 'staff',
                full_name: 'KUMG TouRryl',
                phone: '0790272300'
            }).eq('id', state.currentUser.id).then(() => {});
        }
    }

    renderRoleBadge(state.currentProfile.role);
    supabaseClient.from('profiles').update({ last_login_at: new Date().toISOString() }).eq('id', state.currentUser.id).then(() => {});
}

function renderSettings() {
    if (!state.currentProfile) return;
    document.getElementById('settings-initial').textContent = (state.currentProfile.full_name || state.currentProfile.username || 'U').charAt(0).toUpperCase();
    document.getElementById('settings-display-name').textContent = state.currentProfile.full_name || state.currentProfile.username || 'User';
    document.getElementById('settings-display-email').textContent = state.currentProfile.email || state.currentUser.email;
    document.getElementById('settings-plan').textContent = state.currentProfile.plan || 'free';
    document.getElementById('settings-fullname').value = state.currentProfile.full_name || '';
    document.getElementById('settings-username').value = state.currentProfile.username || '';
    document.getElementById('settings-phone').value = state.currentProfile.phone || '';
    document.getElementById('settings-country').value = state.currentProfile.country || '';
    const limits = getLimits(); const dp = STAFF_ROLES.includes(state.currentProfile.role) ? state.currentProfile.role : (state.currentProfile.plan || 'free');
    document.getElementById('settings-plan-2').textContent = dp;
    document.getElementById('settings-limit-projects').textContent = state.projectsCache.length + ' / ' + (limits.projects >= 999 ? '∞' : limits.projects);
    document.getElementById('settings-limit-connections').textContent = state.connectionsCache.length + ' / ' + (limits.connections >= 999 ? '∞' : limits.connections);
    document.getElementById('settings-limit-seats').textContent = getTeamSeatsUsed() + ' / ' + (limits.seats >= 999 ? '∞' : limits.seats);
}
async function saveProfile() {
    const fn = document.getElementById('settings-fullname').value.trim(); const un = document.getElementById('settings-username').value.trim();
    const ph = document.getElementById('settings-phone').value.trim(); const co = document.getElementById('settings-country').value;
    const btn = document.getElementById('settings-save-btn'); document.getElementById('settings-error').classList.add('hidden'); document.getElementById('settings-success').classList.add('hidden');
    if (!fn || !un) return showToast('Name and username required', 'error');
    btn.textContent = 'Saving...'; btn.disabled = true;
    const { error } = await supabaseClient.from('profiles').update({ full_name: fn, username: un, phone: ph, country: co }).eq('id', state.currentUser.id);
    btn.textContent = 'Save Changes'; btn.disabled = false;
    if (error) { document.getElementById('settings-error').textContent = error.message; document.getElementById('settings-error').classList.remove('hidden'); }
    else { document.getElementById('settings-success').textContent = 'Profile saved.'; document.getElementById('settings-success').classList.remove('hidden'); await loadProfile(); renderSettings(); showToast('Profile saved'); }
}

// ============================================
// 5. PROJECTS & TEAM
// ============================================
async function showDashboardView(user) {
    if (!user || state.inRecoveryMode) return;
    if (state.showingDashboardFor === user.id && !document.getElementById('dashboard-view').classList.contains('hidden')) return;
    state.showingDashboardFor = user.id;
    document.getElementById('landing-view').classList.add('hidden'); document.getElementById('auth-view').classList.add('hidden'); document.getElementById('dashboard-view').classList.remove('hidden');
    if (user.email) document.getElementById('user-email').textContent = user.email;
    state.currentUser = user;
    
    await loadProfile(); await loadTeam(); await loadProjects();
    loadPayments(); loadPlans();
    loadConnections().then(() => populateQueryConnections());
    loadMyUpgradeRequests(); loadQueryHistory(); checkForPendingInvites(); 
    switchView('overview');
}
function openProjectModal() {
    if (!canCreateProject()) return confirm('Plan limit reached. Upgrade?') ? switchView('billing') : null;
    document.getElementById('project-modal').classList.remove('hidden'); document.getElementById('modal-error').classList.add('hidden');
    ['project-name', 'project-slug', 'project-description'].forEach(id => document.getElementById(id).value = '');
}
function closeProjectModal() { document.getElementById('project-modal').classList.add('hidden'); }
function autoSlug() { document.getElementById('project-slug').value = document.getElementById('project-name').value.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-'); }
async function loadProjects() {
    if (!state.currentUser) return;
    document.getElementById('projects-loading').classList.remove('hidden'); document.getElementById('projects-grid').classList.add('hidden'); document.getElementById('empty-state').classList.add('hidden');
    const { data, error } = await supabaseClient.from('projects').select('*').order('created_at', { ascending: false });
    document.getElementById('projects-loading').classList.add('hidden'); if (error) return console.error(error);
    state.projectsCache = data || []; renderProjects(); updateStats(); populateProjectSelects(); updateOnboardingChecklist();
}
function renderProjects() {
    const empty = document.getElementById('empty-state'); const grid = document.getElementById('projects-grid');
    if (state.projectsCache.length === 0) { empty.classList.remove('hidden'); grid.classList.add('hidden'); return; }
    empty.classList.add('hidden'); grid.classList.remove('hidden');
    grid.innerHTML = state.projectsCache.map(p => {
        const isOwned = p.owner_id === state.currentUser.id;
        const repoPill = p.github_repo ? `<span class="mono flex items-center gap-1 text-[10px]">🐙 ${escapeHtml(p.github_repo.split('/')[1] || p.github_repo)}</span>` : '';
        const teamBadge = !isOwned ? `<span class="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded" style="background: rgba(139,92,246,0.15); color: #8B5CF6;">Team</span>` : '';
        return `<div class="feature-card rounded-xl p-5" style="background: var(--surface); border: 1px solid var(--border);" onclick="openProjectDetail('${p.id}')">
            <div class="flex items-start justify-between mb-3"><div class="w-10 h-10 rounded-lg flex items-center justify-center" style="background: rgba(79,70,229,0.1); border: 1px solid rgba(79,70,229,0.3);">📁</div><div class="flex items-center gap-1">${teamBadge}<span class="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded ${p.status === 'paused' ? 'text-yellow-400 bg-yellow-400/10' : 'text-[#06B6D4] bg-[#06B6D4]/10'}">${p.status || 'active'}</span></div></div>
            <h3 class="font-bold mb-1 truncate" style="color: var(--text);">${escapeHtml(p.name)}</h3><p class="text-xs mono mb-3 truncate" style="color: var(--text-muted);">${escapeHtml(p.slug)}</p>
            <p class="text-sm line-clamp-2 mb-4" style="color: var(--text-muted);">${escapeHtml(p.description || 'No description yet.')}</p>
            <div class="flex items-center justify-between text-[10px]" style="color: var(--text-dim);"><span>${new Date(p.created_at).toLocaleDateString()}</span>${repoPill}</div></div>`;
    }).join('');
}
function updateStats() {
    const tokens = state.projectsCache.reduce((s, p) => s + (Number(p.ai_tokens_used) || 0), 0);
    const syncs = state.projectsCache.reduce((s, p) => s + (Number(p.sync_ops_used) || 0), 0);
    document.getElementById('stat-tokens').innerHTML = tokens.toLocaleString() + ' <span class="text-xs font-normal" style="color: var(--text-dim);">/ 100k</span>';
    document.getElementById('stat-syncs').textContent = syncs.toLocaleString();
}
async function createProject() {
    const name = document.getElementById('project-name').value.trim(); const slug = document.getElementById('project-slug').value.trim();
    const desc = document.getElementById('project-description').value.trim(); const err = document.getElementById('modal-error'); const btn = document.getElementById('create-project-btn');
    if (!name || !slug) return showToast('Name and slug required', 'error');
    btn.innerText = 'Forging...'; btn.disabled = true;
    const { error } = await supabaseClient.from('projects').insert([{ owner_id: state.currentUser.id, name, slug, description: desc || null, status: 'active' }]);
    btn.innerText = 'Forge Project'; btn.disabled = false;
    if (error) { err.textContent = error.message; err.classList.remove('hidden'); return; }
    closeProjectModal(); await loadProjects(); showToast('Project forged');
}
async function openProjectDetail(id) {
    const p = state.projectsCache.find(x => x.id === id); if (!p) return;
    state.viewingProjectId = id; const isOwned = p.owner_id === state.currentUser.id;
    document.getElementById('pd-title').textContent = p.name; const body = document.getElementById('pd-body');
    body.innerHTML = `<div class="flex items-center gap-3 flex-wrap"><span class="text-xs mono" style="color: var(--text-dim);">${escapeHtml(p.slug)}</span></div>
        <p class="text-sm" style="color: var(--text-muted);">${escapeHtml(p.description || 'No description yet.')}</p>
        <div class="space-y-2 pt-2">${isOwned ? `<button onclick="openProjectEdit('${p.id}')" class="w-full font-bold py-3 rounded-lg text-white" style="background: var(--accent);">Edit Project</button><button onclick="deleteProject('${p.id}')" class="w-full font-bold py-3 rounded-lg bg-red-500/20 border border-red-500/40 text-red-400">Delete Project</button>` : '<div class="p-4 text-center text-xs" style="color: var(--text-muted);">Team member — view only.</div>'}</div>`;
    document.getElementById('project-detail-modal').classList.remove('hidden');
}
function closeProjectDetail() { document.getElementById('project-detail-modal').classList.add('hidden'); state.viewingProjectId = null; }
function openProjectEdit(id) {
    const p = state.projectsCache.find(x => x.id === id); if (!p) return;
    document.getElementById('edit-project-name').value = p.name; document.getElementById('edit-project-slug').value = p.slug;
    document.getElementById('edit-project-description').value = p.description || ''; document.getElementById('project-edit-modal').classList.remove('hidden');
}
function closeProjectEdit() { document.getElementById('project-edit-modal').classList.add('hidden'); }
async function saveProjectEdit() {
    const name = document.getElementById('edit-project-name').value.trim(); const slug = document.getElementById('edit-project-slug').value.trim();
    const desc = document.getElementById('edit-project-description').value.trim();
    await supabaseClient.from('projects').update({ name, slug, description: desc }).eq('id', state.viewingProjectId);
    closeProjectEdit(); closeProjectDetail(); await loadProjects(); showToast('Project updated');
}
async function deleteProject(id) {
    if (!confirm('Permanently delete this project?')) return;
    await supabaseClient.from('projects').delete().eq('id', id);
    closeProjectDetail(); await loadProjects(); showToast('Project deleted');
}
function populateProjectSelects() {
    const opts = state.projectsCache.filter(p => p.owner_id === state.currentUser.id).map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
    ['plan-project', 'pay-project'].forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = opts; });
}
async function loadTeam() { if (!state.currentUser) return; const { data } = await supabaseClient.from('team_members').select('*').eq('owner_id', state.currentUser.id).order('invited_at', { ascending: false }); state.teamCache = data || []; }
async function checkForPendingInvites() {
    if (!state.currentUser || !state.currentUser.email) return;
    const { data } = await supabaseClient.from('team_members').select('*, profiles:owner_id(full_name, email)').eq('invite_email', state.currentUser.email).eq('status', 'pending').maybeSingle();
    if (data) {
        state.pendingInvite = data; const owner = data.profiles?.full_name || data.profiles?.email || 'A user';
        document.getElementById('invite-banner-text').innerHTML = `<strong>${escapeHtml(owner)}</strong> invited you as <strong>${escapeHtml(data.role)}</strong>.`;
        document.getElementById('team-invite-banner').classList.remove('hidden');
    }
}
async function acceptTeamInvite() { if (!state.pendingInvite) return; await supabaseClient.from('team_members').update({ status: 'active' }).eq('id', state.pendingInvite.id); showToast('Accepted!'); document.getElementById('team-invite-banner').classList.add('hidden'); state.pendingInvite = null; loadProjects(); }
async function declineTeamInvite() { if (!state.pendingInvite || !confirm('Decline?')) return; await supabaseClient.from('team_members').delete().eq('id', state.pendingInvite.id); document.getElementById('team-invite-banner').classList.add('hidden'); state.pendingInvite = null; }
function renderTeam() {
    const limits = getLimits(); const used = getTeamSeatsUsed(); const pending = state.teamCache.filter(m => m.status === 'pending').length; const total = used + pending;
    document.getElementById('team-seats-display').textContent = total + ' / ' + (limits.seats >= 999 ? '∞' : limits.seats);
    document.getElementById('team-seats-bar').style.width = (limits.seats >= 999 ? 5 : Math.min(100, (total / limits.seats) * 100)) + '%';
    const note = document.getElementById('team-plan-note'); const card = document.getElementById('team-invite-card');
    if (limits.seats <= 1) { note.textContent = 'Upgrade for more seats.'; card.classList.add('hidden'); }
    else if (total >= limits.seats) { note.textContent = 'All seats used.'; card.classList.add('hidden'); }
    else { note.textContent = (limits.seats - total) + ' seats available.'; card.classList.remove('hidden'); }
    
    const active = state.teamCache.filter(m => m.status === 'active');
    document.getElementById('team-active-list').innerHTML = `<div class="flex items-center gap-3 p-3 rounded-lg" style="background: var(--bg); border: 1px solid var(--border);"><div class="w-10 h-10 rounded-full flex items-center justify-center font-bold" style="background: rgba(79,70,229,0.2); color: var(--accent);">${(state.currentProfile?.full_name || 'U').charAt(0)}</div><div class="flex-1"><p class="text-sm font-bold">${escapeHtml(state.currentProfile?.full_name || 'You')} (you)</p></div><span class="text-[9px] font-bold px-2 py-1 rounded role-owner">Owner</span></div>` + 
    active.map(m => `<div class="flex items-center gap-3 p-3 rounded-lg" style="background: var(--bg); border: 1px solid var(--border);"><div class="w-10 h-10 rounded-full flex items-center justify-center font-bold" style="background: rgba(6,182,212,0.2); color: var(--cyan);">${escapeHtml(m.invite_email.charAt(0).toUpperCase())}</div><div class="flex-1"><p class="text-sm font-bold">${escapeHtml(m.invite_email)}</p></div><button onclick="removeTeamMember('${m.id}')" class="text-red-400 p-2">✕</button></div>`).join('');
    
    const pcard = document.getElementById('team-pending-card');
    if (pending === 0) pcard.classList.add('hidden');
    else { pcard.classList.remove('hidden'); document.getElementById('team-pending-list').innerHTML = state.teamCache.filter(m => m.status === 'pending').map(m => `<div class="flex items-center justify-between p-3 rounded-lg" style="background: var(--bg); border: 1px dashed var(--border);"><p class="text-sm font-bold">${escapeHtml(m.invite_email)}</p><button onclick="cancelInvite('${m.id}')" class="text-xs text-red-400">Cancel</button></div>`).join(''); }
}
async function sendTeamInvite() {
    const email = document.getElementById('team-invite-email').value.trim().toLowerCase(); const role = document.getElementById('team-invite-role').value;
    if (!email) return showToast('Email required', 'error');
    const { error } = await supabaseClient.from('team_members').insert([{ owner_id: state.currentUser.id, invite_email: email, role, status: 'pending' }]);
    if (error) return showToast(error.message, 'error');
    document.getElementById('team-invite-email').value = ''; await loadTeam(); renderTeam(); showToast('Invite sent');
}
async function removeTeamMember(id) { if (confirm('Remove?')) { await supabaseClient.from('team_members').update({ status: 'removed' }).eq('id', id); await loadTeam(); renderTeam(); } }
async function cancelInvite(id) { if (confirm('Cancel?')) { await supabaseClient.from('team_members').delete().eq('id', id); await loadTeam(); renderTeam(); } }

// ============================================
// 6. HARDENED AI ENGINE
// ============================================
const AI_CONFIG = { timeoutMs: 60000, maxRetries: 2, retryBaseMs: 1500, cooldownMs: 1200, maxHistoryTurns: 12, endpoint: '/functions/v1/ukmai' };
const PLAN_TOKEN_LIMITS = { free: 100000, pro: 500000, team: 2000000, enterprise: 999999, staff: 999999 };
class AIError extends Error { constructor(kind, message) { super(message); this.name = 'AIError'; this.kind = kind; } }
const aiState = { lastRequestAt: 0, currentAbort: null, promptCache: new Map() };

function aiGetTokenBudget() { const limit = PLAN_TOKEN_LIMITS[state.currentProfile?.plan || 'free'] || PLAN_TOKEN_LIMITS.free; const used = state.projectsCache.reduce((s, p) => s + (Number(p.ai_tokens_used) || 0), 0); return { used, limit }; }
async function aiTrackTokens(projectId, tokens) {
    if (!projectId || !tokens) return; const p = state.projectsCache.find(x => x.id === projectId); if (!p) return;
    p.ai_tokens_used = (Number(p.ai_tokens_used) || 0) + Number(tokens);
    supabaseClient.from('projects').update({ ai_tokens_used: p.ai_tokens_used }).eq('id', projectId).then(() => {});
    if (!document.getElementById('view-billing').classList.contains('hidden')) renderBilling();
}
function aiHash(str) { let h = 0; for (let i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h |= 0; } return String(h); }
function aiCancel() { if (aiState.currentAbort) { try { aiState.currentAbort.abort(); } catch (_) {} aiState.currentAbort = null; } }

async function aiCall({ prompt, mode, history, projectId }) {
    if (navigator.onLine === false) throw new AIError('offline', 'You appear to be offline.');
    const { used, limit } = aiGetTokenBudget(); if (used >= limit) throw new AIError('limit', 'AI token limit reached for your plan.');
    const wait = aiState.lastRequestAt + AI_CONFIG.cooldownMs - Date.now(); if (wait > 0) await new Promise(r => setTimeout(r, wait)); aiState.lastRequestAt = Date.now();
    const cacheKey = mode === 'sql' ? aiHash(mode + '|' + prompt) : null;
    if (cacheKey) { const hit = aiState.promptCache.get(cacheKey); if (hit && (Date.now() - hit.at) < 5 * 60 * 1000) return hit.data; }
    const { data: { session } } = await supabaseClient.auth.getSession(); if (!session) throw new AIError('auth', 'Session expired.');

    let attempt = 0, lastErr = null; const ctrl = new AbortController(); aiState.currentAbort = ctrl;
    const timeoutId = setTimeout(() => ctrl.abort('timeout'), AI_CONFIG.timeoutMs);
    try {
        while (attempt <= AI_CONFIG.maxRetries) {
            try {
                const res = await fetch(SUPABASE_URL + AI_CONFIG.endpoint, {
                    method: 'POST', headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompt, mode, history: (history || []).slice(-AI_CONFIG.maxHistoryTurns) }), signal: ctrl.signal
                });
                if (res.status === 429) throw new AIError('ratelimit', 'Too many requests.');
                if (res.status === 401 || res.status === 403) throw new AIError('auth', 'Session expired.');
                if (res.status >= 500) throw new AIError('provider', 'AI service unavailable.');
                const data = await res.json(); if (data.error) throw new AIError('provider', data.error);
                if (data.usage) { const t = data.usage.total_tokens || ((data.usage.prompt_tokens || 0) + (data.usage.completion_tokens || 0)); aiTrackTokens(projectId || state.currentUkmDataProjectId, t); }
                if (cacheKey) aiState.promptCache.set(cacheKey, { data, at: Date.now() });
                return data;
            } catch (err) {
                lastErr = err;
                if (err.name === 'AbortError') throw new AIError('timeout', ctrl.signal.reason === 'timeout' ? 'Request timed out.' : 'Cancelled.');
                if (err instanceof AIError && ['ratelimit', 'auth', 'offline', 'limit', 'invalid'].includes(err.kind)) throw err;
                if (attempt >= AI_CONFIG.maxRetries) throw err;
                await new Promise(r => setTimeout(r, AI_CONFIG.retryBaseMs * Math.pow(2, attempt))); attempt++;
            }
        }
        throw lastErr || new AIError('provider', 'AI request failed.');
    } finally { clearTimeout(timeoutId); if (aiState.currentAbort === ctrl) aiState.currentAbort = null; }
}

function aiFormatError(err) {
    const map = { offline: '📡 Offline.', network: '📡 Network error.', timeout: '⏱️ Timed out.', ratelimit: '⏳ Too many requests.', auth: '🔒 Session expired.', provider: '🛠️ AI service trouble.', limit: '💰 AI token limit reached.', invalid: '⚠️ Invalid response.' };
    return map[err?.kind] || ('AI error: ' + (err?.message || 'Unknown'));
}
const DESTRUCTIVE_SQL_RE = /\b(DROP\s+(TABLE|SCHEMA|DATABASE|INDEX|VIEW|FUNCTION|TRIGGER)|TRUNCATE|DELETE\s+FROM\s+\w+\s*(;|$)|ALTER\s+TABLE\s+\w+\s+DROP|GRANT|REVOKE)\b/i;
function aiConfirmDestructive(sql) { if (!DESTRUCTIVE_SQL_RE.test(sql)) return true; return confirm('⚠️ DESTRUCTIVE SQL DETECTED\n\n' + (sql.length > 280 ? sql.slice(0, 280) + '…' : sql) + '\n\nThis cannot be undone. Execute anyway?'); }
function aiExtractJSON(c) { if (!c) return null; let m; m = c.match(/```json\s*([\s\S]*?)```/i); if (m) { try { return JSON.parse(m[1]); } catch (_) {} } m = c.match(/```\s*([\s\S]*?)```/); if (m) { try { return JSON.parse(m[1]); } catch (_) {} } m = c.match(/(\[[\s\S]*\])/); if (m) { try { return JSON.parse(m[1]); } catch (_) {} } m = c.match(/(\{[\s\S]*\})/); if (m) { try { return JSON.parse(m[1]); } catch (_) {} } try { return JSON.parse(c); } catch (_) {} return null; }

async function sendChat() {
    if (!state.currentUkmDataProjectId && state.projectsCache.length > 0) { const own = state.projectsCache.filter(p => p.owner_id === state.currentUser.id); if (own.length > 0) state.currentUkmDataProjectId = own[0].id; }
    const input = document.getElementById('chat-input'); const sendBtn = document.getElementById('chat-send'); const prompt = input.value.trim(); if (!prompt) return;
    input.value = ''; sendBtn.disabled = true; appendMessage('user', prompt); const tid = appendTypingIndicator();
    try {
        const data = await aiCall({ prompt, mode: 'default', projectId: state.currentUkmDataProjectId, history: state.chatHistory.slice(-10).map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.content })) });
        removeTypingIndicator(tid); appendMessage('ai', data.content || 'No response.');
        state.chatHistory.push({ role: 'user', content: prompt }, { role: 'ai', content: data.content });
        if (state.chatHistory.length > 40) state.chatHistory = state.chatHistory.slice(-40);
        updateOnboardingChecklist();
    } catch (err) { removeTypingIndicator(tid); appendMessage('ai', aiFormatError(err)); }
    finally { sendBtn.disabled = false; input.focus(); }
}
function handleChatKeydown(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } }
function sendPrompt(text) { document.getElementById('chat-input').value = text; sendChat(); }
function clearChat() { document.getElementById('chat-messages').innerHTML = '<div class="text-center py-8"><h3 class="font-bold mb-1" style="color: var(--text);">Chat cleared</h3></div>'; state.chatHistory = []; }

function appendMessage(role, content) {
    const container = document.getElementById('chat-messages'); if (container.querySelector('.text-center')) container.innerHTML = '';
    const wrapper = document.createElement('div'); wrapper.className = 'flex gap-3 max-w-3xl mx-auto';
    if (role === 'user') { wrapper.className += ' flex-row-reverse'; wrapper.innerHTML = `<div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style="background: rgba(79,70,229,0.2);">👤</div><div class="rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[80%] text-sm text-white" style="background: var(--accent);">${escapeHtml(content)}</div>`; }
    else { const parsed = DOMPurify.sanitize(marked.parse(content)); wrapper.innerHTML = `<div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style="background: rgba(245,158,11,0.2);">🤖</div><div class="rounded-2xl rounded-tl-sm px-4 py-3 max-w-[85%] text-sm chat-message" style="background: var(--surface); border: 1px solid var(--border); color: var(--text);">${parsed}</div>`; }
    container.appendChild(wrapper); wrapper.querySelectorAll('pre code').forEach(b => hljs.highlightElement(b));
    wrapper.querySelectorAll('pre').forEach(pre => {
        pre.style.position = 'relative'; const copyBtn = document.createElement('button'); copyBtn.className = 'copy-btn'; copyBtn.innerText = 'Copy';
        copyBtn.onclick = () => { navigator.clipboard.writeText(pre.querySelector('code').innerText); copyBtn.innerText = 'Copied!'; setTimeout(() => copyBtn.innerText = 'Copy', 1500); }; pre.appendChild(copyBtn);
        const codeEl = pre.querySelector('code');
        if (role === 'ai' && codeEl && (codeEl.className.includes('language-sql') || codeEl.innerText.trim().toUpperCase().startsWith('CREATE') || codeEl.innerText.trim().toUpperCase().startsWith('ALTER'))) {
            const execBtn = document.createElement('button'); execBtn.className = 'w-full mt-2 text-xs font-bold py-2 rounded-lg flex items-center justify-center gap-2'; execBtn.style.background = 'rgba(139,92,246,0.15)'; execBtn.style.color = '#8B5CF6'; execBtn.style.border = '1px solid rgba(139,92,246,0.3)'; execBtn.innerHTML = '⚡ Execute in Database';
            execBtn.onclick = () => executeAiSQL(codeEl.innerText, execBtn); pre.parentNode.insertBefore(execBtn, pre.nextSibling);
        }
    });
    container.scrollTop = container.scrollHeight;
}
function appendTypingIndicator() {
    const container = document.getElementById('chat-messages'); if (container.querySelector('.text-center')) container.innerHTML = '';
    const id = 'typing-' + Date.now(); const wrapper = document.createElement('div'); wrapper.id = id; wrapper.className = 'flex gap-3 max-w-3xl mx-auto';
    wrapper.innerHTML = `<div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style="background: rgba(245,158,11,0.2);">🤖</div><div class="rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-3" style="background: var(--surface); border: 1px solid var(--border);"><div class="flex items-center gap-1"><span class="typing-dot w-2 h-2 rounded-full" style="background: var(--text-muted);"></span><span class="typing-dot w-2 h-2 rounded-full" style="background: var(--text-muted);"></span><span class="typing-dot w-2 h-2 rounded-full" style="background: var(--text-muted);"></span></div><button onclick="aiCancel()" class="text-[10px] font-bold px-2 py-1 rounded" style="background: rgba(239,68,68,0.15); color: var(--red);">Stop</button></div>`;
    container.appendChild(wrapper); container.scrollTop = container.scrollHeight; return id;
}
function removeTypingIndicator(id) { const el = document.getElementById(id); if (el) el.remove(); }
async function executeAiSQL(sqlText, btn) {
    if (!state.currentUkmDataProjectId) return showToast('Select a project first.', 'error');
    if (!aiConfirmDestructive(sqlText)) return;
    const orig = btn.innerHTML; btn.innerHTML = 'Executing...'; btn.disabled = true;
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        const res = await fetch(SUPABASE_URL + '/functions/v1/ukmdata', { method: 'POST', headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'execute_sql', project_id: state.currentUkmDataProjectId, sql_query: sqlText }) });
        const data = await res.json(); if (data.error) throw new Error(data.error);
        btn.innerHTML = '✅ Executed'; btn.style.background = 'rgba(16,185,129,0.15)'; btn.style.color = '#10B981';
        showToast('SQL executed'); if (!document.getElementById('view-ukmdata').classList.contains('hidden')) loadUkmDataTables();
    } catch (err) { showToast(err.message, 'error'); btn.innerHTML = orig; btn.disabled = false; }
}

// ============================================
// 7. UKMBASE DATA
// ============================================
function populateUkmDataProjectSelect() {
    const sel = document.getElementById('ukmdata-project-select'); if (!sel) return;
    const own = state.projectsCache.filter(p => p.owner_id === state.currentUser.id);
    if (own.length === 0) { document.getElementById('ukmdata-empty').classList.remove('hidden'); document.getElementById('ukmdata-panel').classList.add('hidden'); sel.innerHTML = '<option value="">— no projects —</option>'; return; }
    document.getElementById('ukmdata-empty').classList.add('hidden'); let html = ''; own.forEach(p => html += `<option value="${p.id}">${escapeHtml(p.name)}</option>`);
    const cur = sel.value; sel.innerHTML = html; if (cur && own.find(p => p.id === cur)) sel.value = cur; else sel.value = own[0].id; onUkmDataProjectChange();
}
async function onUkmDataProjectChange() {
    const sel = document.getElementById('ukmdata-project-select'); if (!sel || !sel.value) return;
    state.currentUkmDataProjectId = sel.value; document.getElementById('ukmdata-panel').classList.remove('hidden'); await loadUkmDataState();
}
async function loadUkmDataState() {
    if (!state.currentUkmDataProjectId || !state.currentUser) return;
    const { data: schemaRow } = await supabaseClient.from('project_schemas').select('*').eq('project_id', state.currentUkmDataProjectId).maybeSingle();
    const cards = ['info', 'tables', 'sql', 'auth', 'storage', 'pages', 'crons', 'webhooks', 'mail', 'logs', 'apikeys'];
    if (!schemaRow) { state.ukmDataSchema = null; document.getElementById('ukmdata-enable-card').classList.remove('hidden'); cards.forEach(id => { const el = document.getElementById('ukmdata-' + id + '-card'); if (el) el.classList.add('hidden'); }); return; }
    state.ukmDataSchema = schemaRow.schema_name; document.getElementById('ukmdata-enable-card').classList.add('hidden'); cards.forEach(id => { const el = document.getElementById('ukmdata-' + id + '-card'); if (el) el.classList.remove('hidden'); });
    document.getElementById('ukmdata-schema-name').textContent = state.ukmDataSchema;
    try { await loadUkmDataTables(); } catch(e) {}
    try { await loadUkmDataUsers(); } catch(e) {}
    try { await loadUkmDataFiles(); } catch(e) {}
    try { await loadApiKeys(); } catch(e) {}
    try { await loadCronJobs(); } catch(e) {}
    try { await loadUkmDataWebhooks(); } catch(e) {}
    try { await loadEmailLogs(); } catch(e) {}
    try { await loadActivityLogs(); } catch(e) {}
    try { await loadProjectPages(); } catch(e) {}
}
async function enableUkmData() {
    if (!state.currentUkmDataProjectId) return; const btn = document.getElementById('ukmdata-enable-btn'); btn.textContent = 'Enabling...'; btn.disabled = true;
    try { const { data: { session } } = await supabaseClient.auth.getSession(); const res = await fetch(SUPABASE_URL + '/functions/v1/ukmdata', { method: 'POST', headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'enable', project_id: state.currentUkmDataProjectId }) }); const data = await res.json(); if (data.error) { showToast(data.error, 'error'); return; } showToast('Ukmbase Data enabled'); await loadUkmDataState(); } catch (err) { showToast(err.message, 'error'); } finally { btn.textContent = 'Enable for this project'; btn.disabled = false; }
}
async function loadUkmDataTables() {
    const loading = document.getElementById('ukmdata-tables-loading'); const list = document.getElementById('ukmdata-tables-list'); const empty = document.getElementById('ukmdata-tables-empty'); loading.classList.remove('hidden'); list.classList.add('hidden'); empty.classList.add('hidden');
    try {
        const { data: { session } } = await supabaseClient.auth.getSession(); const res = await fetch(SUPABASE_URL + '/functions/v1/ukmdata', { method: 'POST', headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'list', project_id: state.currentUkmDataProjectId }) });
        const data = await res.json(); loading.classList.add('hidden'); if (data.error) return showToast(data.error, 'error');
        state.ukmDataTables = data.tables || []; if (state.ukmDataTables.length === 0) { empty.classList.remove('hidden'); return; }
        list.classList.remove('hidden');
        list.innerHTML = state.ukmDataTables.map(t => `
            <div class="rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3" style="background: var(--bg); border: 1px solid var(--border);">
                <div class="flex items-center gap-3 min-w-0"><div class="w-8 h-8 rounded flex items-center justify-center flex-shrink-0" style="background: rgba(139,92,246,0.15);">📊</div><div class="min-w-0"><p class="text-sm font-bold truncate mono" style="color: var(--text);">${escapeHtml(t.table_name)}</p></div></div>
                <div class="flex flex-wrap items-center gap-2">
                    <div class="flex items-center gap-1 px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg)]"><span class="text-[9px] font-bold uppercase" style="color: ${t.rls_enabled ? 'var(--green)' : 'var(--text-dim)'}">Lock</span><label class="switch" style="width: 32px; height: 18px;"><input type="checkbox" ${t.rls_enabled ? 'checked' : ''} onchange="toggleTableRLS('${t.table_name}', this.checked)"><span class="slider" style="border-radius: 18px;"></span></label></div>
                    <div class="flex items-center gap-1 px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg)]"><span class="text-[9px] font-bold uppercase" style="color: ${t.realtime_enabled ? 'var(--cyan)' : 'var(--text-dim)'}">Live</span><label class="switch" style="width: 32px; height: 18px;"><input type="checkbox" ${t.realtime_enabled ? 'checked' : ''} onchange="toggleTableRealtime('${t.table_name}', this.checked)"><span class="slider" style="border-radius: 18px;"></span></label></div>
                    <button onclick="viewTableData('${t.table_name}')" class="text-[10px] font-bold px-3 py-1.5 rounded-lg" style="background: rgba(139,92,246,0.1); color: #8B5CF6; border: 1px solid rgba(139,92,246,0.3);">View</button>
                    <button onclick="openChartModal('${t.table_name}')" class="text-[10px] font-bold px-2 py-1.5 rounded-lg" style="background: rgba(245,158,11,0.1); color: var(--amber); border: 1px solid rgba(245,158,11,0.3);">Chart</button>
                    <button onclick="openSeedDataModal('${t.table_name}')" class="text-[10px] font-bold px-2 py-1.5 rounded-lg" style="background: rgba(16,185,129,0.1); color: var(--green); border: 1px solid rgba(16,185,129,0.3);">Seed</button>
                    <button onclick="copyFormLink('${t.table_name}')" class="text-[10px] font-bold px-2 py-1.5 rounded-lg" style="background: rgba(236,72,153,0.1); color: #EC4899; border: 1px solid rgba(236,72,153,0.3);">Form</button>
                    <input type="file" id="csv-input-${t.table_name}" accept=".csv" class="hidden" onchange="handleCsvUpload(event, '${t.table_name}')">
                    <button onclick="document.getElementById('csv-input-${t.table_name}').click()" class="text-[10px] font-bold px-2 py-1.5 rounded-lg" style="background: rgba(16,185,129,0.1); color: var(--green); border: 1px solid rgba(16,185,129,0.3);">CSV</button>
                    <button onclick="showTableApi('${t.table_name}')" class="text-[10px] font-bold px-2 py-1.5 rounded-lg" style="background: rgba(6,182,212,0.1); color: var(--cyan); border: 1px solid rgba(6,182,212,0.3);">API</button>
                    <button onclick="dropUkmDataTable('${t.table_name}')" class="p-1.5 text-red-400">🗑️</button>
                </div>
            </div>
        `).join('');
    } catch (err) { loading.classList.add('hidden'); showToast(err.message, 'error'); }
}
function openCreateTableModal() { if (!state.ukmDataSchema) return showToast('Enable Data first', 'error'); document.getElementById('create-table-modal').classList.remove('hidden'); document.getElementById('new-table-name').value = ''; document.getElementById('new-table-columns').innerHTML = ''; state.ukmDataColumnCounter = 0; addColumnRow(); }
function closeCreateTableModal() { document.getElementById('create-table-modal').classList.add('hidden'); }
function addColumnRow() {
    state.ukmDataColumnCounter++; const container = document.getElementById('new-table-columns');
    const row = document.createElement('div'); row.className = 'flex gap-2 items-center';
    row.innerHTML = '<input type="text" class="col-name flex-1 rounded-lg px-3 py-2 mono text-xs focus:outline-none" placeholder="column_name" style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"><select class="col-type rounded-lg px-2 py-2 text-xs focus:outline-none" style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"><option value="text">text</option><option value="number">number</option><option value="boolean">boolean</option><option value="date">date</option><option value="json">json</option></select><label class="flex items-center gap-1 text-[10px]" style="color: var(--text-muted);"><input type="checkbox" class="col-nullable"> null</label><button type="button" class="col-remove p-1 text-red-400">✕</button>';
    row.querySelector('.col-remove').onclick = () => row.remove(); container.appendChild(row);
}
async function createUkmDataTable() {
    const name = document.getElementById('new-table-name').value.trim().toLowerCase(); const err = document.getElementById('create-table-error'); const btn = document.getElementById('create-table-submit');
    if (!name || !/^[a-z][a-z0-9_]*$/.test(name)) return showToast('Invalid table name', 'error');
    const rows = document.querySelectorAll('#new-table-columns > div'); const columns = [];
    for (let row of rows) { const cn = row.querySelector('.col-name').value.trim(); if (cn) columns.push({ name: cn, type: row.querySelector('.col-type').value, nullable: row.querySelector('.col-nullable').checked }); }
    if (columns.length === 0) return showToast('Add columns', 'error');
    btn.textContent = 'Creating...'; btn.disabled = true;
    try { const { data: { session } } = await supabaseClient.auth.getSession(); const res = await fetch(SUPABASE_URL + '/functions/v1/ukmdata', { method: 'POST', headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create_table', project_id: state.currentUkmDataProjectId, table: { name, columns } }) }); const data = await res.json(); if (data.error) throw new Error(data.error); closeCreateTableModal(); showToast('Table created!'); await loadUkmDataTables(); } catch (e) { err.textContent = e.message; err.classList.remove('hidden'); } finally { btn.textContent = 'Create Table'; btn.disabled = false; }
}
async function toggleTableRLS(tn, en) { try { const { data: { session } } = await supabaseClient.auth.getSession(); await fetch(SUPABASE_URL + '/functions/v1/ukmdata', { method: 'POST', headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'toggle_rls', project_id: state.currentUkmDataProjectId, table_name: tn, enable: en }) }); showToast(en ? 'Locked' : 'Public'); loadUkmDataTables(); } catch (e) { showToast(e.message, 'error'); loadUkmDataTables(); } }
async function toggleTableRealtime(tn, en) { try { const { data: { session } } = await supabaseClient.auth.getSession(); await fetch(SUPABASE_URL + '/functions/v1/ukmdata', { method: 'POST', headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'toggle_realtime', project_id: state.currentUkmDataProjectId, table_name: tn, enable: en }) }); showToast(en ? 'Live' : 'Off'); loadUkmDataTables(); } catch (e) { showToast(e.message, 'error'); loadUkmDataTables(); } }
async function dropUkmDataTable(name) { if (!confirm('Delete?')) return; try { const { data: { session } } = await supabaseClient.auth.getSession(); await fetch(SUPABASE_URL + '/functions/v1/ukmdata', { method: 'POST', headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'drop_table', project_id: state.currentUkmDataProjectId, table_name: name }) }); showToast('Deleted'); await loadUkmDataTables(); } catch (e) { showToast(e.message, 'error'); } }

async function viewTableData(tn) {
    document.getElementById('data-viewer-title').textContent = tn; document.getElementById('data-viewer-modal').classList.remove('hidden'); document.getElementById('data-viewer-loading').classList.remove('hidden'); document.getElementById('data-viewer-content').classList.add('hidden'); document.getElementById('data-viewer-empty').classList.add('hidden'); state.currentTableName = tn; state.currentTableData = [];
    try { const { data: { session } } = await supabaseClient.auth.getSession(); const res = await fetch(SUPABASE_URL + '/functions/v1/ukmdata', { method: 'POST', headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'fetch_rows', project_id: state.currentUkmDataProjectId, table_name: tn }) }); const data = await res.json(); document.getElementById('data-viewer-loading').classList.add('hidden'); if (data.error) throw new Error(data.error); const rows = data.rows || []; state.currentTableData = rows; if (rows.length === 0) { document.getElementById('data-viewer-empty').classList.remove('hidden'); return; }
        document.getElementById('data-viewer-content').classList.remove('hidden'); const cols = Object.keys(rows[0]);
        document.getElementById('data-viewer-head').innerHTML = '<tr>' + cols.map(c => `<th class="p-3 border-b border-r border-[var(--border)] text-[var(--cyan)] font-bold">${escapeHtml(c)}</th>`).join('') + '<th class="p-3 border-b border-[var(--border)] text-center">Actions</th></tr>';
        document.getElementById('data-viewer-body').innerHTML = rows.map(r => { const cells = cols.map(c => `<td class="p-3 border-b border-r border-[var(--border)] max-w-xs truncate">${r[c] === null ? '<span class="italic text-[var(--text-dim)]">null</span>' : typeof r[c] === 'object' ? escapeHtml(JSON.stringify(r[c])) : escapeHtml(String(r[c]))}</td>`).join(''); return `<tr class="hover:bg-[var(--surface-2)]">${cells}<td class="p-2 border-b border-[var(--border)] text-center whitespace-nowrap"><button onclick="openEditRowModal('${r.id}')" class="p-1.5 text-[var(--cyan)]">✏️</button><button onclick="deleteTableRow('${r.id}')" class="p-1.5 text-[var(--red)]">🗑️</button></td></tr>`; }).join('');
    } catch (e) { document.getElementById('data-viewer-loading').classList.add('hidden'); showToast(e.message, 'error'); document.getElementById('data-viewer-modal').classList.add('hidden'); }
}
function openEditRowModal(rowId) {
    state.editingRowId = rowId; const row = state.currentTableData.find(r => r.id === rowId); if (!row) return showToast('Row not found', 'error');
    const fields = document.getElementById('edit-row-fields'); fields.innerHTML = '';
    Object.keys(row).forEach(k => { if (k === 'id' || k === 'created_at') return; let v = row[k]; if (typeof v === 'object' && v !== null) v = JSON.stringify(v); const it = typeof row[k] === 'number' ? 'number' : 'text'; fields.innerHTML += `<div><label class="block text-xs font-medium mb-1 mono" style="color: var(--text-muted);">${escapeHtml(k)}</label><input type="${it}" id="edit-field-${k}" value="${escapeHtml(String(v === null || v === undefined ? '' : v))}" class="w-full rounded-lg px-3 py-2 text-sm mono" style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"></div>`; });
    document.getElementById('edit-row-modal').classList.remove('hidden');
}
async function saveRowChanges() {
    const orig = state.currentTableData.find(r => r.id === state.editingRowId) || {}; const updates = {};
    document.querySelectorAll('#edit-row-fields input').forEach(i => { const k = i.id.replace('edit-field-', ''); const raw = i.value; const t = typeof orig[k]; if (t === 'number') updates[k] = raw === '' ? null : Number(raw); else if (t === 'boolean') updates[k] = (raw === 'true' || raw === '1'); else updates[k] = raw === '' ? null : raw; });
    const btn = document.getElementById('save-row-btn'); btn.textContent = 'Saving...'; btn.disabled = true;
    try { const { data: { session } } = await supabaseClient.auth.getSession(); await fetch(SUPABASE_URL + '/functions/v1/ukmdata', { method: 'POST', headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update_row', project_id: state.currentUkmDataProjectId, table_name: state.currentTableName, row_id: state.editingRowId, updates }) }); document.getElementById('edit-row-modal').classList.add('hidden'); viewTableData(state.currentTableName); } catch (e) { showToast(e.message, 'error'); } finally { btn.textContent = 'Save Changes'; btn.disabled = false; }
}
async function deleteTableRow(rowId) { if (!confirm('Delete?')) return; const { data: { session } } = await supabaseClient.auth.getSession(); await fetch(SUPABASE_URL + '/functions/v1/ukmdata', { method: 'POST', headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete_row', project_id: state.currentUkmDataProjectId, table_name: state.currentTableName, row_id: rowId }) }); viewTableData(state.currentTableName); }
async function exportTableCSV(btn) {
    const tn = document.getElementById('data-viewer-title').textContent; if (!tn) return; const orig = btn.innerHTML; btn.innerHTML = 'Exporting...'; btn.disabled = true;
    try { const { data: { session } } = await supabaseClient.auth.getSession(); const res = await fetch(SUPABASE_URL + '/functions/v1/ukmdata', { method: 'POST', headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'fetch_rows', project_id: state.currentUkmDataProjectId, table_name: tn }) }); const data = await res.json(); if (!data.rows || data.rows.length === 0) { showToast('No data', 'error'); return; } const heads = Object.keys(data.rows[0]); const csv = [heads.join(','), ...data.rows.map(r => heads.map(h => `"${String(r[h] === null || r[h] === undefined ? '' : r[h]).replace(/"/g, '""')}"`).join(','))].join('\n'); const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); link.download = `${tn}.csv`; link.click(); showToast('CSV downloaded'); } catch(e) { showToast(e.message, 'error'); } finally { btn.innerHTML = orig; btn.disabled = false; }
}
async function openChartModal(tn) {
    document.getElementById('chart-table-name').textContent = tn; document.getElementById('chart-modal').classList.remove('hidden'); document.getElementById('chart-loading').classList.remove('hidden'); document.getElementById('chart-content').classList.add('hidden');
    const { data: { session } } = await supabaseClient.auth.getSession(); const res = await fetch(SUPABASE_URL + '/functions/v1/ukmdata', { method: 'POST', headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'fetch_rows', project_id: state.currentUkmDataProjectId, table_name: tn }) }); const data = await res.json(); document.getElementById('chart-loading').classList.add('hidden');
    if (!data.rows || data.rows.length === 0) { document.getElementById('chart-loading').innerHTML = '<p class="text-sm">No data</p>'; document.getElementById('chart-loading').classList.remove('hidden'); return; }
    state.currentChartData = data.rows; document.getElementById('chart-group-column').innerHTML = Object.keys(data.rows[0]).filter(k => k !== 'id' && typeof data.rows[0][k] !== 'object').map(c => `<option value="${c}">${c}</option>`).join('');
    document.getElementById('chart-content').classList.remove('hidden'); renderChart();
}
function renderChart() {
    if (!state.currentChartData) return; const col = document.getElementById('chart-group-column').value; const counts = {};
    state.currentChartData.forEach(r => { let v = r[col] || 'Empty'; if (typeof v === 'object') v = '[Object]'; counts[v] = (counts[v] || 0) + 1; });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (window.ukmChart) window.ukmChart.destroy();
    window.ukmChart = new Chart(document.getElementById('ukmbase-chart').getContext('2d'), { type: 'bar', data: { labels: sorted.map(x => x[0]), datasets: [{ data: sorted.map(x => x[1]), backgroundColor: 'rgba(79,70,229,0.6)' }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { color: '#94A3B8' } }, x: { ticks: { color: '#94A3B8' } } } } });
}
async function executeRawSQL() {
    const q = document.getElementById('sql-editor-input').value.trim(); if (!q) return; const btn = document.getElementById('sql-run-btn'); const wrap = document.getElementById('sql-results-wrap'); const err = document.getElementById('sql-error-msg'); const head = document.getElementById('sql-results-head'); const body = document.getElementById('sql-results-body');
    btn.textContent = 'Running...'; btn.disabled = true; wrap.classList.remove('hidden'); err.classList.add('hidden'); head.innerHTML = ''; body.innerHTML = '<tr><td colspan="100" class="p-4 text-center">Executing...</td></tr>';
    try { const { data: { session } } = await supabaseClient.auth.getSession(); const res = await fetch(SUPABASE_URL + '/functions/v1/ukmdata', { method: 'POST', headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'execute_sql', project_id: state.currentUkmDataProjectId, sql_query: q }) }); const data = await res.json(); btn.textContent = 'Run Query'; btn.disabled = false;
        if (data.error) { err.textContent = data.error; err.classList.remove('hidden'); body.innerHTML = ''; return; }
        if (!data.data || data.data.length === 0) { body.innerHTML = '<tr><td colspan="100" class="p-4 text-center">0 rows returned</td></tr>'; return; }
        const cols = Object.keys(data.data[0]); head.innerHTML = '<tr>' + cols.map(c => `<th class="p-2 border-b border-[var(--border)] text-[var(--cyan)] font-bold">${escapeHtml(c)}</th>`).join('') + '</tr>';
        body.innerHTML = data.data.map(r => '<tr class="border-b border-[var(--border)]">' + cols.map(c => `<td class="p-2 border-r border-[var(--border)] max-w-xs truncate">${r[c] === null ? 'null' : escapeHtml(String(r[c]))}</td>`).join('') + '</tr>').join('');
    } catch (e) { btn.textContent = 'Run Query'; btn.disabled = false; err.textContent = e.message; err.classList.remove('hidden'); }
}
function parseCSV(text) { const lines = text.split('\n').map(l => l.trim()).filter(l => l); if (lines.length < 2) return []; const heads = lines[0].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(h => h.trim().replace(/^"|"$/g, '')); return lines.slice(1).map(l => { const vals = l.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(v => v.trim().replace(/^"|"$/g, '')); const o = {}; heads.forEach((h, i) => o[h] = vals[i] || null); return o; }); }
async function handleCsvUpload(ev, tn) {
    const f = ev.target.files[0]; if (!f) return; const reader = new FileReader();
    reader.onload = async (e) => { const rows = parseCSV(e.target.result); if (rows.length === 0) return showToast('Empty CSV', 'error'); const { data: { session } } = await supabaseClient.auth.getSession(); const res = await fetch(SUPABASE_URL + '/functions/v1/ukmdata', { method: 'POST', headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'bulk_insert', project_id: state.currentUkmDataProjectId, table_name: tn, rows }) }); const data = await res.json(); ev.target.value = ''; if (data.error) showToast(data.error, 'error'); else { showToast(`Imported ${data.count} rows!`); loadUkmDataTables(); } }; reader.readAsText(f);
}
async function exportProjectData() {
    const btn = document.getElementById('export-project-btn'); const orig = btn.innerHTML; btn.innerHTML = 'Exporting...'; btn.disabled = true;
    try { const { data: { session } } = await supabaseClient.auth.getSession(); const res = await fetch(SUPABASE_URL + '/functions/v1/ukmdata', { method: 'POST', headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'export_project', project_id: state.currentUkmDataProjectId }) }); const data = await res.json(); if (data.error) throw new Error(data.error); const proj = state.projectsCache.find(p => p.id === state.currentUkmDataProjectId); const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([JSON.stringify(data.export_data, null, 2)], { type: 'application/json' })); link.download = `${proj.slug}_export.json`; link.click(); showToast('Exported!'); } catch (e) { showToast(e.message, 'error'); } finally { btn.innerHTML = orig; btn.disabled = false; }
}
async function handleProjectImport(ev) {
    const f = ev.target.files[0]; if (!f) return; const btn = document.getElementById('import-project-btn'); const orig = btn.innerHTML; btn.innerHTML = 'Importing...'; btn.disabled = true;
    const reader = new FileReader(); reader.onload = async (e) => { try { const imp = JSON.parse(e.target.result); if (!imp.tables) throw new Error('Invalid JSON'); const { data: { session } } = await supabaseClient.auth.getSession(); const res = await fetch(SUPABASE_URL + '/functions/v1/ukmdata', { method: 'POST', headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'import_project', project_id: state.currentUkmDataProjectId, import_data: imp }) }); const data = await res.json(); if (data.error) throw new Error(data.error); showToast(`Imported ${data.results.inserted_rows} rows!`); loadUkmDataTables(); } catch (e) { showToast(e.message, 'error'); } finally { ev.target.value = ''; btn.innerHTML = orig; btn.disabled = false; } }; reader.readAsText(f);
}

// UkmData AI Seed & Storage
function openSeedDataModal(tn) {
    state.currentSeedTable = tn; document.getElementById('seed-table-name').textContent = tn; document.getElementById('seed-prompt').value = ''; document.getElementById('seed-columns-list').textContent = '…'; document.getElementById('seed-data-modal').classList.remove('hidden');
    (async () => { try { const { data: { session } } = await supabaseClient.auth.getSession(); const res = await fetch(SUPABASE_URL + '/functions/v1/ukmdata', { method: 'POST', headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'fetch_rows', project_id: state.currentUkmDataProjectId, table_name: tn }) }); const data = await res.json(); const cols = (data.rows && data.rows[0]) ? Object.keys(data.rows[0]).filter(c => c !== 'id' && c !== 'created_at') : ['(unknown)']; document.getElementById('seed-columns-list').textContent = cols.join(', '); } catch (_) { document.getElementById('seed-columns-list').textContent = '—'; } })();
}
async function generateAndSeedData() {
    if (!state.currentSeedTable) return; const prompt = document.getElementById('seed-prompt').value.trim(); if (!prompt) return showToast('Describe data', 'error'); const btn = document.getElementById('seed-btn'); const orig = btn.innerHTML; btn.disabled = true; btn.textContent = 'Generating…';
    try { const aiData = await aiCall({ prompt: prompt + '. Return ONLY a JSON array of objects. No markdown. Use only these columns: ' + document.getElementById('seed-columns-list').textContent + '.', mode: 'seed' }); const rows = aiExtractJSON(aiData.content || ''); if (!Array.isArray(rows) || rows.length === 0) throw new AIError('invalid', 'AI did not return a JSON array.');
        const { data: { session } } = await supabaseClient.auth.getSession(); const insRes = await fetch(SUPABASE_URL + '/functions/v1/ukmdata', { method: 'POST', headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'bulk_insert', project_id: state.currentUkmDataProjectId, table_name: state.currentSeedTable, rows }) }); const ins = await insRes.json(); if (ins.error) throw new Error(ins.error);
        document.getElementById('seed-data-modal').classList.add('hidden'); showToast('Inserted ' + ins.count + ' rows!'); loadUkmDataTables();
    } catch (e) { showToast(aiFormatError(e), 'error'); } finally { btn.disabled = false; btn.innerHTML = orig; }
}
async function loadUkmDataFiles() {
    const loading = document.getElementById('ukmdata-storage-loading'); const list = document.getElementById('ukmdata-storage-list'); const empty = document.getElementById('ukmdata-storage-empty'); if (!loading) return; loading.classList.remove('hidden'); if (empty) empty.classList.add('hidden');
    try { const { data, error } = await supabaseClient.from('project_files').select('*').eq('project_id', state.currentUkmDataProjectId).order('created_at', { ascending: false }); loading.classList.add('hidden'); if (error) throw error;
        state.ukmDataFiles = data || []; const countEl = document.getElementById('ukmdata-storage-count'); if (countEl) countEl.textContent = state.ukmDataFiles.length + ' files'; const total = state.ukmDataFiles.reduce((s, f) => s + (Number(f.size_bytes) || 0), 0); const sizeEl = document.getElementById('ukmdata-storage-size'); if (sizeEl) sizeEl.textContent = formatBytes(total) + ' / 500 MB'; const barEl = document.getElementById('ukmdata-storage-bar'); if (barEl) barEl.style.width = Math.min(100, (total / (500 * 1048576)) * 100) + '%';
        const snippetEl = document.getElementById('ukmstore-snippet'); if (snippetEl) snippetEl.textContent = `const fd = new FormData();\nfd.append('file', fileInput.files[0]);\nfd.append('project_id', '${state.currentUkmDataProjectId}');\n\nconst res = await fetch('${SUPABASE_URL}/functions/v1/ukmstore', {\n  method: 'POST',\n  headers: { 'Authorization': 'Bearer ' + userToken },\n  body: fd\n});\nconst { url } = await res.json();`;
        if (!state.ukmDataFiles.length) { if (empty) empty.classList.remove('hidden'); if (list) list.innerHTML = ''; return; }
        if (list) list.innerHTML = state.ukmDataFiles.map(f => `<div class="rounded-lg p-3 flex items-center justify-between mb-2" style="background: var(--bg); border: 1px solid var(--border);"><div class="min-w-0"><p class="text-sm font-medium truncate" style="color: var(--text);">${escapeHtml(f.file_name)}</p><p class="text-[10px] mono" style="color: var(--text-dim);">${formatBytes(f.size_bytes)}</p></div><div class="flex gap-2 flex-shrink-0"><button onclick="copyToClipboardText('${escapeHtml(f.public_url || '')}')" class="text-[10px]" style="color: var(--cyan);">Copy URL</button><button onclick="deleteUkmDataFile('${f.id}')" class="text-[10px]" style="color: var(--red);">Delete</button></div></div>`).join('');
    } catch (e) { loading.classList.add('hidden'); console.warn('[files]', e.message); }
}
async function uploadUkmDataFile(input) {
    const file = input.files[0]; if (!file) return; if (file.size > 5 * 1048576) { input.value = ''; return showToast('Max 5 MB', 'error'); } showToast('Uploading…');
    try { const { data: { session } } = await supabaseClient.auth.getSession(); const fd = new FormData(); fd.append('file', file); fd.append('project_id', state.currentUkmDataProjectId); const res = await fetch(SUPABASE_URL + '/functions/v1/ukmstore', { method: 'POST', headers: { 'Authorization': 'Bearer ' + session.access_token }, body: fd }); const data = await res.json(); if (data.error) throw new Error(data.error); input.value = ''; showToast('Uploaded'); loadUkmDataFiles(); } catch (e) { input.value = ''; showToast(e.message, 'error'); }
}
async function deleteUkmDataFile(id) { if (!confirm('Delete file?')) return; const { error } = await supabaseClient.from('project_files').delete().eq('id', id); if (error) return showToast(error.message, 'error'); showToast('Deleted'); loadUkmDataFiles(); }
function copyStorageSnippet() { const el = document.getElementById('ukmstore-snippet'); if (el) { navigator.clipboard.writeText(el.textContent); showToast('Copied'); } }
function showTableApi(tn) {
    const proj = state.projectsCache.find(p => p.id === state.currentUkmDataProjectId); if (!proj) return; const schema = proj.slug.replace(/-/g, '_');
    document.getElementById('api-table-name').textContent = tn;
    document.getElementById('api-snippet-js').textContent = `import { createClient } from '@supabase/supabase-js'\nconst supabase = createClient('${SUPABASE_URL}', '${SUPABASE_ANON_KEY}')\n\nconst { data, error } = await supabase\n  .schema('${schema}')\n  .from('${tn}')\n  .select('*')`;
    document.getElementById('api-snippet-curl').textContent = `curl '${SUPABASE_URL}/rest/v1/${tn}?select=*' \\\n-H "apikey: ${SUPABASE_ANON_KEY}" \\\n-H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \\\n-H "Accept-Profile: ${schema}"`;
    document.getElementById('api-snippet-realtime').textContent = `supabase\n  .channel('${tn}-changes')\n  .on('postgres_changes',\n    { event: '*', schema: '${schema}', table: '${tn}' },\n    (payload) => console.log(payload)\n  )\n  .subscribe()`;
    document.getElementById('api-docs-modal').classList.remove('hidden');
}
function copyApiSnippet(type) { const el = document.getElementById('api-snippet-' + type); if (el) { navigator.clipboard.writeText(el.textContent); showToast('Copied'); } }
function copyUkmDataConnection() { const txt = 'REST URL:    ' + SUPABASE_URL + '/rest/v1/\nAuth URL:    ' + SUPABASE_URL + '/functions/v1/ukmauth\nStorage URL: ' + SUPABASE_URL + '/functions/v1/ukmstore\nSchema:      ' + (state.ukmDataSchema || '—') + '\nAnon Key:    ' + SUPABASE_ANON_KEY; navigator.clipboard.writeText(txt); showToast('Copied'); }

// CRM / Auth / Keys / Crons / Webhooks / Mail / Logs / Pages
async function loadUkmDataUsers() { const loading = document.getElementById('ukmdata-auth-loading'); const list = document.getElementById('ukmdata-auth-list'); const empty = document.getElementById('ukmdata-auth-empty'); loading.classList.remove('hidden'); list.classList.add('hidden'); empty.classList.add('hidden'); const { data } = await supabaseClient.from('project_users_public').select('*').eq('project_id', state.currentUkmDataProjectId).order('created_at', { ascending: false }); loading.classList.add('hidden'); state.ukmDataUsers = data || []; document.getElementById('ukmdata-auth-count').textContent = state.ukmDataUsers.length + ' users'; generateAuthSnippet(); if (state.ukmDataUsers.length === 0) return empty.classList.remove('hidden'); list.classList.remove('hidden'); list.innerHTML = state.ukmDataUsers.map(u => `<div class="rounded-lg p-3 flex items-center gap-3" style="background: var(--bg); border: 1px solid var(--border);"><div class="w-9 h-9 rounded-full flex items-center justify-center font-bold" style="background: rgba(79,70,229,0.2); color: var(--accent);">${escapeHtml((u.name || u.email || 'U').charAt(0).toUpperCase())}</div><div class="flex-1 min-w-0"><p class="text-sm font-medium truncate" style="color: var(--text);">${escapeHtml(u.name || u.email)}</p><p class="text-[10px] mono" style="color: var(--text-dim);">${escapeHtml(u.email)}</p></div><div class="flex gap-1"><button onclick="openImpersonateModal('${u.id}')" class="px-2 py-1 text-[10px] font-bold rounded" style="background: rgba(139,92,246,0.1); color: #8B5CF6;">Login As</button><button onclick="deleteUkmDataUser('${u.id}')" class="p-1 text-red-400">🗑️</button></div></div>`).join(''); }
async function deleteUkmDataUser(id) { if (confirm('Delete user?')) { await supabaseClient.from('project_users').delete().eq('id', id); loadUkmDataUsers(); } }
function openImpersonateModal(uid) { state.impersonatingUserId = uid; const u = state.ukmDataUsers.find(x => x.id === uid); document.getElementById('impersonate-email').textContent = u ? u.email : 'User'; document.getElementById('impersonate-result').classList.add('hidden'); document.getElementById('impersonate-btn').textContent = 'Generate Token'; document.getElementById('impersonate-modal').classList.remove('hidden'); }
async function executeImpersonation() { const btn = document.getElementById('impersonate-btn'); btn.textContent = 'Generating...'; btn.disabled = true; try { const { data: { session } } = await supabaseClient.auth.getSession(); const proj = state.projectsCache.find(p => p.id === state.currentUkmDataProjectId); const res = await fetch(SUPABASE_URL + '/functions/v1/ukmauth', { method: 'POST', headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'impersonate', project_slug: proj.slug, user_id: state.impersonatingUserId }) }); const data = await res.json(); if (data.error) throw new Error(data.error); document.getElementById('impersonate-token').textContent = data.token; document.getElementById('impersonate-result').classList.remove('hidden'); btn.textContent = 'Copied!'; navigator.clipboard.writeText(data.token); } catch (e) { showToast(e.message, 'error'); btn.textContent = 'Generate Token'; btn.disabled = false; } }
function generateAuthSnippet() { const proj = state.projectsCache.find(p => p.id === state.currentUkmDataProjectId); if (!proj) return; document.getElementById('ukmauth-snippet').textContent = `const API_URL = "${SUPABASE_URL}/functions/v1/ukmauth";\n\nconst res = await fetch(API_URL, {\n  method: "POST",\n  headers: { "Content-Type": "application/json" },\n  body: JSON.stringify({\n    action: "signup",\n    project_slug: "${proj.slug}",\n    email: "user@example.com",\n    password: "secret123"\n  })\n});\nconst { user, token } = await res.json();`; }
function copyAuthSnippet() { navigator.clipboard.writeText(document.getElementById('ukmauth-snippet').textContent); showToast('Copied'); }
function generateAuthUI() { const proj = state.projectsCache.find(p => p.id === state.currentUkmDataProjectId); if (!proj) return; document.getElementById('auth-ui-code').textContent = `<!-- Ukmbase Auth UI -->\n<div id="auth-container" style="max-width:400px; margin:50px auto; padding:20px; background:#1C2333; border-radius:12px; color:white; border:1px solid #2A3347;">\n  <h2 style="text-align:center; color:#4F46E5;">${proj.name}</h2>\n  <input type="email" id="auth-email" placeholder="Email" style="width:100%; padding:12px; margin-bottom:10px; background:#0B1020; border:1px solid #2A3347; border-radius:6px; color:white;">\n  <input type="password" id="auth-password" placeholder="Password" style="width:100%; padding:12px; margin-bottom:20px; background:#0B1020; border:1px solid #2A3347; border-radius:6px; color:white;">\n  <button onclick="submitAuth()" style="width:100%; padding:12px; background:#4F46E5; color:white; border:none; border-radius:6px; font-weight:bold;">Login / Sign Up</button>\n</div>\n<script>\nasync function submitAuth() {\n  const email = document.getElementById('auth-email').value;\n  const password = document.getElementById('auth-password').value;\n  const res = await fetch('${SUPABASE_URL}/functions/v1/ukmauth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'login', project_slug: '${proj.slug}', email, password }) });\n  const data = await res.json();\n  if (data.token) { localStorage.setItem('ukm_token', data.token); alert('Logged in!'); }\n  else alert(data.error);\n}\n<\/script>`; document.getElementById('auth-ui-modal').classList.remove('hidden'); }
async function runAuthTest() { const email = document.getElementById('test-auth-email').value; const pw = document.getElementById('test-auth-password').value; const proj = state.projectsCache.find(p => p.id === state.currentUkmDataProjectId); const res = await fetch(SUPABASE_URL + '/functions/v1/ukmauth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'signup', project_slug: proj.slug, email, password: pw }) }); const data = await res.json(); const el = document.getElementById('test-auth-response'); el.textContent = JSON.stringify(data, null, 2); el.classList.remove('hidden'); el.style.color = data.error ? 'var(--red)' : 'var(--green)'; if (!data.error) loadUkmDataUsers(); }

async function loadApiKeys() { const { data } = await supabaseClient.from('project_api_keys').select('*').eq('project_id', state.currentUkmDataProjectId).order('created_at', { ascending: false }); document.getElementById('apikeys-list').innerHTML = (!data || data.length === 0) ? '<p class="text-xs text-center py-4" style="color: var(--text-muted);">No API keys yet.</p>' : data.map(k => `<div class="rounded-lg p-3 flex items-center justify-between" style="background: var(--bg); border: 1px solid var(--border);"><div><p class="text-xs font-bold" style="color: var(--text);">${escapeHtml(k.name)}</p><p class="text-[10px] mono" style="color: var(--text-muted);">${escapeHtml(k.key_string)}</p></div><div class="flex gap-1"><button onclick="copyToClipboardText('${escapeHtml(k.key_string)}')" class="p-1 text-cyan-400">Copy</button><button onclick="revokeApiKey('${k.id}')" class="p-1 text-red-400">Revoke</button></div></div>`).join(''); }
async function generateApiKey() { const name = prompt('Name this key:'); if (!name) return; const key = `ukm_live_${Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('')}`; await supabaseClient.from('project_api_keys').insert({ project_id: state.currentUkmDataProjectId, name, key_string: key }); showToast('Key generated'); loadApiKeys(); }
async function revokeApiKey(id) { if (confirm('Revoke key?')) { await supabaseClient.from('project_api_keys').delete().eq('id', id); loadApiKeys(); } }

async function loadProjectPages() { const { data } = await supabaseClient.from('project_pages').select('*').eq('project_id', state.currentUkmDataProjectId); document.getElementById('page-table').innerHTML = state.ukmDataTables.map(t => `<option value="${t.table_name}">${t.table_name}</option>`).join(''); document.getElementById('pages-list').innerHTML = (!data || data.length === 0) ? '<p class="text-xs text-center py-4" style="color: var(--text-muted);">No pages yet.</p>' : data.map(p => { const url = window.location.origin + window.location.pathname + '?page=' + p.slug; return `<div class="rounded-lg p-3 flex justify-between" style="background: var(--bg); border: 1px solid var(--border);"><div><p class="text-sm font-bold" style="color: var(--text);">${escapeHtml(p.title)}</p><p class="text-[10px] mono" style="color: var(--text-muted);">${escapeHtml(url)}</p></div><button onclick="copyToClipboardText('${url}')" class="text-[10px] text-cyan-400">Copy Link</button></div>`; }).join(''); }
async function createProjectPage() { const title = document.getElementById('page-title-input').value; const slug = document.getElementById('page-slug-input').value; const table = document.getElementById('page-table').value; const cols = document.getElementById('page-columns').value.split(','); if (!title || !slug || !table) return showToast('Fill fields', 'error'); await supabaseClient.from('project_pages').insert({ project_id: state.currentUkmDataProjectId, title, slug, table_name: table, columns_to_show: cols.map(c => c.trim()) }); document.getElementById('page-form').classList.add('hidden'); showToast('Page created'); loadProjectPages(); }
async function loadCronJobs() { const { data } = await supabaseClient.from('project_crons').select('*').eq('project_id', state.currentUkmDataProjectId); document.getElementById('crons-list').innerHTML = (!data || data.length === 0) ? '<p class="text-xs text-center py-4" style="color: var(--text-muted);">No tasks.</p>' : data.map(c => `<div class="rounded-lg p-3 flex justify-between" style="background: var(--bg); border: 1px solid var(--border);"><div><p class="text-xs font-bold text-cyan-400 mono">${escapeHtml(c.schedule)}</p><p class="text-[10px] mono" style="color: var(--text-muted);">${escapeHtml(c.sql_query)}</p></div><button onclick="deleteCronJob('${c.id}', '${c.job_name}')" class="text-red-400">✕</button></div>`).join(''); }
async function createCronJob() { const sch = document.getElementById('cron-schedule').value; const sql = document.getElementById('cron-sql').value; if (!sch || !sql) return; const { data: { session } } = await supabaseClient.auth.getSession(); await fetch(SUPABASE_URL + '/functions/v1/ukmdata', { method: 'POST', headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'add_cron', project_id: state.currentUkmDataProjectId, schedule: sch, sql_query: sql }) }); document.getElementById('cron-form').classList.add('hidden'); showToast('Scheduled'); loadCronJobs(); }
async function deleteCronJob(id, name) { await supabaseClient.from('project_crons').delete().eq('id', id); loadCronJobs(); }
async function loadUkmDataWebhooks() { document.getElementById('webhook-table').innerHTML = state.ukmDataTables.map(t => `<option value="${t.table_name}">${t.table_name}</option>`).join(''); const { data } = await supabaseClient.from('project_webhooks').select('*').eq('project_id', state.currentUkmDataProjectId); document.getElementById('webhooks-list').innerHTML = (!data || data.length === 0) ? '<p class="text-xs text-center py-4" style="color: var(--text-muted);">No webhooks.</p>' : data.map(h => `<div class="rounded-lg p-3 flex justify-between" style="background: var(--bg); border: 1px solid var(--border);"><div><p class="text-xs font-bold" style="color: var(--text);"><span class="text-cyan-400">${h.event_type}</span> on ${h.table_name}</p><p class="text-[10px] mono" style="color: var(--text-muted);">${escapeHtml(h.target_url)}</p></div><button onclick="deleteWebhook('${h.id}')" class="text-red-400">✕</button></div>`).join(''); }
async function createWebhook() { const tbl = document.getElementById('webhook-table').value; const ev = document.getElementById('webhook-event').value; const url = document.getElementById('webhook-url').value; if (!url) return; const { data: { session } } = await supabaseClient.auth.getSession(); await fetch(SUPABASE_URL + '/functions/v1/ukmdata', { method: 'POST', headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'add_webhook', project_id: state.currentUkmDataProjectId, table_name: tbl, event_type: ev, target_url: url }) }); document.getElementById('webhook-form').classList.add('hidden'); loadUkmDataWebhooks(); }
async function deleteWebhook(id) { await supabaseClient.from('project_webhooks').delete().eq('id', id); loadUkmDataWebhooks(); }
async function loadEmailLogs() { const { data } = await supabaseClient.from('project_emails').select('*').eq('project_id', state.currentUkmDataProjectId).order('created_at', { ascending: false }).limit(10); document.getElementById('mail-logs-list').innerHTML = (!data || data.length === 0) ? '<p class="text-xs text-center py-4" style="color: var(--text-muted);">No emails sent.</p>' : data.map(e => `<div class="rounded-lg p-2 flex justify-between" style="background: var(--bg); border: 1px solid var(--border);"><div><p class="text-[11px] font-bold truncate" style="color: var(--text);">${escapeHtml(e.subject)}</p><p class="text-[9px] mono" style="color: var(--text-muted);">${escapeHtml(e.recipient_email)}</p></div><span class="text-[9px] uppercase ${e.status === 'delivered' ? 'text-green-400' : 'text-red-400'}">${e.status}</span></div>`).join(''); }
async function sendTestEmail() { const to = document.getElementById('mail-test-to').value; const sub = document.getElementById('mail-test-subject').value; if (!to || !sub) return; const { data: { session } } = await supabaseClient.auth.getSession(); await fetch(SUPABASE_URL + '/functions/v1/ukmmail', { method: 'POST', headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ project_id: state.currentUkmDataProjectId, to, subject: sub, html: '<p>Ukmbase test</p>' }) }); showToast('Sent'); loadEmailLogs(); }
async function loadActivityLogs() { const { data: { session } } = await supabaseClient.auth.getSession(); const res = await fetch(SUPABASE_URL + '/functions/v1/ukmdata', { method: 'POST', headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'get_logs', project_id: state.currentUkmDataProjectId }) }); const data = await res.json(); const colors = { 'INSERT': 'text-green-400', 'UPDATE': 'text-yellow-400', 'DELETE': 'text-red-400', 'SQL': 'text-purple-400' }; document.getElementById('activity-logs-list').innerHTML = (!data.logs || data.logs.length === 0) ? '<p class="text-xs text-center py-4" style="color: var(--text-muted);">No activity.</p>' : data.logs.map(l => `<div class="flex items-start gap-3 p-2 rounded-lg" style="background: var(--bg); border: 1px solid var(--border);"><span class="text-[9px] font-bold px-1.5 py-0.5 rounded ${colors[l.event_type] || 'text-gray-400'}">${l.event_type}</span><div class="flex-1 min-w-0"><p class="text-xs font-bold truncate" style="color: var(--text);">${escapeHtml(l.table_name)}</p><p class="text-[10px] mono truncate" style="color: var(--text-muted);">${escapeHtml(l.message)}</p></div></div>`).join(''); }
function copyFormLink(tn) { const proj = state.projectsCache.find(p => p.id === state.currentUkmDataProjectId); if (!proj) return; const url = window.location.origin + window.location.pathname + '?form=' + tn + '&project=' + proj.slug; navigator.clipboard.writeText(url); showToast('Form link copied!'); }

// ============================================
// 8. DATABASE (UkmTables / UkmQuery / UkmSync)
// ============================================
function populateConnectProjectSelect() { const sel = document.getElementById('connect-project-select'); if (!sel) return; const own = state.projectsCache.filter(p => p.owner_id === state.currentUser.id); if (own.length === 0) { sel.innerHTML = '<option value="">— no projects —</option>'; return; } let html = ''; own.forEach(p => { html += '<option value="' + p.id + '">' + escapeHtml(p.name) + '</option>'; }); const cur = sel.value; sel.innerHTML = html; if (cur && own.find(p => p.id === cur)) sel.value = cur; else sel.value = own[0].id; renderConnectSnippets(); }
function switchConnectTab(tab) { const jsP = document.getElementById('connect-panel-js'); const curlP = document.getElementById('connect-panel-curl'); const jsT = document.getElementById('connect-tab-js'); const curlT = document.getElementById('connect-tab-curl'); if (tab === 'js') { jsP.classList.remove('hidden'); curlP.classList.add('hidden'); jsT.style.color = 'var(--text)'; jsT.style.borderBottom = '2px solid var(--accent)'; curlT.style.color = 'var(--text-muted)'; curlT.style.borderBottom = 'none'; } else { jsP.classList.add('hidden'); curlP.classList.remove('hidden'); curlT.style.color = 'var(--text)'; curlT.style.borderBottom = '2px solid var(--accent)'; jsT.style.color = 'var(--text-muted)'; jsT.style.borderBottom = 'none'; } }
function renderConnectSnippets() { const sel = document.getElementById('connect-project-select'); if (!sel || !sel.value) return; const proj = state.projectsCache.find(p => p.id === sel.value); if (!proj) return; document.getElementById('connect-url').value = SUPABASE_URL; document.getElementById('connect-anon').value = SUPABASE_ANON_KEY; document.getElementById('connect-snippet-init').textContent = `import { createClient } from '@supabase/supabase-js'\n\nconst supabase = createClient(\n  '${SUPABASE_URL}',\n  '${SUPABASE_ANON_KEY}'\n)`; document.getElementById('connect-snippet-auth').textContent = `// Sign Up\nconst { data, error } = await fetch('${SUPABASE_URL}/functions/v1/ukmauth', {\n  method: 'POST',\n  headers: { 'Content-Type': 'application/json' },\n  body: JSON.stringify({\n    action: 'signup',\n    project_slug: '${proj.slug}',\n    email: 'user@example.com',\n    password: 'secret123'\n  })\n});`; document.getElementById('connect-snippet-data').textContent = `// Fetch Data\nconst { data, error } = await supabase\n  .schema('${proj.slug.replace(/-/g, '_')}')\n  .from('your_table_name')\n  .select('*')\n\n// Realtime\nsupabase.channel('custom-channel')\n  .on('postgres_changes',\n    { event: '*', schema: '${proj.slug.replace(/-/g, '_')}', table: 'your_table_name' },\n    (payload) => console.log(payload)\n  ).subscribe()`; document.getElementById('connect-snippet-curl').textContent = `curl '${SUPABASE_URL}/rest/v1/your_table_name?select=*' \\\n-H "apikey: ${SUPABASE_ANON_KEY}" \\\n-H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \\\n-H "Accept-Profile: ${proj.slug.replace(/-/g, '_')}"`; }

async function loadConnections() { if (!state.currentUser) return; const { data, error } = await supabaseClient.from('connected_databases').select('*').order('created_at', { ascending: false }); if (error) return console.error(error.message); state.connectionsCache = data || []; renderConnections(); }
function renderConnections() {
    const empty = document.getElementById('ukmtables-empty'); const list = document.getElementById('ukmtables-list'); const title = document.getElementById('ukmtables-title'); const subtitle = document.getElementById('ukmtables-subtitle'); const actionBtn = document.getElementById('ukmtables-action'); const backBtn = document.getElementById('ukmtables-back'); if (!empty) return;
    title.textContent = 'UkmTables'; subtitle.textContent = 'Connect any Supabase database'; actionBtn.innerText = '+ Connect'; actionBtn.onclick = openConnectModal; backBtn.classList.add('hidden');
    document.getElementById('ukmtables-connections-view').classList.remove('hidden'); document.getElementById('ukmtables-browser').classList.add('hidden');
    if (state.connectionsCache.length === 0) { empty.classList.remove('hidden'); list.classList.add('hidden'); return; }
    empty.classList.add('hidden'); list.classList.remove('hidden');
    list.innerHTML = state.connectionsCache.map(c => `<div class="rounded-xl p-4 flex items-center justify-between" style="background: var(--surface); border: 1px solid var(--border);"><div class="flex items-center gap-3 min-w-0 cursor-pointer flex-1" onclick="openConnection('${c.id}')"><div class="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style="background: rgba(6,182,212,0.1); border: 1px solid rgba(6,182,212,0.3);">🗄️</div><div class="min-w-0"><p class="text-sm font-medium truncate" style="color: var(--text);">${escapeHtml(c.name)}</p><p class="text-xs mono truncate" style="color: var(--text-dim);">${escapeHtml(c.supabase_url.replace('https://', ''))}</p></div></div><button onclick="deleteConnection('${c.id}')" class="p-2" style="color: var(--text-muted);">🗑️</button></div>`).join('');
}
function openConnectModal() { if (!canCreateConnection()) { if (confirm('Limit reached. Upgrade?')) switchView('billing'); return; } const modal = document.getElementById('connect-modal'); modal.classList.remove('hidden'); document.getElementById('connect-error').classList.add('hidden'); ['connect-name', 'connect-url', 'connect-key'].forEach(id => { const el = modal.querySelector('#' + id); if (el) el.value = ''; }); }
function closeConnectModal() { document.getElementById('connect-modal').classList.add('hidden'); }
async function createConnection() {
    const modal = document.getElementById('connect-modal'); const name = modal.querySelector('#connect-name').value.trim(); const url = modal.querySelector('#connect-url').value.trim().replace(/\/$/, ''); const key = modal.querySelector('#connect-key').value.trim();
    const err = document.getElementById('connect-error'); const btn = document.getElementById('create-connect-btn'); err.classList.add('hidden');
    if (!name || !url || !key) { err.textContent = 'All fields required.'; err.classList.remove('hidden'); return; }
    btn.innerText = 'Testing...'; btn.disabled = true;
    try { const testRes = await fetch(url + '/rest/v1/profiles?select=id&limit=1', { headers: getHeaders(key) }); if (testRes.status >= 500) throw new Error('Connection failed (' + testRes.status + ').'); if (testRes.status === 404) throw new Error('Endpoint unreachable.'); } catch (e) { btn.innerText = 'Connect'; btn.disabled = false; err.textContent = e.message; err.classList.remove('hidden'); return; }
    const { error } = await supabaseClient.from('connected_databases').insert([{ owner_id: state.currentUser.id, name, supabase_url: url, supabase_anon_key: key }]); btn.innerText = 'Connect'; btn.disabled = false;
    if (error) { err.textContent = error.message; err.classList.remove('hidden'); return; }
    closeConnectModal(); await loadConnections(); populateQueryConnections(); showToast('Database connected');
}
async function deleteConnection(id) { if (!confirm('Delete connection?')) return; const { error } = await supabaseClient.from('connected_databases').delete().eq('id', id); if (error) return showToast(error.message, 'error'); await loadConnections(); populateQueryConnections(); showToast('Deleted'); }
async function openConnection(id) {
    const conn = state.connectionsCache.find(c => c.id === id); if (!conn) return; state.activeConnection = conn;
    const title = document.getElementById('ukmtables-title'); const subtitle = document.getElementById('ukmtables-subtitle'); const actionBtn = document.getElementById('ukmtables-action'); const backBtn = document.getElementById('ukmtables-back');
    title.textContent = conn.name; subtitle.textContent = 'Reading schema...'; actionBtn.innerText = '+ Refresh'; actionBtn.onclick = () => openConnection(id); backBtn.classList.remove('hidden');
    document.getElementById('ukmtables-connections-view').classList.add('hidden'); document.getElementById('ukmtables-browser').classList.remove('hidden'); document.getElementById('ukmtables-rows').classList.add('hidden'); document.getElementById('ukmtables-rows-empty').classList.add('hidden'); document.getElementById('ukmtables-rows-loading').classList.remove('hidden'); document.getElementById('ukmtables-pills').innerHTML = '';
    try {
        const res = await fetch(conn.supabase_url + '/rest/v1/', { headers: getHeaders(conn.supabase_anon_key) }); let spec = null; if (res.ok) { try { spec = await res.json(); } catch (_) {} }
        let tables = []; if (spec) tables = Object.keys(spec.definitions || (spec.components && spec.components.schemas) || {}).sort();
        if (tables.length === 0) { const cands = ['profiles', 'projects', 'plans', 'payments', 'subscriptions', 'usage_metrics', 'waitlist', 'connected_databases', 'upgrade_requests', 'query_history', 'team_members', 'sync_configs', 'sync_logs', 'project_schemas', 'project_users_public', 'project_files']; for (let i = 0; i < cands.length; i++) { try { const r = await fetch(conn.supabase_url + '/rest/v1/' + cands[i] + '?select=*&limit=1', { headers: getHeaders(conn.supabase_anon_key) }); if (r.status === 200 || r.status === 206) tables.push(cands[i]); } catch (_) {} } }
        subtitle.textContent = tables.length + ' tables';
        if (tables.length === 0) { document.getElementById('ukmtables-rows-loading').classList.add('hidden'); document.getElementById('ukmtables-rows-empty').classList.remove('hidden'); document.getElementById('ukmtables-rows-empty').innerHTML = '<p class="text-sm" style="color: var(--text-muted);">No tables.</p>'; return; }
        document.getElementById('ukmtables-pills').innerHTML = tables.map(t => `<button onclick="selectTable('${t}')" data-table="${t}" class="table-pill text-xs px-3 py-1.5 rounded-lg mono" style="background: var(--surface); border: 1px solid var(--border); color: var(--text-muted);">${escapeHtml(t)}</button>`).join('');
        await selectTable(tables[0]);
    } catch (e) { subtitle.textContent = 'Error'; document.getElementById('ukmtables-rows-loading').classList.add('hidden'); document.getElementById('ukmtables-rows-empty').classList.remove('hidden'); document.getElementById('ukmtables-rows-empty').innerHTML = '<p class="text-sm" style="color: var(--red);">' + escapeHtml(e.message) + '</p>'; }
}
function exitTableBrowser() { state.activeConnection = null; document.getElementById('ukmtables-connections-view').classList.remove('hidden'); document.getElementById('ukmtables-browser').classList.add('hidden'); renderConnections(); }
async function selectTable(tn) {
    if (!state.activeConnection) return; document.querySelectorAll('.table-pill').forEach(p => { if (p.dataset.table === tn) p.classList.add('active'); else p.classList.remove('active'); });
    document.getElementById('ukmtables-rows').classList.add('hidden'); document.getElementById('ukmtables-rows-empty').classList.add('hidden'); document.getElementById('ukmtables-rows-loading').classList.remove('hidden');
    try { const res = await fetch(state.activeConnection.supabase_url + '/rest/v1/' + tn + '?select=*&limit=50', { headers: getHeaders(state.activeConnection.supabase_anon_key) }); document.getElementById('ukmtables-rows-loading').classList.add('hidden'); if (!res.ok) throw new Error('Failed to load rows (' + res.status + ')'); const rows = await res.json(); if (!rows || rows.length === 0) { document.getElementById('ukmtables-rows-empty').classList.remove('hidden'); document.getElementById('ukmtables-rows-empty').innerHTML = '<p class="text-sm" style="color: var(--text-muted);">No rows.</p>'; return; } renderRows(rows); } catch (e) { document.getElementById('ukmtables-rows-loading').classList.add('hidden'); document.getElementById('ukmtables-rows-empty').classList.remove('hidden'); document.getElementById('ukmtables-rows-empty').innerHTML = '<p class="text-sm" style="color: var(--red);">' + escapeHtml(e.message) + '</p>'; }
}
function renderRows(rows) { const container = document.getElementById('ukmtables-rows'); container.classList.remove('hidden'); container.innerHTML = rows.map((row, idx) => { let fields = ''; Object.keys(row).forEach(k => { const v = row[k]; let display; if (v === null || v === undefined) display = '<span style="color: var(--text-dim);" class="italic">null</span>'; else if (typeof v === 'object') display = escapeHtml(JSON.stringify(v)); else display = escapeHtml(String(v)); fields += '<div class="flex gap-2 py-1 text-xs"><span class="field-key mono flex-shrink-0">' + escapeHtml(k) + ':</span><span class="field-val mono flex-1">' + display + '</span></div>'; }); const jsonStr = JSON.stringify(row).replace(/'/g, '&#39;').replace(/"/g, '&quot;'); return '<div class="rounded-xl p-4" style="background: var(--surface); border: 1px solid var(--border);"><div class="flex items-center justify-between mb-2 pb-2" style="border-bottom: 1px solid var(--border);"><span class="text-[10px] uppercase font-bold mono" style="color: var(--accent);">Row ' + (idx + 1) + '</span><button onclick="copyRow(\'' + jsonStr + '\')" class="text-[10px]" style="color: var(--cyan);">Copy JSON</button></div><div class="space-y-0.5">' + fields + '</div></div>'; }).join(''); }
function copyRow(jsonStr) { const clean = jsonStr.replace(/&quot;/g, '"').replace(/&#39;/g, "'"); navigator.clipboard.writeText(clean); showToast('Row copied'); }

function populateQueryConnections() { const sel = document.getElementById('query-connection'); if (!sel) return; const cur = sel.value; let html = '<option value="">— no database selected —</option>'; state.connectionsCache.forEach(c => { html += '<option value="' + c.id + '">' + escapeHtml(c.name) + '</option>'; }); sel.innerHTML = html; if (cur) sel.value = cur; }
function setQueryPrompt(text) { document.getElementById('query-prompt').value = text; document.getElementById('query-prompt').focus(); }
async function generateSQL() {
    const prompt = document.getElementById('query-prompt').value.trim(); const submitBtn = document.getElementById('query-submit'); const outputWrap = document.getElementById('query-output-wrap'); const outputEl = document.getElementById('query-output'); const loadingEl = document.getElementById('query-loading'); const warningEl = document.getElementById('query-warning');
    if (!prompt) return showToast('Describe what you want first', 'error'); const connId = document.getElementById('query-connection').value; let contextPrompt = prompt;
    if (connId) { const conn = state.connectionsCache.find(c => c.id === connId); if (conn) contextPrompt = 'Database: ' + conn.name + '\n\nTask: ' + prompt; }
    submitBtn.disabled = true; submitBtn.innerHTML = 'Generating...'; outputWrap.classList.add('hidden'); loadingEl.classList.remove('hidden'); warningEl.classList.add('hidden');
    try {
        const data = await aiCall({ prompt: contextPrompt, mode: 'sql' });
        loadingEl.classList.add('hidden'); submitBtn.disabled = false; submitBtn.innerHTML = 'Generate SQL';
        const raw = data.content || ''; const match = raw.match(/```(?:sql)?\s*([\s\S]*?)```/i); const sql = match ? match[1].trim() : raw.trim(); state.lastGeneratedSQL = sql; outputWrap.classList.remove('hidden');
        if (DESTRUCTIVE_SQL_RE.test(sql)) warningEl.classList.remove('hidden');
        outputEl.innerHTML = '<pre><code class="language-sql">' + escapeHtml(sql) + '</code></pre>'; outputEl.querySelectorAll('pre code').forEach(b => hljs.highlightElement(b));
        const pre = outputEl.querySelector('pre'); if (pre) { pre.style.position = 'relative'; const btn = document.createElement('button'); btn.className = 'copy-btn'; btn.innerText = 'Copy'; btn.onclick = () => { navigator.clipboard.writeText(sql); btn.innerText = 'Copied!'; setTimeout(() => btn.innerText = 'Copy', 1500); }; pre.appendChild(btn); }
        await saveQueryToHistory(connId || null, prompt, sql);
    } catch (err) { loadingEl.classList.add('hidden'); submitBtn.disabled = false; submitBtn.innerHTML = 'Generate SQL'; outputWrap.classList.remove('hidden'); outputEl.innerHTML = '<p style="color: var(--red);" class="text-sm">' + escapeHtml(aiFormatError(err)) + '</p>'; }
}
function copyGeneratedSQL() { if (!state.lastGeneratedSQL) return; navigator.clipboard.writeText(state.lastGeneratedSQL); showToast('SQL copied'); }
async function saveQueryToHistory(cid, prompt, sql) { if (!state.currentUser) return; await supabaseClient.from('query_history').insert([{ user_id: state.currentUser.id, connection_id: cid, prompt, generated_sql: sql }]); await loadQueryHistory(); }
async function loadQueryHistory() {
    if (!state.currentUser) return; const wrap = document.getElementById('query-history-wrap'); const list = document.getElementById('query-history-list'); if (!wrap || !list) return;
    const { data } = await supabaseClient.from('query_history').select('*').eq('user_id', state.currentUser.id).order('created_at', { ascending: false }).limit(10);
    if (!data || data.length === 0) { wrap.classList.add('hidden'); return; }
    wrap.classList.remove('hidden'); list.innerHTML = data.map(h => `<div class="rounded-xl p-3 cursor-pointer" style="background: var(--surface); border: 1px solid var(--border);" onclick="loadHistoryItem('${h.id}')"><div class="flex items-start justify-between mb-1"><p class="text-xs font-medium flex-1 pr-2 line-clamp-2" style="color: var(--text);">${escapeHtml(h.prompt)}</p><span class="text-[10px] flex-shrink-0 mono" style="color: var(--text-dim);">${new Date(h.created_at).toLocaleDateString()}</span></div><p class="text-[10px] mono truncate" style="color: var(--cyan);">${escapeHtml(h.generated_sql.split('\n')[0])}</p></div>`).join('');
}
async function loadHistoryItem(id) {
    const { data } = await supabaseClient.from('query_history').select('*').eq('id', id).single(); if (!data) return;
    document.getElementById('query-prompt').value = data.prompt; state.lastGeneratedSQL = data.generated_sql;
    const out = document.getElementById('query-output-wrap'); const oel = document.getElementById('query-output'); const warn = document.getElementById('query-warning');
    out.classList.remove('hidden'); warn.classList.add('hidden'); if (DESTRUCTIVE_SQL_RE.test(data.generated_sql)) warn.classList.remove('hidden');
    oel.innerHTML = '<pre><code class="language-sql">' + escapeHtml(data.generated_sql) + '</code></pre>'; oel.querySelectorAll('pre code').forEach(b => hljs.highlightElement(b)); out.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function populateSyncProjectSelect() { const sel = document.getElementById('sync-project-select'); if (!sel) return; const own = state.projectsCache.filter(p => p.owner_id === state.currentUser.id); if (own.length === 0) { document.getElementById('sync-empty').classList.remove('hidden'); document.getElementById('sync-panel').classList.add('hidden'); sel.innerHTML = '<option value="">— no projects —</option>'; return; } document.getElementById('sync-empty').classList.add('hidden'); sel.innerHTML = own.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join(''); const cur = sel.value; if (cur && own.find(p => p.id === cur)) sel.value = cur; else sel.value = own[0].id; onSyncProjectChange(); }
async function onSyncProjectChange() { const sel = document.getElementById('sync-project-select'); if (!sel || !sel.value) { document.getElementById('sync-panel').classList.add('hidden'); return; } state.currentSyncProjectId = sel.value; await loadSyncConfig(state.currentSyncProjectId); renderSyncPanel(); loadSyncLogs(); }
async function loadSyncConfig(pid) { const { data } = await supabaseClient.from('sync_configs').select('*').eq('project_id', pid).maybeSingle(); if (data) { state.syncConfigCache = data; return; } const { data: created } = await supabaseClient.from('sync_configs').insert([{ project_id: pid, enabled: false, conflict_strategy: 'last-write-wins', tables_to_sync: [], poll_interval_ms: 15000 }]).select().single(); state.syncConfigCache = created; }
function renderSyncPanel() { const panel = document.getElementById('sync-panel'); if (!panel || !state.syncConfigCache) return; panel.classList.remove('hidden'); document.getElementById('sync-enabled').checked = !!state.syncConfigCache.enabled; document.getElementById('sync-strategy').value = state.syncConfigCache.conflict_strategy || 'last-write-wins'; document.getElementById('sync-tables').value = (state.syncConfigCache.tables_to_sync || []).join(', '); document.getElementById('sync-interval').value = state.syncConfigCache.poll_interval_ms || 15000; generateSdkSnippet(); }
async function toggleSyncEnabled() { if (!state.syncConfigCache) return; const en = document.getElementById('sync-enabled').checked; await supabaseClient.from('sync_configs').update({ enabled: en }).eq('id', state.syncConfigCache.id); state.syncConfigCache.enabled = en; showToast(en ? 'Sync enabled' : 'Sync paused'); }
async function updateSyncConfig() { if (!state.syncConfigCache) return; const st = document.getElementById('sync-strategy').value; const tr = document.getElementById('sync-tables').value.trim(); const iv = parseInt(document.getElementById('sync-interval').value, 10) || 15000; const tbls = tr ? tr.split(',').map(t => t.trim()).filter(Boolean) : []; await supabaseClient.from('sync_configs').update({ conflict_strategy: st, tables_to_sync: tbls, poll_interval_ms: iv }).eq('id', state.syncConfigCache.id); state.syncConfigCache.conflict_strategy = st; state.syncConfigCache.tables_to_sync = tbls; state.syncConfigCache.poll_interval_ms = iv; generateSdkSnippet(); showToast('Config saved'); }
function generateSdkSnippet() { const el = document.getElementById('sync-snippet'); if (!el || !state.syncConfigCache) return; const proj = state.projectsCache.find(p => p.id === state.currentSyncProjectId); const slug = proj ? proj.slug : 'unknown'; el.textContent = '<!-- UkmSync SDK -->\n<script\n  src="https://kumgtourryl-collab.github.io/Ukmbase-/ukmsync.js"\n  data-ukm-project="' + slug + '"\n  data-ukm-backend-url="https://ukmsync-server.onrender.com"\n  data-ukm-supabase-url="' + SUPABASE_URL + '"\n  data-ukm-anon-key="' + SUPABASE_ANON_KEY + '"\n  data-ukm-enabled="' + (state.syncConfigCache.enabled ? 'true' : 'false') + '"\n  data-ukm-strategy="' + state.syncConfigCache.conflict_strategy + '"\n  data-ukm-tables="' + ((state.syncConfigCache.tables_to_sync || []).join(',')) + '"\n  data-ukm-poll-ms="' + (state.syncConfigCache.poll_interval_ms || 15000) + '"\n  defer\n><\/script>'; }
function copySdkSnippet() { const el = document.getElementById('sync-snippet'); if (!el) return; navigator.clipboard.writeText(el.textContent); showToast('SDK snippet copied'); }
async function loadSyncLogs() { if (!state.currentSyncProjectId) return; const loading = document.getElementById('sync-logs-loading'); const list = document.getElementById('sync-logs-list'); const empty = document.getElementById('sync-logs-empty'); loading.classList.remove('hidden'); list.classList.add('hidden'); empty.classList.add('hidden'); const { data } = await supabaseClient.from('sync_logs').select('*').eq('project_id', state.currentSyncProjectId).order('created_at', { ascending: false }).limit(20); loading.classList.add('hidden'); if (!data || data.length === 0) { empty.classList.remove('hidden'); return; } list.classList.remove('hidden'); list.innerHTML = data.map(log => `<div class="rounded-lg p-3 flex items-start justify-between" style="background: var(--bg); border: 1px solid var(--border);"><div class="min-w-0 flex-1"><div class="flex items-center gap-2 mb-1"><span class="text-[9px] font-bold uppercase px-2 py-0.5 rounded text-[#94A3B8] bg-[#94A3B8]/10">${escapeHtml(log.event_type)}</span>${log.table_name ? '<span class="text-[10px] mono" style="color: var(--text-muted);">' + escapeHtml(log.table_name) + '</span>' : ''}${log.record_count ? '<span class="text-[10px] mono" style="color: var(--text-dim);">× ' + log.record_count + '</span>' : ''}</div>${log.message ? '<p class="text-xs truncate" style="color: var(--text-muted);">' + escapeHtml(log.message) + '</p>' : ''}<p class="text-[10px] mono mt-1" style="color: var(--text-dim);">${new Date(log.created_at).toLocaleString()}</p></div></div>`).join(''); }

// ============================================
// 9. BILLING, PAYMENTS, OWNER CONSOLE
// ============================================
function renderBilling() {
    if (!state.currentProfile) return; const plan = STAFF_ROLES.includes(state.currentProfile.role) ? state.currentProfile.role : (state.currentProfile.plan || 'free'); const price = PLAN_PRICES[plan] || PLAN_PRICES.free;
    document.getElementById('billing-plan-name').textContent = plan; document.getElementById('billing-plan-price').textContent = price.label;
    const roleTag = document.getElementById('billing-role-tag'); if (STAFF_ROLES.includes(state.currentProfile.role)) { roleTag.classList.remove('hidden'); roleTag.classList.add('role-' + state.currentProfile.role); roleTag.textContent = state.currentProfile.role; } else roleTag.classList.add('hidden');
    const limits = getLimits();
    document.getElementById('billing-projects-label').textContent = state.projectsCache.length + ' / ' + (limits.projects >= 999 ? '∞' : limits.projects); document.getElementById('billing-projects-bar').style.width = (limits.projects >= 999 ? 5 : Math.min(100, (state.projectsCache.length / limits.projects) * 100)) + '%';
    document.getElementById('billing-connections-label').textContent = state.connectionsCache.length + ' / ' + (limits.connections >= 999 ? '∞' : limits.connections); document.getElementById('billing-connections-bar').style.width = (limits.connections >= 999 ? 5 : Math.min(100, (state.connectionsCache.length / limits.connections) * 100)) + '%';
    const repos = state.projectsCache.filter(p => p.github_repo && p.owner_id === state.currentUser.id).length; document.getElementById('billing-repos-label').textContent = repos + ' / ' + (limits.repos >= 999 ? '∞' : limits.repos); document.getElementById('billing-repos-bar').style.width = (limits.repos >= 999 ? 5 : Math.min(100, (repos / limits.repos) * 100)) + '%';
    const seats = getTeamSeatsUsed() + state.teamCache.filter(m => m.status === 'pending').length; document.getElementById('billing-seats-label').textContent = seats + ' / ' + (limits.seats >= 999 ? '∞' : limits.seats); document.getElementById('billing-seats-bar').style.width = (limits.seats >= 999 ? 5 : Math.min(100, (seats / limits.seats) * 100)) + '%';
    const tokens = state.projectsCache.reduce((s, p) => s + (Number(p.ai_tokens_used) || 0), 0); const tLimit = STAFF_ROLES.includes(state.currentProfile.role) ? 999999 : (state.currentProfile.plan === 'pro' ? 500000 : state.currentProfile.plan === 'team' ? 2000000 : 100000);
    document.getElementById('billing-tokens-label').textContent = tokens.toLocaleString() + ' / ' + (tLimit >= 999999 ? '∞' : (tLimit / 1000) + 'k'); document.getElementById('billing-tokens-bar').style.width = Math.min(100, (tokens / tLimit) * 100) + '%';
}
function openUpgradeModal(plan, price) {
    state.currentUpgradePlan = { plan, price };
    document.getElementById('upgrade-plan-name').textContent = plan.charAt(0).toUpperCase() + plan.slice(1); document.getElementById('upgrade-plan-detail').textContent = price ? '$' + price + '/mo billed monthly' : 'Custom pricing';
    document.getElementById('upgrade-error').classList.add('hidden'); document.getElementById('upgrade-name').value = (state.currentProfile && state.currentProfile.full_name) || ''; document.getElementById('upgrade-contact').value = (state.currentProfile && (state.currentProfile.phone || state.currentProfile.email)) || (state.currentUser && state.currentUser.email) || ''; document.getElementById('upgrade-notes').value = '';
    const btn = document.getElementById('submit-upgrade-btn'); btn.disabled = false; btn.textContent = 'Send Request';
    const help = document.getElementById('upgrade-support-line'); if (help) help.innerHTML = 'Questions? WhatsApp <a href="' + supportWhatsAppLink('Hi') + '" target="_blank" style="color: var(--cyan);">' + SUPPORT_WA_INTL + '</a> or email <a href="' + supportEmailLink('Question') + '" style="color: var(--cyan);">' + SUPPORT_EMAIL + '</a>';
    document.getElementById('upgrade-modal').classList.remove('hidden');
}
function closeUpgradeModal() { document.getElementById('upgrade-modal').classList.add('hidden'); state.currentUpgradePlan = null; }
async function submitUpgradeRequest() {
    const btn = document.getElementById('submit-upgrade-btn'); if (btn.disabled) return; const name = document.getElementById('upgrade-name').value.trim(); const contact = document.getElementById('upgrade-contact').value.trim(); const notes = document.getElementById('upgrade-notes').value.trim(); const err = document.getElementById('upgrade-error'); err.classList.add('hidden');
    if (!name || !contact || !state.currentUpgradePlan) { err.textContent = 'Name and contact required.'; err.classList.remove('hidden'); return; } btn.textContent = 'Sending...'; btn.disabled = true;
    try { const { error } = await supabaseClient.from('upgrade_requests').insert([{ user_id: state.currentUser.id, requested_plan: state.currentUpgradePlan.plan, amount: state.currentUpgradePlan.price, currency: 'USD', contact_method: contact.indexOf('@') !== -1 ? 'email' : 'whatsapp', contact_value: contact, notes: 'Name: ' + name + (notes ? ' | ' + notes : ''), status: 'pending' }]); if (error) throw error; closeUpgradeModal(); showToast("Request sent!", 'success', 5000); await loadMyUpgradeRequests(); } catch (e) { err.innerHTML = escapeHtml(e.message) + '<br><span style="font-size:10px;opacity:0.75;">Still stuck? WhatsApp <a href="' + supportWhatsAppLink('Help') + '" target="_blank" style="color: var(--cyan);">+' + SUPPORT_WA_INTL + '</a>.</span>'; err.classList.remove('hidden'); } finally { btn.disabled = false; btn.textContent = 'Send Request'; }
}
async function loadMyUpgradeRequests() { if (!state.currentUser) return; const wrap = document.getElementById('billing-my-requests'); const list = document.getElementById('billing-requests-list'); if (!wrap || !list) return; const { data } = await supabaseClient.from('upgrade_requests').select('*').eq('user_id', state.currentUser.id).order('created_at', { ascending: false }); if (!data || data.length === 0) { wrap.classList.add('hidden'); return; } wrap.classList.remove('hidden'); list.innerHTML = data.map(r => `<div class="rounded-lg p-3 flex items-center justify-between" style="background: var(--bg); border: 1px solid var(--border);"><div><p class="text-sm font-medium capitalize" style="color: var(--text);">${escapeHtml(r.requested_plan)}</p><p class="text-xs mono" style="color: var(--text-dim);">${new Date(r.created_at).toLocaleDateString()}</p></div><span class="text-[10px] uppercase font-bold ${r.status === 'approved' ? 'text-green-400' : r.status === 'pending' ? 'text-yellow-400' : 'text-red-400'}">${r.status}</span></div>`).join(''); }
function switchPayTab(tab) { const pp = document.getElementById('pay-plans-panel'); const py = document.getElementById('pay-payments-panel'); const pt = document.getElementById('pay-tab-plans'); const pyt = document.getElementById('pay-tab-payments'); if (tab === 'plans') { pp.classList.remove('hidden'); py.classList.add('hidden'); pt.style.color = 'var(--text)'; pt.style.borderBottom = '2px solid var(--accent)'; pyt.style.color = 'var(--text-muted)'; pyt.style.borderBottom = 'none'; } else { pp.classList.add('hidden'); py.classList.remove('hidden'); pyt.style.color = 'var(--text)'; pyt.style.borderBottom = '2px solid var(--accent)'; pt.style.color = 'var(--text-muted)'; pt.style.borderBottom = 'none'; } }
function openPlanModal() { if (state.projectsCache.filter(p => p.owner_id === state.currentUser.id).length === 0) return showToast('Create a project first', 'error'); document.getElementById('plan-modal').classList.remove('hidden'); document.getElementById('plan-error').classList.add('hidden'); populateProjectSelects(); ['plan-name', 'plan-price', 'plan-url'].forEach(id => document.getElementById(id).value = ''); }
function closePlanModal() { document.getElementById('plan-modal').classList.add('hidden'); }
async function loadPlans() {
    if (!state.currentUser) return; const { data } = await supabaseClient.from('plans').select('*').order('created_at', { ascending: false }); const empty = document.getElementById('pay-empty-plans'); const grid = document.getElementById('pay-plans-grid');
    if (!data || data.length === 0) { empty.classList.remove('hidden'); grid.classList.add('hidden'); document.getElementById('pay-plans-count').textContent = '0'; return; }
    empty.classList.add('hidden'); grid.classList.remove('hidden'); grid.innerHTML = data.map(pl => `<div class="rounded-xl p-5" style="background: var(--surface); border: 1px solid var(--border);"><div class="flex items-start justify-between mb-3"><span class="text-[10px] font-bold uppercase px-2 py-1 rounded" style="background: rgba(79,70,229,0.1); color: var(--accent);">${escapeHtml(pl.provider)}</span><span class="text-[10px]" style="color: var(--text-dim);">${escapeHtml(pl.interval)}</span></div><h3 class="font-bold mb-1" style="color: var(--text);">${escapeHtml(pl.name)}</h3><div class="text-2xl font-extrabold mono mb-3" style="color: var(--text);">${escapeHtml(pl.currency)} ${Number(pl.price_amount).toFixed(2)}</div>${pl.checkout_url ? '<button onclick="copyCheckout(\'' + escapeHtml(pl.checkout_url) + '\')" class="w-full text-xs font-bold py-2 rounded-lg" style="background: rgba(79,70,229,0.1); border: 1px solid rgba(79,70,229,0.3); color: var(--cyan);">Copy Checkout Link</button>' : '<p class="text-xs" style="color: var(--text-dim);">No checkout link</p>'}</div>`).join('');
    document.getElementById('pay-plans-count').textContent = data.length; const pps = document.getElementById('pay-plan'); let po = '<option value="">— none —</option>'; data.forEach(pl => po += `<option value="${pl.id}">${escapeHtml(pl.name)}</option>`); pps.innerHTML = po;
}
function copyCheckout(url) { navigator.clipboard.writeText(url); showToast('Copied'); }
async function createPlan() {
    const pid = document.getElementById('plan-project').value; const name = document.getElementById('plan-name').value.trim(); const price = parseFloat(document.getElementById('plan-price').value); const curr = document.getElementById('plan-currency').value; const inv = document.getElementById('plan-interval').value; const prov = document.getElementById('plan-provider').value; const url = document.getElementById('plan-url').value.trim(); const err = document.getElementById('plan-error'); const btn = document.getElementById('create-plan-btn');
    err.classList.add('hidden'); if (!pid || !name || isNaN(price)) { err.textContent = 'Project, name, and price required.'; err.classList.remove('hidden'); return; } btn.innerText = 'Creating...'; btn.disabled = true;
    const { error } = await supabaseClient.from('plans').insert([{ project_id: pid, name, price_amount: price, currency: curr, interval: inv, provider: prov, checkout_url: url || null, active: true }]); btn.innerText = 'Create Plan'; btn.disabled = false;
    if (error) { err.textContent = error.message; err.classList.remove('hidden'); return; } closePlanModal(); await loadPlans(); showToast('Plan created');
}
function openPaymentModal() { if (state.projectsCache.filter(p => p.owner_id === state.currentUser.id).length === 0) return showToast('Create a project first', 'error'); document.getElementById('payment-modal').classList.remove('hidden'); document.getElementById('payment-error').classList.add('hidden'); populateProjectSelects(); ['pay-email', 'pay-amount'].forEach(id => document.getElementById(id).value = ''); }
function closePaymentModal() { document.getElementById('payment-modal').classList.add('hidden'); }
async function loadPayments() {
    if (!state.currentUser) return; const { data } = await supabaseClient.from('payments').select('*').order('paid_at', { ascending: false }); const paid = (data || []).filter(p => p.status === 'paid'); const total = paid.reduce((s, p) => s + Number(p.amount), 0); const now = new Date(); const monthly = paid.filter(p => { const d = new Date(p.paid_at); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).reduce((s, p) => s + Number(p.amount), 0);
    document.getElementById('pay-total').textContent = '$' + total.toFixed(2); document.getElementById('pay-month').textContent = '$' + monthly.toFixed(2); const sr = document.getElementById('stat-revenue'); if (sr) sr.textContent = '$' + total.toFixed(2);
    const empty = document.getElementById('pay-empty-payments'); const list = document.getElementById('pay-payments-list'); if (!data || data.length === 0) { empty.classList.remove('hidden'); list.classList.add('hidden'); return; } empty.classList.add('hidden'); list.classList.remove('hidden');
    list.innerHTML = data.map(p => `<div class="rounded-xl p-4 flex items-center justify-between" style="background: var(--surface); border: 1px solid var(--border);"><div class="min-w-0"><p class="text-sm font-medium truncate" style="color: var(--text);">${escapeHtml(p.customer_email || 'Anonymous')}</p><p class="text-xs mono" style="color: var(--text-dim);">${new Date(p.paid_at).toLocaleDateString()} · ${escapeHtml(p.provider || 'manual')}</p></div><div class="text-right flex-shrink-0"><div class="font-bold mono" style="color: var(--text);">${escapeHtml(p.currency)} ${Number(p.amount).toFixed(2)}</div><span class="text-[10px] uppercase font-bold ${p.status === 'paid' ? 'text-green-400' : 'text-yellow-400'}">${p.status}</span></div></div>`).join('');
}
async function createPayment() {
    const pid = document.getElementById('pay-project').value; const plan = document.getElementById('pay-plan').value || null; const email = document.getElementById('pay-email').value.trim(); const amt = parseFloat(document.getElementById('pay-amount').value); const curr = document.getElementById('pay-currency').value; const prov = document.getElementById('pay-provider').value; const err = document.getElementById('payment-error'); const btn = document.getElementById('create-payment-btn');
    err.classList.add('hidden'); if (!pid || isNaN(amt)) { err.textContent = 'Project and amount required.'; err.classList.remove('hidden'); return; } btn.innerText = 'Logging...'; btn.disabled = true;
    const { error } = await supabaseClient.from('payments').insert([{ project_id: pid, plan_id: plan, customer_email: email || null, amount: amt, currency: curr, provider: prov, status: 'paid', paid_at: new Date().toISOString() }]); btn.innerText = 'Log Payment'; btn.disabled = false;
    if (error) { err.textContent = error.message; err.classList.remove('hidden'); return; } closePaymentModal(); await loadPayments(); showToast('Payment logged');
}

async function loadOwnerConsole() {
    if (!state.currentProfile || !STAFF_ROLES.includes(state.currentProfile.role)) return;
    const [u, p, pay, t] = await Promise.all([ supabaseClient.from('profiles').select('*').order('created_at', { ascending: false }), supabaseClient.from('projects').select('*').order('created_at', { ascending: false }), supabaseClient.from('payments').select('*').eq('status', 'paid'), supabaseClient.from('team_members').select('*').eq('status', 'active') ]);
    state.allUsersCache = u.data || []; const projs = p.data || []; const pays = pay.data || []; const teams = t.data || []; const rev = pays.reduce((s, x) => s + Number(x.amount || 0), 0);
    document.getElementById('owner-stat-users').textContent = state.allUsersCache.length; document.getElementById('owner-stat-projects').textContent = projs.length; document.getElementById('owner-stat-revenue').textContent = '$' + rev.toFixed(2); document.getElementById('owner-stat-teams').textContent = teams.length;
    document.getElementById('owner-users-list').innerHTML = state.allUsersCache.map(u => `<div class="rounded-xl p-4 flex items-center justify-between" style="background: var(--surface); border: 1px solid var(--border);"><div class="min-w-0 flex-1"><p class="text-sm font-bold truncate" style="color: var(--text);">${escapeHtml(u.full_name || u.username || 'User')}</p><p class="text-xs mono truncate" style="color: var(--text-muted);">${escapeHtml(u.email || '')}</p></div><div class="flex items-center gap-2 flex-shrink-0 ml-3"><span class="text-[10px] uppercase font-bold px-2 py-0.5 rounded" style="background: var(--bg); color: var(--cyan);">${escapeHtml(u.plan || 'free')}</span><select onchange="setUserRole('${u.id}', this.value)" class="text-[10px] rounded px-2 py-1" style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"><option value="user" ${u.role === 'user' || !u.role ? 'selected' : ''}>user</option><option value="support" ${u.role === 'support' ? 'selected' : ''}>support</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>admin</option><option value="owner" ${u.role === 'owner' ? 'selected' : ''}>owner</option></select></div></div>`).join('') || '<p class="text-xs text-center py-4">No users.</p>'; document.getElementById('owner-users-list').classList.remove('hidden');
    document.getElementById('owner-projects-list').innerHTML = projs.map(p => `<div class="rounded-xl p-4 flex items-center justify-between" style="background: var(--surface); border: 1px solid var(--border);"><div class="min-w-0"><p class="text-sm font-bold truncate" style="color: var(--text);">${escapeHtml(p.name)}</p><p class="text-xs mono truncate" style="color: var(--text-muted);">${escapeHtml(p.slug)}</p></div><span class="text-[10px] uppercase font-bold flex-shrink-0 ml-3" style="color: var(--text-muted);">${escapeHtml(p.status || 'active')}</span></div>`).join('') || '<p class="text-xs text-center py-4">No projects.</p>'; document.getElementById('owner-projects-list').classList.remove('hidden');
    document.getElementById('owner-payments-list').innerHTML = pays.map(p => `<div class="rounded-xl p-4 flex items-center justify-between" style="background: var(--surface); border: 1px solid var(--border);"><div class="min-w-0"><p class="text-sm font-bold truncate" style="color: var(--text);">${escapeHtml(p.customer_email || 'Anonymous')}</p><p class="text-xs mono" style="color: var(--text-muted);">${new Date(p.paid_at).toLocaleDateString()}</p></div><div class="font-bold mono flex-shrink-0 ml-3" style="color: var(--text);">${escapeHtml(p.currency)} ${Number(p.amount).toFixed(2)}</div></div>`).join('') || '<p class="text-xs text-center py-4">No payments.</p>'; document.getElementById('owner-payments-list').classList.remove('hidden');
    const { data: reqs } = await supabaseClient.from('upgrade_requests').select('*').order('created_at', { ascending: false });
    document.getElementById('owner-requests-list').innerHTML = (reqs || []).map(r => `<div class="rounded-xl p-4" style="background: var(--surface); border: 1px solid var(--border);"><div class="flex items-center justify-between mb-2"><p class="text-sm font-bold capitalize" style="color: var(--text);">${escapeHtml(r.requested_plan)}</p><span class="text-[10px] uppercase font-bold" style="color: var(--amber);">${escapeHtml(r.status)}</span></div><p class="text-xs mono break-all" style="color: var(--text-muted);">${escapeHtml(r.contact_value || '')}</p><div class="flex gap-2 mt-2"><button onclick="setRequestStatus('${r.id}', 'approved')" class="text-[10px] font-bold px-2 py-1 rounded" style="background: rgba(16,185,129,0.15); color: var(--green);">Approve</button><button onclick="setRequestStatus('${r.id}', 'rejected')" class="text-[10px] font-bold px-2 py-1 rounded" style="background: rgba(239,68,68,0.15); color: var(--red);">Reject</button></div></div>`).join('') || '<p class="text-xs text-center py-4">No requests.</p>'; document.getElementById('owner-requests-list').classList.remove('hidden');
    document.getElementById('owner-teams-list').innerHTML = teams.map(t => `<div class="rounded-xl p-4" style="background: var(--surface); border: 1px solid var(--border);"><p class="text-sm font-bold" style="color: var(--text);">${escapeHtml(t.invite_email)}</p><p class="text-xs mono" style="color: var(--text-muted);">Role: ${escapeHtml(t.role)}</p></div>`).join('') || '<p class="text-xs text-center py-4">No team members.</p>'; document.getElementById('owner-teams-list').classList.remove('hidden');
    switchOwnerTab('users');
}
function switchOwnerTab(tab) { ['users', 'projects', 'payments', 'requests', 'teams'].forEach(t => { const p = document.getElementById('owner-' + t + '-panel'); const b = document.getElementById('owner-tab-' + t); if (p) p.classList.toggle('hidden', t !== tab); if (b) { b.style.color = (t === tab) ? 'var(--text)' : 'var(--text-muted)'; b.style.borderBottom = (t === tab) ? '2px solid var(--accent)' : 'none'; } }); }
async function setUserRole(uid, role) { if (!confirm('Change role to ' + role + '?')) return; const { error } = await supabaseClient.from('profiles').update({ role }).eq('id', uid); if (error) return showToast(error.message, 'error'); showToast('Role updated'); }
async function setRequestStatus(id, status) { if (!confirm('Mark as ' + status + '?')) return; const { error } = await supabaseClient.from('upgrade_requests').update({ status }).eq('id', id); if (error) return showToast(error.message, 'error'); loadOwnerConsole(); }

// ============================================
// 10. PUBLIC ROUTES & LANDING DEMO
// ============================================
async function loadPublicCheckout(slug, planId) { document.getElementById('landing-view').classList.add('hidden'); document.getElementById('auth-view').classList.add('hidden'); document.getElementById('dashboard-view').classList.add('hidden'); document.getElementById('public-checkout-view').classList.remove('hidden'); try { const { data: plan, error } = await supabaseClient.from('plans').select('*, projects!inner(name, slug)').eq('id', planId).eq('projects.slug', slug).single(); if (error || !plan) throw new Error('Plan not found'); document.getElementById('checkout-project-name').textContent = plan.projects.name; document.getElementById('checkout-plan-name').textContent = plan.name; document.getElementById('checkout-currency').textContent = plan.currency; document.getElementById('checkout-price').textContent = Number(plan.price_amount).toFixed(2); document.getElementById('checkout-interval').textContent = plan.interval; const pay = document.getElementById('checkout-pay-btn'); if (plan.checkout_url) pay.onclick = () => window.location.href = plan.checkout_url; else { pay.textContent = 'Contact Business to Pay'; pay.style.background = 'var(--border)'; } document.getElementById('checkout-loading').classList.add('hidden'); document.getElementById('checkout-content').classList.remove('hidden'); } catch (e) { document.getElementById('checkout-loading').classList.add('hidden'); document.getElementById('checkout-error').classList.remove('hidden'); } }
async function loadPublicPage(pageSlug) { document.getElementById('landing-view').classList.add('hidden'); document.getElementById('auth-view').classList.add('hidden'); document.getElementById('dashboard-view').classList.add('hidden'); document.getElementById('public-page-view').classList.remove('hidden'); const { data: page } = await supabaseClient.from('project_pages').select('*, projects!inner(slug)').eq('slug', pageSlug).single(); if (!page) { document.getElementById('page-title').textContent = 'Page Not Found'; document.getElementById('page-loading').classList.add('hidden'); return; } document.getElementById('page-title').textContent = page.title; const { data: schema } = await supabaseClient.from('project_schemas').select('schema_name').eq('project_id', page.project_id).single(); if (!schema || !schema.schema_name) { document.getElementById('page-loading').classList.add('hidden'); document.getElementById('page-empty').classList.remove('hidden'); return; } const { data: rows } = await supabaseClient.schema(schema.schema_name).from(page.table_name).select('*').limit(100); document.getElementById('page-loading').classList.add('hidden'); if (!rows || rows.length === 0) return document.getElementById('page-empty').classList.remove('hidden'); document.getElementById('page-content').classList.remove('hidden'); document.getElementById('page-content').innerHTML = rows.map(r => { let html = '<div class="rounded-xl p-5" style="background: var(--surface); border: 1px solid var(--border);"><div class="space-y-2">'; page.columns_to_show.forEach(c => { html += `<div><span class="text-[10px] uppercase font-bold" style="color: var(--text-muted);">${escapeHtml(c)}</span><p class="text-sm font-bold" style="color: var(--text);">${escapeHtml(String(r[c] || '—'))}</p></div>`; }); return html + '</div></div>'; }).join(''); }
async function loadPublicForm(slug, tableName) { document.getElementById('landing-view').classList.add('hidden'); document.getElementById('auth-view').classList.add('hidden'); document.getElementById('dashboard-view').classList.add('hidden'); document.getElementById('public-form-view').classList.remove('hidden'); const { data: proj } = await supabaseClient.from('projects').select('name').eq('slug', slug).single(); document.getElementById('form-title').textContent = proj ? proj.name : tableName; document.getElementById('form-loading').classList.add('hidden'); document.getElementById('dynamic-form').classList.remove('hidden'); document.getElementById('dynamic-form').innerHTML = `<div><label class="block text-xs mb-1">Name</label><input type="text" name="name" required class="w-full rounded-lg px-4 py-3" style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"></div><div><label class="block text-xs mb-1">Email</label><input type="email" name="email" required class="w-full rounded-lg px-4 py-3" style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"></div><button type="submit" class="w-full font-bold py-3 rounded-lg text-white mt-4" style="background: var(--accent);">Submit</button>`; document.getElementById('dynamic-form').onsubmit = async (e) => { e.preventDefault(); const data = Object.fromEntries(new FormData(e.target).entries()); await fetch(SUPABASE_URL + '/functions/v1/ukmform', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_slug: slug, table_name: tableName, data }) }); document.getElementById('dynamic-form').classList.add('hidden'); document.getElementById('form-success').classList.remove('hidden'); }; }
async function joinWaitlist() { const email = document.getElementById('email-input').value; const btn = document.getElementById('submit-btn'); if (!email) return showToast('Enter email', 'error'); btn.innerText = 'Joining...'; btn.disabled = true; const { error } = await supabaseClient.from('waitlist').insert([{ email }]); if (error) { showToast('Error: ' + error.message, 'error'); btn.innerText = 'Join Waitlist'; btn.disabled = false; } else { document.getElementById('waitlist-form').classList.add('hidden'); document.getElementById('waitlist-success').classList.remove('hidden'); } }

// LANDING PAGE AI DEMO
const DEMO_RESPONSES = {
    "salon": `-- 🪄 Ukmbase AI generated this schema in 0.8s\nCREATE TABLE appointments (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  client_name TEXT NOT NULL,\n  service TEXT NOT NULL,\n  appointment_time TIMESTAMPTZ NOT NULL,\n  status TEXT DEFAULT 'pending',\n  created_at TIMESTAMPTZ DEFAULT now()\n);\n\n-- RLS enabled automatically\nALTER TABLE appointments ENABLE ROW LEVEL SECURITY;`,
    "shop": `-- 🪄 Ukmbase AI generated this schema in 0.9s\nCREATE TABLE products (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  name TEXT NOT NULL,\n  price DECIMAL(10,2) NOT NULL,\n  inventory_count INT DEFAULT 0,\n  created_at TIMESTAMPTZ DEFAULT now()\n);\n\nCREATE TABLE orders (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  customer_email TEXT NOT NULL,\n  total_amount DECIMAL(10,2),\n  status TEXT DEFAULT 'cart',\n  created_at TIMESTAMPTZ DEFAULT now()\n);`,
    "default": `-- 🪄 Ukmbase AI generated this schema in 1.1s\nCREATE TABLE users (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  name TEXT NOT NULL,\n  email TEXT UNIQUE NOT NULL,\n  role TEXT DEFAULT 'user',\n  created_at TIMESTAMPTZ DEFAULT now()\n);\n\nCREATE TABLE items (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  owner_id UUID REFERENCES users(id),\n  title TEXT NOT NULL,\n  created_at TIMESTAMPTZ DEFAULT now()\n);`
};
let demoRunning = false;
function runLandingDemo() {
    if (demoRunning) return; const input = document.getElementById('demo-prompt').value.toLowerCase(); const btn = document.getElementById('demo-btn'); const output = document.getElementById('demo-output'); const cta = document.getElementById('demo-cta');
    demoRunning = true; btn.innerHTML = 'Thinking...'; output.classList.remove('hidden'); cta.classList.add('hidden'); output.innerHTML = '<span style="color: #64748B;">Scanning prompt... generating Postgres schema...</span>';
    setTimeout(() => {
        let res = DEMO_RESPONSES.default; if (input.includes('salon') || input.includes('book') || input.includes('hair')) res = DEMO_RESPONSES.salon; if (input.includes('shop') || input.includes('store') || input.includes('product')) res = DEMO_RESPONSES.shop;
        output.innerHTML = ''; let i = 0; const speed = 10;
        function typeWriter() { if (i < res.length) { output.innerHTML += res.charAt(i); i++; output.scrollTop = output.scrollHeight; setTimeout(typeWriter, speed); } else { demoRunning = false; btn.innerHTML = 'Generate'; cta.classList.remove('hidden'); } } typeWriter();
    }, 1200);
}

function updateOnboardingChecklist() {
    const checklist = document.getElementById('onboarding-checklist'); if (!checklist) return;
    const hasProjects = state.projectsCache.length > 0; const icon1 = document.getElementById('step-1-icon'); const text1 = document.getElementById('step-1-text');
    if (icon1 && text1) { icon1.innerHTML = hasProjects ? '✓' : '1'; icon1.style.background = hasProjects ? 'var(--green)' : 'var(--bg)'; icon1.style.color = hasProjects ? 'white' : 'var(--text-muted)'; icon1.style.borderColor = hasProjects ? 'var(--green)' : 'var(--border)'; text1.style.textDecoration = hasProjects ? 'line-through' : 'none'; text1.style.color = hasProjects ? 'var(--text-dim)' : 'var(--text)'; }
    const hasData = state.ukmDataSchema !== null; const icon2 = document.getElementById('step-2-icon'); const text2 = document.getElementById('step-2-text');
    if (icon2 && text2) { icon2.innerHTML = hasData ? '✓' : '2'; icon2.style.background = hasData ? 'var(--green)' : 'var(--bg)'; icon2.style.color = hasData ? 'white' : 'var(--text-muted)'; icon2.style.borderColor = hasData ? 'var(--green)' : 'var(--border)'; text2.style.textDecoration = hasData ? 'line-through' : 'none'; text2.style.color = hasData ? 'var(--text-dim)' : 'var(--text)'; }
    const hasChatted = state.chatHistory.length > 0; const icon3 = document.getElementById('step-3-icon'); const text3 = document.getElementById('step-3-text');
    if (icon3 && text3) { icon3.innerHTML = hasChatted ? '✓' : '3'; icon3.style.background = hasChatted ? 'var(--green)' : 'var(--bg)'; icon3.style.color = hasChatted ? 'white' : 'var(--text-muted)'; icon3.style.borderColor = hasChatted ? 'var(--green)' : 'var(--border)'; text3.style.textDecoration = hasChatted ? 'line-through' : 'none'; text3.style.color = hasChatted ? 'var(--text-dim)' : 'var(--text)'; }
    if (hasProjects && hasData && hasChatted) { checklist.style.display = 'none'; }
}

// ============================================
// 11. INIT & WINDOW BINDINGS
// ============================================
async function init() {
    initTheme();
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('pay') && urlParams.has('plan')) return loadPublicCheckout(urlParams.get('pay'), urlParams.get('plan'));
    if (urlParams.has('form') && urlParams.has('project')) return loadPublicForm(urlParams.get('project'), urlParams.get('form'));
    if (urlParams.has('page')) return loadPublicPage(urlParams.get('page'));
    
    if (urlParams.has('type') && urlParams.get('type') === 'recovery') {
        state.inRecoveryMode = true;
        showLandingView(); showAuthView(); 
        document.getElementById('auth-email').parentElement.classList.add('hidden');
        document.getElementById('auth-password').parentElement.parentElement.classList.add('hidden');
        document.getElementById('auth-submit').classList.add('hidden');
        document.getElementById('new-password-view').classList.remove('hidden');
        return;
    }
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) showDashboardView(session.user); else showLandingView();
}

supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'TOKEN_REFRESHED') return;
    if (event === 'PASSWORD_RECOVERY') { state.inRecoveryMode = true; showLandingView(); showAuthView(); document.getElementById('auth-email').parentElement.classList.add('hidden'); document.getElementById('auth-password').parentElement.parentElement.classList.add('hidden'); document.getElementById('auth-submit').classList.add('hidden'); document.getElementById('new-password-view').classList.remove('hidden'); return; }
    if (state.inRecoveryMode) return;
    if (session) showDashboardView(session.user); else showLandingView();
});

// BINDINGS
window.showLandingView = showLandingView; window.showAuthView = showAuthView; window.toggleSidebar = toggleSidebar; window.switchView = switchView; window.setAuthMode = setAuthMode; window.handleAuthSubmit = handleAuthSubmit; window.showToast = showToast; window.toggleTheme = toggleTheme;
window.signInWithProvider = signInWithProvider; window.handleLogout = handleLogout; window.showForgotPasswordView = showForgotPasswordView; window.hideForgotPasswordView = hideForgotPasswordView; window.sendPasswordReset = sendPasswordReset; window.updatePassword = updatePassword; window.updateStrength = updateStrength; window.togglePassword = togglePassword; window.saveProfile = saveProfile;
window.openProjectModal = openProjectModal; window.closeProjectModal = closeProjectModal; window.autoSlug = autoSlug; window.createProject = createProject; window.openProjectDetail = openProjectDetail; window.closeProjectDetail = closeProjectDetail; window.openProjectEdit = openProjectEdit; window.closeProjectEdit = closeProjectEdit; window.saveProjectEdit = saveProjectEdit; window.deleteProject = deleteProject; window.acceptTeamInvite = acceptTeamInvite; window.declineTeamInvite = declineTeamInvite; window.renderTeam = renderTeam; window.sendTeamInvite = sendTeamInvite; window.removeTeamMember = removeTeamMember; window.cancelInvite = cancelInvite;
window.sendChat = sendChat; window.handleChatKeydown = handleChatKeydown; window.sendPrompt = sendPrompt; window.clearChat = clearChat; window.aiCancel = aiCancel;
window.populateUkmDataProjectSelect = populateUkmDataProjectSelect; window.onUkmDataProjectChange = onUkmDataProjectChange; window.enableUkmData = enableUkmData; window.loadUkmDataTables = loadUkmDataTables; window.openCreateTableModal = openCreateTableModal; window.closeCreateTableModal = closeCreateTableModal; window.addColumnRow = addColumnRow; window.createUkmDataTable = createUkmDataTable; window.toggleTableRLS = toggleTableRLS; window.toggleTableRealtime = toggleTableRealtime; window.dropUkmDataTable = dropUkmDataTable; window.viewTableData = viewTableData; window.openEditRowModal = openEditRowModal; window.saveRowChanges = saveRowChanges; window.deleteTableRow = deleteTableRow; window.exportTableCSV = exportTableCSV; window.openChartModal = openChartModal; window.renderChart = renderChart; window.executeRawSQL = executeRawSQL; window.handleCsvUpload = handleCsvUpload; window.exportProjectData = exportProjectData; window.handleProjectImport = handleProjectImport; window.openSeedDataModal = openSeedDataModal; window.generateAndSeedData = generateAndSeedData; window.loadUkmDataFiles = loadUkmDataFiles; window.uploadUkmDataFile = uploadUkmDataFile; window.deleteUkmDataFile = deleteUkmDataFile; window.copyStorageSnippet = copyStorageSnippet; window.showTableApi = showTableApi; window.copyApiSnippet = copyApiSnippet; window.copyUkmDataConnection = copyUkmDataConnection;
window.loadUkmDataUsers = loadUkmDataUsers; window.deleteUkmDataUser = deleteUkmDataUser; window.openImpersonateModal = openImpersonateModal; window.executeImpersonation = executeImpersonation; window.generateAuthSnippet = generateAuthSnippet; window.copyAuthSnippet = copyAuthSnippet; window.generateAuthUI = generateAuthUI; window.runAuthTest = runAuthTest; window.loadApiKeys = loadApiKeys; window.generateApiKey = generateApiKey; window.revokeApiKey = revokeApiKey; window.loadProjectPages = loadProjectPages; window.createProjectPage = createProjectPage; window.loadCronJobs = loadCronJobs; window.createCronJob = createCronJob; window.deleteCronJob = deleteCronJob; window.loadUkmDataWebhooks = loadUkmDataWebhooks; window.createWebhook = createWebhook; window.deleteWebhook = deleteWebhook; window.loadEmailLogs = loadEmailLogs; window.sendTestEmail = sendTestEmail; window.loadActivityLogs = loadActivityLogs; window.copyFormLink = copyFormLink;
window.populateConnectProjectSelect = populateConnectProjectSelect; window.switchConnectTab = switchConnectTab; window.renderConnectSnippets = renderConnectSnippets; window.loadConnections = loadConnections; window.openConnectModal = openConnectModal; window.closeConnectModal = closeConnectModal; window.createConnection = createConnection; window.deleteConnection = deleteConnection; window.openConnection = openConnection; window.exitTableBrowser = exitTableBrowser; window.selectTable = selectTable; window.copyRow = copyRow; window.populateQueryConnections = populateQueryConnections; window.setQueryPrompt = setQueryPrompt; window.generateSQL = generateSQL; window.copyGeneratedSQL = copyGeneratedSQL; window.loadQueryHistory = loadQueryHistory; window.loadHistoryItem = loadHistoryItem; window.populateSyncProjectSelect = populateSyncProjectSelect; window.onSyncProjectChange = onSyncProjectChange; window.toggleSyncEnabled = toggleSyncEnabled; window.updateSyncConfig = updateSyncConfig; window.copySdkSnippet = copySdkSnippet; window.loadSyncLogs = loadSyncLogs;
window.renderBilling = renderBilling; window.openUpgradeModal = openUpgradeModal; window.closeUpgradeModal = closeUpgradeModal; window.submitUpgradeRequest = submitUpgradeRequest; window.switchPayTab = switchPayTab; window.openPlanModal = openPlanModal; window.closePlanModal = closePlanModal; window.loadPlans = loadPlans; window.copyCheckout = copyCheckout; window.createPlan = createPlan; window.openPaymentModal = openPaymentModal; window.closePaymentModal = closePaymentModal; window.loadPayments = loadPayments; window.createPayment = createPayment; window.loadOwnerConsole = loadOwnerConsole; window.switchOwnerTab = switchOwnerTab; window.setUserRole = setUserRole; window.setRequestStatus = setRequestStatus;
window.copyToClipboard = copyToClipboard; window.runLandingDemo = runLandingDemo; window.joinWaitlist = joinWaitlist;

init();


// ============================================
// DAY 1 ADDITIONS (NEW FEATURES ONLY)
// ============================================
// Everything below this line is brand new. 
// None of your original HTML or JS was deleted.

// 1. UKMNOTIFY (Email / WhatsApp Fan-out)
window.sendNotification = async function(projectId, to, channel, subject, body) {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) throw new Error("Not logged in");

        const res = await fetch(SUPABASE_URL + '/functions/v1/ukmnotify', {
            method: 'POST',
            headers: { 
                'Authorization': 'Bearer ' + session.access_token, 
                'Content-Type': 'application/json' 
            },
            body: JSON.stringify({ project_id: projectId, to: to, channel: channel, subject: subject, body: body })
        });
        const data = await res.json();
        
        if (data.error) throw new Error(data.error);
        showToast(`${channel.toUpperCase()} sent successfully!`);
        return data;
    } catch (err) {
        showToast('Notification failed: ' + err.message, 'error');
    }
};

// 2. UKMPAY LIVE (Webhook Reconcile UI)
window.loadPaymentEvents = async function() {
    if (!state.currentUser) return;
    // Fetch unmatched webhooks
    const { data, error } = await supabaseClient.from('payment_events').select('*').eq('processed', false).order('received_at', { ascending: false });
    
    const container = document.getElementById('pay-payments-panel');
    if (!container) return;

    // We inject a new UI block right above the payment list
    let reconcileHtml = `
        <div class="rounded-xl p-5 mb-6" style="background: var(--surface); border: 1px solid var(--border);">
            <h3 class="font-bold text-sm mb-3" style="color: var(--text);">Unmatched Webhook Payments (UkmPay Live)</h3>
            <div class="space-y-2">`;
            
    if (!data || data.length === 0) {
        reconcileHtml += `<p class="text-xs" style="color: var(--text-muted);">No unmatched events. All caught up!</p>`;
    } else {
        data.forEach(ev => {
            reconcileHtml += `
            <div class="flex items-center justify-between p-3 rounded-lg" style="background: var(--bg); border: 1px solid var(--border);">
                <div>
                    <p class="text-sm font-bold" style="color: var(--text);">${ev.customer_email || 'Unknown'}</p>
                    <p class="text-xs mono" style="color: var(--cyan);">${ev.provider} - ${ev.currency} ${ev.amount}</p>
                </div>
                <button onclick="matchPaymentEvent('${ev.id}')" class="text-xs font-bold px-3 py-1.5 rounded-lg text-white" style="background: var(--green);">Reconcile</button>
            </div>`;
        });
    }
    reconcileHtml += `</div></div>`;
    
    // Check if it's already injected to avoid duplicates
    if (!document.getElementById('reconcile-panel')) {
        const div = document.createElement('div');
        div.id = 'reconcile-panel';
        div.innerHTML = reconcileHtml;
        container.insertBefore(div, container.firstChild);
    } else {
        document.getElementById('reconcile-panel').innerHTML = reconcileHtml;
    }
};

window.matchPaymentEvent = async function(eventId) {
    try {
        await supabaseClient.from('payment_events').update({ processed: true }).eq('id', eventId);
        showToast('Payment reconciled!');
        document.getElementById('reconcile-panel').remove();
        loadPaymentEvents(); // Refresh
        loadPayments();
    } catch (e) {
        showToast(e.message, 'error');
    }
};

// 3. HOSTED AUTH PAGE (For your users' apps)
window.renderHostedAuthPage = function(slug) {
    document.getElementById('landing-view').classList.add('hidden');
    document.getElementById('dashboard-view').classList.add('hidden');
    
    // Create a temporary view for the hosted auth
    let view = document.getElementById('hosted-auth-view');
    if (!view) {
        view = document.createElement('div');
        view.id = 'hosted-auth-view';
        view.className = 'min-h-screen flex items-center justify-center p-6 bg-[#0B1020]';
        document.body.appendChild(view);
    }
    view.classList.remove('hidden');

    view.innerHTML = `
    <div class="w-full max-w-md rounded-2xl p-8 glow" style="background: var(--surface); border: 1px solid var(--border);">
        <div class="text-center mb-6">
            <h1 class="text-2xl font-bold mb-2" style="color: var(--text);">Welcome to ${slug}</h1>
            <p class="text-sm" style="color: var(--text-muted);">Sign in or create an account.</p>
        </div>
        <div id="hosted-auth-error" class="hidden bg-red-500/10 border border-red-500/30 text-red-400 text-xs p-3 rounded-lg mb-4"></div>
        <div class="space-y-4">
            <input type="email" id="hosted-email" placeholder="Email" class="w-full rounded-lg px-4 py-3 focus:outline-none" style="background: var(--bg); border: 1px solid var(--border); color: var(--text);">
            <input type="password" id="hosted-password" placeholder="Password" class="w-full rounded-lg px-4 py-3 focus:outline-none" style="background: var(--bg); border: 1px solid var(--border); color: var(--text);">
            <button onclick="submitHostedAuth('${slug}')" class="w-full font-bold py-3 rounded-lg text-white" style="background: var(--accent);">Continue</button>
        </div>
        <p class="text-center text-xs mt-6" style="color: var(--text-dim);">Powered by Ukmbase</p>
    </div>`;
};

window.submitHostedAuth = async function(slug) {
    const email = document.getElementById('hosted-email').value;
    const password = document.getElementById('hosted-password').value;
    const errEl = document.getElementById('hosted-auth-error');
    
    if (!email || !password) return;
    errEl.classList.add('hidden');

    try {
        const res = await fetch(SUPABASE_URL + '/functions/v1/ukmauth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'login', project_slug: slug, email, password })
        });
        const data = await res.json();
        
        if (data.error) {
            // If login fails, try signup automatically for the demo
            const signupRes = await fetch(SUPABASE_URL + '/functions/v1/ukmauth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'signup', project_slug: slug, email, password })
            });
            const signupData = await signupRes.json();
            if (signupData.error) throw new Error(signupData.error);
            showToast('Account created and logged in!');
            localStorage.setItem('ukm_user_token', signupData.token);
        } else {
            showToast('Logged in successfully!');
            localStorage.setItem('ukm_user_token', data.token);
        }
        
        document.getElementById('hosted-auth-view').classList.add('hidden');
        document.getElementById('landing-view').classList.remove('hidden');
    } catch (e) {
        errEl.textContent = e.message;
        errEl.classList.remove('hidden');
    }
};

// 4. UKMSQL COPILOT (AI inside the editor)
window.askCopilot = async function(action) {
    const input = document.getElementById('sql-editor-input');
    if (!input || !input.value.trim()) return showToast('Write some SQL first', 'error');
    
    const sql = input.value.trim();
    let prompt = "";
    
    if (action === 'explain') prompt = "Explain what this SQL does in plain English:\n\n" + sql;
    if (action === 'optimize') prompt = "Suggest indexes or optimizations for this SQL:\n\n" + sql;
    
    const btn = document.getElementById('sql-run-btn');
    const orig = btn.textContent;
    btn.textContent = 'Thinking...';
    btn.disabled = true;

    try {
        const data = await aiCall({ prompt, mode: 'sql_copilot' });
        // Show the AI response in the chat drawer
        switchView('ukmai');
        appendMessage('ai', "**SQL Copilot Suggestion:**\n\n" + data.content);
    } catch (e) {
        showToast(e.message, 'error');
    } finally {
        btn.textContent = orig;
        btn.disabled = false;
    }
};

// -------------------------------------------------------------------
// AUTOMATIC UI INJECTION (So we don't have to touch your HTML)
// -------------------------------------------------------------------
// This script waits for the page to load, then adds the Copilot buttons 
// right next to the "Run Query" button in your SQL Editor.
document.addEventListener('DOMContentLoaded', () => {
    const runBtn = document.getElementById('sql-run-btn');
    if (runBtn && runBtn.parentElement) {
        // Create the Explain Button
        const explainBtn = document.createElement('button');
        explainBtn.className = 'text-xs font-bold px-3 py-2 rounded-lg';
        explainBtn.style.cssText = 'background: rgba(245,158,11,0.15); color: var(--amber); border: 1px solid rgba(245,158,11,0.3);';
        explainBtn.innerText = 'Explain';
        explainBtn.onclick = () => askCopilot('explain');

        // Create the Optimize Button
        const optimizeBtn = document.createElement('button');
        optimizeBtn.className = 'text-xs font-bold px-3 py-2 rounded-lg';
        optimizeBtn.style.cssText = 'background: rgba(6,182,212,0.15); color: var(--cyan); border: 1px solid rgba(6,182,212,0.3);';
        optimizeBtn.innerText = 'Optimize';
        optimizeBtn.onclick = () => askCopilot('optimize');

        // Insert them just before the Run Query button
        runBtn.parentElement.insertBefore(explainBtn, runBtn);
        runBtn.parentElement.insertBefore(optimizeBtn, runBtn);
    }
});

// Hook into init to check for Hosted Auth URL (?auth=my-project)
const originalInit = window.init;
window.init = async function() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('auth')) {
        renderHostedAuthPage(urlParams.get('auth'));
        return; // Stop the rest of the app from loading
    }
    if (originalInit) await originalInit();
};

// Make sure Webhook panel loads when the view switches
const originalSwitchView = window.switchView;
window.switchView = function(view) {
    if (originalSwitchView) originalSwitchView(view);
    if (view === 'ukmpay') { loadPaymentEvents(); }
};

// ============================================
// END OF DAY 1 ADDITIONS
// ============================================
// ============================================
// DAY 2 ADDITIONS (FORM BUILDER, LANDING, DOCS, TEST)
// ============================================

// ---------------------------------------------------
// 1. UKMFORM BUILDER
// ---------------------------------------------------
window.openFormBuilder = function(tableName) {
    let modal = document.getElementById('ukmform-builder-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ukmform-builder-modal';
        modal.className = 'hidden fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm';
        document.body.appendChild(modal);
    }
    modal.classList.remove('hidden');

    modal.innerHTML = `
    <div class="w-full max-w-lg rounded-2xl p-6 glow max-h-[90vh] overflow-y-auto" style="background: var(--surface); border: 1px solid var(--border);">
        <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-bold" style="color: var(--text);">Form Builder: <span class="mono text-[var(--cyan)]">${escapeHtml(tableName)}</span></h2>
            <button onclick="document.getElementById('ukmform-builder-modal').classList.add('hidden')" style="color: var(--text-muted);">✕</button>
        </div>
        <div class="space-y-4">
            <div><label class="block text-xs mb-1" style="color: var(--text-muted);">Form Title</label><input type="text" id="form-builder-title" placeholder="e.g. Contact Us" class="w-full rounded-lg px-3 py-2 text-sm" style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"></div>
            <div><label class="block text-xs mb-1" style="color: var(--text-muted);">URL Slug</label><input type="text" id="form-builder-slug" placeholder="e.g. contact-us" class="w-full rounded-lg px-3 py-2 text-sm mono" style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"></div>
            <div><label class="block text-xs mb-1" style="color: var(--text-muted);">Fields (Comma separated)</label><input type="text" id="form-builder-fields" placeholder="name, email, message" class="w-full rounded-lg px-3 py-2 text-sm mono" style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"></div>
            <button onclick="saveFormBuilder('${tableName}')" id="save-form-btn" class="w-full font-bold py-3 rounded-lg text-white mt-2" style="background: var(--accent);">Create Form</button>
        </div>
    </div>`;
};

window.saveFormBuilder = async function(tableName) {
    const title = document.getElementById('form-builder-title').value;
    const slug = document.getElementById('form-builder-slug').value;
    const fieldsStr = document.getElementById('form-builder-fields').value;
    if (!title || !slug || !fieldsStr) return showToast('Fill all fields', 'error');

    const fields = fieldsStr.split(',').map(f => ({ name: f.trim(), type: 'text', required: true }));
    const btn = document.getElementById('save-form-btn'); btn.textContent = 'Creating...'; btn.disabled = true;

    try {
        const { error } = await supabaseClient.from('project_forms').insert({
            project_id: state.currentUkmDataProjectId,
            title, slug, table_name: tableName, fields
        });
        if (error) throw error;
        showToast('Form created!');
        document.getElementById('ukmform-builder-modal').classList.add('hidden');
        const url = window.location.origin + window.location.pathname + '?form=' + slug + '&project=' + state.projectsCache.find(p => p.id === state.currentUkmDataProjectId).slug;
        navigator.clipboard.writeText(url);
        showToast('Form link copied to clipboard!');
    } catch (e) {
        showToast(e.message, 'error');
    } finally {
        btn.textContent = 'Create Form'; btn.disabled = false;
    }
};

// Upgrade the public form route
window.loadPublicFormV2 = async function(projectSlug, formSlug) {
    document.getElementById('landing-view').classList.add('hidden'); document.getElementById('auth-view').classList.add('hidden'); document.getElementById('dashboard-view').classList.add('hidden');
    document.getElementById('public-form-view').classList.remove('hidden');
    document.getElementById('form-loading').classList.remove('hidden');
    document.getElementById('dynamic-form').classList.add('hidden');

    const { data: form, error } = await supabaseClient.from('project_forms').select('*').eq('slug', formSlug).single();
    
    if (error || !form) {
        document.getElementById('form-loading').classList.add('hidden');
        return showToast('Form not found', 'error');
    }

    document.getElementById('form-title').textContent = form.title;
    document.getElementById('form-subtitle').textContent = form.description || 'Please fill out the form below.';
    document.getElementById('form-loading').classList.add('hidden');
    
    const formEl = document.getElementById('dynamic-form');
    formEl.classList.remove('hidden');
    formEl.innerHTML = form.fields.map(f => `
        <div>
            <label class="block text-xs mb-1" style="color: var(--text-muted);">${escapeHtml(f.name)}</label>
            <input type="${f.type || 'text'}" name="${escapeHtml(f.name)}" ${f.required ? 'required' : ''} class="w-full rounded-lg px-4 py-3" style="background: var(--bg); border: 1px solid var(--border); color: var(--text);">
        </div>
    `).join('') + `<button type="submit" class="w-full font-bold py-3 rounded-lg text-white mt-4" style="background: var(--accent);">Submit</button>`;

    formEl.onsubmit = async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.target).entries());
        formEl.innerHTML = '<p class="text-center py-4">Submitting...</p>';
        try {
            // 1. Log submission
            await supabaseClient.from('form_submissions').insert({ form_id: form.id, project_id: form.project_id, data });
            // 2. Insert into actual table via edge function (assuming ukmdata handles inserts)
            const { data: { session } } = await supabaseClient.auth.getSession();
            await fetch(SUPABASE_URL + '/functions/v1/ukmdata', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + (session ? session.access_token : SUPABASE_ANON_KEY), 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'bulk_insert', project_id: form.project_id, table_name: form.table_name, rows: [data] })
            });
            formEl.classList.add('hidden');
            document.getElementById('form-success').classList.remove('hidden');
            if (form.notify_email) {
                window.sendNotification(form.project_id, form.notify_email, 'email', 'New Form Submission', JSON.stringify(data));
            }
        } catch (err) {
            showToast('Failed to submit: ' + err.message, 'error');
            formEl.innerHTML = '<p class="text-center text-red-400">Error submitting. Try again.</p>';
        }
    };
};

// ---------------------------------------------------
// 2. UKMLANDING (Public Pages & Waitlist)
// ---------------------------------------------------
window.openLandingBuilder = function(projectId) {
    let modal = document.getElementById('ukmlanding-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ukmlanding-modal';
        modal.className = 'hidden fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm';
        document.body.appendChild(modal);
    }
    modal.classList.remove('hidden');

    const proj = state.projectsCache.find(p => p.id === projectId);
    modal.innerHTML = `
    <div class="w-full max-w-lg rounded-2xl p-6 glow" style="background: var(--surface); border: 1px solid var(--border);">
        <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-bold" style="color: var(--text);">Landing Page Builder</h2>
            <button onclick="document.getElementById('ukmlanding-modal').classList.add('hidden')" style="color: var(--text-muted);">✕</button>
        </div>
        <div class="space-y-4">
            <div><label class="block text-xs mb-1" style="color: var(--text-muted);">Hero Headline</label><input type="text" id="landing-headline" value="${proj.landing_headline || ''}" placeholder="The best app for X" class="w-full rounded-lg px-3 py-2 text-sm" style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"></div>
            <div><label class="block text-xs mb-1" style="color: var(--text-muted);">Hero Subtext</label><input type="text" id="landing-subtext" value="${proj.landing_subtext || ''}" placeholder="Join the waitlist today." class="w-full rounded-lg px-3 py-2 text-sm" style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"></div>
            <button onclick="saveLandingPage('${projectId}')" class="w-full font-bold py-3 rounded-lg text-white" style="background: var(--accent);">Save Landing Page</button>
        </div>
    </div>`;
};

window.saveLandingPage = async function(projectId) {
    const headline = document.getElementById('landing-headline').value;
    const subtext = document.getElementById('landing-subtext').value;
    await supabaseClient.from('projects').update({ landing_headline: headline, landing_subtext: subtext, landing_enabled: true }).eq('id', projectId);
    showToast('Landing page updated!');
    document.getElementById('ukmlanding-modal').classList.add('hidden');
};

window.loadPublicLandingV2 = async function(projectSlug) {
    document.getElementById('landing-view').classList.add('hidden'); document.getElementById('dashboard-view').classList.add('hidden'); document.getElementById('auth-view').classList.add('hidden');
    document.getElementById('public-page-view').classList.remove('hidden');
    
    const { data: proj } = await supabaseClient.from('projects').select('*').eq('slug', projectSlug).single();
    if (!proj) return showToast('Project not found', 'error');

    document.getElementById('page-title').textContent = proj.landing_headline || proj.name;
    document.getElementById('page-content').innerHTML = `
        <div class="col-span-full text-center mb-8">
            <p class="text-lg mb-6" style="color: var(--text-muted);">${proj.landing_subtext || proj.description || 'Welcome to our app.'}</p>
            <div class="max-w-md mx-auto bg-[var(--surface)] p-6 rounded-xl border border-[var(--border)]">
                <h3 class="font-bold mb-4" style="color: var(--text);">Join the Waitlist</h3>
                <input type="email" id="landing-waitlist-email" placeholder="you@example.com" class="w-full rounded-lg px-4 py-3 mb-3" style="background: var(--bg); border: 1px solid var(--border); color: var(--text);">
                <button onclick="submitWaitlist('${proj.id}')" class="w-full font-bold py-3 rounded-lg text-white" style="background: var(--accent);">Notify Me</button>
            </div>
        </div>
    `;
    document.getElementById('page-content').classList.remove('hidden');
};

window.submitWaitlist = async function(projectId) {
    const email = document.getElementById('landing-waitlist-email').value;
    if (!email) return;
    await supabaseClient.from('waitlist').insert({ email, source: 'landing_page' });
    showToast('Added to waitlist!');
    document.getElementById('landing-waitlist-email').value = '';
};

// ---------------------------------------------------
// 3. UKMDOCS (Auto-generated API Docs)
// ---------------------------------------------------
window.loadPublicDocs = async function(projectSlug) {
    document.getElementById('landing-view').classList.add('hidden'); document.getElementById('dashboard-view').classList.add('hidden'); document.getElementById('auth-view').classList.add('hidden');
    
    let view = document.getElementById('ukmdocs-view');
    if (!view) {
        view = document.createElement('div');
        view.id = 'ukmdocs-view';
        view.className = 'min-h-screen bg-[#0B1020] p-6';
        document.body.appendChild(view);
    }
    view.classList.remove('hidden');
    view.innerHTML = `<div class="max-w-4xl mx-auto"><div class="text-center py-20"><div class="inline-block w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style="border-color: var(--accent);"></div></div></div>`;

    const { data: proj } = await supabaseClient.from('projects').select('*').eq('slug', projectSlug).single();
    if (!proj) {
        view.innerHTML = '<h1 class="text-white text-center mt-20">Project not found.</h1>';
        return;
    }

    const { data: tables } = await supabaseClient.from('project_schemas').select('schema_name').eq('project_id', proj.id).single();
    const schema = tables ? tables.schema_name : 'public';

    view.innerHTML = `
    <div class="max-w-4xl mx-auto">
        <header class="mb-10 text-center">
            <h1 class="text-3xl font-extrabold mb-2" style="color: var(--text);">${escapeHtml(proj.name)} API</h1>
            <p class="text-sm" style="color: var(--text-muted);">Auto-generated documentation</p>
        </header>
        <div class="rounded-xl p-6 mb-6" style="background: var(--surface); border: 1px solid var(--border);">
            <h2 class="text-lg font-bold mb-4" style="color: var(--text);">Authentication</h2>
            <p class="text-sm mb-2" style="color: var(--text-muted);">Use the following headers for all requests:</p>
            <pre class="p-3 rounded text-xs mono" style="background: var(--bg); color: var(--cyan);">apikey: ${SUPABASE_ANON_KEY}\nAuthorization: Bearer ${SUPABASE_ANON_KEY}\nAccept-Profile: ${schema}</pre>
        </div>
        <div class="rounded-xl p-6" style="background: var(--surface); border: 1px solid var(--border);">
            <h2 class="text-lg font-bold mb-4" style="color: var(--text);">Endpoints</h2>
            <div class="space-y-4">
                <div class="border-l-4 border-green-500 pl-4">
                    <span class="font-bold text-green-400 text-sm mono">GET</span> <span class="mono text-sm" style="color: var(--text);">/rest/v1/{table_name}</span>
                    <p class="text-xs mt-1" style="color: var(--text-muted);">Fetch rows from a table.</p>
                </div>
                <div class="border-l-4 border-blue-500 pl-4">
                    <span class="font-bold text-blue-400 text-sm mono">POST</span> <span class="mono text-sm" style="color: var(--text);">/rest/v1/{table_name}</span>
                    <p class="text-xs mt-1" style="color: var(--text-muted);">Insert a new row.</p>
                </div>
                <div class="border-l-4 border-yellow-500 pl-4">
                    <span class="font-bold text-yellow-400 text-sm mono">PATCH</span> <span class="mono text-sm" style="color: var(--text);">/rest/v1/{table_name}?id=eq.{id}</span>
                    <p class="text-xs mt-1" style="color: var(--text-muted);">Update a row by ID.</p>
                </div>
                <div class="border-l-4 border-red-500 pl-4">
                    <span class="font-bold text-red-400 text-sm mono">DELETE</span> <span class="mono text-sm" style="color: var(--text);">/rest/v1/{table_name}?id=eq.{id}</span>
                    <p class="text-xs mt-1" style="color: var(--text-muted);">Delete a row by ID.</p>
                </div>
            </div>
        </div>
        <p class="text-center text-xs mt-10" style="color: var(--text-dim);">Powered by Ukmbase Docs</p>
    </div>`;
};

// ---------------------------------------------------
// 4. UKMTEST (Postman built-in)
// ---------------------------------------------------
window.openUkmTest = function() {
    let modal = document.getElementById('ukmtest-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ukmtest-modal';
        modal.className = 'hidden fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm';
        document.body.appendChild(modal);
    }
    modal.classList.remove('hidden');

    const proj = state.projectsCache.find(p => p.id === state.currentUkmDataProjectId) || state.projectsCache[0];
    if (!proj) return showToast('Create a project first', 'error');
    const schema = proj.slug.replace(/-/g, '_');

    modal.innerHTML = `
    <div class="w-full max-w-4xl rounded-2xl p-6 glow max-h-[90vh] flex flex-col" style="background: var(--surface); border: 1px solid var(--border);">
        <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-bold" style="color: var(--text);">UkmTest API Client</h2>
            <button onclick="document.getElementById('ukmtest-modal').classList.add('hidden')" style="color: var(--text-muted);">✕</button>
        </div>
        <div class="flex gap-2 mb-4">
            <select id="test-method" class="rounded-lg px-3 py-2 text-sm mono font-bold" style="background: var(--bg); border: 1px solid var(--border); color: var(--text);">
                <option>GET</option><option>POST</option><option>PATCH</option><option>DELETE</option>
            </select>
            <input type="text" id="test-url" value="${SUPABASE_URL}/rest/v1/your_table?select=*" class="flex-1 rounded-lg px-3 py-2 text-sm mono" style="background: var(--bg); border: 1px solid var(--border); color: var(--text);">
            <button onclick="runUkmTest()" id="test-run-btn" class="font-bold px-6 py-2 rounded-lg text-white" style="background: var(--accent);">Send</button>
        </div>
        <div class="flex gap-4 mb-4">
            <div class="flex-1">
                <label class="block text-xs mb-1" style="color: var(--text-muted);">Headers (JSON)</label>
                <textarea id="test-headers" rows="4" class="w-full rounded-lg p-3 text-xs mono" style="background: var(--bg); border: 1px solid var(--border); color: var(--text);">{\n  "apikey": "${SUPABASE_ANON_KEY}",\n  "Authorization": "Bearer ${SUPABASE_ANON_KEY}",\n  "Accept-Profile": "${schema}"\n}</textarea>
            </div>
            <div class="flex-1">
                <label class="block text-xs mb-1" style="color: var(--text-muted);">Body (JSON)</label>
                <textarea id="test-body" rows="4" class="w-full rounded-lg p-3 text-xs mono" style="background: var(--bg); border: 1px solid var(--border); color: var(--text);">{}</textarea>
            </div>
        </div>
        <div class="flex-1 rounded-lg p-4 overflow-auto" style="background: var(--bg); border: 1px solid var(--border);">
            <pre id="test-response" class="text-xs mono" style="color: var(--text-dim);">Ready to send...</pre>
        </div>
    </div>`;
};

window.runUkmTest = async function() {
    const method = document.getElementById('test-method').value;
    const url = document.getElementById('test-url').value;
    const headersStr = document.getElementById('test-headers').value;
    const bodyStr = document.getElementById('test-body').value;
    const btn = document.getElementById('test-run-btn');
    const respEl = document.getElementById('test-response');

    try {
        btn.textContent = '...'; btn.disabled = true;
        respEl.textContent = 'Sending request...';
        
        let headers = {};
        try { headers = JSON.parse(headersStr); } catch(e) { throw new Error('Invalid JSON in Headers'); }
        
        let body = null;
        if (method !== 'GET' && method !== 'DELETE' && bodyStr.trim()) {
            try { body = JSON.parse(bodyStr); } catch(e) { throw new Error('Invalid JSON in Body'); }
        }

        const start = Date.now();
        const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
        const time = Date.now() - start;
        const data = await res.text();

        respEl.textContent = `Status: ${res.status} ${res.statusText} (${time}ms)\n\n${data}`;
        respEl.style.color = res.ok ? 'var(--green)' : 'var(--red)';
    } catch (e) {
        respEl.textContent = 'Error: ' + e.message;
        respEl.style.color = 'var(--red)';
    } finally {
        btn.textContent = 'Send'; btn.disabled = false;
    }
};

// ---------------------------------------------------
// AUTOMATIC UI INJECTION (Hooks into existing DOM)
// ---------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    // Inject "Form Builder" button next to "CSV" in UkmData Tables list
    // We observe the table list and add our button when tables render
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.addedNodes.length) {
                document.querySelectorAll('#ukmdata-tables-list > div').forEach(card => {
                    if (!card.querySelector('.btn-form-builder')) {
                        const tableName = card.querySelector('.mono').textContent;
                        const btnContainer = card.querySelector('.flex-wrap.items-center.gap-2');
                        if (btnContainer) {
                            const btn = document.createElement('button');
                            btn.className = 'btn-form-builder text-[10px] font-bold px-2 py-1.5 rounded-lg';
                            btn.style.cssText = 'background: rgba(236,72,153,0.1); color: #EC4899; border: 1px solid rgba(236,72,153,0.3);';
                            btn.textContent = 'Build Form';
                            btn.onclick = () => openFormBuilder(tableName);
                            btnContainer.insertBefore(btn, btnContainer.querySelector('button[onclick^="copyFormLink"]'));
                        }
                    }
                });
            }
        });
    });
    const listContainer = document.getElementById('ukmdata-tables-list');
    if (listContainer) observer.observe(listContainer, { childList: true, subtree: true });

    // Inject "Docs" and "Test" buttons into the top nav or sidebar
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        const navDiv = sidebar.querySelector('.p-4.space-y-1');
        if (navDiv) {
            // UkmTest Button
            const testBtn = document.createElement('a');
            testBtn.href = '#'; testBtn.className = 'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors';
            testBtn.style.color = 'var(--text-muted)';
            testBtn.innerHTML = '<svg class="w-5 h-5 text-[#10B981]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg> UkmTest';
            testBtn.onclick = openUkmTest;
            
            // Insert before Settings
            const settingsDiv = navDiv.querySelector('#nav-settings')?.parentElement;
            if (settingsDiv) navDiv.insertBefore(testBtn, settingsDiv);
        }
    }
});

// Override Init to handle new routes
const originalInitDay2 = window.init;
window.init = async function() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('docs')) return loadPublicDocs(urlParams.get('docs'));
    if (urlParams.has('landing')) return loadPublicLandingV2(urlParams.get('landing'));
    if (urlParams.has('form') && urlParams.has('project')) return loadPublicFormV2(urlParams.get('project'), urlParams.get('form'));
    if (originalInitDay2) await originalInitDay2();
};

// ============================================
// END OF DAY 2 ADDITIONS
// ============================================
// ============================================
// DAY 3 ADDITIONS (BACKUPS, SEARCH, AUDIT, TEMPLATES)
// ============================================

// ---------------------------------------------------
// 1. UKMTEMPLATES (One-click starter kits)
// ---------------------------------------------------
window.openTemplatesModal = async function() {
    let modal = document.getElementById('ukmtemplates-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ukmtemplates-modal';
        modal.className = 'hidden fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm';
        document.body.appendChild(modal);
    }
    modal.classList.remove('hidden');
    modal.innerHTML = `
    <div class="w-full max-w-2xl rounded-2xl p-6 glow max-h-[90vh] flex flex-col" style="background: var(--surface); border: 1px solid var(--border);">
        <div class="flex items-center justify-between mb-4">
            <div><h2 class="text-lg font-bold" style="color: var(--text);">UkmTemplates</h2><p class="text-xs mt-1" style="color: var(--text-muted);">Start with a pre-built schema.</p></div>
            <button onclick="document.getElementById('ukmtemplates-modal').classList.add('hidden')" style="color: var(--text-muted);">✕</button>
        </div>
        <div id="templates-list" class="flex-1 overflow-y-auto space-y-3">
            <div class="text-center py-8"><div class="inline-block w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style="border-color: var(--accent);"></div></div>
        </div>
    </div>`;

    const { data: templates } = await supabaseClient.from('project_templates').select('*').order('created_at', { ascending: false });
    const list = document.getElementById('templates-list');
    
    if (!templates || templates.length === 0) {
        list.innerHTML = '<p class="text-sm text-center" style="color: var(--text-muted);">No templates found.</p>';
        return;
    }

    list.innerHTML = templates.map(t => `
        <div class="rounded-xl p-4 flex items-center justify-between" style="background: var(--bg); border: 1px solid var(--border);">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-lg flex items-center justify-center text-xl bg-[rgba(79,70,229,0.1)]">📦</div>
                <div>
                    <p class="text-sm font-bold" style="color: var(--text);">${escapeHtml(t.name)}</p>
                    <p class="text-xs" style="color: var(--text-muted);">${escapeHtml(t.tagline || '')}</p>
                </div>
            </div>
            <button onclick="cloneTemplate('${t.id}')" class="text-xs font-bold px-4 py-2 rounded-lg text-white" style="background: var(--accent);">Clone</button>
        </div>
    `).join('');
};

window.cloneTemplate = async function(templateId) {
    const { data: template } = await supabaseClient.from('project_templates').select('*').eq('id', templateId).single();
    if (!template) return showToast('Template not found', 'error');
    
    const projName = prompt('Name your new project:', template.name);
    if (!projName) return;

    try {
        showToast('Cloning template...', 'success');
        // 1. Create project
        const slug = projName.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const { data: newProj, error } = await supabaseClient.from('projects').insert({
            owner_id: state.currentUser.id,
            name: projName,
            slug: slug,
            description: template.tagline,
            status: 'active'
        }).select().single();
        
        if (error) throw error;

        // 2. Setup schema via edge function
        const { data: { session } } = await supabaseClient.auth.getSession();
        await fetch(SUPABASE_URL + '/functions/v1/ukmdata', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'enable', project_id: newProj.id })
        });

        // 3. Create tables from template schema
        if (template.schema_definition && template.schema_definition.tables) {
            for (const t of template.schema_definition.tables) {
                await fetch(SUPABASE_URL + '/functions/v1/ukmdata', {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'create_table', project_id: newProj.id, table: t })
                });
            }
        }

        document.getElementById('ukmtemplates-modal').classList.add('hidden');
        showToast('Project cloned successfully!');
        loadProjects();
    } catch (e) {
        showToast(e.message, 'error');
    }
};

// ---------------------------------------------------
// 2. UKMSEARCH (Full text search)
// ---------------------------------------------------
window.openSearchModal = function() {
    let modal = document.getElementById('ukmsearch-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ukmsearch-modal';
        modal.className = 'hidden fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm';
        document.body.appendChild(modal);
    }
    modal.classList.remove('hidden');
    modal.innerHTML = `
    <div class="w-full max-w-lg rounded-2xl p-6 glow" style="background: var(--surface); border: 1px solid var(--border);">
        <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-bold" style="color: var(--text);">UkmSearch</h2>
            <button onclick="document.getElementById('ukmsearch-modal').classList.add('hidden')" style="color: var(--text-muted);">✕</button>
        </div>
        <div class="space-y-4">
            <div><label class="block text-xs mb-1" style="color: var(--text-muted);">Table</label><select id="search-table" class="w-full rounded-lg px-3 py-2 text-sm" style="background: var(--bg); border: 1px solid var(--border); color: var(--text);">${state.ukmDataTables.map(t => `<option value="${t.table_name}">${t.table_name}</option>`).join('')}</select></div>
            <div><label class="block text-xs mb-1" style="color: var(--text-muted);">Search Term</label><input type="text" id="search-term" placeholder="e.g. John" class="w-full rounded-lg px-3 py-2 text-sm" style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"></div>
            <button onclick="executeSearch()" class="w-full font-bold py-2 rounded-lg text-white" style="background: var(--accent);">Search</button>
        </div>
        <div id="search-results" class="mt-4 space-y-2 max-h-60 overflow-y-auto"></div>
    </div>`;
};

window.executeSearch = async function() {
    const table = document.getElementById('search-table').value;
    const term = document.getElementById('search-term').value;
    if (!table || !term) return;
    
    const resDiv = document.getElementById('search-results');
    resDiv.innerHTML = '<div class="text-center py-4"><div class="inline-block w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style="border-color: var(--accent);"></div></div>';

    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        const res = await fetch(SUPABASE_URL + '/functions/v1/ukmdata', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'fetch_rows', project_id: state.currentUkmDataProjectId, table_name: table })
        });
        const data = await res.json();
        
        if (data.error) throw new Error(data.error);
        
        // Client-side filtering (v0.1 approach)
        const rows = (data.rows || []).filter(r => JSON.stringify(r).toLowerCase().includes(term.toLowerCase()));
        
        if (rows.length === 0) {
            resDiv.innerHTML = '<p class="text-xs text-center" style="color: var(--text-muted);">No results found.</p>';
            return;
        }

        resDiv.innerHTML = rows.slice(0, 10).map(r => `
            <div class="p-2 rounded text-xs" style="background: var(--bg); border: 1px solid var(--border);">
                ${escapeHtml(JSON.stringify(r).slice(0, 100))}...
            </div>
        `).join('');
    } catch (e) {
        resDiv.innerHTML = `<p class="text-xs text-red-400">${e.message}</p>`;
    }
};

// ---------------------------------------------------
// 3. UKMBACKUPS
// ---------------------------------------------------
window.openBackupModal = async function() {
    let modal = document.getElementById('ukmbackup-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ukmbackup-modal';
        modal.className = 'hidden fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm';
        document.body.appendChild(modal);
    }
    modal.classList.remove('hidden');
    modal.innerHTML = `
    <div class="w-full max-w-lg rounded-2xl p-6 glow" style="background: var(--surface); border: 1px solid var(--border);">
        <div class="flex items-center justify-between mb-4">
            <div><h2 class="text-lg font-bold" style="color: var(--text);">UkmBackups</h2><p class="text-xs mt-1" style="color: var(--text-muted);">Snapshot your database.</p></div>
            <button onclick="document.getElementById('ukmbackup-modal').classList.add('hidden')" style="color: var(--text-muted);">✕</button>
        </div>
        <button onclick="createBackup()" class="w-full font-bold py-2 rounded-lg text-white mb-4" style="background: var(--accent);">+ Take Snapshot</button>
        <div id="backups-list" class="space-y-2 max-h-60 overflow-y-auto"></div>
    </div>`;
    
    loadBackupsList();
};

window.loadBackupsList = async function() {
    const { data } = await supabaseClient.from('project_backups').select('*').eq('project_id', state.currentUkmDataProjectId).order('created_at', { ascending: false });
    const list = document.getElementById('backups-list');
    if (!data || data.length === 0) {
        list.innerHTML = '<p class="text-xs text-center py-4" style="color: var(--text-muted);">No backups yet.</p>';
        return;
    }
    list.innerHTML = data.map(b => `
        <div class="p-3 rounded-lg flex items-center justify-between" style="background: var(--bg); border: 1px solid var(--border);">
            <div>
                <p class="text-xs font-bold" style="color: var(--text);">${new Date(b.created_at).toLocaleString()}</p>
                <p class="text-[10px] mono" style="color: var(--text-dim);">${b.kind} · ${b.row_count || 0} rows</p>
            </div>
            <button onclick="downloadBackup('${b.id}')" class="text-xs text-cyan-400 font-bold">Download</button>
        </div>
    `).join('');
};

window.createBackup = async function() {
    showToast('Creating snapshot...');
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        
        // Use the existing export action
        const res = await fetch(SUPABASE_URL + '/functions/v1/ukmdata', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'export_project', project_id: state.currentUkmDataProjectId })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        // Log the backup record
        await supabaseClient.from('project_backups').insert({
            project_id: state.currentUkmDataProjectId,
            kind: 'manual',
            status: 'ready',
            row_count: data.export_data ? data.export_data.tables?.length : 0,
            storage_path: 'inline' // v0.1 we are just downloading it
        });

        showToast('Backup ready! Download it now.');
        loadBackupsList();
        
        // Automatically trigger download
        const link = document.createElement('a');
        link.href = URL.createObjectURL(new Blob([JSON.stringify(data.export_data, null, 2)], { type: 'application/json' }));
        link.download = `backup_${state.currentUkmDataProjectId}_${Date.now()}.json`;
        link.click();

    } catch (e) {
        showToast(e.message, 'error');
    }
};

window.downloadBackup = function(id) {
    // In v0.1, backups are created locally. To restore, users just import the JSON file they downloaded.
    showToast('In v1.0 this will pull from Storage. For now, use the JSON you just downloaded with the Import button!');
};

// ---------------------------------------------------
// 4. UKMAUDIT
// ---------------------------------------------------
window.openAuditModal = async function() {
    let modal = document.getElementById('ukmaudit-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ukmaudit-modal';
        modal.className = 'hidden fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm';
        document.body.appendChild(modal);
    }
    modal.classList.remove('hidden');
    modal.innerHTML = `
    <div class="w-full max-w-2xl rounded-2xl p-6 glow max-h-[90vh] flex flex-col" style="background: var(--surface); border: 1px solid var(--border);">
        <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-bold" style="color: var(--text);">Audit Logs</h2>
            <button onclick="document.getElementById('ukmaudit-modal').classList.add('hidden')" style="color: var(--text-muted);">✕</button>
        </div>
        <div id="audit-list" class="flex-1 overflow-y-auto space-y-2">
            <div class="text-center py-8"><div class="inline-block w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style="border-color: var(--accent);"></div></div>
        </div>
    </div>`;

    // Fetch logs
    const { data } = await supabaseClient.from('audit_logs').select('*').eq('project_id', state.currentUkmDataProjectId).order('created_at', { ascending: false }).limit(50);
    const list = document.getElementById('audit-list');
    
    if (!data || data.length === 0) {
        list.innerHTML = '<p class="text-sm text-center" style="color: var(--text-muted);">No audit logs found. Try editing a project or a payment to trigger a log!</p>';
        return;
    }

    list.innerHTML = data.map(l => `
        <div class="p-3 rounded-lg" style="background: var(--bg); border: 1px solid var(--border);">
            <div class="flex items-center gap-2 mb-1">
                <span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded ${l.operation === 'INSERT' ? 'bg-green-500/20 text-green-400' : l.operation === 'UPDATE' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'}">${l.operation}</span>
                <span class="text-xs font-bold mono" style="color: var(--text);">${l.table_name}</span>
                <span class="text-[10px] ml-auto" style="color: var(--text-dim);">${new Date(l.created_at).toLocaleTimeString()}</span>
            </div>
            <p class="text-[10px] mono truncate" style="color: var(--text-muted);">${JSON.stringify(l.new_row)}</p>
        </div>
    `).join('');
};

// ---------------------------------------------------
// AUTOMATIC UI INJECTION (Sidebar)
// ---------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        const navDiv = sidebar.querySelector('.p-4.space-y-1');
        if (navDiv) {
            // Helper to create links
            const makeLink = (icon, text, onclick) => {
                const a = document.createElement('a');
                a.href = '#'; a.className = 'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors';
                a.style.color = 'var(--text-muted)';
                a.innerHTML = `${icon} ${text}`;
                a.onclick = (e) => { e.preventDefault(); onclick(); };
                return a;
            };

            // Insert Templates before UkmData
            const dataNav = document.getElementById('nav-ukmdata');
            if (dataNav) {
                const tmplBtn = makeLink('<svg class="w-5 h-5 text-[#10B981]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"></path></svg>', 'UkmTemplates', openTemplatesModal);
                dataNav.parentElement.insertBefore(tmplBtn, dataNav);
            }

            // Insert Audit & Search after UkmData
            if (dataNav) {
                const auditBtn = makeLink('<svg class="w-5 h-5 text-[#F59E0B]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>', 'UkmAudit', openAuditModal);
                const searchBtn = makeLink('<svg class="w-5 h-5 text-[#EC4899]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>', 'UkmSearch', openSearchModal);
                const backupBtn = makeLink('<svg class="w-5 h-5 text-[#8B5CF6]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"></path></svg>', 'UkmBackups', openBackupModal);
                
                // Insert after UkmData
                let nextNode = dataNav.nextElementSibling;
                dataNav.parentElement.insertBefore(backupBtn, nextNode);
                dataNav.parentElement.insertBefore(searchBtn, backupBtn);
                dataNav.parentElement.insertBefore(auditBtn, searchBtn);
            }
        }
    }
});

// ============================================
// END OF DAY 3 ADDITIONS
// ============================================
// ============================================


// ============================================
// DAY 3 HOTFIX V2 (Bulletproof Backups)
// ============================================

window.openBackupModal = async function() {
    // 1. Force a check: Do you have any projects?
    if (!state.projectsCache || state.projectsCache.length === 0) {
        return showToast('You must create a project first before making a backup!', 'error');
    }

    let modal = document.getElementById('ukmbackup-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ukmbackup-modal';
        modal.className = 'hidden fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm';
        document.body.appendChild(modal);
    }
    
    // 2. Guarantee a project is selected in the dropdown
    const defaultProj = state.currentUkmDataProjectId || state.projectsCache[0].id;
    const projOpts = state.projectsCache.map(p => `<option value="${p.id}" ${p.id === defaultProj ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('');

    modal.innerHTML = `
    <div class="w-full max-w-lg rounded-2xl p-6 glow" style="background: var(--surface); border: 1px solid var(--border);">
        <div class="flex items-center justify-between mb-4">
            <div><h2 class="text-lg font-bold" style="color: var(--text);">UkmBackups</h2><p class="text-xs mt-1" style="color: var(--text-muted);">Snapshot your database.</p></div>
            <button onclick="document.getElementById('ukmbackup-modal').classList.add('hidden')" style="color: var(--text-muted);">✕</button>
        </div>
        
        <div class="mb-4">
            <label class="block text-xs mb-1" style="color: var(--text-muted);">Select Project to Backup</label>
            <select id="backup-project-select" class="w-full rounded-lg px-3 py-2 text-sm mono focus:outline-none" style="background: var(--bg); border: 1px solid var(--border); color: var(--text);">
                ${projOpts}
            </select>
        </div>

        <button onclick="createBackup()" id="btn-create-backup" class="w-full font-bold py-2 rounded-lg text-white mb-4" style="background: var(--accent);">+ Take Snapshot</button>
        <div id="backups-list" class="space-y-2 max-h-60 overflow-y-auto"></div>
    </div>`;
    
    modal.classList.remove('hidden');
    loadBackupsList(defaultProj);
};

window.loadBackupsList = async function(projectId) {
    if (!projectId) return;
    const { data } = await supabaseClient.from('project_backups').select('*').eq('project_id', projectId).order('created_at', { ascending: false });
    const list = document.getElementById('backups-list');
    if (!list) return;
    
    if (!data || data.length === 0) {
        list.innerHTML = '<p class="text-xs text-center py-4" style="color: var(--text-muted);">No backups yet for this project.</p>';
        return;
    }
    list.innerHTML = data.map(b => `
        <div class="p-3 rounded-lg flex items-center justify-between" style="background: var(--bg); border: 1px solid var(--border);">
            <div>
                <p class="text-xs font-bold" style="color: var(--text);">${new Date(b.created_at).toLocaleString()}</p>
                <p class="text-[10px] mono" style="color: var(--text-dim);">${b.kind} · ${b.row_count || 0} tables</p>
            </div>
            <span class="text-[10px] text-green-400 font-bold">Ready</span>
        </div>
    `).join('');
};

window.createBackup = async function() {
    const sel = document.getElementById('backup-project-select');
    if (!sel) return showToast('Error: Selector not found.', 'error');
    
    // 3. Strictly grab the project_id. If it's missing, STOP immediately.
    const pid = sel.value;
    if (!pid || pid === "") return showToast('Please select a project from the list.', 'error');
    
    const btn = document.getElementById('btn-create-backup');
    btn.textContent = 'Snapshotting...'; btn.disabled = true;
    
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        
        // 4. Send the exact `pid` to the edge function
        const res = await fetch(SUPABASE_URL + '/functions/v1/ukmdata', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'export_project', project_id: pid })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        // 5. Save the record to the database with the exact `pid`
        const { error: dbErr } = await supabaseClient.from('project_backups').insert({
            project_id: pid,
            kind: 'manual',
            status: 'ready',
            row_count: data.export_data && data.export_data.tables ? data.export_data.tables.length : 0,
            storage_path: 'inline' 
        });
        
        if (dbErr) throw dbErr;

        showToast('Backup ready! Downloading...');
        loadBackupsList(pid);
        
        // 6. Download the JSON file
        const proj = state.projectsCache.find(p => p.id === pid);
        const link = document.createElement('a');
        link.href = URL.createObjectURL(new Blob([JSON.stringify(data.export_data, null, 2)], { type: 'application/json' }));
        link.download = `${proj ? proj.slug : 'project'}_backup_${Date.now()}.json`;
        link.click();

    } catch (e) {
        showToast(e.message, 'error');
    } finally {
        if(btn) { btn.textContent = '+ Take Snapshot'; btn.disabled = false; }
    }
};
// ============================================
// DAY 4 ADDITIONS (FORGE, VOICE, CODEGEN, FLOW)
// ============================================

// ---------------------------------------------------
// 1. UKMFORGE (One prompt, whole app)
// ---------------------------------------------------
window.openForgeModal = function() {
    let modal = document.getElementById('ukmforge-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ukmforge-modal';
        modal.className = 'hidden fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm';
        document.body.appendChild(modal);
    }
    modal.classList.remove('hidden');
    modal.innerHTML = `
    <div class="w-full max-w-lg rounded-2xl p-6 glow" style="background: var(--surface); border: 1px solid var(--border);">
        <div class="flex items-center justify-between mb-4">
            <div><h2 class="text-lg font-bold" style="color: var(--text);">UkmForge</h2><p class="text-xs mt-1" style="color: var(--text-muted);">Describe your app. We'll build the database and tables.</p></div>
            <button onclick="document.getElementById('ukmforge-modal').classList.add('hidden')" style="color: var(--text-muted);">✕</button>
        </div>
        <div class="space-y-4">
            <textarea id="forge-prompt" rows="4" placeholder="e.g. A booking system for a hair salon with clients, services, and appointments." class="w-full rounded-lg px-4 py-3 text-sm focus:outline-none resize-none" style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"></textarea>
            <button id="forge-submit-btn" onclick="executeForge()" class="w-full font-bold py-3 rounded-lg text-white" style="background: var(--accent);">Forge App</button>
        </div>
        <div id="forge-progress" class="hidden mt-4 space-y-2 text-xs" style="color: var(--text-muted);"></div>
    </div>`;
};

window.executeForge = async function() {
    const prompt = document.getElementById('forge-prompt').value.trim();
    if (!prompt) return showToast('Describe your app first', 'error');
    
    const btn = document.getElementById('forge-submit-btn');
    const prog = document.getElementById('forge-progress');
    btn.textContent = 'Forging...'; btn.disabled = true;
    prog.classList.remove('hidden');
    prog.innerHTML = '<p>🧠 AI is designing your schema...</p>';

    try {
        // 1. Ask AI for the schema
        const aiPrompt = `Create a database schema for this app: "${prompt}". 
        Return ONLY a JSON object. No markdown. 
        Format: { "project_name": "Name", "tables": [ { "name": "table_name", "columns": [ {"name": "col1", "type": "text"}, {"name": "col2", "type": "number"} ] } ] }`;
        
        const aiData = await aiCall({ prompt: aiPrompt, mode: 'default' });
        const schemaJson = aiExtractJSON(aiData.content || '');
        
        if (!schemaJson || !schemaJson.tables) throw new Error("AI did not return a valid schema.");
        
        prog.innerHTML += '<p>✅ Schema designed!</p><p>🏗️ Creating project...</p>';

        // 2. Create the project
        const projName = schemaJson.project_name || 'Forged App';
        const slug = projName.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Math.floor(Math.random()*1000);
        
        const { data: newProj, error: projErr } = await supabaseClient.from('projects').insert({
            owner_id: state.currentUser.id, name: projName, slug: slug, description: prompt
        }).select().single();
        
        if (projErr) throw projErr;
        prog.innerHTML += '<p>✅ Project created!</p><p>⚙️ Setting up database...</p>';

        // 3. Enable UkmData for this project
        const { data: { session } } = await supabaseClient.auth.getSession();
        const headers = { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' };
        
        await fetch(SUPABASE_URL + '/functions/v1/ukmdata', {
            method: 'POST', headers,
            body: JSON.stringify({ action: 'enable', project_id: newProj.id })
        });

        // 4. Create all tables
        for (const t of schemaJson.tables) {
            await fetch(SUPABASE_URL + '/functions/v1/ukmdata', {
                method: 'POST', headers,
                body: JSON.stringify({ action: 'create_table', project_id: newProj.id, table: t })
            });
            prog.innerHTML += `<p>✅ Table <b>${escapeHtml(t.name)}</b> created!</p>`;
        }

        prog.innerHTML += '<p style="color: var(--green); font-weight: bold; margin-top: 10px;">🚀 App forged successfully!</p>';
        
        setTimeout(async () => {
            document.getElementById('ukmforge-modal').classList.add('hidden');
            await loadProjects();
            state.currentUkmDataProjectId = newProj.id;
            switchView('ukmdata');
            showToast('App forged successfully!');
        }, 2000);

    } catch (e) {
        prog.innerHTML += `<p style="color: var(--red);">❌ Error: ${escapeHtml(e.message)}</p>`;
        btn.textContent = 'Try Again'; btn.disabled = false;
    }
};

// ---------------------------------------------------
// 2. UKMVOICE (Speech to Text)
// ---------------------------------------------------
window.startVoiceRecognition = function() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        return showToast('Voice recognition is not supported in this browser.', 'error');
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    const micBtn = document.getElementById('ukm-voice-btn');
    if (micBtn) micBtn.style.color = 'var(--red)'; // Turn red while listening
    showToast('Listening... Speak now.');

    recognition.start();

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        const input = document.getElementById('chat-input');
        if (input) {
            input.value += (input.value ? ' ' : '') + transcript;
            handleChatKeydown({ key: 'Enter', shiftKey: false, preventDefault: () => {} }); // Auto-send
        }
        if (micBtn) micBtn.style.color = 'var(--text-muted)';
    };

    recognition.onspeechend = () => { recognition.stop(); if (micBtn) micBtn.style.color = 'var(--text-muted)'; };
    recognition.onerror = (e) => { showToast('Voice error: ' + e.error, 'error'); if (micBtn) micBtn.style.color = 'var(--text-muted)'; };
};

// ---------------------------------------------------
// 3. UKMCODEGEN (Table to React/Flutter code)
// ---------------------------------------------------
window.openCodegenModal = async function(tableName) {
    let modal = document.getElementById('ukmcodegen-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ukmcodegen-modal';
        modal.className = 'hidden fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm';
        document.body.appendChild(modal);
    }
    modal.classList.remove('hidden');
    
    modal.innerHTML = `
    <div class="w-full max-w-3xl rounded-2xl p-6 glow max-h-[90vh] flex flex-col" style="background: var(--surface); border: 1px solid var(--border);">
        <div class="flex items-center justify-between mb-4">
            <div><h2 class="text-lg font-bold" style="color: var(--text);">UkmCodegen: <span class="mono text-[var(--cyan)]">${escapeHtml(tableName)}</span></h2><p class="text-xs mt-1" style="color: var(--text-muted);">Generate UI code for this table.</p></div>
            <button onclick="document.getElementById('ukmcodegen-modal').classList.add('hidden')" style="color: var(--text-muted);">✕</button>
        </div>
        
        <div class="flex gap-2 mb-4">
            <button onclick="generateCode('${tableName}', 'react')" class="flex-1 text-xs font-bold py-2 rounded-lg text-white" style="background: var(--accent);">React</button>
            <button onclick="generateCode('${tableName}', 'flutter')" class="flex-1 text-xs font-bold py-2 rounded-lg text-white" style="background: var(--cyan);">Flutter</button>
        </div>

        <div class="flex-1 rounded-lg overflow-auto p-4" style="background: var(--bg); border: 1px solid var(--border);">
            <pre id="codegen-output" class="text-xs mono" style="color: var(--text-muted);">Select a framework above to generate code...</pre>
        </div>
    </div>`;
};

window.generateCode = function(tableName, framework) {
    const out = document.getElementById('codegen-output');
    const proj = state.projectsCache.find(p => p.id === state.currentUkmDataProjectId);
    if (!proj) return;
    const schema = proj.slug.replace(/-/g, '_');

    out.textContent = 'Generating...';

    setTimeout(() => {
        if (framework === 'react') {
            out.textContent = `import { useEffect, useState } from 'react'\nimport { createClient } from '@supabase/supabase-js'\n\nconst supabase = createClient('${SUPABASE_URL}', '${SUPABASE_ANON_KEY}')\n\nexport default function ${tableName.charAt(0).toUpperCase() + tableName.slice(1)}List() {\n  const [data, setData] = useState([])\n\n  useEffect(() => {\n    supabase.schema('${schema}').from('${tableName}').select('*').then(({ data }) => setData(data || []))\n  }, [])\n\n  return (\n    <div>\n      <h1>${tableName}</h1>\n      <ul>\n        {data.map(item => (\n          <li key={item.id}>{JSON.stringify(item)}</li>\n        ))}\n      </ul>\n    </div>\n  )\n}`;
        } else {
            out.textContent = `import 'package:flutter/material.dart';\nimport 'package:supabase_flutter/supabase_flutter.dart';\n\nclass ${tableName.charAt(0).toUpperCase() + tableName.slice(1)}List extends StatefulWidget {\n  @override\n  _${tableName.charAt(0).toUpperCase() + tableName.slice(1)}ListState createState() => _${tableName.charAt(0).toUpperCase() + tableName.slice(1)}ListState();\n}\n\nclass _${tableName.charAt(0).toUpperCase() + tableName.slice(1)}ListState extends State<${tableName.charAt(0).toUpperCase() + tableName.slice(1)}List> {\n  List<dynamic> data = [];\n\n  @override\n  void initState() {\n    super.initState();\n    fetchData();\n  }\n\n  void fetchData() async {\n    final res = await Supabase.instance.client.schema('${schema}').from('${tableName}').select();\n    setState(() { data = res; });\n  }\n\n  @override\n  Widget build(BuildContext context) {\n    return Scaffold(\n      appBar: AppBar(title: Text('${tableName}')),\n      body: ListView.builder(\n        itemCount: data.length,\n        itemBuilder: (context, index) {\n          return ListTile(title: Text(data[index].toString()));\n        },\n      ),\n    );\n  }\n}`;
        }
        out.style.color = 'var(--text)';
    }, 500);
};

// ---------------------------------------------------
// 4. UKMFLOW (Simple Automations)
// ---------------------------------------------------
window.openFlowModal = async function() {
    let modal = document.getElementById('ukmflow-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ukmflow-modal';
        modal.className = 'hidden fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm';
        document.body.appendChild(modal);
    }
    modal.classList.remove('hidden');
    
    modal.innerHTML = `
    <div class="w-full max-w-lg rounded-2xl p-6 glow" style="background: var(--surface); border: 1px solid var(--border);">
        <div class="flex items-center justify-between mb-4">
            <div><h2 class="text-lg font-bold" style="color: var(--text);">UkmFlow</h2><p class="text-xs mt-1" style="color: var(--text-muted);">Trigger actions when data changes.</p></div>
            <button onclick="document.getElementById('ukmflow-modal').classList.add('hidden')" style="color: var(--text-muted);">✕</button>
        </div>
        <div class="space-y-4">
            <div><label class="block text-xs mb-1" style="color: var(--text-muted);">When a row is added to...</label><select id="flow-table" class="w-full rounded-lg px-3 py-2 text-sm mono" style="background: var(--bg); border: 1px solid var(--border); color: var(--text);">${state.ukmDataTables.map(t => `<option value="${t.table_name}">${t.table_name}</option>`).join('')}</select></div>
            <div><label class="block text-xs mb-1" style="color: var(--text-muted);">Send an Email to...</label><input type="email" id="flow-email" placeholder="admin@myapp.com" class="w-full rounded-lg px-3 py-2 text-sm" style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"></div>
            <button onclick="saveFlow()" class="w-full font-bold py-3 rounded-lg text-white" style="background: var(--accent);">Create Flow</button>
        </div>
        <div id="flows-list" class="mt-6 space-y-2 max-h-48 overflow-y-auto"></div>
    </div>`;
    
    loadFlows();
};

window.saveFlow = async function() {
    const table = document.getElementById('flow-table').value;
    const email = document.getElementById('flow-email').value;
    if (!table || !email) return showToast('Select a table and enter an email', 'error');

    try {
        await supabaseClient.from('project_flows').insert({
            project_id: state.currentUkmDataProjectId,
            name: `Email on new ${table}`,
            trigger_type: 'insert',
            trigger_table: table,
            actions: [{ type: 'email', to: email, subject: 'New record in ' + table }]
        });
        showToast('Flow created!');
        document.getElementById('flow-email').value = '';
        loadFlows();
    } catch (e) {
        showToast(e.message, 'error');
    }
};

window.loadFlows = async function() {
    const { data } = await supabaseClient.from('project_flows').select('*').eq('project_id', state.currentUkmDataProjectId);
    const list = document.getElementById('flows-list');
    if (!list) return;
    if (!data || data.length === 0) {
        list.innerHTML = '<p class="text-xs text-center" style="color: var(--text-muted);">No flows yet.</p>';
        return;
    }
    list.innerHTML = data.map(f => `
        <div class="p-3 rounded-lg flex items-center justify-between" style="background: var(--bg); border: 1px solid var(--border);">
            <div>
                <p class="text-xs font-bold" style="color: var(--text);">${escapeHtml(f.name)}</p>
                <p class="text-[10px] mono" style="color: var(--cyan);">→ ${escapeHtml(f.actions[0].to)}</p>
            </div>
            <button onclick="deleteFlow('${f.id}')" class="text-red-400 text-xs">Delete</button>
        </div>
    `).join('');
};

window.deleteFlow = async function(id) {
    await supabaseClient.from('project_flows').delete().eq('id', id);
    loadFlows();
};

// ---------------------------------------------------
// AUTOMATIC UI INJECTION (Day 4)
// ---------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    // 1. Inject "Forge App" button next to "New Project"
    const newProjBtn = document.querySelector('button[onclick="openProjectModal()"]');
    if (newProjBtn) {
        const forgeBtn = document.createElement('button');
        forgeBtn.className = 'text-xs font-bold py-2 px-4 rounded-lg transition-colors flex items-center gap-2 text-white ml-2';
        forgeBtn.style.background = 'var(--accent)';
        forgeBtn.innerHTML = '✨ Forge with AI';
        forgeBtn.onclick = openForgeModal;
        newProjBtn.parentElement.appendChild(forgeBtn);
    }

    // 2. Inject Mic Icon into Chat Input
    const chatSend = document.getElementById('chat-send');
    if (chatSend) {
        const micBtn = document.createElement('button');
        micBtn.id = 'ukm-voice-btn';
        micBtn.className = 'p-3 rounded-lg transition-colors text-white mb-1 mr-2';
        micBtn.style.background = 'var(--surface)';
        micBtn.style.border = '1px solid var(--border)';
        micBtn.style.color = 'var(--text-muted)';
        micBtn.innerHTML = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>';
        micBtn.onclick = startVoiceRecognition;
        chatSend.parentElement.insertBefore(micBtn, chatSend);
    }

    // 3. Inject "Codegen" button into UkmData Tables list
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.addedNodes.length) {
                document.querySelectorAll('#ukmdata-tables-list > div').forEach(card => {
                    if (!card.querySelector('.btn-codegen')) {
                        const tableName = card.querySelector('.mono').textContent;
                        const btnContainer = card.querySelector('.flex-wrap.items-center.gap-2');
                        if (btnContainer) {
                            const btn = document.createElement('button');
                            btn.className = 'btn-codegen text-[10px] font-bold px-2 py-1.5 rounded-lg';
                            btn.style.cssText = 'background: rgba(139,92,246,0.1); color: #8B5CF6; border: 1px solid rgba(139,92,246,0.3);';
                            btn.textContent = 'Codegen';
                            btn.onclick = () => openCodegenModal(tableName);
                            btnContainer.insertBefore(btn, btnContainer.querySelector('button[onclick^="showTableApi"]'));
                        }
                    }
                });
            }
        });
    });
    const listContainer = document.getElementById('ukmdata-tables-list');
    if (listContainer) observer.observe(listContainer, { childList: true, subtree: true });

    // 4. Inject "UkmFlow" into Sidebar
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        const navDiv = sidebar.querySelector('.p-4.space-y-1');
        if (navDiv) {
            const flowBtn = document.createElement('a');
            flowBtn.href = '#'; flowBtn.className = 'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors';
            flowBtn.style.color = 'var(--text-muted)';
            flowBtn.innerHTML = '<svg class="w-5 h-5 text-[#F59E0B]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg> UkmFlow';
            flowBtn.onclick = (e) => { e.preventDefault(); openFlowModal(); };
            
            const testBtn = document.querySelector('#sidebar a[onclick*="UkmTest"]');
            if (testBtn) navDiv.insertBefore(flowBtn, testBtn);
            else navDiv.appendChild(flowBtn);
        }
    }
});

// ============================================
// END OF DAY 4 ADDITIONS
// ============================================
// ============================================
// DAY 5 + PROJECT SETTINGS ADDITIONS
// ============================================

// ---------------------------------------------------
// 1. PROJECT SETTINGS HUB (Just like Supabase)
// ---------------------------------------------------
window.openProjectSettings = function(projectId) {
    const proj = state.projectsCache.find(p => p.id === projectId);
    if (!proj) return showToast('Project not found', 'error');
    
    let modal = document.getElementById('project-settings-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'project-settings-modal';
        modal.className = 'hidden fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm';
        document.body.appendChild(modal);
    }
    modal.classList.remove('hidden');

    const schema = proj.slug.replace(/-/g, '_');

    modal.innerHTML = `
    <div class="w-full max-w-2xl rounded-2xl p-6 glow max-h-[90vh] flex flex-col" style="background: var(--surface); border: 1px solid var(--border);">
        <div class="flex items-center justify-between mb-6">
            <div>
                <h2 class="text-lg font-bold" style="color: var(--text);">Project Settings</h2>
                <p class="text-xs mono mt-1" style="color: var(--cyan);">${escapeHtml(proj.name)}</p>
            </div>
            <button onclick="document.getElementById('project-settings-modal').classList.add('hidden')" style="color: var(--text-muted);">✕</button>
        </div>
        
        <div class="flex-1 overflow-y-auto space-y-4 pr-2">
            <!-- API Credentials -->
            <div class="rounded-xl p-4" style="background: var(--bg); border: 1px solid var(--border);">
                <h3 class="text-sm font-bold mb-3" style="color: var(--text);">API Credentials</h3>
                <div class="space-y-2 text-xs">
                    <div class="flex justify-between items-center"><span style="color: var(--text-muted);">Project URL</span><span class="mono truncate ml-4" style="color: var(--text);">${SUPABASE_URL}</span></div>
                    <div class="flex justify-between items-center"><span style="color: var(--text-muted);">Anon Key</span><span class="mono truncate ml-4" style="color: var(--text);">${SUPABASE_ANON_KEY}</span></div>
                    <div class="flex justify-between items-center"><span style="color: var(--text-muted);">Schema Name</span><span class="mono" style="color: var(--text);">${schema}</span></div>
                </div>
            </div>

            <!-- Quick Links -->
            <div class="grid grid-cols-2 gap-3">
                <button onclick="openSchemaDesigner('${projectId}'); document.getElementById('project-settings-modal').classList.add('hidden');" class="p-3 rounded-xl text-left" style="background: var(--bg); border: 1px solid var(--border);">
                    <p class="text-xs font-bold mb-1" style="color: var(--text);">Schema Designer</p>
                    <p class="text-[10px]" style="color: var(--text-muted);">View database relationships</p>
                </button>
                <button onclick="openAgentModal('${projectId}'); document.getElementById('project-settings-modal').classList.add('hidden');" class="p-3 rounded-xl text-left" style="background: var(--bg); border: 1px solid var(--border);">
                    <p class="text-xs font-bold mb-1" style="color: var(--text);">AI Agents</p>
                    <p class="text-[10px]" style="color: var(--text-muted);">Scheduled AI tasks</p>
                </button>
                <button onclick="openMobileSdkModal('${projectId}'); document.getElementById('project-settings-modal').classList.add('hidden');" class="p-3 rounded-xl text-left" style="background: var(--bg); border: 1px solid var(--border);">
                    <p class="text-xs font-bold mb-1" style="color: var(--text);">Mobile SDK</p>
                    <p class="text-[10px]" style="color: var(--text-muted);">Connect React Native / Flutter</p>
                </button>
                <button onclick="openHandoffModal('${projectId}'); document.getElementById('project-settings-modal').classList.add('hidden');" class="p-3 rounded-xl text-left" style="background: var(--bg); border: 1px solid var(--border);">
                    <p class="text-xs font-bold mb-1" style="color: var(--text);">Code Handoff</p>
                    <p class="text-[10px]" style="color: var(--text-muted);">Export to Next.js</p>
                </button>
            </div>

            <!-- Danger Zone -->
            <div class="rounded-xl p-4 mt-6" style="background: rgba(239,68,68,0.05); border: 1px solid rgba(239,68,68,0.2);">
                <h3 class="text-sm font-bold mb-2 text-red-400">Danger Zone</h3>
                <p class="text-xs mb-3" style="color: var(--text-muted);">Deleting this project will permanently remove all tables, users, and data.</p>
                <button onclick="deleteProject('${proj.id}'); document.getElementById('project-settings-modal').classList.add('hidden');" class="text-xs font-bold px-4 py-2 rounded-lg bg-red-500/20 text-red-400">Delete Project</button>
            </div>
        </div>
    </div>`;
};

// ---------------------------------------------------
// 2. UKMSCHEMA DESIGNER (Visual Relationships)
// ---------------------------------------------------
window.openSchemaDesigner = async function(projectId) {
    let modal = document.getElementById('ukmschema-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ukmschema-modal';
        modal.className = 'hidden fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm';
        document.body.appendChild(modal);
    }
    modal.classList.remove('hidden');
    
    modal.innerHTML = `
    <div class="w-full max-w-4xl rounded-2xl p-6 glow max-h-[90vh] flex flex-col" style="background: var(--surface); border: 1px solid var(--border);">
        <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-bold" style="color: var(--text);">Schema Designer</h2>
            <button onclick="document.getElementById('ukmschema-modal').classList.add('hidden')" style="color: var(--text-muted);">✕</button>
        </div>
        <div id="schema-designer-content" class="flex-1 overflow-auto p-4 rounded-xl" style="background: var(--bg); border: 1px solid var(--border);">
            <div class="text-center py-8"><div class="inline-block w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style="border-color: var(--accent);"></div></div>
        </div>
    </div>`;

    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        // Query information_schema to get columns
        const res = await fetch(SUPABASE_URL + '/functions/v1/ukmdata', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                action: 'execute_sql', 
                project_id: projectId,
                sql_query: `SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = (SELECT schema_name FROM project_schemas WHERE project_id = '${projectId}') ORDER BY table_name;`
            })
        });
        const data = await res.json();
        
        if (data.error) throw new Error(data.error);
        
        const tables = {};
        (data.data || []).forEach(row => {
            if (!tables[row.table_name]) tables[row.table_name] = [];
            tables[row.table_name].push(row.column_name);
        });

        const content = document.getElementById('schema-designer-content');
        if (Object.keys(tables).length === 0) {
            content.innerHTML = '<p class="text-sm text-center" style="color: var(--text-muted);">No tables created yet.</p>';
            return;
        }

        content.innerHTML = `<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            ${Object.entries(tables).map(([tName, cols]) => `
                <div class="rounded-lg p-3" style="background: var(--surface); border: 1px solid var(--border);">
                    <h3 class="font-bold text-xs mb-2 mono" style="color: var(--cyan);">${escapeHtml(tName)}</h3>
                    <ul class="space-y-1">
                        ${cols.map(c => `<li class="text-[10px] mono" style="color: var(--text-muted);">${c === 'id' || c === 'created_at' ? '🔑 ' : '• '}${escapeHtml(c)}</li>`).join('')}
                    </ul>
                </div>
            `).join('')}
        </div>`;
    } catch (e) {
        document.getElementById('schema-designer-content').innerHTML = `<p class="text-sm text-center" style="color: var(--red);">${escapeHtml(e.message)}</p>`;
    }
};

// ---------------------------------------------------
// 3. UKMAGENTS (Scheduled AI)
// ---------------------------------------------------
window.openAgentModal = function(projectId) {
    let modal = document.getElementById('ukmagent-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ukmagent-modal';
        modal.className = 'hidden fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm';
        document.body.appendChild(modal);
    }
    modal.classList.remove('hidden');
    
    modal.innerHTML = `
    <div class="w-full max-w-lg rounded-2xl p-6 glow" style="background: var(--surface); border: 1px solid var(--border);">
        <div class="flex items-center justify-between mb-4">
            <div><h2 class="text-lg font-bold" style="color: var(--text);">UkmAgents</h2><p class="text-xs mt-1" style="color: var(--text-muted);">Run AI on a schedule.</p></div>
            <button onclick="document.getElementById('ukmagent-modal').classList.add('hidden')" style="color: var(--text-muted);">✕</button>
        </div>
        <div class="space-y-4">
            <div><label class="block text-xs mb-1" style="color: var(--text-muted);">Schedule (Cron)</label><input type="text" id="agent-cron" value="0 8 * * *" class="w-full rounded-lg px-3 py-2 text-sm mono" style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"><p class="text-[10px] mt-1" style="color: var(--text-dim);">Every day at 8:00 AM</p></div>
            <div><label class="block text-xs mb-1" style="color: var(--text-muted);">AI Prompt</label><textarea id="agent-prompt" rows="3" placeholder="Summarize today's new orders and send to admin..." class="w-full rounded-lg px-3 py-2 text-sm" style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"></textarea></div>
            <button onclick="createAgent('${projectId}')" class="w-full font-bold py-3 rounded-lg text-white" style="background: var(--accent);">Create Agent</button>
        </div>
    </div>`;
};

window.createAgent = async function(projectId) {
    const cron = document.getElementById('agent-cron').value;
    const prompt = document.getElementById('agent-prompt').value;
    if (!cron || !prompt) return showToast('Fill all fields', 'error');

    try {
        await supabaseClient.from('project_crons').insert({
            project_id: projectId,
            schedule: cron,
            sql_query: 'SELECT 1', // Dummy SQL required by table schema
            cron_type: 'agent',
            ai_prompt: prompt,
            ai_channel: 'email',
            ai_recipient: state.currentUser.email
        });
        showToast('Agent scheduled!');
        document.getElementById('ukmagent-modal').classList.add('hidden');
    } catch(e) {
        showToast(e.message, 'error');
    }
};

// ---------------------------------------------------
// 4. UKMHANDOFF (Export to Next.js)
// ---------------------------------------------------
window.openHandoffModal = function(projectId) {
    const proj = state.projectsCache.find(p => p.id === projectId);
    if (!proj) return;
    const schema = proj.slug.replace(/-/g, '_');

    let modal = document.getElementById('ukmhandoff-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ukmhandoff-modal';
        modal.className = 'hidden fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm';
        document.body.appendChild(modal);
    }
    modal.classList.remove('hidden');

    modal.innerHTML = `
    <div class="w-full max-w-3xl rounded-2xl p-6 glow max-h-[90vh] flex flex-col" style="background: var(--surface); border: 1px solid var(--border);">
        <div class="flex items-center justify-between mb-4">
            <div><h2 class="text-lg font-bold" style="color: var(--text);">Next.js Handoff</h2><p class="text-xs mt-1" style="color: var(--text-muted);">Copy this code to start your local frontend.</p></div>
            <button onclick="document.getElementById('ukmhandoff-modal').classList.add('hidden')" style="color: var(--text-muted);">✕</button>
        </div>
        <div class="flex-1 overflow-auto rounded-lg p-4" style="background: var(--bg); border: 1px solid var(--border);">
            <p class="text-xs font-bold mb-2" style="color: var(--text);">1. Install dependencies:</p>
            <pre class="p-3 rounded text-[11px] mono mb-4 overflow-x-auto" style="background: var(--surface); color: var(--cyan);">npm install @supabase/supabase-js</pre>
            
            <p class="text-xs font-bold mb-2" style="color: var(--text);">2. Create \`lib/supabase.ts\`:</p>
            <pre class="p-3 rounded text-[11px] mono mb-4 overflow-x-auto" style="background: var(--surface); color: var(--text-muted);">import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  '${SUPABASE_URL}',
  '${SUPABASE_ANON_KEY}'
)</pre>

            <p class="text-xs font-bold mb-2" style="color: var(--text);">3. Fetch data in \`app/page.tsx\`:</p>
            <pre class="p-3 rounded text-[11px] mono overflow-x-auto" style="background: var(--surface); color: var(--text-muted);">import { supabase } from '@/lib/supabase'

export default async function Home() {
  const { data } = await supabase
    .schema('${schema}')
    .from('your_table_here')
    .select('*')

  return (
    &lt;pre&gt;{JSON.stringify(data, null, 2)}&lt;/pre&gt;
  )
}</pre>
        </div>
    </div>`;
};

// ---------------------------------------------------
// 5. UKMMOBILE SDK
// ---------------------------------------------------
window.openMobileSdkModal = function(projectId) {
    const proj = state.projectsCache.find(p => p.id === projectId);
    if (!proj) return;
    const schema = proj.slug.replace(/-/g, '_');

    let modal = document.getElementById('ukmmobile-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ukmmobile-modal';
        modal.className = 'hidden fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm';
        document.body.appendChild(modal);
    }
    modal.classList.remove('hidden');

    modal.innerHTML = `
    <div class="w-full max-w-2xl rounded-2xl p-6 glow max-h-[90vh] flex flex-col" style="background: var(--surface); border: 1px solid var(--border);">
        <div class="flex items-center justify-between mb-4">
            <div><h2 class="text-lg font-bold" style="color: var(--text);">Mobile SDK</h2><p class="text-xs mt-1" style="color: var(--text-muted);">Connect your mobile app directly.</p></div>
            <button onclick="document.getElementById('ukmmobile-modal').classList.add('hidden')" style="color: var(--text-muted);">✕</button>
        </div>
        <div class="flex gap-2 mb-4">
            <button onclick="document.getElementById('mobile-sdk-content').innerText = mobileSdkReactNative('${schema}')" class="flex-1 text-xs font-bold py-2 rounded-lg text-white" style="background: var(--cyan);">React Native</button>
            <button onclick="document.getElementById('mobile-sdk-content').innerText = mobileSdkPython('${schema}')" class="flex-1 text-xs font-bold py-2 rounded-lg text-white" style="background: var(--accent);">Python</button>
        </div>
        <div class="flex-1 overflow-auto rounded-lg p-4" style="background: var(--bg); border: 1px solid var(--border);">
            <pre id="mobile-sdk-content" class="text-xs mono" style="color: var(--text-muted);">Select a platform above...</pre>
        </div>
    </div>`;
};

function mobileSdkReactNative(schema) {
    return `// npm install @supabase/supabase-js
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  '${SUPABASE_URL}',
  '${SUPABASE_ANON_KEY}'
)

// Fetch data
const { data, error } = await supabase
  .schema('${schema}')
  .from('your_table')
  .select('*')

// Realtime
supabase.channel('custom')
  .on('postgres_changes', 
    { event: '*', schema: '${schema}', table: 'your_table' }, 
    (payload) => console.log(payload)
  ).subscribe()`;
}

function mobileSdkPython(schema) {
    return `# pip install supabase
from supabase import create_client, Client

url = "${SUPABASE_URL}"
key = "${SUPABASE_ANON_KEY}"
supabase: Client = create_client(url, key)

# Fetch data
response = supabase.schema("${schema}").table("your_table").select("*").execute()
print(response.data)`;
}

// ---------------------------------------------------
// AUTOMATIC UI INJECTION (Day 5)
// ---------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    // Inject a Settings gear into the Project Detail modal
    const observer = new MutationObserver(() => {
        const pdBody = document.getElementById('pd-body');
        if (pdBody && state.viewingProjectId && !pdBody.querySelector('.btn-project-settings')) {
            const settingsBtn = document.createElement('button');
            settingsBtn.className = 'btn-project-settings w-full mt-2 font-bold py-3 rounded-lg text-white';
            settingsBtn.style.background = 'var(--surface-2)';
            settingsBtn.style.border = '1px solid var(--border)';
            settingsBtn.innerHTML = '⚙️ Project Settings';
            settingsBtn.onclick = () => openProjectSettings(state.viewingProjectId);
            
            // Insert before the danger zone buttons
            const dangerZone = pdBody.querySelector('.space-y-2');
            if (dangerZone) dangerZone.insertBefore(settingsBtn, dangerZone.firstChild);
        }
    });
    const pdModal = document.getElementById('project-detail-modal');
    if (pdModal) observer.observe(pdModal, { childList: true, subtree: true });
});

// ============================================
// END OF DAY 5 ADDITIONS
// ============================================
// Override Forge for better error handling
window.executeForge = async function() {
    const prompt = document.getElementById('forge-prompt').value.trim();
    if (!prompt) return showToast('Describe your app first', 'error');
    
    const btn = document.getElementById('forge-submit-btn');
    const prog = document.getElementById('forge-progress');
    btn.textContent = 'Forging...'; btn.disabled = true;
    prog.classList.remove('hidden');
    prog.innerHTML = '<p>🧠 AI is designing your schema...</p>';

    try {
        const aiPrompt = `Create a database schema for this app: "${prompt}". 
        Return ONLY a JSON object. No markdown. 
        Format: { "project_name": "Name", "tables": [ { "name": "table_name", "columns": [ {"name": "col1", "type": "text"}, {"name": "col2", "type": "number"} ] } ] }`;
        
        const aiData = await aiCall({ prompt: aiPrompt, mode: 'default' });
        console.log("RAW AI OUTPUT:", aiData.content);
        
        const schemaJson = aiExtractJSON(aiData.content || '');
        
        // If AI just chatted back instead of giving JSON
        if (!schemaJson || !schemaJson.tables) {
            throw new Error("The AI didn't understand. Please describe your app in more detail (e.g., 'A shop for shoes with products and orders').");
        }
        
        prog.innerHTML += '<p>✅ Schema designed!</p><p>🏗️ Creating project...</p>';

        const projName = schemaJson.project_name || 'Forged App';
        const slug = projName.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Math.floor(Math.random()*1000);
        
        const { data: newProj, error: projErr } = await supabaseClient.from('projects').insert({
            owner_id: state.currentUser.id, name: projName, slug: slug, description: prompt
        }).select().single();
        
        if (projErr) throw projErr;
        prog.innerHTML += '<p>✅ Project created!</p><p>⚙️ Setting up database...</p>';

        const { data: { session } } = await supabaseClient.auth.getSession();
        const headers = { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' };
        
        await fetch(SUPABASE_URL + '/functions/v1/ukmdata', {
            method: 'POST', headers,
            body: JSON.stringify({ action: 'enable', project_id: newProj.id })
        });

        for (const t of schemaJson.tables) {
            await fetch(SUPABASE_URL + '/functions/v1/ukmdata', {
                method: 'POST', headers,
                body: JSON.stringify({ action: 'create_table', project_id: newProj.id, table: t })
            });
            prog.innerHTML += `<p>✅ Table <b>${escapeHtml(t.name)}</b> created!</p>`;
        }

        prog.innerHTML += '<p style="color: var(--green); font-weight: bold; margin-top: 10px;">🚀 App forged successfully!</p>';
        
        setTimeout(async () => {
            document.getElementById('ukmforge-modal').classList.add('hidden');
            await loadProjects();
            state.currentUkmDataProjectId = newProj.id;
            switchView('ukmdata');
            showToast('App forged successfully!');
        }, 2000);

    } catch (e) {
        prog.innerHTML += `<p style="color: var(--red); font-size: 11px;">❌ Error: ${escapeHtml(e.message)}</p>`;
        btn.textContent = 'Try Again'; btn.disabled = false;
    }
};
// Override Voice with better permission handling
window.startVoiceRecognition = function() {
    if (!window.isSecureContext) {
        return showToast('Voice requires HTTPS. Current connection is insecure.', 'error');
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        return showToast('Voice recognition is not supported in this browser.', 'error');
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    const micBtn = document.getElementById('ukm-voice-btn');
    
    showToast('Requesting microphone access...');
    
    recognition.onstart = () => {
        if (micBtn) micBtn.style.color = 'var(--red)';
        showToast('Listening... Speak now.');
    };

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        const input = document.getElementById('chat-input');
        if (input) {
            input.value += (input.value ? ' ' : '') + transcript;
            handleChatKeydown({ key: 'Enter', shiftKey: false, preventDefault: () => {} }); 
        }
        if (micBtn) micBtn.style.color = 'var(--text-muted)';
    };

    recognition.onspeechend = () => { recognition.stop(); if (micBtn) micBtn.style.color = 'var(--text-muted)'; };
    
    recognition.onerror = (e) => { 
        if (micBtn) micBtn.style.color = 'var(--text-muted)'; 
        if (e.error === 'not-allowed') {
            showToast('Permission denied. Tap the lock icon in your URL bar and allow Microphone.', 'error', 5000);
        } else {
            showToast('Voice error: ' + e.error, 'error'); 
        }
    };

    try {
        recognition.start();
    } catch (e) {
        showToast('Could not start mic: ' + e.message, 'error');
    }
};
// ============================================
// PHASE 2: CLOUD BACKUPS & SDK GENERATOR
// ============================================

// ---------------------------------------------------
// 1. TRUE CLOUD BACKUPS (Upload to Storage)
// ---------------------------------------------------
window.createBackup = async function() {
    const sel = document.getElementById('backup-project-select');
    if (!sel) return showToast('Error: Selector not found.', 'error');
    
    const pid = sel.value;
    if (!pid) return showToast('Please select a project from the list.', 'error');
    
    const btn = document.getElementById('btn-create-backup');
    btn.textContent = 'Snapshotting...'; btn.disabled = true;
    
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        
        // 1. Export data
        const res = await fetch(SUPABASE_URL + '/functions/v1/ukmdata', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'export_project', project_id: pid })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        const jsonStr = JSON.stringify(data.export_data, null, 2);
        const fileName = `${session.user.id}/${pid}_${Date.now()}.json`;

        // 2. Upload to Supabase Storage
        const { error: storageErr } = await supabaseClient.storage
            .from('backups')
            .upload(fileName, jsonStr, { contentType: 'application/json' });
            
        if (storageErr) throw storageErr;

        // 3. Log the backup record in the database
        const { error: dbErr } = await supabaseClient.from('project_backups').insert({
            project_id: pid,
            kind: 'manual',
            status: 'ready',
            row_count: data.export_data && data.export_data.tables ? data.export_data.tables.length : 0,
            storage_path: fileName, // Save the cloud path!
            size_bytes: new Blob([jsonStr]).size
        });
        
        if (dbErr) throw dbErr;

        showToast('Cloud backup successful!');
        loadBackupsList(pid);
        
    } catch (e) {
        showToast(e.message, 'error');
    } finally {
        if(btn) { btn.textContent = '+ Take Snapshot'; btn.disabled = false; }
    }
};

window.loadBackupsList = async function(projectId) {
    if (!projectId) return;
    const { data } = await supabaseClient.from('project_backups').select('*').eq('project_id', projectId).order('created_at', { ascending: false });
    const list = document.getElementById('backups-list');
    if (!list) return;
    
    if (!data || data.length === 0) {
        list.innerHTML = '<p class="text-xs text-center py-4" style="color: var(--text-muted);">No backups yet for this project.</p>';
        return;
    }
    list.innerHTML = data.map(b => `
        <div class="p-3 rounded-lg flex items-center justify-between" style="background: var(--bg); border: 1px solid var(--border);">
            <div>
                <p class="text-xs font-bold" style="color: var(--text);">${new Date(b.created_at).toLocaleString()}</p>
                <p class="text-[10px] mono" style="color: var(--text-dim);">${b.kind} · ${b.row_count || 0} tables · ${formatBytes(b.size_bytes || 0)}</p>
            </div>
            <div class="flex gap-2">
                <button onclick="restoreBackup('${b.id}', '${b.storage_path}')" class="text-[10px] text-green-400 font-bold">Restore</button>
                <button onclick="downloadCloudBackup('${b.storage_path}')" class="text-[10px] text-cyan-400 font-bold">Download</button>
            </div>
        </div>
    `).join('');
};

window.downloadCloudBackup = async function(path) {
    if (!path) return showToast('No path found', 'error');
    const { data, error } = await supabaseClient.storage.from('backups').download(path);
    if (error) return showToast(error.message, 'error');
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(data);
    link.download = path.split('/').pop();
    link.click();
};

window.restoreBackup = async function(id, path) {
    if (!confirm('Are you sure you want to restore this backup? This will overwrite current tables.')) return;
    showToast('Restoring backup...');
    try {
        const { data: fileData, error: downloadErr } = await supabaseClient.storage.from('backups').download(path);
        if (downloadErr) throw downloadErr;
        
        const jsonText = await fileData.text();
        const importData = JSON.parse(jsonText);

        const { data: { session } } = await supabaseClient.auth.getSession();
        const res = await fetch(SUPABASE_URL + '/functions/v1/ukmdata', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'import_project', project_id: state.currentUkmDataProjectId, import_data: importData })
        });
        const result = await res.json();
        if (result.error) throw new Error(result.error);
        
        showToast('Backup restored successfully!');
        loadUkmDataTables();
    } catch (e) {
        showToast(e.message, 'error');
    }
};

// ---------------------------------------------------
// 2. SDK GENERATOR (Show users exactly how to connect UkmSync)
// ---------------------------------------------------
window.openMobileSdkModal = function(projectId) {
    const proj = state.projectsCache.find(p => p.id === projectId);
    if (!proj) return;
    const schema = proj.slug.replace(/-/g, '_');

    let modal = document.getElementById('ukmmobile-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ukmmobile-modal';
        modal.className = 'hidden fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm';
        document.body.appendChild(modal);
    }
    modal.classList.remove('hidden');

    modal.innerHTML = `
    <div class="w-full max-w-2xl rounded-2xl p-6 glow max-h-[90vh] flex flex-col" style="background: var(--surface); border: 1px solid var(--border);">
        <div class="flex items-center justify-between mb-4">
            <div><h2 class="text-lg font-bold" style="color: var(--text);">Connect your App</h2><p class="text-xs mt-1" style="color: var(--text-muted);">Drop this into your project to enable offline-first sync.</p></div>
            <button onclick="document.getElementById('ukmmobile-modal').classList.add('hidden')" style="color: var(--text-muted);">✕</button>
        </div>
        
        <p class="text-xs mb-2" style="color: var(--text-muted);">Paste this snippet into your HTML <span class="mono">&lt;head&gt;</span> tag:</p>
        <div class="flex-1 overflow-auto rounded-lg p-4 mb-4" style="background: var(--bg); border: 1px solid var(--border);">
            <pre id="sdk-snippet" class="text-xs mono" style="color: var(--cyan);">&lt;script 
  src="https://your-github-pages-url.github.io/ukmsync.js"
  data-ukm-project="${proj.slug}"
  data-ukm-backend-url="https://ukmsync-server.onrender.com"
  data-ukm-supabase-url="${SUPABASE_URL}"
  data-ukm-anon-key="${SUPABASE_ANON_KEY}"
  data-ukm-enabled="true"
  data-ukm-strategy="last-write-wins"
  data-ukm-poll-ms="5000"
  defer
&gt;&lt;/script&gt;</pre>
        </div>
        <button onclick="copyToClipboardText(document.getElementById('sdk-snippet').innerText)" class="w-full font-bold py-3 rounded-lg text-white" style="background: var(--accent);">Copy SDK Snippet</button>
    </div>`;
};
// ============================================
// PHASE 3: SUPABASE-STYLE UI OVERHAUL
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    // 1. Hide the original flat list
    const originalNav = sidebar.querySelector('.p-4.space-y-1');
    if (originalNav) originalNav.style.display = 'none';

    // 2. Build the new grouped navigation
    const newNav = document.createElement('div');
    newNav.className = 'p-3 space-y-1 overflow-y-auto h-[calc(100vh-60px)]';
    
    // Helper for SVG icons
    const icons = {
        project: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg>',
        ai: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>',
        db: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"></path></svg>',
        money: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>',
        sync: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>',
        settings: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>',
        arrow: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>'
    };

    // Helper to build links
    const item = (label, icon, onClick, id = '') => `
        <a href="#" class="nav-item" ${id ? `id="${id}"` : ''} onclick="event.preventDefault(); ${onClick}">
            ${icons[icon] || ''} <span>${label}</span>
        </a>
    `;

    newNav.innerHTML = `
        <!-- Project Group -->
        <details class="nav-group" open>
            <summary>Project ${icons.arrow}</summary>
            <div class="nav-group-items">
                ${item('Overview', 'project', "switchView('overview')", 'nav-overview')}
                ${item('UkmAI Copilot', 'ai', "switchView('ukmai')", 'nav-ukmai')}
                ${item('UkmFlow', 'ai', "openFlowModal()")}
            </div>
        </details>

        <!-- Database Group -->
        <details class="nav-group" open>
            <summary>Database ${icons.arrow}</summary>
            <div class="nav-group-items">
                ${item('Ukmbase Data', 'db', "switchView('ukmdata')", 'nav-ukmdata')}
                ${item('UkmTables', 'db', "switchView('ukmtables')", 'nav-ukmtables')}
                ${item('UkmQuery', 'db', "switchView('ukmquery')", 'nav-ukmquery')}
                ${item('UkmSearch', 'db', "openSearchModal()")}
                ${item('UkmBackups', 'db', "openBackupModal()")}
                ${item('UkmAudit', 'db', "openAuditModal()")}
                ${item('UkmTemplates', 'db', "openTemplatesModal()")}
            </div>
        </details>

        <!-- Products & Integrations -->
        <details class="nav-group" open>
            <summary>Products ${icons.arrow}</summary>
            <div class="nav-group-items">
                ${item('UkmPay', 'money', "switchView('ukmpay')", 'nav-ukmpay')}
                ${item('UkmSync', 'sync', "switchView('ukmsync')", 'nav-ukmsync')}
                ${item('Connect App', 'sync', "switchView('connect')", 'nav-connect')}
                ${item('UkmTest', 'settings', "openUkmTest()")}
            </div>
        </details>

        <!-- Settings Group -->
        <details class="nav-group" open>
            <summary>Settings ${icons.arrow}</summary>
            <div class="nav-group-items">
                ${item('Team', 'settings', "switchView('team')", 'nav-team')}
                ${item('Billing', 'settings', "switchView('billing')", 'nav-billing')}
                ${item('Settings', 'settings', "switchView('settings')", 'nav-settings')}
            </div>
        </details>

        <!-- Owner Console (Hidden by default) -->
        <div id="nav-owner-wrap" class="hidden pt-3 mt-3" style="border-top: 1px solid var(--border);">
            ${item('Owner Console', 'project', "switchView('owner')", 'nav-owner')}
        </div>
    `;

    sidebar.appendChild(newNav);

    // Sync the active state
    const originalSwitchView = window.switchView;
    window.switchView = function(view) {
        if (originalSwitchView) originalSwitchView(view);
        // Remove active from all new nav items
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        // Add active to clicked
        const activeItem = document.getElementById('nav-' + view);
        if (activeItem) activeItem.classList.add('active');
        
        // Close sidebar on mobile
        sidebar.classList.add('-translate-x-full');
    };

    // Auto-open Overview
    const overviewBtn = document.getElementById('nav-overview');
    if (overviewBtn) overviewBtn.classList.add('active');
});
// ============================================
// PHASE 4: UKMMARKET & API KEYS
// ============================================

// ---------------------------------------------------
// 1. UKMMARKET (Template Storefront)
// ---------------------------------------------------
window.loadMarketplace = async function() {
    // Hide other views, show a new one
    document.querySelectorAll('[id^="view-"]').forEach(el => el.classList.add('hidden'));
    let marketView = document.getElementById('view-market');
    if (!marketView) {
        marketView = document.createElement('div');
        marketView.id = 'view-market';
        marketView.className = 'flex-1 overflow-y-auto p-4 md:p-8';
        document.getElementById('dashboard-view').querySelector('main').appendChild(marketView);
    }
    marketView.classList.remove('hidden');
    marketView.innerHTML = `
        <div class="max-w-6xl mx-auto">
            <div class="mb-8">
                <h1 class="text-2xl font-bold mb-1" style="color: var(--text);">UkmMarket</h1>
                <p class="text-sm" style="color: var(--text-muted);">Buy and sell production-ready database schemas.</p>
            </div>
            <div id="market-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div class="text-center py-12 col-span-full"><div class="inline-block w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style="border-color: var(--accent);"></div></div>
            </div>
        </div>
    `;

    // Fetch templates
    const { data: templates } = await supabaseClient.from('project_templates').select('*').order('price_usd', { ascending: false });
    const grid = document.getElementById('market-grid');
    
    if (!templates || templates.length === 0) {
        grid.innerHTML = '<p class="text-center text-sm col-span-full" style="color: var(--text-muted);">No templates available yet.</p>';
        return;
    }

    grid.innerHTML = templates.map(t => `
        <div class="feature-card rounded-xl p-5 flex flex-col" style="background: var(--surface); border: 1px solid var(--border);">
            <div class="flex items-start justify-between mb-4">
                <div class="text-4xl">${t.icon || '📦'}</div>
                ${t.price_usd > 0 
                    ? `<span class="font-bold text-lg mono" style="color: var(--green);">$${Number(t.price_usd).toFixed(2)}</span>`
                    : `<span class="font-bold text-lg mono" style="color: var(--cyan);">FREE</span>`
                }
            </div>
            <h3 class="text-lg font-bold mb-1" style="color: var(--text);">${escapeHtml(t.name)}</h3>
            <p class="text-xs mb-3" style="color: var(--text-muted);">${escapeHtml(t.tagline)}</p>
            <p class="text-sm flex-1 mb-4" style="color: var(--text-dim);">${escapeHtml(t.description || '')}</p>
            
            <div class="flex gap-2 mt-auto">
                ${t.price_usd > 0 ? `
                    <button onclick="buyTemplate('${t.id}', '${t.name}', ${t.price_usd})" class="w-full font-bold py-2 rounded-lg text-white text-sm" style="background: var(--accent);">Buy & Clone</button>
                ` : `
                    <button onclick="cloneTemplate('${t.id}')" class="w-full font-bold py-2 rounded-lg text-white text-sm" style="background: var(--green);">Clone Free</button>
                `}
            </div>
        </div>
    `).join('');
};

window.buyTemplate = async function(templateId, name, price) {
    // Since you don't have a bank account yet, we simulate the checkout via WhatsApp/Email
    // and manually approve the purchase.
    const msg = `Hi! I want to buy the ${name} template for $${price}. My account email is ${state.currentUser.email}.`;
    const waLink = `https://wa.me/${SUPPORT_WA_INTL}?text=${encodeURIComponent(msg)}`;
    
    if(confirm(`You will be redirected to WhatsApp to complete the payment of $${price}.\n\nOnce paid, Ukmbase support will unlock this template for you.`)) {
        window.open(waLink, '_blank');
        
        // Log the intent to buy
        await supabaseClient.from('template_purchases').insert({
            buyer_id: state.currentUser.id,
            template_id: templateId,
            amount_paid: price,
            status: 'pending_payment'
        });
        showToast('Request sent! Check WhatsApp.', 'success', 5000);
    }
};

// ---------------------------------------------------
// 2. PROJECT API KEYS (For UkmTest & Integrations)
// ---------------------------------------------------
window.openProjectSettings = function(projectId) {
    const proj = state.projectsCache.find(p => p.id === projectId);
    if (!proj) return showToast('Project not found', 'error');
    
    let modal = document.getElementById('project-settings-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'project-settings-modal';
        modal.className = 'hidden fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm';
        document.body.appendChild(modal);
    }
    modal.classList.remove('hidden');

    const schema = proj.slug.replace(/-/g, '_');

    modal.innerHTML = `
    <div class="w-full max-w-2xl rounded-2xl p-6 glow max-h-[90vh] flex flex-col" style="background: var(--surface); border: 1px solid var(--border);">
        <div class="flex items-center justify-between mb-6">
            <div>
                <h2 class="text-lg font-bold" style="color: var(--text);">Project Settings</h2>
                <p class="text-xs mono mt-1" style="color: var(--cyan);">${escapeHtml(proj.name)}</p>
            </div>
            <button onclick="document.getElementById('project-settings-modal').classList.add('hidden')" style="color: var(--text-muted);">✕</button>
        </div>
        
        <div class="flex-1 overflow-y-auto space-y-6 pr-2">
            <!-- API Credentials -->
            <div class="rounded-xl p-4" style="background: var(--bg); border: 1px solid var(--border);">
                <h3 class="text-sm font-bold mb-3" style="color: var(--text);">API Credentials</h3>
                <div class="space-y-2 text-xs">
                    <div class="flex justify-between items-center"><span style="color: var(--text-muted);">Project URL</span><span class="mono truncate ml-4" style="color: var(--text);">${SUPABASE_URL}</span></div>
                    <div class="flex justify-between items-center"><span style="color: var(--text-muted);">Anon Key</span><span class="mono truncate ml-4" style="color: var(--text);">${SUPABASE_ANON_KEY}</span></div>
                    <div class="flex justify-between items-center"><span style="color: var(--text-muted);">Schema Name</span><span class="mono" style="color: var(--text);">${schema}</span></div>
                </div>
            </div>

            <!-- Quick Links -->
            <div>
                <h3 class="text-sm font-bold mb-3" style="color: var(--text);">Project Tools</h3>
                <div class="grid grid-cols-2 gap-3">
                    <button onclick="openSchemaDesigner('${projectId}'); document.getElementById('project-settings-modal').classList.add('hidden');" class="p-3 rounded-xl text-left" style="background: var(--bg); border: 1px solid var(--border);">
                        <p class="text-xs font-bold mb-1" style="color: var(--text);">Schema Designer</p>
                        <p class="text-[10px]" style="color: var(--text-muted);">View database relationships</p>
                    </button>
                    <button onclick="openAgentModal('${projectId}'); document.getElementById('project-settings-modal').classList.add('hidden');" class="p-3 rounded-xl text-left" style="background: var(--bg); border: 1px solid var(--border);">
                        <p class="text-xs font-bold mb-1" style="color: var(--text);">AI Agents</p>
                        <p class="text-[10px]" style="color: var(--text-muted);">Scheduled AI tasks</p>
                    </button>
                    <button onclick="openMobileSdkModal('${projectId}'); document.getElementById('project-settings-modal').classList.add('hidden');" class="p-3 rounded-xl text-left" style="background: var(--bg); border: 1px solid var(--border);">
                        <p class="text-xs font-bold mb-1" style="color: var(--text);">Mobile SDK</p>
                        <p class="text-[10px]" style="color: var(--text-muted);">Connect React Native / Flutter</p>
                    </button>
                    <button onclick="openHandoffModal('${projectId}'); document.getElementById('project-settings-modal').classList.add('hidden');" class="p-3 rounded-xl text-left" style="background: var(--bg); border: 1px solid var(--border);">
                        <p class="text-xs font-bold mb-1" style="color: var(--text);">Code Handoff</p>
                        <p class="text-[10px]" style="color: var(--text-muted);">Export to Next.js</p>
                    </button>
                </div>
            </div>

            <!-- Danger Zone -->
            <div class="rounded-xl p-4 mt-6" style="background: rgba(239,68,68,0.05); border: 1px solid rgba(239,68,68,0.2);">
                <h3 class="text-sm font-bold mb-2 text-red-400">Danger Zone</h3>
                <p class="text-xs mb-3" style="color: var(--text-muted);">Deleting this project will permanently remove all tables, users, and data.</p>
                <button onclick="deleteProject('${proj.id}'); document.getElementById('project-settings-modal').classList.add('hidden');" class="text-xs font-bold px-4 py-2 rounded-lg bg-red-500/20 text-red-400">Delete Project</button>
            </div>
        </div>
    </div>`;
};

// ---------------------------------------------------
// 3. INJECT MARKETPLACE INTO NEW SIDEBAR
// ---------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    // Since we completely rebuilt the sidebar in Phase 3, we need to inject UkmMarket into it.
    // We look for the 'Products' details group and add a link.
    setTimeout(() => {
        const navGroups = document.querySelectorAll('.nav-group');
        let productsGroup = null;
        
        navGroups.forEach(g => {
            if (g.querySelector('summary').textContent.includes('Products')) productsGroup = g;
        });

        if (productsGroup) {
            const itemsDiv = productsGroup.querySelector('.nav-group-items');
            const marketLink = document.createElement('a');
            marketLink.href = '#';
            marketLink.className = 'nav-item';
            marketLink.innerHTML = `
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path></svg>
                <span>UkmMarket</span>
            `;
            marketLink.onclick = (e) => {
                e.preventDefault();
                loadMarketplace();
                document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
                marketLink.classList.add('active');
            };
            itemsDiv.appendChild(marketLink);
        }
    }, 500); // Small delay to ensure Phase 3 sidebar is built
});
// ============================================
// PHASE 5: API KEYS, METERING & PUSH NOTIFICATIONS
// ============================================

// ---------------------------------------------------
// 1. PROJECT API KEYS & METERING (Overrides Settings Modal)
// ---------------------------------------------------
window.openProjectSettings = async function(projectId) {
    const proj = state.projectsCache.find(p => p.id === projectId);
    if (!proj) return showToast('Project not found', 'error');
    
    let modal = document.getElementById('project-settings-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'project-settings-modal';
        modal.className = 'hidden fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm';
        document.body.appendChild(modal);
    }
    modal.classList.remove('hidden');

    const schema = proj.slug.replace(/-/g, '_');

    modal.innerHTML = `
    <div class="w-full max-w-2xl rounded-2xl p-6 glow max-h-[90vh] flex flex-col" style="background: var(--surface); border: 1px solid var(--border);">
        <div class="flex items-center justify-between mb-6">
            <div>
                <h2 class="text-lg font-bold" style="color: var(--text);">Project Settings</h2>
                <p class="text-xs mono mt-1" style="color: var(--cyan);">${escapeHtml(proj.name)}</p>
            </div>
            <button onclick="document.getElementById('project-settings-modal').classList.add('hidden')" style="color: var(--text-muted);">✕</button>
        </div>
        
        <div class="flex-1 overflow-y-auto space-y-6 pr-2">
            
            <!-- Usage Metering -->
            <div class="rounded-xl p-4" style="background: var(--bg); border: 1px solid var(--border);">
                <h3 class="text-sm font-bold mb-3" style="color: var(--text);">Usage Metering</h3>
                <div class="space-y-3">
                    <div>
                        <div class="flex justify-between text-xs mb-1"><span style="color: var(--text-muted);">API Calls</span><span class="mono" style="color: var(--text);">${(proj.api_calls_used || 0).toLocaleString()} / 100k</span></div>
                        <div class="w-full rounded-full h-1.5" style="background: var(--surface);"><div class="h-1.5 rounded-full" style="width: ${Math.min(100, ((proj.api_calls_used || 0) / 100000) * 100)}%; background: var(--accent);"></div></div>
                    </div>
                    <div>
                        <div class="flex justify-between text-xs mb-1"><span style="color: var(--text-muted);">Storage</span><span class="mono" style="color: var(--text);">${formatBytes(proj.storage_bytes_used || 0)} / 500 MB</span></div>
                        <div class="w-full rounded-full h-1.5" style="background: var(--surface);"><div class="h-1.5 rounded-full" style="width: ${Math.min(100, ((proj.storage_bytes_used || 0) / (500*1024*1024)) * 100)}%; background: var(--cyan);"></div></div>
                    </div>
                </div>
            </div>

            <!-- API Credentials -->
            <div class="rounded-xl p-4" style="background: var(--bg); border: 1px solid var(--border);">
                <h3 class="text-sm font-bold mb-3" style="color: var(--text);">API Credentials</h3>
                <div class="space-y-2 text-xs">
                    <div class="flex justify-between items-center"><span style="color: var(--text-muted);">Project URL</span><span class="mono truncate ml-4" style="color: var(--text);">${SUPABASE_URL}</span></div>
                    <div class="flex justify-between items-center"><span style="color: var(--text-muted);">Anon Key</span><span class="mono truncate ml-4" style="color: var(--text);">${SUPABASE_ANON_KEY}</span></div>
                </div>
            </div>

            <!-- API Keys Generator -->
            <div class="rounded-xl p-4" style="background: var(--bg); border: 1px solid var(--border);">
                <div class="flex items-center justify-between mb-3">
                    <h3 class="text-sm font-bold" style="color: var(--text);">Project API Keys</h3>
                    <button onclick="generateProjectApiKey('${projectId}')" class="text-[10px] font-bold px-3 py-1 rounded" style="background: var(--accent); color: white;">+ Generate</button>
                </div>
                <div id="project-api-keys-list" class="space-y-2 text-xs">
                    <p style="color: var(--text-muted);">Loading keys...</p>
                </div>
            </div>

            <!-- Quick Links -->
            <div>
                <h3 class="text-sm font-bold mb-3" style="color: var(--text);">Project Tools</h3>
                <div class="grid grid-cols-2 gap-3">
                    <button onclick="openSchemaDesigner('${projectId}'); document.getElementById('project-settings-modal').classList.add('hidden');" class="p-3 rounded-xl text-left" style="background: var(--bg); border: 1px solid var(--border);">
                        <p class="text-xs font-bold mb-1" style="color: var(--text);">Schema Designer</p>
                    </button>
                    <button onclick="openMobileSdkModal('${projectId}'); document.getElementById('project-settings-modal').classList.add('hidden');" class="p-3 rounded-xl text-left" style="background: var(--bg); border: 1px solid var(--border);">
                        <p class="text-xs font-bold mb-1" style="color: var(--text);">Mobile SDK</p>
                    </button>
                </div>
            </div>

        </div>
    </div>`;

    loadProjectApiKeys(projectId);
};

window.loadProjectApiKeys = async function(projectId) {
    const list = document.getElementById('project-api-keys-list');
    if (!list) return;
    const { data } = await supabaseClient.from('project_api_keys').select('*').eq('project_id', projectId).order('created_at', { ascending: false });
    
    if (!data || data.length === 0) {
        list.innerHTML = '<p style="color: var(--text-muted);">No API keys generated yet.</p>';
        return;
    }
    
    list.innerHTML = data.map(k => `
        <div class="flex items-center justify-between p-2 rounded" style="background: var(--surface);">
            <div class="min-w-0">
                <p class="font-bold truncate" style="color: var(--text);">${escapeHtml(k.name)}</p>
                <p class="mono truncate" style="color: var(--text-dim);">${escapeHtml(k.key_string)}</p>
            </div>
            <div class="flex gap-1 flex-shrink-0">
                <button onclick="copyToClipboardText('${escapeHtml(k.key_string)}')" class="px-2 py-1 text-cyan-400">Copy</button>
                <button onclick="revokeProjectApiKey('${k.id}', '${projectId}')" class="px-2 py-1 text-red-400">Revoke</button>
            </div>
        </div>
    `).join('');
};

window.generateProjectApiKey = async function(projectId) {
    const name = prompt('Name this API key (e.g., "Production Server"):');
    if (!name) return;
    
    const key = `ukm_live_${Array.from(crypto.getRandomValues(new Uint8Array(24))).map(b => b.toString(16).padStart(2, '0')).join('')}`;
    
    const { error } = await supabaseClient.from('project_api_keys').insert({
        project_id: projectId,
        name: name,
        key_string: key
    });
    
    if (error) return showToast(error.message, 'error');
    showToast('API Key generated!');
    loadProjectApiKeys(projectId);
};

window.revokeProjectApiKey = async function(keyId, projectId) {
    if (!confirm('Revoke this API key? Apps using it will stop working.')) return;
    await supabaseClient.from('project_api_keys').delete().eq('id', keyId);
    showToast('Key revoked');
    loadProjectApiKeys(projectId);
};

// ---------------------------------------------------
// 2. WEB PUSH NOTIFICATIONS (For mobile alerts)
// ---------------------------------------------------
window.requestPushPermission = async function() {
    if (!('Notification' in window)) {
        return showToast('This browser does not support notifications.', 'error');
    }
    
    if (Notification.permission === 'granted') {
        return showToast('Notifications are already enabled!', 'success');
    }

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
        showToast('Notifications enabled! We will alert you when things happen.', 'success');
        sendPushNotification('Ukmbase Connected', 'You will now receive alerts for sales and form submissions.');
    } else {
        showToast('Notifications blocked. Please enable them in browser settings.', 'error');
    }
};

window.sendPushNotification = function(title, body) {
    if (Notification.permission === 'granted') {
        new Notification(title, {
            body: body,
            icon: 'https://kumgtourryl-collab.github.io/Ukmbase-/icon-192.png' // Your app icon
        });
    }
};

// ---------------------------------------------------
// 3. INJECT SETTINGS & NOTIFICATION BUTTONS INTO NAV
// ---------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    // Add "Enable Notifications" to the top nav bar
    const navRight = document.querySelector('#dashboard-view nav .flex.items-center.gap-2');
    if (navRight) {
        const notifBtn = document.createElement('button');
        notifBtn.className = 'p-2 rounded-lg hidden sm:block';
        notifBtn.style.background = 'var(--surface)';
        notifBtn.style.border = '1px solid var(--border)';
        notifBtn.style.color = 'var(--text-muted)';
        notifBtn.title = 'Enable Push Notifications';
        notifBtn.innerHTML = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path></svg>';
        notifBtn.onclick = requestPushPermission;
        
        // Insert before theme toggle
        const themeToggle = document.getElementById('theme-toggle');
        navRight.insertBefore(notifBtn, themeToggle);
    }

    // Hook into Project Settings modal buttons dynamically
    // (Because the cards in the "Overview" tab call openProjectDetail, not openProjectSettings)
    const observer = new MutationObserver(() => {
        const pdBody = document.getElementById('pd-body');
        if (pdBody && state.viewingProjectId && !pdBody.querySelector('.btn-project-settings')) {
            const settingsBtn = document.createElement('button');
            settingsBtn.className = 'btn-project-settings w-full mt-2 font-bold py-3 rounded-lg text-white';
            settingsBtn.style.background = 'var(--surface-2)';
            settingsBtn.style.border = '1px solid var(--border)';
            settingsBtn.innerHTML = '⚙️ Project Settings & API Keys';
            settingsBtn.onclick = () => {
                document.getElementById('project-detail-modal').classList.add('hidden');
                openProjectSettings(state.viewingProjectId);
            };
            
            const dangerZone = pdBody.querySelector('.space-y-2');
            if (dangerZone) dangerZone.insertBefore(settingsBtn, dangerZone.firstChild);
        }
    });
    const pdModal = document.getElementById('project-detail-modal');
    if (pdModal) observer.observe(pdModal, { childList: true, subtree: true });
});
// ============================================
// PHASE 6: UKMTOURS (The End-User Frontend)
// ============================================

window.loadTourismApp = async function(projectSlug) {
    // 1. Hide Ukmbase Dashboard
    document.querySelectorAll('[id^="view-"]').forEach(el => el.classList.add('hidden'));
    document.getElementById('landing-view').classList.add('hidden');
    document.getElementById('dashboard-view').classList.add('hidden');
    document.getElementById('auth-view').classList.add('hidden');

    // 2. Build the App UI
    let appView = document.getElementById('view-tourism-app');
    if (!appView) {
        appView = document.createElement('div');
        appView.id = 'view-tourism-app';
        appView.className = 'min-h-screen bg-[#0B1020]';
        document.body.appendChild(appView);
    }
    appView.classList.remove('hidden');

    appView.innerHTML = `
    <header class="relative py-20 px-6 text-center overflow-hidden">
        <div class="absolute inset-0 bg-gradient-to-b from-[#4F46E5]/20 to-transparent"></div>
        <div class="relative max-w-3xl mx-auto">
            <h1 class="text-4xl md:text-5xl font-extrabold mb-4 text-white">Explore the World.</h1>
            <p class="text-lg text-[#94A3B8] mb-8">Book unforgettable tours with local expert guides.</p>
        </div>
    </header>

    <main class="max-w-5xl mx-auto px-6 pb-20">
        <div id="tours-loading" class="text-center py-12">
            <div class="inline-block w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style="border-color: var(--accent);"></div>
        </div>
        <div id="tours-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 hidden"></div>
    </main>

    <!-- Booking Modal -->
    <div id="tour-booking-modal" class="hidden fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
        <div class="w-full max-w-md rounded-2xl p-6 glow" style="background: var(--surface); border: 1px solid var(--border);">
            <div class="flex justify-between items-center mb-4">
                <h2 class="text-lg font-bold" style="color: var(--text);">Book: <span id="booking-tour-title" class="text-[var(--cyan)]"></span></h2>
                <button onclick="document.getElementById('tour-booking-modal').classList.add('hidden')" style="color: var(--text-muted);">✕</button>
            </div>
            <form id="booking-form" class="space-y-4">
                <input type="hidden" id="booking-tour-id">
                <div><label class="block text-xs mb-1" style="color: var(--text-muted);">Full Name</label><input type="text" id="booking-name" required class="w-full rounded-lg px-4 py-3 text-sm" style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"></div>
                <div><label class="block text-xs mb-1" style="color: var(--text-muted);">Email</label><input type="email" id="booking-email" required class="w-full rounded-lg px-4 py-3 text-sm" style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"></div>
                <div><label class="block text-xs mb-1" style="color: var(--text-muted);">Date</label><input type="date" id="booking-date" required class="w-full rounded-lg px-4 py-3 text-sm" style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"></div>
                <button type="submit" id="booking-submit" class="w-full font-bold py-3 rounded-lg text-white" style="background: var(--green);">Confirm Booking</button>
            </form>
        </div>
    </div>
    `;

    // 3. Fetch Tours
    const schema = projectSlug.replace(/-/g, '_');
    try {
        const { data: tours, error } = await supabaseClient
            .schema(schema)
            .from('tours')
            .select('*');

        document.getElementById('tours-loading').classList.add('hidden');
        
        if (error) throw error;
        const grid = document.getElementById('tours-grid');
        grid.classList.remove('hidden');

        if (!tours || tours.length === 0) {
            grid.innerHTML = '<p class="text-center text-[#94A3B8] col-span-full">No tours available right now.</p>';
            return;
        }

        grid.innerHTML = tours.map(t => `
            <div class="rounded-xl overflow-hidden group cursor-pointer" style="background: var(--surface); border: 1px solid var(--border);" onclick="openBookingModal('${t.id}', '${escapeHtml(t.title)}')">
                <div class="h-40 bg-[#1C2333] flex items-center justify-center relative overflow-hidden">
                    <div class="absolute inset-0 bg-gradient-to-t from-[#0B1020] to-transparent z-10"></div>
                    <span class="text-5xl z-0 group-hover:scale-110 transition-transform">🏝️</span>
                </div>
                <div class="p-5 relative z-20 -mt-6">
                    <h3 class="text-lg font-bold mb-1" style="color: var(--text);">${escapeHtml(t.title)}</h3>
                    <p class="text-xs mb-3" style="color: var(--text-muted);">${escapeHtml(t.location || 'Various Locations')} · ${t.duration_hours || 2} hours</p>
                    <div class="flex justify-between items-center border-t pt-3" style="border-color: var(--border);">
                        <span class="font-bold text-lg mono" style="color: var(--green);">$${Number(t.price || 0).toFixed(2)}</span>
                        <span class="text-xs font-bold px-3 py-1 rounded" style="background: rgba(79,70,229,0.1); color: var(--accent);">Book Now</span>
                    </div>
                </div>
            </div>
        `).join('');

    } catch (e) {
        document.getElementById('tours-loading').classList.add('hidden');
        showToast('Failed to load tours: ' + e.message, 'error');
    }

    // 4. Handle Form Submit
    document.getElementById('booking-form').onsubmit = async (e) => {
        e.preventDefault();
        const btn = document.getElementById('booking-submit');
        btn.textContent = 'Processing...'; btn.disabled = true;

        const booking = {
            tour_id: document.getElementById('booking-tour-id').value,
            customer_name: document.getElementById('booking-name').value,
            customer_email: document.getElementById('booking-email').value,
            booking_date: document.getElementById('booking-date').value,
            status: 'confirmed'
        };

        try {
            // Insert booking into the database
            const { error } = await supabaseClient.schema(schema).from('bookings').insert(booking);
            if (error) throw error;

            // Trigger UkmNotify (Email the business owner)
            const proj = state.projectsCache.find(p => p.slug === projectSlug);
            if (proj) {
                // We use the UkmNotify function we built on Day 1!
                window.sendNotification(proj.id, proj.email || 'admin@ukmtours.com', 'email', 'New Tour Booking!', `A new booking was made by ${booking.customer_name} for ${document.getElementById('booking-tour-title').textContent}`);
            }

            document.getElementById('tour-booking-modal').classList.add('hidden');
            showToast('Booking Confirmed! Check your email.', 'success', 5000);
            document.getElementById('booking-form').reset();
        } catch (e) {
            showToast(e.message, 'error');
        } finally {
            btn.textContent = 'Confirm Booking'; btn.disabled = false;
        }
    };
};

window.openBookingModal = function(tourId, tourTitle) {
    document.getElementById('booking-tour-id').value = tourId;
    document.getElementById('booking-tour-title').textContent = tourTitle;
    document.getElementById('tour-booking-modal').classList.remove('hidden');
};

// ---------------------------------------------------
// ROUTING: Listen for ?app= parameter
// ---------------------------------------------------
const originalInitDay6 = window.init;
window.init = async function() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('app')) {
        // If the URL is ?app=tourism, load the tourism page
        const projectSlug = urlParams.get('app');
        // Fetch project info quickly
        const { data } = await supabaseClient.from('projects').select('*').eq('slug', projectSlug).single();
        if (data) {
            state.projectsCache = [data];
            loadTourismApp(projectSlug);
            return;
        }
    }
    if (originalInitDay6) await originalInitDay6();
};
// ============================================
// PHASE 7: CLEAN UI OVERHAUL & DATA SCIENCE TOOLS
// ============================================

// ---------------------------------------------------
// 1. UI CLEANUP: Tabbed Interface for Ukmbase Data
// ---------------------------------------------------
window.initUkmDataTabs = function() {
    const panel = document.getElementById('ukmdata-panel');
    if (!panel || document.getElementById('ukmdata-tabs-header')) return;

    // 1. Create the Tab Bar
    const tabBar = document.createElement('div');
    tabBar.id = 'ukmdata-tabs-header';
    tabBar.className = 'flex gap-2 mb-6 overflow-x-auto no-scrollbar';
    tabBar.style.borderBottom = '1px solid var(--border)';
    tabBar.innerHTML = `
        <button onclick="switchDataTab('database')" class="data-tab active px-4 py-2 text-sm font-medium -mb-px" style="color: var(--text); border-bottom: 2px solid var(--accent);">Database</button>
        <button onclick="switchDataTab('auth')" class="data-tab px-4 py-2 text-sm font-medium -mb-px" style="color: var(--text-muted); border-bottom: 2px solid transparent;">Auth & Users</button>
        <button onclick="switchDataTab('storage')" class="data-tab px-4 py-2 text-sm font-medium -mb-px" style="color: var(--text-muted); border-bottom: 2px solid transparent;">Storage</button>
        <button onclick="switchDataTab('integrations')" class="data-tab px-4 py-2 text-sm font-medium -mb-px" style="color: var(--text-muted); border-bottom: 2px solid transparent;">Integrations</button>
        <button onclick="switchDataTab('advanced')" class="data-tab px-4 py-2 text-sm font-medium -mb-px" style="color: var(--text-muted); border-bottom: 2px solid transparent;">Advanced</button>
    `;

    // Insert tab bar right after the project selector
    const projectSelector = panel.querySelector('.rounded-xl.p-4.mb-6');
    if (projectSelector) {
        projectSelector.parentNode.insertBefore(tabBar, projectSelector.nextSibling);
    } else {
        panel.insertBefore(tabBar, panel.firstChild);
    }

    // 2. Wrap existing cards into tab groups
    const groups = {
        database: ['ukmdata-tables-card', 'ukmdata-sql-card'],
        auth: ['ukmdata-auth-card'],
        storage: ['ukmdata-storage-card'],
        integrations: ['ukmdata-webhooks-card', 'ukmdata-crons-card', 'ukmdata-mail-card'],
        advanced: ['ukmdata-apikeys-card', 'ukmdata-logs-card']
    };

    // Create wrappers
    Object.keys(groups).forEach(key => {
        let wrapper = document.getElementById('ukmdata-tab-' + key);
        if (!wrapper) {
            wrapper = document.createElement('div');
            wrapper.id = 'ukmdata-tab-' + key;
            wrapper.className = key === 'database' ? 'block' : 'hidden';
            panel.appendChild(wrapper);
        }
        // Move existing cards into the wrapper
        groups[key].forEach(cardId => {
            const card = document.getElementById(cardId);
            if (card) wrapper.appendChild(card);
        });
    });

    // 3. Add the Developer Hub card (Data Science / Postgres / GraphQL)
    let devHub = document.getElementById('ukmdata-devhub-card');
    if (!devHub) {
        devHub = document.createElement('div');
        devHub.id = 'ukmdata-devhub-card';
        devHub.className = 'rounded-xl p-5 mb-6';
        devHub.style.cssText = 'background: var(--surface); border: 1px solid var(--border);';
        devHub.innerHTML = `
            <div class="flex items-center justify-between mb-4">
                <div><h3 class="font-bold" style="color: var(--text);">Developer Hub</h3><p class="text-xs mt-1" style="color: var(--text-muted);">Direct connections for Data Scientists & Engineers.</p></div>
            </div>
            <div class="space-y-4">
                <!-- Postgres String -->
                <div>
                    <label class="block text-xs font-medium mb-1" style="color: var(--text-muted);">Direct Postgres Connection (Pooler)</label>
                    <div class="flex gap-2">
                        <input type="text" readonly id="dev-postgres-string" class="w-full rounded-lg px-3 py-2 text-xs mono focus:outline-none" style="background: var(--bg); border: 1px solid var(--border); color: var(--cyan);">
                        <button onclick="copyToClipboardText(document.getElementById('dev-postgres-string').value)" class="px-3 text-xs font-bold rounded-lg text-white" style="background: var(--accent);">Copy</button>
                    </div>
                    <p class="text-[10px] mt-1" style="color: var(--text-dim);">Use this in DBeaver, TablePlus, or Python (SQLAlchemy/Psycopg2).</p>
                </div>
                <!-- Python Pandas Snippet -->
                <div>
                    <div class="flex justify-between items-center mb-1">
                        <label class="block text-xs font-medium" style="color: var(--text-muted);">Python (Pandas) Data Analysis</label>
                        <button onclick="copyToClipboardText(document.getElementById('dev-python-snippet').textContent)" class="text-[10px] text-cyan-400">Copy</button>
                    </div>
                    <pre id="dev-python-snippet" class="mono text-[10px] p-3 rounded-lg overflow-x-auto" style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"></pre>
                </div>
                <!-- GraphQL Endpoint -->
                <div>
                    <label class="block text-xs font-medium mb-1" style="color: var(--text-muted);">GraphQL Endpoint (via pg_graphql)</label>
                    <div class="flex gap-2">
                        <input type="text" readonly id="dev-graphql-url" class="w-full rounded-lg px-3 py-2 text-xs mono focus:outline-none" style="background: var(--bg); border: 1px solid var(--border); color: var(--text);">
                        <button onclick="copyToClipboardText(document.getElementById('dev-graphql-url').value)" class="px-3 text-xs font-bold rounded-lg text-white" style="background: var(--accent);">Copy</button>
                    </div>
                </div>
            </div>
        `;
        // Put DevHub in the "Advanced" tab
        const advancedTab = document.getElementById('ukmdata-tab-advanced');
        if (advancedTab) advancedTab.insertBefore(devHub, advancedTab.firstChild);
    }

    updateDevHubInfo();
};

window.switchDataTab = function(tabName) {
    // Update buttons
    document.querySelectorAll('.data-tab').forEach(btn => {
        btn.style.color = 'var(--text-muted)';
        btn.style.borderBottomColor = 'transparent';
    });
    event.target.style.color = 'var(--text)';
    event.target.style.borderBottomColor = 'var(--accent)';

    // Update panels
    ['database', 'auth', 'storage', 'integrations', 'advanced'].forEach(key => {
        const el = document.getElementById('ukmdata-tab-' + key);
        if (el) el.className = key === tabName ? 'block' : 'hidden';
    });
};

window.updateDevHubInfo = function() {
    if (!state.currentUkmDataProjectId) return;
    const proj = state.projectsCache.find(p => p.id === state.currentUkmDataProjectId);
    if (!proj) return;
    
    const schema = proj.slug.replace(/-/g, '_');
    
    // Update Postgres String
    const pgString = `postgresql://postgres.dwjyzqsrzdgnpwibnyjn:[YOUR_DB_PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?options=-c%20search_path%3D${schema}`;
    const pgInput = document.getElementById('dev-postgres-string');
    if (pgInput) pgInput.value = pgString;

    // Update Python Snippet
    const pySnippet = `import pandas as pd
from sqlalchemy import create_engine

# Replace [YOUR_DB_PASSWORD] with your actual database password
engine = create_engine("${pgString}")
df = pd.read_sql("SELECT * FROM ${schema}.your_table_name LIMIT 100", engine)
print(df.head())`;
    const pyEl = document.getElementById('dev-python-snippet');
    if (pyEl) pyEl.textContent = pySnippet;

    // Update GraphQL URL
    const gqlInput = document.getElementById('dev-graphql-url');
    if (gqlInput) gqlInput.value = `${SUPABASE_URL}/graphql/v1`;
};

// Override onUkmDataProjectChange to ensure tabs are initialized
const originalOnUkmDataProjectChange = window.onUkmDataProjectChange;
window.onUkmDataProjectChange = async function() {
    if (originalOnUkmDataProjectChange) await originalOnUkmDataProjectChange();
    initUkmDataTabs();
};

// Also run when the view is switched to ukmdata
const originalSwitchViewPhase7 = window.switchView;
window.switchView = function(view) {
    if (originalSwitchViewPhase7) originalSwitchViewPhase7(view);
    if (view === 'ukmdata') {
        setTimeout(initUkmDataTabs, 100);
    }
};
// ============================================
// PHASE 8: REALTIME STREAMS & GRAPHQL PLAYGROUND
// ============================================

// ---------------------------------------------------
// 1. REALTIME LIVE DATA (WebSockets)
// ---------------------------------------------------
window.openLiveDataModal = function(tableName) {
    let modal = document.getElementById('ukm-realtime-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ukm-realtime-modal';
        modal.className = 'hidden fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm';
        document.body.appendChild(modal);
    }
    modal.classList.remove('hidden');

    const proj = state.projectsCache.find(p => p.id === state.currentUkmDataProjectId);
    if (!proj) return showToast('Select a project first', 'error');
    const schema = proj.slug.replace(/-/g, '_');

    modal.innerHTML = `
    <div class="w-full max-w-4xl rounded-2xl p-6 glow max-h-[90vh] flex flex-col" style="background: var(--surface); border: 1px solid var(--border);">
        <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-2">
                <h2 class="text-lg font-bold" style="color: var(--text);">Live Data: <span class="mono text-[var(--cyan)]">${escapeHtml(tableName)}</span></h2>
                <span class="flex h-2 w-2 relative">
                    <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span class="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
            </div>
            <button onclick="closeRealtimeModal()" style="color: var(--text-muted);">✕</button>
        </div>
        <p class="text-xs mb-4" style="color: var(--text-muted);">Listening for real-time inserts, updates, and deletes via WebSockets.</p>
        
        <div class="flex-1 overflow-auto rounded-lg" style="border: 1px solid var(--border); background: var(--bg);">
            <div id="realtime-log" class="p-4 space-y-2 font-mono text-xs" style="color: var(--text);">
                <p style="color: var(--text-dim);">// Waiting for database events...</p>
            </div>
        </div>
    </div>`;

    // Fetch initial data
    supabaseClient.schema(schema).from(tableName).select('*').limit(5).then(({ data }) => {
        if (data && data.length > 0) {
            const log = document.getElementById('realtime-log');
            log.innerHTML = `<p style="color: var(--text-dim);">// Loaded ${data.length} initial rows</p>`;
            data.forEach(row => appendRealtimeLog('SELECT', row));
        }
    });

    // Set up WebSocket channel
    if (window.ukmRealtimeChannel) {
        supabaseClient.removeChannel(window.ukmRealtimeChannel);
    }

    window.ukmRealtimeChannel = supabaseClient
        .channel('realtime-' + tableName)
        .on('postgres_changes', { event: '*', schema: schema, table: tableName }, (payload) => {
            appendRealtimeLog(payload.eventType, payload.new);
        })
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                const log = document.getElementById('realtime-log');
                log.innerHTML += `<p style="color: var(--green);">// Successfully connected to WebSocket!</p>`;
            }
        });
};

window.appendRealtimeLog = function(eventType, data) {
    const log = document.getElementById('realtime-log');
    if (!log) return;
    
    const colors = {
        'INSERT': 'text-green-400',
        'UPDATE': 'text-yellow-400',
        'DELETE': 'text-red-400',
        'SELECT': 'text-cyan-400'
    };
    
    const html = `
        <div class="p-2 rounded" style="background: var(--surface); border: 1px solid var(--border);">
            <span class="${colors[eventType] || 'text-gray-400'} font-bold">[${eventType}]</span>
            <span style="color: var(--text-dim);">${new Date().toLocaleTimeString()}</span>
            <pre class="mt-1 overflow-x-auto" style="color: var(--text-muted);">${escapeHtml(JSON.stringify(data, null, 2))}</pre>
        </div>
    `;
    log.insertAdjacentHTML('afterbegin', html);
};

window.closeRealtimeModal = function() {
    document.getElementById('ukm-realtime-modal').classList.add('hidden');
    if (window.ukmRealtimeChannel) {
        supabaseClient.removeChannel(window.ukmRealtimeChannel);
        window.ukmRealtimeChannel = null;
    }
};

// ---------------------------------------------------
// 2. GRAPHQL PLAYGROUND (For Data Scientists)
// ---------------------------------------------------
window.openGraphQLPlayground = function() {
    let modal = document.getElementById('ukm-graphql-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ukm-graphql-modal';
        modal.className = 'hidden fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm';
        document.body.appendChild(modal);
    }
    modal.classList.remove('hidden');

    const proj = state.projectsCache.find(p => p.id === state.currentUkmDataProjectId);
    if (!proj) return showToast('Select a project first', 'error');
    const schema = proj.slug.replace(/-/g, '_');

    modal.innerHTML = `
    <div class="w-full max-w-5xl rounded-2xl p-6 glow max-h-[95vh] flex flex-col" style="background: var(--surface); border: 1px solid var(--border);">
        <div class="flex items-center justify-between mb-4">
            <div>
                <h2 class="text-lg font-bold" style="color: var(--text);">GraphQL Playground</h2>
                <p class="text-xs mt-1" style="color: var(--text-muted);">Query your database with GraphQL.</p>
            </div>
            <button onclick="document.getElementById('ukm-graphql-modal').classList.add('hidden')" style="color: var(--text-muted);">✕</button>
        </div>
        
        <div class="flex-1 flex flex-col md:flex-row gap-4 min-h-0">
            <!-- Editor -->
            <div class="flex-1 flex flex-col">
                <textarea id="graphql-query" class="flex-1 w-full rounded-lg p-4 font-mono text-sm resize-none focus:outline-none" style="background: var(--bg); border: 1px solid var(--border); color: var(--cyan);">query {
  ${schema}_toursCollection(first: 5) {
    edges {
      node {
        id
        title
        price
      }
    }
  }
}</textarea>
                <button onclick="runGraphQL()" id="gql-run-btn" class="mt-3 w-full font-bold py-2 rounded-lg text-white" style="background: var(--accent);">Run Query (▶)</button>
            </div>
            <!-- Results -->
            <div class="flex-1 flex flex-col">
                <div class="flex-1 rounded-lg p-4 overflow-auto font-mono text-xs" style="background: var(--bg); border: 1px solid var(--border);">
                    <pre id="graphql-result" style="color: var(--text-muted);">// Results will appear here...</pre>
                </div>
            </div>
        </div>
    </div>`;
};

window.runGraphQL = async function() {
    const query = document.getElementById('graphql-query').value;
    const resultEl = document.getElementById('graphql-result');
    const btn = document.getElementById('gql-run-btn');
    
    btn.textContent = 'Running...'; btn.disabled = true;
    resultEl.textContent = 'Executing query...';

    try {
        const res = await fetch(SUPABASE_URL + '/graphql/v1', {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query })
        });
        
        const data = await res.json();
        resultEl.textContent = JSON.stringify(data, null, 2);
        resultEl.style.color = data.errors ? 'var(--red)' : 'var(--green)';
    } catch (e) {
        resultEl.textContent = 'Error: ' + e.message;
        resultEl.style.color = 'var(--red)';
    } finally {
        btn.textContent = 'Run Query (▶)'; btn.disabled = false;
    }
};

// ---------------------------------------------------
// 3. INJECT UI BUTTONS
// ---------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    // 1. Inject "Live" button next to "View" in the Ukmbase Data tables list
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.addedNodes.length) {
                document.querySelectorAll('#ukmdata-tables-list > div').forEach(card => {
                    if (!card.querySelector('.btn-live-data')) {
                        const tableName = card.querySelector('.mono').textContent;
                        const btnContainer = card.querySelector('.flex-wrap.items-center.gap-2');
                        if (btnContainer) {
                            const btn = document.createElement('button');
                            btn.className = 'btn-live-data text-[10px] font-bold px-2 py-1.5 rounded-lg';
                            btn.style.cssText = 'background: rgba(16,185,129,0.1); color: var(--green); border: 1px solid rgba(16,185,129,0.3);';
                            btn.innerHTML = 'Live <span class="animate-pulse">🔴</span>';
                            btn.onclick = () => openLiveDataModal(tableName);
                            // Insert before the CSV button
                            btnContainer.insertBefore(btn, btnContainer.querySelector('button[onclick^="document.getElementById(\'csv-input"]'));
                        }
                    }
                });
            }
        });
    });
    const listContainer = document.getElementById('ukmdata-tables-list');
    if (listContainer) observer.observe(listContainer, { childList: true, subtree: true });

    // 2. Inject "GraphQL" button into the Developer Hub (Advanced Tab)
    const devHub = document.getElementById('ukmdata-devhub-card');
    if (devHub) {
        const gqlSection = devHub.querySelector('.space-y-4');
        if (gqlSection && !document.getElementById('btn-open-graphql')) {
            const btn = document.createElement('button');
            btn.id = 'btn-open-graphql';
            btn.className = 'w-full mt-2 font-bold py-2 rounded-lg text-white text-xs';
            btn.style.background = 'var(--accent)';
            btn.textContent = 'Open GraphQL Playground';
            btn.onclick = openGraphQLPlayground;
            gqlSection.appendChild(btn);
        }
    }
});
// ============================================
// PHASE 9: UKMCHAT WIDGET & NOTIFICATION CENTER
// ============================================

// ---------------------------------------------------
// 1. UKMCHAT (Floating AI Support Widget)
// ---------------------------------------------------
// This gets injected into the public facing apps (like ?app=tourism)
window.initUkmChatWidget = function(projectId) {
    // Don't show if it already exists
    if (document.getElementById('ukmchat-widget')) return;

    const widget = document.createElement('div');
    widget.id = 'ukmchat-widget';
    widget.innerHTML = `
        <!-- Chat Window -->
        <div id="ukmchat-window" class="hidden fixed bottom-24 right-4 sm:right-6 w-80 sm:w-96 rounded-2xl shadow-2xl z-[100] flex flex-col overflow-hidden" style="background: var(--surface); border: 1px solid var(--border); max-height: 500px;">
            <div class="p-4 flex justify-between items-center" style="background: var(--accent); color: white;">
                <div class="flex items-center gap-2">
                    <div class="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
                    <h3 class="font-bold text-sm">AI Support</h3>
                </div>
                <button onclick="document.getElementById('ukmchat-window').classList.add('hidden')" class="text-white/80 hover:text-white">✕</button>
            </div>
            <div id="ukmchat-messages" class="flex-1 p-4 overflow-y-auto space-y-3 text-sm" style="background: var(--bg); min-height: 250px;">
                <div class="p-3 rounded-lg rounded-tl-none w-4/5" style="background: var(--surface); border: 1px solid var(--border); color: var(--text);">
                    Hi there! 👋 How can I help you today?
                </div>
            </div>
            <div class="p-3 border-t" style="border-color: var(--border); background: var(--surface);">
                <div class="flex gap-2">
                    <input type="text" id="ukmchat-input" placeholder="Ask a question..." class="flex-1 rounded-lg px-3 py-2 text-sm focus:outline-none" style="background: var(--bg); border: 1px solid var(--border); color: var(--text);" onkeydown="if(event.key==='Enter') sendUkmChatMessage('${projectId}')">
                    <button onclick="sendUkmChatMessage('${projectId}')" id="ukmchat-send" class="p-2 rounded-lg text-white" style="background: var(--accent);">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg>
                    </button>
                </div>
            </div>
        </div>

        <!-- Floating Button -->
        <button onclick="document.getElementById('ukmchat-window').classList.toggle('hidden')" class="fixed bottom-6 right-4 sm:right-6 w-14 h-14 rounded-full shadow-xl flex items-center justify-center z-[100] text-white transition-transform hover:scale-105" style="background: var(--accent);">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path></svg>
        </button>
    `;
    document.body.appendChild(widget);
};

window.sendUkmChatMessage = async function(projectId) {
    const input = document.getElementById('ukmchat-input');
    const messages = document.getElementById('ukmchat-messages');
    const sendBtn = document.getElementById('ukmchat-send');
    const text = input.value.trim();
    if (!text) return;

    // Add user message
    input.value = '';
    messages.innerHTML += `
        <div class="p-3 rounded-lg rounded-tr-none w-4/5 ml-auto text-white" style="background: var(--accent);">
            ${escapeHtml(text)}
        </div>
    `;
    messages.scrollTop = messages.scrollHeight;
    sendBtn.disabled = true;

    try {
        // Get project context for the AI
        const proj = state.projectsCache.find(p => p.id === projectId);
        const contextPrompt = `You are a helpful customer support AI for a business called "${proj ? proj.name : 'this business'}". Answer this user question politely and concisely: "${text}"`;
        
        const data = await aiCall({ prompt: contextPrompt, mode: 'default', projectId: projectId });
        
        messages.innerHTML += `
            <div class="p-3 rounded-lg rounded-tl-none w-4/5" style="background: var(--surface); border: 1px solid var(--border); color: var(--text);">
                ${escapeHtml(data.content || "I'm sorry, I couldn't process that.")}
            </div>
        `;
    } catch (e) {
        messages.innerHTML += `<div class="p-3 text-red-400 text-xs">Error: ${e.message}</div>`;
    } finally {
        sendBtn.disabled = false;
        messages.scrollTop = messages.scrollHeight;
    }
};

// Automatically inject the chat widget into the Tourism App
const originalLoadTourismApp = window.loadTourismApp;
window.loadTourismApp = async function(projectSlug) {
    if (originalLoadTourismApp) await originalLoadTourismApp(projectSlug);
    // Find the project ID to pass to the chat widget
    const proj = state.projectsCache.find(p => p.slug === projectSlug);
    if (proj) initUkmChatWidget(proj.id);
};

// ---------------------------------------------------
// 2. NOTIFICATION CENTER (For the Dashboard)
// ---------------------------------------------------
window.loadPlatformNotifications = async function() {
    if (!state.currentUser) return;
    const { data } = await supabaseClient.from('platform_notifications').select('*').eq('user_id', state.currentUser.id).order('created_at', { ascending: false }).limit(10);
    
    const dot = document.getElementById('notif-dot');
    if (!dot) return;

    const unread = data ? data.filter(n => !n.is_read).length : 0;
    
    if (unread > 0) {
        dot.classList.remove('hidden');
    } else {
        dot.classList.add('hidden');
    }
};

window.openNotificationCenter = async function() {
    let modal = document.getElementById('ukm-notification-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ukm-notification-modal';
        modal.className = 'hidden fixed inset-0 z-[80] flex items-start justify-end p-4 bg-black/50 backdrop-blur-sm';
        document.body.appendChild(modal);
    }
    modal.classList.remove('hidden');

    modal.innerHTML = `
    <div class="w-full max-w-sm rounded-2xl p-4 glow mt-16 mr-2 sm:mr-4" style="background: var(--surface); border: 1px solid var(--border);">
        <div class="flex items-center justify-between mb-4">
            <h2 class="text-sm font-bold" style="color: var(--text);">Notifications</h2>
            <button onclick="document.getElementById('ukm-notification-modal').classList.add('hidden')" style="color: var(--text-muted);">✕</button>
        </div>
        <div id="notif-list" class="space-y-2 max-h-96 overflow-y-auto">
            <div class="text-center py-4"><div class="inline-block w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style="border-color: var(--accent);"></div></div>
        </div>
    </div>`;

    const { data } = await supabaseClient.from('platform_notifications').select('*').eq('user_id', state.currentUser.id).order('created_at', { ascending: false }).limit(20);
    const list = document.getElementById('notif-list');
    
    if (!data || data.length === 0) {
        list.innerHTML = '<p class="text-xs text-center py-6" style="color: var(--text-muted);">No notifications yet.</p>';
        return;
    }

    // Mark as read
    await supabaseClient.from('platform_notifications').update({ is_read: true }).eq('user_id', state.currentUser.id).eq('is_read', false);
    document.getElementById('notif-dot').classList.add('hidden');

    list.innerHTML = data.map(n => `
        <div class="p-3 rounded-lg text-xs" style="background: var(--bg); border: 1px solid var(--border); ${n.is_read ? 'opacity: 0.6;' : ''}">
            <div class="flex items-center gap-2 mb-1">
                <div class="w-2 h-2 rounded-full ${n.type === 'success' ? 'bg-green-400' : n.type === 'warning' ? 'bg-yellow-400' : 'bg-cyan-400'}"></div>
                <p class="font-bold" style="color: var(--text);">${escapeHtml(n.title)}</p>
                <span class="ml-auto" style="color: var(--text-dim);">${new Date(n.created_at).toLocaleTimeString()}</span>
            </div>
            <p style="color: var(--text-muted);">${escapeHtml(n.message)}</p>
        </div>
    `).join('');
};

// ---------------------------------------------------
// 3. INJECT NOTIFICATION BELL INTO TOP NAV
// ---------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    const navRight = document.querySelector('#dashboard-view nav .flex.items-center.gap-2');
    if (navRight && !document.getElementById('notif-bell')) {
        const bellBtn = document.createElement('button');
        bellBtn.id = 'notif-bell';
        bellBtn.className = 'p-2 rounded-lg relative';
        bellBtn.style.background = 'var(--surface)';
        bellBtn.style.border = '1px solid var(--border)';
        bellBtn.style.color = 'var(--text-muted)';
        bellBtn.innerHTML = `
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path></svg>
            <span id="notif-dot" class="hidden absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border border-[var(--surface)]"></span>
        `;
        bellBtn.onclick = openNotificationCenter;
        
        // Insert before the theme toggle
        const themeToggle = document.getElementById('theme-toggle');
        navRight.insertBefore(bellBtn, themeToggle);
        
        // Initial load
        setTimeout(loadPlatformNotifications, 1000);
    }
});

// ============================================
// END OF PHASE 9
// ============================================
// ============================================
// PHASE 10: TEAM INVITATIONS & SHARED WORKSPACES
// ============================================

// ---------------------------------------------------
// 1. SEND TEAM INVITE (With UkmNotify Email)
// ---------------------------------------------------
window.sendTeamInvite = async function() {
    const emailInput = document.getElementById('team-invite-email');
    const roleSelect = document.getElementById('team-invite-role');
    const btn = document.getElementById('team-invite-btn');
    const errorEl = document.getElementById('team-invite-error');
    
    const email = emailInput.value.trim().toLowerCase();
    const role = roleSelect.value;

    if (!email) return showToast('Email required', 'error');
    
    btn.textContent = 'Sending...'; btn.disabled = true;
    errorEl.classList.add('hidden');

    try {
        // 1. Save to DB
        const { error } = await supabaseClient.from('team_members').insert([{ 
            owner_id: state.currentUser.id, 
            invite_email: email, 
            role: role, 
            status: 'pending' 
        }]);
        
        if (error) throw error;

        // 2. Send the email via UkmNotify (The function we built on Day 1!)
        const emailBody = `
            <h2>You've been invited to join a team on Ukmbase!</h2>
            <p><strong>${state.currentProfile.full_name || state.currentUser.email}</strong> has invited you to collaborate as a <strong>${role}</strong>.</p>
            <p>Log in to your Ukmbase account to accept the invitation and access their projects.</p>
            <br>
            <a href="${window.location.origin}" style="background: #4F46E5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">Log in to Ukmbase</a>
        `;
        
        await window.sendNotification(
            state.currentUser.id, // Fake project_id for platform notifications
            email, 
            'email', 
            'Ukmbase Team Invitation', 
            emailBody
        );

        emailInput.value = '';
        await loadTeam(); 
        renderTeam(); 
        showToast('Invite sent successfully!');
    } catch (e) {
        errorEl.textContent = e.message; errorEl.classList.remove('hidden');
    } finally {
        btn.textContent = 'Send Invite'; btn.disabled = false;
    }
};

// ---------------------------------------------------
// 2. ACCEPT INVITE (Triggered from the Banner)
// ---------------------------------------------------
window.acceptTeamInvite = async function() {
    if (!state.pendingInvite) return;
    
    try {
        const { error } = await supabaseClient.from('team_members')
            .update({ status: 'active' })
            .eq('id', state.pendingInvite.id);
            
        if (error) throw error;
        
        showToast('Invite accepted! Loading shared projects...');
        document.getElementById('team-invite-banner').classList.add('hidden');
        state.pendingInvite = null;
        
        // Reload projects so the shared ones show up in the dashboard
        await loadProjects(); 
        switchView('overview');
    } catch(e) {
        showToast(e.message, 'error');
    }
};

// ---------------------------------------------------
// 3. HANDLE LOGIN & TEAM PROJECTS
// ---------------------------------------------------
// Override loadProjects so we catch both owned AND shared projects
const originalLoadProjects = window.loadProjects;
window.loadProjects = async function() {
    if (!state.currentUser) return;
    
    document.getElementById('projects-loading').classList.remove('hidden'); 
    document.getElementById('projects-grid').classList.add('hidden'); 
    document.getElementById('empty-state').classList.add('hidden');
    
    // The RLS policy we just added allows fetching both!
    const { data, error } = await supabaseClient.from('projects').select('*').order('created_at', { ascending: false });
    
    document.getElementById('projects-loading').classList.add('hidden'); 
    if (error) return console.error(error);
    
    state.projectsCache = data || []; 
    renderProjects(); 
    updateStats(); 
    populateProjectSelects(); 
    updateOnboardingChecklist();
};

// Override checkForPendingInvites to ensure the banner pops up instantly on login
const originalCheckForPendingInvites = window.checkForPendingInvites;
window.checkForPendingInvites = async function() {
    if (!state.currentUser || !state.currentUser.email) return;
    
    // Check if we have a pending invite
    const { data } = await supabaseClient.from('team_members')
        .select('*, profiles:owner_id(full_name, email)')
        .eq('invite_email', state.currentUser.email)
        .eq('status', 'pending')
        .maybeSingle();
        
    if (data) {
        state.pendingInvite = data; 
        const owner = data.profiles?.full_name || data.profiles?.email || 'A user';
        document.getElementById('invite-banner-text').innerHTML = `<strong>${escapeHtml(owner)}</strong> invited you to collaborate as <strong>${escapeHtml(data.role)}</strong>.`;
        document.getElementById('team-invite-banner').classList.remove('hidden');
    }
};

// Run the check on page load
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if (state.currentUser) checkForPendingInvites();
    }, 2000);
});
// ============================================
// PHASE 11 & 12: EMAIL SEQUENCES & GLOBAL SEARCH
// ============================================

// ---------------------------------------------------
// 1. AUTOMATED EMAIL SEQUENCES
// ---------------------------------------------------
window.openEmailSequencesModal = async function(projectId) {
    let modal = document.getElementById('ukm-email-seq-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ukm-email-seq-modal';
        modal.className = 'hidden fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm';
        document.body.appendChild(modal);
    }
    modal.classList.remove('hidden');

    modal.innerHTML = `
    <div class="w-full max-w-lg rounded-2xl p-6 glow max-h-[90vh] flex flex-col" style="background: var(--surface); border: 1px solid var(--border);">
        <div class="flex items-center justify-between mb-4">
            <div>
                <h2 class="text-lg font-bold" style="color: var(--text);">Email Sequences</h2>
                <p class="text-xs mt-1" style="color: var(--text-muted);">Automate onboarding emails for your users.</p>
            </div>
            <button onclick="document.getElementById('ukm-email-seq-modal').classList.add('hidden')" style="color: var(--text-muted);">✕</button>
        </div>
        
        <div class="flex-1 overflow-y-auto space-y-4 pr-2 mb-4">
            <div id="email-seq-list" class="space-y-2">
                <p class="text-xs text-center py-4" style="color: var(--text-muted);">Loading...</p>
            </div>
            
            <div class="rounded-xl p-4 mt-4" style="background: var(--bg); border: 1px dashed var(--border);">
                <h3 class="text-sm font-bold mb-3" style="color: var(--text);">Create New Sequence</h3>
                <div class="space-y-3">
                    <div><label class="block text-xs mb-1" style="color: var(--text-muted);">Sequence Name</label><input type="text" id="seq-name" placeholder="e.g. Welcome Email" class="w-full rounded-lg px-3 py-2 text-sm" style="background: var(--surface); border: 1px solid var(--border); color: var(--text);"></div>
                    <div class="grid grid-cols-2 gap-3">
                        <div><label class="block text-xs mb-1" style="color: var(--text-muted);">Trigger</label><select id="seq-trigger" class="w-full rounded-lg px-3 py-2 text-sm" style="background: var(--surface); border: 1px solid var(--border); color: var(--text);"><option value="user_signup">New User Signup</option><option value="form_submitted">Form Submitted</option></select></div>
                        <div><label class="block text-xs mb-1" style="color: var(--text-muted);">Delay (Hours)</label><input type="number" id="seq-delay" value="24" class="w-full rounded-lg px-3 py-2 text-sm" style="background: var(--surface); border: 1px solid var(--border); color: var(--text);"></div>
                    </div>
                    <div><label class="block text-xs mb-1" style="color: var(--text-muted);">Subject</label><input type="text" id="seq-subject" placeholder="Welcome to our app!" class="w-full rounded-lg px-3 py-2 text-sm" style="background: var(--surface); border: 1px solid var(--border); color: var(--text);"></div>
                    <div><label class="block text-xs mb-1" style="color: var(--text-muted);">Body (HTML)</label><textarea id="seq-body" rows="3" placeholder="<p>Thanks for joining!</p>" class="w-full rounded-lg px-3 py-2 text-sm" style="background: var(--surface); border: 1px solid var(--border); color: var(--text);"></textarea></div>
                    <button onclick="saveEmailSequence('${projectId}')" class="w-full font-bold py-2 rounded-lg text-white text-sm" style="background: var(--accent);">Save Sequence</button>
                </div>
            </div>
        </div>
    </div>`;

    loadEmailSequences(projectId);
};

window.loadEmailSequences = async function(projectId) {
    const { data } = await supabaseClient.from('email_sequences').select('*').eq('project_id', projectId).order('created_at', { ascending: false });
    const list = document.getElementById('email-seq-list');
    if (!list) return;

    if (!data || data.length === 0) {
        list.innerHTML = '<p class="text-xs text-center" style="color: var(--text-muted);">No sequences created yet.</p>';
        return;
    }

    list.innerHTML = data.map(s => `
        <div class="p-3 rounded-lg flex items-center justify-between" style="background: var(--surface); border: 1px solid var(--border);">
            <div>
                <p class="text-xs font-bold" style="color: var(--text);">${escapeHtml(s.name)}</p>
                <p class="text-[10px] mono" style="color: var(--text-dim);">Trigger: ${s.trigger_event} · ${s.delay_hours}h delay</p>
            </div>
            <button onclick="deleteEmailSequence('${s.id}', '${projectId}')" class="text-red-400 text-xs">Delete</button>
        </div>
    `).join('');
};

window.saveEmailSequence = async function(projectId) {
    const name = document.getElementById('seq-name').value;
    const trigger = document.getElementById('seq-trigger').value;
    const delay = document.getElementById('seq-delay').value;
    const subject = document.getElementById('seq-subject').value;
    const body = document.getElementById('seq-body').value;

    if (!name || !subject) return showToast('Name and Subject are required', 'error');

    try {
        await supabaseClient.from('email_sequences').insert({
            project_id: projectId,
            name, trigger_event: trigger, delay_hours: delay, subject, body
        });
        showToast('Sequence created!');
        document.getElementById('seq-name').value = '';
        document.getElementById('seq-subject').value = '';
        document.getElementById('seq-body').value = '';
        loadEmailSequences(projectId);
    } catch (e) {
        showToast(e.message, 'error');
    }
};

window.deleteEmailSequence = async function(id, projectId) {
    await supabaseClient.from('email_sequences').delete().eq('id', id);
    loadEmailSequences(projectId);
};

// ---------------------------------------------------
// 2. GLOBAL SEARCH BAR (Command Palette)
// ---------------------------------------------------
window.openGlobalSearch = function() {
    let modal = document.getElementById('ukm-global-search-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ukm-global-search-modal';
        modal.className = 'hidden fixed inset-0 z-[100] flex items-start justify-center pt-20 p-4 bg-black/60 backdrop-blur-sm';
        document.body.appendChild(modal);
    }
    modal.classList.remove('hidden');

    modal.innerHTML = `
    <div class="w-full max-w-xl rounded-xl shadow-2xl overflow-hidden" style="background: var(--surface); border: 1px solid var(--border);">
        <div class="flex items-center px-4 py-3 border-b" style="border-color: var(--border);">
            <svg class="w-5 h-5 mr-3" style="color: var(--text-muted);" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            <input type="text" id="global-search-input" class="w-full bg-transparent focus:outline-none text-sm" style="color: var(--text);" placeholder="Search projects, tables, or actions..." oninput="runGlobalSearch(this.value)">
            <button onclick="document.getElementById('ukm-global-search-modal').classList.add('hidden')" class="text-xs px-2 py-1 rounded" style="background: var(--bg); color: var(--text-dim);">ESC</button>
        </div>
        <div id="global-search-results" class="p-2 max-h-96 overflow-y-auto">
            <p class="text-xs text-center py-4" style="color: var(--text-dim);">Type to search...</p>
        </div>
    </div>`;

    setTimeout(() => document.getElementById('global-search-input').focus(), 100);
};

window.runGlobalSearch = async function(query) {
    const resultsDiv = document.getElementById('global-search-results');
    if (!query || query.length < 2) {
        resultsDiv.innerHTML = '<p class="text-xs text-center py-4" style="color: var(--text-dim);">Type to search...</p>';
        return;
    }

    const term = query.toLowerCase();
    let html = '';

    // 1. Search Projects
    const matchedProjects = state.projectsCache.filter(p => p.name.toLowerCase().includes(term) || p.slug.toLowerCase().includes(term));
    if (matchedProjects.length > 0) {
        html += `<p class="text-[10px] uppercase font-bold mt-2 mb-1 px-2" style="color: var(--text-dim);">Projects</p>`;
        matchedProjects.forEach(p => {
            html += `<div class="px-3 py-2 rounded-lg cursor-pointer hover:bg-[var(--bg)] text-sm" onclick="document.getElementById('ukm-global-search-modal').classList.add('hidden'); openProjectDetail('${p.id}')">📁 ${escapeHtml(p.name)}</div>`;
        });
    }

    // 2. Search Tables (in current project)
    if (state.ukmDataTables) {
        const matchedTables = state.ukmDataTables.filter(t => t.table_name.toLowerCase().includes(term));
        if (matchedTables.length > 0) {
            html += `<p class="text-[10px] uppercase font-bold mt-4 mb-1 px-2" style="color: var(--text-dim);">Tables (Current Project)</p>`;
            matchedTables.forEach(t => {
                html += `<div class="px-3 py-2 rounded-lg cursor-pointer hover:bg-[var(--bg)] text-sm" onclick="document.getElementById('ukm-global-search-modal').classList.add('hidden'); viewTableData('${t.table_name}')">📊 ${escapeHtml(t.table_name)}</div>`;
            });
        }
    }

    // 3. Actions
    const actions = [
        { name: 'Create New Project', icon: '✨', action: "openProjectModal()" },
        { name: 'Go to Ukmbase Data', icon: '⚙️', action: "switchView('ukmdata')" },
        { name: 'Open UkmAI Copilot', icon: '🧠', action: "switchView('ukmai')" }
    ].filter(a => a.name.toLowerCase().includes(term));

    if (actions.length > 0) {
        html += `<p class="text-[10px] uppercase font-bold mt-4 mb-1 px-2" style="color: var(--text-dim);">Actions</p>`;
        actions.forEach(a => {
            html += `<div class="px-3 py-2 rounded-lg cursor-pointer hover:bg-[var(--bg)] text-sm" onclick="document.getElementById('ukm-global-search-modal').classList.add('hidden'); ${a.action}">${a.icon} ${a.name}</div>`;
        });
    }

    if (!html) {
        html = '<p class="text-xs text-center py-4" style="color: var(--text-dim);">No results found.</p>';
    }

    resultsDiv.innerHTML = html;
};

// ---------------------------------------------------
// 3. INJECT UI BUTTONS
// ---------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    // A. Inject "Email Sequences" into the Integrations tab
    const integrationsTab = document.getElementById('ukmdata-tab-integrations');
    if (integrationsTab) {
        const mailCard = document.getElementById('ukmdata-mail-card');
        if (mailCard) {
            const header = mailCard.querySelector('.flex.items-center.justify-between');
            if (header && !document.getElementById('btn-email-seqs')) {
                const btn = document.createElement('button');
                btn.id = 'btn-email-seqs';
                btn.className = 'text-xs font-bold px-3 py-2 rounded-lg text-white';
                btn.style.background = 'var(--accent)';
                btn.textContent = '+ Sequences';
                btn.onclick = () => openEmailSequencesModal(state.currentUkmDataProjectId);
                header.appendChild(btn);
            }
        }
    }

    // B. Inject Global Search Bar into Top Nav
    const navRight = document.querySelector('#dashboard-view nav .flex.items-center.gap-2');
    if (navRight && !document.getElementById('btn-global-search')) {
        const searchBtn = document.createElement('button');
        searchBtn.id = 'btn-global-search';
        searchBtn.className = 'p-2 rounded-lg hidden sm:flex items-center gap-2 px-3';
        searchBtn.style.background = 'var(--surface)';
        searchBtn.style.border = '1px solid var(--border)';
        searchBtn.style.color = 'var(--text-muted)';
        searchBtn.innerHTML = `
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            <span class="text-xs">Search</span>
            <kbd class="text-[10px] px-1.5 py-0.5 rounded" style="background: var(--bg); border: 1px solid var(--border);">⌘K</kbd>
        `;
        searchBtn.onclick = openGlobalSearch;
        
        // Insert first
        const themeToggle = document.getElementById('theme-toggle');
        navRight.insertBefore(searchBtn, navRight.firstChild);

        // Add Keyboard shortcut (Cmd+K or Ctrl+K)
        document.addEventListener('keydown', (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                openGlobalSearch();
            }
            if (e.key === 'Escape') {
                const modal = document.getElementById('ukm-global-search-modal');
                if (modal) modal.classList.add('hidden');
            }
        });
    }
});
// ============================================
// PHASE 13: BUG FIXES & GLOBAL ANALYTICS
// ============================================

// ---------------------------------------------------
// 1. FIX: GLOBAL SEARCH BUTTON (Show on mobile)
// ---------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    // Fix the search button to be visible on mobile
    const searchBtn = document.getElementById('btn-global-search');
    if (searchBtn) {
        searchBtn.classList.remove('hidden', 'sm:flex');
        searchBtn.classList.add('flex');
    }

    // FIX: Force Owner Console to appear for staff
    setTimeout(() => {
        if (state.currentProfile && STAFF_ROLES.includes(state.currentProfile.role)) {
            const navOwner = document.getElementById('nav-owner-wrap');
            if (navOwner) {
                navOwner.classList.remove('hidden');
                // If the original wrap was lost in the sidebar rebuild, append it
                if (!document.getElementById('nav-owner')) {
                    const sidebarNav = document.querySelector('#sidebar .p-3.space-y-1');
                    if (sidebarNav) {
                        const ownerHtml = `
                        <div class="pt-3 mt-3" style="border-top: 1px solid var(--border);">
                            <a href="#" class="nav-item" onclick="event.preventDefault(); switchView('owner');">
                                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
                                <span>Owner Console</span>
                            </a>
                        </div>`;
                        sidebarNav.insertAdjacentHTML('beforeend', ownerHtml);
                    }
                }
            }
        }
    }, 1500);
});

// ---------------------------------------------------
// 2. GLOBAL ANALYTICS DASHBOARD
// ---------------------------------------------------
window.loadAnalyticsDashboard = async function() {
    // Hide other views
    document.querySelectorAll('[id^="view-"]').forEach(el => el.classList.add('hidden'));
    
    let analyticsView = document.getElementById('view-analytics');
    if (!analyticsView) {
        analyticsView = document.createElement('div');
        analyticsView.id = 'view-analytics';
        analyticsView.className = 'flex-1 overflow-y-auto p-4 md:p-8';
        document.getElementById('dashboard-view').querySelector('main').appendChild(analyticsView);
    }
    analyticsView.classList.remove('hidden');

    analyticsView.innerHTML = `
        <div class="max-w-6xl mx-auto">
            <div class="mb-8">
                <h1 class="text-2xl font-bold mb-1" style="color: var(--text);">Analytics</h1>
                <p class="text-sm" style="color: var(--text-muted);">Platform overview and growth metrics.</p>
            </div>

            <!-- Stat Cards -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div class="p-5 rounded-xl" style="background: var(--surface); border: 1px solid var(--border);">
                    <p class="text-xs font-medium mb-2" style="color: var(--text-muted);">Total Users</p>
                    <div id="analytics-users" class="text-2xl font-bold mono" style="color: var(--text);">—</div>
                </div>
                <div class="p-5 rounded-xl" style="background: var(--surface); border: 1px solid var(--border);">
                    <p class="text-xs font-medium mb-2" style="color: var(--text-muted);">Total Projects</p>
                    <div id="analytics-projects" class="text-2xl font-bold mono" style="color: var(--text);">—</div>
                </div>
                <div class="p-5 rounded-xl" style="background: var(--surface); border: 1px solid var(--border);">
                    <p class="text-xs font-medium mb-2" style="color: var(--text-muted);">AI Tokens Used</p>
                    <div id="analytics-tokens" class="text-2xl font-bold mono" style="color: var(--amber);">—</div>
                </div>
                <div class="p-5 rounded-xl" style="background: var(--surface); border: 1px solid var(--border);">
                    <p class="text-xs font-medium mb-2" style="color: var(--text-muted);">Revenue (USD)</p>
                    <div id="analytics-revenue" class="text-2xl font-bold mono" style="color: var(--green);">—</div>
                </div>
            </div>

            <!-- Chart -->
            <div class="rounded-xl p-6 mb-8" style="background: var(--surface); border: 1px solid var(--border);">
                <div class="flex items-center justify-between mb-6">
                    <h2 class="text-lg font-bold" style="color: var(--text);">Revenue & Signups</h2>
                    <select id="chart-range" class="text-xs rounded px-2 py-1" style="background: var(--bg); border: 1px solid var(--border); color: var(--text);">
                        <option value="7">Last 7 Days</option>
                        <option value="30">Last 30 Days</option>
                    </select>
                </div>
                <div class="relative min-h-[300px]">
                    <canvas id="global-analytics-chart"></canvas>
                </div>
            </div>
        </div>
    `;

    // Fetch Data
    try {
        const [usersRes, projectsRes, paymentsRes] = await Promise.all([
            supabaseClient.from('profiles').select('created_at'),
            supabaseClient.from('projects').select('ai_tokens_used'),
            supabaseClient.from('payments').select('amount, paid_at').eq('status', 'paid')
        ]);

        const users = usersRes.data || [];
        const projects = projectsRes.data || [];
        const payments = paymentsRes.data || [];

        // Update Stats
        document.getElementById('analytics-users').textContent = users.length;
        document.getElementById('analytics-projects').textContent = projects.length;
        
        const totalTokens = projects.reduce((sum, p) => sum + (Number(p.ai_tokens_used) || 0), 0);
        document.getElementById('analytics-tokens').textContent = totalTokens.toLocaleString();
        
        const totalRevenue = payments.reduce((sum, p) => sum + Number(p.amount), 0);
        document.getElementById('analytics-revenue').textContent = '$' + totalRevenue.toFixed(2);

        // Render Chart
        renderGlobalChart(users, payments, 30);

    } catch (e) {
        showToast('Failed to load analytics: ' + e.message, 'error');
    }
};

function renderGlobalChart(users, payments, days) {
    if (window.globalChartInstance) {
        window.globalChartInstance.destroy();
    }

    // Prepare date labels for the last X days
    const labels = [];
    const revenueData = [];
    const signupData = [];
    
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        labels.push(dateStr);

        // Sum revenue for this day
        const dayRevenue = payments.filter(p => {
            const pd = new Date(p.paid_at);
            return pd.getDate() === d.getDate() && pd.getMonth() === d.getMonth();
        }).reduce((sum, p) => sum + Number(p.amount), 0);
        revenueData.push(dayRevenue);

        // Count signups for this day
        const daySignups = users.filter(u => {
            const ud = new Date(u.created_at);
            return ud.getDate() === d.getDate() && ud.getMonth() === d.getMonth();
        }).length;
        signupData.push(daySignups);
    }

    const ctx = document.getElementById('global-analytics-chart').getContext('2d');
    window.globalChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Revenue ($)',
                    data: revenueData,
                    borderColor: '#10B981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    fill: true,
                    tension: 0.4,
                    yAxisID: 'y'
                },
                {
                    label: 'Signups',
                    data: signupData,
                    borderColor: '#4F46E5',
                    backgroundColor: 'rgba(79, 70, 229, 0.1)',
                    fill: true,
                    tension: 0.4,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { labels: { color: '#94A3B8' } }
            },
            scales: {
                x: { ticks: { color: '#64748B' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y: { 
                    type: 'linear', display: true, position: 'left',
                    ticks: { color: '#10B981' }, grid: { color: 'rgba(255,255,255,0.05)' } 
                },
                y1: { 
                    type: 'linear', display: true, position: 'right',
                    ticks: { color: '#4F46E5' }, grid: { drawOnChartArea: false } 
                }
            }
        }
    });
}

// ---------------------------------------------------
// 3. INJECT ANALYTICS INTO SIDEBAR & ROUTING
// ---------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    // Add to sidebar under Project Overview
    setTimeout(() => {
        const overviewNav = document.getElementById('nav-overview');
        if (overviewNav && !document.getElementById('nav-analytics')) {
            const parent = overviewNav.parentElement;
            const analyticsLink = document.createElement('a');
            analyticsLink.href = '#';
            analyticsLink.id = 'nav-analytics';
            analyticsLink.className = 'nav-item';
            analyticsLink.innerHTML = `
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
                <span>Analytics</span>
            `;
            analyticsLink.onclick = (e) => {
                e.preventDefault();
                loadAnalyticsDashboard();
                document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
                analyticsLink.classList.add('active');
            };
            parent.insertBefore(analyticsLink, overviewNav.nextSibling);
        }
    }, 1500);
});

// Override switchView to handle analytics and hide it when leaving
const originalSwitchViewPhase13 = window.switchView;
window.switchView = function(view) {
    if (originalSwitchViewPhase13) originalSwitchViewPhase13(view);
    
    // Hide analytics if switching to a standard view
    if (view !== 'analytics') {
        const analyticsView = document.getElementById('view-analytics');
        if (analyticsView) analyticsView.classList.add('hidden');
    }
    // Update active state
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const activeNav = document.getElementById('nav-' + view);
    if (activeNav) activeNav.classList.add('active');
};
// ============================================
// PHASE 14: FORCE INJECT SIDEBAR ITEMS & FIX ANALYTICS
// ============================================

window.ensureSidebarExtras = function() {
    if (!state.currentUser) return;

    // Find the NEW visible sidebar group
    const navGroup = document.querySelector('#sidebar .nav-group');
    if (!navGroup) return;
    const navGroupItems = navGroup.querySelector('.nav-group-items');
    if (!navGroupItems) return;

    // 1. INJECT ANALYTICS (Next to Overview)
    if (!document.getElementById('nav-analytics')) {
        const overviewBtn = document.getElementById('nav-overview');
        if (overviewBtn) {
            const analyticsBtn = document.createElement('a');
            analyticsBtn.href = '#';
            analyticsBtn.id = 'nav-analytics';
            analyticsBtn.className = 'nav-item';
            analyticsBtn.innerHTML = `
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
                <span>Analytics</span>
            `;
            analyticsBtn.onclick = (e) => {
                e.preventDefault();
                window.switchView('analytics');
            };
            overviewBtn.parentNode.insertBefore(analyticsBtn, overviewBtn.nextSibling);
        }
    }

    // 2. INJECT OWNER CONSOLE (If user is staff)
    if (state.currentProfile && STAFF_ROLES.includes(state.currentProfile.role)) {
        if (!document.getElementById('nav-owner-new')) {
            // Add it at the very bottom of the sidebar
            const sidebarNav = document.querySelector('#sidebar .p-3.space-y-1');
            if (sidebarNav) {
                const ownerGroup = document.createElement('details');
                ownerGroup.className = 'nav-group';
                ownerGroup.open = true;
                ownerGroup.innerHTML = `
                    <summary>Owner <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="transform: none;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg></summary>
                    <div class="nav-group-items">
                        <a href="#" id="nav-owner-new" class="nav-item" style="color: var(--amber);">
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
                            <span>Owner Console</span>
                        </a>
                    </div>
                `;
                document.getElementById('nav-owner-new').onclick = (e) => {
                    e.preventDefault();
                    window.switchView('owner');
                };
                sidebarNav.appendChild(ownerGroup);
            }
        }
    }
};

// 3. FIX THE SWITCHVIEW ROUTING
// We override it one last time to handle 'analytics' and ensure the sidebar is always built.
const finalSwitchView = window.switchView;
window.switchView = function(view) {
    // Intercept 'analytics' because it's a custom view, not a standard one
    if (view === 'analytics') {
        document.querySelectorAll('[id^="view-"]').forEach(el => el.classList.add('hidden'));
        document.getElementById('view-analytics').classList.remove('hidden');
        
        // Update active sidebar state
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        document.getElementById('nav-analytics').classList.add('active');
        
        window.loadAnalyticsDashboard();
        
        // Close mobile sidebar
        document.getElementById('sidebar').classList.add('-translate-x-full');
        return;
    }

    // Run the original switch view
    if (finalSwitchView) finalSwitchView(view);
    
    // Ensure extras are injected after every view change
    setTimeout(window.ensureSidebarExtras, 50);
};

// 4. RUN ON STARTUP
// Hook into the profile load to make sure it runs immediately after login
const finalShowDashboard = window.showDashboardView;
window.showDashboardView = async function(user) {
    if (finalShowDashboard) await finalShowDashboard(user);
    setTimeout(window.ensureSidebarExtras, 500);
};

// Initial check just in case
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(window.ensureSidebarExtras, 1000);
});
// ============================================
// PHASE 15: BULLETPROOF SIDEBAR INJECTION
// ============================================

window.ensureSidebarExtras = function() {
    if (!state.currentUser) return;

    // Find the NEW visible sidebar group
    const navGroup = document.querySelector('#sidebar .nav-group');
    if (!navGroup) return;
    const navGroupItems = navGroup.querySelector('.nav-group-items');
    if (!navGroupItems) return;

    // 1. INJECT ANALYTICS (Next to Overview)
    if (!document.getElementById('nav-analytics')) {
        const overviewBtn = document.getElementById('nav-overview');
        if (overviewBtn) {
            const analyticsBtn = document.createElement('a');
            analyticsBtn.href = '#';
            analyticsBtn.id = 'nav-analytics';
            analyticsBtn.className = 'nav-item';
            analyticsBtn.innerHTML = `
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
                <span>Analytics</span>
            `;
            analyticsBtn.onclick = (e) => {
                e.preventDefault();
                window.switchView('analytics');
            };
            overviewBtn.parentNode.insertBefore(analyticsBtn, overviewBtn.nextSibling);
        }
    }

    // 2. INJECT OWNER CONSOLE (If user is staff)
    if (state.currentProfile && STAFF_ROLES.includes(state.currentProfile.role)) {
        if (!document.getElementById('nav-owner-new')) {
            const sidebarNav = document.querySelector('#sidebar .p-3.space-y-1');
            if (sidebarNav) {
                const ownerGroup = document.createElement('details');
                ownerGroup.className = 'nav-group';
                ownerGroup.open = true;
                
                // ✨ THE FIX: Put the onclick directly inside the HTML string!
                ownerGroup.innerHTML = `
                    <summary>Owner <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="transform: none;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg></summary>
                    <div class="nav-group-items">
                        <a href="#" id="nav-owner-new" class="nav-item" onclick="event.preventDefault(); window.switchView('owner');" style="color: var(--amber);">
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
                            <span>Owner Console</span>
                        </a>
                    </div>
                `;
                // Append it to the sidebar ONLY AFTER the HTML is built
                sidebarNav.appendChild(ownerGroup);
            }
        }
    }
};

// 3. FIX THE SWITCHVIEW ROUTING (Again, just to be safe)
const finalSwitchViewPhase15 = window.switchView;
window.switchView = function(view) {
    // Intercept 'analytics'
    if (view === 'analytics') {
        document.querySelectorAll('[id^="view-"]').forEach(el => el.classList.add('hidden'));
        const analyticsView = document.getElementById('view-analytics');
        if (analyticsView) analyticsView.classList.remove('hidden');
        
        // Update active state
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        const navAnalytics = document.getElementById('nav-analytics');
        if (navAnalytics) navAnalytics.classList.add('active');
        
        window.loadAnalyticsDashboard();
        
        // Close mobile sidebar
        const sidebar = document.getElementById('sidebar');
        if (sidebar) sidebar.classList.add('-translate-x-full');
        return;
    }

    // Run the original switch view
    if (finalSwitchViewPhase15) finalSwitchViewPhase15(view);
    
    // Ensure extras are injected after every view change
    setTimeout(window.ensureSidebarExtras, 100);
};

// 4. RUN ON STARTUP
document.addEventListener('DOMContentLoaded', () => {
    // Run it once on load
    setTimeout(window.ensureSidebarExtras, 1000);
    
    // Also run it whenever the dashboard opens
    const originalShowDashboardPhase15 = window.showDashboardView;
    window.showDashboardView = async function(user) {
        if (originalShowDashboardPhase15) await originalShowDashboardPhase15(user);
        setTimeout(window.ensureSidebarExtras, 500);
    };
});
// ============================================
// PHASE 16: THE SUPABASE-STYLE OVERHAUL
// ============================================

window.rebuildSidebar = function() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    // Hide the original ugly list
    const originalNav = sidebar.querySelector('.p-4.space-y-1');
    if (originalNav) originalNav.style.display = 'none';

    // Check if we already built the new one
    if (document.getElementById('ukm-pro-sidebar')) return;

    // Icons
    const ic = {
        chevron: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>',
        home: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg>',
        chart: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>',
        db: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"></path></svg>',
        ai: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>',
        code: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>',
        money: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>',
        sync: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>',
        settings: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>',
        tools: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>'
    };

    const makeItem = (id, icon, label, onclick) => `
        <a href="#" id="sb-${id}" class="sb-item" onclick="event.preventDefault(); ${onclick}">
            ${ic[icon] || ic.tools} <span>${label}</span>
        </a>
    `;

    const makeGroup = (title, items, open = false) => `
        <div class="sb-group ${open ? 'open' : ''}">
            <div class="sb-group-header" onclick="this.parentElement.classList.toggle('open')">
                <span>${title}</span> ${ic.chevron}
            </div>
            <div class="sb-items">${items}</div>
        </div>
    `;

    // Build the HTML
    let html = `<div id="ukm-pro-sidebar" class="sb-scroll">`;
    
    // Group 1: Project
    html += makeGroup('Project', `
        ${makeItem('overview', 'home', 'Overview', "window.switchView('overview')")}
        ${makeItem('analytics', 'chart', 'Analytics', "window.switchView('analytics')")}
        ${makeItem('settings', 'settings', 'Project Settings', "window.switchView('settings')")}
    `, true);

    // Group 2: Database
    html += makeGroup('Database', `
        ${makeItem('ukmdata', 'db', 'Data & Tables', "window.switchView('ukmdata')")}
        ${makeItem('ukmtables', 'db', 'UkmTables', "window.switchView('ukmtables')")}
        ${makeItem('ukmquery', 'code', 'UkmQuery', "window.switchView('ukmquery')")}
        ${makeItem('search', 'tools', 'Global Search', "openGlobalSearch()")}
        ${makeItem('backups', 'db', 'Backups', "openBackupModal()")}
    `, true);

    // Group 3: AI & Automation
    html += makeGroup('AI & Automation', `
        ${makeItem('ukmai', 'ai', 'UkmAI Copilot', "window.switchView('ukmai')")}
        ${makeItem('flow', 'ai', 'UkmFlow', "openFlowModal()")}
    `);

    // Group 4: Products
    html += makeGroup('Products', `
        ${makeItem('ukmpay', 'money', 'UkmPay', "window.switchView('ukmpay')")}
        ${makeItem('ukmsync', 'sync', 'UkmSync', "window.switchView('ukmsync')")}
        ${makeItem('connect', 'code', 'Connect App', "window.switchView('connect')")}
        ${makeItem('market', 'tools', 'UkmMarket', "loadMarketplace()")}
    `);

    // Group 5: Settings & Team
    html += makeGroup('Workspace', `
        ${makeItem('team', 'settings', 'Team', "window.switchView('team')")}
        ${makeItem('billing', 'money', 'Billing', "window.switchView('billing')")}
    `);

    // Group 6: Owner (Only for staff)
    if (state.currentProfile && STAFF_ROLES.includes(state.currentProfile.role)) {
        html += makeGroup('Staff Only', `
            ${makeItem('owner', 'settings', 'Owner Console', "window.switchView('owner')")}
        `);
    }

    html += `</div>`;

    // Inject into sidebar
    sidebar.appendChild(html);
    
    // Make sure the sidebar items trigger the original switchView and update UI state
    window.updateSidebarActiveState = function(view) {
        document.querySelectorAll('.sb-item').forEach(el => el.classList.remove('active'));
        const activeEl = document.getElementById('sb-' + view);
        if (activeEl) activeEl.classList.add('active');
    };
};

// Override switchView to handle analytics and update active states
const originalSwitchViewPhase16 = window.switchView;
window.switchView = function(view) {
    if (view === 'analytics') {
        document.querySelectorAll('[id^="view-"]').forEach(el => el.classList.add('hidden'));
        const analyticsView = document.getElementById('view-analytics');
        if (analyticsView) analyticsView.classList.remove('hidden');
        window.updateSidebarActiveState('analytics');
        window.loadAnalyticsDashboard();
        document.getElementById('sidebar').classList.add('-translate-x-full');
        return;
    }
    
    if (view === 'market') {
        window.updateSidebarActiveState('market');
        window.loadMarketplace();
        document.getElementById('sidebar').classList.add('-translate-x-full');
        return;
    }

    if (originalSwitchViewPhase16) originalSwitchViewPhase16(view);
    window.updateSidebarActiveState(view);
};

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        window.rebuildSidebar();
        // Auto-open Overview on boot
        window.updateSidebarActiveState('overview');
    }, 1000);
});
// ============================================
// PHASE 17: SIDEBAR FIX (Kill dynamic injection)
// ============================================

// 1. Stop the old buggy rebuild from running
window.rebuildSidebar = function() { /* Disabled - HTML is now hardcoded */ };

// 2. Fix the active state logic
window.updateSidebarActiveState = function(view) {
    // Remove active from all sidebar items
    document.querySelectorAll('.sb-item').forEach(el => el.classList.remove('active'));
    
    // Add active to the clicked one
    const activeEl = document.getElementById('nav-' + view);
    if (activeEl) activeEl.classList.add('active');
};

// 3. Take over the switchView function smoothly
const finalSwitchViewFix = window.switchView;
window.switchView = function(view) {
    // Intercept Analytics
    if (view === 'analytics') {
        document.querySelectorAll('[id^="view-"]').forEach(el => el.classList.add('hidden'));
        let analyticsView = document.getElementById('view-analytics');
        if (analyticsView) analyticsView.classList.remove('hidden');
        window.updateSidebarActiveState('analytics');
        window.loadAnalyticsDashboard();
        document.getElementById('sidebar').classList.add('-translate-x-full');
        return;
    }
    
    // Intercept UkmMarket
    if (view === 'market') {
        window.updateSidebarActiveState('market');
        window.loadMarketplace();
        document.getElementById('sidebar').classList.add('-translate-x-full');
        return;
    }

    // Run original view switch
    if (finalSwitchViewFix) finalSwitchViewFix(view);
    
    // Update the highlight
    window.updateSidebarActiveState(view);
};

// 4. Fix the active state on page load
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        window.updateSidebarActiveState('overview');
    }, 500);
});
// Bulletproof Icon Size Fix
(function fixIcons() {
    const style = document.createElement('style');
    style.innerHTML = `
        /* Force perfect icon sizing everywhere in the sidebar */
        #sidebar .sb-item svg, 
        #sidebar .sb-group-header svg {
            width: 18px !important;
            height: 18px !important;
            min-width: 18px !important;
            max-width: 18px !important;
            flex-shrink: 0 !important;
            display: inline-block !important;
        }
        #sidebar .sb-group-header svg {
            width: 12px !important;
            height: 12px !important;
            min-width: 12px !important;
        }
    `;
    document.head.appendChild(style);
})();
// ============================================
// PHASE 18: UKMRPC & UKMNOSQL (FUSION FEATURES)
// ============================================

// ---------------------------------------------------
// 1. UKMRPC (Serverless SQL Functions)
// ---------------------------------------------------
window.openRPCModal = function(projectId) {
    let modal = document.getElementById('ukmrpc-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ukmrpc-modal';
        modal.className = 'hidden fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm';
        document.body.appendChild(modal);
    }
    modal.classList.remove('hidden');

    modal.innerHTML = `
    <div class="w-full max-w-3xl rounded-2xl p-6 glow max-h-[90vh] flex flex-col" style="background: var(--surface); border: 1px solid var(--border);">
        <div class="flex items-center justify-between mb-4">
            <div><h2 class="text-lg font-bold" style="color: var(--text);">UkmRPC Builder</h2><p class="text-xs mt-1" style="color: var(--text-muted);">Write a custom Postgres function. Call it via REST.</p></div>
            <button onclick="document.getElementById('ukmrpc-modal').classList.add('hidden')" style="color: var(--text-muted);">✕</button>
        </div>
        
        <div class="flex-1 flex flex-col md:flex-row gap-4 min-h-0">
            <div class="flex-1 flex flex-col">
                <label class="block text-xs mb-1" style="color: var(--text-muted);">Function Definition (SQL)</label>
                <textarea id="rpc-sql-input" class="flex-1 w-full rounded-lg p-4 font-mono text-sm resize-none focus:outline-none" style="background: var(--bg); border: 1px solid var(--border); color: var(--cyan);">CREATE OR REPLACE FUNCTION calculate_total(order_id UUID)
RETURNS numeric AS $$
DECLARE
  total numeric;
BEGIN
  SELECT SUM(amount) INTO total FROM orders WHERE id = order_id;
  RETURN total;
END;
$$ LANGUAGE plpgsql;</textarea>
                <button onclick="deployRPC('${projectId}')" id="rpc-deploy-btn" class="mt-3 w-full font-bold py-2 rounded-lg text-white" style="background: var(--accent);">Deploy Function</button>
            </div>
            <div class="flex-1 flex flex-col">
                <label class="block text-xs mb-1" style="color: var(--text-muted);">API Usage</label>
                <div class="flex-1 rounded-lg p-4 overflow-auto font-mono text-xs" style="background: var(--bg); border: 1px solid var(--border);">
                    <pre id="rpc-api-snippet" style="color: var(--text-muted);">Deploy a function to see the API snippet...</pre>
                </div>
            </div>
        </div>
    </div>`;
};

window.deployRPC = async function(projectId) {
    const sql = document.getElementById('rpc-sql-input').value;
    const btn = document.getElementById('rpc-deploy-btn');
    const snippet = document.getElementById('rpc-api-snippet');
    
    btn.textContent = 'Deploying...'; btn.disabled = true;

    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        // We run this through our ukmdata edge function which executes raw SQL
        const res = await fetch(SUPABASE_URL + '/functions/v1/ukmdata', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'execute_sql', project_id: projectId, sql_query: sql })
        });
        
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        // Extract function name (naive regex for v0.1)
        const match = sql.match(/FUNCTION\s+([a-zA-Z0-9_]+)/i);
        const funcName = match ? match[1] : 'my_function';

        showToast('Function deployed successfully!');
        snippet.style.color = 'var(--green)';
        snippet.textContent = `// JavaScript SDK\nconst { data, error } = await supabase.rpc('${funcName}', {\n  order_id: '123e4567-e89b-12d3-a456-426614174000'\n})\n\n// cURL\ncurl -X POST '${SUPABASE_URL}/rest/v1/rpc/${funcName}' \\\n-H "apikey: ${SUPABASE_ANON_KEY}" \\\n-H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \\\n-H "Content-Type: application/json" \\\n-d '{"order_id": "123e4567-e89b-12d3-a456-426614174000"}'`;
    } catch (e) {
        showToast(e.message, 'error');
    } finally {
        btn.textContent = 'Deploy Function'; btn.disabled = false;
    }
};

// ---------------------------------------------------
// 2. UKMNOSQL (Firebase-style Document Collections)
// ---------------------------------------------------
window.openNoSQLModal = async function(projectId) {
    let modal = document.getElementById('ukmnosql-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ukmnosql-modal';
        modal.className = 'hidden fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm';
        document.body.appendChild(modal);
    }
    modal.classList.remove('hidden');

    modal.innerHTML = `
    <div class="w-full max-w-lg rounded-2xl p-6 glow" style="background: var(--surface); border: 1px solid var(--border);">
        <div class="flex items-center justify-between mb-4">
            <div><h2 class="text-lg font-bold" style="color: var(--text);">UkmNoSQL</h2><p class="text-xs mt-1" style="color: var(--text-muted);">Create a JSON document collection instantly.</p></div>
            <button onclick="document.getElementById('ukmnosql-modal').classList.add('hidden')" style="color: var(--text-muted);">✕</button>
        </div>
        
        <div class="space-y-4 mb-6">
            <div><label class="block text-xs mb-1" style="color: var(--text-muted);">Collection Name</label><input type="text" id="nosql-name" placeholder="e.g. user_settings" class="w-full rounded-lg px-3 py-2 text-sm mono" style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"></div>
            <button onclick="createNoSQLCollection('${projectId}')" id="nosql-create-btn" class="w-full font-bold py-2 rounded-lg text-white" style="background: var(--accent);">Create Collection</button>
        </div>

        <div id="nosql-collections-list" class="space-y-2 max-h-48 overflow-y-auto">
            <p class="text-xs text-center" style="color: var(--text-muted);">Loading collections...</p>
        </div>
    </div>`;

    loadNoSQLCollections(projectId);
};

window.loadNoSQLCollections = async function(projectId) {
    const { data } = await supabaseClient.from('project_collections').select('*').eq('project_id', projectId);
    const list = document.getElementById('nosql-collections-list');
    
    if (!data || data.length === 0) {
        list.innerHTML = '<p class="text-xs text-center" style="color: var(--text-muted);">No collections yet.</p>';
        return;
    }

    list.innerHTML = data.map(c => `
        <div class="p-3 rounded-lg flex items-center justify-between" style="background: var(--bg); border: 1px solid var(--border);">
            <div>
                <p class="text-sm font-bold mono" style="color: var(--cyan);">${escapeHtml(c.name)}</p>
                <p class="text-[10px]" style="color: var(--text-dim);">Firestore-style JSON</p>
            </div>
            <button onclick="deleteNoSQLCollection('${c.id}', '${c.name}', '${projectId}')" class="text-red-400 text-xs">Delete</button>
        </div>
    `).join('');
};

window.createNoSQLCollection = async function(projectId) {
    const name = document.getElementById('nosql-name').value.trim().toLowerCase();
    if (!name || !/^[a-z0-9_]+$/.test(name)) return showToast('Invalid name. Use lowercase letters, numbers, and underscores.', 'error');
    
    const btn = document.getElementById('nosql-create-btn');
    btn.textContent = 'Creating...'; btn.disabled = true;

    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        
        // 1. Create the actual table with a JSONB 'data' column
        const sql = `CREATE TABLE ${name} (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), data JSONB NOT NULL, created_at TIMESTAMPTZ DEFAULT now());`;
        
        const res = await fetch(SUPABASE_URL + '/functions/v1/ukmdata', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'execute_sql', project_id: projectId, sql_query: sql })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        // 2. Log it in our metadata table
        await supabaseClient.from('project_collections').insert({ project_id: projectId, name });

        showToast('Collection created!');
        document.getElementById('nosql-name').value = '';
        loadNoSQLCollections(projectId);
    } catch (e) {
        showToast(e.message, 'error');
    } finally {
        btn.textContent = 'Create Collection'; btn.disabled = false;
    }
};

window.deleteNoSQLCollection = async function(id, name, projectId) {
    if (!confirm('Delete this collection and all its data?')) return;
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        // Drop the table
        await fetch(SUPABASE_URL + '/functions/v1/ukmdata', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'execute_sql', project_id: projectId, sql_query: `DROP TABLE ${name};` })
        });
        // Remove metadata
        await supabaseClient.from('project_collections').delete().eq('id', id);
        showToast('Collection deleted');
        loadNoSQLCollections(projectId);
    } catch (e) {
        showToast(e.message, 'error');
    }
};

// ---------------------------------------------------
// 3. INJECT BUTTONS INTO THE DATA TAB
// ---------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    // We inject these buttons into the "Developer Hub" or "Tables" section
    const observer = new MutationObserver(() => {
        const tablesCard = document.getElementById('ukmdata-tables-card');
        if (tablesCard && !document.getElementById('btn-rpc-builder')) {
            const header = tablesCard.querySelector('.flex.items-center.justify-between');
            if (header) {
                // RPC Button
                const rpcBtn = document.createElement('button');
                rpcBtn.id = 'btn-rpc-builder';
                rpcBtn.className = 'text-xs font-bold px-3 py-2 rounded-lg text-white ml-2';
                rpcBtn.style.background = 'var(--purple)';
                rpcBtn.textContent = 'UkmRPC';
                rpcBtn.onclick = () => openRPCModal(state.currentUkmDataProjectId);
                
                // NoSQL Button
                const nosqlBtn = document.createElement('button');
                nosqlBtn.id = 'btn-nosql-builder';
                nosqlBtn.className = 'text-xs font-bold px-3 py-2 rounded-lg text-white ml-2';
                nosqlBtn.style.background = 'var(--amber)';
                nosqlBtn.textContent = 'UkmNoSQL';
                nosqlBtn.onclick = () => openNoSQLModal(state.currentUkmDataProjectId);

                // Insert into the header (before Import/Export)
                const btnGroup = header.querySelector('.flex.gap-2');
                if (btnGroup) {
                    btnGroup.insertBefore(nosqlBtn, btnGroup.firstChild);
                    btnGroup.insertBefore(rpcBtn, btnGroup.firstChild);
                }
            }
        }
    });
    const container = document.getElementById('ukmdata-panel');
    if (container) observer.observe(container, { childList: true, subtree: true });
});
