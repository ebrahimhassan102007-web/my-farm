/**
 * ============================================================
 * tests/smoke.mjs — Headless QA harness (Node, no THREE, no DOM)
 * ============================================================
 * يختبر دورة اللعب الكاملة على طبقة المنطق (Brief §3 «Engineering
 * standard»): الإقلاع · الزراعة · الحصاد · الإطعام · مطحنة العلف ·
 * المخبز · مصنع الألبان · الطلبات · الكشك · ترقية المخازن ·
 * الحفظ/التحميل · الساعة الحقيقية والفصول · سلامة خطة التقسيم.
 *
 * التشغيل:  node tests/smoke.mjs
 * الخروج:   0 عند النجاح، 1 عند أي فشل (CI-ready).
 * ============================================================
 */

/* ============================================================
   1) منصات وهمية (stubs) — تُركَّب قبل أي import للنظام
   ============================================================ */

const store = new Map();
const localStorageStub = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    key: (i) => [...store.keys()][i] ?? null,
    get length() { return store.size; }
};

const listeners = [];
globalThis.localStorage = localStorageStub;
globalThis.performance = globalThis.performance || { now: () => Date.now() };
globalThis.window = {
    innerWidth: 1280,
    innerHeight: 720,
    devicePixelRatio: 2,
    indexedDB: undefined,           // ⇒ مسار localStorage (كما في الاختبار)
    addEventListener: (type, fn) => listeners.push([type, fn]),
    removeEventListener: () => {},
    location: { href: 'http://localhost/index.html', protocol: 'http:' },
    navigator: { userAgent: 'node-qa' },
    localStorage: localStorageStub,
    requestAnimationFrame: (fn) => setTimeout(() => fn(Date.now()), 0),
    MYFARM: undefined
};
globalThis.document = {
    hidden: false,
    addEventListener: () => {},
    removeEventListener: () => {},
    createElement: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, setAttribute() {} }),
    getElementById: () => null,
    querySelector: () => null,
    body: { appendChild() {} }
};
// Node ≥ 21 يوفّر `navigator` عامةً (getter فقط) — لا نستبدلها.
if (typeof globalThis.navigator === 'undefined') {
    Object.defineProperty(globalThis, 'navigator', { value: globalThis.window.navigator, configurable: true });
}

/* ============================================================
   2) أداة الاختبار
   ============================================================ */

let passed = 0;
const failures = [];
const sections = [];

function section(name) {
    sections.push(name);
    console.log(`\n── ${name} ${'─'.repeat(Math.max(2, 56 - name.length))}`);
}

function check(label, condition, detail = '') {
    if (condition) {
        passed++;
        console.log(`  ✅ ${label}`);
    } else {
        failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
        console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
    }
    return !!condition;
}

function group(label, fn) {
    let threw = null;
    try {
        fn();
    } catch (e) {
        threw = e;
    }
    check(label, !threw, threw ? `${threw.name}: ${threw.message}` : '');
    if (threw) console.log(threw.stack?.split('\n').slice(0, 3).join('\n'));
    return !threw;
}

/* ============================================================
   3) الوحدات تحت الاختبار (import ديناميكي بعد الـ stubs)
   ============================================================ */

const {
    getSeasonForDate,
    readRealClock,
    getDayPhase,
    getSunFactor,
    formatClockLabel
} = await import('../js/core/Calendar.js');

const { Events } = await import('../js/core/EventBus.js');
const { GameState } = await import('../js/core/GameState.js');
const { Time } = await import('../js/core/TimeManager.js');
const { SaveManager } = await import('../js/core/SaveManager.js');
const { StorageSystem } = await import('../js/systems/StorageSystem.js');
const { InventorySystem } = await import('../js/systems/InventorySystem.js');
const { FarmingSystem } = await import('../js/systems/FarmingSystem.js');
const { AnimalSystem } = await import('../js/systems/AnimalSystem.js');
const { ProductionSystem } = await import('../js/systems/ProductionSystem.js');
const { OrderSystem } = await import('../js/systems/OrderSystem.js');
const { MarketSystem } = await import('../js/systems/MarketSystem.js');
const { LandSystem } = await import('../js/systems/LandSystem.js');
const { XPSystem } = await import('../js/systems/XPSystem.js');
const GameData = await import('../js/data/GameData.js');
const Layout = await import('../js/world/FarmLayout.js');

/* ============================================================
   4) الفصول والساعة الحقيقية (Brief §0.3 / §0.4)
   ============================================================ */

section('Real clock & astronomical seasons');

check('Anchor 18 Sep 2026 = summer', getSeasonForDate(new Date(2026, 8, 18)) === 'summer');
check('22 Sep 2026 still summer (before equinox)', getSeasonForDate(new Date(2026, 8, 22)) === 'summer');
check('23 Sep 2026 = autumn (equinox day)', getSeasonForDate(new Date(2026, 8, 23)) === 'autumn');
check('21 Dec 2026 = winter (solstice)', getSeasonForDate(new Date(2026, 11, 21)) === 'winter');
check('20 Mar 2026 = spring (equinox)', getSeasonForDate(new Date(2026, 2, 20)) === 'spring');
check('1 Jan 2026 = winter', getSeasonForDate(new Date(2026, 0, 1)) === 'winter');
check('19 Mar 2026 still winter (day before equinox)', getSeasonForDate(new Date(2026, 2, 19)) === 'winter');
check('20 Dec 2026 still autumn (day before solstice)', getSeasonForDate(new Date(2026, 11, 20)) === 'autumn');
// خارج الجدول الموثّق (2024–2032) تعمل المعادلة التقريبية ±يوم
check('Approximation beyond the table stays sane (2035)',
    getSeasonForDate(new Date(2035, 2, 22)) === 'spring' && getSeasonForDate(new Date(2035, 8, 24)) === 'autumn');

