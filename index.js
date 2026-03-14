const routeMapper = require('./routeMapper');
const marketData = require('./marketData');
const scanner = require('./scanner');
const dashboard = require('./dashboard/server');

async function startBot() {
    console.log("==================================================");
    console.log("🚀 Binance Triangular Arbitrage Bot Starting...");
    console.log("==================================================");

    // 0. Start the local dashboard web server
    dashboard.startServer();

    // 1. Fetch exchange info from Testnet and map all valid triangular A->B->C->A routes
    await routeMapper.init();
    const activeRoutes = routeMapper.getRoutes();

    if (activeRoutes.length === 0) {
        console.error("No valid triangular routes found. Exiting.");
        process.exit(1);
    }

    // 2. Initialize the scanner with the active routes
    scanner.init(activeRoutes);

    // 3. Connect to the WebSocket stream and provide the active routes so it knows which symbols to track
    marketData.init(activeRoutes);
    
    console.log("\n[Main] Bot successfully initialized and actively scanning.\n");
}

startBot();
