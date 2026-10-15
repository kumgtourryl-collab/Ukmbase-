// UKMBASE APP.JS — v503
// Bump this version + the script src version in index.html on every update

// ============================================
// CONFIG & CLIENT
// ============================================

const SUPABASE_URL = 'https://dwjyzqsrzdgnpwibnyjn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_4vcPyg62OqmfwNaHxx0CGA_a7O0_NJV';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const PLAN_LIMITS = {
    free:       { projects: 2,   connections: 3   },
    pro:        { projects: 20,  connections: 20  },
    team:       { projects: 100, connections: 100 },
    enterprise: { projects: 999, connections: 999 },
    staff:      { projects: 999, connections: 999 },
};

const STAFF_ROLES = ['owner', 'admin', 'support'];

const landingView = document.getElementById('landing-view');
const authView = document.getElementById('auth-view');
const dashboardView = document.getElementById('dashboard-view');
const userEmailDisplay = document.getElementById('user-email');

let currentUser = null;
let currentProfile = null;
let chatHistory = [];
let projectsCache = [];
let connectionsCache = [];
let activeConnection = null;
let activeTable = null;
let activeSchema = null;
let authMode = 'login';

// ============================================
// HEADERS HELPER
// ============================================

function getHeaders(key) {
    const headers = { 'apikey': key };
    if (!key.startsWith('sb_publishable_')) {
        headers['Authorization'] = `Bearer ${key}`;
    }
    return headers;
}

// ============================================
// PLAN LIMITS
// ============================================

function getLimits() {
    if (STAFF_ROLES.includes(currentProfile?.role)) return PLAN_LIMITS.staff;
    const plan = currentProfile?.plan || 'free';
    return PLAN_LIMITS[plan] || PLAN_LIMITS.free;
}

function canCreateProject() {
    return projectsCache.length < getLimits().projects;
}

function canCreateConnection() {
    return connectionsCache.length < getLimits().connections;
}

// ============================================
// AUTH MODE TOGGLE
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
    btn.classList.toggle('text-[#4F46E5]', isPassword);
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
        bar.style.background = i <= score ? colors[score] : '#2A3347';
    }
    const labelEl = document.getElementById('strength-label');
    if (labelEl) {
        labelEl.textContent = pwd ? labels[score] : 'Password strength';
        labelEl.style.color = pwd ? colors[score] : '#64748B';
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

    loadProjects().then(() => {
        loadPayments();
        loadPlans();
        loadConnections();
    });

    switchView('overview');
}

function switchView(view) {
    const views = ['overview', 'ukmai', 'ukmtables', 'ukmpay', 'settings'];
    views.forEach(v => {
        const el = document.getElementById('view-' + v);
        const nav = document.getElementById('nav-' + v);
        if (v === view) {
            el.classList.remove('hidden');
            if (nav) { nav.classList.add('sidebar-active', 'text-white'); nav.classList.remove('text-[#94A3B8]'); }
        } else {
            el.classList.add('hidden');
            if (nav) { nav.classList.remove('sidebar-active', 'text-white'); nav.classList.add('text-[#94A3B8]'); }
        }
    });

    if (view === 'ukmpay') { loadPayments(); loadPlans(); }
    if (view === 'ukmtables') { loadConnections(); }
    if (view === 'settings') { renderSettings(); }
    document.getElementById('sidebar').classList.add('-translate-x-full');
}

// ============================================
// PROFILE
// ============================================

function renderRoleBadge(role) {
    const badge = document.getElementById('role-badge');
    if (!badge) return;

    badge.classList.remove('role-owner', 'role-admin', 'role-support', 'hidden');

    if (!role || role === 'user') {
        badge.classList.add('hidden');
        return;
    }

    badge.classList.add('role-' + role);
    badge.textContent = role.charAt(0).toUpperCase() + role.slice(1);
}

