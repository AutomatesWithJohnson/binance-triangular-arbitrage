require('dotenv').config();

const config = {
    BINANCE_WS_URL: 'wss://stream.binance.com:9443/ws',
    BINANCE_REST_URL: 'https://testnet.binance.vision/api/v3', // SPOT TESTNET URL
    API_KEY: process.env.BINANCE_API_KEY,
    API_SECRET: process.env.BINANCE_API_SECRET,
    TRADE_ENABLED: process.env.TRADE_ENABLED === 'true',
    MIN_PROFIT_PERCENT: parseFloat(process.env.MIN_PROFIT_PERCENT) || 0.1, // Minimum % profit to consider
    TRADE_AMOUNT_USDT: parseFloat(process.env.TRADE_AMOUNT_USDT) || 100, // Base trade amount
    TAKER_FEE: 0.001, // 0.1% Binance standard spot taker fee
    
    // Core base currencies to look for triangular routes
    BASE_CURRENCIES: ['USDT', 'BUSD', 'BTC', 'ETH']
};

module.exports = config;
