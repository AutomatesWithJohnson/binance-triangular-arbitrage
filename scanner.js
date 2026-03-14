const config = require('./config');
const executor = require('./executor');
const dashboard = require('./dashboard/server');

class Scanner {
    constructor() {
        this.routes = [];
        this.lastLogs = Date.now();
    }

    init(routes) {
        this.routes = routes;
        console.log(`[Scanner] Initialized with ${this.routes.length} triangular routes.`);
    }

    onPriceUpdate(prices) {
        // Debounce logs to avoid terminal spam
        const shouldLogHeartbeat = Date.now() - this.lastLogs > 10000;
        if(shouldLogHeartbeat) {
            console.log(`[Scanner] Heartbeat: Actively scanning ${this.routes.length} loops...`);
            this.lastLogs = Date.now();
        }

        // Loop through every possible route
        for (const r of this.routes) {
            this.calculateProfit(r, prices);
        }
    }

    calculateProfit(route, prices) {
        const p1 = prices[route.trade1.symbol];
        const p2 = prices[route.trade2.symbol];
        const p3 = prices[route.trade3.symbol];

        // If any price hasn't been loaded via WebSocket yet, skip calculation
        if (!p1 || !p2 || !p3 || p1.ask === 0 || p2.ask === 0 || p3.ask === 0) {
            return;
        }

        let currentAmount = config.TRADE_AMOUNT_USDT; // Start with 100 base (e.g., USDT)
        let tradeDetails = [];

        // --- TRADE 1 ---
        // E.g. BUY BTCUSDT (Base: BTC, Quote: USDT)
        if (route.trade1.dir === 'BUY') {
            const buyPrice = p1.ask; // Buy at the lowest ask
            currentAmount = (currentAmount / buyPrice) * (1 - config.TAKER_FEE);
            tradeDetails.push(`Buy ${route.trade1.base} @ ${buyPrice}`);
        } else {
            // SELL (e.g. BTC <- ETHBTC)
            const sellPrice = p1.bid; // Sell at the highest bid
            currentAmount = (currentAmount * sellPrice) * (1 - config.TAKER_FEE);
            tradeDetails.push(`Sell ${route.trade1.base} @ ${sellPrice}`);
        }

        // --- TRADE 2 ---
        if (route.trade2.dir === 'BUY') {
            const buyPrice = p2.ask;
            currentAmount = (currentAmount / buyPrice) * (1 - config.TAKER_FEE);
            tradeDetails.push(`Buy ${route.trade2.base} @ ${buyPrice}`);
        } else {
            const sellPrice = p2.bid;
            currentAmount = (currentAmount * sellPrice) * (1 - config.TAKER_FEE);
            tradeDetails.push(`Sell ${route.trade2.base} @ ${sellPrice}`);
        }

        // --- TRADE 3 ---
        if (route.trade3.dir === 'BUY') {
            const buyPrice = p3.ask;
            currentAmount = (currentAmount / buyPrice) * (1 - config.TAKER_FEE);
            tradeDetails.push(`Buy ${route.trade3.base} @ ${buyPrice}`);
        } else {
            const sellPrice = p3.bid;
            currentAmount = (currentAmount * sellPrice) * (1 - config.TAKER_FEE);
            tradeDetails.push(`Sell ${route.trade3.base} @ ${sellPrice}`);
        }

        // --- CALCULATION FINISHED ---
        const profitTotal = currentAmount - config.TRADE_AMOUNT_USDT;
        const profitPercent = (profitTotal / config.TRADE_AMOUNT_USDT) * 100;

        if (profitPercent >= config.MIN_PROFIT_PERCENT) {
            const timestamp = new Date().toISOString();
            console.log(`\n\x1b[32m[${timestamp}] 🚀 ARBITRAGE FOUND: ${route.route}\x1b[0m`);
            console.log(`    Start Amount: $${config.TRADE_AMOUNT_USDT} ${route.startBase}`);
            console.log(`    End Amount:   $${currentAmount.toFixed(4)} ${route.startBase}`);
            console.log(`    Net Profit:   $${profitTotal.toFixed(4)} \x1b[32m(+${profitPercent.toFixed(3)}%)\x1b[0m`);
            console.log(`    Steps:        ${tradeDetails.join(' => ')}`);
            
            // Emit to local dashboard
            dashboard.broadcastLog('arbitrage_found', {
                timestamp: timestamp,
                route: route.route,
                startAmount: config.TRADE_AMOUNT_USDT,
                endAmount: currentAmount.toFixed(4),
                base: route.startBase,
                netProfit: profitTotal.toFixed(4),
                profitPercent: profitPercent.toFixed(3),
                steps: tradeDetails.join(' => ')
            });

            // Execute trade if enabled
            if (config.TRADE_ENABLED) {
                executor.executeStrategy(route, prices, config.TRADE_AMOUNT_USDT, profitPercent);
            }
        }
    }
}

// Instead of exporting an instance immediately, we'll export it from index.js resolving cyclic dependencies
module.exports = new Scanner();
