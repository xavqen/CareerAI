import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '../../lib/db.js';
import { generateTokens } from '../../lib/auth.js';

const schema = z.object({
  email: z.string().email({ message: "Invalid email address" }),
  password: z.string().regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/, { 
    message: "Password must be 8+ chars and include uppercase, lowercase, number, and special character." 
  })
});

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const { email, password } = schema.parse(req.body);
    const existing = await db.execute({ sql: 'SELECT id FROM users WHERE email = ?', args: [email] });
    if (existing.rows.length > 0) return res.status(400).json({ error: 'Email already exists' });

    const hash = await bcrypt.hash(password, 12);
    const userId = crypto.randomUUID();
    const { accessToken, refreshToken } = generateTokens(userId, 'free');

    await db.execute({
      sql: 'INSERT INTO users (id, email, password_hash, refresh_token) VALUES (?, ?, ?, ?)',
      args: [userId, email, hash, refreshToken]
    });

    res.status(200).json({ accessToken, refreshToken, user: { id: userId, email, role: 'free' } });
  } catch (e) {
    // Safely extract the first error message to prevent [object Object] on the frontend
    const errorMsg = e.errors ? e.errors[0].message : e.message;
    res.status(400).json({ error: errorMsg });
  }
}