import crypto from 'crypto';
import { getDb, initDb } from '../../lib/db.js';
import { authenticate } from '../../middleware/auth.js';
import { generateTokens } from '../../lib/auth.js';
import { calculateExpiry } from '../../lib/razorpay.js';
import { wrapHandler } from '../../middleware/error-handler.js';

export default wrapHandler(async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing payment verification data' });
  }

  const sign = razorpay_order_id + '|' + razorpay_payment_id;
  const expectedSign = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(sign)
    .digest('hex');

  if (expectedSign !== razorpay_signature) {
    return res.status(400).json({ error: 'Payment verification failed' });
  }

  await initDb();
  const db = getDb();

  const orderResult = await db.execute({
    sql: 'SELECT * FROM razorpay_orders WHERE order_id = ?',
    args: [razorpay_order_id],
  });
  const order = orderResult.rows[0];
  if (!order) return res.status(404).json({ error: 'Order not found' });

  // Duplicate payment protection
  if (order.status === 'paid') {
    return res.status(200).json({ success: true, message: 'Payment already processed' });
  }

  const expiry = calculateExpiry(order.plan);

  await db.execute({
    sql: 'UPDATE razorpay_orders SET status = ?, payment_id = ? WHERE order_id = ?',
    args: ['paid', razorpay_payment_id, razorpay_order_id],
  });

  await db.execute({
    sql: 'UPDATE users SET subscription_type = ?, subscription_expiry = ?, role = ? WHERE id = ?',
    args: [order.plan, expiry, 'premium', user.id],
  });

  // Record payment history
  await db.execute({
    sql: 'INSERT INTO payment_history (user_id, amount, currency, plan, status, order_id, payment_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
    args: [user.id, order.amount, order.currency, order.plan, 'paid', razorpay_order_id, razorpay_payment_id],
  });

  const { accessToken, refreshToken } = generateTokens({
    id: user.id,
    email: user.email,
    role: 'premium',
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
      is_premium: true,
      subscription_type: order.plan,
      subscription_expiry: expiry,
    },
  });
});