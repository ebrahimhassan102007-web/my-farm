/**
 * ============================================================
 * BuildingManager.js — Farm structures + interactive doors
 * ============================================================
 * Brief §2 «Scale» + §1 «Layout doctrine»:
 *   • البيت أكبر بحيث يُقرأ كمسكن حقيقي (لا صندوق لعبة).
 *   • الطاحونة معلم بحجم كبير لا لعبة.
 *   • ساحة الإنتاج (مخزن/صوامع) قرب الممرات، والسكن هادئ شمال-غرب،
 *     والحقول شرقًا، والمواشي غربًا/جنوب-غرب.
 *   • لافتات خشبية مرتفعة حتى يبقى النص العربي مقروءًا.
 *
 * كل الإحداثيات من FarmLayout.js — مصدر واحد للـ zoning.
 * ============================================================
 */

import * as THREE from 'three';
import { InteractiveDoor } from './Doors.js';
import { mergeAllStatic, mergeGroupChildren, mergeMeshes, mergeSubtree } from './MergeUtils.js';
import {
    HOUSE,
    WINDMILL,
    PRODUCTION_COURT,
    MARKET_STALL,
    WELCOME_SIGN,
    SIGN_HEIGHTS,
    WORLD_BOUNDS,
    DISTRICTS
} from './FarmLayout.js';

const mat = (color, roughness = 0.85, metalness = 0) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });

function box(group, size, pos, material, opts = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material);
    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.castShadow = opts.cast !== false;
    mesh.receiveShadow = opts.receive !== false;
    if (opts.name) mesh.name = opts.name;
    if (opts.noMerge) mesh.userData.noMerge = true;
    group.add(mesh);
    return mesh;
}

