/**
 * ============================================================
 * Animals.js — Detailed procedural animal rigs
 * ============================================================
 * Each animal is a small hierarchy (body, neck/head, legs, tail)
 * with idle / walk cycles driven by sine IK-style poses.
 * ============================================================
 */

import * as THREE from 'three';
import { mergeDeep, mergeGroupChildren, mergeAllStatic } from './MergeUtils.js';
import { Events } from '../core/EventBus.js';
import { PENS, PEN_HERDS } from './FarmLayout.js';

const M = (color, extra = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });

/* ── High-fidelity animal palette (AAA production) ──────────────── */
const PIG_FLESH    = 0xf5a8a8;
const PIG_FLESH_DK = 0xe88d8d;
const COW_HIDE     = 0xf3eee4;
const COW_DARK     = 0x2a241f;
const COW_PINK     = 0xe89a90;

/*
 * مضاعِف الفراء/الصوف الموسمي (Brief §0.4 «animal coats change with
 * hour + season»): المجسمات مدموجة بألوان مخبوزة، فالصبغة تُطبَّق
 * كضرب على material.color — شتاء بارد، خريف دافئ، ربيع/صيف محايد.
 */
const COAT_SEASON_MULT = Object.freeze({
    spring: 0xf6fff2,
    summer: 0xffffff,
    autumn: 0xffe6c4,
    winter: 0xd6e4ef
});

/** ارتفاع ضوء النهار ⇒ بهتان بسيط للفراء ليلًا (بدون مصابيح إضافية). */
const COAT_NIGHT_MULT = 0.82;

const _coatColor = new THREE.Color();

function mesh(geo, material, pos = [0, 0, 0], parent) {
    const m = new THREE.Mesh(geo, material);
    m.position.set(...pos);
    m.castShadow = true;
    m.receiveShadow = true;
    if (parent) parent.add(m);
    return m;
}

class AnimalRig {
    constructor({ type, x, z, scale = 1, collision = null, homeRadius = 3.2 }) {
        this.type = type;
        this.root = new THREE.Group();
        this.root.name = type;
        this.root.position.set(x, 0, z);
        this.root.scale.setScalar(scale);

        this.home = new THREE.Vector2(x, z);
        this.target = new THREE.Vector2(x, z);
        this.homeRadius = homeRadius;
        this.state = 'idle';
        this.walkSpeed = 0.55 + Math.random() * 0.4;
        this.phase = Math.random() * Math.PI * 2;
        this.pauseUntil = Math.random() * 2;
        this.clock = 0;
        this.radius = type === 'cow' ? 0.7 : type === 'chicken' || type === 'rooster' ? 0.28 : 0.5;

        // حالة الأكل: الحيوان ينزل رأسه للمعلف لثوانٍ بعد الإطعام.
        this.eatUntil = 0;
        this.headBaseY = 0;

        this.parts = { legs: [], extras: [] };
        this.build(type);
        this._buildReadyOrb();

        /*
         * الأجزاء المتحركة (أذنان/جناحان) تُعلَّم noMerge، ثم تُدمج بقية
         * الأجزاء الساكنة داخل كل مجموعة: نفس الشكل بعدد نداءات أقل بكثير.
         */
        /*
         * الأجنحة تبقى منفصلة (رفرفة الطيور جزء من قراءة النوع)، أما
         * الآذان فتُدمج مع الرأس لتوفير نداءي رسم لكل حيوان — الحركة
         * البديلة (رأس/ذيل/أرجل) تكفي لإحساس الحياة.
         */
        for (const mesh of (this.parts.wings || [])) {
            if (mesh) mesh.userData.noMerge = true;
        }
        /*
         * دمج على مستويين:
         *   1) mergeDeep    ⇒ داخل كل مجموعة (جذع/أطراف/ذيل).
         *   2) mergeAllStatic ⇒ الأجزاء المعلقة على Mesh (تفاصيل
         *      الرأس/الأذرع) والجذر نفسه.
         * النتيجة: ~10 نداءات رسم للحيوان بدل ~20، مع بقاء المفاصل
         * (الأرجل/الرقبة/الأجنحة) حرة للحركة.
         */
        mergeDeep(this.root, { name: type });
        mergeAllStatic(this.root, { name: `${type}-static` });

        /*
         * أي جزء ابتلعه الدمج يُزال من قائمة المتحرك (لا حركة شبحية).
         * انتبه: القائمة الفارغة تُترك null/undefined لأن animate()
         * تفحص `if (this.parts.wings)` — مصفوفة فارغة ستُمرّر الفحص
         * ثم تنكسر على wings[0].
         */
        const prune = (list) => {
            if (!Array.isArray(list) || list.length === 0) return list;
            const alive = list.filter((m) => m && m.parent);
            return alive.length > 0 ? alive : null;
        };
        this.parts.ears = prune(this.parts.ears);
        this.parts.wings = prune(this.parts.wings);

        // مواد المجسم بعد الدمج ⇒ تُصبغ موسميًا/ليليًا من Animals.
        this.materials = [];
        this.root.traverse((o) => {
            if (o.isMesh && o.material && !o.userData.noMerge) this.materials.push(o.material);
        });

        this.collider = null;
        if (collision) {
            this.collider = collision.addBox({
                id: `animal-${type}-${x.toFixed(1)}-${z.toFixed(1)}`,
                x,
                z,
                width: this.radius * 1.8,
                depth: this.radius * 1.8,
                height: 1.6,
                tag: 'animal'
            });
        }
    }

