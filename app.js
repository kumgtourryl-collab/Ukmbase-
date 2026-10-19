// ============================================
// 1. CONFIG & STATE
// ============================================
const SUPABASE_URL = 'https://dwjyzqsrzdgnpwibnyjn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_4vcPyg62OqmfwNaHxx0CGA_a7O0_NJV';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const state = {
    currentUser: null, currentProfile: null, projectsCache: [], teamCache: [], chatHistory: [], 
    showingDashboardFor: null, inRecoveryMode: false, currentUkmDataProjectId: null, ukmDataSchema: null
};

const PLAN_LIMITS = {
    free: { projects: 2, connections: 3, repos: 1, seats: 1 }, pro: { projects: 20, connections: 20, repos: 10, seats: 1 },
    team: { projects: 100, connections: 100, repos: 50, seats: 3 }, staff: { projects: 999, connections: 999, repos: 999, seats: 999 }
};

// ============================================
// 2. UTILS
// ============================================
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container'); if (!container) return;
    const toast = document.createElement('div'); toast.className = 'toast ' + type; toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
}
function escapeHtml(str) { return str ? String(str).replace(/</g, '&lt;').replace(/>/g, '&gt;') : ''; }
function getLimits() { return PLAN_LIMITS[state.currentProfile?.plan || 'free'] || PLAN_LIMITS.free; }

// ============================================
// 3. NAVIGATION & THEME
// ============================================
function toggleTheme() {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    if (isLight) document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', 'light');
    const sun = document.getElementById('theme-icon-sun'); const moon = document.getElementById('theme-icon-moon');
    if (sun && moon) {
        if (isLight) { sun.classList.add('hidden'); moon.classList.remove('hidden'); }
        else { sun.classList.remove('hidden'); moon.classList.add('hidden'); }
    }
}

function showLandingView() { 
    document.getElementById('landing-view').classList.remove('hidden'); 
    document.getElementById('auth-view').classList.add('hidden'); 
    document.getElementById('dashboard-view').classList.add('hidden'); 
}
function showAuthView() { 
    document.getElementById('landing-view').classList.add('hidden'); 
    document.getElementById('auth-view').classList.remove('hidden'); 
    document.getElementById('dashboard-view').classList.add('hidden'); 
}
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('-translate-x-full'); }
function switchView(view) {
    const views = ['overview', 'ukmai', 'ukmquery', 'ukmsync', 'ukmdata', 'ukmtables', 'connect', 'ukmpay', 'team', 'billing', 'settings'];
    views.forEach(v => {
        const el = document.getElementById('view-' + v); const nav = document.getElementById('nav-' + v);
        if (el) v === view ? el.classList.remove('hidden') : el.classList.add('hidden');
        if (nav) {
            if (v === view) { nav.classList.add('sidebar-active'); nav.style.color = 'var(--text)'; }
            else { nav.classList.remove('sidebar-active'); nav.style.color = 'var(--text-muted)'; }
        }
    });
    document.getElementById('sidebar').classList.add('-translate-x-full');
    if (view === 'ukmdata') populateUkmDataProjectSelect();
}

// ============================================
// 4. AUTH
// ============================================
function setAuthMode(mode) {
    const isSignup = mode === 'signup';
    document.getElementById('field-fullname').classList.toggle('hidden', !isSignup);
    document.getElementById('field-confirm').classList.toggle('hidden', !isSignup);
    document.getElementById('auth-submit').textContent = isSignup ? 'Create Account' : 'Sign In';
}
async function handleAuthSubmit() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const isSignup = document.getElementById('auth-submit').textContent === 'Create Account';
    
    const { data, error } = isSignup 
        ? await supabaseClient.auth.signUp({ email, password })
        : await supabaseClient.auth.signInWithPassword({ email, password });
        
    if (error) return showToast(error.message, 'error');
    if (data.user && !data.session) return showToast('Check email to confirm account', 'success');
    showDashboardView(data.user || data.session.user);
}
async function showDashboardView(user) {
    document.getElementById('landing-view').classList.add('hidden'); 
    document.getElementById('auth-view').classList.add('hidden'); 
    document.getElementById('dashboard-view').classList.remove('hidden');
    state.currentUser = user;
    document.getElementById('user-email').textContent = user.email;
    
    const { data } = await supabaseClient.from('projects').select('*').order('created_at', { ascending: false });
    state.projectsCache = data || [];
    renderProjects();
}

// ============================================
// 5. PROJECTS
// ============================================
function renderProjects() {
    const grid = document.getElementById('projects-grid'); const empty = document.getElementById('empty-state');
    if (state.projectsCache.length === 0) { empty.classList.remove('hidden'); grid.classList.add('hidden'); return; }
    empty.classList.add('hidden'); grid.classList.remove('hidden');
    grid.innerHTML = state.projectsCache.map(p => `
        <div class="rounded-xl p-5" style="background: var(--surface); border: 1px solid var(--border);">
            <h3 class="font-bold text-white">${escapeHtml(p.name)}</h3>
            <p class="text-xs text-[var(--text-muted)]">${escapeHtml(p.slug)}</p>
        </div>
    `).join('');
}
function openProjectModal() { document.getElementById('project-modal').classList.remove('hidden'); }
function closeProjectModal() { document.getElementById('project-modal').classList.add('hidden'); }
async function createProject() {
    const name = document.getElementById('project-name').value;
    if (!name) return showToast('Name required', 'error');
    const slug = name.toLowerCase().replace(/\s+/g, '-');
    await supabaseClient.from('projects').insert([{ owner_id: state.currentUser.id, name, slug, status: 'active' }]);
    closeProjectModal(); showDashboardView(state.currentUser); showToast('Project created!');
}

