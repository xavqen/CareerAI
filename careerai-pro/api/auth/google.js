import { OAuth2Client } from 'google-auth-library';
import { getDb, initDb } from '../../lib/db.js';
import { generateTokens } from '../../lib/auth.js';
import { wrapHandler } from '../../middleware/error-handler.js';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export default wrapHandler(async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { credential } = req.body;
  if (!credential) return res.status(400).json({ error: 'Google credential required' });

  const ticket = await googleClient.verifyIdToken({
    idToken: credential,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  const { sub: googleId, email, name, picture } = payload;

  await initDb();
  const db = getDb();

  let userResult = await db.execute({
    sql: 'SELECT * FROM users WHERE google_id = ? OR email = ?',
    args: [googleId, email],
  });
  let user = userResult.rows[0];

  if (!user) {
    await db.execute({
      sql: 'INSERT INTO users (email, name, google_id, avatar, email_verified, role) VALUES (?, ?, ?, ?, 1, ?)',
      args: [email, name, googleId, picture, 'user'],
    });
    userResult = await db.execute({ sql: 'SELECT * FROM users WHERE google_id = ?', args: [googleId] });
    user = userResult.rows[0];
  } else if (!user.google_id) {
    await db.execute({
      sql: 'UPDATE users SET google_id = ?, avatar = ?, email_verified = 1 WHERE id = ?',
      args: [googleId, picture, user.id],
    });
    user = { ...user, google_id: googleId, avatar: picture, email_verified: 1 };
  }

  const isPremium = checkPremium(user.subscription_type, user.subscription_expiry);
  const { accessToken, refreshToken } = generateTokens({
    id: user.id,
    email: user.email,
    role: isPremium ? 'premium' : user.role,
  });

  await db.execute({
    sql: 'UPDATE users SET refresh_token = ? WHERE id = ?',
    args: [refreshToken, user.id],
  });

  res.status(200).json({
    success: true,
    data: {
      token: accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        role: isPremium ? 'premium' : user.role,
        is_premium: isPremium,
        subscription_type: user.subscription_type,
        subscription_expiry: user.subscription_expiry,
        email_verified: true,
      },
    },
  });
});

function checkPremium(type, expiry) {
  if (!type || !expiry) return false;
  return new Date(expiry) > new Date();
}