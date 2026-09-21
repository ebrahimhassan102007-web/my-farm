/**
 * Notifications.js — Toast Notification System
 * سجل التغيير (Work Order):
 *   MF-11 — إشعارات «بينما كنت غائبًا» تُبنى الآن على زمن حقيقي متجمّد أثناء الإخفاء.
 */

import { Events } from '../core/EventBus.js';

const MAX_NOTIFICATIONS = 5;
const NOTIFICATION_DURATION = 4000;

class NotificationManager {

    constructor() {
        this._container = null;
        this._init();
    }

    _init() {

        // Wait for DOM
        const findContainer = () => {
            this._container =
                document.getElementById(
                    'notifications-area'
                );
        };

        if (document.readyState === 'loading') {
            document.addEventListener(
                'DOMContentLoaded',
                findContainer
            );
        } else {
            findContainer();
        }

        this._bindEvents();
    }

    _bindEvents() {

        // Crop harvested
        Events.on(
            'crop:harvested',
            (tileId, cropId, amount) => {

                this.show(
                    `🌾 حصاد ${amount}x ${cropId}!`,
                    'success'
                );
            }
        );

        // Crop ready
        Events.on(
            'crop:ready',
            (tileId, cropId) => {

                this.show(
                    `🌱 ${cropId} جاهز للحصاد!`,
                    'info'
                );
            }
        );

        // Animal ready
        Events.on(
            'animal:ready',
            (animalId, product) => {

                this.show(
                    `🐄 الحيوان أنتج ${product}!`,
                    'info'
                );
            }
        );

        // Production completed
        Events.on(
            'production:completed',
            (buildingId, recipeId, output) => {

                const item =
                    output?.item || 'منتج';

                const amount =
                    output?.amount || 1;

                this.show(
                    `🏭 إنتاج ${amount}x ${item} جاهز!`,
                    'success'
                );
            }
        );

        // Order completed
        Events.on(
            'order:completed',
            (orderId, coins, xp) => {

                this.show(
                    `📦 طلب مكتمل! +${coins}🪙 +${xp}⭐`,
                    'success'
                );
            }
        );

        // Order expired
        Events.on(
            'order:expired',
            () => {

                this.show(
                    '⏰ انتهى وقت أحد الطلبات',
                    'warning'
                );
            }
        );

        // Level up
        Events.on(
            'player:levelup',
            (level, unlocks) => {

                this.show(
                    `🎉 وصلت للمستوى ${level}!`,
                    'success',
                    6000
                );
            }
        );

        // Coins added
        Events.on(
            'economy:coinsAdded',
            (amount, source) => {

                if (
                    source === 'sell' ||
                    source === 'order'
                ) {

                    this.show(
                        `+${amount}🪙`,
                        'success'
                    );
                }
            }
        );

        // Gems added
        Events.on(
            'economy:gemsAdded',
            (amount, source) => {

                this.show(
                    `+${amount}💎`,
                    'success'
                );
            }
        );

        // Save
        Events.on(
            'save:success',
            () => {

                this.show(
                    '💾 تم حفظ اللعبة',
                    'info',
                    2000
                );
            }
        );

        // Save error
        Events.on(
            'save:error',
            () => {

                this.show(
                    '❌ فشل حفظ اللعبة',
                    'error',
                    5000
                );
            }
        );

        // Inventory full
        Events.on(
            'inventory:full',
            () => {

                this.show(
                    '📦 المخزن ممتلئ!',
                    'warning'
                );
            }
        );

        // MF-03: مُستمع energy:refilled حُذف مع نظام الطاقة بالكامل.

        // Building purchased
        Events.on(
            'building:purchased',
            () => {

                this.show(
                    '🏗️ تم شراء المبنى!',
                    'success'
                );
            }
        );

        // Building upgraded
        Events.on(
            'building:upgraded',
            (buildingId, level) => {

                this.show(
                    `🏗️ تم تطوير المبنى للمستوى ${level}`,
                    'success'
                );
            }
        );

        // Farm expanded
        Events.on(
            'farm:expanded',
            () => {

                this.show(
                    '🌳 تم توسيع المزرعة!',
                    'success'
                );
            }
        );

        // Market sold
        Events.on(
            'market:sold',
            (listingId, earnings) => {

                this.show(
                    `🛒 تم بيع المنتج! +${earnings}🪙`,
                    'success'
                );
            }
        );

        // Market expired
        Events.on(
            'market:expired',
            () => {

                this.show(
                    '⏰ انتهى عرض السوق وتم إرجاع المنتج',
                    'warning'
                );
            }
        );

        // Gift sent
        Events.on(
            'social:giftSent',
            () => {

                this.show(
                    '🎁 تم إرسال الهدية!',
                    'success'
                );
            }
        );

        // Event started
        Events.on(
            'event:started',
            (event) => {

                this.show(
                    `${event.icon} بدأ حدث: ${event.name}`,
                    'success',
                    5000
                );
            }
        );

        // Event mission completed
        Events.on(
            'event:missionCompleted',
            () => {

                this.show(
                    '🏆 تم إنجاز مهمة الحدث!',
                    'success',
                    5000
                );
            }
        );

        // Event ended
        Events.on(
            'event:ended',
            () => {

                this.show(
                    '🏁 انتهى الحدث!',
                    'info',
                    5000
                );
            }
        );

        // Daily reset
        Events.on(
            'game:dailyReset',
            () => {

                this.show(
                    '🌅 يوم جديد! تم تجديد المهام والهدايا',
                    'success',
                    5000
                );
            }
        );
    }

    /**
     * Get notification container.
     */
    _getContainer() {

        if (
            !this._container ||
            !document.body.contains(
                this._container
            )
        ) {

            this._container =
                document.getElementById(
                    'notifications-area'
                );
        }

        return this._container;
    }

    /**
     * Show notification.
     */
    show(
        message,
        type = 'info',
        duration = NOTIFICATION_DURATION
    ) {

        const container =
            this._getContainer();

        if (!container) {
            console.warn(
                '[Notifications]',
                message
            );
            return;
        }

        // Remove old notifications
        while (
            container.children.length >=
            MAX_NOTIFICATIONS
        ) {

            container.removeChild(
                container.firstChild
            );
        }

        const notification =
            document.createElement('div');

        notification.className =
            `notification ${type}`;

        notification.setAttribute(
            'role',
            'status'
        );

        notification.textContent =
            message;

        container.appendChild(
            notification
        );

        // Small entrance delay
        requestAnimationFrame(() => {

            notification.classList.add(
                'visible'
            );
        });

        // Auto remove
        setTimeout(() => {

            if (
                !notification ||
                !notification.parentNode
            ) {
                return;
            }

            notification.style.opacity =
                '0';

            notification.style.transform =
                'translateX(100%)';

            setTimeout(() => {

                if (
                    notification.parentNode
                ) {

                    notification.remove();
                }

            }, 300);

        }, duration);
    }

    success(message, duration) {

        this.show(
            message,
            'success',
            duration
        );
    }

    error(message, duration) {

        this.show(
            message,
            'error',
            duration
        );
    }

    warning(message, duration) {

        this.show(
            message,
            'warning',
            duration
        );
    }

    info(message, duration) {

        this.show(
            message,
            'info',
            duration
        );
    }

    clear() {

        const container =
            this._getContainer();

        if (!container) return;

        container.innerHTML = '';
    }
}

export const Notifications =
    new NotificationManager();