async function loadProfile() {
    if (!currentUser) return;

    const { data, error } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .single();

    if (error) {
        console.error('[Ukmbase] Profile load error:', error.message);
        return;
    }

    currentProfile = data;
    renderRoleBadge(data.role);

    supabaseClient.from('profiles')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', currentUser.id)
        .then(() => {});
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
    if (role === 'user') {
        roleTag.classList.add('hidden');
    } else {
        roleTag.classList.remove('hidden');
        roleTag.classList.add('role-' + role);
        roleTag.textContent = role.charAt(0).toUpperCase() + role.slice(1);
    }

    document.getElementById('settings-fullname').value = currentProfile.full_name || '';
    document.getElementById('settings-username').value = currentProfile.username || '';
    document.getElementById('settings-phone').value = currentProfile.phone || '';
    document.getElementById('settings-country').value = currentProfile.country || '';

    const limits = getLimits();
    const displayPlan = STAFF_ROLES.includes(currentProfile.role)
        ? currentProfile.role
        : (currentProfile.plan || 'free');
    document.getElementById('settings-plan-2').textContent = displayPlan;
    document.getElementById('settings-limit-projects').textContent =
        `${projectsCache.length} / ${limits.projects >= 999 ? '∞' : limits.projects}`;
    document.getElementById('settings-limit-connections').textContent =
        `${connectionsCache.length} / ${limits.connections >= 999 ? '∞' : limits.connections}`;
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
    if (!full_name || !username) {
        errEl.textContent = 'Full name and username are required.';
        errEl.classList.remove('hidden'); return;
    }

    btn.textContent = 'Saving...'; btn.disabled = true;

    const { error } = await supabaseClient
        .from('profiles')
        .update({ full_name, username, phone: phone || null, country: country || null })
        .eq('id', currentUser.id);

    btn.textContent = 'Save Changes'; btn.disabled = false;

    if (error) {
        errEl.textContent = error.message.includes('duplicate')
            ? 'That username is taken.'
            : error.message;
        errEl.classList.remove('hidden'); return;
    }

    succEl.textContent = 'Profile saved.';
    succEl.classList.remove('hidden');
    await loadProfile();
    renderSettings();
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
    const succEl = document.getElementById('auth-success');
    errEl.classList.add('hidden'); succEl.classList.add('hidden');

    if (!email || !password) {
        errEl.textContent = 'Please fill in all fields.';
        errEl.classList.remove('hidden'); return;
    }

    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
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

    if (!fullName || !email || !password || !confirm) {
        errEl.textContent = 'Please fill in all fields.';
        errEl.classList.remove('hidden'); return;
    }
    if (password !== confirm) {
        errEl.textContent = 'Passwords do not match.';
        errEl.classList.remove('hidden'); return;
    }
    if (password.length < 8) {
        errEl.textContent = 'Password must be at least 8 characters.';
        errEl.classList.remove('hidden'); return;
    }

    const { data, error } = await supabaseClient.auth.signUp({
        email, password,
        options: { data: { full_name: fullName } }
    });

    if (error) { errEl.textContent = error.message; errEl.classList.remove('hidden'); }
    else if (data.session) { showDashboardView(data.user); }
    else { succEl.textContent = 'Account created! Check your email to confirm.'; succEl.classList.remove('hidden'); }
}

async function signInWithProvider(provider) {
    const errEl = document.getElementById('auth-error');
    const succEl = document.getElementById('auth-success');
    errEl.classList.add('hidden'); succEl.classList.add('hidden');

    const { error } = await supabaseClient.auth.signInWithOAuth({
        provider,
        options: {
            redirectTo: window.location.origin + window.location.pathname
        }
    });

    if (error) {
        errEl.textContent = error.message;
        errEl.classList.remove('hidden');
    }
    // On success, browser redirects to Google/GitHub consent screen
}

async function handleLogout() {
    await supabaseClient.auth.signOut();
    currentUser = null;
    currentProfile = null;
    showLandingView();
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
    if (!email) return alert('Please enter your email.');
    submitBtn.innerText = 'Joining...';
    submitBtn.disabled = true;

    const { error } = await supabaseClient.from('waitlist').insert([{ email }]);
    if (error) {
        alert('Error: ' + error.message);
        submitBtn.innerText = 'Join Waitlist';
        submitBtn.disabled = false;
    } else {
        formContainer.classList.add('hidden');
        successMessage.classList.remove('hidden');
    }
}

// ============================================
// SIDEBAR
// ============================================

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('-translate-x-full');
}

// ============================================
// PROJECTS
// ============================================

