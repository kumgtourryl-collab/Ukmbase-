// app.js - The Core Module Glue

// 1. Imports from your /js folder
import { SUPABASE_URL, SUPABASE_ANON_KEY, PLAN_LIMITS, STAFF_ROLES, SUPPORT_EMAIL, SUPPORT_WA_INTL } from './js/config.js';
import { showToast, escapeHtml } from './js/utils.js';
import { state } from './js/state.js';
import * as Auth from './js/auth.js';
import * as Projects from './js/projects.js';
import * as UkmData from './js/ukmdata.js';
import * as Database from './js/database.js';
import * as Billing from './js/billing.js';
import * as AI from './js/ai.js';

// 2. Initialize Supabase globally so all modules can use window.supabaseClient
window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 3. Global Error Catcher
let jsErrorBanner = null; let jsErrorTimer = null;
window.onerror = function(msg, url, line) {
    if (!jsErrorBanner) {
        jsErrorBanner = document.createElement('div');
        jsErrorBanner.id = 'js-error-banner';
        jsErrorBanner.style.cssText = 'position:fixed;bottom:10px;left:10px;right:10px;background:rgba(239,68,68,0.95);color:white;padding:12px;z-index:999999;font-size:12px;border-radius:8px;font-family:monospace;box-shadow:0 4px 20px rgba(0,0,0,0.4);';
        document.body.appendChild(jsErrorBanner);
    }
    jsErrorBanner.innerHTML = '<strong>JS Error:</strong> ' + msg + '<br><span style="font-size:10px;">Line ' + line + ' - ' + url + '</span>';
    clearTimeout(jsErrorTimer);
    jsErrorTimer = setTimeout(function() { if (jsErrorBanner) { jsErrorBanner.remove(); jsErrorBanner = null; } }, 10000);
    return false;
};

// 4. Limits & Permissions Helpers
window.getLimits = function() {
    if (state.currentProfile && STAFF_ROLES.indexOf(state.currentProfile.role) !== -1) return PLAN_LIMITS.staff;
    const plan = (state.currentProfile && state.currentProfile.plan) || 'free';
    return PLAN_LIMITS[plan] || PLAN_LIMITS.free;
};
window.canCreateProject = function() { return state.projectsCache.length < window.getLimits().projects; };
window.canCreateConnection = function() { return state.connectionsCache.length < window.getLimits().connections; };
window.getTeamSeatsUsed = function() { return 1 + state.teamCache.filter(m => m.status === 'active').length; };

// 5. Core UI & Routing
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

function showLandingView() {
    state.showingDashboardFor = null;
    document.getElementById('landing-view').classList.remove('hidden');
    document.getElementById('auth-view').classList.add('hidden');
    document.getElementById('dashboard-view').classList.add('hidden');
    document.querySelectorAll('[id^="public-"]').forEach(el => el.classList.add('hidden'));
}

function showAuthView() {
    document.getElementById('landing-view').classList.add('hidden');
    document.getElementById('auth-view').classList.remove('hidden');
    document.getElementById('dashboard-view').classList.add('hidden');
    Auth.setAuthMode('login');
}

async function showDashboardView(user) {
    if (!user || state.inRecoveryMode) return;
    if (state.showingDashboardFor === user.id && !document.getElementById('dashboard-view').classList.contains('hidden')) return;
    
    state.showingDashboardFor = user.id;
    document.getElementById('landing-view').classList.add('hidden'); 
    document.getElementById('auth-view').classList.add('hidden'); 
    document.getElementById('dashboard-view').classList.remove('hidden');
    
    if (user.email) document.getElementById('user-email').textContent = user.email;
    state.currentUser = user;
    
    await Auth.loadProfile(); 
    await Projects.loadTeam(); 
    await Projects.loadProjects();
    
    // Set the top-right upgrade pill
    const planNameEl = document.getElementById('nav-plan-name');
    if (planNameEl && state.currentProfile) {
        planNameEl.textContent = (state.currentProfile.plan || 'free').toUpperCase() + ' Plan';
    }

    window.loadPayments(); 
    window.loadPlans();
    Database.loadConnections().then(() => Database.populateQueryConnections());
    window.loadMyUpgradeRequests(); 
    window.loadQueryHistory(); 
    Projects.checkForPendingInvites(); 
    
    switchView('overview');
}

