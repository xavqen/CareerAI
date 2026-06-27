import { db } from '../../lib/db.js';
import { withAuth } from '../../lib/auth.js';

async function handler(req, res) {
  const { userId } = req.user;

  if (req.method === 'GET') {
    const result = await db.execute({
      sql: 'SELECT * FROM conversations WHERE user_id = ? ORDER BY is_pinned DESC, created_at DESC',
      args: [userId]
    });
    return res.status(200).json(result.rows);
  }

  if (req.method === 'POST') {
    const { title } = req.body;
    const id = crypto.randomUUID();
    await db.execute({
      sql: 'INSERT INTO conversations (id, user_id, title) VALUES (?, ?, ?)',
      args: [id, userId, title || 'New Conversation']
    });
    return res.status(200).json({ id, title });
  }

  res.status(405).end();
}

export default withAuth(handler);