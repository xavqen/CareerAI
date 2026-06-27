import { getDb, initDb } from '../../../lib/db.js';
import { authenticate } from '../../../middleware/auth.js';
import { wrapHandler } from '../../../middleware/error-handler.js';

export default wrapHandler(async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Conversation ID required' });

  await initDb();
  const db = getDb();

  const conv = await db.execute({
    sql: 'SELECT * FROM conversations WHERE id = ? AND user_id = ?',
    args: [id, user.id],
  });
  if (conv.rows.length === 0) return res.status(404).json({ error: 'Conversation not found' });

  const messages = await db.execute({
    sql: 'SELECT role, content, token_count, timestamp FROM messages WHERE conversation_id = ? ORDER BY id ASC',
    args: [id],
  });

  res.status(200).json({ success: true, data: messages.rows });
});