import { getDb } from '../lib/db.js';

export default async function handler(req, res) {
  try {
    const db = getDb();
    await db.execute('SELECT 1');
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  } catch (err) {
    res.status(503).json({ status: 'unhealthy', error: err.message });
  }
}