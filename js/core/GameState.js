/**
 * GameState.js — Single Source of Truth
 * Immutable state updates via structured clone.
 * Notifies subscribers on changes.
 *
 * سجل التغيير (Work Order):
 *   MF-03 — أُزيلت حقول الطاقة (energy/maxEnergy/energyLastRefill):
 *           لا فعل يستهلكها، وعدّادها الوهمي يربك اللاعب (قرار: بلا طاقة).
 */

import { Events } from './EventBus.js';
import { readRealClock } from './Calendar.js';

class GameStateManager {
    constructor() {
        this._state = this.getDefaultState();
        this._subscribers = new Map();
        this._history = [];
        this._maxHistory = 20;
        this._batching = false;
        this._pendingChanges = new Set();
    }

    getDefaultState() {
        // البذرة الزمنية الحقيقية: حتى قبل Time.start() لا نقول «الشتاء»
        // في سبتمبر — الفصل من فلك الجهاز (Brief §0.4).
        const clock = readRealClock(new Date());

        return {
            player: {
                name: 'مزارع',
                level: 1,
                xp: 0,
                xpToNext: 100,
                coins: 350,
                gems: 10,
                // MF-03: لا حقول طاقة — تُحذف من الحفوظات القديمة في SaveManager._stripRetiredKeys
                createdAt: Date.now(),
                lastLogin: Date.now(),
                totalPlayTime: 0,
                language: 'ar'
            },

            farm: {
                name: 'مزرعة العمر',
                maxAnimals: 20,
                gridSize: {
                    rows: 4,
                    cols: 6
                },
                maxGridSize: {
                    rows: 12,
                    cols: 10
                },
                tiles: [],
                buildings: [],
                animals: [],
                decorations: [],
                expansions: 0,
                houseLevel: 1
            },

            inventory: {
                items: {},
                // legacy mirror = silo + barn (يحدّثه StorageSystem)
                capacity: 300,
                maxCapacity: 300,
                upgrades: 0
            },

            /*
             * التخزين بأسلوب Hay Day (Brief §1):
             *   الصوامع (Silo)  → المحاصيل الخام + البذور فقط.
             *                        امتلاؤها يمنع الحصاد.
             *   المخزن (Barn)   → منتجات الحيوانات + المصنّعات
             *                        + العدد + مواد الترقية.
             *                        امتلاؤه يمنع استلام الآلات والحيوانات.
             * الترقية بمواد (مسامير/ألواح/شريط) تُكسب من الحصاد
             * والطلبات وزوّار الكشك.
             */
            storage: {
                silo: { level: 1, capacity: 150 },
                barn: { level: 1, capacity: 150 },
                upgrades: 0,
                lastUpgradeAt: 0
            },

            crops: {
                active: [],
                harvested: 0
            },

            production: {
                queues: {},
                completed: 0
            },

            // مهام اللاعب — QuestSystem يملؤها من INITIAL_QUESTS عند أول تشغيل
            quests: {
                items: []
            },

            orders: {
                active: [],
                completed: 0,
                dailyCompleted: 0,
                lastRefresh: 0
            },

            market: {
                listings: [],
                myListings: [],
                lastUpdate: 0
            },

            social: {
                friends: [],
                friendRequests: [],
                giftsSentToday: 0,
                giftsReceivedToday: 0,
                lastGiftReset: Date.now()
            },

            events: {
                active: null,
                history: [],
                participated: []
            },

            missions: {
                daily: [],
                weekly: [],
                achievements: [],
                lastDailyReset: 0,
                lastWeeklyReset: 0
            },

            // MF-10: درس أول ٦٠ ثانية — يُحفظ الإكمال ولا يُعاد أبدًا
            tutorial: {
                step: 0,
                completed: false
            },

            settings: {
                sfx: true,
                music: true,
                notifications: true,
                graphics: 'high',
                debug: false
            },

            stats: {
                totalHarvests: 0,
                totalSales: 0,
                totalSpent: 0,
                totalOrders: 0,
                maxLevelReached: 1,
                playSessions: 0,
                lastSave: 0
            },

            unlocked: {
                crops: ['wheat'],
                animals: [],
                buildings: ['barn'],
                areas: ['main_farm'],
                recipes: []
            },

            /*
             * الوقت الحقيقي (Brief §0.3): hours/minutes/day/season كلها
             * من ساعة الجهاز والتقويم الفلكي — لا تسريع ولا يوم مضغوط.
             */
            time: {
                gameTime: 0,
                lastTick: Date.now(),
                dayCycle: clock.dayProgress,
                hours: clock.hours,
                minutes: clock.minutes,
                day: clock.day,
                month: clock.month,
                year: clock.year,
                dateKey: clock.dateKey,
                dateLabel: clock.dateLabel,
                dateLabelEn: clock.dateLabelEn,
                season: clock.season,
                seasonAr: clock.seasonAr,
                seasonEn: clock.seasonEn,
                seasonIcon: clock.seasonIcon,
                phase: clock.phase,
                phaseIcon: clock.phaseIcon,
                clockLabel: clock.clockLabel
            }
        };
    }

