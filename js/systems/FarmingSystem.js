/**
 * ============================================================
 * MY FARM 3D - REAL FARMING SYSTEM & GROWTH ENGINE
 * ============================================================
 * Slot lifecycle (per spec P1):
 *   empty → growing (3 visual stages) → ready → empty
 *                                      ↘ withered (legacy only — gated OFF)
 *
 * سجل التغيير (Work Order):
 *   MF-02 — الذبول أُزيل من الحلقة الأساسية (قرار Hay Day): المحصول
 *           الناضج ينتظر اللاعب إلى الأبد ولا لاعب يخسر مزروعاته.
 *           المسار محفوظ خلف FARMING_CONFIG.witherEnabled (افتراضيًا
 *           مطفأ) لآلية «غياب طويل» مستقبلية، ومحاصيل الذوبان القديمة
 *           في الحفوظات تُحيى إلى «ready» عند الترطيب.
 *
 * Persistence: every field's 4 slots live INSIDE `farm.tiles[i].slots`
 * (GameState → SaveManager), so a page refresh restores the crops.
 * `plotSlots` is only a live view of that same array.
 *
 * Harvest no longer pays coins — it puts the crop in the inventory.
 * Coins come from InventorySystem.sell / orders / market.
 * ============================================================
 */
import { Events } from '../core/EventBus.js';
import { GameState } from '../core/GameState.js';
import { SaveManager } from '../core/SaveManager.js';
import { InventorySystem } from './InventorySystem.js';
import { StorageSystem } from './StorageSystem.js';
import { XPSystem } from './XPSystem.js';
import {
    ITEMS,
    FERTILIZERS,
    CROP_QUALITIES,
    FARMING_CONFIG,
    rollCropQuality,
    fertilizerTierByItem
} from '../data/GameData.js';

export const CROPS_DEFINITIONS = Object.freeze({
    wheat: {
        id: 'wheat',
        name: 'قمح',
        icon: '🌾',
        seedId: 'wheat_seed',
        growTime: 10,
        xpReward: 15,
        sellPrice: 25,
        colors: { sprout: 0x86d942, growing: 0x57b327, ready: 0xffd54f }
    },
    corn: {
        id: 'corn',
        name: 'ذرة',
        icon: '🌽',
        seedId: 'corn_seed',
        growTime: 16,
        xpReward: 25,
        sellPrice: 45,
        colors: { sprout: 0x9be046, growing: 0x68c728, ready: 0xf5a623 }
    },
    carrot: {
        id: 'carrot',
        name: 'جزر',
        icon: '🥕',
        seedId: 'carrot_seed',
        growTime: 22,
        xpReward: 35,
        sellPrice: 65,
        colors: { sprout: 0x72c738, growing: 0x4aa625, ready: 0xff7043 }
    },
    tomato: {
        id: 'tomato',
        name: 'طماطم',
        icon: '🍅',
        seedId: 'tomato_seed',
        growTime: 28,
        xpReward: 45,
        sellPrice: 85,
        colors: { sprout: 0x76cc3f, growing: 0x4caf50, ready: 0xe53935 }
    },
    soybean: {
        id: 'soybean',
        name: 'فول صويا',
        icon: '🫛',
        seedId: 'soybean_seed',
        growTime: 40,
        xpReward: 60,
        sellPrice: 95,
        colors: { sprout: 0x8fd44a, growing: 0x5aa832, ready: 0xb6d94a }
    },
    sugarcane: {
        id: 'sugarcane',
        name: 'قصب سكر',
        icon: '🎋',
        seedId: 'sugarcane_seed',
        growTime: 60,
        xpReward: 80,
        sellPrice: 110,
        colors: { sprout: 0x93d95a, growing: 0x4f9c3a, ready: 0xd8c46a }
    }
});

/** Debug aid: `MY_FARM.app.autoSellOnHarvest = true` pays coins instantly. */
const DEBUG_AUTO_SELL_ON_HARVEST = false;

const SLOT_OFFSETS = [-1.2, 1.2];

/** مراتب السماد من الأضعف للأقوى (لمنع downgrade). */
const FERTILIZER_RANK = Object.freeze({ none: 0, basic: 1, quality: 2, deluxe: 3 });