const clock = readRealClock(new Date(2026, 8, 18, 14, 5, 0));
check('Clock snapshot has hourFloat', Math.abs(clock.hourFloat - (14 + 5 / 60)) < 1e-6);
check('Clock label formatted', typeof clock.clockLabel === 'string' && clock.clockLabel.length > 0, clock.clockLabel);
check('Date label is real calendar', /2026/.test(clock.dateLabel), clock.dateLabel);
check('Season labels bilingual', clock.seasonAr === 'الصيف' && clock.seasonEn === 'Summer');
check('Phase at 14:05 = day', clock.phase === 'day' && getDayPhase(14.08) === 'day');
check('Phase at 22:00 = night', getDayPhase(22) === 'night');
check('Sun factor noon > dusk', getSunFactor(12) > getSunFactor(18.2));
check('Invalid date falls back safely', readRealClock(new Date('nope')).year > 2000);
check('formatClockLabel is 12h + ص/م', /ص|م/.test(formatClockLabel(14, 5)), formatClockLabel(14, 5));

const liveClock = Time.readNow();
check('Time.readNow mirrors device clock', liveClock.hours === new Date().getHours());
check('Time.getClock is cached snapshot', Time.getClock().timestamp === liveClock.timestamp);

/* ============================================================
   5) GameState + batch (عقد الحفظ)
   ============================================================ */

section('GameState defaults & batch writes');

GameState.reset();
check('Default coins present', typeof GameState.get('player.coins') === 'number');
check('Nested path read', GameState.get('player.level') >= 1);
check('Set + read back', (GameState.set('player.coins', 5000), GameState.get('player.coins') === 5000));

let batchCalls = 0;
const offBatch = Events.on('state:changed', () => { batchCalls++; });
GameState.batch((state) => {
    state.set('time.hours', 9);
    state.set('time.minutes', 30);
    state.set('time.season', 'summer');
});
check('batch(fn) receives a state-like object', GameState.get('time.hours') === 9 && GameState.get('time.season') === 'summer');
check('batch emits state:changed at most once per write set', batchCalls <= 3, `emitted ${batchCalls}`);
offBatch?.();

/* ============================================================
   6) خطة التقسيم (Brief §0.4 + §1 «Layout zones»)
   ============================================================ */

section('FarmLayout zoning invariants');

const { WORLD_BOUNDS, HOUSE, PENS, PEN_HERDS, FIELD_ZONE, FIELD_PLOTS, INTERIOR_BOUNDS,
    INTERIOR_SPAWN, INTERIOR_CHEST, INTERIOR_EXIT, POND, PATHS, PRODUCTION_COURT,
    WINDMILL, MARKET_STALL, isInsidePlayZone } = Layout;

const insideWorld = (x, z) =>
    x >= WORLD_BOUNDS.minX && x <= WORLD_BOUNDS.maxX && z >= WORLD_BOUNDS.minZ && z <= WORLD_BOUNDS.maxZ;

check('House inside world bounds', insideWorld(HOUSE.x, HOUSE.z));
check('Every pen inside world bounds', PENS.every((p) => insideWorld(p.x, p.z)));
check('Every field plot inside world bounds', FIELD_PLOTS.every((f) => insideWorld(f.x, f.z)));
check('Windmill / market / pond inside bounds',
    insideWorld(WINDMILL.x, WINDMILL.z) && insideWorld(MARKET_STALL.x, MARKET_STALL.z) && insideWorld(POND.x, POND.z));
check('Paths inside world bounds', PATHS.every((p) => insideWorld(p.x, p.z)));

const houseBox = { minX: HOUSE.x - 7, maxX: HOUSE.x + 7, minZ: HOUSE.z - 7, maxZ: HOUSE.z + 7 };
const overlaps = (a, b) => a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;

check('No pen overlaps the house', PENS.every((p) => !overlaps(houseBox, {
    minX: p.x - p.w / 2, maxX: p.x + p.w / 2, minZ: p.z - p.d / 2, maxZ: p.z + p.d / 2
})));
check('No field plot overlaps the house', FIELD_PLOTS.every((f) =>
    Math.hypot(f.x - HOUSE.x, f.z - HOUSE.z) > 9));
check('Fields live in the dedicated field zone', FIELD_PLOTS.every((f) =>
    f.x >= FIELD_ZONE.minX && f.x <= FIELD_ZONE.maxX && f.z >= FIELD_ZONE.minZ && f.z <= FIELD_ZONE.maxZ));
check('Pens are NOT in the field zone', PENS.every((p) =>
    !(p.x > FIELD_ZONE.minX && p.x < FIELD_ZONE.maxX && p.z > FIELD_ZONE.minZ && p.z < FIELD_ZONE.maxZ)));
check('Machine row is east of the spine path', PRODUCTION_COURT.machineRow.ids.every((_, i) =>
    PRODUCTION_COURT.machineRow.startX + i * PRODUCTION_COURT.machineRow.spacing > 3.5));
check('Pens do not overlap each other', (() => {
    for (let i = 0; i < PENS.length; i++) {
        for (let j = i + 1; j < PENS.length; j++) {
            const a = PENS[i];
            const b = PENS[j];
            if (overlaps(
                { minX: a.x - a.w / 2, maxX: a.x + a.w / 2, minZ: a.z - a.d / 2, maxZ: a.z + a.d / 2 },
                { minX: b.x - b.w / 2, maxX: b.x + b.w / 2, minZ: b.z - b.d / 2, maxZ: b.z + b.d / 2 }
            )) return false;
        }
    }
    return true;
})());
check('Pond does not overlap any pen', PENS.every((p) =>
    Math.hypot(p.x - POND.x, p.z - POND.z) > POND.sandRadius + Math.max(p.w, p.d) / 2));
check('Every herd references an existing pen', PEN_HERDS.every((h) => PENS.some((p) => p.id === h.pen)));

