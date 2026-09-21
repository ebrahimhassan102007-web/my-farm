/**
 * Utils.js — Shared Utilities for MY FARM 3D
 * IDs, math helpers, random utilities, formatting,
 * and the lightweight i18n translator used by UI Components.
 *
 * Exported names required by existing modules:
 *   uuid, randPick, randInt, randFloat, t, formatNumber, formatTime
 * سجل التغيير (Work Order):
 *   MF-13 — haptic() محروس (iOS يتجاهل navigator.vibrate بصمت).
 */

/* ============================================================
   IDENTIFIERS
   ============================================================ */

/**
 * Generate a unique id.
 * Uses crypto.randomUUID() when available, falls back to a
 * time + random composite (safe for local saves).
 */
export function uuid() {
    try {
        if (
            typeof globalThis.crypto !== 'undefined' &&
            typeof globalThis.crypto.randomUUID === 'function'
        ) {
            return globalThis.crypto.randomUUID();
        }
    } catch (e) { /* fall through */ }

    return (
        'id-' +
        Date.now().toString(36) +
        '-' +
        Math.random().toString(36).slice(2, 10) +
        Math.random().toString(36).slice(2, 6)
    );
}

/** Short id (8 chars) — for transient UI keys */
export function shortId() {
    return Math.random().toString(36).slice(2, 10);
}

/* ============================================================
   RANDOM
   ============================================================ */

/** Random integer in [min, max] inclusive */
export function randInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Random float in [min, max) */
export function randFloat(min, max) {
    return Math.random() * (max - min) + min;
}

/** Random element of an array (or undefined for empty) */
export function randPick(arr) {
    if (!Array.isArray(arr) || arr.length === 0) {
        return undefined;
    }
    return arr[Math.floor(Math.random() * arr.length)];
}

/** Fisher–Yates shuffle (returns a NEW array) */
export function shuffle(arr) {
    const copy = Array.isArray(arr) ? [...arr] : [];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

/* ============================================================
   MATH
   ============================================================ */

export function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

export function lerp(a, b, t) {
    return a + (b - a) * clamp(t, 0, 1);
}

/** Promise-based delay (ms) */
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * MF-13 — اهتزاز لمسي قصير عند الحصاد/الجمع.
 * iOS Safari لا يعرّف navigator.vibrate ⇒ لا شيء (لا خطأ).
 * أي منصة أخرى بلا دعم تتجاهل بصمت أيضًا.
 */
export function haptic(duration = 12) {
    try {
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
            navigator.vibrate(Math.max(0, Math.min(100, duration)) | 0);
        }
    } catch (e) {
        // الاهتزاز لمسة جمالية — فشله لا يستحق أكثر من لا-شيء مشروح
        console.debug('[Utils] haptic skipped:', e?.message || e);
    }
}

/** Deep clone via structuredClone when available */
export function deepClone(obj) {
    try {
        if (typeof structuredClone === 'function') {
            return structuredClone(obj);
        }
    } catch (e) { /* fall through */ }
    return JSON.parse(JSON.stringify(obj));
}

/* ============================================================
   FORMATTING
   ============================================================ */

const _numberFormatter = (() => {
    try {
        // Arabic-friendly grouping with Western (Latin) digits
        return new Intl.NumberFormat('ar-EG-u-nu-latn');
    } catch (e) {
        return null;
    }
})();

/** Format a number with locale grouping (e.g. 1,250) */
export function formatNumber(n) {
    if (typeof n !== 'number' || !isFinite(n)) return '0';
    if (_numberFormatter) return _numberFormatter.format(n);
    return String(Math.round(n * 100) / 100);
}

/**
 * Format remaining time compactly in Arabic.
 * Accepts seconds (or milliseconds if obviously large).
 *   45      -> "45 ث"
 *   754     -> "12 د 34 ث"
 *   7,890   -> "2 س 11 د"
 *   200,000 -> "2 ي 7 س"
 */
