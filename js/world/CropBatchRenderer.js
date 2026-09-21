/**
 * ============================================================
 * js/world/CropBatchRenderer.js — دفعات InstancedMesh (MF-12 استخراج)
 * ============================================================
 * كان الصنف يعيش داخل js/main.js؛ فُصل حرفيًا (السلوك كما هو، سطرًا بسطر).
 * المجموع في أسوأ حالة ≈ 9 draw calls فقط — قاعدة R4 من Work Order.
 * واجهة الاستخدام نفسها: new CropBatchRenderer(scene, { capacity }).
 * ============================================================
 */

import * as THREE from 'three';
import { Time } from '../core/TimeManager.js';
import { FarmingSystem, CROPS_DEFINITIONS } from '../systems/FarmingSystem.js';

/* ============================================================
   CROP BATCH RENDERER — دفعات InstancedMesh لكل محصول/مرحلة
   ------------------------------------------------------------
   بديل عن "mesh لكل خانة": رسمات المحصول كانت تولّد 6–10 meshes
   لكل خانة (حتى ~120 draw call في مزرعة ممتلئة). الآن:
     • InstancedMesh واحد للساق + واحد للرأس لكل نوع محصول
     • InstancedMesh واحد لأسرّة التربة (لون مختلف عند الري)
     • إعادة بناء فقط عند تغيّر الحالة (زراعة/ري/نضج/حصاد)
     • نبض مرحلة «جاهز» يحدّث مصفوفات الحالات الناضجة فقط
   الإجمالي في أسوأ حالة: 4 محاصيل × 2 + 1 ≈ 9 draw calls.
   ============================================================ */
const STAGE_SCALE = { sprout: 0.34, growing: 0.66, ready: 1.0, withered: 0.74 };
const WITHERED_COLOR = 0x7a6642;

/** ميل رأس المحصول — الذرة تنحني، والصويا تُظهر قرونها، والقصب مستقيم. */
const HEAD_TILT = Object.freeze({
    corn: -0.3,
    soybean: -0.55,
    carrot: 0.12,
    wheat: 0.0,
    tomato: 0.0,
    sugarcane: 0.0
});

export class CropBatchRenderer {
    constructor(scene, { capacity = 64 } = {}) {
        this.scene = scene;
        this.capacity = capacity;
        this.dirty = true;
        this.readyCount = 0;
        /*
         * عند دخول البيت تُخفى كل دفعات المحاصيل (لا تُدمَّر) —
         * rebuild/pulse تحترم هذه الراية حتى لا تُظهرها مجددًا.
         */
        this._visible = true;

        // هندسة مشتركة لكل المحاصيل
        this.stemGeo = new THREE.CylinderGeometry(0.045, 0.062, 1, 5);
        this.bedGeo = new THREE.BoxGeometry(1.85, 0.07, 1.85);

        /*
         * رأس مميز لكل محصول حتى تُقرأ الأنواع من مسافة اللعب:
         * قمح (سنبلة مخروطية) · ذرة (كوز) · جزر (جذر) · طماطم (ثمرة)
         * فول صويا (قرن) · قصب سكر (عقدة طويلة).
         */
        this.headGeoByCrop = {
            wheat: new THREE.ConeGeometry(0.1, 0.34, 6),
            corn: new THREE.CylinderGeometry(0.1, 0.09, 0.38, 7),
            carrot: new THREE.ConeGeometry(0.17, 0.26, 7),
            tomato: new THREE.SphereGeometry(0.13, 8, 6),
            soybean: new THREE.CapsuleGeometry(0.075, 0.2, 4, 7),
            sugarcane: new THREE.CylinderGeometry(0.075, 0.085, 0.62, 6)
        };

        const stemMat = new THREE.MeshStandardMaterial({ roughness: 0.8 });
        const headMat = new THREE.MeshStandardMaterial({ roughness: 0.55 });
        const bedMat = new THREE.MeshStandardMaterial({ roughness: 0.98 });

        this.bedCapacity = capacity * 4;
        this.beds = this._makeBatch(this.bedGeo, bedMat, this.bedCapacity);
        this.groups = new Map();

        for (const cropId of Object.keys(CROPS_DEFINITIONS)) {
            this.groups.set(cropId, {
                stem: this._makeBatch(this.stemGeo, stemMat, capacity * 12),
                head: this._makeBatch(this.headGeoByCrop[cropId] || this.stemGeo, headMat, capacity * 4),
                plants: []      // { x, z, scale, stage, cropId }
            });
        }

        // كائنات معاد استخدامها — لا تخصيص داخل الحلقة (P5)
        this._m = new THREE.Matrix4();
        this._q = new THREE.Quaternion();
        this._e = new THREE.Euler();
        this._v = new THREE.Vector3();
        this._sc = new THREE.Vector3();
        this._c = new THREE.Color();
    }

