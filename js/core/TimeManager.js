/**
 * TimeManager.js — Real-time & Offline Progression Engine
 * Handles game ticks, timers, offline calculation, day/night cycle.
 *
 * ============================================================
 * قرار المنتج المقفل (Brief §0.3):
 *   الساعة = وقت الجهاز الحقيقي.
 *     1 ثانية = 1 ثانية · 1 دقيقة = 1 دقيقة · 1 يوم = 1 يوم تقويمي
 *   لا تسريع ولا ضغط زمني: ما تراه في الـ HUD هو ساعتك أنت،
 *   والفصول من الفلك الحقيقي (انظر core/Calendar.js).
 *
 * العقد (EventBus contracts — لم يتغير):
 *   'game:tick'      (dtSeconds, nowMs)
 *   'time:minute'    (clock)      ← كل دقيقة حقيقية
 *   'time:hour'      (hour, clock)← كل ساعة حقيقية
 *   'time:day'       (dateKey)    ← تغيّر اليوم التقويمي
 *   'time:season'    (season)     ← تغيّر الفصل الفلكي
 *   'time:offline'   (seconds)    ← تقدّم الغياب
 *   'time:started' / 'time:stopped'
 * ============================================================
 * سجل التغيير (Work Order):
 *   MF-03 — حُذف نظام الطاقة (refill أونلاين/أوفلاين وحدث energy:refilled).
 *   MF-11 — tick يتوقف عند إخفاء الصفحة (بطارية)، وعند العودة يعوَّض
 *           الغياب عبر _processOfflineTime() ثم تُعاد مزامنة الساعة.
 * ============================================================
 *   MF-11 — لا tick أثناء document.hidden؛ رجوع المستخدم = فحص زمني واحد.
 *   QA-§1b — كل catch حرج (IDb/Legacy/TX) موسوم Logger.
 */

import { Events } from './EventBus.js';
import { GameState } from './GameState.js';
import { readRealClock } from './Calendar.js';

const TICK_RATE = 1000;

/** يوم حقيقي كامل — يُصدَّر للتوافق مع أي قارئ قديم. */
export const DAY_LENGTH_MS = 24 * 60 * 60 * 1000;

class TimeManager {
    constructor() {
        this._interval = null;
        this._lastTick = Date.now();
        this._running = false;
        this._suspended = false; // MF-11: الصفحة مخفية ⇒ tick نائم
        this._callbacks = new Map();
        this._nextId = 1;
        this._clock = readRealClock(new Date());
        this._lastMinuteKey = -1;
        this._lastDateKey = '';
        this._lastSeason = '';

        /*
         * MF-11 — بطارية: setInterval كان يكتب GameState كل ثانية حتى
         * والصفحة مخفية. نوقف العداد عند الإخفاء ونعيده عند الظهور؛
         * مدة الغياب تعالجها _processOfflineTime() كالمعتاد.
         */
        this._onVisibility = () => {
            if (!this._running) return;
            if (typeof document !== 'undefined' && document.hidden) {
                this._suspendTick();
            } else {
                this._resumeTick();
            }
        };
    }

    start() {
        if (this._running) return;

        this._running = true;
        this._lastTick = Date.now();

        // Process offline time immediately
        this._processOfflineTime();

        // نزامن الحالة فورًا حتى لا يبدأ الـ HUD بساعة افتراضية قديمة.
        this._syncClockState(true);

        if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
            document.addEventListener('visibilitychange', this._onVisibility);
        }

        if (typeof document !== 'undefined' && document.hidden) {
            this._suspended = true; // بدأنا والصفحة مخفية — لا عدّاد
        } else {
            this._interval = setInterval(
                () => this._tick(),
                TICK_RATE
            );
        }

