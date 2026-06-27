import { getDb, initDb } from '../../lib/db.js';
import { authMiddleware } from '../../lib/auth.js';

export default async function handler(req, res) {
  try {
    const user = authMiddleware(req);
    if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });
    const { id } = req.query;
    await initDb();
    const db = getDb();
    const conv = await db.execute({ sql: 'SELECT * FROM conversations WHERE id = ? AND user_id = ?', args: [id, user.id] });
    if (conv.rows.length === 0) return res.status(404).json({ error: 'Conversation not found' });
    await db.execute({ sql: 'DELETE FROM messages WHERE conversation_id = ?', args: [id] });
    await db.execute({ sql: 'DELETE FROM conversations WHERE id = ?', args: [id] });
    res.status(200).json({ success: true });
  } catch (err) {
    if (err.message === 'No token provided' || err.message === 'Invalid token') return res.status(401).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
}