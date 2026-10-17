// UKMBASE APP.JS — v614 (UkmSync + Ukmbase Data + Per-Project Auth + Storage)

const SUPABASE_URL = 'https://dwjyzqsrzdgnpwibnyjn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_4vcPyg62OqmfwNaHxx0CGA_a7O0_NJV';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const PLAN_LIMITS = {
    free:       { projects: 2,   connections: 3,   repos: 1,   seats: 1   },
    pro:        { projects: 20,  connections: 20,  repos: 10,  seats: 1   },
    team:       { projects: 100, connections: 100, repos: 50,  seats: 3   },
    enterprise: { projects: 999, connections: 999, repos: 999, seats: 999 },
    staff:      { projects: 999, connections: 999, repos: 999, seats: 999 },
};

const STAFF_ROLES = ['owner', 'admin', 'support'];
const PLAN_PRICES = {
    free: { label: '$0/mo' }, pro: { label: '$19/mo' },
    team: { label: '$79/mo' }, enterprise: { label: 'Custom' },
};

const landingView = document.getElementById('landing-view');
const authView = document.getElementById('auth-view');
const dashboardView = document.getElementById('dashboard-view');
const userEmailDisplay = document.getElementById('user-email');

let currentUser = null;
let currentProfile = null;
let chatHistory = [];
let projectsCache = [];
let connectionsCache = [];
let teamCache = [];
let allUsersCache = [];
let syncConfigCache = null;
let activeConnection = null;
let activeTable = null;
let authMode = 'login';
let currentUpgradePlan = null;
let lastGeneratedSQL = '';
let editingProjectId = null;
let viewingProjectId = null;
let linkingProjectId = null;
let currentSyncProjectId = null;
let currentUkmDataProjectId = null;
let ukmDataSchema = null;
let ukmDataTables = [];
let ukmDataUsers = [];
let ukmDataFiles = [];
let ukmDataColumnCounter = 0;

// ============================================
// THEME
// ============================================

function initTheme() {
    const saved = localStorage.getItem('ukmbase-theme') || 'dark';
    applyTheme(saved);
}

function applyTheme(theme) {
    if (theme === 'light') document.documentElement.setAttribute('data-theme', 'light');
    else document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('ukmbase-theme', theme);
    const sunIcon = document.getElementById('theme-icon-sun');
    const moonIcon = document.getElementById('theme-icon-moon');
    if (sunIcon && moonIcon) {
        if (theme === 'light') { sunIcon.classList.remove('hidden'); moonIcon.classList.add('hidden'); }
        else { sunIcon.classList.add('hidden'); moonIcon.classList.remove('hidden'); }
    }
    const label = document.getElementById('settings-theme-label');
    if (label) label.textContent = theme === 'light' ? 'Light' : 'Dark';
}

function toggleTheme() {
    const current = localStorage.getItem('ukmbase-theme') || 'dark';
    applyTheme(current === 'dark' ? 'light' : 'dark');
    showToast('Switched to ' + (current === 'dark' ? 'light' : 'dark') + ' theme', 'success');
}

// ============================================
// TOAST
// ============================================

function showToast(message, type, duration) {
    type = type || 'success'; duration = duration || 3000;
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(function() {
        toast.style.opacity = '0'; toast.style.transition = 'all 0.3s ease';
        setTimeout(function() { toast.remove(); }, 300);
    }, duration);
}

// ============================================
// HEADERS
// ============================================

function getHeaders(key) {
    const headers = { 'apikey': key };
    if (key.indexOf('sb_publishable_') !== 0) headers['Authorization'] = 'Bearer ' + key;
    return headers;
}

// ============================================
// PLAN LIMITS
// ============================================

function getLimits() {
    if (currentProfile && STAFF_ROLES.indexOf(currentProfile.role) !== -1) return PLAN_LIMITS.staff;
    const plan = (currentProfile && currentProfile.plan) || 'free';
    return PLAN_LIMITS[plan] || PLAN_LIMITS.free;
}
function canCreateProject() { return projectsCache.length < getLimits().projects; }
function canCreateConnection() { return connectionsCache.length < getLimits().connections; }
function canLinkRepo() {
    const linked = projectsCache.filter(function(p) { return p.github_repo; }).length;
    return linked < getLimits().repos;
}
function getTeamSeatsUsed() {
    return 1 + teamCache.filter(function(m) { return m.status === 'active'; }).length;
}
function canInviteMember() {
    const limits = getLimits();
    const used = getTeamSeatsUsed();
    const pending = teamCache.filter(function(m) { return m.status === 'pending'; }).length;
    return used + pending < limits.seats;
}

// ============================================
// AUTH MODE
// ============================================

function setAuthMode(mode) {
    authMode = mode;
    const isSignup = mode === 'signup';
    document.getElementById('field-fullname').classList.toggle('hidden', !isSignup);
    document.getElementById('field-confirm').classList.toggle('hidden', !isSignup);
    document.getElementById('strength-meter').classList.toggle('hidden', !isSignup);
    document.getElementById('auth-submit').textContent = isSignup ? 'Create Account' : 'Sign In';
    document.getElementById('tab-login').classList.toggle('active', !isSignup);
    document.getElementById('tab-signup').classList.toggle('active', isSignup);
    document.getElementById('auth-error').classList.add('hidden');
    document.getElementById('auth-success').classList.add('hidden');
}

// ============================================
// PASSWORD HELPERS
// ============================================

function togglePassword(id, btn) {
    const input = document.getElementById(id);
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    btn.style.color = isPassword ? 'var(--accent)' : 'var(--text-dim)';
}

function updateStrength() {
    const pwd = document.getElementById('auth-password').value;
    let score = 0;
    if (pwd.length >= 8) score++;
    if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score++;
    if (/\d/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    if (pwd.length >= 12) score++;
    const colors = ['#EF4444', '#EF4444', '#F59E0B', '#06B6D4', '#10B981', '#10B981'];
    const labels = ['Too short', 'Weak', 'Fair', 'Good', 'Strong', 'Excellent'];
    for (let i = 1; i <= 5; i++) {
        const bar = document.getElementById('sb-' + i);
        if (bar) bar.style.background = i <= score ? colors[score] : 'var(--border)';
    }
    const labelEl = document.getElementById('strength-label');
    if (labelEl) {
        labelEl.textContent = pwd ? labels[score] : 'Password strength';
        labelEl.style.color = pwd ? colors[score] : 'var(--text-dim)';
    }
}

// ============================================
// VIEW SWITCHERS
// ============================================

function showLandingView() {
    landingView.classList.remove('hidden');
    authView.classList.add('hidden');
    dashboardView.classList.add('hidden');
}

function showAuthView() {
    landingView.classList.add('hidden');
    authView.classList.remove('hidden');
    dashboardView.classList.add('hidden');
    setAuthMode('login');
}

async function showDashboardView(user) {
    landingView.classList.add('hidden');
    authView.classList.add('hidden');
    dashboardView.classList.remove('hidden');
    if (user && user.email) userEmailDisplay.textContent = user.email;
    currentUser = user;
    await loadProfile();
    await loadTeam();
    await loadProjects();
    loadPayments(); loadPlans();
    loadConnections().then(function() { populateQueryConnections(); });
    loadMyUpgradeRequests();
    loadQueryHistory();
    switchView('overview');
}

function switchView(view) {
    const views = ['overview', 'ukmai', 'ukmquery', 'ukmsync', 'ukmdata', 'ukmtables', 'ukmpay', 'team', 'billing', 'settings', 'owner'];
    views.forEach(function(v) {
        const el = document.getElementById('view-' + v);
        const nav = document.getElementById('nav-' + v);
        if (!el) return;
        if (v === view) {
            el.classList.remove('hidden');
            if (nav) { nav.classList.add('sidebar-active'); nav.style.color = 'var(--text)'; }
        } else {
            el.classList.add('hidden');
            if (nav) { nav.classList.remove('sidebar-active'); nav.style.color = 'var(--text-muted)'; }
        }
    });
    if (view === 'ukmpay') { loadPayments(); loadPlans(); }
    if (view === 'ukmtables') { loadConnections(); }
    if (view === 'ukmquery') { loadConnections().then(function() { populateQueryConnections(); loadQueryHistory(); }); }
    if (view === 'ukmsync') { populateSyncProjectSelect(); }
    if (view === 'ukmdata') { populateUkmDataProjectSelect(); }
    if (view === 'team') { renderTeam(); }
    if (view === 'settings') { renderSettings(); }
    if (view === 'billing') { renderBilling(); }
    if (view === 'owner') { loadOwnerConsole(); }
    document.getElementById('sidebar').classList.add('-translate-x-full');
}

// ============================================
// PROFILE
// ============================================

function renderRoleBadge(role) {
    const badge = document.getElementById('role-badge');
    const navOwnerWrap = document.getElementById('nav-owner-wrap');
    if (!badge) return;
    badge.classList.remove('role-owner', 'role-admin', 'role-support', 'hidden');
    const isStaff = STAFF_ROLES.indexOf(role) !== -1;
    if (!role || role === 'user') badge.classList.add('hidden');
    else { badge.classList.add('role-' + role); badge.textContent = role.charAt(0).toUpperCase() + role.slice(1); }
    if (navOwnerWrap) navOwnerWrap.classList.toggle('hidden', !isStaff);
}

async function loadProfile() {
    if (!currentUser) return;
    const { data, error } = await supabaseClient.from('profiles').select('*').eq('id', currentUser.id).single();
    if (error) { console.error('Profile load:', error.message); return; }
    currentProfile = data;
    renderRoleBadge(data.role);
    supabaseClient.from('profiles').update({ last_login_at: new Date().toISOString() }).eq('id', currentUser.id).then(function() {});
}

function renderSettings() {
    if (!currentProfile) return;
    const initial = (currentProfile.full_name || currentProfile.username || 'U').charAt(0).toUpperCase();
    document.getElementById('settings-initial').textContent = initial;
    document.getElementById('settings-display-name').textContent = currentProfile.full_name || currentProfile.username || 'User';
    document.getElementById('settings-display-email').textContent = currentProfile.email || currentUser.email;
    document.getElementById('settings-plan').textContent = currentProfile.plan || 'free';
    const roleTag = document.getElementById('settings-role-tag');
    roleTag.classList.remove('role-owner', 'role-admin', 'role-support');
    const role = currentProfile.role || 'user';
    if (role === 'user') roleTag.classList.add('hidden');
    else { roleTag.classList.remove('hidden'); roleTag.classList.add('role-' + role); roleTag.textContent = role.charAt(0).toUpperCase() + role.slice(1); }
    document.getElementById('settings-fullname').value = currentProfile.full_name || '';
    document.getElementById('settings-username').value = currentProfile.username || '';
    document.getElementById('settings-phone').value = currentProfile.phone || '';
    document.getElementById('settings-country').value = currentProfile.country || '';
    const limits = getLimits();
    const displayPlan = STAFF_ROLES.indexOf(currentProfile.role) !== -1 ? currentProfile.role : (currentProfile.plan || 'free');
    document.getElementById('settings-plan-2').textContent = displayPlan;
    document.getElementById('settings-limit-projects').textContent = projectsCache.length + ' / ' + (limits.projects >= 999 ? '∞' : limits.projects);
    document.getElementById('settings-limit-connections').textContent = connectionsCache.length + ' / ' + (limits.connections >= 999 ? '∞' : limits.connections);
    document.getElementById('settings-limit-seats').textContent = getTeamSeatsUsed() + ' / ' + (limits.seats >= 999 ? '∞' : limits.seats);
    const themeLabel = document.getElementById('settings-theme-label');
    if (themeLabel) themeLabel.textContent = (localStorage.getItem('ukmbase-theme') || 'dark') === 'light' ? 'Light' : 'Dark';
}

async function saveProfile() {
    const full_name = document.getElementById('settings-fullname').value.trim();
    const username = document.getElementById('settings-username').value.trim();
    const phone = document.getElementById('settings-phone').value.trim();
    const country = document.getElementById('settings-country').value;
    const errEl = document.getElementById('settings-error');
    const succEl = document.getElementById('settings-success');
    const btn = document.getElementById('settings-save-btn');
    errEl.classList.add('hidden'); succEl.classList.add('hidden');
    if (!full_name || !username) { errEl.textContent = 'Full name and username are required.'; errEl.classList.remove('hidden'); return; }
    btn.textContent = 'Saving...'; btn.disabled = true;
    const { error } = await supabaseClient.from('profiles')
        .update({ full_name: full_name, username: username, phone: phone || null, country: country || null })
        .eq('id', currentUser.id);
    btn.textContent = 'Save Changes'; btn.disabled = false;
    if (error) { errEl.textContent = error.message.indexOf('duplicate') !== -1 ? 'That username is taken.' : error.message; errEl.classList.remove('hidden'); return; }
    succEl.textContent = 'Profile saved.'; succEl.classList.remove('hidden');
    await loadProfile(); renderSettings(); showToast('Profile saved', 'success');
}

// ============================================
// AUTH
// ============================================

async function handleAuthSubmit() {
    if (authMode === 'login') return handleLogin();
    return handleSignup();
}

async function handleLogin() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const errEl = document.getElementById('auth-error');
    errEl.classList.add('hidden');
    if (!email || !password) { errEl.textContent = 'Please fill in all fields.'; errEl.classList.remove('hidden'); return; }
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email: email, password: password });
    if (error) { errEl.textContent = error.message; errEl.classList.remove('hidden'); }
    else { showDashboardView(data.user); }
}

async function handleSignup() {
    const fullName = document.getElementById('auth-fullname').value.trim();
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const confirm = document.getElementById('auth-confirm').value;
    const errEl = document.getElementById('auth-error');
    const succEl = document.getElementById('auth-success');
    errEl.classList.add('hidden'); succEl.classList.add('hidden');
    if (!fullName || !email || !password || !confirm) { errEl.textContent = 'Please fill in all fields.'; errEl.classList.remove('hidden'); return; }
    if (password !== confirm) { errEl.textContent = 'Passwords do not match.'; errEl.classList.remove('hidden'); return; }
    if (password.length < 8) { errEl.textContent = 'Password must be at least 8 characters.'; errEl.classList.remove('hidden'); return; }
    const { data, error } = await supabaseClient.auth.signUp({ email: email, password: password, options: { data: { full_name: fullName } } });
    if (error) { errEl.textContent = error.message; errEl.classList.remove('hidden'); }
    else if (data.session) { showDashboardView(data.user); }
    else { succEl.textContent = 'Account created! Check your email to confirm.'; succEl.classList.remove('hidden'); }
}

async function signInWithProvider(provider) {
    const errEl = document.getElementById('auth-error');
    errEl.classList.add('hidden');
    const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: provider, options: { redirectTo: window.location.origin + window.location.pathname }
    });
    if (error) { errEl.textContent = error.message; errEl.classList.remove('hidden'); }
}

async function handleLogout() {
    await supabaseClient.auth.signOut();
    currentUser = null; currentProfile = null;
    showLandingView(); showToast('Signed out', 'success');
}

// ============================================
// WAITLIST
// ============================================

