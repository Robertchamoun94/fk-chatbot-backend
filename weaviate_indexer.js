// weaviate_indexer.js
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import weaviate from 'weaviate-ts-client';
import OpenAI from 'openai';

dotenv.config();

// Initiera OpenAI embeddings
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initiera Weaviate-klienten med korrekt auth header
const client = weaviate.client({
  scheme: 'https',
  host: process.env.WEAVIATE_HOST,
  headers: {
    Authorization: `Bearer ${process.env.WEAVIATE_API_KEY}`,
  },
});

// Namn på din collection i Weaviate
const COLLECTION_NAME = 'fk_docs';

// Kontrollera om collection finns, annars skapa den
async function ensureCollection() {
  try {
    const exists = await client.collections.exists(COLLECTION_NAME);
    if (!exists) {
      console.log('🛠️ Skapar class:', COLLECTION_NAME);
      await client.collections.create({
        className: COLLECTION_NAME,
        vectorizer: 'none',
        vectorIndexType: 'hnsw',
      });
    } else {
      console.log('✅ Collection finns redan:', COLLECTION_NAME);
    }
  } catch (err) {
    console.error('❌ Fel vid creation av collection:', err.message || err);
    throw err;
  }
}

// Funktion för att skapa embedding med OpenAI
async function getEmbedding(text) {
  const embedding = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return embedding.data[0].embedding;
}

// Läser och indexerar alla chunks
async function embedAndIndexAllChunks() {
  const chunksDir = path.join('./chunks');

  try {
    const files = await fs.readdir(chunksDir);

    for (const fileName of files) {
      if (fileName.startsWith('.')) continue; // hoppa över .DS_Store etc
      const filePath = path.join(chunksDir, fileName);
      const content = await fs.readFile(filePath, 'utf-8');

      const vector = await getEmbedding(content);

      await client.collections
        .class(COLLECTION_NAME)
        .data()
        .creator()
        .withId(fileName.replace('.txt', ''))
        .withProperties({
          content,
        })
        .withVector(vector)
        .do();

      console.log(`✅ Indexerat: ${fileName}`);
    }
  } catch (err) {
    console.error('❌ Fel vid indexering:', err.message || err);
    throw err;
  }
}

// Kör hela indexeringsflödet
(async () => {
  try {
    await ensureCollection();
    await embedAndIndexAllChunks();
    console.log('🎉 Klart! Alla chunks är indexerade i Weaviate.');
  } catch (err) {
    console.error('🚨 Indexering misslyckades:', err.message || err);
  }
})();
