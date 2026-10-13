// ============================================
// UKMBASE APP LOGIC
// ============================================

const SUPABASE_URL = 'https://dwjyzqsrzdgnpwibnyjn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_4vcPyg62OqmfwNaHxx0CGA_a7O0_NJV';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const landingView = document.getElementById('landing-view');
const authView = document.getElementById('auth-view');
const dashboardView = document.getElementById('dashboard-view');
const userEmailDisplay = document.getElementById('user-email');

let currentUser = null;
let chatHistory = [];

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
    if (user && user.email) userEmailDisplay.textContent = user.email;
    currentUser = user;
    loadProjects();
    switchView('overview');
}

function switchView(view) {
    const overview = document.getElementById('view-overview');
    const ukmai = document.getElementById('view-ukmai');
    const navOverview = document.getElementById('nav-overview');
    const navUkmai = document.getElementById('nav-ukmai');

    if (view === 'ukmai') {
        overview.classList.add('hidden');
        ukmai.classList.remove('hidden');
        navUkmai.classList.add('sidebar-active', 'text-white');
        navUkmai.classList.remove('text-[#94A3B8]');
        navOverview.classList.remove('sidebar-active', 'text-white');
        navOverview.classList.add('text-[#94A3B8]');
        setTimeout(() => document.getElementById('chat-input').focus(), 100);
    } else {
        overview.classList.remove('hidden');
        ukmai.classList.add('hidden');
        navOverview.classList.add('sidebar-active', 'text-white');
        navOverview.classList.remove('text-[#94A3B8]');
        navUkmai.classList.remove('sidebar-active', 'text-white');
        navUkmai.classList.add('text-[#94A3B8]');
    }
    document.getElementById('sidebar').classList.add('-translate-x-full');
}

// ============================================
// AUTH
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
    } else if (data.session) {
        showDashboardView(data.user);
    } else {
        succEl.textContent = 'Account created! Check your email for the confirmation link.';
        succEl.classList.remove('hidden');
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
    document.getElementById('project-slug').value = name
        .toLowerCase().trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
}

