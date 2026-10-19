// UKMBASE APP.JS — ULTIMATE FINAL BUILD (v622)

// ✅ GLOBAL ERROR CATCHER
window.onerror = function(msg, url, line) {
    const errDiv = document.createElement('div');
    errDiv.style.position = 'fixed'; errDiv.style.bottom = '10px'; errDiv.style.left = '10px'; errDiv.style.right = '10px';
    errDiv.style.background = 'rgba(239, 68, 68, 0.95)'; errDiv.style.color = 'white'; errDiv.style.padding = '12px';
    errDiv.style.zIndex = '999999'; errDiv.style.fontSize = '12px'; errDiv.style.borderRadius = '8px'; errDiv.style.fontFamily = 'monospace';
    errDiv.innerHTML = '<strong>JS Error:</strong> ' + msg + '<br><span style="font-size:10px;">Line ' + line + ' - ' + url + '</span>';
    document.body.appendChild(errDiv);
    setTimeout(() => errDiv.remove(), 10000);
    return false;
};

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

const SUPPORT_EMAIL    = 'rrrylukm@gmail.com';
const SUPPORT_WA_INTL  = '263774739401';

function supportWhatsAppLink(message) { return 'https://wa.me/' + SUPPORT_WA_INTL + '?text=' + encodeURIComponent(message || 'Hi Ukmbase support'); }
function supportEmailLink(subject) { return 'mailto:' + SUPPORT_EMAIL + '?subject=' + encodeURIComponent(subject || 'Ukmbase support'); }

// ============================================
// GLOBAL STATE
// ============================================
const landingView = document.getElementById('landing-view');
const authView = document.getElementById('auth-view');
const dashboardView = document.getElementById('dashboard-view');
const userEmailDisplay = document.getElementById('user-email');

let currentUser = null;
let currentProfile = null;
let showingDashboardFor = null;
let pendingInvite = null;
let chatHistory = [];
let projectsCache = [];
let connectionsCache = [];
let teamCache = [];
let allUsersCache = [];
let syncConfigCache = null;
let activeConnection = null;
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
let currentTableData = [];
let currentTableName = null;
let editingRowId = null;
let impersonatingUserId = null;
let currentChartData = null;
let currentSeedTable = null;

// ============================================
// THEME
// ============================================
function initTheme() { const saved = localStorage.getItem('ukmbase-theme') || 'dark'; applyTheme(saved); }
function applyTheme(theme) {
    if (theme === 'light') document.documentElement.setAttribute('data-theme', 'light'); else document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('ukmbase-theme', theme);
    const sunIcon = document.getElementById('theme-icon-sun'); const moonIcon = document.getElementById('theme-icon-moon');
    if (sunIcon && moonIcon) { if (theme === 'light') { sunIcon.classList.remove('hidden'); moonIcon.classList.add('hidden'); } else { sunIcon.classList.add('hidden'); moonIcon.classList.remove('hidden'); } }
    const label = document.getElementById('settings-theme-label'); if (label) label.textContent = theme === 'light' ? 'Light' : 'Dark';
}
function toggleTheme() { const current = localStorage.getItem('ukmbase-theme') || 'dark'; applyTheme(current === 'dark' ? 'light' : 'dark'); showToast('Switched to ' + (current === 'dark' ? 'light' : 'dark') + ' theme', 'success'); }

// ============================================
// UTILS
// ============================================
function showToast(message, type, duration) {
    type = type || 'success'; duration = duration || 3000;
    const container = document.getElementById('toast-container'); if (!container) return;
    const toast = document.createElement('div'); toast.className = 'toast ' + type; toast.textContent = message;
    container.appendChild(toast);
    setTimeout(function() { toast.style.opacity = '0'; toast.style.transition = 'all 0.3s ease'; setTimeout(function() { toast.remove(); }, 300); }, duration);
}
function escapeHtml(str) { if (!str) return ''; return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'); }
function getHeaders(key) { const headers = { 'apikey': key }; if (key.indexOf('sb_publishable_') !== 0) headers['Authorization'] = 'Bearer ' + key; return headers; }
function copyToClipboard(elementId, btn) { const el = document.getElementById(elementId); if (!el) return; navigator.clipboard.writeText(el.value || el.textContent); const originalText = btn.innerText; btn.innerText = 'Copied!'; setTimeout(() => { btn.innerText = originalText; }, 1500); }
function copyToClipboardText(text) { navigator.clipboard.writeText(text); showToast('Copied to clipboard!', 'success'); }

// ============================================
// PLAN LIMITS
// ============================================
function getLimits() { if (currentProfile && STAFF_ROLES.indexOf(currentProfile.role) !== -1) return PLAN_LIMITS.staff; const plan = (currentProfile && currentProfile.plan) || 'free'; return PLAN_LIMITS[plan] || PLAN_LIMITS.free; }
function canCreateProject() { return projectsCache.length < getLimits().projects; }
function canCreateConnection() { return connectionsCache.length < getLimits().connections; }
function canLinkRepo() { return projectsCache.filter(p => p.github_repo).length < getLimits().repos; }
function getTeamSeatsUsed() { return 1 + teamCache.filter(m => m.status === 'active').length; }
function canInviteMember() { return (getTeamSeatsUsed() + teamCache.filter(m => m.status === 'pending').length) < getLimits().seats; }

// ============================================
// VIEW SWITCHERS
// ============================================
function showLandingView() {
    showingDashboardFor = null; landingView.classList.remove('hidden'); authView.classList.add('hidden'); dashboardView.classList.add('hidden');
    document.querySelectorAll('[id^="public-"]').forEach(el => el.classList.add('hidden'));
}
function showAuthView() { landingView.classList.add('hidden'); authView.classList.remove('hidden'); dashboardView.classList.add('hidden'); setAuthMode('login'); }
async function showDashboardView(user) {
    if (!user) return;
    if (showingDashboardFor === user.id && !dashboardView.classList.contains('hidden')) return;
    showingDashboardFor = user.id; landingView.classList.add('hidden'); authView.classList.add('hidden'); dashboardView.classList.remove('hidden');
    if (user.email) userEmailDisplay.textContent = user.email; currentUser = user;
    await loadProfile(); await loadTeam(); await loadProjects();
    loadPayments(); loadPlans(); loadConnections().then(() => populateQueryConnections());
    loadMyUpgradeRequests(); loadQueryHistory(); checkForPendingInvites(); 
    switchView('overview');
}
function switchView(view) {
    const views = ['overview', 'ukmai', 'ukmquery', 'ukmsync', 'ukmdata', 'ukmtables', 'connect', 'ukmpay', 'team', 'billing', 'settings', 'owner'];
    views.forEach(v => {
        const el = document.getElementById('view-' + v); const nav = document.getElementById('nav-' + v); if (!el) return;
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
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('-translate-x-full'); }

// ============================================
// AUTH & PROFILE
// ============================================
function setAuthMode(mode) {
    authMode = mode; const isSignup = mode === 'signup';
    document.getElementById('field-fullname').classList.toggle('hidden', !isSignup); document.getElementById('field-confirm').classList.toggle('hidden', !isSignup); document.getElementById('strength-meter').classList.toggle('hidden', !isSignup);
    document.getElementById('auth-submit').textContent = isSignup ? 'Create Account' : 'Sign In'; document.getElementById('tab-login').classList.toggle('active', !isSignup); document.getElementById('tab-signup').classList.toggle('active', isSignup);
    document.getElementById('auth-error').classList.add('hidden'); document.getElementById('auth-success').classList.add('hidden');
}
function togglePassword(id, btn) { const input = document.getElementById(id); const isPassword = input.type === 'password'; input.type = isPassword ? 'text' : 'password'; btn.style.color = isPassword ? 'var(--accent)' : 'var(--text-dim)'; }
function updateStrength() {
    const pwd = document.getElementById('auth-password').value; let score = 0;
    if (pwd.length >= 8) score++; if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score++; if (/\d/.test(pwd)) score++; if (/[^A-Za-z0-9]/.test(pwd)) score++; if (pwd.length >= 12) score++;
    const colors = ['#EF4444', '#EF4444', '#F59E0B', '#06B6D4', '#10B981', '#10B981']; const labels = ['Too short', 'Weak', 'Fair', 'Good', 'Strong', 'Excellent'];
    for (let i = 1; i <= 5; i++) { const bar = document.getElementById('sb-' + i); if (bar) bar.style.background = i <= score ? colors[score] : 'var(--border)'; }
    const labelEl = document.getElementById('strength-label'); if (labelEl) { labelEl.textContent = pwd ? labels[score] : 'Password strength'; labelEl.style.color = pwd ? colors[score] : 'var(--text-dim)'; }
}
async function handleAuthSubmit() { if (authMode === 'login') return handleLogin(); return handleSignup(); }
async function handleLogin() {
    const email = document.getElementById('auth-email').value; const password = document.getElementById('auth-password').value; const errEl = document.getElementById('auth-error'); errEl.classList.add('hidden');
    if (!email || !password) { errEl.textContent = 'Please fill in all fields.'; errEl.classList.remove('hidden'); return; }
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) { errEl.textContent = error.message; errEl.classList.remove('hidden'); } else { showDashboardView(data.user); }
}
async function handleSignup() {
    const fullName = document.getElementById('auth-fullname').value.trim(); const email = document.getElementById('auth-email').value.trim(); const password = document.getElementById('auth-password').value; const confirm = document.getElementById('auth-confirm').value;
    const errEl = document.getElementById('auth-error'); const succEl = document.getElementById('auth-success'); errEl.classList.add('hidden'); succEl.classList.add('hidden');
    if (!fullName || !email || !password || !confirm) { errEl.textContent = 'Please fill in all fields.'; errEl.classList.remove('hidden'); return; }
    if (password !== confirm) { errEl.textContent = 'Passwords do not match.'; errEl.classList.remove('hidden'); return; }
    if (password.length < 8) { errEl.textContent = 'Password must be at least 8 characters.'; errEl.classList.remove('hidden'); return; }
    const { data, error } = await supabaseClient.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
    if (error) { errEl.textContent = error.message; errEl.classList.remove('hidden'); } else if (data.session) { showDashboardView(data.user); } else { succEl.textContent = 'Account created! Check your email to confirm.'; succEl.classList.remove('hidden'); }
}
async function signInWithProvider(provider) {
    const errEl = document.getElementById('auth-error'); errEl.classList.add('hidden');
    const { error } = await supabaseClient.auth.signInWithOAuth({ provider, options: { redirectTo: window.location.origin + window.location.pathname } });
    if (error) { errEl.textContent = error.message; errEl.classList.remove('hidden'); }
}
async function handleLogout() { await supabaseClient.auth.signOut(); currentUser = null; currentProfile = null; showLandingView(); showToast('Signed out', 'success'); }

// ============================================
// PASSWORD RESET & WAITLIST
// ============================================
function showForgotPasswordView() { document.getElementById('auth-email').parentElement.classList.add('hidden'); document.getElementById('auth-password').parentElement.parentElement.classList.add('hidden'); document.getElementById('auth-submit').classList.add('hidden'); document.getElementById('forgot-password-view').classList.remove('hidden'); document.getElementById('reset-error').classList.add('hidden'); document.getElementById('reset-success').classList.add('hidden'); }
function hideForgotPasswordView() { document.getElementById('auth-email').parentElement.classList.remove('hidden'); document.getElementById('auth-password').parentElement.parentElement.classList.remove('hidden'); document.getElementById('auth-submit').classList.remove('hidden'); document.getElementById('forgot-password-view').classList.add('hidden'); }
async function sendPasswordReset() {
    const email = document.getElementById('reset-email').value.trim(); const errEl = document.getElementById('reset-error'); const succEl = document.getElementById('reset-success'); const btn = document.getElementById('reset-submit-btn');
    errEl.classList.add('hidden'); succEl.classList.add('hidden');
    if (!email) { errEl.textContent = 'Please enter your email address.'; errEl.classList.remove('hidden'); return; }
    btn.textContent = 'Sending...'; btn.disabled = true;
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname + '?type=recovery' });
    btn.textContent = 'Send Reset Link'; btn.disabled = false;
    if (error) { errEl.textContent = error.message; errEl.classList.remove('hidden'); } else { succEl.textContent = 'Check your email! We sent a link to ' + email; succEl.classList.remove('hidden'); }
}
async function updatePassword() {
    const newPassword = document.getElementById('new-password').value; const errEl = document.getElementById('new-pass-error'); const btn = document.getElementById('new-pass-submit-btn'); errEl.classList.add('hidden');
    if (!newPassword || newPassword.length < 8) { errEl.textContent = 'Password must be at least 8 characters.'; errEl.classList.remove('hidden'); return; }
    btn.textContent = 'Updating...'; btn.disabled = true;
    const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
    btn.textContent = 'Update Password'; btn.disabled = false;
    if (error) { errEl.textContent = error.message; errEl.classList.remove('hidden'); } else { showToast('Password updated successfully!', 'success'); window.history.replaceState({}, document.title, window.location.pathname); showDashboardView(currentUser); }
}
async function joinWaitlist() {
    const email = document.getElementById('email-input').value; const submitBtn = document.getElementById('submit-btn');
    if (!email) return showToast('Please enter your email', 'error');
    submitBtn.innerText = 'Joining...'; submitBtn.disabled = true;
    const { error } = await supabaseClient.from('waitlist').insert([{ email }]);
    if (error) { showToast('Error: ' + error.message, 'error'); submitBtn.innerText = 'Join Waitlist'; submitBtn.disabled = false; } else { document.getElementById('waitlist-form').classList.add('hidden'); document.getElementById('waitlist-success').classList.remove('hidden'); }
}
function renderRoleBadge(role) {
    const badge = document.getElementById('role-badge'); const navOwnerWrap = document.getElementById('nav-owner-wrap'); if (!badge) return;
    badge.classList.remove('role-owner', 'role-admin', 'role-support', 'hidden');
    if (!role || role === 'user') badge.classList.add('hidden'); else { badge.classList.add('role-' + role); badge.textContent = role.charAt(0).toUpperCase() + role.slice(1); }
    if (navOwnerWrap) navOwnerWrap.classList.toggle('hidden', STAFF_ROLES.indexOf(role) === -1);
}
async function loadProfile() {
    if (!currentUser) return;
    const { data, error } = await supabaseClient.from('profiles').select('*').eq('id', currentUser.id).single();
    if (error) return console.error(error.message);
    currentProfile = data; renderRoleBadge(data.role);
    supabaseClient.from('profiles').update({ last_login_at: new Date().toISOString() }).eq('id', currentUser.id).then(() => {});
}
function renderSettings() {
    if (!currentProfile) return;
    document.getElementById('settings-initial').textContent = (currentProfile.full_name || currentProfile.username || 'U').charAt(0).toUpperCase();
    document.getElementById('settings-display-name').textContent = currentProfile.full_name || currentProfile.username || 'User';
    document.getElementById('settings-display-email').textContent = currentProfile.email || currentUser.email;
    document.getElementById('settings-plan').textContent = currentProfile.plan || 'free';
    document.getElementById('settings-fullname').value = currentProfile.full_name || ''; document.getElementById('settings-username').value = currentProfile.username || '';
    document.getElementById('settings-phone').value = currentProfile.phone || ''; document.getElementById('settings-country').value = currentProfile.country || '';
    const limits = getLimits(); const displayPlan = STAFF_ROLES.indexOf(currentProfile.role) !== -1 ? currentProfile.role : (currentProfile.plan || 'free');
    document.getElementById('settings-plan-2').textContent = displayPlan;
    document.getElementById('settings-limit-projects').textContent = projectsCache.length + ' / ' + (limits.projects >= 999 ? '∞' : limits.projects);
    document.getElementById('settings-limit-connections').textContent = connectionsCache.length + ' / ' + (limits.connections >= 999 ? '∞' : limits.connections);
    document.getElementById('settings-limit-seats').textContent = getTeamSeatsUsed() + ' / ' + (limits.seats >= 999 ? '∞' : limits.seats);
}
async function saveProfile() {
    const full_name = document.getElementById('settings-fullname').value.trim(); const username = document.getElementById('settings-username').value.trim();
    const phone = document.getElementById('settings-phone').value.trim(); const country = document.getElementById('settings-country').value;
    const btn = document.getElementById('settings-save-btn'); document.getElementById('settings-error').classList.add('hidden'); document.getElementById('settings-success').classList.add('hidden');
    if (!full_name || !username) return showToast('Name and username required', 'error');
    btn.textContent = 'Saving...'; btn.disabled = true;
    const { error } = await supabaseClient.from('profiles').update({ full_name, username, phone, country }).eq('id', currentUser.id);
    btn.textContent = 'Save Changes'; btn.disabled = false;
    if (error) { document.getElementById('settings-error').textContent = error.message; document.getElementById('settings-error').classList.remove('hidden'); }
    else { document.getElementById('settings-success').textContent = 'Profile saved.'; document.getElementById('settings-success').classList.remove('hidden'); await loadProfile(); renderSettings(); showToast('Profile saved', 'success'); }
}

