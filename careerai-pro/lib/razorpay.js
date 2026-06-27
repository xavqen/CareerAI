import Razorpay from 'razorpay';

let razorpay = null;

export function getRazorpay() {
  if (!razorpay) {
    razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }
  return razorpay;
}

export const PLAN_PRICES = {
  daily: { amount: 9, label: 'Daily', days: 1 },
  monthly: { amount: 49, label: 'Monthly', days: 30 },
  yearly: { amount: 99, label: 'Yearly', days: 365 },
};

export function calculateExpiry(plan) {
  const now = new Date();
  const days = PLAN_PRICES[plan]?.days || 1;
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}