function freshSlots() {
    let i = 0;
    const slots = [];
    for (const oz of SLOT_OFFSETS) {
        for (const ox of SLOT_OFFSETS) {
            slots.push({
                slotIndex: i++,
                ox,
                oz,
                state: 'empty',
                cropType: null,
                plantedAt: 0,
                readyAt: 0,
                witherAt: 0,
                watered: false,
                // مراتب جودة التربة (Brief §1 «Soil quality tiers»):
                // تُضاف على التربة المحروثة قبل الإنبات وتبقى بعد الحصاد.
                fertilizer: 'none',
                quality: null
            });
        }
    }
    return slots;
}

class FarmingSystemService {
    constructor() {
        this.plotSlots = new Map();
        this.autoSellOnHarvest = DEBUG_AUTO_SELL_ON_HARVEST;
        this._lastGrowthCheck = 0;
        this._dirtyFields = new Set();
    }

    /* ========================================================
       PERSISTENCE — slots live in farm.tiles[i].slots
       ======================================================== */

    _tiles() {
        const tiles = GameState.get('farm.tiles');
        return Array.isArray(tiles) ? tiles : [];
    }

    /** Rebuild the live view from a loaded save (called once at boot). */
    hydrate() {
        this.plotSlots.clear();
        for (const tile of this._tiles()) {
            if (!tile?.id) continue;
            this.plotSlots.set(tile.id, this._normalizeSlots(tile.slots));
        }
        return this;
    }

    /** Coerce arbitrary saved data into 4 valid slots. */
    _normalizeSlots(raw) {
        const base = freshSlots();
        if (!Array.isArray(raw)) return base;
        for (let i = 0; i < 4; i++) {
            const s = raw[i];
            if (!s || typeof s !== 'object') continue;
            const cropType = CROPS_DEFINITIONS[s.cropType] ? s.cropType : null;
            const fertilizer = FERTILIZERS[s.fertilizer] ? s.fertilizer : 'none';
            const quality = CROP_QUALITIES[s.quality] ? s.quality : null;
            /*
             * MF-02 (R3: الحفوظات مقدسة): خانة «ذابلة» في حفظ قديم كانت
             * تعني خسارة المحصول — مع إطفاء الذبول نُحييها إلى «ready»
             * (محصول ناضج هدية) بدل أن يرى اللاعب حقلًا ميتًا.
             */
            let state = cropType
                ? (['growing', 'ready', 'withered'].includes(s.state) ? s.state : 'growing')
                : 'empty';
            if (state === 'withered' && !FARMING_CONFIG.witherEnabled) {
                state = 'ready';
            }

            base[i] = {
                ...base[i],
                cropType,
                watered: !!s.watered,
                plantedAt: Number(s.plantedAt) || 0,
                readyAt: Number(s.readyAt) || 0,
                witherAt: FARMING_CONFIG.witherEnabled ? (Number(s.witherAt) || 0) : 0,
                fertilizer,
                quality,
                state
            };
        }
        return base;
    }

    getOrCreateSlots(fieldId) {
        let slots = this.plotSlots.get(fieldId);
        if (!slots) {
            const tile = this._tiles().find(t => t.id === fieldId);
            slots = this._normalizeSlots(tile?.slots);
            this.plotSlots.set(fieldId, slots);
        }
        return slots;
    }

    /** Write the live slots back into GameState + disk. */
    _persist(fieldId) {
        const tiles = this._tiles();
        const index = tiles.findIndex(t => t.id === fieldId);
        const slots = this.getOrCreateSlots(fieldId);

        if (index === -1) return;

        tiles[index] = { ...tiles[index], slots: slots.map(s => ({ ...s })) };
        GameState.set('farm.tiles', tiles);
        SaveManager.save();
    }

    /* ========================================================
       FIELD HELPERS
       ======================================================== */

    isFieldFarmable(fieldId) {
        const tile = this._tiles().find(t => t.id === fieldId);
        return !!(tile && tile.purchased && tile.prepared);
    }

    /** First farmable slot of a field that is ready to harvest / needs water. */
    findActionableSlot(fieldId, wantedState) {
        return this.getOrCreateSlots(fieldId).find(s => s.state === wantedState) || null;
    }

