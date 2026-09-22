/**
 * ============================================================
 * StorageSystem.js — الصوامع والمخزن (Hay Day silo / barn)
 * ============================================================
 * Brief §1 «Storage»:
 *   • الصوامع (Silo): المحاصيل الخام فقط. امتلاؤها يمنع الحصاد.
 *   • المخزن (Barn) : منتجات الحيوانات + المصنّعات + العدد
 *                     + مواد الترقية. امتلاؤه يمنع استلام الآلات
 *                     وجمع منتجات الحيوانات.
 *   • ترقية الاثنين بمواد (مسامير/ألواح/شريط) تُكسب من الحصاد
 *     والطلبات وزوّار الكشك.
 *   • الـ HUD يعرض نسبة امتلاء الصوامع/المخزن لا العملات فقط.
 *
 * الاعتمادات: يقرأ GameState مباشرة (بلا InventorySystem) حتى تبقى
 * العلاقة واحدة الاتجاه: InventorySystem ⇒ StorageSystem.
 *
 * الأحداث:
 *   'storage:changed'   ({ silo, barn })
 *   'storage:full'      ('silo' | 'barn')
 *   'storage:upgraded'  ({ store, level, capacity })
 *   'storage:supply-drop' ({ itemId, amount, source })
 * ============================================================
 */

import { Events } from '../core/EventBus.js';
import { GameState } from '../core/GameState.js';
import {
    getStorageOf,
    STORAGE_CONFIG,
    ITEMS
} from '../data/GameData.js';
import { randPick, randInt } from '../utils/Utils.js';

/** أسماء العرض بالعربية/الإنجليزية. */
export const STORE_LABELS = Object.freeze({
    silo: { ar: 'الصوامع', en: 'Silo', icon: '🌾' },
    barn: { ar: 'المخزن',  en: 'Barn', icon: '🛖' }
});

class StorageSystemService {
    constructor() {
        this._ensureShape();
        Events.on('save:loaded', () => this._ensureShape());
        Events.on('state:reset', () => this._ensureShape());
    }

    /* ========================================================
       SHAPE — ضمان وجود storage في الحالة (حفظ قديم/جديد)
       ======================================================== */

    _ensureShape() {
        const storage = GameState.get('storage');
        if (!storage || !storage.silo || !storage.barn) {
            GameState.set('storage', {
                silo: { level: 1, capacity: STORAGE_CONFIG.baseCapacity },
                barn: { level: 1, capacity: STORAGE_CONFIG.baseCapacity },
                upgrades: 0,
                lastUpgradeAt: 0
            });
            return;
        }

        // السعة مشتقة من المستوى دائمًا — لا نثق بقيمة محفوظة قديمة.
        const siloLevel = this._clampLevel(storage.silo.level);
        const barnLevel = this._clampLevel(storage.barn.level);
        const siloCap = this.capacityForLevel(siloLevel);
        const barnCap = this.capacityForLevel(barnLevel);

        if (storage.silo.capacity !== siloCap || storage.barn.capacity !== barnCap) {
            GameState.set('storage.silo', { level: siloLevel, capacity: siloCap });
            GameState.set('storage.barn', { level: barnLevel, capacity: barnCap });
        }
        this._syncLegacyMirror();
    }

    _clampLevel(level) {
        const n = Math.floor(Number(level) || 1);
        return Math.min(STORAGE_CONFIG.maxLevel, Math.max(1, n));
    }

    capacityForLevel(level) {
        const lvl = this._clampLevel(level);
        return STORAGE_CONFIG.baseCapacity + (lvl - 1) * STORAGE_CONFIG.capacityPerLevel;
    }

    /** مرآة توافقية: inventory.maxCapacity = silo + barn (يقرؤها كود قديم). */
    _syncLegacyMirror() {
        const storage = GameState.get('storage') || {};
        const total = (storage.silo?.capacity || 0) + (storage.barn?.capacity || 0);
        if (total > 0 && GameState.get('inventory.maxCapacity') !== total) {
            GameState.set('inventory.capacity', total);
            GameState.set('inventory.maxCapacity', total);
        }
    }

    /* ========================================================
       READ — كم في كل مخزن؟
       ======================================================== */

