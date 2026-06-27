export default function handler(req, res) {
  const models = [];
  if (process.env.GEMINI_API_KEY) {
    models.push(
      { id: 'gemini-2.0-flash', name: '⚡ Gemini 2.0 Flash', provider: 'gemini', providerDisplay: 'Google' },
      { id: 'gemini-2.0-pro',   name: '🧠 Gemini 2.0 Pro',   provider: 'gemini', providerDisplay: 'Google' },
      { id: 'gemini-1.5-flash', name: '💨 Gemini 1.5 Flash', provider: 'gemini', providerDisplay: 'Google' }
    );
  }
  if (process.env.GROK_API_KEY) {
    models.push({ id: 'grok-2-latest', name: '🤖 Grok 2', provider: 'grok', providerDisplay: 'xAI' });
  }
  res.status(200).json({ models });
}