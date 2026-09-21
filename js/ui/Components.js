/**
 * Components.js — Reusable UI Components & Renderers
 *
 * سجل التغيير (Work Order):
 *   MF-04 — كل مواضع icon في البطاقات تُعرض عبر ui/icons.js
 *           (SVG موحّد) مع بقاء الإيموجي fallback للعناصر غير المرسومة.
 */

import { GameState } from '../core/GameState.js';
import { iconHTML } from './icons.js';

import {
    CROPS,
    ANIMALS,
    BUILDINGS,
    RECIPES,
    ITEMS,
    DECORATIONS,
    TOOLS,
    getCrop,
    getAnimal,
    getBuilding,
    getRecipe,
    getItem
} from '../data/GameData.js';

import {
    t,
    formatNumber,
    formatTime
} from '../utils/Utils.js';


/**
 * التكلفة في GameData هي `{ coins, gems }` (وليس رقمًا).
 * قراءتها بـ Number() كانت تُرجع NaN فتتعطّل كل بطاقات المتجر.
 */
export function costOf(item) {
    const raw = item?.cost ?? item?.price ?? 0;

    if (raw && typeof raw === 'object') {
        return {
            coins: Number(raw.coins) || 0,
            gems: Number(raw.gems) || 0
        };
    }

    return {
        coins: Number(raw) || 0,
        gems: Number(item?.gems) || 0
    };
}

/** اسم عربي جاهز للعرض: name من GameData ثم i18n ثم المعرّف. */
export function labelOf(def, fallbackId, lang = 'ar') {
    if (!def) return t(fallbackId, lang);
    return def.name || t(def.nameKey || fallbackId, lang);
}

