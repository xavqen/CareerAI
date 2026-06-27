import Razorpay from 'razorpay';
import { withAuth } from '../../lib/auth.js';

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const PLANS = {
  daily: 900, // in paise (₹9)
  monthly: 4900,
  yearly: 9900
};

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { plan } = req.body;
  if (!PLANS[plan]) return res.status(400).json({ error: 'Invalid plan' });

  try {
    const order = await razorpay.orders.create({
      amount: PLANS[plan],
      currency: 'INR',
      receipt: `rcpt_${req.user.userId}_${Date.now()}`
    });
    res.status(200).json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
export default withAuth(handler);