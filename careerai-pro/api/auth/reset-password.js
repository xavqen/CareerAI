import bcrypt from 'bcryptjs';
import { getDb, initDb } from '../../lib/db.js';
import { resetPasswordSchema, validate } from '../../lib/validator.js';
import { wrapHandler } from '../../middleware/error-handler.js';

export default wrapHandler(async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { valid, data, errors } = validate(resetPasswordSchema)(req.body);
  if (!valid) return res.status(400).json({ error: 'Validation failed', errors });

  await initDb();
  const db = getDb();

  const result = await db.execute({
    sql: 'SELECT * FROM users WHERE reset_token = ? AND reset_token_expiry > ?',
    args: [data.token, new Date().toISOString()],
  });
  const user = result.rows[0];

  if (!user) {
    return res.status(400).json({ error: 'Invalid or expired reset token' });
  }

  const hashed = await bcrypt.hash(data.password, 12);

  await db.execute({
    sql: 'UPDATE users SET password = ?, reset_token = NULL, reset_token_expiry = NULL WHERE id = ?',
    args: [hashed, user.id],
  });

  res.status(200).json({ success: true, message: 'Password has been reset successfully.' });
});