// ============================================
// TEAM & INVITES
// ============================================
async function checkForPendingInvites() {
    if (!currentUser || !currentUser.email) return;
    const { data } = await supabaseClient.from('team_members').select('*, profiles:owner_id(full_name, email)').eq('invite_email', currentUser.email).eq('status', 'pending').maybeSingle();
    if (data) {
        pendingInvite = data; const ownerName = data.profiles?.full_name || data.profiles?.email || 'A user';
        document.getElementById('invite-banner-text').innerHTML = `<strong>${escapeHtml(ownerName)}</strong> has invited you to join their team as a <strong>${escapeHtml(data.role)}</strong>.`;
        document.getElementById('team-invite-banner').classList.remove('hidden');
    }
}
async function acceptTeamInvite() {
    if (!pendingInvite) return;
    const { error } = await supabaseClient.from('team_members').update({ status: 'active' }).eq('id', pendingInvite.id);
    if (error) return showToast(error.message, 'error');
    showToast('Invite accepted!', 'success'); document.getElementById('team-invite-banner').classList.add('hidden'); pendingInvite = null; await loadProjects();
}
async function declineTeamInvite() {
    if (!pendingInvite || !confirm('Decline invite?')) return;
    await supabaseClient.from('team_members').delete().eq('id', pendingInvite.id);
    document.getElementById('team-invite-banner').classList.add('hidden'); pendingInvite = null;
}
async function loadTeam() { if (!currentUser) return; const { data } = await supabaseClient.from('team_members').select('*').eq('owner_id', currentUser.id).order('invited_at', { ascending: false }); teamCache = data || []; }
function renderTeam() {
    const limits = getLimits(); const used = getTeamSeatsUsed(); const pending = teamCache.filter(m => m.status === 'pending').length; const total = used + pending; const seatCap = limits.seats >= 999 ? '∞' : limits.seats;
    document.getElementById('team-seats-display').textContent = total + ' / ' + seatCap;
    document.getElementById('team-seats-bar').style.width = (limits.seats >= 999 ? 5 : Math.min(100, (total / limits.seats) * 100)) + '%';
    const planNote = document.getElementById('team-plan-note'); const inviteCard = document.getElementById('team-invite-card');
    if (limits.seats <= 1) { planNote.textContent = 'Upgrade to Team for 3 seats.'; inviteCard.classList.add('hidden'); }
    else if (total >= limits.seats) { planNote.textContent = 'All seats used.'; inviteCard.classList.add('hidden'); }
    else { planNote.textContent = (limits.seats - total) + ' seats available.'; inviteCard.classList.remove('hidden'); }
    const activeList = document.getElementById('team-active-list'); const active = teamCache.filter(m => m.status === 'active');
    let html = '<div class="flex items-center gap-3 p-3 rounded-lg" style="background: var(--bg); border: 1px solid var(--border);"><div class="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold" style="background: rgba(79,70,229,0.2); color: var(--accent);">' + (currentProfile?.full_name || 'U').charAt(0).toUpperCase() + '</div><div class="flex-1 min-w-0"><p class="text-sm font-bold truncate" style="color: var(--text);">' + escapeHtml(currentProfile?.full_name || 'You') + ' (you)</p><p class="text-xs mono truncate" style="color: var(--text-dim);">' + escapeHtml(currentUser.email) + '</p></div><span class="text-[9px] font-bold uppercase px-2 py-1 rounded role-owner">Owner</span></div>';
    active.forEach(m => {
        html += '<div class="flex items-center gap-3 p-3 rounded-lg" style="background: var(--bg); border: 1px solid var(--border);"><div class="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold" style="background: rgba(6,182,212,0.2); color: var(--cyan);">' + escapeHtml(m.invite_email.charAt(0).toUpperCase()) + '</div><div class="flex-1 min-w-0"><p class="text-sm font-bold truncate" style="color: var(--text);">' + escapeHtml(m.invite_email) + '</p><p class="text-xs capitalize" style="color: var(--text-dim);">' + escapeHtml(m.role) + '</p></div><button onclick="removeTeamMember(\'' + m.id + '\')" class="p-2 text-red-400"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22"></path></svg></button></div>';
    });
    activeList.innerHTML = html;
    const pendingCard = document.getElementById('team-pending-card'); const pendingList = document.getElementById('team-pending-list');
    if (pending === 0) pendingCard.classList.add('hidden');
    else { pendingCard.classList.remove('hidden'); pendingList.innerHTML = teamCache.filter(m => m.status === 'pending').map(m => '<div class="flex items-center justify-between p-3 rounded-lg" style="background: var(--bg); border: 1px dashed var(--border);"><div><p class="text-sm font-bold" style="color: var(--text);">' + escapeHtml(m.invite_email) + '</p><p class="text-xs" style="color: var(--amber);">Pending</p></div><button onclick="cancelInvite(\'' + m.id + '\')" class="text-xs text-red-400">Cancel</button></div>').join(''); }
}
async function sendTeamInvite() {
    const email = document.getElementById('team-invite-email').value.trim().toLowerCase(); const role = document.getElementById('team-invite-role').value; const btn = document.getElementById('team-invite-btn');
    if (!email || !canInviteMember()) return showToast('Invalid or no seats left', 'error');
    btn.textContent = 'Sending...'; btn.disabled = true;
    const { error } = await supabaseClient.from('team_members').insert([{ owner_id: currentUser.id, invite_email: email, role, status: 'pending' }]);
    btn.textContent = 'Send Invite'; btn.disabled = false;
    if (error) return showToast(error.message, 'error');
    document.getElementById('team-invite-email').value = ''; await loadTeam(); renderTeam(); showToast('Invite sent', 'success');
}
async function removeTeamMember(id) { if (confirm('Remove member?')) { await supabaseClient.from('team_members').update({ status: 'removed' }).eq('id', id); await loadTeam(); renderTeam(); } }
async function cancelInvite(id) { if (confirm('Cancel invite?')) { await supabaseClient.from('team_members').delete().eq('id', id); await loadTeam(); renderTeam(); } }

// ============================================
// PROJECTS
// ============================================
function openProjectModal() {
    if (!canCreateProject()) return confirm('Plan limit reached. Upgrade?') ? switchView('billing') : null;
    document.getElementById('project-modal').classList.remove('hidden'); document.getElementById('modal-error').classList.add('hidden');
    ['project-name', 'project-slug', 'project-description'].forEach(id => document.getElementById(id).value = '');
}
function closeProjectModal() { document.getElementById('project-modal').classList.add('hidden'); }
function autoSlug() { document.getElementById('project-slug').value = document.getElementById('project-name').value.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-'); }
async function loadProjects() {
    if (!currentUser) return;
    document.getElementById('projects-loading').classList.remove('hidden'); document.getElementById('projects-grid').classList.add('hidden'); document.getElementById('empty-state').classList.add('hidden');
    const { data, error } = await supabaseClient.from('projects').select('*').order('created_at', { ascending: false });
    document.getElementById('projects-loading').classList.add('hidden');
    if (error) return console.error(error);
    projectsCache = data || []; renderProjects(projectsCache); updateStats(projectsCache); populateProjectSelects();
}
function renderProjects(projects) {
    const emptyState = document.getElementById('empty-state'); const grid = document.getElementById('projects-grid');
    if (!projects || projects.length === 0) { emptyState.classList.remove('hidden'); grid.classList.add('hidden'); return; }
    emptyState.classList.add('hidden'); grid.classList.remove('hidden');
    let html = '';
    projects.forEach(p => {
        const isOwned = p.owner_id === currentUser.id;
        let repoPill = p.github_repo ? '<span class="mono flex items-center gap-1"><svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>' + escapeHtml(p.github_repo.split('/')[1] || p.github_repo) + '</span>' : '';
        const teamBadge = !isOwned ? '<span class="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded" style="background: rgba(139,92,246,0.15); color: #8B5CF6;">Team</span>' : '';
        html += '<div class="feature-card rounded-xl p-5" style="background: var(--surface); border: 1px solid var(--border);" onclick="openProjectDetail(\'' + p.id + '\')">' +
            '<div class="flex items-start justify-between mb-3"><div class="w-10 h-10 rounded-lg flex items-center justify-center" style="background: rgba(79,70,229,0.1); border: 1px solid rgba(79,70,229,0.3);"><svg class="w-5 h-5" style="color: var(--accent);" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg></div><div class="flex items-center gap-1">' + teamBadge + '<span class="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded ' + (p.status === 'paused' ? 'text-yellow-400 bg-yellow-400/10' : 'text-[#06B6D4] bg-[#06B6D4]/10') + '">' + (p.status || 'active') + '</span></div></div>' +
            '<h3 class="font-bold mb-1 truncate" style="color: var(--text);">' + escapeHtml(p.name) + '</h3><p class="text-xs mono mb-3 truncate" style="color: var(--text-muted);">' + escapeHtml(p.slug) + '</p>' +
            '<p class="text-sm line-clamp-2 mb-4" style="color: var(--text-muted);">' + escapeHtml(p.description || 'No description yet.') + '</p>' +
            '<div class="flex items-center justify-between text-[10px]" style="color: var(--text-dim);"><span>' + new Date(p.created_at).toLocaleDateString() + '</span>' + repoPill + '</div></div>';
    });
    grid.innerHTML = html;
}
function updateStats(projects) {
    const tokens = projects.reduce((s, p) => s + (Number(p.ai_tokens_used) || 0), 0); const syncs = projects.reduce((s, p) => s + (Number(p.sync_ops_used) || 0), 0);
    document.getElementById('stat-tokens').innerHTML = tokens.toLocaleString() + ' <span class="text-xs font-normal" style="color: var(--text-dim);">/ 100k</span>';
    document.getElementById('stat-syncs').textContent = syncs.toLocaleString();
}
async function createProject() {
    const name = document.getElementById('project-name').value.trim(); const slug = document.getElementById('project-slug').value.trim(); const description = document.getElementById('project-description').value.trim();
    const errEl = document.getElementById('modal-error'); const btn = document.getElementById('create-project-btn');
    if (!name || !slug) return showToast('Name and slug required', 'error');
    btn.innerText = 'Forging...'; btn.disabled = true;
    const { error } = await supabaseClient.from('projects').insert([{ owner_id: currentUser.id, name, slug, description: description || null, status: 'active' }]);
    btn.innerText = 'Forge Project'; btn.disabled = false;
    if (error) { errEl.textContent = error.message; errEl.classList.remove('hidden'); return; }
    closeProjectModal(); await loadProjects(); showToast('Project forged', 'success');
}
async function openProjectDetail(id) {
    const p = projectsCache.find(x => x.id === id); if (!p) return;
    viewingProjectId = id; const isOwned = p.owner_id === currentUser.id;
    document.getElementById('pd-title').textContent = p.name; const body = document.getElementById('pd-body');
    body.innerHTML = '<div class="flex items-center gap-3 flex-wrap"><span class="text-xs mono" style="color: var(--text-dim);">' + escapeHtml(p.slug) + '</span></div>' +
        '<p class="text-sm" style="color: var(--text-muted);">' + escapeHtml(p.description || 'No description yet.') + '</p>' +
        '<div class="space-y-2 pt-2">' + (isOwned ? '<button onclick="openProjectEdit(\'' + p.id + '\')" class="w-full font-bold py-3 rounded-lg text-white" style="background: var(--accent);">Edit Project</button><button onclick="deleteProject(\'' + p.id + '\')" class="w-full font-bold py-3 rounded-lg bg-red-500/20 border border-red-500/40 text-red-400">Delete Project</button>' : '<div class="p-4 text-center text-xs" style="color: var(--text-muted);">Team member — view only.</div>') + '</div>';
    document.getElementById('project-detail-modal').classList.remove('hidden');
}
function closeProjectDetail() { document.getElementById('project-detail-modal').classList.add('hidden'); viewingProjectId = null; }
function openProjectEdit(id) { const p = projectsCache.find(x => x.id === id); document.getElementById('edit-project-name').value = p.name; document.getElementById('edit-project-slug').value = p.slug; document.getElementById('edit-project-description').value = p.description || ''; document.getElementById('project-edit-modal').classList.remove('hidden'); }
function closeProjectEdit() { document.getElementById('project-edit-modal').classList.add('hidden'); }
async function saveProjectEdit() {
    const name = document.getElementById('edit-project-name').value.trim(); const slug = document.getElementById('edit-project-slug').value.trim(); const description = document.getElementById('edit-project-description').value.trim();
    await supabaseClient.from('projects').update({ name, slug, description }).eq('id', viewingProjectId);
    closeProjectEdit(); closeProjectDetail(); await loadProjects(); showToast('Project updated', 'success');
}
async function deleteProject(id) { if (!confirm('Permanently delete this project?')) return; await supabaseClient.from('projects').delete().eq('id', id); closeProjectDetail(); await loadProjects(); showToast('Project deleted', 'success'); }

// ============================================
// UKMAI
// ============================================
function handleChatKeydown(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } }
async function sendPrompt(text) { document.getElementById('chat-input').value = text; await sendChat(); }
async function sendChat() {
    const input = document.getElementById('chat-input'); const sendBtn = document.getElementById('chat-send'); const prompt = input.value.trim(); if (!prompt) return;
    input.value = ''; sendBtn.disabled = true; appendMessage('user', prompt); const typingId = appendTypingIndicator();
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        const res = await fetch(SUPABASE_URL + '/functions/v1/ukmai', { method: 'POST', headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: "You are a Postgres expert. Output SQL in ```sql``` blocks. User request: " + prompt, mode: 'default' }) });
        const data = await res.json(); removeTypingIndicator(typingId);
        if (data.error) appendMessage('ai', '**Error:** ' + data.error); else { appendMessage('ai', data.content || 'No response.'); chatHistory.push({ role: 'user', content: prompt }, { role: 'ai', content: data.content }); }
    } catch (err) { removeTypingIndicator(typingId); appendMessage('ai', '**Network error:** ' + err.message); }
    sendBtn.disabled = false; input.focus();
}
function appendMessage(role, content) {
    const container = document.getElementById('chat-messages'); if (container.querySelector('.text-center')) container.innerHTML = '';
    const wrapper = document.createElement('div'); wrapper.className = 'flex gap-3 max-w-3xl mx-auto';
    if (role === 'user') { wrapper.className += ' flex-row-reverse'; wrapper.innerHTML = '<div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style="background: rgba(79,70,229,0.2);"><svg class="w-4 h-4" style="color: var(--accent);" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg></div><div class="rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[80%] text-sm text-white" style="background: var(--accent);">' + escapeHtml(content) + '</div>'; }
    else { const parsedHtml = DOMPurify.sanitize(marked.parse(content)); wrapper.innerHTML = '<div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style="background: rgba(245,158,11,0.2);"><svg class="w-4 h-4 text-[#F59E0B]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"></path></svg></div><div class="rounded-2xl rounded-tl-sm px-4 py-3 max-w-[85%] text-sm chat-message" style="background: var(--surface); border: 1px solid var(--border); color: var(--text);">' + parsedHtml + '</div>'; }
    container.appendChild(wrapper);
    wrapper.querySelectorAll('pre code').forEach(b => hljs.highlightElement(b));
    wrapper.querySelectorAll('pre').forEach(pre => {
        pre.style.position = 'relative'; const copyBtn = document.createElement('button'); copyBtn.className = 'copy-btn'; copyBtn.innerText = 'Copy';
        copyBtn.onclick = () => { navigator.clipboard.writeText(pre.querySelector('code').innerText); copyBtn.innerText = 'Copied!'; setTimeout(() => copyBtn.innerText = 'Copy', 1500); }; pre.appendChild(copyBtn);
        const codeEl = pre.querySelector('code');
        if (role === 'ai' && codeEl && (codeEl.className.includes('language-sql') || codeEl.innerText.trim().toUpperCase().startsWith('CREATE'))) {
            const execBtn = document.createElement('button'); execBtn.className = 'w-full mt-2 text-xs font-bold py-2 rounded-lg flex items-center justify-center gap-2'; execBtn.style.background = 'rgba(139,92,246,0.15)'; execBtn.style.color = '#8B5CF6'; execBtn.style.border = '1px solid rgba(139,92,246,0.3)'; execBtn.innerHTML = '⚡ Execute in Database';
            execBtn.onclick = () => executeAiSQL(codeEl.innerText, execBtn); pre.parentNode.insertBefore(execBtn, pre.nextSibling);
        }
    });
    container.scrollTop = container.scrollHeight;
}
async function executeAiSQL(sqlText, btn) {
    if (!currentUkmDataProjectId) return showToast('Select a project in Ukmbase Data first.', 'error');
    btn.innerHTML = 'Executing...'; btn.disabled = true;
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        const res = await fetch(SUPABASE_URL + '/functions/v1/ukmdata', { method: 'POST', headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'execute_sql', project_id: currentUkmDataProjectId, sql_query: sqlText }) });
        const data = await res.json(); if (data.error) throw new Error(data.error);
        btn.innerHTML = '✅ Executed Successfully'; btn.style.background = 'rgba(16,185,129,0.15)'; btn.style.color = '#10B981'; showToast('SQL executed successfully!', 'success');
    } catch (err) { showToast(err.message, 'error'); btn.innerHTML = '⚡ Execute in Database'; btn.disabled = false; }
}
function appendTypingIndicator() {
    const container = document.getElementById('chat-messages'); if (container.querySelector('.text-center')) container.innerHTML = '';
    const id = 'typing-' + Date.now(); const wrapper = document.createElement('div'); wrapper.id = id; wrapper.className = 'flex gap-3 max-w-3xl mx-auto';
    wrapper.innerHTML = '<div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style="background: rgba(245,158,11,0.2);"><svg class="w-4 h-4 text-[#F59E0B]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"></path></svg></div><div class="rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1" style="background: var(--surface); border: 1px solid var(--border);"><span class="typing-dot w-2 h-2 rounded-full" style="background: var(--text-muted);"></span><span class="typing-dot w-2 h-2 rounded-full" style="background: var(--text-muted);"></span><span class="typing-dot w-2 h-2 rounded-full" style="background: var(--text-muted);"></span></div>';
    container.appendChild(wrapper); container.scrollTop = container.scrollHeight; return id;
}
function removeTypingIndicator(id) { const el = document.getElementById(id); if (el) el.remove(); }
function clearChat() { document.getElementById('chat-messages').innerHTML = '<div class="text-center py-8"><h3 class="font-bold mb-1" style="color: var(--text);">Chat cleared</h3></div>'; chatHistory = []; }