function openProjectModal() {
    if (!canCreateProject()) {
        alert(`You've reached your plan limit. Upgrade to add more.`);
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
    const { data, error } = await supabaseClient.from('projects').select('*').order('created_at', { ascending: false });
    if (error) { console.error(error.message); return; }
    projectsCache = data || [];
    renderProjects(projectsCache);
    updateStats(projectsCache);
    populateProjectSelects();
}

function renderProjects(projects) {
    const emptyState = document.getElementById('empty-state');
    let grid = document.getElementById('projects-grid');

    if (!projects || projects.length === 0) {
        emptyState.classList.remove('hidden');
        if (grid) grid.classList.add('hidden');
        return;
    }
    emptyState.classList.add('hidden');
    if (!grid) {
        grid = document.createElement('div');
        grid.id = 'projects-grid';
        grid.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4';
        emptyState.parentNode.insertBefore(grid, emptyState.nextSibling);
    }
    grid.classList.remove('hidden');
    grid.innerHTML = projects.map(p => `
        <div class="feature-card bg-[#1C2333] border border-[#2A3347] p-5 rounded-xl">
            <div class="flex items-start justify-between mb-3">
                <div class="w-10 h-10 rounded-lg bg-[#4F46E5]/10 border border-[#4F46E5]/30 flex items-center justify-center">
                    <svg class="w-5 h-5 text-[#4F46E5]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                </div>
                <span class="text-[10px] font-bold uppercase tracking-wider text-[#06B6D4] bg-[#06B6D4]/10 px-2 py-1 rounded">${p.status || 'active'}</span>
            </div>
            <h3 class="font-bold text-white mb-1 truncate">${escapeHtml(p.name)}</h3>
            <p class="text-[#94A3B8] text-xs mono mb-3 truncate">${escapeHtml(p.slug)}</p>
            <p class="text-[#94A3B8] text-sm line-clamp-2 mb-4">${escapeHtml(p.description || 'No description yet.')}</p>
            <div class="flex items-center justify-between text-[10px] text-[#64748B]">
                <span>${new Date(p.created_at).toLocaleDateString()}</span>
            </div>
        </div>
    `).join('');
}

function updateStats(projects) {
    const tokens = projects.reduce((s, p) => s + (Number(p.ai_tokens_used) || 0), 0);
    const syncs = projects.reduce((s, p) => s + (Number(p.sync_ops_used) || 0), 0);
    const tEl = document.getElementById('stat-tokens');
    const sEl = document.getElementById('stat-syncs');
    if (tEl) tEl.innerHTML = `${tokens.toLocaleString()} <span class="text-xs text-[#64748B] font-normal">/ 100k</span>`;
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

    const { error } = await supabaseClient.from('projects').insert([{
        owner_id: currentUser.id, name, slug,
        description: description || null, status: 'active'
    }]);

    btn.innerText = 'Forge Project'; btn.disabled = false;

    if (error) {
        errEl.textContent = error.message.includes('duplicate') ? 'That slug is already taken.' : error.message;
        errEl.classList.remove('hidden'); return;
    }
    closeProjectModal();
    await loadProjects();
}

// ============================================
// UKMAI
// ============================================

function handleChatKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
}

async function sendPrompt(text) {
    document.getElementById('chat-input').value = text;
    await sendChat();
}

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
        const res = await fetch(`${SUPABASE_URL}/functions/v1/ukmai`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${session.access_token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ prompt })
        });
        const data = await res.json();
        removeTypingIndicator(typingId);
        if (data.error) { appendMessage('ai', `**Error:** ${data.error}`); }
        else {
            appendMessage('ai', data.content || 'No response.');
            chatHistory.push({ role: 'user', content: prompt });
            chatHistory.push({ role: 'ai', content: data.content });
        }
    } catch (err) {
        removeTypingIndicator(typingId);
        appendMessage('ai', `**Network error:** ${err.message}`);
    }
    sendBtn.disabled = false;
    input.focus();
}