    part(geo, material, pos, parent = this.root) {
        return mesh(geo, material, pos, parent);
    }

    build(type) {
        if (type === 'cow') this.buildCow();
        else if (type === 'pig') this.buildPig();
        else if (type === 'sheep') this.buildSheep();
        else if (type === 'rooster') this.buildBird(true);
        else this.buildBird(false);
    }

    addLeg(parent, x, z, length, radius, color, hoofColor) {
        const hip = new THREE.Group();
        hip.position.set(x, length, z);
        parent.add(hip);

        const upper = mesh(
            new THREE.CylinderGeometry(radius * 0.85, radius, length * 0.55, 6),
            M(color),
            [0, -length * 0.28, 0],
            hip
        );
        const knee = new THREE.Group();
        knee.position.set(0, -length * 0.55, 0);
        hip.add(knee);
        mesh(
            new THREE.CylinderGeometry(radius * 0.7, radius * 0.8, length * 0.45, 6),
            M(color),
            [0, -length * 0.22, 0],
            knee
        );
        mesh(
            new THREE.BoxGeometry(radius * 2.1, radius * 0.7, radius * 2.6),
            M(hoofColor),
            [0, -length * 0.48, 0.04],
            knee
        );

        this.parts.legs.push({ hip, knee, length });
        return hip;
    }

    buildCow() {
        const hide = M(COW_HIDE);
        const dark = M(COW_DARK);
        const pink = M(COW_PINK);
        const horn = M(0xf0e6c8, { roughness: 0.55 });

        const body = new THREE.Group();
        body.position.y = 0.95;
        this.root.add(body);
        this.parts.body = body;

        // Heavy-set barrel torso
        this.part(new THREE.BoxGeometry(1.95, 1.12, 1.02), hide, [0, 0, 0], body);
        // Holstein black patches (dual-tone textured pattern)
        this.part(new THREE.SphereGeometry(0.38, 8, 6), dark, [-0.48, 0.24, 0.4], body);
        this.part(new THREE.SphereGeometry(0.32, 8, 6), dark, [0.58, -0.12, -0.35], body);
        this.part(new THREE.SphereGeometry(0.28, 8, 6), dark, [-0.12, 0.28, -0.38], body);
        // Udder (articulated pink)
        this.part(new THREE.SphereGeometry(0.19, 8, 6), pink, [0, -0.6, -0.08], body);
        // Bell
        this.part(new THREE.BoxGeometry(0.11, 0.13, 0.06), M(0xd4a017, { metalness: 0.5, roughness: 0.4 }), [0, -0.42, 0.52], body);

        const neck = new THREE.Group();
        neck.position.set(0, 0.35, 0.55);
        body.add(neck);
        this.parts.neck = neck;

        // Sculpted snout
        const head = this.part(new THREE.BoxGeometry(0.65, 0.58, 0.72), hide, [0, 0.05, 0.42], neck);
        this.parts.head = head;
        this.part(new THREE.BoxGeometry(0.4, 0.3, 0.34), pink, [0, -0.1, 0.5], head);
        // Eyes
        this.part(new THREE.SphereGeometry(0.058, 6, 5), dark, [-0.18, 0.14, 0.38], head);
        this.part(new THREE.SphereGeometry(0.058, 6, 5), dark, [0.18, 0.14, 0.38], head);

        const earL = this.part(new THREE.BoxGeometry(0.2, 0.3, 0.09), hide, [-0.42, 0.24, 0.06], head);
        earL.rotation.z = 0.4;
        const earR = this.part(new THREE.BoxGeometry(0.2, 0.3, 0.09), hide, [0.42, 0.24, 0.06], head);
        earR.rotation.z = -0.4;
        this.parts.ears = [earL, earR];

        // Horns — curved outward
        const hornL = this.part(new THREE.ConeGeometry(0.08, 0.4, 6), horn, [-0.24, 0.5, 0.06], head);
        hornL.rotation.z = 0.5;
        const hornR = this.part(new THREE.ConeGeometry(0.08, 0.4, 6), horn, [0.24, 0.5, 0.06], head);
        hornR.rotation.z = -0.5;

        [[-0.44, -0.34], [0.44, -0.34], [-0.44, 0.34], [0.44, 0.34]].forEach(([lx, lz]) => {
            this.addLeg(this.root, lx, lz, 0.95, 0.1, COW_DARK, 0x1a1612);
        });

        // Bone-chained tail with dynamic swishing
        const tail = new THREE.Group();
        tail.position.set(0, 1.28, -0.52);
        this.root.add(tail);
        // Upper tail segment
        this.part(new THREE.CylinderGeometry(0.035, 0.045, 0.42, 5), hide, [0, -0.21, -0.08], tail).rotation.x = 0.5;
        // Lower tail segment (bone chain)
        const tailLower = new THREE.Group();
        tailLower.position.set(0, -0.42, -0.15);
        tail.add(tailLower);
        this.parts.tailLower = tailLower;
        this.part(new THREE.CylinderGeometry(0.028, 0.038, 0.32, 5), hide, [0, -0.16, -0.06], tailLower).rotation.x = 0.6;
        // Tuft
        this.part(new THREE.SphereGeometry(0.09, 6, 5), dark, [0, -0.32, -0.14], tailLower);
        this.parts.tail = tail;
    }

