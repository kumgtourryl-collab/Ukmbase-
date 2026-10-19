import { showToast, escapeHtml, supportWhatsAppLink, supportEmailLink } from './utils.js';
import { state } from './state.js';
import { STAFF_ROLES, PLAN_PRICES, SUPPORT_WA_INTL, SUPPORT_EMAIL } from './config.js';

export function renderBilling() {
    if (!state.currentProfile) return;
    const plan = STAFF_ROLES.indexOf(state.currentProfile.role) !== -1 ? state.currentProfile.role : (state.currentProfile.plan || 'free');
    const price = PLAN_PRICES[plan] || PLAN_PRICES.free;
    document.getElementById('billing-plan-name').textContent = plan;
    document.getElementById('billing-plan-price').textContent = price.label;
    
    const roleTag = document.getElementById('billing-role-tag');
    if (STAFF_ROLES.indexOf(state.currentProfile.role) !== -1) { roleTag.classList.remove('hidden'); roleTag.classList.add('role-' + state.currentProfile.role); roleTag.textContent = state.currentProfile.role; }
    else roleTag.classList.add('hidden');
    
    const limits = window.getLimits();
    document.getElementById('billing-projects-label').textContent = state.projectsCache.length + ' / ' + (limits.projects >= 999 ? '∞' : limits.projects);
    document.getElementById('billing-projects-bar').style.width = (limits.projects >= 999 ? 5 : Math.min(100, (state.projectsCache.length / limits.projects) * 100)) + '%';
}

export function openUpgradeModal(plan, price) {
    state.currentUpgradePlan = { plan: plan, price: price };
    document.getElementById('upgrade-plan-name').textContent = plan.charAt(0).toUpperCase() + plan.slice(1);
    document.getElementById('upgrade-plan-detail').textContent = price ? '$' + price + '/mo billed monthly' : 'Custom pricing';
    document.getElementById('upgrade-error').classList.add('hidden');
    document.getElementById('upgrade-name').value = (state.currentProfile && state.currentProfile.full_name) || '';
    document.getElementById('upgrade-contact').value = (state.currentProfile && (state.currentProfile.phone || state.currentProfile.email)) || (state.currentUser && state.currentUser.email) || '';
    document.getElementById('upgrade-notes').value = '';
    const btn = document.getElementById('submit-upgrade-btn'); btn.disabled = false; btn.textContent = 'Send Request';
    document.getElementById('upgrade-modal').classList.remove('hidden');
}
export function closeUpgradeModal() { document.getElementById('upgrade-modal').classList.add('hidden'); state.currentUpgradePlan = null; }

export async function submitUpgradeRequest() {
    const btn = document.getElementById('submit-upgrade-btn'); if (btn.disabled) return;
    const name = document.getElementById('upgrade-name').value.trim(); const contact = document.getElementById('upgrade-contact').value.trim();
    const notes = document.getElementById('upgrade-notes').value.trim(); const errEl = document.getElementById('upgrade-error');
    errEl.classList.add('hidden');
    if (!name || !contact || !state.currentUpgradePlan) { errEl.textContent = 'Name and contact required.'; errEl.classList.remove('hidden'); return; }
    btn.textContent = 'Sending...'; btn.disabled = true;
    try {
        const { error } = await window.supabaseClient.from('upgrade_requests').insert([{ user_id: state.currentUser.id, requested_plan: state.currentUpgradePlan.plan, amount: state.currentUpgradePlan.price, currency: 'USD', contact_method: contact.indexOf('@') !== -1 ? 'email' : 'whatsapp', contact_value: contact, notes: 'Name: ' + name + (notes ? ' | ' + notes : ''), status: 'pending' }]);
        if (error) throw error;
        closeUpgradeModal();
        showToast("Request sent!", 'success', 5000);
        await loadMyUpgradeRequests();
    } catch (err) {
        errEl.textContent = err.message; errEl.classList.remove('hidden');
    } finally { btn.disabled = false; btn.textContent = 'Send Request'; }
}

export async function loadMyUpgradeRequests() {
    if (!state.currentUser) return;
    const wrap = document.getElementById('billing-my-requests'); const list = document.getElementById('billing-requests-list');
    if (!wrap || !list) return;
    try {
        const { data, error } = await window.supabaseClient.from('upgrade_requests').select('*').eq('user_id', state.currentUser.id).order('created_at', { ascending: false });
        if (error) return;
        if (!data || data.length === 0) { wrap.classList.add('hidden'); return; }
        wrap.classList.remove('hidden');
        list.innerHTML = data.map(r => `<div class="rounded-lg p-3 flex items-center justify-between" style="background: var(--bg); border: 1px solid var(--border);"><div><p class="text-sm font-medium capitalize" style="color: var(--text);">${escapeHtml(r.requested_plan)}</p><p class="text-xs mono" style="color: var(--text-dim);">${new Date(r.created_at).toLocaleDateString()}</p></div><span class="text-[10px] uppercase font-bold ${r.status === 'approved' ? 'text-green-400' : r.status === 'pending' ? 'text-yellow-400' : 'text-red-400'}">${r.status}</span></div>`).join('');
    } catch (err) { }
}

export function switchPayTab(tab) {
    const plansPanel = document.getElementById('pay-plans-panel'); const payPanel = document.getElementById('pay-payments-panel');
    const plansTab = document.getElementById('pay-tab-plans'); const payTab = document.getElementById('pay-tab-payments');
    if (tab === 'plans') { plansPanel.classList.remove('hidden'); payPanel.classList.add('hidden'); plansTab.style.color = 'var(--text)'; plansTab.style.borderBottom = '2px solid var(--accent)'; payTab.style.color = 'var(--text-muted)'; payTab.style.borderBottom = 'none'; }
    else { plansPanel.classList.add('hidden'); payPanel.classList.remove('hidden'); payTab.style.color = 'var(--text)'; payTab.style.borderBottom = '2px solid var(--accent)'; plansTab.style.color = 'var(--text-muted)'; plansTab.style.borderBottom = 'none'; }
}
export function openPlanModal() { document.getElementById('plan-modal').classList.remove('hidden'); }
export function closePlanModal() { document.getElementById('plan-modal').classList.add('hidden'); }
export function populateProjectSelects() { }
export async function loadPlans() { }
export function copyCheckout() { }
export async function createPlan() { }
export function openPaymentModal() { }
export function closePaymentModal() { }
export async function loadPayments() { }
export async function createPayment() { }

// Owner Console
export async function loadOwnerConsole() { }
export function switchOwnerTab() { }
export async function setUserRole() { }
export async function setRequestStatus() { }

// Public Routes
export async function loadPublicCheckout() { }
export async function loadPublicPage() { }
export async function loadPublicForm() { }
export function copyFormLink() { }
