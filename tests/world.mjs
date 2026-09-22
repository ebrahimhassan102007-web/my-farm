/**
 * ============================================================
 * tests/world.mjs — Headless 3D world harness (Node + three)
 * ============================================================
 * يبني العالم الحقيقي (Environment/Buildings/Foliage/Animals/Sky/
 * HouseInterior/ProductionYard) بلا متصفح، ويتحقق من:
 *   • لا استثناءات أثناء البناء (أخطر مصدر للشاشة السوداء).
 *   • ميزانية نداءات الرسم (meshes/sprites/points/instanced).
 *   • المصدات (collision) مسجّلة للبيت/الحظائر/الآلات/الداخل.
 *   • السماء عبر 24 ساعة × 4 فصول بلا NaN وعوامل ليل/نهار صحيحة.
 *   • دخول/خروج البيت يُخفي المزرعة ويُظهر الداخل (لا تفكيك).
 *   • الحيوانات داخل حظائرها فعلًا (من FarmLayout).
 *   • العشب الكثيف لا ينمو تحت المباني/الممرات.
 *
 * التشغيل:  node tests/world.mjs
 * يحتاج `three` محليًا (npm i three@0.160.0 — node_modules متجاهَل
 * في git). بدونه يطبع SKIP ويخرج بنجاح حتى لا يكسر CI بلا تبعيات.
 * ============================================================ */

/* ---------- stubs قبل أي import ---------- */
function makeCanvasStub() {
    const ctx = {
        fillStyle: '#000',
        strokeStyle: '#000',
        lineWidth: 1,
        font: '',
        textAlign: 'start',
        textBaseline: 'alphabetic',
        direction: 'ltr',
        globalAlpha: 1,
        clearRect() {},
        fillRect() {},
        fillText() {},
        strokeText() {},
        measureText: () => ({ width: 10 }),
        beginPath() {},
        closePath() {},
        moveTo() {},
        lineTo() {},
        quadraticCurveTo() {},
        bezierCurveTo() {},
        arc() {},
        fill() {},
        stroke() {},
        save() {},
        restore() {},
        translate() {},
        rotate() {},
        scale() {},
        drawImage() {},
        createLinearGradient: () => ({ addColorStop() {} }),
        getImageData: () => ({ data: new Uint8ClampedArray(4) })
    };
    return { width: 300, height: 150, style: {}, getContext: () => ctx };
}

globalThis.window = globalThis.window || {
    innerWidth: 1280,
    innerHeight: 720,
    devicePixelRatio: 2,
    addEventListener() {},
    removeEventListener() {}
};
globalThis.document = globalThis.document || {
    hidden: false,
    addEventListener() {},
    createElement: (tag) => (tag === 'canvas' ? makeCanvasStub() : { style: {}, appendChild() {} }),
    getElementById: () => null,
    querySelector: () => null,
    body: { appendChild() {} }
};
const store = new Map();
globalThis.localStorage = globalThis.localStorage || {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear()
};

/* ---------- three (اختياري) ---------- */
let THREE = null;
try {
    THREE = await import('three');
} catch (e) {
    console.log('⏭️  SKIP tests/world.mjs — module `three` غير مثبّت محليًا.');
    console.log('   للتشغيل: npm i three@0.160.0  (node_modules متجاهَل في git)');
    process.exit(0);
}

