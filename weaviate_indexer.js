// weaviate_indexer.js
import fs from 'fs/promises';
import path from 'path';
import 'dotenv/config';
import weaviate, { ApiKey } from 'weaviate-ts-client';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const client = weaviate.client({
  scheme: 'https',
  host: process.env.WEAVIATE_HOST,
  apiKey: new ApiKey(process.env.WEAVIATE_API_KEY),
});

const COLLECTION_NAME = 'fk_docs';
const CHUNKS_DIR = './chunks';

async function ensureCollection() {
  const exists = await client.collections.exists(COLLECTION_NAME);
  if (!exists) {
    console.log('🟡 Skapar collection:', COLLECTION_NAME);
    await client.collections.create({
      name: COLLECTION_NAME,
      vectorizer: 'none',
      vectorIndexConfig: {
        distance: 'cosine',
      },
      properties: [
        { name: 'text', dataType: 'text' },
        { name: 'source', dataType: 'text' },
      ],
    });
  } else {
    console.log('✅ Collection finns redan:', COLLECTION_NAME);
  }
}

async function embed(text) {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return response.data[0].embedding;
}

async function embedAndIndexAllChunks() {
  const files = await fs.readdir(CHUNKS_DIR);

  for (const file of files) {
    const filePath = path.join(CHUNKS_DIR, file);
    const content = await fs.readFile(filePath, 'utf8');
    const embedding = await embed(content);

    await client.collections
      .get(COLLECTION_NAME)
      .data.insert({
        properties: {
          text: content,
          source: file,
        },
        vector: embedding,
      });

    console.log('✅ Indexerad:', file);
  }
}

(async () => {
  try {
    await ensureCollection();
    await embedAndIndexAllChunks();
    console.log('🎉 Allt klart! Alla chunks är indexerade i Weaviate.');
  } catch (err) {
    console.error('❌ Fel vid indexering:', err.message);
  }
})();
