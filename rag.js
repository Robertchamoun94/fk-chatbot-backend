import { ChromaClient } from 'chromadb';
import { OpenAI } from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const client = new ChromaClient();
const collection = await client.getOrCreateCollection({
  name: 'fk-full',
  embeddingFunction: async (texts) => {
    const embeddings = await Promise.all(
      texts.map(async (text) => {
        const response = await openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: text,
        });
        return response.data[0].embedding;
      })
    );
    return embeddings;
  },
});

export async function semanticSearchFull(query, topK = 5) {
  try {
    const results = await collection.query({
      queryTexts: [query],
      nResults: topK,
    });

    const docs = results.documents?.[0] || [];
    return docs;
  } catch (error) {
    console.error('❌ Fel vid semantisk sökning:', error);
    throw new Error('Fel vid semantisk sökning.');
  }
}
