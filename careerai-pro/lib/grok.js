import { OpenAI } from 'openai';

export async function callGrok(model, messages) {
  const apiKey = process.env.GROK_API_KEY;
  if (!apiKey) throw new Error('Grok API key not configured');

  const openai = new OpenAI({ apiKey, baseURL: 'https://api.x.ai/v1' });
  const completion = await openai.chat.completions.create({
    model,
    messages,
    temperature: 0.7,
  });
  return completion.choices[0].message.content;
}