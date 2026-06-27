import Razorpay from 'razorpay';
import { getDb, initDb } from '../../lib/db.js';
import { authMiddleware } from '../../lib/auth.js';

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

const PRICES = { daily: 9, monthly: 49, yearly: 99 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const user = authMiddleware(req);
    const { plan } = req.body;
    if (!['daily', 'monthly', 'yearly'].includes(plan)) return res.status(400).json({ error: 'Invalid plan' });
    const amountINR = PRICES[plan];
    const amountPaise = amountINR * 100;
    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: `rcpt_${user.id}_${Date.now()}`,
      notes: { userId: user.id, plan }
    });
    await initDb();
    const db = getDb();
    await db.execute({ sql: 'INSERT INTO razorpay_orders (order_id, user_id, amount, currency, plan, status) VALUES (?, ?, ?, ?, ?, ?)', args: [order.id, user.id, order.amount / 100, order.currency, plan, 'created'] });
    res.status(200).json({ orderId: order.id, amount: order.amount, currency: order.currency, key: process.env.RAZORPAY_KEY_ID });
  } catch (err) {
    if (err.message === 'No token provided' || err.message === 'Invalid token') return res.status(401).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Order creation failed' });
  }
}