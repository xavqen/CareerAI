import bcrypt from 'bcryptjs';
import { getDb, initDb } from '../../lib/db.js';
import { generateTokens, generateVerificationToken } from '../../lib/auth.js';
import { sendVerificationEmail } from '../../lib/email.js';
import { registerSchema, validate } from '../../lib/validator.js';
import { authRateLimit } from '../../lib/rate-limiter.js';
import { wrapHandler } from '../../middleware/error-handler.js';

export default wrapHandler(async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  authRateLimit(req);

  const { valid, data, errors } = validate(registerSchema)(req.body);
  if (!valid) return res.status(400).json({ error: 'Validation failed', errors });

  await initDb();
  const db = getDb();

  const existing = await db.execute({ sql: 'SELECT id FROM users WHERE email = ?', args: [data.email] });
  if (existing.rows.length > 0) {
    return res.status(409).json({ error: 'Email already registered' });
  }

  const hashed = await bcrypt.hash(data.password, 12);
  const verificationToken = generateVerificationToken();

  await db.execute({
    sql: 'INSERT INTO users (name, email, password, verification_token, role) VALUES (?, ?, ?, ?, ?)',
    args: [data.name, data.email, hashed, verificationToken, 'user'],
  });

  const userResult = await db.execute({ sql: 'SELECT * FROM users WHERE email = ?', args: [data.email] });
  const user = userResult.rows[0];

  const { accessToken, refreshToken } = generateTokens({
    id: user.id,
    email: user.email,
    role: user.role,
  });

  await db.execute({
    sql: 'UPDATE users SET refresh_token = ? WHERE id = ?',
    args: [refreshToken, user.id],
  });

  // Try to send verification email (non-blocking)
  try {
    await sendVerificationEmail(user.email, user.name, verificationToken);
  } catch (emailErr) {
    console.error('Failed to send verification email:', emailErr.message);
  }

  res.status(201).json({
    success: true,
    data: {
      token: accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        is_premium: false,
        email_verified: false,
      },
    },
  });
});