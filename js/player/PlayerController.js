/**
 * ============================================================
 * js/player/PlayerController.js — وحدة التحكّم باللاعب (MF-12 استخراج)
 * ============================================================
 * كان الصنف يعيش داخل js/main.js؛ فُصل حرفيًا (السلوك كما هو، سطرًا بسطر)
 * تسهيلًا للقراءة والصيانة — نقلة «معمارية» بلا أي تغيير وظيفي.
 * واجهة الاستخدام نفسها: new PlayerController(scene, { collision }).
 * ============================================================
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Time } from '../core/TimeManager.js';
import { WORLD_BOUNDS } from '../world/FarmLayout.js';

/** حدود المزرعة (clamp اللاعب) — تُستبدل بحدود الغرفة داخل البيت عند الدخول. */
export const FARM_BOUNDS = Object.freeze({
    minX: WORLD_BOUNDS.minX,
    maxX: WORLD_BOUNDS.maxX,
    minZ: WORLD_BOUNDS.minZ,
    maxZ: WORLD_BOUNDS.maxZ
});

/** إعدادات حركة اللاعب/النموذج كما كانت معرّفة ضمن CONFIG في main.js (بلا تعديل). */
export const PLAYER_CONFIG = Object.freeze({
    walkSpeed: 3.4,
    runSpeed: 5.6,
    turnSpeed: 13.0,
    acceleration: 9.5,
    deceleration: 11.5,
    baseWalkAnimSpeed: 2.0,
    modelScale: 1.0,
    modelPath: './assets/models/farmer.glb'
});

/* ============================================================
   PLAYER CONTROLLER WITH SCALED HAND TOOL ATTACHMENT
   ============================================================ */
/** إزاحة الشمس الافتراضية قبل أول tick لدورة النهار/الليل. */
const DEFAULT_SUN_OFFSET = Object.freeze({ x: 22, y: 38, z: 18 });

/**
 * نقطة الظهور: على الممر الرئيسي داخل البوابة الجنوبية، فيرى اللاعب
 * المزرعة ممتدة شمالًا (البيت يسارًا، الحقول يمينًا، الطاحونة أمامه).
 */
const PLAYER_SPAWN = Object.freeze({ x: 0, z: 20 });

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

/* FARM_BOUNDS معرّفة ومُصدَّرة أعلى الملف (MF-12). */

export class PlayerController {
    constructor(scene, { collision = null } = {}) {
        this.scene = scene;
        this.collision = collision;
        this.root = new THREE.Group();
        this.root.name = 'Player';
        this.root.position.set(PLAYER_SPAWN.x, 0, PLAYER_SPAWN.z);
        this.root.rotation.y = Math.PI; // يواجه الشمال (قلب المزرعة)
        this.scene.add(this.root);

        /*
         * حدود الحركة قابلة للتبديل: المزرعة أو داخل البيت.
         * (كانت ±30 مثبتة في update ⇒ تكسر الدخول للبيت عند z=400.)
         */
        this.bounds = { ...FARM_BOUNDS };

        this.model = null;
        this.mixer = null;
        this.actions = {};
        this.clipNames = { idle: null, walk: null, run: null, interact: null };
        this.currentAction = null;
        this.currentState = 'idle';

        this.handSocket = null;
        this.toolAnchor = new THREE.Group();
        this.toolAnchor.name = 'ToolAnchor';
        this.equippedToolMesh = null;
        this.equippedItem = null;
        this.toolRestRotation = new THREE.Euler(-Math.PI / 2, 0, Math.PI / 2);

        this.currentSpeed = 0.0;
        this.targetSpeed = 0.0;
        this.moveDirection = new THREE.Vector3();
        this.isMoving = false;
        this.radius = 0.42;

        // قفزة بسيطة (زر ⤴️ أسفل اليمين) — جاذبية على محور y فقط
        this.verticalVelocity = 0.0;
        this.isGrounded = true;
        this.jumpSpeed = 5.2;
        this.gravity = 14.0;

        this.loadModel();
    }

    /** استبدال حدود الحركة (مزرعة ↔ داخل البيت). */
    setBounds(bounds) {
        if (!bounds) return;
        this.bounds = { ...bounds };
        // تصحيح فوري إن كان اللاعب خارج الحدود الجديدة
        this.root.position.x = THREE.MathUtils.clamp(this.root.position.x, this.bounds.minX, this.bounds.maxX);
        this.root.position.z = THREE.MathUtils.clamp(this.root.position.z, this.bounds.minZ, this.bounds.maxZ);
    }

