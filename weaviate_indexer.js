// weaviate_indexer.js
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import weaviate from 'weaviate-ts-client';
import OpenAI from 'openai';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const client = weaviate.client({
  scheme: 'https',
  host: process.env.WEAVIATE_HOST,
  headers: {
    Authorization: `Bearer ${process.env.WEAVIATE_API_KEY}`,
  },
});

const CLASS_NAME = 'FK_Document';

async function ensureClassExists() {
  try {
    const schemaRes = await client.schema.getter().do();
    const classExists = schemaRes.classes.some(cls => cls.class === CLASS_NAME);

    if (!classExists) {
      console.log(`🛠️ Skapar class: ${CLASS_NAME}`);
      await client.schema
        .classCreator()
        .withClass({
          class: CLASS_NAME,
          vectorizer: 'none',
          vectorIndexType: 'hnsw',
          properties: [
            {
              name: 'content',
              dataType: ['text'],
            },
          ],
        })
        .do();
    } else {
      console.log(`✅ Class "${CLASS_NAME}" finns redan`);
    }
  } catch (err) {
    console.error('❌ Fel vid skapande av class:', err.message || err);
    throw err;
  }
}

async function getEmbedding(text) {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return response.data[0].embedding;
}

async function embedAndIndexChunks() {
  const chunksDir = path.join('./chunks');

  const files = await fs.readdir(chunksDir);
  for (const fileName of files) {
    if (fileName.startsWith('.')) continue; // Hoppa över .DS_Store etc

    const filePath = path.join(chunksDir, fileName);
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

(async () => {
  try {
    await ensureClassExists();
    await embedAndIndexChunks();
    console.log('🎉 Alla chunks är nu indexerade i Weaviate!');
  } catch (err) {
    console.error('🚨 Indexering misslyckades:', err.message || err);
  }
})();
