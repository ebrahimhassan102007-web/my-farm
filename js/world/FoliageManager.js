/**
 * ============================================================
 * FoliageManager.js — Instanced grass with a wind vertex shader,
 * wildflowers, and collidable trees.
 * ============================================================
 * Brief §2 «Art quality bar»:
 *   • عشب أكثف مع حركة رياح خفيفة وصبغة موسمية — لا بقع ميتة.
 *   • الشجر يتغيّر لونه مع الفصل (خريف دافئ / شتاء باهت).
 *
 * الميزانية: InstancedMesh واحد للعشب + واحد للخصل + 4 للزهور
 * + 16 للشجر ⇒ ~22 نداء رسم لكل النباتات.
 * ============================================================
 */

import * as THREE from 'three';
import { mergeMeshes } from './MergeUtils.js';
import { isInsidePlayZone } from './FarmLayout.js';

/** كثافة العشب — قابلة للتخفيض على الأجهزة الضعيفة. */
const GRASS_BLADES = 1900;
const GRASS_CANDIDATES = 3400;
const TUFT_COUNT = 340;
const FLOWER_COUNT = 150;

const SEASON_LEAF = Object.freeze({
    spring: [0x3f8f33, 0x54a63c, 0x77bb46],
    summer: [0x2f792e, 0x438f32, 0x65a83a],
    autumn: [0xb5762c, 0xc8912f, 0x8f6a24],
    winter: [0x5d7350, 0x6d8060, 0x4f6446]
});

const SEASON_GRASS = Object.freeze({
    spring: 0x4d9a2c,
    summer: 0x5aa82e,
    autumn: 0x8f9a30,
    winter: 0x527f60
});

/*
 * مضاعِف لون المظلة (canopy) لكل فصل. بعد الدمج تصبح ألوان الأوراق
 * مخبوزة في الرؤوس، فالصبغة الموسمية تُطبَّق كضرب على material.color:
 *   خريف ⇒ دفء أصفر/بني · شتاء ⇒ برودة باهتة · ربيع/صيف ⇒ أبيض.
 */
const SEASON_CANOPY_MULT = Object.freeze({
    spring: 0xffffff,
    summer: 0xffffff,
    autumn: 0xffb85c,
    winter: 0xbfd2c6
});

export class FoliageManager {
    constructor(scene, { collision } = {}) {
        this.scene = scene;
        this.collision = collision || null;
        this.group = new THREE.Group();
        this.group.name = 'foliage';
        scene.add(this.group);

        this.grass = null;
        this._grassUniforms = { uTime: { value: 0 } };
        this._windTime = 0;
        this._season = null;
        this.trees = [];
        this._leafMats = [];
        this._canopyMats = [];

        this.build();
    }

    build() {
        this.buildGrass();
        this.buildTufts();
        this.buildFlowers();
        this.buildTrees();
    }

    /** مناطق يُمنع فيها العشب/الزهور — من خطة zoning واحدة. */
    _isClearOfZones(x, z) {
        return isInsidePlayZone(x, z);
    }

    /**
     * الصبغة الموسمية للعشب والأشجار.
     * @param {number|string} tintOrSeason hex أو اسم فصل
     */
    setSeasonTint(tint, season = null) {
        const resolved = season || this._seasonFromTint(tint);
        if (resolved) this._season = resolved;

        const grassHex = typeof tint === 'number' ? tint : (SEASON_GRASS[this._season] || SEASON_GRASS.summer);
        if (this._bladeMat) this._bladeMat.color.setHex(grassHex);
        if (this._tuftMat) this._tuftMat.color.setHex(grassHex);

        // أوراق غير مدموجة (إن فشل الدمج) ⇒ صبغة مباشرة
        const leaves = SEASON_LEAF[this._season] || SEASON_LEAF.summer;
        this._leafMats.forEach((m, i) => m.color.setHex(leaves[i % leaves.length]));

        // مظلات مدموجة ⇒ مضاعِف لوني موسمي واحد لكل المواد
        const mult = SEASON_CANOPY_MULT[this._season] || 0xffffff;
        for (const m of this._canopyMats) m.color.setHex(mult);

        // الشتاء: زهور أقل (لا حديقة متفتحة في ديسمبر)
        if (this._flowers) {
            const visible = this._season !== 'winter';
            for (const mesh of this._flowers) mesh.visible = visible;
        }
        if (this._stems) this._stems.visible = this._season !== 'winter';
    }

    _seasonFromTint(hex) {
        for (const [season, value] of Object.entries(SEASON_GRASS)) {
            if (value === hex) return season;
        }
        return null;
    }

