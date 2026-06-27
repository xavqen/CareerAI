import { getDb, initDb } from '../lib/db.js';
import { authenticate, requirePremium } from '../middleware/auth.js';
import { chatSchema, validate } from '../lib/validator.js';
import { callGemini } from '../lib/gemini.js';
import { callGrok } from '../lib/grok.js';
import { apiRateLimit } from '../lib/rate-limiter.js';
import { wrapHandler } from '../middleware/error-handler.js';

const SYSTEM_PROMPT = `You are a futuristic career coach AI. Reply in **concise, scannable bullet points** with **minimal text**. Use **text‑based flowcharts** (arrows →, emojis) to show career paths. Include:
- 🔥 Estimated **salary range** (₹ or $)
- ⏳ **Minimum study/training time** to get a job
- 💡 Interesting facts or hidden opportunities
- 🎯 After EVERY message, ask **1 engaging question** to keep the conversation going.`;

async function checkDailyLimit(userId) {
  const db = getDb();
  const user = await db.execute({
    sql: 'SELECT subscription_type, subscription_expiry, role FROM users WHERE id = ?',
    args: [userId],
  });
  const u = user.rows[0];
  if (!u) return false;
  if (u.role === 'admin') return true;
  if (u.subscription_type && u.subscription_expiry && new Date(u.subscription_expiry) > new Date()) return true;

  const today = new Date().toISOString().slice(0, 10);
  const row = await db.execute({
    sql: 'SELECT message_count FROM daily_usage WHERE user_id = ? AND date = ?',
    args: [userId, today],
  });
  const count = row.rows[0]?.message_count || 0;
  return count < 20;
}

async function incrementUsage(userId, tokenCount) {
  const today = new Date().toISOString().slice(0, 10);
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO daily_usage (user_id, date, message_count, token_count) VALUES (?, ?, 1, ?)
          ON CONFLICT(user_id, date) DO UPDATE SET message_count = message_count + 1, token_count = token_count + ?`,
    args: [userId, tokenCount, tokenCount],
  });
}

export default wrapHandler(async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  apiRateLimit(req);
  const user = await authenticate(req);

  const { valid, data, errors } = validate(chatSchema)(req.body);
  if (!valid) return res.status(400).json({ error: 'Validation failed', errors });

  await initDb();
  const db = getDb();

  const conv = await db.execute({
    sql: 'SELECT * FROM conversations WHERE id = ? AND user_id = ?',
    args: [data.conversationId, user.id],
  });
  if (conv.rows.length === 0) return res.status(403).json({ error: 'Conversation not yours' });

  const canSend = await checkDailyLimit(user.id);
  if (!canSend) {
    return res.status(429).json({
      error: 'Daily limit reached. Upgrade to Premium for unlimited messages.',
      code: 'DAILY_LIMIT_REACHED',
    });
  }

  const history = await db.execute({
    sql: 'SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY id ASC',
    args: [data.conversationId],
  });

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.rows.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: data.message },
  ];

  await db.execute({
    sql: 'INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)',
    args: [data.conversationId, 'user', data.message],
  });

  let reply;
  if (data.provider === 'gemini') {
    reply = await callGemini(data.model, messages);
  } else if (data.provider === 'grok') {
    reply = await callGrok(data.model, messages);
  } else {
    return res.status(400).json({ error: 'Unsupported provider' });
  }

  const tokenCount = Math.ceil(reply.length / 4) + Math.ceil(data.message.length / 4);
  await db.execute({
    sql: 'INSERT INTO messages (conversation_id, role, content, token_count) VALUES (?, ?, ?, ?)',
    args: [data.conversationId, 'ai', reply, tokenCount],
  });

  await incrementUsage(user.id, tokenCount);

  if (history.rows.length === 0) {
    const shortTitle = data.message.substring(0, 40) + (data.message.length > 40 ? '...' : '');
    await db.execute({
      sql: 'UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?',
      args: [shortTitle, new Date().toISOString(), data.conversationId],
    });
  } else {
    await db.execute({
      sql: 'UPDATE conversations SET updated_at = ? WHERE id = ?',
      args: [new Date().toISOString(), data.conversationId],
    });
  }

  res.status(200).json({ success: true, data: { reply, tokenCount } });
});