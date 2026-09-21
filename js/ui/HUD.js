/**
 * ============================================================
 * MY FARM 3D - DEDICATED MOBILE HUD CONTROLLER
 * ============================================================
 * الطبقة المرئية فقط: تقرأ GameState وتكتب الأفعال عبر الأنظمة
 * (InventorySystem للبذور/البيع). لا THREE ولا منطق مزرعة هنا.
 *
 * تخطيط مطابق للموك:
 *   أعلى اليسار  : نجمة المستوى + شريط الخبرة + «المستوى»
 *   أعلى الوسط   : الكوينز (+) والجواهر (+)
 *   أعلى اليمين  : شمس/قمر + ساعة + موسم + رقم اليوم
 *   اليسار       : لوحة المهام الخشبية (ازرع / اسقِ / اجمع حليب)
 *   اليمين       : قائمة / حقيبة / متجر / خريطة (أزرار خشبية مربعة)
 *   الأسفل       : شريط الأدوات الخشبي + عدّادات البذور
 *   أسفل اليسار  : عصا التحكم (فيزيائيًا — لا يعكسها dir=rtl)
 *   أسفل اليمين  : تفاعل + قفز
 *
 * الأزرار الجانبية تُصدر `hud:panel` على ناقل الأحداث؛ اللوحات نفسها
 * في js/ui/UI.js (متجر/مخزن/طلبات/سوق/خريطة/قائمة).
 *
 * سجل التغيير (Work Order):
 *   MF-04 — أيقونات شريط الأدوات والعملات/المخازن أصبحت SVG من
 *           ui/icons.js (خط OS لم يعد يقرر شكلها)، والإيموجي fallback.
 *   MF-13 — نبضة squash & stretch على صومعة/حظيرة الـ HUD عند وصول محصول.
 * ============================================================
 */
import { InventorySystem } from '../systems/InventorySystem.js';
import { StorageSystem } from '../systems/StorageSystem.js';
import { iconHTML } from './icons.js';
import { xpForLevel } from '../systems/XPSystem.js';

const SEASONS_AR = {
  spring: 'الربيع',
  summer: 'الصيف',
  autumn: 'الخريف',
  winter: 'الشتاء'
};

const SEASONS_EN = {
  spring: 'Spring',
  summer: 'Summer',
  autumn: 'Autumn',
  winter: 'Winter'
};

const SEASON_ICONS = {
  spring: '🌸',
  summer: '☀️',
  autumn: '🍂',
  winter: '❄️'
};

/** ترتيب شريط الأدوات كما في الموك: أدوات ← بذور ← حقيبة. */
const HOTBAR_LAYOUT = [
  { id: 'axe',           name: 'فأس',          icon: '🪓', type: 'tool' },
  { id: 'watering_can',  name: 'إبريق الري',   icon: '💧', type: 'tool' },
  { id: 'hoe',           name: 'مِحراث',       icon: '⛏️', type: 'tool' },
  { id: 'pickaxe',       name: 'معول',         icon: '⚒️', type: 'tool' },
  { id: 'wheat_seed',    name: 'بذور القمح',      icon: '🌾', type: 'seed', cropType: 'wheat',     count: 0 },
  { id: 'corn_seed',     name: 'بذور الذرة',      icon: '🌽', type: 'seed', cropType: 'corn',      count: 0 },
  { id: 'carrot_seed',   name: 'بذور الجزر',      icon: '🥕', type: 'seed', cropType: 'carrot',    count: 0 },
  { id: 'soybean_seed',  name: 'بذور فول الصويا', icon: '🫛', type: 'seed', cropType: 'soybean',   count: 0 },
  { id: 'sugarcane_seed', name: 'بذور قصب السكر', icon: '🎋', type: 'seed', cropType: 'sugarcane', count: 0 },
  { id: 'bag',           name: 'المخزن',          icon: '🎒', type: 'panel', panel: 'bag' }
];

