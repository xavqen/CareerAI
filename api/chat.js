import { db } from '../lib/db.js';
import { withAuth } from '../lib/auth.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const SYSTEM_PROMPT = `You are My Career Guide AI. Follow these exact rules:
1. Use concise, scannable bullet points.
2. Include text-based flowcharts using arrows (->) and emojis for career/skill paths.
3. ALWAYS provide estimated salary ranges (in ₹ or $) and minimum study/training time to land the job.
4. Include 1 short interesting fact related to the field.
5. End your response with EXACTLY ONE engaging follow-up question.
Format entirely in Markdown.`;

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { userId, role } = req.user;
  const { conversationId, message, model = 'gemini-2.5-flash' } = req.body;

  try {
    // Usage Check
    const today = new Date().toISOString().split('T')[0];
    const usageRes = await db.execute({ sql: 'SELECT count FROM daily_usage WHERE user_id = ? AND date = ?', args: [userId, today] });
    let count = usageRes.rows[0]?.count || 0;

    const userRes = await db.execute({ sql: 'SELECT role, plan_expiry FROM users WHERE id = ?', args: [userId] });
    const user = userRes.rows[0];
    const isPremium = user.role === 'premium' && new Date(user.plan_expiry) > new Date();

    if (!isPremium && count >= 20) {
      return res.status(403).json({ error: 'Daily limit reached. Please upgrade to premium.' });
    }

    // Save User Message
    const msgId = crypto.randomUUID();
    await db.execute({
      sql: 'INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?)',
      args: [msgId, conversationId, 'user', message]
    });

    // Generate AI Response
    const aiModel = genAI.getGenerativeModel({ model, systemInstruction: SYSTEM_PROMPT });
    const result = await aiModel.generateContent(message);
    const aiText = result.response.text();

    // Save AI Message
    const aiMsgId = crypto.randomUUID();
    await db.execute({
      sql: 'INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?)',
      args: [aiMsgId, conversationId, 'assistant', aiText]
    });

    // Update Usage
    if (!isPremium) {
      await db.execute({
        sql: `INSERT INTO daily_usage (user_id, date, count) VALUES (?, ?, 1)
              ON CONFLICT(user_id, date) DO UPDATE SET count = count + 1`,
        args: [userId, today]
      });
    }

    res.status(200).json({ id: aiMsgId, content: aiText });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

export default withAuth(handler);