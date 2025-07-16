import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { OpenAI } from 'openai';
import { ChromaClient, OpenAIEmbeddingFunction } from 'chromadb';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function askRAG(userQuery, topK = 5) {
  const client = new ChromaClient({
    path: path.join(__dirname, 'data/chroma_index')
  });

  const embedder = new OpenAIEmbeddingFunction({
    openai_api_key: process.env.OPENAI_API_KEY
  });

  const collection = await client.getOrCreateCollection({
    name: 'fk-full',
    embeddingFunction: embedder
  });

  const results = await collection.query({
    queryTexts: [userQuery],
    nResults: topK
  });

  const topChunks = results.documents[0] || [];

  const prompt = `
Du är en mycket kunnig kundtjänstagent för Försäkringskassan.
Besvara frågan nedan endast utifrån den tillhandahållna kontexten.
Om svaret inte finns i kontexten, svara: "Jag hittar tyvärr inte information om detta."

Fråga: ${userQuery}
---
KONTEXT:
${topChunks.join('\n\n')}
---
Svar:
`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [{ role: 'user', content: prompt }]
  });

  return completion.choices[0].message.content;
}