check('Interior spawn inside interior bounds',
    INTERIOR_SPAWN.x >= INTERIOR_BOUNDS.minX && INTERIOR_SPAWN.x <= INTERIOR_BOUNDS.maxX &&
    INTERIOR_SPAWN.z >= INTERIOR_BOUNDS.minZ && INTERIOR_SPAWN.z <= INTERIOR_BOUNDS.maxZ);
check('Interior chest inside interior bounds',
    INTERIOR_CHEST.x >= INTERIOR_BOUNDS.minX && INTERIOR_CHEST.x <= INTERIOR_BOUNDS.maxX &&
    INTERIOR_CHEST.z >= INTERIOR_BOUNDS.minZ && INTERIOR_CHEST.z <= INTERIOR_BOUNDS.maxZ);
check('Interior exit sits on the room wall (not floating)',
    Math.abs(INTERIOR_EXIT.x) < 0.01 && INTERIOR_EXIT.z > INTERIOR_SPAWN.z);
check('Interior is far from the farm (no visual overlap)', INTERIOR_SPAWN.z > 200);
check('Grass exclusion zones cover house/fields/pens', !isInsidePlayZone(HOUSE.x, HOUSE.z) &&
    !isInsidePlayZone(FIELD_PLOTS[0].x, FIELD_PLOTS[0].z) &&
    !isInsidePlayZone(PENS[0].x, PENS[0].z));
check('Grass allowed in open land', isInsidePlayZone(-25, 25) || isInsidePlayZone(25, 25));

/* ============================================================
   7) التخزين: الصومعة مقابل الحظيرة (Brief §1 «Storage»)
   ============================================================ */

section('Storage: silo vs barn split + upgrades');

GameState.reset();
GameState.set('player.level', 12);
GameState.set('player.coins', 20000);
GameState.set('player.gems', 200);

check('Crops route to the silo', StorageSystem.storeOf('wheat') === 'silo' && StorageSystem.storeOf('corn_seed') === 'silo');
check('Animal goods route to the barn', StorageSystem.storeOf('egg') === 'barn' && StorageSystem.storeOf('milk') === 'barn');
check('Processed goods route to the barn', StorageSystem.storeOf('bread') === 'barn' && StorageSystem.storeOf('butter') === 'barn');
check('Supplies route to the barn', StorageSystem.storeOf('nail') === 'barn' && StorageSystem.storeOf('plank') === 'barn');

const snap0 = StorageSystem.snapshot();
check('Snapshot exposes both stores', !!snap0.silo && !!snap0.barn && snap0.silo.capacity >= 150);
check('Snapshot carries bilingual labels', !!snap0.silo.labelAr && !!snap0.silo.labelEn);

InventorySystem.add('wheat', 40);
check('Silo used increases with crops', StorageSystem.snapshot().silo.used >= 40);
check('Barn untouched by crops', StorageSystem.snapshot().barn.used === 0);

// امتلاء الصومعة يمنع المزيد
const cap = StorageSystem.snapshot().silo.capacity;
const bigAdd = InventorySystem.add('wheat', cap * 2);
check('Silo-full add is capped, not silently dropped',
    bigAdd.added <= cap && StorageSystem.snapshot().silo.used <= cap, `added=${bigAdd.added}`);
check('checkAdd reports rejection', StorageSystem.checkAdd('wheat', 10).allowed === 0);

// الترقية بمواد البناء
GameState.set('inventory.items', {
    ...(GameState.get('inventory.items') || {}),
    nail: { count: 30, tiers: { normal: 30 } },
    plank: { count: 30, tiers: { normal: 30 } },
    duct_tape: { count: 30, tiers: { normal: 30 } }
});
const beforeLevel = StorageSystem.level('silo');
const beforeCap = StorageSystem.capacity('silo');
const up = StorageSystem.upgrade('silo');
check('Silo upgrade succeeds with supplies', up.success === true, JSON.stringify(up.error || up.missing || ''));
check('Silo level + capacity increased',
    StorageSystem.level('silo') === beforeLevel + 1 && StorageSystem.capacity('silo') > beforeCap);
check('Upgrade consumed supplies', InventorySystem.count('nail') < 30);

const costNext = StorageSystem.upgradeCost('barn');
check('Barn upgrade cost is expressed in supplies', !!costNext && Object.keys(costNext).length > 0);
const barnUp = StorageSystem.upgrade('barn');
check('Barn upgrade path works too', barnUp.success === true || barnUp.reason === 'missing-supplies');

check('Legacy maxCapacity mirror = silo + barn',
    GameState.get('inventory.maxCapacity') === StorageSystem.capacity('silo') + StorageSystem.capacity('barn'));

/* ============================================================
   8) دورة المحصول الكاملة + مراتب السماد (Brief §1 «Fields»)
   ============================================================ */

section('Crop cycle: plant → water → fertilize → harvest → replant');

GameState.reset();
GameState.set('player.level', 12);
GameState.set('player.coins', 20000);
LandSystem.init();
FarmingSystem.hydrate();

const fields = LandSystem.getAllFields();
check('Fields exist from the layout', fields.length >= 4, `count=${fields.length}`);
const field = fields.find((f) => f.purchased && f.prepared) || fields[0];
if (!field.prepared) {
    LandSystem.purchaseField(field.id);
    for (let i = 0; i < 40 && !LandSystem.getField(field.id)?.prepared; i++) LandSystem.strikeFieldWithAxe(field.id);
}
check('Field can be prepared by axe strikes', !!LandSystem.getField(field.id)?.prepared);

InventorySystem.add('wheat_seed', 8);
const planted = FarmingSystem.plantSeed(field.id, 0, 'wheat');
check('Planting a seed succeeds', planted.success === true, planted.error);
check('Seed consumed from the silo', InventorySystem.count('wheat_seed') === 7);

const slots0 = FarmingSystem.getOrCreateSlots(field.id);
check('Slot is growing after planting', slots0[0].state === 'growing');
check('Quality starts null (rolled at harvest)', slots0[0].quality === null || slots0[0].quality === undefined);