    /** قفزة إن كان اللاعب على الأرض. @returns {boolean} هل نفّذنا قفزة */
    jump() {
        if (!this.isGrounded) return false;
        this.isGrounded = false;
        this.verticalVelocity = this.jumpSpeed;
        return true;
    }

    _updateJump(delta) {
        if (this.isGrounded) return;

        this.verticalVelocity -= this.gravity * delta;
        this.root.position.y += this.verticalVelocity * delta;

        if (this.root.position.y <= 0) {
            this.root.position.y = 0;
            this.verticalVelocity = 0;
            this.isGrounded = true;
        }
    }

    loadModel() {
        const loader = new GLTFLoader();
        loader.load(
            PLAYER_CONFIG.modelPath,
            (gltf) => {
                this.model = gltf.scene;
                this.model.scale.setScalar(PLAYER_CONFIG.modelScale);
                this.model.position.set(0, 0, 0);

                this.model.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });
                this.root.add(this.model);
                this.bindHandSocket();
                this.equipItem({ id: 'axe', type: 'tool' });
                this.setupAnimations(gltf);
                console.log('[MY FARM] Character model loaded.');
            },
            undefined,
            () => {
                this.createFallbackAvatar();
                this.bindHandSocket();
                this.equipItem({ id: 'axe', type: 'tool' });
            }
        );
    }

    createFallbackAvatar() {
        const group = new THREE.Group();
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x245582, roughness: 0.8 });
        const shirtMat = new THREE.MeshStandardMaterial({ color: 0xd3392a, roughness: 0.75 });
        const skinMat = new THREE.MeshStandardMaterial({ color: 0xffcc99, roughness: 0.65 });
        const hatMat = new THREE.MeshStandardMaterial({ color: 0xdfbe64, roughness: 0.9 });
        const bootMat = new THREE.MeshStandardMaterial({ color: 0x422612, roughness: 0.85 });

        const body = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.85, 0.48), shirtMat);
        body.position.y = 1.05;
        body.castShadow = true;
        group.add(body);

        const bib = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.58, 0.52), bodyMat);
        bib.position.y = 0.96;
        group.add(bib);

        const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), skinMat);
        head.position.y = 1.78;
        head.castShadow = true;
        group.add(head);

        const eyeGeo = new THREE.BoxGeometry(0.09, 0.09, 0.05);
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
        const lEye = new THREE.Mesh(eyeGeo, eyeMat);
        lEye.position.set(-0.14, 1.80, 0.29);
        const rEye = lEye.clone();
        rEye.position.set(0.14, 1.80, 0.29);
        group.add(lEye);
        group.add(rEye);

        const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.08, 14), hatMat);
        brim.position.y = 2.10;
        brim.castShadow = true;
        group.add(brim);

        const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.5, 0.38, 14), hatMat);
        crown.position.y = 2.30;
        crown.castShadow = true;
        group.add(crown);

        const lBoot = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.22, 0.35), bootMat);
        lBoot.position.set(-0.18, 0.12, 0.04);
        const rBoot = lBoot.clone();
        rBoot.position.set(0.18, 0.12, 0.04);
        group.add(lBoot);
        group.add(rBoot);

        const rightArm = new THREE.Group();
        rightArm.name = 'Wrist.R';
        rightArm.position.set(0.42, 1.12, 0.12);
        group.add(rightArm);

        this.model = group;
        this.root.add(this.model);
    }

    /**
     * Bind the tool anchor to the farmer's right-hand bone (Wrist.R).
     * Falls back to a shoulder-height grip if the GLB has no skeleton.
     */
    bindHandSocket() {
        this.handSocket = null;
        if (this.model) {
            this.model.traverse((node) => {
                if (this.handSocket) return;
                const name = node.name || '';
                if (
                    name === 'Wrist.R' ||
                    name === 'Hand.R' ||
                    /wrist\.r/i.test(name) ||
                    /right.?hand/i.test(name)
                ) {
                    this.handSocket = node;
                }
            });
        }

        if (this.toolAnchor.parent) this.toolAnchor.parent.remove(this.toolAnchor);

        if (this.handSocket) {
            this.handSocket.add(this.toolAnchor);
            // الأداة داخل القبضة: ملاصقة لعظمة الرسغ لا طافية بجانبها.
            this.toolAnchor.position.set(0, 0.012, 0.008);
            this.toolAnchor.rotation.copy(this.toolRestRotation);
        } else {
            this.root.add(this.toolAnchor);
            this.toolAnchor.position.set(0.34, 0.95, 0.12);
            this.toolAnchor.rotation.set(Math.PI / 6, 0, -Math.PI / 12);
            this.toolRestRotation.copy(this.toolAnchor.rotation);
        }
    }

    buildToolMesh(item) {
        const id = item?.id || 'axe';
        const type = item?.type || 'tool';
        const group = new THREE.Group();
        group.name = `tool-${id}`;

        const wood = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.9 });
        const metal = new THREE.MeshStandardMaterial({ color: 0xa5a5a5, metalness: 0.7, roughness: 0.3 });
        const tin = new THREE.MeshStandardMaterial({ color: 0x6e8ea8, metalness: 0.45, roughness: 0.4 });
        const cloth = new THREE.MeshStandardMaterial({ color: 0xc9782a, roughness: 0.85 });

        if (id === 'pickaxe' || id === 'hoe') {
            const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.46, 6), wood);
            group.add(handle);
            const head = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.05), metal);
            head.position.set(0.04, 0.2, 0);
            head.castShadow = true;
            group.add(head);
            const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 6), metal);
            tip.rotation.z = Math.PI / 2;
            tip.position.set(0.14, 0.2, 0);
            group.add(tip);
        } else if (id === 'water_can' || id === 'watering_can') {
            const can = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.12, 8), tin);
            can.position.y = 0.04;
            group.add(can);
            const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, 0.16, 6), tin);
            spout.rotation.z = Math.PI / 2.6;
            spout.position.set(0.1, 0.08, 0);
            group.add(spout);
            const handle = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.01, 5, 10, Math.PI), wood);
            handle.rotation.x = Math.PI / 2;
            handle.position.set(-0.02, 0.12, 0);
            group.add(handle);
        } else if (type === 'seed') {
            const pouch = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), cloth);
            pouch.scale.set(1, 0.85, 0.8);
            group.add(pouch);
            const tie = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.04, 6), wood);
            tie.position.y = 0.06;
            group.add(tie);
        } else {
            const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.42, 6), wood);
            group.add(handle);
            const blade = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.11, 0.10), metal);
            blade.position.set(0, 0.15, 0.04);
            blade.castShadow = true;
            group.add(blade);
        }

        group.traverse((child) => {
            if (child.isMesh) child.castShadow = true;
        });
        return group;
    }

    equipItem(item) {
        if (!this.toolAnchor) return;
        // MF-08: لا ضربة معلّقة تُكمل مسارها فوق أداة مختلفة
        this.cancelToolSwing();
        while (this.toolAnchor.children.length) {
            this.toolAnchor.remove(this.toolAnchor.children[0]);
        }
        this.equippedItem = item || null;
        if (!item) {
            this.equippedToolMesh = null;
            return;
        }
        const tool = this.buildToolMesh(item);
        this.toolAnchor.add(tool);
        this.equippedToolMesh = tool;
    }

    /**
     * MF-08 — ضربة الأداة tween يقوده delta (لا setTimeout متداخلة).
     * التايم-آوتات (110/240ms) كانت تنكسر مع الارتجاف وتبديل الأداة
     * وتتسرّب عبر تفكيك المشهد؛ الإلغاء الآن فوري وآمن.
     */
    playToolSwing() {
        if (!this.toolAnchor) return;
        this._swingT = 0;
        this.toolAnchor.rotation.x = this.toolRestRotation.x - 0.95;

        if (this.clipNames.interact && this.actions[this.clipNames.interact]) {
            const action = this.actions[this.clipNames.interact];
            action.reset().setLoop(THREE.LoopOnce, 1).play();
        }
    }

    /** إلغاء الضربة فورًا — يُنادى من equipItem() وتفكيك المشهد (MF-08). */
    cancelToolSwing() {
        this._swingT = null;
        if (this.toolAnchor) this.toolAnchor.rotation.copy(this.toolRestRotation);
    }

    /** قيادة الضربة بالـ delta — مراحل: رفع ← ضربة ← عودة للراحة. */
    _updateToolSwing(delta) {
        if (this._swingT == null || !this.toolAnchor) return;
        this._swingT += delta * 1000;
        const rest = this.toolRestRotation;
        const t = this._swingT;

        if (t < 110) {
            this.toolAnchor.rotation.x = rest.x - 0.95;
        } else if (t < 240) {
            this.toolAnchor.rotation.x = THREE.MathUtils.lerp(rest.x - 0.95, rest.x + 0.35, (t - 110) / 130);
        } else if (t < 340) {
            this.toolAnchor.rotation.x = THREE.MathUtils.lerp(rest.x + 0.35, rest.x, (t - 240) / 100);
        } else {
            this.toolAnchor.rotation.copy(rest);
            this._swingT = null;
        }
    }

    setupAnimations(gltf) {
        if (!gltf.animations || gltf.animations.length === 0) return;
        this.mixer = new THREE.AnimationMixer(this.model);
        gltf.animations.forEach((clip) => {
            this.actions[clip.name] = this.mixer.clipAction(clip);
        });

        const resolveClip = (keywords) => {
            for (const name of Object.keys(this.actions)) {
                const lower = name.toLowerCase();
                if (keywords.some((kw) => lower.includes(kw))) return name;
            }
            return null;
        };

        this.clipNames.idle = resolveClip(['idle_neutral', 'idle', 'stand', 'wait', 'rest']) || Object.keys(this.actions)[0];
        this.clipNames.walk = resolveClip(['walk', 'walking', 'move', 'stride']) || this.clipNames.idle;
        this.clipNames.run = resolveClip(['run', 'running', 'sprint']);
        this.clipNames.interact = resolveClip(['interact', 'punch_right', 'sword_slash']);

        if (this.clipNames.idle && this.actions[this.clipNames.idle]) {
            const idleAction = this.actions[this.clipNames.idle];
            idleAction.setEffectiveWeight(1.0);
            idleAction.play();
            this.currentAction = idleAction;
            this.currentState = 'idle';
        }
    }

    transitionTo(nextState, duration = 0.22) {
        if (this.currentState === nextState) return;
        const clipName = this.clipNames[nextState];
        if (!clipName || !this.actions[clipName]) return;

        const nextAction = this.actions[clipName];
        const previousAction = this.currentAction;

        if (previousAction && previousAction !== nextAction) {
            previousAction.fadeOut(duration);
        }

        nextAction.reset().setEffectiveTimeScale(1.0).setEffectiveWeight(1.0).fadeIn(duration).play();
        this.currentAction = nextAction;
        this.currentState = nextState;
    }

    update(delta, inputVector) {
        const hasInput = inputVector.lengthSq() > 0.001;
        if (hasInput) {
            this.moveDirection.copy(inputVector).normalize();
            this.targetSpeed = PLAYER_CONFIG.walkSpeed;
            this.isMoving = true;
        } else {
            this.targetSpeed = 0.0;
            this.isMoving = false;
        }

        const smoothingRate = hasInput ? PLAYER_CONFIG.acceleration : PLAYER_CONFIG.deceleration;
        this.currentSpeed = THREE.MathUtils.damp(this.currentSpeed, this.targetSpeed, smoothingRate, delta);

        if (!hasInput && this.currentSpeed < 0.005) {
            this.currentSpeed = 0.0;
        }

        if (this.currentSpeed > 0.0) {
            const displacement = this.currentSpeed * delta;
            const nextX = this.root.position.x + this.moveDirection.x * displacement;
            const nextZ = this.root.position.z + this.moveDirection.z * displacement;

            let x = nextX;
            let z = nextZ;
            if (this.collision) {
                const resolved = this.collision.resolveCircle(
                    this.root.position.x,
                    this.root.position.z,
                    nextX,
                    nextZ,
                    this.radius
                );
                x = resolved.x;
                z = resolved.z;
            }

            const b = this.bounds;
            this.root.position.x = THREE.MathUtils.clamp(x, b.minX, b.maxX);
            this.root.position.z = THREE.MathUtils.clamp(z, b.minZ, b.maxZ);

            const targetAngle = Math.atan2(this.moveDirection.x, this.moveDirection.z);
            let currentAngle = this.root.rotation.y;
            let diff = (targetAngle - currentAngle) % (Math.PI * 2);
            if (diff < -Math.PI) diff += Math.PI * 2;
            if (diff > Math.PI) diff -= Math.PI * 2;
            this.root.rotation.y += diff * Math.min(1.0, PLAYER_CONFIG.turnSpeed * delta);
        }

        if (this.currentSpeed > 0.12) {
            this.transitionTo('walk', 0.2);
            if (this.currentAction && this.currentState === 'walk') {
                const stepFrequency = this.currentSpeed / PLAYER_CONFIG.baseWalkAnimSpeed;
                this.currentAction.setEffectiveTimeScale(
                    THREE.MathUtils.clamp(stepFrequency, 0.75, 1.35)
                );
            }
        } else {
            this.transitionTo('idle', 0.25);
        }

        if (this.mixer) {
            this.mixer.update(delta);
        }

        this._updateToolSwing(delta); // MF-08: حركة الأداة بالـ delta
        this._updateJump(delta);
    }
}