    get(path = null) {
        if (!path) {
            return this._clone(this._state);
        }

        const keys = path.split('.');
        let val = this._state;

        for (const key of keys) {
            if (val === undefined || val === null) {
                return undefined;
            }

            val = val[key];
        }

        return this._clone(val);
    }

    _getRaw(path = null) {
        if (!path) {
            return this._state;
        }

        const keys = path.split('.');
        let val = this._state;

        for (const key of keys) {
            if (val === undefined || val === null) {
                return undefined;
            }

            val = val[key];
        }

        return val;
    }

    set(path, value) {
        const keys = path.split('.');
        let target = this._state;

        for (let i = 0; i < keys.length - 1; i++) {
            if (!(keys[i] in target)) {
                target[keys[i]] = {};
            }

            target = target[keys[i]];
        }

        const lastKey = keys[keys.length - 1];
        const oldValue = target[lastKey];

        target[lastKey] = value;

        if (!this._batching) {
            this._notify(path, value, oldValue);
            Events.emit(
                'state:changed',
                path,
                value,
                oldValue
            );
        } else {
            this._pendingChanges.add(path);
        }

        return this;
    }

    merge(path, obj) {
        const current = this._getRaw(path) || {};
        const merged = {
            ...current,
            ...obj
        };

        this.set(path, merged);

        return this;
    }

    push(path, item) {
        const arr = this._getRaw(path) || [];

        arr.push(item);

        this.set(path, arr);

        return this;
    }

    remove(path, predicate) {
        const arr = this._getRaw(path) || [];

        const filtered = arr.filter(
            item => !predicate(item)
        );

        this.set(path, filtered);

        return this;
    }

    updateInArray(path, key, keyValue, updates) {
        const arr = this._getRaw(path) || [];

        const index = arr.findIndex(
            item => item[key] === keyValue
        );

        if (index !== -1) {
            arr[index] = {
                ...arr[index],
                ...updates
            };

            this.set(path, [...arr]);
        }

        return this;
    }

    batch(fn) {
        this._batching = true;

        try {
            fn(this);
        } finally {
            this._batching = false;

            for (const path of this._pendingChanges) {
                const value = this._getRaw(path);

                this._notify(
                    path,
                    value,
                    undefined
                );
            }

            Events.emit(
                'state:batch',
                Array.from(this._pendingChanges)
            );

            this._pendingChanges.clear();
        }

        return this;
    }

    subscribe(path, callback) {
        if (!this._subscribers.has(path)) {
            this._subscribers.set(
                path,
                new Set()
            );
        }

        this._subscribers
            .get(path)
            .add(callback);

        return () =>
            this._subscribers
                .get(path)
                ?.delete(callback);
    }

    _notify(path, newValue, oldValue) {
        if (this._subscribers.has(path)) {
            for (
                const callback
                of this._subscribers.get(path)
            ) {
                callback(
                    newValue,
                    oldValue,
                    path
                );
            }
        }

        const parts = path.split('.');
        let checkPath = '';

        for (
            let i = 0;
            i < parts.length - 1;
            i++
        ) {
            checkPath +=
                (i > 0 ? '.' : '') +
                parts[i];

            const wildcard =
                checkPath + '.*';

            if (
                this._subscribers.has(wildcard)
            ) {
                for (
                    const callback
                    of this._subscribers.get(wildcard)
                ) {
                    callback(
                        newValue,
                        oldValue,
                        path
                    );
                }
            }
        }
    }

    _clone(obj) {
        if (
            obj === null ||
            typeof obj !== 'object'
        ) {
            return obj;
        }

        if (obj instanceof Date) {
            return new Date(
                obj.getTime()
            );
        }

        if (Array.isArray(obj)) {
            return obj.map(
                item => this._clone(item)
            );
        }

        const cloned = {};

        for (const key in obj) {
            if (
                Object.prototype.hasOwnProperty.call(
                    obj,
                    key
                )
            ) {
                cloned[key] =
                    this._clone(obj[key]);
            }
        }

        return cloned;
    }

    snapshot() {
        return this._clone(
            this._state
        );
    }

    restore(snapshot) {
        this._state =
            this._clone(snapshot);

        Events.emit(
            'state:restored',
            this._state
        );
    }

    reset() {
        this._state =
            this.getDefaultState();

        Events.emit(
            'state:reset'
        );
    }
}

export const GameState =
    new GameStateManager();