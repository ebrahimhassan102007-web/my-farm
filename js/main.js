/**
 * ============================================================
 * MY FARM 3D — BOOT SHIM (MF-12)
 * ============================================================
 * نقطة الدخول للمتصفح (index.html). كل منطق التطبيق يعيش في
 * js/core/App.js بعد فصل MF-12؛ هذا الملف يعيد تصدير نفس الوجهة
 * حتى تبقى الاختبارات وأي مستهلك قديم بلا كسر.
 * ============================================================
 */

export { MyFarmApp, app } from './core/App.js';
export { CropBatchRenderer } from './world/CropBatchRenderer.js';
export { PlayerController } from './player/PlayerController.js';
