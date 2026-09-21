/**
 * ============================================================
 * ProductionPanel.js — لوحة الإنتاج العائمة (Bottom Sheet)
 * ============================================================
 * Pure UI layer — ZERO THREE.js imports.
 *  - Recipe cards with ingredients, timers, lock states
 *  - Queue slots with live conic-gradient progress rings
 *  - Collect buttons with sound + toast feedback
 *  - Floating world-anchored chips above buildings
 *    (⏳ timer / ✅ ready), updated via injected projector
 *
 * Dependencies are injected: GameState, Events,
 * ProductionSystem, SoundFX, Toast — nothing hard-wired.
 * ============================================================
 *   QA-§1b — فقاعة tick تسجّل تعذّر القراءة بدل البلع الصامت.
 */
import { getBuilding, getItem, RECIPES } from '../data/GameData.js';
import { Logger } from '../core/Logger.js';
import { formatTime, formatNumber } from '../utils/Utils.js';

export class ProductionPanel {
    constructor({
        events,
        gameState,
        productionSystem,
        soundFX = null,
        toast = null,
        projector = null,          // (x, z, height) -> { x, y, visible }
        getBuildingWorldPos = null // (instanceId) -> { x, z } | null
    }) {
        this.Events = events;
        this.GameState = gameState;
        this.Production = productionSystem;
        this.SFX = soundFX;
        this.ToastBox = toast;
        this.projector = projector;
        this.getBuildingWorldPos = getBuildingWorldPos;

        this._root = null;
        this._overlay = null;
        this._panel = null;
        this._chipLayer = null;
        this._open = false;
        this._instanceId = null;
        this._rafId = null;
        this._lastRenderedSec = -1;
        this._chipNodes = new Map();

        this._bindEvents();
    }

    /* ========================================================
       EVENTS — فتح/غلق/تحديث انعكاسي
       ======================================================== */
    _bindEvents() {
        this.Events.on('production:building-selected', (hit) => this.open(hit));
        this.Events.on('production:deselect', () => this.close());
        for (const ev of ['production:started', 'production:ready', 'production:completed', 'production:cancelled']) {
            this.Events.on(ev, () => { if (this._open) this._renderBody(); });
        }
    }

    mount(parent) {
        if (this._root) return this;

        // طبقة الفقاعات فوق المباني
        this._chipLayer = document.createElement('div');
        this._chipLayer.className = 'prod-chip-layer';

        // الخلفية المعتمة
        this._overlay = document.createElement('div');
        this._overlay.className = 'prod-overlay';
        this._overlay.addEventListener('click', () => this.close());

        // اللوحة نفسها
        this._panel = document.createElement('div');
        this._panel.className = 'prod-sheet';
        this._panel.setAttribute('role', 'dialog');
        this._panel.addEventListener('click', (e) => e.stopPropagation());

        this._overlay.appendChild(this._panel);

        this._root = document.createElement('div');
        this._root.className = 'prod-ui-root';
        this._root.appendChild(this._chipLayer);
        this._root.appendChild(this._overlay);
        (parent || document.body).appendChild(this._root);

        this._startLoop();
        return this;
    }

    /* ========================================================
       OPEN / CLOSE
       ======================================================== */
    open(hit) {
        if (!hit || !hit.instanceId) return;
        this._instanceId = hit.instanceId;
        this._open = true;
        this._renderShell();
        this._overlay.classList.add('open');
        this._panel.classList.add('open');
        this.SFX?.play('open');
    }

    close() {
        if (!this._open) return;
        this._open = false;
        this._instanceId = null;
        this._overlay.classList.remove('open');
        this._panel.classList.remove('open');
        this.SFX?.play('close');
    }

    /* ========================================================
       RENDER — هيكل ثابت + جسم متجدد
       ======================================================== */
    _instance() {
        const buildings = this.GameState.get('farm.buildings') || [];
        return buildings.find(b => b.id === this._instanceId) || null;
    }

