/**
 * ============================================================
 * GameData.js — الجريدة المركزية للعبة MY FARM 3D
 * ============================================================
 * Central read-only game content: items, crops, buildings,
 * recipes (Hay Day-style production chains), animals, economy
 * tuning, NPCs, orders, decorations and tools.
 *
 * Arabic display names follow the same convention used by
 * FarmingSystem.js (القمح، الذرة، الجزر، الطماطم).
 *
 * Consumed by: ProductionSystem, BuildingSystem, AnimalSystem,
 * MarketSystem, OrderSystem, FarmingSystem, Components.
 * (GAP-06: أُزيل ذكر SocialSystem/EventSystem — وحدتان محذوفتان.)
 *
 * سجل التغيير (Work Order):
 *   MF-02 — FARMING_CONFIG.witherEnabled (افتراضيًا false): المحاصيل لا تذبل.
 *   MF-03 — ECONOMY.startingEnergy حُذفت مع نظام الطاقة بالكامل.
 * ============================================================
 * سجل التغيير (Work Order):
 *   MF-03 — حُذف كتالوج الطاقة (ECONOMY.energy) نهائيًا.
 *   MF-05 — بيانات جديدة: QUEST_POOL/CUSTOMER_POOL/CALENDAR (مصدر R1 الوحيد).
 */

/*
 * خطة الـ zoning الواحدة (FarmLayout) — بلا THREE وبلا استيراد عكسي،
 * فتبقى GameData قابلة للاختبار في Node ومصدرًا واحدًا للمواضع.
 */
import { PRODUCTION_COURT } from '../world/FarmLayout.js';

/* ============================================================
   CROPS — مرآة CROPS_DEFINITIONS في FarmingSystem.js
   ============================================================ */

export const CROPS = Object.freeze({
    wheat: {
        id: 'wheat',
        name: 'قمح',
        nameEn: 'Wheat',
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
        nameEn: 'Corn',
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
        nameEn: 'Carrot',
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
        nameEn: 'Tomato',
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
        nameEn: 'Soybean',
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
        nameEn: 'Sugarcane',
        icon: '🎋',
        seedId: 'sugarcane_seed',
        growTime: 60,
        xpReward: 80,
        sellPrice: 110,
        colors: { sprout: 0x93d95a, growing: 0x4f9c3a, ready: 0xd8c46a }
    }
});

/* ============================================================
   ITEMS — كل ما يمكن تخزينه أو تداوله في المخزن
   (محاصيل + بذور + منتجات معالجة + منتجات حيوانية)
   ============================================================ */

