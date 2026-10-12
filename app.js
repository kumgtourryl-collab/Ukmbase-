// ============================================
// UKMBASE APP LOGIC
// ============================================

const SUPABASE_URL = 'https://dwjyzqsrzdgnpwibnyjn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_4vcPyg62OqmfwNaHxx0CGA_a7O0_NJV';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// View Elements
const landingView = document.getElementById('landing-view');
const authView = document.getElementById('auth-view');
const dashboardView = document.getElementById('dashboard-view');
const userEmailDisplay = document.getElementById('user-email');

let currentUser = null;

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
}

function showDashboardView(user) {
    landingView.classList.add('hidden');
    authView.classList.add('hidden');
    dashboardView.classList.remove('hidden');
    if (user && user.email) {
        userEmailDisplay.textContent = user.email;
    }
    currentUser = user;
    loadProjects();
}

// ============================================
// AUTH LOGIC
// ============================================

async function handleLogin() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const errEl = document.getElementById('auth-error');
    const succEl = document.getElementById('auth-success');
    errEl.classList.add('hidden'); succEl.classList.add('hidden');

    if (!email || !password) {
        errEl.textContent = 'Please fill in all fields.';
        errEl.classList.remove('hidden');
        return;
    }

    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) {
        errEl.textContent = error.message;
        errEl.classList.remove('hidden');
    } else {
        showDashboardView(data.user);
    }
}

async function handleSignup() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const errEl = document.getElementById('auth-error');
    const succEl = document.getElementById('auth-success');
    errEl.classList.add('hidden'); succEl.classList.add('hidden');

    if (!email || !password) {
        errEl.textContent = 'Please fill in all fields.';
        errEl.classList.remove('hidden');
        return;
    }

    const { data, error } = await supabaseClient.auth.signUp({ email, password });
    if (error) {
        errEl.textContent = error.message;
        errEl.classList.remove('hidden');
    } else {
        if (data.session) {
            showDashboardView(data.user);
        } else {
            succEl.textContent = 'Account created! Check your email for the confirmation link.';
            succEl.classList.remove('hidden');
        }
    }
}

async function handleLogout() {
    await supabaseClient.auth.signOut();
    currentUser = null;
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

    const { error } = await supabaseClient.from('waitlist').insert([{ email: email }]);

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
// PROJECT MODAL
// ============================================

function openProjectModal() {
    document.getElementById('project-modal').classList.remove('hidden');
    document.getElementById('modal-error').classList.add('hidden');
    document.getElementById('project-name').value = '';
    document.getElementById('project-slug').value = '';
    document.getElementById('project-description').value = '';
}

function closeProjectModal() {
    document.getElementById('project-modal').classList.add('hidden');
}

function autoSlug() {
    const name = document.getElementById('project-name').value;
    const slug = name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
    document.getElementById('project-slug').value = slug;
}

// ============================================
// PROJECTS
// ============================================

async function loadProjects() {
    if (!currentUser) return;

    const { data, error } = await supabaseClient
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Failed to load projects:', error.message);
        return;
    }

    renderProjects(data || []);
    updateStats(data || []);
}

function renderProjects(projects) {
    const emptyState = document.getElementById('empty-state');
    const projectsGrid = document.getElementById('projects-grid');

    if (!projects || projects.length === 0) {
        emptyState.classList.remove('hidden');
        if (projectsGrid) projectsGrid.classList.add('hidden');
        return;
    }

    emptyState.classList.add('hidden');

    // Build the grid if it doesn't exist
    let grid = document.getElementById('projects-grid');
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
                    <svg class="w-5 h-5 text-[#4F46E5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
                    </svg>
                </div>
                <span class="text-[10px] font-bold uppercase tracking-wider text-[#06B6D4] bg-[#06B6D4]/10 px-2 py-1 rounded">${p.status || 'active'}</span>
            </div>
            <h3 class="font-bold text-white mb-1 truncate">${escapeHtml(p.name)}</h3>
            <p class="text-[#94A3B8] text-xs mono mb-3 truncate">${escapeHtml(p.slug)}</p>
            <p class="text-[#94A3B8] text-sm line-clamp-2 mb-4">${escapeHtml(p.description || 'No description yet.')}</p>
            <div class="flex items-center justify-between text-[10px] text-[#64748B]">
                <span>${new Date(p.created_at).toLocaleDateString()}</span>
                <span class="mono">${(p.ai_tokens_used || 0).toLocaleString()} tokens</span>
            </div>
        </div>
    `).join('');
}

function updateStats(projects) {
    const totalTokens = projects.reduce((sum, p) => sum + (Number(p.ai_tokens_used) || 0), 0);
    const totalSyncs = projects.reduce((sum, p) => sum + (Number(p.sync_ops_used) || 0), 0);
    const totalStorage = projects.reduce((sum, p) => sum + (Number(p.storage_bytes) || 0), 0);

    const tokenEl = document.getElementById('stat-tokens');
    const syncEl = document.getElementById('stat-syncs');
    const storageEl = document.getElementById('stat-storage');

    if (tokenEl) tokenEl.innerHTML = `${totalTokens.toLocaleString()} <span class="text-xs text-[#64748B] font-normal">/ 100k</span>`;
    if (syncEl) syncEl.textContent = totalSyncs.toLocaleString();
    if (storageEl) storageEl.innerHTML = `${(totalStorage / 1024 / 1024).toFixed(2)} <span class="text-xs text-[#64748B] font-normal">MB</span>`;
}

async function createProject() {
    const name = document.getElementById('project-name').value.trim();
    const slug = document.getElementById('project-slug').value.trim();
    const description = document.getElementById('project-description').value.trim();
    const errEl = document.getElementById('modal-error');
    const btn = document.getElementById('create-project-btn');

    errEl.classList.add('hidden');

    if (!name || !slug) {
        errEl.textContent = 'Project name is required.';
        errEl.classList.remove('hidden');
        return;
    }

    btn.innerText = 'Forging...';
    btn.disabled = true;

    const { error } = await supabaseClient.from('projects').insert([{
        owner_id: currentUser.id,
        name: name,
        slug: slug,
        description: description || null,
        status: 'active'
    }]);

    btn.innerText = 'Forge Project';
    btn.disabled = false;

    if (error) {
        errEl.textContent = error.message.includes('duplicate')
            ? 'That slug is already taken. Try a different name.'
            : error.message;
        errEl.classList.remove('hidden');
        return;
    }

    closeProjectModal();
    await loadProjects();
}

// ============================================
// UTIL
// ============================================

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ============================================
// INIT
// ============================================

async function init() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        showDashboardView(session.user);
    } else {
        showLandingView();
    }
}

supabaseClient.auth.onAuthStateChange((event, session) => {
    if (session) showDashboardView(session.user);
    else showLandingView();
});

init();
