/**
 * ============================================================
 * icons.js — MY FARM 3D · نظام الأيقونات الموحّد (Work Order MF-04)
 * ============================================================
 * سجل التغيير:
 *   MF-04 — إيموجي الواجهة (🌾🐄🥚) كانت تُرسم بخط نظام التشغيل
 *           فتختلف من جهاز لآخر وتستحيل تنسيقها. الآن كل عنصر له
 *           SVG مضمّن مرسوم يدويًا: حدود سميكة (#3d2a12)، ظل ناعم
 *           بزاوية 45°، ولوحة ألوان مقفلة من ألوان اللعبة.
 *           الإيموجي يبقى fallback للعناصر غير المرسومة بعد.
 *
 * الاستخدام:
 *   iconHTML('🌾')          → <svg> قمح (أو <span class="mf-emoji"> fallback)
 *   svgIcon('wheat', 32)    → <svg> أو null إن لم تُرسم الأيقونة بعد
 *   hasIcon('coin'/'🥕')    → هل لدينا نسخة SVG؟
 * ============================================================
 */

/* لوحة مقفلة — من ألوان اللعبة نفسها (CONFIG.colors + تعريفات المحاصيل) */
const INK = '#3d2a12';      // حدود داكنة موحّدة
const LEAF = '#57B327';
const LEAF_DARK = '#3F7D1E';
const GOLD = '#FFD54F';
const WOOD = '#8A552E';
const METAL = '#B0BEC5';

/** ظل ناعم بزاوية ٤٥° أسفل كل أيقونة */
const SHADOW = '<ellipse cx="33" cy="56.5" rx="19" ry="5" fill="rgba(61,42,18,0.16)"/>';

/* ============================================================
   الأيقونات — كل واحدة مرسومة على شبكة 64×64
   ============================================================ */