    buildPig() {
        const pink = M(PIG_FLESH);
        const pinkDk = M(PIG_FLESH_DK);
        const dark = M(0x3a221c);

        const body = new THREE.Group();
        body.position.y = 0.62;
        this.root.add(body);
        this.parts.body = body;

        // Volumetric rounded torso — wider girth for authentic pig silhouette
        const torso = this.part(new THREE.SphereGeometry(0.6, 10, 8), pink, [0, 0, 0], body);
        torso.scale.set(1.42, 0.82, 1.0);

        // Belly accent (lighter underside)
        const belly = this.part(new THREE.SphereGeometry(0.42, 8, 6), pinkDk, [0, -0.18, 0.04], body);
        belly.scale.set(1.1, 0.6, 0.9);

        const neck = new THREE.Group();
        neck.position.set(0, 0.12, 0.44);
        body.add(neck);
        this.parts.neck = neck;

        const head = this.part(new THREE.SphereGeometry(0.38, 9, 7), pink, [0, 0.06, 0.28], neck);
        this.parts.head = head;
        // Sculpted snout with modeled nostrils
        const snout = this.part(new THREE.CylinderGeometry(0.16, 0.19, 0.18, 8), pinkDk, [0, -0.04, 0.4], head);
        snout.rotation.x = Math.PI / 2;
        const snoutRing = this.part(new THREE.CylinderGeometry(0.165, 0.165, 0.06, 8), M(0xc96f61), [0, -0.04, 0.46], head);
        snoutRing.rotation.x = Math.PI / 2;
        // Modeled nostrils — two dark indentations on the snout tip
        this.part(new THREE.SphereGeometry(0.032, 5, 4), dark, [-0.055, 0.02, 0.49], head);
        this.part(new THREE.SphereGeometry(0.032, 5, 4), dark, [0.055, 0.02, 0.49], head);
        // Eyes
        this.part(new THREE.SphereGeometry(0.048, 6, 5), dark, [-0.14, 0.14, 0.3], head);
        this.part(new THREE.SphereGeometry(0.048, 6, 5), dark, [0.14, 0.14, 0.3], head);

        // Floppy ears — cone shapes angled outward and down
        const earL = this.part(new THREE.ConeGeometry(0.13, 0.24, 5), pinkDk, [-0.24, 0.3, 0.06], head);
        earL.rotation.z = 0.6;
        earL.rotation.x = 0.15;
        const earR = this.part(new THREE.ConeGeometry(0.13, 0.24, 5), pinkDk, [0.24, 0.3, 0.06], head);
        earR.rotation.z = -0.6;
        earR.rotation.x = 0.15;
        this.parts.ears = [earL, earR];

        [[-0.3, -0.28], [0.3, -0.28], [-0.3, 0.28], [0.3, 0.28]].forEach(([lx, lz]) => {
            this.addLeg(this.root, lx, lz, 0.55, 0.085, PIG_FLESH, 0x4a3028);
        });

        const tail = new THREE.Group();
        tail.position.set(0, 0.85, -0.57);
        this.root.add(tail);
        // Archimedean spiral tail — TorusGeometry forms the curl
        const curl = this.part(new THREE.TorusGeometry(0.11, 0.03, 6, 12), pinkDk, [0, 0.08, 0], tail);
        curl.rotation.y = Math.PI / 2;
        // Tail tip nub
        this.part(new THREE.SphereGeometry(0.032, 5, 4), pink, [0, 0.18, 0.04], tail);
        this.parts.tail = tail;
    }

