/**
 * ============================================================
 * MY FARM 3D - APPLICATION CORE (js/core/App.js)
 * Real Procedural 3D Crops + Scaled Hand Tools + Smart Camera + 10 Expansions
 * ============================================================
 * سجل التغيير (Work Order):
 *   MF-05 — أسعار الواجهة تُقرأ من LAND_CONFIG/الأحداث — لا «100» سحرية.
 *   MF-06 — لا catch صامت؛ كل الفشل يمر عبر core/Logger (R2).
 *   MF-08 — حركة الأداة dt-driven بدل setTimeout المتداخلة.
 *   MF-09 — نصوص التغذية الراجعة: حوض 6 عُقد + دمج المتكرر.
 *   MF-12 — فصل js/main.js: MyFarmApp والإقلاع هنا؛ PlayerController في
 *   js/player/ · CropBatchRenderer في js/world/ · main.js صار shim إقلاع.
 *   MF-13 — اهتزاز حصاد/جمع (navigator.vibrate محروس).
 * ============================================================
 */
import { QuestSystem } from '../systems/QuestSystem.js';

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import { Events } from '../core/EventBus.js';
import { GameState } from '../core/GameState.js';
import { SaveManager } from '../core/SaveManager.js';
import { Time } from '../core/TimeManager.js';
import { Logger } from '../core/Logger.js';
import { Quality } from '../core/QualityScaler.js';
import { PlayerController, FARM_BOUNDS } from '../player/PlayerController.js';
import { CropBatchRenderer } from '../world/CropBatchRenderer.js';
import { Tutorial } from '../ui/Tutorial.js';
import { LandSystem, LAND_CONFIG } from '../systems/LandSystem.js';
import { FarmingSystem, CROPS_DEFINITIONS } from '../systems/FarmingSystem.js';
import { ProductionSystem } from '../systems/ProductionSystem.js';
import { InventorySystem } from '../systems/InventorySystem.js';
import { XPSystem } from '../systems/XPSystem.js';
import { OrderSystem } from '../systems/OrderSystem.js';
import { MarketSystem } from '../systems/MarketSystem.js';
import { AnimalSystem } from '../systems/AnimalSystem.js';
import { getBuilding, STARTER_KIT, ITEMS, getAnimal } from '../data/GameData.js';
import { uuid, haptic } from '../utils/Utils.js';
import { ProductionPanel } from '../ui/ProductionPanel.js';
import { GameUI } from '../ui/UI.js';
import { Toast } from '../ui/Toast.js';
import { SoundFX } from '../ui/SoundFX.js';
import { ProductionYard } from '../world/ProductionYard.js';
import UIManager from '../ui/UIManager.js';
import { Environment } from '../world/Environment.js';
import { HouseInterior } from '../world/HouseInterior.js';
import { CollisionEngine } from '../core/CollisionEngine.js';
import {
    WORLD_BOUNDS,
    INTERIOR_BOUNDS,
    INTERIOR_ROOM,
    INTERIOR_SPAWN,
    PENS,
    HOUSE as HOUSE_LAYOUT
} from '../world/FarmLayout.js';

/* ============================================================
   CAMERA & ENGINE CONFIGURATION (Ground Focused Framing)
   ============================================================ */
const CONFIG = Object.freeze({
    renderer: {
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance'
    },
    camera: {
        fov: 46,
        near: 0.1,
        far: 260,
        // PUBG-style third person: أبعد من قبل حتى تُرى المزرعة،
        // وزاوية ميل ~41° (ضمن 35–50°) واللاعب أسفل-منتصف الكادر.
        defaultDistance: 11.5,
        minDistance: 5.0,
        maxDistance: 16.0,
        minPitch: 0.32,
        maxPitch: 0.98,
        defaultPitch: 0.72,
        targetHeight: 1.0,
        // إزاحة الكتف (يمين الكاميرا) + نقطة النظر أمام اللاعب
        // حتى يبقى اللاعب في أسفل-منتصف الشاشة بدل مركزها.
        shoulderOffset: 0.9,
        lookAhead: 1.7
    },
    performance: {
        maxPixelRatio: 2
    },
    player: {
        walkSpeed: 3.4,
        runSpeed: 5.6,
        turnSpeed: 13.0,
        acceleration: 9.5,
        deceleration: 11.5,
        baseWalkAnimSpeed: 2.0,
        modelScale: 1.0,
        modelPath: './assets/models/farmer.glb'
    },
    colors: {
        sky: 0x6bbceb,
        fog: 0xa4daf7,
        grass: 0x5ea832,
        path: 0xcda266,
        soil: 0x543217,
        roughLand: 0x6e683b,
        wood: 0x8a552e
    }
});

/* إزاحة الشمس الافتراضية قبل أول tick لدورة النهار/الليل. */
const DEFAULT_SUN_OFFSET = Object.freeze({ x: 22, y: 38, z: 18 });

/**
 * صبغة ضوء الشمس لكل فصل (Brief §2 «weather mood per hour + season»):
 * صيف أبيض حار · ربيع محايد · خريف دافئ · شتاء بارد.
 */
const SUN_TINT_BY_SEASON = Object.freeze({
    spring: 0xfff4e0,
    summer: 0xfff6e4,
    autumn: 0xffdfae,
    winter: 0xe9f1ff
});

/** السماء/الأرض للضوء المحيط لكل فصل. */
const AMBIENT_BY_SEASON = Object.freeze({
    spring: { sky: 0xf6ffdf, ground: 0x4f8a2c },
    summer: { sky: 0xfff3db, ground: 0x487928 },
    autumn: { sky: 0xffe9c9, ground: 0x6b5a2a },
    winter: { sky: 0xeaf3ff, ground: 0x3f5f4a }
});

/** كثافة الضباب: سديم صيفي · خريف أثقل · ضباب شتوي بارد · ربيع صافٍ. */
const FOG_DENSITY_BY_SEASON = Object.freeze({
    spring: 0.010,
    summer: 0.012,
    autumn: 0.016,
    winter: 0.020
});

/* MF-12: PlayerController ← js/player/PlayerController.js ·
   CropBatchRenderer ← js/world/CropBatchRenderer.js (فصل حرفي بلا تغيير سلوك). */

/* ============================================================
   APPLICATION CORE
   ============================================================ */
class MyFarmApp {
    constructor() {
        this.canvas = null;
        this.container = null;

        this.scene = null;
        this.camera = null;
        this.renderer = null;

        this.ground = null;
        this.clouds = [];
        this.animatedTrees = [];
        this.lights = { ambient: null, sun: null, fill: null };

        this.player = null;
        this.fieldMeshes = new Map();
        this.activeTarget = null; // { type: 'field' | 'slot' | 'door' | 'animal' | 'market' | 'interior', ... }
        this._lastEmittedTarget = null;

        /*
         * 🏠 داخل البيت (Brief §1): مشهد داخلي حقيقي يُبنى مرة واحدة
         * ويُخفى/يُظهر بدل تفكيك المزرعة — لا شاشة سوداء ولا تسريب.
         */
        this.houseInterior = null;
        this.inInterior = false;
        this._interiorCameraDistance = 6.2;
        this._outsideCameraDistance = CONFIG.camera.defaultDistance;

        // 🏭 طبقة الإنتاج (3D + UI + مؤثرات)
        this.productionYard = null;
        this.productionPanel = null;
        this.toast = null;
        this.soundFX = null;
        this.gameUI = null;

        // 🎯 تركيز الكاميرا المؤقت على مبنى
        this.cameraFocus = { active: false, x: 0, z: 0, until: 0 };
        this._tapStart = null;

        this.cameraDistance = CONFIG.camera.defaultDistance;
        this.cameraYaw = 0.0;
        this.cameraPitch = CONFIG.camera.defaultPitch;
        this.cameraTargetPosition = new THREE.Vector3();
        this.cameraLookTarget = new THREE.Vector3();

        this.touchCameraActive = false;
        this.cameraTouchId = null;
        this.touchLastX = 0;
        this.touchLastY = 0;
        this.activeTouches = new Map();
        this.pinchStartDistance = 0;
        this.pinchStartCameraDistance = CONFIG.camera.defaultDistance;

        this.keys = { up: false, down: false, left: false, right: false };
        this.joystickVector = { x: 0, y: 0 };

        this.running = false;
        this.initialized = false;
        this.clock = new THREE.Clock();

        this._boundResize = () => this.resize();
        this._boundLoop = () => this.gameLoop();
        this._boundKeyDown = (e) => this.handleKeyDown(e);
        this._boundKeyUp = (e) => this.handleKeyUp(e);
    }

    /**
     * يبلّغ شاشة التحميل بنسبة جاهزية عبر سمة على <html>
     * (بلا متغيّرات عامة جديدة — انظر سكربت اللودر في index.html).
     */
    setBootProgress(percent) {
        try {
            document.documentElement.setAttribute('data-farm-boot', String(Math.round(percent)));
        } catch (e) { Logger.debug('Boot', 'loader progress attribute not present', e); }
    }

    /** الوسائط بين الأنظمة والـ Toast: أي نظام يرجع {success,error} يُعرض بالعربية. */
    setupToastBridge() {
        Events.on('toast:info', (msg) => this.toast?.info?.(msg));
        Events.on('toast:success', (msg) => this.toast?.success?.(msg));
        Events.on('toast:error', (msg) => this.toast?.error?.(msg));
    }

    cacheDOM() {
        this.container = document.getElementById('game-container');
        this.canvas = document.getElementById('game-canvas');
        if (!this.canvas) {
            throw new Error('[MY FARM] #game-canvas not found.');
        }
    }

