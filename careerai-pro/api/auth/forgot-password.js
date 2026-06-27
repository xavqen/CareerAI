import { getDb, initDb } from '../../lib/db.js';
import { generateResetToken } from '../../lib/auth.js';
import { sendPasswordResetEmail } from '../../lib/email.js';
import { forgotPasswordSchema, validate } from '../../lib/validator.js';
import { authRateLimit } from '../../lib/rate-limiter.js';
import { wrapHandler } from '../../middleware/error-handler.js';

export default wrapHandler(async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  authRateLimit(req);

  const { valid, data, errors } = validate(forgotPasswordSchema)(req.body);
  if (!valid) return res.status(400).json({ error: 'Validation failed', errors });

  await initDb();
  const db = getDb();

  const result = await db.execute({ sql: 'SELECT * FROM users WHERE email = ?', args: [data.email] });
  const user = result.rows[0];

  // Always return success to prevent email enumeration
  if (!user) {
    return res.status(200).json({ success: true, message: 'If the email exists, a reset link has been sent.' });
  }

  const resetToken = generateResetToken();
  const expiry = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

  await db.execute({
    sql: 'UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE id = ?',
    args: [resetToken, expiry, user.id],
  });

  try {
    await sendPasswordResetEmail(user.email, user.name, resetToken);
  } catch (emailErr) {
    console.error('Failed to send reset email:', emailErr.message);
  }

  res.status(200).json({ success: true, message: 'If the email exists, a reset link has been sent.' });
});