function switchView(view) {
    const views = ['overview', 'ukmai', 'ukmquery', 'ukmsync', 'ukmdata', 'ukmtables', 'connect', 'ukmpay', 'team', 'billing', 'settings', 'owner'];
    views.forEach(v => {
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
    if (view === 'ukmpay') { window.loadPayments(); window.loadPlans(); }
    if (view === 'ukmtables') { Database.loadConnections(); }
    if (view === 'ukmquery') { Database.loadConnections().then(() => { Database.populateQueryConnections(); window.loadQueryHistory(); }); }
    if (view === 'ukmsync') { Database.populateSyncProjectSelect(); }
    if (view === 'ukmdata') { UkmData.populateUkmDataProjectSelect(); }
    if (view === 'connect') { Database.populateConnectProjectSelect(); }
    if (view === 'team') { window.renderTeam(); }
    if (view === 'settings') { Auth.renderSettings(); }
    if (view === 'billing') { Billing.renderBilling(); }
    if (view === 'owner') { window.loadOwnerConsole(); }
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.add('-translate-x-full');
}

function toggleSidebar() { document.getElementById('sidebar').classList.toggle('-translate-x-full'); }

// 6. Landing Page AI Demo
const DEMO_RESPONSES = {
    "salon": `-- 🪄 Ukmbase AI generated this schema in 0.8s
CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name TEXT NOT NULL,
  service TEXT NOT NULL,
  appointment_time TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS enabled automatically
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- Public Form Endpoint generated
-- https://api.ukmbase.com/form/salon-booking`,
    "shop": `-- 🪄 Ukmbase AI generated this schema in 0.9s
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  inventory_count INT DEFAULT 0,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_email TEXT NOT NULL,
  total_amount DECIMAL(10,2),
  status TEXT DEFAULT 'cart',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Stripe & EcoCash hooks attached.`,
    "default": `-- 🪄 Ukmbase AI generated this schema in 1.1s
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role TEXT DEFAULT 'user',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES users(id),
  title TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Real-time sync enabled. Offline-first ready.`
};

let demoRunning = false;
window.runLandingDemo = async function() {
    if (demoRunning) return;
    const input = document.getElementById('demo-prompt').value.toLowerCase();
    const btn = document.getElementById('demo-btn');
    const output = document.getElementById('demo-output');
    const cta = document.getElementById('demo-cta');
    
    demoRunning = true;
    btn.innerHTML = 'Thinking...'; btn.disabled = true;
    output.classList.remove('hidden');
    output.innerHTML = '<span style="color: #64748B;">Scanning prompt... analyzing entities... generating Postgres schema...</span>';
    cta.classList.add('hidden');

    setTimeout(() => {
        let response = DEMO_RESPONSES.default;
        if (input.includes('salon') || input.includes('book') || input.includes('hair')) response = DEMO_RESPONSES.salon;
        if (input.includes('shop') || input.includes('store') || input.includes('product')) response = DEMO_RESPONSES.shop;
        
        output.innerHTML = '';
        let i = 0;
        const speed = 10;
        
        function typeWriter() {
            if (i < response.length) {
                output.innerHTML += response.charAt(i);
                i++; output.scrollTop = output.scrollHeight;
                setTimeout(typeWriter, speed);
            } else {
                demoRunning = false; btn.innerHTML = 'Generate'; btn.disabled = false;
                cta.classList.remove('hidden');
            }
        }
        typeWriter();
    }, 1200);
};
document.getElementById('demo-prompt')?.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') window.runLandingDemo();
});


// ============================================
// 7. WINDOW BINDINGS (Moved ABOVE init to prevent race conditions)
// ============================================

// Core UI
window.toggleSidebar = toggleSidebar;
window.switchView = switchView;
window.showToast = showToast;
window.toggleTheme = toggleTheme;
window.showLandingView = showLandingView;
window.showAuthView = showAuthView;

// Auth & Profile
window.setAuthMode = Auth.setAuthMode;
window.handleAuthSubmit = Auth.handleAuthSubmit;
window.handleLogout = Auth.handleLogout;
window.saveProfile = Auth.saveProfile;
window.signInWithProvider = Auth.signInWithProvider;
window.updateStrength = Auth.updateStrength;
window.togglePassword = Auth.togglePassword;
window.showForgotPasswordView = Auth.showForgotPasswordView;
window.hideForgotPasswordView = Auth.hideForgotPasswordView;
window.sendPasswordReset = Auth.sendPasswordReset;
window.updatePassword = Auth.updatePassword;
window.showNewPasswordView = Auth.showNewPasswordView;
window.renderSettings = Auth.renderSettings;

