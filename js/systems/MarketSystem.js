/**
 * MarketSystem.js — AI Market
 * Offline-ready market with AI sellers and buyers.
 *   QA-§1b — رمية مكافأة الكشك الفاشلة تُسجَّل debug بدل catch صامت.
 */

import { Events } from '../core/EventBus.js';
import { Logger } from '../core/Logger.js';
import { GameState } from '../core/GameState.js';
import { ITEMS, ECONOMY } from '../data/GameData.js';
import { StorageSystem } from './StorageSystem.js';
import { uuid, randPick, randInt, randFloat } from '../utils/Utils.js';

class MarketSystemService {
    constructor() {
        this._initListeners();
    }

    _initListeners() {
        Events.on('game:tick', (dt) => this._tick(dt));
    }

    /**
     * List an item for sale.
     */
    listItem(itemId, amount, pricePerUnit) {
        const item = ITEMS[itemId];

        if (!item) {
            return {
                success: false,
                error: 'Invalid item'
            };
        }

        if (
            !Number.isFinite(amount) ||
            !Number.isFinite(pricePerUnit) ||
            amount <= 0 ||
            pricePerUnit <= 0
        ) {
            return {
                success: false,
                error: 'Invalid amount/price'
            };
        }

        amount = Math.floor(amount);
        pricePerUnit = Math.floor(pricePerUnit);

        const inventory = GameState.get('inventory');
        const items = GameState.get('inventory.items');

        if (!items[itemId] || items[itemId].count < amount) {
            return {
                success: false,
                error: 'Not enough items'
            };
        }

        const myListings = GameState.get('market.myListings') || [];

        if (myListings.length >= ECONOMY.maxMarketListings) {
            return {
                success: false,
                error: 'Max listings reached'
            };
        }

        /*
         * Remove the listed items from inventory.
         */
        items[itemId].count -= amount;

        if (items[itemId].count <= 0) {
            delete items[itemId];
        }

        GameState.set('inventory.items', { ...items });

        const now = Date.now();

        const listing = {
            id: uuid(),
            sellerId: 'player',
            sellerName: GameState.get('player.name'),

            itemId,
            amount,
            pricePerUnit,

            totalPrice: amount * pricePerUnit,

            listedAt: now,
            expiresAt: now + (ECONOMY.marketDuration * 1000)
        };

        myListings.push(listing);

        GameState.set(
            'market.myListings',
            [...myListings]
        );

        Events.emit('market:listed', listing);

        return {
            success: true,
            listing
        };
    }

    /**
     * Cancel one of the player's listings.
     * Listed items are returned to inventory.
     */
    cancelListing(listingId) {
        const myListings = GameState.get('market.myListings') || [];

        const index = myListings.findIndex(
            listing => listing.id === listingId
        );

        if (index === -1) {
            return {
                success: false,
                error: 'Listing not found'
            };
        }

        const listing = myListings[index];

        const items = GameState.get('inventory.items');

        if (!items[listing.itemId]) {
            items[listing.itemId] = {
                count: 0,
                quality: 1
            };
        }

        items[listing.itemId].count += listing.amount;

        GameState.set(
            'inventory.items',
            { ...items }
        );

        myListings.splice(index, 1);

        GameState.set(
            'market.myListings',
            [...myListings]
        );

        Events.emit(
            'market:cancelled',
            listingId
        );

        return {
            success: true
        };
    }

    /**
     * Buy an item from the AI market.
     */
    buyFromMarket(listingId) {
        const listings =
            GameState.get('market.listings') || [];

        const index = listings.findIndex(
            listing => listing.id === listingId
        );

        if (index === -1) {
            return {
                success: false,
                error: 'Listing not found'
            };
        }

        const listing = listings[index];

        /*
         * Check expiration.
         */
        if (Date.now() >= listing.expiresAt) {
            listings.splice(index, 1);

            GameState.set(
                'market.listings',
                [...listings]
            );

            return {
                success: false,
                error: 'Listing expired'
            };
        }

        const totalPrice = listing.totalPrice;

        const fee = Math.floor(
            totalPrice * ECONOMY.marketFee
        );

        const finalPrice =
            totalPrice + fee;

        const coins =
            GameState.get('player.coins');

        if (coins < finalPrice) {
            return {
                success: false,
                error: 'Not enough coins'
            };
        }

        /*
         * Inventory capacity check.
         */
        const inventory =
            GameState.get('inventory');

        const currentItems =
            Object.values(inventory.items || {})
                .reduce(
                    (sum, item) =>
                        sum + (item.count || 0),
                    0
                );

        if (
            currentItems + listing.amount >
            inventory.maxCapacity
        ) {
            Events.emit('inventory:full');

            return {
                success: false,
                error: 'Inventory full'
            };
        }

        /*
         * Remove coins.
         */
        GameState.set(
            'player.coins',
            coins - finalPrice
        );

        /*
         * Add purchased items.
         */
        const items =
            GameState.get('inventory.items');

        if (!items[listing.itemId]) {
            items[listing.itemId] = {
                count: 0,
                quality: 1
            };
        }

        items[listing.itemId].count +=
            listing.amount;

        GameState.set(
            'inventory.items',
            { ...items }
        );

        /*
         * Remove listing.
         */
        listings.splice(index, 1);

        GameState.set(
            'market.listings',
            [...listings]
        );

        Events.emit(
            'market:purchased',
            listingId,
            listing.itemId,
            listing.amount,
            finalPrice
        );

        return {
            success: true,
            itemId: listing.itemId,
            amount: listing.amount,
            price: finalPrice
        };
    }