    buildSheep() {
        const wool = M(0xf7f3ea);
        const dark = M(0x2b241c);

        const body = new THREE.Group();
        body.position.y = 0.78;
        this.root.add(body);
        this.parts.body = body;

        // Multi-lobed procedural wool clusters — main mass + additional lobes
        this.part(new THREE.DodecahedronGeometry(0.64, 1), wool, [0, 0, 0], body);
        this.part(new THREE.SphereGeometry(0.42, 8, 6), wool, [0.18, 0.22, 0.12], body);
        this.part(new THREE.SphereGeometry(0.36, 8, 6), wool, [-0.24, 0.06, -0.14], body);
        this.part(new THREE.SphereGeometry(0.3, 8, 6), wool, [0, 0.28, -0.22], body);
        this.part(new THREE.SphereGeometry(0.28, 8, 6), wool, [-0.12, -0.18, 0.16], body);

        const neck = new THREE.Group();
        neck.position.set(0, 0.05, 0.5);
        body.add(neck);
        this.parts.neck = neck;

        // Dark stylized face mask
        const head = this.part(new THREE.BoxGeometry(0.4, 0.44, 0.5), dark, [0, 0.02, 0.28], neck);
        this.parts.head = head;
        // Wool cap on top
        this.part(new THREE.SphereGeometry(0.18, 7, 5), wool, [0, 0.26, 0.06], head);
        // Eyes
        this.part(new THREE.SphereGeometry(0.042, 6, 5), M(0x111111), [-0.11, 0.1, 0.26], head);
        this.part(new THREE.SphereGeometry(0.042, 6, 5), M(0x111111), [0.11, 0.1, 0.26], head);

        // Floppy ears with subtle idle twitching
        const earL = this.part(new THREE.BoxGeometry(0.13, 0.24, 0.07), dark, [-0.28, 0.08, 0.03], head);
        earL.rotation.z = 0.5;
        earL.rotation.x = 0.1;
        const earR = this.part(new THREE.BoxGeometry(0.13, 0.24, 0.07), dark, [0.28, 0.08, 0.03], head);
        earR.rotation.z = -0.5;
        earR.rotation.x = 0.1;
        this.parts.ears = [earL, earR];

        // 3-segment hooved legs (hip → knee → hoof)
        [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]].forEach(([lx, lz]) => {
            this.addLeg(this.root, lx, lz, 0.72, 0.075, 0x2b241c, 0x1a1612);
        });