function appendMessage(role, content) {
    const container = document.getElementById('chat-messages');
    if (container.querySelector('.text-center')) container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'flex gap-3 max-w-3xl mx-auto';

    if (role === 'user') {
        wrapper.className += ' flex-row-reverse';
        wrapper.innerHTML = `
            <div class="w-8 h-8 rounded-lg bg-[#4F46E5]/20 border border-[#4F46E5]/40 flex items-center justify-center flex-shrink-0">
                <svg class="w-4 h-4 text-[#4F46E5]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
            </div>
            <div class="bg-[#4F46E5] text-white rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[80%] text-sm">${escapeHtml(content)}</div>`;
    } else {
        wrapper.innerHTML = `
            <div class="w-8 h-8 rounded-lg bg-[#F59E0B]/20 border border-[#F59E0B]/40 flex items-center justify-center flex-shrink-0">
                <svg class="w-4 h-4 text-[#F59E0B]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"></path></svg>
            </div>
            <div class="bg-[#1C2333] border border-[#2A3347] text-[#F8FAFC] rounded-2xl rounded-tl-sm px-4 py-3 max-w-[85%] text-sm chat-message">${marked.parse(content)}</div>`;
    }
    container.appendChild(wrapper);
    wrapper.querySelectorAll('pre code').forEach(b => hljs.highlightElement(b));
    wrapper.querySelectorAll('pre').forEach(pre => {
        const btn = document.createElement('button');
        btn.className = 'copy-btn'; btn.innerText = 'Copy';
        btn.onclick = () => {
            navigator.clipboard.writeText(pre.querySelector('code').innerText);
            btn.innerText = 'Copied!'; setTimeout(() => btn.innerText = 'Copy', 1500);
        };
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
    wrapper.innerHTML = `
        <div class="w-8 h-8 rounded-lg bg-[#F59E0B]/20 border border-[#F59E0B]/40 flex items-center justify-center flex-shrink-0">
            <svg class="w-4 h-4 text-[#F59E0B]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"></path></svg>
        </div>
        <div class="bg-[#1C2333] border border-[#2A3347] rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1">
            <span class="typing-dot w-2 h-2 bg-[#94A3B8] rounded-full"></span>
            <span class="typing-dot w-2 h-2 bg-[#94A3B8] rounded-full"></span>
            <span class="typing-dot w-2 h-2 bg-[#94A3B8] rounded-full"></span>
        </div>`;
    container.appendChild(wrapper); container.scrollTop = container.scrollHeight;
    return id;
}

function removeTypingIndicator(id) { const el = document.getElementById(id); if (el) el.remove(); }

function clearChat() {
    document.getElementById('chat-messages').innerHTML = `
        <div class="text-center py-8">
            <h3 class="text-white font-bold mb-1">Chat cleared</h3>
            <p class="text-[#94A3B8] text-xs">Describe your next app.</p>
        </div>`;
    chatHistory = [];
}

// ============================================
// UKMPAY — PLANS
// ============================================

function switchPayTab(tab) {
    const plansPanel = document.getElementById('pay-plans-panel');
    const payPanel = document.getElementById('pay-payments-panel');
    const plansTab = document.getElementById('pay-tab-plans');
    const payTab = document.getElementById('pay-tab-payments');

    if (tab === 'plans') {
        plansPanel.classList.remove('hidden'); payPanel.classList.add('hidden');
        plansTab.classList.add('text-white', 'border-b-2', 'border-[#4F46E5]');
        plansTab.classList.remove('text-[#94A3B8]');
        payTab.classList.remove('text-white', 'border-b-2', 'border-[#4F46E5]');
        payTab.classList.add('text-[#94A3B8]');
    } else {
        plansPanel.classList.add('hidden'); payPanel.classList.remove('hidden');
        payTab.classList.add('text-white', 'border-b-2', 'border-[#4F46E5]');
        payTab.classList.remove('text-[#94A3B8]');
        plansTab.classList.remove('text-white', 'border-b-2', 'border-[#4F46E5]');
        plansTab.classList.add('text-[#94A3B8]');
    }
}

function openPlanModal() {
    if (projectsCache.length === 0) { alert('Create a project first — plans belong to projects.'); return; }
    document.getElementById('plan-modal').classList.remove('hidden');
    document.getElementById('plan-error').classList.add('hidden');
    populateProjectSelects();
    ['plan-name', 'plan-price', 'plan-url'].forEach(id => document.getElementById(id).value = '');
}

function closePlanModal() { document.getElementById('plan-modal').classList.add('hidden'); }

function populateProjectSelects() {
    const options = projectsCache.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
    ['plan-project', 'pay-project'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = options;
    });
}

async function loadPlans() {
    if (!currentUser) return;
    const { data, error } = await supabaseClient.from('plans').select('*').order('created_at', { ascending: false });
    if (error) { console.error(error.message); return; }

    const empty = document.getElementById('pay-empty-plans');
    let grid = document.getElementById('pay-plans-grid');

    if (!data || data.length === 0) {
        empty.classList.remove('hidden');
        if (grid) grid.classList.add('hidden');
        document.getElementById('pay-plans-count').textContent = '0';
        return;
    }

    empty.classList.add('hidden');
    if (!grid) {
        grid = document.createElement('div');
        grid.id = 'pay-plans-grid';
        grid.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4';
        empty.parentNode.insertBefore(grid, empty.nextSibling);
    }
    grid.classList.remove('hidden');
    grid.innerHTML = data.map(pl => `
        <div class="bg-[#1C2333] border border-[#2A3347] p-5 rounded-xl">
            <div class="flex items-start justify-between mb-3">
                <span class="text-[10px] font-bold uppercase tracking-wider text-[#4F46E5] bg-[#4F46E5]/10 px-2 py-1 rounded">${escapeHtml(pl.provider)}</span>
                <span class="text-[10px] text-[#64748B]">${escapeHtml(pl.interval)}</span>
            </div>
            <h3 class="font-bold text-white mb-1">${escapeHtml(pl.name)}</h3>
            <div class="text-2xl font-extrabold text-white mono mb-3">${escapeHtml(pl.currency)} ${Number(pl.price_amount).toFixed(2)}</div>
            ${pl.checkout_url ? `<button onclick="copyCheckout('${escapeHtml(pl.checkout_url)}')" class="w-full bg-[#4F46E5]/10 border border-[#4F46E5]/30 hover:border-[#4F46E5] text-[#06B6D4] text-xs font-bold py-2 rounded-lg transition-colors">Copy Checkout Link</button>` : `<p class="text-[#64748B] text-xs">No checkout link set</p>`}
        </div>
    `).join('');

    document.getElementById('pay-plans-count').textContent = data.length;

    const payPlanSelect = document.getElementById('pay-plan');
    payPlanSelect.innerHTML = '<option value="">— none —</option>' + data.map(pl =>
        `<option value="${pl.id}">${escapeHtml(pl.name)} (${escapeHtml(pl.currency)} ${pl.price_amount})</option>`
    ).join('');
}

function copyCheckout(url) {
    navigator.clipboard.writeText(url);
    alert('Checkout link copied!');
}

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

    if (!project_id || !name || isNaN(price_amount)) {
        errEl.textContent = 'Project, name, and price are required.';
        errEl.classList.remove('hidden'); return;
    }

    btn.innerText = 'Creating...'; btn.disabled = true;
    const { error } = await supabaseClient.from('plans').insert([{
        project_id, name, price_amount, currency, interval, provider,
        checkout_url: checkout_url || null, active: true
    }]);
    btn.innerText = 'Create Plan'; btn.disabled = false;

    if (error) { errEl.textContent = error.message; errEl.classList.remove('hidden'); return; }

    closePlanModal();
    await loadPlans();
}

