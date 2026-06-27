import bcrypt from 'bcryptjs';
import { getDb, initDb } from '../../lib/db.js';
import { signToken } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  await initDb();
  try {
    const { email, password } = req.body;
    const db = getDb();
    const result = await db.execute({ sql: 'SELECT * FROM users WHERE email = ?', args: [email] });
    const user = result.rows[0];
    if (!user || !user.password) return res.status(400).json({ error: 'Invalid credentials' });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ error: 'Invalid credentials' });
    const isPremium = checkPremium(user.subscription_type, user.subscription_expiry);
    const token = signToken({ id: user.id, email: user.email, is_premium: isPremium });
    res.status(200).json({ token, user: { id: user.id, email: user.email, name: user.name, is_premium: isPremium, subscription_type: user.subscription_type, subscription_expiry: user.subscription_expiry } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
}

function checkPremium(type, expiry) {
  if (!type || !expiry) return false;
  return new Date(expiry) > new Date();
}