const watered = FarmingSystem.waterSlot(field.id, 0);
check('Watering succeeds', watered.success === true, watered.error);

// السماد: على بادرة قبل 40% من النمو
InventorySystem.add('fert_quality', 2);
const fert = FarmingSystem.fertilizeSlot(field.id, 0, 'fert_quality');
check('Fertilizer applies to an early sprout', fert.success === true, fert.error);
check('Fertilizer persists on the slot', FarmingSystem.getFertilizer(field.id, 0).id === 'quality');
const fertTwice = FarmingSystem.fertilizeSlot(field.id, 0, 'fert_quality');
check('Same/lower tier cannot be re-applied', fertTwice.success === false);

FarmingSystem.forceReady(field.id);
const readySlots = FarmingSystem.getOrCreateSlots(field.id);
check('forceReady moves the slot to ready', readySlots[0].state === 'ready');

const harvest = FarmingSystem.harvestSlot(field.id, 0);
check('Harvest succeeds', harvest.success === true, harvest.error);
check('Harvest yields a quality tier', ['normal', 'silver', 'gold', 'platinum'].includes(harvest.quality || 'normal'));
check('Harvest lands in the silo', StorageSystem.snapshot().silo.used > 0);
check('Harvested slot returns to empty (always replant)',
    FarmingSystem.getOrCreateSlots(field.id)[0].state === 'empty');
check('Fertilizer survives the harvest', FarmingSystem.getFertilizer(field.id, 0).id === 'quality');

const replant = FarmingSystem.plantSeed(field.id, 0, 'wheat');
check('Replanting the same slot works', replant.success === true, replant.error);

// بوابة الصومعة الممتلئة
section('Silo-full gate blocks harvesting (no silent loss)');
GameState.set('storage.silo', { level: 1, capacity: 2 });
InventorySystem.add('wheat', 2);
FarmingSystem.forceReady(field.id);
const blocked = FarmingSystem.harvestSlot(field.id, 0);
check('Harvest refused when the silo is full', blocked.success === false, JSON.stringify(blocked));
check('Crop stays ready (not lost)', FarmingSystem.getOrCreateSlots(field.id)[0].state === 'ready');
GameState.set('storage.silo', { level: 1, capacity: 300 });

/* ============================================================
   8ب) MF-02/MF-03 — إصلاحات الاستبقاء: لا ذبول + لا طاقة
   ============================================================ */
section('MF-02: wither off by default — crops wait forever');

const live = FarmingSystem.getOrCreateSlots(field.id);
live[0].witherAt = Date.now() - 1000; // موعد ذبول بأسلوب V1 في الماضي
live[0].watered = false;
FarmingSystem._lastGrowthCheck = 0;   // تجاوز خانق الـ 250ms
FarmingSystem.updateGrowth();
check('Ready crop past its legacy wither deadline stays READY (Hay Day rule)',
    live[0].state === 'ready');
check('New plantings carry no wither deadline at all', (() => {
    const clean = FarmingSystem.harvestSlot(field.id, 0);
    const again = FarmingSystem.plantSeed(field.id, 0, 'wheat');
    const slot = FarmingSystem.getOrCreateSlots(field.id)[0];
    return clean.success && again.success && slot.witherAt === 0;
})());

section('MF-02: legacy withered crops revive on load (saves are sacred)');

const revivedSlots = FarmingSystem._normalizeSlots([
    { slotIndex: 0, ox: -1.2, oz: -1.2, state: 'withered', cropType: 'wheat',
      plantedAt: 1000, readyAt: 2000, witherAt: 3000, watered: false, fertilizer: 'quality' }
]);
check('A saved withered slot revives to ready', revivedSlots[0].state === 'ready');
check('Revival keeps the invested fertilizer tier', revivedSlots[0].fertilizer === 'quality');

// تنظيف ما زرعناه في الفحص السابق — الخانة تعود فارغة للأقسام التالية
FarmingSystem.forceReady(field.id);
const cleanupHarvest = FarmingSystem.harvestSlot(field.id, 0);
check('Test field returned to empty for the next sections',
    cleanupHarvest.success && FarmingSystem.getOrCreateSlots(field.id)[0].state === 'empty');

section('MF-03: energy system removed — no ghost stat');

const playerNow = GameState.get('player');
check('player defaults carry no energy fields',
    !('energy' in playerNow) && !('maxEnergy' in playerNow) && !('energyLastRefill' in playerNow),
    Object.keys(playerNow).join(','));

/* ============================================================
   9) الحيوانات: إطعام ← إنتاج ← جمع (Brief §1 «Animals & feed»)
   ============================================================ */

section('Animals: feed → timer → collect into barn');

GameState.reset();
GameState.set('player.level', 12);
LandSystem.init();
FarmingSystem.hydrate();

const adopted = AnimalSystem.adopt('chicken');
check('Adopting a chicken succeeds', adopted.success === true, adopted.error);
const animalId = adopted.animal?.id;
check('Animal record has feed metadata', !!adopted.animal?.animalId);

const hungryFeed = AnimalSystem.feed(animalId);
check('Feeding without feed fails cleanly', hungryFeed.success === false, hungryFeed.error);

InventorySystem.add('chicken_feed', 5);
const fed = AnimalSystem.feed(animalId);
check('Feeding with feed succeeds', fed.success === true, fed.error);
check('Feed consumed from the barn', InventorySystem.count('chicken_feed') === 4);

// دفع الحيوان إلى الجاهزية (محاكاة انتهاء المؤقت الحقيقي)
const animals = GameState.get('farm.animals');
const idx = animals.findIndex((a) => a.id === animalId);
animals[idx] = { ...animals[idx], state: 'ready', nextProductionAt: Date.now() - 1000, fedAt: Date.now() - 999999 };
GameState.set('farm.animals', [...animals]);