export function formatTime(value) {
    let seconds = Number(value) || 0;

    // Heuristic: huge values are almost certainly milliseconds
    if (seconds > 100000) {
        seconds = Math.floor(seconds / 1000);
    }

    seconds = Math.max(0, Math.floor(seconds));

    if (seconds < 60) {
        return `${seconds} ث`;
    }

    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (days > 0) {
        return hours > 0
            ? `${days} ي ${hours} س`
            : `${days} ي`;
    }

    if (hours > 0) {
        return minutes > 0
            ? `${hours} س ${minutes} د`
            : `${hours} س`;
    }

    return secs > 0
        ? `${minutes} د ${secs} ث`
        : `${minutes} د`;
}

/* ============================================================
   LOCALIZATION (i18n)
   ============================================================ */

export const TRANSLATIONS = Object.freeze({
    ar: {
        buy: 'شراء',
        sell: 'بيع',
        accept: 'قبول',
        locked: 'مقفل 🔒',
        unlocked: 'مفتوح',
        levelRequired: 'المستوى مطلوب',
        notEnoughResources: 'الموارد غير كافية',
        collect: 'استلام',
        collectAll: 'استلام الكل',
        cancel: 'إلغاء',
        confirm: 'تأكيد',
        close: 'إغلاق',
        ready: 'جاهز ✅',
        producing: 'جارِ الإنتاج…',
        queue: 'قائمة الانتظار',
        queueFull: 'قائمة الإنتاج ممتلئة',
        start: 'ابدأ',
        upgrade: 'ترقية',
        expand: 'توسيع',
        plant: 'ازرع',
        harvest: 'احصد',
        water: 'اسقِ',
        feed: 'أطعم',
        inventory: 'المخزن',
        inventoryFull: 'المخزن ممتلئ!',
        coins: 'عملات',
        gems: 'جواهر',
        xp: 'خبرة',
        level: 'المستوى',
        loading: 'جارِ التحميل…',
        bakery: 'المخبز',
        grainMill: 'طاحونة الحبوب',
        productionStarted: 'بدأ الإنتاج 🏭',
        productionReady: 'المنتج جاهز للاستلام ✅',
        productionCollected: 'تم الاستلام 📦'
    },
    en: {
        buy: 'Buy',
        sell: 'Sell',
        accept: 'Accept',
        locked: 'Locked 🔒',
        unlocked: 'Unlocked',
        levelRequired: 'Level required',
        notEnoughResources: 'Not enough resources',
        collect: 'Collect',
        collectAll: 'Collect all',
        cancel: 'Cancel',
        confirm: 'Confirm',
        close: 'Close',
        ready: 'Ready ✅',
        producing: 'Producing…',
        queue: 'Queue',
        queueFull: 'Production queue is full',
        start: 'Start',
        upgrade: 'Upgrade',
        expand: 'Expand',
        plant: 'Plant',
        harvest: 'Harvest',
        water: 'Water',
        feed: 'Feed',
        inventory: 'Inventory',
        inventoryFull: 'Inventory is full!',
        coins: 'Coins',
        gems: 'Gems',
        xp: 'XP',
        level: 'Level',
        loading: 'Loading…',
        bakery: 'Bakery',
        grainMill: 'Grain Mill',
        productionStarted: 'Production started 🏭',
        productionReady: 'Product ready ✅',
        productionCollected: 'Collected 📦'
    }
});

/**
 * Translate a key. Usage: t('buy') or t('buy', 'ar')
 * Falls back: requested language -> Arabic -> raw key.
 * Optional vars interpolate {placeholders}.
 */
export function t(key, lang = 'ar', vars = null) {
    if (key === null || key === undefined) return '';

    if (typeof lang !== 'string') {
        vars = lang;
        lang = 'ar';
    }

    let text =
        (TRANSLATIONS[lang] && TRANSLATIONS[lang][key]) ||
        TRANSLATIONS.ar[key] ||
        key;

    if (vars && typeof vars === 'object') {
        for (const [k, v] of Object.entries(vars)) {
            text = text.replaceAll(
                '{' + k + '}',
                String(v)
            );
        }
    }

    return text;
}
