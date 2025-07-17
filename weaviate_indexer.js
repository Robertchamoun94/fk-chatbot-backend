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

async function ensureClassExists() {
  const schemaRes = await client.schema.getter().do();
  const exists = schemaRes.classes.some(cls => cls.class === COLLECTION_NAME);

  if (!exists) {
    console.log('🟡 Skapar class:', COLLECTION_NAME);

    await client.schema
      .classCreator()
      .withClass({
        class: COLLECTION_NAME,
        vectorizer: 'none',
        properties: [
          { name: 'text', dataType: ['text'] },
          { name: 'source', dataType: ['text'] },
        ],
      })
      .do();
  } else {
    console.log('✅ Class finns redan:', COLLECTION_NAME);
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
    const vector = await embed(content);

    await client.data
      .creator()
      .withClassName(COLLECTION_NAME)
      .withProperties({
        text: content,
        source: file,
      })
      .withVector(vector)
      .do();

    console.log('✅ Indexerad:', file);
  }
}

(async () => {
  try {
    await ensureClassExists();
    await embedAndIndexAllChunks();
    console.log('🎉 Allt klart! Alla chunks är indexerade i Weaviate.');
  } catch (err) {
    console.error('❌ Fel vid indexering:', err.message);
  }
})();