        const tail = new THREE.Group();
        tail.position.set(0, 0.95, -0.52);
        this.root.add(tail);
        this.part(new THREE.SphereGeometry(0.13, 6, 5), wool, [0, 0, 0], tail);
        this.parts.tail = tail;
    }

    buildBird(isRooster) {
        const bodyCol = isRooster ? 0x9c4823 : 0xf5eee0;
        const accent = isRooster ? 0xc45c28 : 0xf0d9b5;
        const comb = M(0xd32f2f);
        const beak = M(0xe9a020);
        const dark = M(0x222222);

        const body = new THREE.Group();
        body.position.y = 0.38;
        this.root.add(body);
        this.parts.body = body;

        const torso = this.part(new THREE.SphereGeometry(0.28, 9, 7), M(bodyCol), [0, 0, 0], body);
        torso.scale.set(1.05, 0.9, 1.25);

        const neck = new THREE.Group();
        neck.position.set(0, 0.18, 0.18);
        body.add(neck);
        this.parts.neck = neck;

        const head = this.part(new THREE.SphereGeometry(0.16, 8, 6), M(accent), [0, 0.16, 0.12], neck);
        this.parts.head = head;
        const beakMesh = this.part(new THREE.ConeGeometry(0.05, 0.16, 5), beak, [0, -0.02, 0.2], head);
        beakMesh.rotation.x = Math.PI / 2;
        this.part(new THREE.SphereGeometry(0.025, 5, 4), dark, [-0.06, 0.04, 0.12], head);
        this.part(new THREE.SphereGeometry(0.025, 5, 4), dark, [0.06, 0.04, 0.12], head);

        // Distinct red comb and wattle
        const crest = this.part(
            new THREE.ConeGeometry(isRooster ? 0.07 : 0.045, isRooster ? 0.18 : 0.1, 5),
            comb,
            [0, 0.18, 0],
            head
        );
        this.parts.extras.push(crest);
        if (isRooster) {
            // Wattle under the beak
            this.part(new THREE.SphereGeometry(0.05, 5, 4), comb, [0, -0.08, 0.12], head);
            // Additional comb ridge
            this.part(new THREE.ConeGeometry(0.04, 0.1, 4), comb, [0, 0.22, 0.04], head);
        }

        // Wing flapping during locomotion
        const wingL = this.part(new THREE.SphereGeometry(0.14, 7, 5), M(bodyCol), [-0.26, 0.02, 0], body);
        wingL.scale.set(0.45, 0.7, 1.1);
        const wingR = this.part(new THREE.SphereGeometry(0.14, 7, 5), M(bodyCol), [0.26, 0.02, 0], body);
        wingR.scale.set(0.45, 0.7, 1.1);
        this.parts.wings = [wingL, wingR];

        // Dual-jointed legs — addLeg already creates hip→knee chain
        [[-0.08, 0.04], [0.08, 0.04]].forEach(([lx, lz]) => {
            this.addLeg(this.root, lx, lz, 0.32, 0.035, 0xe9a020, 0xd4880f);
        });

        // Sweeping multi-feather tail (especially for rooster)
        const tail = new THREE.Group();
        tail.position.set(0, 0.42, -0.28);
        this.root.add(tail);
        const feathers = isRooster ? 7 : 3;
        for (let i = 0; i < feathers; i++) {
            const f = this.part(
                new THREE.ConeGeometry(0.05, isRooster ? 0.48 : 0.22, 4),
                M(isRooster ? (i % 3 === 0 ? 0x3d5a80 : i % 3 === 1 ? 0xc45c28 : 0x2d4a6a) : bodyCol),
                [(i - feathers / 2) * 0.055, 0.12, -0.08],
                tail
            );
            f.rotation.x = 1.1 + i * 0.06;
        }
        this.parts.tail = tail;
    }

    /**
     * مؤشر «المنتج جاهز» فوق الرأس — كرة متوهجة صغيرة بمادة مشتركة.
     * مخفية افتراضيًا ⇒ لا نداء رسم إلا لحيوان جاهز فعلًا.
     */
    _buildReadyOrb() {
        if (!AnimalRig._orbGeo) {
            AnimalRig._orbGeo = new THREE.SphereGeometry(0.16, 8, 6);
            AnimalRig._orbMat = new THREE.MeshBasicMaterial({
                color: 0xffd54f, transparent: true, opacity: 0.92
            });
        }
        const orb = new THREE.Mesh(AnimalRig._orbGeo, AnimalRig._orbMat);
        const height = this.type === 'cow' ? 2.15 : this.type === 'sheep' ? 1.85
            : this.type === 'pig' ? 1.45 : 0.95;
        orb.position.set(0, height, 0);
        orb.visible = false;
        orb.userData.noMerge = true;
        this.root.add(orb);
        this.readyOrb = orb;
        this._orbBaseY = height;
    }

    setReady(ready) {
        if (this.readyOrb) this.readyOrb.visible = !!ready;
    }

    /** يبدأ دورة أكل قصيرة (الرأس ينزل إلى الملعف). */
    startEating(duration = 3.2) {
        this.state = 'eat';
        this.eatUntil = this.clock + duration;
    }

    pickTarget() {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * this.homeRadius;
        this.target.set(this.home.x + Math.cos(a) * r, this.home.y + Math.sin(a) * r);
    }

    animate(t) {
        const eating = this.state === 'eat';
        const walking = this.state === 'walk';
        const gait = walking ? t * 7.2 + this.phase : eating ? t * 2.2 + this.phase : t * 1.6 + this.phase;
        const amp = walking ? 0.55 : eating ? 0.03 : 0.08;

        this.parts.legs.forEach((leg, i) => {
            const swing = Math.sin(gait + (i % 2 === 0 ? 0 : Math.PI)) * amp;
            leg.hip.rotation.x = swing;
            if (leg.knee) leg.knee.rotation.x = Math.max(0, -swing) * 0.45;
        });

        if (this.parts.body) {
            this.parts.body.position.y =
                (this.type === 'cow' ? 0.95 : this.type === 'sheep' ? 0.78 : this.type === 'pig' ? 0.62 : 0.38) +
                (walking ? Math.abs(Math.sin(gait)) * 0.045 : Math.sin(t * 2 + this.phase) * 0.012);
        }

        if (this.parts.neck) {
            const isBird = this.type === 'chicken' || this.type === 'rooster';
            const peck = isBird
                ? (this.state === 'idle' && Math.sin(t * 1.3 + this.phase) > 0.85 ? 0.7 : 0)
                : 0;

            if (eating) {
                // رأس منحنٍ نحو الملعف + نقر/مضغ إيقاعي
                const chew = Math.abs(Math.sin(t * (isBird ? 7.5 : 4.2))) * (isBird ? 0.35 : 0.16);
                this.parts.neck.rotation.x = (isBird ? 1.15 : 0.85) + chew + peck * 0.2;
            } else {
                this.parts.neck.rotation.x = Math.sin(t * 1.4 + this.phase) * 0.08 + peck;
            }
        }

        if (this.parts.tail) {
            this.parts.tail.rotation.y = Math.sin(t * (walking ? 6 : 2.2) + this.phase) * 0.35;
            this.parts.tail.rotation.x = 0.15 + Math.sin(t * 1.8) * 0.08;
        }

        if (this.parts.ears) {
            this.parts.ears.forEach((ear, i) => {
                // Subtle idle twitching for sheep ears
                const twitchBase = this.type === 'sheep' ? 0.004 : 0.002;
                ear.rotation.z += Math.sin(t * 3 + i) * twitchBase;
                if (this.type === 'sheep') {
                    ear.rotation.x += Math.sin(t * 5.5 + i * 2) * 0.001;
                }
            });
        }

        if (this.parts.wings) {
            const flap = walking ? Math.sin(gait) * 0.25 : Math.sin(t * 2 + this.phase) * 0.08;
            this.parts.wings[0].rotation.z = 0.2 + flap;
            this.parts.wings[1].rotation.z = -0.2 - flap;
        }
    }

    update(t, delta) {
        this.clock = t;

        // انتهاء دورة الأكل ⇒ عودة للتجوال
        if (this.state === 'eat' && t >= this.eatUntil) {
            this.state = 'idle';
            this.pauseUntil = t + 1.0 + Math.random() * 2.0;
        }

        // أثناء الأكل: يمشي إلى الملعف ثم يقف ويمضغ
        if (this.state === 'eat' && this.troughTarget) {
            const dx = this.troughTarget.x - this.root.position.x;
            const dz = this.troughTarget.y - this.root.position.z;
            const dist = Math.hypot(dx, dz);
            if (dist > 0.75) {
                const step = Math.min(dist, this.walkSpeed * 1.1 * delta);
                this.root.position.x += (dx / dist) * step;
                this.root.position.z += (dz / dist) * step;
                // المصد (collider) يُحدَّث مرة واحدة في نهاية update()
                const desired = Math.atan2(dx, dz);
                let diff = desired - this.root.rotation.y;
                while (diff > Math.PI) diff -= Math.PI * 2;
                while (diff < -Math.PI) diff += Math.PI * 2;
                this.root.rotation.y += diff * Math.min(1, delta * 6);
            }
        }

        if (this.readyOrb && this.readyOrb.visible) {
            this.readyOrb.position.y = this._orbBaseY + Math.sin(t * 3.1 + this.phase) * 0.09;
            this.readyOrb.rotation.y += delta * 1.6;
        }

        if (t > this.pauseUntil && this.state !== 'eat') {
            if (this.state === 'idle') {
                if (Math.random() < 0.012) {
                    this.pickTarget();
                    this.state = 'walk';
                }
            } else {
                const dx = this.target.x - this.root.position.x;
                const dz = this.target.y - this.root.position.z;
                const dist = Math.hypot(dx, dz);
                if (dist < 0.18) {
                    this.state = 'idle';
                    this.pauseUntil = t + 1.2 + Math.random() * 3.5;
                } else {
                    const step = this.walkSpeed * delta;
                    this.root.position.x += (dx / dist) * step;
                    this.root.position.z += (dz / dist) * step;
                    const face = Math.atan2(dx, dz);
                    let yaw = this.root.rotation.y;
                    let diff = ((face - yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
                    this.root.rotation.y = yaw + diff * Math.min(1, 6 * delta);
                }
            }
        }

        this.animate(t);

        if (this.collider) {
            this.collider.setFromCenter(
                this.root.position.x,
                this.root.position.z,
                this.radius * 1.8,
                this.radius * 1.8,
                0,
                1.6
            );
        }
    }
}

export class Animals {
    constructor(scene, { collision } = {}) {
        this.group = new THREE.Group();
        this.group.name = 'Animals';
        scene.add(this.group);
        this.collision = collision || null;
        this.animals = [];
        this.pens = [];
        this._season = null;
        this._night = 0;
        this.build();
        this._bindEvents();
    }

    /* ========================================================
       EVENTS — مزامنة الحيوان المرئي مع AnimalSystem
       ======================================================== */
    _bindEvents() {
        Events.on('animal:fed', (animalId) => {
            const rig = this._rigFor(animalId);
            if (rig) rig.startEating(3.4);
        });
        Events.on('animal:ready', (animalId) => {
            const rig = this._rigFor(animalId);
            if (rig) rig.setReady(true);
        });
        Events.on('animal:collected', (animalId) => {
            const rig = this._rigFor(animalId);
            if (rig) rig.setReady(false);
        });
    }

    _rigFor(animalId) {
        if (!animalId) return null;
        for (const rig of this.animals) {
            if (rig.farmAnimalId === animalId) return rig;
        }
        return null;
    }

    /** يحدّث مؤشرات «جاهز» من حالة النظام (يُنادى عند الإقلاع/التحميل). */
    syncReadyStates(statesById) {
        if (!statesById) return;
        for (const rig of this.animals) {
            if (!rig.farmAnimalId) continue;
            rig.setReady(statesById[rig.farmAnimalId] === 'ready');
        }
    }

    spawn(type, x, z, scale = 1, homeRadius = 3.2) {
        const rig = new AnimalRig({
            type,
            x,
            z,
            scale,
            collision: this.collision,
            homeRadius
        });
        this.group.add(rig.root);
        this.animals.push(rig);
        if (this._season) this._applyCoatToRig(rig);
        return rig;
    }

    /**
     * حظيرة: أرضية ترابية + سياج خشبي ببوابة مفتوحة + مأوى + معلف.
     * البوابة بلا تصادم (يدخلها اللاعب)، وبقية الأضلاع مصدات.
     * @param {'north'|'south'|'east'|'west'} gate جهة البوابة
     */
    buildPen({ id, x, z, w, d, gate = 'east', shelter = null }) {
        const pen = new THREE.Group();
        pen.name = id;
        pen.position.set(x, 0, z);
        this.group.add(pen);
        this.pens.push({ id, x, z, w, d, gate, group: pen });

        const hw = w / 2;
        const hd = d / 2;
        const wood = M(0x9a683e);
        const gw = 0.95; // نصف عرض البوابة

        const floor = new THREE.Mesh(
            new THREE.PlaneGeometry(w, d),
            M(0x8a6a44)
        );
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = 0.035; // فوق الممرات (0.02) — بلا z-fighting
        floor.receiveShadow = true;
        pen.add(floor);

        // بقع قش على الأرضية (تفصيلة حظيرة حقيقية)
        for (let i = 0; i < 6; i++) {
            const straw = new THREE.Mesh(
                new THREE.CircleGeometry(0.45 + (i % 3) * 0.18, 7),
                M(0xc9a961)
            );
            straw.rotation.x = -Math.PI / 2;
            straw.position.set(
                ((i * 37) % 100) / 100 * (w - 2) - (w - 2) / 2,
                0.045,
                ((i * 61) % 100) / 100 * (d - 2) - (d - 2) / 2
            );
            straw.receiveShadow = true;
            pen.add(straw);
        }

        const post = (px, pz, h = 1.1) => {
            const m = new THREE.Mesh(new THREE.BoxGeometry(0.14, h, 0.14), wood);
            m.position.set(px, h / 2, pz);
            m.castShadow = true;
            pen.add(m);
        };
        const railX = (x1, x2, zz, y) => {
            if (x2 - x1 < 0.3) return;
            const m = new THREE.Mesh(new THREE.BoxGeometry(x2 - x1, 0.1, 0.1), wood);
            m.position.set((x1 + x2) / 2, y, zz);
            m.castShadow = true;
            pen.add(m);
        };
        const railZ = (z1, z2, xx, y) => {
            if (z2 - z1 < 0.3) return;
            const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, z2 - z1), wood);
            m.position.set(xx, y, (z1 + z2) / 2);
            m.castShadow = true;
            pen.add(m);
        };

        // ضلع على محور x (شمال/جنوب) — قد يحمل البوابة
        const sideX = (zz, hasGate) => {
            if (!hasGate) {
                for (let px = -hw; px <= hw + 0.01; px += 1.7) post(px, zz);
                railX(-hw, hw, zz, 0.78);
                railX(-hw, hw, zz, 0.42);
                return;
            }
            for (let px = -hw; px <= hw + 0.01; px += 1.7) {
                if (Math.abs(px) > gw + 0.4) post(px, zz);
            }
            post(-gw, zz, 1.35);
            post(gw, zz, 1.35);
            railX(-hw, -gw, zz, 0.78);
            railX(-hw, -gw, zz, 0.42);
            railX(gw, hw, zz, 0.78);
            railX(gw, hw, zz, 0.42);
        };
        // ضلع على محور z (شرق/غرب) — قد يحمل البوابة
        const sideZ = (xx, hasGate) => {
            if (!hasGate) {
                for (let pz = -hd; pz <= hd + 0.01; pz += 1.7) post(xx, pz);
                railZ(-hd, hd, xx, 0.78);
                railZ(-hd, hd, xx, 0.42);
                return;
            }
            for (let pz = -hd; pz <= hd + 0.01; pz += 1.7) {
                if (Math.abs(pz) > gw + 0.4) post(xx, pz);
            }
            post(xx, -gw, 1.35);
            post(xx, gw, 1.35);
            railZ(-hd, -gw, xx, 0.78);
            railZ(-hd, -gw, xx, 0.42);
            railZ(gw, hd, xx, 0.78);
            railZ(gw, hd, xx, 0.42);
        };

        sideX(-hd, gate === 'north');
        sideX(hd, gate === 'south');
        sideZ(-hw, gate === 'west');
        sideZ(hw, gate === 'east');

        // مأوى صغير داخل الحظيرة
        if (shelter === 'sty') {
            const sx = -hw + 1.6;
            const sz = -hd + 1.4;
            [[-1, -0.8], [1, -0.8], [-1, 0.8], [1, 0.8]].forEach(([ox, oz]) => {
                const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.0, 0.14), wood);
                leg.position.set(sx + ox, 0.5, sz + oz);
                leg.castShadow = true;
                pen.add(leg);
            });
            const roof = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.12, 2.1), M(0x6b4423));
            roof.position.set(sx, 1.05, sz);
            roof.rotation.z = 0.06;
            roof.castShadow = true;
            pen.add(roof);
        } else if (shelter === 'coop') {
            const hut = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.0, 1.3), M(0xa8432a));
            hut.position.set(-hw + 1.2, 0.5, -hd + 1.1);
            hut.castShadow = true;
            pen.add(hut);
            const cap = new THREE.Mesh(new THREE.ConeGeometry(1.25, 0.7, 4), wood);
            cap.position.set(-hw + 1.2, 1.35, -hd + 1.1);
            cap.rotation.y = Math.PI / 4;
            cap.castShadow = true;
            pen.add(cap);
            // منحدر صعود الدجاج
            const ramp = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 1.1), wood);
            ramp.position.set(-hw + 1.2, 0.28, -hd + 2.0);
            ramp.rotation.x = -0.35;
            pen.add(ramp);
            if (this.collision) {
                this.collision.addBox({
                    id: id + '-hut',
                    x: x - hw + 1.2,
                    z: z - hd + 1.1,
                    width: 1.5,
                    depth: 1.3,
                    height: 1.6,
                    tag: 'prop'
                });
            }
        }

        this._buildTrough(pen, { hw, hd, gate });

        pen.userData.isPen = true;
        pen.userData.hasFence = true;
        pen.userData.fenceId = `pen-fence-${id}`;

        if (this.collision) {
            const walls = this.collision.addBuildingWalls({
                id, x, z,
                width: w,
                depth: d,
                thickness: 0.3,
                height: 1.1,
                door: { side: gate, width: gw * 2 },
                tag: 'fence'
            });
            // بوابة الحظيرة مفتوحة دائمًا — يدخلها اللاعب للإطعام والجمع.
            if (walls.door) walls.door.solid = false;
        }

        mergeGroupChildren(pen, { name: id + '-merged' });
    }

    /**
     * معلف خشبي مقابل البوابة: الهدف البصري للأكل.
     * الحيوان يقف عنده عند الإطعام (startEating).
     */
    _buildTrough(pen, { hw, hd, gate }) {
        const wood = M(0x7a4c25);
        const feed = M(0xd9b45a);

        // موضع الملعف على الضلع المقابل للبوابة
        let tx = 0;
        let tz = 0;
        if (gate === 'east') tx = -hw + 1.1;
        else if (gate === 'west') tx = hw - 1.1;
        else if (gate === 'south') tz = -hd + 1.1;
        else tz = hd - 1.1;

        const long = gate === 'east' || gate === 'west';
        const size = long ? [0.7, 0.42, 2.2] : [2.2, 0.42, 0.7];

        const body = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), wood);
        body.position.set(tx, 0.26, tz);
        body.castShadow = true;
        body.receiveShadow = true;
        pen.add(body);

        const top = new THREE.Mesh(
            new THREE.BoxGeometry(size[0] * 0.78, 0.08, size[2] * 0.78),
            feed
        );
        top.position.set(tx, 0.48, tz);
        pen.add(top);

        // أرجل
        for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.1), wood);
            leg.position.set(tx + ox * size[0] * 0.36, 0.08, tz + oz * size[2] * 0.36);
            pen.add(leg);
        }

        pen.userData.trough = { x: tx, z: tz };
    }

    /* ========================================================
       SEASONAL COATS — الفراء/الصوف يتغيّر مع الفصل والساعة
       ======================================================== */
    setSeasonCoat(season) {
        if (!season) return;
        this._season = season;
        for (const rig of this.animals) this._applyCoatToRig(rig);
    }

    /** 0 نهار .. 1 ليل — بهتان بسيط للفراء ليلًا. */
    setNightFactor(f) {
        const k = Math.min(1, Math.max(0, f || 0));
        if (Math.abs(k - this._night) < 0.02) return;
        this._night = k;
        for (const rig of this.animals) this._applyCoatToRig(rig);
    }

    _applyCoatToRig(rig) {
        if (!rig.materials || rig.materials.length === 0) return;
        const seasonHex = COAT_SEASON_MULT[this._season || 'summer'] || 0xffffff;
        const night = 1 - (1 - COAT_NIGHT_MULT) * this._night;
        _coatColor.setHex(seasonHex).multiplyScalar(night);
        for (const m of rig.materials) {
            if (!m) continue;
            m.color.copy(_coatColor);
        }
    }

    /* ========================================================
       BUILD — حيّ المواشي من FarmLayout (بعيدًا عن السكن)
       ======================================================== */
    build() {
        for (const pen of PENS) {
            this.buildPen({
                id: pen.id,
                x: pen.x,
                z: pen.z,
                w: pen.w,
                d: pen.d,
                gate: pen.gate,
                shelter: pen.shelter
            });
        }

        const penById = {};
        for (const pen of PENS) penById[pen.id] = pen;

        for (const herd of PEN_HERDS) {
            const pen = penById[herd.pen];
            if (!pen) continue;

            herd.offsets.forEach((offset, i) => {
                const scale = herd.scale ? herd.scale[i % herd.scale.length] : 1;
                const rig = this.spawn(
                    herd.type,
                    pen.x + offset[0],
                    pen.z + offset[1],
                    scale,
                    Math.min(pen.w, pen.d) / 2 - 1.1
                );
                rig.penId = pen.id;
                // موضع الملعف داخل الحظيرة — يمشي إليه عند الجوع
                const trough = this.pens.find(p => p.id === pen.id)?.group?.userData?.trough;
                if (trough) {
                    rig.troughTarget = new THREE.Vector2(pen.x + trough.x, pen.z + trough.z);
                }
            });
        }
    }

    update(t, delta = 0.016) {
        for (let i = 0; i < this.animals.length; i++) {
            this.animals[i].update(t, delta);
        }
    }
}

export default Animals;