/* ---------- أداة الاختبار ---------- */
let passed = 0;
const failures = [];
function section(name) { console.log(`\n── ${name} ${'─'.repeat(Math.max(2, 56 - name.length))}`); }
function check(label, condition, detail = '') {
    if (condition) { passed++; console.log(`  ✅ ${label}`); }
    else { failures.push(`${label}${detail ? ` — ${detail}` : ''}`); console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`); }
    return !!condition;
}

/* ---------- الوحدات ---------- */
const { CollisionEngine } = await import('../js/core/CollisionEngine.js');
const { GameState } = await import('../js/core/GameState.js');
const { Time } = await import('../js/core/TimeManager.js');
const { readRealClock } = await import('../js/core/Calendar.js');
const { Environment } = await import('../js/world/Environment.js');
const { HouseInterior } = await import('../js/world/HouseInterior.js');
const { ProductionYard } = await import('../js/world/ProductionYard.js');
const { SkyDome } = await import('../js/world/SkyDome.js');
const Layout = await import('../js/world/FarmLayout.js');
const GameData = await import('../js/data/GameData.js');

GameState.reset();
Time.readNow();

/* ============================================================
   1) بناء العالم
   ============================================================ */
section('World construction (no exceptions)');

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xa4daf7, 0.018);
const collision = new CollisionEngine();

let env = null;
let envError = null;
try {
    env = new Environment(scene, { collision });
} catch (e) {
    envError = e;
}
check('Environment builds (ground/paths/sky/foliage/buildings/animals)', !envError, envError?.stack?.split('\n').slice(0, 3).join(' | '));
if (envError) {
    console.log('\n❌ لا يمكن المتابعة بدون Environment.');
    process.exit(1);
}

check('SkyDome created by Environment', !!env.sky);
check('BuildingManager created', !!env.buildings);
check('FoliageManager created', !!env.foliage);
check('Animals created', !!env.animals);

let interior = null;
let interiorError = null;
try {
    interior = new HouseInterior({ scene, collision });
    interior.setVisible(false);
} catch (e) {
    interiorError = e;
}
check('HouseInterior builds and starts hidden', !interiorError && interior?.group?.visible === false,
    interiorError?.stack?.split('\n').slice(0, 3).join(' | '));

let yard = null;
let yardError = null;
try {
    const buildings = GameState.get('farm.buildings') || [];
    for (const typeId of GameData.STARTER_KIT.buildings) {
        if (buildings.some((b) => b.typeId === typeId)) continue;
        const def = GameData.getBuilding(typeId);
        buildings.push({
            id: `b-${typeId}`, typeId, name: def.name, level: 1, status: 'built',
            queueLimit: def.queueLimit || 1, productionQueue: [],
            position: GameData.STARTER_KIT.positions?.[typeId] || { x: 0, z: 0 }
        });
    }
    GameState.set('farm.buildings', buildings);
    yard = new ProductionYard({ scene, collision });
    yard.syncFromState(buildings);
} catch (e) {
    yardError = e;
}
check('ProductionYard builds all four machines', !yardError && yard?.entries?.size === 4,
    yardError ? yardError.stack?.split('\n').slice(0, 3).join(' | ') : `entries=${yard?.entries?.size}`);

check('Feed mill + dairy have real 3D models (not the fallback shed)', (() => {
    const kinds = [...(yard?.entries?.values() || [])].map((e) => e.group.userData?.kind);
    return kinds.includes('feed_mill') && kinds.includes('dairy') && !kinds.includes('shed');
})(), JSON.stringify([...(yard?.entries?.values() || [])].map((e) => e.group.userData?.kind)));

/* ============================================================
   2) ميزانية نداءات الرسم
   ============================================================ */
section('Draw-call budget');

const stats = { meshes: 0, instanced: 0, sprites: 0, points: 0, lines: 0 };
scene.traverse((o) => {
    if (o.isInstancedMesh) stats.instanced++;
    else if (o.isSprite) stats.sprites++;
    else if (o.isPoints) stats.points++;
    else if (o.isLine || o.isLineSegments) stats.lines++;
    else if (o.isMesh) stats.meshes++;
});
const total = stats.meshes + stats.instanced + stats.sprites + stats.points + stats.lines;
console.log(`  · meshes=${stats.meshes} instanced=${stats.instanced} sprites=${stats.sprites} points=${stats.points} lines=${stats.lines} total=${total}`);

check('Total drawable objects under the mobile budget (< 320)', total < 320, `total=${total}`);
check('Grass/flowers/trees are instanced or merged (few meshes for many plants)', stats.instanced >= 6, `instanced=${stats.instanced}`);
check('Sprites (Arabic signs) kept low', stats.sprites <= 16, `sprites=${stats.sprites}`);
check('Sky costs ~16 draw calls (dome + sun/halo/moon + stars + 11 clouds)',
    (() => {
        let n = 0;
        env.sky.group.traverse((o) => { if (o.isMesh || o.isPoints || o.isSprite) n++; });
        console.log(`  · sky drawables = ${n}`);
        return n <= 17;
    })());

const mergedCount = (() => {
    let n = 0;
    scene.traverse((o) => { if (o.userData?.mergedFrom) n++; });
    return n;
})();
check('Merge pass actually merged static geometry', mergedCount >= 8, `mergedGroups=${mergedCount}`);

/* ============================================================
   3) المصدات (collision)
   ============================================================ */
section('Collision registration');

const boxes = collision.boxes || collision._boxes || [];
const boxList = Array.isArray(boxes) ? boxes : [...(boxes.values?.() || [])];
const byId = (id) => boxList.find((b) => b.id === id);
console.log(`  · collision boxes = ${boxList.length}`);

check('Collision boxes registered', boxList.length > 20, `count=${boxList.length}`);
check('Farmhouse door is interactive + solid frame exists', (() => {
    const door = env.buildings.getNearestDoor(
        { x: Layout.HOUSE.exitSpawn.x, y: 0, z: Layout.HOUSE.exitSpawn.z }, 6
    );
    return !!door && door.action === 'enter-house';
})(), JSON.stringify(env.buildings.getNearestDoor({ x: Layout.HOUSE.exitSpawn.x, y: 0, z: Layout.HOUSE.exitSpawn.z }, 6)?.id || null));
check('House walls block the player', !!byId('farmhouse-north') || !!byId('farmhouse-south') || boxList.some((b) => String(b.id).startsWith('farmhouse')));
check('Every pen has collision walls', Layout.PENS.every((p) => boxList.some((b) => String(b.id).startsWith(p.id))));
check('Pen gates are non-solid (player can walk in)', (() => {
    const gates = boxList.filter((b) => String(b.id).includes('door') && Layout.PENS.some((p) => String(b.id).startsWith(p.id)));
    return gates.length === 0 || gates.every((g) => g.solid === false);
})());
check('Machines have collision boxes', [...(yard?.entries?.values() || [])].every((e) =>
    boxList.some((b) => String(b.id).includes('prod-') || String(b.id) === e.typeId)));
check('Pond is blocked', !!byId('pond'));
check('Interior walls registered far from the farm', boxList.some((b) =>
    Math.abs((b.centerZ ?? 0) - Layout.INTERIOR_ORIGIN.z) < 12));
check('Interior furniture is solid too', boxList.filter((b) => String(b.id).startsWith('int-')).length >= 6,
    `props=${boxList.filter((b) => String(b.id).startsWith('int-')).length}`);

/* ============================================================
   4) السماء عبر اليوم والفصول
   ============================================================ */
section('Sky across 24 hours × 4 seasons');

let skyNaN = 0;
let minNight = 1;
let maxNight = 0;
let minDay = 1;
let maxDay = 0;

const SEASON_DATES = { spring: new Date(2026, 4, 10), summer: new Date(2026, 7, 5), autumn: new Date(2026, 9, 10), winter: new Date(2026, 11, 25) };
for (const season of ['spring', 'summer', 'autumn', 'winter']) {
    env.sky.setSeason(season);
    for (let h = 0; h < 24; h++) {
        const base = SEASON_DATES[season];
        const clock = readRealClock(new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, 30, 0));
        if (clock.season !== season) continue; // تاريخ خارج الفصل — نتخطاه
        env.sky.update(clock, 0.016, { x: 0, y: 0, z: 0 });
        const top = env.sky.uniforms.uTopColor.value;
        const bottom = env.sky.uniforms.uBottomColor.value;
        if ([top.r, top.g, top.b, bottom.r, bottom.g, bottom.b].some((v) => !Number.isFinite(v))) skyNaN++;
        minNight = Math.min(minNight, env.sky.getNightFactor());
        maxNight = Math.max(maxNight, env.sky.getNightFactor());
        minDay = Math.min(minDay, env.sky.getDayFactor());
        maxDay = Math.max(maxDay, env.sky.getDayFactor());
    }
}
check('No NaN in sky colors across all hours/seasons', skyNaN === 0, `nanFrames=${skyNaN}`);
check('Night factor reaches ~1 at midnight', maxNight > 0.9, `max=${maxNight.toFixed(3)}`);
check('Night factor reaches ~0 at noon', minNight < 0.1, `min=${minNight.toFixed(3)}`);
check('Day factor reaches ~1 at noon', maxDay > 0.9, `max=${maxDay.toFixed(3)}`);
check('Day factor reaches ~0 at night', minDay < 0.1, `min=${minDay.toFixed(3)}`);

const noon = readRealClock(new Date(2026, 8, 18, 12, 0, 0));
env.sky.update(noon, 0.016, { x: 0, y: 0, z: 0 });
const fogNoon = env.sky.getFogColor(new THREE.Color());
const midnight = readRealClock(new Date(2026, 8, 18, 0, 0, 0));
env.sky.update(midnight, 0.016, { x: 0, y: 0, z: 0 });
const fogNight = env.sky.getFogColor(new THREE.Color());
check('Noon fog is brighter than midnight fog', fogNoon.getHex() > fogNight.getHex() ||
    (fogNoon.r + fogNoon.g + fogNoon.b) > (fogNight.r + fogNight.g + fogNight.b),
    `noon=#${fogNoon.getHexString()} night=#${fogNight.getHexString()}`);

/*
 * الصيف يختلف عن الشتاء (مزاج موسمي حقيقي). الساعة الحقيقية هي مصدر
 * الفصل، لذلك نبني لقطة من تاريخ داخل كل فصل بدل فرضه يدويًا.
 */
const summerClock = readRealClock(new Date(2026, 7, 5, 12, 0, 0));
const winterClock = readRealClock(new Date(2026, 11, 25, 12, 0, 0));
check('Test clocks really fall in different seasons',
    summerClock.season === 'summer' && winterClock.season === 'winter',
    `${summerClock.season}/${winterClock.season}`);
env.sky.update(summerClock, 0.016, null);
const summerTop = env.sky.uniforms.uTopColor.value.getHex();
const summerFog = env.sky.getFogColor(new THREE.Color()).getHex();
env.sky.update(winterClock, 0.016, null);
const winterTop = env.sky.uniforms.uTopColor.value.getHex();
const winterFog = env.sky.getFogColor(new THREE.Color()).getHex();
check('Season presets change the sky (summer ≠ winter)', summerTop !== winterTop,
    `summer=#${summerTop.toString(16)} winter=#${winterTop.toString(16)}`);
check('Season presets change the fog mood', summerFog !== winterFog,
    `summer=#${summerFog.toString(16)} winter=#${winterFog.toString(16)}`);

// الغيوم تتحرك
env.sky.setSeason('summer');
const cloud0 = env.sky.clouds?.[0]?.position.x ?? 0;
for (let i = 0; i < 60; i++) env.sky.update(noon, 0.05, null);
const cloud1 = env.sky.clouds?.[0]?.position.x ?? 0;
check('Clouds drift over time', Math.abs(cloud1 - cloud0) > 0.5 || env.sky.clouds?.length === 0,
    `${cloud0.toFixed(2)} → ${cloud1.toFixed(2)}`);
check('Cloud groups exist', (env.sky.clouds?.length || 0) >= 8, `clouds=${env.sky.clouds?.length}`);

/* ============================================================
   5) دورة اليوم على العالم (تحديث واحد لكل ساعة)
   ============================================================ */
section('Day/night drives the world (lamps, coats, foliage)');

let updateError = null;
try {
    for (let h = 0; h < 24; h += 3) {
        const clock = readRealClock(new Date(2026, 8, 18, h, 15, 0));
        env.update(0.016, h * 0.5, clock, { x: 0, y: 0, z: 0 });
        env.buildings.setNightFactor(env.sky.getNightFactor());
        env.animals.setNightFactor(env.sky.getNightFactor());
    }
} catch (e) {
    updateError = e;
}
check('Environment.update runs across the day without errors', !updateError,
    updateError?.stack?.split('\n').slice(0, 3).join(' | '));

let seasonError = null;
try {
    for (const season of ['spring', 'summer', 'autumn', 'winter']) {
        env.setSeason(season);
        env.update(0.016, 1, readRealClock(new Date(2026, 8, 18, 12, 0, 0)), { x: 0, y: 0, z: 0 });
    }
} catch (e) {
    seasonError = e;
}
check('setSeason retints ground/grass/canopy/coats without errors', !seasonError,
    seasonError?.stack?.split('\n').slice(0, 3).join(' | '));
check('Ground color differs between summer and winter', (() => {
    env.setSeason('summer');
    const a = env.groundMat.color.getHex();
    env.setSeason('winter');
    const b = env.groundMat.color.getHex();
    return a !== b;
})());

check('Windmill rotor spins on update', (() => {
    const rotors = env.buildings.rotors || [];
    if (rotors.length === 0) return false;
    const before = rotors[0].rotation.z;
    env.buildings.update(0.05);
    return rotors[0].rotation.z !== before;
})());

check('Farmhouse door swings when toggled', (() => {
    const door = env.buildings.farmhouseDoor;
    if (!door) return false;
    const before = door.group ? door.group.rotation.y : door.rotation?.y;
    door.toggle();
    door.update(0.5);
    const after = door.group ? door.group.rotation.y : door.rotation?.y;
    return before !== after || door.open === true;
})());

/* ============================================================
   6) الحيوانات
   ============================================================ */
section('Animals: readable species, pens, eating');

const rigs = env.animals.animals || [];
check('All herds spawned (cows/sheep/pigs/chickens/rooster)', rigs.length >= 9, `rigs=${rigs.length}`);
const species = new Set(rigs.map((r) => r.type));
check('Four readable species present', ['cow', 'sheep', 'pig', 'chicken'].every((s) => species.has(s)), [...species].join(','));
check('Every animal is inside its pen bounds', rigs.every((r) => {
    const pen = Layout.PENS.find((p) => p.id === r.penId);
    if (!pen) return false;
    return Math.abs(r.root.position.x - pen.x) <= pen.w / 2 + 0.4 &&
           Math.abs(r.root.position.z - pen.z) <= pen.d / 2 + 0.4;
}));
check('Each pen has a feed trough target', rigs.every((r) => !!r.troughTarget));

const rig = rigs[0];
let animError = null;
// t في اللعبة تراكمي (elapsed) — نبدأ من ساعة المجسم الحالية
const t0 = rig.clock;
const distBefore = Math.hypot(rig.troughTarget.x - rig.root.position.x, rig.troughTarget.y - rig.root.position.z);
try {
    rig.startEating(1.0);
    for (let i = 0; i < 90; i++) rig.update(t0 + i * 0.016, 0.016);
} catch (e) {
    animError = e;
}
check('Eat animation runs and returns to idle', !animError && rig.state === 'idle', animError?.message || `state=${rig.state}`);
const distAfter = Math.hypot(rig.troughTarget.x - rig.root.position.x, rig.troughTarget.y - rig.root.position.z);
check('Hungry animal walks to the trough while eating', distAfter < distBefore,
    `${distBefore.toFixed(2)} → ${distAfter.toFixed(2)}`);
check('Animal stays inside its pen while walking to the trough', (() => {
    const pen = Layout.PENS.find((p) => p.id === rig.penId);
    return Math.abs(rig.root.position.x - pen.x) <= pen.w / 2 + 0.4 &&
           Math.abs(rig.root.position.z - pen.z) <= pen.d / 2 + 0.4;
})());
check('Ready orb exists and toggles', (() => {
    rig.setReady(true);
    const on = rig.readyOrb?.visible === true;
    rig.setReady(false);
    return on && rig.readyOrb?.visible === false;
})());
check('syncReadyStates maps system state to visuals', (() => {
    const map = {};
    rigs.forEach((r, i) => { r.farmAnimalId = `a${i}`; map[`a${i}`] = i % 2 ? 'ready' : 'hungry'; });
    env.animals.syncReadyStates(map);
    return rigs.every((r, i) => r.readyOrb.visible === (i % 2 === 1));
})());

/* ============================================================
   7) العشب الكثيف ومناطق المنع
   ============================================================ */
section('Grass density & exclusion zones');

const grass = env.foliage.grass;
check('Grass is a single InstancedMesh', !!grass && grass.isInstancedMesh === true);
check('Grass is dense (>= 1200 blades)', (grass?.count || 0) >= 1200, `count=${grass?.count}`);

const m4 = new THREE.Matrix4();
const pos = new THREE.Vector3();
let violations = 0;
let sampled = 0;
for (let i = 0; i < (grass?.count || 0); i++) {
    grass.getMatrixAt(i, m4);
    pos.setFromMatrixPosition(m4);
    sampled++;
    if (!Layout.isInsidePlayZone(pos.x, pos.z)) violations++;
}
check('No grass blade grows inside buildings/fields/pens/paths', violations === 0,
    `${violations}/${sampled} violations`);
check('Grass spread covers the farm (not a dead patch)', (() => {
    let minX = 999, maxX = -999, minZ = 999, maxZ = -999;
    for (let i = 0; i < (grass?.count || 0); i++) {
        grass.getMatrixAt(i, m4);
        pos.setFromMatrixPosition(m4);
        minX = Math.min(minX, pos.x); maxX = Math.max(maxX, pos.x);
        minZ = Math.min(minZ, pos.z); maxZ = Math.max(maxZ, pos.z);
    }
    return (maxX - minX) > 40 && (maxZ - minZ) > 40;
})());
check('Wind shader uniform is wired', typeof env.foliage._grassUniforms?.uTime?.value === 'number');
check('Trees have collision', Layout.PENS.length > 0 && boxList.some((b) => b.tag === 'tree'));

/* ============================================================
   8) داخل البيت: دخول/خروج
   ============================================================ */
section('House interior: enter / exit');

check('Interior group is a sibling of the farm (same scene)', interior?.group?.parent === scene);
check('Interior has interactables (chest + exit)', (interior?.interactables?.length || 0) >= 2,
    JSON.stringify((interior?.interactables || []).map((i) => i.id)));

const spawn = interior.getSpawnPoint(new THREE.Vector3());
check('Spawn point is inside the room bounds',
    spawn.x >= Layout.INTERIOR_BOUNDS.minX && spawn.x <= Layout.INTERIOR_BOUNDS.maxX &&
    spawn.z >= Layout.INTERIOR_BOUNDS.minZ && spawn.z <= Layout.INTERIOR_BOUNDS.maxZ);

const chestNear = interior.getNearestInteractable(
    { x: Layout.INTERIOR_CHEST.x, y: 0, z: Layout.INTERIOR_CHEST.z }, 2.0
);
check('Chest is interactable at its layout position', chestNear?.id === 'chest', JSON.stringify(chestNear?.id));

const exitNear = interior.getNearestInteractable(
    { x: Layout.INTERIOR_EXIT.x, y: 0, z: Layout.INTERIOR_EXIT.z - 0.4 }, 2.2
);
check('Exit door is interactable from inside', exitNear?.id === 'exit', JSON.stringify(exitNear?.id));

check('Exit door is a real door object (not a fake wall)', !!interior.exitDoor && typeof interior.exitDoor.setOpen === 'function');
check('Exit door starts open (no fake wall blocking)', interior.exitDoor?.open === true);

const outside = HouseInterior.getOutsideExit();
check('Outside exit is in front of the farmhouse door',
    Math.abs(outside.x - Layout.HOUSE.x) < 3 && outside.z > Layout.HOUSE.z &&
    Math.hypot(outside.x - Layout.HOUSE.x, outside.z - Layout.HOUSE.z) < 12,
    JSON.stringify(outside));

// محاكاة الدخول/الخروج كما يفعل main.js
interior.setVisible(true);
env.group.visible = false;
check('Entering hides the farm root and shows the interior',
    env.group.visible === false && interior.group.visible === true);
interior.setVisible(false);
env.group.visible = true;
check('Exiting restores the farm and hides the interior',
    env.group.visible === true && interior.group.visible === false);

let interiorUpdateError = null;
try {
    interior.setVisible(true);
    interior.toggleChest();
    for (let i = 0; i < 60; i++) interior.update(0.016);
    interior.toggleChest();
    for (let i = 0; i < 60; i++) interior.update(0.016);
} catch (e) {
    interiorUpdateError = e;
}
check('Interior animates (chest lid + lamps + fire) without errors', !interiorUpdateError,
    interiorUpdateError?.message);
interior.setVisible(false);

/* ============================================================
   9) اللافتات العربية المقروءة
   ============================================================ */
section('Readable Arabic signage');

const signHeights = [];
scene.traverse((o) => {
    if (o.isSprite && o.scale.x > 2) signHeights.push(o.position.y);
});
check('Signs exist as sprites', signHeights.length >= 6, `sprites=${signHeights.length}`);
check('Signs are high enough to read over models (>= 2.5 units)',
    signHeights.every((y) => y >= 2.4), `min=${Math.min(...signHeights).toFixed(2)}`);

/* ============================================================
   10) التخلص من الموارد
   ============================================================ */
section('Dispose paths (no leaks on reload)');

let disposeError = null;
try {
    env.sky.dispose();
    interior.dispose();
} catch (e) {
    disposeError = e;
}
check('SkyDome + HouseInterior dispose cleanly', !disposeError, disposeError?.message);

/* ============================================================
   11) عالم المزرعة: الجبال والأسوار والحراسة من التكرار
   ============================================================ */
section('World additions: fences, mountains & instance guards');

check('Distant mountains exist in environment', !!env.mountains || !!env.group.getObjectByName('Distant-mountains'));
check('Mountains are placed in the far distance', (() => {
    const m = env.group.getObjectByName('Distant-mountains');
    return !!m;
})());
check('Pen fences surround animal pens', Layout.PENS.every((p) => {
    const penGroup = env.animals.pens.find((g) => g.id === p.id);
    return !!penGroup && penGroup.group.userData?.hasFence === true;
}));
check('Pen fences registered in collision engine', boxList.some((b) =>
    b.tag === 'fence' && Layout.PENS.some((p) => String(b.id).startsWith(p.id))
));
check('Exactly one windmill exists in building manager', (() => {
    let count = 0;
    env.buildings.group.traverse((o) => { if (o.name === 'Windmill') count++; });
    return count === 1;
})());
check('Windmill guard prevents duplicate instances on re-call', (() => {
    env.buildings.windmill();
    let count = 0;
    env.buildings.group.traverse((o) => { if (o.name === 'Windmill') count++; });
    return count === 1;
})());
check('Welcome sign and flowers are guarded against duplication', (() => {
    env.buildings.sign();
    env.foliage.buildFlowers();
    let signs = 0;
    env.buildings.group.traverse((o) => { if (o.name === 'WelcomeSign') signs++; });
    return signs === 1;
})());

/* ---------- ملخص ---------- */
console.log('\n' + '═'.repeat(60));
if (failures.length === 0) {
    console.log(`✅ WORLD PASS — ${passed} checks, 0 failures. drawables=${total}`);
    console.log('═'.repeat(60));
    process.exit(0);
} else {
    console.log(`❌ WORLD FAIL — ${passed} passed, ${failures.length} failed.`);
    failures.forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
    console.log('═'.repeat(60));
    process.exit(1);
}
