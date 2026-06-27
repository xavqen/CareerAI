import { GoogleGenerativeAI } from '@google/generative-ai';

const SYSTEM_PROMPT = `You are a futuristic career coach AI. Reply in **concise, scannable bullet points** with **minimal text**. Use **text‑based flowcharts** (arrows →, emojis) to show career paths. Include:
- 🔥 Estimated **salary range** (₹ or $)
- ⏳ **Minimum study/training time** to get a job
- 💡 Interesting facts or hidden opportunities
- 🎯 After EVERY message, ask **1 engaging question** to keep the conversation going.`;

export async function callGemini(model, messages) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Gemini API key not configured');

  const genAI = new GoogleGenerativeAI(apiKey);
  const history = [];
  let systemInstruction = '';

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemInstruction += msg.content + '\n';
    } else {
      history.push({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }],
      });
    }
  }

  const geminiModel = genAI.getGenerativeModel({
    model,
    systemInstruction: systemInstruction.trim() || SYSTEM_PROMPT,
  });

  const chat = geminiModel.startChat({ history: history.slice(0, -1) });
  const lastMsg = history[history.length - 1];
  const result = await chat.sendMessage(lastMsg.parts[0].text);
  return result.response.text();
}