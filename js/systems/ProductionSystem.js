/**
 * ProductionSystem.js
 * Handles factories, recipes, production queues,
 * processing time, collecting finished products.
 */

import { Events } from '../core/EventBus.js';
import { GameState } from '../core/GameState.js';
import { InventorySystem } from './InventorySystem.js';
import { StorageSystem } from './StorageSystem.js';
import {
    RECIPES,
    BUILDINGS,
    getRecipe,
    getBuilding
} from '../data/GameData.js';
import { uuid } from '../utils/Utils.js';

/**
 * تكلفة الخانة الإضافية بالجواهر (Brief §1 «Economy»: diamonds are
 * premium — speed-up / extra slots). لا نكسر اقتصاد الجواهر القائم،
 * بل نضيف له مصرفين واضحين.
 */
const EXTRA_SLOT_GEM_COST = Object.freeze([5, 10, 20]);

/** ثواني تُخصم من المؤقّت لكل جوهرة في التسريع. */
const SPEEDUP_SECONDS_PER_GEM = 20;
const SPEEDUP_GEM_COST = 2;

class ProductionSystemService {

    constructor() {
        this._initListeners();
    }

    // =========================================================
    // EVENTS
    // =========================================================

    _initListeners() {
        Events.on('game:tick', (dt) => {
            this._tick(dt);
        });

        Events.on('time:offline', (seconds) => {
            this._processOffline(seconds);
        });
    }

    // =========================================================
    // START PRODUCTION
    // =========================================================

    startProduction(buildingId, recipeId, amount = 1) {

        const buildings =
            GameState.get('farm.buildings');

        const building =
            buildings.find(
                b => b.id === buildingId
            );

        if (!building) {
            return {
                success: false,
                error: 'Building not found'
            };
        }

        const recipe =
            getRecipe(recipeId);

        if (!recipe) {
            return {
                success: false,
                error: 'Recipe not found'
            };
        }

        if (amount <= 0) {
            return {
                success: false,
                error: 'Invalid amount'
            };
        }

        // -----------------------------------------------------
        // Check building type
        // -----------------------------------------------------

        if (
            recipe.building &&
            recipe.building !== building.typeId
        ) {
            return {
                success: false,
                error: 'Wrong building'
            };
        }

        // -----------------------------------------------------
        // Check recipe unlock
        // -----------------------------------------------------

        const playerLevel =
            GameState.get('player.level');

        if (
            recipe.unlockLevel &&
            recipe.unlockLevel > playerLevel
        ) {
            return {
                success: false,
                error:
                    `يتطلب المستوى ${recipe.unlockLevel}`
            };
        }

        // -----------------------------------------------------
        // Get production queue
        // -----------------------------------------------------

        if (!building.productionQueue) {
            building.productionQueue = [];
        }

        /*
         * قواعد الآلات (Brief §1 «Machines»): خانة واحدة في المرة
         * افتراضيًا، وخانات إضافية تُفتح بالجواهر حتى `maxSlots`.
         */
        const queueLimit = this.getQueueLimit(building);

        if (
            building.productionQueue.length >=
            queueLimit
        ) {
            return {
                success: false,
                error: 'طابور الآلة ممتلئ',
                reason: 'queue-full',
                queueLimit
            };
        }

        // -----------------------------------------------------
        // Check ingredients
        // -----------------------------------------------------

        const ingredients =
            recipe.ingredients ||
            recipe.inputs ||
            [];

        const items =
            GameState.get(
                'inventory.items'
            );

        for (const ingredient of ingredients) {

            const itemId =
                ingredient.item ||
                ingredient.itemId;

            const required =
                (ingredient.amount || 1) *
                amount;

            if (
                !items[itemId] ||
                items[itemId].count < required
            ) {
                return {
                    success: false,
                    error:
                        `Need ${required} ${itemId}`
                };
            }
        }

        // -----------------------------------------------------
        // Remove ingredients
        // -----------------------------------------------------

        for (const ingredient of ingredients) {

            const itemId =
                ingredient.item ||
                ingredient.itemId;

            const required =
                (ingredient.amount || 1) *
                amount;

            items[itemId].count -=
                required;

            if (
                items[itemId].count <= 0
            ) {
                delete items[itemId];
            }
        }

        GameState.set(
            'inventory.items',
            { ...items }
        );

        // -----------------------------------------------------
        // Production time
        // -----------------------------------------------------

        const productionTime =
            recipe.productionTime ||
            recipe.time ||
            recipe.duration ||
            60;

        const outputAmount =
            (recipe.output?.amount ||
             recipe.amount ||
             1) *
            amount;

        const outputItem =
            recipe.output?.item ||
            recipe.output?.itemId ||
            recipe.outputItem ||
            recipe.result;

        if (!outputItem) {

            // Restore ingredients if recipe
            // has no valid output.

            const restored =
                GameState.get(
                    'inventory.items'
                );

            for (const ingredient of ingredients) {

                const itemId =
                    ingredient.item ||
                    ingredient.itemId;

                const required =
                    (ingredient.amount || 1) *
                    amount;

                if (!restored[itemId]) {
                    restored[itemId] = {
                        count: 0,
                        quality: 1
                    };
                }

                restored[itemId].count +=
                    required;
            }

            GameState.set(
                'inventory.items',
                { ...restored }
            );

            return {
                success: false,
                error: 'Recipe has no output'
            };
        }

        // -----------------------------------------------------
        // Create production job
        // -----------------------------------------------------

        const now = Date.now();

        const job = {

            id: uuid(),

            recipeId,

            amount,

            outputItem,

            outputAmount,

            startedAt: now,

            duration:
                productionTime * 1000,

            readyAt:
                now +
                productionTime * 1000,

            state: 'producing'
        };

        building.productionQueue.push(
            job
        );

        GameState.set(
            'farm.buildings',
            [...buildings]
        );

        Events.emit(
            'production:started',
            buildingId,
            recipeId,
            job
        );

        return {
            success: true,
            job
        };
    }