export const ITEMS = Object.freeze({
    // ---- Raw crops (SILO — صوامع المحاصيل الخام) ----
    wheat:       { id: 'wheat',       name: 'قمح',            nameEn: 'Wheat',        icon: '🌾', category: 'crop',     sellPrice: 25 },
    corn:        { id: 'corn',        name: 'ذرة',            nameEn: 'Corn',         icon: '🌽', category: 'crop',     sellPrice: 45 },
    carrot:      { id: 'carrot',      name: 'جزر',            nameEn: 'Carrot',       icon: '🥕', category: 'crop',     sellPrice: 65 },
    tomato:      { id: 'tomato',      name: 'طماطم',          nameEn: 'Tomato',       icon: '🍅', category: 'crop',     sellPrice: 85 },
    soybean:     { id: 'soybean',     name: 'فول صويا',       nameEn: 'Soybean',      icon: '🫛', category: 'crop',     sellPrice: 95 },
    sugarcane:   { id: 'sugarcane',   name: 'قصب سكر',        nameEn: 'Sugarcane',    icon: '🎋', category: 'crop',     sellPrice: 110 },

    // ---- Seeds (SILO) ----
    wheat_seed:     { id: 'wheat_seed',     name: 'بذور القمح',     nameEn: 'Wheat Seeds',     icon: '🌱', category: 'seed', sellPrice: 5 },
    corn_seed:      { id: 'corn_seed',      name: 'بذور الذرة',     nameEn: 'Corn Seeds',      icon: '🌱', category: 'seed', sellPrice: 9 },
    carrot_seed:    { id: 'carrot_seed',    name: 'بذور الجزر',     nameEn: 'Carrot Seeds',    icon: '🌱', category: 'seed', sellPrice: 13 },
    tomato_seed:    { id: 'tomato_seed',    name: 'بذور الطماطم',   nameEn: 'Tomato Seeds',    icon: '🌱', category: 'seed', sellPrice: 17 },
    soybean_seed:   { id: 'soybean_seed',   name: 'بذور الصويا',    nameEn: 'Soybean Seeds',   icon: '🌱', category: 'seed', sellPrice: 21 },
    sugarcane_seed: { id: 'sugarcane_seed', name: 'عُقل القصب',     nameEn: 'Sugarcane Sets',  icon: '🌱', category: 'seed', sellPrice: 25 },

    // ---- Grain Mill products (BARN) ----
    flour:        { id: 'flour',        name: 'دقيق',          nameEn: 'Flour',        icon: '🥣', category: 'milled',   sellPrice: 90 },
    corn_flour:   { id: 'corn_flour',   name: 'دقيق الذرة',    nameEn: 'Corn Flour',   icon: '🌽', category: 'milled',   sellPrice: 150 },
    sugar:        { id: 'sugar',        name: 'سكر',           nameEn: 'Sugar',        icon: '🍬', category: 'milled',   sellPrice: 180 },

    // ---- Feed Mill products (BARN) — علف لكل نوع حيوان ----
    chicken_feed: { id: 'chicken_feed', name: 'علف الدجاج',    nameEn: 'Chicken Feed', icon: '🫘', category: 'feed',     sellPrice: 35 },
    cow_feed:     { id: 'cow_feed',     name: 'علف الأبقار',   nameEn: 'Cow Feed',     icon: '🌿', category: 'feed',     sellPrice: 60 },
    sheep_feed:   { id: 'sheep_feed',   name: 'علف الأغنام',   nameEn: 'Sheep Feed',   icon: '🍃', category: 'feed',     sellPrice: 55 },
    pig_feed:     { id: 'pig_feed',     name: 'علف الخنازير',  nameEn: 'Pig Feed',     icon: '🥔', category: 'feed',     sellPrice: 50 },

    // ---- Bakery products (BARN) ----
    bread:         { id: 'bread',         name: 'خبز',          nameEn: 'Bread',        icon: '🍞', category: 'baked',    sellPrice: 260 },
    corn_bread:    { id: 'corn_bread',    name: 'خبز الذرة',    nameEn: 'Corn Bread',   icon: '🥖', category: 'baked',    sellPrice: 420 },
    tomato_pastry: { id: 'tomato_pastry', name: 'فطيرة الطماطم', nameEn: 'Tomato Pie',  icon: '🥧', category: 'baked',    sellPrice: 480 },
    carrot_cake:   { id: 'carrot_cake',   name: 'كيك الجزر',    nameEn: 'Carrot Cake',  icon: '🍰', category: 'baked',    sellPrice: 650 },

    // ---- Animal products (BARN) ----
    egg:  { id: 'egg',  name: 'بيض',  nameEn: 'Egg',  icon: '🥚', category: 'animal', sellPrice: 60 },
    milk: { id: 'milk', name: 'حليب', nameEn: 'Milk', icon: '🥛', category: 'animal', sellPrice: 140 },
    wool: { id: 'wool', name: 'صوف',  nameEn: 'Wool', icon: '🧶', category: 'animal', sellPrice: 220 },
    truffle: { id: 'truffle', name: 'كمأة', nameEn: 'Truffle', icon: '🍄', category: 'animal', sellPrice: 180 },

    // ---- Dairy products (BARN) — حليب ← قشطة ← زبدة ← جبن ----
    cream:  { id: 'cream',  name: 'قشطة',  nameEn: 'Cream',  icon: '🍶', category: 'dairy', sellPrice: 260 },
    butter: { id: 'butter', name: 'زبدة',  nameEn: 'Butter', icon: '🧈', category: 'dairy', sellPrice: 420 },
    cheese: { id: 'cheese', name: 'جبن',   nameEn: 'Cheese', icon: '🧀', category: 'dairy', sellPrice: 640 },

    // ---- Supplies (BARN) — مواد ترقية الصوامع/المخزن ----
    nail:      { id: 'nail',      name: 'مسامير',    nameEn: 'Nails',     icon: '🔩', category: 'supply', sellPrice: 0 },
    plank:     { id: 'plank',     name: 'ألواح خشب', nameEn: 'Planks',    icon: '🪵', category: 'supply', sellPrice: 0 },
    duct_tape: { id: 'duct_tape', name: 'شريط لاصق', nameEn: 'Duct Tape', icon: '🎗️', category: 'supply', sellPrice: 0 },

    // ---- Fertilizers (BARN) — مراتب جودة التربة ----
    fert_basic:    { id: 'fert_basic',    name: 'سماد أساسي',  nameEn: 'Basic Fertilizer',    icon: '🧪', category: 'fertilizer', sellPrice: 40 },
    fert_quality:  { id: 'fert_quality',  name: 'سماد فاخر',   nameEn: 'Quality Fertilizer',  icon: '⚗️', category: 'fertilizer', sellPrice: 90 },
    fert_deluxe:   { id: 'fert_deluxe',   name: 'سماد ديلوكس', nameEn: 'Deluxe Fertilizer',   icon: '✨', category: 'fertilizer', sellPrice: 180 }
});