async function joinWaitlist() {
    const emailInput = document.getElementById('email-input');
    const submitBtn = document.getElementById('submit-btn');
    const formContainer = document.getElementById('waitlist-form');
    const successMessage = document.getElementById('waitlist-success');
    const email = emailInput.value;
    if (!email) return showToast('Please enter your email', 'error');
    submitBtn.innerText = 'Joining...'; submitBtn.disabled = true;
    const { error } = await supabaseClient.from('waitlist').insert([{ email: email }]);
    if (error) { showToast('Error: ' + error.message, 'error'); submitBtn.innerText = 'Join Waitlist'; submitBtn.disabled = false; }
    else { formContainer.classList.add('hidden'); successMessage.classList.remove('hidden'); }
}

// ============================================
// SIDEBAR
// ============================================

function toggleSidebar() { document.getElementById('sidebar').classList.toggle('-translate-x-full'); }

// ============================================
// TEAM
// ============================================

async function loadTeam() {
    if (!currentUser) return;
    const { data, error } = await supabaseClient.from('team_members').select('*')
        .eq('owner_id', currentUser.id).order('invited_at', { ascending: false });
    if (error) { console.error('Team load:', error.message); return; }
    teamCache = data || [];
}

function renderTeam() {
    const limits = getLimits();
    const used = getTeamSeatsUsed();
    const pending = teamCache.filter(function(m) { return m.status === 'pending'; }).length;
    const total = used + pending;
    const seatCap = limits.seats >= 999 ? '∞' : limits.seats;
    document.getElementById('team-seats-display').textContent = total + ' / ' + seatCap;
    document.getElementById('team-seats-bar').style.width = (limits.seats >= 999 ? 5 : Math.min(100, (total / limits.seats) * 100)) + '%';
    const planNote = document.getElementById('team-plan-note');
    const inviteCard = document.getElementById('team-invite-card');
    if (limits.seats <= 1) {
        planNote.textContent = 'Upgrade to Team ($79/mo) for 3 seats — you + 2 teammates.';
        inviteCard.classList.add('hidden');
    } else if (total >= limits.seats) {
        planNote.textContent = 'All ' + limits.seats + ' seats used. Remove someone or upgrade.';
        inviteCard.classList.add('hidden');
    } else {
        planNote.textContent = (limits.seats - total) + ' of ' + limits.seats + ' seats available.';
        inviteCard.classList.remove('hidden');
    }

    const activeList = document.getElementById('team-active-list');
    const active = teamCache.filter(function(m) { return m.status === 'active'; });
    let html = '<div class="flex items-center gap-3 p-3 rounded-lg" style="background: var(--bg); border: 1px solid var(--border);">' +
        '<div class="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold" style="background: rgba(79,70,229,0.2); border: 1px solid rgba(79,70,229,0.4); color: var(--accent);">' +
            (currentProfile.full_name || currentProfile.username || 'U').charAt(0).toUpperCase() +
        '</div>' +
        '<div class="flex-1 min-w-0"><p class="text-sm font-bold truncate" style="color: var(--text);">' + escapeHtml(currentProfile.full_name || currentProfile.username || 'You') + ' (you)</p>' +
        '<p class="text-xs mono truncate" style="color: var(--text-dim);">' + escapeHtml(currentUser.email) + '</p></div>' +
        '<span class="text-[9px] font-bold uppercase px-2 py-1 rounded role-owner">Owner</span></div>';
    active.forEach(function(m) {
        html += '<div class="flex items-center gap-3 p-3 rounded-lg" style="background: var(--bg); border: 1px solid var(--border);">' +
            '<div class="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold" style="background: rgba(6,182,212,0.2); border: 1px solid rgba(6,182,212,0.4); color: var(--cyan);">' + escapeHtml(m.invite_email.charAt(0).toUpperCase()) + '</div>' +
            '<div class="flex-1 min-w-0"><p class="text-sm font-bold truncate" style="color: var(--text);">' + escapeHtml(m.invite_email) + '</p>' +
            '<p class="text-xs capitalize" style="color: var(--text-dim);">' + escapeHtml(m.role) + '</p></div>' +
            '<select onchange="updateTeamRole(\'' + m.id + '\', this.value)" class="text-xs rounded-lg px-2 py-1" style="background: var(--surface); border: 1px solid var(--border); color: var(--text);">' +
                '<option value="member"' + (m.role === 'member' ? ' selected' : '') + '>member</option>' +
                '<option value="viewer"' + (m.role === 'viewer' ? ' selected' : '') + '>viewer</option>' +
                '<option value="admin"' + (m.role === 'admin' ? ' selected' : '') + '>admin</option></select>' +
            '<button onclick="removeTeamMember(\'' + m.id + '\')" class="p-2" style="color: var(--text-muted);">' +
                '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22"></path></svg></button></div>';
    });
    activeList.innerHTML = html;

    const pendingCard = document.getElementById('team-pending-card');
    const pendingList = document.getElementById('team-pending-list');
    const pendingItems = teamCache.filter(function(m) { return m.status === 'pending'; });
    if (pendingItems.length === 0) pendingCard.classList.add('hidden');
    else {
        pendingCard.classList.remove('hidden');
        let phtml = '';
        pendingItems.forEach(function(m) {
            phtml += '<div class="flex items-center gap-3 p-3 rounded-lg" style="background: var(--bg); border: 1px dashed var(--border);">' +
                '<div class="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold" style="background: rgba(245,158,11,0.2); border: 1px solid rgba(245,158,11,0.4); color: var(--amber);">?</div>' +
                '<div class="flex-1 min-w-0"><p class="text-sm font-bold truncate" style="color: var(--text);">' + escapeHtml(m.invite_email) + '</p>' +
                '<p class="text-xs" style="color: var(--amber);">Pending · ' + escapeHtml(m.role) + '</p></div>' +
                '<button onclick="cancelInvite(\'' + m.id + '\')" class="text-xs px-3 py-1 rounded" style="background: rgba(239,68,68,0.15); color: var(--red);">Cancel</button></div>';
        });
        pendingList.innerHTML = phtml;
    }
}

async function sendTeamInvite() {
    const email = document.getElementById('team-invite-email').value.trim().toLowerCase();
    const role = document.getElementById('team-invite-role').value;
    const errEl = document.getElementById('team-invite-error');
    const btn = document.getElementById('team-invite-btn');
    errEl.classList.add('hidden');
    if (!email || email.indexOf('@') === -1) { errEl.textContent = 'Enter a valid email.'; errEl.classList.remove('hidden'); return; }
    if (email === currentUser.email.toLowerCase()) { errEl.textContent = "You can't invite yourself."; errEl.classList.remove('hidden'); return; }
    if (!canInviteMember()) { errEl.textContent = 'No seats left. Remove a member or upgrade.'; errEl.classList.remove('hidden'); return; }
    const existing = teamCache.find(function(m) { return m.invite_email.toLowerCase() === email && m.status !== 'removed'; });
    if (existing) { errEl.textContent = 'Already invited or on team.'; errEl.classList.remove('hidden'); return; }
    btn.textContent = 'Sending...'; btn.disabled = true;
    const { error } = await supabaseClient.from('team_members').insert([{ owner_id: currentUser.id, invite_email: email, role: role, status: 'pending' }]);
    btn.textContent = 'Send Invite'; btn.disabled = false;
    if (error) { errEl.textContent = error.message; errEl.classList.remove('hidden'); return; }
    document.getElementById('team-invite-email').value = '';
    await loadTeam(); renderTeam();
    showToast('Invite sent to ' + email, 'success');
}

async function updateTeamRole(id, newRole) {
    const { error } = await supabaseClient.from('team_members').update({ role: newRole }).eq('id', id);
    if (error) { showToast('Failed: ' + error.message, 'error'); return; }
    await loadTeam(); renderTeam(); showToast('Role updated', 'success');
}

async function removeTeamMember(id) {
    if (!confirm('Remove this member from your team?')) return;
    const { error } = await supabaseClient.from('team_members').update({ status: 'removed' }).eq('id', id);
    if (error) { showToast('Failed: ' + error.message, 'error'); return; }
    await loadTeam(); renderTeam(); showToast('Member removed', 'success');
}

async function cancelInvite(id) {
    if (!confirm('Cancel this invite?')) return;
    const { error } = await supabaseClient.from('team_members').delete().eq('id', id);
    if (error) { showToast('Failed: ' + error.message, 'error'); return; }
    await loadTeam(); renderTeam(); showToast('Invite cancelled', 'success');
}

// ============================================
// PROJECTS
// ============================================

function openProjectModal() {
    if (!canCreateProject()) {
        if (confirm('Plan limit reached. Upgrade?')) switchView('billing');
        return;
    }
    document.getElementById('project-modal').classList.remove('hidden');
    document.getElementById('modal-error').classList.add('hidden');
    document.getElementById('project-name').value = '';
    document.getElementById('project-slug').value = '';
    document.getElementById('project-description').value = '';
}

function closeProjectModal() { document.getElementById('project-modal').classList.add('hidden'); }

function autoSlug() {
    const name = document.getElementById('project-name').value;
    document.getElementById('project-slug').value = name.toLowerCase().trim()
        .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');
}

async function loadProjects() {
    if (!currentUser) return;
    const loadingEl = document.getElementById('projects-loading');
    const gridEl = document.getElementById('projects-grid');
    const emptyEl = document.getElementById('empty-state');
    if (loadingEl) loadingEl.classList.remove('hidden');
    if (gridEl) gridEl.classList.add('hidden');
    if (emptyEl) emptyEl.classList.add('hidden');
    const { data, error } = await supabaseClient.from('projects').select('*').order('created_at', { ascending: false });
    if (loadingEl) loadingEl.classList.add('hidden');
    if (error) { console.error(error.message); return; }
    projectsCache = data || [];
    renderProjects(projectsCache);
    updateStats(projectsCache);
    populateProjectSelects();
}

function renderProjects(projects) {
    const emptyState = document.getElementById('empty-state');
    const grid = document.getElementById('projects-grid');
    if (!projects || projects.length === 0) {
        emptyState.classList.remove('hidden'); grid.classList.add('hidden'); return;
    }
    emptyState.classList.add('hidden'); grid.classList.remove('hidden');
    let html = '';
    projects.forEach(function(p) {
        const paused = p.status === 'paused';
        const isOwned = p.owner_id === currentUser.id;
        const statusColor = paused ? 'text-yellow-400 bg-yellow-400/10' : 'text-[#06B6D4] bg-[#06B6D4]/10';
        let repoPill = '';
        if (p.github_repo) {
            const parts = p.github_repo.split('/');
            const shortName = parts[1] || p.github_repo;
            repoPill = '<span class="mono flex items-center gap-1"><svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>' + escapeHtml(shortName) + '</span>';
        }
        const teamBadge = !isOwned ? '<span class="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded" style="background: rgba(139,92,246,0.15); color: #8B5CF6;">Team</span>' : '';
        html += '<div class="feature-card rounded-xl p-5" style="background: var(--surface); border: 1px solid var(--border);' + (paused ? ' opacity: 0.7;' : '') + '" onclick="openProjectDetail(\'' + p.id + '\')">' +
            '<div class="flex items-start justify-between mb-3">' +
                '<div class="w-10 h-10 rounded-lg flex items-center justify-center" style="background: rgba(79,70,229,0.1); border: 1px solid rgba(79,70,229,0.3);">' +
                    '<svg class="w-5 h-5" style="color: var(--accent);" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>' +
                '</div>' +
                '<div class="flex items-center gap-1">' + teamBadge + '<span class="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded ' + statusColor + '">' + (p.status || 'active') + '</span></div>' +
            '</div>' +
            '<h3 class="font-bold mb-1 truncate" style="color: var(--text);">' + escapeHtml(p.name) + '</h3>' +
            '<p class="text-xs mono mb-3 truncate" style="color: var(--text-muted);">' + escapeHtml(p.slug) + '</p>' +
            '<p class="text-sm line-clamp-2 mb-4" style="color: var(--text-muted);">' + escapeHtml(p.description || 'No description yet.') + '</p>' +
            '<div class="flex items-center justify-between text-[10px]" style="color: var(--text-dim);">' +
                '<span>' + new Date(p.created_at).toLocaleDateString() + '</span>' + repoPill + '</div></div>';
    });
    grid.innerHTML = html;
}

function updateStats(projects) {
    const tokens = projects.reduce(function(s, p) { return s + (Number(p.ai_tokens_used) || 0); }, 0);
    const syncs = projects.reduce(function(s, p) { return s + (Number(p.sync_ops_used) || 0); }, 0);
    const tEl = document.getElementById('stat-tokens');
    const sEl = document.getElementById('stat-syncs');
    if (tEl) tEl.innerHTML = tokens.toLocaleString() + ' <span class="text-xs font-normal" style="color: var(--text-dim);">/ 100k</span>';
    if (sEl) sEl.textContent = syncs.toLocaleString();
}

async function createProject() {
    const name = document.getElementById('project-name').value.trim();
    const slug = document.getElementById('project-slug').value.trim();
    const description = document.getElementById('project-description').value.trim();
    const errEl = document.getElementById('modal-error');
    const btn = document.getElementById('create-project-btn');
    errEl.classList.add('hidden');
    if (!name || !slug) { errEl.textContent = 'Project name is required.'; errEl.classList.remove('hidden'); return; }
    if (!canCreateProject()) { errEl.textContent = 'Plan limit reached.'; errEl.classList.remove('hidden'); return; }
    btn.innerText = 'Forging...'; btn.disabled = true;
    const { error } = await supabaseClient.from('projects').insert([{ owner_id: currentUser.id, name: name, slug: slug, description: description || null, status: 'active' }]);
    btn.innerText = 'Forge Project'; btn.disabled = false;
    if (error) { errEl.textContent = error.message.indexOf('duplicate') !== -1 ? 'That slug is already taken.' : error.message; errEl.classList.remove('hidden'); return; }
    closeProjectModal(); await loadProjects(); showToast('Project forged', 'success');
}

// ============================================
// PROJECT DETAIL
// ============================================