async function loadProjects() {
    if (!currentUser) return;
    const { data, error } = await supabaseClient
        .from('projects').select('*')
        .order('created_at', { ascending: false });

    if (error) { console.error(error.message); return; }
    renderProjects(data || []);
    updateStats(data || []);
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
                <span class="mono">${(p.ai_tokens_used || 0).toLocaleString()} tokens</span>
            </div>
        </div>
    `).join('');
}

function updateStats(projects) {
    const totalTokens = projects.reduce((s, p) => s + (Number(p.ai_tokens_used) || 0), 0);
    const totalSyncs = projects.reduce((s, p) => s + (Number(p.sync_ops_used) || 0), 0);
    const totalStorage = projects.reduce((s, p) => s + (Number(p.storage_bytes) || 0), 0);

    const tEl = document.getElementById('stat-tokens');
    const sEl = document.getElementById('stat-syncs');
    const stEl = document.getElementById('stat-storage');

    if (tEl) tEl.innerHTML = `${totalTokens.toLocaleString()} <span class="text-xs text-[#64748B] font-normal">/ 100k</span>`;
    if (sEl) sEl.textContent = totalSyncs.toLocaleString();
    if (stEl) stEl.innerHTML = `${(totalStorage / 1024 / 1024).toFixed(2)} <span class="text-xs text-[#64748B] font-normal">MB</span>`;
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
        name, slug,
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
// UKMAI CHAT
// ============================================

function handleChatKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChat();
    }
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

    input.value = '';
    input.style.height = 'auto';
    sendBtn.disabled = true;

    appendMessage('user', prompt);
    const typingId = appendTypingIndicator();

    try {
        const { data: { session } } = await supabaseClient.auth.getSession();

        const res = await fetch(`${SUPABASE_URL}/functions/v1/ukmai`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${session.access_token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ prompt })
        });

        const data = await res.json();
        removeTypingIndicator(typingId);

        if (data.error) {
            appendMessage('ai', `**Error:** ${data.error}`);
        } else {
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
    // Clear the welcome state on first message
    if (container.querySelector('.text-center')) {
        container.innerHTML = '';
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'flex gap-3 max-w-3xl mx-auto';

    if (role === 'user') {
        wrapper.className += ' flex-row-reverse';
        wrapper.innerHTML = `
            <div class="w-8 h-8 rounded-lg bg-[#4F46E5]/20 border border-[#4F46E5]/40 flex items-center justify-center flex-shrink-0">
                <svg class="w-4 h-4 text-[#4F46E5]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
            </div>
            <div class="bg-[#4F46E5] text-white rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[80%] text-sm">${escapeHtml(content)}</div>
        `;
    } else {
        wrapper.innerHTML = `
            <div class="w-8 h-8 rounded-lg bg-[#F59E0B]/20 border border-[#F59E0B]/40 flex items-center justify-center flex-shrink-0">
                <svg class="w-4 h-4 text-[#F59E0B]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"></path></svg>
            </div>
            <div class="bg-[#1C2333] border border-[#2A3347] text-[#F8FAFC] rounded-2xl rounded-tl-sm px-4 py-3 max-w-[85%] text-sm chat-message">${marked.parse(content)}</div>
        `;
    }

    container.appendChild(wrapper);

    // Highlight code blocks + add copy buttons
    wrapper.querySelectorAll('pre code').forEach(block => {
        hljs.highlightElement(block);
    });

    wrapper.querySelectorAll('pre').forEach(pre => {
        const btn = document.createElement('button');
        btn.className = 'copy-btn';
        btn.innerText = 'Copy';
        btn.onclick = () => {
            navigator.clipboard.writeText(pre.querySelector('code').innerText);
            btn.innerText = 'Copied!';
            setTimeout(() => btn.innerText = 'Copy', 1500);
        };
        pre.style.position = 'relative';
        pre.appendChild(btn);
    });

    container.scrollTop = container.scrollHeight;
}

function appendTypingIndicator() {
    const container = document.getElementById('chat-messages');
    if (container.querySelector('.text-center')) container.innerHTML = '';

    const id = 'typing-' + Date.now();
    const wrapper = document.createElement('div');
    wrapper.id = id;
    wrapper.className = 'flex gap-3 max-w-3xl mx-auto';
    wrapper.innerHTML = `
        <div class="w-8 h-8 rounded-lg bg-[#F59E0B]/20 border border-[#F59E0B]/40 flex items-center justify-center flex-shrink-0">
            <svg class="w-4 h-4 text-[#F59E0B]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"></path></svg>
        </div>
        <div class="bg-[#1C2333] border border-[#2A3347] rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1">
            <span class="typing-dot w-2 h-2 bg-[#94A3B8] rounded-full"></span>
            <span class="typing-dot w-2 h-2 bg-[#94A3B8] rounded-full"></span>
            <span class="typing-dot w-2 h-2 bg-[#94A3B8] rounded-full"></span>
        </div>
    `;
    container.appendChild(wrapper);
    container.scrollTop = container.scrollHeight;
    return id;
}

function removeTypingIndicator(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

function clearChat() {
    document.getElementById('chat-messages').innerHTML = `
        <div class="text-center py-8">
            <div class="w-12 h-12 mx-auto mb-3 rounded-xl bg-[#F59E0B]/10 border border-[#F59E0B]/30 flex items-center justify-center">
                <svg class="w-6 h-6 text-[#F59E0B]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"></path></svg>
            </div>
            <h3 class="text-white font-bold mb-1">Chat cleared</h3>
            <p class="text-[#94A3B8] text-xs">Describe your next app.</p>
        </div>
    `;
    chatHistory = [];
}

// ============================================
// UTIL
// ============================================

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
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
