import 'dotenv/config';
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Database from 'better-sqlite3';
import { OAuth2Client } from 'google-auth-library';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { OpenAI } from 'openai';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static('public'));

// ----------------- Database -----------------
const db = new Database('careerai.db');
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    password TEXT,
    name TEXT,
    google_id TEXT UNIQUE,
    avatar TEXT,
    is_premium INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT DEFAULT 'New Chat',
    model TEXT DEFAULT 'gemini-2.0-flash',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    role TEXT CHECK(role IN ('user','ai')),
    content TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
  );
  CREATE TABLE IF NOT EXISTS daily_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    message_count INTEGER DEFAULT 0,
    UNIQUE(user_id, date)
  );
  CREATE TABLE IF NOT EXISTS razorpay_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT UNIQUE,
    user_id INTEGER,
    amount REAL,
    currency TEXT,
    status TEXT DEFAULT 'created',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ----------------- Razorpay Instance -----------------
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// ----------------- Helpers -----------------
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

async function checkDailyLimit(userId, isPremium) {
  if (isPremium) return true;
  const today = new Date().toISOString().slice(0, 10);
  const row = db.prepare('SELECT message_count FROM daily_usage WHERE user_id = ? AND date = ?').get(userId, today);
  const count = row ? row.message_count : 0;
  return count < 20;
}

async function incrementDailyUsage(userId) {
  const today = new Date().toISOString().slice(0, 10);
  db.prepare(`
    INSERT INTO daily_usage (user_id, date, message_count) VALUES (?, ?, 1)
    ON CONFLICT(user_id, date) DO UPDATE SET message_count = message_count + 1
  `).run(userId, today);
}

// ----------------- AI Models -----------------
function getConfiguredModels() {
  const models = [];
  if (process.env.GEMINI_API_KEY) {
    models.push(
      { id: 'gemini-2.5-flash', name: '⚡Pro', provider: 'gemini', providerDisplay: 'Google' }
      // { id: 'gemini-2.0-pro',   name: '🧠 Gemini 2.0 Pro',   provider: 'gemini', providerDisplay: 'Google' },
      // { id: 'gemini-1.5-flash', name: '💨 Gemini 1.5 Flash', provider: 'gemini', providerDisplay: 'Google' }
    );
  }
  if (process.env.GROK_API_KEY) {
    models.push({ id: 'grok-2-latest', name: '🤖 Grok 2', provider: 'grok', providerDisplay: 'xAI' });
  }
  return models;
}

const SYSTEM_PROMPT = `You are a futuristic career coach AI. Reply in **concise, scannable bullet points** with **minimal text**. Use **text‑based flowcharts** (arrows →, emojis) to show career paths. Include:
- 🔥 Estimated **salary range** (₹ or $)
- ⏳ **Minimum study/training time** to get a job
- 💡 Interesting facts or hidden opportunities
- 🎯 After EVERY message, ask **1 engaging question** to keep the conversation going.`;

async function callGemini(model, messages, apiKey) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const history = [];
  let systemInstruction = '';
  for (const msg of messages) {
    if (msg.role === 'system') systemInstruction += msg.content + '\n';
    else history.push({ role: msg.role === 'user' ? 'user' : 'model', parts: [{ text: msg.content }] });
  }
  const geminiModel = genAI.getGenerativeModel({ model, systemInstruction: systemInstruction.trim() || undefined });
  const chat = geminiModel.startChat({ history: history.slice(0, -1) });
  const lastMsg = history[history.length - 1];
  const result = await chat.sendMessage(lastMsg.parts[0].text);
  return result.response.text();
}

async function callGrok(model, messages, apiKey) {
  const openai = new OpenAI({ apiKey, baseURL: 'https://api.x.ai/v1' });
  const completion = await openai.chat.completions.create({ model, messages, temperature: 0.7 });
  return completion.choices[0].message.content;
}

// ----------------- Auth Routes -----------------
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) return res.status(400).json({ error: 'Email already registered' });
    const hashed = await bcrypt.hash(password, 10);
    const info = db.prepare('INSERT INTO users (name, email, password) VALUES (?, ?, ?)').run(name, email, hashed);
    const user = db.prepare('SELECT id, email, name, is_premium FROM users WHERE id = ?').get(info.lastInsertRowid);
    const token = jwt.sign({ id: user.id, email: user.email, is_premium: user.is_premium }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user });
  } catch (err) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !user.password) return res.status(400).json({ error: 'Invalid credentials' });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id, email: user.email, is_premium: user.is_premium }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, is_premium: user.is_premium } });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/auth/google', async (req, res) => {
  try {
    const { credential } = req.body;
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: process.env.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;
    let user = db.prepare('SELECT * FROM users WHERE google_id = ? OR email = ?').get(googleId, email);
    if (!user) {
      db.prepare('INSERT INTO users (email, name, google_id, avatar) VALUES (?, ?, ?, ?)').run(email, name, googleId, picture);
      user = db.prepare('SELECT * FROM users WHERE google_id = ?').get(googleId);
    } else if (!user.google_id) {
      db.prepare('UPDATE users SET google_id = ?, avatar = ? WHERE id = ?').run(googleId, picture, user.id);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    }
    const token = jwt.sign({ id: user.id, email: user.email, is_premium: user.is_premium }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, is_premium: user.is_premium, avatar: user.avatar } });
  } catch (err) {
    res.status(500).json({ error: 'Google authentication failed' });
  }
});

