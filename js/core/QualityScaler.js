/**
 * ============================================================
 * QualityScaler.js — MY FARM 3D
 * Live graphics quality switching (Work Order MF-07)
 * ============================================================
 * سجل التغيير:
 *   MF-07 — كان settings.graphics='high' مخزنًا بلا مفعول:
 *           antialias والظلال وmaxPixelRatio مفروضة دائمًا
 *           ⇒ اختناق حراري على الجوالات المتوسطة.
 *           الآن low/mid/high تضبط pixelRatio وخريطة الظل
 *           وكثافة الضباب حيًّا بلا إعادة تحميل.
 *
 * الإعداد المقفل (ميزانية 60fps جوال متوسط — R4):
 *   low : pixelRatio 1.0 · ظلال 512 · ظل ديناميكي OFF · ضباب أثقل (يخفي العمق)
 *   mid : pixelRatio 1.5 · ظلال 1024 · ON
 *   high: pixelRatio 2.0 · ظلال 2048 · ON
 * ============================================================
 */

import { GameState } from './GameState.js';
import { Logger } from './Logger.js';

export const GRAPHICS_PRESETS = Object.freeze({
    low:  { pixelRatio: 1.0, shadowSize: 512,  shadows: false, fogScale: 1.3 },
    mid:  { pixelRatio: 1.5, shadowSize: 1024, shadows: true,  fogScale: 1.0 },
    high: { pixelRatio: 2.0, shadowSize: 2048, shadows: true,  fogScale: 1.0 }
});

/** أسماء عربية لزر القائمة (Role: Art/UI). */
export const GRAPHICS_LABELS = Object.freeze({
    low: 'منخفضة',
    mid: 'متوسطة',
    high: 'عالية'
});

const QUALITY_ORDER = Object.freeze(['low', 'mid', 'high']);

class QualityScalerService {
    constructor() {
        this._app = null;
        this._current = 'high';
    }

    /** ربط تطبيق اللعبة بعد بناء الـ renderer والإضاءة (main.js boot). */
    attach(app) {
        this._app = app;
        const saved = GameState.get('settings.graphics') || 'high';
        this.apply(saved, { persist: false });
        return this;
    }

    get current() {
        return this._current;
    }

    get preset() {
        return GRAPHICS_PRESETS[this._current] || GRAPHICS_PRESETS.high;
    }

    /**
     * تطبيق فوري بلا إعادة تحميل. آمن النداء قبل attach (لا renderer ⇒
     * يخزّن الاختيار فقط) ولا يرمي أخطاء أبدًا (R2).
     */
    apply(level, { persist = true } = {}) {
        const preset = GRAPHICS_PRESETS[level];
        if (!preset) {
            Logger.warn('QualityScaler', `unknown graphics level '${String(level)}' — keeping '${this._current}'`);
            return this._current;
        }
        this._current = level;

        const app = this._app;
        const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;

        try {
            if (app?.renderer) {
                app.renderer.setPixelRatio(Math.min(dpr, preset.pixelRatio));
                app.renderer.shadowMap.enabled = preset.shadows;
                app.renderer.setSize(window.innerWidth, window.innerHeight, false);
            }

            const sun = app?.lights?.sun;
            if (sun?.shadow) {
                sun.shadow.mapSize.set(preset.shadowSize, preset.shadowSize);
                // إجبار إعادة بناء خريطة الظل بالمقاس الجديد
                if (sun.shadow.map) {
                    sun.shadow.map.dispose();
                    sun.shadow.map = null;
                }
                sun.castShadow = preset.shadows;
            }

            // إيقاف/تشغيل الظلال كليًا يتطلب تحديث المواد (شيدر جديد)
            if (app?.scene && app.renderer && app.renderer.shadowMap?.enabled !== undefined) {
                app.scene.traverse((child) => {
                    if (child?.material) child.material.needsUpdate = true;
                });
            }

            // معامل الضباب: low يثقّل الضباب فيخفي العمق ويريح الرسم
            if (app) {
                app._fogScale = preset.fogScale;
                if (app.scene?.fog && !app.inInterior) {
                    const base = app._outsideFogDensity || 0.012;
                    app.scene.fog.density = base * preset.fogScale;
                }
            }
        } catch (err) {
            Logger.error('QualityScaler', `failed applying '${level}'`, err);
        }

        if (persist) {
            GameState.set('settings.graphics', level);
        }
        Logger.info('QualityScaler', `graphics → ${level}`, preset);
        return level;
    }

    /** low → mid → high → low — زر واحد في قائمة الإعدادات. */
    cycle() {
        const next = QUALITY_ORDER[(QUALITY_ORDER.indexOf(this._current) + 1) % QUALITY_ORDER.length];
        return this.apply(next);
    }
}

export const Quality = new QualityScalerService();
export default Quality;
