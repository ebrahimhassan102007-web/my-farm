/**
 * ============================================================
 * Logger.js — MY FARM 3D
 * Central tagged logging (Work Order MF-06 / Rule R2)
 * ============================================================
 * سجل التغيير:
 *   MF-06 — أنشئ هذا الملف. كل catch صامت في المشروع أصبح
 *           warn/error موسومًا هنا، وزر «نسخ تقرير تشخيص» في
 *           القائمة ينسخ آخر ٥٠ حدثًا لدعم اللاعبين.
 *
 * العقد:
 *   Logger.debug/info/warn/error(tag, ...args) — لا يرمي أي خطأ أبدًا.
 *   Logger.ring()   — نسخة من آخر ٥٠ حدثًا ({t, level, tag, msg}).
 *   Logger.report() — نص جاهز للنسخ إلى الحافظة (تقرير تشخيص).
 * ============================================================
 */

const RING_SIZE = 50;
const LEVELS = Object.freeze(['debug', 'info', 'warn', 'error']);

class LoggerService {
    constructor() {
        this._ring = [];
    }

    _stringify(value) {
        if (value instanceof Error) {
            return `${value.name}: ${value.message}`;
        }
        if (typeof value === 'object' && value !== null) {
            try {
                return JSON.stringify(value);
            } catch (stringifyErr) {
                // كائنات دائرية — نسجّل بدل أن نرمي (R2: لا فشل صامت أبدًا)
                console.warn('[Logger] Unstringifiable log value:', stringifyErr?.message || stringifyErr);
                return String(value);
            }
        }
        return String(value);
    }

    _write(level, tag, args) {
        // حتى لو انهار التنسيق لا يجوز أن يكسر المسجِّل اللعبة.
        try {
            const entry = {
                t: new Date().toISOString(),
                level,
                tag: String(tag || 'General'),
                msg: (args || []).map((a) => this._stringify(a)).join(' ')
            };

            this._ring.push(entry);
            if (this._ring.length > RING_SIZE) this._ring.shift();

            const line = `[${entry.tag}]`;
            if (level === 'error') console.error(line, ...args);
            else if (level === 'warn') console.warn(line, ...args);
            else if (level === 'info') console.info(line, ...args);
            else console.log(line, ...args);
        } catch (fatalLoggingErr) {
            // الملاذ الأخير: سطر واحد خام — لا رمي خارج المسجِّل إطلاقًا.
            try {
                console.warn('[Logger] Logging pipeline fallback:', fatalLoggingErr?.message || fatalLoggingErr);
            } catch { /* لا شيء أعمق من هذا */ }
        }
    }

    debug(tag, ...args) { this._write('debug', tag, args); }
    info(tag, ...args) { this._write('info', tag, args); }
    warn(tag, ...args) { this._write('warn', tag, args); }
    error(tag, ...args) { this._write('error', tag, args); }

    /** نسخة من حلقة الأحداث (الأقدم أولًا) — مقروءة فقط. */
    ring() {
        return this._ring.slice();
    }

    /** نص التقرير الجاهز للنسخ (زر «نسخ تقرير تشخيص» في الإعدادات). */
    report() {
        return this._ring
            .map((e) => `${e.t} [${String(e.level).toUpperCase()}] [${e.tag}] ${e.msg}`)
            .join('\n');
    }

    clear() {
        this._ring.length = 0;
    }

    /** حجم الحلقة الحالي (اختبارات). */
    get size() {
        return this._ring.length;
    }

    static get LEVELS() {
        return LEVELS;
    }
}

export const Logger = new LoggerService();
export default Logger;
