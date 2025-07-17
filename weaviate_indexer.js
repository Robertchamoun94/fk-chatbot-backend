// weaviate_indexer.js
import fs from 'fs/promises';
import path from 'path';
import 'dotenv/config.js';
import { createClient, ApiKey } from 'weaviate-ts-client';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const client = createClient({
  scheme: 'https',
  host: process.env.WEAVIATE_HOST,
  apiKey: new ApiKey(process.env.WEAVIATE_API_KEY),
});

const COLLECTION_NAME = 'fk_docs';

async function ensureCollection() {
  const exists = await client.collections.exists(COLLECTION_NAME);
  if (!exists) {
    console.log('🆕 Skapar collection:', COLLECTION_NAME);
    await client.collections.create({
      name: COLLECTION_NAME,
      vectorizer: 'none',
      vectorConfig: {
        distance: 'cosine',
      },
    });
  } else {
    console.log('✅ Collection redan finns:', COLLECTION_NAME);
  }
}

async function embedAndIndexDocuments() {
  try {
    await ensureCollection();
    const collection = client.collections.get(COLLECTION_NAME);

    const folderPath = 'data/chroma_index'; // Ändra om din chunk-folder ligger någon annanstans
    const files = await fs.readdir(folderPath);

    for (const file of files) {
      const filePath = path.join(folderPath, file);
      const content = await fs.readFile(filePath, 'utf-8');

      const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: content,
      });

      const embedding = response.data[0].embedding;

      await collection.data.insert({
        id: file.replace('.txt', ''),
        vector: embedding,
        properties: {
          text: content,
        },
      });

      console.log(`✅ Indexerat: ${file}`);
    }

    console.log('🎉 Klar med all indexering!');
  } catch (error) {
    console.error('❌ Fel vid indexering:', error.message);
  }
}

embedAndIndexDocuments();
