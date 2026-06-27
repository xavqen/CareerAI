import { getDb, initDb } from '../../lib/db.js';
import { authenticate } from '../../middleware/auth.js';
import { wrapHandler } from '../../middleware/error-handler.js';

export default wrapHandler(async function handler(req, res) {
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

  if (req.method === 'GET') {
    res.status(200).json({ success: true, data: conv.rows[0] });
  } else if (req.method === 'PUT') {
    const { title, pinned } = req.body;
    await db.execute({
      sql: 'UPDATE conversations SET title = COALESCE(?, title), pinned = COALESCE(?, pinned), updated_at = ? WHERE id = ?',
      args: [title, pinned, new Date().toISOString(), id],
    });
    res.status(200).json({ success: true, message: 'Conversation updated' });
  } else if (req.method === 'DELETE') {
    await db.execute({ sql: 'DELETE FROM messages WHERE conversation_id = ?', args: [id] });
    await db.execute({ sql: 'DELETE FROM conversations WHERE id = ?', args: [id] });
    res.status(200).json({ success: true, message: 'Conversation deleted' });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
});