        Events.emit('time:started');
    }

    stop() {
        this._running = false;
        this._suspended = false;

        if (this._interval) {
            clearInterval(this._interval);
            this._interval = null;
        }

        if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
            document.removeEventListener('visibilitychange', this._onVisibility);
        }

        Events.emit('time:stopped');
    }

    /** MF-11: إيقاف tick أثناء الإخفاء — لا كتابة حالة كل ثانية بلا داعٍ. */
    _suspendTick() {
        if (this._suspended) return;
        this._suspended = true;
        if (this._interval) {
            clearInterval(this._interval);
            this._interval = null;
        }
        Events.emit('time:suspended');
    }

    /** MF-11: عند العودة نعوّض الغياب ثم نعيد العداد والمزامنة فورًا. */
    _resumeTick() {
        if (!this._suspended) return;
        this._suspended = false;
        this._processOfflineTime();
        this._lastTick = Date.now();
        this._syncClockState(true);
        if (!this._interval) {
            this._interval = setInterval(
                () => this._tick(),
                TICK_RATE
            );
        }
        Events.emit('time:resumed');
    }

    isRunning() {
        return this._running;
    }

    /* ========================================================
       CLOCK STATE SYNC — من ساعة الجهاز إلى GameState
       ======================================================== */

    /**
     * يكتب لقطة الساعة الحقيقية داخل شجرة الحالة (نفس المسارات التي
     * كانت تُكتب قديمًا حتى لا تنكسر الواجهة/الحفظ) ويطلق أحداث التغيّر.
     * @param {boolean} [force] تجاهل كشف التغيّر (أول تزامن بعد الإقلاع)
     */
    _syncClockState(force = false) {
        const now = new Date();
        const clock = readRealClock(now);
        this._clock = clock;

        const minuteKey = clock.hours * 60 + clock.minutes;
        const minuteChanged = force || minuteKey !== this._lastMinuteKey;
        const dayChanged = force || clock.dateKey !== this._lastDateKey;
        const seasonChanged = force || clock.season !== this._lastSeason;

        this._lastMinuteKey = minuteKey;
        this._lastDateKey = clock.dateKey;
        this._lastSeason = clock.season;

        if (!minuteChanged) return clock;

        // كتابة مجمّعة واحدة في الدقيقة ⇒ حفظ تلقائي أقل وchurn أقل.
        GameState.batch((state) => {
            state.set('time.hours', clock.hours);
            state.set('time.minutes', clock.minutes);
            state.set('time.dayCycle', clock.dayProgress);
            state.set('time.day', clock.day);
            state.set('time.month', clock.month);
            state.set('time.year', clock.year);
            state.set('time.dateKey', clock.dateKey);
            state.set('time.dateLabel', clock.dateLabel);
            state.set('time.dateLabelEn', clock.dateLabelEn);
            state.set('time.season', clock.season);
            state.set('time.seasonAr', clock.seasonAr);
            state.set('time.seasonEn', clock.seasonEn);
            state.set('time.seasonIcon', clock.seasonIcon);
            state.set('time.phase', clock.phase);
            state.set('time.phaseIcon', clock.phaseIcon);
            state.set('time.clockLabel', clock.clockLabel);
            state.set('time.lastTick', now.getTime());
        });

        Events.emit('time:minute', clock);
        Events.emit('time:hour', clock.hours, clock);

        if (dayChanged) {
            Events.emit('time:day', clock.dateKey, clock);
        }
        if (seasonChanged) {
            Events.emit('time:season', clock.season, clock);
        }

        return clock;
    }

    /**
     * Process time elapsed while game was closed
     */
    _processOfflineTime() {
        const lastTick =
            GameState.get('time.lastTick') ||
            Date.now();

        const now = Date.now();
        const elapsedMs = now - lastTick;

        if (elapsedMs > 5000) {
            const elapsedSec =
                Math.floor(elapsedMs / 1000);

            console.log(
                `[TimeManager] Offline time: ${elapsedSec}s`
            );

            // Notify crop systems
            Events.emit(
                'time:offline',
                elapsedSec
            );

            // MF-03: كان هنا تعبئة طاقة أوفلاين — حُذف النظام كليًا.

            // Animal production
            Events.emit(
                'animals:offline',
                elapsedSec
            );

            // Production queues
            Events.emit(
                'production:offline',
                elapsedSec
            );
        }

        GameState.set(
            'time.lastTick',
            now
        );
    }

    _tick() {
        const now = Date.now();

        const dt =
            (now - this._lastTick) / 1000;

        this._lastTick = now;

        const currentGameTime =
            GameState.get(
                'time.gameTime'
            ) || 0;

        GameState.set(
            'time.gameTime',
            currentGameTime + dt
        );

        // Active timers
        this._processTimers(now);

        // الساعة الحقيقية (+ أحداث الدقيقة/الساعة/اليوم/الفصل)
        this._syncClockState(false);

        // Global game tick
        Events.emit(
            'game:tick',
            dt,
            now
        );
    }

    _processTimers(now) {
        for (
            const [id, timer]
            of this._callbacks
        ) {
            if (now >= timer.endTime) {
                try {
                    timer.callback(
                        timer.data
                    );
                } catch (err) {
                    console.error(
                        `[TimeManager] Timer ${id} error:`,
                        err
                    );
                }

                this._callbacks.delete(id);

                Events.emit(
                    'timer:completed',
                    id,
                    timer.data
                );
            }
        }
    }

    /* ========================================================
       CLOCK API — للمهام والواجهة ودورة النهار/الليل
       ======================================================== */

    /**
     * لقطة الساعة الحقيقية الحالية (بلا قراءة جديدة إن طُلبت داخل
     * نفس الثانية — `_tick` يحدّثها كل 1000ms).
     * @returns {import('./Calendar.js').readRealClock}
     */
    getClock() {
        if (!this._clock) this._clock = readRealClock(new Date());
        return this._clock;
    }

    /** قراءة طازجة مباشرة من ساعة الجهاز (تُستخدم عند الإقلاع). */
    readNow() {
        this._clock = readRealClock(new Date());
        return this._clock;
    }

    /** "08:05 ص" — تنسيق الساعة للـ HUD. */
    getClockLabel() {
        return this.getClock().clockLabel;
    }

    /** رمز الطقس/الوقت للـ HUD. */
    getPhaseIcon() {
        return this.getClock().phaseIcon;
    }

    /** "الجمعة 18 سبتمبر 2026" */
    getDateLabel() {
        return this.getClock().dateLabel;
    }

    /**
     * Create a timer that fires after duration
     */
    setTimer(
        durationMs,
        callback,
        data = {}
    ) {
        const id =
            this._nextId++;

        this._callbacks.set(
            id,
            {
                endTime:
                    Date.now() +
                    durationMs,

                callback,

                data: {
                    ...data,
                    timerId: id,
                    duration: durationMs
                }
            }
        );

        Events.emit(
            'timer:created',
            id,
            durationMs
        );

        return id;
    }

    /**
     * Cancel a timer
     */
    clearTimer(id) {
        const existed =
            this._callbacks.delete(id);

        if (existed) {
            Events.emit(
                'timer:cancelled',
                id
            );
        }
    }

    /**
     * Get remaining time
     */
    getRemaining(id) {
        const timer = this._callbacks.get(id);

        if (!timer) {
            return 0;
        }

        return Math.max(
            0,
            timer.endTime -
            Date.now()
        );
    }

    /**
     * Format milliseconds — "2h 15m" / "4m 3s" / "12s"
     */
    static formatDuration(ms) {
        const value = Math.max(0, Number(ms) || 0);
        const sec =
            Math.floor(value / 1000);

        const min =
            Math.floor(sec / 60);

        const hr =
            Math.floor(min / 60);

        if (hr > 0) {
            return `${hr}h ${min % 60}m`;
        }

        if (min > 0) {
            return `${min}m ${sec % 60}s`;
        }

        return `${sec}s`;
    }

    /**
     * Format seconds
     */
    static formatSeconds(totalSec) {
        return TimeManager.formatDuration(
            totalSec * 1000
        );
    }

    /** "٢:٠٥" قصيرة للآلات فوق المجسمات (MM:SS أو H:MM:SS). */
    static formatCountdown(ms) {
        const value = Math.max(0, Number(ms) || 0);
        const total = Math.ceil(value / 1000);
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = total % 60;
        const pad = (n) => String(n).padStart(2, '0');
        return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
    }
}

export const Time =
    new TimeManager();

export default Time;