    /** عدد العناصر المحسوبة على مخزن معيّن. */
    used(store) {
        const items = GameState.get('inventory.items') || {};
        let sum = 0;
        for (const itemId of Object.keys(items)) {
            if (getStorageOf(itemId) !== store) continue;
            sum += items[itemId]?.count || 0;
        }
        return sum;
    }

    capacity(store) {
        const storage = GameState.get('storage') || {};
        const entry = storage[store] || {};
        return Number(entry.capacity) || this.capacityForLevel(entry.level || 1);
    }

    level(store) {
        const storage = GameState.get('storage') || {};
        return this._clampLevel(storage[store]?.level);
    }

    free(store) {
        return Math.max(0, this.capacity(store) - this.used(store));
    }

    /** نسبة الامتلاء 0..1 — للـ HUD. */
    fill(store) {
        const cap = this.capacity(store);
        return cap > 0 ? Math.min(1, this.used(store) / cap) : 0;
    }

    isFull(store) {
        return this.free(store) <= 0;
    }

    /** لقطة للمخزنين معًا (تُستخدم في الـ HUD واللوحات). */
    snapshot() {
        const out = {};
        for (const store of ['silo', 'barn']) {
            out[store] = {
                store,
                level: this.level(store),
                used: this.used(store),
                capacity: this.capacity(store),
                free: this.free(store),
                fill: this.fill(store),
                full: this.isFull(store),
                labelAr: STORE_LABELS[store].ar,
                labelEn: STORE_LABELS[store].en,
                icon: STORE_LABELS[store].icon
            };
        }
        return out;
    }

    /* ========================================================
       WRITE GATES — البوابات التي تفرضها قواعد Hay Day
       ======================================================== */

    /** المخزن المسؤول عن عنصر معيّن. */
    storeOf(itemId) {
        return getStorageOf(itemId);
    }

    /**
     * كم يمكن إضافته فعلًا من عنصر (يحترم سعة مخزنه فقط).
     * @returns {{store:string, allowed:number, rejected:number, full:boolean}}
     */
    checkAdd(itemId, amount = 1) {
        const store = getStorageOf(itemId);
        const want = Math.max(0, Math.floor(Number(amount) || 0));
        const room = this.free(store);
        const allowed = Math.min(want, room);
        return {
            store,
            allowed,
            rejected: want - allowed,
            full: allowed <= 0 && want > 0
        };
    }

    /**
     * هل يمكن إضافة الكمية كاملة؟ (الحصاد/الاستلام يناديها قبل الفعل)
     */
    canAdd(itemId, amount = 1) {
        const check = this.checkAdd(itemId, amount);
        return check.allowed >= amount;
    }

    /**
     * POLISH-01 — بوابة موحّدة للتسليم الجزئي.
     *
     * الحصاد والمصانع والحيوانات كانت كلها تُقرّر «جزئي أم كامل؟»
     * بطريقتها الخاصة، وهو أصل عطلَي الضياع الصامت (GAP-02/03).
     * هذه الدالة مصدر واحد للقرار: كم يُسلَّم الآن، وكم يتبقّى
     * للمالك ليحتفظ به، وهل المخزن ممتلئ.
     *
     * @returns {{store:string, itemId:string, requested:number, deliverable:number,
     *            remaining:number, isPartial:boolean, isBlocked:boolean,
     *            ok:boolean, full:boolean}}
     */
    gateAdd(itemId, amount = 1) {
        const requested = Math.max(0, Math.floor(Number(amount) || 0));
        const check = this.checkAdd(itemId, requested);
        const deliverable = Math.min(check.allowed, requested);
        const remaining = Math.max(0, requested - deliverable);

        return {
            store: check.store,
            itemId,
            requested,
            deliverable,
            remaining,
            isPartial: deliverable > 0 && remaining > 0,
            isBlocked: deliverable <= 0 && requested > 0,
            ok: deliverable >= requested,
            full: check.full
        };
    }

    /** رسالة عربية موحّدة عند الامتلاء. */
    fullMessage(store) {
        const label = STORE_LABELS[store] || STORE_LABELS.barn;
        return `${label.icon} ${label.ar} ممتلئ! رقِّ ${label.ar} أو بِع بعض المنتجات.`;
    }

