/**
 * ============================================================
 * Environment.js — Ground, sky, foliage, buildings, animals
 * ============================================================
 * كل المواضع من FarmLayout.js (مصدر واحد للـ zoning).
 * السماء/الضباب من SkyDome (ساعة حقيقية + فصل حقيقي).
 * ============================================================
 */

import * as THREE from 'three';
import { FoliageManager } from './FoliageManager.js';
import { BuildingManager } from './BuildingManager.js';
import { Animals } from './Animals.js';
import { SkyDome } from './SkyDome.js';
import { CollisionEngine } from '../core/CollisionEngine.js';
import { mergeGroupChildren, mergeMeshes, mergeSubtree } from './MergeUtils.js';
import {
    PATHS,
    POND,
    PRODUCTION_COURT,
    WORLD_BOUNDS
} from './FarmLayout.js';

/** صبغة الأرض/العشب لكل فصل (Brief §0.4 + §2 «seasonal tint»). */
const SEASON_TINTS = Object.freeze({
    spring: { ground: 0x57a035, grass: 0x4d9a2c, rough: 0x77803f },
    summer: { ground: 0x63a83a, grass: 0x5aa82e, rough: 0x8a8a3c },
    autumn: { ground: 0x7f9a3c, grass: 0x8f9a30, rough: 0x917f3a },
    winter: { ground: 0x5c8460, grass: 0x527f60, rough: 0x6f7454 }
});

export class Environment {
    constructor(scene, { collision } = {}) {
        this.scene = scene;
        this.collision = collision || new CollisionEngine();
        this.group = new THREE.Group();
        this.group.name = 'Environment';
        scene.add(this.group);
        this.clouds = [];
        this._season = null;

        this.buildGround();
        this.buildSky();

        this.foliage = new FoliageManager(scene, { collision: this.collision });
        this.buildings = new BuildingManager(scene, { collision: this.collision });
        this.animals = new Animals(scene, { collision: this.collision });
    }

    buildGround() {
        // تُحفظ المواد للصبغة الموسمية (انظر setSeason).
        this.groundMat = new THREE.MeshStandardMaterial({ color: 0x5da437, roughness: 1 });
        const grass = new THREE.Mesh(
            new THREE.PlaneGeometry(150, 150),
            this.groundMat
        );
        grass.rotation.x = -Math.PI / 2;
        grass.receiveShadow = true;
        grass.name = 'Ground';
        this.group.add(grass);

        // --- شبكة الممرات من FarmLayout (العمود الفقري + فروع الأحياء) ---
        this.pathMat = new THREE.MeshStandardMaterial({ color: 0xc49355, roughness: 1 });
        this.rutMat = new THREE.MeshStandardMaterial({ color: 0x986d3e, roughness: 1 });
        const paths = [];
        const ruts = [];

        for (const path of PATHS) {
            const isNS = path.length > path.width;
            const geo = new THREE.PlaneGeometry(path.width, path.length);
            const mesh = new THREE.Mesh(geo, this.pathMat);
            mesh.rotation.x = -Math.PI / 2;
            mesh.position.set(path.x, path.y, path.z);
            mesh.receiveShadow = true;
            mesh.name = `Path-${path.id}`;
            this.group.add(mesh);
            paths.push(mesh);

            // أخدودا عجلات على العمود الفقري فقط (تفصيلة مزرعة حقيقية)
            if (path.id === 'spine') {
                for (const dx of [-1.25, 1.25]) {
                    const rut = new THREE.Mesh(new THREE.PlaneGeometry(0.22, path.length), this.rutMat);
                    rut.rotation.x = -Math.PI / 2;
                    rut.position.set(path.x + dx, path.y + 0.01, path.z);
                    rut.receiveShadow = true;
                    this.group.add(rut);
                    ruts.push(rut);
                }
            }
        }
        if (paths.length > 1) mergeMeshes(paths, { name: 'Paths-merged' });
        if (ruts.length > 1) mergeMeshes(ruts, { name: 'Ruts-merged' });

        // حصى على الممر الرئيسي
        const peb = new THREE.IcosahedronGeometry(0.07, 0);
        const pebbles = new THREE.InstancedMesh(
            peb,
            new THREE.MeshStandardMaterial({ color: 0x80694e }),
            110
        );
        const mt = new THREE.Matrix4();
        for (let i = 0; i < 110; i++) {
            mt.makeTranslation((Math.random() - 0.5) * 4.4, Math.random() * 0.08, (Math.random() - 0.5) * 62);
            pebbles.setMatrixAt(i, mt);
        }
        pebbles.instanceMatrix.needsUpdate = true;
        this.group.add(pebbles);

        // بلاطة ساحة الإنتاج (أرض صلبة أمام الآلات)
        const courtSlab = new THREE.Mesh(
            new THREE.PlaneGeometry(19, 12),
            new THREE.MeshStandardMaterial({ color: 0xb08d5f, roughness: 1 })
        );
        courtSlab.rotation.x = -Math.PI / 2;
        courtSlab.position.set(PRODUCTION_COURT.machineRow.startX + 6.6, 0.018, PRODUCTION_COURT.machineRow.z - 2.4);
        courtSlab.receiveShadow = true;
        this.group.add(courtSlab);

        this.buildEdge();
    }

