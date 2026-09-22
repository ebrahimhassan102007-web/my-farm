/**
 * ============================================================
 * MY FARM 3D - QUEST SYSTEM (DATA-DRIVEN)
 * Tracks Player Actions, Progress, Completion, and Rewards
 * ============================================================
 */
import { Events } from '../core/EventBus.js';
import { GameState } from '../core/GameState.js';
import { SaveManager } from '../core/SaveManager.js';

export const INITIAL_QUESTS = [
    {
        id: "plant_wheat_10",
        title: "ازرع 10 قمح",
        description: "ازرع القمح في حقول مزرعتك.",
        type: "plant",
        target: 10,
        progress: 0,
        rewardCoins: 50,
        rewardXP: 25,
        completed: false,
        claimed: false
    },
    {
        id: "water_plants_5",
        title: "اسقِ 5 نباتات",
        description: "قم بري النباتات النامية لتسريع نموها.",
        type: "water",
        target: 5,
        progress: 0,
        rewardCoins: 40,
        rewardXP: 20,
        completed: false,
        claimed: false
    },
    {
        id: "harvest_10",
        title: "احصد 10 محاصيل",
        description: "قم بحصاد المحاصيل الناضجة من الحقول.",
        type: "harvest",
        target: 10,
        progress: 0,
        rewardCoins: 80,
        rewardXP: 40,
        completed: false,
        claimed: false
    },
    {
        id: "buy_first_land",
        title: "اشترِ أول حقل",
        description: "قم بتوسعة مزرعتك بشراء قطعة أرض جديدة.",
        type: "buy_land",
        target: 1,
        progress: 0,
        rewardCoins: 100,
        rewardXP: 50,
        completed: false,
        claimed: false
    },
    {
        id: "prepare_first_land",
        title: "جهّز أول حقل",
        description: "استخدم الفأس لتجهيز الأرض المشتراة للزراعة.",
        type: "prepare_land",
        target: 1,
        progress: 0,
        rewardCoins: 60,
        rewardXP: 30,
        completed: false,
        claimed: false
    },
    {
        id: "collect_milk_3",
        title: "اجمع 3 حليب",
        description: "أطعم البقرة بالذرة ثم اجمع الحليب 🥛",
        type: "collect_milk",
        target: 3,
        progress: 0,
        rewardCoins: 120,
        rewardXP: 60,
        completed: false,
        claimed: false
    },
    {
        id: "sell_10_crops",
        title: "بِع 10 محاصيل",
        description: "قم ببيع المحاصيل المحصودة لكسب العملات.",
        type: "sell",
        target: 10,
        progress: 0,
        rewardCoins: 90,
        rewardXP: 45,
        completed: false,
        claimed: false
    }
];

class QuestSystemService {
    constructor() {
        this.initialized = false;
    }

    init() {
        if (this.initialized) return;

        // التحقق من وجود المهام في GameState أو إضافتها لأول مرة
        let quests = GameState.get('quests.items');
        if (!Array.isArray(quests) || quests.length === 0) {
            quests = JSON.parse(JSON.stringify(INITIAL_QUESTS));
            GameState.set('quests.items', quests);
        } else {
            /*
             * ترحيل: مهام أُضيفت بعد إنشاء الحفظ (مثل «اجمع 3 حليب»)
             * نلحقها بدل تجاهلها حتى لا يبقى الحفظ القديم بلا مهمة الحليب.
             */
            const known = new Set(quests.map(q => q.id));
            const missing = INITIAL_QUESTS.filter(q => !known.has(q.id));
            if (missing.length > 0) {
                quests = [...quests, ...JSON.parse(JSON.stringify(missing))];
                GameState.set('quests.items', quests);
            }
        }

        this.bindEvents();
        this.initialized = true;
        console.log('[QuestSystem] Initialized with', quests.length, 'quests.');
    }

    bindEvents() {
        // الاستماع لأحداث اللعبة المختلفة وتحديث التقدم تلقائياً
        Events.on('crop:planted', () => this.incrementProgress('plant', 1));
        Events.on('crop:watered', () => this.incrementProgress('water', 1));
        Events.on('crop:harvested', () => this.incrementProgress('harvest', 1));
        Events.on('land:purchased', () => this.incrementProgress('buy_land', 1));
        Events.on('land:prepared', () => this.incrementProgress('prepare_land', 1));
        Events.on('crop:sold', (amount = 1) => this.incrementProgress('sell', amount));
        Events.on('animal:collected', (animalId, productId, amount = 1) => {
            if (productId === 'milk') this.incrementProgress('collect_milk', amount);
            this.incrementProgress('collect_animal', amount);
        });
    }

    getQuests() {
        return GameState.get('quests.items') || [];
    }

    getActiveQuests() {
        return this.getQuests().filter(q => !q.completed || !q.claimed);
    }

    getCompletedQuests() {
        return this.getQuests().filter(q => q.completed);
    }

    getQuest(id) {
        return this.getQuests().find(q => q.id === id) || null;
    }

    getProgress(id) {
        const q = this.getQuest(id);
        return q ? { progress: q.progress, target: q.target, completed: q.completed } : null;
    }

    incrementProgress(type, amount = 1) {
        const quests = this.getQuests();
        let updated = false;

        quests.forEach(q => {
            if (q.type === type && !q.completed) {
                q.progress = Math.min(q.target, q.progress + amount);
                if (q.progress >= q.target) {
                    q.completed = true;
                    Events.emit('quest:completed', q);
                    console.log(`[QuestSystem] Quest Completed: ${q.title}`);
                }
                updated = true;
            }
        });

        if (updated) {
            GameState.set('quests.items', [...quests]);
            SaveManager.save();
            Events.emit('quest:progress-updated', quests);
        }
    }

    claimReward(id) {
        const quests = this.getQuests();
        const q = quests.find(item => item.id === id);

        if (!q) {
            return { success: false, reason: 'not-found' };
        }
        if (!q.completed) {
            return { success: false, reason: 'not-completed' };
        }
        if (q.claimed) {
            return { success: false, reason: 'already-claimed' };
        }

        // تسليم المكافآت (Coins & XP)
        try {
            const currentCoins = GameState.get('player.coins') || 0;
            const currentXP = GameState.get('player.xp') || 0;

            GameState.set('player.coins', currentCoins + q.rewardCoins);
            GameState.set('player.xp', currentXP + q.rewardXP);
        } catch (err) {
            console.warn('[QuestSystem] Reward distribution notice:', err);
        }

        q.claimed = true;
        GameState.set('quests.items', [...quests]);
        SaveManager.save();

        Events.emit('quest:claimed', { quest: q, rewardCoins: q.rewardCoins, rewardXP: q.rewardXP });
        console.log(`[QuestSystem] Reward claimed for: ${q.title} (+${q.rewardCoins} Coins, +${q.rewardXP} XP)`);

        return { success: true, quest: q };
    }
}

export const QuestSystem = new QuestSystemService();
if (typeof window !== 'undefined') {
    window.QuestSystem = QuestSystem;
}