    async boot() {
        try {
            console.log('[MY FARM] Booting living Farm World & Real Farming System...');
            this.cacheDOM();
            this.setBootProgress(18);
            this.createRenderer();
            this.createScene();
            this.createCamera();
            this.createLighting();

            /*
             * الساعة الحقيقية تُقرأ قبل بناء العالم: أول إطار يجب أن
             * يعرض سماء/إضاءة/فصل صحيحين (لا «شتاء» في سبتمبر).
             */
            try {
                Time.readNow();
            } catch (e) {
                console.warn('[MY FARM] Real clock notice:', e);
            }

            this.collision = new CollisionEngine();
            this.environment = new Environment(this.scene, { collision: this.collision });
            this.ground = this.environment.group;

            // صبغة الفصل من أول إطار (تُعاد عند حدث time:season)
            try {
                this.environment.setSeason(Time.getClock().season);
            } catch (e) { Logger.warn('World', 'initial season coating failed', e); }

            /*
             * 🏠 مشهد داخل البيت — يُبنى مخفيًا عند الإقلاع حتى يكون
             * الدخول فوريًا (بلا تحميل أثناء اللعب).
             */
            try {
                this.houseInterior = new HouseInterior({
                    scene: this.scene,
                    collision: this.collision
                });
                this.houseInterior.setVisible(false);
            } catch (e) {
                console.warn('[MY FARM] HouseInterior notice:', e);
                this.houseInterior = null;
            }

            try {
                await Promise.race([
                    (async () => {
                        await SaveManager.init();
                        await SaveManager.load();
                    })(),
                    new Promise(res => setTimeout(res, 600))
                ]);
            } catch (e) {
                // MF-06: فشل إقلاع الحفظ كان يُبتلع — مزرعة اللاعب على المحك هنا
                Logger.error('Boot', 'Save init/load failed during boot — playing un-saved', e);
            }

            // 📈 منحنى المستوى — يستمع لـ xp:gain و player.xp
            try {
                XPSystem.init();
            } catch (e) {
                console.warn('[MY FARM] XPSystem notice:', e);
            }

            this.setBootProgress(46);
            LandSystem.init();
            QuestSystem.init();

            // 🌾 خانات المحاصيل محفوظة داخل farm.tiles — نعيد بناء العرض الحي
            try {
                FarmingSystem.hydrate();
            } catch (e) {
                console.warn('[MY FARM] Farming hydrate notice:', e);
            }

            // 🏭 سلسلة الإنتاج Hay Day: طاحونة الحبوب ← المخبز
            try {
                this.initProductionChain();
            } catch (e) {
                console.warn('[MY FARM] Production chain notice:', e);
            }


            this.createPlayer();
            this.buildFarmFields();

            // 🌾 دفعات رسم المحاصيل (InstancedMesh لكل محصول + مرحلة)
            this.cropBatches = new CropBatchRenderer(this.scene, { capacity: 128 });
            this.cropBatches.markDirty();

            // 🏭 مباني الإنتاج ثلاثية الأبعاد (تتزامن مع الحالة تلقائيًا)
            try {
                this.productionYard = new ProductionYard({ scene: this.scene, collision: this.collision });
                this.productionYard.syncFromState(GameState.get('farm.buildings') || []);
            } catch (e) {
                console.warn('[MY FARM] ProductionYard notice:', e);
            }

            this.setBootProgress(70);
            this.setupCameraTouch();
            this.setupUnifiedPromptUI();

            // MF-07: جودة الرسوم المحفوظة تُطبَّق من أول إطار (بلا forced high)
            try {
                Quality.attach(this);
            } catch (e) {
                Logger.warn('Boot', 'QualityScaler attach failed — defaulting to high', e);
            }

            this.resize();
            window.addEventListener('resize', this._boundResize);
            window.addEventListener('keydown', this._boundKeyDown);
            window.addEventListener('keyup', this._boundKeyUp);

            // 🖥️ التنبيهات + المؤثرات الصوتية (قبل الواجهة حتى تستخدمها)
            try {
                this.toast = new Toast().mount(document.body);
                this.soundFX = new SoundFX({ gameState: GameState });
                this.setupToastBridge();
            } catch (e) {
                console.warn('[MY FARM] Toast/Sound notice:', e);
            }

            // Mount Modern Compact HUD
            try {
                this.hud = new UIManager({
                    gameState: GameState,
                    eventBus: Events,
                    enableJoystick: true,
                    callbacks: {
                        onMove: (vector) => {
                            this.joystickVector.x = vector.x;
                            this.joystickVector.y = vector.y;
                        },
                        onInteract: () => this.triggerActiveInteraction(),
                        onJump: () => {
                            if (this.player?.jump?.()) this.soundFX?.play?.('open');
                        },
                        onOpenPanel: (name, arg) => this.gameUI?.open(name, arg)
                    }
                });
                this.hud.mount(document.body);
                Events.on('hotbar:selected', (item) => {
                    if (!item || item.type === 'panel') return;
                    this.player?.equipItem(item);
                });
            } catch (e) {
                console.warn('[MY FARM] HUD Mount Notice:', e);
            }

            // 🏪🎒📦🛒🗺️☰ لوحات الواجهة (متجر/مخزن/طلبات/سوق/خريطة/قائمة)
            try {
                this.gameUI = new GameUI({
                    eventBus: Events,
                    toast: this.toast,
                    getPlayerPos: () => (this.player?.root
                        ? { x: this.player.root.position.x, z: this.player.root.position.z }
                        : null)
                });
                this.gameUI.mount();

                // احتياط: أي زر يصدر الحدث بدل الـ callback
                Events.on('hud:panel', ({ name, arg } = {}) => this.gameUI?.open(name, arg));
            } catch (e) {
                console.warn('[MY FARM] GameUI Mount Notice:', e);
            }

            // 🏭 لوحة الإنتاج
            try {
                this.productionPanel = new ProductionPanel({
                    events: Events,
                    gameState: GameState,
                    productionSystem: ProductionSystem,
                    soundFX: this.soundFX,
                    toast: this.toast,
                    projector: (x, z, h) => this.projectToScreen(x, z, h),
                    getBuildingWorldPos: (id) => this.productionYard?.getWorldPos(id) || null
                });
                this.productionPanel.mount(document.body);
            } catch (e) {
                console.warn('[MY FARM] Production UI notice:', e);
            }

            // 🐄 ربط حيوانات الزينة بنظام الحيوانات (طبقة واحدة — انظر linkFarmAnimals)
            try {
                this.linkFarmAnimals();
            } catch (e) {
                console.warn('[MY FARM] Animals bridge notice:', e);
            }

            // 📋 لوحة الطلبات + السوق (منطق يعمل دون UI حتى الآن)
            try {
                OrderSystem.init({ immediate: false });
            } catch (e) {
                console.warn('[MY FARM] OrderSystem notice:', e);
            }

            try {
                SaveManager.startAutoSave();
                Time.start();
            } catch (e) {
                Logger.error('Boot', 'Autosave/Time start failed — progress persistence at risk', e);
            }

            // Event Listeners
            Events.on('land:purchased', (data) => this.onLandPurchased(data));
            Events.on('land:purchase-failed', (data) => this.onLandPurchaseFailed(data));
            Events.on('land:axe-hit', (data) => this.onLandAxeHit(data));
            Events.on('land:prepared', (data) => this.onLandPrepared(data));
            Events.on('crop:planted', () => {
                this.cropBatches?.markDirty();
                this.hud?.refreshHotbarCounts?.();
            });
            Events.on('crop:watered', () => this.cropBatches?.markDirty());
            Events.on('crop:ready', () => this.cropBatches?.markDirty());
            Events.on('crop:withered', () => this.cropBatches?.markDirty());
            Events.on('crop:harvested', (data) => this.onCropHarvested(data));
            Events.on('inventory:full', () => {
                this.toast?.error('المخزن ممتلئ! بِع بعض المحاصيل أو رقِّ السعة.');
            });

            /*
             * 🐄 شراء حيوان جديد ⇒ مجسم حي داخل حظيرته + ربط بالنظام.
             * بدون هذا يبقى الشراء «واجهة ميتة» (Brief §1 «no dead UI»).
             */
            Events.on('animal:purchased', (payload) => this.onAnimalPurchased(payload));

            // 🍂 تغيّر الفصل الفلكي ⇒ صبغة أرض/عشب/فراء جديدة
            Events.on('time:season', (season) => {
                try {
                    this.environment?.setSeason?.(season);
                } catch (e) { Logger.warn('World', 'season recoat failed', e); }
            });

            /*
             * 🏪 كشك الطريق: أي عملية بيع/شراء حقيقية تُعلن للاعب.
             * (بدون هذا كان MarketSystem يعمل بصمت — Brief §1 «no silent failures»).
             */
            Events.on('market:sold', (listingId, earnings, itemId, amount) =>
                this.onStallSale({ earnings, itemId, amount }));
            Events.on('market:purchased', (listingId, itemId, amount, price) =>
                this.toast?.success(`🛒 اشتريت ${amount}× ${ITEMS[itemId]?.name || itemId} بـ 💰${price}`));
            Events.on('market:listed', () => this.hud?.syncStorage?.());
            Events.on('storage:changed', () => this.hud?.syncStorage?.());
            /*
             * 📦 مواد الترقية تسقط من ثلاثة مصادر (حصاد/طلبات/كشك) —
             * إعلان واحد هنا يغطيها جميعًا بدل تكرار الكود في كل نظام.
             */
            Events.on('storage:supply-drop', ({ itemId, amount = 1, source = 'harvest' } = {}) => {
                const item = ITEMS[itemId] || {};
                const where = source === 'order' ? 'من الطلب' : source === 'stallSale' ? 'من زائر الكشك' : 'من الحصاد';
                this.toast?.success(`${item.icon || '📦'} ${item.name || itemId} ×${amount} ${where} — مواد ترقية المخازن`);
                this.hud?.syncStorage?.();
            });
            Events.on('storage:upgraded', ({ store, level, capacity } = {}) => {
                const label = store === 'barn' ? 'الحظيرة (Barn)' : 'الصومعة (Silo)';
                this.toast?.success(`⬆️ رُقّيت ${label} إلى المستوى ${level} — السعة ${capacity}`);
                this.hud?.syncStorage?.();
            });
            Events.on('storage:full', (store) => {
                const label = store === 'barn' ? 'الحظيرة (Barn) ممتلئة' : 'الصومعة (Silo) ممتلئة';
                this.toast?.error(`📦 ${label} — بِع بعض المحتويات أو رقِّ السعة`);
            });

            // أحداث سلسلة الإنتاج
            Events.on('production:started', (buildingId, recipeId) =>
                console.log(`[PRODUCTION] 🏭 بدأ الإنتاج: ${recipeId} @ ${buildingId}`));
            Events.on('production:ready', (buildingId, recipeId) =>
                console.log(`[PRODUCTION] ✅ المنتج جاهز للاستلام: ${recipeId}`));
            Events.on('production:completed', (buildingId, recipeId, output) =>
                console.log(`[PRODUCTION] 📦 تم الاستلام: ${output.amount}× ${output.item}`));
            Events.on('inventory:full', () =>
                console.warn('[PRODUCTION] ⚠️ المخزن ممتلئ — قم بترقية السعة!'));
            Events.on('production:building-selected', (hit) => this.focusOnBuilding(hit));

            this.setBootProgress(100);
            this.initialized = true;
            this.hideLoading();
            this.start();

            // واجهة للاختبار من وحدة التحكم (Spck console)
            window.MYFARM = {
                app: this,
                GameState,
                Events,
                FarmingSystem,
                InventorySystem,
                ProductionSystem,
                ProductionYard: this.productionYard,
                ProductionPanel: this.productionPanel,
                GameUI: this.gameUI,
                LandSystem,
                OrderSystem,
                MarketSystem,
                /* عدد الرسمات الفعلي لهذا الإطار (لقياس الأداء على الجهاز) */
                drawCalls: () => this.renderer?.info?.render?.calls ?? 0,
                triangles: () => this.renderer?.info?.render?.triangles ?? 0,
                openPanel: (name, tab) => this.gameUI?.open(name, tab)
            };

            // MF-10: درس أول ٦٠ ثانية للاعب الجديد فقط (يحفظ الإكمال — لا يُعاد)
            try {
                Tutorial.start({
                    projector: (x, z, h) => this.projectToScreen(x, z, h ?? 1.1),
                    marketPos: () => this.environment?.buildings?.marketPos || null
                });
            } catch (e) {
                Logger.warn('Boot', 'Tutorial start failed — game continues without it', e);
            }

            Events.emit('game:ready', this);
            console.log('[MY FARM] Farm World is ready.');
        } catch (error) {
            console.error('[MY FARM] Boot error:', error);
            this.hideLoading();
        }
    }

    /* ============================================================
       🏭 سلسلة الإنتاج — طاحونة الحبوب ← المخبز
       يزرع المبنيين + حقيبة بداية عند أول تشغيل فقط،
       ولا يلمس الحفوظات الموجودة أبدًا.
       ============================================================ */
    initProductionChain() {
        const buildings = GameState.get('farm.buildings') || [];
        const isFreshFarm = buildings.length === 0;
        let changed = false;

        // 🔄 ترحيل: إضافة مواقع البناء للحفوظات القديمة
        for (const b of buildings) {
            if (!b.position && STARTER_KIT.positions?.[b.typeId]) {
                b.position = { ...STARTER_KIT.positions[b.typeId] };
                changed = true;
            }
        }

        for (const typeId of STARTER_KIT.buildings) {
            // لا تكرار — إن وُجد المبنى مسبقًا نتخطّاه
            if (buildings.some(b => b.typeId === typeId)) continue;

            const def = getBuilding(typeId);
            if (!def) continue;

            buildings.push({
                id: uuid(),
                typeId,
                name: def.name,
                icon: def.icon,
                level: 1,
                status: 'built',
                queueLimit: def.queueLimit || 3,
                productionQueue: [],
                position: STARTER_KIT.positions?.[typeId]
                    ? { ...STARTER_KIT.positions[typeId] }
                    : { x: 0, z: 4.5 },
                placedAt: Date.now()
            });
            changed = true;
            console.log(`[PRODUCTION] مبنى جاهز: ${def.icon} ${def.name}`);
        }

        if (changed) {
            GameState.set('farm.buildings', buildings);
        }

        if (isFreshFarm) {
            // مواد خام للانطلاق الفوري في السلسلة
            const items = GameState.get('inventory.items') || {};
            for (const [itemId, count] of Object.entries(STARTER_KIT.items)) {
                if (!items[itemId]) items[itemId] = { count: 0, quality: 1 };
                items[itemId].count += count;
            }
            GameState.set('inventory.items', items);

            const unlocked = GameState.get('unlocked') || {};
            GameState.set('unlocked', {
                ...unlocked,
                buildings: [...new Set([...(unlocked.buildings || []), ...STARTER_KIT.buildings])],
                recipes: [...new Set([...(unlocked.recipes || []), ...STARTER_KIT.recipes])]
            });

            console.log('[PRODUCTION] 🎁 حقيبة البداية:', JSON.stringify(STARTER_KIT.items));
        }

        console.log(
            '[PRODUCTION] ✅ السلسلة متصلة:',
            ProductionSystem ? 'طاحونة الحبوب ← المخبز' : 'معطلة'
        );
    }

    createRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: CONFIG.renderer.antialias,
            alpha: CONFIG.renderer.alpha,
            powerPreference: CONFIG.renderer.powerPreference
        });
        this.renderer.setPixelRatio(
            Math.min(window.devicePixelRatio || 1, CONFIG.performance.maxPixelRatio)
        );
        this.renderer.setSize(window.innerWidth, window.innerHeight, false);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.15;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    createScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(CONFIG.colors.sky);
        // Exponential height fog (calibrated per Brief §2)
        this.scene.fog = new THREE.FogExp2(0xdce9f5, 0.012);
    }

    createCamera() {
        this.camera = new THREE.PerspectiveCamera(
            CONFIG.camera.fov,
            window.innerWidth / window.innerHeight,
            CONFIG.camera.near,
            CONFIG.camera.far
        );
        this.camera.position.set(0, 5, 8);
        this.camera.lookAt(0, CONFIG.camera.targetHeight, 0);
    }

    createLighting() {
        /* ── AAA Atmospheric Lighting (Brief §2) ────────────────────── */
        // Cool ambient skylight (hemisphere: sky blue / warm ground)
        this.lights.ambient = new THREE.HemisphereLight(0x78B7FF, 0x487928, 0.85);
        this.scene.add(this.lights.ambient);

        // Warm directional morning sun
        this.lights.sun = new THREE.DirectionalLight(0xFFF2D1, 1.6);
        this.lights.sun.position.set(22, 38, 18);
        this.lights.sun.castShadow = true;
        this.lights.sun.shadow.mapSize.width = 1024;
        this.lights.sun.shadow.mapSize.height = 1024;
        this.lights.sun.shadow.camera.near = 0.5;
        this.lights.sun.shadow.camera.far = 75;
        this.lights.sun.shadow.bias = -0.0004;

        // ظل ضيّق يتبع اللاعب (P5): مربع 16 وحدة بدل 26 يعطي
        // دقة أعلى بنفس حجم الخريطة على الأجهزة المتوسطة.
        const d = 16;
        this.lights.sun.shadow.camera.left = -d;
        this.lights.sun.shadow.camera.right = d;
        this.lights.sun.shadow.camera.top = d;
        this.lights.sun.shadow.camera.bottom = -d;

        this.scene.add(this.lights.sun);
        this.scene.add(this.lights.sun.target);

        this.lights.fill = new THREE.DirectionalLight(0x78B7FF, 0.45);
        this.lights.fill.position.set(-18, 14, -14);
        this.scene.add(this.lights.fill);
    }

    createSky() {
        const cloudGroup = new THREE.Group();
        const cloudMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.9,
            metalness: 0.0,
            flatShading: true
        });

        const cloudPositions = [
            { x: -26, y: 24, z: -35, s: 1.3 },
            { x: 16, y: 28, z: -40, s: 1.6 },
            { x: -8, y: 22, z: -50, s: 1.8 }
        ];

        cloudPositions.forEach((cp) => {
            const singleCloud = new THREE.Group();
            const parts = [
                { r: 2.0, x: 0, y: 0, z: 0 },
                { r: 1.5, x: -1.6, y: -0.2, z: 0.2 },
                { r: 1.6, x: 1.7, y: -0.1, z: -0.2 }
            ];
            parts.forEach((p) => {
                const geo = new THREE.DodecahedronGeometry(p.r * cp.s, 1);
                const puff = new THREE.Mesh(geo, cloudMat);
                puff.position.set(p.x * cp.s, p.y * cp.s, p.z * cp.s);
                singleCloud.add(puff);
            });
            singleCloud.position.set(cp.x, cp.y, cp.z);
            this.clouds.push(singleCloud);
            cloudGroup.add(singleCloud);
        });

        this.scene.add(cloudGroup);
    }

    createFarmEnvironment() {
        const envGroup = new THREE.Group();

        // 1. أرض العشب الطبيعي
        const grassGeo = new THREE.PlaneGeometry(120, 120);
        const grassMat = new THREE.MeshStandardMaterial({
            color: CONFIG.colors.grass,
            roughness: 0.95,
            metalness: 0.04
        });
        const mainGrass = new THREE.Mesh(grassGeo, grassMat);
        mainGrass.rotation.x = -Math.PI / 2;
        mainGrass.receiveShadow = true;
        envGroup.add(mainGrass);

        // 2. الممرات الزراعية المتقاطعة
        const pathMat = new THREE.MeshStandardMaterial({ color: CONFIG.colors.path, roughness: 0.96 });
        const crossX = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 56), pathMat);
        crossX.rotation.x = -Math.PI / 2;
        crossX.position.set(0, 0.012, 0);
        crossX.receiveShadow = true;
        envGroup.add(crossX);

        const crossZ = new THREE.Mesh(new THREE.PlaneGeometry(56, 3.8), pathMat);
        crossZ.rotation.x = -Math.PI / 2;
        crossZ.position.set(0, 0.013, 0);
        crossZ.receiveShadow = true;
        envGroup.add(crossZ);

        // 3. بحيرة مياه صغيرة
        const pondGeo = new THREE.CylinderGeometry(4.8, 5.2, 0.35, 20);
        const waterMat = new THREE.MeshStandardMaterial({
            color: 0x3399cc,
            roughness: 0.15,
            metalness: 0.25,
            transparent: true,
            opacity: 0.88
        });
        const pond = new THREE.Mesh(pondGeo, waterMat);
        pond.position.set(-18, 0.08, -16);
        envGroup.add(pond);

        // 4. أشجار المزرعة الحدودية
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6e4321, roughness: 0.9 });
        const leafMat = new THREE.MeshStandardMaterial({ color: 0x3a8226, roughness: 0.85 });

        const treeCoords = [
            [-22, -8], [-24, 6], [-20, 20], [20, -14], [24, 8], [20, 22],
            [-10, -24], [10, -24], [-14, 25], [14, 25]
        ];

        treeCoords.forEach(([tx, tz]) => {
            const tree = new THREE.Group();
            tree.position.set(tx, 0, tz);

            const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.42, 2.2, 7), trunkMat);
            trunk.position.y = 1.1;
            trunk.castShadow = true;
            tree.add(trunk);

            const fol = new THREE.Mesh(new THREE.DodecahedronGeometry(1.6, 1), leafMat);
            fol.position.set(0, 2.7, 0);
            fol.castShadow = true;
            tree.add(fol);

            envGroup.add(tree);
            this.animatedTrees.push(tree);
        });

        // 5. حظيرة كرتونية حمراء
        const barn = new THREE.Group();
        barn.position.set(16, 0, -6);
        const barnBody = new THREE.Mesh(
            new THREE.BoxGeometry(6.5, 4.2, 8.0),
            new THREE.MeshStandardMaterial({ color: 0xa83228, roughness: 0.85 })
        );
        barnBody.position.y = 2.1;
        barnBody.castShadow = true;
        barn.add(barnBody);

        const roof = new THREE.Mesh(
            new THREE.ConeGeometry(5.2, 2.6, 4),
            new THREE.MeshStandardMaterial({ color: 0x441410, roughness: 0.8 })
        );
        roof.rotation.y = Math.PI / 4;
        roof.position.y = 5.2;
        roof.castShadow = true;
        barn.add(roof);
        envGroup.add(barn);

        this.ground = envGroup;
        this.scene.add(envGroup);
    }

    createPlayer() {
        this.player = new PlayerController(this.scene, { collision: this.collision });
    }

    /* ========================================================
       FARM FIELDS & 4-SLOT CROPS BUILDER (HAY DAY STYLE)
       ======================================================== */
    buildFarmFields() {
        const fields = LandSystem.getAllFields();
        const plotSize = 4.8;

        fields.forEach((field) => {
            const plotGroup = new THREE.Group();
            plotGroup.position.set(field.posX, 0, field.posZ);

            // أرضية الحقل
            const soilGeo = new THREE.BoxGeometry(plotSize, 0.16, plotSize);
            const soilMat = new THREE.MeshStandardMaterial({
                color: field.prepared ? CONFIG.colors.soil : (field.purchased ? CONFIG.colors.roughLand : 0x556633),
                roughness: 0.96
            });
            const soilMesh = new THREE.Mesh(soilGeo, soilMat);
            soilMesh.position.y = 0.08;
            soilMesh.receiveShadow = true;
            soilMesh.castShadow = true;
            plotGroup.add(soilMesh);

            // إطار خشبي
            const frameMesh = new THREE.Mesh(
                new THREE.BoxGeometry(plotSize + 0.22, 0.2, plotSize + 0.22),
                new THREE.MeshStandardMaterial({ color: field.purchased ? CONFIG.colors.wood : 0x4a3a2a, roughness: 0.9 })
            );
            frameMesh.position.y = 0.07;
            plotGroup.add(frameMesh);

            // مجموعة خانات الزراعة الأربعة (2x2 Slots)
            const slotsGroup = new THREE.Group();
            slotsGroup.position.set(0, 0.16, 0);
            plotGroup.add(slotsGroup);

            // صخور وأعشاب برية للأرض المشتراة وغير المجهزة
            const wildGroup = new THREE.Group();
            if (field.purchased && !field.prepared) {
                this.addWildProps(wildGroup);
            }
            plotGroup.add(wildGroup);

            // شارة القفل وسعر 100 للأراضي المقفولة
            const lockGroup = new THREE.Group();
            lockGroup.position.set(0, 1.25, 0);

            if (!field.purchased) {
                const post = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.08, 0.08, 1.3, 8),
                    new THREE.MeshStandardMaterial({ color: 0x743e18 })
                );
                post.position.y = -0.65;
                lockGroup.add(post);

                const sign = new THREE.Mesh(
                    new THREE.BoxGeometry(1.2, 0.75, 0.12),
                    new THREE.MeshStandardMaterial({ color: 0xffb800, roughness: 0.4, metalness: 0.4 })
                );
                sign.castShadow = true;
                lockGroup.add(sign);

                const ring = new THREE.Mesh(
                    new THREE.TorusGeometry(0.22, 0.05, 8, 16, Math.PI),
                    new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.7 })
                );
                ring.position.set(0, 0.38, 0);
                lockGroup.add(ring);
            }
            plotGroup.add(lockGroup);

            this.scene.add(plotGroup);

            this.fieldMeshes.set(field.id, {
                fieldData: field,
                group: plotGroup,
                soilMesh,
                frameMesh,
                slotsGroup,
                wildGroup,
                lockGroup,
                slotMeshes: new Map()
            });

            if (field.prepared) {
                this.renderAllFieldSlots(field.id);
            }
        });
    }

    /**
     * الصخور والأعشاب على الأرض غير المجهزة — مواد/هندسة مشتركة (P5)
     * حتى لا نتلف الموارد عند تجهيز الأرض.
     */
    addWildProps(group) {
        if (!this._wildRockGeo) {
            this._wildRockGeo = new THREE.DodecahedronGeometry(0.28, 0);
            this._wildWeedGeo = new THREE.ConeGeometry(0.16, 0.42, 5);
            this._wildRockMat = new THREE.MeshStandardMaterial({ color: 0x888880, roughness: 0.95 });
            this._wildWeedMat = new THREE.MeshStandardMaterial({ color: 0x768833, roughness: 0.9 });
        }

        const offsets = [[-1.1, -1.0], [1.1, 0.8], [-0.5, 1.1], [1.2, -1.0]];
        offsets.forEach(([ox, oz], idx) => {
            if (idx % 2 === 0) {
                const rock = new THREE.Mesh(this._wildRockGeo, this._wildRockMat);
                rock.position.set(ox, 0.15, oz);
                rock.scale.set(1.2, 0.7, 1.0);
                rock.castShadow = true;
                group.add(rock);
            } else {
                const weed = new THREE.Mesh(this._wildWeedGeo, this._wildWeedMat);
                weed.position.set(ox, 0.22, oz);
                group.add(weed);
            }
        });
    }

    /**
     * إعادة رسم خانات الحقل — مع الدفعات المجمّعة لا يوجد mesh لكل خانة،
     * بل تعليم "dirty" يعيد بناء InstancedMesh دفعة واحدة في الحلقة التالية.
     */
    renderAllFieldSlots(fieldId) {
        this.cropBatches?.markDirty();
    }

    /** متوافق مع نداءات main.js القديمة (خان واحدة = إعادة تعبئة الدفعة). */
    renderSlotCrop(fieldId, slotIndex) {
        this.cropBatches?.markDirty();
    }

    /* ========================================================
       UNIFIED GAMEPLAY PROMPT LOGIC
       ======================================================== */
    setupUnifiedPromptUI() {
        const promptEl = document.getElementById('action-prompt');
        const promptBtn = document.getElementById('btn-prompt-action');
        const modalEl = document.getElementById('purchase-modal');
        const confirmBtn = document.getElementById('btn-confirm-buy');
        const cancelBtn = document.getElementById('btn-cancel-buy');

        [promptEl, modalEl].forEach((el) => {
            if (!el) return;
            el.addEventListener('pointerdown', (e) => e.stopPropagation());
            el.addEventListener('touchstart', (e) => e.stopPropagation());
        });

        promptBtn.addEventListener('click', () => {
            this.triggerActiveInteraction();
        });

        cancelBtn.addEventListener('click', () => {
            modalEl.classList.remove('open');
        });

        confirmBtn.addEventListener('click', () => {
            if (!this.activeTarget || this.activeTarget.type !== 'field') return;
            const res = LandSystem.purchaseField(this.activeTarget.fieldId);
            modalEl.classList.remove('open');

            if (!res.success && res.reason === 'insufficient-funds') {
                // MF-05: السعر من نتيجة الشراء/الإعداد — لا رقم سحري في النص (R1)
                const price = res.required ?? LAND_CONFIG.fieldPrice;
                this.spawnFloatingFeedback(`💰 تحتاج إلى ${price} كوينز لشراء هذا الحقل`, '#ff4444');
            }
        });
    }

    _setActiveTarget(target) {
        this.activeTarget = target;
        if (this._lastEmittedTarget !== target) {
            this._lastEmittedTarget = target;
            Events.emit('interaction:target-changed', target);
        }
    }

    triggerActiveInteraction() {
        if (!this.activeTarget) return;
        const target = this.activeTarget;

        // MF-10: أثناء الدرس يُقفل الإدخال خارج هدف الخطوة (مع السبب للاعب)
        if (Tutorial.running) {
            const gate = Tutorial.gate(target);
            if (!gate.allowed) {
                this.toast?.info(gate.hint || 'أكمل الدرس أولًا 🌱');
                return;
            }
        }


        // 🏠 تفاعلات داخل البيت لها الأولوية (لا أهداف مزرعة أثناء الدخول)
        if (target.type === 'interior') {
            if (target.id === 'exit') {
                // الباب يُفتح فعلًا (مفصلة) ثم نُعيد اللاعب للخارج
                this.houseInterior?.exitDoor?.setOpen?.(true);
                this.exitHouse();
            } else if (target.id === 'chest') {
                this.houseInterior?.toggleChest?.();
                this.gameUI?.open('bag');
                this.soundFX?.play?.('open');
            }
            return;
        }

        if (target.type === 'door') {
            const door = target.door;

            /*
             * باب البيت بابٌ حقيقي بمفصلة (يفتح فعليًا) + فعل الدخول.
             * Doors.js يحمل `action` من BuildingManager.
             */
            if (door.action === 'enter-house') {
                if (!door.open) door.toggle();
                this.enterHouse();
                return;
            }

            const opened = door.toggle();
            this.spawnFloatingFeedback(opened ? '🚪 الباب فُتح' : '🚪 الباب أُغلق', '#ffd54f');
            return;
        }

        if (target.type === 'market') {
            this.gameUI?.open('shop', 'market');
            return;
        }

        if (target.type === 'field' && !target.data.purchased) {
            const modal = document.getElementById('purchase-modal');
            if (modal) {
                const badge = modal.querySelector('.price-badge span');
                if (badge) badge.textContent = `💰 ${LAND_CONFIG.fieldPrice} كوينز`;
                modal.classList.add('open');
            }
            return;
        }

        if (target.type === 'field' && target.data.purchased && !target.data.prepared) {
            if (this.player) this.player.playToolSwing();
            const res = LandSystem.strikeFieldWithAxe(target.fieldId);
            if (!res.success) this.toast?.error('لا يمكن تجهيز هذه الأرض الآن');
            return;
        }

        if (target.type === 'animal') {
            this.interactWithAnimal(target);
            return;
        }

        if (target.type === 'slot') {
            this.interactWithSlot(target.fieldId, target.slotIndex, target.slot);
            return;
        }
    }

    /**
     * الفعل الأساسي على خانة زراعية (P1):
     *   فارغة + بذرة مختارة → زراعة (تُستهلك البذرة من المخزن)
     *   نامية غير مرويّة     → ري
     *   ناضجة               → حصاد إلى المخزن
     *   ذابلة               → تنظيف
     */
    interactWithSlot(fieldId, slotIndex, slotRef) {
        const slots = FarmingSystem.getOrCreateSlots(fieldId);
        const slot = slots[slotIndex] || slotRef;
        if (!slot) return;

        if (slot.state === 'empty') {
            const selected = this.hud?.getSelectedItem?.();
            const cropType = selected?.type === 'seed' ? (selected.cropType || 'wheat') : null;

            if (!cropType) {
                this.toast?.error('اختر بذرة من شريط الأدوات أولًا 🌱');
                return;
            }

            const seedId = CROPS_DEFINITIONS[cropType]?.seedId;
            if (seedId && InventorySystem.count(seedId) <= 0) {
                this.toast?.error(`لا توجد ${ITEMS[seedId]?.name || 'بذور'} في المخزن`);
                return;
            }

            const res = FarmingSystem.plantSeed(fieldId, slotIndex, cropType);
            if (!res.success) {
                this.toast?.error(res.error || 'تعذّرت الزراعة');
                return;
            }

            // عدّاد الـ Hotbar البصري يتبع المخزن
            this.hud?.syncSeedCounts?.();
            this.player?.playToolSwing?.();
            this.spawnFloatingFeedback(`🌱 تم بذر ${CROPS_DEFINITIONS[cropType].name}!`, '#86d942');
        } else if (slot.state === 'growing' && !slot.watered) {
            const res = FarmingSystem.waterSlot(fieldId, slotIndex);
            if (!res.success) {
                this.toast?.error(res.error || 'تعذّر الري');
                return;
            }
            this.spawnFloatingFeedback('💧 تم ري المحصول!', '#00d2ff');
        } else if (slot.state === 'growing') {
            const left = Math.max(0, Math.round((slot.readyAt - Date.now()) / 1000));
            this.toast?.info(`⏳ ينمو… بقي ${left} ثانية`);
        } else if (slot.state === 'ready') {
            const res = FarmingSystem.harvestSlot(fieldId, slotIndex);
            if (!res.success) {
                // الصومعة ممتلئة ⇒ رسالة واضحة + طريق للحل (لا فشل صامت)
                if (res.reason === 'silo_full' || res.error === 'inventory_full') {
                    this.toast?.error('🌾 الصومعة ممتلئة! بِع محاصيل أو رقِّ السعة (المخازن ⬆️)');
                    this.spawnFloatingFeedback('🌾 الصومعة ممتلئة', '#ff6b6b');
                } else {
                    this.toast?.error(res.error || 'تعذّر الحصاد');
                }
                return;
            }
            this.player?.playToolSwing?.();
        } else if (slot.state === 'withered') {
            FarmingSystem.harvestSlot(fieldId, slotIndex);
            this.spawnFloatingFeedback('🍂 أُزيل المحصول الذابل', '#c9a06b');
        }

        this.cropBatches?.markDirty();
        this.checkNearTargets(true);
    }

    /**
     * حيوان مُشترى حديثًا ⇒ نضع له مجسمًا في حظيرة نوعه ونربطه.
     * @param {{animal:object, species:string, name:string, icon:string, coins:number}} payload
     */
    onAnimalPurchased(payload) {
        const animal = payload?.animal;
        const managers = this.environment?.animals;
        if (!animal?.id || !managers) return;

        // مربوط مسبقًا؟ (إعادة شراء/إعادة تحميل)
        if (managers.animals.some((r) => r.farmAnimalId === animal.id)) return;

        const species = animal.animalId || payload.species;
        const pen = PENS.find((p) => p.species === species) || PENS[0];
        if (!pen) return;

        const spot = this._findFreePenSpot(pen, managers);
        const rigType = species === 'chicken' ? 'chicken' : species;
        const rig = managers.spawn(
            rigType,
            spot.x,
            spot.z,
            1,
            Math.min(pen.w, pen.d) / 2 - 1.1
        );
        rig.penId = pen.id;
        rig.farmAnimalId = animal.id;
        rig.animalIcon = getAnimal(species)?.icon || payload?.icon || '🐄';

        const penRecord = managers.pens?.find((p) => p.id === pen.id);
        const trough = penRecord?.group?.userData?.trough;
        if (trough) rig.troughTarget = new THREE.Vector2(pen.x + trough.x, pen.z + trough.z);

        // الفراء الموسمي يُطبَّق تلقائيًا داخل spawn() إن كان الفصل معروفًا
        this.toast?.success(`${rig.animalIcon} أضفت ${payload?.name || species} إلى ${pen.id.replace('pen-', '') === 'chicken' ? 'قن الدجاج' : 'الحظيرة'} (−💰${payload?.coins || 0})`);
        this.hud?.syncStorage?.();
        Events.emit('farm:animal-spawned', { animalId: animal.id, penId: pen.id });
    }

    /** موضع فارغ داخل حظيرة (لا يتراكب مع مجسم قائم). */
    _findFreePenSpot(pen, managers) {
        const taken = (managers.animals || [])
            .filter((r) => r.penId === pen.id)
            .map((r) => [r.root.position.x, r.root.position.z]);

        for (let attempt = 0; attempt < 24; attempt++) {
            const x = pen.x + (Math.random() - 0.5) * (pen.w - 2.2);
            const z = pen.z + (Math.random() - 0.5) * (pen.d - 2.2);
            const clash = taken.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 1.1);
            if (!clash) return { x, z };
        }
        return { x: pen.x, z: pen.z };
    }

    /* ========================================================
       🐄 جسر الحيوانات — Animals.js (مرئي) ↔ AnimalSystem (منطق)
       --------------------------------------------------------
       كانت حيوانات الزينة مجرد مجسمات لا علاقة لها بالنظام.
       الآن كل مجسم يسجّل حيوانًا مكافئًا في farm.animals عند
       موضعه، ويصبح تفاعل اللاعب معه إطعامًا/جمعًا حقيقيين.
       المرحلة التالية: استبدال المجسمات بنماذج مملوكة تُدار
       بالكامل من AnimalSystem (شراء/طرد) وحذف build() الثابت.
       ======================================================== */
    linkFarmAnimals() {
        const rigs = this.environment?.animals?.animals || [];
        if (rigs.length === 0) return;

        const SPECIES = { pig: 'pig', sheep: 'sheep', cow: 'cow', chicken: 'chicken', rooster: 'chicken' };
        const animals = GameState.get('farm.animals') || [];
        let linked = 0;

        rigs.forEach((rig, idx) => {
            const species = SPECIES[rig.type] || 'chicken';

            // استعادة رابطة محفوظة مسبقًا
            let entry = animals.find(a => a.rigIndex === idx);

            if (!entry) {
                const adopted = AnimalSystem.adopt(species, {
                    x: rig.root.position.x,
                    z: rig.root.position.z
                });
                if (!adopted.success) return;
                entry = adopted.animal;
                entry.rigIndex = idx;
                const list = GameState.get('farm.animals') || [];
                GameState.set('farm.animals', list.map(a => (a.id === entry.id ? { ...a, rigIndex: idx } : a)));
            }

            rig.farmAnimalId = entry.id;
            rig.animalIcon = getAnimal(species)?.icon || '🐄';
            linked++;
        });

        if (linked > 0) {
            console.log(`[MY FARM] 🐄 ${linked} حيوانات مرتبطة بنظام الإنتاج الحيواني.`);
        }

        /*
         * مؤشرات «المنتج جاهز» + فراء الفصل تُستعاد من الحالة المحفوظة،
         * فلا يبدأ الحيوان بمظهر خاطئ بعد إعادة التحميل.
         */
        const stateById = {};
        for (const a of (GameState.get('farm.animals') || [])) stateById[a.id] = a.state;
        this.environment?.animals?.syncReadyStates?.(stateById);
        try {
            this.environment?.animals?.setSeasonCoat?.(Time.getClock().season);
        } catch (e) { Logger.warn('World', 'animal season coat failed', e); }
    }

    interactWithAnimal(target) {
        const animalId = target.rig?.farmAnimalId;
        if (!animalId) return;

        const animal = AnimalSystem.getAnimalById(animalId);
        if (!animal) return;

        const def = getAnimal(animal.animalId);

        if (animal.state === 'ready') {
            const res = AnimalSystem.collect(animalId);
            if (!res.success) {
                this.toast?.error(res.error || 'تعذّر الجمع');
                return;
            }
            const itemName = ITEMS[res.productId]?.name || res.productId;
            this.toast?.success(`🧺 ${def?.icon || '🐄'} +${res.amount} ${itemName}`);
            this.spawnFloatingFeedback(`🥚 +${res.amount} ${itemName}`, '#ffd54f');
            haptic(12); // MF-13
            return;
        }

        // العلف خاص بكل نوع (GameData: feedItem/feed) — لا قمح عام للجميع
        const feedId = def?.feedItem || def?.feed || 'wheat';
        if (InventorySystem.count(feedId) <= 0) {
            this.toast?.error(`ينقصك ${ITEMS[feedId]?.name || feedId} للإطعام`);
            return;
        }

        const res = AnimalSystem.feed(animalId);
        if (!res.success) {
            this.toast?.error(res.error || 'تعذّر الإطعام');
            return;
        }
        this.toast?.success(`${def?.icon || '🐄'} تم إطعام ${def?.name || 'الحيوان'} 🌾`);
        this.spawnFloatingFeedback('🌾 شبعان!', '#86d942');
    }

    /* ========================================================
       🏪 كشك الطريق — إعلان البيع للاعب (لا فشل صامت)
       ======================================================== */
    onStallSale({ earnings = 0, itemId = null, amount = 1 } = {}) {
        const name = (itemId && ITEMS[itemId]?.name) || 'بضاعة';
        this.toast?.success(`🧺 باع كشكك ${amount}× ${name} بـ 💰${earnings}`);
        this.spawnFloatingFeedback(`+💰${earnings}`, '#ffd54f');
        haptic(12); // MF-13: وصول الكوينز = لحظة مكافأة
        this.soundFX?.play?.('coin');
        this.hud?.syncStorage?.();
    }

    /* ========================================================
       🏠 داخل البيت — دخول/خروج حقيقي (Brief §1 «House interior»)
       --------------------------------------------------------
       المشكلة القديمة: الدخول كان يعرض غرفة فارغة/سوداء لأن
       المزرعة تبقى مرسومة والداخل لم يكن موجودًا أصلًا.
       الحل: مشهد داخلي جاهز عند الإقلاع (HouseInterior) —
       عند الدخول نُخفي جذور المزرعة (visible=false، لا dispose)
       وننقل اللاعب إلى INTERIOR_SPAWN، وعند الخروج نُظهرها
       ونضع اللاعب أمام باب البيت. لا إعادة تحميل ⇒ لا شاشة سوداء.
       ======================================================== */
    enterHouse() {
        if (this.inInterior || !this.houseInterior || !this.player?.root) return;

        this.inInterior = true;
        this.houseInterior.setVisible(true);
        this._setFarmWorldVisible(false);

        const spawn = this.houseInterior.getSpawnPoint(new THREE.Vector3());
        this.player.root.position.set(spawn.x, 0, spawn.z);
        this.player.root.rotation.y = Math.PI; // يواجه داخل الغرفة
        this.player.setBounds(INTERIOR_BOUNDS);

        // كاميرا أقرب داخل الغرفة (الجدران قريبة)
        this._outsideCameraDistance = this.cameraDistance;
        this.cameraDistance = this._interiorCameraDistance;
        this.cameraFocus.active = false;

        // Dynamic FOV: clamp to 50° in tight interior to avoid wall clipping
        this._outsideFOV = this.camera.fov;
        this.camera.fov = 50;
        this.camera.updateProjectionMatrix();

        // إغلاق أي هدف/مؤشر من المزرعة
        this._setActiveTarget(null);
        document.getElementById('action-prompt')?.classList.remove('visible');

        this.soundFX?.play?.('open');
        this.toast?.info('🏠 دخلت البيت — الصندوق للمخزن، والباب للخروج');
        Events.emit('interior:entered');
        this.checkNearTargets(true);
    }

    exitHouse() {
        if (!this.inInterior || !this.player?.root) return;

        this.inInterior = false;
        this.houseInterior?.setVisible(false);
        this._setFarmWorldVisible(true);

        const out = HouseInterior.getOutsideExit();
        this.player.root.position.set(out.x, 0, out.z);
        this.player.root.rotation.y = 0; // يواجه المزرعة
        this.player.setBounds(FARM_BOUNDS);

        this.cameraDistance = this._outsideCameraDistance || CONFIG.camera.defaultDistance;
        // Restore exterior FOV
        if (this._outsideFOV) {
            this.camera.fov = this._outsideFOV;
            this.camera.updateProjectionMatrix();
        }
        this._setActiveTarget(null);
        document.getElementById('action-prompt')?.classList.remove('visible');

        this.soundFX?.play?.('open');
        Events.emit('interior:exited');
        this.checkNearTargets(true);
    }

    /**
     * إظهار/إخفاء جذور المزرعة فقط (السماء والمصابيح واللاعب يبقون).
     * نستخدم visible=false لا remove/dispose حتى لا نفقد الحالة.
     */
    _setFarmWorldVisible(visible) {
        const roots = [
            this.environment?.group,
            this.productionYard?.group
        ];

        // دفعات المحاصيل تُدار براية خاصة (InstancedMesh بلا جذر مشترك)
        this.cropBatches?.setVisible?.(visible);

        for (const entry of this.fieldMeshes.values()) {
            if (entry?.group) roots.push(entry.group);
        }
        if (this.productionYard?.entries) {
            for (const e of this.productionYard.entries.values()) {
                if (e?.group) roots.push(e.group);
            }
        }

        for (const root of roots) {
            if (root) root.visible = visible;
        }

        // الضباب داخل البيت أقصر (غرفة مغلقة) — نحفظ كثافة الخارج أولًا
        if (this.scene?.fog) {
            if (!visible) this._outsideFogDensity = this.scene.fog.density;
            this.scene.fog.density = visible ? (this._outsideFogDensity || 0.012) : 0.06;
        }
    }

    /**
     * أقرب هدف تفاعل. يُنادى كل إطار لكنه يعمل بتردد ~8Hz لأن
     * قراءة الحالة (GameState.get) تعمل نسخة عميقة — لا نريدها كل إطار.
     * `force = true` يتخطى الجدولة (بعد زر تفاعل مثلًا).
     */
    checkNearTargets(force = false) {
        if (!this.player || !this.player.root) return;

        const now = performance.now();
        if (!force && now - (this._lastTargetCheck || 0) < 120) return;
        this._lastTargetCheck = now;

        const playerPos = this.player.root.position;

        /*
         * 🏠 داخل البيت: الأهداف الوحيدة هي عناصر الداخل (صندوق/باب خروج).
         * أهداف المزرعة مخفية ولا يجوز تفاعلها من وراء الجدران.
         */
        if (this.inInterior) {
            const item = this.houseInterior?.getNearestInteractable?.(playerPos, 2.4) || null;
            const promptEl = document.getElementById('action-prompt');
            const promptTitle = document.getElementById('prompt-title');
            const promptDesc = document.getElementById('prompt-desc');
            const promptBtn = document.getElementById('btn-prompt-action');

            if (!item) {
                this._setActiveTarget(null);
                promptEl?.classList.remove('visible');
                return;
            }

            this._setActiveTarget({ type: 'interior', id: item.id, label: item.label });
            if (!promptEl || !promptTitle || !promptDesc || !promptBtn) return;

            promptEl.classList.add('visible');
            promptTitle.textContent = item.label;
            if (item.id === 'exit') {
                promptDesc.textContent = 'اخرج إلى المزرعة — ستجد نفسك أمام باب البيت';
                promptBtn.textContent = 'خروج 🚪';
                promptBtn.style.background = 'linear-gradient(180deg, #79d63c 0%, #46961a 100%)';
            } else {
                promptDesc.textContent = 'صندوق التخزين — يفتح حقيبتك (محاصيل/منتجات/عدة)';
                promptBtn.textContent = item.button || 'فتح 🎒';
                promptBtn.style.background = 'linear-gradient(180deg, #c48a3a 0%, #8a5520 100%)';
            }
            return;
        }

        let closestTarget = null;
        let minDist = 3.6;

        const nearDoor = this.environment?.getNearestDoor(playerPos, 2.5);
        if (nearDoor) {
            const doorDist = nearDoor.distanceTo(playerPos);
            if (doorDist < minDist) {
                minDist = doorDist;
                closestTarget = { type: 'door', door: nearDoor };
            }
        }

        // 🛒 كشك السوق — قرب حقيقي يفتح تبويب السوق.
        const marketPos = this.environment?.buildings?.marketPos;
        if (marketPos) {
            const mDist = Math.hypot(playerPos.x - marketPos.x, playerPos.z - marketPos.z);
            if (mDist < 3.0 && mDist < minDist) {
                minDist = mDist;
                closestTarget = { type: 'market' };
            }
        }

        for (const [fieldId, entry] of this.fieldMeshes.entries()) {
            const field = entry.fieldData;
            if (!field) continue;

            const dx = playerPos.x - field.posX;
            const dz = playerPos.z - field.posZ;
            const distToField = Math.hypot(dx, dz);

            if (distToField > 5.5) continue;

            // الأرض غير المشتراة أو المشتراة غير المجهزة تُستهدف كحقل كامل،
            // والحقل الجاهز للزراعة تُستهدف خاناته individualًا.
            if (!field.purchased || !field.prepared) {
                if (distToField < minDist) {
                    minDist = distToField;
                    closestTarget = { type: 'field', fieldId, data: field };
                }
            } else {
                const slots = FarmingSystem.getOrCreateSlots(fieldId);
                for (let sIdx = 0; sIdx < slots.length; sIdx++) {
                    const slot = slots[sIdx];
                    const sdx = playerPos.x - (field.posX + slot.ox);
                    const sdz = playerPos.z - (field.posZ + slot.oz);
                    const dSlot = Math.hypot(sdx, sdz);

                    if (dSlot < 2.3 && dSlot < minDist) {
                        minDist = dSlot;
                        closestTarget = { type: 'slot', fieldId, slotIndex: sIdx, slot };
                    }
                }
            }
        }

        // 🐄 حيوانات المزرعة المرتبطة بـ AnimalSystem
        const rigs = this.environment?.animals?.animals;
        if (Array.isArray(rigs)) {
            for (const rig of rigs) {
                if (!rig.farmAnimalId || !rig.root) continue;
                const adx = playerPos.x - rig.root.position.x;
                const adz = playerPos.z - rig.root.position.z;
                const d = Math.hypot(adx, adz);

                if (d < 2.0 && d < minDist) {
                    minDist = d;
                    closestTarget = { type: 'animal', rig };
                }
            }
        }

        const promptEl = document.getElementById('action-prompt');
        const promptTitle = document.getElementById('prompt-title');
        const promptDesc = document.getElementById('prompt-desc');
        const promptBtn = document.getElementById('btn-prompt-action');

        if (!promptEl || !promptTitle || !promptDesc || !promptBtn) return;

        if (closestTarget) {
            this._setActiveTarget(closestTarget);
            promptEl.classList.add('visible');

            if (closestTarget.type === 'door') {
                const door = closestTarget.door;
                const isHouse = door.action === 'enter-house';
                promptTitle.textContent = isHouse ? `🏠 ${door.label || 'باب البيت'}` : (door.open ? '🚪 باب مفتوح' : `🚪 ${door.label}`);
                promptDesc.textContent = isHouse
                    ? 'ادخل البيت — غرف وأثاث وصندوق تخزين'
                    : (door.open ? 'أغلق الباب لتأمين المبنى' : 'ادخل المبنى أو أغلقه بعد المرور');
                promptBtn.textContent = isHouse ? 'دخول البيت 🏠' : (door.open ? 'إغلاق الباب' : 'فتح الباب');
                promptBtn.style.background = 'linear-gradient(180deg, #c48a3a 0%, #8a5520 100%)';
            } else if (closestTarget.type === 'market') {
                promptTitle.textContent = '🛒 سوق المزرعة';
                promptDesc.textContent = 'اعرض محاصيلك ومنتجاتك للبيع والشراء';
                promptBtn.textContent = 'فتح السوق 🛒';
                promptBtn.style.background = 'linear-gradient(180deg, #ab6cf2 0%, #7b3fd4 100%)';
            } else if (closestTarget.type === 'field') {
                const f = closestTarget.data;
                if (!f.purchased) {
                    promptTitle.textContent = '🌾 أرض جديدة متاح فتحها';
                    promptDesc.textContent = `السعر: 💰 ${LAND_CONFIG.fieldPrice} كوينز`;
                    promptBtn.textContent = 'شراء الأرض';
                    promptBtn.style.background = 'linear-gradient(180deg, #79d63c 0%, #46961a 100%)';
                } else {
                    promptTitle.textContent = '🪓 أرض تحتاج تجهيز بالفأس';
                    promptDesc.textContent = `نسبة التجهيز: ${f.prepProgress || 0}%`;
                    promptBtn.textContent = 'اضرب بالفأس 🪓';
                    promptBtn.style.background = 'linear-gradient(180deg, #ff9f1c 0%, #d87800 100%)';
                }
            } else if (closestTarget.type === 'animal') {
                const animal = AnimalSystem.getAnimalById(closestTarget.rig.farmAnimalId);
                const ready = animal?.state === 'ready';
                // الاسم العربي من GameData — لا مفاتيح إنجليزية في الواجهة.
                const speciesName = getAnimal(animal?.animalId)?.name || 'حيوان';
                promptTitle.textContent = ready ? '🧺 منتج جاهز!' : `${closestTarget.rig.animalIcon || '🐄'} ${speciesName}`;
                const feedDef = getAnimal(animal?.animalId);
                const feedItemId = feedDef?.feedItem || feedDef?.feed || 'wheat';
                promptDesc.textContent = ready
                    ? 'استلم المنتج من الحيوان'
                    : `يحتاج ${ITEMS[feedItemId]?.name || 'طعام'} — يُصنع في مطحنة الأعلاف`;
                promptBtn.textContent = ready ? 'جمع 🧺' : 'إطعام 🌾';
                promptBtn.style.background = ready
                    ? 'linear-gradient(180deg, #ffd54f 0%, #f5a623 100%)'
                    : 'linear-gradient(180deg, #79d63c 0%, #46961a 100%)';
            } else if (closestTarget.type === 'slot') {
                const s = closestTarget.slot;

                /*
                 * مراتب التربة (Brief §1 «Soil quality»): نُظهر مرتبة
                 * السماد في الوصف حتى يعرف اللاعب لماذا تختلف الجودة،
                 * ونقترح التسميد حين تكون الخانة مبكرة وبلا سماد.
                 */
                const fertTier = s.fertilizer && s.fertilizer !== 'none' ? s.fertilizer : null;
                const FERT_AR = { basic: 'سماد أساسي 🧪', quality: 'سماد فاخر ⚗️', deluxe: 'سماد ديلوكس ✨' };
                const fertNote = fertTier ? ` · التربة: ${FERT_AR[fertTier] || fertTier}` : '';
                const canFertilize = !fertTier &&
                    (InventorySystem.count('fert_basic') > 0 ||
                     InventorySystem.count('fert_quality') > 0 ||
                     InventorySystem.count('fert_deluxe') > 0);

                if (s.state === 'empty') {
                    promptTitle.textContent = '🌱 خانة تربة جاهزة';
                    promptDesc.textContent = `اختر بذرة من شريط الأدوات للزراعة${fertNote}` +
                        (canFertilize ? ' · لديك سماد — المتجر ← الأسمدة' : '');
                    promptBtn.textContent = 'زراعة 🌱';
                    promptBtn.style.background = 'linear-gradient(180deg, #5dbcf0 0%, #1e88e5 100%)';
                } else if (s.state === 'growing') {
                    promptTitle.textContent = s.watered ? '⏳ المحصول ينمو...' : '💧 المحصول عطشان';
                    promptDesc.textContent = (s.watered ? 'انتظر اكتمال النضج' : 'قم بري المحصول لتسريع النمو') + fertNote;
                    promptBtn.textContent = s.watered ? 'ينمو...' : 'اسقِ ماء 💧';
                    promptBtn.style.background = 'linear-gradient(180deg, #00d2ff 0%, #0088cc 100%)';
                } else if (s.state === 'withered') {
                    promptTitle.textContent = '🍂 محصول ذابل';
                    promptDesc.textContent = 'أزل المحصول لإعادة زراعة الخانة';
                    promptBtn.textContent = 'تنظيف 🧹';
                    promptBtn.style.background = 'linear-gradient(180deg, #b98a4f 0%, #8a5f2a 100%)';
                } else if (s.state === 'ready') {
                    promptTitle.textContent = '🧺 المحصول ناضج وجاهز!';
                    promptDesc.textContent = `الحصاد يدخل المحصول للصومعة — ثم بِعه${fertNote}`;
                    promptBtn.textContent = 'حصاد 🧺';
                    promptBtn.style.background = 'linear-gradient(180deg, #ffd54f 0%, #f5a623 100%)';
                }
            }
        } else {
            this._setActiveTarget(null);
            promptEl.classList.remove('visible');
        }
    }

    onLandPurchased({ field, cost }) {
        const entry = this.fieldMeshes.get(field.id);
        if (!entry) return;

        entry.fieldData.purchased = true;
        entry.fieldData.prepared = false;
        entry.fieldData.prepProgress = 0;

        entry.soilMesh.material.color.setHex(CONFIG.colors.roughLand);
        entry.frameMesh.material.color.setHex(CONFIG.colors.wood);
        entry.group.remove(entry.lockGroup);

        this.addWildProps(entry.wildGroup);

        this.spawnFloatingFeedback('🌾 تم شراء الأرض!', '#76d941');
        setTimeout(() => {
            this.spawnFloatingFeedback(`-${cost} 💰`, '#ffd54f');
        }, 280);

        this.checkNearTargets();
    }

    onLandAxeHit({ field, progress }) {
        const entry = this.fieldMeshes.get(field.id);
        if (!entry) return;

        entry.fieldData.prepProgress = progress;

        const origY = entry.group.position.y;
        entry.group.position.y = -0.06;
        setTimeout(() => { entry.group.position.y = origY; }, 120);

        this.spawnFloatingFeedback(`🪓 ضربة فأس! (${progress}%)`, '#ffb800');
        this.checkNearTargets();
    }

    onLandPrepared({ field }) {
        const entry = this.fieldMeshes.get(field.id);
        if (!entry) return;

        entry.fieldData.prepared = true;
        entry.fieldData.state = 'empty';

        /*
         * الصخور/الأعشاب البرية تستخدم هندسة ومواد مشتركة (مخمّنة في
         * addWildProps) لذلك نُزيل الأطفال فقط — dispose يفسد بقية الحقول
         * التي تشارك نفس المورد. الهندسة الخاصة وحدها تُتلف.
         */
        for (let i = entry.wildGroup.children.length - 1; i >= 0; i--) {
            const child = entry.wildGroup.children[i];
            entry.wildGroup.remove(child);
            if (child.userData?.ownGeometry) child.geometry?.dispose();
        }

        entry.soilMesh.material.color.setHex(CONFIG.colors.soil);
        this.renderAllFieldSlots(field.id);

        // MF-05: منحة XP من LAND_CONFIG (مصدر واحد للعرض والتطبيق — R1)
        this.spawnFloatingFeedback(`✨ الحقل جاهز للزراعة! (+${LAND_CONFIG.prepRewardXp} XP)`, '#4ade80');
        try {
            const currentXp = GameState.get('player.xp') || 0;
            GameState.set('player.xp', currentXp + LAND_CONFIG.prepRewardXp);
        } catch (e) {
            Logger.error('Land', 'prep XP grant failed — player missed reward', e);
        }

        this.checkNearTargets();
    }

    onCropHarvested({ fieldId, slotIndex, crop, amount = 1, coins = 0, xp = 0, itemId,
                      quality = 'normal', qualityName = '', qualityIcon = '' }) {
        this.cropBatches?.markDirty();
        haptic(12); // MF-13: نبضة حصاد — iOS يتجاهلها بصمت

        // MF-13: تناثر سنابل ذهبية فوق الخانة المحصودة (حوض sprites بلا تخصيص)
        try {
            const entry = this.fieldMeshes.get(fieldId);
            const slot = slotIndex != null ? FarmingSystem.getOrCreateSlots(fieldId)[slotIndex] : null;
            if (entry?.fieldData && slot) {
                this.spawnWheatBurst(
                    entry.fieldData.posX + slot.ox,
                    entry.fieldData.posZ + slot.oz,
                    Math.min(14, 8 + amount * 3)
                );
            }
        } catch (e) {
            Logger.warn('FX', 'wheat burst skipped', e);
        }


        if (crop) {
            const extra = coins > 0 ? ` (+${coins} 💰)` : '';
            // الجودة تظهر للاعب حتى يفهم أثر السماد (Brief §1 «Soil quality»)
            const qualityNote = quality && quality !== 'normal'
                ? ` ${qualityIcon || '✨'} ${qualityName || quality}`
                : '';
            this.spawnFloatingFeedback(
                `🧺 +${amount} ${crop.name}${qualityNote} → الصومعة (+${xp} XP)${extra}`,
                quality === 'platinum' ? '#7ee8fa' : quality === 'gold' ? '#ffd54f' : '#4ade80'
            );
        }

        this.hud?.syncSeedCounts?.();
        this.hud?.syncStorage?.();
        this.checkNearTargets(true);
    }

    onLandPurchaseFailed({ reason, price }) {
        if (reason === 'insufficient-funds') {
            // MF-05: السعر يصل مع الحدث من LandSystem (مصدر واحد — R1)
            this.spawnFloatingFeedback(`💰 تحتاج إلى ${price ?? LAND_CONFIG.fieldPrice} كوينز لشراء هذا الحقل`, '#ff4d4d');
        }
    }

    /* ============================================================
       MF-09 — حوض نصوص عائمة: 6 عُقد ثابتة تُدوَّر (R4)
       ------------------------------------------------------------
       كان كل حدث (حصاد/بيع/فأس) يخصص div جديدًا → GC spikes عند
       حصاد حقل كامل. الآن: لا تخصيص بعد البناء، والرسالة المتكررة
       تندمج في عقدتها («… ×N»)، وOverflow يستبدل الأقدم بالتناوب.
       العُقد تُخفي ذاتها عبر CSS animation (floatUpAnim 1.3s).
       ============================================================ */
    _initFeedbackPool() {
        if (this._ffPool) return;
        this._ffPool = [];
        for (let i = 0; i < 6; i++) {
            const el = document.createElement('div');
            el.className = 'floating-feedback';
            el.style.left = '50%';
            el.style.top = '44%';
            el.style.transform = 'translate(-50%, -50%)';
            el.style.display = 'none';
            document.body.appendChild(el);
            this._ffPool.push({ el, busy: false, base: '', color: '', count: 0 });
        }
        this._ffCursor = 0;
    }

    _replayFloat(slot) {
        const el = slot.el;
        // إعادة تشغيل الأنيميشن، وعند اكتمالها تتحرر العقدة/تُخفى ذاتيًا
        el.onanimationend = () => {
            slot.busy = false;
            slot.base = '';
            el.style.display = 'none';
        };
        el.style.animation = 'none';
        void el.offsetWidth; // reflow مقصود لإعادة انطلاق الأنيميشن
        el.style.animation = '';
    }

    spawnFloatingFeedback(text, color = '#ffd54f') {
        this._initFeedbackPool();
        const pool = this._ffPool;

        // دمج المتكرر: نفس النص/اللون على أحدث عقدة نشطة ⇒ «… ×N»
        const latest = pool[(this._ffCursor + pool.length - 1) % pool.length];
        if (latest && latest.busy && latest.base === text && latest.color === color) {
            latest.count += 1;
            latest.el.textContent = `${text} ×${latest.count}`;
            this._replayFloat(latest);
            return;
        }

        const slot = pool.find((p) => !p.busy) || pool[this._ffCursor % pool.length];
        this._ffCursor = (this._ffCursor + 1) % pool.length;

        slot.busy = true;
        slot.base = text;
        slot.color = color;
        slot.count = 1;
        slot.el.textContent = text;
        slot.el.style.color = color;
        slot.el.style.display = 'block';
        this._replayFloat(slot);
    }

    handleKeyDown(e) {
        if (e.code === 'KeyW' || e.code === 'ArrowUp') this.keys.up = true;
        if (e.code === 'KeyS' || e.code === 'ArrowDown') this.keys.down = true;
        if (e.code === 'KeyA' || e.code === 'ArrowLeft') this.keys.left = true;
        if (e.code === 'KeyD' || e.code === 'ArrowRight') this.keys.right = true;
        if (e.code === 'Space' || e.code === 'KeyE') {
            e.preventDefault();
            this.triggerActiveInteraction();
        }
        if (e.code >= 'Digit1' && e.code <= 'Digit9') {
            const idx = Number(e.code.replace('Digit', '')) - 1;
            this.hud?.selectSlot(idx);
        }
    }

    handleKeyUp(e) {
        if (e.code === 'KeyW' || e.code === 'ArrowUp') this.keys.up = false;
        if (e.code === 'KeyS' || e.code === 'ArrowDown') this.keys.down = false;
        if (e.code === 'KeyA' || e.code === 'ArrowLeft') this.keys.left = false;
        if (e.code === 'KeyD' || e.code === 'ArrowRight') this.keys.right = false;
    }

    /* ============================================================
       👆 اختيار مباني الإنتاج باللمس + تركيز الكاميرا
       ============================================================ */

    /** نقرة خفيفة على الكانفس (بدون سحب) = محاولة اختيار مبنى */
    _maybeCanvasTap(e) {
        if (!this._tapStart || this._tapStart.pointerId !== e.pointerId) return;
        const start = this._tapStart;
        this._tapStart = null;

        const dist = Math.hypot(e.clientX - start.x, e.clientY - start.y);
        const held = performance.now() - start.t;
        if (dist > 12 || held > 420) return; // كان سحب كاميرا — تجاهل

        this.handleTap(e.clientX, e.clientY);
    }

    handleTap(clientX, clientY) {
        if (!this.camera) return;
        const hit = this.productionYard?.pick(clientX, clientY, this.camera);
        if (hit) {
            Events.emit('production:building-selected', hit);
            return;
        }
        // النقر على كشك السوق يفتح تبويب السوق مباشرة.
        if (this._tapHitsMarket(clientX, clientY)) {
            this.gameUI?.open('shop', 'market');
            return;
        }
        Events.emit('production:deselect');
    }

    _tapHitsMarket(clientX, clientY) {
        const mg = this.environment?.buildings?.marketGroup;
        if (!mg) return false;
        this._tapRay = this._tapRay || new THREE.Raycaster();
        this._tapPtr = this._tapPtr || new THREE.Vector2();
        const w = window.innerWidth || 1;
        const h = window.innerHeight || 1;
        this._tapPtr.set((clientX / w) * 2 - 1, -(clientY / h) * 2 + 1);
        this._tapRay.setFromCamera(this._tapPtr, this.camera);
        return this._tapRay.intersectObject(mg, true).length > 0;
    }

    /** تركيز مؤقت للكاميرا على المبنى المختار (~1.9 ثانية) */
    focusOnBuilding(hit) {
        if (!hit || !this.clock) return;
        this.cameraFocus.x = hit.x;
        this.cameraFocus.z = hit.z;
        this.cameraFocus.until = this.clock.getElapsedTime() + 1.9;
        this.cameraFocus.active = true;
        this.productionYard?.setSelected(hit.instanceId);
    }

    /** إسقاط إحداثيات العالم على الشاشة (للفقاعات العائمة) */
    projectToScreen(x, z, height = 2.3) {
        if (!this.camera) return { x: 0, y: 0, visible: false };
        const v = new THREE.Vector3(x, height, z).project(this.camera);
        const visible =
            v.z < 1 && Math.abs(v.x) <= 1.15 && Math.abs(v.y) <= 1.15;
        return {
            x: (v.x * 0.5 + 0.5) * window.innerWidth,
            y: (-v.y * 0.5 + 0.5) * window.innerHeight,
            visible
        };
    }

    setupCameraTouch() {
        if (!this.canvas) return;

        const getTouchDistance = () => {
            const points = [...this.activeTouches.values()];
            if (points.length < 2) return 0;
            const dx = points[0].x - points[1].x;
            const dy = points[0].y - points[1].y;
            return Math.hypot(dx, dy);
        };

        this.canvas.addEventListener('pointerdown', (e) => {
            if (e.target !== this.canvas) return;

            this.activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
            this.canvas.setPointerCapture?.(e.pointerId);

            if (this.activeTouches.size === 1) {
                this.touchCameraActive = true;
                this.cameraTouchId = e.pointerId;
                this.touchLastX = e.clientX;
                this.touchLastY = e.clientY;
                // 👆 تتبّع النقرة الخفيفة (Tap) لاختيار المباني
                this._tapStart = {
                    x: e.clientX, y: e.clientY,
                    t: performance.now(), pointerId: e.pointerId
                };
            } else if (this.activeTouches.size === 2) {
                this.touchCameraActive = false;
                this._tapStart = null; // إيماءة متعددة الأصابع ليست نقرة
                this.pinchStartDistance = getTouchDistance();
                this.pinchStartCameraDistance = this.cameraDistance;
            }
        });

        this.canvas.addEventListener('pointermove', (e) => {
            if (!this.activeTouches.has(e.pointerId)) return;
            this.activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });

            if (this.activeTouches.size >= 2) {
                const currentDist = getTouchDistance();
                if (currentDist > 0 && this.pinchStartDistance > 0) {
                    const ratio = this.pinchStartDistance / currentDist;
                    this.cameraDistance = THREE.MathUtils.clamp(
                        this.pinchStartCameraDistance * ratio,
                        CONFIG.camera.minDistance,
                        CONFIG.camera.maxDistance
                    );
                }
                return;
            }

            if (this.touchCameraActive && e.pointerId === this.cameraTouchId) {
                const dx = e.clientX - this.touchLastX;
                const dy = e.clientY - this.touchLastY;
                this.touchLastX = e.clientX;
                this.touchLastY = e.clientY;

                this.cameraYaw -= dx * 0.0055;
                this.cameraPitch = THREE.MathUtils.clamp(
                    this.cameraPitch - dy * 0.0035,
                    CONFIG.camera.minPitch,
                    CONFIG.camera.maxPitch
                );
            }
        });

        const releasePointer = (e) => {
            if (!this.activeTouches.has(e.pointerId)) return;
            this._maybeCanvasTap(e);
            this.activeTouches.delete(e.pointerId);

            if (this.activeTouches.size === 1) {
                const [remainingId, pos] = [...this.activeTouches.entries()][0];
                this.cameraTouchId = remainingId;
                this.touchLastX = pos.x;
                this.touchLastY = pos.y;
                this.touchCameraActive = true;
            } else if (this.activeTouches.size === 0) {
                this.touchCameraActive = false;
                this.cameraTouchId = null;
            }
        };

        this.canvas.addEventListener('pointerup', releasePointer);
        this.canvas.addEventListener('pointercancel', releasePointer);
        this.canvas.addEventListener('pointerleave', releasePointer);
    }

    /**
     * تصادم الكاميرا (رخيص للموبايل): نختبر 8 نقاط من الهدف نحو الموضع
     * المطلوب ونأخذ أبعد نقطة حرة. نتجاهل الصناديق المنخفضة عن ارتفاع
     * الكاميرا (أسوار/أحواض) والحيوانات — المهم المباني والجدران والأشجار.
     *
     * يشمل الآن raycast-based occlusion: عند وجود حائط بين الكاميرا
     * والهدف، نسحب الكاميرا للأمام بدل الانغراس داخل الجدار.
     */
    _resolveCameraCollision(look, desired, out) {
        out.copy(desired);
        if (!this.collision || !this.collision.boxes || this.collision.boxes.length === 0) return out;

        /* ── Raycast occlusion pass: when walls obstruct line of sight,
           smoothly lerp camera distance forward to prevent clipping ── */
        if (typeof this.collision.raycastCameraOcclusion === 'function') {
            const hitT = this.collision.raycastCameraOcclusion(
                desired.x, desired.y, desired.z,
                look.x, look.y, look.z,
                0.5 // skip low obstacles (fences/plants)
            );
            if (hitT < 1.0 && hitT > 0.0) {
                // Pull camera forward to just before the wall (with margin)
                const pullBack = Math.max(0.05, hitT - 0.08);
                const rdx = desired.x - look.x;
                const rdy = desired.y - look.y;
                const rdz = desired.z - look.z;
                out.set(
                    look.x + rdx * pullBack,
                    look.y + rdy * pullBack + 0.15,
                    look.z + rdz * pullBack
                );
                return out;
            }
        }

        const steps = 8;
        const dx = desired.x - look.x;
        const dy = desired.y - look.y;
        const dz = desired.z - look.z;

        for (let i = 0; i <= steps; i++) {
            const t = 1 - i / steps;
            const x = look.x + dx * t;
            const y = look.y + dy * t;
            const z = look.z + dz * t;
            if (!this._cameraPointBlocked(x, y, z)) {
                out.set(x, y, z);
                return out;
            }
        }
        // كل المسار مسدود: التصق بنقطة النظر بدل الدخول في الحائط.
        out.set(look.x + dx * 0.08, look.y + dy * 0.08 + 0.4, look.z + dz * 0.08);
        return out;
    }

    /**
     * 🏠 حجز الكاميرا داخل الغرفة: لا اختراق للجدران/السقف، ولا
     * ابتعاد عن اللاعب (المسافة أصغر أصلًا داخل البيت).
     */
    _clampCameraToInterior() {
        const b = INTERIOR_BOUNDS;
        const cam = this.cameraTargetPosition;
        cam.x = THREE.MathUtils.clamp(cam.x, b.minX + 0.35, b.maxX - 0.35);
        cam.z = THREE.MathUtils.clamp(cam.z, b.minZ + 0.35, b.maxZ - 0.35);
        cam.y = THREE.MathUtils.clamp(cam.y, 1.05, INTERIOR_ROOM.wallHeight - 0.45);

        // نقطة النظر تبقى داخل الغرفة هي الأخرى
        this.cameraLookTarget.x = THREE.MathUtils.clamp(this.cameraLookTarget.x, b.minX, b.maxX);
        this.cameraLookTarget.z = THREE.MathUtils.clamp(this.cameraLookTarget.z, b.minZ, b.maxZ);
        this.cameraLookTarget.y = THREE.MathUtils.clamp(this.cameraLookTarget.y, 0.8, 2.4);
    }

    _cameraPointBlocked(x, y, z) {
        const boxes = this.collision.boxes;
        for (let i = 0; i < boxes.length; i++) {
            const box = boxes[i];
            if (!box.solid) continue;
            if (box.tag === 'animal') continue;
            if (box.maxY < y - 0.6) continue; // الصندوق أقصر من الكاميرا
            if (box.minY > y + 0.4) continue;
            if (box.distanceToPoint(x, z) < 0.5) return true;
        }
        return false;
    }

    resize() {
        if (!this.camera || !this.renderer) return;
        const width = window.innerWidth;
        const height = window.innerHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        const pixelRatio = Math.min(
            window.devicePixelRatio || 1,
            CONFIG.performance.maxPixelRatio
        );
        this.renderer.setPixelRatio(pixelRatio);
        this.renderer.setSize(width, height, false);
    }

    start() {
        if (this.running) return;
        this.running = true;
        this.clock.start();
        requestAnimationFrame(this._boundLoop);
    }

    gameLoop() {
        if (!this.running) return;
        const delta = Math.min(this.clock.getDelta(), 0.1);
        this.update(delta);
        this.render();
        requestAnimationFrame(this._boundLoop);
    }

    /* ============================================================
       🌗 دورة النهار/الليل — من ساعة الجهاز الحقيقية (Brief §0.3/§2)
       ------------------------------------------------------------
       لا محاكاة زمنية: 1 ثانية = 1 ثانية. كل دقيقة حقيقية نُحدّث:
         • اتجاه الشمس/القمر (نفس اتجاه القرص المرئي في SkyDome)
         • شدة ولون الشمس + السماء المحيطة + ضوء التعبئة
         • لون/كثافة الضباب من مزاج الفصل والساعة
         • مصابيح الليل + نوافذ البيوت + فراء الحيوانات
         • ساعة الـ HUD (الوقت + التاريخ + الفصل ثنائي اللغة)
       ============================================================ */
    applyDayNight() {
        if (!this.lights?.sun || !this.scene || typeof Time.getClock !== 'function') return;

        const clock = Time.getClock();
        const key = clock.hours * 60 + clock.minutes;
        if (key === this._dayNightKey) return;
        this._dayNightKey = key;

        const sky = this.environment?.sky || null;
        if (sky) {
            // نبني لقطة السماء أولًا حتى نقرأ منها الاتجاه/العوامل
            sky.update(clock, 0, this.player?.root?.position || null);
        }

        const hourFloat = Number.isFinite(clock.hourFloat)
            ? clock.hourFloat
            : clock.hours + (clock.minutes || 0) / 60;
        const season = clock.season || 'summer';

        // --- اتجاه الشمس: من القبة إن وُجدت، وإلا حساب من الساعة ---
        if (!this._sunDir) this._sunDir = new THREE.Vector3();
        if (sky && sky.sunDirection) {
            this._sunDir.copy(sky.sunDirection);
        } else {
            const elevation = Math.sin(((hourFloat - 6) / 12) * Math.PI);
            const angle = ((hourFloat - 6) / 12) * Math.PI;
            this._sunDir.set(
                Math.cos(angle) * 0.85,
                Math.max(-0.45, elevation),
                Math.sin(angle) * 0.45 - 0.25
            ).normalize();
        }

        const dayFactor = sky ? sky.getDayFactor() : Math.min(1, Math.max(0, clock.sunFactor ?? 0.5));
        const nightFactor = sky ? sky.getNightFactor() : 1 - dayFactor;
        const isDay = this._sunDir.y > 0.02;

        /*
         * موضع الضوء: نهارًا من الشمس، ليلًا من القمر (الاتجاه المعاكس)
         * حتى تبقى الظلال مقروءة دون أن تنقلب مع الغروب.
         */
        const radius = 46;
        if (!this._sunOffset) this._sunOffset = new THREE.Vector3(22, 38, 18);
        const sx = isDay ? this._sunDir.x : -this._sunDir.x;
        const sy = isDay ? Math.max(0.18, this._sunDir.y) : Math.max(0.22, -this._sunDir.y);
        const sz = isDay ? this._sunDir.z : -this._sunDir.z;
        this._sunOffset.set(sx * radius, sy * radius, sz * radius);

        // --- شدة ولون الشمس (مزاج الفصل) ---
        this.lights.sun.intensity = isDay ? 0.28 + dayFactor * 1.95 : 0.3;
        const sunTint = SUN_TINT_BY_SEASON[season] || 0xfff6e4;
        if (!isDay) {
            this.lights.sun.color.setHex(0x9fc0ff);           // ضوء قمر بارد
        } else if (dayFactor > 0.55) {
            this.lights.sun.color.setHex(sunTint);             // نهار الفصل
        } else {
            this.lights.sun.color.setHex(0xffab5e);            // شروق/غروب دافئ
        }

        if (this.lights.ambient) {
            const hemi = AMBIENT_BY_SEASON[season] || AMBIENT_BY_SEASON.summer;
            this.lights.ambient.color.setHex(hemi.sky);
            this.lights.ambient.groundColor.setHex(hemi.ground);
            this.lights.ambient.intensity = 0.42 + dayFactor * 1.0;
        }
        if (this.lights.fill) {
            this.lights.fill.intensity = 0.1 + (1 - dayFactor) * 0.32;
        }

        // --- السماء/الضباب: خارج البيت فقط (الداخل غرفة مغلقة) ---
        if (!this.inInterior) {
            if (sky) {
                if (this.scene.background && this.scene.background.isColor) {
                    sky.getFogColor(this.scene.background);
                } else {
                    this.scene.background = sky.getFogColor(new THREE.Color());
                }
                if (this.scene.fog) {
                    sky.getFogColor(this.scene.fog.color);
                    const base = FOG_DENSITY_BY_SEASON[season] ?? 0.016;
                    // MF-07: معامل جودة الرسوم (low = ضباب أثقل يخفي العمق)
                    this.scene.fog.density = (base + (1 - dayFactor) * 0.012) * (this._fogScale || 1);
                    this._outsideFogDensity = this.scene.fog.density;
                }
            } else if (this.scene.background && this.scene.background.isColor) {
                // احتياط بلا قبة: تدرّج ليل ← غروب ← نهار
                if (!this._skyNight) {
                    this._skyNight = new THREE.Color(0x132338);
                    this._skyDusk = new THREE.Color(0xf59e42);
                    this._skyDay = new THREE.Color(0x7bc4f0);
                    this._skyScratch = new THREE.Color();
                }
                this._skyScratch.copy(this._skyNight).lerp(this._skyDusk, 1 - nightFactor);
                this._skyScratch.lerp(this._skyDay, dayFactor);
                this.scene.background.copy(this._skyScratch);
                if (this.scene.fog) this.scene.fog.color.copy(this._skyScratch);
            }

            // --- مصابيح الليل + نوافذ البيوت + فراء الحيوانات ---
            try {
                this.environment?.buildings?.setNightFactor?.(nightFactor);
                this.environment?.animals?.setNightFactor?.(nightFactor);
            } catch (e) { Logger.warn('World', 'night lamps/coat sync failed', e); }
        }

        // --- الصبغة الموسمية (عند تغيّر الفصل فقط) ---
        try {
            if (season !== this._seasonApplied) {
                this._seasonApplied = season;
                this.environment?.setSeason?.(season);
                sky?.setSeason?.(season);
            }
        } catch (e) { Logger.warn('World', 'seasonal tint apply failed', e); }

        // --- ساعة الـ HUD: وقت + تاريخ حقيقي + فصل ثنائي اللغة ---
        if (typeof this.hud?.applyClock === 'function') {
            this.hud.applyClock(clock);
        } else {
            this.hud?.updateClock?.(
                typeof Time.getClockLabel === 'function' ? Time.getClockLabel() : '',
                typeof Time.getPhaseIcon === 'function' ? Time.getPhaseIcon() : '☀️',
                clock.day,
                season
            );
        }
        this.hud?.syncStorage?.();
    }

    // ============ MF-13: تناثر سنابل ذهبية فوق الخانة المحصودة ============
    // حوض 24 sprite بلا تخصيص في الحلقة؛ الـ canvas texture تُبنى مرة واحدة.

    _initBurstPool() {
        if (this._burstPool) return;
        this._burstPool = [];
        const cv = (typeof document !== 'undefined') ? document.createElement('canvas') : null;
        if (cv && !this._grainTex) {
            cv.width = 32; cv.height = 32;
            const g = cv.getContext('2d');
            const grad = g.createRadialGradient(16, 16, 2, 16, 16, 15);
            grad.addColorStop(0, 'rgba(255,240,180,1)');
            grad.addColorStop(0.55, 'rgba(232,196,92,0.95)');
            grad.addColorStop(1, 'rgba(232,196,92,0)');
            g.fillStyle = grad; g.beginPath(); g.arc(16, 16, 15, 0, Math.PI * 2); g.fill();
            g.fillStyle = 'rgba(196,148,48,0.9)';
            for (const [x, y] of [[16, 8], [11, 13], [21, 13], [16, 18]]) {
                g.beginPath(); g.ellipse(x, y, 2.6, 4.4, 0, 0, Math.PI * 2); g.fill();
            }
            this._grainTex = new THREE.CanvasTexture(cv);
        }
        if (!this._grainTex) return;
        for (let i = 0; i < 24; i++) {
            const mat = new THREE.SpriteMaterial({ map: this._grainTex, transparent: true, depthWrite: false, opacity: 0 });
            const s = new THREE.Sprite(mat);
            s.scale.set(0.16, 0.2, 1);
            s.visible = false;
            s.userData = { live: false, vx: 0, vy: 0, vz: 0, t: 0, life: 0.7 };
            this.scene.add(s);
            this._burstPool.push(s);
        }
    }

    spawnWheatBurst(wx, wz, count = 10) {
        this._initBurstPool();
        if (!this._burstPool?.length) return;
        let n = Math.min(count ?? 10, this._burstPool.length);
        for (const s of this._burstPool) {
            if (n <= 0) break;
            if (s.userData.live) continue;
            const a = Math.random() * Math.PI * 2;
            const sp = 1.6 + Math.random() * 1.4;
            s.userData.live = true;
            s.userData.t = 0;
            s.userData.vx = Math.cos(a) * sp;
            s.userData.vz = Math.sin(a) * sp;
            s.userData.vy = 3.2 + Math.random() * 1.6;
            s.position.set(wx, 0.5, wz);
            s.material.opacity = 1;
            s.visible = true;
            n--;
        }
    }

    /** مقادير الجاذبية والتلاشي مدفوعة بـ delta — لا توقيتات، لا تخصيص (R4). */
    _updateBurst(delta) {
        if (!this._burstPool) return;
        const dt = delta / 1000;
        for (const s of this._burstPool) {
            const u = s.userData;
            if (!u.live) continue;
            u.t += dt;
            if (u.t >= u.life) { u.live = false; s.visible = false; continue; }
            u.vy -= 9.8 * dt;
            s.position.x += u.vx * dt;
            s.position.y = Math.max(0.12, s.position.y + u.vy * dt);
            s.position.z += u.vz * dt;
            s.material.opacity = 1 - (u.t / u.life);
        }
    }

    update(delta) {
        this._updateBurst(delta);
        const elapsed = this.clock.getElapsedTime();
        // لقطة الساعة الحقيقية (نفس الكائن الذي يقرأه applyDayNight)
        const clock = typeof Time.getClock === 'function' ? Time.getClock() : null;
        const playerPos = this.player?.root?.position || null;

        // منطق المزرعة يستمر حتى داخل البيت (محاصيل/آلات/حيوانات)
        FarmingSystem.updateGrowth();
        this.applyDayNight();

        if (this.inInterior) {
            // 🏠 الداخل: غرفة + سماء تتابع اللاعب (تُرى من النوافذ)
            this.houseInterior?.update(delta);
            this.environment?.updateSky?.(clock, delta, playerPos);
        } else {
            this.cropBatches?.update(delta, elapsed, this.fieldMeshes);
            this.productionYard?.update(delta, elapsed);
            this.environment?.update(delta, elapsed, clock, playerPos);

            this.clouds.forEach((cloud) => {
                cloud.position.x += delta * 0.8;
                if (cloud.position.x > 55) cloud.position.x = -55;
            });

            for (const entry of this.fieldMeshes.values()) {
                if (!entry.fieldData.purchased && entry.lockGroup) {
                    entry.lockGroup.position.y = 1.25 + Math.sin(elapsed * 2.5) * 0.08;
                    entry.lockGroup.rotation.y += delta * 0.6;
                }
            }

            this.animatedTrees.forEach((tree, idx) => {
                tree.rotation.z = Math.sin(elapsed * 1.5 + idx) * 0.015;
            });
        }

        if (this.player && this.player.root) {
            let inputX = this.joystickVector.x;
            let inputZ = -this.joystickVector.y;

            if (this.keys.up) inputZ -= 1;
            if (this.keys.down) inputZ += 1;
            if (this.keys.left) inputX -= 1;
            if (this.keys.right) inputX += 1;

            let moveVector = new THREE.Vector3();
            if (Math.hypot(inputX, inputZ) > 0.05) {
                const forward = new THREE.Vector3(-Math.sin(this.cameraYaw), 0, -Math.cos(this.cameraYaw));
                const right = new THREE.Vector3(Math.cos(this.cameraYaw), 0, -Math.sin(this.cameraYaw));
                moveVector.addScaledVector(forward, -inputZ);
                moveVector.addScaledVector(right, inputX);
                moveVector.normalize();
            }

            this.player.update(delta, moveVector);

            this.checkNearTargets();

            if (this.lights.sun) {
                // قوس النهار/الليل من applyDayNight + تتبّع اللاعب (ظلال متحركة)
                const off = this._sunOffset || DEFAULT_SUN_OFFSET;
                this.lights.sun.position.set(
                    this.player.root.position.x + off.x,
                    off.y,
                    this.player.root.position.z + off.z
                );
                this.lights.sun.target.position.copy(this.player.root.position);
                this.lights.sun.target.updateMatrixWorld();
            }

            if (this.cameraFocus.active && this.clock.getElapsedTime() < this.cameraFocus.until) {
                // 🎯 تركيز سلس على مبنى إنتاج محدد
                const fx = this.cameraFocus.x;
                const fz = this.cameraFocus.z;
                const focusDist = Math.min(this.cameraDistance, 6.0);
                const fh = focusDist * Math.cos(this.cameraPitch);
                const fv = focusDist * Math.sin(this.cameraPitch) + 2.1;

                this.cameraTargetPosition.set(
                    fx + Math.sin(this.cameraYaw) * fh,
                    Math.max(1.2, fv),
                    fz + Math.cos(this.cameraYaw) * fh
                );
                this.cameraLookTarget.set(fx, 1.05, fz);
            } else {
                this.cameraFocus.active = false;

                // كاميرا طرف ثالث PUBG-style: تتبّع الموضع فقط (lerp)،
                // والـ yaw لا يتغير إلا بسحب النظر/القرص — المشي لا يديرها أبدًا.
                const horizontalDist = this.cameraDistance * Math.cos(this.cameraPitch);
                const verticalDist = this.cameraDistance * Math.sin(this.cameraPitch);
                const px = this.player.root.position.x;
                const py = this.player.root.position.y;
                const pz = this.player.root.position.z;

                const backX = Math.sin(this.cameraYaw);
                const backZ = Math.cos(this.cameraYaw);
                const rightX = Math.cos(this.cameraYaw);
                const rightZ = -Math.sin(this.cameraYaw);

                // نقطة النظر أمام اللاعب ⇒ اللاعب أسفل-منتصف الكادر.
                this.cameraLookTarget.set(
                    px - backX * CONFIG.camera.lookAhead + rightX * CONFIG.camera.shoulderOffset * 0.55,
                    py + CONFIG.camera.targetHeight,
                    pz - backZ * CONFIG.camera.lookAhead + rightZ * CONFIG.camera.shoulderOffset * 0.55
                );

                // موضع فوق-الكتف: خلف + يمين + فوق.
                this._desiredCamPos = this._desiredCamPos || new THREE.Vector3();
                this._desiredCamPos.set(
                    px + backX * horizontalDist + rightX * CONFIG.camera.shoulderOffset,
                    py + CONFIG.camera.targetHeight + verticalDist,
                    pz + backZ * horizontalDist + rightZ * CONFIG.camera.shoulderOffset
                );

                // تصادم الكاميرا: انسحاب تدريجي بدل الانغراس في الجدران.
                this._resolveCameraCollision(this.cameraLookTarget, this._desiredCamPos, this.cameraTargetPosition);
                if (this.cameraTargetPosition.y < 0.7) this.cameraTargetPosition.y = 0.7;

                // 🏠 داخل البيت: الكاميرا لا تخرج من الغرفة ولا ترتفع فوق السقف
                if (this.inInterior) this._clampCameraToInterior();
            }

            const lerpFactor = 1.0 - Math.exp(-delta * 9.5);
            this.camera.position.lerp(this.cameraTargetPosition, lerpFactor);
            this.camera.lookAt(this.cameraLookTarget);
        }
    }

    render() {
        if (!this.renderer || !this.scene || !this.camera) return;
        this.renderer.render(this.scene, this.camera);
    }

    hideLoading() {
        const loadingScreen = document.getElementById('loading-screen');
        if (!loadingScreen) return;

        // نملأ الشريط ثم نخفي — حتى لا يبدو التحميل مقطوعًا
        const fill = document.getElementById('loading-fill');
        const track = document.getElementById('loading-track');
        if (fill) fill.style.width = '100%';
        if (track) track.setAttribute('aria-valuenow', '100');
        this.setBootProgress(100);

        setTimeout(() => loadingScreen.classList.add('fade-out'), 180);
        setTimeout(() => {
            if (loadingScreen.parentNode) {
                loadingScreen.parentNode.removeChild(loadingScreen);
            }
        }, 620);
    }

    stop() {
        this.running = false;
    }

    /**
     * GAP-04 — التدمير كان يحرّر المشهد/المصيّر فقط، ويترك مؤقّتات
     * النواة حيّة: ساعة اللعبة (وعدّاد الحفظ التلقائي ومؤقّت تحديث
     * الطلبات)، إضافة إلى مستمع `visibilitychange`. النتيجة: تسريب
     * مؤقّتات بعد destroy() وأخطاء كتابة على حالة ميتة.
     * الآن نوقف كل مالك مؤقّت عبر واجهته الرسمية.
     */
    _teardownCoreTimers() {
        try {
            OrderSystem.stop();
        } catch (err) {
            Logger.warn('Teardown', 'OrderSystem.stop failed', err);
        }

        try {
            SaveManager.stopAutoSave();
        } catch (err) {
            Logger.warn('Teardown', 'SaveManager.stopAutoSave failed', err);
        }

        try {
            Time.stop();
        } catch (err) {
            Logger.warn('Teardown', 'Time.stop failed', err);
        }
    }

    destroy() {
        this.stop();
        this._teardownCoreTimers();
        window.removeEventListener('resize', this._boundResize);
        window.removeEventListener('keydown', this._boundKeyDown);
        window.removeEventListener('keyup', this._boundKeyUp);

        // MF-09: تحرير حوض النصوص العائمة (عُقد + مستمعو animationend)
        if (this._ffPool) {
            for (const slot of this._ffPool) {
                slot.el.onanimationend = null;
                slot.el.remove();
            }
            this._ffPool = null;
        }

        // MF-13: تحرير حوض تناثر القمح (sprites + خامة canvas)
        if (this._burstPool) {
            for (const s of this._burstPool) {
                this.scene?.remove(s);
                s.material?.dispose?.();
            }
            this._burstPool = null;
            this._grainTex?.dispose?.();
            this._grainTex = null;
        }

        if (this.scene) {
            this.scene.traverse((child) => {
                if (!child.isMesh) return;
                if (child.geometry) child.geometry.dispose();
                if (Array.isArray(child.material)) {
                    child.material.forEach((material) => material.dispose());
                } else if (child.material) {
                    child.material.dispose();
                }
            });
        }
        if (this.renderer) {
            this.renderer.dispose();
            this.renderer = null;
        }
        this.scene = null;
        this.camera = null;
        this.player = null;
        this.initialized = false;
        console.log('[MY FARM] Cleaned up.');
    }
}

const app = new MyFarmApp();

if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => app.boot(), { once: true });
    } else {
        app.boot();
    }
}

if (typeof window !== 'undefined') {
    window.MY_FARM = app;
}

/* مُصدَّر للاختبار/التدقيق (لا يستخدمه المتصفح — main.js هو نقطة الدخول). */
export { MyFarmApp, app };
export { CropBatchRenderer } from '../world/CropBatchRenderer.js';
export { PlayerController } from '../player/PlayerController.js';
