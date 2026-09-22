/**
 * ============================================================
 * XPSystem.js — الخبرة والمستويات
 * ============================================================
 * Single owner of the level curve. Any module may either:
 *   • call XPSystem.addXp(amount, source)   (preferred), or
 *   • write GameState 'player.xp' directly   (still handled — we
 *     watch `state:changed`, so legacy call sites keep working).
 *
 * Emits:  'xp:gain:applied' (payload)   — { amount, source, leveled }
 *         'player:levelup' (newLevel)   — already consumed by
 *                     SaveManager for an immediate save
 * ============================================================
 */
import { Events } from '../core/EventBus.js';
import { GameState } from '../core/GameState.js';

/** XP needed to leave `level` -> level+1. */
export function xpForLevel(level) {
    const l = Math.max(1, Math.floor(level) || 1);
    return Math.round(100 + (l - 1) * 75);
}

class XPSystemService {
    constructor() {
        this.initialized = false;
        /*
         * GAP-01 — علم إعادة الدخول: `addXp()` يكتب `player.xp` بنفسه ثم
         * يستدعي `_checkLevelUp()` صراحةً. بدون هذا العلم كانت شبكة
         * الأمان (مستمع `state:changed`) ترفع المستوى أولًا، فيصل
         * الاستدعاء الثاني إلى حالة مُسوّاة ويُرجع `leveled=false`
         * رغم أن اللاعب ارتقى فعلًا — عقد مرتجع كاذب + عمل مكرر.
         */
        this._resolvingLevel = false;
    }

    init() {
        if (this.initialized) return this;
        this.initialized = true;

        Events.on('xp:gain', (amount, source) => this.addXp(amount, source));

        /*
         * شبكة أمان للوحدات التي تكتب `player.xp` مباشرة (توافق خلفي).
         * GAP-01: لا تعمل أثناء قيادة `addXp()` للترقية — وإلا نُفِّذ
         * فحص المستوى مرتين وتلوّث المرتجع.
         */
        Events.on('state:changed', (path) => {
            if (path === 'player.xp' && !this._resolvingLevel) this._checkLevelUp();
        });

        // Make sure a freshly loaded save has a sane xpToNext.
        this._syncThreshold();

        return this;
    }

    addXp(amount, source = 'game') {
        const gain = Math.max(0, Math.floor(Number(amount) || 0));
        if (gain === 0) return { success: false, xp: 0, leveled: false };

        const current = GameState.get('player.xp') || 0;

        /*
         * GAP-01: نتحكم في الفحص بأنفسنا. نرفع العلم قبل الكتابة حتى لا
         * يسبقنا مستمع `state:changed`، ثم نفحص مرة واحدة بالضبط —
         * فالمرتجع `leveled` يعكس ما حدث فعلًا.
         */
        this._resolvingLevel = true;
        let leveled = false;
        try {
            GameState.set('player.xp', current + gain);
            leveled = this._checkLevelUp();
        } finally {
            this._resolvingLevel = false;
        }

        Events.emit('xp:gain:applied', { amount: gain, source, leveled });

        return { success: true, xp: gain, leveled };
    }

    addCoins(amount, source = 'game') {
        const value = Math.floor(Number(amount) || 0);
        if (value === 0) return { success: false };

        const current = GameState.get('player.coins') || 0;
        GameState.set('player.coins', Math.max(0, current + value));
        Events.emit('coins:gain', { amount: value, source });
        return { success: true };
    }

    _syncThreshold() {
        const level = GameState.get('player.level') || 1;
        const needed = xpForLevel(level);
        if (GameState.get('player.xpToNext') !== needed) {
            GameState.set('player.xpToNext', needed);
        }
    }

    _checkLevelUp() {
        let level = GameState.get('player.level') || 1;
        let xp = GameState.get('player.xp') || 0;
        let needed = GameState.get('player.xpToNext') || xpForLevel(level);
        let leveled = false;

        while (xp >= needed && level < 200) {
            xp -= needed;
            level += 1;
            needed = xpForLevel(level);
            leveled = true;
        }

        if (!leveled) return false;

        // Sequential sets (not batch) so `state:changed` reaches the HUD
        // for level / xp / xpToNext individually.
        GameState.set('player.xp', xp);
        GameState.set('player.level', level);
        GameState.set('player.xpToNext', needed);
        GameState.set(
            'stats.maxLevelReached',
            Math.max(GameState.get('stats.maxLevelReached') || 1, level)
        );

        Events.emit('player:levelup', level);
        console.log(`[XP] 🎉 المستوى ${level}`);
        return true;
    }
}

export const XPSystem = new XPSystemService();
export default XPSystem;