const ART = {
    wheat: `${SHADOW}
        <path d="M32 56V24" stroke="${LEAF_DARK}" stroke-width="4.5" stroke-linecap="round"/>
        <path d="M32 40c-7-2-10-7-11-13 7 2 11 6 11 13z" fill="${LEAF}"/>
        <path d="M32 40c7-2 10-7 11-13-7 2-11 6-11 13z" fill="${LEAF}"/>
        <ellipse cx="32" cy="11" rx="5" ry="8" fill="${GOLD}" stroke="${INK}" stroke-width="2.4"/>
        <ellipse cx="25" cy="19" rx="5" ry="8" transform="rotate(-18 25 19)" fill="${GOLD}" stroke="${INK}" stroke-width="2.4"/>
        <ellipse cx="39" cy="19" rx="5" ry="8" transform="rotate(18 39 19)" fill="${GOLD}" stroke="${INK}" stroke-width="2.4"/>
        <ellipse cx="24" cy="29" rx="4.4" ry="7" transform="rotate(-18 24 29)" fill="#f2c93c" stroke="${INK}" stroke-width="2.2"/>
        <ellipse cx="40" cy="29" rx="4.4" ry="7" transform="rotate(18 40 29)" fill="#f2c93c" stroke="${INK}" stroke-width="2.2"/>`,

    corn: `${SHADOW}
        <path d="M24 38c-7 3-9 9-9 16h9c3-5 3-11 0-16z" fill="${LEAF}" stroke="${INK}" stroke-width="2.6"/>
        <path d="M40 38c7 3 9 9 9 16h-9c-3-5-3-11 0-16z" fill="${LEAF}" stroke="${INK}" stroke-width="2.6"/>
        <rect x="24" y="10" width="16" height="36" rx="8" fill="#F5A623" stroke="${INK}" stroke-width="3"/>
        <path d="M29 13v30M35 13v30" stroke="#c9860f" stroke-width="2.2" stroke-linecap="round"/>`,

    carrot: `${SHADOW}
        <path d="M32 20c0-6-4-9-9-11M32 20c0-6 4-9 9-11M32 20c-1-6 0-9 0-12" stroke="${LEAF_DARK}" stroke-width="4" stroke-linecap="round" fill="none"/>
        <path d="M24 22h16l-6.2 32q-1.8 4-3.6 0z" fill="#FF7043" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
        <path d="M27 33h8M29 44h6" stroke="#e05a28" stroke-width="2.6" stroke-linecap="round"/>`,

    tomato: `${SHADOW}
        <circle cx="32" cy="36" r="18" fill="#E53935" stroke="${INK}" stroke-width="3"/>
        <path d="M20 26c4-6 8-9 12-9s8 3 12 9c-8-3-16-3-24 0z" fill="${LEAF_DARK}"/>
        <path d="M32 18v-7" stroke="${LEAF_DARK}" stroke-width="4" stroke-linecap="round"/>
        <ellipse cx="26" cy="31" rx="3.5" ry="5.5" transform="rotate(-20 26 31)" fill="#ff8a80" opacity="0.75"/>`,

    soybean: `${SHADOW}
        <ellipse cx="26" cy="34" rx="9" ry="16" transform="rotate(-16 26 34)" fill="#B6D94A" stroke="${INK}" stroke-width="3"/>
        <ellipse cx="40" cy="32" rx="9" ry="16" transform="rotate(16 40 32)" fill="#B6D94A" stroke="${INK}" stroke-width="3"/>
        <circle cx="26" cy="27" r="2.6" fill="#7fa32a"/><circle cx="26" cy="35" r="2.6" fill="#7fa32a"/><circle cx="26" cy="43" r="2.6" fill="#7fa32a"/>
        <circle cx="40" cy="25" r="2.6" fill="#7fa32a"/><circle cx="40" cy="33" r="2.6" fill="#7fa32a"/><circle cx="40" cy="41" r="2.6" fill="#7fa32a"/>`,

    sugarcane: `${SHADOW}
        <path d="M37 12c7-2 11-6 13-10" stroke="${LEAF}" stroke-width="4" stroke-linecap="round" fill="none"/>
        <rect x="27" y="8" width="10" height="48" rx="4" fill="#D8C46A" stroke="${INK}" stroke-width="3"/>
        <path d="M27 20h10M27 32h10M27 44h10" stroke="#a98f3f" stroke-width="2.6"/>`,

    seed: `${SHADOW}
        <path d="M22 26h20l4 26q0 4-4 4H22q-4 0-4-4z" fill="#C9782A" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
        <path d="M24 26c0-6 16-6 16 0" fill="none" stroke="${INK}" stroke-width="3"/>
        <path d="M32 48c0-5-1-8-4-10M32 48c0-5 1-8 4-10" stroke="${LEAF_DARK}" stroke-width="3" stroke-linecap="round" fill="none"/>
        <path d="M24 30h16" stroke="#a55e1e" stroke-width="2.4"/>`,

    water: `${SHADOW}
        <path d="M32 10c8 11 13 18 13 26a13 13 0 1 1-26 0c0-8 5-15 13-26z" fill="#29B6F6" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
        <ellipse cx="27" cy="35" rx="3" ry="5" transform="rotate(-15 27 35)" fill="#b3e5fc" opacity="0.85"/>`,

    coin: `${SHADOW}
        <circle cx="32" cy="32" r="20" fill="${GOLD}" stroke="#C98F1B" stroke-width="4"/>
        <circle cx="32" cy="32" r="12" fill="none" stroke="#E0A90F" stroke-width="2.6"/>
        <path d="M32 26v12M26 30h12" stroke="#C98F1B" stroke-width="3.4" stroke-linecap="round"/>`,

    gem: `${SHADOW}
        <path d="M20 18h24l8 13-20 21-20-21z" fill="#4FC3F7" stroke="#1565C0" stroke-width="3" stroke-linejoin="round"/>
        <path d="M12 31h40M20 18l8 13 4-13M44 18l-8 13" fill="none" stroke="#1565C0" stroke-width="2" stroke-linejoin="round"/>`,

    egg: `${SHADOW}
        <path d="M32 12c9 0 15 14 15 26 0 9-6 15-15 15s-15-6-15-15c0-12 6-26 15-26z" fill="#FFF3D6" stroke="${INK}" stroke-width="3"/>
        <ellipse cx="27" cy="30" rx="3.4" ry="5.4" transform="rotate(-14 27 30)" fill="#ffffff" opacity="0.8"/>`,

    milk: `${SHADOW}
        <path d="M26 20h12v6c4 4 6 8 6 14v12a4 4 0 0 1-4 4H24a4 4 0 0 1-4-4V40c0-6 2-10 6-14z" fill="#FFFFFF" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
        <rect x="25" y="12" width="14" height="8" rx="3" fill="#29B6F6" stroke="${INK}" stroke-width="2.6"/>
        <path d="M22 42h20" stroke="#B3E5FC" stroke-width="3"/>`,

    bread: `${SHADOW}
        <rect x="13" y="24" width="38" height="26" rx="12" fill="#E8A33D" stroke="${INK}" stroke-width="3"/>
        <path d="M24 34l5 6M34 32l5 6" stroke="#b97a1f" stroke-width="3" stroke-linecap="round"/>`,

    axe: `${SHADOW}
        <path d="M20 56 38 14" stroke="${WOOD}" stroke-width="6" stroke-linecap="round"/>
        <path d="M28 18l16-4c5 7 5 14 0 20l-16-5c-2-4-2-7 0-11z" fill="${METAL}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`,

    pickaxe: `${SHADOW}
        <path d="M32 12v46" stroke="${WOOD}" stroke-width="6" stroke-linecap="round"/>
        <path d="M12 24c11-9 29-9 40 0l-5 7c-9-7-21-7-30 0z" fill="${METAL}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`,

    fert: `${SHADOW}
        <path d="M28 14h8v9l7 12c5 9-2 17-11 17s-16-8-11-17l7-12z" fill="#7E57C2" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
        <rect x="27" y="9" width="10" height="6" rx="2" fill="${WOOD}" stroke="${INK}" stroke-width="2.2"/>
        <circle cx="28" cy="40" r="2.4" fill="#D1C4E9"/><circle cx="36" cy="45" r="1.9" fill="#D1C4E9"/>`,

    silo: `${SHADOW}
        <path d="M18 22c0-10 28-10 28 0z" fill="#A83228" stroke="${INK}" stroke-width="3"/>
        <rect x="19" y="22" width="26" height="34" rx="3" fill="#CFD8DC" stroke="${INK}" stroke-width="3"/>
        <path d="M19 33h26M19 44h26" stroke="#90A4AE" stroke-width="2.6"/>`,

    barn: `${SHADOW}
        <path d="M14 30 32 16l18 14z" fill="#7B1C14" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
        <rect x="17" y="30" width="30" height="26" fill="#A83228" stroke="${INK}" stroke-width="3"/>
        <rect x="27" y="38" width="10" height="18" fill="#5d3a1a" stroke="${INK}" stroke-width="2.4"/>`,

    cow: `${SHADOW}
        <ellipse cx="13" cy="31" rx="6" ry="3.6" transform="rotate(-14 13 31)" fill="#F8BBD0" stroke="${INK}" stroke-width="2.4"/>
        <ellipse cx="51" cy="31" rx="6" ry="3.6" transform="rotate(14 51 31)" fill="#F8BBD0" stroke="${INK}" stroke-width="2.4"/>
        <path d="M22 21l-5-7M42 21l5-7" stroke="#D7CCC8" stroke-width="4" stroke-linecap="round"/>
        <ellipse cx="32" cy="34" rx="18" ry="16" fill="#FFFFFF" stroke="${INK}" stroke-width="3"/>
        <path d="M40 20c6 2 8 8 4 12-5 0-8-4-6-9z" fill="#424242"/>
        <circle cx="25" cy="31" r="2.2" fill="${INK}"/><circle cx="39" cy="37" r="2.2" fill="${INK}"/>
        <ellipse cx="32" cy="43" rx="11" ry="7" fill="#F8BBD0" stroke="${INK}" stroke-width="2.6"/>
        <circle cx="28" cy="44" r="1.6" fill="#5d3a1a"/><circle cx="36" cy="44" r="1.6" fill="#5d3a1a"/>`,

    chicken: `${SHADOW}
        <path d="M28 25c-3-7 3-9 5-4 0-7 7-7 7 0 3-5 8-1 4 4" fill="#EF5350" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
        <ellipse cx="32" cy="39" rx="15" ry="14" fill="#FFFFFF" stroke="${INK}" stroke-width="3"/>
        <path d="M43 35l9 3-9 4z" fill="#F5A623" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>
        <circle cx="37" cy="33" r="2.2" fill="${INK}"/>
        <path d="M24 42c0 6 4 9 9 9" fill="none" stroke="#CFD8DC" stroke-width="4" stroke-linecap="round"/>
        <path d="M27 53v5m9-5v5" stroke="#F5A623" stroke-width="3" stroke-linecap="round"/>`,

    pig: `${SHADOW}
        <path d="M19 21l-5-8 10 3zM45 21l5-8-10 3z" fill="#F48FB1" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>
        <ellipse cx="32" cy="34" rx="18" ry="15" fill="#F48FB1" stroke="${INK}" stroke-width="3"/>
        <circle cx="25" cy="30" r="2.2" fill="${INK}"/><circle cx="39" cy="30" r="2.2" fill="${INK}"/>
        <ellipse cx="32" cy="39" rx="8.5" ry="6" fill="#F8BBD0" stroke="${INK}" stroke-width="2.6"/>
        <circle cx="29" cy="39" r="1.6" fill="#5d3a1a"/><circle cx="35" cy="39" r="1.6" fill="#5d3a1a"/>`,

    sheep: `${SHADOW}
        <path d="M16 34a8 8 0 0 1 4-12 10 10 0 0 1 12-6 10 10 0 0 1 12 6 8 8 0 0 1 4 12 8 8 0 0 1-8 8H24a8 8 0 0 1-8-8z" fill="#F5F5F5" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
        <ellipse cx="32" cy="40" rx="8" ry="7" fill="#616161"/>
        <circle cx="29.5" cy="39" r="1.5" fill="#fff"/><circle cx="34.5" cy="39" r="1.5" fill="#fff"/>`,

    bag: `${SHADOW}
        <path d="M22 24c0-9 20-9 20 0l4 26c0 4-4 6-8 6H26c-4 0-8-2-8-6z" fill="#8D6E63" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
        <path d="M22 26h20M25 10h14" stroke="${INK}" stroke-width="3" stroke-linecap="round" fill="none"/>
        <rect x="26" y="34" width="12" height="10" rx="2.4" fill="#6D4C41" stroke="${INK}" stroke-width="2.4"/>`,

    box: `${SHADOW}
        <path d="M14 24l18-9 18 9v20l-18 9-18-9z" fill="#C89B6C" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
        <path d="M14 24l18 9 18-9M32 33v20" fill="none" stroke="#8d6e4a" stroke-width="2.6" stroke-linejoin="round"/>`
};

