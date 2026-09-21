/**
 * ============================================================
 * MY FARM 3D - LAND & EXPANSION SYSTEM
 * Handles 10 Locked Lands, 100 Coins Purchase, Axe Preparation & Farming Ready State
 * ============================================================
 * سجل التغيير (Work Order):
 *   MF-05 — سعر الحقل وافتراضي الكوينز من مصدر واحد (LAND_CONFIG +
 *           ECONOMY.startingCoins) — لا أرقام سحرية في النظام.
 *   MF-06 — كل catch صامت أصبح تحذيرًا موسومًا عبر Logger (R2).
 */
import { Events } from '../core/EventBus.js';
import { GameState } from '../core/GameState.js';
import { SaveManager } from '../core/SaveManager.js';
import { Logger } from '../core/Logger.js';
import { StorageSystem } from './StorageSystem.js';
import { ECONOMY } from '../data/GameData.js';
import { FIELD_PLOTS, FIELD_ZONE } from '../world/FarmLayout.js';

export const LAND_CONFIG = Object.freeze({
    fieldPrice: 100,
    hitsRequired: 4, // 4 ضربات فأس لتجهيز الأرض بالكامل
    prepRewardXp: 25, // XP منحة تجهيز الحقل — اعرضها للاعب من هنا فقط (R1)
    baseUnlocked: ['field_center_left', 'field_center_right'],

    /*
     * منطقة الحقول المخصصة (3 أعمدة × 4 صفوف) شرق/جنوب-شرق المزرعة،
     * بعيدًا عن البيت والحظائر والطاحونة والكشك — انظر FarmLayout.js
     * (مصدر واحد للإحداثيات لكل الأنظمة).
     * المعرّفات مثبّتة عمدًا: الحفوظات القديمة تربط الخانات والمحاصيل بها.
     */
    fieldsLayout: FIELD_PLOTS,
    zone: FIELD_ZONE
});

class LandSystemService {
    constructor() {
        this.fields = [];
        this.initialized = false;
    }

    init() {
        let stateTiles = [];
        try {
            stateTiles = GameState.get('farm.tiles');
        } catch (e) {
            stateTiles = [];
        }

        if (!Array.isArray(stateTiles) || stateTiles.length === 0) {
            stateTiles = LAND_CONFIG.fieldsLayout.map(cfg => ({
                id: cfg.id,
                posX: cfg.x,
                posZ: cfg.z,
                price: LAND_CONFIG.fieldPrice,
                purchased: !!cfg.base,
                prepared: !!cfg.base,
                prepProgress: cfg.base ? 100 : 0,
                state: cfg.base ? 'empty' : 'locked',
                cropId: null,
                plantedAt: 0,
                readyAt: 0,
                watered: false
            }));

            try {
                GameState.set('farm.tiles', stateTiles);
                SaveManager.save();
            } catch (err) {
                console.warn('[LandSystem] Save Init notice:', err);
            }
        }

        // ترحيل لمرة واحدة: الحفوظات القديمة تحمل مواقع الحقول المبعثرة
        // (بعضها تحت المباني) — ننقلها لمنطقة الحقول مع بقاء كل شيء آخر
        // (شراء/تجهيز/خانات/محاصيل) كما هو تمامًا.
        try {
            const layoutById = {};
            for (const cfg of LAND_CONFIG.fieldsLayout) layoutById[cfg.id] = cfg;
            let migrated = false;
            for (const tile of stateTiles) {
                const cfg = tile && layoutById[tile.id];
                if (cfg && (tile.posX !== cfg.x || tile.posZ !== cfg.z)) {
                    tile.posX = cfg.x;
                    tile.posZ = cfg.z;
                    migrated = true;
                }
            }
            if (migrated) {
                GameState.set('farm.tiles', stateTiles);
                SaveManager.save();
                console.log('[LandSystem] Migrated plots to the dedicated field zone.');
            }
        } catch (err) {
            console.warn('[LandSystem] Migration notice:', err);
        }

        this.fields = stateTiles;
        this.initialized = true;
        console.log('[LandSystem] Loaded with', this.fields.length, 'total plots.');
    }

