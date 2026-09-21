/**
 * ============================================================
 * UI.js — لوحات الواجهة (شيت واحد بتبويبات)
 * ============================================================
 * 🏪 المتجر   : بذور + أراضٍ قابلة للشراء (أنظمة حقيقية)
 * 🎒 المخزن   : عرض + بيع (InventorySystem)
 * 📦 الطلبات  : قبول/تسليم/رفض (OrderSystem + Components.orderCard)
 * 🛒 السوق    : عرض/شراء/إلغاء (MarketSystem + Components.marketListing)
 * 🗺️ الخريطة : مواضع الحقول والمباني والحيوانات
 * ☰ القائمة  : إعدادات + حفظ فوري + إحصاءات
 *
 * لا THREE هنا ولا منطق مزرعة — قراءة GameState وكتابة عبر الأنظمة.
 * كل فشل يُعرض كـ Toast عربي (انظر AR_ERRORS).
 *
 * سجل التغيير (Work Order):
 *   MF-06 — زر «نسخ تقرير تشخيص» ينسخ حلقة Logger (آخر ٥٠ حدثًا).
 *   MF-07 — صف «جودة الرسوم» يبدّل low/mid/high حيًّا عبر QualityScaler.
 * ============================================================
 *   QA-§1b — فشل قراءة لوحات الحيوانات/المخازن/الحفظ = سجل Logger + رسالة مفهومة.
 */
import { Components } from './Components.js';
import { InventorySystem } from '../systems/InventorySystem.js';
import { MarketSystem } from '../systems/MarketSystem.js';
import { OrderSystem } from '../systems/OrderSystem.js';
import { LandSystem, LAND_CONFIG } from '../systems/LandSystem.js';
import { BuildingSystem } from '../systems/BuildingSystem.js';
import { SaveManager } from '../core/SaveManager.js';
import { GameState } from '../core/GameState.js';
import { Logger } from '../core/Logger.js';
import { Quality, GRAPHICS_LABELS } from '../core/QualityScaler.js';
import { iconHTML } from './icons.js';
import { BUILDINGS, CROPS, ITEMS, ECONOMY, FERTILIZERS, STORAGE_CONFIG } from '../data/GameData.js';
import { StorageSystem } from '../systems/StorageSystem.js';
import { FarmingSystem } from '../systems/FarmingSystem.js';
import { AnimalSystem } from '../systems/AnimalSystem.js';
import { formatNumber } from '../utils/Utils.js';

/** الأنظمة ترجّع أخطاء إنجليزية في بعض المسارات — نترجمها للعرض فقط. */
const AR_ERRORS = {
    'Not enough coins': 'لا تملك عملات كافية 💰',
    'Not enough items': 'لا تملك الكمية المطلوبة في المخزن',
    'Max listings reached': `وصلت للحد الأقصى من العروض (${ECONOMY.maxMarketListings})`,
    'Invalid item': 'عنصر غير معروف',
    'Invalid amount/price': 'الكمية أو السعر غير صالح',
    'Listing not found': 'العرض غير موجود',
    'Listing expired': 'انتهت مدة العرض',
    'Inventory full': 'المخزن ممتلئ!',
    'Tile not found': 'الموقع غير موجود',
    'Tile occupied': 'الموقع مشغول',
    'Tile locked': 'هذه الأرض مقفلة'
};

const PANELS = {
    shop: { title: '🏪 المتجر', tabs: ['seeds', 'fertilizer', 'animals', 'land', 'buildings', 'orders', 'market'] },
    bag: { title: '🎒 المخزن', tabs: ['bag'] },
    // 🌾🧺 ترقية الصومعة/الحظيرة بمواد البناء (Brief §1 «Storage»)
    storage: { title: '🌾🧺 المخازن', tabs: ['silo', 'barn'] },
    map: { title: '🗺️ خريطة المزرعة', tabs: ['map'] },
    menu: { title: '☰ القائمة', tabs: ['menu'] }
};

const TAB_LABELS = {
    seeds: 'البذور',
    fertilizer: 'الأسمدة',
    animals: 'الحيوانات',
    land: 'الأراضي',
    orders: 'الطلبات',
    market: 'السوق',
    buildings: 'المباني',
    bag: 'المخزن',
    silo: 'الصومعة 🌾',
    barn: 'الحظيرة 🧺',
    map: 'الخريطة',
    menu: 'الإعدادات'
};

/** وصف ماذا يخزّن كل مخزن — يمنع لبس اللاعب بين الصومعة والحظيرة. */
const STORE_INFO = {
    silo: {
        icon: '🌾',
        name: 'الصومعة (Silo)',
        holds: 'المحاصيل الخام والبذور فقط: قمح، ذرة، جزر، صويا، قصب، بذور.',
        blocks: 'إذا امتلأت يتوقف الحصاد — بِع محاصيل أو رقِّ السعة.'
    },
    barn: {
        icon: '🧺',
        name: 'الحظيرة (Barn)',
        holds: 'منتجات الحيوانات والآلات والعدة ومواد البناء: بيض، حليب، خبز، مسامير، ألواح.',
        blocks: 'إذا امتلأت لا يمكن استلام منتجات الآلات أو الحيوانات.'
    }
};

/** أسعار الأسمدة من GameData (سعر البيع × معامل الشراء). */
const FERTILIZER_BUY_MULT = 1.6;

/** ترتيب مراتب السماد — يُستخدم لتمكين/تعطيل أزرار التطبيق. */
const FERTILIZER_RANK = Object.freeze({ none: 0, basic: 1, quality: 2, deluxe: 3 });

/**
 * سعر شراء البذرة مشتق من سعر بيع المحصول (40%) حتى لا نخترع
 * أرقامًا ثابتة خارج GameData: القمح 25 ← البذرة 10.
 */
function seedPrice(crop) {
    return Math.max(1, Math.round((crop.sellPrice || 10) * 0.4));
}

function arError(err, fallback = 'تعذّر تنفيذ الطلب') {
    if (!err) return fallback;
    return AR_ERRORS[err] || err;
}

export class GameUI {
    /**
     * @param {object} deps
     * @param {object} deps.eventBus  ناقل الأحداث (Events)
     * @param {object} deps.toast     Toast لعرض النتائج بالعربية
     * @param {Function} [deps.getPlayerPos] () => {x,z} لعلامة اللاعب على الخريطة
     */
    constructor({ eventBus = null, toast = null, getPlayerPos = null } = {}) {
        this.events = eventBus;
        this.toast = toast;
        this.getPlayerPos = getPlayerPos;

        this.sheet = null;
        this.openPanel = null;
        this.openTab = null;
        this._unsubscribers = [];
        this._refreshTimer = 0;
    }