// ============================================
// UKMBASE DATA (MASTER)
// ============================================
function populateUkmDataProjectSelect() {
    const sel = document.getElementById('ukmdata-project-select'); if (!sel) return;
    const own = projectsCache.filter(p => p.owner_id === currentUser.id);
    if (own.length === 0) { document.getElementById('ukmdata-empty').classList.remove('hidden'); document.getElementById('ukmdata-panel').classList.add('hidden'); sel.innerHTML = '<option value="">— no projects —</option>'; return; }
    document.getElementById('ukmdata-empty').classList.add('hidden'); let html = ''; own.forEach(p => { html += '<option value="' + p.id + '">' + escapeHtml(p.name) + '</option>'; });
    const current = sel.value; sel.innerHTML = html; if (current && own.find(p => p.id === current)) sel.value = current; else sel.value = own[0].id; onUkmDataProjectChange();
}
async function onUkmDataProjectChange() { const sel = document.getElementById('ukmdata-project-select'); if (!sel || !sel.value) return; currentUkmDataProjectId = sel.value; document.getElementById('ukmdata-panel').classList.remove('hidden'); await loadUkmDataState(); }
async function loadUkmDataState() {
    if (!currentUkmDataProjectId || !currentUser) return;
    const { data: schemaRow } = await supabaseClient.from('project_schemas').select('*').eq('project_id', currentUkmDataProjectId).maybeSingle();
    const cardIds = ['info', 'tables', 'sql', 'auth', 'storage', 'pages', 'crons', 'webhooks', 'mail', 'logs', 'apikeys'];
    if (!schemaRow) {
        ukmDataSchema = null; document.getElementById('ukmdata-enable-card').classList.remove('hidden');
        cardIds.forEach(id => { const el = document.getElementById('ukmdata-' + id + '-card'); if (el) el.classList.add('hidden'); }); return;
    }
    ukmDataSchema = schemaRow.schema_name; document.getElementById('ukmdata-enable-card').classList.add('hidden');
    cardIds.forEach(id => { const el = document.getElementById('ukmdata-' + id + '-card'); if (el) el.classList.remove('hidden'); }); document.getElementById('ukmdata-schema-name').textContent = ukmDataSchema;
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
    if (!currentUkmDataProjectId) return; const btn = document.getElementById('ukmdata-enable-btn'); btn.textContent = 'Enabling...'; btn.disabled = true;
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        const res = await fetch(SUPABASE_URL + '/functions/v1/ukmdata', { method: 'POST', headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'enable', project_id: currentUkmDataProjectId }) });
        const data = await res.json(); if (data.error) { showToast(data.error, 'error'); return; } showToast('Ukmbase Data enabled', 'success'); await loadUkmDataState();
    } catch (err) { showToast(err.message, 'error'); } finally { btn.textContent = 'Enable for this project'; btn.disabled = false; }
}

// ============================================
// UKMBASE DATA — TABLES & VIEWS
// ============================================
async function loadUkmDataTables() {
    const loading = document.getElementById('ukmdata-tables-loading'); const list = document.getElementById('ukmdata-tables-list'); const empty = document.getElementById('ukmdata-tables-empty'); loading.classList.remove('hidden'); list.classList.add('hidden'); empty.classList.add('hidden');
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        const res = await fetch(SUPABASE_URL + '/functions/v1/ukmdata', { method: 'POST', headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'list', project_id: currentUkmDataProjectId }) });
        const data = await res.json(); loading.classList.add('hidden'); if (data.error) return showToast(data.error, 'error');
        ukmDataTables = data.tables || []; if (ukmDataTables.length === 0) { empty.classList.remove('hidden'); return; } list.classList.remove('hidden');
        list.innerHTML = ukmDataTables.map(t => `
            <div class="rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3" style="background: var(--bg); border: 1px solid var(--border);">
                <div class="flex items-center gap-3 min-w-0"><div class="w-8 h-8 rounded flex items-center justify-center flex-shrink-0" style="background: rgba(139,92,246,0.15);"><svg class="w-4 h-4" style="color: #8B5CF6;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M3 14h18m-9-4v8m-7-4h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg></div><div class="min-w-0"><p class="text-sm font-bold truncate mono" style="color: var(--text);">${escapeHtml(t.table_name)}</p></div></div>
                <div class="flex flex-wrap items-center gap-2">
                    <div class="flex items-center gap-1 px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg)]"><span class="text-[9px] font-bold uppercase" style="color: ${t.rls_enabled ? 'var(--green)' : 'var(--text-dim)'}">Lock</span><label class="switch" style="width: 32px; height: 18px;"><input type="checkbox" ${t.rls_enabled ? 'checked' : ''} onchange="toggleTableRLS('${t.table_name}', this.checked)"><span class="slider" style="border-radius: 18px;"></span></label></div>
                    <div class="flex items-center gap-1 px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg)]"><span class="text-[9px] font-bold uppercase" style="color: ${t.realtime_enabled ? 'var(--cyan)' : 'var(--text-dim)'}">Live</span><label class="switch" style="width: 32px; height: 18px;"><input type="checkbox" ${t.realtime_enabled ? 'checked' : ''} onchange="toggleTableRealtime('${t.table_name}', this.checked)"><span class="slider" style="border-radius: 18px;"></span></label></div>
                    <button onclick="viewTableData('${t.table_name}')" class="text-[10px] font-bold px-3 py-1.5 rounded-lg" style="background: rgba(139,92,246,0.1); color: #8B5CF6; border: 1px solid rgba(139,92,246,0.3);">View</button>
                    <button onclick="openChartModal('${t.table_name}')" class="text-[10px] font-bold px-2 py-1.5 rounded-lg" style="background: rgba(245,158,11,0.1); color: var(--amber); border: 1px solid rgba(245,158,11,0.3);">Chart</button>
                    <button onclick="openSeedDataModal('${t.table_name}')" class="text-[10px] font-bold px-2 py-1.5 rounded-lg" style="background: rgba(16,185,129,0.1); color: var(--green); border: 1px solid rgba(16,185,129,0.3);">Seed</button>
                    <button onclick="copyFormLink('${t.table_name}')" class="text-[10px] font-bold px-2 py-1.5 rounded-lg" style="background: rgba(236,72,153,0.1); color: #EC4899; border: 1px solid rgba(236,72,153,0.3);">Form</button>
                    <input type="file" id="csv-input-${t.table_name}" accept=".csv" class="hidden" onchange="handleCsvUpload(event, '${t.table_name}')"><button onclick="document.getElementById('csv-input-${t.table_name}').click()" class="text-[10px] font-bold px-2 py-1.5 rounded-lg" style="background: rgba(16,185,129,0.1); color: var(--green); border: 1px solid rgba(16,185,129,0.3);">CSV</button>
                    <button onclick="showTableApi('${t.table_name}')" class="text-[10px] font-bold px-2 py-1.5 rounded-lg" style="background: rgba(6,182,212,0.1); color: var(--cyan); border: 1px solid rgba(6,182,212,0.3);">API</button>
                    <button onclick="dropUkmDataTable('${t.table_name}')" class="p-1.5 text-red-400"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22"></path></svg></button>
                </div></div>`).join('');
    } catch (err) { loading.classList.add('hidden'); showToast(err.message, 'error'); }
}
function openCreateTableModal() { if (!ukmDataSchema) return showToast('Enable Ukmbase Data first', 'error'); document.getElementById('create-table-modal').classList.remove('hidden'); document.getElementById('new-table-name').value = ''; document.getElementById('new-table-columns').innerHTML = ''; ukmDataColumnCounter = 0; addColumnRow(); }
function closeCreateTableModal() { document.getElementById('create-table-modal').classList.add('hidden'); }
function addColumnRow() {
    ukmDataColumnCounter++; const container = document.getElementById('new-table-columns'); const row = document.createElement('div'); row.className = 'flex gap-2 items-center';
    row.innerHTML = '<input type="text" class="col-name flex-1 rounded-lg px-3 py-2 mono text-xs focus:outline-none" placeholder="column_name" style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"><select class="col-type rounded-lg px-2 py-2 text-xs focus:outline-none" style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"><option value="text">text</option><option value="number">number</option><option value="boolean">boolean</option><option value="date">date</option><option value="json">json</option></select><label class="flex items-center gap-1 text-[10px]" style="color: var(--text-muted);"><input type="checkbox" class="col-nullable"> null</label><button type="button" class="col-remove p-1 text-red-400">✕</button>';
    row.querySelector('.col-remove').onclick = () => row.remove(); container.appendChild(row);
}
async function createUkmDataTable() {
    const name = document.getElementById('new-table-name').value.trim().toLowerCase(); const errEl = document.getElementById('create-table-error'); const btn = document.getElementById('create-table-submit');
    if (!name || !/^[a-z][a-z0-9_]*$/.test(name)) return showToast('Invalid table name', 'error');
    const rows = document.querySelectorAll('#new-table-columns > div'); const columns = [];
    for (let row of rows) { const colName = row.querySelector('.col-name').value.trim(); if (colName) columns.push({ name: colName, type: row.querySelector('.col-type').value, nullable: row.querySelector('.col-nullable').checked }); }
    if (columns.length === 0) return showToast('Add at least one column', 'error');
    btn.textContent = 'Creating...'; btn.disabled = true;
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        const res = await fetch(SUPABASE_URL + '/functions/v1/ukmdata', { method: 'POST', headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create_table', project_id: currentUkmDataProjectId, table: { name, columns } }) });
        const data = await res.json(); if (data.error) throw new Error(data.error); closeCreateTableModal(); showToast('Table created!', 'success'); await loadUkmDataTables();
    } catch (err) { errEl.textContent = err.message; errEl.classList.remove('hidden'); } finally { btn.textContent = 'Create Table'; btn.disabled = false; }
}
async function toggleTableRLS(tableName, isEnabled) { try { const { data: { session } } = await supabaseClient.auth.getSession(); await fetch(SUPABASE_URL + '/functions/v1/ukmdata', { method: 'POST', headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'toggle_rls', project_id: currentUkmDataProjectId, table_name: tableName, enable: isEnabled }) }); showToast(isEnabled ? 'Table locked' : 'Table public', 'success'); loadUkmDataTables(); } catch (err) { showToast(err.message, 'error'); loadUkmDataTables(); } }
async function toggleTableRealtime(tableName, isEnabled) { try { const { data: { session } } = await supabaseClient.auth.getSession(); await fetch(SUPABASE_URL + '/functions/v1/ukmdata', { method: 'POST', headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'toggle_realtime', project_id: currentUkmDataProjectId, table_name: tableName, enable: isEnabled }) }); showToast(isEnabled ? 'Realtime enabled' : 'Realtime disabled', 'success'); loadUkmDataTables(); } catch (err) { showToast(err.message, 'error'); loadUkmDataTables(); } }
async function dropUkmDataTable(name) { if (!confirm('Delete this table?')) return; try { const { data: { session } } = await supabaseClient.auth.getSession(); await fetch(SUPABASE_URL + '/functions/v1/ukmdata', { method: 'POST', headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'drop_table', project_id: currentUkmDataProjectId, table_name: name }) }); showToast('Table deleted', 'success'); await loadUkmDataTables(); } catch (err) { showToast(err.message, 'error'); } }
async function viewTableData(tableName) {
    document.getElementById('data-viewer-title').textContent = tableName; document.getElementById('data-viewer-modal').classList.remove('hidden'); document.getElementById('data-viewer-loading').classList.remove('hidden'); document.getElementById('data-viewer-content').classList.add('hidden'); document.getElementById('data-viewer-empty').classList.add('hidden'); currentTableName = tableName; currentTableData = [];
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        const res = await fetch(SUPABASE_URL + '/functions/v1/ukmdata', { method: 'POST', headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'fetch_rows', project_id: currentUkmDataProjectId, table_name: tableName }) });
        const data = await res.json(); document.getElementById('data-viewer-loading').classList.add('hidden'); if (data.error) throw new Error(data.error);
        const rows = data.rows || []; currentTableData = rows; if (rows.length === 0) { document.getElementById('data-viewer-empty').classList.remove('hidden'); return; }
        document.getElementById('data-viewer-content').classList.remove('hidden'); const columns = Object.keys(rows[0]);
        document.getElementById('data-viewer-head').innerHTML = '<tr>' + columns.map(c => `<th class="p-3 border-b border-r border-[var(--border)] text-[var(--cyan)] font-bold">${escapeHtml(c)}</th>`).join('') + '<th class="p-3 border-b border-[var(--border)] text-center">Actions</th></tr>';
        document.getElementById('data-viewer-body').innerHTML = rows.map(row => { const cells = columns.map(c => `<td class="p-3 border-b border-r border-[var(--border)] max-w-xs truncate">${row[c] === null ? '<span class="italic text-[var(--text-dim)]">null</span>' : typeof row[c] === 'object' ? escapeHtml(JSON.stringify(row[c])) : escapeHtml(String(row[c]))}</td>`).join(''); return `<tr class="hover:bg-[var(--surface-2)]">${cells}<td class="p-2 border-b border-[var(--border)] text-center whitespace-nowrap"><button onclick="openEditRowModal('${row.id}')" class="p-1.5 text-[var(--cyan)]"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg></button><button onclick="deleteTableRow('${row.id}')" class="p-1.5 text-[var(--red)]"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22"></path></svg></button></td></tr>`; }).join('');
    } catch (err) { document.getElementById('data-viewer-loading').classList.add('hidden'); showToast(err.message, 'error'); document.getElementById('data-viewer-modal').classList.add('hidden'); }
}
function openEditRowModal(rowId) {
    editingRowId = rowId; const row = currentTableData.find(r => r.id === rowId); if (!row) return showToast('Row data not found', 'error'); const fields = document.getElementById('edit-row-fields'); fields.innerHTML = '';
    Object.keys(row).forEach(key => { if (key === 'id' || key === 'created_at') return; let val = row[key]; if (typeof val === 'object') val = JSON.stringify(val); fields.innerHTML += `<div><label class="block text-xs font-medium mb-1 mono" style="color: var(--text-muted);">${escapeHtml(key)}</label><input type="${typeof row[key] === 'number' ? 'number' : 'text'}" id="edit-field-${key}" value="${escapeHtml(String(val || ''))}" class="w-full rounded-lg px-3 py-2 text-sm mono" style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"></div>`; });
    document.getElementById('edit-row-modal').classList.remove('hidden');
}
async function saveRowChanges() {
    const updates = {}; document.querySelectorAll('#edit-row-fields input').forEach(i => updates[i.id.replace('edit-field-', '')] = i.value); const btn = document.getElementById('save-row-btn'); btn.textContent = 'Saving...'; btn.disabled = true;
    try { const { data: { session } } = await supabaseClient.auth.getSession(); await fetch(SUPABASE_URL + '/functions/v1/ukmdata', { method: 'POST', headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update_row', project_id: currentUkmDataProjectId, table_name: currentTableName, row_id: editingRowId, updates }) }); document.getElementById('edit-row-modal').classList.add('hidden'); viewTableData(currentTableName); } catch (err) { showToast(err.message, 'error'); } finally { btn.textContent = 'Save Changes'; btn.disabled = false; }
}
async function deleteTableRow(rowId) { if (!confirm('Delete this row?')) return; const { data: { session } } = await supabaseClient.auth.getSession(); await fetch(SUPABASE_URL + '/functions/v1/ukmdata', { method: 'POST', headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete_row', project_id: currentUkmDataProjectId, table_name: currentTableName, row_id: rowId }) }); viewTableData(currentTableName); }
async function exportTableCSV(btn) {
    const tableName = document.getElementById('data-viewer-title').textContent; if (!tableName) return; const originalHtml = btn.innerHTML; btn.innerHTML = 'Exporting...'; btn.disabled = true;
    try {
        const { data: { session } } = await supabaseClient.auth.getSession(); const res = await fetch(SUPABASE_URL + '/functions/v1/ukmdata', { method: 'POST', headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'fetch_rows', project_id: currentUkmDataProjectId, table_name: tableName }) }); const data = await res.json(); if (!data.rows || data.rows.length === 0) return showToast('No data to export', 'error');
        const headers = Object.keys(data.rows[0]); const csv = [headers.join(','), ...data.rows.map(r => headers.map(h => `"${String(r[h] || '').replace(/"/g, '""')}"`).join(','))].join('\n'); const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); link.download = `${tableName}.csv`; link.click(); showToast('CSV downloaded', 'success');
    } catch(e) { showToast(e.message, 'error'); } finally { btn.innerHTML = originalHtml; btn.disabled = false; }
}
async function openChartModal(tableName) {
    document.getElementById('chart-table-name').textContent = tableName; document.getElementById('chart-modal').classList.remove('hidden'); document.getElementById('chart-loading').classList.remove('hidden'); document.getElementById('chart-content').classList.add('hidden');
    const { data: { session } } = await supabaseClient.auth.getSession(); const res = await fetch(SUPABASE_URL + '/functions/v1/ukmdata', { method: 'POST', headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'fetch_rows', project_id: currentUkmDataProjectId, table_name: tableName }) }); const data = await res.json(); document.getElementById('chart-loading').classList.add('hidden');
    if (!data.rows || data.rows.length === 0) return document.getElementById('chart-loading').innerHTML = '<p class="text-sm">No data.</p>';
    currentChartData = data.rows; document.getElementById('chart-group-column').innerHTML = Object.keys(data.rows[0]).filter(k => k !== 'id' && typeof data.rows[0][k] !== 'object').map(c => `<option value="${c}">${c}</option>`).join('');
    document.getElementById('chart-content').classList.remove('hidden'); renderChart();
}
function renderChart() {
    if (!currentChartData) return; const col = document.getElementById('chart-group-column').value; const counts = {}; currentChartData.forEach(r => { let v = r[col] || 'Empty'; if (typeof v === 'object') v = '[Object]'; counts[v] = (counts[v] || 0) + 1; });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10); if (window.ukmChartInstance) window.ukmChartInstance.destroy();
    window.ukmChartInstance = new Chart(document.getElementById('ukmbase-chart').getContext('2d'), { type: 'bar', data: { labels: sorted.map(x => x[0]), datasets: [{ data: sorted.map(x => x[1]), backgroundColor: 'rgba(79,70,229,0.6)' }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { color: '#94A3B8' } }, x: { ticks: { color: '#94A3B8' } } } } });
}