    buildGrass() {
        // شفرة عشب مدببة — كثافة أعلى مع رياح حقيقية في الـ vertex shader.
        const bladeGeo = new THREE.ConeGeometry(0.045, 0.34, 3);
        bladeGeo.translate(0, 0.17, 0);

        const bladeMat = new THREE.MeshStandardMaterial({
            color: SEASON_GRASS.summer,
            roughness: 1,
            flatShading: true
        });
        this._bladeMat = bladeMat;
        bladeMat.customProgramCacheKey = () => 'wind-grass-v2';
        bladeMat.onBeforeCompile = (shader) => {
            shader.uniforms.uTime = this._grassUniforms.uTime;
            shader.vertexShader = shader.vertexShader
                .replace(
                    '#include <common>',
                    `#include <common>\nuniform float uTime;`
                )
                .replace(
                    '#include <begin_vertex>',
                    `
                    vec3 transformed = vec3(position);
                    float h = max(position.y, 0.0);
                    vec3 worldP = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
                    float gust = sin(uTime * 1.45 + worldP.x * 0.42 + worldP.z * 0.31);
                    float ripple = cos(uTime * 0.9 + worldP.z * 0.55);
                    transformed.x += (gust * 0.55 + ripple * 0.18) * h * h;
                    transformed.z += (cos(uTime * 1.15 + worldP.x * 0.28) * 0.32) * h * h;
                    `
                );
            this._grassShader = shader;
        };

        const points = [];
        for (let i = 0; i < GRASS_CANDIDATES && points.length < GRASS_BLADES; i++) {
            const x = (Math.random() - 0.5) * 74;
            const z = (Math.random() - 0.5) * 74;
            if (!this._isClearOfZones(x, z)) continue;
            points.push([x, z]);
        }
        if (points.length === 0) points.push([30, 30]);

        this.grass = new THREE.InstancedMesh(bladeGeo, bladeMat, points.length);
        const m = new THREE.Matrix4();
        const q = new THREE.Quaternion();
        const s = new THREE.Vector3();
        const p = new THREE.Vector3();
        const e = new THREE.Euler();

        points.forEach(([x, z], i) => {
            e.set(0, Math.random() * 6.28, (Math.random() - 0.5) * 0.14);
            q.setFromEuler(e);
            s.set(0.55 + Math.random() * 0.6, 0.5 + Math.random() * 0.75, 0.55 + Math.random() * 0.6);
            m.compose(p.set(x, 0.02, z), q, s);
            this.grass.setMatrixAt(i, m);
        });

        this.grass.instanceMatrix.setUsage(THREE.StaticDrawUsage);
        this.grass.instanceMatrix.needsUpdate = true;
        this.grass.receiveShadow = true;
        this.grass.castShadow = false;
        this.grass.name = 'Grass-instanced';
        this.group.add(this.grass);
    }

    /** خصل عشب أعرض وأقصر بين الشفرات — نداء رسم واحد. */
    buildTufts() {
        const tuftGeo = new THREE.ConeGeometry(0.11, 0.22, 5);
        tuftGeo.translate(0, 0.11, 0);
        this._tuftMat = new THREE.MeshStandardMaterial({
            color: SEASON_GRASS.summer,
            roughness: 1,
            flatShading: true
        });

        const spots = [];
        for (let i = 0; i < 2200 && spots.length < TUFT_COUNT; i++) {
            const x = (Math.random() - 0.5) * 70;
            const z = (Math.random() - 0.5) * 70;
            if (!this._isClearOfZones(x, z)) continue;
            spots.push([x, z]);
        }
        if (spots.length === 0) return;

        const tufts = new THREE.InstancedMesh(tuftGeo, this._tuftMat, spots.length);
        const m = new THREE.Matrix4();
        const q = new THREE.Quaternion();
        const s = new THREE.Vector3();
        const p = new THREE.Vector3();
        const e = new THREE.Euler();

        spots.forEach(([x, z], i) => {
            e.set(0, Math.random() * 6.28, 0);
            q.setFromEuler(e);
            s.setScalar(0.7 + Math.random() * 0.7);
            m.compose(p.set(x, 0.02, z), q, s);
            tufts.setMatrixAt(i, m);
        });
        tufts.instanceMatrix.setUsage(THREE.StaticDrawUsage);
        tufts.instanceMatrix.needsUpdate = true;
        tufts.receiveShadow = true;
        tufts.name = 'Grass-tufts';
        this.group.add(tufts);
    }