    /* ========================================================
       ACTIONS
       ======================================================== */

    plantSeed(fieldId, slotIndex, cropType = 'wheat', options = {}) {
        if (!this.isFieldFarmable(fieldId)) {
            return { success: false, error: 'هذه الأرض غير مجهزة للزراعة بعد' };
        }

        const slots = this.getOrCreateSlots(fieldId);
        const slot = slots[slotIndex];
        if (!slot || slot.state !== 'empty') {
            return { success: false, error: 'الخانة مشغولة' };
        }

        const cropDef = CROPS_DEFINITIONS[cropType] || CROPS_DEFINITIONS.wheat;

        // البذرة تُستهلك من المخزن إلا في وضع debug السريع
        if (!options.skipSeedCost) {
            const removed = InventorySystem.remove(cropDef.seedId, 1);
            if (!removed.success) {
                return { success: false, error: `لا توجد ${ITEMS[cropDef.seedId]?.name || 'بذور'} كافية`, needSeed: true };
            }
        }

        const now = Date.now();
        const growMs = cropDef.growTime * 1000;

        slot.state = 'growing';
        slot.cropType = cropDef.id;
        slot.plantedAt = now;
        slot.readyAt = now + growMs;
        // MF-02: لا ذبول في الحلقة الأساسية — 0 يعني «بلا موعد ذبول إطلاقًا».
        slot.witherAt = FARMING_CONFIG.witherEnabled ? now + growMs * 2 : 0;
        slot.watered = false;
        slot.quality = null;              // تُسحب عند الحصاد من مرتبة السماد

        this._persist(fieldId);
        Events.emit('crop:planted', { fieldId, slotIndex, cropType, slot });
        return { success: true, slot };
    }

    waterSlot(fieldId, slotIndex) {
        const slots = this.getOrCreateSlots(fieldId);
        const slot = slots[slotIndex];
        if (!slot || slot.state !== 'growing') return { success: false, error: 'لا يوجد محصول ينمو هنا' };
        if (slot.watered) return { success: false, error: 'هذا المحصول مُروى بالفعل' };

        slot.watered = true;
        slot.readyAt -= 3500;
        slot.witherAt = 0; // الري يحمي من الذبول (حين تُفعَّل الميزة مستقبلًا)

        this._persist(fieldId);
        Events.emit('crop:watered', { fieldId, slotIndex, slot });
        return { success: true, slot };
    }

    /* ========================================================
       SOIL QUALITY TIERS — مراتب جودة التربة (Brief §1)
       ------------------------------------------------------------
       Normal / Basic / Quality / Deluxe:
         • تُضاف على تربة محروثة فارغة (قبل الإنبات) أو على محصول
           لم يتجاوز مرحلة البادرة بعد.
         • المرتبة الأعلى تربح دائمًا — لا downgrade.
         • السماد يبقى في الخانة بعد الحصاد (استثمار دائم في التربة).
         • عند الحصاد تُسحب الجودة: normal → silver → gold،
           والديلوكس وحده يفتح المرتبة الأعلى (platinum).
       ======================================================== */