/** لوحة عربية على قماش (CanvasTexture) — تُقرأ من الجهتين كـ Sprite. */
function makeTextSprite(text, { width = 6.2, height = 1.15, fontSize = 150, color = '#fff3c9', canvasW = 2048 } = {}) {
    const canvasH = Math.max(64, Math.round(canvasW * (height / width)));
    const c = document.createElement('canvas');
    c.width = canvasW;
    c.height = canvasH;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = color;
    ctx.font = `900 ${fontSize}px Tajawal, "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, c.width / 2, c.height / 2 + fontSize * 0.06);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    sprite.scale.set(width, height, 1);
    sprite.userData.noMerge = true;
    return sprite;
}

export class BuildingManager {
    constructor(scene, { collision } = {}) {
        this.scene = scene;
        this.collision = collision || null;
        this.group = new THREE.Group();
        this.group.name = 'Buildings';
        scene.add(this.group);
        this.rotors = [];
        this.doors = [];
        this.windowMats = [];
        this.build();
    }

    build() {
        this.farmhouse();
        this.mailbox();
        this.barn();
        this.silo();
        this.windmill();
        this.market();
        this.districtSigns();
        this.fences();
        this.sign();
        this.lamps();

        /*
         * مرور دمج أخير على كل مبنى: التفاصيل الساكنة (أطر نوافذ،
         * درجات، أعمدة، حليات) تصبح نداء رسم واحد لكل مجموعة.
         * المستثنى بالفعل بـ noMerge: الزجاج المضيء ليلًا، رؤوس
         * المصابيح، اللوحات العربية، وأجزاء الأبواب/الدوّارات المتحركة.
         */
        mergeAllStatic(this.group, { name: 'Buildings-static' });
    }

    /* ========================================================
       🏡 الفرمهاوس — الحي السكني (أكبر بكثير من قبل)
       ======================================================== */
    farmhouse() {
        const g = new THREE.Group();
        g.name = 'Farmhouse';
        g.position.set(HOUSE.x, 0, HOUSE.z);

        const blue = mat(0x397f9f);
        const white = mat(0xf5ead7);
        const stone = mat(0x77756b);
        const roofMat = mat(0x354653);
        const wood = mat(0x6a3925);
        const porchWood = mat(0x9a6a3e);
        const brick = mat(0x8c4a37);

        // أبعاد نهائية (HOUSE.scale مطبّق رقميًا — لا group.scale حتى
        // يبقى التصادم مطابقًا للمجسم تمامًا).
        const W = 12.2;
        const D = 10.8;
        const baseH = 0.95;
        const wallH = 6.4;

        // أساس حجري
        box(g, [W + 0.9, baseH, D + 0.9], [0, baseH / 2, 0], stone);
        // الجسم
        box(g, [W, wallH, D], [0, baseH + wallH / 2, 0], blue);
        // ألواح زاوية بيضاء
        for (const sx of [-1, 1]) {
            for (const sz of [-1, 1]) {
                box(g, [0.34, wallH + 0.2, 0.34], [sx * (W / 2 - 0.17), baseH + wallH / 2, sz * (D / 2 - 0.17)], white);
            }
        }
        // شريط أفقي أبيض تحت السقف
        box(g, [W + 0.3, 0.34, D + 0.3], [0, baseH + wallH - 0.1, 0], white);

        // السقف: هرم بأربعة أضلاع + إفريز
        const roofH = 4.9;
        const roof = new THREE.Mesh(new THREE.ConeGeometry(9.35, roofH, 4), roofMat);
        roof.rotation.y = Math.PI / 4;
        roof.position.y = baseH + wallH + roofH / 2 - 0.1;
        roof.castShadow = true;
        roof.receiveShadow = true;
        g.add(roof);
        box(g, [W + 1.5, 0.26, D + 1.5], [0, baseH + wallH + 0.05, 0], roofMat);

        // مدخنة طوب
        box(g, [1.4, 6.4, 1.4], [4.1, baseH + wallH + 1.6, -2.6], brick);
        box(g, [1.75, 0.34, 1.75], [4.1, baseH + wallH + 4.85, -2.6], stone);

        // --- الشرفة الأمامية (جنوب) ---
        const porchZ = D / 2 + 1.75;
        box(g, [W + 1.4, 0.34, 3.6], [0, baseH - 0.28, porchZ], porchWood);
        // درجات
        box(g, [3.4, 0.22, 0.8], [0, baseH - 0.55, porchZ + 2.0], porchWood);
        box(g, [3.8, 0.22, 0.8], [0, baseH - 0.78, porchZ + 2.6], porchWood);
        // أعمدة + سقف الشرفة
        for (const x of [-5.6, 5.6]) {
            box(g, [0.4, wallH - 0.6, 0.4], [x, baseH + (wallH - 0.6) / 2 - 0.3, porchZ + 1.4], white);
        }
        for (const x of [-2.9, 2.9]) {
            box(g, [0.34, wallH - 1.2, 0.34], [x, baseH + (wallH - 1.2) / 2 - 0.3, porchZ + 1.4], white);
        }
        box(g, [W + 1.9, 0.3, 4.1], [0, baseH + wallH - 0.95, porchZ + 0.5], roofMat);
        // درابزين الشرفة (بلا سدّ مدخل الدرج)
        for (const x of [-5.6, 5.6]) {
            const railW = 3.4;
            const railX = x > 0 ? x - railW / 2 - 0.4 : x + railW / 2 + 0.4;
            box(g, [railW, 0.14, 0.14], [railX, baseH + 0.55, porchZ + 1.6], white);
            box(g, [railW, 0.14, 0.14], [railX, baseH + 0.15, porchZ + 1.6], white);
            for (let i = 0; i < 5; i++) {
                box(g, [0.1, 0.75, 0.1], [railX - railW / 2 + 0.35 + i * 0.68, baseH + 0.15, porchZ + 1.6], white);
            }
        }

        // --- النوافذ (زجاج دافئ يضيء ليلًا) ---
        this._windowPane(g, [-3.5, baseH + 3.3, D / 2 + 0.06], 1.9, 2.2, 0, white, blue);
        this._windowPane(g, [3.5, baseH + 3.3, D / 2 + 0.06], 1.9, 2.2, 0, white, blue);
        this._windowPane(g, [-W / 2 - 0.06, baseH + 3.3, -1.6], 1.9, 2.2, Math.PI / 2, white, blue);
        this._windowPane(g, [-W / 2 - 0.06, baseH + 3.3, 2.4], 1.9, 2.2, Math.PI / 2, white, blue);
        this._windowPane(g, [W / 2 + 0.06, baseH + 3.3, -1.6], 1.9, 2.2, Math.PI / 2, white, blue);
        this._windowPane(g, [W / 2 + 0.06, baseH + 3.3, 2.4], 1.9, 2.2, Math.PI / 2, white, blue);
        // نافذة عليا (dormer) في السقف
        box(g, [2.4, 1.9, 1.5], [0, baseH + wallH + 1.35, D / 2 - 1.9], blue);
        box(g, [2.7, 0.24, 1.9], [0, baseH + wallH + 2.4, D / 2 - 1.9], roofMat);
        this._windowPane(g, [0, baseH + wallH + 1.35, D / 2 - 1.1], 1.5, 1.2, 0, white, blue);

        // --- الباب الحقيقي (مفصلة) ---
        let doorCollider = null;
        if (this.collision) {
            const walls = this.collision.addBuildingWalls({
                id: 'farmhouse',
                x: HOUSE.x,
                z: HOUSE.z,
                width: W,
                depth: D,
                thickness: 0.55,
                height: baseH + wallH + 1.2,
                door: { side: 'south', width: 2.6 }
            });
            doorCollider = walls.door;
        }

        // إطار الباب
        box(g, [2.9, 3.9, 0.3], [0, baseH + 1.95, D / 2 + 0.1], wood);

        const door = new InteractiveDoor({
            parent: g,
            hinge: { x: -1.15, y: baseH, z: D / 2 + 0.16 },
            size: { w: 2.3, h: 3.6, d: 0.16 },
            material: wood,
            openAngle: Math.PI * 0.82,
            id: 'farmhouse-door',
            label: 'باب البيت',
            collider: doorCollider,
            interactOffset: { x: 1.15, y: 0, z: 1.1 },
            // الفعل الحقيقي: دخول المشهد الداخلي (HouseInterior).
            action: 'enter-house'
        });
        // ألواح على ضلفة الباب (أبناء المفصلة ⇒ تتحرك معه)
        for (const oy of [0.85, 2.55]) {
            box(door.pivot, [1.85, 1.2, 0.06], [2.3 * 0.5, oy, 0.11], mat(0x54301a));
        }
        this.doors.push(door);
        this.farmhouseDoor = door;

        // لافتة البيت الخشبية فوق الباب — مرتفعة ومقروءة
        const plate = box(g, [3.4, 0.85, 0.16], [0, baseH + 4.55, D / 2 + 0.2], mat(0x8b572c));
        plate.userData.noMerge = true;
        const houseSign = makeTextSprite('بيت المزرعة', { width: 3.2, height: 0.78, fontSize: 150 });
        houseSign.position.set(0, baseH + 4.55, D / 2 + 0.34);
        g.add(houseSign);

        this.group.add(g);
        mergeGroupChildren(g, { name: 'Farmhouse-body' });

        // تصادم أعمدة الشرفة
        if (this.collision) {
            for (const x of [-5.6, 5.6]) {
                this.collision.addBox({
                    id: `porch-col-${x}`,
                    x: HOUSE.x + x, z: HOUSE.z + porchZ + 1.4,
                    width: 0.55, depth: 0.55, height: wallH, tag: 'prop'
                });
            }
        }
    }

    /** نافذة: إطار + زجاج (الزجاج مادة مشتركة تتوهج ليلًا). */
    _windowPane(parent, pos, w, h, rotY, frameMat, trimMat) {
        const win = new THREE.Group();
        win.position.set(pos[0], pos[1], pos[2]);
        win.rotation.y = rotY;
        parent.add(win);

        box(win, [w + 0.34, h + 0.34, 0.16], [0, 0, 0], frameMat);
        box(win, [w + 0.5, 0.16, 0.34], [0, -h / 2 - 0.2, 0.06], trimMat);

        if (!this._glassMat) {
            this._glassMat = new THREE.MeshStandardMaterial({
                color: 0xffe6b0,
                emissive: 0xffb45e,
                emissiveIntensity: 0.05,
                roughness: 0.35,
                metalness: 0.05,
                transparent: true,
                opacity: 0.85
            });
            this.windowMats.push(this._glassMat);
        }
        const pane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this._glassMat);
        pane.position.set(0, 0, 0.1);
        pane.userData.noMerge = true;
        win.add(pane);

        // قضبان النافذة
        box(win, [0.1, h, 0.2], [0, 0, 0.02], frameMat);
        box(win, [w, 0.1, 0.2], [0, 0, 0.02], frameMat);

        mergeGroupChildren(win, { name: 'Window' });
        return win;
    }

    /* ========================================================
       📮 صندوق البريد + لافتة المزرعة الصغيرة (الحي السكني الهادئ)
       ======================================================== */
    mailbox() {
        const g = new THREE.Group();
        g.name = 'Mailbox';
        g.position.set(HOUSE.mailbox.x, 0, HOUSE.mailbox.z);

        const post = mat(0x6a4a28);
        const tin = mat(0x3f6f8f, 0.5, 0.35);
        const flag = mat(0xc62f26);

        box(g, [0.22, 1.5, 0.22], [0, 0.75, 0], post);
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 10, 1, false, 0, Math.PI), tin);
        body.rotation.z = Math.PI / 2;
        body.rotation.y = Math.PI / 2;
        body.position.set(0, 1.6, 0);
        body.castShadow = true;
        g.add(body);
        box(g, [0.62, 0.34, 0.86], [0, 1.45, 0], tin);
        box(g, [0.06, 0.42, 0.28], [0.3, 1.78, 0], flag);

        this.group.add(g);
        mergeGroupChildren(g, { name: 'Mailbox-body' });

        if (this.collision) {
            this.collision.addBox({
                id: 'mailbox', x: HOUSE.mailbox.x, z: HOUSE.mailbox.z,
                width: 0.5, depth: 0.5, height: 1.8, tag: 'prop'
            });
        }
    }

    /* ========================================================
       🛖 المخزن الأحمر — ساحة الإنتاج (Hay Day barn storage)
       ======================================================== */
    barn() {
        const g = new THREE.Group();
        g.name = 'Barn';
        g.position.set(PRODUCTION_COURT.barn.x, 0, PRODUCTION_COURT.barn.z);

        const S = PRODUCTION_COURT.barn.scale || 1;
        const red = mat(0x9f2925);
        const darkRed = mat(0x641814);
        const white = mat(0xf5eee0);
        const wood = mat(0x5c3218);

        const W = 8 * S;
        const D = 7 * S;
        const H = 5 * S;

        box(g, [W + 0.5, 0.35, D + 0.5], [0, 0.17, 0], mat(0x8d8578));
        box(g, [W, H, D], [0, 0.35 + H / 2, 0], red);
        // تقليم أبيض على الأركان
        for (const sx of [-1, 1]) {
            box(g, [0.28 * S, H + 0.1, 0.28 * S], [sx * (W / 2 - 0.14 * S), 0.35 + H / 2, D / 2 - 0.14 * S], white);
            box(g, [0.28 * S, H + 0.1, 0.28 * S], [sx * (W / 2 - 0.14 * S), 0.35 + H / 2, -D / 2 + 0.14 * S], white);
        }

        // سقف المقامرة (gambrel) — شكل حظيرة حقيقي لا مخروط لعبة
        const roofY = 0.35 + H;
        const lower = new THREE.Mesh(new THREE.BoxGeometry(W + 1.1, 0.24, D * 0.62), mat(0x3a3430));
        lower.position.set(0, roofY + 0.5, 0);
        lower.rotation.x = 0;
        g.add(lower);
        for (const sx of [-1, 1]) {
            const slope = new THREE.Mesh(new THREE.BoxGeometry(W + 1.1, 0.24, D * 0.46), mat(0x3a3430));
            slope.position.set(sx * (W * 0.28), roofY + 1.28, 0);
            slope.rotation.z = sx * -0.62;
            slope.castShadow = true;
            g.add(slope);
        }
        const ridge = new THREE.Mesh(new THREE.BoxGeometry(W + 1.2, 0.26, D * 0.3), mat(0x2f2a26));
        ridge.position.set(0, roofY + 1.95, 0);
        ridge.castShadow = true;
        g.add(ridge);
        // جملون أمامي/خلفي
        for (const sz of [-1, 1]) {
            box(g, [W * 0.98, 2.0, 0.2], [0, roofY + 1.0, sz * (D / 2 - 0.05)], darkRed);
        }
        // نافذة الجملون (فتحة العلية)
        box(g, [1.5 * S, 1.3 * S, 0.24], [0, roofY + 1.0, D / 2 + 0.06], wood);

        // أبواب المخزن الكبيرة (ضلفتان حقيقيتان)
        let doorCollider = null;
        if (this.collision) {
            const walls = this.collision.addBuildingWalls({
                id: 'barn',
                x: PRODUCTION_COURT.barn.x,
                z: PRODUCTION_COURT.barn.z,
                width: W,
                depth: D,
                thickness: 0.5,
                height: H + 0.4,
                door: { side: 'south', width: 5.8 * S }
            });
            doorCollider = walls.door;
        }

        const left = new InteractiveDoor({
            parent: g,
            hinge: { x: -2.95 * S, y: 0.36, z: D / 2 + 0.06 },
            size: { w: 2.95 * S, h: 4.0 * S, d: 0.14 },
            material: wood,
            openAngle: Math.PI * 0.78,
            id: 'barn-door-left',
            label: 'باب المخزن',
            collider: doorCollider,
            interactOffset: { x: 1.5 * S, y: 0, z: 0.9 }
        });
        const right = new InteractiveDoor({
            parent: g,
            hinge: { x: 2.95 * S, y: 0.36, z: D / 2 + 0.06 },
            size: { w: 2.95 * S, h: 4.0 * S, d: 0.14 },
            material: wood,
            openAngle: -Math.PI * 0.78,
            id: 'barn-door-right',
            label: 'باب المخزن',
            collider: null,
            interactOffset: { x: -1.5 * S, y: 0, z: 0.9 }
        });
        right.mesh.position.x = -2.95 * S * 0.5;
        right.handle.position.x = -0.22;
        this.doors.push(left, right);

        // عوارض على الضلفتين (أبناء المفصلة ⇒ تتحرك معها)
        const battenMat = mat(0x40220f);
        for (const [pivot, cx] of [[left.pivot, 2.95 * S * 0.5], [right.pivot, -2.95 * S * 0.5]]) {
            for (const y of [1.0, 2.1, 3.2]) {
                const batten = new THREE.Mesh(new THREE.BoxGeometry(2.7 * S, 0.16, 0.05), battenMat);
                batten.position.set(cx, y * S, 0.09);
                batten.castShadow = true;
                pivot.add(batten);
            }
            // قطر X الشهير على أبواب الحظائر
            const diag = new THREE.Mesh(new THREE.BoxGeometry(3.9 * S, 0.14, 0.05), battenMat);
            diag.position.set(cx, 2.0 * S, 0.1);
            diag.rotation.z = cx > 0 ? 0.66 : -0.66;
            pivot.add(diag);
        }

        // شرفة أمامية
        const stoneMat = mat(0x8d8578);
        box(g, [7.2 * S, 0.12, 2.6], [0, 0.06, D / 2 + 1.4], stoneMat);

        // لافتة «المخزن» عالية
        const barnSign = makeTextSprite('المخزن · Barn', { width: 3.4, height: 0.8, fontSize: 140 });
        barnSign.position.set(0, SIGN_HEIGHTS.machine + 1.9, D / 2 + 0.4);
        g.add(barnSign);

        this.group.add(g);
        mergeGroupChildren(g, { name: 'Barn-body' });
        this._barnDoors = { left, right, collider: doorCollider };
        this.barnPos = new THREE.Vector3(PRODUCTION_COURT.barn.x, 0, PRODUCTION_COURT.barn.z);
    }

    /* ========================================================
       🌾 الصوامع — تخزين المحاصيل الخام
       ======================================================== */
    silo() {
        const g = new THREE.Group();
        g.name = 'Silo';
        const S = PRODUCTION_COURT.silo.scale || 1;
        g.position.set(PRODUCTION_COURT.silo.x, 0, PRODUCTION_COURT.silo.z);

        const metal = mat(0xabb3b0, 0.38, 0.72);
        const band = mat(0x737c7d, 0.3, 0.8);
        const R = 2 * S;
        const H = 6.4 * S;

        box(g, [R * 2.5, 0.3, R * 2.5], [0, 0.15, 0], mat(0x8d8578));
        const body = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 18), metal);
        body.position.y = 0.3 + H / 2;
        body.castShadow = true;
        body.receiveShadow = true;
        g.add(body);

        const cap = new THREE.Mesh(
            new THREE.SphereGeometry(R * 1.01, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2),
            mat(0x8f9a97, 0.4, 0.6)
        );
        cap.position.y = 0.3 + H;
        cap.castShadow = true;
        g.add(cap);

        const rings = [];
        for (let y = 0.6 * S; y < H; y += 0.55 * S) {
            const ring = new THREE.Mesh(new THREE.TorusGeometry(R * 1.01, 0.035 * S, 5, 24), band);
            ring.rotation.x = Math.PI / 2;
            ring.position.y = 0.3 + y;
            g.add(ring);
            rings.push(ring);
        }
        mergeMeshes(rings, { name: 'Silo-rings' });

        // سلم الصوامع
        for (let y = 0.6; y < H; y += 0.55) {
            box(g, [0.5, 0.06, 0.06], [0, 0.3 + y, R + 0.1], band);
        }
        box(g, [0.08, H, 0.08], [-0.24, 0.3 + H / 2, R + 0.12], band);
        box(g, [0.08, H, 0.08], [0.24, 0.3 + H / 2, R + 0.12], band);

        const siloSign = makeTextSprite('الصوامع · Silo', { width: 3.0, height: 0.72, fontSize: 140 });
        siloSign.position.set(0, SIGN_HEIGHTS.machine + 2.4, 0);
        g.add(siloSign);

        if (this.collision) {
            this.collision.addBox({
                id: 'silo',
                x: PRODUCTION_COURT.silo.x,
                z: PRODUCTION_COURT.silo.z,
                width: R * 2.1, depth: R * 2.1, height: H + 1,
                tag: 'building'
            });
        }

        this.group.add(g);
        mergeGroupChildren(g, { name: 'Silo-body' });
        this.siloPos = new THREE.Vector3(PRODUCTION_COURT.silo.x, 0, PRODUCTION_COURT.silo.z);
    }

    /* ========================================================
       🌀 الطاحونة — معلم المزرعة (بحجم حقيقي لا لعبة)
       ======================================================== */
    windmill() {
        // حراسة لضمان طاحونة واحدة فقط وعدم التكرار
        if (this.group.getObjectByName('Windmill')) return;

        const g = new THREE.Group();
        g.name = 'Windmill';
        g.position.set(WINDMILL.x, 0, WINDMILL.z);
        const S = WINDMILL.scale || 2.2;

        const stone = mat(0x8d8578);
        const wood = mat(0x5c432c);
        const cream = mat(0xe8d9b8);
        const sailMat = mat(0xf3ead3);
        const darkWood = mat(0x46331f);

        // تلّة صناعية تحت المعلم حتى يقرأ كمرتفع
        const mound = new THREE.Mesh(new THREE.CylinderGeometry(5.2 * S * 0.5, 6.4 * S * 0.5, 1.1, 14), mat(0x5d9137));
        mound.position.y = 0.4;
        mound.receiveShadow = true;
        mound.castShadow = true;
        g.add(mound);

        const baseY = 0.95;
        const base = new THREE.Mesh(new THREE.CylinderGeometry(1.75 * S, 2.2 * S, 1.4 * S, 12), stone);
        base.position.y = baseY + 0.7 * S;
        base.castShadow = true;
        base.receiveShadow = true;
        g.add(base);

        const towerH = 6.6 * S;
        const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.05 * S, 1.6 * S, towerH, 12), cream);
        tower.position.y = baseY + 1.4 * S + towerH / 2;
        tower.castShadow = true;
        tower.receiveShadow = true;
        g.add(tower);

        const bands = [];
        for (const y of [2.4, 4.6, 6.6]) {
            const band = new THREE.Mesh(new THREE.CylinderGeometry(1.36 * S, 1.46 * S, 0.26 * S, 12), wood);
            band.position.y = baseY + y * S;
            band.castShadow = true;
            g.add(band);
            bands.push(band);
        }

        // شرفة خشبية حول البرج
        const balcony = new THREE.Mesh(new THREE.TorusGeometry(1.55 * S, 0.09 * S, 6, 18), darkWood);
        balcony.rotation.x = Math.PI / 2;
        balcony.position.y = baseY + 4.55 * S;
        g.add(balcony);

        const capY = baseY + 1.4 * S + towerH;
        const roof = new THREE.Mesh(new THREE.ConeGeometry(1.45 * S, 1.6 * S, 12), wood);
        roof.position.y = capY + 0.8 * S;
        roof.castShadow = true;
        g.add(roof);

        // باب البرج + نافذتان
        box(g, [0.95 * S, 1.85 * S, 0.18 * S], [0, baseY + 1.9 * S, 1.42 * S], wood);
        box(g, [0.5 * S, 0.7 * S, 0.14 * S], [0, baseY + 4.4 * S, 1.2 * S], darkWood);
        box(g, [0.45 * S, 0.6 * S, 0.14 * S], [0.9 * S, baseY + 3.2 * S, 0.95 * S], darkWood);

        // الدوّار: 4 شفرات بأشرعة
        const rotor = new THREE.Group();
        rotor.position.set(0, capY + 0.45 * S, 1.7 * S);
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.26 * S, 0.26 * S, 0.5 * S, 12), wood);
        hub.rotation.x = Math.PI / 2;
        rotor.add(hub);

        const sparLen = 5.4 * S;
        for (let i = 0; i < 4; i++) {
            const arm = new THREE.Group();
            arm.rotation.z = (i * Math.PI) / 2;
            const spar = new THREE.Mesh(new THREE.BoxGeometry(0.16 * S, sparLen, 0.12 * S), wood);
            spar.position.y = sparLen / 2;
            spar.castShadow = true;
            arm.add(spar);
            const sail = new THREE.Mesh(new THREE.BoxGeometry(1.15 * S, sparLen * 0.72, 0.06 * S), sailMat);
            sail.position.set(0.66 * S, sparLen * 0.58, 0);
            sail.castShadow = true;
            arm.add(sail);
            // عوارض الشراع
            for (let k = 0; k < 3; k++) {
                const rib = new THREE.Mesh(new THREE.BoxGeometry(1.2 * S, 0.07 * S, 0.07 * S), wood);
                rib.position.set(0.66 * S, sparLen * (0.32 + k * 0.2), 0);
                arm.add(rib);
            }
            rotor.add(arm);
        }
        g.add(rotor);
        this.rotors.push(rotor);
        mergeSubtree(rotor, { name: 'Windmill-blades' });

        const sign = makeTextSprite('طاحونة المزرعة', { width: 4.2, height: 0.9, fontSize: 130 });
        sign.position.set(0, SIGN_HEIGHTS.district + 2.2, 2.6 * S);
        g.add(sign);

        if (this.collision) {
            this.collision.addBox({
                id: 'windmill',
                x: WINDMILL.x,
                z: WINDMILL.z,
                width: 4.0 * S, depth: 4.0 * S, height: capY + 2,
                tag: 'building'
            });
            this.collision.addBox({
                id: 'windmill-mound',
                x: WINDMILL.x,
                z: WINDMILL.z,
                width: 6.0 * S, depth: 6.0 * S, height: 1.0,
                tag: 'prop',
                solid: false
            });
        }

        this.group.add(g);
        mergeGroupChildren(g, { name: 'Windmill-tower' });
        this.windmillPos = new THREE.Vector3(WINDMILL.x, 0, WINDMILL.z);
    }

    /* ========================================================
       🛒 كشك الطريق (Roadside stall) — البيع للزوار
       ======================================================== */
    market() {
        const g = new THREE.Group();
        g.name = 'Market';
        g.position.set(MARKET_STALL.x, 0, MARKET_STALL.z);

        const wood = mat(0x84502a);
        const darkWood = mat(0x6b3d20);
        const cream = mat(0xf3ead3);
        const red = mat(0xc0392b);

        box(g, [5.4, 0.22, 3.4], [0, 0.11, 0], darkWood);
        [[-2.3, -1.3], [2.3, -1.3], [-2.3, 1.3], [2.3, 1.3]].forEach(([x, z]) => {
            box(g, [0.22, 3.9, 0.22], [x, 2.05, z], wood);
        });

        // العداد على جهة المزرعة (الشمال)
        box(g, [4.4, 0.85, 1.1], [0, 0.65, -0.85], wood);
        box(g, [4.4, 0.12, 1.3], [0, 1.14, -0.85], darkWood);
        box(g, [4.4, 0.5, 0.15], [0, 0.55, -1.45], darkWood);

        // مظلة مخططة
        const awning = new THREE.Group();
        awning.position.set(0, 4.1, 0.15);
        awning.rotation.x = -0.1;
        g.add(awning);
        for (let i = 0; i < 8; i++) {
            const x = -2.45 + i * 0.7;
            box(awning, [0.68, 0.1, 3.8], [x, 0, 0], i % 2 ? red : cream);
        }
        mergeGroupChildren(awning, { name: 'Market-awning' });

        // صناديق خضار على العداد
        const produce = [
            { x: -1.45, kinds: [0xe53935, 0xe53935, 0xd32f2f], geo: () => new THREE.SphereGeometry(0.11, 7, 6) },
            { x: 0, kinds: [0xf5c542, 0xf5c542, 0xe9a020], geo: () => new THREE.ConeGeometry(0.09, 0.26, 7) },
            { x: 1.45, kinds: [0xff7043, 0xff7043, 0xe5632e], geo: () => new THREE.ConeGeometry(0.1, 0.24, 7) }
        ];
        for (const crate of produce) {
            box(g, [0.85, 0.22, 0.6], [crate.x, 1.3, -0.85], darkWood);
            crate.kinds.forEach((color, i) => {
                const veg = new THREE.Mesh(crate.geo(), mat(color, 0.6));
                veg.position.set(crate.x - 0.2 + i * 0.2, 1.5, -0.85 - (i % 2) * 0.14);
                veg.castShadow = true;
                g.add(veg);
            });
        }

        // لافتة الكشك — أعلى مما كانت حتى يُقرأ العربي بوضوح
        const boardY = SIGN_HEIGHTS.district + 1.0;
        box(g, [3.2, 0.9, 0.14], [0, boardY, -1.6], mat(0x8b572c));
        const board = makeTextSprite('كشك المزرعة', { width: 3.0, height: 0.72, fontSize: 150, color: '#4a2c10' });
        board.position.set(0, boardY, -1.5);
        g.add(board);

        if (this.collision) {
            this.collision.addBox({
                id: 'market',
                x: MARKET_STALL.x,
                z: MARKET_STALL.z,
                width: 5.6, depth: 3.6, height: 2.5,
                tag: 'building'
            });
        }

        this.group.add(g);
        mergeGroupChildren(g, { name: 'Market-body' });
        this.marketGroup = g;
        this.marketPos = new THREE.Vector3(MARKET_STALL.x, 0, MARKET_STALL.standZ);
    }

    /* ========================================================
       🪧 لافتات الأحياء — تشرح الـ zoning للاعب
       ======================================================== */
    districtSigns() {
        const signs = [
            { x: DISTRICTS.livestock.x + 5.6, z: DISTRICTS.livestock.z - 6.4, text: 'حيّ المواشي' },
            { x: DISTRICTS.fields.x - 6.6, z: DISTRICTS.fields.z - 8.2, text: 'منطقة الحقول' },
            { x: DISTRICTS.production.x - 6.4, z: DISTRICTS.production.z + 6.2, text: 'ساحة الإنتاج' }
        ];

        const postMat = mat(0x60401f);
        const boardMat = mat(0x8b572c);

        for (const s of signs) {
            const g = new THREE.Group();
            g.position.set(s.x, 0, s.z);
            box(g, [0.22, SIGN_HEIGHTS.district + 0.3, 0.22], [-1.5, (SIGN_HEIGHTS.district + 0.3) / 2, 0], postMat);
            box(g, [0.22, SIGN_HEIGHTS.district + 0.3, 0.22], [1.5, (SIGN_HEIGHTS.district + 0.3) / 2, 0], postMat);
            box(g, [3.6, 0.95, 0.16], [0, SIGN_HEIGHTS.district, 0], boardMat);
            box(g, [3.9, 0.14, 0.5], [0, SIGN_HEIGHTS.district + 0.55, 0], mat(0x5c3a1c));

            const sprite = makeTextSprite(s.text, { width: 3.4, height: 0.82, fontSize: 150, color: '#fff3c9' });
            sprite.position.set(0, SIGN_HEIGHTS.district, 0.14);
            g.add(sprite);

            this.group.add(g);
            mergeGroupChildren(g, { name: 'DistrictSign' });

            if (this.collision) {
                this.collision.addBox({
                    id: `district-sign-${s.text}`,
                    x: s.x - 1.5, z: s.z, width: 0.4, depth: 0.4, height: 3.4, tag: 'prop'
                });
                this.collision.addBox({
                    id: `district-sign2-${s.text}`,
                    x: s.x + 1.5, z: s.z, width: 0.4, depth: 0.4, height: 3.4, tag: 'prop'
                });
            }
        }
    }

    /* ========================================================
       🚧 السور المحيط — حدود المزرعة وبوابة جنوبية واحدة
       ------------------------------------------------------------
       كان سابقًا سورين يقطعان المزرعة عرضًا (z=-5 و z=25) فيفصلان
       الحقول عن الساحة بلا سبب. الآن: محيط واحد + بوابة عند قوس
       الترحيب، والمناطق تفصلها الممرات والحظائر.
       ======================================================== */
    fences() {
        const wood = mat(0xf2eee0);
        const { minX, maxX, minZ, maxZ, gateHalfWidth } = WORLD_BOUNDS.perimeter;
        const runs = [];

        const run = (x1, x2, z, axis) => {
            // axis: 'x' ⇒ سور على محور x (طولي)، 'z' ⇒ سور على محور z
            if (axis === 'x') {
                const len = x2 - x1;
                if (len < 1) return;
                const posts = [];
                for (let x = x1; x <= x2 + 0.01; x += 3) {
                    posts.push(box(this.group, [0.16, 1.7, 0.16], [x, 0.85, z], wood));
                }
                runs.push(...posts);
                runs.push(box(this.group, [len, 0.14, 0.14], [(x1 + x2) / 2, 0.68, z], wood));
                runs.push(box(this.group, [len, 0.14, 0.14], [(x1 + x2) / 2, 1.3, z], wood));

                if (this.collision) {
                    this.collision.addBox({
                        id: `fence-x-${x1}-${z}`,
                        x: (x1 + x2) / 2, z,
                        width: len, depth: 0.34, height: 1.7,
                        tag: 'fence'
                    });
                }
            } else {
                const len = x2 - x1;
                if (len < 1) return;
                const posts = [];
                for (let zz = x1; zz <= x2 + 0.01; zz += 3) {
                    posts.push(box(this.group, [0.16, 1.7, 0.16], [z, 0.85, zz], wood));
                }
                runs.push(...posts);
                runs.push(box(this.group, [0.14, 0.14, len], [z, 0.68, (x1 + x2) / 2], wood));
                runs.push(box(this.group, [0.14, 0.14, len], [z, 1.3, (x1 + x2) / 2], wood));

                if (this.collision) {
                    this.collision.addBox({
                        id: `fence-z-${x1}-${z}`,
                        x: z, z: (x1 + x2) / 2,
                        width: 0.34, depth: len, height: 1.7,
                        tag: 'fence'
                    });
                }
            }
        };

        // الجنوب: ضلفتان حول البوابة
        run(minX, -gateHalfWidth, maxZ, 'x');
        run(gateHalfWidth, maxX, maxZ, 'x');
        // الشمال كامل
        run(minX, maxX, minZ, 'x');
        // الشرق والغرب
        run(minZ, maxZ, minX, 'z');
        run(minZ, maxZ, maxX, 'z');

        // عمودا البوابة
        box(this.group, [0.26, 2.3, 0.26], [-gateHalfWidth, 1.15, maxZ], wood);
        box(this.group, [0.26, 2.3, 0.26], [gateHalfWidth, 1.15, maxZ], wood);

        /*
         * ~200 صندوق سياج ⇒ تُدمج في نداءات قليلة (كلها أبناء مباشرون
         * لـ this.group وبنفس المادة).
         */
        mergeMeshes(runs, { name: 'Perimeter-fence' });
    }

    /* ========================================================
       🌾 قوس الترحيب عند البوابة الجنوبية
       ======================================================== */
    sign() {
        // حراسة لعدم تكرار لافتة الترحيب
        if (this.group.getObjectByName('WelcomeSign')) return;

        const g = new THREE.Group();
        g.name = 'WelcomeSign';
        g.position.set(WELCOME_SIGN.x, 0, WELCOME_SIGN.z);
        const postMat = mat(0x60401f);

        box(g, [0.34, WELCOME_SIGN.boardY + 1.0, 0.34], [-3.1, (WELCOME_SIGN.boardY + 1.0) / 2, 0], postMat);
        box(g, [0.34, WELCOME_SIGN.boardY + 1.0, 0.34], [3.1, (WELCOME_SIGN.boardY + 1.0) / 2, 0], postMat);
        box(g, [7.2, 1.5, 0.28], [0, WELCOME_SIGN.boardY, 0], mat(0x8b572c));
        box(g, [7.8, 0.18, 1.1], [0, WELCOME_SIGN.boardY + 0.85, 0], mat(0x5c3a1c));
        // دعامات مائلة
        for (const sx of [-1, 1]) {
            const brace = box(g, [0.18, 2.0, 0.18], [sx * 2.7, WELCOME_SIGN.boardY - 1.2, 0], postMat);
            brace.rotation.z = sx * 0.5;
        }

        const sprite = makeTextSprite('مزرعتك انت تستحق الأفضل', {
            width: 6.9, height: 1.3, fontSize: 150, canvasW: 2048
        });
        sprite.position.set(0, WELCOME_SIGN.boardY, 0.18);
        g.add(sprite);

        this.group.add(g);
        mergeGroupChildren(g, { name: 'Sign-body' });

        if (this.collision) {
            this.collision.addBox({ id: 'sign-post-l', x: WELCOME_SIGN.x - 3.1, z: WELCOME_SIGN.z, width: 0.55, depth: 0.55, height: 4.6, tag: 'prop' });
            this.collision.addBox({ id: 'sign-post-r', x: WELCOME_SIGN.x + 3.1, z: WELCOME_SIGN.z, width: 0.55, depth: 0.55, height: 4.6, tag: 'prop' });
        }
    }

    /**
     * مصابيح دافئة في كل حيّ — مطفأة نهارًا، تتوهج ليلًا عبر
     * setNightFactor من دورة النهار/الليل الحقيقية في main.js.
     */
    lamps() {
        this.lampLights = [];
        this.lampHeadMat = new THREE.MeshStandardMaterial({
            color: 0xffe2a8,
            emissive: 0xff9d2e,
            emissiveIntensity: 0,
            roughness: 0.5
        });
        const postMat = mat(0x3a3f45, 0.6, 0.4);

        const positions = [
            [HOUSE.x + 6.6, HOUSE.z + 8.6],          // شرفة البيت
            [PRODUCTION_COURT.machines.grain_mill.x, PRODUCTION_COURT.machines.grain_mill.z + 2.6], // ساحة الإنتاج
            [PRODUCTION_COURT.barn.x - 5.4, PRODUCTION_COURT.barn.z + 4.6], // أمام المخزن
            [7.6, 5.4],                               // مدخل منطقة الحقول
            [-10.6, 0.4],                             // مدخل حيّ المواشي
            [MARKET_STALL.x + 3.6, MARKET_STALL.z - 1.4], // الكشك
            [WINDMILL.x + 3.6, WINDMILL.z + 4.2],     // المعلم
            [1.8, 22.5]                               // قرب البوابة الجنوبية
        ];

        const posts = [];
        for (let i = 0; i < positions.length; i++) {
            const x = positions[i][0];
            const z = positions[i][1];
            posts.push(box(this.group, [0.11, 3.4, 0.11], [x, 1.7, z], postMat, { name: 'lamp-post' }));
            const cap = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.3, 8), postMat);
            cap.position.set(x, 3.78, z);
            cap.castShadow = true;
            this.group.add(cap);
            posts.push(cap);

            const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), this.lampHeadMat);
            head.position.set(x, 3.44, z);
            head.userData.noMerge = true;
            this.group.add(head);

            // مصباح نقطي واحد لكل عمودين — 4 مصابيح تكفي للجوال
            if (i % 2 === 0) {
                const light = new THREE.PointLight(0xffb45e, 0, 13, 2);
                light.position.set(x, 3.3, z);
                this.group.add(light);
                this.lampLights.push(light);
            }

            if (this.collision) {
                this.collision.addBox({
                    id: 'lamp-' + i, x, z,
                    width: 0.42, depth: 0.42, height: 3.6, tag: 'prop'
                });
            }
        }
        mergeMeshes(posts, { name: 'Lamps-posts' });
    }

    /** f من 0 (نهار) إلى 1 (ليل عميق). */
    setNightFactor(f) {
        const k = Math.min(1, Math.max(0, f || 0));
        if (this.lampHeadMat) this.lampHeadMat.emissiveIntensity = k * 1.9;
        if (this.lampLights) {
            for (const light of this.lampLights) light.intensity = k * 18;
        }
        // نوافذ البيت/المباني تتوهج ليلًا — «night lamps» من Brief §2.
        for (const glass of this.windowMats) {
            glass.emissiveIntensity = 0.05 + k * 1.5;
        }
    }

    getNearestDoor(position, maxDist = 2.6) {
        let best = null;
        let bestDist = maxDist;
        for (const door of this.doors) {
            const d = door.distanceTo(position);
            if (d < bestDist) {
                bestDist = d;
                best = door;
            }
        }
        return best;
    }

    update(delta) {
        this.rotors.forEach((r) => {
            r.rotation.z -= delta * (WINDMILL.rotorSpeed || 0.42);
        });
        this.doors.forEach((door) => door.update(delta));

        if (this._barnDoors?.collider) {
            const { left, right, collider } = this._barnDoors;
            collider.solid = Math.abs(left.angle) < 0.38 || Math.abs(right.angle) < 0.38;
        }
    }
}

export default BuildingManager;
