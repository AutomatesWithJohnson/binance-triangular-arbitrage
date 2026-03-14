const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Simple healthcheck endpoint for platforms like Railway
app.get('/healthz', (req, res) => res.status(200).send('OK'));

function startServer() {
    // Railway dynamically assigns a PORT environment variable.
    // If running locally, it defaults to 3000.
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`\n\x1b[36m[Dashboard] 🌐 Live Web Interface running on port ${PORT}\x1b[0m`);
    });
}

function broadcastLog(type, data) {
    io.emit(type, data);
}

module.exports = { startServer, broadcastLog };