/* ============================================================
   STORAGE ROUTING — الصوامع مقابل المخزن (Hay Day silo/barn)
   ------------------------------------------------------------
   القاعدة الوحيدة المعتمدة في كل الأنظمة:
     المحاصيل الخام + البذور  ⇒ الصوامع (Silo)
     كل شيء آخر               ⇒ المخزن (Barn)
   ============================================================ */

export const SILO_CATEGORIES = Object.freeze(['crop', 'seed']);

/** @returns {'silo'|'barn'} */
export function getStorageOf(itemId) {
    const def = itemId ? ITEMS[itemId] : null;
    if (!def) return 'barn';
    return SILO_CATEGORIES.includes(def.category) ? 'silo' : 'barn';
}

/* ============================================================
   CROP QUALITY — مراتب جودة المحصول (Stardew-inspired)
   ------------------------------------------------------------
   normal → silver → gold، والسماد «ديلكس» يفتح المرتبة الأعلى
   (platinum). الجودة تضاعف سعر البيع والخبرة.
   ============================================================ */

export const CROP_QUALITIES = Object.freeze({
    normal:    { id: 'normal',    name: 'عادي',   nameEn: 'Normal',    icon: '⚪', priceMultiplier: 1.0,  xpMultiplier: 1.0  },
    silver:    { id: 'silver',    name: 'فضي',    nameEn: 'Silver',    icon: '🥈', priceMultiplier: 1.35, xpMultiplier: 1.25 },
    gold:      { id: 'gold',      name: 'ذهبي',   nameEn: 'Gold',      icon: '🥇', priceMultiplier: 1.8,  xpMultiplier: 1.6  },
    platinum:  { id: 'platinum',  name: 'بلاتيني', nameEn: 'Platinum', icon: '💠', priceMultiplier: 2.6,  xpMultiplier: 2.2  }
});

/**
 * مراتب السماد: كل مرتبة ترفع احتمالات الجودة.
 * `chances` مرتبة [normal, silver, gold, platinum] ومجموعها 1.
 * `stage` = آخر مرحلة نمو يسمح فيها الإضافة (قبل الإنبات = sprout).
 */
export const FERTILIZERS = Object.freeze({
    none: {
        id: 'none',
        itemId: null,
        name: 'تربة عادية',
        nameEn: 'Normal Soil',
        icon: '🟫',
        chances: [0.88, 0.12, 0.0, 0.0],
        yieldBonus: 0
    },
    basic: {
        id: 'basic',
        itemId: 'fert_basic',
        name: 'سماد أساسي',
        nameEn: 'Basic Fertilizer',
        icon: '🧪',
        chances: [0.62, 0.30, 0.08, 0.0],
        yieldBonus: 0.1
    },
    quality: {
        id: 'quality',
        itemId: 'fert_quality',
        name: 'سماد فاخر',
        nameEn: 'Quality Fertilizer',
        icon: '⚗️',
        /*
         * المرتبة العليا (بلاتيني) حصرية للديلوكس — Brief §1 «Fields»:
         * «normal→silver→gold, deluxe unlocks top tier».
         */
        chances: [0.36, 0.42, 0.22, 0.0],
        yieldBonus: 0.2
    },
    deluxe: {
        id: 'deluxe',
        itemId: 'fert_deluxe',
        name: 'سماد ديلوكس',
        nameEn: 'Deluxe Fertilizer',
        icon: '✨',
        // ديلوكس يفتح المرتبة الأعلى (بلاتيني) — Brief §1 «Fields».
        chances: [0.18, 0.34, 0.32, 0.16],
        yieldBonus: 0.35
    }
});

/** مرتبة السماد من معرّف العنصر في المخزن. */
export function fertilizerTierByItem(itemId) {
    for (const tier of Object.values(FERTILIZERS)) {
        if (tier.itemId === itemId) return tier.id;
    }
    return null;
}

/** سحب جودة من مرتبة السماد. @returns {'normal'|'silver'|'gold'|'platinum'} */
export function rollCropQuality(tierId = 'none', random = Math.random) {
    const tier = FERTILIZERS[tierId] || FERTILIZERS.none;
    const roll = Math.min(0.999999, Math.max(0, random()));
    const order = ['normal', 'silver', 'gold', 'platinum'];
    let acc = 0;
    for (let i = 0; i < order.length; i++) {
        acc += tier.chances[i] || 0;
        if (roll < acc) return order[i];
    }
    return 'normal';
}

