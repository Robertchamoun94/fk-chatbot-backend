import { ChromaClient, OpenAIEmbeddingFunction } from 'chromadb';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

// 🔑 Initiera OpenAI
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 🧠 Initiera Chroma med embeddings
const client = new ChromaClient({
  path: 'data/chroma_index' // Ändra om du har annan sökväg
});

const collection = await client.getOrCreateCollection({
  name: 'fk-full',
  embeddingFunction: new OpenAIEmbeddingFunction({
    openai_api_key: process.env.OPENAI_API_KEY,
    model: 'text-embedding-3-small'
  })
});

// 🔍 Huvudfunktion: semantisk sökning + GPT-svar
export async function askRAG(query, top_k = 5) {
  try {
    // 1. Semantisk sökning
    const results = await collection.query({
      queryTexts: [query],
      nResults: top_k
    });

    const documents = results.documents?.[0] || [];

    if (documents.length === 0) {
      return 'Jag kunde tyvärr inte hitta någon information om det just nu.';
    }

    const context = documents.join('\n\n');

    // 2. Fråga GPT med kontext
    const completion = await openai.chat.completions.create({
      model: 'gpt-4', // eller gpt-3.5-turbo
      messages: [
        {
          role: 'system',
          content: 'Du är en expert på Försäkringskassans regler. Svara tydligt och korrekt med hänvisning till fakta från kontexten nedan.'
        },
        {
          role: 'user',
          content: `Fråga: "${query}"\n\nRelevant kontext:\n${context}\n\nSvar:`
        }
      ],
      temperature: 0.3
    });

    return completion.choices[0].message.content.trim();
  } catch (err) {
    console.error('❌ Fel i askRAG:', err);
    return '❌ Ett tekniskt fel uppstod när GPT försökte generera ett svar.';
  }
}
