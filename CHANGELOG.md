# سجل التغييرات — MY FARM 3D

## PHASE 0 — انهيار وقت التشغيل (BUG-001) — 2026-09-22

- **BUG-001 `ReferenceError: SUN_TINT_BY_SEASON is not defined`**
  (`js/core/App.js` + `js/player/PlayerController.js`): عند فصل MF-12
  انتقل `applyDayNight()` إلى `core/App.js`، لكن ثوابت الفصول الأربعة
  بقيت في `player/PlayerController.js` **غير مُصدَّرة وغير مُستخدَمة
  هناك** (بقايا فصل). `App.js` يقرؤها في أول نبضة ليل/نهار ⇒ انهيار
  مؤكد **٤/٤ فصول**، أي أن اللعبة تنهار فور أول دقيقة لعب حقيقية
  (اختبارات الفصل السابق لم تكن تُنفِّذ مسار `applyDayNight()`، فمرّ
  العطب صامتًا).
- **الإصلاح:** الثوابت تُعرَّف الآن في `js/core/App.js` حيث تُستخدَم
  (`DEFAULT_SUN_OFFSET` · `SUN_TINT_BY_SEASON` · `AMBIENT_BY_SEASON` ·
  `FOG_DENSITY_BY_SEASON`)، وأُزيلت النسخ اليتيمة من
  `PlayerController.js`. لا استيراد من App.js إلى PlayerController
  لأن App.js يستورده أصلًا ⇒ أي عكس = دورة استيراد (R6).
- **قرار موثَّق (انحراف عن النص الأصلي):** `PLAYER_SPAWN` **بقي** في
  `PlayerController.js` ولم يُنقل إلى App.js كما اقترحت المواصفة، لأنه
  (أ) مُستخدَم فعلًا هناك في `root.position.set(...)` — نقلُه يكسر
  تركيب اللاعب، (ب) استيراده من App.js يصنع دورة استيراد، (ج) إضافته
  إلى App.js تنشئ ثابتًا ميتًا جديدًا (App.js لا يقرؤه إطلاقًا).
- **حارس دائم:** `VP-16` في `tests/vp.mjs` — يُنشئ التطبيق فعلًا
  ويستدعي `applyDayNight()` لكل فصل، ويتحقق أن كل فصل يُطبّق صبغته
  الموثّقة. أُثبِت أن الحارس يفشل (exit 1) عند إعادة العطب عمدًا.

## سبرنت GAP/POLISH (GAP-01 → GAP-07 · POLISH-01 → POLISH-03) — 2026-09-22

المصدر: `public/AGENT_MASTER_PROMPT.md`. بوابة الدمج: `npm run test:all`
(SMOKE 180 + WORLD 67 + CONTRACTS 89 + VP 27 = **363 فحصًا**).
كل بند يحمل نقطة تحقق دائمة في `tests/vp.mjs` (VP-01 → VP-15).

### PHASE 1 — عطب الصحة (صحة اللعب)

- **GAP-01 عقد الخبرة الكاذب** (`js/systems/XPSystem.js`): `addXp()` كان
  يكتب `player.xp` فيُشعل شبكة الأمان (`state:changed`) فترفع المستوى
  أولًا، ثم يصل الاستدعاء الثاني إلى حالة مُسوّاة ويُرجع `leveled:false`
  رغم أن اللاعب ارتقى فعلًا — عقد مرتجع كاذب + فحص مزدوج. أُضيف علم
  `_resolvingLevel` فصار الفحص مرة واحدة والمرتجع صادقًا. اختبار: VP-02..05.
- **GAP-02 ضياع البذرة الصامت** (`js/systems/FarmingSystem.js`): بوابة
  الصوامع كانت تحجز مكان المحصول وحده ثم يُضاف «رجوع البذرة» بلا بوابة
  ⇒ حصاد يُعلن `success:true` بينما تُبتلع البذرة (صوامع على الحافة)،
  فيفقد اللاعب إعادة الزرع بلا إشعار. الآن تُحجز سعة «محصول + بذرة» معًا،
  والحصاد يُرفض برسالة واضحة إن لم تتّسع — فلا ضياع صامت. النتيجة تحمل
  `seedId`/`seedReturned`. اختبار: VP-06..07.
