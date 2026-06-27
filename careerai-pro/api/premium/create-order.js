import { getDb, initDb } from '../../lib/db.js';
import { authenticate, requirePremium } from '../../middleware/auth.js';
import { getRazorpay, PLAN_PRICES } from '../../lib/razorpay.js';
import { premiumOrderSchema, validate } from '../../lib/validator.js';
import { wrapHandler } from '../../middleware/error-handler.js';

export default wrapHandler(async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  const { valid, data, errors } = validate(premiumOrderSchema)(req.body);
  if (!valid) return res.status(400).json({ error: 'Validation failed', errors });

  const plan = PLAN_PRICES[data.plan];
  const razorpay = getRazorpay();

  const order = await razorpay.orders.create({
    amount: plan.amount * 100,
    currency: 'INR',
    receipt: `rcpt_${user.id}_${Date.now()}`,
    notes: { userId: String(user.id), plan: data.plan },
  });

  await initDb();
  const db = getDb();
  await db.execute({
    sql: 'INSERT INTO razorpay_orders (order_id, user_id, amount, currency, plan, status) VALUES (?, ?, ?, ?, ?, ?)',
    args: [order.id, user.id, plan.amount, 'INR', data.plan, 'created'],
  });

  res.status(200).json({
    success: true,
    data: {
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      key: process.env.RAZORPAY_KEY_ID,
    },
  });
});