/* ============================================================
   STORAGE UPGRADES — ترقية الصوامع/المخزن بمواد البناء
   ------------------------------------------------------------
   كل مستوى يضيف +60 خانة، والتكلفة تتصاعد (Hay Day style).
   المواد تُكسب من: الحصاد، تسليم الطلبات، زوّار الكشك.
   ============================================================ */

export const STORAGE_CONFIG = Object.freeze({
    baseCapacity: 150,
    capacityPerLevel: 60,
    maxLevel: 20,
    /** مواد الترقية لكل من الصوامع والمخزن — نفس الجدول. */
    costFor(level) {
        const next = Math.max(1, level);
        return {
            nail: 2 + next,
            plank: 1 + Math.floor(next / 2),
            duct_tape: next >= 4 ? Math.floor(next / 4) : 0
        };
    },
    /** نسبة سقوط مادة ترقية عند الحصاد/تسليم طلب. */
    dropChance: { harvest: 0.07, order: 0.45, stallSale: 0.22 },
    dropPool: ['nail', 'plank', 'duct_tape']
});


/* ============================================================
   BUILDINGS — المباني (كتالوج الأنواع)
   ============================================================ */

export const BUILDINGS = Object.freeze({
    barn: {
        id: 'barn',
        name: 'الحظيرة',
        nameEn: 'Barn',
        icon: '🛖',
        category: 'storage',
        description: 'مخزن المزرعة الرئيسي.',
        cost: { coins: 0, gems: 0 },
        buildTime: 0,
        unlockLevel: 1,
        size: { w: 2, d: 2 }
    },

    // ---- مطحنة العلف : الآلة الأولى في حلقة Hay Day ----
    feed_mill: {
        id: 'feed_mill',
        name: 'مطحنة العلف',
        epithet: 'مِعلَف المزرعة',
        nameEn: 'Feed Mill',
        icon: '🏭',
        category: 'production',
        description: 'تخلط القمح والذرة والجزر إلى علف لكل حيوان.',
        cost: { coins: 350, gems: 0 },
        buildTime: 0,
        unlockLevel: 2,
        queueLimit: 1,
        maxSlots: 3,
        size: { w: 1, d: 1 }
    },

    // ---- طاحونة الحبوب : المرحلة الأولى من السلسلة ----
    grain_mill: {
        id: 'grain_mill',
        name: 'طاحونة الحبوب',
        epithet: 'نسيم القمح',
        nameEn: 'Grain Mill',
        icon: '🌾',
        category: 'production',
        description: 'تطحن القمح والذرة إلى دقيق وعلف.',
        cost: { coins: 500, gems: 0 },
        buildTime: 0,
        unlockLevel: 1,
        queueLimit: 1,
        maxSlots: 3,
        size: { w: 1, d: 1 }
    },

    // ---- المخبز : المرحلة الثانية من السلسلة ----
    bakery: {
        id: 'bakery',
        name: 'المخبز',
        epithet: 'فرن الفجر',
        nameEn: 'Bakery',
        icon: '🍞',
        category: 'production',
        description: 'يحوّل القمح والدقيق إلى مخبوزات شهية.',
        cost: { coins: 1200, gems: 0 },
        buildTime: 0,
        unlockLevel: 1,
        queueLimit: 1,
        maxSlots: 3,
        size: { w: 1, d: 1 }
    },

    // ---- مصنع الألبان : حليب ← قشطة ← زبدة ← جبن ----
    dairy: {
        id: 'dairy',
        name: 'مصنع الألبان',
        epithet: 'برودة الحليب',
        nameEn: 'Dairy',
        icon: '🥛',
        category: 'production',
        description: 'يحوّل الحليب إلى قشطة وزبدة وجبن.',
        cost: { coins: 1800, gems: 0 },
        buildTime: 0,
        unlockLevel: 3,
        queueLimit: 1,
        maxSlots: 3,
        size: { w: 1, d: 1 }
    },

    // ---- منازل الحيوانات (للمراحل القادمة) ----
    chicken_coop: {
        id: 'chicken_coop',
        name: 'حظيرة الدجاج',
        nameEn: 'Chicken Coop',
        icon: '🐔',
        category: 'animal_home',
        description: 'مأوى الدجاج لإنتاج البيض.',
        cost: { coins: 1500, gems: 0 },
        buildTime: 60,
        unlockLevel: 3,
        size: { w: 1, d: 1 }
    },
    cow_barn: {
        id: 'cow_barn',
        name: 'حظيرة الأبقار',
        nameEn: 'Cow Barn',
        icon: '🐄',
        category: 'animal_home',
        description: 'مأوى الأبقار لإنتاج الحليب.',
        cost: { coins: 4000, gems: 0 },
        buildTime: 180,
        unlockLevel: 5,
        size: { w: 2, d: 2 }
    },
    sheep_pen: {
        id: 'sheep_pen',
        name: 'حظيرة الأغنام',
        nameEn: 'Sheep Pen',
        icon: '🐑',
        category: 'animal_home',
        description: 'مأوى الأغنام لإنتاج الصوف.',
        cost: { coins: 7500, gems: 0 },
        buildTime: 300,
        unlockLevel: 7,
        size: { w: 2, d: 2 }
    },
    pig_sty: {
        id: 'pig_sty',
        name: 'زريبة الخنازير',
        nameEn: 'Pig Sty',
        icon: '🐷',
        category: 'animal_home',
        description: 'مأوى الخنازير لإنتاج الكمأة.',
        cost: { coins: 2500, gems: 0 },
        buildTime: 120,
        unlockLevel: 4,
        size: { w: 2, d: 2 }
    }
});

