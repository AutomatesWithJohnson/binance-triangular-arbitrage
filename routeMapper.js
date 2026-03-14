const axios = require('axios');
const config = require('./config');

class RouteMapper {
    constructor() {
        this.symbols = {};
        this.triangularRoutes = [];
    }

    async init() {
        try {
            console.log(`[RouteMapper] Fetching exchange info from ${config.BINANCE_REST_URL}/exchangeInfo`);
            const response = await axios.get(`${config.BINANCE_REST_URL}/exchangeInfo`);
            
            // Filter only for trading pairs that are TRADING
            const activeSymbols = response.data.symbols.filter(s => s.status === 'TRADING' && s.isSpotTradingAllowed);
            
            activeSymbols.forEach(s => {
                this.symbols[s.symbol] = {
                    baseAsset: s.baseAsset,
                    quoteAsset: s.quoteAsset,
                    symbol: s.symbol
                };
            });

            console.log(`[RouteMapper] Found ${Object.keys(this.symbols).length} active spot trading pairs.`);
            this.buildTriangularRoutes();

        } catch (error) {
            console.error('[RouteMapper] Error fetching exchange info:', error.message);
            process.exit(1);
        }
    }

    buildTriangularRoutes() {
        console.log(`[RouteMapper] Building triangular routes with bases: ${config.BASE_CURRENCIES.join(', ')}...`);
        
        // A triangular route consists of: 
        // 1. Initial Currency (e.g., USDT)
        // 2. Intermediate Currency 1 (e.g., BTC)
        // 3. Intermediate Currency 2 (e.g., ETH)
        // Back to Initial Currency

        for (const baseCurrency of config.BASE_CURRENCIES) {
            // Find all pairs that include the base currency (either as quote or base)
            const pairsWithBase = Object.values(this.symbols).filter(
                s => s.baseAsset === baseCurrency || s.quoteAsset === baseCurrency
            );

            for (const pair1 of pairsWithBase) {
                const isBaseFirst = pair1.baseAsset === baseCurrency;
                const intermediate1 = isBaseFirst ? pair1.quoteAsset : pair1.baseAsset;

                // Trade 1 Direction:
                // If pair is BTCUSDT and our base is USDT => Buy BTC (Trade type: BUY, Base->Quote asset direction)
                const trade1Dir = isBaseFirst ? 'SELL' : 'BUY';

                // Find all pairs that connect intermediate1 to another currency (intermediate2)
                const pairsWithInt1 = Object.values(this.symbols).filter(
                    s => (s.baseAsset === intermediate1 || s.quoteAsset === intermediate1) &&
                         s.baseAsset !== baseCurrency && s.quoteAsset !== baseCurrency
                );

                for (const pair2 of pairsWithInt1) {
                    const isInt1First = pair2.baseAsset === intermediate1;
                    const intermediate2 = isInt1First ? pair2.quoteAsset : pair2.baseAsset;
                    
                    const trade2Dir = isInt1First ? 'SELL' : 'BUY';

                    // Find if there is a pair that connects intermediate2 back to the baseCurrency
                    const pair3 = Object.values(this.symbols).find(
                        s => (s.baseAsset === intermediate2 && s.quoteAsset === baseCurrency) ||
                             (s.quoteAsset === intermediate2 && s.baseAsset === baseCurrency)
                    );

                    if (pair3) {
                        const isInt2First = pair3.baseAsset === intermediate2;
                        const trade3Dir = isInt2First ? 'SELL' : 'BUY';

                        this.triangularRoutes.push({
                            route: `${baseCurrency} -> ${intermediate1} -> ${intermediate2} -> ${baseCurrency}`,
                            startBase: baseCurrency,
                            trade1: { symbol: pair1.symbol, dir: trade1Dir, base: pair1.baseAsset, quote: pair1.quoteAsset },
                            trade2: { symbol: pair2.symbol, dir: trade2Dir, base: pair2.baseAsset, quote: pair2.quoteAsset },
                            trade3: { symbol: pair3.symbol, dir: trade3Dir, base: pair3.baseAsset, quote: pair3.quoteAsset }
                        });
                    }
                }
            }
        }

        console.log(`[RouteMapper] Generated ${this.triangularRoutes.length} valid triangular routes.`);
    }

    getRoutes() {
        return this.triangularRoutes;
    }
}

module.exports = new RouteMapper();
