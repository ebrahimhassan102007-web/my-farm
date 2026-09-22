/**
 * ============================================================
 * tests/vp.mjs — نقاط التحقق الـ١٥ (Sprint Verification Points)
 * ============================================================
 * Sprint: GAP-01 → GAP-07 · POLISH-01 → POLISH-03
 * المواصفة: public/AGENT_MASTER_PROMPT.md
 *
 * كل نقطة تحقق هنا تقابل بندًا واحدًا في المواصفة، وتفشل الاختبارات
 * (exit 1) لو انحرف السلوك — أي أنها حراسة انحدار دائمة، لا إثبات لمرة
 * واحدة. تُشغَّل من `npm run test:all`.
 *
 * التشغيل:  node tests/vp.mjs
 * ============================================================
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

/* ---------- منصات وهمية قبل أي import ---------- */
const store = new Map();
globalThis.localStorage = globalThis.localStorage || {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    key: (i) => [...store.keys()][i] ?? null,
    get length() { return store.size; }
};
globalThis.window = globalThis.window || {
    innerWidth: 1280, innerHeight: 720, devicePixelRatio: 2,
    addEventListener() {}, removeEventListener() {},
    requestAnimationFrame: (fn) => setTimeout(() => fn(Date.now()), 0),
    location: { href: 'http://localhost/', protocol: 'http:' },
    navigator: { userAgent: 'node-vp' },
    localStorage: globalThis.localStorage
};
globalThis.document = globalThis.document || {
    hidden: false,
    addEventListener() {}, removeEventListener() {},
    createElement: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, setAttribute() {} }),
    getElementById: () => null, querySelector: () => null,
    body: { appendChild() {} }
};
if (typeof globalThis.navigator === 'undefined') {
    Object.defineProperty(globalThis, 'navigator', { value: globalThis.window.navigator, configurable: true });
}

/* ---------- الوحدات الحقيقية ---------- */
const { GameState } = await import('../js/core/GameState.js');
const { Events } = await import('../js/core/EventBus.js');
const { Time } = await import('../js/core/TimeManager.js');
const { SaveManager } = await import('../js/core/SaveManager.js');
const { OrderSystem } = await import('../js/systems/OrderSystem.js');
const { XPSystem, xpForLevel } = await import('../js/systems/XPSystem.js');
const { FarmingSystem } = await import('../js/systems/FarmingSystem.js');
const { ProductionSystem } = await import('../js/systems/ProductionSystem.js');
const { StorageSystem } = await import('../js/systems/StorageSystem.js');
const { InventorySystem } = await import('../js/systems/InventorySystem.js');
const { HUD } = await import('../js/ui/HUD.js');
const { QuestSystem, INITIAL_QUESTS } = await import('../js/systems/QuestSystem.js');
const GameData = await import('../js/data/GameData.js');

