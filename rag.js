// rag.js
import fs from 'fs';
import path from 'path';
import { Configuration, OpenAIApi } from 'openai';
import dotenv from 'dotenv';
dotenv.config();

const openai = new OpenAIApi(new Configuration({ apiKey: process.env.OPENAI_API_KEY }));
const EMBEDDINGS_FILE = path.join(process.cwd(), 'data', 'fk_full_embeddings.json'); // 👈 denna fil måste du ha

function cosineSimilarity(vecA, vecB) {
  const dot = vecA.reduce((sum, val, i) => sum + val * vecB[i], 0);
  const normA = Math.sqrt(vecA.reduce((sum, val) => sum + val * val, 0));
  const normB = Math.sqrt(vecB.reduce((sum, val) => sum + val * val, 0));
  return dot / (normA * normB);
}

async function embedQuery(query) {
  const response = await openai.createEmbedding({
    model: 'text-embedding-3-small',
    input: query
  });
  return response.data.data[0].embedding;
}

export async function askRAG(question, top_k = 5) {
  const queryEmbedding = await embedQuery(question);
  const { chunks } = JSON.parse(fs.readFileSync(EMBEDDINGS_FILE, 'utf8'));

  const scored = chunks.map(chunk => ({
    ...chunk,
    score: cosineSimilarity(queryEmbedding, chunk.embedding)
  }));

  const topChunks = scored.sort((a, b) => b.score - a.score).slice(0, top_k);
  const context = topChunks.map(c => c.text).join('\n---\n');

  const prompt = `Du är en expert på Försäkringskassans regler. Besvara frågan baserat på följande information från fk.se.\n\n${context}\n\nFråga: ${question}\nSvar:`;

  const gptRes = await openai.createChatCompletion({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: 'Du är en hjälpsam assistent som bara svarar baserat på innehållet från Försäkringskassan.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.2
  });

  return gptRes.data.choices[0].message.content;
}
