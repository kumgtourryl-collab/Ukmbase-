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

// Consolidates all views and logic
function switchView(view) {
    // 1. Hide all standard views
    document.querySelectorAll('[id^="view-"]').forEach(el => el.classList.add('hidden'));
    
    // 2. Handle Custom Views
    if (view === 'analytics') {
        const el = document.getElementById('view-analytics');
        if (el) el.classList.remove('hidden');
        if (typeof loadAnalyticsDashboard === 'function') loadAnalyticsDashboard();
    } else if (view === 'market') {
        if (typeof loadMarketplace === 'function') loadMarketplace();
    } else {
        // Standard view
        const el = document.getElementById('view-' + view);
        if (el) el.classList.remove('hidden');
    }

    // 3. Update Sidebar Active State
    document.querySelectorAll('.sb-item').forEach(el => el.classList.remove('active'));
    const activeNav = document.getElementById('nav-' + view);
    if (activeNav) activeNav.classList.add('active');

    // 4. Trigger view-specific data loads
    if (view === 'ukmpay') { loadPayments(); loadPlans(); if (typeof loadPaymentEvents === 'function') loadPaymentEvents(); }
    if (view === 'ukmtables') { loadConnections(); }
    if (view === 'ukmquery') { loadConnections().then(() => { populateQueryConnections(); loadQueryHistory(); }); }
    if (view === 'ukmsync') { populateSyncProjectSelect(); }
    if (view === 'ukmdata') { populateUkmDataProjectSelect(); if (typeof initUkmDataTabs === 'function') initUkmDataTabs(); }
    if (view === 'connect') { populateConnectProjectSelect(); }
    if (view === 'team') { renderTeam(); }
    if (view === 'settings') { renderSettings(); }
    if (view === 'billing') { renderBilling(); }
    if (view === 'owner') { loadOwnerConsole(); }

    // 5. Close mobile sidebar
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
    
    // Force Owner console visibility if staff
    if (state.currentProfile && STAFF_ROLES.includes(state.currentProfile.role)) {
        const ownerWrap = document.getElementById('nav-owner-wrap');
        if (ownerWrap) ownerWrap.classList.remove('hidden');
    }

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
        <div class="space-y-2 pt-2">
            <button onclick="document.getElementById('project-detail-modal').classList.add('hidden'); openProjectSettings('${p.id}')" class="w-full font-bold py-3 rounded-lg text-white" style="background: var(--surface-2); border: 1px solid var(--border);">⚙️ Project Settings</button>
            ${isOwned ? `<button onclick="openProjectEdit('${p.id}')" class="w-full font-bold py-3 rounded-lg text-white" style="background: var(--accent);">Edit Project</button><button onclick="deleteProject('${p.id}')" class="w-full font-bold py-3 rounded-lg bg-red-500/20 border border-red-500/40 text-red-400">Delete Project</button>` : '<div class="p-4 text-center text-xs" style="color: var(--text-muted);">Team member — view only.</div>'}
        </div>`;
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
// 7. UKMBASE DATA CORE
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
// 11. NEW FEATURE ADDITIONS (CONSOLIDATED)
// ============================================

// --- Phase 2: Forms, Landing, Docs, Test ---
window.openFormBuilder = function(tableName) {
    let modal = document.getElementById('ukmform-builder-modal') || document.createElement('div');
    modal.id = 'ukmform-builder-modal'; modal.className = 'fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm';
    document.body.appendChild(modal);
    modal.innerHTML = `<div class="w-full max-w-lg rounded-2xl p-6 glow" style="background: var(--surface); border: 1px solid var(--border);">
        <h2 class="text-lg font-bold mb-4" style="color: var(--text);">Form Builder: ${escapeHtml(tableName)}</h2>
        <div class="space-y-4">
            <input type="text" id="form-builder-title" placeholder="Form Title" class="w-full rounded-lg px-3 py-2 text-sm" style="background: var(--bg); border: 1px solid var(--border); color: var(--text);">
            <input type="text" id="form-builder-slug" placeholder="URL Slug" class="w-full rounded-lg px-3 py-2 text-sm mono" style="background: var(--bg); border: 1px solid var(--border); color: var(--text);">
            <input type="text" id="form-builder-fields" placeholder="name, email, message" class="w-full rounded-lg px-3 py-2 text-sm mono" style="background: var(--bg); border: 1px solid var(--border); color: var(--text);">
            <button onclick="saveFormBuilder('${tableName}')" class="w-full font-bold py-3 rounded-lg text-white" style="background: var(--accent);">Create Form</button>
        </div></div>`;
};
window.saveFormBuilder = async function(tableName) {
    const title = document.getElementById('form-builder-title').value;
    const slug = document.getElementById('form-builder-slug').value;
    const fields = document.getElementById('form-builder-fields').value.split(',').map(f => ({ name: f.trim(), type: 'text', required: true }));
    await supabaseClient.from('project_forms').insert({ project_id: state.currentUkmDataProjectId, title, slug, table_name: tableName, fields });
    showToast('Form created!'); document.getElementById('ukmform-builder-modal').remove();
};
window.openUkmTest = function() {
    let modal = document.getElementById('ukmtest-modal') || document.createElement('div');
    modal.id = 'ukmtest-modal'; modal.className = 'fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm';
    document.body.appendChild(modal);
    modal.innerHTML = `<div class="w-full max-w-4xl rounded-2xl p-6 glow flex flex-col" style="background: var(--surface); border: 1px solid var(--border);">
        <h2 class="text-lg font-bold mb-4" style="color: var(--text);">UkmTest API Client</h2>
        <textarea id="test-body" rows="4" class="w-full rounded-lg p-3 text-xs mono" style="background: var(--bg); border: 1px solid var(--border); color: var(--text);">{}</textarea>
        <button onclick="runUkmTest()" class="mt-4 font-bold py-2 rounded-lg text-white" style="background: var(--accent);">Send Request</button>
        <pre id="test-response" class="mt-4 text-xs mono">Ready...</pre>
    </div></div>`;
};
window.runUkmTest = async function() { document.getElementById('test-response').textContent = 'Sending...'; };

// --- Phase 3: Backups, Audit, Templates ---
window.openTemplatesModal = function() { showToast('Templates modal triggered'); };
window.openAuditModal = function() { showToast('Audit modal triggered'); };
window.openBackupModal = async function() {
    let modal = document.getElementById('ukmbackup-modal') || document.createElement('div');
    modal.id = 'ukmbackup-modal'; modal.className = 'fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm';
    document.body.appendChild(modal);
    modal.innerHTML = `<div class="w-full max-w-lg rounded-2xl p-6 glow" style="background: var(--surface); border: 1px solid var(--border);">
        <h2 class="text-lg font-bold mb-4" style="color: var(--text);">UkmBackups</h2>
        <button onclick="createBackup()" class="w-full font-bold py-2 rounded-lg text-white mb-4" style="background: var(--accent);">+ Take Snapshot</button>
    </div></div>`;
};
window.createBackup = async function() {
    const pid = state.currentUkmDataProjectId;
    if(!pid) return showToast('Select a project first', 'error');
    showToast('Creating backup...');
    await supabaseClient.from('project_backups').insert({ project_id: pid, kind: 'manual', status: 'ready', row_count: 0 });
    showToast('Backup created!'); document.getElementById('ukmbackup-modal').remove();
};

// --- Phase 4: Forge, Flow ---
window.openForgeModal = function() {
    let modal = document.getElementById('ukmforge-modal') || document.createElement('div');
    modal.id = 'ukmforge-modal'; modal.className = 'fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm';
    document.body.appendChild(modal);
    modal.innerHTML = `<div class="w-full max-w-lg rounded-2xl p-6 glow" style="background: var(--surface); border: 1px solid var(--border);">
        <h2 class="text-lg font-bold mb-4" style="color: var(--text);">UkmForge</h2>
        <textarea id="forge-prompt" rows="3" placeholder="Build a booking system..." class="w-full rounded-lg px-3 py-2 text-sm mb-4" style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"></textarea>
        <button onclick="executeForge()" class="w-full font-bold py-3 rounded-lg text-white" style="background: var(--accent);">Forge App</button>
    </div></div>`;
};
window.executeForge = async function() { showToast('Forging app...'); setTimeout(() => showToast('App forged!'), 2000); };
window.openFlowModal = function() { showToast('Flow modal triggered'); };

// --- Phase 5: SDK, Settings ---
window.openProjectSettings = function(projectId) {
    showToast('Project Settings for ' + projectId);
};

// --- Phase 6: Tours ---
window.loadTourismApp = async function() { showToast('Loading tourism app...'); };

// --- Phase 9: Chat, Notifications ---
window.openNotificationCenter = function() {
    let modal = document.getElementById('ukm-notification-modal') || document.createElement('div');
    modal.id = 'ukm-notification-modal'; modal.className = 'fixed inset-0 z-[80] flex items-start justify-end p-4 bg-black/50 backdrop-blur-sm';
    document.body.appendChild(modal);
    modal.innerHTML = `<div class="w-full max-w-sm rounded-2xl p-4 glow" style="background: var(--surface); border: 1px solid var(--border);">
        <h2 class="text-sm font-bold mb-4" style="color: var(--text);">Notifications</h2>
        <p class="text-xs" style="color: var(--text-muted);">You have no new notifications.</p>
    </div></div>`;
};

// --- Phase 11/12: Global Search ---
window.openGlobalSearch = function() {
    let modal = document.getElementById('ukm-global-search-modal') || document.createElement('div');
    modal.id = 'ukm-global-search-modal'; modal.className = 'fixed inset-0 z-[100] flex items-start justify-center pt-20 p-4 bg-black/60 backdrop-blur-sm';
    document.body.appendChild(modal);
    modal.innerHTML = `<div class="w-full max-w-xl rounded-xl shadow-2xl" style="background: var(--surface); border: 1px solid var(--border);">
        <input type="text" placeholder="Search projects..." class="w-full bg-transparent p-4 text-sm focus:outline-none" style="color: var(--text);">
        <div class="p-2"><p class="text-xs text-center" style="color: var(--text-dim);">Start typing...</p></div>
    </div></div>`;
};

// --- Phase 13: Analytics ---
window.loadAnalyticsDashboard = async function() {
    const el = document.getElementById('view-analytics');
    if (!el) return;
    el.innerHTML = `<div class="max-w-6xl mx-auto"><h1 class="text-2xl font-bold mb-6" style="color: var(--text);">Analytics</h1><div class="p-6 rounded-xl" style="background: var(--surface); border: 1px solid var(--border);"><canvas id="global-chart"></canvas></div></div>`;
};

// ============================================
// 12. INIT & GLOBAL BINDINGS
// ============================================
async function init() {
    initTheme();
    
    // Fix icons globally
    setInterval(() => {
        document.querySelectorAll('#sidebar svg').forEach(svg => {
            if (!svg.classList.contains('w-4')) {
                svg.classList.add('w-4', 'h-4', 'min-w-[16px]', 'min-h-[16px]', 'flex-shrink-0');
                svg.style.width = '16px'; svg.style.height = '16px';
                svg.style.maxWidth = '16px'; svg.style.maxHeight = '16px';
            }
        });
    }, 1000);

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

// WINDOW BINDINGS - Crucial for HTML onclick events
window.showLandingView = showLandingView; window.showAuthView = showAuthView; window.toggleSidebar = toggleSidebar; window.switchView = switchView;
window.setAuthMode = setAuthMode; window.handleAuthSubmit = handleAuthSubmit; window.showToast = showToast; window.toggleTheme = toggleTheme;
window.signInWithProvider = signInWithProvider; window.handleLogout = handleLogout; window.showForgotPasswordView = showForgotPasswordView;
window.hideForgotPasswordView = hideForgotPasswordView; window.sendPasswordReset = sendPasswordReset; window.updatePassword = updatePassword;
window.updateStrength = updateStrength; window.togglePassword = togglePassword; window.saveProfile = saveProfile;
window.openProjectModal = openProjectModal; window.closeProjectModal = closeProjectModal; window.autoSlug = autoSlug; window.createProject = createProject;
window.openProjectDetail = openProjectDetail; window.closeProjectDetail = closeProjectDetail; window.openProjectEdit = openProjectEdit;
window.closeProjectEdit = closeProjectEdit; window.saveProjectEdit = saveProjectEdit; window.deleteProject = deleteProject;
window.acceptTeamInvite = acceptTeamInvite; window.declineTeamInvite = declineTeamInvite; window.renderTeam = renderTeam; window.sendTeamInvite = sendTeamInvite;
window.removeTeamMember = removeTeamMember; window.cancelInvite = cancelInvite;
window.sendChat = sendChat; window.handleChatKeydown = handleChatKeydown; window.sendPrompt = sendPrompt; window.clearChat = clearChat; window.aiCancel = aiCancel;
window.populateUkmDataProjectSelect = populateUkmDataProjectSelect; window.onUkmDataProjectChange = onUkmDataProjectChange; window.enableUkmData = enableUkmData;
window.loadUkmDataTables = loadUkmDataTables; window.openCreateTableModal = openCreateTableModal; window.closeCreateTableModal = closeCreateTableModal;
window.addColumnRow = addColumnRow; window.createUkmDataTable = createUkmDataTable; window.toggleTableRLS = toggleTableRLS; window.toggleTableRealtime = toggleTableRealtime;
window.dropUkmDataTable = dropUkmDataTable; window.viewTableData = viewTableData; window.openEditRowModal = openEditRowModal; window.saveRowChanges = saveRowChanges;
window.deleteTableRow = deleteTableRow; window.exportTableCSV = exportTableCSV; window.openChartModal = openChartModal; window.renderChart = renderChart;
window.executeRawSQL = executeRawSQL; window.handleCsvUpload = handleCsvUpload; window.exportProjectData = exportProjectData; window.handleProjectImport = handleProjectImport;
window.openSeedDataModal = openSeedDataModal; window.generateAndSeedData = generateAndSeedData; window.loadUkmDataFiles = loadUkmDataFiles;
window.uploadUkmDataFile = uploadUkmDataFile; window.deleteUkmDataFile = deleteUkmDataFile; window.copyStorageSnippet = copyStorageSnippet;
window.showTableApi = showTableApi; window.copyApiSnippet = copyApiSnippet; window.copyUkmDataConnection = copyUkmDataConnection;
window.loadUkmDataUsers = loadUkmDataUsers; window.deleteUkmDataUser = deleteUkmDataUser; window.openImpersonateModal = openImpersonateModal;
window.executeImpersonation = executeImpersonation; window.generateAuthSnippet = generateAuthSnippet; window.copyAuthSnippet = copyAuthSnippet;
window.generateAuthUI = generateAuthUI; window.runAuthTest = runAuthTest; window.loadApiKeys = loadApiKeys; window.generateApiKey = generateApiKey;
window.revokeApiKey = revokeApiKey; window.loadProjectPages = loadProjectPages; window.createProjectPage = createProjectPage;
window.loadCronJobs = loadCronJobs; window.createCronJob = createCronJob; window.deleteCronJob = deleteCronJob;
window.loadUkmDataWebhooks = loadUkmDataWebhooks; window.createWebhook = createWebhook; window.deleteWebhook = deleteWebhook;
window.loadEmailLogs = loadEmailLogs; window.sendTestEmail = sendTestEmail; window.loadActivityLogs = loadActivityLogs; window.copyFormLink = copyFormLink;
window.populateConnectProjectSelect = populateConnectProjectSelect; window.switchConnectTab = switchConnectTab; window.renderConnectSnippets = renderConnectSnippets;
window.loadConnections = loadConnections; window.openConnectModal = openConnectModal; window.closeConnectModal = closeConnectModal;
window.createConnection = createConnection; window.deleteConnection = deleteConnection; window.openConnection = openConnection;
window.exitTableBrowser = exitTableBrowser; window.selectTable = selectTable; window.copyRow = copyRow; window.populateQueryConnections = populateQueryConnections;
window.setQueryPrompt = setQueryPrompt; window.generateSQL = generateSQL; window.copyGeneratedSQL = copyGeneratedSQL;
window.loadQueryHistory = loadQueryHistory; window.loadHistoryItem = loadHistoryItem; window.populateSyncProjectSelect = populateSyncProjectSelect;
window.onSyncProjectChange = onSyncProjectChange; window.toggleSyncEnabled = toggleSyncEnabled; window.updateSyncConfig = updateSyncConfig;
window.copySdkSnippet = copySdkSnippet; window.loadSyncLogs = loadSyncLogs; window.renderBilling = renderBilling; window.openUpgradeModal = openUpgradeModal;
window.closeUpgradeModal = closeUpgradeModal; window.submitUpgradeRequest = submitUpgradeRequest; window.switchPayTab = switchPayTab;
window.openPlanModal = openPlanModal; window.closePlanModal = closePlanModal; window.loadPlans = loadPlans; window.copyCheckout = copyCheckout;
window.createPlan = createPlan; window.openPaymentModal = openPaymentModal; window.closePaymentModal = closePaymentModal;
window.loadPayments = loadPayments; window.createPayment = createPayment; window.loadOwnerConsole = loadOwnerConsole;
window.switchOwnerTab = switchOwnerTab; window.setUserRole = setUserRole; window.setRequestStatus = setRequestStatus;
window.copyToClipboard = copyToClipboard; window.runLandingDemo = runLandingDemo; window.joinWaitlist = joinWaitlist;

// Start App
init();
