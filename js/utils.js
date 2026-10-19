import { PLAN_LIMITS, STAFF_ROLES, SUPPORT_WA_INTL, SUPPORT_EMAIL } from './config.js';
import { state } from './state.js';

export function showToast(message, type = 'success', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0'; 
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

export function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

export function formatBytes(bytes) {
    const b = Number(bytes) || 0;
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(2) + ' MB';
}

export function supportWhatsAppLink(message) {
    return 'https://wa.me/' + SUPPORT_WA_INTL + '?text=' + encodeURIComponent(message || 'Hi Ukmbase support');
}

export function supportEmailLink(subject) {
    return 'mailto:' + SUPPORT_EMAIL + '?subject=' + encodeURIComponent(subject || 'Ukmbase support');
}

// --- Permission Helpers (Moved here to prevent circular imports) ---
export function getLimits() {
    if (state.currentProfile && STAFF_ROLES.indexOf(state.currentProfile.role) !== -1) return PLAN_LIMITS.staff;
    const plan = (state.currentProfile && state.currentProfile.plan) || 'free';
    return PLAN_LIMITS[plan] || PLAN_LIMITS.free;
}

export function getTeamSeatsUsed() {
    return 1 + state.teamCache.filter(m => m.status === 'active').length;
}

export function canCreateProject() {
    return state.projectsCache.length < getLimits().projects;
}

export function canCreateConnection() {
    return state.connectionsCache.length < getLimits().connections;
}