    // =========================================================
    // COLLECT PRODUCT
    // =========================================================

    collectProduction(
        buildingId,
        jobId
    ) {

        const buildings =
            GameState.get(
                'farm.buildings'
            );

        const building =
            buildings.find(
                b => b.id === buildingId
            );

        if (!building) {
            return {
                success: false,
                error: 'Building not found'
            };
        }

        if (!building.productionQueue) {
            return {
                success: false,
                error: 'No production'
            };
        }

        /*
         * jobId اختياري: بدونه نجمع أول منتج جاهز على الآلة
         * (يُستخدم من زر التفاعل في العالم ثلاثي الأبعاد)، ومعهُ
         * نجمع وظيفة محددة (لوحة الإنتاج).
         */
        const index = jobId
            ? building.productionQueue.findIndex(job => job.id === jobId)
            : building.productionQueue.findIndex(
                job => job.state === 'ready' || Date.now() >= (job.readyAt || Infinity)
            );

        if (index === -1) {
            return {
                success: false,
                error: jobId ? 'Production not found' : 'لا يوجد منتج جاهز على الآلة'
            };
        }

        const job =
            building.productionQueue[index];

        if (
            Date.now() <
            job.readyAt
        ) {
            return {
                success: false,
                error: 'Production not ready'
            };
        }

        // -----------------------------------------------------
        // بوابة المخزن (Hay Day halt — Brief §1):
        // المنتج المصنّع يدخل Barn؛ إن كان ممتلئًا يبقى المنتج
        // على الآلة ولا يُفقد شيء.
        // -----------------------------------------------------

        const gate = StorageSystem.gateAdd(
            job.outputItem,
            job.outputAmount
        );

        if (gate.isBlocked) {
            StorageSystem.reportFull(gate.store);

            return {
                success: false,
                error: StorageSystem.fullMessage(gate.store),
                reason: `${gate.store}_full`
            };
        }

        /*
         * GAP-03 — المخزن قد يتّسع لجزء من الناتج فقط. الكود كان يضيف
         * الجزء المتاح ثم يحذف الوظيفة كاملة ⇒ بقيّة الناتج تُدمَّر
         * بصمت، وهو ما يناقض العقد المكتوب فوق هذه الكتلة حرفيًا.
         * الآن: الوظيفة تُحذف فقط عند تسليم الناتج كاملًا، وإلا
         * تبقى على الآلة بالكمية المتبقية للجمع لاحقًا.
         */
        const delivered = gate.deliverable;
        const remaining = gate.remaining;
        const isPartial = gate.isPartial;

        // -----------------------------------------------------
        // Add output
        // -----------------------------------------------------

        const added = InventorySystem.add(
            job.outputItem,
            delivered,
            'normal'
        );

        if (!added.success) {
            return {
                success: false,
                error: added.error || `${gate.store}_full`,
                reason: `${gate.store}_full`
            };
        }

        // -----------------------------------------------------
        // Remove job — أو الاكتفاء بخصم الكمية المسلَّمة
        // -----------------------------------------------------

        if (isPartial) {
            job.outputAmount = remaining;
            job.state = 'ready';
            GameState.set(
                'farm.buildings',
                [...buildings]
            );
        } else {
            building.productionQueue.splice(
                index,
                1
            );

            GameState.set(
                'farm.buildings',
                [...buildings]
            );
        }

        const output = {
            item: job.outputItem,
            amount: added.added
        };
        if (isPartial) {
            output.remaining = remaining;
            // المخزن امتلأ وبقي ناتج على الآلة ⇒ رسالة «رقِّ المخزن».
            StorageSystem.reportFull(gate.store);
        }

        Events.emit(
            'production:completed',
            buildingId,
            job.recipeId,
            output
        );

        return {
            success: true,
            output
        };
    }