    buildFlowers() {
        // حراسة لعدم تكرار الزهور
        if (this.group.getObjectByName('Flower-stems')) return;

        const spots = [];
        for (let i = 0; i < 2000 && spots.length < FLOWER_COUNT; i++) {
            const x = (Math.random() - 0.5) * 62;
            const z = (Math.random() - 0.5) * 62;
            if (!this._isClearOfZones(x, z)) continue;
            spots.push([x, z]);
        }
        if (spots.length === 0) return;

        const m = new THREE.Matrix4();
        this._stems = new THREE.InstancedMesh(
            new THREE.CylinderGeometry(0.012, 0.018, 0.26, 5),
            new THREE.MeshStandardMaterial({ color: 0x37852d, roughness: 1 }),
            spots.length
        );
        spots.forEach(([x, z], i) => {
            m.makeTranslation(x, 0.13, z);
            this._stems.setMatrixAt(i, m);
        });
        this._stems.instanceMatrix.needsUpdate = true;
        this._stems.name = 'Flower-stems';
        this.group.add(this._stems);

        const flowerGeo = new THREE.SphereGeometry(0.09, 6, 5);
        const colors = [0xfff3a0, 0xffffff, 0xe96d9b, 0x8dc8ff];
        this._flowers = [];
        const perColor = Math.ceil(spots.length / colors.length);

        for (let c = 0; c < colors.length; c++) {
            const mesh = new THREE.InstancedMesh(
                flowerGeo,
                new THREE.MeshStandardMaterial({ color: colors[c], roughness: 0.7 }),
                perColor
            );
            for (let i = 0; i < perColor; i++) {
                const spot = spots[(c * perColor + i) % spots.length];
                m.makeTranslation(spot[0], 0.28, spot[1]);
                mesh.setMatrixAt(i, m);
            }
            mesh.instanceMatrix.needsUpdate = true;
            mesh.name = 'Flowers-' + c;
            this.group.add(mesh);
            this._flowers.push(mesh);
        }
    }

    buildTrees() {
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x68401f, roughness: 1 });
        const palette = SEASON_LEAF.summer;
        this._leafMats = palette.map(
            (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true })
        );

        // أشجار داخل المزرعة — مواضعها خارج كل منطقة بناء/حقول/حظائر.
        const coords = [
            [-26, -18], [-27, 3], [-25, 20], [24, -20],
            [27.5, 4], [26, 22], [-9, -22], [9, -22],
            [-24, 26], [22, 27]
        ];

        coords.forEach(([x, z], n) => {
            const t = new THREE.Group();
            t.position.set(x, 0, z);

            const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.58, 3.8, 8), trunkMat);
            trunk.position.y = 1.9;
            trunk.castShadow = true;
            t.add(trunk);

            // أغصان حقيقية تُدمج مع الجذع في mesh واحد
            const branches = [];
            for (let b = 0; b < 3; b++) {
                const a = (b / 3) * Math.PI * 2 + n * 0.8;
                const br = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 1.35, 6), trunkMat);
                br.position.set(Math.cos(a) * 0.6, 3.05, Math.sin(a) * 0.6);
                br.rotation.z = Math.cos(a) * 0.75;
                br.rotation.x = -Math.sin(a) * 0.75;
                br.castShadow = true;
                t.add(br);
                branches.push(br);
            }
            mergeMeshes([trunk, ...branches], { name: `Tree-${n}-trunk` });

            /*
             * 4 كتل أوراق لكل شجرة ⇒ تُدمج في mesh واحد بألوان رؤوس.
             * المواد محفوظة في _leafMats لتغيير الفصل (لكن الدمج يخبز
             * اللون، لذلك نعيد الصبغة عبر material.color على الكتلة المدموجة).
             */
            const leaves = [];
            const leafMats = [];
            [[0, 4.4, 0, 1.9], [-1.1, 4.1, 0, 1.4], [1.1, 4.2, 0.2, 1.5], [0, 5.2, 0, 1.35]].forEach((a, j) => {
                const leafMat = this._leafMats[(j + n) % this._leafMats.length];
                const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(a[3], 1), leafMat);
                leaf.position.set(a[0], a[1], a[2]);
                leaf.castShadow = true;
                t.add(leaf);
                leaves.push(leaf);
                leafMats.push(leafMat);
            });
            const merged = mergeMeshes(leaves, { name: `Tree-${n}-leaves` });
            if (merged.merged) {
                // بعد الدمج مادة واحدة بألوان مخبوزة ⇒ تُصبغ بمضاعِف موسمي.
                const canopy = t.children.find((c) => c.name === `Tree-${n}-leaves`);
                if (canopy && canopy.material) this._canopyMats.push(canopy.material);
            }

            this.group.add(t);
            this.trees.push(t);

            if (this.collision) {
                this.collision.addBox({
                    id: `tree-${n}`,
                    x, z,
                    width: 1.25, depth: 1.25, height: 4.4,
                    tag: 'tree'
                });
            }
        });
    }

    update(t) {
        this._windTime = t;
        this._grassUniforms.uTime.value = t;
        for (let i = 0; i < this.trees.length; i++) {
            this.trees[i].rotation.z = Math.sin(t * 0.7 + i) * 0.02;
        }
    }
}

export default FoliageManager;