    /**
     * Generate AI market listings.
     */
    generateAIListings() {
        const listings = [];

        const itemIds =
            Object.keys(ITEMS);

        if (itemIds.length === 0) {
            GameState.set(
                'market.listings',
                []
            );

            return [];
        }

        const count =
            randInt(5, 12);

        const aiNames = [
            'فلاح_1',
            'مزارع_2',
            'تاجر_3',
            'صديق_4',
            'جار_5',
            'زائر_6'
        ];

        const now = Date.now();

        for (let i = 0; i < count; i++) {
            const itemId =
                randPick(itemIds);

            const item =
                ITEMS[itemId];

            if (!item) continue;

            const amount =
                randInt(1, 10);

            const priceVariance =
                randFloat(0.8, 1.5);

            const pricePerUnit =
                Math.max(
                    1,
                    Math.floor(
                        (item.sellPrice || 1) *
                        priceVariance
                    )
                );

            listings.push({
                id: uuid(),

                sellerId: `ai_${i}`,

                sellerName:
                    randPick(aiNames),

                itemId,

                amount,

                pricePerUnit,

                totalPrice:
                    amount * pricePerUnit,

                listedAt: now,

                expiresAt:
                    now +
                    (ECONOMY.marketDuration * 1000)
            });
        }

        GameState.set(
            'market.listings',
            listings
        );

        GameState.set(
            'market.lastUpdate',
            now
        );

        Events.emit(
            'market:refreshed',
            listings
        );

        return listings;
    }

    /**
     * Process AI buyers purchasing
     * the player's listings.
     */
    _processAIBuying() {
        const myListings =
            GameState.get('market.myListings') || [];

        if (myListings.length === 0) {
            return;
        }

        const now = Date.now();

        const remaining = [];

        for (const listing of myListings) {

            /*
             * 5% chance per game tick.
             */
            if (Math.random() < 0.05) {

                const earnings =
                    listing.totalPrice;

                const coins =
                    GameState.get('player.coins');

                GameState.set(
                    'player.coins',
                    coins + earnings
                );

                Events.emit(
                    'market:sold',
                    listing.id,
                    earnings,
                    listing.itemId,
                    listing.amount
                );

                /*
                 * Quest line "sell" listens to `crop:sold`; a market sale
                 * must count exactly like an inventory sale.
                 */
                const soldDef = ITEMS[listing.itemId];

                if (soldDef && soldDef.category !== 'seed') {
                    Events.emit(
                        'crop:sold',
                        listing.amount,
                        {
                            itemId: listing.itemId,
                            coins: earnings,
                            via: 'market'
                        }
                    );
                }

                const stats =
                    GameState.get('stats') || {};

                GameState.set(
                    'stats.totalSales',
                    (stats.totalSales || 0) + earnings
                );

                /*
                 * زائر الكشك قد يترك مادة ترقية (Brief §1: «upgrade both
                 * with supply items from harvest/orders/visitors»).
                 * المصدر 'stallSale' له احتمال خاص في STORAGE_CONFIG.
                 */
                try {
                    StorageSystem.rollSupplyDrop('stallSale');
                } catch (e) { Logger.debug('Market', 'stall supply-dice roll skipped', e); }

                continue;
            }

            /*
             * Keep active listing.
             */
            if (now < listing.expiresAt) {
                remaining.push(listing);
                continue;
            }

            /*
             * Listing expired.
             * Return items to inventory.
             */
            const items =
                GameState.get('inventory.items');

            if (!items[listing.itemId]) {
                items[listing.itemId] = {
                    count: 0,
                    quality: 1
                };
            }

            items[listing.itemId].count +=
                listing.amount;

            GameState.set(
                'inventory.items',
                { ...items }
            );

            Events.emit(
                'market:expired',
                listing.id
            );
        }

        if (
            remaining.length !==
            myListings.length
        ) {
            GameState.set(
                'market.myListings',
                remaining
            );
        }
    }

    /**
     * Main market tick.
     */
    _tick(dt) {
        const lastUpdate =
            GameState.get('market.lastUpdate') || 0;

        /*
         * Refresh AI market every 60 seconds.
         */
        if (
            Date.now() - lastUpdate >
            60000
        ) {
            this.generateAIListings();
        }

        /*
         * Process AI buyers.
         */
        this._processAIBuying();
    }

    /**
     * Get AI market listings.
     */
    getListings() {
        return GameState.get(
            'market.listings'
        ) || [];
    }

    /**
     * Get player's listings.
     */
    getMyListings() {
        return GameState.get(
            'market.myListings'
        ) || [];
    }

    /**
     * Find a listing by ID.
     */
    getListing(listingId) {
        const listings =
            this.getListings();

        return listings.find(
            listing =>
                listing.id === listingId
        ) || null;
    }

    /**
     * Find one of player's listings.
     */
    getMyListing(listingId) {
        const listings =
            this.getMyListings();

        return listings.find(
            listing =>
                listing.id === listingId
        ) || null;
    }

    /**
     * Get market statistics.
     */
    getStats() {
        const listings =
            this.getListings();

        const myListings =
            this.getMyListings();

        return {
            aiListings: listings.length,
            myListings: myListings.length,
            maxListings:
                ECONOMY.maxMarketListings,

            lastUpdate:
                GameState.get(
                    'market.lastUpdate'
                ) || 0
        };
    }
}

export const MarketSystem =
    new MarketSystemService();