// ============================================
// UKMPAY — PAYMENTS
// ============================================

function openPaymentModal() {
    if (projectsCache.length === 0) { alert('Create a project first.'); return; }
    document.getElementById('payment-modal').classList.remove('hidden');
    document.getElementById('payment-error').classList.add('hidden');
    populateProjectSelects();
    ['pay-email', 'pay-amount'].forEach(id => document.getElementById(id).value = '');
}

function closePaymentModal() { document.getElementById('payment-modal').classList.add('hidden'); }

async function loadPayments() {
    if (!currentUser) return;
    const { data, error } = await supabaseClient.from('payments').select('*').order('paid_at', { ascending: false });
    if (error) { console.error(error.message); return; }

    const total = (data || []).filter(p => p.status === 'paid').reduce((s, p) => s + Number(p.amount), 0);
    const now = new Date();
    const monthly = (data || []).filter(p => {
        const d = new Date(p.paid_at);
        return p.status === 'paid' && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).reduce((s, p) => s + Number(p.amount), 0);

    document.getElementById('pay-total').textContent = '$' + total.toFixed(2);
    document.getElementById('pay-month').textContent = '$' + monthly.toFixed(2);
    const statRev = document.getElementById('stat-revenue');
    if (statRev) statRev.textContent = '$' + total.toFixed(2);

    const empty = document.getElementById('pay-empty-payments');
    const list = document.getElementById('pay-payments-list');

    if (!data || data.length === 0) {
        empty.classList.remove('hidden');
        if (list) list.classList.add('hidden');
        return;
    }
    empty.classList.add('hidden');
    if (!list) return;
    list.classList.remove('hidden');
    list.innerHTML = data.map(p => `
        <div class="bg-[#1C2333] border border-[#2A3347] p-4 rounded-xl flex items-center justify-between">
            <div class="flex items-center gap-3 min-w-0">
                <div class="w-9 h-9 rounded-lg bg-[#06B6D4]/10 border border-[#06B6D4]/30 flex items-center justify-center flex-shrink-0">
                    <svg class="w-4 h-4 text-[#06B6D4]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                </div>
                <div class="min-w-0">
                    <p class="text-white text-sm font-medium truncate">${escapeHtml(p.customer_email || 'Anonymous')}</p>
                    <p class="text-[#64748B] text-xs mono">${new Date(p.paid_at).toLocaleDateString()} · ${escapeHtml(p.provider || 'manual')}</p>
                </div>
            </div>
            <div class="text-right flex-shrink-0">
                <div class="text-white font-bold mono">${escapeHtml(p.currency)} ${Number(p.amount).toFixed(2)}</div>
                <span class="text-[10px] uppercase font-bold ${p.status === 'paid' ? 'text-green-400' : p.status === 'pending' ? 'text-yellow-400' : 'text-red-400'}">${p.status}</span>
            </div>
        </div>
    `).join('');
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

    if (!project_id || isNaN(amount)) {
        errEl.textContent = 'Project and amount are required.';
        errEl.classList.remove('hidden'); return;
    }

    btn.innerText = 'Logging...'; btn.disabled = true;
    const { error } = await supabaseClient.from('payments').insert([{
        project_id, plan_id: plan_id || null,
        customer_email: customer_email || null,
        amount, currency, provider, status: 'paid', paid_at: new Date().toISOString()
    }]);
    btn.innerText = 'Log Payment'; btn.disabled = false;

    if (error) { errEl.textContent = error.message; errEl.classList.remove('hidden'); return; }

    closePaymentModal();
    await loadPayments();
}

// ============================================
// UKMTABLES — CONNECTIONS
// ============================================

function openConnectModal() {
    if (!canCreateConnection()) {
        alert(`You've reached your plan limit. Upgrade to add more.`);
        return;
    }
    document.getElementById('connect-modal').classList.remove('hidden');
    document.getElementById('connect-error').classList.add('hidden');
    ['connect-name', 'connect-url', 'connect-key'].forEach(id => document.getElementById(id).value = '');
}

function closeConnectModal() { document.getElementById('connect-modal').classList.add('hidden'); }

async function loadConnections() {
    if (!currentUser) return;
    const { data, error } = await supabaseClient
        .from('connected_databases')
        .select('*')
        .order('created_at', { ascending: false });

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

    title.textContent = 'UkmTables';
    subtitle.textContent = 'Connect any Supabase database';
    actionBtn.innerText = '+ Connect';
    actionBtn.onclick = openConnectModal;
    backBtn.classList.add('hidden');

    document.getElementById('ukmtables-connections-view').classList.remove('hidden');
    document.getElementById('ukmtables-browser').classList.add('hidden');

    if (!connections || connections.length === 0) {
        empty.classList.remove('hidden');
        list.classList.add('hidden');
        return;
    }

    empty.classList.add('hidden');
    list.classList.remove('hidden');
    list.innerHTML = connections.map(c => `
        <div class="bg-[#1C2333] border border-[#2A3347] p-4 rounded-xl flex items-center justify-between">
            <div class="flex items-center gap-3 min-w-0 cursor-pointer flex-1" onclick="openConnection('${c.id}')">
                <div class="w-9 h-9 rounded-lg bg-[#06B6D4]/10 border border-[#06B6D4]/30 flex items-center justify-center flex-shrink-0">
                    <svg class="w-4 h-4 text-[#06B6D4]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"></path></svg>
                </div>
                <div class="min-w-0">
                    <p class="text-white text-sm font-medium truncate">${escapeHtml(c.name)}</p>
                    <p class="text-[#64748B] text-xs mono truncate">${escapeHtml(c.supabase_url.replace('https://', ''))}</p>
                </div>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
                <button onclick="deleteConnection('${c.id}')" class="text-[#94A3B8] hover:text-red-400 p-2">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22"></path></svg>
                </button>
                <svg class="w-4 h-4 text-[#4F46E5]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
            </div>
        </div>
    `).join('');
}

async function createConnection() {
    const name = document.getElementById('connect-name').value.trim();
    const url = document.getElementById('connect-url').value.trim().replace(/\/$/, '');
    const key = document.getElementById('connect-key').value.trim();
    const errEl = document.getElementById('connect-error');
    const btn = document.getElementById('create-connect-btn');

    errEl.classList.add('hidden');
    if (!name || !url || !key) {
        errEl.textContent = 'All fields are required.';
        errEl.classList.remove('hidden'); return;
    }
    if (!canCreateConnection()) {
        errEl.textContent = 'Plan limit reached.';
        errEl.classList.remove('hidden'); return;
    }

    btn.innerText = 'Testing connection...'; btn.disabled = true;

    try {
        const testRes = await fetch(`${url}/rest/v1/profiles?select=id&limit=1`, {
            headers: getHeaders(key)
        });
        if (testRes.status >= 500) throw new Error(`Connection failed (${testRes.status}).`);
        if (testRes.status === 404) throw new Error('Endpoint not reachable. Check the URL.');
    } catch (err) {
        btn.innerText = 'Connect'; btn.disabled = false;
        errEl.textContent = err.message;
        errEl.classList.remove('hidden'); return;
    }

    const { error } = await supabaseClient.from('connected_databases').insert([{
        owner_id: currentUser.id, name,
        supabase_url: url, supabase_anon_key: key
    }]);

    btn.innerText = 'Connect'; btn.disabled = false;

    if (error) { errEl.textContent = error.message; errEl.classList.remove('hidden'); return; }

    closeConnectModal();
    await loadConnections();
}

async function deleteConnection(id) {
    if (!confirm('Delete this connection?')) return;
    const { error } = await supabaseClient.from('connected_databases').delete().eq('id', id);
    if (error) { alert(error.message); return; }
    await loadConnections();
}

// ============================================
// UKMTABLES — BROWSER
// ============================================

async function openConnection(id) {
    const conn = connectionsCache.find(c => c.id === id);
    if (!conn) return;
    activeConnection = conn;
    activeTable = null;
    activeSchema = null;

    const title = document.getElementById('ukmtables-title');
    const subtitle = document.getElementById('ukmtables-subtitle');
    const actionBtn = document.getElementById('ukmtables-action');
    const backBtn = document.getElementById('ukmtables-back');

    title.textContent = conn.name;
    subtitle.textContent = 'Reading schema...';
    actionBtn.innerText = '+ Refresh';
    actionBtn.onclick = () => openConnection(id);
    backBtn.classList.remove('hidden');

    document.getElementById('ukmtables-connections-view').classList.add('hidden');
    document.getElementById('ukmtables-browser').classList.remove('hidden');
    document.getElementById('ukmtables-rows').classList.add('hidden');
    document.getElementById('ukmtables-rows-empty').classList.add('hidden');
    document.getElementById('ukmtables-rows-loading').classList.remove('hidden');
    document.getElementById('ukmtables-pills').innerHTML = '';

    try {
        const res = await fetch(`${conn.supabase_url}/rest/v1/`, {
            headers: getHeaders(conn.supabase_anon_key)
        });

        let spec = null;
        if (res.ok) { try { spec = await res.json(); } catch (_) { spec = null; } }

        let tables = [];
        if (spec) {
            tables = Object.keys(spec.definitions || spec.components?.schemas || {}).sort();
        }

        if (tables.length === 0) {
            const candidates = ['profiles', 'projects', 'plans', 'payments', 'subscriptions', 'usage_metrics', 'waitlist', 'connected_databases'];
            for (const t of candidates) {
                try {
                    const r = await fetch(`${conn.supabase_url}/rest/v1/${t}?select=*&limit=1`, {
                        headers: getHeaders(conn.supabase_anon_key)
                    });
                    if (r.status === 200 || r.status === 206) tables.push(t);
                } catch (_) {}
            }
        }

        activeSchema = spec;
        subtitle.textContent = `${tables.length} tables`;

        if (tables.length === 0) {
            document.getElementById('ukmtables-rows-loading').classList.add('hidden');
            document.getElementById('ukmtables-rows-empty').classList.remove('hidden');
            document.getElementById('ukmtables-rows-empty').innerHTML = `
                <p class="text-[#94A3B8] text-sm">No tables found. Either the database is empty, RLS is blocking all reads, or the URL/key is wrong.</p>`;
            return;
        }

        document.getElementById('ukmtables-pills').innerHTML = tables.map(t => `
            <button onclick="selectTable('${t}')" data-table="${t}" class="table-pill bg-[#1C2333] border border-[#2A3347] text-[#94A3B8] text-xs px-3 py-1.5 rounded-lg mono">
                ${escapeHtml(t)}
            </button>
        `).join('');

        await selectTable(tables[0]);
    } catch (err) {
        subtitle.textContent = 'Error loading schema';
        document.getElementById('ukmtables-rows-loading').classList.add('hidden');
        document.getElementById('ukmtables-rows-empty').classList.remove('hidden');
        document.getElementById('ukmtables-rows-empty').innerHTML = `
            <p class="text-red-400 text-sm">${escapeHtml(err.message)}</p>`;
    }
}

function exitTableBrowser() {
    activeConnection = null;
    activeTable = null;
    activeSchema = null;
    document.getElementById('ukmtables-connections-view').classList.remove('hidden');
    document.getElementById('ukmtables-browser').classList.add('hidden');
    renderConnections(connectionsCache);
}

async function selectTable(tableName) {
    if (!activeConnection) return;
    activeTable = tableName;

    document.querySelectorAll('.table-pill').forEach(p => {
        if (p.dataset.table === tableName) p.classList.add('active');
        else p.classList.remove('active');
    });

    document.getElementById('ukmtables-rows').classList.add('hidden');
    document.getElementById('ukmtables-rows-empty').classList.add('hidden');
    document.getElementById('ukmtables-rows-loading').classList.remove('hidden');

    try {
        const res = await fetch(`${activeConnection.supabase_url}/rest/v1/${tableName}?select=*&limit=50`, {
            headers: getHeaders(activeConnection.supabase_anon_key)
        });

        document.getElementById('ukmtables-rows-loading').classList.add('hidden');

        if (!res.ok) throw new Error(`Failed to load rows (${res.status})`);

        const rows = await res.json();

        if (!rows || rows.length === 0) {
            document.getElementById('ukmtables-rows-empty').classList.remove('hidden');
            document.getElementById('ukmtables-rows-empty').innerHTML = `
                <p class="text-[#94A3B8] text-sm">No rows visible (or RLS is blocking reads on this table).</p>`;
            return;
        }

        renderRows(rows);
    } catch (err) {
        document.getElementById('ukmtables-rows-loading').classList.add('hidden');
        document.getElementById('ukmtables-rows-empty').classList.remove('hidden');
        document.getElementById('ukmtables-rows-empty').innerHTML = `
            <p class="text-red-400 text-sm">${escapeHtml(err.message)}</p>`;
    }
}

function renderRows(rows) {
    const container = document.getElementById('ukmtables-rows');
    container.classList.remove('hidden');

    container.innerHTML = rows.map((row, idx) => {
        const fields = Object.entries(row).map(([k, v]) => {
            let display;
            if (v === null || v === undefined) display = '<span class="text-[#64748B] italic">null</span>';
            else if (typeof v === 'object') display = escapeHtml(JSON.stringify(v));
            else display = escapeHtml(String(v));
            return `<div class="flex gap-2 py-1 text-xs"><span class="field-key mono flex-shrink-0">${escapeHtml(k)}:</span><span class="field-val mono flex-1">${display}</span></div>`;
        }).join('');

        const jsonStr = JSON.stringify(row).replace(/'/g, '&#39;').replace(/"/g, '&quot;');

        return `
            <div class="bg-[#1C2333] border border-[#2A3347] rounded-xl p-4">
                <div class="flex items-center justify-between mb-2 pb-2 border-b border-[#2A3347]">
                    <span class="text-[10px] uppercase font-bold text-[#4F46E5] mono">Row ${idx + 1}</span>
                    <button onclick="copyRow('${jsonStr}')" class="text-[10px] text-[#06B6D4] hover:text-white">Copy JSON</button>
                </div>
                <div class="space-y-0.5">${fields}</div>
            </div>
        `;
    }).join('');
}

function copyRow(jsonStr) {
    const clean = jsonStr.replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    navigator.clipboard.writeText(clean);
    alert('Row copied as JSON!');
}

// ============================================
// UTIL
// ============================================

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// ============================================
// INIT
// ============================================

async function init() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) showDashboardView(session.user);
    else showLandingView();
}

supabaseClient.auth.onAuthStateChange((event, session) => {
    if (session) showDashboardView(session.user);
    else showLandingView();
});

init();
