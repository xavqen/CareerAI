import crypto from 'crypto';
import { getDb, initDb } from '../../lib/db.js';
import { authMiddleware, signToken } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const user = authMiddleware(req);
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const sign = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSign = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(sign).digest('hex');
    if (expectedSign !== razorpay_signature) return res.status(400).json({ error: 'Payment verification failed' });
    await initDb();
    const db = getDb();
    const orderResult = await db.execute({ sql: 'SELECT * FROM razorpay_orders WHERE order_id = ?', args: [razorpay_order_id] });
    const order = orderResult.rows[0];
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const now = new Date();
    let expiry;
    const plan = order.plan;
    if (plan === 'daily') expiry = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    else if (plan === 'monthly') expiry = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
    else expiry = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
    await db.execute({ sql: 'UPDATE razorpay_orders SET status = ? WHERE order_id = ?', args: ['paid', razorpay_order_id] });
    await db.execute({ sql: 'UPDATE users SET subscription_type = ?, subscription_expiry = ? WHERE id = ?', args: [plan, expiry.toISOString(), user.id] });
    const updatedUser = await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [user.id] });
    const u = updatedUser.rows[0];
    const isPremium = checkPremium(u.subscription_type, u.subscription_expiry);
    const newToken = signToken({ id: u.id, email: u.email, is_premium: isPremium });
    res.status(200).json({ token: newToken, is_premium: isPremium, subscription_type: u.subscription_type, subscription_expiry: u.subscription_expiry });
  } catch (err) {
    if (err.message === 'No token provided' || err.message === 'Invalid token') return res.status(401).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Verification failed' });
  }
}

function checkPremium(type, expiry) {
  if (!type || !expiry) return false;
  return new Date(expiry) > new Date();
}