// ============================================
// UKMBASE DATA — SQL, CSV, CRM, KEYS
// ============================================
async function executeRawSQL() {
    const query = document.getElementById('sql-editor-input').value.trim(); if (!query) return; const btn = document.getElementById('sql-run-btn'); const resultsWrap = document.getElementById('sql-results-wrap'); const errMsg = document.getElementById('sql-error-msg'); const head = document.getElementById('sql-results-head'); const body = document.getElementById('sql-results-body'); btn.textContent = 'Running...'; btn.disabled = true; resultsWrap.classList.remove('hidden'); errMsg.classList.add('hidden'); head.innerHTML = ''; body.innerHTML = '<tr><td colspan="100" class="p-4 text-center">Executing...</td></tr>';
    try { const { data: { session } } = await supabaseClient.auth.getSession(); const res = await fetch(SUPABASE_URL + '/functions/v1/ukmdata', { method: 'POST', headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'execute_sql', project_id: currentUkmDataProjectId, sql_query: query }) }); const data = await res.json(); btn.textContent = 'Run Query'; btn.disabled = false; if (data.error) { errMsg.textContent = data.error; errMsg.classList.remove('hidden'); body.innerHTML = ''; return; } if (!data.data || data.data.length === 0) { body.innerHTML = '<tr><td colspan="100" class="p-4 text-center">0 rows returned.</td></tr>'; return; } const cols = Object.keys(data.data[0]); head.innerHTML = '<tr>' + cols.map(c => `<th class="p-2 border-b border-[var(--border)] text-[var(--cyan)] font-bold">${escapeHtml(c)}</th>`).join('') + '</tr>'; body.innerHTML = data.data.map(r => '<tr class="border-b border-[var(--border)]">' + cols.map(c => `<td class="p-2 border-r border-[var(--border)] max-w-xs truncate">${r[c] === null ? 'null' : escapeHtml(String(r[c]))}</td>`).join('') + '</tr>').join(''); } catch (err) { btn.textContent = 'Run Query'; btn.disabled = false; errMsg.textContent = err.message; errMsg.classList.remove('hidden'); }
}
function parseCSV(text) { const lines = text.split('\n').map(l => l.trim()).filter(l => l); if (lines.length < 2) return []; const headers = lines[0].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(h => h.trim().replace(/^"|"$/g, '')); return lines.slice(1).map(l => { const vals = l.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(v => v.trim().replace(/^"|"$/g, '')); const obj = {}; headers.forEach((h, i) => obj[h] = vals[i] || null); return obj; }); }
async function handleCsvUpload(event, tableName) { const file = event.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = async (e) => { const rows = parseCSV(e.target.result); if (rows.length === 0) return showToast('Empty CSV', 'error'); const { data: { session } } = await supabaseClient.auth.getSession(); const res = await fetch(SUPABASE_URL + '/functions/v1/ukmdata', { method: 'POST', headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'bulk_insert', project_id: currentUkmDataProjectId, table_name: tableName, rows }) }); const data = await res.json(); event.target.value = ''; if (data.error) showToast(data.error, 'error'); else { showToast(`Imported ${data.count} rows!`, 'success'); loadUkmDataTables(); } }; reader.readAsText(file); }
async function exportProjectData() { const btn = document.getElementById('export-project-btn'); const orig = btn.innerHTML; btn.innerHTML = 'Exporting...'; btn.disabled = true; try { const { data: { session } } = await supabaseClient.auth.getSession(); const res = await fetch(SUPABASE_URL + '/functions/v1/ukmdata', { method: 'POST', headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'export_project', project_id: currentUkmDataProjectId }) }); const data = await res.json(); if (data.error) throw new Error(data.error); const proj = projectsCache.find(p => p.id === currentUkmDataProjectId); const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([JSON.stringify(data.export_data, null, 2)], { type: 'application/json' })); link.download = `${proj.slug}_export.json`; link.click(); showToast('Project exported!', 'success'); } catch (err) { showToast(err.message, 'error'); } finally { btn.innerHTML = orig; btn.disabled = false; } }
async function handleProjectImport(event) { const file = event.target.files[0]; if (!file) return; const btn = document.getElementById('import-project-btn'); const orig = btn.innerHTML; btn.innerHTML = 'Importing...'; btn.disabled = true; const reader = new FileReader(); reader.onload = async (e) => { try { const importData = JSON.parse(e.target.result); if (!importData.tables) throw new Error('Invalid JSON'); const { data: { session } } = await supabaseClient.auth.getSession(); const res = await fetch(SUPABASE_URL + '/functions/v1/ukmdata', { method: 'POST', headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'import_project', project_id: currentUkmDataProjectId, import_data: importData }) }); const data = await res.json(); if (data.error) throw new Error(data.error); showToast(`Imported ${data.results.inserted_rows} rows!`, 'success'); loadUkmDataTables(); } catch (err) { showToast(err.message, 'error'); } finally { event.target.value = ''; btn.innerHTML = orig; btn.disabled = false; } }; reader.readAsText(file); }
async function loadUkmDataUsers() {
    const loading = document.getElementById('ukmdata-auth-loading'); const list = document.getElementById('ukmdata-auth-list'); const empty = document.getElementById('ukmdata-auth-empty'); loading.classList.remove('hidden'); list.classList.add('hidden'); empty.classList.add('hidden');
    const { data } = await supabaseClient.from('project_users_public').select('*').eq('project_id', currentUkmDataProjectId).order('created_at', { ascending: false });
    loading.classList.add('hidden'); ukmDataUsers = data || []; document.getElementById('ukmdata-auth-count').textContent = ukmDataUsers.length + ' users'; generateAuthSnippet();
    if (ukmDataUsers.length === 0) return empty.classList.remove('hidden'); list.classList.remove('hidden');
    list.innerHTML = ukmDataUsers.map(u => `<div class="rounded-lg p-3 flex items-center gap-3" style="background: var(--bg); border: 1px solid var(--border);"><div class="w-9 h-9 rounded-full flex items-center justify-center font-bold" style="background: rgba(79,70,229,0.2); color: var(--accent);">${escapeHtml((u.name || u.email || 'U').charAt(0).toUpperCase())}</div><div class="flex-1 min-w-0"><p class="text-sm font-medium truncate" style="color: var(--text);">${escapeHtml(u.name || u.email)}</p><p class="text-[10px] mono" style="color: var(--text-dim);">${escapeHtml(u.email)}</p></div><div class="flex gap-1"><button onclick="openImpersonateModal('${u.id}')" class="px-2 py-1 text-[10px] font-bold rounded" style="background: rgba(139,92,246,0.1); color: #8B5CF6;">Login As</button><button onclick="deleteUkmDataUser('${u.id}')" class="p-1 text-red-400"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22"></path></svg></button></div></div>`).join('');
}
async function deleteUkmDataUser(id) { if (confirm('Delete user?')) { await supabaseClient.from('project_users').delete().eq('id', id); loadUkmDataUsers(); } }
function openImpersonateModal(userId) { impersonatingUserId = userId; const user = ukmDataUsers.find(u => u.id === userId); document.getElementById('impersonate-email').textContent = user ? user.email : 'User'; document.getElementById('impersonate-result').classList.add('hidden'); document.getElementById('impersonate-btn').textContent = 'Generate Token'; document.getElementById('impersonate-modal').classList.remove('hidden'); }
async function executeImpersonation() { const btn = document.getElementById('impersonate-btn'); btn.textContent = 'Generating...'; btn.disabled = true; try { const { data: { session } } = await supabaseClient.auth.getSession(); const proj = projectsCache.find(p => p.id === currentUkmDataProjectId); const res = await fetch(SUPABASE_URL + '/functions/v1/ukmauth', { method: 'POST', headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'impersonate', project_slug: proj.slug, user_id: impersonatingUserId }) }); const data = await res.json(); if (data.error) throw new Error(data.error); document.getElementById('impersonate-token').textContent = data.token; document.getElementById('impersonate-result').classList.remove('hidden'); btn.textContent = 'Copied!'; navigator.clipboard.writeText(data.token); } catch (err) { showToast(err.message, 'error'); btn.textContent = 'Generate Token'; btn.disabled = false; } }
function generateAuthSnippet() { const proj = projectsCache.find(p => p.id === currentUkmDataProjectId); if (!proj) return; document.getElementById('ukmauth-snippet').textContent = `const API_URL = "${SUPABASE_URL}/functions/v1/ukmauth";\n\nconst res = await fetch(API_URL, {\n  method: "POST",\n  headers: { "Content-Type": "application/json" },\n  body: JSON.stringify({\n    action: "signup",\n    project_slug: "${proj.slug}",\n    email: "user@example.com",\n    password: "secret123"\n  })\n});\nconst { user, token } = await res.json();`; }
function copyAuthSnippet() { navigator.clipboard.writeText(document.getElementById('ukmauth-snippet').textContent); showToast('Copied', 'success'); }
function generateAuthUI() { const proj = projectsCache.find(p => p.id === currentUkmDataProjectId); if (!proj) return; document.getElementById('auth-ui-code').textContent = `<!-- Ukmbase Auth UI -->\n<div id="auth-container" style="max-width:400px; margin:50px auto; padding:20px; background:#1C2333; border-radius:12px; color:white; border:1px solid #2A3347;">\n  <h2 style="text-align:center; color:#4F46E5;">${proj.name}</h2>\n  <input type="email" id="auth-email" placeholder="Email" style="width:100%; padding:12px; margin-bottom:10px; background:#0B1020; border:1px solid #2A3347; border-radius:6px; color:white;">\n  <input type="password" id="auth-password" placeholder="Password" style="width:100%; padding:12px; margin-bottom:20px; background:#0B1020; border:1px solid #2A3347; border-radius:6px; color:white;">\n  <button onclick="submitAuth()" style="width:100%; padding:12px; background:#4F46E5; color:white; border:none; border-radius:6px; font-weight:bold;">Login / Sign Up</button>\n</div>\n<script>\nasync function submitAuth() {\n  const email = document.getElementById('auth-email').value;\n  const password = document.getElementById('auth-password').value;\n  const res = await fetch('${SUPABASE_URL}/functions/v1/ukmauth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'login', project_slug: '${proj.slug}', email, password }) });\n  const data = await res.json();\n  if (data.token) { localStorage.setItem('ukm_token', data.token); alert('Logged in!'); }\n  else alert(data.error);\n}\n<\/script>`; document.getElementById('auth-ui-modal').classList.remove('hidden'); }
async function runAuthTest() { const email = document.getElementById('test-auth-email').value; const password = document.getElementById('test-auth-password').value; const proj = projectsCache.find(p => p.id === currentUkmDataProjectId); const res = await fetch(SUPABASE_URL + '/functions/v1/ukmauth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'signup', project_slug: proj.slug, email, password }) }); const data = await res.json(); const el = document.getElementById('test-auth-response'); el.textContent = JSON.stringify(data, null, 2); el.classList.remove('hidden'); el.style.color = data.error ? 'var(--red)' : 'var(--green)'; if (!data.error) loadUkmDataUsers(); }
async function loadApiKeys() { const { data } = await supabaseClient.from('project_api_keys').select('*').eq('project_id', currentUkmDataProjectId).order('created_at', { ascending: false }); document.getElementById('apikeys-list').innerHTML = (!data || data.length === 0) ? '<p class="text-xs text-center py-4" style="color: var(--text-muted);">No API keys yet.</p>' : data.map(k => `<div class="rounded-lg p-3 flex items-center justify-between" style="background: var(--bg); border: 1px solid var(--border);"><div><p class="text-xs font-bold" style="color: var(--text);">${escapeHtml(k.name)}</p><p class="text-[10px] mono" style="color: var(--text-muted);">${escapeHtml(k.key_string)}</p></div><div class="flex gap-1"><button onclick="copyToClipboardText('${escapeHtml(k.key_string)}')" class="p-1 text-cyan-400">Copy</button><button onclick="revokeApiKey('${k.id}')" class="p-1 text-red-400">Revoke</button></div></div>`).join(''); }
async function generateApiKey() { const name = prompt('Name this key (e.g. Production):'); if (!name) return; const key = `ukm_live_${Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('')}`; await supabaseClient.from('project_api_keys').insert({ project_id: currentUkmDataProjectId, name, key_string: key }); showToast('Key generated', 'success'); loadApiKeys(); }
async function revokeApiKey(id) { if (confirm('Revoke this key?')) { await supabaseClient.from('project_api_keys').delete().eq('id', id); loadApiKeys(); } }

// ============================================
// UKMBASE DATA — PAGES, CRONS, WEBHOOKS, MAIL, LOGS
// ============================================
async function loadProjectPages() { const { data } = await supabaseClient.from('project_pages').select('*').eq('project_id', currentUkmDataProjectId); document.getElementById('page-table').innerHTML = ukmDataTables.map(t => `<option value="${t.table_name}">${t.table_name}</option>`).join(''); document.getElementById('pages-list').innerHTML = (!data || data.length === 0) ? '<p class="text-xs text-center py-4" style="color: var(--text-muted);">No pages yet.</p>' : data.map(p => { const url = window.location.origin + window.location.pathname + '?page=' + p.slug; return `<div class="rounded-lg p-3 flex justify-between" style="background: var(--bg); border: 1px solid var(--border);"><div><p class="text-sm font-bold" style="color: var(--text);">${escapeHtml(p.title)}</p><p class="text-[10px] mono" style="color: var(--text-muted);">${escapeHtml(url)}</p></div><button onclick="copyToClipboardText('${url}')" class="text-[10px] text-cyan-400">Copy Link</button></div>`; }).join(''); }
async function createProjectPage() { const title = document.getElementById('page-title-input').value; const slug = document.getElementById('page-slug-input').value; const table = document.getElementById('page-table').value; const cols = document.getElementById('page-columns').value.split(','); if (!title || !slug || !table) return showToast('Fill all fields', 'error'); await supabaseClient.from('project_pages').insert({ project_id: currentUkmDataProjectId, title, slug, table_name: table, columns_to_show: cols.map(c => c.trim()) }); document.getElementById('page-form').classList.add('hidden'); showToast('Page created', 'success'); loadProjectPages(); }
async function loadCronJobs() { const { data } = await supabaseClient.from('project_crons').select('*').eq('project_id', currentUkmDataProjectId); document.getElementById('crons-list').innerHTML = (!data || data.length === 0) ? '<p class="text-xs text-center py-4" style="color: var(--text-muted);">No tasks.</p>' : data.map(c => `<div class="rounded-lg p-3 flex justify-between" style="background: var(--bg); border: 1px solid var(--border);"><div><p class="text-xs font-bold text-cyan-400 mono">${escapeHtml(c.schedule)}</p><p class="text-[10px] mono" style="color: var(--text-muted);">${escapeHtml(c.sql_query)}</p></div><button onclick="deleteCronJob('${c.id}', '${c.job_name}')" class="text-red-400">✕</button></div>`).join(''); }
async function createCronJob() { const schedule = document.getElementById('cron-schedule').value; const sql = document.getElementById('cron-sql').value; if (!schedule || !sql) return; const { data: { session } } = await supabaseClient.auth.getSession(); await fetch(SUPABASE_URL + '/functions/v1/ukmdata', { method: 'POST', headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'add_cron', project_id: currentUkmDataProjectId, schedule, sql_query: sql }) }); document.getElementById('cron-form').classList.add('hidden'); showToast('Task scheduled', 'success'); loadCronJobs(); }
async function deleteCronJob(id, name) { await supabaseClient.from('project_crons').delete().eq('id', id); loadCronJobs(); }
async function loadUkmDataWebhooks() { document.getElementById('webhook-table').innerHTML = ukmDataTables.map(t => `<option value="${t.table_name}">${t.table_name}</option>`).join(''); const { data } = await supabaseClient.from('project_webhooks').select('*').eq('project_id', currentUkmDataProjectId); document.getElementById('webhooks-list').innerHTML = (!data || data.length === 0) ? '<p class="text-xs text-center py-4" style="color: var(--text-muted);">No webhooks.</p>' : data.map(h => `<div class="rounded-lg p-3 flex justify-between" style="background: var(--bg); border: 1px solid var(--border);"><div><p class="text-xs font-bold" style="color: var(--text);"><span class="text-cyan-400">${h.event_type}</span> on ${h.table_name}</p><p class="text-[10px] mono" style="color: var(--text-muted);">${escapeHtml(h.target_url)}</p></div><button onclick="deleteWebhook('${h.id}')" class="text-red-400">✕</button></div>`).join(''); }
async function createWebhook() { const table = document.getElementById('webhook-table').value; const event = document.getElementById('webhook-event').value; const url = document.getElementById('webhook-url').value; if (!url) return; const { data: { session } } = await supabaseClient.auth.getSession(); await fetch(SUPABASE_URL + '/functions/v1/ukmdata', { method: 'POST', headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'add_webhook', project_id: currentUkmDataProjectId, table_name: table, event_type: event, target_url: url }) }); document.getElementById('webhook-form').classList.add('hidden'); loadUkmDataWebhooks(); }
async function deleteWebhook(id) { await supabaseClient.from('project_webhooks').delete().eq('id', id); loadUkmDataWebhooks(); }
async function loadEmailLogs() { const { data } = await supabaseClient.from('project_emails').select('*').eq('project_id', currentUkmDataProjectId).order('created_at', { ascending: false }).limit(10); document.getElementById('mail-logs-list').innerHTML = (!data || data.length === 0) ? '<p class="text-xs text-center py-4" style="color: var(--text-muted);">No emails sent.</p>' : data.map(e => `<div class="rounded-lg p-2 flex justify-between" style="background: var(--bg); border: 1px solid var(--border);"><div><p class="text-[11px] font-bold truncate" style="color: var(--text);">${escapeHtml(e.subject)}</p><p class="text-[9px] mono" style="color: var(--text-muted);">${escapeHtml(e.recipient_email)}</p></div><span class="text-[9px] uppercase ${e.status === 'delivered' ? 'text-green-400' : 'text-red-400'}">${e.status}</span></div>`).join(''); }
async function sendTestEmail() { const to = document.getElementById('mail-test-to').value; const subject = document.getElementById('mail-test-subject').value; if (!to || !subject) return; const { data: { session } } = await supabaseClient.auth.getSession(); await fetch(SUPABASE_URL + '/functions/v1/ukmmail', { method: 'POST', headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ project_id: currentUkmDataProjectId, to, subject, html: '<p>Ukmbase test email</p>' }) }); showToast('Email sent', 'success'); loadEmailLogs(); }
async function loadActivityLogs() { const { data: { session } } = await supabaseClient.auth.getSession(); const res = await fetch(SUPABASE_URL + '/functions/v1/ukmdata', { method: 'POST', headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'get_logs', project_id: currentUkmDataProjectId }) }); const data = await res.json(); const colors = { 'INSERT': 'text-green-400', 'UPDATE': 'text-yellow-400', 'DELETE': 'text-red-400', 'SQL': 'text-purple-400' }; document.getElementById('activity-logs-list').innerHTML = (!data.logs || data.logs.length === 0) ? '<p class="text-xs text-center py-4" style="color: var(--text-muted);">No activity yet.</p>' : data.logs.map(l => `<div class="flex items-start gap-3 p-2 rounded-lg" style="background: var(--bg); border: 1px solid var(--border);"><span class="text-[9px] font-bold px-1.5 py-0.5 rounded ${colors[l.event_type] || 'text-gray-400'}">${l.event_type}</span><div class="flex-1 min-w-0"><p class="text-xs font-bold truncate" style="color: var(--text);">${escapeHtml(l.table_name)}</p><p class="text-[10px] mono truncate" style="color: var(--text-muted);">${escapeHtml(l.message)}</p></div></div>`).join(''); }