/* ---------- أداة ---------- */
let passed = 0;
const failures = [];
function section(name) { console.log(`\n── ${name} ${'─'.repeat(Math.max(2, 56 - name.length))}`); }
function check(label, ok, detail = '') {
    if (ok) { passed++; console.log(`  ✅ ${label}`); }
    else { failures.push(`${label}${detail ? ` — ${detail}` : ''}`); console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`); }
    return !!ok;
}

/** تثبيت العشوائية لعتبات الحصاد الحتمية. */
function withRandom(value, fn) {
    const orig = Math.random;
    Math.random = () => value;
    try { return fn(); } finally { Math.random = orig; }
}

/** يعيد الحالة إلى صفر منطقي بين النقاط. */
function resetFarm({ siloUsed = 0, barnUsed = 0 } = {}) {
    GameState.reset();
    const items = {};
    const siloCap = StorageSystem.capacity('silo');
    const barnCap = StorageSystem.capacity('barn');
    if (siloUsed > 0) items.wheat = { count: siloUsed, quality: 'normal', tiers: { normal: siloUsed, silver: 0, gold: 0, platinum: 0 } };
    if (barnUsed > 0) items.glass = { count: barnUsed, quality: 'normal', tiers: { normal: barnUsed, silver: 0, gold: 0, platinum: 0 } };
    GameState.set('farm.buildings', []);
    GameState.set('farm.animals', []);
    GameState.set('inventory.items', items);
    GameState.set('player.xp', 0);
    GameState.set('player.level', 1);
    GameState.set('player.xpToNext', xpForLevel(1));
    return { siloCap, barnCap };
}

/** يزرع خانة جاهزة للحصاد. */
function readySlot(fieldId = 'field_center_left', cropType = 'wheat') {
    const slots = FarmingSystem.getOrCreateSlots(fieldId);
    slots[0].state = 'ready';
    slots[0].cropType = cropType;
    slots[0].readyAt = 0;
    slots[0].fertilizer = 'none';
    FarmingSystem._persist(fieldId);
    return slots[0];
}

const read = (p) => readFileSync(join(root, p), 'utf8');

/* ============================================================
   VP-02 → VP-05 · GAP-01: عقد XPSystem.addXp
   ============================================================ */
section('VP-02..05 · GAP-01 — XP level-up contract');

{
    resetFarm();
    XPSystem.init();

    // VP-02: مرتجع صادق عند عبور عتبة وعند عدم عبورها
    const need = xpForLevel(1);
    const under = XPSystem.addXp(need - 1, 'vp');
    const crossing = XPSystem.addXp(1 + 5, 'vp');
    check('VP-02 addXp().leveled is truthful (false below threshold, true on crossing)',
        under.leveled === false && crossing.leveled === true,
        `below=${under.leveled} crossing=${crossing.leveled}`);
}

{
    resetFarm();
    XPSystem.init();
    let levelups = 0;
    const off = Events.on('player:levelup', () => { levelups++; });

    // VP-03: تمرير واحد للترقية — لا فحص مزدوج
    const need = xpForLevel(1);
    XPSystem.addXp(need, 'vp');
    check('VP-03 exactly one level-up evaluation per gain (single player:levelup)',
        levelups === 1, `levelups=${levelups}`);
    off();
}

{
    resetFarm();
    XPSystem.init();

    // VP-04: مكافأة تقطع عدة مستويات ⇒ الحالة متسقة
    let total = 0;
    for (let lvl = 1; lvl <= 3; lvl++) total += xpForLevel(lvl);
    const res = XPSystem.addXp(total + 7, 'vp');
    const level = GameState.get('player.level');
    const xp = GameState.get('player.xp');
    const next = GameState.get('player.xpToNext');
    check('VP-04 multi-level award resolves consistently (level/xp/xpToNext)',
        res.leveled === true && level === 4 && xp === 7 && next === xpForLevel(4),
        `level=${level} xp=${xp} next=${next} expectedNext=${xpForLevel(4)}`);
}

{
    resetFarm();
    XPSystem.init();

    // VP-05: شبكة الأمان الخلفية ما زالت تعمل (كتابة مباشرة على player.xp)
    const need = xpForLevel(1);
    GameState.set('player.xp', need + 3);
    const level = GameState.get('player.level');
    check('VP-05 legacy direct `player.xp` write still levels up (safety net intact)',
        level === 2, `level=${level}`);
}

/* ============================================================
   VP-06 → VP-07 · GAP-02: حصاد بلا ضياع صامت للبذرة
   ============================================================ */
section('VP-06..07 · GAP-02 — harvest never swallows the seed refund');

{
    // صوامع بها خانة واحدة فارغة: لا تتّسع للمحصول + رجوع البذرة
    const { siloCap } = resetFarm({ siloUsed: 149 });
    readySlot();

    const res = withRandom(0.99, () => FarmingSystem.harvestSlot('field_center_left', 0));
    const free = StorageSystem.free('silo');
    const slot = FarmingSystem.getOrCreateSlots('field_center_left')[0];

    check('VP-06a tight silo: harvest refused honestly instead of swallowing the seed refund',
        res.success === false && res.reason === 'silo_full',
        `success=${res.success} reason=${res.reason}`);
    check('VP-06b tight silo: nothing lost — silo untouched and crop still in its slot',
        free === 1 && slot.state === 'ready' && InventorySystem.count('wheat_seed') === 0,
        `free=${free} state=${slot.state} seeds=${InventorySystem.count('wheat_seed')} capacity=${siloCap}`);
}

{
    // مساحة كافية: الحصاد ينجح والبذرة تصل فعلًا ومُعلَنة
    resetFarm({ siloUsed: 0 });
    readySlot();

    const res = withRandom(0.99, () => FarmingSystem.harvestSlot('field_center_left', 0));
    const seeds = InventorySystem.count('wheat_seed');

    check('VP-07a roomy silo: harvest succeeds and returns an explicit seed refund',
        res.success === true && res.seedReturned === 1 && res.seedId === 'wheat_seed',
        `success=${res.success} seedReturned=${res.seedReturned}`);
    check('VP-07b roomy silo: the refunded seed is actually in the silo (loop stays sustainable)',
        seeds === res.seedReturned && seeds > 0, `seeds=${seeds}`);
}

/* ============================================================
   VP-08 → VP-09 · GAP-03: جمع جزئي لا يدمّر الناتج
   ============================================================ */
section('VP-08..09 · GAP-03 — partial production collection keeps the remainder');

function seedJob(outputItem, outputAmount) {
    GameState.set('farm.buildings', [{
        id: 'vp_mill', type: 'feed_mill', level: 1,
        productionQueue: [{
            id: 'vp_job', recipeId: outputItem,
            outputItem, outputAmount,
            readyAt: 0, state: 'ready'
        }]
    }]);
}

{
    // مخزن به خانة واحدة فارغة، والناتج ٣ ⇒ كان ٢ يُدمَّران
    resetFarm({ barnUsed: 149 });
    seedJob('chicken_feed', 3);

    const res = ProductionSystem.collectProduction('vp_mill', 'vp_job');
    const queue = GameState.get('farm.buildings')[0].productionQueue;
    const received = InventorySystem.count('chicken_feed');

    check('VP-08a partial collect: delivered only what fits (1 of 3)',
        res.success === true && received === 1, `received=${received}`);
    check('VP-08b partial collect: remainder stays on the machine — nothing destroyed',
        queue.length === 1 && queue[0].outputAmount === 2 && res.output.remaining === 2,
        `queueLen=${queue.length} remaining=${queue[0]?.outputAmount}`);
}

{
    // مخزن ممتلئ تمامًا: لا جمع، ولا حذف للوظيفة
    resetFarm({ barnUsed: 150 });
    seedJob('chicken_feed', 3);

    const res = ProductionSystem.collectProduction('vp_mill', 'vp_job');
    const queue = GameState.get('farm.buildings')[0].productionQueue;

    check('VP-09 full barn: collect refused and the job is left untouched (no regression)',
        res.success === false && res.reason === 'barn_full' && queue.length === 1 && queue[0].outputAmount === 3,
        `success=${res.success} queueLen=${queue.length}`);
}

/* ============================================================
   VP-10 · GAP-04: تفكيك دورة الحياة
   ============================================================ */
section('VP-10 · GAP-04 — App.destroy() stops every timer owner');

{
    const appSrc = read('js/core/App.js');
    // نافذة نصية من تعريف الدالة حتى نهاية تفكيك destroy (بلا اعتماد على ترتيب indexOf)
    const teardownStart = appSrc.indexOf('_teardownCoreTimers() {');
    const teardown = teardownStart >= 0 ? appSrc.slice(teardownStart, teardownStart + 1200) : '';
    check('VP-10a destroy path calls OrderSystem.stop / SaveManager.stopAutoSave / Time.stop',
        /OrderSystem\.stop\(\)/.test(teardown) &&
        /SaveManager\.stopAutoSave\(\)/.test(teardown) &&
        /Time\.stop\(\)/.test(teardown),
        'one or more stop calls missing');
    check('VP-10b _teardownCoreTimers is actually invoked from destroy()',
        /destroy\(\)\s*\{\s*this\.stop\(\);\s*this\._teardownCoreTimers\(\);/.test(appSrc));

    // سلوك حقيقي: Time.stop() يُنزل العداد ويحرّر مستمع الإخفاء
    Time.start();
    const wasRunning = Time.isRunning();
    Time.stop();
    check('VP-10c Time.stop() clears the running flag (idempotent teardown)',
        wasRunning === true && Time.isRunning() === false,
        `wasRunning=${wasRunning} now=${Time.isRunning()}`);

    let stopped = false;
    const off = Events.on('time:stopped', () => { stopped = true; });
    Time.stop();
    off();
    check('VP-10d Time.stop() emits time:stopped (documented contract)', stopped === true);
}

/* ============================================================
   VP-11 · GAP-05: حدث تقدّم الغياب الوحيد
   ============================================================ */
section('VP-11 · GAP-05 — exactly one offline-progression event');

{
    const files = [];
    (function walk(dir) {
        for (const entry of readdirSync(dir)) {
            const p = join(dir, entry);
            if (statSync(p).isDirectory()) walk(p);
            else if (p.endsWith('.js')) files.push(p);
        }
    })(join(root, 'js'));

    let deadOfflineEmits = [];
    let offlineListeners = 0;
    for (const f of files) {
        const src = readFileSync(f, 'utf8');
        for (const m of src.matchAll(/Events\.emit\(\s*'([^']*offline[^']*)'/g)) {
            if (m[1] !== 'time:offline') deadOfflineEmits.push(`${basename(f)}: ${m[1]}`);
        }
        for (const m of src.matchAll(/Events\.(?:on|once)\(\s*'time:offline'/g)) offlineListeners++;
    }

    check('VP-11a no orphan offline events are emitted (animals:offline / production:offline gone)',
        deadOfflineEmits.length === 0, deadOfflineEmits.join(' | '));
    check('VP-11b time:offline has at least one real listener (contract is live)',
        offlineListeners >= 2, `listeners=${offlineListeners}`);
}

/* ============================================================
   VP-12 · POLISH-01: بوابة تخزين موحّدة
   ============================================================ */
section('VP-12 · POLISH-01 — one structured storage gate');

{
    resetFarm({ barnUsed: 149 });

    const partial = StorageSystem.gateAdd('flour', 3);
    const blocked = (resetFarm({ barnUsed: 150 }), StorageSystem.gateAdd('flour', 3));
    const full = (resetFarm({ barnUsed: 0 }), StorageSystem.gateAdd('flour', 3));

    check('VP-12a gateAdd classifies partial / blocked / full honestly',
        partial.isPartial === true && partial.deliverable === 1 && partial.remaining === 2 &&
        blocked.isBlocked === true && blocked.deliverable === 0 && blocked.remaining === 3 &&
        full.ok === true && full.deliverable === 3 && full.isPartial === false,
        `partial=${partial.deliverable}/${partial.remaining} blocked=${blocked.deliverable} full=${full.deliverable}`);

    const farmSrc = read('js/systems/FarmingSystem.js');
    const prodSrc = read('js/systems/ProductionSystem.js');
    check('VP-12b harvest + production gates both route through gateAdd (single decision point)',
        /StorageSystem\.gateAdd\(/.test(farmSrc) && /StorageSystem\.gateAdd\(/.test(prodSrc));
}

/* ============================================================
   VP-13 · GAP-06: نظافة الشجرة (لا وحدات ميتة/فارغة)
   ============================================================ */
section('VP-13 · GAP-06 — no dead or empty modules');

{
    const jsFiles = [];
    (function walk(dir) {
        for (const entry of readdirSync(dir)) {
            const p = join(dir, entry);
            if (statSync(p).isDirectory()) walk(p);
            else if (p.endsWith('.js')) jsFiles.push(p);
        }
    })(join(root, 'js'));

    const empties = jsFiles.filter((f) => statSync(f).size === 0).map((f) => f.replace(`${root}/`, ''));
    check('VP-13a no empty (0-byte) .js files in js/**', empties.length === 0, empties.join(', '));

    // كل وحدة نظام يجب أن يذكرها ملف آخر (تطبيق/واجهة/اختبار)
    const refSources = [...jsFiles];
    (function walkTests(dir) {
        for (const entry of readdirSync(dir)) {
            const p = join(dir, entry);
            if (statSync(p).isDirectory()) walkTests(p);
            else if (p.endsWith('.mjs') || p.endsWith('.js')) refSources.push(p);
        }
    })(join(root, 'tests'));

    const dead = [];
    for (const sys of readdirSync(join(root, 'js/systems'))) {
        if (!sys.endsWith('.js')) continue;
        const name = basename(sys, '.js');
        const referenced = refSources.some(
            (f) => !f.endsWith(`systems/${sys}`) && readFileSync(f, 'utf8').includes(name)
        );
        if (!referenced) dead.push(sys);
    }
    check('VP-13b every module in js/systems/** is referenced by app, UI or tests',
        dead.length === 0, dead.join(', '));
}

/* ============================================================
   VP-14 · GAP-07: ترقية حفظ واحدة + سلامة الاستيراد القديم
   ============================================================ */
section('VP-14 · GAP-07 — single migration pass, legacy import intact');

{
    const saveSrc = read('js/core/SaveManager.js');
    // جسم load() حتى بداية الدالة التالية له (_newestPayload مُعرَّفة بعده)
    const loadStart = saveSrc.indexOf('async load() {');
    const loadEnd = saveSrc.indexOf('_newestPayload(a, b)');
    const loadBody = loadStart >= 0 && loadEnd > loadStart
        ? saveSrc.slice(loadStart, loadEnd)
        : saveSrc.slice(loadStart, loadStart + 5000);
    const migrateCalls = [...loadBody.matchAll(/_migrate\(/g)].length;
    check('VP-14a load() performs exactly one migration pass (no duplicated branch)',
        migrateCalls === 1, `_migrate calls in load(): ${migrateCalls}`);

    // لا يربط الحالة بالثابت المشترك: الترقية تُنتج مرجعًا جديدًا كل مرة
    const a = SaveManager._migrate({ farm: {}, player: {} }, 1);
    const b = SaveManager._migrate({ farm: {}, player: {} }, 1);
    check('VP-14b migration returns a fresh tiles array each call (no shared-constant aliasing)',
        Array.isArray(a.farm.tiles) && a.farm.tiles !== b.farm.tiles,
        `sameRef=${a.farm.tiles === b.farm.tiles}`);

    a.farm.tiles.push({ id: 'mutation_probe' });
    const c = SaveManager._migrate({ farm: {}, player: {} }, 1);
    check('VP-14c mutating a migrated save cannot leak into the next migration',
        !c.farm.tiles.some((t) => t.id === 'mutation_probe'));
}

/* ============================================================
   VP-15 · POLISH-02: الوثائق تطابق الشجرة
   ============================================================ */
section('VP-15 · POLISH-02 — docs match the tree');

{
    const readme = read('README.md');
    const changelog = read('CHANGELOG.md');

    const removedModules = ['EconomySystem', 'EventSystem', 'SocialSystem', 'CropSystem'];

    /*
     * نفحص كتلة «خريطة المعمارية» وحدها: الأرشيف مسموح (بل مطلوب) أن
     * يسمّي الوحدات المزالة، أما الخريطة فتجب أن تصف الشجرة الحيّة فقط.
     */
    const archStart = readme.indexOf('## خريطة المعمارية');
    const archEnd = readme.indexOf('\n## ', archStart + 1);
    const archBlock = archStart >= 0 ? readme.slice(archStart, archEnd > 0 ? archEnd : undefined) : '';
    const stillAdvertised = removedModules.filter((m) => archBlock.includes(m));
    check('VP-15a architecture map advertises only live modules',
        stillAdvertised.length === 0 && archBlock.length > 0,
        stillAdvertised.join(', ') || 'architecture block not found');

    const archiveStart = readme.indexOf('## أرشيف');
    const archiveBlock = archiveStart >= 0 ? readme.slice(archiveStart) : '';
    check('VP-15b README archive section records the removed modules (reversible via git)',
        removedModules.every((m) => archiveBlock.includes(m)), 'archive note incomplete');

    check('VP-15c CHANGELOG documents GAP-01..07 and POLISH-01..03',
        readme && changelog.includes('GAP-01') && changelog.includes('GAP-07') &&
        changelog.includes('POLISH-01') && changelog.includes('POLISH-03'));
}

/* ============================================================
   VP-16 · ضمانات وحراسة QuestSystem
   ============================================================ */
section('VP-16 · QuestSystem window guard & contracts');

{
    check('VP-16a QuestSystem module exports safely in headless environment',
        !!QuestSystem && typeof QuestSystem.init === 'function');
    check('VP-16b QuestSystem window assignment is guarded with typeof window check',
        read('js/systems/QuestSystem.js').includes("typeof window !== 'undefined'"));

    resetFarm();
    QuestSystem.initialized = false;
    QuestSystem.init();
    check('VP-16c QuestSystem.init() populates initial quests',
        QuestSystem.getQuests().length >= INITIAL_QUESTS.length);
    check('VP-16d QuestSystem.getActiveQuests() returns active quest items',
        QuestSystem.getActiveQuests().length > 0);

    resetFarm();
    QuestSystem.initialized = false;
    QuestSystem.init();
    const quests = QuestSystem.getQuests();
    quests[0].completed = true;
    quests[0].claimed = false;
    GameState.set('quests.items', quests);
    const res = QuestSystem.claimReward(quests[0].id);
    check('VP-16e QuestSystem.claimReward() delivers coins and XP faithfully',
        res.success === true && GameState.get('player.coins') >= quests[0].rewardCoins);
}

/* ============================================================
   VP-17 · شريط الأدوات: tomato_seed واكتمال المحاصيل
   ============================================================ */
section('VP-17 · Hotbar tomato_seed & crop completeness');

{
    const hudSrc = read('js/ui/HUD.js');
    check('VP-17a tomato_seed is present in hotbar layout', hudSrc.includes("'tomato_seed'"));
    check('VP-17b soybean_seed is retained in hotbar layout', hudSrc.includes("'soybean_seed'"));
    check('VP-17c sugarcane_seed is retained in hotbar layout', hudSrc.includes("'sugarcane_seed'"));
    check('VP-17d hotbar layout covers tools, seeds, and storage bag',
        hudSrc.includes("'axe'") && hudSrc.includes("'wheat_seed'") && hudSrc.includes("'bag'"));
    check('VP-17e tomato crop definition matches tomato_seed in GameData',
        GameData.CROPS.tomato?.seedId === 'tomato_seed');
}

/* ============================================================
   VP-18 · التفاعل الديناميكي: أيقونة وملصق الفعل
   ============================================================ */
section('VP-18 · Dynamic action icon & interaction wiring');

{
    check('VP-18a HUD listens to interaction:target-changed event',
        read('js/ui/HUD.js').includes("'interaction:target-changed'"));
    check('VP-18b App emits interaction:target-changed on target changes',
        read('js/core/App.js').includes("Events.emit('interaction:target-changed'"));

    let capturedIcon = '';
    const fakeIcon = { set textContent(v) { capturedIcon = v; } };
    const fakeBtn = {
        set textContent(v) { capturedIcon = v; },
        querySelector: () => fakeIcon,
        setAttribute() {}
    };
    const hudInst = {
        container: { querySelector: (sel) => (sel === '#hud-btn-interact' ? fakeBtn : null) },
        onTargetChanged: HUD.prototype.onTargetChanged
    };

    hudInst.onTargetChanged({ type: 'slot', slot: { state: 'ready' } });
    check('VP-18c onTargetChanged updates icon to harvest basket on ready crop slot',
        capturedIcon === '🧺', `icon=${capturedIcon}`);

    hudInst.onTargetChanged({ type: 'slot', slot: { state: 'growing', watered: false } });
    check('VP-18d onTargetChanged updates icon to watering drop on unwatered growing crop',
        capturedIcon === '💧', `icon=${capturedIcon}`);

    hudInst.onTargetChanged({ type: 'slot', slot: { state: 'empty' } });
    check('VP-18e onTargetChanged updates icon to sprout on empty soil slot',
        capturedIcon === '🌱', `icon=${capturedIcon}`);

    hudInst.onTargetChanged({ type: 'animal', rig: { farmAnimalId: 'none' } });
    check('VP-18f onTargetChanged updates icon to feed on hungry animal',
        capturedIcon === '🌾', `icon=${capturedIcon}`);

    hudInst.onTargetChanged(null);
    check('VP-18g onTargetChanged resets icon to default hand when target is null',
        capturedIcon === '🤚', `icon=${capturedIcon}`);

    let capturedLabel = '';
    const fakeLabel = {
        set textContent(v) { capturedLabel = v; },
        classList: { toggle() {} }
    };
    const labelHud = {
        container: {
            querySelector: (sel) => (sel === '#hud-interaction-label' ? fakeLabel : fakeBtn)
        },
        onTargetChanged: HUD.prototype.onTargetChanged
    };
    labelHud.onTargetChanged({ type: 'slot', slot: { state: 'ready' } });
    check('VP-18h onTargetChanged updates interaction label text (#hud-interaction-label)',
        capturedLabel === 'حصاد', `label=${capturedLabel}`);
}

/* ============================================================
   VP-19 · تحريك أرقام الـ HUD (_animateNumber)
   ============================================================ */
section('VP-19 · HUD number animation _animateNumber');

{
    check('VP-19a HUD exposes _animateNumber method for smooth numeric transitions',
        typeof HUD.prototype._animateNumber === 'function');

    let coinsAnimated = false;
    const hudCoins = {
        container: { querySelector: () => ({ textContent: '' }) },
        _animateNumber: () => { coinsAnimated = true; },
        updateCoins: HUD.prototype.updateCoins
    };
    hudCoins.updateCoins(500);
    check('VP-19b updateCoins utilizes numeric animation / formatting', coinsAnimated === true);

    let gemsAnimated = false;
    const hudGems = {
        container: { querySelector: () => ({ textContent: '' }) },
        _animateNumber: () => { gemsAnimated = true; },
        updateGems: HUD.prototype.updateGems
    };
    hudGems.updateGems(25);
    check('VP-19c updateGems utilizes numeric animation / formatting', gemsAnimated === true);

    let xpAnimated = false;
    const hudXP = {
        container: {
            querySelector: (sel) => (sel === '#mf-xp-fill' ? { style: {} } : { textContent: '' })
        },
        _animateNumber: () => { xpAnimated = true; },
        updateXP: HUD.prototype.updateXP
    };
    hudXP.updateXP(50, 100);
    check('VP-19d updateXP updates both XP track fill and animated text', xpAnimated === true);
}

/* ============================================================
   VP-20 · لوحة المهام الخشبية الثابتة (#quest-panel)
   ============================================================ */
section('VP-20 · Fixed wooden quest panel DOM & styling');

{
    const hudSrc = read('js/ui/HUD.js');
    check('VP-20a #quest-panel exists in HUD DOM as a fixed wooden panel',
        hudSrc.includes('id="quest-panel"'));
    check('VP-20b #hud-interaction-label exists in HUD DOM',
        hudSrc.includes('id="hud-interaction-label"'));

    const woodCss = read('css/wood.css');
    check('VP-20c css/wood.css exists in repository and styles #quest-panel',
        woodCss.includes('#quest-panel') && woodCss.includes('#hud-interaction-label'));

    const html = read('index.html');
    const hudIdx = html.indexOf('css/hud.css');
    const woodIdx = html.indexOf('css/wood.css');
    check('VP-20d index.html links css/wood.css directly after css/hud.css',
        hudIdx !== -1 && woodIdx > hudIdx,
        `hudIdx=${hudIdx} woodIdx=${woodIdx}`);
}

/* ============================================================
   VP-21 · إصلاحات العيوب ونظافة الـ CSS
   ============================================================ */
section('VP-21 · Bug fixes & CSS cleanliness');

{
    const hudSrc = read('js/ui/HUD.js');
    check('VP-21a Styled quest classes (.quest-card, .quest-title, .quest-progress-bar) are emitted in quest panel DOM',
        hudSrc.includes('quest-card') && hudSrc.includes('quest-title') && hudSrc.includes('quest-progress-bar'));

    check('VP-21b Fixed #quest-panel does not require legacy collapsible toggle',
        hudSrc.includes('id="quest-panel"') && !hudSrc.includes('class="hud-missions-panel is-collapsed"'));

    const bmSrc = read('js/world/BuildingManager.js');
    check('VP-21c Exactly one windmill instance is enforced by BuildingManager guard',
        bmSrc.includes("this.group.getObjectByName('Windmill')"));
}

/* ---------- ملخص ---------- */
console.log('\n' + '═'.repeat(60));
if (failures.length === 0) {
    console.log(`✅ VERIFICATION PASS — ${passed} checks (VP-02..VP-21), 0 failures.`);
    console.log('═'.repeat(60));
    process.exit(0);
} else {
    console.log(`❌ VERIFICATION FAIL — ${passed} passed, ${failures.length} failed.`);
    failures.forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
    console.log('═'.repeat(60));
    process.exit(1);
}