async function openProjectDetail(id) {
    const p = projectsCache.find(function(x) { return x.id === id; });
    if (!p) return;
    viewingProjectId = id;
    const isOwned = p.owner_id === currentUser.id;
    document.getElementById('pd-title').textContent = p.name;
    const body = document.getElementById('pd-body');
    const paused = p.status === 'paused';
    let repoBlock = '';
    if (p.github_repo) {
        repoBlock = '<div class="rounded-lg p-3 text-xs" style="background: var(--bg); border: 1px solid var(--border);">' +
            '<div class="flex items-center justify-between mb-2">' +
                '<span class="mono flex items-center gap-1" style="color: var(--text-muted);">' +
                    '<svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>' +
                    escapeHtml(p.github_repo) + '</span>' +
                '<button onclick="refreshRepoInfo(\'' + p.github_repo + '\')" class="text-[10px]" style="color: var(--cyan);">Refresh</button></div>' +
            '<div id="pd-repo-stats" style="color: var(--text-dim);">Loading repo info...</div></div>';
    }
    let actionButtons = '';
    if (isOwned) {
        actionButtons = '<button onclick="openGithubModal(\'' + p.id + '\')" class="w-full text-sm font-bold py-3 rounded-lg flex items-center justify-center gap-2" style="background: var(--bg); border: 1px solid var(--border); color: var(--text);">' +
                '<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>' +
                (p.github_repo ? 'Change Repository' : 'Link GitHub Repo') + '</button>' +
            '<button onclick="openProjectEdit(\'' + p.id + '\')" class="w-full text-sm font-bold py-3 rounded-lg text-white" style="background: var(--accent);">Edit Project</button>' +
            '<button onclick="toggleProjectPause(\'' + p.id + '\')" class="w-full text-sm font-bold py-3 rounded-lg" style="background: var(--bg); border: 1px solid var(--border); color: ' + (paused ? 'var(--green)' : 'var(--amber)') + ';">' + (paused ? 'Resume Project' : 'Pause Project') + '</button>' +
            '<button onclick="deleteProject(\'' + p.id + '\')" class="w-full text-sm font-bold py-3 rounded-lg bg-red-500/20 border border-red-500/40 text-red-400">Delete Project</button>';
    } else {
        actionButtons = '<div class="rounded-lg p-4 text-center text-xs" style="background: var(--bg); border: 1px solid var(--border); color: var(--text-muted);">You\'re a team member on this project — view only.</div>';
    }
    body.innerHTML = '<div class="flex items-center gap-3 flex-wrap">' +
            '<span class="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded ' + (paused ? 'text-yellow-400 bg-yellow-400/10' : 'text-[#06B6D4] bg-[#06B6D4]/10') + '">' + (p.status || 'active') + '</span>' +
            '<span class="text-xs mono" style="color: var(--text-dim);">' + escapeHtml(p.slug) + '</span>' +
            (!isOwned ? '<span class="text-[9px] font-bold uppercase px-2 py-0.5 rounded" style="background: rgba(139,92,246,0.15); color: #8B5CF6;">Team Project</span>' : '') + '</div>' +
        '<p class="text-sm" style="color: var(--text-muted);">' + escapeHtml(p.description || 'No description yet.') + '</p>' +
        '<div class="rounded-lg p-3 text-xs space-y-1" style="background: var(--bg); border: 1px solid var(--border);">' +
            '<div class="flex justify-between"><span style="color: var(--text-dim);">Created</span><span class="mono" style="color: var(--text-muted);">' + new Date(p.created_at).toLocaleDateString() + '</span></div>' +
            '<div class="flex justify-between"><span style="color: var(--text-dim);">AI Tokens</span><span class="mono" style="color: var(--text-muted);">' + (Number(p.ai_tokens_used) || 0).toLocaleString() + '</span></div></div>' +
        repoBlock + '<div class="space-y-2 pt-2">' + actionButtons + '</div>';
    document.getElementById('project-detail-modal').classList.remove('hidden');
    if (p.github_repo) refreshRepoInfo(p.github_repo);
}

function closeProjectDetail() { document.getElementById('project-detail-modal').classList.add('hidden'); viewingProjectId = null; }

async function refreshRepoInfo(repo) {
    const el = document.getElementById('pd-repo-stats');
    if (!el) return;
    try {
        const res = await fetch('https://api.github.com/repos/' + repo);
        if (!res.ok) throw new Error('Repo not found (' + res.status + ')');
        const data = await res.json();
        el.innerHTML = '<div class="flex justify-between"><span>Stars</span><span class="mono">' + (data.stargazers_count || 0) + '</span></div>' +
            '<div class="flex justify-between"><span>Language</span><span class="mono">' + escapeHtml(data.language || '—') + '</span></div>' +
            '<div class="flex justify-between"><span>Last push</span><span class="mono">' + (data.pushed_at ? new Date(data.pushed_at).toLocaleDateString() : '—') + '</span></div>';
    } catch (err) { el.innerHTML = '<span style="color: var(--red);">' + escapeHtml(err.message) + '</span>'; }
}

function openProjectEdit(id) {
    const p = projectsCache.find(function(x) { return x.id === id; });
    if (!p) return;
    if (p.owner_id !== currentUser.id) { showToast('Only the owner can edit', 'error'); return; }
    editingProjectId = id;
    document.getElementById('edit-project-name').value = p.name || '';
    document.getElementById('edit-project-slug').value = p.slug || '';
    document.getElementById('edit-project-description').value = p.description || '';
    document.getElementById('edit-error').classList.add('hidden');
    document.getElementById('project-edit-modal').classList.remove('hidden');
}

function closeProjectEdit() { document.getElementById('project-edit-modal').classList.add('hidden'); editingProjectId = null; }

async function saveProjectEdit() {
    if (!editingProjectId) return;
    const name = document.getElementById('edit-project-name').value.trim();
    const slug = document.getElementById('edit-project-slug').value.trim();
    const description = document.getElementById('edit-project-description').value.trim();
    const errEl = document.getElementById('edit-error');
    const btn = document.getElementById('save-project-btn');
    errEl.classList.add('hidden');
    if (!name || !slug) { errEl.textContent = 'Name and slug required.'; errEl.classList.remove('hidden'); return; }
    btn.textContent = 'Saving...'; btn.disabled = true;
    const { error } = await supabaseClient.from('projects').update({ name: name, slug: slug, description: description || null }).eq('id', editingProjectId);
    btn.textContent = 'Save Changes'; btn.disabled = false;
    if (error) { errEl.textContent = error.message.indexOf('duplicate') !== -1 ? 'That slug is taken.' : error.message; errEl.classList.remove('hidden'); return; }
    closeProjectEdit(); closeProjectDetail(); await loadProjects(); showToast('Project updated', 'success');
}

async function toggleProjectPause(id) {
    const p = projectsCache.find(function(x) { return x.id === id; });
    if (!p) return;
    if (p.owner_id !== currentUser.id) { showToast('Only the owner can pause', 'error'); return; }
    const newStatus = p.status === 'paused' ? 'active' : 'paused';
    const { error } = await supabaseClient.from('projects').update({ status: newStatus }).eq('id', id);
    if (error) { showToast('Failed: ' + error.message, 'error'); return; }
    closeProjectDetail(); await loadProjects();
    showToast(newStatus === 'paused' ? 'Project paused' : 'Project resumed', 'success');
}

async function deleteProject(id) {
    const p = projectsCache.find(function(x) { return x.id === id; });
    if (!p) return;
    if (p.owner_id !== currentUser.id) { showToast('Only the owner can delete', 'error'); return; }
    if (!confirm('Permanently delete "' + p.name + '"? This cannot be undone.')) return;
    const { error } = await supabaseClient.from('projects').delete().eq('id', id);
    if (error) { showToast('Failed: ' + error.message, 'error'); return; }
    closeProjectDetail(); await loadProjects(); showToast('Project deleted', 'success');
}

// ============================================
// GITHUB LINKING
// ============================================

function openGithubModal(id) {
    const p = projectsCache.find(function(x) { return x.id === id; });
    if (!p) return;
    if (p.owner_id !== currentUser.id) { showToast('Only owner can link repo', 'error'); return; }
    if (!p.github_repo && !canLinkRepo()) {
        if (confirm('Repo limit reached. Upgrade?')) { closeProjectDetail(); switchView('billing'); }
        return;
    }
    linkingProjectId = id;
    document.getElementById('gh-repo').value = p.github_repo || '';
    document.getElementById('gh-branch').value = p.github_branch || 'main';
    document.getElementById('gh-error').classList.add('hidden');
    document.getElementById('github-modal').classList.remove('hidden');
}

function closeGithubModal() { document.getElementById('github-modal').classList.add('hidden'); linkingProjectId = null; }

async function saveGithubLink() {
    if (!linkingProjectId) return;
    let repo = document.getElementById('gh-repo').value.trim();
    const branch = document.getElementById('gh-branch').value.trim() || 'main';
    const errEl = document.getElementById('gh-error');
    const btn = document.getElementById('save-gh-btn');
    errEl.classList.add('hidden');
    repo = repo.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '');
    if (!repo || repo.indexOf('/') === -1) { errEl.textContent = 'Use format: owner/repo'; errEl.classList.remove('hidden'); return; }
    btn.textContent = 'Verifying...'; btn.disabled = true;
    try {
        const res = await fetch('https://api.github.com/repos/' + repo);
        if (!res.ok) throw new Error(res.status === 404 ? 'Repository not found.' : 'GitHub error ' + res.status);
    } catch (err) { btn.textContent = 'Link Repository'; btn.disabled = false; errEl.textContent = err.message; errEl.classList.remove('hidden'); return; }
    const { error } = await supabaseClient.from('projects').update({ github_repo: repo, github_branch: branch, repo_connected_at: new Date().toISOString() }).eq('id', linkingProjectId);
    btn.textContent = 'Link Repository'; btn.disabled = false;
    if (error) { errEl.textContent = error.message; errEl.classList.remove('hidden'); return; }
    closeGithubModal(); closeProjectDetail(); await loadProjects(); showToast('GitHub repo linked', 'success');
}

// ============================================
// UKMAI
// ============================================

function handleChatKeydown(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } }

async function sendPrompt(text) { document.getElementById('chat-input').value = text; await sendChat(); }

async function sendChat() {
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send');
    const prompt = input.value.trim();
    if (!prompt) return;
    input.value = ''; input.style.height = 'auto'; sendBtn.disabled = true;
    appendMessage('user', prompt);
    const typingId = appendTypingIndicator();
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        const res = await fetch(SUPABASE_URL + '/functions/v1/ukmai', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: prompt, mode: 'default' })
        });
        const data = await res.json();
        removeTypingIndicator(typingId);
        if (data.error) appendMessage('ai', '**Error:** ' + data.error);
        else {
            appendMessage('ai', data.content || 'No response.');
            chatHistory.push({ role: 'user', content: prompt });
            chatHistory.push({ role: 'ai', content: data.content });
        }
    } catch (err) { removeTypingIndicator(typingId); appendMessage('ai', '**Network error:** ' + err.message); }
    sendBtn.disabled = false; input.focus();
}

function appendMessage(role, content) {
    const container = document.getElementById('chat-messages');
    if (container.querySelector('.text-center')) container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'flex gap-3 max-w-3xl mx-auto';
    if (role === 'user') {
        wrapper.className += ' flex-row-reverse';
        wrapper.innerHTML = '<div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style="background: rgba(79,70,229,0.2); border: 1px solid rgba(79,70,229,0.4);"><svg class="w-4 h-4" style="color: var(--accent);" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg></div>' +
            '<div class="rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[80%] text-sm text-white" style="background: var(--accent);">' + escapeHtml(content) + '</div>';
    } else {
        wrapper.innerHTML = '<div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style="background: rgba(245,158,11,0.2); border: 1px solid rgba(245,158,11,0.4);"><svg class="w-4 h-4 text-[#F59E0B]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"></path></svg></div>' +
            '<div class="rounded-2xl rounded-tl-sm px-4 py-3 max-w-[85%] text-sm chat-message" style="background: var(--surface); border: 1px solid var(--border); color: var(--text);">' + marked.parse(content) + '</div>';
    }
    container.appendChild(wrapper);
    wrapper.querySelectorAll('pre code').forEach(function(b) { hljs.highlightElement(b); });
    wrapper.querySelectorAll('pre').forEach(function(pre) {
        const btn = document.createElement('button');
        btn.className = 'copy-btn'; btn.innerText = 'Copy';
        btn.onclick = function() { navigator.clipboard.writeText(pre.querySelector('code').innerText); btn.innerText = 'Copied!'; setTimeout(function() { btn.innerText = 'Copy'; }, 1500); };
        pre.style.position = 'relative'; pre.appendChild(btn);
    });
    container.scrollTop = container.scrollHeight;
}

function appendTypingIndicator() {
    const container = document.getElementById('chat-messages');
    if (container.querySelector('.text-center')) container.innerHTML = '';
    const id = 'typing-' + Date.now();
    const wrapper = document.createElement('div');
    wrapper.id = id; wrapper.className = 'flex gap-3 max-w-3xl mx-auto';
    wrapper.innerHTML = '<div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style="background: rgba(245,158,11,0.2); border: 1px solid rgba(245,158,11,0.4);"><svg class="w-4 h-4 text-[#F59E0B]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"></path></svg></div>' +
        '<div class="rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1" style="background: var(--surface); border: 1px solid var(--border);">' +
            '<span class="typing-dot w-2 h-2 rounded-full" style="background: var(--text-muted);"></span>' +
            '<span class="typing-dot w-2 h-2 rounded-full" style="background: var(--text-muted);"></span>' +
            '<span class="typing-dot w-2 h-2 rounded-full" style="background: var(--text-muted);"></span></div>';
    container.appendChild(wrapper); container.scrollTop = container.scrollHeight;
    return id;
}

function removeTypingIndicator(id) { const el = document.getElementById(id); if (el) el.remove(); }

function clearChat() {
    document.getElementById('chat-messages').innerHTML = '<div class="text-center py-8"><h3 class="font-bold mb-1" style="color: var(--text);">Chat cleared</h3><p class="text-xs" style="color: var(--text-muted);">Describe your next app.</p></div>';
    chatHistory = [];
}

// ============================================
// UKMQUERY
// ============================================

function populateQueryConnections() {
    const sel = document.getElementById('query-connection');
    if (!sel) return;
    const current = sel.value;
    let html = '<option value="">— no database selected —</option>';
    connectionsCache.forEach(function(c) { html += '<option value="' + c.id + '">' + escapeHtml(c.name) + '</option>'; });
    sel.innerHTML = html;
    if (current) sel.value = current;
}

function setQueryPrompt(text) { document.getElementById('query-prompt').value = text; document.getElementById('query-prompt').focus(); }

async function generateSQL() {
    const prompt = document.getElementById('query-prompt').value.trim();
    const submitBtn = document.getElementById('query-submit');
    const outputWrap = document.getElementById('query-output-wrap');
    const outputEl = document.getElementById('query-output');
    const loadingEl = document.getElementById('query-loading');
    const warningEl = document.getElementById('query-warning');
    if (!prompt) { showToast('Describe what you want first', 'error'); return; }
    const connId = document.getElementById('query-connection').value;
    let contextPrompt = prompt;
    if (connId) {
        const conn = connectionsCache.find(function(c) { return c.id === connId; });
        if (conn) contextPrompt = 'Database: ' + conn.name + '\n\nTask: ' + prompt;
    }
    submitBtn.disabled = true; submitBtn.innerHTML = 'Generating...';
    outputWrap.classList.add('hidden'); loadingEl.classList.remove('hidden'); warningEl.classList.add('hidden');
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        const res = await fetch(SUPABASE_URL + '/functions/v1/ukmai', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: contextPrompt, mode: 'sql' })
        });
        const data = await res.json();
        loadingEl.classList.add('hidden'); submitBtn.disabled = false; submitBtn.innerHTML = 'Generate SQL';
        if (data.error) { outputWrap.classList.remove('hidden'); outputEl.innerHTML = '<p style="color: var(--red);" class="text-sm">' + escapeHtml(data.error) + '</p>'; return; }
        const raw = data.content || '';
        const match = raw.match(/```(?:sql)?\s*([\s\S]*?)```/i);
        const sql = match ? match[1].trim() : raw.trim();
        lastGeneratedSQL = sql;
        outputWrap.classList.remove('hidden');
        if (/^\s*--\s*WARNING: destructive/i.test(sql) || /\b(DROP|DELETE|TRUNCATE)\b/i.test(sql)) warningEl.classList.remove('hidden');
        outputEl.innerHTML = '<pre><code class="language-sql">' + escapeHtml(sql) + '</code></pre>';
        outputEl.querySelectorAll('pre code').forEach(function(b) { hljs.highlightElement(b); });
        const pre = outputEl.querySelector('pre');
        if (pre) {
            pre.style.position = 'relative';
            const btn = document.createElement('button');
            btn.className = 'copy-btn'; btn.innerText = 'Copy';
            btn.onclick = function() { navigator.clipboard.writeText(sql); btn.innerText = 'Copied!'; setTimeout(function() { btn.innerText = 'Copy'; }, 1500); };
            pre.appendChild(btn);
        }
        await saveQueryToHistory(connId || null, prompt, sql);
    } catch (err) {
        loadingEl.classList.add('hidden'); submitBtn.disabled = false; submitBtn.innerHTML = 'Generate SQL';
        outputWrap.classList.remove('hidden');
        outputEl.innerHTML = '<p style="color: var(--red);" class="text-sm">Network error: ' + escapeHtml(err.message) + '</p>';
    }
}

