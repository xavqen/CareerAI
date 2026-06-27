import bcrypt from 'bcryptjs';
import { getDb, initDb } from '../../lib/db.js';
import { signToken } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  await initDb();
  try {
    const { name, email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const db = getDb();
    const existing = await db.execute({ sql: 'SELECT id FROM users WHERE email = ?', args: [email] });
    if (existing.rows.length > 0) return res.status(400).json({ error: 'Email already registered' });
    const hashed = await bcrypt.hash(password, 10);
    await db.execute({ sql: 'INSERT INTO users (name, email, password) VALUES (?, ?, ?)', args: [name, email, hashed] });
    const user = await db.execute({ sql: 'SELECT * FROM users WHERE email = ?', args: [email] });
    const u = user.rows[0];
    const isPremium = checkPremium(u.subscription_type, u.subscription_expiry);
    const token = signToken({ id: u.id, email: u.email, is_premium: isPremium });
    res.status(200).json({ token, user: { id: u.id, email: u.email, name: u.name, is_premium: isPremium, subscription_type: u.subscription_type, subscription_expiry: u.subscription_expiry } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
  }
}

function checkPremium(type, expiry) {
  if (!type || !expiry) return false;
  return new Date(expiry) > new Date();
}