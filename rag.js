import { ChromaClient } from 'chromadb';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

// Initiera OpenAI och Chroma
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const client = new ChromaClient({ path: 'data/chroma_index' });

// 🧠 Connecta till collection utan embeddingFunction
const collection = await client.getOrCreateCollection({
  name: 'fk-full'
});

// 🔍 Embedda frågan själv
async function embedQuery(query) {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query
  });

  return response.data[0].embedding;
}

// 🤖 Huvudfunktion: fråga RAG
export async function askRAG(query, top_k = 5) {
  try {
    const embedding = await embedQuery(query);

    const results = await collection.query({
      queryEmbeddings: [embedding],
      nResults: top_k
    });

    const documents = results.documents?.[0] || [];

    if (documents.length === 0) {
      return 'Jag kunde tyvärr inte hitta någon information om det just nu.';
    }

    const context = documents.join('\n\n');

    const completion = await openai.chat.completions.create({
      model: 'gpt-4', // eller 'gpt-3.5-turbo'
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
  } catch (error) {
    console.error('❌ Fel i askRAG:', error);
    return '❌ Ett tekniskt fel uppstod när GPT försökte generera ett svar.';
  }
}