function copyGeneratedSQL() { if (!lastGeneratedSQL) return; navigator.clipboard.writeText(lastGeneratedSQL); showToast('SQL copied', 'success'); }

async function saveQueryToHistory(connectionId, prompt, sql) {
    if (!currentUser) return;
    const { error } = await supabaseClient.from('query_history').insert([{ user_id: currentUser.id, connection_id: connectionId, prompt: prompt, generated_sql: sql }]);
    if (error) { console.error('Query history:', error.message); return; }
    await loadQueryHistory();
}

async function loadQueryHistory() {
    if (!currentUser) return;
    const wrap = document.getElementById('query-history-wrap');
    const list = document.getElementById('query-history-list');
    if (!wrap || !list) return;
    const { data, error } = await supabaseClient.from('query_history').select('*')
        .eq('user_id', currentUser.id).order('created_at', { ascending: false }).limit(10);
    if (error) { console.error(error.message); return; }
    if (!data || data.length === 0) { wrap.classList.add('hidden'); return; }
    wrap.classList.remove('hidden');
    let html = '';
    data.forEach(function(h) {
        html += '<div class="rounded-xl p-3 cursor-pointer" style="background: var(--surface); border: 1px solid var(--border);" onclick="loadHistoryItem(\'' + h.id + '\')">' +
            '<div class="flex items-start justify-between mb-1"><p class="text-xs font-medium flex-1 pr-2 line-clamp-2" style="color: var(--text);">' + escapeHtml(h.prompt) + '</p>' +
            '<span class="text-[10px] flex-shrink-0 mono" style="color: var(--text-dim);">' + new Date(h.created_at).toLocaleDateString() + '</span></div>' +
            '<p class="text-[10px] mono truncate" style="color: var(--cyan);">' + escapeHtml(h.generated_sql.split('\n')[0]) + '</p></div>';
    });
    list.innerHTML = html;
}

async function loadHistoryItem(id) {
    const { data, error } = await supabaseClient.from('query_history').select('*').eq('id', id).single();
    if (error || !data) return;
    document.getElementById('query-prompt').value = data.prompt;
    lastGeneratedSQL = data.generated_sql;
    const outputWrap = document.getElementById('query-output-wrap');
    const outputEl = document.getElementById('query-output');
    const warningEl = document.getElementById('query-warning');
    outputWrap.classList.remove('hidden'); warningEl.classList.add('hidden');
    if (/^\s*--\s*WARNING: destructive/i.test(data.generated_sql) || /\b(DROP|DELETE|TRUNCATE)\b/i.test(data.generated_sql)) warningEl.classList.remove('hidden');
    outputEl.innerHTML = '<pre><code class="language-sql">' + escapeHtml(data.generated_sql) + '</code></pre>';
    outputEl.querySelectorAll('pre code').forEach(function(b) { hljs.highlightElement(b); });
    outputWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ============================================
// UKMSYNC
// ============================================

function populateSyncProjectSelect() {
    const sel = document.getElementById('sync-project-select');
    if (!sel) return;
    const own = projectsCache.filter(function(p) { return p.owner_id === currentUser.id; });
    if (own.length === 0) {
        document.getElementById('sync-empty').classList.remove('hidden');
        document.getElementById('sync-panel').classList.add('hidden');
        sel.innerHTML = '<option value="">— no projects —</option>';
        return;
    }
    document.getElementById('sync-empty').classList.add('hidden');
    let html = '';
    own.forEach(function(p) { html += '<option value="' + p.id + '">' + escapeHtml(p.name) + '</option>'; });
    const current = sel.value;
    sel.innerHTML = html;
    if (current && own.find(function(p) { return p.id === current; })) sel.value = current;
    else sel.value = own[0].id;
    onSyncProjectChange();
}

async function onSyncProjectChange() {
    const sel = document.getElementById('sync-project-select');
    if (!sel || !sel.value) { document.getElementById('sync-panel').classList.add('hidden'); return; }
    currentSyncProjectId = sel.value;
    await loadSyncConfig(currentSyncProjectId);
    renderSyncPanel();
    loadSyncLogs();
}

async function loadSyncConfig(projectId) {
    const { data, error } = await supabaseClient.from('sync_configs').select('*').eq('project_id', projectId).maybeSingle();
    if (error) { console.error('Sync config load:', error.message); return; }
    if (data) { syncConfigCache = data; return; }
    const { data: created, error: createErr } = await supabaseClient.from('sync_configs').insert([{
        project_id: projectId, enabled: false, conflict_strategy: 'last-write-wins', tables_to_sync: [], poll_interval_ms: 15000
    }]).select().single();
    if (createErr) { console.error('Sync config create:', createErr.message); return; }
    syncConfigCache = created;
}

function renderSyncPanel() {
    const panel = document.getElementById('sync-panel');
    if (!panel || !syncConfigCache) return;
    panel.classList.remove('hidden');
    document.getElementById('sync-enabled').checked = !!syncConfigCache.enabled;
    document.getElementById('sync-strategy').value = syncConfigCache.conflict_strategy || 'last-write-wins';
    document.getElementById('sync-tables').value = (syncConfigCache.tables_to_sync || []).join(', ');
    document.getElementById('sync-interval').value = syncConfigCache.poll_interval_ms || 15000;
    generateSdkSnippet();
}

async function toggleSyncEnabled() {
    if (!syncConfigCache) return;
    const enabled = document.getElementById('sync-enabled').checked;
    const { error } = await supabaseClient.from('sync_configs').update({ enabled: enabled }).eq('id', syncConfigCache.id);
    if (error) { showToast('Failed: ' + error.message, 'error'); return; }
    syncConfigCache.enabled = enabled;
    showToast(enabled ? 'Sync enabled' : 'Sync paused', 'success');
}

async function updateSyncConfig() {
    if (!syncConfigCache) return;
    const strategy = document.getElementById('sync-strategy').value;
    const tablesRaw = document.getElementById('sync-tables').value.trim();
    const interval = parseInt(document.getElementById('sync-interval').value, 10) || 15000;
    const tables = tablesRaw ? tablesRaw.split(',').map(function(t) { return t.trim(); }).filter(Boolean) : [];
    const { error } = await supabaseClient.from('sync_configs').update({
        conflict_strategy: strategy, tables_to_sync: tables, poll_interval_ms: interval
    }).eq('id', syncConfigCache.id);
    if (error) { showToast('Failed: ' + error.message, 'error'); return; }
    syncConfigCache.conflict_strategy = strategy;
    syncConfigCache.tables_to_sync = tables;
    syncConfigCache.poll_interval_ms = interval;
    generateSdkSnippet();
    showToast('Config saved', 'success');
}

function generateSdkSnippet() {
    const el = document.getElementById('sync-snippet');
    if (!el || !syncConfigCache) return;
    const proj = projectsCache.find(function(p) { return p.id === currentSyncProjectId; });
    const projectSlug = proj ? proj.slug : 'unknown';
    const snippet = '<!-- UkmSync SDK -->\n' +
        '<script\n' +
        '  src="https://kumgtourryl-collab.github.io/Ukmbase-/ukmsync.js"\n' +
        '  data-ukm-project="' + projectSlug + '"\n' +
        '  data-ukm-backend-url="https://ukmsync-server.onrender.com"\n' +
        '  data-ukm-supabase-url="' + SUPABASE_URL + '"\n' +
        '  data-ukm-anon-key="' + SUPABASE_ANON_KEY + '"\n' +
        '  data-ukm-enabled="' + (syncConfigCache.enabled ? 'true' : 'false') + '"\n' +
        '  data-ukm-strategy="' + syncConfigCache.conflict_strategy + '"\n' +
        '  data-ukm-tables="' + ((syncConfigCache.tables_to_sync || []).join(',')) + '"\n' +
        '  data-ukm-poll-ms="' + (syncConfigCache.poll_interval_ms || 15000) + '"\n' +
        '  defer\n' +
        '><\/script>';
    el.textContent = snippet;
}

function copySdkSnippet() {
    const el = document.getElementById('sync-snippet');
    if (!el) return;
    navigator.clipboard.writeText(el.textContent);
    showToast('SDK snippet copied', 'success');
}

async function loadSyncLogs() {
    if (!currentSyncProjectId) return;
    const loading = document.getElementById('sync-logs-loading');
    const list = document.getElementById('sync-logs-list');
    const empty = document.getElementById('sync-logs-empty');
    loading.classList.remove('hidden'); list.classList.add('hidden'); empty.classList.add('hidden');
    const { data, error } = await supabaseClient.from('sync_logs').select('*')
        .eq('project_id', currentSyncProjectId).order('created_at', { ascending: false }).limit(20);
    loading.classList.add('hidden');
    if (error) { console.error(error.message); empty.classList.remove('hidden'); return; }
    if (!data || data.length === 0) { empty.classList.remove('hidden'); return; }
    list.classList.remove('hidden');
    let html = '';
    data.forEach(function(log) {
        const colors = { queued: 'text-yellow-400 bg-yellow-400/10', synced: 'text-green-400 bg-green-400/10', conflict: 'text-orange-400 bg-orange-400/10', error: 'text-red-400 bg-red-400/10', pull: 'text-[#06B6D4] bg-[#06B6D4]/10' };
        const cls = colors[log.event_type] || 'text-[#94A3B8] bg-[#94A3B8]/10';
        html += '<div class="rounded-lg p-3 flex items-start justify-between" style="background: var(--bg); border: 1px solid var(--border);">' +
            '<div class="min-w-0 flex-1"><div class="flex items-center gap-2 mb-1">' +
                '<span class="text-[9px] font-bold uppercase px-2 py-0.5 rounded ' + cls + '">' + escapeHtml(log.event_type) + '</span>' +
                (log.table_name ? '<span class="text-[10px] mono" style="color: var(--text-muted);">' + escapeHtml(log.table_name) + '</span>' : '') +
                (log.record_count ? '<span class="text-[10px] mono" style="color: var(--text-dim);">× ' + log.record_count + '</span>' : '') +
            '</div>' +
            (log.message ? '<p class="text-xs truncate" style="color: var(--text-muted);">' + escapeHtml(log.message) + '</p>' : '') +
            '<p class="text-[10px] mono mt-1" style="color: var(--text-dim);">' + new Date(log.created_at).toLocaleString() + '</p></div></div>';
    });
    list.innerHTML = html;
}

// ============================================
// UKMBASE DATA
// ============================================

function populateUkmDataProjectSelect() {
    const sel = document.getElementById('ukmdata-project-select');
    if (!sel) return;
    const own = projectsCache.filter(function(p) { return p.owner_id === currentUser.id; });
    if (own.length === 0) {
        document.getElementById('ukmdata-empty').classList.remove('hidden');
        document.getElementById('ukmdata-panel').classList.add('hidden');
        sel.innerHTML = '<option value="">— no projects —</option>';
        return;
    }
    document.getElementById('ukmdata-empty').classList.add('hidden');
    let html = '';
    own.forEach(function(p) { html += '<option value="' + p.id + '">' + escapeHtml(p.name) + '</option>'; });
    const current = sel.value;
    sel.innerHTML = html;
    if (current && own.find(function(p) { return p.id === current; })) sel.value = current;
    else sel.value = own[0].id;
    onUkmDataProjectChange();
}

async function onUkmDataProjectChange() {
    const sel = document.getElementById('ukmdata-project-select');
    if (!sel || !sel.value) { document.getElementById('ukmdata-panel').classList.add('hidden'); return; }
    currentUkmDataProjectId = sel.value;
    document.getElementById('ukmdata-panel').classList.remove('hidden');
    await loadUkmDataState();
}

async function loadUkmDataState() {
    if (!currentUkmDataProjectId || !currentUser) return;
    const { data: schemaRow, error: schemaErr } = await supabaseClient
        .from('project_schemas').select('*')
        .eq('project_id', currentUkmDataProjectId).maybeSingle();
    if (schemaErr) console.error('Schema lookup:', schemaErr.message);

    if (!schemaRow) {
        ukmDataSchema = null;
        ukmDataTables = [];
        ukmDataUsers = [];
        ukmDataFiles = [];
        document.getElementById('ukmdata-enable-card').classList.remove('hidden');
        document.getElementById('ukmdata-info-card').classList.add('hidden');
        document.getElementById('ukmdata-tables-card').classList.add('hidden');
        document.getElementById('ukmdata-auth-card').classList.add('hidden');
        document.getElementById('ukmdata-storage-card').classList.add('hidden');
        return;
    }

    ukmDataSchema = schemaRow.schema_name;
    document.getElementById('ukmdata-enable-card').classList.add('hidden');
    document.getElementById('ukmdata-info-card').classList.remove('hidden');
    document.getElementById('ukmdata-tables-card').classList.remove('hidden');
    document.getElementById('ukmdata-auth-card').classList.remove('hidden');
    document.getElementById('ukmdata-storage-card').classList.remove('hidden');
    document.getElementById('ukmdata-schema-name').textContent = ukmDataSchema;
    
    await loadUkmDataTables();
    await loadUkmDataUsers();
    await loadUkmDataFiles();
}

async function enableUkmData() {
    if (!currentUkmDataProjectId) return;
    const btn = document.getElementById('ukmdata-enable-btn');
    btn.textContent = 'Enabling...'; btn.disabled = true;
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        const res = await fetch(SUPABASE_URL + '/functions/v1/ukmdata', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'enable', project_id: currentUkmDataProjectId })
        });
        const data = await res.json();
        btn.textContent = 'Enable for this project'; btn.disabled = false;
        if (data.error) { showToast(data.error, 'error'); return; }
        showToast('Ukmbase Data enabled', 'success');
        await loadUkmDataState();
    } catch (err) {
        btn.textContent = 'Enable for this project'; btn.disabled = false;
        showToast('Network error: ' + err.message, 'error');
    }
}