/* ============================================================
   RECIPES — وصفات الإنتاج (سلسلة Hay Day)
   ------------------------------------------------------------
   الحقول التي يقرأها ProductionSystem:
     building, ingredients[{item,amount}], output{item,amount},
     productionTime (ثوانٍ), unlockLevel
   ============================================================ */

export const RECIPES = Object.freeze({

    // ========== 🌾 طاحونة الحبوب ==========
    flour: {
        id: 'flour',
        building: 'grain_mill',
        name: 'دقيق',
        nameEn: 'Flour',
        icon: '🥣',
        description: 'دقيق ناعم من حبوب القمح — أساس المخبوزات.',
        ingredients: [ { item: 'wheat', amount: 3 } ],
        output: { item: 'flour', amount: 1 },
        productionTime: 30,
        unlockLevel: 1,
        xp: 8,
        sellPrice: 90
    },
    corn_flour: {
        id: 'corn_flour',
        building: 'grain_mill',
        name: 'دقيق الذرة',
        nameEn: 'Corn Flour',
        icon: '🌽',
        description: 'دقيق ذهبي من الذرة — لخبز الذرة الريفي.',
        ingredients: [ { item: 'corn', amount: 3 } ],
        output: { item: 'corn_flour', amount: 1 },
        productionTime: 45,
        unlockLevel: 2,
        xp: 12,
        sellPrice: 150
    },
    sugar: {
        id: 'sugar',
        building: 'grain_mill',
        name: 'سكر',
        nameEn: 'Sugar',
        icon: '🍬',
        description: 'سكر مطحون من قصب السكر — يُفتح لاحقًا مع المخبوزات.',
        ingredients: [ { item: 'sugarcane', amount: 2 } ],
        output: { item: 'sugar', amount: 1 },
        productionTime: 50,
        unlockLevel: 6,
        xp: 14,
        sellPrice: 180
    },

    // ========== 🏭 مطحنة العلف (الآلة الأولى) ==========
    chicken_feed: {
        id: 'chicken_feed',
        building: 'feed_mill',
        name: 'علف الدجاج',
        nameEn: 'Chicken Feed',
        icon: '🫘',
        description: 'خليط حبوب مطحونة لتغذية الدجاج.',
        ingredients: [
            { item: 'wheat', amount: 2 },
            { item: 'corn',  amount: 1 }
        ],
        output: { item: 'chicken_feed', amount: 3 },
        productionTime: 20,
        unlockLevel: 2,
        xp: 6,
        sellPrice: 35
    },
    cow_feed: {
        id: 'cow_feed',
        building: 'feed_mill',
        name: 'علف الأبقار',
        nameEn: 'Cow Feed',
        icon: '🌿',
        description: 'علف غني بالذرة والجزر — يملأ ضرع البقرة.',
        ingredients: [
            { item: 'corn',   amount: 3 },
            { item: 'carrot', amount: 1 }
        ],
        output: { item: 'cow_feed', amount: 2 },
        productionTime: 30,
        unlockLevel: 3,
        xp: 9,
        sellPrice: 60
    },
    sheep_feed: {
        id: 'sheep_feed',
        building: 'feed_mill',
        name: 'علف الأغنام',
        nameEn: 'Sheep Feed',
        icon: '🍃',
        description: 'قمح مضغوط — صوف أنعم وأسرع.',
        ingredients: [
            { item: 'wheat',  amount: 3 },
            { item: 'carrot', amount: 1 }
        ],
        output: { item: 'sheep_feed', amount: 2 },
        productionTime: 30,
        unlockLevel: 4,
        xp: 9,
        sellPrice: 55
    },
    pig_feed: {
        id: 'pig_feed',
        building: 'feed_mill',
        name: 'علف الخنازير',
        nameEn: 'Pig Feed',
        icon: '🥔',
        description: 'ذرة وجزر مهروس — للكمأة الثمينة.',
        ingredients: [
            { item: 'corn',   amount: 2 },
            { item: 'carrot', amount: 2 }
        ],
        output: { item: 'pig_feed', amount: 2 },
        productionTime: 35,
        unlockLevel: 4,
        xp: 10,
        sellPrice: 50
    },

    // ========== 🍞 المخبز ==========
    bread: {
        id: 'bread',
        building: 'bakery',
        name: 'خبز',
        nameEn: 'Bread',
        icon: '🍞',
        description: 'خبز طازج من القمح مباشرة — ذهب المخبز.',
        ingredients: [ { item: 'wheat', amount: 3 } ],
        output: { item: 'bread', amount: 1 },
        productionTime: 60,
        unlockLevel: 1,
        xp: 16,
        sellPrice: 260
    },
    corn_bread: {
        id: 'corn_bread',
        building: 'bakery',
        name: 'خبز الذرة',
        nameEn: 'Corn Bread',
        icon: '🥖',
        description: 'خبز ريفي ذهبي من دقيق الذرة.',
        ingredients: [ { item: 'corn_flour', amount: 2 } ],
        output: { item: 'corn_bread', amount: 1 },
        productionTime: 90,
        unlockLevel: 2,
        xp: 20,
        sellPrice: 420
    },
    tomato_pastry: {
        id: 'tomato_pastry',
        building: 'bakery',
        name: 'فطيرة الطماطم',
        nameEn: 'Tomato Pie',
        icon: '🥧',
        description: 'فطيرة ساخنة محشوة بالطماطم الطازجة.',
        ingredients: [
            { item: 'flour',  amount: 1 },
            { item: 'tomato', amount: 2 }
        ],
        output: { item: 'tomato_pastry', amount: 1 },
        productionTime: 120,
        unlockLevel: 2,
        xp: 26,
        sellPrice: 480
    },
    carrot_cake: {
        id: 'carrot_cake',
        building: 'bakery',
        name: 'كيك الجزر',
        nameEn: 'Carrot Cake',
        icon: '🍰',
        description: 'كيك غني بالجزر والذرة — تحفة المخبز!',
        ingredients: [
            { item: 'flour',  amount: 1 },
            { item: 'corn',   amount: 2 },
            { item: 'carrot', amount: 2 }
        ],
        output: { item: 'carrot_cake', amount: 1 },
        productionTime: 150,
        unlockLevel: 3,
        xp: 34,
        sellPrice: 650
    },

    // ========== 🥛 مصنع الألبان ==========
    cream: {
        id: 'cream',
        building: 'dairy',
        name: 'قشطة',
        nameEn: 'Cream',
        icon: '🍶',
        description: 'قشطة طازجة من حليب البقر — أساس الزبدة.',
        ingredients: [ { item: 'milk', amount: 2 } ],
        output: { item: 'cream', amount: 1 },
        productionTime: 40,
        unlockLevel: 3,
        xp: 14,
        sellPrice: 260
    },
    butter: {
        id: 'butter',
        building: 'dairy',
        name: 'زبدة',
        nameEn: 'Butter',
        icon: '🧈',
        description: 'زبدة مخفوقة من القشطة.',
        ingredients: [ { item: 'cream', amount: 2 } ],
        output: { item: 'butter', amount: 1 },
        productionTime: 60,
        unlockLevel: 4,
        xp: 20,
        sellPrice: 420
    },
    cheese: {
        id: 'cheese',
        building: 'dairy',
        name: 'جبن',
        nameEn: 'Cheese',
        icon: '🧀',
        description: 'قرص جبن معتّق من الحليب والزبدة.',
        ingredients: [
            { item: 'milk',   amount: 3 },
            { item: 'butter', amount: 1 }
        ],
        output: { item: 'cheese', amount: 1 },
        productionTime: 90,
        unlockLevel: 5,
        xp: 30,
        sellPrice: 640
    }
});