// Projects & Team
window.openProjectModal = () => document.getElementById('project-modal').classList.remove('hidden');
window.closeProjectModal = () => document.getElementById('project-modal').classList.add('hidden');
window.autoSlug = () => document.getElementById('project-slug').value = document.getElementById('project-name').value.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');
window.createProject = Projects.createProject;
window.openProjectDetail = Projects.openProjectDetail;
window.closeProjectDetail = () => document.getElementById('project-detail-modal').classList.add('hidden');
window.openProjectEdit = Projects.openProjectEdit;
window.closeProjectEdit = () => document.getElementById('project-edit-modal').classList.add('hidden');
window.saveProjectEdit = Projects.saveProjectEdit;
window.deleteProject = Projects.deleteProject;
window.acceptTeamInvite = Projects.acceptTeamInvite;
window.declineTeamInvite = Projects.declineTeamInvite;
window.renderTeam = Projects.renderTeam;
window.sendTeamInvite = Projects.sendTeamInvite;
window.removeTeamMember = Projects.removeTeamMember;
window.cancelInvite = Projects.cancelInvite;

// AI
window.sendChat = AI.sendChat;
window.clearChat = AI.clearChat;
window.sendPrompt = AI.sendPrompt;
window.handleChatKeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); AI.sendChat(); } };

// UkmData (Data Engine)
window.populateUkmDataProjectSelect = UkmData.populateUkmDataProjectSelect;
window.onUkmDataProjectChange = UkmData.onUkmDataProjectChange;
window.enableUkmData = UkmData.enableUkmData;
window.copyUkmDataConnection = UkmData.copyUkmDataConnection;
window.loadUkmDataTables = UkmData.loadUkmDataTables;
window.openCreateTableModal = UkmData.openCreateTableModal;
window.closeCreateTableModal = UkmData.closeCreateTableModal;
window.addColumnRow = UkmData.addColumnRow;
window.createUkmDataTable = UkmData.createUkmDataTable;
window.toggleTableRLS = UkmData.toggleTableRLS;
window.toggleTableRealtime = UkmData.toggleTableRealtime;
window.dropUkmDataTable = UkmData.dropUkmDataTable;
window.viewTableData = UkmData.viewTableData;
window.openEditRowModal = UkmData.openEditRowModal;
window.saveRowChanges = UkmData.saveRowChanges;
window.deleteTableRow = UkmData.deleteTableRow;
window.exportTableCSV = UkmData.exportTableCSV;
window.openChartModal = UkmData.openChartModal;
window.renderChart = UkmData.renderChart;
window.executeRawSQL = UkmData.executeRawSQL;
window.handleCsvUpload = UkmData.handleCsvUpload;
window.exportProjectData = UkmData.exportProjectData;
window.handleProjectImport = UkmData.handleProjectImport;
window.loadUkmDataUsers = UkmData.loadUkmDataUsers;
window.deleteUkmDataUser = UkmData.deleteUkmDataUser;
window.openImpersonateModal = UkmData.openImpersonateModal;
window.executeImpersonation = UkmData.executeImpersonation;
window.generateAuthSnippet = UkmData.generateAuthSnippet;
window.copyAuthSnippet = UkmData.copyAuthSnippet;
window.generateAuthUI = UkmData.generateAuthUI;
window.runAuthTest = UkmData.runAuthTest;
window.loadApiKeys = UkmData.loadApiKeys;
window.generateApiKey = UkmData.generateApiKey;
window.revokeApiKey = UkmData.revokeApiKey;
window.loadProjectPages = UkmData.loadProjectPages;
window.createProjectPage = UkmData.createProjectPage;
window.loadCronJobs = UkmData.loadCronJobs;
window.createCronJob = UkmData.createCronJob;
window.deleteCronJob = UkmData.deleteCronJob;
window.loadUkmDataWebhooks = UkmData.loadUkmDataWebhooks;
window.createWebhook = UkmData.createWebhook;
window.deleteWebhook = UkmData.deleteWebhook;
window.loadEmailLogs = UkmData.loadEmailLogs;
window.sendTestEmail = UkmData.sendTestEmail;
window.loadActivityLogs = UkmData.loadActivityLogs;
window.loadUkmDataFiles = UkmData.loadUkmDataFiles;
window.uploadUkmDataFile = UkmData.uploadUkmDataFile;
window.deleteUkmDataFile = UkmData.deleteUkmDataFile;
window.copyStorageSnippet = UkmData.copyStorageSnippet;
window.showTableApi = UkmData.showTableApi;
window.copyApiSnippet = UkmData.copyApiSnippet;
window.openSeedDataModal = UkmData.openSeedDataModal;
window.generateAndSeedData = UkmData.generateAndSeedData;

