import bcrypt from 'bcryptjs';
import { getDb, initDb } from '../../lib/db.js';
import { generateTokens } from '../../lib/auth.js';
import { loginSchema, validate } from '../../lib/validator.js';
import { authRateLimit } from '../../lib/rate-limiter.js';
import { wrapHandler } from '../../middleware/error-handler.js';

export default wrapHandler(async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  authRateLimit(req);

  const { valid, data, errors } = validate(loginSchema)(req.body);
  if (!valid) return res.status(400).json({ error: 'Validation failed', errors });

  await initDb();
  const db = getDb();

  const result = await db.execute({ sql: 'SELECT * FROM users WHERE email = ?', args: [data.email] });
  const user = result.rows[0];

  if (!user || !user.password) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const validPassword = await bcrypt.compare(data.password, user.password);
  if (!validPassword) {
    return res.status(401).json({ error: 'Invalid email or password' });
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
        email_verified: !!user.email_verified,
      },
    },
  });
});

function checkPremium(type, expiry) {
  if (!type || !expiry) return false;
  return new Date(expiry) > new Date();
}