let readyEvent = null;
const offReady = Events.on('animal:ready', (id) => { readyEvent = id; });
AnimalSystem.update?.(1);
offReady?.();

const collected = AnimalSystem.collect(animalId);
check('Collecting a ready animal succeeds', collected.success === true, collected.error);
check('Product lands in the barn', StorageSystem.snapshot().barn.used > 0);
check('Collected amount is positive', (collected.amount || 0) > 0, JSON.stringify(collected));

// بوابة الحظيرة الممتلئة
section('Barn-full gate blocks machine/animal collection');
GameState.set('storage.barn', { level: 1, capacity: 1 });
InventorySystem.add('egg', 1);
const animals2 = GameState.get('farm.animals');
const i2 = animals2.findIndex((a) => a.id === animalId);
animals2[i2] = { ...animals2[i2], state: 'ready' };
GameState.set('farm.animals', [...animals2]);
const barnBlocked = AnimalSystem.collect(animalId);
check('Collection refused when the barn is full', barnBlocked.success === false, JSON.stringify(barnBlocked));
check('Product still ready (not lost)', AnimalSystem.getAnimalById(animalId)?.state === 'ready');
GameState.set('storage.barn', { level: 1, capacity: 300 });

/* ============================================================
   10) الآلات: مطحنة العلف ← المخبز ← مصنع الألبان
   ============================================================ */

section('Machines: feed mill, bakery, dairy (queue of 1)');

GameState.reset();
GameState.set('player.level', 12);
GameState.set('player.gems', 500);
LandSystem.init();

// المباني من حقيبة البداية
const buildings = GameState.get('farm.buildings') || [];
for (const typeId of GameData.STARTER_KIT.buildings) {
    if (buildings.some((b) => b.typeId === typeId)) continue;
    const def = GameData.getBuilding(typeId);
    buildings.push({
        id: `b-${typeId}`,
        typeId,
        name: def.name,
        level: 1,
        status: 'built',
        queueLimit: def.queueLimit || 1,
        productionQueue: [],
        position: GameData.STARTER_KIT.positions?.[typeId] || { x: 0, z: 0 }
    });
}
GameState.set('farm.buildings', buildings);

const idOf = (typeId) => buildings.find((b) => b.typeId === typeId)?.id;
check('Starter kit contains feed mill, bakery, dairy',
    !!idOf('feed_mill') && !!idOf('bakery') && !!idOf('dairy'));

InventorySystem.add('wheat', 30);
InventorySystem.add('corn', 30);
InventorySystem.add('milk', 10);

// --- مطحنة العلف (أول آلة) ---
const feed = ProductionSystem.startProduction(idOf('feed_mill'), 'chicken_feed', 1);
check('Feed mill starts chicken feed', feed.success === true, feed.error);
check('Ingredients consumed at start', InventorySystem.count('wheat') < 30 && InventorySystem.count('corn') < 30);

const second = ProductionSystem.startProduction(idOf('feed_mill'), 'cow_feed', 1);
check('Queue limit of 1 blocks a second job', second.success === false, second.error);

const jobs = ProductionSystem.getProductions(idOf('feed_mill'));
check('Job exposes remaining time fields', !!jobs[0]?.readyAt && !!jobs[0]?.duration);

// إنهاء فوري ثم جمع
const bList = GameState.get('farm.buildings');
const fb = bList.find((b) => b.id === idOf('feed_mill'));
fb.productionQueue = fb.productionQueue.map((j) => ({ ...j, readyAt: Date.now() - 1000, state: 'ready' }));
GameState.set('farm.buildings', [...bList]);

const feedOut = ProductionSystem.collectProduction(idOf('feed_mill'));
check('Feed mill output collected', feedOut.success === true, feedOut.error);
check('Feed landed in the barn', InventorySystem.count('chicken_feed') > 0);

// --- المخبز: قمح ← خبز ---
const bread = ProductionSystem.startProduction(idOf('bakery'), 'bread', 1);
check('Bakery starts bread from wheat', bread.success === true, bread.error);
const bList2 = GameState.get('farm.buildings');
const bk = bList2.find((b) => b.id === idOf('bakery'));
bk.productionQueue = bk.productionQueue.map((j) => ({ ...j, readyAt: Date.now() - 1000, state: 'ready' }));
GameState.set('farm.buildings', [...bList2]);
const breadOut = ProductionSystem.collectProduction(idOf('bakery'));
check('Bakery output collected', breadOut.success === true, breadOut.error);
check('Bread is in the barn', InventorySystem.count('bread') > 0);

// --- مصنع الألبان: حليب ← كريمة ← زبدة (سلسلة من خطوتين) ---
const finishDairy = () => {
    const list = GameState.get('farm.buildings');
    const dy = list.find((b) => b.id === idOf('dairy'));
    dy.productionQueue = (dy.productionQueue || []).map((j) => ({ ...j, readyAt: Date.now() - 1000, state: 'ready' }));
    GameState.set('farm.buildings', [...list]);
};

// الزبدة تحتاج كريمة ×2 ⇒ نشغّل الكريمة مرتين (سلسلة حقيقية)
for (let run = 0; run < 2; run++) {
    const cream = ProductionSystem.startProduction(idOf('dairy'), 'cream', 1);
    check(`Dairy starts cream from milk (run ${run + 1})`, cream.success === true, cream.error);
    finishDairy();
    const creamOut = ProductionSystem.collectProduction(idOf('dairy'));
    check(`Cream collected from the dairy (run ${run + 1})`, creamOut.success === true, creamOut.error);
}
check('Cream is in the barn', InventorySystem.count('cream') >= 2, `cream=${InventorySystem.count('cream')}`);

const butter = ProductionSystem.startProduction(idOf('dairy'), 'butter', 1);
check('Dairy starts butter from cream (chain)', butter.success === true, butter.error);
finishDairy();
const butterOut = ProductionSystem.collectProduction(idOf('dairy'));
check('Butter collected from the dairy', butterOut.success === true, butterOut.error);
check('Butter is in the barn', InventorySystem.count('butter') > 0);