    /* ==========================================================
       البناء / التركيب
       ========================================================== */
    mount(parent = null) {
        if (this.sheet) return this;

        const host =
            parent ||
            document.getElementById('game-hud-overlay') ||
            document.body;

        const sheet = document.createElement('section');
        sheet.className = 'hud-sheet';
        sheet.id = 'hud-panel-sheet';
        sheet.setAttribute('aria-hidden', 'true');
        sheet.innerHTML = `
            <header class="hud-sheet-head">
                <span class="hud-sheet-title" id="hud-panel-title">🏪 المتجر</span>
                <span class="hud-sheet-sub" id="hud-panel-sub"></span>
                <button type="button" class="hud-sheet-close" id="hud-panel-close" aria-label="إغلاق">✕</button>
            </header>
            <div class="hud-sheet-tabs" id="hud-panel-tabs"></div>
            <div class="hud-sheet-body" id="hud-panel-body"></div>
            <footer class="hud-sheet-foot" id="hud-panel-foot"></footer>
        `;

        host.appendChild(sheet);
        this.sheet = sheet;

        sheet.addEventListener('pointerdown', (e) => e.stopPropagation());
        sheet.addEventListener('touchstart', (e) => e.stopPropagation());
        sheet.querySelector('#hud-panel-close').addEventListener('click', () => this.close());

        this._bindStateRefresh();
        return this;
    }

    /** أي تغيير مهم في الحالة ونحن مفتوحون → إعادة رسم التبويب الحالي. */
    _bindStateRefresh() {
        if (!this.events || typeof this.events.on !== 'function') return;

        const rerender = () => {
            if (this.isOpen()) this.render();
        };

        const names = [
            'state:changed',
            'crop:harvested',
            'crop:planted',
            'orders:refreshed',
            'order:accepted',
            'order:completed',
            'order:expired',
            'market:listed',
            'market:sold',
            'market:cancelled',
            'land:purchased',
            'land:prepared'
        ];

        names.forEach((name) => this.events.on(name, rerender));

        // الطلبات/السوق فيها مؤقّتات — تحديث دوري خفيف أثناء الفتح
        this._refreshTimer = setInterval(() => {
            if (this.isOpen() && (this.openTab === 'orders' || this.openTab === 'market')) {
                this.render();
            }
        }, 15000);
    }

    /* ==========================================================
       الفتح / الإغلاق
       ========================================================== */
    isOpen() {
        return !!this.sheet && this.sheet.classList.contains('is-open');
    }

    open(panel = 'shop', tab = null) {
        if (!this.sheet) this.mount();
        if (!PANELS[panel]) panel = 'shop';

        const same = this.openPanel === panel && this.isOpen();
        this.openPanel = panel;
        this.openTab = tab && PANELS[panel].tabs.includes(tab) ? tab : PANELS[panel].tabs[0];

        this.sheet.classList.add('is-open');
        this.sheet.setAttribute('aria-hidden', 'false');
        this.render();

        if (!same) this.events?.emit?.('hud:panel-opened', { panel, tab: this.openTab });
    }

    close() {
        if (!this.sheet) return;
        this.sheet.classList.remove('is-open');
        this.sheet.setAttribute('aria-hidden', 'true');
        this.openPanel = null;
        this.events?.emit?.('hud:panel-closed');
    }

    toggle(panel, tab) {
        if (this.isOpen() && this.openPanel === panel && (!tab || this.openTab === tab)) {
            this.close();
        } else {
            this.open(panel, tab);
        }
    }

    /* ==========================================================
       الرسم
       ========================================================== */
    render() {
        if (!this.sheet || !this.openPanel) return;

        const panel = PANELS[this.openPanel];
        this.sheet.querySelector('#hud-panel-title').textContent = panel.title;
        this.sheet.querySelector('#hud-panel-sub').textContent = this._subtitle();

        this._renderTabs(panel.tabs);
        this._renderBody();
        this._renderFoot();
    }

    _subtitle() {
        const coins = GameState.get('player.coins') || 0;
        const gems = GameState.get('player.gems') || 0;
        return `💰 ${formatNumber(coins)}   💎 ${formatNumber(gems)}`;
    }