// ============================================
// UKMTABLES (Connections)
// ============================================
function openConnectModal() { if (!canCreateConnection()) { if (confirm('Connection limit reached. Upgrade?')) switchView('billing'); return; } document.getElementById('connect-modal').classList.remove('hidden'); document.getElementById('connect-error').classList.add('hidden'); ['connect-name', 'connect-url', 'connect-key'].forEach(id => document.getElementById(id).value = ''); }
function closeConnectModal() { document.getElementById('connect-modal').classList.add('hidden'); }
async function loadConnections() { if (!currentUser) return; const { data, error } = await supabaseClient.from('connected_databases').select('*').order('created_at', { ascending: false }); if (error) return console.error(error.message); connectionsCache = data || []; renderConnections(connectionsCache); }
function renderConnections(connections) {
    const empty = document.getElementById('ukmtables-empty'); const list = document.getElementById('ukmtables-list'); const title = document.getElementById('ukmtables-title'); const subtitle = document.getElementById('ukmtables-subtitle'); const actionBtn = document.getElementById('ukmtables-action'); const backBtn = document.getElementById('ukmtables-back'); if (!empty) return;
    title.textContent = 'UkmTables'; subtitle.textContent = 'Connect any Supabase database'; actionBtn.innerText = '+ Connect'; actionBtn.onclick = openConnectModal; backBtn.classList.add('hidden');
    document.getElementById('ukmtables-connections-view').classList.remove('hidden'); document.getElementById('ukmtables-browser').classList.add('hidden');
    if (!connections || connections.length === 0) { empty.classList.remove('hidden'); list.classList.add('hidden'); return; }
    empty.classList.add('hidden'); list.classList.remove('hidden');
    list.innerHTML = connections.map(c => `<div class="rounded-xl p-4 flex items-center justify-between" style="background: var(--surface); border: 1px solid var(--border);"><div class="flex items-center gap-3 min-w-0 cursor-pointer flex-1" onclick="openConnection('${c.id}')"><div class="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style="background: rgba(6,182,212,0.1); border: 1px solid rgba(6,182,212,0.3);"><svg class="w-4 h-4" style="color: var(--cyan);" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"></path></svg></div><div class="min-w-0"><p class="text-sm font-medium truncate" style="color: var(--text);">${escapeHtml(c.name)}</p><p class="text-xs mono truncate" style="color: var(--text-dim);">${escapeHtml(c.supabase_url.replace('https://', ''))}</p></div></div><button onclick="deleteConnection('${c.id}')" class="p-2" style="color: var(--text-muted);"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22"></path></svg></button></div>`).join('');
}
async function createConnection() {
    const name = document.getElementById('connect-name').value.trim(); const url = document.getElementById('connect-url').value.trim().replace(/\/$/, ''); const key = document.getElementById('connect-key').value.trim(); const errEl = document.getElementById('connect-error'); const btn = document.getElementById('create-connect-btn'); errEl.classList.add('hidden');
    if (!name || !url || !key) { errEl.textContent = 'All fields are required.'; errEl.classList.remove('hidden'); return; } if (!canCreateConnection()) { errEl.textContent = 'Plan limit reached.'; errEl.classList.remove('hidden'); return; }
    btn.innerText = 'Testing...'; btn.disabled = true;
    try { const testRes = await fetch(url + '/rest/v1/profiles?select=id&limit=1', { headers: getHeaders(key) }); if (testRes.status >= 500) throw new Error('Connection failed (' + testRes.status + ').'); if (testRes.status === 404) throw new Error('Endpoint not reachable.'); } catch (err) { btn.innerText = 'Connect'; btn.disabled = false; errEl.textContent = err.message; errEl.classList.remove('hidden'); return; }
    const { error } = await supabaseClient.from('connected_databases').insert([{ owner_id: currentUser.id, name, supabase_url: url, supabase_anon_key: key }]);
    btn.innerText = 'Connect'; btn.disabled = false; if (error) { errEl.textContent = error.message; errEl.classList.remove('hidden'); return; }
    closeConnectModal(); await loadConnections(); populateQueryConnections(); showToast('Database connected', 'success');
}
async function deleteConnection(id) { if (!confirm('Delete this connection?')) return; const { error } = await supabaseClient.from('connected_databases').delete().eq('id', id); if (error) { showToast('Failed: ' + error.message, 'error'); return; } await loadConnections(); populateQueryConnections(); showToast('Connection deleted', 'success'); }
async function openConnection(id) {
    const conn = connectionsCache.find(c => c.id === id); if (!conn) return; activeConnection = conn;
    const title = document.getElementById('ukmtables-title'); const subtitle = document.getElementById('ukmtables-subtitle'); const actionBtn = document.getElementById('ukmtables-action'); const backBtn = document.getElementById('ukmtables-back');
    title.textContent = conn.name; subtitle.textContent = 'Reading schema...'; actionBtn.innerText = '+ Refresh'; actionBtn.onclick = function() { openConnection(id); }; backBtn.classList.remove('hidden');
    document.getElementById('ukmtables-connections-view').classList.add('hidden'); document.getElementById('ukmtables-browser').classList.remove('hidden'); document.getElementById('ukmtables-rows').classList.add('hidden'); document.getElementById('ukmtables-rows-empty').classList.add('hidden'); document.getElementById('ukmtables-rows-loading').classList.remove('hidden'); document.getElementById('ukmtables-pills').innerHTML = '';
    try {
        const res = await fetch(conn.supabase_url + '/rest/v1/', { headers: getHeaders(conn.supabase_anon_key) }); let spec = null; if (res.ok) { try { spec = await res.json(); } catch (_) {} } let tables = [];
        if (spec) tables = Object.keys(spec.definitions || (spec.components && spec.components.schemas) || {}).sort();
        if (tables.length === 0) { const candidates = ['profiles', 'projects', 'plans', 'payments', 'subscriptions', 'usage_metrics', 'waitlist', 'connected_databases', 'upgrade_requests', 'query_history', 'team_members', 'sync_configs', 'sync_logs', 'project_schemas', 'project_users_public', 'project_files']; for (let i = 0; i < candidates.length; i++) { try { const r = await fetch(conn.supabase_url + '/rest/v1/' + candidates[i] + '?select=*&limit=1', { headers: getHeaders(conn.supabase_anon_key) }); if (r.status === 200 || r.status === 206) tables.push(candidates[i]); } catch (_) {} } }
        subtitle.textContent = tables.length + ' tables';
        if (tables.length === 0) { document.getElementById('ukmtables-rows-loading').classList.add('hidden'); document.getElementById('ukmtables-rows-empty').classList.remove('hidden'); document.getElementById('ukmtables-rows-empty').innerHTML = '<p class="text-sm" style="color: var(--text-muted);">No tables found.</p>'; return; }
        document.getElementById('ukmtables-pills').innerHTML = tables.map(t => `<button onclick="selectTable('${t}')" data-table="${t}" class="table-pill text-xs px-3 py-1.5 rounded-lg mono" style="background: var(--surface); border: 1px solid var(--border); color: var(--text-muted);">${escapeHtml(t)}</button>`).join('');
        await selectTable(tables[0]);
    } catch (err) { subtitle.textContent = 'Error'; document.getElementById('ukmtables-rows-loading').classList.add('hidden'); document.getElementById('ukmtables-rows-empty').classList.remove('hidden'); document.getElementById('ukmtables-rows-empty').innerHTML = '<p class="text-sm" style="color: var(--red);">' + escapeHtml(err.message) + '</p>'; }
}
function exitTableBrowser() { activeConnection = null; document.getElementById('ukmtables-connections-view').classList.remove('hidden'); document.getElementById('ukmtables-browser').classList.add('hidden'); renderConnections(connectionsCache); }
async function selectTable(tableName) {
    if (!activeConnection) return; document.querySelectorAll('.table-pill').forEach(p => { if (p.dataset.table === tableName) p.classList.add('active'); else p.classList.remove('active'); }); document.getElementById('ukmtables-rows').classList.add('hidden'); document.getElementById('ukmtables-rows-empty').classList.add('hidden'); document.getElementById('ukmtables-rows-loading').classList.remove('hidden');
    try {
        const res = await fetch(activeConnection.supabase_url + '/rest/v1/' + tableName + '?select=*&limit=50', { headers: getHeaders(activeConnection.supabase_anon_key) }); document.getElementById('ukmtables-rows-loading').classList.add('hidden'); if (!res.ok) throw new Error('Failed to load rows (' + res.status + ')');
        const rows = await res.json(); if (!rows || rows.length === 0) { document.getElementById('ukmtables-rows-empty').classList.remove('hidden'); document.getElementById('ukmtables-rows-empty').innerHTML = '<p class="text-sm" style="color: var(--text-muted);">No rows visible.</p>'; return; }
        renderRows(rows);
    } catch (err) { document.getElementById('ukmtables-rows-loading').classList.add('hidden'); document.getElementById('ukmtables-rows-empty').classList.remove('hidden'); document.getElementById('ukmtables-rows-empty').innerHTML = '<p class="text-sm" style="color: var(--red);">' + escapeHtml(err.message) + '</p>'; }
}
function renderRows(rows) {
    const container = document.getElementById('ukmtables-rows'); container.classList.remove('hidden');
    container.innerHTML = rows.map((row, idx) => { let fields = ''; Object.keys(row).forEach(k => { const v = row[k]; let display; if (v === null || v === undefined) display = '<span style="color: var(--text-dim);" class="italic">null</span>'; else if (typeof v === 'object') display = escapeHtml(JSON.stringify(v)); else display = escapeHtml(String(v)); fields += '<div class="flex gap-2 py-1 text-xs"><span class="field-key mono flex-shrink-0">' + escapeHtml(k) + ':</span><span class="field-val mono flex-1">' + display + '</span></div>'; }); const jsonStr = JSON.stringify(row).replace(/'/g, '&#39;').replace(/"/g, '&quot;'); return '<div class="rounded-xl p-4" style="background: var(--surface); border: 1px solid var(--border);"><div class="flex items-center justify-between mb-2 pb-2" style="border-bottom: 1px solid var(--border);"><span class="text-[10px] uppercase font-bold mono" style="color: var(--accent);">Row ' + (idx + 1) + '</span><button onclick="copyRow(\'' + jsonStr + '\')" class="text-[10px]" style="color: var(--cyan);">Copy JSON</button></div><div class="space-y-0.5">' + fields + '</div></div>'; }).join('');
}
function copyRow(jsonStr) { const clean = jsonStr.replace(/&quot;/g, '"').replace(/&#39;/g, "'"); navigator.clipboard.writeText(clean); showToast('Row copied', 'success'); }

// ============================================
// UKMQUERY (SQL GENERATOR)
// ============================================
function populateQueryConnections() { const sel = document.getElementById('query-connection'); if (!sel) return; const current = sel.value; let html = '<option value="">— no database selected —</option>'; connectionsCache.forEach(c => { html += '<option value="' + c.id + '">' + escapeHtml(c.name) + '</option>'; }); sel.innerHTML = html; if (current) sel.value = current; }
function setQueryPrompt(text) { document.getElementById('query-prompt').value = text; document.getElementById('query-prompt').focus(); }
async function generateSQL() {
    const prompt = document.getElementById('query-prompt').value.trim(); const submitBtn = document.getElementById('query-submit'); const outputWrap = document.getElementById('query-output-wrap'); const outputEl = document.getElementById('query-output'); const loadingEl = document.getElementById('query-loading'); const warningEl = document.getElementById('query-warning');
    if (!prompt) return showToast('Describe what you want first', 'error');
    const connId = document.getElementById('query-connection').value; let contextPrompt = prompt;
    if (connId) { const conn = connectionsCache.find(c => c.id === connId); if (conn) contextPrompt = 'Database: ' + conn.name + '\n\nTask: ' + prompt; }
    submitBtn.disabled = true; submitBtn.innerHTML = 'Generating...'; outputWrap.classList.add('hidden'); loadingEl.classList.remove('hidden'); warningEl.classList.add('hidden');
    try {
        const { data: { session } } = await supabaseClient.auth.getSession(); const res = await fetch(SUPABASE_URL + '/functions/v1/ukmai', { method: 'POST', headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: contextPrompt, mode: 'sql' }) }); const data = await res.json();
        loadingEl.classList.add('hidden'); submitBtn.disabled = false; submitBtn.innerHTML = 'Generate SQL';
        if (data.error) { outputWrap.classList.remove('hidden'); outputEl.innerHTML = '<p style="color: var(--red);" class="text-sm">' + escapeHtml(data.error) + '</p>'; return; }
        const raw = data.content || ''; const match = raw.match(/```(?:sql)?\s*([\s\S]*?)```/i); const sql = match ? match[1].trim() : raw.trim(); lastGeneratedSQL = sql; outputWrap.classList.remove('hidden');
        if (/^\s*--\s*WARNING: destructive/i.test(sql) || /\b(DROP|DELETE|TRUNCATE)\b/i.test(sql)) warningEl.classList.remove('hidden');
        outputEl.innerHTML = '<pre><code class="language-sql">' + escapeHtml(sql) + '</code></pre>'; outputEl.querySelectorAll('pre code').forEach(b => hljs.highlightElement(b)); const pre = outputEl.querySelector('pre');
        if (pre) { pre.style.position = 'relative'; const btn = document.createElement('button'); btn.className = 'copy-btn'; btn.innerText = 'Copy'; btn.onclick = () => { navigator.clipboard.writeText(sql); btn.innerText = 'Copied!'; setTimeout(() => btn.innerText = 'Copy', 1500); }; pre.appendChild(btn); }
        await saveQueryToHistory(connId || null, prompt, sql);
    } catch (err) { loadingEl.classList.add('hidden'); submitBtn.disabled = false; submitBtn.innerHTML = 'Generate SQL'; outputWrap.classList.remove('hidden'); outputEl.innerHTML = '<p style="color: var(--red);" class="text-sm">Network error: ' + escapeHtml(err.message) + '</p>'; }
}
function copyGeneratedSQL() { if (!lastGeneratedSQL) return; navigator.clipboard.writeText(lastGeneratedSQL); showToast('SQL copied', 'success'); }
async function saveQueryToHistory(connectionId, prompt, sql) { if (!currentUser) return; const { error } = await supabaseClient.from('query_history').insert([{ user_id: currentUser.id, connection_id: connectionId, prompt, generated_sql: sql }]); if (error) return console.error('Query history:', error.message); await loadQueryHistory(); }
async function loadQueryHistory() {
    if (!currentUser) return; const wrap = document.getElementById('query-history-wrap'); const list = document.getElementById('query-history-list'); if (!wrap || !list) return; const { data, error } = await supabaseClient.from('query_history').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false }).limit(10); if (error) return console.error(error.message);
    if (!data || data.length === 0) { wrap.classList.add('hidden'); return; } wrap.classList.remove('hidden');
    list.innerHTML = data.map(h => `<div class="rounded-xl p-3 cursor-pointer" style="background: var(--surface); border: 1px solid var(--border);" onclick="loadHistoryItem('${h.id}')"><div class="flex items-start justify-between mb-1"><p class="text-xs font-medium flex-1 pr-2 line-clamp-2" style="color: var(--text);">${escapeHtml(h.prompt)}</p><span class="text-[10px] flex-shrink-0 mono" style="color: var(--text-dim);">${new Date(h.created_at).toLocaleDateString()}</span></div><p class="text-[10px] mono truncate" style="color: var(--cyan);">${escapeHtml(h.generated_sql.split('\n')[0])}</p></div>`).join('');
}
async function loadHistoryItem(id) { const { data, error } = await supabaseClient.from('query_history').select('*').eq('id', id).single(); if (error || !data) return; document.getElementById('query-prompt').value = data.prompt; lastGeneratedSQL = data.generated_sql; const outputWrap = document.getElementById('query-output-wrap'); const outputEl = document.getElementById('query-output'); const warningEl = document.getElementById('query-warning'); outputWrap.classList.remove('hidden'); warningEl.classList.add('hidden'); if (/^\s*--\s*WARNING: destructive/i.test(data.generated_sql) || /\b(DROP|DELETE|TRUNCATE)\b/i.test(data.generated_sql)) warningEl.classList.remove('hidden'); outputEl.innerHTML = '<pre><code class="language-sql">' + escapeHtml(data.generated_sql) + '</code></pre>'; outputEl.querySelectorAll('pre code').forEach(b => hljs.highlightElement(b)); outputWrap.scrollIntoView({ behavior: 'smooth', block: 'start' }); }

// ============================================
// UKMSYNC
// ============================================
function populateSyncProjectSelect() {
    const sel = document.getElementById('sync-project-select'); if (!sel) return; const own = projectsCache.filter(p => p.owner_id === currentUser.id); if (own.length === 0) { document.getElementById('sync-empty').classList.remove('hidden'); document.getElementById('sync-panel').classList.add('hidden'); sel.innerHTML = '<option value="">— no projects —</option>'; return; }
    document.getElementById('sync-empty').classList.add('hidden'); sel.innerHTML = own.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join(''); const current = sel.value; if (current && own.find(p => p.id === current)) sel.value = current; else sel.value = own[0].id; onSyncProjectChange();
}
async function onSyncProjectChange() { const sel = document.getElementById('sync-project-select'); if (!sel || !sel.value) { document.getElementById('sync-panel').classList.add('hidden'); return; } currentSyncProjectId = sel.value; await loadSyncConfig(currentSyncProjectId); renderSyncPanel(); loadSyncLogs(); }
async function loadSyncConfig(projectId) { const { data, error } = await supabaseClient.from('sync_configs').select('*').eq('project_id', projectId).maybeSingle(); if (error) return console.error(error.message); if (data) { syncConfigCache = data; return; } const { data: created, error: createErr } = await supabaseClient.from('sync_configs').insert([{ project_id: projectId, enabled: false, conflict_strategy: 'last-write-wins', tables_to_sync: [], poll_interval_ms: 15000 }]).select().single(); if (createErr) return console.error(createErr.message); syncConfigCache = created; }
function renderSyncPanel() { const panel = document.getElementById('sync-panel'); if (!panel || !syncConfigCache) return; panel.classList.remove('hidden'); document.getElementById('sync-enabled').checked = !!syncConfigCache.enabled; document.getElementById('sync-strategy').value = syncConfigCache.conflict_strategy || 'last-write-wins'; document.getElementById('sync-tables').value = (syncConfigCache.tables_to_sync || []).join(', '); document.getElementById('sync-interval').value = syncConfigCache.poll_interval_ms || 15000; generateSdkSnippet(); }
async function toggleSyncEnabled() { if (!syncConfigCache) return; const enabled = document.getElementById('sync-enabled').checked; const { error } = await supabaseClient.from('sync_configs').update({ enabled }).eq('id', syncConfigCache.id); if (error) return showToast(error.message, 'error'); syncConfigCache.enabled = enabled; showToast(enabled ? 'Sync enabled' : 'Sync paused', 'success'); }
async function updateSyncConfig() { if (!syncConfigCache) return; const strategy = document.getElementById('sync-strategy').value; const tablesRaw = document.getElementById('sync-tables').value.trim(); const interval = parseInt(document.getElementById('sync-interval').value, 10) || 15000; const tables = tablesRaw ? tablesRaw.split(',').map(t => t.trim()).filter(Boolean) : []; const { error } = await supabaseClient.from('sync_configs').update({ conflict_strategy: strategy, tables_to_sync: tables, poll_interval_ms: interval }).eq('id', syncConfigCache.id); if (error) return showToast(error.message, 'error'); syncConfigCache.conflict_strategy = strategy; syncConfigCache.tables_to_sync = tables; syncConfigCache.poll_interval_ms = interval; generateSdkSnippet(); showToast('Config saved', 'success'); }
function generateSdkSnippet() {
    const el = document.getElementById('sync-snippet'); if (!el || !syncConfigCache) return; const proj = projectsCache.find(p => p.id === currentSyncProjectId); const projectSlug = proj ? proj.slug : 'unknown';
    el.textContent = '<!-- UkmSync SDK -->\n<script\n  src="https://kumgtourryl-collab.github.io/Ukmbase-/ukmsync.js"\n  data-ukm-project="' + projectSlug + '"\n  data-ukm-backend-url="https://ukmsync-server.onrender.com"\n  data-ukm-supabase-url="' + SUPABASE_URL + '"\n  data-ukm-anon-key="' + SUPABASE_ANON_KEY + '"\n  data-ukm-enabled="' + (syncConfigCache.enabled ? 'true' : 'false') + '"\n  data-ukm-strategy="' + syncConfigCache.conflict_strategy + '"\n  data-ukm-tables="' + ((syncConfigCache.tables_to_sync || []).join(',')) + '"\n  data-ukm-poll-ms="' + (syncConfigCache.poll_interval_ms || 15000) + '"\n  defer\n><\/script>';
}
function copySdkSnippet() { const el = document.getElementById('sync-snippet'); if (!el) return; navigator.clipboard.writeText(el.textContent); showToast('SDK snippet copied', 'success'); }
async function loadSyncLogs() {
    if (!currentSyncProjectId) return; const loading = document.getElementById('sync-logs-loading'); const list = document.getElementById('sync-logs-list'); const empty = document.getElementById('sync-logs-empty'); loading.classList.remove('hidden'); list.classList.add('hidden'); empty.classList.add('hidden');
    const { data, error } = await supabaseClient.from('sync_logs').select('*').eq('project_id', currentSyncProjectId).order('created_at', { ascending: false }).limit(20); loading.classList.add('hidden');
    if (error) return console.error(error.message); if (!data || data.length === 0) { empty.classList.remove('hidden'); return; } list.classList.remove('hidden');
    list.innerHTML = data.map(log => `<div class="rounded-lg p-3 flex items-start justify-between" style="background: var(--bg); border: 1px solid var(--border);"><div class="min-w-0 flex-1"><div class="flex items-center gap-2 mb-1"><span class="text-[9px] font-bold uppercase px-2 py-0.5 rounded text-[#94A3B8] bg-[#94A3B8]/10">${escapeHtml(log.event_type)}</span>${log.table_name ? '<span class="text-[10px] mono" style="color: var(--text-muted);">' + escapeHtml(log.table_name) + '</span>' : ''}${log.record_count ? '<span class="text-[10px] mono" style="color: var(--text-dim);">× ' + log.record_count + '</span>' : ''}</div>${log.message ? '<p class="text-xs truncate" style="color: var(--text-muted);">' + escapeHtml(log.message) + '</p>' : ''}<p class="text-[10px] mono mt-1" style="color: var(--text-dim);">${new Date(log.created_at).toLocaleString()}</p></div></div>`).join('');
}

// ============================================
// UKMPAY, BILLING, UPGRADE, CONNECT, OWNER
// ============================================
function switchPayTab(tab) { const plansPanel = document.getElementById('pay-plans-panel'); const payPanel = document.getElementById('pay-payments-panel'); const plansTab = document.getElementById('pay-tab-plans'); const payTab = document.getElementById('pay-tab-payments'); if (tab === 'plans') { plansPanel.classList.remove('hidden'); payPanel.classList.add('hidden'); plansTab.style.color = 'var(--text)'; plansTab.style.borderBottom = '2px solid var(--accent)'; payTab.style.color = 'var(--text-muted)'; payTab.style.borderBottom = 'none'; } else { plansPanel.classList.add('hidden'); payPanel.classList.remove('hidden'); payTab.style.color = 'var(--text)'; payTab.style.borderBottom = '2px solid var(--accent)'; plansTab.style.color = 'var(--text-muted)'; plansTab.style.borderBottom = 'none'; } }
function openPlanModal() { if (projectsCache.filter(p => p.owner_id === currentUser.id).length === 0) return showToast('Create a project first', 'error'); document.getElementById('plan-modal').classList.remove('hidden'); document.getElementById('plan-error').classList.add('hidden'); populateProjectSelects(); ['plan-name', 'plan-price', 'plan-url'].forEach(id => document.getElementById(id).value = ''); }
function closePlanModal() { document.getElementById('plan-modal').classList.add('hidden'); }
function populateProjectSelects() { const ownProjects = projectsCache.filter(p => p.owner_id === currentUser.id); let options = ''; ownProjects.forEach(p => { options += '<option value="' + p.id + '">' + escapeHtml(p.name) + '</option>'; }); ['plan-project', 'pay-project'].forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = options; }); }
async function loadPlans() {
    if (!currentUser) return; const { data, error } = await supabaseClient.from('plans').select('*').order('created_at', { ascending: false }); if (error) return console.error(error.message); const empty = document.getElementById('pay-empty-plans'); const grid = document.getElementById('pay-plans-grid');
    if (!data || data.length === 0) { empty.classList.remove('hidden'); grid.classList.add('hidden'); document.getElementById('pay-plans-count').textContent = '0'; return; } empty.classList.add('hidden'); grid.classList.remove('hidden');
    grid.innerHTML = data.map(pl => `<div class="rounded-xl p-5" style="background: var(--surface); border: 1px solid var(--border);"><div class="flex items-start justify-between mb-3"><span class="text-[10px] font-bold uppercase px-2 py-1 rounded" style="background: rgba(79,70,229,0.1); color: var(--accent);">${escapeHtml(pl.provider)}</span><span class="text-[10px]" style="color: var(--text-dim);">${escapeHtml(pl.interval)}</span></div><h3 class="font-bold mb-1" style="color: var(--text);">${escapeHtml(pl.name)}</h3><div class="text-2xl font-extrabold mono mb-3" style="color: var(--text);">${escapeHtml(pl.currency)} ${Number(pl.price_amount).toFixed(2)}</div>${pl.checkout_url ? '<button onclick="copyCheckout(\'' + escapeHtml(pl.checkout_url) + '\')" class="w-full text-xs font-bold py-2 rounded-lg" style="background: rgba(79,70,229,0.1); border: 1px solid rgba(79,70,229,0.3); color: var(--cyan);">Copy Checkout Link</button>' : '<p class="text-xs" style="color: var(--text-dim);">No checkout link</p>'}</div>`).join('');
    document.getElementById('pay-plans-count').textContent = data.length; const payPlanSelect = document.getElementById('pay-plan'); let planOpts = '<option value="">— none —</option>'; data.forEach(pl => { planOpts += '<option value="' + pl.id + '">' + escapeHtml(pl.name) + '</option>'; }); payPlanSelect.innerHTML = planOpts;
}
function copyCheckout(url) { navigator.clipboard.writeText(url); showToast('Checkout link copied', 'success'); }
async function createPlan() {
    const project_id = document.getElementById('plan-project').value; const name = document.getElementById('plan-name').value.trim(); const price_amount = parseFloat(document.getElementById('plan-price').value); const currency = document.getElementById('plan-currency').value; const interval = document.getElementById('plan-interval').value; const provider = document.getElementById('plan-provider').value; const checkout_url = document.getElementById('plan-url').value.trim(); const errEl = document.getElementById('plan-error'); const btn = document.getElementById('create-plan-btn'); errEl.classList.add('hidden');
    if (!project_id || !name || isNaN(price_amount)) { errEl.textContent = 'Project, name, and price are required.'; errEl.classList.remove('hidden'); return; } btn.innerText = 'Creating...'; btn.disabled = true;
    const { error } = await supabaseClient.from('plans').insert([{ project_id, name, price_amount, currency, interval, provider, checkout_url: checkout_url || null, active: true }]); btn.innerText = 'Create Plan'; btn.disabled = false; if (error) { errEl.textContent = error.message; errEl.classList.remove('hidden'); return; } closePlanModal(); await loadPlans(); showToast('Plan created', 'success');
}
function openPaymentModal() { if (projectsCache.filter(p => p.owner_id === currentUser.id).length === 0) return showToast('Create a project first', 'error'); document.getElementById('payment-modal').classList.remove('hidden'); document.getElementById('payment-error').classList.add('hidden'); populateProjectSelects(); ['pay-email', 'pay-amount'].forEach(id => document.getElementById(id).value = ''); }
function closePaymentModal() { document.getElementById('payment-modal').classList.add('hidden'); }
async function loadPayments() {
    if (!currentUser) return; const { data, error } = await supabaseClient.from('payments').select('*').order('paid_at', { ascending: false }); if (error) return console.error(error.message);
    const paid = (data || []).filter(p => p.status === 'paid'); const total = paid.reduce((s, p) => s + Number(p.amount), 0); const now = new Date(); const monthly = paid.filter(p => { const d = new Date(p.paid_at); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).reduce((s, p) => s + Number(p.amount), 0);
    document.getElementById('pay-total').textContent = '$' + total.toFixed(2); document.getElementById('pay-month').textContent = '$' + monthly.toFixed(2); const statRev = document.getElementById('stat-revenue'); if (statRev) statRev.textContent = '$' + total.toFixed(2);
    const empty = document.getElementById('pay-empty-payments'); const list = document.getElementById('pay-payments-list'); if (!data || data.length === 0) { empty.classList.remove('hidden'); list.classList.add('hidden'); return; } empty.classList.add('hidden'); list.classList.remove('hidden');
    list.innerHTML = data.map(p => `<div class="rounded-xl p-4 flex items-center justify-between" style="background: var(--surface); border: 1px solid var(--border);"><div class="min-w-0"><p class="text-sm font-medium truncate" style="color: var(--text);">${escapeHtml(p.customer_email || 'Anonymous')}</p><p class="text-xs mono" style="color: var(--text-dim);">${new Date(p.paid_at).toLocaleDateString()} · ${escapeHtml(p.provider || 'manual')}</p></div><div class="text-right flex-shrink-0"><div class="font-bold mono" style="color: var(--text);">${escapeHtml(p.currency)} ${Number(p.amount).toFixed(2)}</div><span class="text-[10px] uppercase font-bold ${p.status === 'paid' ? 'text-green-400' : 'text-yellow-400'}">${p.status}</span></div></div>`).join('');
}
async function createPayment() {
    const project_id = document.getElementById('pay-project').value; const plan_id = document.getElementById('pay-plan').value || null; const customer_email = document.getElementById('pay-email').value.trim(); const amount = parseFloat(document.getElementById('pay-amount').value); const currency = document.getElementById('pay-currency').value; const provider = document.getElementById('pay-provider').value; const errEl = document.getElementById('payment-error'); const btn = document.getElementById('create-payment-btn'); errEl.classList.add('hidden');
    if (!project_id || isNaN(amount)) { errEl.textContent = 'Project and amount are required.'; errEl.classList.remove('hidden'); return; } btn.innerText = 'Logging...'; btn.disabled = true;
    const { error } = await supabaseClient.from('payments').insert([{ project_id, plan_id, customer_email: customer_email || null, amount, currency, provider, status: 'paid', paid_at: new Date().toISOString() }]); btn.innerText = 'Log Payment'; btn.disabled = false; if (error) { errEl.textContent = error.message; errEl.classList.remove('hidden'); return; } closePaymentModal(); await loadPayments(); showToast('Payment logged', 'success');
}
function renderBilling() {
    if (!currentProfile) return; const plan = STAFF_ROLES.indexOf(currentProfile.role) !== -1 ? currentProfile.role : (currentProfile.plan || 'free'); const price = PLAN_PRICES[plan] || PLAN_PRICES.free;
    document.getElementById('billing-plan-name').textContent = plan; document.getElementById('billing-plan-price').textContent = price.label;
    const roleTag = document.getElementById('billing-role-tag'); if (STAFF_ROLES.indexOf(currentProfile.role) !== -1) { roleTag.classList.remove('hidden'); roleTag.classList.add('role-' + currentProfile.role); roleTag.textContent = currentProfile.role; } else roleTag.classList.add('hidden');
    const limits = getLimits(); document.getElementById('billing-projects-label').textContent = projectsCache.length + ' / ' + (limits.projects >= 999 ? '∞' : limits.projects); document.getElementById('billing-projects-bar').style.width = (limits.projects >= 999 ? 5 : Math.min(100, (projectsCache.length / limits.projects) * 100)) + '%';
    document.getElementById('billing-connections-label').textContent = connectionsCache.length + ' / ' + (limits.connections >= 999 ? '∞' : limits.connections); document.getElementById('billing-connections-bar').style.width = (limits.connections >= 999 ? 5 : Math.min(100, (connectionsCache.length / limits.connections) * 100)) + '%';
    const reposLinked = projectsCache.filter(p => p.github_repo && p.owner_id === currentUser.id).length; document.getElementById('billing-repos-label').textContent = reposLinked + ' / ' + (limits.repos >= 999 ? '∞' : limits.repos); document.getElementById('billing-repos-bar').style.width = (limits.repos >= 999 ? 5 : Math.min(100, (reposLinked / limits.repos) * 100)) + '%';
    const seatsUsed = getTeamSeatsUsed() + teamCache.filter(m => m.status === 'pending').length; document.getElementById('billing-seats-label').textContent = seatsUsed + ' / ' + (limits.seats >= 999 ? '∞' : limits.seats); document.getElementById('billing-seats-bar').style.width = (limits.seats >= 999 ? 5 : Math.min(100, (seatsUsed / limits.seats) * 100)) + '%';
    const tokensUsed = projectsCache.reduce((s, p) => s + (Number(p.ai_tokens_used) || 0), 0); const tokenLimit = STAFF_ROLES.indexOf(currentProfile.role) !== -1 ? 999999 : (currentProfile.plan === 'pro' ? 500000 : currentProfile.plan === 'team' ? 2000000 : 100000); document.getElementById('billing-tokens-label').textContent = tokensUsed.toLocaleString() + ' / ' + (tokenLimit >= 999999 ? '∞' : (tokenLimit / 1000) + 'k'); document.getElementById('billing-tokens-bar').style.width = Math.min(100, (tokensUsed / tokenLimit) * 100) + '%';
}
function openUpgradeModal(plan, price) {
    currentUpgradePlan = { plan, price }; document.getElementById('upgrade-plan-name').textContent = plan.charAt(0).toUpperCase() + plan.slice(1); document.getElementById('upgrade-plan-detail').textContent = price ? '$' + price + '/mo billed monthly' : 'Custom pricing'; document.getElementById('upgrade-error').classList.add('hidden');
    document.getElementById('upgrade-name').value = (currentProfile && currentProfile.full_name) || ''; document.getElementById('upgrade-contact').value = (currentProfile && (currentProfile.phone || currentProfile.email)) || (currentUser && currentUser.email) || ''; document.getElementById('upgrade-notes').value = ''; const btn = document.getElementById('submit-upgrade-btn'); btn.disabled = false; btn.textContent = 'Send Request';
    const helpEl = document.getElementById('upgrade-support-line'); if (helpEl) helpEl.innerHTML = 'Questions? WhatsApp <a href="' + supportWhatsAppLink('Hi, I have a question about the ' + plan + ' plan') + '" target="_blank" style="color: var(--cyan);">+' + SUPPORT_WA_INTL + '</a> or email <a href="' + supportEmailLink('Question about ' + plan) + '" style="color: var(--cyan);">' + SUPPORT_EMAIL + '</a>';
    document.getElementById('upgrade-modal').classList.remove('hidden');
}
function closeUpgradeModal() { document.getElementById('upgrade-modal').classList.add('hidden'); currentUpgradePlan = null; }
async function submitUpgradeRequest() {
    const btn = document.getElementById('submit-upgrade-btn'); if (btn.disabled) return; const name = document.getElementById('upgrade-name').value.trim(); const contact = document.getElementById('upgrade-contact').value.trim(); const notes = document.getElementById('upgrade-notes').value.trim(); const errEl = document.getElementById('upgrade-error'); errEl.classList.add('hidden');
    if (!name || !contact || !currentUpgradePlan) { errEl.textContent = 'Name and contact required.'; errEl.classList.remove('hidden'); return; } btn.textContent = 'Sending...'; btn.disabled = true;
    try {
        const { error } = await supabaseClient.from('upgrade_requests').insert([{ user_id: currentUser.id, requested_plan: currentUpgradePlan.plan, amount: currentUpgradePlan.price, currency: 'USD', contact_method: contact.indexOf('@') !== -1 ? 'email' : 'whatsapp', contact_value: contact, notes: 'Name: ' + name + (notes ? ' | ' + notes : ''), status: 'pending' }]); if (error) throw error;
        closeUpgradeModal(); showToast("Request sent! We'll reach out on WhatsApp (" + contact + ") within 24 hours", 'success', 5000); try { await loadMyUpgradeRequests(); } catch (reloadErr) { console.warn('[upgrade] reload failed', reloadErr); }
    } catch (err) { errEl.innerHTML = escapeHtml(err.message) + '<br><span style="font-size:10px;opacity:0.75;">Still stuck? WhatsApp <a href="' + supportWhatsAppLink('I need help upgrading') + '" target="_blank" style="color: var(--cyan);">+' + SUPPORT_WA_INTL + '</a> or email <a href="' + supportEmailLink('Upgrade error') + '" style="color: var(--cyan);">' + SUPPORT_EMAIL + '</a>.</span>'; errEl.classList.remove('hidden'); } finally { btn.disabled = false; btn.textContent = 'Send Request'; }
}
async function loadMyUpgradeRequests() {
    if (!currentUser) return; const wrap = document.getElementById('billing-my-requests'); const list = document.getElementById('billing-requests-list'); if (!wrap || !list) return;
    try { const { data, error } = await supabaseClient.from('upgrade_requests').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false }); if (error) return console.warn(error.message); if (!data || data.length === 0) { wrap.classList.add('hidden'); return; } wrap.classList.remove('hidden'); list.innerHTML = data.map(r => `<div class="rounded-lg p-3 flex items-center justify-between" style="background: var(--bg); border: 1px solid var(--border);"><div><p class="text-sm font-medium capitalize" style="color: var(--text);">${escapeHtml(r.requested_plan)}</p><p class="text-xs mono" style="color: var(--text-dim);">${new Date(r.created_at).toLocaleDateString()}</p></div><span class="text-[10px] uppercase font-bold ${r.status === 'approved' ? 'text-green-400' : r.status === 'pending' ? 'text-yellow-400' : 'text-red-400'}">${r.status}</span></div>`).join(''); } catch (err) { console.warn('[upgrade] list failed', err); }
}
function populateConnectProjectSelect() {
    const sel = document.getElementById('connect-project-select'); if (!sel) return; const own = projectsCache.filter(p => p.owner_id === currentUser.id);
    if (own.length === 0) { sel.innerHTML = '<option value="">— no projects —</option>'; return; } sel.innerHTML = own.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join(''); const current = sel.value; if (current && own.find(p => p.id === current)) sel.value = current; else sel.value = own[0].id; renderConnectSnippets();
}
function switchConnectTab(tab) {
    const jsPanel = document.getElementById('connect-panel-js'); const curlPanel = document.getElementById('connect-panel-curl'); const jsTab = document.getElementById('connect-tab-js'); const curlTab = document.getElementById('connect-tab-curl');
    if (tab === 'js') { jsPanel.classList.remove('hidden'); curlPanel.classList.add('hidden'); jsTab.style.color = 'var(--text)'; jsTab.style.borderBottom = '2px solid var(--accent)'; curlTab.style.color = 'var(--text-muted)'; curlTab.style.borderBottom = 'none'; } else { jsPanel.classList.add('hidden'); curlPanel.classList.remove('hidden'); curlTab.style.color = 'var(--text)'; curlTab.style.borderBottom = '2px solid var(--accent)'; jsTab.style.color = 'var(--text-muted)'; jsTab.style.borderBottom = 'none'; }
}
function renderConnectSnippets() {
    const sel = document.getElementById('connect-project-select'); if (!sel || !sel.value) return; const proj = projectsCache.find(p => p.id === sel.value); if (!proj) return;
    document.getElementById('connect-url').value = SUPABASE_URL; document.getElementById('connect-anon').value = SUPABASE_ANON_KEY;
    document.getElementById('connect-snippet-init').textContent = `import { createClient } from '@supabase/supabase-js'\n\nconst supabase = createClient(\n  '${SUPABASE_URL}',\n  '${SUPABASE_ANON_KEY}'\n)`;
    document.getElementById('connect-snippet-auth').textContent = `// Sign Up\nconst { data, error } = await fetch('${SUPABASE_URL}/functions/v1/ukmauth', {\n  method: 'POST',\n  headers: { 'Content-Type': 'application/json' },\n  body: JSON.stringify({\n    action: 'signup',\n    project_slug: '${proj.slug}',\n    email: 'user@example.com',\n    password: 'secret123'\n  })\n});`;
    document.getElementById('connect-snippet-data').textContent = `// Fetch Data\nconst { data, error } = await supabase\n  .schema('${proj.slug.replace(/-/g, '_')}')\n  .from('your_table_name')\n  .select('*')\n\n// Realtime\nsupabase.channel('custom-channel')\n  .on('postgres_changes', \n    { event: '*', schema: '${proj.slug.replace(/-/g, '_')}', table: 'your_table_name' }, \n    (payload) => console.log(payload)\n  ).subscribe()`;
    document.getElementById('connect-snippet-curl').textContent = `curl '${SUPABASE_URL}/rest/v1/your_table_name?select=*' \\\n-H "apikey: ${SUPABASE_ANON_KEY}" \\\n-H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \\\n-H "Accept-Profile: ${proj.slug.replace(/-/g, '_')}"`;
}
async function loadOwnerConsole() {
    if (STAFF_ROLES.indexOf(currentProfile && currentProfile.role) === -1) { showToast('Access denied', 'error'); switchView('overview'); return; }
    await Promise.all([loadAllUsers(), loadAllProjectsForOwner(), loadAllPaymentsForOwner(), loadAllRequestsForOwner(), loadAllTeamsForOwner()]); updateOwnerStats();
}
async function loadAllUsers() {
    const list = document.getElementById('owner-users-list'); const { data, error } = await supabaseClient.from('profiles').select('*').order('created_at', { ascending: false }); list.classList.remove('hidden'); if (error) { list.innerHTML = '<p class="text-sm" style="color: var(--red);">' + escapeHtml(error.message) + '</p>'; return; } allUsersCache = data || []; if (allUsersCache.length === 0) { list.innerHTML = '<p class="text-sm text-center py-8" style="color: var(--text-muted);">No users yet.</p>'; return; }
    list.innerHTML = allUsersCache.map(u => `<div class="rounded-xl p-4" style="background: var(--surface); border: 1px solid var(--border);"><div class="flex items-start justify-between mb-3"><div class="flex items-center gap-3 min-w-0"><div class="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0" style="background: rgba(79,70,229,0.2); border: 1px solid rgba(79,70,229,0.4); color: var(--accent);">${escapeHtml((u.full_name || u.username || u.email || 'U').charAt(0).toUpperCase())}</div><div class="min-w-0"><p class="font-bold truncate" style="color: var(--text);">${escapeHtml(u.full_name || u.username || 'Unnamed')}</p><p class="text-xs mono truncate" style="color: var(--text-dim);">${escapeHtml(u.email || '—')}</p></div></div>${u.role !== 'user' ? '<span class="role-' + u.role + ' text-[9px] font-bold uppercase px-2 py-1 rounded flex-shrink-0">' + escapeHtml(u.role) + '</span>' : ''}</div><div class="grid grid-cols-2 gap-3"><div><label class="block text-[10px] uppercase font-bold mb-1" style="color: var(--text-dim);">Role</label><select onchange="updateUserRole('${u.id}', this.value)" class="w-full rounded-lg px-3 py-2 text-xs" style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"><option value="user" ${u.role === 'user' ? 'selected' : ''}>user</option><option value="support" ${u.role === 'support' ? 'selected' : ''}>support</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>admin</option><option value="owner" ${u.role === 'owner' ? 'selected' : ''}>owner</option></select></div><div><label class="block text-[10px] uppercase font-bold mb-1" style="color: var(--text-dim);">Plan</label><select onchange="updateUserPlan('${u.id}', this.value)" class="w-full rounded-lg px-3 py-2 text-xs" style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"><option value="free" ${u.plan === 'free' ? 'selected' : ''}>free</option><option value="pro" ${u.plan === 'pro' ? 'selected' : ''}>pro</option><option value="team" ${u.plan === 'team' ? 'selected' : ''}>team</option><option value="enterprise" ${u.plan === 'enterprise' ? 'selected' : ''}>enterprise</option></select></div></div><div class="mt-3 text-[10px]" style="color: var(--text-dim);">Joined: ${new Date(u.created_at).toLocaleDateString()}</div></div>`).join('');
}
async function loadAllProjectsForOwner() { const list = document.getElementById('owner-projects-list'); const { data, error } = await supabaseClient.from('projects').select('*').order('created_at', { ascending: false }); list.classList.remove('hidden'); if (error) { list.innerHTML = '<p class="text-sm" style="color: var(--red);">' + escapeHtml(error.message) + '</p>'; return; } if (!data || data.length === 0) { list.innerHTML = '<p class="text-sm text-center py-8" style="color: var(--text-muted);">No projects yet.</p>'; return; } const userMap = {}; allUsersCache.forEach(u => { userMap[u.id] = u.email || u.username || 'unknown'; }); list.innerHTML = data.map(p => `<div class="rounded-xl p-4" style="background: var(--surface); border: 1px solid var(--border);"><div class="flex items-start justify-between mb-2"><div class="min-w-0"><p class="font-bold truncate" style="color: var(--text);">${escapeHtml(p.name)}</p><p class="text-xs mono truncate" style="color: var(--text-dim);">${escapeHtml(p.slug)}</p></div><span class="text-[10px] font-bold uppercase px-2 py-1 rounded flex-shrink-0" style="background: rgba(6,182,212,0.1); color: var(--cyan);">${escapeHtml(p.status || 'active')}</span></div><p class="text-xs mb-2 truncate" style="color: var(--text-muted);">Owner: <span class="mono">${escapeHtml(userMap[p.owner_id] || p.owner_id)}</span></p><div class="text-[10px] flex gap-3" style="color: var(--text-dim);"><span>${new Date(p.created_at).toLocaleDateString()}</span></div></div>`).join(''); }
async function loadAllPaymentsForOwner() { const list = document.getElementById('owner-payments-list'); const { data, error } = await supabaseClient.from('payments').select('*').order('paid_at', { ascending: false }); list.classList.remove('hidden'); if (error) { list.innerHTML = '<p class="text-sm" style="color: var(--red);">' + escapeHtml(error.message) + '</p>'; return; } if (!data || data.length === 0) { list.innerHTML = '<p class="text-sm text-center py-8" style="color: var(--text-muted);">No payments yet.</p>'; return; } list.innerHTML = data.map(p => `<div class="rounded-xl p-4 flex items-center justify-between" style="background: var(--surface); border: 1px solid var(--border);"><div class="min-w-0"><p class="text-sm font-medium truncate" style="color: var(--text);">${escapeHtml(p.customer_email || 'Anonymous')}</p><p class="text-xs mono" style="color: var(--text-dim);">${new Date(p.paid_at).toLocaleDateString()} · ${escapeHtml(p.provider || 'manual')}</p></div><div class="text-right flex-shrink-0"><div class="font-bold mono" style="color: var(--text);">${escapeHtml(p.currency)} ${Number(p.amount).toFixed(2)}</div></div></div>`).join(''); }
async function loadAllRequestsForOwner() {
    const list = document.getElementById('owner-requests-list'); const { data, error } = await supabaseClient.from('upgrade_requests').select('*').order('created_at', { ascending: false }); list.classList.remove('hidden'); if (error) { list.innerHTML = '<p class="text-sm" style="color: var(--red);">' + escapeHtml(error.message) + '</p>'; return; } if (!data || data.length === 0) { list.innerHTML = '<p class="text-sm text-center py-8" style="color: var(--text-muted);">No upgrade requests yet.</p>'; return; }
    const userMap = {}; allUsersCache.forEach(u => { userMap[u.id] = u; }); list.innerHTML = data.map(r => { const u = userMap[r.user_id] || {}; const statusBg = r.status === 'approved' ? 'text-green-400 bg-green-400/10' : r.status === 'pending' ? 'text-yellow-400 bg-yellow-400/10' : 'text-red-400 bg-red-400/10'; let contactBtn = ''; if (r.contact_value) { if (r.contact_value.includes('@')) contactBtn = `<a href="mailto:${r.contact_value}" class="text-xs font-bold text-[var(--cyan)] px-3 py-1 bg-[var(--cyan)]/10 rounded border border-[var(--cyan)]/30">Email</a>`; else { const cleanPhone = r.contact_value.replace(/\D/g, ''); contactBtn = `<a href="https://wa.me/${cleanPhone}" target="_blank" class="text-xs font-bold text-green-400 px-3 py-1 bg-green-400/10 rounded border border-green-400/30">WhatsApp</a>`; } } return `<div class="rounded-xl p-4" style="background: var(--surface); border: 1px solid var(--border);"><div class="flex items-start justify-between mb-3"><div class="min-w-0"><p class="font-bold truncate" style="color: var(--text);">${escapeHtml(u.full_name || 'Unknown')}</p><p class="text-xs mono truncate" style="color: var(--text-dim);">${escapeHtml(u.email || '—')}</p></div><span class="text-[10px] font-bold uppercase px-2 py-1 rounded flex-shrink-0 ${statusBg}">${r.status}</span></div><div class="rounded-lg p-3 mb-3 text-xs" style="background: var(--bg); border: 1px solid var(--border);"><p class="font-bold capitalize mb-1" style="color: var(--text);">Wants: ${escapeHtml(r.requested_plan)}</p>${r.contact_value ? '<div class="flex justify-between items-center mt-2"><p style="color: var(--text-muted);">Contact: ' + escapeHtml(r.contact_value) + '</p>' + contactBtn + '</div>' : ''}${r.notes ? '<p class="mt-2" style="color: var(--text-muted);">' + escapeHtml(r.notes) + '</p>' : ''}</div>${r.status === 'pending' ? '<div class="flex gap-2"><button onclick="approveUpgrade(\'' + r.id + '\', \'' + r.user_id + '\', \'' + r.requested_plan + '\')" class="flex-1 bg-green-500/20 border border-green-500/40 text-green-400 font-bold py-2 rounded-lg text-xs">Approve</button><button onclick="rejectUpgrade(\'' + r.id + '\')" class="flex-1 bg-red-500/10 border border-red-500/30 text-red-400 font-bold py-2 rounded-lg text-xs">Reject</button></div>' : ''}</div>`; }).join('');
}
async function loadAllTeamsForOwner() { const list = document.getElementById('owner-teams-list'); const { data, error } = await supabaseClient.from('team_members').select('*'); list.classList.remove('hidden'); if (error) { list.innerHTML = '<p class="text-sm" style="color: var(--red);">' + escapeHtml(error.message) + '</p>'; return; } if (!data || data.length === 0) { list.innerHTML = '<p class="text-sm text-center py-8" style="color: var(--text-muted);">No teams yet.</p>'; return; } const grouped = {}; data.forEach(m => { if (!grouped[m.owner_id]) grouped[m.owner_id] = []; grouped[m.owner_id].push(m); }); const userMap = {}; allUsersCache.forEach(u => { userMap[u.id] = u; }); list.innerHTML = Object.keys(grouped).map(ownerId => { const owner = userMap[ownerId] || {}; return `<div class="rounded-xl p-4" style="background: var(--surface); border: 1px solid var(--border);"><div class="flex items-start justify-between mb-3"><div class="min-w-0"><p class="font-bold truncate" style="color: var(--text);">${escapeHtml(owner.full_name || 'Unknown')}</p><p class="text-xs mono truncate" style="color: var(--text-dim);">${escapeHtml(owner.email || ownerId)}</p></div></div></div>`; }).join(''); }
async function updateOwnerStats() { const { count: userCount } = await supabaseClient.from('profiles').select('*', { count: 'exact', head: true }); const { count: projectCount } = await supabaseClient.from('projects').select('*', { count: 'exact', head: true }); const { data: payments } = await supabaseClient.from('payments').select('amount').eq('status', 'paid'); const { data: teams } = await supabaseClient.from('team_members').select('owner_id').eq('status', 'active'); const uniqueOwners = new Set((teams || []).map(t => t.owner_id)); const revenue = (payments || []).reduce((s, p) => s + Number(p.amount || 0), 0); document.getElementById('owner-stat-users').textContent = userCount || '—'; document.getElementById('owner-stat-projects').textContent = projectCount || '—'; document.getElementById('owner-stat-revenue').textContent = '$' + revenue.toFixed(2); document.getElementById('owner-stat-teams').textContent = uniqueOwners.size || '—'; }
function switchOwnerTab(tab) { const panels = { users: 'owner-users-panel', projects: 'owner-projects-panel', payments: 'owner-payments-panel', requests: 'owner-requests-panel', teams: 'owner-teams-panel' }; const tabs = { users: 'owner-tab-users', projects: 'owner-tab-projects', payments: 'owner-tab-payments', requests: 'owner-tab-requests', teams: 'owner-tab-teams' }; Object.keys(panels).forEach(k => { const panel = document.getElementById(panels[k]); const tabEl = document.getElementById(tabs[k]); if (!panel || !tabEl) return; if (k === tab) { panel.classList.remove('hidden'); tabEl.style.color = 'var(--text)'; tabEl.style.borderBottom = '2px solid var(--accent)'; } else { panel.classList.add('hidden'); tabEl.style.color = 'var(--text-muted)'; tabEl.style.borderBottom = 'none'; } }); }
async function updateUserRole(userId, newRole) { if (userId === currentUser.id && currentProfile.role === 'owner' && newRole !== 'owner') { showToast("Can't demote yourself as owner", 'error'); await loadAllUsers(); return; } const { error } = await supabaseClient.from('profiles').update({ role: newRole }).eq('id', userId); if (error) { showToast('Failed: ' + error.message, 'error'); await loadAllUsers(); return; } await loadAllUsers(); showToast('Role updated', 'success'); }
async function updateUserPlan(userId, newPlan) { const { error } = await supabaseClient.from('profiles').update({ plan: newPlan }).eq('id', userId); if (error) { showToast('Failed: ' + error.message, 'error'); await loadAllUsers(); return; } await loadAllUsers(); showToast('Plan updated', 'success'); }
async function approveUpgrade(requestId, userId, plan) { if (!confirm('Approve this upgrade?')) return; const { error: planError } = await supabaseClient.from('profiles').update({ plan }).eq('id', userId); if (planError) { showToast('Failed: ' + planError.message, 'error'); return; } const { error: reqError } = await supabaseClient.from('upgrade_requests').update({ status: 'approved', resolved_at: new Date().toISOString() }).eq('id', requestId); if (reqError) { showToast('Failed: ' + reqError.message, 'error'); return; } await loadOwnerConsole(); showToast('Upgrade approved', 'success'); }
async function rejectUpgrade(requestId) { if (!confirm('Reject this request?')) return; const { error } = await supabaseClient.from('upgrade_requests').update({ status: 'rejected', resolved_at: new Date().toISOString() }).eq('id', requestId); if (error) { showToast('Failed: ' + error.message, 'error'); return; } await loadOwnerConsole(); showToast('Request rejected', 'success'); }