async function loadUkmDataTables() {
    if (!currentUkmDataProjectId) return;
    const loading = document.getElementById('ukmdata-tables-loading');
    const list = document.getElementById('ukmdata-tables-list');
    const empty = document.getElementById('ukmdata-tables-empty');
    loading.classList.remove('hidden'); list.classList.add('hidden'); empty.classList.add('hidden');
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        const res = await fetch(SUPABASE_URL + '/functions/v1/ukmdata', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'list', project_id: currentUkmDataProjectId })
        });
        const data = await res.json();
        loading.classList.add('hidden');
        if (data.error) { showToast(data.error, 'error'); return; }
        ukmDataTables = data.tables || [];
        if (ukmDataTables.length === 0) { empty.classList.remove('hidden'); return; }
        list.classList.remove('hidden');
        let html = '';
        ukmDataTables.forEach(function(t) {
            html += '<div class="rounded-lg p-3 flex items-center justify-between" style="background: var(--bg); border: 1px solid var(--border);">' +
                '<div class="flex items-center gap-3 min-w-0">' +
                    '<div class="w-8 h-8 rounded flex items-center justify-center flex-shrink-0" style="background: rgba(139,92,246,0.15); border: 1px solid rgba(139,92,246,0.3);">' +
                        '<svg class="w-4 h-4" style="color: #8B5CF6;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M3 14h18m-9-4v8m-7-4h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>' +
                    '</div>' +
                    '<div class="min-w-0"><p class="text-sm font-bold truncate mono" style="color: var(--text);">' + escapeHtml(t.table_name) + '</p>' +
                    '<p class="text-[10px] mono truncate" style="color: var(--text-dim);">' + escapeHtml(ukmDataSchema) + '_' + escapeHtml(t.table_name) + '</p></div>' +
                '</div>' +
                '<button onclick="dropUkmDataTable(\'' + t.table_name + '\')" class="p-2" style="color: var(--text-muted);">' +
                    '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22"></path></svg>' +
                '</button>' +
            '</div>';
        });
        list.innerHTML = html;
    } catch (err) {
        loading.classList.add('hidden');
        showToast('Network error: ' + err.message, 'error');
    }
}

async function dropUkmDataTable(name) {
    if (!confirm('Delete table "' + name + '"? All rows will be lost.')) return;
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        const res = await fetch(SUPABASE_URL + '/functions/v1/ukmdata', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'drop_table', project_id: currentUkmDataProjectId, table_name: name })
        });
        const data = await res.json();
        if (data.error) { showToast(data.error, 'error'); return; }
        showToast('Table deleted', 'success');
        await loadUkmDataTables();
    } catch (err) { showToast('Network error: ' + err.message, 'error'); }
}

function openCreateTableModal() {
    if (!ukmDataSchema) { showToast('Enable Ukmbase Data first', 'error'); return; }
    document.getElementById('create-table-modal').classList.remove('hidden');
    document.getElementById('create-table-error').classList.add('hidden');
    document.getElementById('new-table-name').value = '';
    document.getElementById('new-table-columns').innerHTML = '';
    ukmDataColumnCounter = 0;
    addColumnRow();
}

function closeCreateTableModal() { document.getElementById('create-table-modal').classList.add('hidden'); }

function addColumnRow() {
    ukmDataColumnCounter++;
    const idx = ukmDataColumnCounter;
    const container = document.getElementById('new-table-columns');
    const row = document.createElement('div');
    row.className = 'flex gap-2 items-center';
    row.dataset.colIdx = idx;
    row.innerHTML =
        '<input type="text" class="col-name flex-1 rounded-lg px-3 py-2 mono text-xs focus:outline-none" placeholder="column_name" style="background: var(--bg); border: 1px solid var(--border); color: var(--text);">' +
        '<select class="col-type rounded-lg px-2 py-2 text-xs focus:outline-none" style="background: var(--bg); border: 1px solid var(--border); color: var(--text);">' +
            '<option value="text">text</option>' +
            '<option value="number">number</option>' +
            '<option value="integer">integer</option>' +
            '<option value="boolean">boolean</option>' +
            '<option value="date">date</option>' +
            '<option value="json">json</option>' +
            '<option value="uuid">uuid</option>' +
        '</select>' +
        '<label class="flex items-center gap-1 text-[10px]" style="color: var(--text-muted);"><input type="checkbox" class="col-nullable"> null</label>' +
        '<button type="button" class="col-remove p-1" style="color: var(--text-muted);">' +
            '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>' +
        '</button>';
    row.querySelector('.col-remove').onclick = function() { row.remove(); };
    container.appendChild(row);
}

async function createUkmDataTable() {
    const name = document.getElementById('new-table-name').value.trim().toLowerCase();
    const errEl = document.getElementById('create-table-error');
    const btn = document.getElementById('create-table-submit');
    errEl.classList.add('hidden');
    if (!name || !/^[a-z][a-z0-9_]*$/.test(name)) {
        errEl.textContent = 'Table name must start with a letter and use only lowercase letters, numbers, underscores.';
        errEl.classList.remove('hidden'); return;
    }
    const rows = document.querySelectorAll('#new-table-columns > div');
    const columns = [];
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const colName = row.querySelector('.col-name').value.trim().toLowerCase();
        const colType = row.querySelector('.col-type').value;
        const colNullable = row.querySelector('.col-nullable').checked;
        if (!colName) continue;
        if (!/^[a-z][a-z0-9_]*$/.test(colName)) {
            errEl.textContent = 'Column "' + colName + '" has invalid name.';
            errEl.classList.remove('hidden'); return;
        }
        columns.push({ name: colName, type: colType, nullable: colNullable });
    }
    if (columns.length === 0) {
        errEl.textContent = 'Add at least one column.';
        errEl.classList.remove('hidden'); return;
    }
    btn.textContent = 'Creating...'; btn.disabled = true;
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        const res = await fetch(SUPABASE_URL + '/functions/v1/ukmdata', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'create_table',
                project_id: currentUkmDataProjectId,
                table: { name: name, columns: columns }
            })
        });
        const data = await res.json();
        btn.textContent = 'Create Table'; btn.disabled = false;
        if (data.error) { errEl.textContent = data.error; errEl.classList.remove('hidden'); return; }
        closeCreateTableModal();
        showToast('Table "' + name + '" created', 'success');
        await loadUkmDataTables();
    } catch (err) {
        btn.textContent = 'Create Table'; btn.disabled = false;
        errEl.textContent = 'Network error: ' + err.message;
        errEl.classList.remove('hidden');
    }
}

function copyUkmDataConnection() {
    if (!ukmDataSchema) return;
    const info = 'Ukmbase Data — Connection Info\n\n' +
        'REST URL: ' + SUPABASE_URL + '/rest/v1/\n' +
        'Auth URL: ' + SUPABASE_URL + '/functions/v1/ukmauth\n' +
        'Storage URL: ' + SUPABASE_URL + '/functions/v1/ukmstore\n' +
        'Anon Key: ' + SUPABASE_ANON_KEY + '\n' +
        'Schema: ' + ukmDataSchema + '\n\n' +
        'Query your tables using any Supabase client.\n' +
        'For auth, hit the Auth URL with action=signup|login|logout|me.';
    navigator.clipboard.writeText(info);
    showToast('Connection info copied', 'success');
}

// ============================================
// UKMBASE DATA — AUTH
// ============================================

async function loadUkmDataUsers() {
    if (!currentUkmDataProjectId || !ukmDataSchema) return;
    const loading = document.getElementById('ukmdata-auth-loading');
    const list = document.getElementById('ukmdata-auth-list');
    const empty = document.getElementById('ukmdata-auth-empty');
    const countEl = document.getElementById('ukmdata-auth-count');
    loading.classList.remove('hidden'); list.classList.add('hidden'); empty.classList.add('hidden');

    const { data, error } = await supabaseClient
        .from('project_users_public')
        .select('*')
        .eq('project_id', currentUkmDataProjectId)
        .order('created_at', { ascending: false })
        .limit(50);

    loading.classList.add('hidden');
    if (error) { console.error('Users load:', error.message); empty.classList.remove('hidden'); return; }

    ukmDataUsers = data || [];
    if (countEl) countEl.textContent = ukmDataUsers.length + ' user' + (ukmDataUsers.length === 1 ? '' : 's');

    generateAuthSnippet();

    if (ukmDataUsers.length === 0) { empty.classList.remove('hidden'); return; }

    list.classList.remove('hidden');
    let html = '';
    ukmDataUsers.forEach(function(u) {
        const initial = (u.name || u.email || 'U').charAt(0).toUpperCase();
        const created = u.created_at ? new Date(u.created_at).toLocaleDateString() : '—';
        const lastLogin = u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : 'never';
        html += '<div class="rounded-lg p-3 flex items-center gap-3" style="background: var(--bg); border: 1px solid var(--border);">' +
            '<div class="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0" style="background: rgba(79,70,229,0.2); border: 1px solid rgba(79,70,229,0.4); color: var(--accent);">' + escapeHtml(initial) + '</div>' +
            '<div class="min-w-0 flex-1">' +
                '<p class="text-sm font-medium truncate" style="color: var(--text);">' + escapeHtml(u.name || u.email) + '</p>' +
                '<p class="text-[10px] mono truncate" style="color: var(--text-dim);">' + escapeHtml(u.email) + '</p>' +
                '<p class="text-[10px] mt-1" style="color: var(--text-dim);">Joined ' + created + ' · Last login ' + lastLogin + '</p>' +
            '</div>' +
            '<button onclick="deleteUkmDataUser(\'' + u.id + '\')" class="p-2 flex-shrink-0" style="color: var(--text-muted);">' +
                '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22"></path></svg>' +
            '</button>' +
        '</div>';
    });
    list.innerHTML = html;
}

async function deleteUkmDataUser(id) {
    if (!confirm('Delete this user? They will lose access immediately.')) return;
    const { error } = await supabaseClient.from('project_users').delete().eq('id', id);
    if (error) { showToast('Failed: ' + error.message, 'error'); return; }
    showToast('User deleted', 'success');
    await loadUkmDataUsers();
}

function generateAuthSnippet() {
    const el = document.getElementById('ukmauth-snippet');
    if (!el || !currentUkmDataProjectId) return;
    const proj = projectsCache.find(function(p) { return p.id === currentUkmDataProjectId; });
    const slug = proj ? proj.slug : 'unknown';
    const snippet = '// Signup\n' +
        'const r = await fetch("' + SUPABASE_URL + '/functions/v1/ukmauth", {\n' +
        '  method: "POST",\n' +
        '  headers: { "Content-Type": "application/json" },\n' +
        '  body: JSON.stringify({\n' +
        '    action: "signup",\n' +
        '    project_slug: "' + slug + '",\n' +
        '    email: "user@example.com",\n' +
        '    password: "secret123"\n' +
        '  })\n' +
        '});\n' +
        'const { user, token } = await r.json();\n\n' +
        '// Login\n' +
        '// action: "login"  (returns same shape)\n\n' +
        '// Me (verify session)\n' +
        '// action: "me", token: "..."\n\n' +
        '// Logout\n' +
        '// action: "logout", token: "..."';
    el.textContent = snippet;
}

function copyAuthSnippet() {
    const el = document.getElementById('ukmauth-snippet');
    if (!el) return;
    navigator.clipboard.writeText(el.textContent);
    showToast('Auth snippet copied', 'success');
}

// ============================================
// UKMBASE DATA — STORAGE
// ============================================

async function loadUkmDataFiles() {
    if (!currentUkmDataProjectId || !ukmDataSchema) return;
    const loading = document.getElementById('ukmdata-storage-loading');
    const list = document.getElementById('ukmdata-storage-list');
    const empty = document.getElementById('ukmdata-storage-empty');
    const countEl = document.getElementById('ukmdata-storage-count');
    const sizeEl = document.getElementById('ukmdata-storage-size');
    const barEl = document.getElementById('ukmdata-storage-bar');
    
    loading.classList.remove('hidden'); list.classList.add('hidden'); empty.classList.add('hidden');

    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        const res = await fetch(SUPABASE_URL + '/functions/v1/ukmstore', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'list', project_id: currentUkmDataProjectId })
        });
        const data = await res.json();
        loading.classList.add('hidden');
        
        if (data.error) { showToast(data.error, 'error'); empty.classList.remove('hidden'); return; }

        ukmDataFiles = data.files || [];
        
        let totalBytes = 0;
        ukmDataFiles.forEach(function(f) { totalBytes += Number(f.size_bytes) || 0; });
        
        // Update UI stats
        if (countEl) countEl.textContent = ukmDataFiles.length + ' file' + (ukmDataFiles.length === 1 ? '' : 's');
        
        const mb = totalBytes / (1024 * 1024);
        const limitMb = 500;
        if (sizeEl) sizeEl.textContent = (mb < 1 ? (totalBytes / 1024).toFixed(1) + ' KB' : mb.toFixed(2) + ' MB') + ' / ' + limitMb + ' MB';
        if (barEl) barEl.style.width = Math.min(100, (mb / limitMb) * 100) + '%';

        generateStorageSnippet();

        if (ukmDataFiles.length === 0) { empty.classList.remove('hidden'); return; }
        list.classList.remove('hidden');

        let html = '';
        ukmDataFiles.forEach(function(f) {
            const sizeStr = f.size_bytes > 1024 * 1024 
                ? (f.size_bytes / 1024 / 1024).toFixed(1) + ' MB' 
                : (f.size_bytes / 1024).toFixed(0) + ' KB';
            
            let iconSvg = '';
            if (f.mime_type && f.mime_type.startsWith('image/')) {
                iconSvg = '<svg class="w-4 h-4" style="color: #10B981;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>';
            } else if (f.mime_type && f.mime_type.includes('pdf')) {
                iconSvg = '<svg class="w-4 h-4" style="color: #EF4444;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>';
            } else {
                iconSvg = '<svg class="w-4 h-4" style="color: #64748B;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>';
            }

            html += '<div class="rounded-lg p-3 flex items-center gap-3" style="background: var(--bg); border: 1px solid var(--border);">' +
                '<div class="w-8 h-8 rounded flex items-center justify-center flex-shrink-0" style="background: rgba(255,255,255,0.05); border: 1px solid var(--border);">' + iconSvg + '</div>' +
                '<div class="min-w-0 flex-1">' +
                    '<p class="text-sm font-medium truncate" style="color: var(--text);">' + escapeHtml(f.filename) + '</p>' +
                    '<p class="text-[10px] mono" style="color: var(--text-dim);">' + sizeStr + ' · ' + new Date(f.created_at).toLocaleDateString() + '</p>' +
                '</div>' +
                '<div class="flex items-center gap-1">' +
                    '<button onclick="downloadUkmDataFile(\'' + f.id + '\')" class="p-2" style="color: var(--cyan);">' +
                        '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>' +
                    '</button>' +
                    '<button onclick="deleteUkmDataFile(\'' + f.id + '\')" class="p-2" style="color: var(--text-muted);">' +
                        '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22"></path></svg>' +
                    '</button>' +
                '</div>' +
            '</div>';
        });
        list.innerHTML = html;
    } catch (err) {
        loading.classList.add('hidden');
        showToast('Network error: ' + err.message, 'error');
        empty.classList.remove('hidden');
    }
}

function uploadUkmDataFile(input) {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { showToast('File too large. Max 5 MB.', 'error'); input.value = ''; return; }

    const reader = new FileReader();
    reader.onload = async function(e) {
        const base64 = e.target.result.split(',')[1];
        const btn = document.getElementById('ukmdata-upload-zone');
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<div class="text-sm font-medium" style="color: var(--text);">Uploading...</div>';
        
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            const res = await fetch(SUPABASE_URL + '/functions/v1/ukmstore', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'upload',
                    project_id: currentUkmDataProjectId,
                    filename: file.name,
                    mime_type: file.type,
                    file: base64
                })
            });
            const data = await res.json();
            btn.innerHTML = originalHtml;
            input.value = '';

            if (data.error) { showToast(data.error, 'error'); return; }
            showToast('File uploaded', 'success');
            await loadUkmDataFiles();
        } catch (err) {
            btn.innerHTML = originalHtml;
            input.value = '';
            showToast('Network error: ' + err.message, 'error');
        }
    };
    reader.readAsDataURL(file);
}