    _renderShell() {
        const inst = this._instance();
        if (!inst) { this.close(); return; }
        const def = getBuilding(inst.typeId) || {};
        const slots = this.Production.getProductions(this._instanceId);
        const queueLimit = inst.queueLimit || def.queueLimit || 3;

        this._panel.innerHTML = `
            <div class="prod-handle"></div>
            <header class="prod-header">
                <div class="prod-title">
                    <span class="prod-icon">${def.icon || '🏭'}</span>
                    <div class="prod-names">
                        <h2>${def.name || inst.typeId}</h2>
                        ${def.epithet ? `<p class="prod-epithet">«${def.epithet}»</p>` : ''}
                    </div>
                </div>
                <div class="prod-header-meta">
                    <span class="prod-level">مستوى ${inst.level || 1}</span>
                    <button type="button" class="prod-close" aria-label="إغلاق">✕</button>
                </div>
            </header>
            <section class="prod-queue-wrap">
                <div class="prod-queue" role="list"></div>
                <p class="prod-queue-hint">الخانات: ${slots.length}/${queueLimit}</p>
            </section>
            <section class="prod-recipes" aria-label="الوصفات"></section>
        `;

        this._panel.querySelector('.prod-close')
            .addEventListener('click', () => this.close());

        this._renderBody();
    }

    _renderBody() {
        if (!this._open || !this._panel) return;
        this._renderQueue();
        this._renderRecipes();
    }

    /* ---------- خانات الإنتاج ---------- */
    _renderQueue() {
        const queueEl = this._panel.querySelector('.prod-queue');
        if (!queueEl) return;

        const inst = this._instance();
        if (!inst) return;
        const def = getBuilding(inst.typeId) || {};
        const queueLimit = inst.queueLimit || def.queueLimit || 3;
        const jobs = this.Production.getProductions(this._instanceId);
        const now = Date.now();

        let html = '';
        for (let i = 0; i < queueLimit; i++) {
            const job = jobs[i];
            if (!job) {
                html += `<div class="prod-slot empty" role="listitem"><span>+</span></div>`;
                continue;
            }
            const recipe = RECIPES[job.recipeId] || {};
            const item = getItem(job.outputItem) || {};
            const ready = job.state === 'ready' || now >= job.readyAt;

            if (ready) {
                html += `
                <div class="prod-slot ready" role="listitem" data-job="${job.id}">
                    <span class="prod-slot-icon">${item.icon || recipe.icon || '📦'}</span>
                    <span class="prod-slot-badge">✅</span>
                    <button type="button" class="prod-collect" data-collect="${job.id}">استلام</button>
                </div>`;
            } else {
                const total = Math.max(1, job.duration || 1);
                const left = Math.max(0, (job.readyAt - now) / 1000);
                const pct = Math.min(100, ((total - (job.readyAt - now)) / total) * 100);
                html += `
                <div class="prod-slot working" role="listitem" data-job="${job.id}"
                     data-ready-at="${job.readyAt}" data-duration="${total}">
                    <div class="prod-ring" style="--p:${pct.toFixed(1)}">
                        <span class="prod-slot-icon">${item.icon || recipe.icon || '⏳'}</span>
                    </div>
                    <span class="prod-slot-time">${formatTime(left)}</span>
                </div>`;
            }
        }
        queueEl.innerHTML = html;

        queueEl.querySelectorAll('[data-collect]').forEach(btn => {
            btn.addEventListener('click', () => this._collect(btn.dataset.collect));
        });
    }

