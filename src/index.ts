import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';

import { env } from './config/env';
import { loadBusinessProfile } from './config/business';
import { getDatabase, closeDatabase } from './database';
import { handleMediaStream } from './services/audio-pipeline';
import voiceRoutes from './routes/voice';
import adminRoutes from './routes/admin';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/voice', voiceRoutes);
app.use('/api', adminRoutes);

// Serve dashboard at root
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize
const profile = loadBusinessProfile();
const db = getDatabase();

const server = createServer(app);

// WebSocket server for Twilio Media Streams
const wss = new WebSocketServer({ server, path: '/voice/stream' });
wss.on('connection', (ws, req) => {
  handleMediaStream(ws, req);
});

server.listen(env.port, () => {
  console.log(`
╔══════════════════════════════════════════════╗
║           🪒  BarberBot v1.0.0  🪒           ║
╠══════════════════════════════════════════════╣
║  Business: ${profile.name.padEnd(33)}║
║  Server:   http://localhost:${String(env.port).padEnd(18)}║
║  WS:       ws://localhost:${String(env.port).padEnd(19)}║
║  Dashboard: http://localhost:${String(env.port).padEnd(17)}║
╚══════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
const shutdown = () => {
  console.log('\n[Server] Shutting down...');
  closeDatabase();
  server.close(() => {
    console.log('[Server] Closed');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
