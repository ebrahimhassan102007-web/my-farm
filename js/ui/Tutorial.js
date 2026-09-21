/**
 * ============================================================
 * Tutorial.js — MY FARM 3D · درس أول ٦٠ ثانية (Work Order MF-10)
 * ============================================================
 * سجل التغيير:
 *   MF-10 — اللاعب الجديد كان يهبط على أرض فارغة بلا أيّ توجيه
 *           (أكبر فجوة أمام Hay Day). الآن درس موجّه من ٤ خطوات:
 *           ازرع ← اسقِ ← احصد (قمح أول مسرَّع ليُنضج خلال ~60ث)
 *           ← بِع في كشك السوق. بقناع spotlight وقفل إدخال خارج
 *           الهدف، والإكمال يُحفظ في GameState — لا يُعاد أبدًا.
 *
 * التبعية: منطق كامل عبر الأحداث (R5)؛ طبقة DOM (القناع/البطاقة)
 * اختيارية ومحروسة حتى تعمل الوحدة داخل اختبارات Node بلا متصفح.
 * ============================================================
 */

import { Events } from '../core/EventBus.js';
import { GameState } from '../core/GameState.js';
import { Logger } from '../core/Logger.js';
import { FarmingSystem } from '../systems/FarmingSystem.js';
import { LAND_CONFIG } from '../systems/LandSystem.js';

/** ترتيب الخطوات المقفل: زرع ← ري ← حصاد ← بيع. */
export const TUTORIAL_STEPS = Object.freeze(['plant', 'water', 'harvest', 'sell']);

/** قمح الدرس الأول ينضج بعد هذه المدة — لا انتظار يسرق السحر (Game Designer). */
export const TUTORIAL_FIRST_GROW_MS = 60_000;

/** نصوص البطاقة لكل خطوة (واجهة عربية فقط). */
const HINTS = Object.freeze({
    plant: {
        title: 'أهلًا بك في مزرعتك 🌾',
        desc: 'هيا نزرع أول محصول: اختر «بذور القمح» من الشريط ثم ازرع في الخانة المضيئة'
    },
    water: {
        title: 'أحسنت! الآن اسقِه 💧',
        desc: 'اضغط نفس الخانة لري القمح — الماء يسرّع نموه'
    },
    harvest: {
        title: 'قمحك الأول ينضج سريعًا لأجلك 🧺',
        desc: 'احصد القمح عندما يكتمل نموه — هذا المحصول الأول ينضج خلال دقيقة'
    },
    sell: {
        title: 'أخيرًا: بِع في كشك السوق 🛒',
        desc: 'افتح كشك الطريق أو حقيبتك وبِع القمح — الكوينز تشغّل مزرعتك'
    }
});

class TutorialService {
    constructor() {
        this._unsubs = [];
        this._running = false;
        this._els = null;
        this._projector = null;
        this._marketPos = null;
        this._fieldId = null;
    }

    get completed() {
        return !!GameState.get('tutorial.completed');
    }

    get step() {
        return Number(GameState.get('tutorial.step')) || 0;
    }

    get stepName() {
        return TUTORIAL_STEPS[this.step] || null;
    }

    get running() {
        return this._running;
    }

    get fieldId() {
        return this._fieldId;
    }

    /**
     * هل يبدأ الدرس؟ لاعب جديد تمامًا فقط:
     * لا حصاد سابق، لا مبيعات سابقة، ولا محاصيل مزروعة في الحفظ
     * (حفظ قديم مرحّل = لاعب خبير — لا نزعجه أبدًا بشرط «never replay»).
     */
    shouldStart() {
        if (this.completed) return false;
        if ((GameState.get('stats.totalHarvests') || 0) > 0) return false;
        if ((GameState.get('stats.totalSales') || 0) > 0) return false;

        const tiles = GameState.get('farm.tiles') || [];
        const hasPlantedCrops = tiles.some((t) =>
            Array.isArray(t?.slots) && t.slots.some((s) => s?.cropType));
        if (hasPlantedCrops) return false;

        const baseField = tiles.find((t) => t.id === this._fieldId ||
            t.id === (this._fieldId = LAND_CONFIG.baseUnlocked?.[0]));
        return !!(baseField && baseField.purchased && baseField.prepared);
    }