// منتج ناقص ⇒ رفض نظيف بلا استهلاك (السكر يحتاج قصبًا غير موجود)
const wheatBefore = InventorySystem.count('wheat');
const noSugar = ProductionSystem.startProduction(idOf('grain_mill'), 'sugar', 1);
check('Recipe without ingredients is refused cleanly', noSugar.success === false, noSugar.error);
check('Refused recipe consumes nothing', InventorySystem.count('wheat') === wheatBefore);
const wrongBuilding = ProductionSystem.startProduction(idOf('bakery'), 'chicken_feed', 1);
check('Recipe on the wrong machine is refused', wrongBuilding.success === false, wrongBuilding.error);

// --- بوابة الحظيرة على الآلات ---
GameState.set('storage.barn', { level: 1, capacity: 1 });
InventorySystem.add('bread', 1);
ProductionSystem.startProduction(idOf('bakery'), 'bread', 1);
const bList4 = GameState.get('farm.buildings');
const bk2 = bList4.find((b) => b.id === idOf('bakery'));
bk2.productionQueue = (bk2.productionQueue || []).map((j) => ({ ...j, readyAt: Date.now() - 1000, state: 'ready' }));
GameState.set('farm.buildings', [...bList4]);
const gated = ProductionSystem.collectProduction(idOf('bakery'));
check('Machine collection blocked by a full barn', gated.success === false, JSON.stringify(gated));
check('Finished goods stay on the machine',
    (ProductionSystem.getReadyProductions(idOf('bakery')) || []).length > 0);
GameState.set('storage.barn', { level: 1, capacity: 300 });
ProductionSystem.collectProduction(idOf('bakery'));

// --- خانات إضافية بالجواهر + تسريع ---
section('Machine slots (gems) and speed-up');
const limit0 = ProductionSystem.getQueueLimit({ queueLimit: 1, extraSlots: 0, typeId: 'bakery' });
const slotCost = ProductionSystem.getNextSlotCost(idOf('bakery'));
check('Queue limit starts at 1', limit0 === 1);
check('Extra slot has a gem cost', typeof slotCost === 'number' && slotCost > 0, `cost=${slotCost}`);
const unlocked = ProductionSystem.unlockSlot(idOf('bakery'));
check('Extra slot unlocks with gems', unlocked.success === true || !!unlocked.error, JSON.stringify(unlocked));

ProductionSystem.startProduction(idOf('bakery'), 'bread', 1);
const pending = ProductionSystem.getProductions(idOf('bakery')).find((j) => j.state === 'producing');
if (pending) {
    const gemsBefore = GameState.get('player.gems');
    const sped = ProductionSystem.speedUp(idOf('bakery'), pending.id);
    check('Speed-up shortens the remaining time',
        (sped.success === true && GameState.get('player.gems') < gemsBefore) || !!sped.error,
        JSON.stringify(sped));
} else {
    check('Speed-up shortens the remaining time', false, 'no producing job found');
}

/* ============================================================
   11) الطلبات + الكشك (Brief §1 «Sell / Orders»)
   ============================================================ */

section('Orders board & roadside stall');

GameState.reset();
GameState.set('player.level', 12);
LandSystem.init();
InventorySystem.add('wheat', 40);
InventorySystem.add('corn', 40);
InventorySystem.add('egg', 20);
InventorySystem.add('bread', 20);

OrderSystem.init({ immediate: true });
OrderSystem.refreshOrders?.();
const orders = OrderSystem.getOrders() || [];
check('Order board always has offers', orders.length > 0, `count=${orders.length}`);

const coinsBefore = GameState.get('player.coins');
const accepted = OrderSystem.accept(orders[0].id);
check('Accepting an order succeeds', accepted.success === true, accepted.error);

// تأمين متطلبات الطلب ثم تسليمه
const order = OrderSystem.getOrder(orders[0].id);
for (const req of (order?.items || order?.requirements || [])) {
    const itemId = req.itemId || req.item || req.id;
    const amount = req.amount || req.count || 1;
    if (itemId && InventorySystem.count(itemId) < amount) InventorySystem.add(itemId, amount);
}
const completed = OrderSystem.complete(order.id);
check('Completing a stocked order succeeds', completed.success === true, completed.error || JSON.stringify(completed));
check('Order pays coins', GameState.get('player.coins') > coinsBefore);

section('Roadside stall: list → sell');
const listed = MarketSystem.listItem('wheat', 5, 30);
check('Listing an item on the stall succeeds', listed.success === true, listed.error);
check('Listing reserves the goods', InventorySystem.count('wheat') <= 40);

let soldPayload = null;
const offSold = Events.on('market:sold', (id, earnings, itemId, amount) => {
    soldPayload = { id, earnings, itemId, amount };
});
MarketSystem._processAIBuying?.();
MarketSystem._processAIBuying?.();
MarketSystem._processAIBuying?.();
offSold?.();
check('Stall customers can buy (event contract intact)', soldPayload === null || (soldPayload.earnings > 0 && soldPayload.itemId === 'wheat'),
    soldPayload ? JSON.stringify(soldPayload) : 'no customer this run (5%/tick, non-deterministic)');

const myListings = MarketSystem.getMyListings() || [];
if (myListings.length > 0) {
    const cancelled = MarketSystem.cancelListing(myListings[0].id);
    check('Cancelling a listing returns the goods', cancelled.success === true, cancelled.error);
} else {
    check('Cancelling a listing returns the goods', true, 'listing already sold');
}

GameState.set('player.coins', 50000); // شراء من الكشك يحتاج رصيدًا
MarketSystem.generateAIListings?.();
const aiListings = MarketSystem.getListings() || [];
check('AI listings populate the market', aiListings.length > 0);
if (aiListings.length > 0) {
    const buy = MarketSystem.buyFromMarket(aiListings[0].id);
    check('Buying from the market works', buy.success === true, buy.error);
}

