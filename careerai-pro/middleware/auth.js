import { verifyAccessToken } from '../lib/auth.js';
import { getDb } from '../lib/db.js';

export async function authenticate(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw { status: 401, message: 'Authentication required' };
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = verifyAccessToken(token);
    const db = getDb();
    const result = await db.execute({
      sql: 'SELECT id, email, name, role, subscription_type, subscription_expiry, avatar FROM users WHERE id = ?',
      args: [decoded.id],
    });
    if (result.rows.length === 0) {
      throw { status: 401, message: 'User not found' };
    }
    const user = result.rows[0];
    const isPremium = checkPremium(user.subscription_type, user.subscription_expiry);
    return { ...user, is_premium: isPremium || user.role === 'premium' || user.role === 'admin' };
  } catch (err) {
    if (err.status) throw err;
    throw { status: 401, message: 'Invalid or expired token' };
  }
}

export function requireRole(...roles) {
  return (user) => {
    if (!roles.includes(user.role)) {
      throw { status: 403, message: 'Insufficient permissions' };
    }
    return user;
  };
}

export function requirePremium(user) {
  if (!user.is_premium && user.role !== 'admin') {
    throw { status: 403, message: 'Premium subscription required' };
  }
  return user;
}

function checkPremium(type, expiry) {
  if (!type || !expiry) return false;
  return new Date(expiry) > new Date();
}