    /**
     * يُنادى من main.js بعد اكتمال الإقلاع (game:ready).
     * آمن النداء مرارًا. `projector(x, z, h)` يسقط موضع العالم على الشاشة،
     * و`marketPos()` يرجع موضع كشك السوق لخطوة البيع.
     */
    start({ projector = null, marketPos = null } = {}) {
        if (this._running || this.completed) return this;

        this._fieldId = LAND_CONFIG.baseUnlocked?.[0] || 'field_center_left';
        if (!this.shouldStart()) {
            // لاعب خبير بلا علم إكمال ⇒ نسجّله مكتملًا بصمت (لا يظهر لاحقًا)
            this._markComplete();
            Logger.info('Tutorial', 'veteran player detected — FTUE silently marked complete');
            return this;
        }

        this._projector = projector;
        this._marketPos = marketPos;
        this._running = true;

        this._bindEvents();
        this._announce();
        Logger.info('Tutorial', `FTUE started at step ${this.step} (${this.stepName})`);
        Events.emit('tutorial:started', { step: this.step, name: this.stepName });
        return this;
    }

    _bindEvents() {
        const on = (name, fn) => {
            this._unsubs.push(Events.on(name, fn));
        };

        on('crop:planted', (d = {}) => {
            if (!this._running || this.stepName !== 'plant' || d.fieldId !== this._fieldId) return;
            // MF-10: هذا القمح الأول بالذات ينضج خلال ~60 ثانية (قرار منتج)
            FarmingSystem.accelerateForTutorial(d.fieldId, d.slotIndex ?? 0, TUTORIAL_FIRST_GROW_MS);
            this._advance();
        });

        on('crop:watered', (d = {}) => {
            if (!this._running || this.stepName !== 'water' || d.fieldId !== this._fieldId) return;
            this._advance();
        });

        on('crop:harvested', (d = {}) => {
            if (!this._running || this.stepName !== 'harvest' || d.fieldId !== this._fieldId) return;
            this._advance();
        });

        const onSold = () => {
            if (!this._running || this.stepName !== 'sell') return;
            this.complete('sold-first-crop');
        };
        on('crop:sold', onSold);      // بيع مباشر من الحقيبة
        on('item:sold', onSold);      // بيع عبر لوحة المخزن
        on('market:listed', onSold);  // عرض في كشك الطريق
        on('market:sold', onSold);    // زائر اشترى من الكشك

        // حلقة tick ⇒ إبقاء حلقة الضوء فوق الهدف أثناء تحريك الكاميرا
        let lastReposition = 0;
        on('game:tick', () => {
            if (!this._running || !this._els) return;
            const now = Date.now();
            if (now - lastReposition < 400) return;
            lastReposition = now;
            this._positionSpotlight();
        });
    }

    /**
     * قفل الإدخال خارج هدف الخطوة (main.js يستشيرنا قبل تنفيذ التفاعل).
     * @returns {{allowed: boolean, hint: string}}
     */
    gate(target) {
        if (!this._running) return { allowed: true, hint: '' };

        const name = this.stepName;
        if (name === 'sell') {
            // لوحات البيع (سوق/حقيبة) لا تمر بهذا البواب — تفتحها أزرار HUD
            if (target?.type === 'market') return { allowed: true, hint: '' };
            return { allowed: false, hint: HINTS.sell.desc };
        }

        if (target?.type === 'slot' && target.fieldId === this._fieldId) {
            return { allowed: true, hint: '' };
        }
        return { allowed: false, hint: HINTS[name]?.desc || 'أكمل الدرس أولًا' };
    }

    _advance() {
        const next = this.step + 1;
        GameState.set('tutorial.step', next);
        Events.emit('tutorial:step', { step: next, name: TUTORIAL_STEPS[next] || 'done' });

        if (!TUTORIAL_STEPS[next]) {
            this.complete('all-steps');
            return;
        }
        this._announce();
    }

