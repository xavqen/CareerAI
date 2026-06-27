import { getDb, initDb } from '../lib/db.js';
import { authMiddleware } from '../lib/auth.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { OpenAI } from 'openai';

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

async function checkDailyLimit(userId) {
  const db = getDb();
  const user = await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [userId] });
  const u = user.rows[0];
  if (!u) return false;
  if (u.subscription_type && u.subscription_expiry && new Date(u.subscription_expiry) > new Date()) return true;
  const today = new Date().toISOString().slice(0, 10);
  const row = await db.execute({ sql: 'SELECT message_count FROM daily_usage WHERE user_id = ? AND date = ?', args: [userId, today] });
  const count = row.rows[0]?.message_count || 0;
  return count < 20;
}

async function incrementUsage(userId) {
  const today = new Date().toISOString().slice(0, 10);
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO daily_usage (user_id, date, message_count) VALUES (?, ?, 1)
          ON CONFLICT(user_id, date) DO UPDATE SET message_count = message_count + 1`,
    args: [userId, today]
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const user = authMiddleware(req);
    const { conversationId, model, provider, message } = req.body;
    if (!conversationId || !model || !provider || !message) return res.status(400).json({ error: 'Missing fields' });
    await initDb();
    const db = getDb();
    const conv = await db.execute({ sql: 'SELECT * FROM conversations WHERE id = ? AND user_id = ?', args: [conversationId, user.id] });
    if (conv.rows.length === 0) return res.status(403).json({ error: 'Conversation not yours' });
    const canSend = await checkDailyLimit(user.id);
    if (!canSend) return res.status(429).json({ error: 'Daily limit reached. Upgrade to Premium for unlimited messages.' });
    const history = await db.execute({ sql: 'SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY id ASC', args: [conversationId] });
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history.rows.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: message }
    ];
    await db.execute({ sql: 'INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)', args: [conversationId, 'user', message] });
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
    await db.execute({ sql: 'INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)', args: [conversationId, 'ai', reply] });
    await incrementUsage(user.id);
    if (history.rows.length === 0) {
      const shortTitle = message.substring(0, 40) + (message.length > 40 ? '...' : '');
      await db.execute({ sql: 'UPDATE conversations SET title = ? WHERE id = ?', args: [shortTitle, conversationId] });
    }
    res.status(200).json({ reply });
  } catch (err) {
    if (err.message === 'No token provided' || err.message === 'Invalid token') return res.status(401).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}