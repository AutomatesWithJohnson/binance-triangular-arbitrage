const WebSocket = require('ws');
const config = require('./config');
const scanner = require('./scanner');

class MarketData {
    constructor() {
        this.prices = {}; // memory store: { symbol: { bid: price, ask: price } }
        this.ws = null;
        this.subUpdateBatch = [];
    }

    init(routes) {
        // Extract all unique symbols from the calculated routes
        const uniqueSymbols = new Set();
        routes.forEach(r => {
            uniqueSymbols.add(r.trade1.symbol);
            uniqueSymbols.add(r.trade2.symbol);
            uniqueSymbols.add(r.trade3.symbol);
        });

        const symbolsList = Array.from(uniqueSymbols);
        console.log(`[MarketData] Needs to track ${symbolsList.length} unique symbols.`);
        
        // Ensure default prices are initialized
        symbolsList.forEach(s => {
            this.prices[s] = { bid: 0, ask: 0 };
        });

        this.connectWebSocket();
    }

    connectWebSocket() {
        // Listen to the comprehensive all-market ticker stream
        // !bookTicker provides the best bid and ask in real-time
        const wsUrl = `${config.BINANCE_WS_URL}/!bookTicker`;
        console.log(`[MarketData] Connecting to ${wsUrl}...`);

        this.ws = new WebSocket(wsUrl);

        this.ws.on('open', () => {
            console.log('[MarketData] Connected to Binance WebSocket (bookTicker).');
        });

        this.ws.on('message', (data) => {
            try {
                const message = JSON.parse(data);
                this.handleData(message);
            } catch (err) {
                console.error('[MarketData] Parsing error:', err.message);
            }
        });

        this.ws.on('close', () => {
            console.log('[MarketData] WebSocket closed. Reconnecting in 5 seconds...');
            setTimeout(() => this.connectWebSocket(), 5000);
        });

        this.ws.on('error', (err) => {
            console.error('[MarketData] WebSocket error:', err.message);
        });
    }

    handleData(message) {
        // BookTicker payload:
        // {
        //   "u":400900217,     // order book updateId
        //   "s":"BNBUSDT",     // symbol
        //   "b":"25.35190000", // best bid price
        //   "B":"31.21000000", // best bid qty
        //   "a":"25.36520000", // best ask price
        //   "A":"40.66000000"  // best ask qty
        // }
        
        const symbol = message.s;
        
        // Only update if we are tracking this symbol
        if (this.prices[symbol] !== undefined) {
            this.prices[symbol] = {
                bid: parseFloat(message.b),
                ask: parseFloat(message.a)
            };
            
            // Notify the scanner that prices have updated
            scanner.onPriceUpdate(this.prices);
        }
    }

    getPrices() {
        return this.prices;
    }
}

module.exports = new MarketData();