async function deleteUkmDataFile(fileId) {
    if (!confirm('Delete this file permanently?')) return;
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        const res = await fetch(SUPABASE_URL + '/functions/v1/ukmstore', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'delete', project_id: currentUkmDataProjectId, file_id: fileId })
        });
        const data = await res.json();
        if (data.error) { showToast(data.error, 'error'); return; }
        showToast('File deleted', 'success');
        await loadUkmDataFiles();
    } catch (err) { showToast('Network error: ' + err.message, 'error'); }
}

async function downloadUkmDataFile(fileId) {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        const res = await fetch(SUPABASE_URL + '/functions/v1/ukmstore', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'download', project_id: currentUkmDataProjectId, file_id: fileId })
        });
        const data = await res.json();
        if (data.error) { showToast(data.error, 'error'); return; }
        window.open(data.url, '_blank');
    } catch (err) { showToast('Network error: ' + err.message, 'error'); }
}

function generateStorageSnippet() {
    const el = document.getElementById('ukmstore-snippet');
    if (!el || !currentUkmDataProjectId) return;
    const proj = projectsCache.find(function(p) { return p.id === currentUkmDataProjectId; });
    const slug = proj ? proj.slug : 'unknown';
    const snippet = '// Upload a file\n' +
        'const fileInput = document.querySelector("input[type=file]");\n' +
        'const file = fileInput.files[0];\n' +
        'const reader = new FileReader();\n' +
        'reader.onload = async (e) => {\n' +
        '  const base64 = e.target.result.split(",")[1];\n' +
        '  const res = await fetch("' + SUPABASE_URL + '/functions/v1/ukmstore", {\n' +
        '    method: "POST",\n' +
        '    headers: { "Content-Type": "application/json" },\n' +
        '    body: JSON.stringify({\n' +
        '      action: "upload",\n' +
        '      project_slug: "' + slug + '",\n' +
        '      filename: file.name,\n' +
        '      mime_type: file.type,\n' +
        '      file: base64,\n' +
        '      session_token: "USER_SESSION_TOKEN_HERE"\n' +
        '    })\n' +
        '  });\n' +
        '  console.log(await res.json());\n' +
        '};\n' +
        'reader.readAsDataURL(file);\n\n' +
        '// Download a file\n' +
        '// action: "download", file_id: "..."\n\n' +
        '// Delete a file\n' +
        '// action: "delete", file_id: "..."';
    el.textContent = snippet;
}

function copyStorageSnippet() {
    const el = document.getElementById('ukmstore-snippet');
    if (!el) return;
    navigator.clipboard.writeText(el.textContent);
    showToast('Storage snippet copied', 'success');
}

// ============================================
// UKMPAY
// ============================================

function switchPayTab(tab) {
    const plansPanel = document.getElementById('pay-plans-panel');
    const payPanel = document.getElementById('pay-payments-panel');
    const plansTab = document.getElementById('pay-tab-plans');
    const payTab = document.getElementById('pay-tab-payments');
    if (tab === 'plans') {
        plansPanel.classList.remove('hidden'); payPanel.classList.add('hidden');
        plansTab.style.color = 'var(--text)'; plansTab.style.borderBottom = '2px solid var(--accent)';
        payTab.style.color = 'var(--text-muted)'; payTab.style.borderBottom = 'none';
    } else {
        plansPanel.classList.add('hidden'); payPanel.classList.remove('hidden');
        payTab.style.color = 'var(--text)'; payTab.style.borderBottom = '2px solid var(--accent)';
        plansTab.style.color = 'var(--text-muted)'; plansTab.style.borderBottom = 'none';
    }
}

function openPlanModal() {
    if (projectsCache.filter(function(p) { return p.owner_id === currentUser.id; }).length === 0) { showToast('Create a project first', 'error'); return; }
    document.getElementById('plan-modal').classList.remove('hidden');
    document.getElementById('plan-error').classList.add('hidden');
    populateProjectSelects();
    ['plan-name', 'plan-price', 'plan-url'].forEach(function(id) { document.getElementById(id).value = ''; });
}

function closePlanModal() { document.getElementById('plan-modal').classList.add('hidden'); }

function populateProjectSelects() {
    const ownProjects = projectsCache.filter(function(p) { return p.owner_id === currentUser.id; });
    let options = '';
    ownProjects.forEach(function(p) { options += '<option value="' + p.id + '">' + escapeHtml(p.name) + '</option>'; });
    ['plan-project', 'pay-project'].forEach(function(id) { const el = document.getElementById(id); if (el) el.innerHTML = options; });
}

async function loadPlans() {
    if (!currentUser) return;
    const { data, error } = await supabaseClient.from('plans').select('*').order('created_at', { ascending: false });
    if (error) { console.error(error.message); return; }
    const empty = document.getElementById('pay-empty-plans');
    const grid = document.getElementById('pay-plans-grid');
    if (!data || data.length === 0) { empty.classList.remove('hidden'); grid.classList.add('hidden'); document.getElementById('pay-plans-count').textContent = '0'; return; }
    empty.classList.add('hidden'); grid.classList.remove('hidden');
    let html = '';
    data.forEach(function(pl) {
        html += '<div class="rounded-xl p-5" style="background: var(--surface); border: 1px solid var(--border);">' +
            '<div class="flex items-start justify-between mb-3"><span class="text-[10px] font-bold uppercase px-2 py-1 rounded" style="background: rgba(79,70,229,0.1); color: var(--accent);">' + escapeHtml(pl.provider) + '</span>' +
            '<span class="text-[10px]" style="color: var(--text-dim);">' + escapeHtml(pl.interval) + '</span></div>' +
            '<h3 class="font-bold mb-1" style="color: var(--text);">' + escapeHtml(pl.name) + '</h3>' +
            '<div class="text-2xl font-extrabold mono mb-3" style="color: var(--text);">' + escapeHtml(pl.currency) + ' ' + Number(pl.price_amount).toFixed(2) + '</div>' +
            (pl.checkout_url ? '<button onclick="copyCheckout(\'' + escapeHtml(pl.checkout_url) + '\')" class="w-full text-xs font-bold py-2 rounded-lg" style="background: rgba(79,70,229,0.1); border: 1px solid rgba(79,70,229,0.3); color: var(--cyan);">Copy Checkout Link</button>' : '<p class="text-xs" style="color: var(--text-dim);">No checkout link</p>') + '</div>';
    });
    grid.innerHTML = html;
    document.getElementById('pay-plans-count').textContent = data.length;
    const payPlanSelect = document.getElementById('pay-plan');
    let planOpts = '<option value="">— none —</option>';
    data.forEach(function(pl) { planOpts += '<option value="' + pl.id + '">' + escapeHtml(pl.name) + '</option>'; });
    payPlanSelect.innerHTML = planOpts;
}

function copyCheckout(url) { navigator.clipboard.writeText(url); showToast('Checkout link copied', 'success'); }

async function createPlan() {
    const project_id = document.getElementById('plan-project').value;
    const name = document.getElementById('plan-name').value.trim();
    const price_amount = parseFloat(document.getElementById('plan-price').value);
    const currency = document.getElementById('plan-currency').value;
    const interval = document.getElementById('plan-interval').value;
    const provider = document.getElementById('plan-provider').value;
    const checkout_url = document.getElementById('plan-url').value.trim();
    const errEl = document.getElementById('plan-error');
    const btn = document.getElementById('create-plan-btn');
    errEl.classList.add('hidden');
    if (!project_id || !name || isNaN(price_amount)) { errEl.textContent = 'Project, name, and price are required.'; errEl.classList.remove('hidden'); return; }
    btn.innerText = 'Creating...'; btn.disabled = true;
    const { error } = await supabaseClient.from('plans').insert([{ project_id: project_id, name: name, price_amount: price_amount, currency: currency, interval: interval, provider: provider, checkout_url: checkout_url || null, active: true }]);
    btn.innerText = 'Create Plan'; btn.disabled = false;
    if (error) { errEl.textContent = error.message; errEl.classList.remove('hidden'); return; }
    closePlanModal(); await loadPlans(); showToast('Plan created', 'success');
}

function openPaymentModal() {
    if (projectsCache.filter(function(p) { return p.owner_id === currentUser.id; }).length === 0) { showToast('Create a project first', 'error'); return; }
    document.getElementById('payment-modal').classList.remove('hidden');
    document.getElementById('payment-error').classList.add('hidden');
    populateProjectSelects();
    ['pay-email', 'pay-amount'].forEach(function(id) { document.getElementById(id).value = ''; });
}

function closePaymentModal() { document.getElementById('payment-modal').classList.add('hidden'); }