    /**
     * تسميد خانة.
     * @param {string} fieldId
     * @param {number} slotIndex
     * @param {string} tierOrItemId مرتبة ('basic') أو عنصر ('fert_basic')
     */
    fertilizeSlot(fieldId, slotIndex, tierOrItemId) {
        if (!this.isFieldFarmable(fieldId)) {
            return { success: false, error: 'هذه الأرض غير مجهزة للزراعة بعد' };
        }

        const slots = this.getOrCreateSlots(fieldId);
        const slot = slots[slotIndex];
        if (!slot) return { success: false, error: 'خانة غير موجودة' };

        const tier = FERTILIZERS[tierOrItemId]
            ? tierOrItemId
            : (fertilizerTierByItem(tierOrItemId) || null);

        if (!tier || tier === 'none') {
            return { success: false, error: 'سماد غير معروف' };
        }

        const fert = FERTILIZERS[tier];
        const itemId = fert.itemId;

        // «قبل الإنبات قدر الإمكان»: خانة فارغة أو محصول في البادرة.
        if (slot.state === 'growing') {
            const progress = this.growthProgress(slot)?.progress ?? 1;
            if (progress > 0.4) {
                return { success: false, error: 'تأخرت — يُضاف السماد قبل الإنبات' };
            }
        } else if (slot.state === 'ready' || slot.state === 'withered') {
            return { success: false, error: 'أضف السماد على تربة فارغة' };
        }

        if (FERTILIZER_RANK[tier] <= FERTILIZER_RANK[slot.fertilizer || 'none']) {
            return { success: false, error: 'التربة مسمّدة بمرتبة أعلى بالفعل' };
        }

        if (InventorySystem.count(itemId) <= 0) {
            return { success: false, error: `لا يوجد ${ITEMS[itemId]?.name || 'سماد'} في المخزن`, needFertilizer: true };
        }

        const removed = InventorySystem.remove(itemId, 1);
        if (!removed.success) return { success: false, error: removed.error };

        slot.fertilizer = tier;
        if (slot.state === 'growing') {
            // السماد المبكر ينعش النمو قليلًا (مكافأة التوقيت الصحيح).
            slot.readyAt = Math.max(Date.now() + 500, slot.readyAt - 1500);
        }

        this._persist(fieldId);
        Events.emit('crop:fertilized', { fieldId, slotIndex, tier, slot });

        return { success: true, tier, name: fert.name, icon: fert.icon, slot };
    }

    /** مرتبة السماد في خانة (للواجهة/الرسم). */
    getFertilizer(fieldId, slotIndex) {
        const slot = this.getOrCreateSlots(fieldId)[slotIndex];
        return FERTILIZERS[slot?.fertilizer || 'none'] || FERTILIZERS.none;
    }

