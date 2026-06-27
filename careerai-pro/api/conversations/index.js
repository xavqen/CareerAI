import { getDb, initDb } from '../../lib/db.js';
import { authenticate } from '../../middleware/auth.js';
import { wrapHandler } from '../../middleware/error-handler.js';

export default wrapHandler(async function handler(req, res) {
  const user = await authenticate(req);
  await initDb();
  const db = getDb();

  if (req.method === 'GET') {
    const { page = 1, limit = 20, search = '', sort = 'updated_at', order = 'DESC' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const searchClause = search ? 'AND c.title LIKE ?' : '';
    const searchParam = search ? `%${search}%` : '';

    const countResult = await db.execute({
      sql: `SELECT COUNT(*) as total FROM conversations c WHERE c.user_id = ? ${searchClause}`,
      args: search ? [user.id, searchParam] : [user.id],
    });
    const total = countResult.rows[0].total;

    const rows = await db.execute({
      sql: `SELECT c.*, 
            (SELECT m.content FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) as lastMessage,
            (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) as messageCount
            FROM conversations c 
            WHERE c.user_id = ? ${searchClause}
            ORDER BY c.${sort === 'title' ? 'title' : 'updated_at'} ${order === 'ASC' ? 'ASC' : 'DESC'}
            LIMIT ? OFFSET ?`,
      args: search ? [user.id, searchParam, parseInt(limit), offset] : [user.id, parseInt(limit), offset],
    });

    res.status(200).json({
      success: true,
      data: rows.rows,
      meta: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
        hasMore: offset + parseInt(limit) < total,
      },
    });
  } else if (req.method === 'POST') {
    const { title, model } = req.body;
    const result = await db.execute({
      sql: 'INSERT INTO conversations (user_id, title, model) VALUES (?, ?, ?)',
      args: [user.id, title || 'New Chat', model || 'gemini-2.0-flash'],
    });
    res.status(201).json({
      success: true,
      data: { id: Number(result.lastInsertRowid), title: title || 'New Chat' },
    });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
});