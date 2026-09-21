# 🌾 MY FARM 3D — مزرعة العمر

لعبة مزرعة ثلاثية الأبعاد بالعربية (RTL) بأسلوب Hay Day، تعمل في المتصفح مباشرة — **بلا bundler وبلا خطوة بناء**.

Three.js `0.160.0` عبر importmap فقط. افتح `index.html` من أي خادم static واللعبة تعمل.

---

## التشغيل

```bash
# أي خادم ملفات static يكفي — لا build إطلاقًا
npx serve .            # أو
python3 -m http.server 8080
```

ثم افتح `http://localhost:8080`.

> يجب التشغيل عبر خادم (وليس `file://`) لأن اللعبة وحدات ES modules.

## الاختبارات

```bash
npm i            # يثبّت three محليًا للاختبار الرأسي فقط (لا تدخل git)

npm test              # smoke   — منطق اللعب كاملًا (180 فحصًا)
npm run test:world    # world   — بناء العالم 3D بلا رأس + dispose (67 فحصًا)
npm run test:contracts# contracts — عقود API + ترقية الحفظ + الاقتصاد (89 فحصًا)
npm run test:all      # الثلاثة معًا — بوابة الدمج (336 فحصًا)
```

`package.json` موجود **فقط** لأجل الاختبارات الرأسية — اللعبة نفسها لا تستخدمه.

## خريطة المعمارية

```
index.html          ← قشرة + importmap (three من CDN) + شاشة التحميل
js/
├── main.js         ← shim إقلاع بسيط (MF-12) — يعيد تصدير النواة
├── core/
│   ├── App.js             ← Orchestrator: renderer/camera/input/تفاعلات/نهار-ليل
│   │                      (MyFarmApp + boot + حوض الانفجارات وفق MF-13)
│   ├── EventBus.js        ← أحداث فقط — لا state مشتركة بين الأنظمة (R5)
│   ├── GameState.js       ← المصدر الوحيد للحقيقة (immutable-by-convention)
│   ├── SaveManager.js     ← IndexedDB أساسي + localStorage احتياطي
│   │                      (+ استيراد حفظ V1: نسخة خام ← ترقية ← تحقق roundtrip)
│   ├── TimeManager.js     ← ساعة الجهاز الحقيقية: 1ث=1ث، فصول فلكية،
│   │                      offline progression، إيقاف tick عند إخفاء الصفحة
│   ├── Logger.js          ← سجل موسوم مركزي (آخر ٥٠ حدثًا) — لا فشل صامت
│   ├── QualityScaler.js   ← جودة الرسوم low/mid/high حيًّا بلا reload
│   ├── Calendar.js        ← التقويم الفلكي الحقيقي (الفصول/الأطوار)
│   └── CollisionEngine.js ← صناديق تصادم + occlusion الكاميرا
├── systems/        ← Farming · Land · Animal · Production · Order · Market
│                     Quest · Storage · Inventory · XP · Building · Social · Event
├── data/GameData.js← الجريدة المركزية: أسعار/مخزون/وصفات/اقتصاد (R1)
├── player/
│   └── PlayerController.js← حركة اللاعب + الأدوات + مزج الحركات (MF-12)
├── world/          ← Environment · FarmLayout · SkyDome · HouseInterior ·
│   │                 BuildingManager · Animals · Foliage · ProductionYard · Doors
│   └── CropBatchRenderer  ← دفعات InstancedMesh لكل المحاصيل (≈9 draw calls)
├── ui/             ← UIManager(HUD) · UI(لوحات) · Toast · SoundFX ·
│   │                 Notifications · ProductionPanel · Components
│   ├── icons.js           ← sprite أيقونات SVG مركزي + fallback نصي (MF-04)
│   └── Tutorial.js        ← درس أول ٦٠ ثانية بقفل الإدخال (MF-10)
└── utils/Utils.js  ← helpers نقية (uuid, clamp, haptic…)
```

## قرارات المنتج المقفلة

- **الوقت حقيقي**: 1 ثانية = 1 ثانية؛ الفصول من فلك الجهاز (لا تسريع).
- **المحاصيل لا تذبل** (MF-02): الناضج ينتظرك إلى الأبد. مسار الذبول محفوظ
  خلف `FARMING_CONFIG.witherEnabled` لآلية «غياب طويل» مستقبلية — مطفأ افتراضيًا.
- **لا نظام طاقة** (MF-03): حُذف كليًا (كان عدّادًا بلا مستهلك).
- **بيانات الاقتصاد تعيش مرة واحدة** (R1): الأسعار/العدادات من `GameData.js` /
  `LAND_CONFIG` فقط، واختبار contracts يمنع الأرقام السحرية في نصوص الواجهة.

## الحفظ والترقية

- مفاتيح V2: `myfarm_save_v2` / `myfarm_meta_v2` / `MyFarmDB_v2`.
- أول إقلاع V2 يستورد حفظ V1 تلقائيًا (`myfarm_save` / `myfarm_save_v1` /
  قاعدة `MyFarmDB` القديمة)، يحتفظ بنسخة خام في `myfarm_v1_backup`،
  يرقّي، يحفظ، ويتحقق check-sum roundtrip (MF-01).
- **الحفوظات مقدسة (R3)**: الترحيل دائمًا، أبدًا لا إعادة ضبط لتقدّم لاعب.

## أرشيف

- حُذف `js/main.backup.js` و`MY_FARM_3D_Gemini_Camera_Updated.html`
  (نسخة أحادية الملف الأولى) من الشجرة في سبرنت الجودة — تاريخهما محفوظ
  في git (قبل `2b11cdb`) إن احتجنا استرجاع أي منهما (MF-12).
- تفاصيل كل إصلاح في `CHANGELOG.md`.
