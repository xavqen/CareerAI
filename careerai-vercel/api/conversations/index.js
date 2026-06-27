import { getDb, initDb } from '../../lib/db.js';
import { authMiddleware } from '../../lib/auth.js';

export default async function handler(req, res) {
  try {
    const user = authMiddleware(req);
    await initDb();
    const db = getDb();
    if (req.method === 'GET') {
      const rows = await db.execute({
        sql: `SELECT c.*, 
              (SELECT m.content FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) as lastMessage
              FROM conversations c WHERE c.user_id = ? ORDER BY c.created_at DESC`,
        args: [user.id]
      });
      return res.status(200).json(rows.rows);
    } else if (req.method === 'POST') {
      const { title, model } = req.body;
      const result = await db.execute({
        sql: 'INSERT INTO conversations (user_id, title, model) VALUES (?, ?, ?)',
        args: [user.id, title || 'New Chat', model || 'gemini-2.0-flash']
      });
      return res.status(200).json({ id: Number(result.lastInsertRowid) });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    if (err.message === 'No token provided' || err.message === 'Invalid token') return res.status(401).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
}