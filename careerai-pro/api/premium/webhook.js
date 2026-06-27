import crypto from 'crypto';
import { getDb, initDb } from '../../lib/db.js';
import { calculateExpiry } from '../../lib/razorpay.js';
import { wrapHandler } from '../../middleware/error-handler.js';

export default wrapHandler(async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) return res.status(500).json({ error: 'Webhook secret not configured' });

  const signature = req.headers['x-razorpay-signature'];
  const body = JSON.stringify(req.body);

  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(body)
    .digest('hex');

  if (signature !== expectedSignature) {
    return res.status(400).json({ error: 'Invalid webhook signature' });
  }

  const event = req.body.event;
  if (event !== 'payment.captured') {
    return res.status(200).json({ received: true });
  }

  const payment = req.body.payload.payment.entity;
  const notes = payment.notes || {};
  const userId = parseInt(notes.userId);
  const plan = notes.plan;

  if (!userId || !plan) return res.status(200).json({ received: true });

  await initDb();
  const db = getDb();

  const orderResult = await db.execute({
    sql: 'SELECT * FROM razorpay_orders WHERE order_id = ?',
    args: [payment.order_id],
  });

  if (orderResult.rows.length === 0) {
    await db.execute({
      sql: 'INSERT INTO razorpay_orders (order_id, user_id, amount, currency, plan, status, payment_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [payment.order_id, userId, payment.amount / 100, payment.currency, plan, 'paid', payment.id],
    });
  } else {
    await db.execute({
      sql: 'UPDATE razorpay_orders SET status = ?, payment_id = ? WHERE order_id = ?',
      args: ['paid', payment.id, payment.order_id],
    });
  }

  const expiry = calculateExpiry(plan);
  await db.execute({
    sql: 'UPDATE users SET subscription_type = ?, subscription_expiry = ?, role = ? WHERE id = ?',
    args: [plan, expiry, 'premium', userId],
  });

  await db.execute({
    sql: 'INSERT INTO payment_history (user_id, amount, currency, plan, status, order_id, payment_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
    args: [userId, payment.amount / 100, payment.currency, plan, 'paid', payment.order_id, payment.id],
  });

  res.status(200).json({ received: true });
});