- **GAP-03 تدمير ناتج المصنع** (`js/systems/ProductionSystem.js`): عند
  اتساع المخزن لجزء من الناتج فقط، كان يُسلَّم الجزء المتاح ثم تُحذف
  الوظيفة كاملة ⇒ بقيّة الناتج تُدمَّر (وصف صحيح: `chicken_feed` ٣،
  `*_feed` ٢)، وهو نقض حرفي لعقد «يبقى المنتج على الآلة ولا يُفقد شيء».
  الآن تُحذف الوظيفة فقط عند التسليم الكامل، وإلا تبقى بالكمية المتبقية.
  اختبار: VP-08..09.

### PHASE 2 — صحة هندسية

- **GAP-04 تفكيك دورة الحياة** (`js/core/App.js`): `destroy()` كان يحرّر
  المشهد/المصيّر ويترك مؤقّتات النواة حيّة (ساعة اللعبة، الحفظ التلقائي،
  مؤقّت تحديث الطلبات) ومستمع `visibilitychange`. أُضيف
  `_teardownCoreTimers()` ينادي `OrderSystem.stop()` و
  `SaveManager.stopAutoSave()` و`Time.stop()`. اختبار: VP-10.
- **GAP-05 أحداث ميتة** (`js/core/TimeManager.js`): كان يُطلق
  `animals:offline` و`production:offline` بلا أي مستمع في الشجرة كلها؛
  الحيوانات والمصانع تستمع إلى `time:offline` وحده. حُذف الحدثان.
  اختبار: VP-11.
- **GAP-06 وحدات ميتة/فارغة**: أُزيلت `EconomySystem.js` (0 بايت)،
  `EventSystem.js`، `SocialSystem.js` (لا يستوردها شيء)، و`CropSystem.js`
  (نموذج نمو موازٍ ميت). التاريخ محفوظ في git. اختبار: VP-13.
- **GAP-07 ترقية الحفظ المكرّرة** (`js/core/SaveManager.js`): `load()` كان
  ينادي `_migrate()` مرتين لكل حفظ قديم (فرع ميت + عمل مكرر). استدعاء
  واحد الآن. كذلك صار `LAND_FIELDS_FALLBACK` **مصنعًا**
  (`makeLandFieldsFallback()`) فلا يُدخِل الثابت المشترك في حالة اللاعب.
  اختبار: VP-14.

### PHASE 3 — البريق والحراسة

- **POLISH-01 بوابة تخزين موحّدة** (`js/systems/StorageSystem.js`):
  `gateAdd()` مصدر واحد لقرار «كامل/جزئي/محجوب» بدل حساب متوازٍ في كل
  نظام — أصل عطلَي الضياع الصامت. الحصاد والمصانع يمرّان عليها.
  اختبار: VP-12.
- **POLISH-02 مطابقة الوثائق للشجرة**: خريطة README وقائمة الأنظمة
  وأرشيف الوحدات المزالة + هذا السجل. اختبار: VP-15.
- **POLISH-03 بوابة انحدار** (`tests/vp.mjs` + `npm run test:vp`): نقاط
  التحقق الـ15 صارت جزءًا من `npm run test:all`، فالعودة إلى أي عطب
  أعلاه تُسقط البوابة فورًا.


## سبرنت الجودة (Work Order MF-01 → MF-13) — 2026-09-21

### P0 — سلاسة الدقائق الأولى

- **MF-01 استيراد حفظ V1** (`js/core/SaveManager.js`): أول إقلاع V2 يبحث عن
  مفاتيح V1 (`myfarm_save`/`myfarm_save_v1`/قاعدة `MyFarmDB`)، ينسخ الخام في
  `myfarm_v1_backup`، يرقّي إلى شكل V2، يحفظ ويتحقق checksum roundtrip.
  اختبار: contracts «MF-01 legacy v1 save import + roundtrip».
- **MF-02 لا ذبول** (`js/systems/FarmingSystem.js` + `GameData.js`): المحصول
  الناضج ينتظر إلى الأبد (قاعدة Hay Day). مسار الذبول محفوظ خلف
  `FARMING_CONFIG.witherEnabled` (افتراضيًا off)، والحفوظات القديمة المذبولة
  تُنعش عند التحميل (`_normalizeSlots`).
- **MF-03 حذف الطاقة** (`GameState.js`, `TimeManager.js`, `GameData.js`,
  `SaveManager.js`, HUD): حُذفت الحقول والتعبئة الليلية والقطعة من الواجهة؛
  حفظ قديم يُحمَّل بإسقاط صامت للحقول. اختبارات: D2(d) في contracts.

### P1 — الاحترافية

