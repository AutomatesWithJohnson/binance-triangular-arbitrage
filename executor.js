const crypto = require('crypto');
const axios = require('axios');
const config = require('./config');

class Executor {
    constructor() {
        this.inFlight = false;
    }

    async executeStrategy(route, prices, initialAmount, expectedProfitPercent) {
        if (this.inFlight) {
            return; // Don't overlap trades
        }
        
        if (!config.API_KEY || !config.API_SECRET) {
            console.error('[Executor] Cannot execute trade: API keys are missing in .env');
            return;
        }

        this.inFlight = true;
        console.log(`\n\x1b[36m[Executor] 🚀 Initiating LIVE trade sequence on Binance Testnet...\x1b[0m`);
        console.log(`[Executor] Route: ${route.route}`);
        console.log(`[Executor] Expected Profit: ${expectedProfitPercent.toFixed(3)}%`);

        try {
            let currentAmount = initialAmount;

            // --- TRADE 1 ---
            const p1 = prices[route.trade1.symbol];
            let side1 = route.trade1.dir;
            let qty1 = (side1 === 'BUY') ? (currentAmount / p1.ask) : currentAmount;
            
            // Format qty (truncate to 4 decimals to avoid LOT_SIZE filter issues on Testnet)
            let formattedQty1 = Math.floor(qty1 * 10000) / 10000;
            
            console.log(`[Executor] Step 1: ${side1} ${formattedQty1} ${route.trade1.symbol}`);
            const order1 = await this.sendOrder(route.trade1.symbol, side1, formattedQty1);
            
            // Update current amount based on actual filled amount (if available) or theoretical
            currentAmount = (side1 === 'BUY') ? formattedQty1 * (1 - config.TAKER_FEE) : (formattedQty1 * p1.bid) * (1 - config.TAKER_FEE);

            // --- TRADE 2 ---
            const p2 = prices[route.trade2.symbol];
            let side2 = route.trade2.dir;
            let qty2 = (side2 === 'BUY') ? (currentAmount / p2.ask) : currentAmount;
            let formattedQty2 = Math.floor(qty2 * 10000) / 10000;

            console.log(`[Executor] Step 2: ${side2} ${formattedQty2} ${route.trade2.symbol}`);
            const order2 = await this.sendOrder(route.trade2.symbol, side2, formattedQty2);
            
            currentAmount = (side2 === 'BUY') ? formattedQty2 * (1 - config.TAKER_FEE) : (formattedQty2 * p2.bid) * (1 - config.TAKER_FEE);

            // --- TRADE 3 ---
            const p3 = prices[route.trade3.symbol];
            let side3 = route.trade3.dir;
            let qty3 = (side3 === 'BUY') ? (currentAmount / p3.ask) : currentAmount;
            let formattedQty3 = Math.floor(qty3 * 10000) / 10000;

            console.log(`[Executor] Step 3: ${side3} ${formattedQty3} ${route.trade3.symbol}`);
            const order3 = await this.sendOrder(route.trade3.symbol, side3, formattedQty3);

            console.log(`\x1b[32m[Executor] ✅ Trade sequence completed successfully.\x1b[0m`);

        } catch (error) {
            console.error(`\x1b[31m[Executor] ❌ Trade sequence failed:\x1b[0m`);
            if (error.response && error.response.data) {
                console.error(error.response.data);
            } else {
                console.error(error.message);
            }
        } finally {
            // Re-open execution lock after 5 seconds to prevent spam
            setTimeout(() => {
                this.inFlight = false;
            }, 5000);
        }
    }

    async sendOrder(symbol, side, quantity) {
        const timestamp = Date.now();
        const queryString = `symbol=${symbol}&side=${side}&type=MARKET&quantity=${quantity}&timestamp=${timestamp}`;
        
        // Generate HMAC SHA256 signature
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
