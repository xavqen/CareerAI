import { initDB } from '../lib/db.js';

export default async function handler(req, res) {
  try {
    await initDB();
    res.status(200).json({ status: 'ok', message: 'DB initialized and API is healthy' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}