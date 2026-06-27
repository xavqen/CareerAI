import { getDb, initDb } from '../lib/db.js';
import { authenticate } from '../middleware/auth.js';
import { wrapHandler } from '../middleware/error-handler.js';

export default wrapHandler(async function handler(req, res) {
  if (req.method === 'GET') {
    const user = await authenticate(req);
    res.status(200).json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        role: user.role,
        is_premium: user.is_premium,
        subscription_type: user.subscription_type,
        subscription_expiry: user.subscription_expiry,
      },
    });
  } else if (req.method === 'PUT') {
    const user = await authenticate(req);
    const { name } = req.body;
    await initDb();
    const db = getDb();
    await db.execute({ sql: 'UPDATE users SET name = ?, updated_at = ? WHERE id = ?', args: [name, new Date().toISOString(), user.id] });
    res.status(200).json({ success: true, message: 'Profile updated' });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
});