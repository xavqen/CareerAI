import { db } from '../lib/db.js';
import { withAuth } from '../lib/auth.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const SYSTEM_PROMPT = `You are My Career Guide AI. Your goal is to provide exceptional, professional career coaching. Follow these structural layout rules exactly:
1. Break down complex career trajectories into clear headings with extensive line spacing between conceptual steps.
2. Structure the career roadmap as an elegant, vertical visual flowchart using clear unicode arrows (➔, ⬇) and structural bullet emojis.
3. Your responses must always include these core fields:
   - 🗺️ THE DEFINITIVE CAREER PATHWAY (Rendered as a step-by-step vertical text flowchart)
   - 📈 SECTOR DEMAND & TRAINING HORIZON (Time commitment needed)
   - 💰 REMUNERATION BRACKETS (Clear ₹ or $ salary structures)
   - 💡 INSIDER INTEL (1 short, high-value strategy fact)
4. Wrap sequential roadmap stages inside distinctive blockquotes or clear structural highlights.
5. Conclude your entire message with EXACTLY ONE highly specific, thought-provoking question to steer the next stage of their discovery.`;

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { userId } = req.user;
  const { conversationId, message } = req.body;

  // Initialize standard text-streaming headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const today = new Date().toISOString().split('T')[0];
    const usageRes = await db.execute({ sql: 'SELECT count FROM daily_usage WHERE user_id = ? AND date = ?', args: [userId, today] });
    let count = usageRes.rows[0]?.count || 0;

    const userRes = await db.execute({ sql: 'SELECT role, plan_expiry FROM users WHERE id = ?', args: [userId] });
    const user = userRes.rows[0];
    const isPremium = user.role === 'premium' && new Date(user.plan_expiry) > new Date();

    if (!isPremium && count >= 20) {
      res.write(`data: ${JSON.stringify({ error: 'Daily message limit reached. Upgrade to Premium for continuous streaming access.' })}\n\n`);
      return res.end();
    }

    // Save user prompt history
    await db.execute({
      sql: 'INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?)',
      args: [crypto.randomUUID(), conversationId, 'user', message]
    });

    // Enforce high-performance gemini-2.5-flash for both tiers
    const aiModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', systemInstruction: SYSTEM_PROMPT });
    const result = await aiModel.generateContentStream(message);

    let completeAIOutput = "";
    for await (const chunk of result.stream) {
      const textChunk = chunk.text();
      completeAIOutput += textChunk;
      res.write(`data: ${JSON.stringify({ text: textChunk })}\n\n`);
    }

    // Save final output back to database storage
    await db.execute({
      sql: 'INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?)',
      args: [crypto.randomUUID(), conversationId, 'assistant', completeAIOutput]
    });

    if (!isPremium) {
      await db.execute({
        sql: `INSERT INTO daily_usage (user_id, date, count) VALUES (?, ?, 1)
              ON CONFLICT(user_id, date) DO UPDATE SET count = count + 1`,
        args: [userId, today]
      });
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
}

export default withAuth(handler);