// ----------------- User Profile -----------------
app.get('/api/user', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, email, name, is_premium, avatar FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// ----------------- Premium with Razorpay -----------------
// Create order
app.post('/api/premium/create-order', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const amount = 49900; // ₹499 in paise
    const currency = 'INR';
    const options = {
      amount: amount,
      currency: currency,
      receipt: `rcpt_${userId}_${Date.now()}`,
      notes: { userId: userId }
    };
    const order = await razorpay.orders.create(options);
    // Save to DB
    db.prepare('INSERT INTO razorpay_orders (order_id, user_id, amount, currency, status) VALUES (?, ?, ?, ?, ?)')
      .run(order.id, userId, order.amount / 100, order.currency, 'created');
    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      key: process.env.RAZORPAY_KEY_ID
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// Verify payment & upgrade
app.post('/api/premium/verify', authMiddleware, (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  const sign = razorpay_order_id + "|" + razorpay_payment_id;
  const expectedSign = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(sign)
    .digest('hex');
  if (expectedSign !== razorpay_signature) {
    return res.status(400).json({ error: 'Payment verification failed' });
  }
  // Update order status
  db.prepare('UPDATE razorpay_orders SET status = ? WHERE order_id = ?').run('paid', razorpay_order_id);
  // Upgrade user
  db.prepare('UPDATE users SET is_premium = 1 WHERE id = ?').run(req.user.id);
  const user = db.prepare('SELECT id, email, is_premium FROM users WHERE id = ?').get(req.user.id);
  const token = jwt.sign({ id: user.id, email: user.email, is_premium: user.is_premium }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, is_premium: true });
});

// ----------------- Conversations & Chat -----------------
app.get('/api/conversations', authMiddleware, (req, res) => {
  const convs = db.prepare(`
    SELECT c.*, 
      (SELECT m.content FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) as lastMessage
    FROM conversations c
    WHERE c.user_id = ?
    ORDER BY c.created_at DESC
  `).all(req.user.id);
  res.json(convs);
});

app.post('/api/conversations', authMiddleware, (req, res) => {
  const { title, model } = req.body;
  const info = db.prepare('INSERT INTO conversations (user_id, title, model) VALUES (?, ?, ?)').run(req.user.id, title || 'New Chat', model || 'gemini-2.0-flash');
  res.json({ id: info.lastInsertRowid });
});

app.delete('/api/conversations/:id', authMiddleware, (req, res) => {
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!conv) return res.status(404).json({ error: 'Conversation not found' });
  db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(req.params.id);
  db.prepare('DELETE FROM conversations WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.get('/api/conversations/:id/messages', authMiddleware, (req, res) => {
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!conv) return res.status(404).json({ error: 'Conversation not found' });
  const messages = db.prepare('SELECT role, content, timestamp FROM messages WHERE conversation_id = ? ORDER BY id ASC').all(req.params.id);
  res.json(messages);
});

app.post('/api/chat', authMiddleware, async (req, res) => {
  try {
    const { conversationId, model, provider, message } = req.body;
    if (!conversationId || !model || !provider || !message) return res.status(400).json({ error: 'Missing fields' });
    const conv = db.prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?').get(conversationId, req.user.id);
    if (!conv) return res.status(403).json({ error: 'Conversation not yours' });

    const canSend = await checkDailyLimit(req.user.id, req.user.is_premium);
    if (!canSend) return res.status(429).json({ error: 'Daily limit reached. Upgrade to Premium for unlimited messages.' });

    const history = db.prepare('SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY id ASC').all(conversationId);
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: message }
    ];

    db.prepare('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)').run(conversationId, 'user', message);

    let reply;
    if (provider === 'gemini') {
      if (!process.env.GEMINI_API_KEY) throw new Error('Gemini not configured');
      reply = await callGemini(model, messages, process.env.GEMINI_API_KEY);
    } else if (provider === 'grok') {
      if (!process.env.GROK_API_KEY) throw new Error('Grok not configured');
      reply = await callGrok(model, messages, process.env.GROK_API_KEY);
    } else {
      return res.status(400).json({ error: 'Unsupported provider' });
    }

    db.prepare('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)').run(conversationId, 'ai', reply);
    await incrementDailyUsage(req.user.id);

    if (history.length === 0) {
      const shortTitle = message.substring(0, 40) + (message.length > 40 ? '...' : '');
      db.prepare('UPDATE conversations SET title = ? WHERE id = ?').run(shortTitle, conversationId);
    }

    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Models list
app.get('/api/models', (req, res) => {
  res.json({ models: getConfiguredModels() });
});

// ----------------- Start Server -----------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 CareerAI running at http://localhost:${PORT}`);
});