    _renderTabs(tabs) {
        const bar = this.sheet.querySelector('#hud-panel-tabs');
        bar.innerHTML = '';
        if (tabs.length <= 1) {
            bar.style.display = 'none';
            return;
        }
        bar.style.display = 'flex';

        tabs.forEach((tab) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `hud-tab ${tab === this.openTab ? 'is-active' : ''}`;
            btn.textContent = TAB_LABELS[tab] || tab;
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openTab = tab;
                this.render();
            });
            bar.appendChild(btn);
        });
    }

    _renderBody() {
        const body = this.sheet.querySelector('#hud-panel-body');
        body.innerHTML = '';

        switch (this.openTab) {
            case 'seeds': return this._renderSeeds(body);
            case 'land': return this._renderLand(body);
            case 'buildings': return this._renderBuildings(body);
            case 'orders': return this._renderOrders(body);
            case 'market': return this._renderMarket(body);
            case 'fertilizer': return this._renderFertilizer(body);
            case 'animals': return this._renderAnimals(body);
            case 'silo': return this._renderStorage(body, 'silo');
            case 'barn': return this._renderStorage(body, 'barn');
            case 'bag': return this._renderBag(body);
            case 'map': return this._renderMap(body);
            case 'menu': return this._renderMenu(body);
            default: return this._renderSeeds(body);
        }
    }

    _renderFoot() {
        const foot = this.sheet.querySelector('#hud-panel-foot');
        foot.innerHTML = '';

        if (this.openTab === 'bag') {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'hud-sheet-wide';
            btn.textContent = 'بيع كل المحاصيل 💰';
            btn.addEventListener('click', () => this.sellAllCrops());
            foot.appendChild(btn);
            return;
        }

        if (this.openTab === 'market') {
            const stats = MarketSystem.getStats();
            const note = document.createElement('div');
            note.className = 'hud-menu-note';
            note.textContent =
                `عروضك ${stats.myListings} / ${stats.maxListings} — عمولة السوق ${Math.round(ECONOMY.marketFee * 100)}%`;
            foot.appendChild(note);
        }
    }

    /* ------------------------------ البذور ------------------------------ */
    _renderSeeds(body) {
        const coins = GameState.get('player.coins') || 0;

        Object.values(CROPS).forEach((crop) => {
            const seed = ITEMS[crop.seedId] || {};
            const price = seedPrice(crop);
            const owned = InventorySystem.count(crop.seedId);
            const affordable = coins >= price;

            const card = document.createElement('div');
            card.className = `shop-item ${affordable ? '' : 'locked'}`;
            card.innerHTML = `
                <div class="shop-icon">${iconHTML(crop.icon || seed.icon, 30)}</div>
                <div>
                    <div class="shop-name">${seed.name || `بذور ${crop.name}`}</div>
                    <div class="shop-desc">
                        تنمو في ${crop.growTime} ثانية · تُباع بـ 🪙 ${crop.sellPrice}
                        · لديك ${owned}
                    </div>
                    <div class="shop-cost"><span class="coin-cost">🪙 ${price}</span></div>
                </div>
                <div class="order-actions"></div>
            `;

            const actions = card.querySelector('.order-actions');
            actions.appendChild(this._button('شراء', () => this.buySeed(crop, 1), !affordable));
            actions.appendChild(
                this._button(`×5 (${formatNumber(price * 5)})`, () => this.buySeed(crop, 5), coins < price * 5)
            );

            body.appendChild(card);
        });
    }

    buySeed(crop, amount) {
        const price = seedPrice(crop) * amount;
        const coins = GameState.get('player.coins') || 0;
        const seed = ITEMS[crop.seedId] || {};

        if (coins < price) {
            this._error(`لا تملك عملات كافية — تحتاج 🪙 ${formatNumber(price)}`);
            return;
        }

        const free = InventorySystem.freeSpace();
        if (free < amount) {
            this._error(free <= 0 ? 'المخزن ممتلئ! بِع بعض المحاصيل أولًا' : `المخزن يتسع لـ ${free} فقط`);
            return;
        }

        GameState.set('player.coins', coins - price);
        const added = InventorySystem.add(crop.seedId, amount);

        if (!added.success) {
            // نُرجع العملات لأن الإضافة فشلت (لا نفقد مال اللاعب)
            GameState.set('player.coins', (GameState.get('player.coins') || 0) + price);
            this._error(arError(added.error, 'تعذّر شراء البذور'));
            return;
        }

        this._success(`🌱 اشتريت ${added.added} × ${seed.name || crop.name} مقابل 🪙 ${formatNumber(price)}`);
        this.events?.emit?.('shop:purchased', { itemId: crop.seedId, amount: added.added, coins: price });
        this.render();
    }

    /* ------------------------------ الأراضي ------------------------------ */
    _renderLand(body) {
        const fields = LandSystem.getAllFields() || [];
        const locked = fields.filter((f) => !f.purchased);
        const unprepared = fields.filter((f) => f.purchased && !f.prepared);
        const coins = GameState.get('player.coins') || 0;

        if (locked.length === 0 && unprepared.length === 0) {
            body.innerHTML = '<div class="hud-sheet-empty">كل الأراضي مفتوحة ومجهّزة 🎉</div>';
            return;
        }

        locked.forEach((field) => {
            const price = field.price || LAND_CONFIG.fieldPrice;
            const card = document.createElement('div');
            card.className = `shop-item ${coins >= price ? '' : 'locked'}`;
            card.innerHTML = `
                <div class="shop-icon">🌾</div>
                <div>
                    <div class="shop-name">${this._fieldName(field)}</div>
                    <div class="shop-desc">بعد الشراء جهّزها بـ 4 ضربات فأس 🪓</div>
                    <div class="shop-cost"><span class="coin-cost">🪙 ${formatNumber(price)}</span></div>
                </div>
                <div class="order-actions"></div>
            `;
            card.querySelector('.order-actions').appendChild(
                this._button('شراء', () => this.buyLand(field.id), coins < price)
            );
            body.appendChild(card);
        });

        unprepared.forEach((field) => {
            const card = document.createElement('div');
            card.className = 'shop-item';
            card.innerHTML = `
                <div class="shop-icon">🪓</div>
                <div>
                    <div class="shop-name">${this._fieldName(field)}</div>
                    <div class="shop-desc">مشتراة — تحتاج تجهيزًا بالفأس (${field.prepProgress || 0}%)</div>
                </div>
            `;
            body.appendChild(card);
        });
    }

    _fieldName(field) {
        return field.name || `أرض ${field.id.replace(/_/g, ' ')}`;
    }

    buyLand(fieldId) {
        const res = LandSystem.purchaseField(fieldId);
        if (!res.success) {
            const msg = res.reason === 'insufficient-funds'
                ? `تحتاج 🪙 ${formatNumber(res.required || LAND_CONFIG.fieldPrice)} لشراء هذه الأرض`
                : (res.reason === 'already-purchased' ? 'هذه الأرض مفتوحة بالفعل' : 'تعذّر شراء الأرض');
            this._error(msg);
            return;
        }
        this._success(`🌾 اشتريت الأرض مقابل 🪙 ${formatNumber(res.cost || LAND_CONFIG.fieldPrice)} — جهّزها بالفأس`);
        this.render();
    }

    /* ------------------------------ المباني ------------------------------ */
    /**
     * مباني الإنتاج المملوكة — قراءة من BuildingSystem (لا شراء وهمي:
     * الطاحونة والمخبز يأتيان مع المزرعة، وأي مبنى آخر لا نموذج له بعد).
     */
    _renderBuildings(body) {
        const buildings = BuildingSystem.getBuildings() || [];

        if (buildings.length === 0) {
            body.innerHTML = '<div class="hud-sheet-empty">لا مباني إنتاج بعد</div>';
            return;
        }

        buildings.forEach((b) => {
            const card = document.createElement('div');
            card.className = 'shop-item';
            card.innerHTML = `
                <div class="shop-icon">${iconHTML(b.icon, 30)}</div>
                <div>
                    <div class="shop-name">${b.name || b.typeId} · مستوى ${b.level || 1}</div>
                    <div class="shop-desc">
                        قائمة الإنتاج: ${(b.productionQueue || []).length} / ${b.queueLimit || 3}
                    </div>
                </div>
            `;
            body.appendChild(card);
        });

        const hint = document.createElement('div');
        hint.className = 'hud-menu-note';
        hint.textContent = 'افتح المبنى من العالم لبدء الإنتاج: قمح ← دقيق ← خبز 🍞';
        body.appendChild(hint);

        this._renderMachineShop(body, buildings);
    }

    /**
     * 🏭 شراء الآلات بالكوينز (Brief §1 «coins buy ... machines»).
     * المبنى الجديد يُوضع تلقائيًا في صف الآلات بساحة الإنتاج
     * (الموضع من FarmLayout عبر BuildingSystem.purchase).
     */
    _renderMachineShop(body, owned) {
        const coins = GameState.get('player.coins') || 0;
        const level = GameState.get('player.level') || 1;
        const ownedTypes = new Set((owned || []).map((b) => b.typeId));

        const heading = document.createElement('div');
        heading.className = 'hud-sheet-sub';
        heading.textContent = 'شراء آلة جديدة';
        body.appendChild(heading);

        const machines = Object.values(BUILDINGS).filter(
            (b) => b.category === 'production' && !ownedTypes.has(b.id)
        );

        if (machines.length === 0) {
            const done = document.createElement('div');
            done.className = 'hud-sheet-empty';
            done.textContent = 'تملك كل الآلات المتاحة 🎉';
            body.appendChild(done);
            return;
        }

        machines.forEach((def) => {
            const cost = def.cost || { coins: 0, gems: 0 };
            const locked = (def.unlockLevel || 1) > level;
            const affordable = coins >= (cost.coins || 0) && GameState.get('player.gems') >= (cost.gems || 0);

            const card = document.createElement('div');
            card.className = `shop-item ${locked || !affordable ? 'locked' : ''}`;
            card.innerHTML = `
                <div class="shop-icon">${iconHTML(def.icon, 30)}</div>
                <div>
                    <div class="shop-name">${def.name || def.id}</div>
                    <div class="shop-desc">
                        ${def.description || ''}
                        ${locked ? `<br>🔒 تتطلب المستوى ${def.unlockLevel}` : ''}
                    </div>
                    <div class="shop-cost">
                        <span class="coin-cost">🪙 ${formatNumber(cost.coins || 0)}</span>
                        ${cost.gems ? `<span class="gem-cost">💎 ${cost.gems}</span>` : ''}
                    </div>
                </div>
                <div class="order-actions"></div>
            `;

            const actions = card.querySelector('.order-actions');
            actions.appendChild(this._button('شراء', () => this.buyMachine(def.id), locked || !affordable));
            body.appendChild(card);
        });
    }

    buyMachine(buildingId) {
        const res = BuildingSystem.purchase(buildingId);
        if (!res.success) {
            this._error(arError(res.error, 'تعذّر شراء المبنى'));
            return;
        }
        const def = BUILDINGS[buildingId] || {};
        this._success(`${def.icon || '🏭'} أُضيف ${def.name || buildingId} إلى ساحة الإنتاج`);
        this.events?.emit?.('shop:purchased', { kind: 'building', buildingId });
        this.render();
    }

    /* ------------------------------ الطلبات ------------------------------ */
    _renderOrders(body) {
        const orders = OrderSystem.getOrders() || [];
        if (orders.length === 0) {
            body.innerHTML = '<div class="hud-sheet-empty">لا توجد طلبات الآن — ستصل طلبات جديدة قريبًا 📦</div>';
            return;
        }

        orders.forEach((order) => {
            const wrap = document.createElement('div');
            wrap.innerHTML = Components.orderCard(order);
            const card = wrap.firstElementChild;
            if (!card) return;

            card.querySelectorAll('[data-action]').forEach((btn) => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._orderAction(order.id, btn.dataset.action);
                });
            });

            body.appendChild(card);
        });
    }

    _orderAction(orderId, action) {
        const res =
            action === 'accept' ? OrderSystem.accept(orderId)
                : action === 'reject' ? OrderSystem.reject(orderId)
                    : action === 'complete' ? OrderSystem.complete(orderId)
                        : { success: false, error: 'إجراء غير معروف' };

        if (!res.success) {
            this._error(arError(res.error, 'تعذّر تنفيذ الطلب'));
            return;
        }

        if (action === 'complete') {
            const rewards = res.rewards || {};
            this._success(`📦 تم تسليم الطلب — +🪙 ${formatNumber(rewards.coins || 0)} +⭐ ${formatNumber(rewards.xp || 0)}`);
        } else if (action === 'accept') {
            this._success('✅ تم قبول الطلب — جهّز المحاصيل المطلوبة');
        } else {
            this._success('🗑️ تم رفض الطلب');
        }
        this.render();
    }

    /* ------------------------------ السوق ------------------------------ */
    _renderMarket(body) {
        // 1) اعرض محصولًا للبيع
        const rows = InventorySystem.list().filter((r) => r.category !== 'seed');
        if (rows.length > 0) {
            const title = document.createElement('div');
            title.className = 'hud-menu-note';
            title.textContent = 'اعرض من مخزنك للبيع:';
            body.appendChild(title);

            rows.forEach((row) => {
                const line = document.createElement('div');
                line.className = 'hud-market-sell';
                line.innerHTML = `
                    <span>${row.icon} ${row.name} <small>(×${row.count})</small></span>
                `;

                const qty = document.createElement('input');
                qty.type = 'number';
                qty.min = '1';
                qty.max = String(row.count);
                qty.value = '1';
                qty.setAttribute('aria-label', `الكمية من ${row.name}`);

                const price = document.createElement('input');
                price.type = 'number';
                price.min = '1';
                price.value = String(Math.max(1, Math.round(row.sellPrice * 1.15)));
                price.setAttribute('aria-label', `سعر الوحدة من ${row.name}`);

                const btn = this._button('اعرض', () => {
                    this.listItem(row, Number(qty.value), Number(price.value));
                });

                line.appendChild(qty);
                line.appendChild(price);
                line.appendChild(btn);
                body.appendChild(line);
            });
        }

        // 2) عروضي
        const mine = MarketSystem.getMyListings() || [];
        if (mine.length) {
            const t1 = document.createElement('div');
            t1.className = 'hud-menu-note';
            t1.textContent = 'عروضك الحالية:';
            body.appendChild(t1);

            mine.forEach((listing) => {
                const wrap = document.createElement('div');
                wrap.innerHTML = Components.marketListing(listing);
                const card = wrap.firstElementChild;
                if (!card) return;
                const buy = card.querySelector('.m-buy');
                if (buy) {
                    buy.textContent = 'إلغاء';
                    buy.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.cancelListing(listing.id);
                    });
                }
                body.appendChild(card);
            });
        }

        // 3) سوق اللاعبين الآخرين (AI)
        const theirs = (MarketSystem.getListings() || []).filter((l) => l.sellerId !== 'player');
        const t2 = document.createElement('div');
        t2.className = 'hud-menu-note';
        t2.textContent = theirs.length ? 'معروض في السوق:' : 'لا معروضات في السوق الآن — عُد بعد قليل';
        body.appendChild(t2);

        theirs.forEach((listing) => {
            const wrap = document.createElement('div');
            wrap.innerHTML = Components.marketListing(listing);
            const card = wrap.firstElementChild;
            if (!card) return;
            const coins = GameState.get('player.coins') || 0;
            const fee = Math.floor((listing.totalPrice || 0) * ECONOMY.marketFee);
            const buy = card.querySelector('.m-buy');
            if (buy) {
                buy.disabled = coins < (listing.totalPrice || 0) + fee;
                buy.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.buyListing(listing.id);
                });
            }
            body.appendChild(card);
        });
    }

    listItem(row, amount, pricePerUnit) {
        const res = MarketSystem.listItem(row.id, amount, pricePerUnit);
        if (!res.success) {
            this._error(arError(res.error, 'تعذّر عرض المنتج'));
            return;
        }
        this._success(`🛒 عرضت ${amount} × ${row.name} في السوق`);
        this.render();
    }

    cancelListing(listingId) {
        const res = MarketSystem.cancelListing(listingId);
        if (!res.success) {
            this._error(arError(res.error, 'تعذّر إلغاء العرض'));
            return;
        }
        this._success('↩️ عاد المنتج إلى مخزنك');
        this.render();
    }

    buyListing(listingId) {
        const res = MarketSystem.buyFromMarket(listingId);
        if (!res.success) {
            this._error(arError(res.error, 'تعذّر الشراء من السوق'));
            return;
        }
        this._success('🛍️ تم الشراء من السوق');
        this.render();
    }

    /* ------------------- 🐄 شراء الحيوانات بالعملات ------------------- */
    _renderAnimals(body) {
        const intro = document.createElement('div');
        intro.className = 'hud-sheet-empty';
        intro.textContent =
            'اشترِ حيوانات بالكوينز — تُوضع تلقائيًا في حظيرتها، وتحتاج علفًا من مطحنة الأعلاف قبل أن تُنتج.';
        body.appendChild(intro);

        let catalog = [];
        try {
            catalog = AnimalSystem.getCatalog() || [];
        } catch (e) {
            Logger.warn('UI', 'animal catalog read failed', e);
            body.innerHTML = '<div class="hud-sheet-empty">تعذّر قراءة قائمة الحيوانات</div>';
            return;
        }

        const productNames = { egg: 'بيض', milk: 'حليب', wool: 'صوف', truffle: 'كمأة' };

        catalog.forEach((entry) => {
            const product = ITEMS[entry.product]?.name || productNames[entry.product] || entry.product;
            const feed = ITEMS[entry.feedItem]?.name || entry.feedItem;
            const locked = entry.levelLocked;

            const card = document.createElement('div');
            card.className = `shop-item ${locked || !entry.affordable ? 'locked' : ''}`;
            card.innerHTML = `
                <div class="shop-icon">${iconHTML(entry.icon, 30)}</div>
                <div>
                    <div class="shop-name">${entry.name} · ${entry.nameEn || ''}</div>
                    <div class="shop-desc">
                        تنتج ${product} · العلف: ${feed} · لديك ${entry.owned}
                        ${locked ? `<br>🔒 تتطلب المستوى ${entry.unlockLevel}` : ''}
                    </div>
                    <div class="shop-cost"><span class="coin-cost">🪙 ${formatNumber(entry.costCoins)}</span></div>
                </div>
                <div class="order-actions"></div>
            `;

            const actions = card.querySelector('.order-actions');
            actions.appendChild(
                this._button('شراء', () => this.buyAnimal(entry.id), locked || !entry.affordable)
            );
            body.appendChild(card);
        });
    }

    buyAnimal(species) {
        const res = AnimalSystem.purchaseAnimal(species);
        if (!res.success) {
            this._error(arError(res.error || res.reason, 'تعذّر شراء الحيوان'));
            return;
        }
        this._success(`${res.icon || '🐄'} اشتريت ${res.name} مقابل 🪙 ${formatNumber(res.coins || 0)}`);
        this.events?.emit?.('shop:purchased', { kind: 'animal', species, coins: res.coins || 0 });
        this.render();
    }

    /* --------------------- الأسمدة (مراتب جودة التربة) --------------------- */
    _renderFertilizer(body) {
        const coins = GameState.get('player.coins') || 0;

        const intro = document.createElement('div');
        intro.className = 'hud-sheet-empty';
        intro.textContent =
            'السماد يرفع فرصة الجودة: عادي ← فضي ← ذهبي ← بلاتيني (الديلوكس وحده يفتح البلاتيني). ' +
            'يُضاف على تربة فارغة أو بادرة قبل الإنبات، ويبقى في التربة بعد الحصاد.';
        body.appendChild(intro);

        ['basic', 'quality', 'deluxe'].forEach((tierId) => {
            const tier = FERTILIZERS[tierId];
            if (!tier) return;
            const item = ITEMS[tier.itemId] || {};
            const price = Math.max(1, Math.round((item.sellPrice || 20) * FERTILIZER_BUY_MULT));
            const owned = InventorySystem.count(tier.itemId);
            const affordable = coins >= price;
            const c = tier.chances;
            const pct = (v) => `${Math.round((v || 0) * 100)}%`;

            const card = document.createElement('div');
            card.className = `shop-item ${affordable ? '' : 'locked'}`;
            card.innerHTML = `
                <div class="shop-icon">${iconHTML(tier.icon, 30)}</div>
                <div>
                    <div class="shop-name">${tier.name} · ${tier.nameEn}</div>
                    <div class="shop-desc">
                        عادي ${pct(c[0])} · فضي ${pct(c[1])} · ذهبي ${pct(c[2])} · بلاتيني ${pct(c[3])}
                        <br>محصول إضافي +${Math.round((tier.yieldBonus || 0) * 100)}% · لديك ${owned}
                    </div>
                    <div class="shop-cost"><span class="coin-cost">🪙 ${formatNumber(price)}</span></div>
                </div>
                <div class="order-actions"></div>
            `;

            const actions = card.querySelector('.order-actions');
            actions.appendChild(this._button('شراء', () => this.buyFertilizer(tierId, 1), !affordable));
            actions.appendChild(
                this._button(`×3 (${formatNumber(price * 3)})`, () => this.buyFertilizer(tierId, 3), coins < price * 3)
            );
            body.appendChild(card);
        });

        // خانات يمكن تسميدها الآن — حتى لا يشتري اللاعب سمادًا بلا مكان لاستعماله
        const heading = document.createElement('div');
        heading.className = 'hud-sheet-sub';
        heading.textContent = 'خانات قابلة للتسميد الآن';
        body.appendChild(heading);

        const targets = this._fertilizableSlots(10);
        if (targets.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'hud-sheet-empty';
            empty.textContent = 'لا توجد خانة جاهزة للتسميد — ازرع أولًا أو جهّز أرضًا.';
            body.appendChild(empty);
            return;
        }

        targets.forEach((t) => {
            const row = document.createElement('div');
            row.className = 'hud-bag-row';

            const stateLabel = t.slot.state === 'growing'
                ? `🌱 بادرة ${Math.round((t.progress || 0) * 100)}%`
                : '🟫 تربة فارغة';
            const currentTier = FERTILIZERS[t.slot.fertilizer || 'none'] || FERTILIZERS.none;

            row.innerHTML = `
                <span class="hud-bag-icon">${currentTier.icon || '🟫'}</span>
                <span class="hud-bag-name">${t.fieldLabel} · خانة ${t.slotIndex + 1}</span>
                <span class="hud-bag-count">${stateLabel}</span>
                <span class="hud-bag-price">${currentTier.name}</span>
            `;

            ['basic', 'quality', 'deluxe'].forEach((tierId) => {
                const tier = FERTILIZERS[tierId];
                const rank = FERTILIZER_RANK[tierId];
                const ownedCount = InventorySystem.count(tier.itemId);
                const usable = ownedCount > 0 && rank > FERTILIZER_RANK[t.slot.fertilizer || 'none'];
                row.appendChild(this._button(
                    `${tier.icon} ${ownedCount}`,
                    () => this.applyFertilizer(t.fieldId, t.slotIndex, tierId),
                    !usable
                ));
            });

            body.appendChild(row);
        });
    }

    /** مرتبة السماد في الواجهة (نفس ترتيب GameData). */
    _fertilizableSlots(limit = 10) {
        const out = [];
        const fields = LandSystem.getAllFields() || [];

        fields.forEach((field, idx) => {
            if (!field.purchased || !field.prepared) return;
            let slots = [];
            try {
                slots = FarmingSystem.getOrCreateSlots(field.id) || [];
            } catch (e) {
                Logger.debug('UI', `slots read skipped for ${field.id}`, e);
                return;
            }

            for (let i = 0; i < slots.length; i++) {
                const slot = slots[i];
                if (!slot || slot.state === 'ready' || slot.state === 'withered') continue;

                let progress = 0;
                if (slot.state === 'growing') {
                    progress = FarmingSystem.growthProgress(slot)?.progress ?? 1;
                    if (progress > 0.4) continue; // بعد الإنبات لا ينفع السماد
                }
                if (FERTILIZER_RANK[slot.fertilizer || 'none'] >= FERTILIZER_RANK.deluxe) continue;

                out.push({
                    fieldId: field.id,
                    slotIndex: i,
                    slot,
                    progress,
                    fieldLabel: field.name || `حقل ${idx + 1}`
                });
                if (out.length >= limit) return;
            }
        });

        return out;
    }

    buyFertilizer(tierId, amount) {
        const tier = FERTILIZERS[tierId];
        if (!tier) return;
        const item = ITEMS[tier.itemId] || {};
        const price = Math.max(1, Math.round((item.sellPrice || 20) * FERTILIZER_BUY_MULT)) * amount;
        const coins = GameState.get('player.coins') || 0;

        if (coins < price) {
            this._error(`لا تملك عملات كافية — تحتاج 🪙 ${formatNumber(price)}`);
            return;
        }

        const gate = StorageSystem.checkAdd(tier.itemId, amount);
        if (gate && gate.allowed < amount) {
            this._error(gate.allowed <= 0
                ? 'الحظيرة ممتلئة — بِع منتجات أو رقِّ السعة أولًا'
                : `الحظيرة تتسع لـ ${gate.allowed} فقط`);
            return;
        }

        GameState.set('player.coins', coins - price);
        const added = InventorySystem.add(tier.itemId, amount);
        if (!added.success) {
            GameState.set('player.coins', (GameState.get('player.coins') || 0) + price);
            this._error(arError(added.error, 'تعذّر شراء السماد'));
            return;
        }

        this._success(`${tier.icon} اشتريت ${added.added} × ${tier.name} مقابل 🪙 ${formatNumber(price)}`);
        this.events?.emit?.('shop:purchased', { itemId: tier.itemId, amount: added.added, coins: price });
        this.render();
    }

    applyFertilizer(fieldId, slotIndex, tierId) {
        const res = FarmingSystem.fertilizeSlot(fieldId, slotIndex, tierId);
        if (!res.success) {
            this._error(arError(res.error, 'تعذّر التسميد'));
            return;
        }
        this._success(`${res.icon || '✨'} أُضيف ${res.name} — فرصة جودة أعلى عند الحصاد`);
        this.render();
    }

    /* ------------------- المخازن: الصومعة 🌾 / الحظيرة 🧺 ------------------- */
    _renderStorage(body, store) {
        const info = STORE_INFO[store] || STORE_INFO.silo;
        let snap;
        try {
            snap = StorageSystem.snapshot();
        } catch (e) {
            Logger.warn('UI', 'storage state read failed', e);
            body.innerHTML = '<div class="hud-sheet-empty">تعذّر قراءة حالة المخازن</div>';
            return;
        }
        const data = snap[store];
        if (!data) return;

        const pct = Math.round((data.fill || 0) * 100);

        const card = document.createElement('div');
        card.className = 'shop-item';
        card.innerHTML = `
            <div class="shop-icon">${iconHTML(info.icon, 30)}</div>
            <div>
                <div class="shop-name">${info.name} · مستوى ${data.level}</div>
                <div class="shop-desc">${info.holds}<br>${info.blocks}</div>
                <div class="storage-bar">
                    <span class="storage-fill ${data.full ? 'is-full' : ''}" style="width:${pct}%"></span>
                </div>
                <div class="shop-desc">${data.used} / ${data.capacity} (${pct}%)</div>
            </div>
            <div class="order-actions"></div>
        `;
        body.appendChild(card);

        // الترقية التالية بمواد البناء
        const cost = StorageSystem.upgradeCost(store);
        const actions = card.querySelector('.order-actions');

        if (!cost) {
            const max = document.createElement('div');
            max.className = 'shop-desc';
            max.textContent = `وصلت لأعلى مستوى (${STORAGE_CONFIG.maxLevel}) 🎉`;
            actions.appendChild(max);
            return;
        }

        const nextCapacity = StorageSystem.capacityForLevel(data.level + 1);
        const costRow = document.createElement('div');
        costRow.className = 'shop-desc';
        costRow.innerHTML = '<strong>ترقية إلى مستوى ' + (data.level + 1) + '</strong> (سعة ' + nextCapacity + '):<br>' +
            Object.entries(cost)
                .filter(([, need]) => need > 0)
                .map(([itemId, need]) => {
                    const have = InventorySystem.count(itemId);
                    const ok = have >= need;
                    return `<span class="${ok ? 'supply-ok' : 'supply-missing'}">${ITEMS[itemId]?.icon || '📦'} ${ITEMS[itemId]?.name || itemId} ${have}/${need}</span>`;
                })
                .join(' · ');
        actions.appendChild(costRow);

        const canUpgrade = Object.entries(cost).every(([itemId, need]) => InventorySystem.count(itemId) >= need);
        actions.appendChild(this._button('ترقية ⬆️', () => this.upgradeStorage(store), !canUpgrade));

        const hint = document.createElement('div');
        hint.className = 'hud-sheet-empty';
        hint.textContent = 'مواد الترقية (مسامير/ألواح/شريط لاصق) تسقط من الحصاد وتسليم الطلبات وزوّار الكشك.';
        body.appendChild(hint);
    }

    upgradeStorage(store) {
        const res = StorageSystem.upgrade(store);
        if (!res.success) {
            if (res.reason === 'missing-supplies' && Array.isArray(res.missing)) {
                const need = res.missing
                    .map((m) => `${m.icon || '📦'} ${m.name} ${m.have}/${m.need}`)
                    .join(' · ');
                this._error(`مواد الترقية غير مكتملة: ${need}`);
            } else {
                this._error(arError(res.error, 'تعذّرت الترقية'));
            }
            return;
        }

        const info = STORE_INFO[store] || STORE_INFO.silo;
        this._success(`⬆️ ${info.name} الآن مستوى ${res.level} — السعة ${res.capacity}`);
        this.render();
    }

    /* ------------------------------ المخزن ------------------------------ */
    _renderBag(body) {
        const rows = InventorySystem.list();
        if (rows.length === 0) {
            body.innerHTML = '<div class="hud-sheet-empty">المخزن فارغ — احصد محصولًا 🌾</div>';
            return;
        }

        rows.forEach((row) => {
            const line = document.createElement('div');
            line.className = 'hud-bag-row';
            line.innerHTML = `
                <span class="hud-bag-icon">${row.icon}</span>
                <span class="hud-bag-name">${row.name}</span>
                <span class="hud-bag-count">×${row.count}</span>
                <span class="hud-bag-price">🪙 ${formatNumber(row.sellPrice)}</span>
            `;

            const sellOne = this._button('بيع', () => this.sellItem(row.id, 1));
            const sellAll = this._button('الكل', () => this.sellItem(row.id, null));
            sellAll.classList.add('all');

            line.appendChild(sellOne);
            line.appendChild(sellAll);
            body.appendChild(line);
        });
    }

    sellItem(itemId, amount) {
        const res = amount === null ? InventorySystem.sellAll(itemId) : InventorySystem.sell(itemId, amount);
        if (!res.success) {
            this._error(arError(res.error, 'تعذّر البيع'));
            return;
        }
        this._success(`💰 بعت ${res.amount} × ${res.name} مقابل 🪙 ${formatNumber(res.coins)}`);
        this.events?.emit?.('item:sold', { itemId, amount: res.amount, coins: res.coins });
        this.render();
    }

    sellAllCrops() {
        let coins = 0;
        let units = 0;

        for (const row of InventorySystem.list()) {
            if (row.category === 'seed') continue;
            const res = InventorySystem.sellAll(row.id);
            if (res.success) {
                coins += res.coins;
                units += res.amount;
            }
        }

        if (units === 0) {
            this._error('لا توجد محاصيل للبيع');
            return;
        }
        this._success(`💰 بعت ${units} منتج مقابل 🪙 ${formatNumber(coins)}`);
        this.render();
    }

    /* ------------------------------ الخريطة ------------------------------ */
    _renderMap(body) {
        // العالم يمتد تقريبًا ±30 وحدة — نحوّله إلى نسبة من الخريطة
        const WORLD = 34;
        const toPct = (v) => `${Math.max(2, Math.min(98, ((v + WORLD) / (WORLD * 2)) * 100))}%`;

        const map = document.createElement('div');
        map.className = 'hud-map';

        const put = (icon, x, z, cls = '', label = '') => {
            const el = document.createElement('span');
            el.className = `hud-map-marker ${cls}`.trim();
            el.textContent = icon;
            el.style.left = toPct(x);
            el.style.top = toPct(z);
            map.appendChild(el);

            if (label) {
                const lb = document.createElement('span');
                lb.className = 'hud-map-label';
                lb.textContent = label;
                lb.style.left = toPct(x);
                lb.style.top = toPct(z);
                map.appendChild(lb);
            }
        };

        (LandSystem.getAllFields() || []).forEach((f) => {
            put(f.purchased ? (f.prepared ? '🟫' : '🌾') : '🔒', f.posX, f.posZ, f.purchased ? '' : 'locked');
        });

        (GameState.get('farm.buildings') || []).forEach((b) => {
            put(b.icon || '🏭', b.position?.x ?? 0, b.position?.z ?? 0);
        });

        put('🏠', -13, -13);
        put('🛖', 14, -12);
        put('🪧', 0, 7);

        const pos = typeof this.getPlayerPos === 'function' ? this.getPlayerPos() : null;
        put('🧑‍🌾', pos?.x ?? 0, pos?.z ?? 0, 'player');

        body.appendChild(map);

        const legend = document.createElement('div');
        legend.className = 'hud-map-legend';
        legend.innerHTML = '<span>🟫 حقل جاهز</span><span>🌾 أرض مفتوحة</span><span>🔒 مقفلة</span><span>🧑‍🌾 أنت</span>';
        body.appendChild(legend);
    }

    /* ------------------------------ القائمة ------------------------------ */
    _renderMenu(body) {
        const sfx = GameState.get('settings.sfx') !== false;

        const stats = GameState.get('stats') || {};

        /*
         * التاريخ/الفصل من ساعة الجهاز الحقيقية (Brief §0.3) — لا
         * «يوم 1» وهمي. الحقول يكتبها TimeManager كل دقيقة حقيقية.
         */
        const dateLabel = GameState.get('time.dateLabel') || '';
        const seasonAr = GameState.get('time.seasonAr') || '';
        const seasonEn = GameState.get('time.seasonEn') || '';
        const clockLabel = GameState.get('time.clockLabel') || '';

        const note = document.createElement('div');
        note.className = 'hud-menu-note';
        note.textContent =
            `مستوى ${GameState.get('player.level') || 1} · ` +
            `${[clockLabel, dateLabel, seasonAr && `${seasonAr} ${seasonEn}`.trim()].filter(Boolean).join(' · ') || '—'} · ` +
            `حصاد ${stats.totalHarvests || 0} · مبيعات ${formatNumber(stats.totalSales || 0)}`;
        body.appendChild(note);

        // 🌾🧺 امتلاء المخازن + اختصار للترقية
        try {
            const snap = StorageSystem.snapshot();
            const storeNote = document.createElement('div');
            storeNote.className = 'hud-menu-note';
            storeNote.textContent =
                `🌾 الصومعة ${snap.silo.used}/${snap.silo.capacity} (م${snap.silo.level}) · ` +
                `🧺 الحظيرة ${snap.barn.used}/${snap.barn.capacity} (م${snap.barn.level})`;
            body.appendChild(storeNote);

            const storageRow = this._menuRow('⬆️ ترقية المخازن', 'فتح', true, () => this.open('storage', 'silo'));
            body.appendChild(storageRow);
        } catch (e) { Logger.debug('UI', 'menu storage note unavailable', e); }

        const soundRow = this._menuRow('🔊 المؤثرات الصوتية', sfx ? 'مفعّلة' : 'متوقفة', sfx, () => {
            GameState.set('settings.sfx', !sfx);
            this.render();
        });
        body.appendChild(soundRow);

        // MF-07: جودة الرسوم — تبديل حي بلا إعادة تحميل (QualityScaler)
        const gfxLevel = GameState.get('settings.graphics') || 'high';
        const gfxRow = this._menuRow('🎮 جودة الرسوم', GRAPHICS_LABELS[gfxLevel] || gfxLevel, true, () => {
            const next = Quality.cycle();
            this._success(`🎮 جودة الرسوم: ${GRAPHICS_LABELS[next] || next}`);
            this.render();
        });
        body.appendChild(gfxRow);

        // MF-06: نسخ تقرير تشخيص — حلقة Logger (آخر ٥٠ حدثًا موسومًا)
        const diagRow = this._menuRow('🧰 نسخ تقرير تشخيص', 'نسخ', true, () => {
            this._copyDiagnostics();
        });
        body.appendChild(diagRow);

        const saveRow = this._menuRow('💾 حفظ الآن', 'حفظ', true, () => {
            try {
                SaveManager.save();
                this._success('💾 تم حفظ المزرعة');
            } catch (err) {
                Logger.warn('UI', 'manual save call failed (autosave will retry)', err);
                this._error('تعذّر الحفظ الآن — سنحاول تلقائيًا');
            }
        });
        body.appendChild(saveRow);

        const bagRow = this._menuRow('🎒 المخزن', 'فتح', true, () => this.open('bag'));
        body.appendChild(bagRow);

        const ordersRow = this._menuRow('📦 الطلبات', 'فتح', true, () => this.open('shop', 'orders'));
        body.appendChild(ordersRow);

        const marketRow = this._menuRow('🛒 السوق', 'فتح', true, () => this.open('shop', 'market'));
        body.appendChild(marketRow);

        const hint = document.createElement('div');
        hint.className = 'hud-menu-note';
        hint.textContent = 'التقدّم يُحفظ تلقائيًا في هذا الجهاز (IndexedDB + نسخة احتياطية).';
        body.appendChild(hint);
    }

    /**
     * MF-06 — ينسخ تقرير التشخيص (حلقة Logger) إلى الحافظة.
     * مساران: Clipboard API (HTTPS) ثم execCommand القديم كاحتياط.
     */
    _copyDiagnostics() {
        const report = Logger.report() || 'لا أحداث مسجّلة بعد — العب قليلًا ثم أعد المحاولة.';

        const fallbackCopy = () => {
            try {
                const ta = document.createElement('textarea');
                ta.value = report;
                ta.style.cssText = 'position:fixed;opacity:0;top:0';
                document.body.appendChild(ta);
                ta.select();
                const ok = document.execCommand?.('copy');
                ta.remove();
                return !!ok;
            } catch (err) {
                Logger.warn('GameUI', 'execCommand copy fallback failed', err);
                return false;
            }
        };

        const done = (ok) => {
            if (ok) this._success('🧰 نُسخ تقرير التشخيص — ألصقه في رسالة للدعم');
            else this._error('تعذّر النسخ التلقائي — فعّل إذن الحافظة');
        };

        try {
            if (navigator.clipboard?.writeText) {
                navigator.clipboard.writeText(report)
                    .then(() => done(true))
                    .catch(() => done(fallbackCopy()));
            } else {
                done(fallbackCopy());
            }
        } catch (err) {
            Logger.warn('GameUI', 'diagnostics copy threw', err);
            done(fallbackCopy());
        }
    }

    _menuRow(label, value, on, handler) {
        const row = document.createElement('div');
        row.className = 'hud-menu-row';

        const text = document.createElement('span');
        text.textContent = label;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `hud-switch ${on ? 'on' : ''}`;
        btn.textContent = value;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            handler();
        });

        row.appendChild(text);
        row.appendChild(btn);
        return row;
    }

    /* ------------------------------ أدوات ------------------------------ */
    _button(text, handler, disabled = false) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = text;
        btn.disabled = !!disabled;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (btn.disabled) return;
            handler();
        });
        return btn;
    }

    _error(msg) {
        if (this.toast?.error) this.toast.error(msg);
        else this.events?.emit?.('toast:error', msg);
    }

    _success(msg) {
        if (this.toast?.success) this.toast.success(msg);
        else this.events?.emit?.('toast:success', msg);
    }

    destroy() {
        if (this._refreshTimer) clearInterval(this._refreshTimer);
        if (this.sheet && this.sheet.parentNode) this.sheet.parentNode.removeChild(this.sheet);
        this.sheet = null;
    }
}

export default GameUI;
