// weaviate_indexer.js

import fs from 'fs/promises';
import path from 'path';
import 'dotenv/config';
import weaviate, { ApiKey } from 'weaviate-ts-client';
import OpenAI from 'openai';

// OpenAI-klient för embeddings
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Weaviate-klient med API-nyckel
const client = weaviate.client({
  scheme: 'https',
  host: process.env.WEAVIATE_HOST,
  headers: {
    'X-OpenAI-Api-Key': process.env.WEAVIATE_API_KEY,
  },
  apiKey: new ApiKey(process.env.WEAVIATE_API_KEY),
});

// Klassnamn i Weaviate
const CLASS_NAME = 'FK_Document';

// Skapa klass i Weaviate om den inte finns
async function ensureCollection() {
  try {
    const schemaRes = await client.schema.getter().do();
    const exists = schemaRes.classes.some(cls => cls.class === CLASS_NAME);

    if (!exists) {
      console.log(`⚙️ Skapar klass: ${CLASS_NAME}`);
      await client.schema
        .classCreator()
        .withClass({
          class: CLASS_NAME,
          description: 'Chunks från Försäkringskassan',
          vectorizer: 'none',
          properties: [
            {
              name: 'content',
              dataType: ['text'],
            },
          ],
        })
        .do();
    }
  } catch (err) {
    console.error('❌ Fel vid creation av collection:', err.message);
    throw err;
  }
}

// Generera embedding för en text
async function getEmbedding(text) {
  const embedding = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return embedding.data[0].embedding;
}

// Läser in och indexerar chunks
async function embedAndIndexChunks() {
  const chunksDir = path.join('./chunks');
  const files = await fs.readdir(chunksDir);

  for (const fileName of files) {
    const filePath = path.join(chunksDir, fileName);

    const stat = await fs.stat(filePath);
    if (!stat.isFile()) continue; // hoppa över .DS_Store och mappar

    const text = await fs.readFile(filePath, 'utf-8');
    const vector = await getEmbedding(text);
    const id = fileName.replace('.txt', '');

    await client.data
      .creator()
      .withClassName(CLASS_NAME)
      .withId(id)
      .withProperties({ content: text })
      .withVector(vector)
      .do();

    console.log(`✅ Indexerat: ${fileName}`);
  }
}

// Kör allting
async function main() {
  try {
    await ensureCollection();
    await embedAndIndexChunks();
    console.log('🎉 Allt klart!');
  } catch (err) {
    console.error('❌ Indexering misslyckades:', err.message);
  }
}

main();
