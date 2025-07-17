import weaviate from 'weaviate-ts-client';
import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

const client = weaviate.client({
  scheme: 'https',
  host: '22xhnm1tiloai40du15fq.c0.europe-west3.gcp.weaviate.cloud', // ← Din Weaviate endpoint
  apiKey: new weaviate.ApiKey(process.env.WEAVIATE_API_KEY),
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function semanticSearchFull(query, top_k = 5) {
  try {
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
    });

    const queryVector = embeddingResponse.data[0].embedding;

    const result = await client.graphql.get()
      .withClassName('FKPage') // ← matchar schemaklassen i din indexering
      .withFields(['text'])
      .withNearVector({ vector: queryVector })
      .withLimit(top_k)
      .do();

    const texts = result.data.Get.FKPage.map(item => item.text);
    return texts;

  } catch (error) {
    console.error('❌ Fel vid semantisk sökning:', error);
    throw new Error('Ett fel uppstod vid sökning. Kontrollera backend-loggar.');
  }
}