// Database (UkmTables / UkmQuery / UkmSync)
window.loadConnections = Database.loadConnections;
window.populateConnectProjectSelect = Database.populateConnectProjectSelect;
window.switchConnectTab = Database.switchConnectTab;
window.renderConnectSnippets = Database.renderConnectSnippets;
window.openConnectModal = Database.openConnectModal;
window.closeConnectModal = Database.closeConnectModal;
window.createConnection = Database.createConnection;
window.deleteConnection = Database.deleteConnection;
window.openConnection = Database.openConnection;
window.exitTableBrowser = Database.exitTableBrowser;
window.selectTable = Database.selectTable;
window.copyRow = Database.copyRow;
window.populateQueryConnections = Database.populateQueryConnections;
window.setQueryPrompt = Database.setQueryPrompt;
window.generateSQL = Database.generateSQL;
window.copyGeneratedSQL = Database.copyGeneratedSQL;
window.loadQueryHistory = Database.loadQueryHistory;
window.loadHistoryItem = Database.loadHistoryItem;
window.populateSyncProjectSelect = Database.populateSyncProjectSelect;
window.onSyncProjectChange = Database.onSyncProjectChange;
window.toggleSyncEnabled = Database.toggleSyncEnabled;
window.updateSyncConfig = Database.updateSyncConfig;
window.copySdkSnippet = Database.copySdkSnippet;
window.loadSyncLogs = Database.loadSyncLogs;

// Billing & Payments
window.renderBilling = Billing.renderBilling;
window.openUpgradeModal = Billing.openUpgradeModal;
window.closeUpgradeModal = Billing.closeUpgradeModal;
window.submitUpgradeRequest = Billing.submitUpgradeRequest;
window.loadMyUpgradeRequests = Billing.loadMyUpgradeRequests;
window.switchPayTab = Billing.switchPayTab;
window.openPlanModal = Billing.openPlanModal;
window.closePlanModal = Billing.closePlanModal;
window.populateProjectSelects = Billing.populateProjectSelects;
window.loadPlans = Billing.loadPlans;
window.copyCheckout = Billing.copyCheckout;
window.createPlan = Billing.createPlan;
window.openPaymentModal = Billing.openPaymentModal;
window.closePaymentModal = Billing.closePaymentModal;
window.loadPayments = Billing.loadPayments;
window.createPayment = Billing.createPayment;

// Owner Console
window.loadOwnerConsole = Billing.loadOwnerConsole;
window.switchOwnerTab = Billing.switchOwnerTab;
window.setUserRole = Billing.setUserRole;
window.setRequestStatus = Billing.setRequestStatus;

// Public Routes
window.loadPublicCheckout = Billing.loadPublicCheckout;
window.loadPublicPage = Billing.loadPublicPage;
window.loadPublicForm = Billing.loadPublicForm;
window.copyFormLink = Billing.copyFormLink;

// ============================================
// 8. Initialization (Moved to the very bottom)
// ============================================
async function init() {
    initTheme();
    const urlParams = new URLSearchParams(window.location.search);
    
    if (urlParams.has('pay') && urlParams.has('plan')) return window.loadPublicCheckout(urlParams.get('pay'), urlParams.get('plan'));
    if (urlParams.has('form') && urlParams.has('project')) return window.loadPublicForm(urlParams.get('project'), urlParams.get('form'));
    if (urlParams.has('page')) return window.loadPublicPage(urlParams.get('page'));
    
    if (urlParams.has('type') && urlParams.get('type') === 'recovery') {
        state.inRecoveryMode = true;
        showLandingView(); showAuthView(); window.showNewPasswordView();
        return;
    }
    
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    if (session) showDashboardView(session.user); else showLandingView();
}

window.supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'TOKEN_REFRESHED') return;
    if (event === 'PASSWORD_RECOVERY') {
        state.inRecoveryMode = true;
        showLandingView(); showAuthView(); window.showNewPasswordView();
        return;
    }
    if (state.inRecoveryMode) return;
    if (session) showDashboardView(session.user); else showLandingView();
});

init();
