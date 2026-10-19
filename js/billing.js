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
    
    // (Add the rest of your usage bars here)
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

// (Paste submitUpgradeRequest, loadMyUpgradeRequests, switchPayTab, openPlanModal, createPlan, loadPlans, openPaymentModal, loadPayments, createPayment here)
// Again, just replace the global variables with `state.something`.
