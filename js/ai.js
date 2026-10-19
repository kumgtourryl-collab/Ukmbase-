import { SUPABASE_URL } from './config.js';
import { showToast, escapeHtml } from './utils.js';
import { state } from './state.js';

const AI_CONFIG = {
    timeoutMs: 60000,
    maxRetries: 2,
    retryBaseMs: 1500,
    cooldownMs: 1200,
    cacheTtlMs: 5 * 60 * 1000,
    maxHistoryTurns: 12,
    endpoint: '/functions/v1/ukmai',
};

const PLAN_TOKEN_LIMITS = {
    free: 100000, pro: 500000, team: 2000000,
    enterprise: 999999, staff: 999999,
};

class AIError extends Error {
    constructor(kind, message, meta) {
        super(message);
        this.name = 'AIError';
        this.kind = kind;
        this.meta = meta || {};
    }
}

const aiState = { lastRequestAt: 0, currentAbort: null, promptCache: new Map() };

export function aiCancel() {
    if (aiState.currentAbort) { try { aiState.currentAbort.abort(); } catch (_) {} aiState.currentAbort = null; }
}

async function aiCall({ prompt, mode, history, projectId }) {
    if (navigator.onLine === false) throw new AIError('offline', 'You appear to be offline.');
    
    const limit = PLAN_TOKEN_LIMITS[state.currentProfile?.plan || 'free'] || PLAN_TOKEN_LIMITS.free;
    const used = state.projectsCache.reduce((s, p) => s + (Number(p.ai_tokens_used) || 0), 0);
    if (used >= limit) throw new AIError('limit', 'AI token limit reached for your plan.');

    const wait = aiState.lastRequestAt + AI_CONFIG.cooldownMs - Date.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    aiState.lastRequestAt = Date.now();

    const { data: { session } } = await window.supabaseClient.auth.getSession();
    if (!session) throw new AIError('auth', 'Session expired.');

    let attempt = 0, lastErr = null;
    const ctrl = new AbortController();
    aiState.currentAbort = ctrl;
    const timeoutId = setTimeout(() => ctrl.abort('timeout'), AI_CONFIG.timeoutMs);

    try {
        while (attempt <= AI_CONFIG.maxRetries) {
            try {
                const res = await fetch(SUPABASE_URL + AI_CONFIG.endpoint, {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompt, mode, history: (history || []).slice(-AI_CONFIG.maxHistoryTurns) }),
                    signal: ctrl.signal,
                });

                if (res.status === 429) throw new AIError('ratelimit', 'Too many requests.');
                if (res.status === 401 || res.status === 403) throw new AIError('auth', 'Session expired.');
                if (res.status >= 500) throw new AIError('provider', 'AI service unavailable.');
                
                const data = await res.json();
                if (data.error) throw new AIError('provider', data.error);

                // Token tracking
                if (data.usage) {
                    const t = data.usage.total_tokens || ((data.usage.prompt_tokens || 0) + (data.usage.completion_tokens || 0));
                    const p = state.projectsCache.find(x => x.id === projectId);
                    if (p) {
                        p.ai_tokens_used = (Number(p.ai_tokens_used) || 0) + t;
                        window.supabaseClient.from('projects').update({ ai_tokens_used: p.ai_tokens_used }).eq('id', projectId).then(() => {});
                    }
                }
                return data;
            } catch (err) {
                lastErr = err;
                if (err.name === 'AbortError') throw new AIError('timeout', 'Request timed out.');
                if (err instanceof AIError && ['ratelimit', 'auth', 'offline', 'limit'].includes(err.kind)) throw err;
                if (attempt >= AI_CONFIG.maxRetries) throw err;
                await new Promise(r => setTimeout(r, AI_CONFIG.retryBaseMs * Math.pow(2, attempt)));
                attempt++;
            }
        }
        throw lastErr;
    } finally {
        clearTimeout(timeoutId);
        if (aiState.currentAbort === ctrl) aiState.currentAbort = null;
    }
}