export const Components = {

    /**
     * Render shop item card
     */
    shopItem(item, lang = 'ar') {

        const level =
            GameState.get('player.level') || 1;

        const isLocked =
            (item.unlockLevel || 1) > level;

        const price = costOf(item);
        const cost = price.coins;
        const gems = price.gems;

        const coins =
            Number(
                GameState.get('player.coins') || 0
            );

        const playerGems =
            Number(
                GameState.get('player.gems') || 0
            );

        const canAfford =
            coins >= cost &&
            playerGems >= gems;

        const disabled =
            isLocked || !canAfford;

        return `
            <div
                class="shop-item ${isLocked ? 'locked' : ''}"
                data-id="${item.id}"
                data-type="${item.type || 'item'}"
            >

                <div class="shop-icon">
                    ${iconHTML(item.icon, 30)}
                </div>

                <div class="shop-name">
                    ${item.name || t(item.nameKey || item.id, lang)}
                </div>

                <div class="shop-desc">
                    ${item.description || ''}
                </div>

                <div class="shop-cost">

                    ${
                        cost > 0
                        ? `
                            <span class="coin-cost">
                                🪙 ${formatNumber(cost)}
                            </span>
                        `
                        : ''
                    }

                    ${
                        gems > 0
                        ? `
                            <span class="gem-cost">
                                💎 ${formatNumber(gems)}
                            </span>
                        `
                        : ''
                    }

                </div>

                ${
                    isLocked
                    ? `
                        <div class="shop-level">
                            🔒
                            ${t('levelRequired', lang)}
                            ${item.unlockLevel}
                        </div>
                    `
                    : ''
                }

                ${
                    !isLocked && !canAfford
                    ? `
                        <div class="shop-unavailable">
                            ${t('notEnoughResources', lang)}
                        </div>
                    `
                    : ''
                }

                <button
                    class="shop-btn"
                    ${disabled ? 'disabled' : ''}
                >
                    ${
                        isLocked
                        ? t('locked', lang)
                        : t('buy', lang)
                    }
                </button>

            </div>
        `;
    },


    /**
     * Render inventory item
     */
    invItem(item, lang = 'ar') {

        return `
            <div
                class="inv-item"
                data-id="${item.id}"
                data-category="${item.category || 'all'}"
            >

                <div class="item-icon">
                    ${iconHTML(item.icon, 30)}
                </div>

                <div class="item-name">
                    ${item.name || t(item.nameKey || item.id, lang)}
                </div>

                <div class="item-count">
                    ${formatNumber(item.count || 0)}
                </div>

            </div>
        `;
    },


    /**
     * Render order card
     */
    orderCard(order, lang = 'ar') {

        const inventory =
            GameState.get('inventory.items') || {};

        const canComplete =
            order.items.every(item => {

                return (
                    inventory[item.item] &&
                    inventory[item.item].count >=
                    item.amount
                );
            });

        const timeLeft =
            Math.max(
                0,
                Math.floor(
                    (
                        order.expiresAt -
                        Date.now()
                    ) / 1000
                )
            );

        const expired =
            timeLeft <= 0;

        return `
            <div
                class="order-card ${expired ? 'expired' : ''}"
                data-id="${order.id}"
            >

                <div class="order-header">

                    <div class="order-customer">

                        <span class="avatar">
                            ${order.customerIcon || '👤'}
                        </span>

                        <span>
                            ${order.customer || 'عميل'}
                        </span>

                    </div>

                    <div class="order-timer">
                        ⏱️ ${formatTime(timeLeft)}
                    </div>

                </div>


                <div class="order-items">

                    ${
                        order.items
                            .map(itemRequest => {

                                const item =
                                    getItem(
                                        itemRequest.item
                                    );

                                const owned =
                                    inventory[
                                        itemRequest.item
                                    ]?.count || 0;

                                const hasEnough =
                                    owned >=
                                    itemRequest.amount;

                                return `
                                    <div
                                        class="order-item ${
                                            hasEnough
                                            ? 'satisfied'
                                            : 'missing'
                                        }"
                                    >

                                        <span class="item-icon">
                                            ${iconHTML(item?.icon, 30)}
                                        </span>

                                        <span class="item-need">
                                            ${itemRequest.amount}x
                                            ${labelOf(
                                                item,
                                                itemRequest.item,
                                                lang
                                            )}
                                        </span>

                                        <span class="item-owned">
                                            ${owned}
                                        </span>

                                    </div>
                                `;

                            })
                            .join('')
                    }

                </div>


                <div class="order-reward">

                    <div class="rewards">

                        <span>
                            🪙
                            ${formatNumber(
                                order.rewardCoins || 0
                            )}
                        </span>

                        <span>
                            ⭐
                            ${formatNumber(
                                order.rewardXp || 0
                            )}
                        </span>

                    </div>


                    <div class="order-actions">

                        ${
                            order.state === 'pending'
                            ? `
                                <button
                                    class="btn-accept"
                                    data-action="accept"
                                >
                                    ✓
                                    ${t(
                                        'accept',
                                        lang
                                    )}
                                </button>

                                <button
                                    class="btn-reject"
                                    data-action="reject"
                                >
                                    ✕
                                    ${t(
                                        'cancel',
                                        lang
                                    )}
                                </button>
                            `
                            : ''
                        }


                        ${
                            order.state === 'accepted'
                            ? `
                                <button
                                    class="btn-complete"
                                    data-action="complete"
                                    ${
                                        !canComplete ||
                                        expired
                                        ? 'disabled'
                                        : ''
                                    }
                                >
                                    ${
                                        canComplete &&
                                        !expired
                                        ? '✓ ' +
                                          t(
                                              'complete',
                                              lang
                                          )
                                        : '✗ ' +
                                          t(
                                              'locked',
                                              lang
                                          )
                                    }
                                </button>
                            `
                            : ''
                        }

                    </div>

                </div>

            </div>
        `;
    },


    /**
     * Render market listing
     */
    marketListing(listing, lang = 'ar') {

        const item =
            getItem(listing.itemId);

        return `
            <div
                class="market-item"
                data-id="${listing.id}"
            >

                <div class="m-icon">
                    ${iconHTML(item?.icon, 30)}
                </div>

                <div class="m-info">

                    <div class="m-name">
                        ${listing.amount}x
                        ${labelOf(
                            item,
                            listing.itemId,
                            lang
                        )}
                    </div>

                    <div class="m-seller">
                        👤
                        ${listing.sellerName || 'مزارع'}
                    </div>

                    <div class="m-unit-price">
                        🪙
                        ${formatNumber(
                            listing.pricePerUnit || 0
                        )}
                        / وحدة
                    </div>

                </div>


                <div class="m-price">
                    🪙
                    ${formatNumber(
                        listing.totalPrice || 0
                    )}
                </div>


                <button
                    class="m-buy"
                    data-action="buy"
                >
                    ${t('buy', lang)}
                </button>

            </div>
        `;
    },


    /**
     * Render friend card
     */
    friendCard(friend, lang = 'ar') {

        return `
            <div
                class="friend-card"
                data-id="${friend.id}"
            >

                <div class="f-avatar">
                    ${friend.avatar || '👤'}
                </div>


                <div class="f-info">

                    <div class="f-name">
                        ${friend.name || 'مزارع'}
                    </div>

                    <div class="f-level">

                        ${t(
                            'level',
                            lang
                        )}
                        ${friend.level || 1}

                        •

                        ${friend.farmName || 'المزرعة'}

                    </div>

                </div>


                <div class="f-actions">

                    <button
                        class="btn-visit"
                        data-action="visit"
                        title="زيارة"
                    >
                        🏠
                    </button>

                    <button
                        class="btn-gift"
                        data-action="gift"
                        title="هدية"
                    >
                        🎁
                    </button>

                </div>

            </div>
        `;
    },


    /**
     * Render farm tile
     */
    farmTile(tile, lang = 'ar') {

        const classes = [
            'farm-tile'
        ];

        let content = '';

        if (tile.state === 'empty') {

            classes.push('empty');

            content = `
                <div class="tile-empty">
                    🌱
                </div>
            `;
        }


        else if (tile.state === 'locked') {

            classes.push('locked');

            content = `
                <div class="tile-locked">
                    🔒
                </div>
            `;
        }


        else if (tile.cropId) {

            const crop =
                getCrop(tile.cropId);

            if (crop) {

                const stage =
                    Math.max(
                        0,
                        Math.min(
                            3,
                            Number(
                                tile.growthStage || 0
                            )
                        )
                    );

                const stages = [
                    'crop-seed',
                    'crop-sprout',
                    'crop-growing',
                    'crop-ready'
                ];

                const stageClass =
                    stages[stage];

                classes.push(
                    tile.state
                );

                content = `
                    <div
                        class="crop-stage ${stageClass}"
                        title="${t(
                            crop.nameKey ||
                            crop.id,
                            lang
                        )}"
                    >
                        ${iconHTML(crop.stages?.[stage] || crop.icon, 26)}
                    </div>
                `;


                if (
                    tile.state !== 'ready' &&
                    crop.growthTime
                ) {

                    const elapsed =
                        Date.now() -
                        (
                            tile.plantedAt || 0
                        );

                    const duration =
                        crop.growthTime *
                        1000;

                    const progress =
                        Math.max(
                            0,
                            Math.min(
                                100,
                                Math.floor(
                                    (
                                        elapsed /
                                        duration
                                    ) * 100
                                )
                            )
                        );

                    content += `
                        <div class="crop-progress">

                            <div
                                class="crop-progress-bar"
                                style="width:${progress}%"
                            ></div>

                        </div>
                    `;
                }


                if (tile.state === 'ready') {

                    content += `
                        <div class="ready-indicator">
                            ✨
                        </div>
                    `;
                }
            }
        }


        else if (tile.buildingId) {

            classes.push('occupied');

            content = `
                <div class="tile-building">
                    🏠
                </div>
            `;
        }


        else {

            classes.push(
                tile.state || 'empty'
            );
        }


        return `
            <div
                class="${classes.join(' ')}"
                data-tile-id="${tile.id}"
                data-state="${tile.state}"
                data-row="${tile.row ?? ''}"
                data-col="${tile.col ?? ''}"
            >
                ${content}
            </div>
        `;
    },


    /**
     * Render animal on farm
     */
    farmAnimal(animal, lang = 'ar') {

        const animalData =
            getAnimal(animal.animalId);

        if (!animalData) {
            return '';
        }

        const classes = [
            'farm-animal'
        ];

        if (
            animal.state === 'hungry'
        ) {
            classes.push('hungry');
        }

        if (
            animal.state === 'ready'
        ) {
            classes.push('ready');
        }

        const x =
            Number(animal.x || 0);

        const y =
            Number(animal.y || 0);

        const hunger =
            Math.max(
                0,
                Math.min(
                    100,
                    Number(
                        animal.hunger ?? 100
                    )
                )
            );

        return `
            <div
                class="${classes.join(' ')}"
                data-animal-id="${animal.id}"
                data-animal-type="${animal.animalId}"
                style="
                    left:${x}px;
                    top:${y}px;
                "
            >

                <div class="animal-icon">
                    ${iconHTML(animalData.icon, 30)}
                </div>

                <div class="animal-hunger-bar">

                    <div
                        class="animal-hunger-fill ${
                            hunger < 30
                            ? 'low'
                            : ''
                        }"
                        style="width:${hunger}%"
                    ></div>

                </div>

                ${
                    animal.state === 'ready'
                    ? `
                        <div class="animal-ready">
                            ❤️
                        </div>
                    `
                    : ''
                }

            </div>
        `;
    },


    /**
     * Render building on farm
     */
    farmBuilding(building, lang = 'ar') {

        const buildingData =
            getBuilding(
                building.typeId
            );

        if (!buildingData) {
            return '';
        }

        const x =
            building.position?.x ??
            building.x ??
            0;

        const y =
            building.position?.y ??
            building.y ??
            0;

        return `
            <div
                class="farm-building"
                data-building-id="${building.id}"
                data-building-type="${building.typeId}"
                style="
                    left:${x}px;
                    top:${y}px;
                "
            >

                <div class="building-icon">
                    ${iconHTML(buildingData.icon, 30)}
                </div>

                ${
                    building.level > 1
                    ? `
                        <div class="building-badge">
                            ${building.level}
                        </div>
                    `
                    : ''
                }

            </div>
        `;
    },


    /**
     * Render production recipe
     */
    recipeCard(recipe, lang = 'ar') {

        return `
            <div
                class="recipe-card"
                data-id="${recipe.id}"
            >

                <div class="recipe-icon">
                    ${iconHTML(recipe.icon, 30)}
                </div>

                <div class="recipe-name">
                    ${recipe.name || t(
                        recipe.nameKey ||
                        recipe.id,
                        lang
                    )}
                </div>

                <div class="recipe-time">
                    ⏱️
                    ${formatTime(
                        recipe.productionTime ||
                        recipe.time ||
                        0
                    )}
                </div>

            </div>
        `;
    },


    /**
     * Render leaderboard entry
     */
    leaderboardEntry(entry, lang = 'ar') {

        const rank =
            Number(entry.rank || 0);

        const rankIcon =
            rank === 1
            ? '🥇'
            : rank === 2
            ? '🥈'
            : rank === 3
            ? '🥉'
            : `#${rank}`;

        return `
            <div
                class="leaderboard-entry ${
                    entry.isPlayer
                    ? 'player'
                    : ''
                }"
                data-id="${entry.id}"
            >

                <div class="lb-rank">
                    ${rankIcon}
                </div>

                <div class="lb-name">
                    ${entry.name || 'مزارع'}
                </div>

                <div class="lb-level">
                    ⭐
                    ${entry.level || 1}
                </div>

            </div>
        `;
    }
};