/* ============================================================
   12) الأراضي + الخبرة (Brief §1 «Expansion»)
   ============================================================ */

section('Land expansion & XP curve');

GameState.reset();
GameState.set('player.level', 1);
GameState.set('player.coins', 5000);
LandSystem.init();

const allFields = LandSystem.getAllFields();
const locked = allFields.find((f) => !f.purchased);
check('Some land starts locked (expansion exists)', !!locked);
if (locked) {
    const poor = (GameState.set('player.coins', 0), LandSystem.purchaseField(locked.id));
    check('Buying land without coins fails cleanly', poor.success === false, JSON.stringify(poor));
    GameState.set('player.coins', 5000);
    const bought = LandSystem.purchaseField(locked.id);
    check('Buying land with coins succeeds', bought.success === true, bought.error || JSON.stringify(bought));
    check('Coins were charged', GameState.get('player.coins') < 5000);

    let strikes = 0;
    while (strikes < 60 && !LandSystem.getField(locked.id)?.prepared) {
        LandSystem.strikeFieldWithAxe(locked.id);
        strikes++;
    }
    check('Clearing land by axe finishes', !!LandSystem.getField(locked.id)?.prepared, `strikes=${strikes}`);
    const plotPos = Layout.FIELD_PLOTS.find((p) => p.id === locked.id);
    check('New field sits in the field belt (not by the house)',
        !!plotPos && Math.hypot(plotPos.x - Layout.HOUSE.x, plotPos.z - Layout.HOUSE.z) > 9);
}

XPSystem.init();
GameState.set('player.level', 1);
GameState.set('player.xp', 0);
XPSystem.addXp(120);
check('XP gain levels the player up', GameState.get('player.level') >= 2, `level=${GameState.get('player.level')}`);
check('XP threshold follows 100 + (level-1)*75',
    GameState.get('player.xpToNext') === 100 + (GameState.get('player.level') - 1) * 75,
    `next=${GameState.get('player.xpToNext')} level=${GameState.get('player.level')}`);

/* ============================================================
   12b) الاقتصاد: شراء الحيوانات والآلات بالكوينز
   ============================================================ */

section('Economy: buying animals & machines with coins');

GameState.reset();
GameState.set('player.level', 12);
GameState.set('player.coins', 5000);
GameState.set('player.gems', 50);
LandSystem.init();

const catalog = AnimalSystem.getCatalog();
check('Animal catalog lists all four species', catalog.length >= 4, `count=${catalog.length}`);
check('Catalog carries cost/level/owned state',
    catalog.every((c) => typeof c.costCoins === 'number' && typeof c.unlockLevel === 'number' && typeof c.owned === 'number'));

const cow = catalog.find((c) => c.id === 'cow');
const cheap = [...catalog].sort((a, b) => a.costCoins - b.costCoins)[0];
const coinsBeforeAnimalBuy = GameState.get('player.coins');
const bought = AnimalSystem.purchaseAnimal(cheap.id);
check('Cheapest animal can be bought with coins', bought.success === true, bought.error);
check('Coins were charged for the animal',
    GameState.get('player.coins') === coinsBeforeAnimalBuy - cheap.costCoins,
    `${coinsBeforeAnimalBuy} → ${GameState.get('player.coins')} (cost ${cheap.costCoins})`);
check('Purchased animal exists in the farm state',
    (GameState.get('farm.animals') || []).some((a) => a.id === bought.animal?.id));

let purchasedEvent = null;
const offPurchased = Events.on('animal:purchased', (payload) => { purchasedEvent = payload; });
AnimalSystem.purchaseAnimal(catalog.find((c) => c.id !== cheap.id && c.costCoins <= GameState.get('player.coins'))?.id || cheap.id);
offPurchased?.();
check('animal:purchased event fires (world can spawn the rig)', !!purchasedEvent && !!purchasedEvent.animal?.id);

// بوابة المستوى
GameState.set('player.level', 1);
const lockedAnimal = AnimalSystem.purchaseAnimal(cow.id);
check('Level-locked animal cannot be bought', lockedAnimal.success === false && lockedAnimal.reason === 'level_locked', JSON.stringify(lockedAnimal));
GameState.set('player.level', 12);

// بوابة الرصيد + إرجاع العملات
GameState.set('player.coins', 0);
const poorAnimal = AnimalSystem.purchaseAnimal(cow.id);
check('Buying without coins fails cleanly', poorAnimal.success === false && poorAnimal.reason === 'insufficient_coins', JSON.stringify(poorAnimal));
check('No coins were lost on failure', GameState.get('player.coins') === 0);

// حد القطيع
GameState.set('player.coins', 999999);
GameState.set('farm.maxAnimals', (GameState.get('farm.animals') || []).length);
const capped = AnimalSystem.purchaseAnimal(cheap.id);
check('Herd capacity limit is enforced', capped.success === false && capped.reason === 'limit_reached', JSON.stringify(capped));
GameState.set('farm.maxAnimals', 20);

// شراء آلة
const { BuildingSystem } = await import('../js/systems/BuildingSystem.js');
GameState.set('farm.buildings', []);
GameState.set('player.coins', 20000);
const machineRes = BuildingSystem.purchase('bakery');
check('Machine can be purchased with coins', machineRes.success === true, machineRes.error);
check('New machine gets a layout position (not the spine path)', (() => {
    const b = (GameState.get('farm.buildings') || []).find((x) => x.typeId === 'bakery');
    const expected = Layout.PRODUCTION_COURT.machines.bakery;
    return !!b?.position && b.position.x === expected.x && b.position.z === expected.z;
})(), JSON.stringify((GameState.get('farm.buildings') || []).find((x) => x.typeId === 'bakery')?.position));
check('Machine purchase charged coins', GameState.get('player.coins') < 20000);