    /**
     * حواف العالم: تلال + صف أشجار بعيد + بركة + صخور — حتى لا يسقط
     * البصر في فراغ، وحتى يكون للسور المحيط سبب بصري.
     */
    buildEdge() {
        // --- تلال ناعمة في الأفق (mesh واحد مدموج) ---
        const hillMat = new THREE.MeshStandardMaterial({ color: 0x4c8a2e, roughness: 1 });
        const hills = [];
        for (let i = 0; i < 16; i++) {
            const a = (i / 16) * Math.PI * 2 + 0.22;
            const r = 48 + (i % 3) * 5;
            const hill = new THREE.Mesh(
                new THREE.SphereGeometry(8 + (i % 4) * 1.8, 10, 7),
                hillMat
            );
            hill.position.set(Math.cos(a) * r, -2.6, Math.sin(a) * r);
            hill.scale.y = 0.45;
            this.group.add(hill);
            hills.push(hill);
        }
        mergeMeshes(hills, { name: 'Edge-hills' });

        // --- جبال بعيدة في الأفق (mesh مدموج بلا تكلفة رسم عالية) ---
        const mountainMat = new THREE.MeshStandardMaterial({ color: 0x4e6172, roughness: 0.95 });
        const snowMat = new THREE.MeshStandardMaterial({ color: 0xdde7ee, roughness: 0.8 });
        const mountains = [];
        for (let i = 0; i < 18; i++) {
            const a = (i / 18) * Math.PI * 2 + 0.15;
            const r = 78 + (i % 4) * 6;
            const height = 18 + (i % 5) * 5;
            const radius = 12 + (i % 3) * 3;
            const m = new THREE.Mesh(
                new THREE.ConeGeometry(radius, height, 5),
                mountainMat
            );
            m.position.set(Math.cos(a) * r, height / 2 - 2, Math.sin(a) * r);
            m.rotation.y = i * 0.7;
            this.group.add(m);
            mountains.push(m);

            if (height > 20) {
                const snowH = height * 0.28;
                const snow = new THREE.Mesh(
                    new THREE.ConeGeometry(radius * 0.32, snowH, 5),
                    snowMat
                );
                snow.position.set(Math.cos(a) * r, height - snowH / 2 - 2, Math.sin(a) * r);
                snow.rotation.y = i * 0.7;
                this.group.add(snow);
                mountains.push(snow);
            }
        }
        this.mountains = mergeMeshes(mountains, { name: 'Distant-mountains' });

        // --- صف أشجار بعيد خارج متناول اللاعب (mesh واحد مدموج) ---
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x68401f, roughness: 1 });
        const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f792e, roughness: 1 });
        const treeLine = new THREE.Group();
        treeLine.name = 'TreeLine';
        this.group.add(treeLine);
        for (let i = 0; i < 22; i++) {
            const a = (i / 22) * Math.PI * 2 + 0.1;
            const r = 38 + (i % 2) * 3.5;
            const t = new THREE.Group();
            t.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
            const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.46, 3.2, 6), trunkMat);
            trunk.position.y = 1.6;
            t.add(trunk);
            const c1 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.9, 1), leafMat);
            c1.position.y = 4.0;
            t.add(c1);
            const c2 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.3, 1), leafMat);
            c2.position.set(0.4, 5.1, 0.22);
            t.add(c2);
            treeLine.add(t);
        }
        mergeSubtree(treeLine, { name: 'TreeLine-merged' });

        // --- البركة: رمل + ماء + تصادم ---
        const sand = new THREE.Mesh(
            new THREE.CircleGeometry(POND.sandRadius, 26),
            new THREE.MeshStandardMaterial({ color: 0xd9c08a, roughness: 1 })
        );
        sand.rotation.x = -Math.PI / 2;
        sand.position.set(POND.x, 0.012, POND.z);
        sand.receiveShadow = true;
        this.group.add(sand);

        this.pondWater = new THREE.Mesh(
            new THREE.CircleGeometry(POND.waterRadius, 26),
            new THREE.MeshStandardMaterial({
                color: 0x3f9fd0, roughness: 0.25, metalness: 0.1,
                transparent: true, opacity: 0.85
            })
        );
        this.pondWater.rotation.x = -Math.PI / 2;
        this.pondWater.position.set(POND.x, 0.035, POND.z);
        this.group.add(this.pondWater);

        // قصبات حول البركة
        const reeds = [];
        const reedMat = new THREE.MeshStandardMaterial({ color: 0x6f8f3a, roughness: 1 });
        for (let i = 0; i < 18; i++) {
            const a = (i / 18) * Math.PI * 2;
            const r = POND.waterRadius + 0.35 + (i % 3) * 0.22;
            const reed = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.9 + (i % 4) * 0.16, 4), reedMat);
            reed.position.set(POND.x + Math.cos(a) * r, 0.45, POND.z + Math.sin(a) * r);
            this.group.add(reed);
            reeds.push(reed);
        }
        mergeMeshes(reeds, { name: 'Pond-reeds' });

        if (this.collision) {
            this.collision.addBox({
                id: 'pond', x: POND.x, z: POND.z,
                width: POND.sandRadius * 1.7, depth: POND.sandRadius * 1.7, height: 1,
                tag: 'water'
            });
        }

        // --- صخور متناثرة قرب الحواف (mesh واحد + تصادم لكل صخرة) ---
        const rockMat = new THREE.MeshStandardMaterial({ color: 0x77766f, roughness: 1 });
        const rockSpots = [[27, -22, 1.2], [-27, -12, 1.0], [27, 6, 0.85], [-13, 25, 1.1], [8, -29, 0.9]];
        const rocks = [];
        rockSpots.forEach(([x, z, s], i) => {
            const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rockMat);
            rock.position.set(x, s * 0.42, z);
            rock.rotation.set(i * 1.3, i * 2.1, i * 0.7);
            rock.scale.y = 0.75;
            rock.castShadow = true;
            rock.receiveShadow = true;
            this.group.add(rock);
            rocks.push(rock);
            if (this.collision) {
                this.collision.addBox({
                    id: 'rock-' + i, x, z,
                    width: s * 1.5, depth: s * 1.5, height: 1.6,
                    tag: 'rock'
                });
            }
        });
        mergeMeshes(rocks, { name: 'Edge-rocks' });
    }

    /**
     * صبغة موسمية: أرض + عشب + شمس/ضباب دافئ أو بارد.
     * تُستدعى عند تغيّر الفصل فقط (حدث 'time:season').
     */
    setSeason(season) {
        if (!season) return;
        this._season = season;
        const t = SEASON_TINTS[season] || SEASON_TINTS.summer;

        if (this.groundMat) this.groundMat.color.setHex(t.ground);
        if (this.foliage && typeof this.foliage.setSeasonTint === 'function') {
            this.foliage.setSeasonTint(t.grass, season);
        }
        if (this.animals && typeof this.animals.setSeasonCoat === 'function') {
            // فراء/صوف يتغيّر مع الفصل (Brief §0.4 «animal coats»).
            this.animals.setSeasonCoat(season);
        }
    }

    getSeason() {
        return this._season;
    }

    buildSky() {
        // السماء الحقيقية (تدرّج + نجوم + شمس/قمر + غيوم متحركة)
        this.sky = new SkyDome(this.scene);
    }

    getNearestDoor(position, maxDist = 2.6) {
        return this.buildings?.getNearestDoor(position, maxDist) || null;
    }

    /** تحديث السماء من لقطة الساعة الحقيقية. */
    updateSky(clock, delta, playerPos) {
        if (!this.sky) return;
        this.sky.update(clock, delta, playerPos);
    }

    update(delta, t, clock = null, playerPos = null) {
        if (clock) this.updateSky(clock, delta, playerPos);
        if (this.pondWater) {
            this.pondWater.material.opacity = 0.8 + Math.sin(t * 0.9) * 0.06;
        }
        this.foliage.update(t);
        this.buildings.update(delta);
        this.animals.update(t, delta);
    }
}

export default Environment;
