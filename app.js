// 1. Initialize Supabase
const SUPABASE_URL = 'https://dwjyzqsrzdgnpwibnyjn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_4vcPyg62OqmfwNaHxx0CGA_a7O0_NJV';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 2. View Elements
const landingView = document.getElementById('landing-view');
const authView = document.getElementById('auth-view');
const dashboardView = document.getElementById('dashboard-view');
const userEmailDisplay = document.getElementById('user-email');

// 3. View Switchers
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
}

// 4. Auth Logic
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
        succEl.textContent = 'Account created! Check your email for the confirmation link.';
        succEl.classList.remove('hidden');
    }
}

async function handleLogout() {
    await supabaseClient.auth.signOut();
    showLandingView();
}

// 5. Waitlist Logic
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

// 6. Sidebar Toggle
function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('-translate-x-full');
}

// 7. Initialize App
async function init() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        showDashboardView(session.user);
    } else {
        showLandingView();
    }
}

// 8. Listen for Auth Changes
supabaseClient.auth.onAuthStateChange((event, session) => {
    if (session) showDashboardView(session.user);
    else showLandingView();
});

// Run the app
init();
