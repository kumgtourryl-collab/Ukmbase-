import { showToast, escapeHtml } from './utils.js';
import { state } from './state.js';
import { STAFF_ROLES } from './config.js';

export function setAuthMode(mode) {
    document.getElementById('auth-email').parentElement.classList.remove('hidden');
    document.getElementById('auth-password').parentElement.parentElement.classList.remove('hidden');
    document.getElementById('auth-submit').classList.remove('hidden');
    document.getElementById('forgot-password-view').classList.add('hidden');
    const newPass = document.getElementById('new-password-view');
    if (newPass) newPass.classList.add('hidden');

    state.authMode = mode;
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

export async function handleLogin() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const errEl = document.getElementById('auth-error');
    errEl.classList.add('hidden');
    if (!email || !password) { errEl.textContent = 'Please fill in all fields.'; errEl.classList.remove('hidden'); return; }
    
    const { data, error } = await window.supabaseClient.auth.signInWithPassword({ email, password });
    if (error) { errEl.textContent = error.message; errEl.classList.remove('hidden'); }
    else { window.showDashboardView(data.user); }
}

export async function handleSignup() {
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
    
    const { data, error } = await window.supabaseClient.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
    if (error) { errEl.textContent = error.message; errEl.classList.remove('hidden'); }
    else if (data.session) { window.showDashboardView(data.user); }
    else { succEl.textContent = 'Account created! Check your email to confirm.'; succEl.classList.remove('hidden'); }
}

export function handleAuthSubmit() {
    if (state.authMode === 'login') return handleLogin();
    return handleSignup();
}

export async function signInWithProvider(provider) {
    const errEl = document.getElementById('auth-error');
    errEl.classList.add('hidden');
    const { error } = await window.supabaseClient.auth.signInWithOAuth({ provider, options: { redirectTo: window.location.origin + window.location.pathname } });
    if (error) { errEl.textContent = error.message; errEl.classList.remove('hidden'); }
}

export async function handleLogout() {
    await window.supabaseClient.auth.signOut();
    state.currentUser = null; state.currentProfile = null;
    window.showLandingView(); showToast('Signed out', 'success');
}

// --- PROFILE & SETTINGS ---
export function renderRoleBadge(role) {
    const badge = document.getElementById('role-badge'); const navOwnerWrap = document.getElementById('nav-owner-wrap');
    if (!badge) return;
    badge.classList.remove('role-owner', 'role-admin', 'role-support', 'hidden');
    if (!role || role === 'user') badge.classList.add('hidden');
    else { badge.classList.add('role-' + role); badge.textContent = role.charAt(0).toUpperCase() + role.slice(1); }
    if (navOwnerWrap) navOwnerWrap.classList.toggle('hidden', STAFF_ROLES.indexOf(role) === -1);
}

export async function loadProfile() {
    if (!state.currentUser) return;
    const { data, error } = await window.supabaseClient.from('profiles').select('*').eq('id', state.currentUser.id).single();
    if (error) return console.error(error.message);
    state.currentProfile = data;
    renderRoleBadge(data.role);
    window.supabaseClient.from('profiles').update({ last_login_at: new Date().toISOString() }).eq('id', state.currentUser.id).then(() => {});
}

export function renderSettings() {
    if (!state.currentProfile) return;
    document.getElementById('settings-initial').textContent = (state.currentProfile.full_name || state.currentProfile.username || 'U').charAt(0).toUpperCase();
    document.getElementById('settings-display-name').textContent = state.currentProfile.full_name || state.currentProfile.username || 'User';
    document.getElementById('settings-display-email').textContent = state.currentProfile.email || state.currentUser.email;
    document.getElementById('settings-plan').textContent = state.currentProfile.plan || 'free';
    document.getElementById('settings-fullname').value = state.currentProfile.full_name || '';
    document.getElementById('settings-username').value = state.currentProfile.username || '';
    document.getElementById('settings-phone').value = state.currentProfile.phone || '';
    document.getElementById('settings-country').value = state.currentProfile.country || '';
    
    const limits = window.getLimits();
    const displayPlan = STAFF_ROLES.indexOf(state.currentProfile.role) !== -1 ? state.currentProfile.role : (state.currentProfile.plan || 'free');
    document.getElementById('settings-plan-2').textContent = displayPlan;
    document.getElementById('settings-limit-projects').textContent = state.projectsCache.length + ' / ' + (limits.projects >= 999 ? '∞' : limits.projects);
    document.getElementById('settings-limit-connections').textContent = state.connectionsCache.length + ' / ' + (limits.connections >= 999 ? '∞' : limits.connections);
    document.getElementById('settings-limit-seats').textContent = window.getTeamSeatsUsed() + ' / ' + (limits.seats >= 999 ? '∞' : limits.seats);
}

export async function saveProfile() {
    const full_name = document.getElementById('settings-fullname').value.trim();
    const username = document.getElementById('settings-username').value.trim();
    const phone = document.getElementById('settings-phone').value.trim();
    const country = document.getElementById('settings-country').value;
    const btn = document.getElementById('settings-save-btn');
    document.getElementById('settings-error').classList.add('hidden');
    document.getElementById('settings-success').classList.add('hidden');
    if (!full_name || !username) return showToast('Name and username required', 'error');
    
    btn.textContent = 'Saving...'; btn.disabled = true;
    const { error } = await window.supabaseClient.from('profiles').update({ full_name, username, phone, country }).eq('id', state.currentUser.id);
    btn.textContent = 'Save Changes'; btn.disabled = false;
    
    if (error) { document.getElementById('settings-error').textContent = error.message; document.getElementById('settings-error').classList.remove('hidden'); }
    else { document.getElementById('settings-success').textContent = 'Profile saved.'; document.getElementById('settings-success').classList.remove('hidden'); await loadProfile(); renderSettings(); showToast('Profile saved', 'success'); }
}
