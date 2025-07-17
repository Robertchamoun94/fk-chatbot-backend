// weaviate_indexer.js
import fs from 'fs/promises';
import path from 'path';
import 'dotenv/config';
import weaviate, { ApiKey } from 'weaviate-ts-client';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const client = weaviate.client({
  scheme: 'https',
  host: process.env.WEAVIATE_HOST,
  headers: {
    'X-OpenAI-Api-Key': process.env.WEAVIATE_API_KEY,
  },
});

const COLLECTION_NAME = 'fk_docs';

async function ensureCollection() {
  const exists = await client.schema.exists(COLLECTION_NAME);
  if (!exists) {
    console.log('🔧 Skapar collection:', COLLECTION_NAME);
    await client.schema
      .classCreator()
      .withClass({
        class: COLLECTION_NAME,
        vectorizer: 'none',
        properties: [
          {
            name: 'text',
            dataType: ['text'],
          },
        ],
      })
      .do();
  }
}

async function embedAndIndexAllChunks() {
  try {
    await ensureCollection();

    const files = await fs.readdir('./chunks');
    for (const file of files) {
      const filePath = path.join('./chunks', file);
      const content = await fs.readFile(filePath, 'utf-8');

      const embeddingResponse = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: content,
      });

      const vector = embeddingResponse.data[0].embedding;

      await client.data
        .creator()
        .withClassName(COLLECTION_NAME)
        .withProperties({ text: content })
        .withVector(vector)
        .do();

      console.log(`✅ Indexerat: ${file}`);
    }
  } catch (error) {
    console.error('❌ Fel vid indexering:', error);
  }
}

embedAndIndexAllChunks();