export class HUD {
  constructor({ gameState, eventBus, callbacks = {}, enableJoystick = true } = {}) {
    this.gameState = gameState;
    this.eventBus = eventBus;
    this.callbacks = callbacks;
    this.enableJoystick = enableJoystick;
    this.container = null;
    this.selectedHotbarIndex = 0;

    this.currentHotbar = HOTBAR_LAYOUT.map(item => ({ ...item }));

    this.joystickActive = false;
    this.joystickTouchId = null;
    this.joystickCenter = { x: 0, y: 0 };
    this.maxJoystickRadius = 38;
    this.missionsOpen = false;
  }

  getState(path, fallback = null) {
    if (this.gameState && typeof this.gameState.get === 'function') {
      const val = this.gameState.get(path);
      return val !== undefined && val !== null ? val : fallback;
    }
    return fallback;
  }

  mount(target = document.body) {
    const parent = typeof target === 'string' ? document.querySelector(target) : target;
    if (!parent) return;
    this.unmount();
    this.container = this.buildDom();
    parent.appendChild(this.container);
    this.bindEvents();
    this.refreshAll();
  }

  unmount() {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
      this.container = null;
    }
  }

  buildDom() {
    const root = document.createElement('div');
    root.id = 'game-hud-overlay';
    root.innerHTML = `
      <!-- ======================= TOP BAR ======================= -->
      <header class="hud-top-bar">
        <!-- المستوى + الخبرة (يسار) -->
        <div class="hud-level-card">
          <div class="hud-level-badge">
            <span class="hud-level-star" aria-hidden="true">★</span>
            <span id="mf-level-num">1</span>
          </div>
          <div class="hud-xp-box">
            <span class="hud-xp-label">المستوى</span>
            <div class="hud-xp-track">
              <div class="hud-xp-fill" id="mf-xp-fill"></div>
            </div>
            <span class="hud-xp-text" id="mf-xp-text">0 / 100</span>
          </div>
        </div>

        <!-- الوسط: العملات + امتلاء الصومعة/الحظيرة -->
        <div class="hud-center-col">
          <div class="hud-currencies">
            <div class="hud-currency-item coins">
              <span class="icon" aria-hidden="true">${iconHTML('coin', 18)}</span>
              <span id="mf-coins">0</span>
              <button type="button" class="hud-plus" id="hud-btn-add-coins" aria-label="شراء عملات">+</button>
            </div>
            <div class="hud-currency-item gems">
              <span class="icon" aria-hidden="true">${iconHTML('gem', 18)}</span>
              <span id="mf-gems">0</span>
              <button type="button" class="hud-plus" id="hud-btn-add-gems" aria-label="شراء جواهر">+</button>
            </div>
          </div>

          <!-- 🌾 الصومعة (محاصيل خام) · 🧺 الحظيرة (منتجات/عدة) -->
          <div class="hud-storage-row" id="hud-storage-row" aria-label="امتلاء المخازن">
            <button type="button" class="hud-storage-pill silo" id="hud-btn-silo" aria-label="الصومعة">
              <span class="st-icon" aria-hidden="true">${iconHTML('wheat', 18)}</span>
              <span class="st-body">
                <span class="st-track"><span class="st-fill" id="mf-silo-fill"></span></span>
                <span class="st-text" id="mf-silo-text">0 / 150</span>
              </span>
            </button>
            <button type="button" class="hud-storage-pill barn" id="hud-btn-barn" aria-label="الحظيرة">
              <span class="st-icon" aria-hidden="true">${iconHTML('barn', 18)}</span>
              <span class="st-body">
                <span class="st-track"><span class="st-fill" id="mf-barn-fill"></span></span>
                <span class="st-text" id="mf-barn-text">0 / 150</span>
              </span>
            </button>
          </div>
        </div>

        <!-- الوقت (يمين) -->
        <div class="hud-time-pill">
          <span class="clock">
            <span class="phase" id="mf-phase" aria-hidden="true">☀️</span>
            <span id="mf-clock">08:00 ص</span>
          </span>
          <span class="season">
            <span id="mf-season-icon" aria-hidden="true">🌸</span>
            <span id="mf-season">الربيع</span>
            <span class="season-en" id="mf-season-en">Spring</span>
          </span>
          <span class="date" id="mf-date">الجمعة 18 سبتمبر 2026</span>
        </div>
      </header>

      <!-- ===================== MISSIONS (يسار) ===================== -->
      <button type="button" class="hud-missions-toggle" id="hud-missions-toggle" aria-label="المهام" aria-expanded="false">📋</button>
      <div class="hud-missions-panel is-collapsed" id="hud-missions-panel" aria-label="لوحة المهام">
        <div class="missions-header">📋 المهام</div>
        <div class="missions-list" id="hud-missions-list"></div>
      </div>

      <!-- ================== UTILITY STACK (يمين) ================== -->
      <aside class="hud-utility-stack" aria-label="أدوات المزرعة">
        <button type="button" class="hud-icon-btn" id="hud-btn-menu" aria-label="القائمة">☰</button>
        <button type="button" class="hud-icon-btn" id="hud-btn-bag" aria-label="الحقيبة">🎒</button>
        <button type="button" class="hud-icon-btn" id="hud-btn-shop" aria-label="المتجر">🏪</button>
        <button type="button" class="hud-icon-btn" id="hud-btn-map" aria-label="الخريطة">🗺️</button>
      </aside>

      <!-- ============ JOYSTICK (أسفل اليسار — فيزيائي) ============ -->
      ${this.enableJoystick ? `
      <div class="hud-joystick-zone" id="hud-joystick-zone">
        <div class="joystick-base" id="hud-joystick-base">
          <div class="joystick-thumb" id="hud-joystick-thumb"></div>
        </div>
      </div>
      ` : ''}

      <!-- ========== ACTIONS (أسفل اليمين — فيزيائي) ========== -->
      <div class="hud-action-stack">
        <button type="button" class="jump-button" id="hud-btn-jump" aria-label="قفز">⤴️</button>
        <button type="button" class="harvest-button" id="hud-btn-interact" aria-label="تفاعل">🤚</button>
      </div>

      <!-- ================== BOTTOM HOTBAR ================== -->
      <nav class="hud-bottom-hotbar" id="hud-hotbar" aria-label="شريط الأدوات"></nav>
    `;
    return root;
  }

  bindEvents() {
    if (this.eventBus && typeof this.eventBus.on === 'function') {
      this.eventBus.on('state:changed', (path, value) => this.onStateChanged(path, value));
      this.eventBus.on('quest:progress-updated', () => this.renderMissions());
      this.eventBus.on('quest:completed', () => this.renderMissions());
      this.eventBus.on('quest:claimed', () => this.renderMissions());
      this.eventBus.on('crop:harvested', () => this.syncSeedCounts());
      // MF-13: حبة تسقط في الصومعة ⇒ نبضة squash & stretch على أيقونتها
      this.eventBus.on('crop:harvested', () => this.squashPill('silo'));
      this.eventBus.on('animal:collected', () => this.squashPill('barn'));
      this.eventBus.on('time:hour', () => this.pullClock());
      this.eventBus.on('time:day', () => this.pullClock());
      this.eventBus.on('game:tick', () => this.pullClock());
      this.eventBus.on('inventory:changed', () => this.syncSeedCounts());
      this.eventBus.on('storage:changed', () => this.syncStorage());
      this.eventBus.on('storage:upgraded', () => this.syncStorage());
      this.eventBus.on('storage:full', () => this.syncStorage());
      this.eventBus.on('time:season', () => this.pullClock());
      // أي تغيير في المخزن يحدّث عدّادات البذور
      this.eventBus.on('state:changed', (path) => {
        if (path === 'inventory.items' || path === 'inventory') this.syncSeedCounts();
      });
    }

    if (this.enableJoystick) this.setupJoystick();

    this.renderHotbar();
    this.renderMissions();

    const on = (selector, handler) => {
      this.container?.querySelector(selector)?.addEventListener('click', (e) => {
        e.stopPropagation();
        handler(e);
      });
    };

    on('#hud-btn-menu', () => this.openPanel('menu'));
    on('#hud-btn-bag', () => this.openPanel('bag'));
    on('#hud-btn-shop', () => this.openPanel('shop'));
    on('#hud-btn-map', () => this.openPanel('map'));
    on('#hud-btn-add-coins', () => this.openPanel('shop', 'coins'));
    on('#hud-btn-add-gems', () => this.openPanel('shop', 'gems'));
    // 🌾🧺 النقر على شريط الامتلاء يفتح لوحة ترقية المخزن
    on('#hud-btn-silo', () => this.openPanel('storage', 'silo'));
    on('#hud-btn-barn', () => this.openPanel('storage', 'barn'));

    on('#hud-btn-interact', () => {
      if (typeof this.callbacks.onInteract === 'function') this.callbacks.onInteract();
    });
    on('#hud-btn-jump', () => {
      if (typeof this.callbacks.onJump === 'function') this.callbacks.onJump();
    });

    const missionsToggle = this.container?.querySelector('#hud-missions-toggle');
    const missionsPanel = this.container?.querySelector('#hud-missions-panel');
    missionsToggle?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setMissionsOpen(!this.missionsOpen);
    });
    missionsPanel?.addEventListener('click', (e) => e.stopPropagation());
  }

  setMissionsOpen(open) {
    this.missionsOpen = !!open;
    const toggle = this.container?.querySelector('#hud-missions-toggle');
    const panel = this.container?.querySelector('#hud-missions-panel');
    panel?.classList.toggle('is-collapsed', !this.missionsOpen);
    toggle?.classList.toggle('is-open', this.missionsOpen);
    toggle?.setAttribute('aria-expanded', this.missionsOpen ? 'true' : 'false');
  }

  /** يفتح إحدى لوحات UI.js (متجر/مخزن/طلبات/سوق/خريطة/قائمة). */
  openPanel(name, arg) {
    if (typeof this.callbacks.onOpenPanel === 'function') {
      this.callbacks.onOpenPanel(name, arg);
      return;
    }
    this._emit('hud:panel', { name, arg });
  }

  onStateChanged(path, value) {
    switch (path) {
      case 'player.coins':
        this.updateCoins(value);
        break;
      case 'player.gems':
        this.updateGems(value);
        break;
      case 'player.level':
        this.updateLevel(value);
        break;
      case 'player.xp':
        this.updateXP(value, this.xpToNext());
        break;
      case 'player.xpToNext':
        this.updateXP(this.getState('player.xp', 0), value);
        break;
      case 'inventory.items':
      case 'inventory.maxCapacity':
      case 'storage.silo':
      case 'storage.barn':
        // أي تغيير في المخزون ينعكس فورًا على أشرطة الصومعة/الحظيرة
        this.syncStorage();
        break;
      default:
        break;
    }
  }

  /**
   * MF-13 — squash & stretch على أقراص المخازن عند وصول محصول.
   * كلاس CSS يُعاد تشغيله (لا توقيتات، لا تخصيص — R4).
   */
  squashPill(store = 'silo') {
    const el = this.container?.querySelector?.(store === 'barn' ? '#hud-btn-barn' : '#hud-btn-silo');
    if (!el || !el.classList) return;
    el.classList.remove('squash-pop');
    void el.offsetWidth; // reflow لإعادة تشغيل الأنيميشن
    el.classList.add('squash-pop');
  }

  refreshAll() {
    this.updateCoins(this.getState('player.coins', 0));
    this.updateGems(this.getState('player.gems', 0));
    this.updateLevel(this.getState('player.level', 1));
    this.updateXP(this.getState('player.xp', 0), this.xpToNext());
    this.renderMissions();
    this.syncSeedCounts();
    this.syncStorage();
    this.pullClock();
  }

  updateCoins(val) {
    const el = this.container?.querySelector('#mf-coins');
    if (el) el.textContent = Number(val ?? 0).toLocaleString('en-US');
  }

  updateGems(val) {
    const el = this.container?.querySelector('#mf-gems');
    if (el) el.textContent = Number(val ?? 0).toLocaleString('en-US');
  }

  /** MF-05: حدّ XP التالي يُقرأ من منحنى XPSystem — لا «100» سحرية (R1). */
  xpToNext() {
    const level = Number(this.getState('player.level', 1)) || 1;
    return this.getState('player.xpToNext') ?? xpForLevel(level);
  }

  updateLevel(val) {
    const el = this.container?.querySelector('#mf-level-num');
    if (el) el.textContent = val ?? 1;
  }

  updateXP(curr, max) {
    const fill = this.container?.querySelector('#mf-xp-fill');
    const txt = this.container?.querySelector('#mf-xp-text');
    const c = Number(curr ?? 0);
    const m = Number(max ?? 100);
    if (txt) txt.textContent = `${c} / ${m}`;
    if (fill && m > 0) {
      fill.style.width = `${Math.min(100, Math.max(0, (c / m) * 100))}%`;
    }
  }

  /* ==========================================================
     شريط الأدوات — الأدوات ثابتة والبذور تتبع المخزن
     ========================================================== */
  renderHotbar() {
    const bar = this.container?.querySelector('#hud-hotbar');
    if (!bar) return;
    bar.innerHTML = '';

    this.currentHotbar.forEach((item, idx) => {
      const slot = document.createElement('button');
      slot.type = 'button';
      slot.className = `hotbar-slot ${idx === this.selectedHotbarIndex ? 'selected' : ''}`;
      if (item.type === 'panel') slot.classList.add('is-panel');
      slot.setAttribute('aria-label', item.name);
      slot.dataset.hotbarId = item.id;

      const icon = document.createElement('span');
      icon.className = 'slot-icon';
      icon.setAttribute('aria-hidden', 'true');
      // MF-04: SVG موحّد من ui/icons.js — الإيموجي fallback فقط
      icon.innerHTML = iconHTML(item.icon, 26);
      slot.appendChild(icon);

      if (item.count !== undefined && item.count !== null) {
        const badge = document.createElement('span');
        badge.className = 'slot-badge';
        badge.textContent = String(item.count);
        slot.appendChild(badge);
      }

      slot.addEventListener('click', (e) => {
        e.stopPropagation();
        if (item.type === 'panel') {
          this.openPanel(item.panel || 'bag');
          return;
        }
        this.selectSlot(idx);
      });
      bar.appendChild(slot);
    });
  }

  selectSlot(index) {
    const item = this.currentHotbar[index];
    if (!item || item.type === 'panel') return;
    this.selectedHotbarIndex = index;
    const slots = this.container?.querySelectorAll('.hotbar-slot') || [];
    slots.forEach((s, idx) => s.classList.toggle('selected', idx === index));
    if (this.eventBus) this.eventBus.emit('hotbar:selected', item);
  }

  getSelectedItem() {
    const item = this.currentHotbar[this.selectedHotbarIndex];
    return item && item.type !== 'panel' ? item : this.currentHotbar[0];
  }

  /** عدد العناصر في المخزن (يظهر على خانة الحقيبة في الشريط). */
  bagTotal() {
    const inv = this.getState('inventory', {}) || {};
    return Object.values(inv.items || {}).reduce((sum, it) => sum + (it?.count || 0), 0);
  }

  /* ==========================================================
     المهام — خشبية يسار الشاشة مع شريط تقدّم
     ========================================================== */
  renderMissions() {
    const listEl = this.container?.querySelector('#hud-missions-list');
    if (!listEl) return;

    const quests = window.QuestSystem ? window.QuestSystem.getActiveQuests() : [];
    if (!quests.length) {
      listEl.innerHTML = '<div class="missions-empty">لا مهام حالياً — ازرع واسقِ واحصد 🌾</div>';
      return;
    }

    listEl.innerHTML = quests.map(q => {
      const pct = Math.min(100, Math.round(((q.progress || 0) / (q.target || 1)) * 100));
      const canClaim = q.completed && !q.claimed;

      return `
        <div class="mission-card ${q.completed ? 'completed' : ''}">
          <div class="mission-top">
            <span class="mission-title">${q.title}</span>
            <span class="mission-count">${q.progress || 0}/${q.target}</span>
          </div>
          <div class="mission-progress-bar">
            <div class="mission-progress-fill" style="width: ${pct}%"></div>
          </div>
          ${canClaim ? `<button type="button" class="mission-claim-btn" data-quest-id="${q.id}">استلام المكافأة</button>` : ''}
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('.mission-claim-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const qId = btn.dataset.questId;
        if (window.QuestSystem) {
          window.QuestSystem.claimReward(qId);
          this.renderMissions();
        }
      });
    });
  }

  /* ==========================================================
     🕐 الساعة — تُكتب من TimeManager عبر main.js
     ========================================================== */
  /**
   * واجهة قديمة (توافق مع أي مستدعٍ سابق) — تُمرَّر الآن إلى applyClock.
   */
  updateClock(label, icon = '☀️', day = 1, season = 'spring') {
    const clockEl = this.container?.querySelector('#mf-clock');
    const phaseEl = this.container?.querySelector('#mf-phase');
    const seasonEl = this.container?.querySelector('#mf-season');

    if (clockEl && label) clockEl.textContent = label;
    if (phaseEl) phaseEl.textContent = icon || '☀️';
    if (seasonEl) seasonEl.textContent = SEASONS_AR[season] || season;
  }

  /**
   * 🕐 الساعة الحقيقية للـ HUD (Brief §0.3):
   * وقت الجهاز + التاريخ التقويمي + الفصل الفلكي ثنائي اللغة.
   * @param {object} clock لقطة Calendar.readRealClock()
   */
  applyClock(clock) {
    if (!clock || !this.container) return;

    const q = (sel) => this.container.querySelector(sel);
    const clockEl = q('#mf-clock');
    const phaseEl = q('#mf-phase');
    const seasonEl = q('#mf-season');
    const seasonEnEl = q('#mf-season-en');
    const seasonIconEl = q('#mf-season-icon');
    const dateEl = q('#mf-date');

    if (clockEl && clock.clockLabel) clockEl.textContent = clock.clockLabel;
    if (phaseEl) phaseEl.textContent = clock.phaseIcon || '☀️';

    const season = clock.season || this.getState('time.season', 'summer');
    if (seasonEl) seasonEl.textContent = clock.seasonAr || SEASONS_AR[season] || season;
    if (seasonEnEl) seasonEnEl.textContent = clock.seasonEn || SEASONS_EN[season] || '';
    if (seasonIconEl) seasonIconEl.textContent = clock.seasonIcon || SEASON_ICONS[season] || '🌿';
    if (dateEl) dateEl.textContent = clock.dateLabel || this.getState('time.dateLabel', '') || '';
  }

  /**
   * قراءة الساعة من الحالة (TimeManager يكتبها كل دقيقة حقيقية).
   * لا حسابات افتراضية: إن غابت الحقول نبني ملصقًا من ساعات/دقائق حقيقية.
   */
  pullClock() {
    const hours = Number(this.getState('time.hours', -1));
    const minutes = Number(this.getState('time.minutes', -1));
    const season = this.getState('time.season', 'summer');

    // ملصق 12-ساعي بصيغة عربية مطابقة لـ Calendar.formatClockLabel
    let label = this.getState('time.clockLabel', '');
    if (!label && Number.isFinite(hours) && hours >= 0) {
      const suffix = hours < 12 ? 'ص' : 'م';
      const h12 = ((hours + 11) % 12) + 1;
      label = `${String(h12).padStart(2, '0')}:${String(Math.max(0, minutes) || 0).padStart(2, '0')} ${suffix}`;
    }

    this.applyClock({
      clockLabel: label,
      phaseIcon: this.getState('time.phaseIcon', this._phaseIconFromHours(hours)),
      season,
      seasonAr: this.getState('time.seasonAr', SEASONS_AR[season]),
      seasonEn: this.getState('time.seasonEn', SEASONS_EN[season]),
      seasonIcon: SEASON_ICONS[season],
      dateLabel: this.getState('time.dateLabel', '')
    });
  }

  _phaseIconFromHours(hours) {
    if (!Number.isFinite(hours) || hours < 0) return '☀️';
    if (hours >= 5 && hours < 8) return '🌅';
    if (hours >= 8 && hours < 17) return '☀️';
    if (hours >= 17 && hours < 20) return '🌇';
    return '🌙';
  }

  /* ==========================================================
     🌾🧺 امتلاء الصومعة/الحظيرة — يظهر الامتلاء قبل أن يمنع اللعب
     ========================================================== */
  syncStorage() {
    if (!this.container) return;
    let snap;
    try {
      snap = StorageSystem.snapshot();
    } catch (e) {
      return;
    }

    for (const store of ['silo', 'barn']) {
      const data = snap[store];
      if (!data) continue;
      const fill = this.container.querySelector(`#mf-${store}-fill`);
      const text = this.container.querySelector(`#mf-${store}-text`);
      const pill = this.container.querySelector(`#hud-btn-${store}`);
      const pct = Math.max(0, Math.min(100, Math.round((data.fill || 0) * 100)));

      if (fill) fill.style.width = `${pct}%`;
      if (text) text.textContent = `${data.used} / ${data.capacity}`;
      if (pill) {
        pill.classList.toggle('is-full', !!data.full);
        pill.classList.toggle('is-tight', !data.full && pct >= 80);
        pill.title = `${data.labelAr} · مستوى ${data.level} · ${data.used}/${data.capacity}`;
      }
    }
  }

  /* ==========================================================
     🌱 بذور الـ Hotbar تتبع المخزن الحقيقي دائمًا
     ========================================================== */
  syncSeedCounts() {
    let changed = false;
    for (const item of this.currentHotbar) {
      if (item.type !== 'seed') continue;
      const count = InventorySystem.count(item.id);
      if (item.count !== count) {
        item.count = count;
        changed = true;
      }
    }

    const bagItem = this.currentHotbar.find(h => h.id === 'bag');
    if (bagItem) {
      const total = this.bagTotal();
      if (bagItem.count !== total) {
        bagItem.count = total;
        changed = true;
      }
    }

    if (changed) this.renderHotbar();
  }

  refreshHotbarCounts() {
    this.syncSeedCounts();
  }

  /**main.js يستدعيها بعد الزراعة — العداد البصري فقط (المخزن هو المرجع). */
  consumeHotbarSeed(cropType) {
    const item = this.currentHotbar.find(h => h.cropType === cropType);
    if (item) {
      item.count = InventorySystem.count(item.id);
      this.renderHotbar();
    }
  }

  _emit(name, payload) {
    if (this.eventBus && typeof this.eventBus.emit === 'function') {
      this.eventBus.emit(name, payload);
    }
  }

  /* ==========================================================
     🕹️ عصا التحكم — pointer events (تعمل باللمس والفأرة)
     ========================================================== */
  setupJoystick() {
    const zone = this.container?.querySelector('#hud-joystick-zone');
    const thumb = this.container?.querySelector('#hud-joystick-thumb');
    const base = this.container?.querySelector('#hud-joystick-base');
    if (!zone || !thumb || !base) return;

    const onStart = (clientX, clientY, identifier) => {
      this.joystickActive = true;
      this.joystickTouchId = identifier;
      const rect = base.getBoundingClientRect();
      this.joystickCenter = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      };
      onMove(clientX, clientY);
    };

    const onMove = (clientX, clientY) => {
      if (!this.joystickActive) return;
      const dx = clientX - this.joystickCenter.x;
      const dy = clientY - this.joystickCenter.y;
      const distance = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      const clampedDist = Math.min(distance, this.maxJoystickRadius);
      const thumbX = Math.cos(angle) * clampedDist;
      const thumbY = Math.sin(angle) * clampedDist;

      thumb.style.transform = `translate(calc(-50% + ${thumbX}px), calc(-50% + ${thumbY}px))`;
      if (typeof this.callbacks.onMove === 'function') {
        this.callbacks.onMove({
          x: thumbX / this.maxJoystickRadius,
          y: -(thumbY / this.maxJoystickRadius)
        });
      }
    };

    const onEnd = () => {
      if (!this.joystickActive) return;
      this.joystickActive = false;
      this.joystickTouchId = null;
      thumb.style.transform = 'translate(-50%, -50%)';
      if (typeof this.callbacks.onMove === 'function') {
        this.callbacks.onMove({ x: 0, y: 0 });
      }
    };

    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      zone.setPointerCapture?.(e.pointerId);
      onStart(e.clientX, e.clientY, e.pointerId);
    });
    zone.addEventListener('pointermove', (e) => {
      if (!this.joystickActive) return;
      onMove(e.clientX, e.clientY);
    });
    const stop = () => onEnd();
    zone.addEventListener('pointerup', stop);
    zone.addEventListener('pointercancel', stop);
  }
}

export default HUD;
