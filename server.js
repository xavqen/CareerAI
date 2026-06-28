import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

import healthHandler from './api/health.js';
import registerHandler from './api/auth/register.js';
import loginHandler from './api/auth/login.js';
import googleHandler from './api/auth/google.js'; // <-- Added this
import conversationsHandler from './api/conversations/index.js';
import chatHandler from './api/chat.js';
import premiumOrderHandler from './api/premium/order.js';
import { initDB } from './lib/db.js';
import messagesHandler from './api/messages.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// API Routes
app.all('/api/health', healthHandler);
app.all('/api/auth/register', registerHandler);
app.all('/api/auth/login', loginHandler);
app.all('/api/auth/google', googleHandler); // <-- Mounted this
app.all('/api/conversations', conversationsHandler);
app.all('/api/chat', chatHandler);
app.all('/api/premium/order', premiumOrderHandler);
app.all('/api/messages', messagesHandler);

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`🚀 Server is running locally at http://localhost:${PORT}`);
  
  // Create tables in Turso if they don't exist
  try {
    await initDB();
    console.log(`✅ Database tables initialized successfully!`);
  } catch (error) {
    console.error(`❌ Database initialization failed:`, error.message);
  }
});