    /**
     * الحصاد: يدخل المحصول للصوامع (+بذرة واحدة رجوعًا) ولا يدفع كوينز.
     * العملات تأتي من البيع / الطلبات / السوق.
     *
     * قواعد Hay Day المطبّقة هنا:
     *   • الصوامع ممتلئة ⇒ الحصاد ممنوع (لا ضياع صامت للمحصول).
     *   • الجودة تُسحب من مرتبة السماد وتُخزَّن مع المحصول.
     *   • السماد يبقى في التربة ⇒ «ازرع مرة أخرى» دائمًا متاح.
     *   • فرصة سقوط مادة ترقية (مسامير/ألواح/شريط).
     */
    harvestSlot(fieldId, slotIndex) {
        const slots = this.getOrCreateSlots(fieldId);
        const slot = slots[slotIndex];
        if (!slot) return { success: false, error: 'خانة غير موجودة' };

        if (slot.state === 'withered') {
            this._clearSlot(slot);
            this._persist(fieldId);
            Events.emit('crop:withered-cleared', { fieldId, slotIndex });
            return { success: true, cleared: true, crop: null };
        }

        if (slot.state !== 'ready') {
            return { success: false, error: 'المحصول لم ينضج بعد' };
        }

        const cropDef = CROPS_DEFINITIONS[slot.cropType] || CROPS_DEFINITIONS.wheat;
        const fert = FERTILIZERS[slot.fertilizer || 'none'] || FERTILIZERS.none;
        const doubleChance = 0.25 + (fert.yieldBonus || 0) * 0.5;
        const yieldAmount = 1 + (Math.random() < doubleChance ? 1 : 0);

        /*
         * بوابة الصوامع: المحاصيل الخام والبذور تدخل الصوامع فقط،
         * وكلاهما يتنافس على نفس الفراغ — لذلك نحجز مكان
         * «المحصول + رجوع البذرة» معًا قبل بدء الحصاد.
         *
         * GAP-02 — البوابة كانت تحجز مكان المحصول وحده، ثم يُضاف رجوع
         * البذرة بلا بوابة. النتيجة: حصاد يُعلن `success:true` بينما
         * تُبتلع البذرة بصمت (صوامع على الحافة) ⇒ اللاعب يفقد القدرة
         * على إعادة الزرع بلا أي إشعار. الآن: لا يتّسع الاثنان ⇒ لا
         * حصاد، ورسالة واضحة — نفس قاعدة «لا ضياع صامت» المطبَّقة
         * أصلًا على الصوامع الممتلئة تمامًا.
         */
        const seedId = cropDef.seedId;
        const seedRefund = yieldAmount;
        const totalNeed = yieldAmount + seedRefund;
        const siloRoom = StorageSystem.free('silo');

        /*
         * POLISH-01: قرار واحد من البوابة الموحّدة بدل حسابين متوازيين.
         * نطلب الكمية الكلية (محصول + بذرة) لأن الاثنين في الصوامع.
         */
        const gate = StorageSystem.gateAdd(cropDef.id, totalNeed);

        if (!gate.ok) {
            StorageSystem.reportFull('silo');
            return {
                success: false,
                error: StorageSystem.fullMessage('silo'),
                reason: 'silo_full',
                need: { crop: yieldAmount, seed: seedRefund, free: siloRoom }
            };
        }

        const quality = rollCropQuality(slot.fertilizer || 'none');
        const added = InventorySystem.add(cropDef.id, gate.allowed, quality);
        if (!added.success) {
            return { success: false, error: added.error || 'silo_full' };
        }

        /*
         * رجوع البذرة حتى تبقى الحلقة مستدامة بدون متجر.
         * GAP-02: مضمون الآن لأن مكانه محجوز أعلاه — ونبلّغ به في النتيجة.
         */
        const refunded = InventorySystem.add(seedId, seedRefund, 'normal');
        const seedReturned = refunded.success ? refunded.added : 0;

        const qualityDef = CROP_QUALITIES[quality] || CROP_QUALITIES.normal;
        const xp = Math.round(cropDef.xpReward * qualityDef.xpMultiplier);
        XPSystem.addXp(xp, 'harvest');

        const stats = GameState.get('stats') || {};
        GameState.set('stats.totalHarvests', (stats.totalHarvests || 0) + added.added);

        // مادة ترقية من الحصاد (Brief §1 «Upgrade both with supplies»).
        const drop = StorageSystem.rollSupplyDrop('harvest');

        let coins = 0;
        if (this.autoSellOnHarvest) {
            coins = InventorySystem.sell(cropDef.id, added.added).coins || 0;
        }

        this._clearSlot(slot);
        this._persist(fieldId);

        Events.emit('crop:harvested', {
            fieldId,
            slotIndex,
            crop: cropDef,
            itemId: cropDef.id,
            amount: added.added,
            seedId,
            seedReturned,
            quality,
            qualityName: qualityDef.name,
            qualityIcon: qualityDef.icon,
            supplyDrop: drop,
            coins,
            xp
        });

        return {
            success: true,
            crop: cropDef,
            amount: added.added,
            seedId,
            seedReturned,
            quality,
            qualityName: qualityDef.name,
            qualityIcon: qualityDef.icon,
            supplyDrop: drop,
            coins,
            xp
        };
    }

    /** ازرع في أول خانة فارغة (مفيد للزراعة السريعة من الـ Hotbar). */
    plantSeedInField(fieldId, cropType = 'wheat', options = {}) {
        const slots = this.getOrCreateSlots(fieldId);
        const index = slots.findIndex(s => s.state === 'empty');
        if (index === -1) return { success: false, error: 'كل خانات الحقل ممتلئة' };
        return this.plantSeed(fieldId, index, cropType, options);
    }

    /** احصد كل ما نضج في الحقل. */
    harvestField(fieldId) {
        const slots = this.getOrCreateSlots(fieldId);
        let total = 0;
        let crop = null;
        slots.forEach((slot, idx) => {
            if (slot.state !== 'ready') return;
            const res = this.harvestSlot(fieldId, idx);
            if (res.success) {
                total += res.amount || 0;
                crop = res.crop;
            }
        });
        return total > 0 ? { success: true, amount: total, crop } : { success: false, error: 'لا يوجد محصول ناضج' };
    }

    _clearSlot(slot) {
        slot.state = 'empty';
        slot.cropType = null;
        slot.watered = false;
        slot.plantedAt = 0;
        slot.readyAt = 0;
        slot.witherAt = 0;
        slot.quality = null;
        // السماد استثمار دائم في التربة — يبقى بعد الحصاد (Brief §1).
    }