    /** إنهاء (أو تخطٍّ داخلي): يُسجَّل الإكمال ولا يُعاد الدرس أبدًا. */
    complete(reason = 'finished') {
        if (this.completed) return this;
        this._running = false;
        this._markComplete();
        this._teardownDom();
        Logger.info('Tutorial', `completed (${reason})`);
        Events.emit('tutorial:completed', { reason });
        Events.emit('toast:success', '🎉 أتممت درسك الأول — مزرعة العمر بين يديك الآن');
        return this;
    }

    _markComplete() {
        GameState.set('tutorial.completed', true);
        GameState.set('tutorial.step', TUTORIAL_STEPS.length);
    }

    /** تخطٍّ اختياري (إن ظهر زر تخطٍّ لاحقًا) — يُحسب إكمالًا. */
    skip() {
        this.complete('skipped');
    }

    /* ========================================================
       DOM SPOTLIGHT (اختياري — لا تعتمده الاختبارات)
       ======================================================== */

    _announce() {
        const hint = HINTS[this.stepName];
        if (hint) {
            Events.emit('tutorial:hint', { step: this.step, name: this.stepName, ...hint });
        }

        if (typeof document === 'undefined' || !document.body) return;

        try {
            this._teardownDom();
            if (!hint) return;

            const dim = document.createElement('div');
            dim.id = 'ftue-dim';
            dim.innerHTML =
                '<div class="ftue-ring" id="ftue-ring"></div>' +
                `<div class="ftue-card" id="ftue-card">` +
                `<div class="ftue-step-badge">الخطوة ${this.step + 1} من ${TUTORIAL_STEPS.length}</div>` +
                `<div class="ftue-title">${hint.title}</div>` +
                `<div class="ftue-desc">${hint.desc}</div>` +
                '</div>';
            document.body.appendChild(dim);
            this._els = { dim };
            this._positionSpotlight();
        } catch (err) {
            Logger.warn('Tutorial', 'spotlight overlay failed — lesson logic continues', err);
            this._els = null;
        }
    }

    /** موضع الهدف على الشاشة (خانة الدرس أو كشك السوق في خطوة البيع). */
    _targetScreenPos() {
        try {
            let wx = null;
            let wz = null;

            if (this.stepName === 'sell') {
                const pos = typeof this._marketPos === 'function' ? this._marketPos() : null;
                if (!pos) return null;
                wx = pos.x; wz = pos.z;
            } else {
                const tiles = GameState.get('farm.tiles') || [];
                const tile = tiles.find((t) => t.id === this._fieldId);
                const slot = FarmingSystem.getOrCreateSlots(this._fieldId)?.[0];
                if (!tile || !slot) return null;
                wx = (tile.posX || 0) + (slot.ox || 0);
                wz = (tile.posZ || 0) + (slot.oz || 0);
            }

            if (typeof this._projector !== 'function') return null;
            return this._projector(wx, wz, 1.1);
        } catch (err) {
            Logger.warn('Tutorial', 'screen projection failed', err);
            return null;
        }
    }

    _positionSpotlight() {
        if (!this._els?.dim) return;
        const pos = this._targetScreenPos();
        if (!pos || pos.visible === false) return;

        const x = Math.round(pos.x);
        const y = Math.round(pos.y);
        const ring = this._els.dim.querySelector('#ftue-ring');
        if (ring) {
            ring.style.left = `${x}px`;
            ring.style.top = `${y}px`;
        }
        // قناع spotlight: فتحة شفافة فوق الهدف وتعتيم خفيف حولها
        this._els.dim.style.background =
            `radial-gradient(circle at ${x}px ${y}px, transparent 64px, rgba(26, 16, 5, 0.42) 96px)`;
    }

    _teardownDom() {
        if (this._els?.dim && this._els.dim.parentNode) {
            this._els.dim.parentNode.removeChild(this._els.dim);
        }
        this._els = null;
    }
}

export const Tutorial = new TutorialService();
export default Tutorial;