    // =========================================================
    // CANCEL PRODUCTION
    // =========================================================

    cancelProduction(
        buildingId,
        jobId
    ) {

        const buildings =
            GameState.get(
                'farm.buildings'
            );

        const building =
            buildings.find(
                b => b.id === buildingId
            );

        if (!building) {
            return {
                success: false,
                error: 'Building not found'
            };
        }

        if (!building.productionQueue) {
            return {
                success: false,
                error: 'No production'
            };
        }

        const index =
            building.productionQueue.findIndex(
                job => job.id === jobId
            );

        if (index === -1) {
            return {
                success: false,
                error: 'Production not found'
            };
        }

        const job =
            building.productionQueue[index];

        const recipe =
            getRecipe(job.recipeId);

        // -----------------------------------------------------
        // Refund ingredients
        // -----------------------------------------------------

        if (recipe) {

            const ingredients =
                recipe.ingredients ||
                recipe.inputs ||
                [];

            const items =
                GameState.get(
                    'inventory.items'
                );

            for (
                const ingredient
                of ingredients
            ) {

                const itemId =
                    ingredient.item ||
                    ingredient.itemId;

                const amount =
                    (ingredient.amount || 1) *
                    job.amount;

                if (!items[itemId]) {
                    items[itemId] = {
                        count: 0,
                        quality: 1
                    };
                }

                items[itemId].count +=
                    amount;
            }

            GameState.set(
                'inventory.items',
                { ...items }
            );
        }

        building.productionQueue.splice(
            index,
            1
        );

        GameState.set(
            'farm.buildings',
            [...buildings]
        );

        Events.emit(
            'production:cancelled',
            buildingId,
            jobId
        );

        return {
            success: true
        };
    }

    // =========================================================
    // TICK
    // =========================================================

    _tick(dt) {

        const buildings =
            GameState.get(
                'farm.buildings'
            );

        if (!buildings) {
            return;
        }

        let changed = false;

        const now =
            Date.now();

        for (
            const building
            of buildings
        ) {

            if (
                !building.productionQueue ||
                building.productionQueue.length === 0
            ) {
                continue;
            }

            for (
                const job
                of building.productionQueue
            ) {

                if (
                    job.state === 'producing' &&
                    now >= job.readyAt
                ) {

                    job.state = 'ready';

                    changed = true;

                    Events.emit(
                        'production:ready',
                        building.id,
                        job.recipeId,
                        job
                    );
                }
            }
        }

        if (changed) {

            GameState.set(
                'farm.buildings',
                [...buildings]
            );
        }
    }

    // =========================================================
    // OFFLINE PROGRESS
    // =========================================================

    _processOffline(seconds) {

        if (
            !seconds ||
            seconds <= 0
        ) {
            return;
        }

        const buildings =
            GameState.get(
                'farm.buildings'
            );

        if (!buildings) {
            return;
        }

        const now =
            Date.now();

        let changed = false;

        for (
            const building
            of buildings
        ) {

            if (
                !building.productionQueue
            ) {
                continue;
            }

            for (
                const job
                of building.productionQueue
            ) {

                if (
                    job.state === 'producing' &&
                    now >= job.readyAt
                ) {

                    job.state = 'ready';

                    changed = true;

                    Events.emit(
                        'production:ready',
                        building.id,
                        job.recipeId,
                        job
                    );
                }
            }
        }

        if (changed) {

            GameState.set(
                'farm.buildings',
                [...buildings]
            );
        }
    }

    // =========================================================
    // SLOTS & SPEED-UP — مصارف الجواهر (Brief §1 «Economy»)
    // =========================================================

    /**
     * عدد الخانات الفعلي لآلة: خانة واحدة افتراضيًا + ما فُتح بالجواهر.
     * @param {object} building إدخال مبنى من farm.buildings
     */
    getQueueLimit(building) {
        if (!building) return 1;
        const def = getBuilding(building.typeId) || {};
        const base = Math.max(1, Number(def.queueLimit) || Number(building.queueLimit) || 1);
        const extra = Math.max(0, Number(building.extraSlots) || 0);
        const max = Math.max(base, Number(def.maxSlots) || base);
        return Math.min(max, base + extra);
    }