/* ============================================================
   ANIMALS — الحيوانات (للمراحل القادمة)
   ============================================================ */

/*
 * الحيوانات المنتجة (Brief §1 «Animals + feed»):
 *   تأكل علفًا خاصًا بالنوع من مطحنة العلف ← الجائع لا ينتج ←
 *   بعد مؤقّت حقيقي تنتج ← يُجمع المنتج في المخزن (Barn).
 * `feedItem` هو الاسم الجديد؛ `feed` يبقى كمرادف للقراءات القديمة.
 */
export const ANIMALS = Object.freeze({
    chicken: {
        id: 'chicken',
        name: 'دجاجة',
        nameEn: 'Chicken',
        icon: '🐔',
        home: 'chicken_coop',
        product: 'egg',
        productAmount: 1,
        productionTime: 300,
        feedItem: 'chicken_feed',
        feed: 'chicken_feed',
        hungerRate: 0.8,
        unlockLevel: 3,
        cost: { coins: 300, gems: 0 }
    },
    cow: {
        id: 'cow',
        name: 'بقرة',
        nameEn: 'Cow',
        icon: '🐄',
        home: 'cow_barn',
        product: 'milk',
        productAmount: 1,
        productionTime: 600,
        feedItem: 'cow_feed',
        feed: 'cow_feed',
        hungerRate: 0.5,
        unlockLevel: 5,
        cost: { coins: 900, gems: 0 }
    },
    sheep: {
        id: 'sheep',
        name: 'خروف',
        nameEn: 'Sheep',
        icon: '🐑',
        home: 'sheep_pen',
        product: 'wool',
        productAmount: 1,
        productionTime: 900,
        feedItem: 'sheep_feed',
        feed: 'sheep_feed',
        hungerRate: 0.5,
        unlockLevel: 7,
        cost: { coins: 1500, gems: 0 }
    },
    pig: {
        id: 'pig',
        name: 'خنزير',
        nameEn: 'Pig',
        icon: '🐷',
        home: 'pig_sty',
        product: 'truffle',
        productAmount: 1,
        productionTime: 780,
        feedItem: 'pig_feed',
        feed: 'pig_feed',
        hungerRate: 0.6,
        unlockLevel: 4,
        cost: { coins: 1200, gems: 0 }
    }
});

