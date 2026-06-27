import { OAuth2Client } from 'google-auth-library';
import { db } from '../../lib/db.js';
import { generateTokens } from '../../lib/auth.js';

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  
  try {
    const { credential } = req.body;
    
    if (!credential) {
      return res.status(400).json({ error: 'Missing Google credential' });
    }

    // Verify Google ID Token
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    
    const payload = ticket.getPayload();
    
    // Safely extract email
    if (!payload || !payload.email) {
      return res.status(400).json({ error: 'Could not extract email from Google' });
    }
    const userEmail = payload.email;

    // Check if user already exists in Turso
    const result = await db.execute({ sql: 'SELECT * FROM users WHERE email = ?', args: [userEmail] });
    let user = result.rows[0];

    if (!user) {
      // Auto-register the user if they don't exist
      const userId = crypto.randomUUID();
      const { refreshToken } = generateTokens(userId, 'free');
      
      await db.execute({
        sql: 'INSERT INTO users (id, email, role, refresh_token) VALUES (?, ?, ?, ?)',
        args: [userId, userEmail, 'free', refreshToken]
      });
      user = { id: userId, email: userEmail, role: 'free' };
    }

    // Generate fresh tokens
    const { accessToken, refreshToken } = generateTokens(user.id, user.role || 'free');
    await db.execute({ sql: 'UPDATE users SET refresh_token = ? WHERE id = ?', args: [refreshToken, user.id] });

    res.status(200).json({ accessToken, refreshToken, user: { id: user.id, email: user.email, role: user.role } });
  } catch (e) {
    // If Turso throws a 401 Auth error during Google Login, this will safely catch it!
    const errorMsg = e.message || 'Google authentication failed';
    res.status(400).json({ error: errorMsg });
  }
}