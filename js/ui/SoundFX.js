/**
 * SoundFX.js — مؤثرات صوتية مُصنّعة بالكامل عبر WebAudio
 * No audio files needed — tiny synthesized pops/dings.
 * iOS-safe: AudioContext is created lazily and resumed
 * inside user-gesture handlers (collect/start button taps).
 * Respects GameState: settings.sfx
 * سجل التغيير (Work Order):
 *   MF-07 — يتبع مستوى الجودة عبر QualityScaler (خفض أصوات على low).
 */

export class SoundFX {
    constructor({ gameState } = {}) {
        this._gameState = gameState || null;
        this._ctx = null;
    }

    _enabled() {
        try {
            const s = this._gameState?.get?.('settings.sfx');
            return s !== false;
        } catch (e) {
            return true;
        }
    }

    _ctxInstance() {
        if (!this._ctx) {
            const AC =
                (typeof window !== 'undefined') &&
                (window.AudioContext || window.webkitAudioContext);
            if (!AC) return null;
            try {
                this._ctx = new AC();
            } catch (e) {
                return null;
            }
        }
        if (this._ctx.state === 'suspended') {
            this._ctx.resume().catch(() => {});
        }
        return this._ctx;
    }

    /** نغمة قصيرة */
    _tone(ctx, { freq = 440, freq2 = null, type = 'sine', t0 = 0, dur = 0.15, vol = 0.22 }) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = ctx.currentTime + t0;

        osc.type = type;
        osc.frequency.setValueAtTime(freq, start);
        if (freq2) {
            osc.frequency.exponentialRampToValueAtTime(freq2, start + dur);
        }

        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(vol, start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);

        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + dur + 0.05);
    }

    /** Terrain-aware footsteps and a compact pentatonic harvest combo. */
    footstep(surface = 'grass') {
        const sounds = { grass: [120, 70], dirt: [180, 95], gravel: [520, 180], wood: [760, 110] };
        const [freq, vol] = sounds[surface] || sounds.grass;
        this._playTone({ freq, type: surface === 'wood' ? 'square' : 'triangle', dur: 0.07, vol: vol / 1000 });
    }
    playFoley(name) {
        const map = { scythe: [620, 0.16], till: [95, 0.18], water: [380, 0.1], gate: [260, 0.14] };
        const [freq, vol] = map[name] || map.till;
        this._playTone({ freq, freq2: freq * 1.35, type: 'triangle', dur: 0.18, vol });
    }
    harvestCombo(combo = 1) {
        const scale = [523.25, 587.33, 659.25, 783.99, 880];
        for (let i = 0; i < Math.min(5, Math.max(1, combo)); i++) this._playTone({ freq: scale[i], t0: i * 0.07, dur: 0.16, vol: 0.11 });
    }
    _playTone(options) {
        if (!this._enabled()) return;
        const ctx = this._ctxInstance(); if (!ctx) return;
        try { this._tone(ctx, options); } catch (e) { /* cosmetic */ }
    }

    play(name) {
        if (!this._enabled()) return;
        const ctx = this._ctxInstance();
        if (!ctx) return;

        try {
            switch (name) {
                case 'start': // بدء إنتاج — فحيص خفيف صاعد
                    this._tone(ctx, { freq: 220, freq2: 340, type: 'triangle', dur: 0.18, vol: 0.18 });
                    break;
                case 'ready': // جاهز — دقّتان
                    this._tone(ctx, { freq: 660, type: 'sine', dur: 0.12, vol: 0.2 });
                    this._tone(ctx, { freq: 880, type: 'sine', t0: 0.13, dur: 0.16, vol: 0.22 });
                    break;
                case 'collect': // استلام — جرس عملات مصاعد
                    this._tone(ctx, { freq: 620, type: 'square', dur: 0.09, vol: 0.10 });
                    this._tone(ctx, { freq: 830, type: 'square', t0: 0.07, dur: 0.09, vol: 0.10 });
                    this._tone(ctx, { freq: 1240, type: 'sine', t0: 0.14, dur: 0.22, vol: 0.22 });
                    break;
                case 'open': // فتح اللوحة — بوب
                    this._tone(ctx, { freq: 340, freq2: 520, type: 'sine', dur: 0.12, vol: 0.16 });
                    break;
                case 'close':
                    this._tone(ctx, { freq: 520, freq2: 340, type: 'sine', dur: 0.12, vol: 0.14 });
                    break;
                case 'error': // خطأ — بازر منخفض
                    this._tone(ctx, { freq: 130, type: 'sawtooth', dur: 0.22, vol: 0.12 });
                    break;
                default:
                    this._tone(ctx, { freq: 440, type: 'sine', dur: 0.1, vol: 0.12 });
            }
        } catch (e) { /* audio is cosmetic — never crash the game over it */ }
    }
}

export default SoundFX;
