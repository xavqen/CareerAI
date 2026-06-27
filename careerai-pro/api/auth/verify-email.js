import { getDb, initDb } from '../../lib/db.js';
import { wrapHandler } from '../../middleware/error-handler.js';

export default wrapHandler(async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Verification token required' });

  await initDb();
  const db = getDb();

  const result = await db.execute({
    sql: 'SELECT * FROM users WHERE verification_token = ?',
    args: [token],
  });
  const user = result.rows[0];

  if (!user) {
    return res.status(400).json({ error: 'Invalid verification token' });
  }

  await db.execute({
    sql: 'UPDATE users SET email_verified = 1, verification_token = NULL WHERE id = ?',
    args: [user.id],
  });

  res.status(200).json({ success: true, message: 'Email verified successfully.' });
});