    _makeBatch(geo, mat, count) {
        const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, count));
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.count = 0;
        mesh.visible = false;
        mesh.frustumCulled = false;
        this.scene.add(mesh);
        return mesh;
    }

    markDirty() {
        this.dirty = true;
    }

    /** إظهار/إخفاء كل الدفعات (دخول/خروج البيت). */
    setVisible(visible) {
        this._visible = !!visible;
        this.beds.visible = this._visible && this.beds.count > 0;
        for (const group of this.groups.values()) {
            group.stem.visible = this._visible && group.stem.count > 0;
            group.head.visible = this._visible && group.head.count > 0;
        }
    }

    _setColor(mesh, i, hex) {
        this._c.setHex(hex);
        mesh.setColorAt(i, this._c);
    }

    /** يعيد تعبئة كل الدفعات من حالة FarmingSystem الحالية. */
    rebuild(fieldMeshes) {
        this.dirty = false;
        this.readyCount = 0;

        for (const g of this.groups.values()) g.plants.length = 0;

        let bedIndex = 0;
        const bedMesh = this.beds;

        for (const [fieldId, entry] of fieldMeshes.entries()) {
            const field = entry.fieldData;
            if (!field || !field.purchased || !field.prepared) continue;

            const slots = FarmingSystem.getOrCreateSlots(fieldId);

            for (let i = 0; i < slots.length; i++) {
                const slot = slots[i];
                const wx = field.posX + slot.ox;
                const wz = field.posZ + slot.oz;

                // سرير التربة (لون داكن رطب عند الري)
                if (bedIndex < this.bedCapacity) {
                    this._m.makeTranslation(wx, 0.035, wz);
                    bedMesh.setMatrixAt(bedIndex, this._m);
                    this._setColor(bedMesh, bedIndex, slot.watered ? 0x3d2310 : 0x543217);
                    bedIndex++;
                }

                if (slot.state === 'empty' || !slot.cropType) continue;

                const group = this.groups.get(slot.cropType);
                if (!group) continue;
                if (group.plants.length >= this.capacity) continue;

                group.plants.push({
                    x: wx,
                    z: wz,
                    slot,
                    stage: this._stageOf(slot),
                    spin: (fieldId.length + i) % 7
                });

                if (slot.state === 'ready') this.readyCount++;
            }
        }

        bedMesh.count = bedIndex;
        bedMesh.visible = this._visible && bedIndex > 0;
        bedMesh.instanceMatrix.needsUpdate = true;
        if (bedMesh.instanceColor) bedMesh.instanceColor.needsUpdate = true;

        for (const [cropId, group] of this.groups.entries()) {
            this._writeGroup(cropId, group);
        }
    }

    _stageOf(slot) {
        if (slot.state === 'ready') return 'ready';
        if (slot.state === 'withered') return 'withered';

        const def = CROPS_DEFINITIONS[slot.cropType] || CROPS_DEFINITIONS.wheat;
        const total = def.growTime * 1000;
        const progress = Math.min(1, Math.max(0, 1 - (slot.readyAt - Date.now()) / total));
        return progress < 0.4 ? 'sprout' : 'growing';
    }

    _colorFor(cropId, stage) {
        if (stage === 'withered') return WITHERED_COLOR;
        const def = CROPS_DEFINITIONS[cropId] || CROPS_DEFINITIONS.wheat;
        return (def.colors && def.colors[stage]) || def.colors.ready;
    }

    _writeGroup(cropId, group) {
        const stemCount = group.plants.length * 3;
        const headCount = group.plants.length;

        group.stem.count = stemCount;
        group.head.count = headCount;
        group.stem.visible = this._visible && stemCount > 0;
        group.head.visible = this._visible && headCount > 0;

        if (headCount === 0) return;

        const def = CROPS_DEFINITIONS[cropId] || CROPS_DEFINITIONS.wheat;
        let si = 0;

        for (let pi = 0; pi < group.plants.length; pi++) {
            const plant = group.plants[pi];
            const stage = plant.stage;
            const base = STAGE_SCALE[stage] ?? 1;
            const color = this._colorFor(cropId, stage);
            const headColor = stage === 'ready' ? color : def.colors.growing;

            for (let k = 0; k < 3; k++) {
                const ang = (k / 3) * Math.PI * 2 + plant.spin * 0.4;
                const h = 0.62 * base;
                this._v.set(plant.x + Math.cos(ang) * 0.24, h / 2 + 0.06, plant.z + Math.sin(ang) * 0.24);
                this._e.set(0, ang, Math.sin(ang) * 0.12);
                this._q.setFromEuler(this._e);
                this._sc.set(1, h, 1);
                this._m.compose(this._v, this._q, this._sc);
                group.stem.setMatrixAt(si, this._m);
                this._setColor(group.stem, si, color);
                si++;
            }

            const headY = 0.62 * base + 0.14;
            this._v.set(plant.x, headY, plant.z);
            this._e.set(0, plant.spin, HEAD_TILT[cropId] || 0);
            this._q.setFromEuler(this._e);
            const hs = cropId === 'tomato' ? base : Math.max(0.45, base);
            this._sc.set(hs, hs, hs);
            this._m.compose(this._v, this._q, this._sc);
            group.head.setMatrixAt(pi, this._m);
            this._setColor(group.head, pi, headColor);
        }

        group.stem.instanceMatrix.needsUpdate = true;
        group.head.instanceMatrix.needsUpdate = true;
        if (group.stem.instanceColor) group.stem.instanceColor.needsUpdate = true;
        if (group.head.instanceColor) group.head.instanceColor.needsUpdate = true;
    }

    /** نبض خفيف للمحاصيل الناضجة فقط — بلا إعادة بناء كاملة. */
    pulse(elapsed) {
        if (this.readyCount === 0) return;
        const wobble = 1 + Math.sin(elapsed * 4.2) * 0.07;

        for (const [cropId, group] of this.groups.entries()) {
            let touched = false;
            for (let pi = 0; pi < group.plants.length; pi++) {
                const plant = group.plants[pi];
                if (plant.stage !== 'ready') continue;
                touched = true;
                const hs = Math.max(0.45, STAGE_SCALE.ready) * wobble;
                this._v.set(plant.x, 0.62 * STAGE_SCALE.ready + 0.14, plant.z);
                this._e.set(0, plant.spin, HEAD_TILT[cropId] || 0);
                this._q.setFromEuler(this._e);
                this._sc.set(hs, hs, hs);
                this._m.compose(this._v, this._q, this._sc);
                group.head.setMatrixAt(pi, this._m);
            }
            if (touched) group.head.instanceMatrix.needsUpdate = true;
        }
    }

    update(delta, elapsed, fieldMeshes) {
        if (this.dirty) this.rebuild(fieldMeshes);
        this.pulse(elapsed);
    }
}