    /**
     * نمو المحاصيل — يستدعى كل إطار لكنه يعمل بتردد ~4Hz.
     * يعيد قائمة الحقول التي تغيّرت حالة خاناتها ليعيد الرسم فقط لها.
     */
    updateGrowth() {
        const now = Date.now();
        if (now - this._lastGrowthCheck < 250) return null;
        this._lastGrowthCheck = now;

        this._dirtyFields.clear();

        for (const [fieldId, slots] of this.plotSlots.entries()) {
            slots.forEach(slot => {
                if (slot.state === 'growing') {
                    if (now >= slot.readyAt) {
                        slot.state = 'ready';
                        this._dirtyFields.add(fieldId);
                        Events.emit('crop:ready', { fieldId, slot });
                    }
                }

                /*
                 * MF-02 — الذبول خارج الحلقة الأساسية (FARMING_CONFIG.witherEnabled
                 * الافتراضي مطفأ). المسار محفوظ لآلية «غياب طويل» مستقبلية:
                 * محصول لم يُروَ حتى 2× مدة النمو يفسد — ويسري على الناضج كذلك.
                 */
                if (
                    FARMING_CONFIG.witherEnabled &&
                    (slot.state === 'growing' || slot.state === 'ready') &&
                    !slot.watered &&
                    slot.witherAt > 0 &&
                    now >= slot.witherAt
                ) {
                    slot.state = 'withered';
                    this._dirtyFields.add(fieldId);
                    Events.emit('crop:withered', { fieldId, slot });
                }
            });
        }

        if (this._dirtyFields.size > 0) {
            for (const fieldId of this._dirtyFields) this._persist(fieldId);
        }

        return this._dirtyFields.size ? this._dirtyFields : null;
    }

    /** نمو فوري (debug) : ينضج كل محصول نامٍ في الحقل. */
    forceReady(fieldId) {
        for (const slot of this.getOrCreateSlots(fieldId)) {
            if (slot.state === 'growing') slot.readyAt = Date.now();
        }
        this._lastGrowthCheck = 0;
        this.updateGrowth();
    }

    /**
     * MF-10 — درس أول ٦٠ ثانية: قمح اللاعب الجديد الأول يُسرَّع ليُنضج
     * بعد `totalMs` من الآن (افتراضي دقيقة). لا يمس أي خانة أخرى،
     * ويعيد false إن لم تكن الخانة في طور النمو (لا وعود كاذبة).
     */
    accelerateForTutorial(fieldId, slotIndex, totalMs = 60000) {
        const slot = this.getOrCreateSlots(fieldId)[slotIndex];
        if (!slot || slot.state !== 'growing') return false;

        slot.readyAt = Date.now() + Math.max(1000, Number(totalMs) || 60000);
        slot.witherAt = 0; // MF-02: محصول الدرس لا يذبل مثل كل المحاصيل
        this._persist(fieldId);
        return true;
    }

    /**
     * بيع محصول من المخزن (الحصاد → المخزن → العملات).
     * `crop:sold` ينبعث داخل InventorySystem لتتبع المهام.
     */
    sellHarvest(itemId, amount = 1) {
        const sold = InventorySystem.sell(itemId, amount);
        if (sold.success) {
            const stats = GameState.get('stats') || {};
            GameState.set('stats.totalSales', (stats.totalSales || 0) + sold.coins);
        }
        return sold;
    }

    /** 0..1 نمو خانة + المرحلة المرئية (sprout/growing/ready). */
    growthProgress(slot) {
        if (!slot || slot.state === 'empty' || !slot.cropType) return null;
        if (slot.state === 'withered') return { progress: 1, stage: 'withered' };
        if (slot.state === 'ready') return { progress: 1, stage: 'ready' };

        const cropDef = CROPS_DEFINITIONS[slot.cropType] || CROPS_DEFINITIONS.wheat;
        const total = cropDef.growTime * 1000;
        const remaining = Math.max(0, slot.readyAt - Date.now());
        const progress = Math.min(1, Math.max(0, 1 - remaining / total));
        const stage = progress < 0.4 ? 'sprout' : 'growing';
        return { progress, stage };
    }
}

export const FarmingSystem = new FarmingSystemService();