    /** تكلفة فتح الخانة التالية (جواهر) أو null إن بلغت الحد. */
    getNextSlotCost(buildingId) {
        const building = this.getBuilding(buildingId);
        if (!building) return null;
        const def = getBuilding(building.typeId) || {};
        const extra = Math.max(0, Number(building.extraSlots) || 0);
        const base = Math.max(1, Number(def.queueLimit) || 1);
        const max = Math.max(base, Number(def.maxSlots) || base);
        if (base + extra >= max) return null;
        return EXTRA_SLOT_GEM_COST[Math.min(extra, EXTRA_SLOT_GEM_COST.length - 1)];
    }

    /** فتح خانة إنتاج إضافية بالجواهر. */
    unlockSlot(buildingId) {
        const buildings = GameState.get('farm.buildings') || [];
        const building = buildings.find(b => b.id === buildingId);
        if (!building) return { success: false, error: 'الآلة غير موجودة' };

        const cost = this.getNextSlotCost(buildingId);
        if (cost === null) {
            return { success: false, error: 'بلغت أقصى عدد خانات لهذه الآلة' };
        }

        const gems = GameState.get('player.gems') || 0;
        if (gems < cost) {
            return { success: false, error: `تحتاج ${cost} 💎 لفتح خانة إضافية`, reason: 'not-enough-gems' };
        }

        GameState.set('player.gems', gems - cost);
        building.extraSlots = (Number(building.extraSlots) || 0) + 1;
        building.queueLimit = this.getQueueLimit(building);
        GameState.set('farm.buildings', [...buildings]);

        Events.emit('production:slot-unlocked', buildingId, building.queueLimit, cost);

        return { success: true, slots: building.queueLimit, cost };
    }

    /** تسريع وظيفة قيد الإنتاج بالجواهر (بدل انتظار المؤقّت الحقيقي). */
    speedUp(buildingId, jobId) {
        const buildings = GameState.get('farm.buildings') || [];
        const building = buildings.find(b => b.id === buildingId);
        if (!building) return { success: false, error: 'الآلة غير موجودة' };

        const job = (building.productionQueue || []).find(j => j.id === jobId);
        if (!job) return { success: false, error: 'لا يوجد إنتاج بهذا المعرّف' };

        const remaining = Math.max(0, (job.readyAt || 0) - Date.now());
        if (remaining <= 0) {
            return { success: false, error: 'الإنتاج جاهز بالفعل — استلمه' };
        }

        const gems = GameState.get('player.gems') || 0;
        if (gems < SPEEDUP_GEM_COST) {
            return { success: false, error: `تحتاج ${SPEEDUP_GEM_COST} 💎 للتسريع`, reason: 'not-enough-gems' };
        }

        GameState.set('player.gems', gems - SPEEDUP_GEM_COST);
        job.readyAt = Math.max(
            Date.now(),
            (job.readyAt || Date.now()) - SPEEDUP_SECONDS_PER_GEM * SPEEDUP_GEM_COST * 1000
        );
        if (Date.now() >= job.readyAt) job.state = 'ready';
        GameState.set('farm.buildings', [...buildings]);

        Events.emit('production:speedup', buildingId, jobId, SPEEDUP_GEM_COST);

        return { success: true, readyAt: job.readyAt, cost: SPEEDUP_GEM_COST };
    }

    // =========================================================
    // HELPERS
    // =========================================================

    getProductions(
        buildingId
    ) {

        const building =
            this.getBuilding(
                buildingId
            );

        return (
            building?.productionQueue ||
            []
        );
    }

    getBuilding(
        buildingId
    ) {

        return GameState.get(
            'farm.buildings'
        ).find(
            b => b.id === buildingId
        );
    }

    getProduction(
        buildingId,
        jobId
    ) {

        return this.getProductions(
            buildingId
        ).find(
            job => job.id === jobId
        );
    }

    isProducing(
        buildingId
    ) {

        return this.getProductions(
            buildingId
        ).length > 0;
    }

    getReadyProductions(
        buildingId
    ) {

        return this.getProductions(
            buildingId
        ).filter(
            job =>
                job.state === 'ready' ||
                Date.now() >= job.readyAt
        );
    }

    getAvailableRecipes(
        buildingType
    ) {

        const level =
            GameState.get(
                'player.level'
            );

        return Object.values(
            RECIPES
        ).filter(
            recipe => {

                const correctBuilding =
                    !recipe.building ||
                    recipe.building ===
                    buildingType;

                const unlocked =
                    !recipe.unlockLevel ||
                    recipe.unlockLevel <= level;

                return (
                    correctBuilding &&
                    unlocked
                );
            }
        );
    }
}

export const ProductionSystem =
    new ProductionSystemService();