    /* ---------- الوصفات ---------- */
    _renderRecipes() {
        const wrap = this._panel.querySelector('.prod-recipes');
        if (!wrap) return;

        const inst = this._instance();
        if (!inst) return;

        const level = this.GameState.get('player.level') || 1;
        const items = this.GameState.get('inventory.items') || {};
        const queueLimit = inst.queueLimit || 3;
        const jobs = this.Production.getProductions(this._instanceId);
        const queueFull = jobs.length >= queueLimit;

        const recipes = Object.values(RECIPES)
            .filter(r => r.building === inst.typeId)
            .sort((a, b) => (a.unlockLevel || 1) - (b.unlockLevel || 1));

        let html = '';
        for (const r of recipes) {
            const locked = (r.unlockLevel || 1) > level;
            const outItem = getItem(r.output?.item) || {};

            // مكوّنات + التوفر
            let missing = false;
            const chips = (r.ingredients || []).map(ing => {
                const have = items[ing.item]?.count || 0;
                const need = ing.amount;
                if (have < need) missing = true;
                const ingItem = getItem(ing.item) || {};
                const cls = have >= need ? 'ok' : 'miss';
                return `<span class="prod-ing ${cls}">${ingItem.icon || ''} ${have}/${need}</span>`;
            }).join('');

            const canStart = !locked && !missing && !queueFull;
            const btnLabel = locked
                ? `🔒 مستوى ${r.unlockLevel}`
                : queueFull
                    ? 'القائمة ممتلئة'
                    : `ابدأ ⏱ ${formatTime(r.productionTime)}`;

            html += `
            <article class="prod-recipe ${locked ? 'locked' : ''}">
                <div class="prod-recipe-head">
                    <span class="prod-recipe-icon">${r.icon || outItem.icon || '📦'}</span>
                    <div class="prod-recipe-names">
                        <h3>${r.name}</h3>
                        <p>${r.description || ''}</p>
                    </div>
                    <div class="prod-recipe-meta">
                        <span class="prod-xp">✨ ${r.xp || 0}</span>
                        <span class="prod-price">🪙 ${formatNumber(r.sellPrice || outItem.sellPrice || 0)}</span>
                    </div>
                </div>
                <div class="prod-recipe-foot">
                    <div class="prod-ings">${chips}</div>
                    <button type="button" class="prod-start" data-recipe="${r.id}"
                        ${canStart ? '' : 'disabled'}>
                        ${btnLabel}
                    </button>
                </div>
            </article>`;
        }

        wrap.innerHTML = html;

        wrap.querySelectorAll('[data-recipe]').forEach(btn => {
            btn.addEventListener('click', () => this._start(btn.dataset.recipe));
        });
    }

    /* ========================================================
       ACTIONS
       ======================================================== */
    _start(recipeId) {
        const res = this.Production.startProduction(this._instanceId, recipeId, 1);
        if (res.success) {
            const recipe = RECIPES[recipeId] || {};
            this.SFX?.play('start');
            this.ToastBox?.info(`🏭 بدأ الإنتاج: ${recipe.name || recipeId}`);
            this._renderBody();
        } else {
            this.SFX?.play('error');
            this.ToastBox?.error(this._mapError(res.error));
        }
    }

    _collect(jobId) {
        const res = this.Production.collectProduction(this._instanceId, jobId);
        if (res.success) {
            const item = getItem(res.output.item) || {};
            this.SFX?.play('collect');
            this.ToastBox?.success(
                `+${res.output.amount} ${item.icon || ''} ${item.name || res.output.item}`
            );
            this._renderBody();
        } else {
            this.SFX?.play('error');
            this.ToastBox?.error(this._mapError(res.error));
        }
    }

    _mapError(err) {
        if (!err) return 'حدث خطأ غير متوقع';
        if (err === 'Production queue full') return 'قائمة الإنتاج ممتلئة 🏭';
        if (err === 'Inventory full') return 'المخزن ممتلئ! قم بالبيع أو الترقية 📦';
        const needMatch = err.match(/^Need (\d+) (.+)$/);
        if (needMatch) {
            const item = getItem(needMatch[2]) || {};
            return `تحتاج ${needMatch[1]}× ${item.name || needMatch[2]} ${item.icon || ''}`;
        }
        const levelMatch = err.match(/^Need level (\d+)$/);
        if (levelMatch) return `تحتاج الوصول للمستوى ${levelMatch[1]} 🔒`;
        // بقية أخطاء ProductionSystem — تعريب العرض فقط.
        const map = {
            'Building not found': 'المبنى غير موجود',
            'Recipe not found': 'الوصفة غير موجودة',
            'Invalid amount': 'كمية غير صالحة',
            'Wrong building': 'هذه الوصفة لمبنى آخر',
            'Recipe has no output': 'الوصفة بلا ناتج',
            'No production': 'لا يوجد إنتاج بعد',
            'Production not found': 'المهمة غير موجودة',
            'Production not ready': 'الإنتاج لم يجهز بعد ⏳'
        };
        return map[err] || err;
    }

