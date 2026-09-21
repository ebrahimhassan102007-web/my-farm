# سجل التغييرات — MY FARM 3D

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