/* ============================================================
   EXPANSIONS — توسعات الأرض العشر
   ============================================================ */

export const EXPANSIONS = Object.freeze(
    Array.from({ length: 10 }, (_, i) => {
        const tier = i + 1;
        return {
            tier,
            id: `expansion_${tier}`,
            name: `توسعة ${tier}`,
            nameEn: `Expansion ${tier}`,
            icon: '🗺️',
            cost: {
                coins: Math.round(400 * Math.pow(1.8, i)),
                gems: i >= 6 ? (i - 5) * 2 : 0
            },
            size: { rows: 4 + tier, cols: 6 + tier }
        };
    })
);

/* ============================================================
   ECONOMY — ضبط الاقتصاد
   ============================================================ */

export const ECONOMY = Object.freeze({
    startingCoins: 350,
    startingGems: 10,
    // MF-03: startingEnergy أُزيلت — نظام الطاقة حُذف كليًا (عدّاد وهمي بلا مستهلك).

    maxFriends: 50,
    dailyGiftsLimit: 20,

    maxMarketListings: 10,
    marketDuration: 21600,  // 6 ساعات (ثواني)
    marketFee: 0.10,        // عمولة السوق 10%
    priceVariance: 0.25,    // تذبذب أسعار السوق ±25%

    maxActiveOrders: 6,
    orderRefreshInterval: 300, // 5 دقائق (ثواني)
    orderRewardMultiplier: 1.35
});

/* ============================================================
   FARMING_CONFIG — ضبط حلقة الزراعة
   ============================================================
   MF-02 (قرار منتج — Hay Day): المحاصيل لا تذبل أبدًا.
   الناضج ينتظر اللاعب إلى الأبد؛ لا لاعب يخسر محصولًا مزروعًا.
   يبقى مسار «الذبول» في الرسم والحالة لآلية مستقبلية
   («غياب طويل +24س») خلف هذه الراية — الافتراضي: مطفأ.
   ============================================================ */
export const FARMING_CONFIG = Object.freeze({
    witherEnabled: false
});

/* ============================================================
   NPCS + ORDER_TEMPLATES — لوحة الطلبات
   ============================================================ */

export const NPCS = Object.freeze([
    { id: 'om_salem',    name: 'أم سالم',    avatar: '👵', personality: 'تحب المخبوزات الطازجة' },
    { id: 'ammo_ramadan', name: 'العم رمضان', avatar: '👨‍🌾', personality: 'مزارع قديم يعشق القمح' },
    { id: 'layla',       name: 'ليلى',       avatar: '👩‍🍳', personality: 'طاهية المدينة المشهورة' },
    { id: 'capt_tarek',  name: 'كابتن طارق',  avatar: '🧑‍✈️', personality: 'تاجر الميناء' }
]);

export const ORDER_TEMPLATES = Object.freeze([
    {
        id: 'fresh_bread',
        minLevel: 1,
        items: [ { item: 'bread', min: 1, max: 2 } ],
        reward: { coins: { min: 280, max: 560 }, xp: { min: 20, max: 40 } }
    },
    {
        id: 'wheat_deal',
        minLevel: 1,
        items: [ { item: 'wheat', min: 3, max: 6 } ],
        reward: { coins: { min: 85, max: 170 }, xp: { min: 12, max: 24 } }
    },
    {
        id: 'mill_combo',
        minLevel: 2,
        items: [
            { item: 'flour',  min: 1, max: 2 },
            { item: 'carrot', min: 2, max: 4 }
        ],
        reward: { coins: { min: 260, max: 520 }, xp: { min: 25, max: 50 } }
    },
    {
        id: 'bakery_party',
        minLevel: 3,
        items: [
            { item: 'bread',       min: 1, max: 2 },
            { item: 'carrot_cake', min: 1, max: 1 }
        ],
        reward: { coins: { min: 950, max: 1400 }, xp: { min: 60, max: 90 } }
    }
]);

