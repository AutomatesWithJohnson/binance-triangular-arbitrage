const crypto = require('crypto');
const axios = require('axios');
const config = require('./config');
const dashboard = require('./dashboard/server');

class Executor {
    constructor() {
        this.inFlight = false;
        this.lastBalanceFetch = 0;
    }

    async fetchBalance(prices) {
        if (!config.API_KEY || !config.API_SECRET) return;
        
        // Rate limit balance fetching to once every 5 seconds to avoid spamming the REST API
        if (Date.now() - this.lastBalanceFetch < 5000) return;
        this.lastBalanceFetch = Date.now();

        try {
            const timestamp = Date.now();
            const queryString = `timestamp=${timestamp}`;
            const signature = crypto.createHmac('sha256', config.API_SECRET).update(queryString).digest('hex');
            const url = `${config.BINANCE_REST_URL}/account?${queryString}&signature=${signature}`;
            
            const response = await axios.get(url, { headers: { 'X-MBX-APIKEY': config.API_KEY } });
            
            let totalUSDTValue = 0;
            const balances = response.data.balances.filter(b => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0);
            
            for (let b of balances) {
                let amount = parseFloat(b.free) + parseFloat(b.locked);
                if (b.asset === 'USDT') {
                    totalUSDTValue += amount;
                } else if (prices[`${b.asset}USDT`]) {
                    totalUSDTValue += amount * prices[`${b.asset}USDT`].bid;
                } else if (prices[`USDT${b.asset}`]) {
                    totalUSDTValue += amount / prices[`USDT${b.asset}`].ask;
                }
            }
            
            dashboard.broadcastLog('account_balance', { totalUSDTValue });
        } catch (error) {
            console.error('[Executor] Error fetching balance:', error.message);
        }
    }

    async executeStrategy(route, prices, initialAmount, expectedProfitPercent) {
        if (this.inFlight) return;
        if (!config.API_KEY || !config.API_SECRET) return;

        this.inFlight = true;
        console.log(`\n\x1b[36m[Executor] 🚀 Initiating LIVE trade sequence on Binance Testnet...\x1b[0m`);
        
        dashboard.broadcastLog('trade_status', {
            timestamp: Date.now(),
            status: 'OPEN',
            route: route.route
        });

        try {
            let currentAmount = initialAmount;
            let tradeDetails = [];

            // --- TRADE 1 ---
            const p1 = prices[route.trade1.symbol];
            let side1 = route.trade1.dir;
            let qty1 = (side1 === 'BUY') ? (currentAmount / p1.ask) : currentAmount;
            let formattedQty1 = Math.floor(qty1 * 10000) / 10000;
            
            tradeDetails.push(`${side1} ${route.trade1.symbol}`);
            const order1 = await this.sendOrder(route.trade1.symbol, side1, formattedQty1);
            
            // Re-calculate the actual amount we received based on the filled order
            let actualFilled1 = parseFloat(order1.executedQty);
            let quoteSpent1 = parseFloat(order1.cummulativeQuoteQty);
            currentAmount = (side1 === 'BUY') ? actualFilled1 * (1 - config.TAKER_FEE) : quoteSpent1 * (1 - config.TAKER_FEE);

            // --- TRADE 2 ---
            const p2 = prices[route.trade2.symbol];
            let side2 = route.trade2.dir;
            let qty2 = (side2 === 'BUY') ? (currentAmount / p2.ask) : currentAmount;
            let formattedQty2 = Math.floor(qty2 * 10000) / 10000;

            tradeDetails.push(`${side2} ${route.trade2.symbol}`);
            const order2 = await this.sendOrder(route.trade2.symbol, side2, formattedQty2);
            
            let actualFilled2 = parseFloat(order2.executedQty);
            let quoteSpent2 = parseFloat(order2.cummulativeQuoteQty);
            currentAmount = (side2 === 'BUY') ? actualFilled2 * (1 - config.TAKER_FEE) : quoteSpent2 * (1 - config.TAKER_FEE);

            // --- TRADE 3 ---
            const p3 = prices[route.trade3.symbol];
            let side3 = route.trade3.dir;
            let qty3 = (side3 === 'BUY') ? (currentAmount / p3.ask) : currentAmount;
            let formattedQty3 = Math.floor(qty3 * 10000) / 10000;

            tradeDetails.push(`${side3} ${route.trade3.symbol}`);
            const order3 = await this.sendOrder(route.trade3.symbol, side3, formattedQty3);

            let actualFilled3 = parseFloat(order3.executedQty);
            let quoteSpent3 = parseFloat(order3.cummulativeQuoteQty);
            let finalOutput = (side3 === 'BUY') ? actualFilled3 * (1 - config.TAKER_FEE) : quoteSpent3 * (1 - config.TAKER_FEE);

            const realPnl = (finalOutput - initialAmount).toFixed(4);

            console.log(`\x1b[32m[Executor] ✅ Trade sequence completed successfully. Real PNL: $${realPnl}\x1b[0m`);

            dashboard.broadcastLog('trade_status', {
                timestamp: Date.now(),
                status: 'CLOSED',
                route: route.route,
                realPnl: realPnl,
                steps: tradeDetails.join(' => ')
            });

            // Trigger a balance update immediately after trade finishes
            this.lastBalanceFetch = 0; 
            await this.fetchBalance(prices);

        } catch (error) {
            console.error(`\x1b[31m[Executor] ❌ Trade sequence failed:\x1b[0m`);
            const errMsg = error.response && error.response.data ? JSON.stringify(error.response.data) : error.message;
            console.error(errMsg);
            
            dashboard.broadcastLog('trade_status', {
                timestamp: Date.now(),
                status: 'ERROR',
                route: route.route,
                error: errMsg
            });
        } finally {
            setTimeout(() => {
                this.inFlight = false;
            }, 5000);
        }
    }

    async sendOrder(symbol, side, quantity) {
        const timestamp = Date.now();
        const queryString = `symbol=${symbol}&side=${side}&type=MARKET&quantity=${quantity}&timestamp=${timestamp}`;
        
        const signature = crypto.createHmac('sha256', config.API_SECRET).update(queryString).digest('hex');
        const url = `${config.BINANCE_REST_URL}/order?${queryString}&signature=${signature}`;

        const response = await axios.post(url, null, {
            headers: {
                'X-MBX-APIKEY': config.API_KEY
            }
        });
        
        return response.data;
    }
}

module.exports = new Executor();
