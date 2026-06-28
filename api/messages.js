import { db } from '../lib/db.js';
import { withAuth } from '../lib/auth.js';

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  
  const { convId } = req.query;
  if (!convId) return res.status(400).json({ error: 'Conversation ID required' });

  try {
    const result = await db.execute({
      sql: 'SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
      args: [convId]
    });
    res.status(200).json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

export default withAuth(handler);