- **MF-04 أيقونات SVG** (`js/ui/icons.js` + HUD/UI/Components): sprite مركزي
  `iconHTML(emoji, size)` بـ fallback نصي؛ استُبدل الإيموجي في العملات/
  المخازن/شريط الأدوات/المتجر. اختبار: contracts «MF-04 icons».
- **MF-05 لا أرقام سحرية**: نصوص الاقتصاد تُقرأ من `LAND_CONFIG`/`GameData`/
  `xpForLevel`؛ فُحص تلقائي D2(c) يمنع أرقامًا خام داخل نصوص الواجهة العربية.
- **MF-06 المسجِّل المركزي** (`js/core/Logger.js`): مستويات + وسوم + حلقة
  ٥٠ حدثًا، لا رمي أبدًا، `نسخ تقرير تشخيص` في قائمة الإعدادات، ولا catch
  صامت في الشجرة.
- **MF-07 QualityScaler** (`js/core/QualityScaler.js`): low/mid/high ⇒
  pixelRatio 1/1.5/2، ظلال 512/1024/2048، ظلال ديناميكية مُطفأة على low،
  ضباب متدرّج؛ تبديل حي من الإعدادات بلا reload.
- **MF-08 حركة الأداة**: tween مدفوع بـ dt بدل `setTimeout`، يلغى عند
  `equipItem`/التدمير.
- **MF-09 حوض النصوص العائمة**: ٦ عُقد DOM مُعاد تدويرها، والفيض يدمج
  («×3»). تحرير كامل في `destroy()`.
- **MF-10 درس أول ٦٠ ثانية** (`js/ui/Tutorial.js`): ٤ خطوات مقفلة
  (ازرع ← اسقِ ← احصد ← بِع في الكشك)، spotlight + قفل إدخال، قمح أول
  مُسرَّع لـ٦٠ث، يُحفَظ ولا يُعاد أبدًا (الخبراء يُسجَّلون مكتملين بصمت).
  اختبار: contracts «MF-10».

### P2 — البريق والصحة الطويلة

- **MF-11 إيقاف عند الإخفاء** (`TimeManager.js`): لا tick أثناء
  `document.hidden`؛ التقدم الليلي عبر `_processOfflineTime()` الموجود.
- **MF-12 تقسيم main.js**: `js/core/App.js` (النواة والإقلاع)،
  `js/player/PlayerController.js`، `js/world/CropBatchRenderer.js`؛
  `main.js` صار shim بـ ١٣ سطرًا. حُذف `main.backup.js` والنسخة الأحادية
  القديمة `MY_FARM_3D_Gemini_Camera_Updated.html` (تاريخها في git قبل
  `2b11cdb`).
- **MF-13 العصارة**: `haptic(12)` عند الحصاد/الجمع (iOS-protected)، تناثر
  سنابل قمح (حوض ٢٤ sprite + texture canvas مرة واحدة + جاذبية/تلاشي dt)،
  نبضة squash على أقراص الصومعة/الحظيرة مع `prefers-reduced-motion`.

### بوابة الجودة

`npm run test:all` — SMOKE 180 + WORLD 67 + CONTRACTS 89 = 336 فحصًا أخضر.

### QA Round (2026-09-21، نفس اليوم)

- **§1b** فحص حرفي للبلع الصامت: ١٢ ملفًا ← كل catch إمّا Logger-musom
  (Logger-tagged) أو reject/throw أو «void بنيوي موثّق» (Logger deepest
  fallback). عقد تلقائي جديد: contracts «QA-§1b zero silent catches».
- **§2** فحوص تخطيط الملفات (shim/App/النسخ القديمة) خرجت من عدّاد D2 إلى
  قسم LINT توثيقي يعمل بـ glob — العقود السلوكية (API) بقيت في العدّاد.
- **§3** إثبات بروتوكول MF-07 الحي: اختبار rig زائف يؤكّد ترتيب
  mapSize.set ← map.dispose ← null ← needsUpdate sweep في كل تبديل (بلا تسريب).
- **§4** إثبات عزل MF-10: قمح الدرس = `slot.readyAt` فقط (growTime في
  CROPS لم يُمس — 10/16/22/28 как هي)، وحالة الدرس تنجو تحديث الصفحة وسط
  التدفق، وحفظ الخبير لا يشغّلها أبدًا.

عدّاد contracts بعد جولة QA: **89 فحصًا + 3 LINT توثيقية**.
