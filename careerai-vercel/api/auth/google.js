import { OAuth2Client } from 'google-auth-library';
import { getDb, initDb } from '../../lib/db.js';
import { signToken } from '../../lib/auth.js';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  await initDb();
  try {
    const { credential } = req.body;
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: process.env.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;
    const db = getDb();
    let user = await db.execute({ sql: 'SELECT * FROM users WHERE google_id = ? OR email = ?', args: [googleId, email] });
    let u = user.rows[0];
    if (!u) {
      await db.execute({ sql: 'INSERT INTO users (email, name, google_id, avatar) VALUES (?, ?, ?, ?)', args: [email, name, googleId, picture] });
      user = await db.execute({ sql: 'SELECT * FROM users WHERE google_id = ?', args: [googleId] });
      u = user.rows[0];
    } else if (!u.google_id) {
      await db.execute({ sql: 'UPDATE users SET google_id = ?, avatar = ? WHERE id = ?', args: [googleId, picture, u.id] });
      u = { ...u, google_id: googleId, avatar: picture };
    }
    const isPremium = checkPremium(u.subscription_type, u.subscription_expiry);
    const token = signToken({ id: u.id, email: u.email, is_premium: isPremium });
    res.status(200).json({ token, user: { id: u.id, email: u.email, name: u.name, is_premium: isPremium, subscription_type: u.subscription_type, subscription_expiry: u.subscription_expiry, avatar: u.avatar } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Google authentication failed' });
  }
}

function checkPremium(type, expiry) {
  if (!type || !expiry) return false;
  return new Date(expiry) > new Date();
}