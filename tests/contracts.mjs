/**
 * ============================================================
 * tests/contracts.mjs — Cross-module API contract checker
 * ============================================================
 * main.js لا يعمل في أي اختبار بلا متصفح (يحتاج WebGL)، لذلك نفحص
 * عقوده ساكنًا: كل نداء `this.<field>.<method>()` أو
 * `<Singleton>.<method>()` في main.js يجب أن يكون موجودًا فعلًا على
 * الصنف/الكائن المستورد — وإلا انفجر عند أول تشغيل على الجهاز.
 *
 * هذا يلتقط أخطاء مثل `houseInterior.toggleExit()` (غير موجود) أو
 * `hud.applyClock()` قبل إضافتها، دون الحاجة لمتصفح.
 *
 * التشغيل:  node tests/contracts.mjs   (يحتاج three محليًا؛ وإلا SKIP)
 * ============================================================ */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

/* ---------- three اختياري (بعض الوحدات تستورده) ---------- */
try {
    await import('three');
} catch (e) {
    console.log('⏭️  SKIP tests/contracts.mjs — module `three` غير مثبّت محليًا.');
    console.log('   للتشغيل: npm i  (node_modules متجاهَل في git)');
    process.exit(0);
}

/* ---------- منصات وهمية كافية لتحميل الوحدات ---------- */
function canvasStub() {
    const ctx = new Proxy({}, {
        get: (t, p) => (p === 'measureText' ? () => ({ width: 10 }) : () => {}),
        set: () => true
    });
    return { width: 300, height: 150, style: {}, getContext: () => ctx };
}
globalThis.window = globalThis.window || {
    innerWidth: 1280, innerHeight: 720, devicePixelRatio: 2,
    addEventListener() {}, removeEventListener() {},
    requestAnimationFrame: (fn) => setTimeout(() => fn(Date.now()), 0),
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
};
globalThis.document = globalThis.document || {
    hidden: false,
    addEventListener() {}, removeEventListener() {},
    createElement: (tag) => (tag === 'canvas' ? canvasStub() : {
        style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
        appendChild() {}, remove() {}, setAttribute() {}, addEventListener() {},
        querySelector: () => null, querySelectorAll: () => [], innerHTML: '', textContent: ''
    }),
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    body: { appendChild() {}, classList: { add() {}, remove() {} } },
    documentElement: { setAttribute() {}, classList: { add() {}, remove() {} } }
};
const lsStore = new Map();
globalThis.localStorage = globalThis.localStorage || {
    getItem: (k) => (lsStore.has(k) ? lsStore.get(k) : null),
    setItem: (k, v) => lsStore.set(k, String(v)),
    removeItem: (k) => lsStore.delete(k),
    clear: () => lsStore.clear()
};

/* ---------- الوحدات الحقيقية ---------- */
const { Environment } = await import('../js/world/Environment.js');
const { HouseInterior } = await import('../js/world/HouseInterior.js');
const { ProductionYard } = await import('../js/world/ProductionYard.js');
const { CollisionEngine } = await import('../js/core/CollisionEngine.js');
const { GameState } = await import('../js/core/GameState.js');
const { Time } = await import('../js/core/TimeManager.js');
const { Events } = await import('../js/core/EventBus.js');
const { SaveManager } = await import('../js/core/SaveManager.js');
const { LandSystem, LAND_CONFIG } = await import('../js/systems/LandSystem.js');
const { FarmingSystem } = await import('../js/systems/FarmingSystem.js');
const { ProductionSystem } = await import('../js/systems/ProductionSystem.js');
const { InventorySystem } = await import('../js/systems/InventorySystem.js');
const { StorageSystem } = await import('../js/systems/StorageSystem.js');
const { AnimalSystem } = await import('../js/systems/AnimalSystem.js');
const { OrderSystem } = await import('../js/systems/OrderSystem.js');
const { MarketSystem } = await import('../js/systems/MarketSystem.js');
const { BuildingSystem } = await import('../js/systems/BuildingSystem.js');
const { XPSystem } = await import('../js/systems/XPSystem.js');
const { GameUI } = await import('../js/ui/UI.js');
const { default: UIManager } = await import('../js/ui/UIManager.js');
const { ProductionPanel } = await import('../js/ui/ProductionPanel.js');
const { Toast } = await import('../js/ui/Toast.js');
const { SoundFX } = await import('../js/ui/SoundFX.js');
const { Logger } = await import('../js/core/Logger.js');
const { Quality, GRAPHICS_PRESETS } = await import('../js/core/QualityScaler.js');
const { haptic } = await import('../js/utils/Utils.js');
const { PlayerController: PlayerControllerClass } = await import('../js/player/PlayerController.js');
const { CropBatchRenderer: CropBatchRendererClass } = await import('../js/world/CropBatchRenderer.js');

/* ---------- مصدر نواة التطبيق (MF-12: main.js صار shim؛ المنطق في core/App.js) ---------- */
const mainSrc = readFileSync(join(root, 'js/core/App.js'), 'utf8');

