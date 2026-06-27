import bcrypt from 'bcryptjs';
import { db } from '../../lib/db.js';
import { generateTokens } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const { email, password } = req.body;
    const result = await db.execute({ sql: 'SELECT * FROM users WHERE email = ?', args: [email] });
    const user = result.rows[0];
    
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const { accessToken, refreshToken } = generateTokens(user.id, user.role);
    await db.execute({ sql: 'UPDATE users SET refresh_token = ? WHERE id = ?', args: [refreshToken, user.id] });

    res.status(200).json({ accessToken, refreshToken, user: { id: user.id, email: user.email, role: user.role } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}