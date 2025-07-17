// weaviate_indexer.js
import fs from 'fs/promises';
import path from 'path';
import 'dotenv/config';
import { WeaviateClient } from '@weaviate/client';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const client = new WeaviateClient({
  scheme: 'https',
  host: process.env.WEAVIATE_HOST,
  headers: {
    'X-OpenAI-Api-Key': process.env.WEAVIATE_API_KEY,
  },
});

const COLLECTION_NAME = 'fk_docs';

async function ensureCollection() {
  const exists = await client.collections.exists(COLLECTION_NAME);
  if (!exists) {
    console.log('📁 Skapar collection:', COLLECTION_NAME);
    await client.collections.create({
      name: COLLECTION_NAME,
      vectorizer: 'none',
      properties: [
        { name: 'text', dataType: 'text' },
        { name: 'source', dataType: 'text' },
      ],
      vectorIndexConfig: {
        distance: 'cosine',
      },
    });
  } else {
    console.log('✅ Collection finns redan:', COLLECTION_NAME);
  }
}

async function embed(text) {
  const result = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return result.data[0].embedding;
}

async function indexChunks() {
  const chunkDir = path.resolve('chunks');
  const files = await fs.readdir(chunkDir);
  const collection = client.collections.get(COLLECTION_NAME);

  for (const file of files) {
    const filePath = path.join(chunkDir, file);
    const text = await fs.readFile(filePath, 'utf-8');
    const vector = await embed(text);

    await collection.data.insert({
      vector,
      properties: {
        text,
        source: file,
      },
    });

    console.log(`📄 Indexerat: ${file}`);
  }

  console.log('✅ Alla chunk-filer är indexerade!');
}

(async () => {
  try {
    await ensureCollection();
    await indexChunks();
  } catch (err) {
    console.error('❌ Fel vid indexering:', err.message);
  }
})();