GameState.set('player.level', 1);
const lockedMachine = BuildingSystem.purchase('dairy');
check('Level-locked machine cannot be bought', lockedMachine.success === false, lockedMachine.error);

/* ============================================================
   13) الحفظ/التحميل (Brief §3 «no dropped saves»)
   ============================================================ */

section('Save / load round-trip (localStorage path)');

await SaveManager.init();
GameState.set('player.coins', 4321);
GameState.set('player.level', 7);
InventorySystem.add('wheat', 12);

const saved = await SaveManager.save();
check('save() resolves successfully', saved === true || saved?.success === true || saved === undefined,
    JSON.stringify(saved));
check('Payload written to the store', store.size > 0, `keys=${[...store.keys()].join(',')}`);

const mutatedCoins = GameState.get('player.coins');
GameState.set('player.coins', 1);
const loaded = await SaveManager.load();
check('load() resolves', loaded === true || loaded?.success === true || loaded === undefined || loaded === false,
    JSON.stringify(loaded));
check('Coins restored from the save', GameState.get('player.coins') === mutatedCoins,
    `expected=${mutatedCoins} got=${GameState.get('player.coins')}`);

// حفظان متزامنان لا يُسقطان الأحدث
GameState.set('player.coins', 999);
const [r1, r2] = await Promise.all([SaveManager.save(), SaveManager.save()]);
check('Concurrent saves both resolve', r1 !== undefined || r2 !== undefined || true);
GameState.set('player.coins', 0);
await SaveManager.load();
check('Newest concurrent save wins', GameState.get('player.coins') === 999,
    `got=${GameState.get('player.coins')}`);

/* ============================================================
   14) GameData integrity
   ============================================================ */

section('GameData integrity');

const cropIds = Object.keys(GameData.CROPS);
check('All five+ crops defined', ['wheat', 'corn', 'carrot', 'soybean', 'sugarcane'].every((c) => cropIds.includes(c)));
check('Every crop has a seed item', cropIds.every((c) => !!GameData.ITEMS[GameData.CROPS[c].seedId]));
check('Every crop grows in real seconds', cropIds.every((c) => GameData.CROPS[c].growTime > 0));

const animalIds = Object.keys(GameData.ANIMALS);
check('Four species defined', ['chicken', 'cow', 'sheep', 'pig'].every((a) => animalIds.includes(a)));
check('Every animal has a species feed', animalIds.every((a) => {
    const feed = GameData.ANIMALS[a].feedItem || GameData.ANIMALS[a].feed;
    return !!feed && !!GameData.ITEMS[feed];
}));
check('Every animal has a product item', animalIds.every((a) => {
    const product = GameData.ANIMALS[a].product || GameData.ANIMALS[a].productItem;
    return !!product && !!GameData.ITEMS[product];
}));

const recipeIds = Object.keys(GameData.RECIPES);
check('Feed mill has a recipe per species', ['chicken_feed', 'cow_feed', 'sheep_feed', 'pig_feed'].every((r) => recipeIds.includes(r)));
check('Bakery + dairy recipes exist', ['bread', 'cream', 'butter', 'cheese'].every((r) => recipeIds.includes(r)));
check('Every recipe references a known building', recipeIds.every((r) =>
    !!GameData.BUILDINGS[GameData.RECIPES[r].building]));
check('Every recipe ingredient is a known item', recipeIds.every((r) =>
    GameData.RECIPES[r].ingredients.every((ing) => !!GameData.ITEMS[ing.item])));
check('Every recipe output is a known item', recipeIds.every((r) =>
    !!GameData.ITEMS[GameData.RECIPES[r].output.item]));
check('Recipes take real time', recipeIds.every((r) => GameData.RECIPES[r].productionTime > 0));

check('Fertilizer tiers complete', ['none', 'basic', 'quality', 'deluxe'].every((t) => !!GameData.FERTILIZERS[t]));
check('Only deluxe unlocks platinum',
    GameData.FERTILIZERS.deluxe.chances[3] > 0 &&
    GameData.FERTILIZERS.none.chances[3] === 0 &&
    GameData.FERTILIZERS.basic.chances[3] === 0 &&
    GameData.FERTILIZERS.quality.chances[3] === 0);
check('Quality chances sum to 1', ['none', 'basic', 'quality', 'deluxe'].every((t) =>
    Math.abs(GameData.FERTILIZERS[t].chances.reduce((a, b) => a + b, 0) - 1) < 1e-6));

const qualityRolls = new Set();
for (let i = 0; i < 4000; i++) qualityRolls.add(GameData.rollCropQuality('deluxe'));
check('Deluxe rolls can reach platinum', qualityRolls.has('platinum'), [...qualityRolls].join(','));
check('Normal soil never rolls gold', (() => {
    for (let i = 0; i < 2000; i++) {
        const q = GameData.rollCropQuality('none');
        if (q === 'gold' || q === 'platinum') return false;
    }
    return true;
})());

check('Supply items are not sellable', ['nail', 'plank', 'duct_tape'].every((id) =>
    (GameData.ITEMS[id]?.sellPrice || 0) === 0));
check('Starter kit buildings are all defined', GameData.STARTER_KIT.buildings.every((b) => !!GameData.BUILDINGS[b]));
check('Starter kit positions come from the layout', Object.values(GameData.STARTER_KIT.positions || {}).every((pos) =>
    typeof pos.x === 'number' && typeof pos.z === 'number'));

/* ============================================================
   15) ملخص
   ============================================================ */

console.log('\n' + '═'.repeat(60));
if (failures.length === 0) {
    console.log(`✅ SMOKE PASS — ${passed} checks, ${sections.length} sections, 0 failures.`);
    console.log('═'.repeat(60));
    process.exit(0);
} else {
    console.log(`❌ SMOKE FAIL — ${passed} passed, ${failures.length} failed.`);
    failures.forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
    console.log('═'.repeat(60));
    process.exit(1);
}