// ============================================
// PUBLIC ROUTES
// ============================================
async function loadPublicCheckout(slug, planId) {
    document.getElementById('landing-view').classList.add('hidden'); document.getElementById('auth-view').classList.add('hidden'); document.getElementById('dashboard-view').classList.add('hidden'); document.getElementById('public-checkout-view').classList.remove('hidden');
    try {
        const { data: plan, error: planErr } = await supabaseClient.from('plans').select('*, projects!inner(name, slug)').eq('id', planId).eq('projects.slug', slug).single(); if (planErr || !plan) throw new Error('Plan not found');
        document.getElementById('checkout-project-name').textContent = plan.projects.name; document.getElementById('checkout-plan-name').textContent = plan.name; document.getElementById('checkout-currency').textContent = plan.currency; document.getElementById('checkout-price').textContent = Number(plan.price_amount).toFixed(2); document.getElementById('checkout-interval').textContent = plan.interval;
        const payBtn = document.getElementById('checkout-pay-btn'); if (plan.checkout_url) payBtn.onclick = () => { window.location.href = plan.checkout_url; }; else { payBtn.textContent = 'Contact Business to Pay'; payBtn.style.background = 'var(--border)'; } document.getElementById('checkout-loading').classList.add('hidden'); document.getElementById('checkout-content').classList.remove('hidden');
    } catch (err) { document.getElementById('checkout-loading').classList.add('hidden'); document.getElementById('checkout-error').classList.remove('hidden'); }
}
async function loadPublicPage(pageSlug) {
    document.getElementById('landing-view').classList.add('hidden'); document.getElementById('auth-view').classList.add('hidden'); document.getElementById('dashboard-view').classList.add('hidden'); document.getElementById('public-page-view').classList.remove('hidden');
    const { data: page } = await supabaseClient.from('project_pages').select('*, projects!inner(slug)').eq('slug', pageSlug).single(); if (!page) { document.getElementById('page-title').textContent = 'Page Not Found'; document.getElementById('page-loading').classList.add('hidden'); return; }
    document.getElementById('page-title').textContent = page.title; const { data: schema } = await supabaseClient.from('project_schemas').select('schema_name').eq('project_id', page.project_id).single(); const { data: rows } = await supabaseClient.schema(schema.schema_name).from(page.table_name).select('*').limit(100); document.getElementById('page-loading').classList.add('hidden');
    if (!rows || rows.length === 0) return document.getElementById('page-empty').classList.remove('hidden'); document.getElementById('page-content').classList.remove('hidden'); document.getElementById('page-content').innerHTML = rows.map(r => { let html = '<div class="rounded-xl p-5" style="background: var(--surface); border: 1px solid var(--border);"><div class="space-y-2">'; page.columns_to_show.forEach(c => { html += `<div><span class="text-[10px] uppercase font-bold" style="color: var(--text-muted);">${escapeHtml(c)}</span><p class="text-sm font-bold" style="color: var(--text);">${escapeHtml(String(r[c] || '—'))}</p></div>`; }); return html + '</div></div>'; }).join('');
}
async function loadPublicForm(slug, tableName) {
    document.getElementById('landing-view').classList.add('hidden'); document.getElementById('auth-view').classList.add('hidden'); document.getElementById('dashboard-view').classList.add('hidden'); document.getElementById('public-form-view').classList.remove('hidden');
    const { data: proj } = await supabaseClient.from('projects').select('name').eq('slug', slug).single(); document.getElementById('form-title').textContent = proj ? proj.name : tableName; document.getElementById('form-loading').classList.add('hidden'); document.getElementById('dynamic-form').classList.remove('hidden');
    document.getElementById('dynamic-form').innerHTML = `<div><label class="block text-xs mb-1">Name</label><input type="text" name="name" required class="w-full rounded-lg px-4 py-3" style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"></div><div><label class="block text-xs mb-1">Email</label><input type="email" name="email" required class="w-full rounded-lg px-4 py-3" style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"></div><button type="submit" class="w-full font-bold py-3 rounded-lg text-white mt-4" style="background: var(--accent);">Submit</button>`;
    document.getElementById('dynamic-form').onsubmit = async (e) => { e.preventDefault(); const data = Object.fromEntries(new FormData(e.target).entries()); await fetch(SUPABASE_URL + '/functions/v1/ukmform', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_slug: slug, table_name: tableName, data }) }); document.getElementById('dynamic-form').classList.add('hidden'); document.getElementById('form-success').classList.remove('hidden'); };
}
function copyFormLink(tableName) { const proj = projectsCache.find(p => p.id === currentUkmDataProjectId); if (!proj) return; const url = window.location.origin + window.location.pathname + '?form=' + tableName + '&project=' + proj.slug; navigator.clipboard.writeText(url); showToast('Form link copied!', 'success'); }

// ============================================
// INIT
// ============================================
async function init() {
    initTheme();
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('pay') && urlParams.has('plan')) return loadPublicCheckout(urlParams.get('pay'), urlParams.get('plan'));
    if (urlParams.has('form') && urlParams.has('project')) return loadPublicForm(urlParams.get('project'), urlParams.get('form'));
    if (urlParams.has('page')) return loadPublicPage(urlParams.get('page'));
    if (urlParams.has('type') && urlParams.get('type') === 'recovery') { showAuthView(); document.getElementById('auth-email').parentElement.classList.add('hidden'); document.getElementById('auth-password').parentElement.parentElement.classList.add('hidden'); document.getElementById('auth-submit').classList.add('hidden'); document.getElementById('new-password-view').classList.remove('hidden'); return; }
    const { data: { session } } = await supabaseClient.auth.getSession(); if (session) showDashboardView(session.user); else showLandingView();
}
supabaseClient.auth.onAuthStateChange((event, session) => { if (event === 'TOKEN_REFRESHED') return; if (session) showDashboardView(session.user); else showLandingView(); });
init();