    /** يُطلق 'storage:full' مرة واحدة لكل نداء (لا تكرار في الـ Toast). */
    reportFull(store) {
        Events.emit('storage:full', store);
        Events.emit('inventory:full', store);
    }

    /* ========================================================
       UPGRADES — ترقية بمواد البناء
       ======================================================== */

    /** تكلفة الترقية التالية (مواد من المخزن نفسه). */
    upgradeCost(store) {
        const level = this.level(store);
        if (level >= STORAGE_CONFIG.maxLevel) return null;
        return STORAGE_CONFIG.costFor(level + 1);
    }

    /**
     * ترقية الصوامع/المخزن. تستهلك المواد من `inventory.items`
     * (المواد نفسها محسوبة على المخزن ⇒ الترقية تفرّغ مكانها فورًا).
     * @returns {{success:boolean, error?:string, level?:number, capacity?:number}}
     */
    upgrade(store) {
        if (store !== 'silo' && store !== 'barn') {
            return { success: false, error: 'مخزن غير معروف' };
        }

        const cost = this.upgradeCost(store);
        if (!cost) {
            return { success: false, error: 'وصلت لأعلى مستوى ترقية' };
        }

        const items = GameState.get('inventory.items') || {};
        const missing = [];
        for (const itemId of Object.keys(cost)) {
            const need = cost[itemId] || 0;
            if (need <= 0) continue;
            const have = items[itemId]?.count || 0;
            if (have < need) {
                missing.push({ itemId, need, have, name: ITEMS[itemId]?.name || itemId });
            }
        }

        if (missing.length > 0) {
            return {
                success: false,
                error: 'مواد الترقية غير مكتملة',
                missing,
                reason: 'missing-supplies'
            };
        }

        // استهلاك المواد
        for (const itemId of Object.keys(cost)) {
            const need = cost[itemId] || 0;
            if (need <= 0) continue;
            items[itemId] = { ...items[itemId], count: (items[itemId]?.count || 0) - need };
            if (items[itemId].count <= 0) delete items[itemId];
        }
        GameState.set('inventory.items', { ...items });

        const nextLevel = this.level(store) + 1;
        const nextCapacity = this.capacityForLevel(nextLevel);
        GameState.set(`storage.${store}`, { level: nextLevel, capacity: nextCapacity });
        GameState.set('storage.upgrades', (GameState.get('storage.upgrades') || 0) + 1);
        GameState.set('storage.lastUpgradeAt', Date.now());
        this._syncLegacyMirror();

        Events.emit('storage:upgraded', { store, level: nextLevel, capacity: nextCapacity });
        this._emitChanged();

        return { success: true, store, level: nextLevel, capacity: nextCapacity };
    }

    /* ========================================================
       SUPPLY DROPS — من الحصاد / الطلبات / زوّار الكشك
       ======================================================== */

    /**
     * محاولة إسقاط مادة ترقية.
     * @param {'harvest'|'order'|'stallSale'} source
     * @returns {{itemId:string, amount:number}|null}
     */
    rollSupplyDrop(source = 'harvest') {
        const chance = STORAGE_CONFIG.dropChance[source];
        if (!chance) return null;
        if (Math.random() >= chance) return null;

        const itemId = randPick(STORAGE_CONFIG.dropPool);
        if (!itemId) return null;

        // لا نسقط في مخزن ممتلئ — لا خسائر صامتة.
        const check = this.checkAdd(itemId, 1);
        if (check.allowed <= 0) return null;

        const amount = randInt(1, source === 'order' ? 2 : 1);
        const items = GameState.get('inventory.items') || {};
        const entry = items[itemId] || { count: 0, quality: 1 };
        items[itemId] = { ...entry, count: (entry.count || 0) + Math.min(amount, check.allowed) };
        GameState.set('inventory.items', { ...items });

        const payload = { itemId, amount: Math.min(amount, check.allowed), source };
        Events.emit('storage:supply-drop', payload);
        this._emitChanged();
        return payload;
    }

    _emitChanged() {
        Events.emit('storage:changed', this.snapshot());
    }
}

export const StorageSystem = new StorageSystemService();
export default StorageSystem;