export function aiFormatError(err) {
    const map = {
        offline: '📡 You appear to be offline.',
        timeout: '⏱️ Request timed out.',
        ratelimit: '⏳ Too many requests. Wait a moment.',
        auth: '🔒 Session expired. Sign in again.',
        provider: '🛠️ AI service is having trouble.',
        limit: '💰 AI token limit reached. Upgrade in Billing.'
    };
    return map[err?.kind] || ('AI error: ' + (err?.message || 'Unknown'));
}

// ============================================
// CHAT UI
// ============================================
export async function sendChat() {
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send');
    const prompt = input.value.trim(); if (!prompt) return;

    input.value = ''; sendBtn.disabled = true;
    appendMessage('user', prompt); const typingId = appendTypingIndicator();

    try {
        const data = await aiCall({
            prompt, mode: 'default', projectId: state.currentUkmDataProjectId,
            history: state.chatHistory.slice(-10).map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.content }))
        });
        removeTypingIndicator(typingId);
        appendMessage('ai', data.content || 'No response.');
        state.chatHistory.push({ role: 'user', content: prompt }, { role: 'ai', content: data.content });
    } catch (err) {
        removeTypingIndicator(typingId);
        appendMessage('ai', aiFormatError(err));
    } finally { sendBtn.disabled = false; input.focus(); }
}

export function appendMessage(role, content) {
    const container = document.getElementById('chat-messages'); 
    if (container.querySelector('.text-center')) container.innerHTML = '';
    const wrapper = document.createElement('div'); wrapper.className = 'flex gap-3 max-w-3xl mx-auto';
    
    if (role === 'user') {
        wrapper.className += ' flex-row-reverse';
        wrapper.innerHTML = `<div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style="background: rgba(79,70,229,0.2);"><svg class="w-4 h-4" style="color: var(--accent);" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg></div><div class="rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[80%] text-sm text-white" style="background: var(--accent);">${escapeHtml(content)}</div>`;
    } else {
        const parsedHtml = DOMPurify.sanitize(marked.parse(content));
        wrapper.innerHTML = `<div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style="background: rgba(245,158,11,0.2);"><svg class="w-4 h-4 text-[#F59E0B]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"></path></svg></div><div class="rounded-2xl rounded-tl-sm px-4 py-3 max-w-[85%] text-sm chat-message" style="background: var(--surface); border: 1px solid var(--border); color: var(--text);">${parsedHtml}</div>`;
    }
    container.appendChild(wrapper);
    wrapper.querySelectorAll('pre code').forEach(b => hljs.highlightElement(b));
    container.scrollTop = container.scrollHeight;
}

export function appendTypingIndicator() {
    const container = document.getElementById('chat-messages'); 
    if (container.querySelector('.text-center')) container.innerHTML = '';
    const id = 'typing-' + Date.now(); const wrapper = document.createElement('div'); wrapper.id = id;
    wrapper.className = 'flex gap-3 max-w-3xl mx-auto';
    wrapper.innerHTML = `<div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style="background: rgba(245,158,11,0.2);"><svg class="w-4 h-4 text-[#F59E0B]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"></path></svg></div><div class="rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1" style="background: var(--surface); border: 1px solid var(--border);"><span class="typing-dot w-2 h-2 rounded-full" style="background: var(--text-muted);"></span><span class="typing-dot w-2 h-2 rounded-full" style="background: var(--text-muted);"></span><span class="typing-dot w-2 h-2 rounded-full" style="background: var(--text-muted);"></span></div>`;
    container.appendChild(wrapper); container.scrollTop = container.scrollHeight; 
    return id;
}

export function removeTypingIndicator(id) { const el = document.getElementById(id); if (el) el.remove(); }
export function clearChat() { document.getElementById('chat-messages').innerHTML = '<div class="text-center py-8"><h3 class="font-bold mb-1" style="color: var(--text);">Chat cleared</h3></div>'; state.chatHistory = []; }
export function sendPrompt(text) { document.getElementById('chat-input').value = text; sendChat(); }
