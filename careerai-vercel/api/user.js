import { getDb, initDb } from '../lib/db.js';
import { authMiddleware } from '../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const userPayload = authMiddleware(req);
    await initDb();
    const db = getDb();
    const result = await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [userPayload.id] });
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    const isPremium = checkPremium(user.subscription_type, user.subscription_expiry);
    res.status(200).json({ id: user.id, email: user.email, name: user.name, is_premium: isPremium, subscription_type: user.subscription_type, subscription_expiry: user.subscription_expiry, avatar: user.avatar });
  } catch (err) {
    if (err.message === 'No token provided' || err.message === 'Invalid token') {
      return res.status(401).json({ error: err.message });
    }
    res.status(500).json({ error: 'Server error' });
  }
}

function checkPremium(type, expiry) {
  if (!type || !expiry) return false;
  return new Date(expiry) > new Date();
}