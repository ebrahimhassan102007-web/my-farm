/**
 * Toast.js — إشعارات سريعة عائمة (RTL)
 * Lightweight, zero-dependency toast notifications.
 * No THREE.js, no direct game logic — pure DOM feedback.
 * سجل التغيير (Work Order):
 *   MF-04 — يقبل أيقونة SVG (iconHTML) مع fallback نصي.
 */

export class Toast {
    constructor() {
        this._container = null;
        this._queue = [];
    }

    mount(parent) {
        if (this._container) return this;
        this._container = document.createElement('div');
        this._container.className = 'toast-container';
        this._container.setAttribute('role', 'status');
        this._container.setAttribute('aria-live', 'polite');
        (parent || document.body).appendChild(this._container);
        return this;
    }

    show(message, type = 'info', duration = 2600) {
        if (!this._container) this.mount(document.body);

        const el = document.createElement('div');
        el.className = `toast toast-${type}`;
        el.innerHTML = `
            <span class="toast-ico">${this._icon(type)}</span>
            <span class="toast-msg"></span>`;
        el.querySelector('.toast-msg').textContent = message;

        this._container.appendChild(el);

        // دخول
        requestAnimationFrame(() => el.classList.add('toast-in'));

        const dismiss = () => {
            el.classList.remove('toast-in');
            el.classList.add('toast-out');
            setTimeout(() => el.remove(), 320);
        };

        setTimeout(dismiss, duration);
        el.addEventListener('click', dismiss);
        return el;
    }

    success(msg, duration) { return this.show(msg, 'success', duration); }
    error(msg, duration)   { return this.show(msg, 'error', duration); }
    info(msg, duration)    { return this.show(msg, 'info', duration); }

    _icon(type) {
        switch (type) {
            case 'success': return '✅';
            case 'error':   return '⚠️';
            default:        return '🔔';
        }
    }
}

export default Toast;