/* خريطة الإيموجي → أيقونة (كل الرموز المستخدمة في GameData/HUD/Core loop) */
const EMOJI_TO_ID = Object.freeze({
    '🌾': 'wheat', '🌽': 'corn', '🥕': 'carrot', '🍅': 'tomato',
    '🫛': 'soybean', '🎋': 'sugarcane', '🥔': 'carrot',
    '🌱': 'seed', '💧': 'water',
    '💰': 'coin', '🪙': 'coin', '💎': 'gem', '💠': 'gem',
    '🥚': 'egg', '🥛': 'milk', '🍞': 'bread', '🥖': 'bread',
    '🪓': 'axe', '⛏️': 'pickaxe', '⚒️': 'pickaxe',
    '🧪': 'fert', '⚗️': 'fert', '✨': 'fert',
    '🛖': 'silo', '🏠': 'barn', '🧺': 'barn', '🏭': 'silo',
    '🐄': 'cow', '🐔': 'chicken', '🐷': 'pig', '🐑': 'sheep',
    '🎒': 'bag', '📦': 'box'
});

/**
 * SVG مضمّن لأيقونة مرسومة.
 * @param {string} id        معرّف الأيقونة (wheat, coin…)
 * @param {number} [size=32] المقاس بالبكسل (مربّع)
 * @param {string} [cls='']  كلاس CSS إضافي
 * @returns {string|null}    وسم <svg> أو null إن لم تُرسم الأيقونة
 */