    getAllFields() {
        try {
            const tiles = GameState.get('farm.tiles');
            if (Array.isArray(tiles) && tiles.length > 0) return tiles;
        } catch (e) {
            Logger.warn('LandSystem', 'getAllFields: farm.tiles read failed, using in-memory fields', e);
        }
        return this.fields;
    }

    getField(id) {
        return this.getAllFields().find(f => f.id === id) || null;
    }

    /**
     * شراء الأرض بـ 100 كوينز
     */
    purchaseField(fieldId) {
        const fields = this.getAllFields();
        const index = fields.findIndex(f => f.id === fieldId);

        if (index === -1) {
            Events.emit('land:purchase-failed', { fieldId, reason: 'not-found' });
            return { success: false, reason: 'not-found' };
        }

        const field = fields[index];
        if (field.purchased) {
            Events.emit('land:purchase-failed', { field, reason: 'already-purchased' });
            return { success: false, reason: 'already-purchased' };
        }

        // MF-05: الافتراضي من الاقتصاد المركزي — لا 350 سحرية (R1)
        let currentCoins = ECONOMY.startingCoins;
        try {
            currentCoins = GameState.get('player.coins') ?? ECONOMY.startingCoins;
        } catch (e) {
            Logger.warn('LandSystem', 'purchaseField: coins read fell back to ECONOMY.startingCoins', e);
        }

        const price = field.price || LAND_CONFIG.fieldPrice;

        if (currentCoins < price) {
            Events.emit('land:purchase-failed', { field, price, currentCoins, reason: 'insufficient-funds' });
            return { success: false, reason: 'insufficient-funds', required: price, current: currentCoins };
        }

        // خصم الكوينز من GameState
        const remainingCoins = currentCoins - price;
        try {
            GameState.set('player.coins', remainingCoins);
        } catch (e) {
            Logger.error('LandSystem', 'purchaseField: coin deduction failed — aborting purchase to keep wallet correct', e);
            Events.emit('land:purchase-failed', { field, price, currentCoins, reason: 'wallet-error' });
            return { success: false, reason: 'wallet-error' };
        }

        // تحديث حالة الأرض: تم الشراء ولكنها غير مجهزة بعد!
        field.purchased = true;
        field.prepared = false;
        field.prepProgress = 0;
        field.state = 'unprepared';
        fields[index] = field;

        try {
            GameState.set('farm.tiles', [...fields]);
            SaveManager.save();
        } catch (e) {
            Logger.error('LandSystem', 'purchaseField: tiles persist failed after coin deduction', e);
        }

        Events.emit('land:purchased', {
            field,
            cost: price,
            remainingCoins
        });

        return { success: true, field, cost: price };
    }

    /**
     * تجهيز الأرض بالفأس ضربة بضربة
     */
    strikeFieldWithAxe(fieldId) {
        const fields = this.getAllFields();
        const index = fields.findIndex(f => f.id === fieldId);
        if (index === -1) return { success: false };

        const field = fields[index];
        if (!field.purchased || field.prepared) return { success: false };

        const hitStep = Math.round(100 / LAND_CONFIG.hitsRequired);
        field.prepProgress = Math.min(100, (field.prepProgress || 0) + hitStep);

        const isFinished = field.prepProgress >= 100;
        if (isFinished) {
            field.prepared = true;
            field.state = 'empty'; // أصبحت الآن حقل خصب فارغ جاهز للزراعة
        }

        fields[index] = field;
        try {
            GameState.set('farm.tiles', [...fields]);
            SaveManager.save();
        } catch (e) {
            Logger.error('LandSystem', 'strikeFieldWithAxe: prep progress persist failed', e);
        }

        Events.emit('land:axe-hit', {
            field,
            progress: field.prepProgress,
            isFinished
        });

        if (isFinished) {
            /*
             * توسعة بأسلوب Hay Day: تجهيز أرض جديدة يُسقط مواد ترقية
             * (مسامير/ألواح/شريط) لتوسيع الصوامع/المخزن.
             */
            const supplyDrop = StorageSystem.rollSupplyDrop('order');
            Events.emit('land:prepared', { field, supplyDrop });
        }

        return { success: true, progress: field.prepProgress, isFinished };
    }
}

export const LandSystem = new LandSystemService();