/** أسماء الدوال المعرّفة داخل أصناف نواة التطبيق نفسها (MyFarmApp — البقية فُصلت في MF-12). */
function localMethods(className) {
    const start = mainSrc.indexOf(`class ${className}`);
    if (start < 0) return new Set();
    // نأخذ جسم الصنف حتى بداية الصنف التالي أو نهاية الملف
    const nextClass = mainSrc.indexOf('\nclass ', start + 1);
    const body = mainSrc.slice(start, nextClass > 0 ? nextClass : undefined);
    const names = new Set();
    const re = /^\s{4}(?:async\s+)?(?:static\s+)?([A-Za-z_$][\w$]*)\s*\(/gm;
    let m;
    while ((m = re.exec(body))) names.add(m[1]);
    return names;
}

/** كل الدوال على prototype لصنف مستورد (+ ما يُعرَّف في constructor). */
function classMethods(cls) {
    const names = new Set();
    let proto = cls?.prototype;
    while (proto && proto !== Object.prototype) {
        for (const key of Object.getOwnPropertyNames(proto)) names.add(key);
        proto = Object.getPrototypeOf(proto);
    }
    return names;
}

function instanceMethods(obj) {
    const names = new Set();
    let cur = obj;
    while (cur && cur !== Object.prototype) {
        for (const key of Object.getOwnPropertyNames(cur)) names.add(key);
        cur = Object.getPrototypeOf(cur);
    }
    return names;
}

/**
 * خريطة الحقول في main.js ⇒ مصدر أسماء الدوال المسموحة.
 * `local` = صنف معرّف داخل main.js نفسه.
 */
const FIELD_TARGETS = {
    environment: { class: Environment },
    houseInterior: { class: HouseInterior },
    productionYard: { class: ProductionYard },
    collision: { class: CollisionEngine },
    hud: { class: UIManager },
    gameUI: { class: GameUI },
    productionPanel: { class: ProductionPanel },
    toast: { class: Toast },
    soundFX: { class: SoundFX },
    player: { class: PlayerControllerClass },     // MF-12: صار وحدة مستقلة (js/player/)
    cropBatches: { class: CropBatchRendererClass }, // MF-12: صار وحدة مستقلة (js/world/)
    renderer: null,          // THREE.WebGLRenderer — خارج نطاق الفحص
    scene: null,             // THREE.Scene
    camera: null,            // THREE.PerspectiveCamera
    lights: null,
    clock: null,             // THREE.Clock
    sky: null
};

/** الكائنات المفردة (singletons) المستوردة في main.js. */
const SINGLETONS = {
    Time, GameState, Events, SaveManager, LandSystem, FarmingSystem,
    ProductionSystem, InventorySystem, StorageSystem, AnimalSystem,
    OrderSystem, MarketSystem, BuildingSystem, XPSystem, Logger, Quality
};

/* ============================================================
   الفحص
   ============================================================ */

let passed = 0;
const failures = [];

function check(label, ok, detail = '') {
    if (ok) { passed++; }
    else { failures.push(`${label}${detail ? ` — ${detail}` : ''}`); console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`); }
}

console.log('\n── main.js → world/UI/systems call contracts ─────────────');

/* ---- 1) this.<field>.<method>( ---- */
const fieldCallRe = /this\.([A-Za-z_$][\w$]*)\s*(?:\?\.)?\.?\s*([A-Za-z_$][\w$]*)\s*\(/g;
const seenFieldCalls = new Set();
let match;
const unknownFieldCalls = [];

while ((match = fieldCallRe.exec(mainSrc))) {
    const field = match[1];
    const method = match[2];
    if (!(field in FIELD_TARGETS)) continue;      // حقل غير معروف ⇒ نتجاهله
    const target = FIELD_TARGETS[field];
    if (!target) continue;                        // THREE objects ⇒ خارج النطاق

    const key = `${field}.${method}`;
    if (seenFieldCalls.has(key)) continue;
    seenFieldCalls.add(key);

    const allowed = target.class
        ? classMethods(target.class)
        : localMethods(target.local);

    if (!allowed.has(method)) {
        unknownFieldCalls.push(key);
    }
}

check(
    `every this.<field>.<method>() exists (${seenFieldCalls.size} distinct calls checked)`,
    unknownFieldCalls.length === 0,
    unknownFieldCalls.join(', ')
);
if (unknownFieldCalls.length === 0) {
    console.log(`  ✅ ${seenFieldCalls.size} distinct this.<field>.<method>() calls all resolve`);
}

/* ---- 2) <Singleton>.<method>( ---- */
const singletonCallRe = /\b([A-Z][A-Za-z_$][\w$]*)\s*\.\s*([a-z_$][\w$]*)\s*\(/g;
const seenSingletonCalls = new Set();
const unknownSingletonCalls = [];

while ((match = singletonCallRe.exec(mainSrc))) {
    const objName = match[1];
    const method = match[2];
    if (!SINGLETONS[objName]) continue;

    const key = `${objName}.${method}`;
    if (seenSingletonCalls.has(key)) continue;
    seenSingletonCalls.add(key);

    const target = SINGLETONS[objName];
    const ok = typeof target[method] === 'function' || instanceMethods(target).has(method);
    if (!ok) unknownSingletonCalls.push(key);
}

check(
    `every <Singleton>.<method>() exists (${seenSingletonCalls.size} distinct calls checked)`,
    unknownSingletonCalls.length === 0,
    unknownSingletonCalls.join(', ')
);
if (unknownSingletonCalls.length === 0) {
    console.log(`  ✅ ${seenSingletonCalls.size} distinct singleton calls all resolve`);
}

/* ---- 3) أسماء الأحداث المستهلكة في main.js مقابل الأحداث المُصدَرة ---- */
console.log('\n── EventBus contract (emitted vs consumed) ───────────────');

const emitted = new Set();

/** كل ملفات js/ — لأن أي وحدة قد تُصدر حدثًا (عبر Events أو this.events). */
function walkJs(dir, out = []) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walkJs(full, out);
        else if (entry.name.endsWith('.js')) out.push(full);
    }
    return out;
}

for (const file of walkJs(join(root, 'js'))) {
    const src = readFileSync(file, 'utf8');
    /*
     * نُطابق كل صيغ الإصدار المستخدمة في المشروع:
     *   Events.emit('x') · emit('x') · this.events?.emit?.('x') · bus.emit('x')
     */
    const re = /emit\??\.?\??\(\s*\n?\s*'([^']+)'/g;
    let m2;
    while ((m2 = re.exec(src))) emitted.add(m2[1]);
}

const consumed = new Set();
const onRe = /Events\.on\(\s*\n?\s*'([^']+)'/g;
let m3;
while ((m3 = onRe.exec(mainSrc))) consumed.add(m3[1]);

/*
 * جسور اختيارية: main.js يستمع لها كنقطة توسعة عامة (أي وحدة يمكنها
 * إصدارها عبر this.events) ولا يُشترط أن يكون لها مُصدِر مباشر اليوم.
 */
const BRIDGE_ONLY = new Set(['toast:info', 'hud:panel']);
const orphans = [...consumed].filter((name) => !emitted.has(name) && !BRIDGE_ONLY.has(name));
check(
    `every event main.js listens to is emitted somewhere (${consumed.size} listeners)`,
    orphans.length === 0,
    `never emitted: ${orphans.join(', ')}`
);
if (orphans.length === 0) {
    console.log(`  ✅ all ${consumed.size} listeners have a matching emitter`);
}

/* ---- 4) أحداث الأنظمة المهمة مُستهلكة (لا واجهة ميتة) ---- */
const mustBeConsumed = ['market:sold', 'storage:upgraded', 'storage:supply-drop', 'animal:purchased', 'time:season'];
const missingListeners = mustBeConsumed.filter((name) => !consumed.has(name));
check(
    'key economy/season events are surfaced to the player (no silent systems)',
    missingListeners.length === 0,
    `no listener in main.js for: ${missingListeners.join(', ')}`
);

/* ---- 5) عقد HUD/UI: الدوال التي يناديها main.js موجودة فعلًا ---- */
console.log('\n── HUD / UI surface used by main.js ──────────────────────');
const hudCalls = [...seenFieldCalls].filter((k) => k.startsWith('hud.')).map((k) => k.split('.')[1]);
const uiCalls = [...seenFieldCalls].filter((k) => k.startsWith('gameUI.')).map((k) => k.split('.')[1]);
check('HUD methods used by main.js exist on UIManager', hudCalls.every((m) => classMethods(UIManager).has(m)),
    hudCalls.filter((m) => !classMethods(UIManager).has(m)).join(', '));
check('GameUI methods used by main.js exist', uiCalls.every((m) => classMethods(GameUI).has(m)),
    uiCalls.filter((m) => !classMethods(GameUI).has(m)).join(', '));
check('HUD exposes applyClock (real-clock HUD)', classMethods(UIManager).has('applyClock'));
check('HUD exposes syncStorage (silo/barn bars)', classMethods(UIManager).has('syncStorage'));
check('GameUI supports the storage panel', (() => {
    const uiSrc = readFileSync(join(root, 'js/ui/UI.js'), 'utf8');
    return uiSrc.includes("storage: { title:") && uiSrc.includes("_renderStorage(") && uiSrc.includes("_renderFertilizer(") && uiSrc.includes("_renderAnimals(");
})());

/* ---- 6) عقد العالم: الدوال التي يناديها main.js على Environment/Interior/Yard ---- */
console.log('\n── World surface used by main.js ─────────────────────────');
check('Environment.update accepts (delta, t, clock, playerPos)', Environment.prototype.update.length >= 2);
check('Environment exposes setSeason / updateSky / getNearestDoor',
    ['setSeason', 'updateSky', 'getNearestDoor'].every((m) => classMethods(Environment).has(m)));
check('HouseInterior exposes the enter/exit API',
    ['setVisible', 'getSpawnPoint', 'getNearestInteractable', 'toggleChest', 'update', 'dispose']
        .every((m) => classMethods(HouseInterior).has(m)));
check('HouseInterior.getOutsideExit is static', typeof HouseInterior.getOutsideExit === 'function');
check('ProductionYard exposes syncFromState / getWorldPos / pick / update',
    ['syncFromState', 'getWorldPos', 'pick', 'update'].every((m) => classMethods(ProductionYard).has(m)));

/* ---- 7) FarmLayout: كل ما يستورده main.js مُصدَّر فعلًا ---- */
console.log('\n── FarmLayout imports used by main.js ────────────────────');
const Layout = await import('../js/world/FarmLayout.js');

/*
 * نستخرج قائمة الاستيراد نفسها (لا نصًا مجاورًا عشوائيًا) وندعم
 * الأسماء المستعارة: `HOUSE as HOUSE_LAYOUT` ⇒ نفحص `HOUSE`.
 */
// MF-12: نواة التطبيق انتقلت إلى js/core/ ⇒ الاستيراد أعمق بمستوى ('../world/...')
const layoutImportRe = /import\s*\{([^}]*)\}\s*from\s*'\.\.\/world\/FarmLayout\.js'/;
const layoutImport = mainSrc.match(layoutImportRe);
const importedNames = (layoutImport ? layoutImport[1] : '')
    .split(',')
    .map((part) => part.trim().split(/\s+as\s+/)[0].trim())
    .filter(Boolean);

check('main.js really imports from FarmLayout', importedNames.length > 0, 'import block not found');
const missingExports = importedNames.filter((n) => !(n in Layout));
check(`every FarmLayout symbol imported by main.js is exported (${importedNames.length} symbols)`,
    missingExports.length === 0, missingExports.join(', '));

/* ---- 8) MF-01/MF-03: استيراد حفظ V1 ← ترقية V2 + حذف مفاتيح الطاقة ---- */
console.log('\n── MF-01: legacy v1→v2 save import (roundtrip) ──────────');

const v1Fixture = {
    meta: { version: 1, timestamp: Date.now() - 86_400_000, checksum: 'legacy-shape' },
    data: {
        player: {
            name: 'مزارع أصيل', level: 4, xp: 90, coins: 777, gems: 3,
            energy: 50, maxEnergy: 50, energyLastRefill: 12345 // مفاتيح محذوفة المنتج
        },
        farm: {
            name: 'مزرعة الأجداد', maxAnimals: 20,
            tiles: [{
                id: 'field_center_left', posX: -3.8, posZ: -3.5, price: 100,
                purchased: true, prepared: true, prepProgress: 100, state: 'empty',
                slots: [{
                    slotIndex: 0, ox: -1.2, oz: -1.2, state: 'growing', cropType: 'wheat',
                    plantedAt: Date.now(), readyAt: Date.now() + 5000, witherAt: Date.now() + 9000,
                    watered: true, fertilizer: 'quality'
                }]
            }],
            buildings: [], animals: []
        },
        inventory: { items: { wheat: { count: 12, quality: 'normal' } } }
    }
};
const v1Raw = JSON.stringify(v1Fixture);

lsStore.delete('myfarm_save_v2');
lsStore.delete('myfarm_meta_v2');
lsStore.set('myfarm_save', v1Raw); // مفتاح V1 العاري فقط — لا أثر لـ V2

const legacyLoaded = await SaveManager.load();
check('a v1-keyed save boots instead of a fresh empty farm', legacyLoaded === true);
check('player coins survive migration (777, not the 350 default)', GameState.get('player.coins') === 777);
check('player level survives migration', GameState.get('player.level') === 4);
check('crop slot survives migration (wheat still growing)', GameState.get('farm.tiles')?.[0]?.slots?.[0]?.cropType === 'wheat');
check('raw v1 snapshot backed up untouched (byte-exact)', lsStore.get('myfarm_v1_backup') === v1Raw);

const backupBefore = lsStore.get('myfarm_v1_backup');
lsStore.delete('myfarm_save_v2');
lsStore.delete('myfarm_meta_v2');
const reimported = await SaveManager.load();
check('re-running the import never clobbers the original backup',
    reimported === true && lsStore.get('myfarm_v1_backup') === backupBefore);

await SaveManager.save();
const v2Raw = lsStore.get('myfarm_save_v2');
const v2Payload = v2Raw ? JSON.parse(v2Raw) : null;
check('v2 key written after the legacy import', !!v2Payload && v2Payload.meta?.version === 2);
check('v2 checksum roundtrips byte-exact (data intact)',
    !!v2Payload && SaveManager._validateChecksum(v2Payload).valid === true);
check('MF-03/D2(d): retired energy keys stripped from migrated save',
    !!v2Payload &&
    !('energy' in (v2Payload.data?.player || {})) &&
    !('maxEnergy' in (v2Payload.data?.player || {})) &&
    !('energyLastRefill' in (v2Payload.data?.player || {})));

/* ---- 9) D2(b): الكوينز لا تسالب أبدًا عبر الشراء/البيع ---- */
console.log('\n── D2(b): coins never go negative across flows ─────────');

GameState.reset();
LandSystem.init();
check('MF-03/D2(d): default player state has no energy keys', (() => {
    const p = GameState.get('player');
    return !('energy' in p) && !('maxEnergy' in p) && !('energyLastRefill' in p);
})());

const lockedField = LandSystem.getAllFields().find((f) => !f.purchased);
check('a locked field exists for the purchase test', !!lockedField);

GameState.set('player.coins', 10); // أقل من سعر الحقل
const deniedBuy = LandSystem.purchaseField(lockedField.id);
check('under-funded land purchase is denied',
    deniedBuy.success === false && deniedBuy.reason === 'insufficient-funds');
check('denied purchase leaves coins untouched (10 ≥ 0)', GameState.get('player.coins') === 10);

GameState.set('player.coins', 0);
const deniedSell = InventorySystem.sell('bread', 1);
check('selling an unowned item fails cleanly', deniedSell.success === false);
check('failed sale keeps coins at exactly 0, never negative', GameState.get('player.coins') === 0);

const fundedCoins = LAND_CONFIG.fieldPrice + 50;
GameState.set('player.coins', fundedCoins);
const okBuy = LandSystem.purchaseField(lockedField.id);
check('funded purchase charges the exact config price',
    okBuy.success === true && GameState.get('player.coins') === fundedCoins - LAND_CONFIG.fieldPrice);
check('coins stay ≥ 0 after a successful purchase', GameState.get('player.coins') >= 0);

/* ---- 10) MF-11: إيقاف tick عند إخفاء الصفحة ---- */
console.log('\n── MF-11: hidden-tab tick suspension ───────────────────');

const docListeners = new Map();
document.addEventListener = (type, fn) => docListeners.set(type, fn);
document.removeEventListener = (type) => docListeners.delete(type);

GameState.set('time.lastTick', Date.now() - 60_000); // محاكاة إخفاء 60 ثانية
Time.start();
check('time engine starts', Time.isRunning() === true);
check('visibilitychange listener installed', docListeners.has('visibilitychange'));

document.hidden = true;
docListeners.get('visibilitychange')?.();
check('tick suspends while the page is hidden (no interval running)',
    Time._suspended === true && Time._interval === null);

document.hidden = false;
docListeners.get('visibilitychange')?.();
check('tick resumes when the page returns', Time._suspended === false && Time._interval !== null);
check('the 60s hidden gap is compensated offline, not live-ticked',
    Math.abs((GameState.get('time.lastTick') || 0) - Date.now()) < 2000);
Time.stop();

/* ---- 11) MF-06: المسجِّل المركزي يلتقط ولا يرمي أبدًا ---- */
console.log('\n── MF-06: central Logger — captures, never throws ──────');

const ringBefore = Logger.size;
Logger.info('ContractsTest', 'unit-check');
Logger.warn('ContractsTest', 'something soft failed', { code: 42 });
check('logger appends tagged entries to the ring', Logger.size === ringBefore + 2);

let loggerThrew = false;
try {
    const circular = {};
    circular.self = circular; // كائن دائري — يجب ألا يكسر المسجِّل
    Logger.error('ContractsTest', new Error('boom'), circular);
    Logger.debug('ContractsTest', undefined, null);
} catch (e) {
    loggerThrew = true;
}
check('logger survives Error objects, circular JSON and nullish args', !loggerThrew);
check('last entry keeps its tag and level', (() => {
    const last = Logger.ring().at(-1);
    return last?.tag === 'ContractsTest' && last?.level === 'debug';
})());

for (let i = 0; i < 80; i++) Logger.info('Flood', `msg #${i}`);
check('ring buffer is capped at 50 events (R4: bounded memory)', Logger.size <= 50);
check('report() renders a copyable text block',
    typeof Logger.report() === 'string' && Logger.report().includes('[Flood]'));

/* ---- 12) MF-07: QualityScaler — إعدادات حيّة وآمنة ---- */
console.log('\n── MF-07: QualityScaler live switching ─────────────────');

check('three presets exist with sane budgets',
    ['low', 'mid', 'high'].every((k) => {
        const p = GRAPHICS_PRESETS[k];
        return p && p.pixelRatio > 0 && p.shadowSize > 0 && typeof p.shadows === 'boolean';
    }));
check('low disables dynamic shadows (thermal budget)', GRAPHICS_PRESETS.low.shadows === false);
check('high uses the 2048 shadow map at 2x pixels',
    GRAPHICS_PRESETS.high.shadowSize === 2048 && GRAPHICS_PRESETS.high.pixelRatio === 2);

let qualityThrew = false;
try {
    Quality.apply('low');                 // بلا app — يجب ألا يرمي
    Quality.apply('nonsense-tier');       // مستوى مجهول ⇒ تحذير ويبقى ثابتًا
} catch (e) {
    qualityThrew = true;
}
check('apply() never throws, even with no app attached', !qualityThrew);
check('unknown tiers are rejected (state keeps low)', Quality.current === 'low');
check('cycle() rotates low → mid', Quality.cycle() === 'mid');
check('settings.graphics persists the chosen tier', GameState.get('settings.graphics') === 'mid');
Quality.apply('high'); // إعادة الوضع الافتراضي لبقية الفحوص
check('haptic() is exported and safe to call headless',
    (() => { try { haptic(12); return true; } catch (e) { return false; } })());

/* ---- 12ب) MF-04: SVG icon sprite maps + never throws ---- */
console.log('\n── MF-04: icons.js — svg sprite with emoji fallback ─────');

const { iconHTML } = await import('../js/ui/icons.js');
const { ITEMS: GD_ITEMS } = await import('../js/data/GameData.js');

check('iconHTML("🌾") renders a real <svg> sprite (mf-icon class)',
    iconHTML('🌾').startsWith('<svg') && iconHTML('🌾').includes('class="mf-icon'));
check('undefined art falls back to plain-text emoji span (mf-emoji)',
    iconHTML('🦄').includes('mf-emoji'));
check('null token resolves to the neutral box icon, never throws',
    iconHTML(null).startsWith('<svg'));

let iconThrew = false;
try {
    for (const it of Object.values(GD_ITEMS || {})) iconHTML(it?.icon);
    iconHTML(undefined); iconHTML(42); iconHTML({});
} catch (e) {
    iconThrew = true;
}
check('every GameData item emoji either maps or falls back — zero throws', !iconThrew);

/* ---- 12ج) MF-10: درس أول ٦٠ ثانية — يوجّه ويُكمل ولا يُعاد ---- */
console.log('\n── MF-10: first-time tutorial — plant→water→harvest→sell ──');

const { Tutorial, TUTORIAL_STEPS, TUTORIAL_FIRST_GROW_MS } = await import('../js/ui/Tutorial.js');

GameState.reset();
LandSystem.init();
FarmingSystem.hydrate?.();

check('four locked steps in Hay Day order',
    TUTORIAL_STEPS.join(',') === 'plant,water,harvest,sell');
check('first wheat grows in ~60s, not the full crop time',
    TUTORIAL_FIRST_GROW_MS === 60_000);

const tField = LandSystem.getAllFields().find((f) => f.id === LAND_CONFIG.baseUnlocked[0]);
check('tutorial targets the base unlocked field', !!tField && tField.purchased);

const tEvents = [];
Events.on('tutorial:started', () => tEvents.push('started'));
Events.on('tutorial:step', () => tEvents.push('step'));
Events.on('tutorial:completed', (d) => tEvents.push(`completed:${d?.reason}`));

check('brand-new farm qualifies for the tutorial', Tutorial.shouldStart() === true);
Tutorial.start();
check('tutorial announces itself (tutorial:started)', tEvents.includes('started'));
check('start() is running the plant step first', Tutorial.running === true && Tutorial.stepName === 'plant');

InventorySystem.add('wheat_seed', 1);
const tPlant = FarmingSystem.plantSeed(tField.id, 0, 'wheat');
check('planting the highlighted slot succeeds', tPlant.success === true, tPlant.error);
check('tutorial advances to step 2 (water)', GameState.get('tutorial.step') === 1);
check('first wheat is accelerated to ~60s',
    (() => {
        const s = FarmingSystem.getOrCreateSlots(tField.id)[0];
        return Math.abs(s.readyAt - (Date.now() + TUTORIAL_FIRST_GROW_MS)) < 2000;
    })());

const tWater = FarmingSystem.waterSlot(tField.id, 0);
check('watering succeeds', tWater.success === true, tWater.error);
check('tutorial advances to step 3 (harvest)', GameState.get('tutorial.step') === 2);

FarmingSystem.forceReady(tField.id);
const tHarvest = FarmingSystem.harvestSlot(tField.id, 0);
check('harvesting succeeds', tHarvest.success === true, tHarvest.error);
check('tutorial advances to step 4 (sell)', GameState.get('tutorial.step') === 3);

InventorySystem.add('wheat', 1);
const tList = MarketSystem.listItem('wheat', 1, 1);
check('listing first crop at the market kiosk succeeds', tList.success === true, tList.error);
check('selling completes the tutorial', GameState.get('tutorial.completed') === true);
check('final step index parked at 4', GameState.get('tutorial.step') === 4);
check('completion event fired with a reason',
    tEvents.some((e) => e.startsWith('completed:')));
check('tutorial never replays (shouldStart false, second start() no-ops)',
    Tutorial.shouldStart() === false && Tutorial.start() === Tutorial);

/* MF-10 isolation: (أ) حالة الدرس تنجو تحديث الصفحة وسط التدفق، (ب) حفظ خبير لا يشغّل الدرس أبدًا */
const midFlowStep = GameState.get('tutorial.step');
// مهلة سكون: فحوص MF-01 أسبق تُشغّل حفظات trailing متداخلة — ننتظر هدوءها حتى لا يتسابق الحفظ
await new Promise((r) => setTimeout(r, 450));
let persistedOk = false;
for (let i = 0; i < 5 && !persistedOk; i++) {
    persistedOk = await SaveManager.save();
    if (!persistedOk) await new Promise((r) => setTimeout(r, 120));
}
check('save() actually persisted this snapshot (no in-flight save swallowed it)',
    persistedOk === true);
GameState.reset();
await SaveManager.load();
check('tutorial state persists across a refresh mid-flow (step kept)',
    GameState.get('tutorial.step') === midFlowStep && GameState.get('tutorial.completed') === true);

GameState.reset();
GameState.set('stats.totalHarvests', 7); // حفظ خبير مرحّل — إكمال غير مسجّل بعد
check('existing-progress save never triggers the tutorial',
    Tutorial.shouldStart() === false);
Tutorial.start(); // يجب أن يسجّله مكتملًا بصمت لا أن يشغّل الدرس (R3-friendly)
check('veteran without the flag is silently marked complete (never bothers him)',
    GameState.get('tutorial.completed') === true && Tutorial.running === false);

GameState.reset(); // لا نسرّب حالة الدرس إلى الفحوص التالية

/* ---- 13) D2(c): لا أرقام سحرية في نصوص الواجهة (مسح ساكن) ---- */
console.log('\n── D2(c): no numeric literals embedded in UI strings ───');

const UI_SCAN_FILES = [
    join(root, 'js/core/App.js'),
    join(root, 'js/main.js'),
    join(root, 'js/player/PlayerController.js'),
    join(root, 'js/world/CropBatchRenderer.js'),
    ...readdirSync(join(root, 'js/ui')).filter((f) => f.endsWith('.js')).map((f) => join(root, 'js/ui', f))
];
const STRING_RE = /(?:'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`)/g;
const numericViolations = [];

for (const file of UI_SCAN_FILES) {
    let src = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')   // تعليقات كتلية
        .replace(/\/\/[^\n]*/g, '');        // تعليقات سطرية
    STRING_RE.lastIndex = 0;
    let sm;
    while ((sm = STRING_RE.exec(src))) {
        const raw = sm[0];
        if (!/[؀-ۿ]/.test(raw)) continue;      // عربية؟ (نص واجهة)
        if (raw.includes('<')) continue;       // قالب HTML — خارج النطاق
        const body = raw.slice(1, -1).replace(/\$\{[\s\S]*?\}/g, ''); // الاستيفاء مسموح
        if (/[0-9٠-٩]/.test(body)) {
            numericViolations.push(`${file.split('/').pop()}: ${body.slice(0, 60)}`);
        }
    }
}

check('no hardcoded numbers inside Arabic UI strings (main.js + ui/*)',
    numericViolations.length === 0,
    numericViolations.join(' | '));

/* ---- 14) MF-12: تقسيم الوحدات — سلوك وواجهات عامة (تحقق API) ---- */
console.log('\n── MF-12: split modules — public API contracts ─────────');

const { PlayerController } = await import('../js/player/PlayerController.js');
const { CropBatchRenderer } = await import('../js/world/CropBatchRenderer.js');

check('PlayerController API intact (behavior contract, module-agnostic)',
    ['setBounds', 'jump', 'loadModel', 'createFallbackAvatar', 'bindHandSocket',
     'buildToolMesh', 'equipItem', 'playToolSwing', 'cancelToolSwing', 'setupAnimations',
     'transitionTo', 'update'].every((m) => classMethods(PlayerController).has(m)),
    'missing on PlayerController');
check('CropBatchRenderer API intact (behavior contract, module-agnostic)',
    ['markDirty', 'setVisible', 'rebuild', 'pulse', 'update'].every((m) => classMethods(CropBatchRenderer).has(m)),
    'missing on CropBatchRenderer');

/* ---- 14ب) MF-07-proof: بروتوكول التبديل الحي خطوة بخطوة (قابل للتكرار) ---- */
console.log('\n── MF-07 proof: live-switch protocol on a fake three.js rig ──');

Quality._app = null; // قطع أي ربط سابق
const fx = {
    calls: [],
    renderer: {
        shadowMap: { enabled: true },
        setPixelRatio: (v) => fx.calls.push(['setPixelRatio', v]),
        setSize: (w, h, u) => fx.calls.push(['setSize', w, h, u])
    },
    lights: { sun: { castShadow: true, shadow: {
        mapSize: { v: 1024, set(w, h) { fx.calls.push(['mapSize.set', w, h]); this.v = w; } },
        map: { dispose: () => fx.calls.push(['map.dispose']) },
    } } },
    scene: { fog: null, traverse(fn) { fn({ material: { needsUpdate: false, _mark: true } }); fx.marked = true; } },
    _outsideFogDensity: 0.012, inInterior: false
};

Quality.attach(fx);
fx.calls.length = 0;
// في three.js الحقيقي يُعاد تخصيص shadow.map كسولًا أول إطار — نعيد زرعه كما يحدث على الجهاز
fx.lights.sun.shadow.map = { dispose: () => fx.calls.push(['map.dispose']) };
Quality.cycle();           // high → low
const pxIdx = fx.calls.findIndex((c) => c[0] === 'setPixelRatio');
const mdIdx = fx.calls.findIndex((c) => c[0] === 'map.dispose');
const msIdx = fx.calls.findIndex((c) => c[0] === 'mapSize.set');

check('pixelRatio swap happens on every live switch', pxIdx >= 0);
check('shadow-map dispose follows mapSize.set (three.js protocol)', mdIdx > msIdx && msIdx >= 0);
check('sun.shadow.map nulled post-dispose (forces GPU realloc)', fx.lights.sun.shadow.map === null);
check('material sweep marks needsUpdate (required on shadow on/off)', fx.marked === true);
check('low preset forces sun.castShadow = false', fx.lights.sun.castShadow === false);

fx.calls.length = 0;
fx.lights.sun.shadow.map = { dispose: () => fx.calls.push(['map.dispose']) };
Quality.cycle();           // low → mid
check('switching back restores castShadow and 1024 map',
    fx.lights.sun.castShadow === true && fx.lights.sun.shadow.mapSize.v === 1024);
check('second switch also disposes+nuls the map (no leak across toggles)',
    fx.calls.some((c) => c[0] === 'map.dispose') && fx.lights.sun.shadow.map === null);

Quality._app = null;       // لا نترك حالة مزيفة تتسرب

/* ---- LINT-فقط: تخطيط الملفات (خارج عدّاد D2 — لا يُقَيَّم سلوك) ---- */
console.log('\n── [LINT-only] file-layout invariants (not behavior, excluded from D2) ──');

const lintOut = [];
try {
    const loggerSrc = (() => {
        try { return readFileSync(join(root, 'js/core/App.js'), 'utf8'); } catch { return null; }
    })();
    const shimSrc = readFileSync(join(root, 'js/main.js'), 'utf8');

    lintOut.push(['App.js holds boot core', !!(loggerSrc && loggerSrc.includes('class MyFarmApp') && loggerSrc.includes('new MyFarmApp') && loggerSrc.includes('window.MY_FARM'))]);
    lintOut.push(['main.js is a thin shim', shimSrc.includes('./core/App.js') && shimSrc.split('\n').length <= 40]);
    lintOut.push(['no legacy backup entry points', (() => {
        const gone = (rel) => { try { readFileSync(join(root, rel)); return false; } catch { return true; } };
        return gone('js/main.backup.js') && gone('MY_FARM_3D_Gemini_Camera_Updated.html');
    })()]);
} catch (lintErr) {
    lintOut.push(['layout lint itself failed', false]);
    console.log('  ⚠️  layout lint error:', lintErr?.message);
}
for (const [label, ok] of lintOut) {
    console.log(`  ${ok ? '☑️ ' : '⚠️ '} [LINT] ${label}`);
}
/* End LINT-only — هذه الفحوص توثيقية ولا تحتسب في D2. */

/* ---- 15) QA-§1b: لا بلع صامت لأي catch في الشجرة (فحص حرفي) ---- */
console.log('\n── QA-§1b: zero silent catches (static sweep) ─────────────');

{
    const CATCH_RE = /catch\s*(\(([^)]*)\))?\s*\{/g;
    const silentCatches = [];
    const paramLiterals = [];

    for (const file of UI_SCAN_FILES.concat(
        ['core', 'systems', 'world', 'utils', 'data'].flatMap((dir) => {
            try {
                return readdirSync(join(root, 'js', dir))
                    .filter((f) => f.endsWith('.js'))
                    .map((f) => join(root, 'js', dir, f));
            } catch { return []; }
        })
    )) {
        const code = readFileSync(file, 'utf8');
        CATCH_RE.lastIndex = 0;
        let m;
        while ((m = CATCH_RE.exec(code))) {
            // treat `catch { }` ignored-parameter literals as FAIL
            if (!m[1]) {
                silentCatches.push(`${file.split('/').pop()}: ignored-param catch`);
                continue;
            }
            // scan body until its matching close (brace depth walk)
            let i = m.index + m[0].length;
            let depth = 1;
            let body = '';
            while (i < code.length && depth > 0) {
                const c = code[i];
                if (c === '{') depth++;
                else if (c === '}') depth--;
                if (depth > 0) body += c;
                i++;
            }
            const clean = body.replace(/\/\/[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').trim();
            const logged = /\b(Logger|console\.(warn|error|info|log))\b/.test(body);
            const rethrow = /\bthrow\b|\breject\s*\(|\bVOID_IGNORED\b|\bvoid\s+\w+/.test(body);
            const intentionalVoid = /void\s+\w+;/.test(body);
            if (!logged && !rethrow && !intentionalVoid) {
                silentCatches.push(`${file.split('/').pop()} «${clean.slice(0, 50)}»`);
            } else if (!logged && intentionalVoid) {
                paramLiterals.push(file.split('/').pop());
            }
        }
    }

    check('every catch in js/** is Logger-tagged, rethrows/rejects, or documented structural void',
        silentCatches.length === 0,
        silentCatches.slice(0, 5).join(' | '));
    check('exactly ONE structural void remains (Logger deepest fallback — documented)',
        paramLiterals.length === 1 && paramLiterals[0] === 'Logger.js',
        paramLiterals.join(', ') || 'none');
}

/* ---------- ملخص ---------- */
console.log('\n' + '═'.repeat(60));
if (failures.length === 0) {
    console.log(`✅ CONTRACTS PASS — ${passed} checks, 0 failures.`);
    console.log('═'.repeat(60));
    process.exit(0);
} else {
    console.log(`❌ CONTRACTS FAIL — ${passed} passed, ${failures.length} failed.`);
    failures.forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
    console.log('═'.repeat(60));
    process.exit(1);
}