    /* ========================================================
       FRAME LOOP — تقدّم حي + فقاعات فوق المباني
       ======================================================== */
    _startLoop() {
        if (this._rafId) return;
        const loop = () => {
            this._rafId = requestAnimationFrame(loop);
            this._tickLive();
            this._tickChips();
        };
        this._rafId = requestAnimationFrame(loop);
    }

    /** تحديث الزمن/الحلقات دون إعادة رسم كاملة */
    _tickLive() {
        if (!this._open || !this._panel) return;
        const nowSec = Math.floor(Date.now() / 250);
        if (nowSec === this._lastRenderedSec) return;
        this._lastRenderedSec = nowSec;

        let becameReady = false;
        const now = Date.now();

        for (const slot of this._panel.querySelectorAll('.prod-slot.working')) {
            const readyAt = Number(slot.dataset.readyAt) || 0;
            const total = Number(slot.dataset.duration) || 1;
            const left = Math.max(0, (readyAt - now) / 1000);
            const pct = Math.min(100, ((total - (readyAt - now)) / total) * 100);

            const ring = slot.querySelector('.prod-ring');
            if (ring) ring.style.setProperty('--p', pct.toFixed(1));

            const timeEl = slot.querySelector('.prod-slot-time');
            if (timeEl) timeEl.textContent = formatTime(left);

            if (left <= 0) becameReady = true;
        }

        if (becameReady) {
            this.SFX?.play('ready');
            this._renderBody();
        }
    }

    /** فقاعات الإنتاج فوق المباني في العالم */
    _tickChips() {
        if (!this._chipLayer || !this.projector || !this.getBuildingWorldPos) return;

        let buildings = [];
        try {
            buildings = this.GameState.get('farm.buildings') || [];
        } catch (e) {
            Logger.debug('ProductionPanel', 'chips tick skipped (state not ready)', e);
            return;
        }

        const active = buildings.filter(b => (b.productionQueue || []).length > 0);
        const alive = new Set();

        for (const b of active) {
            const pos = this.getBuildingWorldPos(b.id);
            if (!pos) continue;

            const jobs = b.productionQueue;
            const readyCount = jobs.filter(j => j.state === 'ready' || Date.now() >= j.readyAt).length;
            const producing = jobs.find(j => j.state === 'producing' && Date.now() < j.readyAt);

            let key, label, cls;
            if (readyCount > 0) {
                key = `${b.id}`;
                label = `✅ ${readyCount} جاهز`;
                cls = 'ready';
            } else if (producing) {
                key = `${b.id}`;
                label = `⏳ ${formatTime((producing.readyAt - Date.now()) / 1000)}`;
                cls = 'working';
            } else continue;

            const screen = this.projector(pos.x, pos.z, 3.6);
            if (!screen.visible) continue;

            alive.add(key);
            let chip = this._chipNodes.get(key);
            if (!chip) {
                chip = document.createElement('button');
                chip.type = 'button';
                chip.className = 'prod-chip';
                chip.addEventListener('click', () => {
                    const hit = { instanceId: b.id, typeId: b.typeId, x: pos.x, z: pos.z };
                    this.Events.emit('production:building-selected', hit);
                });
                this._chipLayer.appendChild(chip);
                this._chipNodes.set(key, chip);
            }
            chip.className = `prod-chip ${cls}`;
            chip.textContent = label;
            chip.style.transform = `translate(-50%, -100%) translate(${screen.x}px, ${screen.y}px)`;
        }

        for (const [key, node] of this._chipNodes) {
            if (!alive.has(key)) {
                node.remove();
                this._chipNodes.delete(key);
            }
        }
    }
}

export default ProductionPanel;
