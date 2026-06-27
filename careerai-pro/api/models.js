export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const models = [];
  if (process.env.GEMINI_API_KEY) {
    models.push(
      { id: 'gemini-2.0-flash', name: '⚡ Gemini 2.0 Flash', provider: 'gemini', providerDisplay: 'Google', description: 'Fast and efficient for career guidance' },
      { id: 'gemini-2.0-pro', name: '🧠 Gemini 2.0 Pro', provider: 'gemini', providerDisplay: 'Google', description: 'Advanced reasoning for complex career paths' },
      { id: 'gemini-1.5-flash', name: '💨 Gemini 1.5 Flash', provider: 'gemini', providerDisplay: 'Google', description: 'Quick responses for rapid exploration' }
    );
  }
  if (process.env.GROK_API_KEY) {
    models.push({ id: 'grok-2-latest', name: '🤖 Grok 2', provider: 'grok', providerDisplay: 'xAI', description: 'X-accelerated career insights' });
  }
  res.status(200).json({ success: true, data: models });
}