async function loadPayments() {
    if (!currentUser) return;
    const { data, error } = await supabaseClient.from('payments').select('*').order('paid_at', { ascending: false });
    if (error) { console.error(error.message); return; }
    const paid = (data || []).filter(function(p) { return p.status === 'paid'; });
    const total = paid.reduce(function(s, p) { return s + Number(p.amount); }, 0);
    const now = new Date();
    const monthly = paid.filter(function(p) { const d = new Date(p.paid_at); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).reduce(function(s, p) { return s + Number(p.amount); }, 0);
    document.getElementById('pay-total').textContent = '$' + total.toFixed(2);
    document.getElementById('pay-month').textContent = '$' + monthly.toFixed(2);
    const statRev = document.getElementById('stat-revenue');
    if (statRev) statRev.textContent = '$' + total.toFixed(2);
    const empty = document.getElementById('pay-empty-payments');
    const list = document.getElementById('pay-payments-list');
    if (!data || data.length === 0) { empty.classList.remove('hidden'); list.classList.add('hidden'); return; }
    empty.classList.add('hidden'); list.classList.remove('hidden');
    let html = '';
    data.forEach(function(p) {
        html += '<div class="rounded-xl p-4 flex items-center justify-between" style="background: var(--surface); border: 1px solid var(--border);">' +
            '<div class="min-w-0"><p class="text-sm font-medium truncate" style="color: var(--text);">' + escapeHtml(p.customer_email || 'Anonymous') + '</p>' +
            '<p class="text-xs mono" style="color: var(--text-dim);">' + new Date(p.paid_at).toLocaleDateString() + ' · ' + escapeHtml(p.provider || 'manual') + '</p></div>' +
            '<div class="text-right flex-shrink-0"><div class="font-bold mono" style="color: var(--text);">' + escapeHtml(p.currency) + ' ' + Number(p.amount).toFixed(2) + '</div>' +
            '<span class="text-[10px] uppercase font-bold ' + (p.status === 'paid' ? 'text-green-400' : 'text-yellow-400') + '">' + p.status + '</span></div></div>';
    });
    list.innerHTML = html;
}

async function createPayment() {
    const project_id = document.getElementById('pay-project').value;
    const plan_id = document.getElementById('pay-plan').value || null;
    const customer_email = document.getElementById('pay-email').value.trim();
    const amount = parseFloat(document.getElementById('pay-amount').value);
    const currency = document.getElementById('pay-currency').value;
    const provider = document.getElementById('pay-provider').value;
    const errEl = document.getElementById('payment-error');
    const btn = document.getElementById('create-payment-btn');
    errEl.classList.add('hidden');
    if (!project_id || isNaN(amount)) { errEl.textContent = 'Project and amount are required.'; errEl.classList.remove('hidden'); return; }
    btn.innerText = 'Logging...'; btn.disabled = true;
    const { error } = await supabaseClient.from('payments').insert([{ project_id: project_id, plan_id: plan_id || null, customer_email: customer_email || null, amount: amount, currency: currency, provider: provider, status: 'paid', paid_at: new Date().toISOString() }]);
    btn.innerText = 'Log Payment'; btn.disabled = false;
    if (error) { errEl.textContent = error.message; errEl.classList.remove('hidden'); return; }
    closePaymentModal(); await loadPayments(); showToast('Payment logged', 'success');
}

// ============================================
// UKMTABLES
// ============================================

function openConnectModal() {
    if (!canCreateConnection()) { if (confirm('Connection limit reached. Upgrade?')) switchView('billing'); return; }
    document.getElementById('connect-modal').classList.remove('hidden');
    document.getElementById('connect-error').classList.add('hidden');
    ['connect-name', 'connect-url', 'connect-key'].forEach(function(id) { document.getElementById(id).value = ''; });
}

function closeConnectModal() { document.getElementById('connect-modal').classList.add('hidden'); }

async function loadConnections() {
    if (!currentUser) return;
    const { data, error } = await supabaseClient.from('connected_databases').select('*').order('created_at', { ascending: false });
    if (error) { console.error(error.message); return; }
    connectionsCache = data || [];
    renderConnections(connectionsCache);
}

function renderConnections(connections) {
    const empty = document.getElementById('ukmtables-empty');
    const list = document.getElementById('ukmtables-list');
    const title = document.getElementById('ukmtables-title');
    const subtitle = document.getElementById('ukmtables-subtitle');
    const actionBtn = document.getElementById('ukmtables-action');
    const backBtn = document.getElementById('ukmtables-back');
    if (!empty) return;
    title.textContent = 'UkmTables';
    subtitle.textContent = 'Connect any Supabase database';
    actionBtn.innerText = '+ Connect';
    actionBtn.onclick = openConnectModal;
    backBtn.classList.add('hidden');
    document.getElementById('ukmtables-connections-view').classList.remove('hidden');
    document.getElementById('ukmtables-browser').classList.add('hidden');
    if (!connections || connections.length === 0) { empty.classList.remove('hidden'); list.classList.add('hidden'); return; }
    empty.classList.add('hidden'); list.classList.remove('hidden');
    let html = '';
    connections.forEach(function(c) {
        html += '<div class="rounded-xl p-4 flex items-center justify-between" style="background: var(--surface); border: 1px solid var(--border);">' +
            '<div class="flex items-center gap-3 min-w-0 cursor-pointer flex-1" onclick="openConnection(\'' + c.id + '\')">' +
            '<div class="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style="background: rgba(6,182,212,0.1); border: 1px solid rgba(6,182,212,0.3);">' +
            '<svg class="w-4 h-4" style="color: var(--cyan);" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"></path></svg></div>' +
            '<div class="min-w-0"><p class="text-sm font-medium truncate" style="color: var(--text);">' + escapeHtml(c.name) + '</p>' +
            '<p class="text-xs mono truncate" style="color: var(--text-dim);">' + escapeHtml(c.supabase_url.replace('https://', '')) + '</p></div></div>' +
            '<button onclick="deleteConnection(\'' + c.id + '\')" class="p-2" style="color: var(--text-muted);">' +
            '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22"></path></svg></button></div>';
    });
    list.innerHTML = html;
}

async function createConnection() {
    const name = document.getElementById('connect-name').value.trim();
    const url = document.getElementById('connect-url').value.trim().replace(/\/$/, '');
    const key = document.getElementById('connect-key').value.trim();
    const errEl = document.getElementById('connect-error');
    const btn = document.getElementById('create-connect-btn');
    errEl.classList.add('hidden');
    if (!name || !url || !key) { errEl.textContent = 'All fields are required.'; errEl.classList.remove('hidden'); return; }
    if (!canCreateConnection()) { errEl.textContent = 'Plan limit reached.'; errEl.classList.remove('hidden'); return; }
    btn.innerText = 'Testing...'; btn.disabled = true;
    try {
        const testRes = await fetch(url + '/rest/v1/profiles?select=id&limit=1', { headers: getHeaders(key) });
        if (testRes.status >= 500) throw new Error('Connection failed (' + testRes.status + ').');
        if (testRes.status === 404) throw new Error('Endpoint not reachable.');
    } catch (err) { btn.innerText = 'Connect'; btn.disabled = false; errEl.textContent = err.message; errEl.classList.remove('hidden'); return; }
    const { error } = await supabaseClient.from('connected_databases').insert([{ owner_id: currentUser.id, name: name, supabase_url: url, supabase_anon_key: key }]);
    btn.innerText = 'Connect'; btn.disabled = false;
    if (error) { errEl.textContent = error.message; errEl.classList.remove('hidden'); return; }
    closeConnectModal(); await loadConnections(); populateQueryConnections(); showToast('Database connected', 'success');
}

async function deleteConnection(id) {
    if (!confirm('Delete this connection?')) return;
    const { error } = await supabaseClient.from('connected_databases').delete().eq('id', id);
    if (error) { showToast('Failed: ' + error.message, 'error'); return; }
    await loadConnections(); populateQueryConnections(); showToast('Connection deleted', 'success');
}

async function openConnection(id) {
    const conn = connectionsCache.find(function(c) { return c.id === id; });
    if (!conn) return;
    activeConnection = conn;
    const title = document.getElementById('ukmtables-title');
    const subtitle = document.getElementById('ukmtables-subtitle');
    const actionBtn = document.getElementById('ukmtables-action');
    const backBtn = document.getElementById('ukmtables-back');
    title.textContent = conn.name;
    subtitle.textContent = 'Reading schema...';
    actionBtn.innerText = '+ Refresh';
    actionBtn.onclick = function() { openConnection(id); };
    backBtn.classList.remove('hidden');
    document.getElementById('ukmtables-connections-view').classList.add('hidden');
    document.getElementById('ukmtables-browser').classList.remove('hidden');
    document.getElementById('ukmtables-rows').classList.add('hidden');
    document.getElementById('ukmtables-rows-empty').classList.add('hidden');
    document.getElementById('ukmtables-rows-loading').classList.remove('hidden');
    document.getElementById('ukmtables-pills').innerHTML = '';
    try {
        const res = await fetch(conn.supabase_url + '/rest/v1/', { headers: getHeaders(conn.supabase_anon_key) });
        let spec = null;
        if (res.ok) { try { spec = await res.json(); } catch (_) {} }
        let tables = [];
        if (spec) tables = Object.keys(spec.definitions || (spec.components && spec.components.schemas) || {}).sort();
        if (tables.length === 0) {
            const candidates = ['profiles', 'projects', 'plans', 'payments', 'subscriptions', 'usage_metrics', 'waitlist', 'connected_databases', 'upgrade_requests', 'query_history', 'team_members', 'sync_configs', 'sync_logs', 'project_schemas', 'project_users_public', 'project_files'];
            for (let i = 0; i < candidates.length; i++) {
                try {
                    const r = await fetch(conn.supabase_url + '/rest/v1/' + candidates[i] + '?select=*&limit=1', { headers: getHeaders(conn.supabase_anon_key) });
                    if (r.status === 200 || r.status === 206) tables.push(candidates[i]);
                } catch (_) {}
            }
        }
        subtitle.textContent = tables.length + ' tables';
        if (tables.length === 0) {
            document.getElementById('ukmtables-rows-loading').classList.add('hidden');
            document.getElementById('ukmtables-rows-empty').classList.remove('hidden');
            document.getElementById('ukmtables-rows-empty').innerHTML = '<p class="text-sm" style="color: var(--text-muted);">No tables found.</p>';
            return;
        }
        let pills = '';
        tables.forEach(function(t) {
            pills += '<button onclick="selectTable(\'' + t + '\')" data-table="' + t + '" class="table-pill text-xs px-3 py-1.5 rounded-lg mono" style="background: var(--surface); border: 1px solid var(--border); color: var(--text-muted);">' + escapeHtml(t) + '</button>';
        });
        document.getElementById('ukmtables-pills').innerHTML = pills;
        await selectTable(tables[0]);
    } catch (err) {
        subtitle.textContent = 'Error';
        document.getElementById('ukmtables-rows-loading').classList.add('hidden');
        document.getElementById('ukmtables-rows-empty').classList.remove('hidden');
        document.getElementById('ukmtables-rows-empty').innerHTML = '<p class="text-sm" style="color: var(--red);">' + escapeHtml(err.message) + '</p>';
    }
}

function exitTableBrowser() {
    activeConnection = null;
    document.getElementById('ukmtables-connections-view').classList.remove('hidden');
    document.getElementById('ukmtables-browser').classList.add('hidden');
    renderConnections(connectionsCache);
}

async function selectTable(tableName) {
    if (!activeConnection) return;
    document.querySelectorAll('.table-pill').forEach(function(p) {
        if (p.dataset.table === tableName) p.classList.add('active');
        else p.classList.remove('active');
    });
    document.getElementById('ukmtables-rows').classList.add('hidden');
    document.getElementById('ukmtables-rows-empty').classList.add('hidden');
    document.getElementById('ukmtables-rows-loading').classList.remove('hidden');
    try {
        const res = await fetch(activeConnection.supabase_url + '/rest/v1/' + tableName + '?select=*&limit=50', { headers: getHeaders(activeConnection.supabase_anon_key) });
        document.getElementById('ukmtables-rows-loading').classList.add('hidden');
        if (!res.ok) throw new Error('Failed to load rows (' + res.status + ')');
        const rows = await res.json();
        if (!rows || rows.length === 0) {
            document.getElementById('ukmtables-rows-empty').classList.remove('hidden');
            document.getElementById('ukmtables-rows-empty').innerHTML = '<p class="text-sm" style="color: var(--text-muted);">No rows visible.</p>';
            return;
        }
        renderRows(rows);
    } catch (err) {
        document.getElementById('ukmtables-rows-loading').classList.add('hidden');
        document.getElementById('ukmtables-rows-empty').classList.remove('hidden');
        document.getElementById('ukmtables-rows-empty').innerHTML = '<p class="text-sm" style="color: var(--red);">' + escapeHtml(err.message) + '</p>';
    }
}

function renderRows(rows) {
    const container = document.getElementById('ukmtables-rows');
    container.classList.remove('hidden');
    let html = '';
    rows.forEach(function(row, idx) {
        let fields = '';
        Object.keys(row).forEach(function(k) {
            const v = row[k];
            let display;
            if (v === null || v === undefined) display = '<span style="color: var(--text-dim);" class="italic">null</span>';
            else if (typeof v === 'object') display = escapeHtml(JSON.stringify(v));
            else display = escapeHtml(String(v));
            fields += '<div class="flex gap-2 py-1 text-xs"><span class="field-key mono flex-shrink-0">' + escapeHtml(k) + ':</span><span class="field-val mono flex-1">' + display + '</span></div>';
        });
        const jsonStr = JSON.stringify(row).replace(/'/g, '&#39;').replace(/"/g, '&quot;');
        html += '<div class="rounded-xl p-4" style="background: var(--surface); border: 1px solid var(--border);">' +
            '<div class="flex items-center justify-between mb-2 pb-2" style="border-bottom: 1px solid var(--border);">' +
            '<span class="text-[10px] uppercase font-bold mono" style="color: var(--accent);">Row ' + (idx + 1) + '</span>' +
            '<button onclick="copyRow(\'' + jsonStr + '\')" class="text-[10px]" style="color: var(--cyan);">Copy JSON</button></div>' +
            '<div class="space-y-0.5">' + fields + '</div></div>';
    });
    container.innerHTML = html;
}

function copyRow(jsonStr) { const clean = jsonStr.replace(/&quot;/g, '"').replace(/&#39;/g, "'"); navigator.clipboard.writeText(clean); showToast('Row copied', 'success'); }

// ============================================
// BILLING
// ============================================

function renderBilling() {
    if (!currentProfile) return;
    const plan = STAFF_ROLES.indexOf(currentProfile.role) !== -1 ? currentProfile.role : (currentProfile.plan || 'free');
    const price = PLAN_PRICES[plan] || PLAN_PRICES.free;
    document.getElementById('billing-plan-name').textContent = plan;
    document.getElementById('billing-plan-price').textContent = price.label;
    const roleTag = document.getElementById('billing-role-tag');
    if (STAFF_ROLES.indexOf(currentProfile.role) !== -1) { roleTag.classList.remove('hidden'); roleTag.classList.add('role-' + currentProfile.role); roleTag.textContent = currentProfile.role; }
    else roleTag.classList.add('hidden');
    const limits = getLimits();
    document.getElementById('billing-projects-label').textContent = projectsCache.length + ' / ' + (limits.projects >= 999 ? '∞' : limits.projects);
    document.getElementById('billing-projects-bar').style.width = (limits.projects >= 999 ? 5 : Math.min(100, (projectsCache.length / limits.projects) * 100)) + '%';
    document.getElementById('billing-connections-label').textContent = connectionsCache.length + ' / ' + (limits.connections >= 999 ? '∞' : limits.connections);
    document.getElementById('billing-connections-bar').style.width = (limits.connections >= 999 ? 5 : Math.min(100, (connectionsCache.length / limits.connections) * 100)) + '%';
    const reposLinked = projectsCache.filter(function(p) { return p.github_repo && p.owner_id === currentUser.id; }).length;
    const repoLabel = document.getElementById('billing-repos-label');
    if (repoLabel) repoLabel.textContent = reposLinked + ' / ' + (limits.repos >= 999 ? '∞' : limits.repos);
    const repoBar = document.getElementById('billing-repos-bar');
    if (repoBar) repoBar.style.width = (limits.repos >= 999 ? 5 : Math.min(100, (reposLinked / limits.repos) * 100)) + '%';
    const seatsUsed = getTeamSeatsUsed() + teamCache.filter(function(m) { return m.status === 'pending'; }).length;
    const seatLabel = document.getElementById('billing-seats-label');
    if (seatLabel) seatLabel.textContent = seatsUsed + ' / ' + (limits.seats >= 999 ? '∞' : limits.seats);
    const seatBar = document.getElementById('billing-seats-bar');
    if (seatBar) seatBar.style.width = (limits.seats >= 999 ? 5 : Math.min(100, (seatsUsed / limits.seats) * 100)) + '%';
    const tokensUsed = projectsCache.reduce(function(s, p) { return s + (Number(p.ai_tokens_used) || 0); }, 0);
    const tokenLimit = STAFF_ROLES.indexOf(currentProfile.role) !== -1 ? 999999 : (currentProfile.plan === 'pro' ? 500000 : currentProfile.plan === 'team' ? 2000000 : 100000);
    document.getElementById('billing-tokens-label').textContent = tokensUsed.toLocaleString() + ' / ' + (tokenLimit >= 999999 ? '∞' : (tokenLimit / 1000) + 'k');
    document.getElementById('billing-tokens-bar').style.width = Math.min(100, (tokensUsed / tokenLimit) * 100) + '%';
}

function openUpgradeModal(plan, price) {
    currentUpgradePlan = { plan: plan, price: price };
    document.getElementById('upgrade-plan-name').textContent = plan.charAt(0).toUpperCase() + plan.slice(1);
    document.getElementById('upgrade-plan-detail').textContent = price ? '$' + price + '/mo billed monthly' : 'Custom pricing';
    document.getElementById('upgrade-error').classList.add('hidden');
    document.getElementById('upgrade-name').value = (currentProfile && currentProfile.full_name) || '';
    document.getElementById('upgrade-contact').value = (currentProfile && (currentProfile.phone || currentProfile.email)) || (currentUser && currentUser.email) || '';
    document.getElementById('upgrade-notes').value = '';
    document.getElementById('upgrade-modal').classList.remove('hidden');
}

function closeUpgradeModal() { document.getElementById('upgrade-modal').classList.add('hidden'); currentUpgradePlan = null; }

async function submitUpgradeRequest() {
    const name = document.getElementById('upgrade-name').value.trim();
    const contact = document.getElementById('upgrade-contact').value.trim();
    const notes = document.getElementById('upgrade-notes').value.trim();
    const errEl = document.getElementById('upgrade-error');
    const btn = document.getElementById('submit-upgrade-btn');
    errEl.classList.add('hidden');
    if (!name || !contact) { errEl.textContent = 'Name and contact required.'; errEl.classList.remove('hidden'); return; }
    if (!currentUpgradePlan) return;
    btn.textContent = 'Sending...'; btn.disabled = true;
    const { error } = await supabaseClient.from('upgrade_requests').insert([{
        user_id: currentUser.id, requested_plan: currentUpgradePlan.plan, amount: currentUpgradePlan.price,
        currency: 'USD', contact_method: 'whatsapp', contact_value: contact,
        notes: 'Name: ' + name + (notes ? ' | ' + notes : ''), status: 'pending'
    }]);
    btn.textContent = 'Send Request'; btn.disabled = false;
    if (error) { errEl.textContent = error.message; errEl.classList.remove('hidden'); return; }
    closeUpgradeModal(); showToast("Request sent! We'll reach out within 24 hours", 'success', 5000);
    await loadMyUpgradeRequests();
}

async function loadMyUpgradeRequests() {
    if (!currentUser) return;
    const wrap = document.getElementById('billing-my-requests');
    const list = document.getElementById('billing-requests-list');
    if (!wrap) return;
    const { data, error } = await supabaseClient.from('upgrade_requests').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false });
    if (error) { console.error(error.message); return; }
    if (!data || data.length === 0) { wrap.classList.add('hidden'); return; }
    wrap.classList.remove('hidden');
    let html = '';
    data.forEach(function(r) {
        html += '<div class="rounded-lg p-3 flex items-center justify-between" style="background: var(--bg); border: 1px solid var(--border);">' +
            '<div><p class="text-sm font-medium capitalize" style="color: var(--text);">' + escapeHtml(r.requested_plan) + '</p>' +
            '<p class="text-xs mono" style="color: var(--text-dim);">' + new Date(r.created_at).toLocaleDateString() + '</p></div>' +
            '<span class="text-[10px] uppercase font-bold ' + (r.status === 'approved' ? 'text-green-400' : r.status === 'pending' ? 'text-yellow-400' : 'text-red-400') + '">' + r.status + '</span></div>';
    });
    list.innerHTML = html;
}

// ============================================
// OWNER CONSOLE
// ============================================

async function loadOwnerConsole() {
    if (STAFF_ROLES.indexOf(currentProfile && currentProfile.role) === -1) { showToast('Access denied', 'error'); switchView('overview'); return; }
    await Promise.all([loadAllUsers(), loadAllProjectsForOwner(), loadAllPaymentsForOwner(), loadAllRequestsForOwner(), loadAllTeamsForOwner()]);
    updateOwnerStats();
}

async function loadAllUsers() {
    const list = document.getElementById('owner-users-list');
    const { data, error } = await supabaseClient.from('profiles').select('*').order('created_at', { ascending: false });
    list.classList.remove('hidden');
    if (error) { list.innerHTML = '<p class="text-sm" style="color: var(--red);">' + escapeHtml(error.message) + '</p>'; return; }
    allUsersCache = data || [];
    if (allUsersCache.length === 0) { list.innerHTML = '<p class="text-sm text-center py-8" style="color: var(--text-muted);">No users yet.</p>'; return; }
    let html = '';
    allUsersCache.forEach(function(u) {
        const role = u.role || 'user';
        const roleClass = role === 'user' ? '' : 'role-' + role;
        const initial = (u.full_name || u.username || u.email || 'U').charAt(0).toUpperCase();
        html += '<div class="rounded-xl p-4" style="background: var(--surface); border: 1px solid var(--border);">' +
            '<div class="flex items-start justify-between mb-3"><div class="flex items-center gap-3 min-w-0">' +
            '<div class="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0" style="background: rgba(79,70,229,0.2); border: 1px solid rgba(79,70,229,0.4); color: var(--accent);">' + escapeHtml(initial) + '</div>' +
            '<div class="min-w-0"><p class="font-bold truncate" style="color: var(--text);">' + escapeHtml(u.full_name || u.username || 'Unnamed') + '</p>' +
            '<p class="text-xs mono truncate" style="color: var(--text-dim);">' + escapeHtml(u.email || '—') + '</p></div></div>' +
            (role !== 'user' ? '<span class="' + roleClass + ' text-[9px] font-bold uppercase px-2 py-1 rounded flex-shrink-0">' + escapeHtml(role) + '</span>' : '') + '</div>' +
            '<div class="grid grid-cols-2 gap-3">' +
            '<div><label class="block text-[10px] uppercase font-bold mb-1" style="color: var(--text-dim);">Role</label>' +
            '<select onchange="updateUserRole(\'' + u.id + '\', this.value)" class="w-full rounded-lg px-3 py-2 text-xs" style="background: var(--bg); border: 1px solid var(--border); color: var(--text);">' +
            '<option value="user"' + (role === 'user' ? ' selected' : '') + '>user</option>' +
            '<option value="support"' + (role === 'support' ? ' selected' : '') + '>support</option>' +
            '<option value="admin"' + (role === 'admin' ? ' selected' : '') + '>admin</option>' +
            '<option value="owner"' + (role === 'owner' ? ' selected' : '') + '>owner</option></select></div>' +
            '<div><label class="block text-[10px] uppercase font-bold mb-1" style="color: var(--text-dim);">Plan</label>' +
            '<select onchange="updateUserPlan(\'' + u.id + '\', this.value)" class="w-full rounded-lg px-3 py-2 text-xs" style="background: var(--bg); border: 1px solid var(--border); color: var(--text);">' +
            '<option value="free"' + (u.plan === 'free' ? ' selected' : '') + '>free</option>' +
            '<option value="pro"' + (u.plan === 'pro' ? ' selected' : '') + '>pro</option>' +
            '<option value="team"' + (u.plan === 'team' ? ' selected' : '') + '>team</option>' +
            '<option value="enterprise"' + (u.plan === 'enterprise' ? ' selected' : '') + '>enterprise</option></select></div></div>' +
            '<div class="mt-3 text-[10px]" style="color: var(--text-dim);">Joined: ' + (u.created_at ? new Date(u.created_at).toLocaleDateString() : '—') + (u.country ? ' · ' + escapeHtml(u.country) : '') + '</div></div>';
    });
    list.innerHTML = html;
}

async function loadAllProjectsForOwner() {
    const list = document.getElementById('owner-projects-list');
    const { data, error } = await supabaseClient.from('projects').select('*').order('created_at', { ascending: false });
    list.classList.remove('hidden');
    if (error) { list.innerHTML = '<p class="text-sm" style="color: var(--red);">' + escapeHtml(error.message) + '</p>'; return; }
    if (!data || data.length === 0) { list.innerHTML = '<p class="text-sm text-center py-8" style="color: var(--text-muted);">No projects yet.</p>'; return; }
    const userMap = {};
    allUsersCache.forEach(function(u) { userMap[u.id] = u.email || u.username || 'unknown'; });
    let html = '';
    data.forEach(function(p) {
        html += '<div class="rounded-xl p-4" style="background: var(--surface); border: 1px solid var(--border);">' +
            '<div class="flex items-start justify-between mb-2"><div class="min-w-0">' +
            '<p class="font-bold truncate" style="color: var(--text);">' + escapeHtml(p.name) + '</p>' +
            '<p class="text-xs mono truncate" style="color: var(--text-dim);">' + escapeHtml(p.slug) + '</p></div>' +
            '<span class="text-[10px] font-bold uppercase px-2 py-1 rounded flex-shrink-0" style="background: rgba(6,182,212,0.1); color: var(--cyan);">' + escapeHtml(p.status || 'active') + '</span></div>' +
            '<p class="text-xs mb-2 truncate" style="color: var(--text-muted);">Owner: <span class="mono">' + escapeHtml(userMap[p.owner_id] || p.owner_id) + '</span></p>' +
            '<div class="text-[10px] flex gap-3" style="color: var(--text-dim);"><span>' + new Date(p.created_at).toLocaleDateString() + '</span>' +
            '<span class="mono">' + (Number(p.ai_tokens_used) || 0).toLocaleString() + ' tokens</span></div></div>';
    });
    list.innerHTML = html;
}

async function loadAllPaymentsForOwner() {
    const list = document.getElementById('owner-payments-list');
    const { data, error } = await supabaseClient.from('payments').select('*').order('paid_at', { ascending: false });
    list.classList.remove('hidden');
    if (error) { list.innerHTML = '<p class="text-sm" style="color: var(--red);">' + escapeHtml(error.message) + '</p>'; return; }
    if (!data || data.length === 0) { list.innerHTML = '<p class="text-sm text-center py-8" style="color: var(--text-muted);">No payments yet.</p>'; return; }
    let html = '';
    data.forEach(function(p) {
        html += '<div class="rounded-xl p-4 flex items-center justify-between" style="background: var(--surface); border: 1px solid var(--border);">' +
            '<div class="min-w-0"><p class="text-sm font-medium truncate" style="color: var(--text);">' + escapeHtml(p.customer_email || 'Anonymous') + '</p>' +
            '<p class="text-xs mono" style="color: var(--text-dim);">' + new Date(p.paid_at).toLocaleDateString() + ' · ' + escapeHtml(p.provider || 'manual') + '</p></div>' +
            '<div class="text-right flex-shrink-0"><div class="font-bold mono" style="color: var(--text);">' + escapeHtml(p.currency) + ' ' + Number(p.amount).toFixed(2) + '</div>' +
            '<span class="text-[10px] uppercase font-bold ' + (p.status === 'paid' ? 'text-green-400' : 'text-yellow-400') + '">' + p.status + '</span></div></div>';
    });
    list.innerHTML = html;
}

async function loadAllRequestsForOwner() {
    const list = document.getElementById('owner-requests-list');
    const { data, error } = await supabaseClient.from('upgrade_requests').select('*').order('created_at', { ascending: false });
    list.classList.remove('hidden');
    if (error) { list.innerHTML = '<p class="text-sm" style="color: var(--red);">' + escapeHtml(error.message) + '</p>'; return; }
    if (!data || data.length === 0) { list.innerHTML = '<p class="text-sm text-center py-8" style="color: var(--text-muted);">No upgrade requests yet.</p>'; return; }
    const userMap = {};
    allUsersCache.forEach(function(u) { userMap[u.id] = u; });
    let html = '';
    data.forEach(function(r) {
        const u = userMap[r.user_id] || {};
        const statusBg = r.status === 'approved' ? 'text-green-400 bg-green-400/10' : r.status === 'pending' ? 'text-yellow-400 bg-yellow-400/10' : 'text-red-400 bg-red-400/10';
        html += '<div class="rounded-xl p-4" style="background: var(--surface); border: 1px solid var(--border);">' +
            '<div class="flex items-start justify-between mb-3"><div class="min-w-0">' +
            '<p class="font-bold truncate" style="color: var(--text);">' + escapeHtml(u.full_name || u.username || 'Unknown') + '</p>' +
            '<p class="text-xs mono truncate" style="color: var(--text-dim);">' + escapeHtml(u.email || '—') + '</p></div>' +
            '<span class="text-[10px] font-bold uppercase px-2 py-1 rounded flex-shrink-0 ' + statusBg + '">' + r.status + '</span></div>' +
            '<div class="rounded-lg p-3 mb-3 text-xs" style="background: var(--bg); border: 1px solid var(--border);">' +
            '<p class="font-bold capitalize mb-1" style="color: var(--text);">Wants: ' + escapeHtml(r.requested_plan) + (r.amount ? ' — $' + r.amount + '/mo' : '') + '</p>' +
            (r.contact_value ? '<p style="color: var(--text-muted);">Contact: <span class="mono">' + escapeHtml(r.contact_value) + '</span></p>' : '') +
            (r.notes ? '<p class="mt-1" style="color: var(--text-muted);">' + escapeHtml(r.notes) + '</p>' : '') + '</div>' +
            (r.status === 'pending' ?
                '<div class="flex gap-2"><button onclick="approveUpgrade(\'' + r.id + '\', \'' + r.user_id + '\', \'' + r.requested_plan + '\')" class="flex-1 bg-green-500/20 hover:bg-green-500/30 border border-green-500/40 text-green-400 font-bold py-2 rounded-lg text-xs">Approve</button>' +
                '<button onclick="rejectUpgrade(\'' + r.id + '\')" class="flex-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 font-bold py-2 rounded-lg text-xs">Reject</button></div>' : '') + '</div>';
    });
    list.innerHTML = html;
}

async function loadAllTeamsForOwner() {
    const list = document.getElementById('owner-teams-list');
    const { data, error } = await supabaseClient.from('team_members').select('*').order('invited_at', { ascending: false });
    list.classList.remove('hidden');
    if (error) { list.innerHTML = '<p class="text-sm" style="color: var(--red);">' + escapeHtml(error.message) + '</p>'; return; }
    if (!data || data.length === 0) { list.innerHTML = '<p class="text-sm text-center py-8" style="color: var(--text-muted);">No teams yet.</p>'; return; }
    const grouped = {};
    data.forEach(function(m) { if (!grouped[m.owner_id]) grouped[m.owner_id] = []; grouped[m.owner_id].push(m); });
    const userMap = {};
    allUsersCache.forEach(function(u) { userMap[u.id] = u; });
    let html = '';
    Object.keys(grouped).forEach(function(ownerId) {
        const owner = userMap[ownerId] || {};
        const members = grouped[ownerId];
        const active = members.filter(function(m) { return m.status === 'active'; }).length;
        const pending = members.filter(function(m) { return m.status === 'pending'; }).length;
        html += '<div class="rounded-xl p-4" style="background: var(--surface); border: 1px solid var(--border);">' +
            '<div class="flex items-start justify-between mb-3"><div class="min-w-0">' +
            '<p class="font-bold truncate" style="color: var(--text);">' + escapeHtml(owner.full_name || owner.username || 'Unknown') + '</p>' +
            '<p class="text-xs mono truncate" style="color: var(--text-dim);">' + escapeHtml(owner.email || ownerId) + '</p></div>' +
            '<span class="text-[10px] font-bold uppercase px-2 py-1 rounded flex-shrink-0" style="background: rgba(139,92,246,0.15); color: #8B5CF6;">' + (active + 1) + ' seats</span></div>' +
            '<div class="text-xs space-y-1" style="color: var(--text-muted);">' +
            '<div>Active members: <span class="font-bold" style="color: var(--text);">' + active + '</span></div>' +
            '<div>Pending invites: <span class="font-bold" style="color: var(--text);">' + pending + '</span></div></div></div>';
    });
    list.innerHTML = html;
}

async function updateOwnerStats() {
    const { count: userCount } = await supabaseClient.from('profiles').select('*', { count: 'exact', head: true });
    const { count: projectCount } = await supabaseClient.from('projects').select('*', { count: 'exact', head: true });
    const { data: payments } = await supabaseClient.from('payments').select('amount').eq('status', 'paid');
    const { data: teams } = await supabaseClient.from('team_members').select('owner_id').eq('status', 'active');
    const uniqueOwners = new Set((teams || []).map(function(t) { return t.owner_id; }));
    const revenue = (payments || []).reduce(function(s, p) { return s + Number(p.amount || 0); }, 0);
    document.getElementById('owner-stat-users').textContent = userCount || '—';
    document.getElementById('owner-stat-projects').textContent = projectCount || '—';
    document.getElementById('owner-stat-revenue').textContent = '$' + revenue.toFixed(2);
    document.getElementById('owner-stat-teams').textContent = uniqueOwners.size || '—';
}

function switchOwnerTab(tab) {
    const panels = { users: 'owner-users-panel', projects: 'owner-projects-panel', payments: 'owner-payments-panel', requests: 'owner-requests-panel', teams: 'owner-teams-panel' };
    const tabs = { users: 'owner-tab-users', projects: 'owner-tab-projects', payments: 'owner-tab-payments', requests: 'owner-tab-requests', teams: 'owner-tab-teams' };
    Object.keys(panels).forEach(function(k) {
        const panel = document.getElementById(panels[k]);
        const tabEl = document.getElementById(tabs[k]);
        if (!panel || !tabEl) return;
        if (k === tab) { panel.classList.remove('hidden'); tabEl.style.color = 'var(--text)'; tabEl.style.borderBottom = '2px solid var(--accent)'; }
        else { panel.classList.add('hidden'); tabEl.style.color = 'var(--text-muted)'; tabEl.style.borderBottom = 'none'; }
    });
}

async function updateUserRole(userId, newRole) {
    if (userId === currentUser.id && currentProfile.role === 'owner' && newRole !== 'owner') { showToast("Can't demote yourself as owner", 'error'); await loadAllUsers(); return; }
    const { error } = await supabaseClient.from('profiles').update({ role: newRole }).eq('id', userId);
    if (error) { showToast('Failed: ' + error.message, 'error'); await loadAllUsers(); return; }
    await loadAllUsers(); showToast('Role updated', 'success');
}

async function updateUserPlan(userId, newPlan) {
    const { error } = await supabaseClient.from('profiles').update({ plan: newPlan }).eq('id', userId);
    if (error) { showToast('Failed: ' + error.message, 'error'); await loadAllUsers(); return; }
    await loadAllUsers(); showToast('Plan updated', 'success');
}

async function approveUpgrade(requestId, userId, plan) {
    if (!confirm('Approve this upgrade?')) return;
    const { error: planError } = await supabaseClient.from('profiles').update({ plan: plan }).eq('id', userId);
    if (planError) { showToast('Failed: ' + planError.message, 'error'); return; }
    const { error: reqError } = await supabaseClient.from('upgrade_requests').update({ status: 'approved', resolved_at: new Date().toISOString() }).eq('id', requestId);
    if (reqError) { showToast('Failed: ' + reqError.message, 'error'); return; }
    await loadOwnerConsole(); showToast('Upgrade approved', 'success');
}

async function rejectUpgrade(requestId) {
    if (!confirm('Reject this request?')) return;
    const { error } = await supabaseClient.from('upgrade_requests').update({ status: 'rejected', resolved_at: new Date().toISOString() }).eq('id', requestId);
    if (error) { showToast('Failed: ' + error.message, 'error'); return; }
    await loadOwnerConsole(); showToast('Request rejected', 'success');
}

// ============================================
// UTIL
// ============================================

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        ['project-modal','project-detail-modal','project-edit-modal','github-modal','plan-modal','payment-modal','connect-modal','upgrade-modal','create-table-modal'].forEach(function(id) {
            const el = document.getElementById(id);
            if (el && !el.classList.contains('hidden')) el.classList.add('hidden');
        });
    }
});

// ============================================
// INIT
// ============================================

async function init() {
    initTheme();
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) showDashboardView(session.user);
    else showLandingView();
}

supabaseClient.auth.onAuthStateChange(function(event, session) {
    if (session) showDashboardView(session.user);
    else showLandingView();
});

init();