// ============================================
// 6. UKMBASE DATA (LITE)
// ============================================
function populateUkmDataProjectSelect() {
    const sel = document.getElementById('ukmdata-project-select'); if (!sel) return;
    if (state.projectsCache.length === 0) { 
        document.getElementById('ukmdata-empty').classList.remove('hidden'); 
        document.getElementById('ukmdata-panel').classList.add('hidden'); 
        return; 
    }
    document.getElementById('ukmdata-empty').classList.add('hidden');
    sel.innerHTML = state.projectsCache.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
    onUkmDataProjectChange();
}
async function onUkmDataProjectChange() {
    const sel = document.getElementById('ukmdata-project-select'); if (!sel || !sel.value) return;
    state.currentUkmDataProjectId = sel.value; 
    document.getElementById('ukmdata-panel').classList.remove('hidden');
    
    const { data } = await supabaseClient.from('project_schemas').select('*').eq('project_id', state.currentUkmDataProjectId).maybeSingle();
    if (!data) {
        state.ukmDataSchema = null;
        document.getElementById('ukmdata-enable-card').classList.remove('hidden');
        document.getElementById('ukmdata-tables-card').classList.add('hidden');
    } else {
        state.ukmDataSchema = data.schema_name;
        document.getElementById('ukmdata-enable-card').classList.add('hidden');
        document.getElementById('ukmdata-tables-card').classList.remove('hidden');
        document.getElementById('ukmdata-tables-list').innerHTML = `<p class="text-sm">Schema: ${state.ukmDataSchema}</p>`;
    }
}
async function enableUkmData() {
    if (!state.currentUkmDataProjectId) return;
    const btn = document.getElementById('ukmdata-enable-btn'); btn.textContent = 'Enabling...';
    const { data: { session } } = await supabaseClient.auth.getSession();
    const res = await fetch(SUPABASE_URL + '/functions/v1/ukmdata', { 
        method: 'POST', headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ action: 'enable', project_id: state.currentUkmDataProjectId }) 
    });
    const data = await res.json();
    if (data.error) return showToast(data.error, 'error');
    showToast('Ukmbase Data enabled!'); onUkmDataProjectChange();
}

// ============================================
// 7. AI CHAT
// ============================================
async function sendChat() {
    const input = document.getElementById('chat-input'); const prompt = input.value.trim(); if (!prompt) return;
    input.value = ''; 
    document.getElementById('chat-messages').innerHTML += `<div class="text-right text-sm text-white mb-2">${escapeHtml(prompt)}</div>`;
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        const res = await fetch(SUPABASE_URL + '/functions/v1/ukmai', {
            method: 'POST', headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, mode: 'default' })
        });
        const data = await res.json();
        document.getElementById('chat-messages').innerHTML += `<div class="text-sm text-[var(--cyan)] mb-2">${DOMPurify.sanitize(marked.parse(data.content || data.error))}</div>`;
    } catch (e) { showToast(e.message, 'error'); }
}
function handleChatKeydown(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } }

// ============================================
// 8. LANDING DEMO
// ============================================
let demoRunning = false;
function runLandingDemo() {
    if (demoRunning) return;
    const input = document.getElementById('demo-prompt').value.toLowerCase();
    const btn = document.getElementById('demo-btn'); const output = document.getElementById('demo-output'); const cta = document.getElementById('demo-cta');
    demoRunning = true; btn.innerHTML = 'Thinking...'; output.classList.remove('hidden'); cta.classList.add('hidden');
    output.innerHTML = '<span style="color: #64748B;">Generating...</span>';
    
    setTimeout(() => {
        const response = input.includes('shop') 
            ? `CREATE TABLE products (\n  id UUID PRIMARY KEY,\n  name TEXT NOT NULL,\n  price DECIMAL(10,2)\n);` 
            : `CREATE TABLE users (\n  id UUID PRIMARY KEY,\n  name TEXT NOT NULL,\n  email TEXT UNIQUE\n);\n\nCREATE TABLE bookings (\n  id UUID PRIMARY KEY,\n  user_id UUID REFERENCES users(id),\n  date TIMESTAMPTZ\n);`;
        output.innerHTML = ''; let i = 0;
        function typeWriter() {
            if (i < response.length) { output.innerHTML += response.charAt(i); i++; setTimeout(typeWriter, 10); } 
            else { demoRunning = false; btn.innerHTML = 'Generate'; cta.classList.remove('hidden'); }
        }
        typeWriter();
    }, 1000);
}

// ============================================
// 9. INIT & AUTH LISTENER
// ============================================
async function init() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) showDashboardView(session.user); else showLandingView();
}

supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        if (session) showDashboardView(session.user);
        else showLandingView();
    }
});

// START THE APP
init();