/* ============================================================
   DECORATIONS + TOOLS
   ============================================================ */

export const DECORATIONS = Object.freeze({
    fence:     { id: 'fence',     name: 'سياج خشبي',  nameEn: 'Fence',     icon: '🚧', category: 'decoration', cost: { coins: 50,  gems: 0 } },
    flowerbed: { id: 'flowerbed', name: 'حوض زهور',   nameEn: 'Flowerbed', icon: '🌷', category: 'decoration', cost: { coins: 120, gems: 0 } },
    scarecrow: { id: 'scarecrow', name: 'فزّاعة',     nameEn: 'Scarecrow', icon: '🧍', category: 'decoration', cost: { coins: 250, gems: 0 } },
    well:      { id: 'well',      name: 'بئر قديم',   nameEn: 'Old Well',  icon: '🕳️', category: 'decoration', cost: { coins: 600, gems: 5 } }
});

export const TOOLS = Object.freeze({
    hoe:           { id: 'hoe',           name: 'مِحراث',    nameEn: 'Hoe',           icon: '⛏️' },
    watering_can:  { id: 'watering_can',  name: 'إبريق الري', nameEn: 'Watering Can', icon: '💧' },
    sickle:        { id: 'sickle',        name: 'منجل',       nameEn: 'Sickle',       icon: '🔪' },
    axe:           { id: 'axe',           name: 'فأس',        nameEn: 'Axe',          icon: '🪓' }
});

/* ============================================================
   STARTER KIT — يزرع عند أول تشغيل (لا يلمس الحفوظات القديمة)
   ============================================================ */

export const STARTER_KIT = Object.freeze({
    // الآلات الثلاث المطلوبة في هذا الـ PR + طاحونة الحبوب (الدقيق).
    buildings: ['feed_mill', 'grain_mill', 'bakery', 'dairy'],
    items: {
        wheat: 12,
        corn: 8,
        carrot: 5,
        // بذور أولية — بدونها لا يمكن بدء حلقة الزراعة (الحصاد يعيد البذرة)
        wheat_seed: 10,
        corn_seed: 7,
        carrot_seed: 5,
        tomato_seed: 3,
        soybean_seed: 2,
        sugarcane_seed: 2,
        // علف بداية حتى تعمل حلقة «محصول ← علف ← حيوان» فورًا
        chicken_feed: 4,
        cow_feed: 3,
        // مراتب جودة التربة + مواد ترقية التخزين
        fert_basic: 3,
        fert_quality: 2,
        nail: 4,
        plank: 2,
        duct_tape: 1
    },
    recipes: ['chicken_feed', 'flour', 'bread', 'cream'],
    // مواقع البناء من خطة zoning واحدة (FarmLayout) — ساحة الإنتاج.
    positions: Object.freeze({
        feed_mill:  { ...PRODUCTION_COURT.machines.feed_mill },
        grain_mill: { ...PRODUCTION_COURT.machines.grain_mill },
        bakery:     { ...PRODUCTION_COURT.machines.bakery },
        dairy:      { ...PRODUCTION_COURT.machines.dairy }
    })
});

/* ============================================================
   LOOKUP HELPERS — دوال البحث
   ============================================================ */

function byId(catalog, id) {
    if (!id || !catalog) return undefined;
    if (catalog[id]) return catalog[id];            // keyed map hit
    if (Array.isArray(catalog)) {                   // array catalogs
        return catalog.find(entry => entry && entry.id === id);
    }
    return Object.values(catalog).find(             // .id field match
        entry => entry && entry.id === id
    );
}

export const getCrop    = id => byId(CROPS, id);
export const getItem    = id => byId(ITEMS, id);
export const getRecipe  = id => byId(RECIPES, id);
export const getBuilding = id => byId(BUILDINGS, id);
export const getAnimal  = id => byId(ANIMALS, id);
export const getDecoration = id => byId(DECORATIONS, id);
export const getTool    = id => byId(TOOLS, id);

/** كل وصفات مبنى معين (مرتبة حسب مستوى الفتح) */
export function getRecipesForBuilding(buildingId) {
    return Object.values(RECIPES)
        .filter(r => r.building === buildingId)
        .sort((a, b) => a.unlockLevel - b.unlockLevel);
}