export function svgIcon(id, size = 32, cls = '') {
    const art = ART[id];
    if (!art) return null;
    const s = Math.max(8, Math.min(256, Number(size) || 32));
    return `<svg class="mf-icon${cls ? ` ${cls}` : ''}" width="${s}" height="${s}" viewBox="0 0 64 64" role="img" aria-hidden="true" focusable="false">${art}</svg>`;
}

/**
 * الواجهة الرئيسية: تقبل إيموجي أو معرّفًا، وتُرجع SVG إن وُجد،
 * وإلا <span> إيموجي (fallback نصي مسموح به في MF-04).
 */
export function iconHTML(token, size = 32, cls = '') {
    if (!token) return svgIcon('box', size, cls) || '';
    const id = ART[token] ? token : EMOJI_TO_ID[token] || null;
    if (id) return svgIcon(id, size, cls);
    const safe = String(token).replace(/[<>&"]/g, '');
    return `<span class="mf-emoji${cls ? ` ${cls}` : ''}" aria-hidden="true">${safe}</span>`;
}

/** هل لهذا الرمز نسخة SVG مرسومة؟ (اختبارات + قرارات UI) */
export function hasIcon(token) {
    return !!(token && (ART[token] || EMOJI_TO_ID[token]));
}

/** قائمة المعرّفات المرسومة (اختبارات العقود). */
export function listIcons() {
    return Object.keys(ART);
}

/** خريطة الإيموجي (للاختبارات والتوثيق). */
export function iconEmojiMap() {
    return { ...EMOJI_TO_ID };
}

export default { svgIcon, iconHTML, hasIcon, listIcons, iconEmojiMap };
