// weaviate_indexer.js
import fs from 'fs/promises';
import path from 'path';
import 'dotenv/config';
import { v4 as uuidv4 } from 'uuid';
import weaviate, { ApiKey } from 'weaviate-ts-client';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const client = weaviate.client({
  scheme: 'https',
  host: process.env.WEAVIATE_HOST,
  apiKey: new ApiKey(process.env.WEAVIATE_API_KEY),
});

const CLASS_NAME = 'FK_Document';
const COLLECTION_PATH = './chunks';

async function ensureClass() {
  const schemaRes = await client.schema.getter().do();
  const exists = schemaRes.classes.some(c => c.class === CLASS_NAME);

  if (!exists) {
    console.log('⚙️ Skapar class:', CLASS_NAME);
    await client.schema.classCreator().withClass({
      class: CLASS_NAME,
      vectorizer: 'none',
      properties: [
        { name: 'text', dataType: ['text'] },
        { name: 'source', dataType: ['string'] },
      ],
    }).do();
  }
}

async function embed(text) {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return response.data[0].embedding;
}

async function embedAndIndexChunks() {
  const files = await fs.readdir(COLLECTION_PATH);
  for (const file of files) {
    const filePath = path.join(COLLECTION_PATH, file);
    const stat = await fs.stat(filePath);

    if (stat.isDirectory() || path.extname(file) !== '.txt') continue;

    const text = await fs.readFile(filePath, 'utf-8');
    if (!text.trim()) continue;

    const vector = await embed(text);
    const id = uuidv4(); // ✅ Korrekt UUID

    await client.data
      .creator()
      .withClassName(CLASS_NAME)
      .withId(id)
      .withProperties({
        text: text,
        source: file,
      })
      .withVector(vector)
      .do();

    console.log(`✅ Indexerad: ${file}`);
  }
}

(async () => {
  try {
    await ensureClass();
    await embedAndIndexChunks();
    console.log('🎉 Klar! Alla chunks är indexerade.');
  } catch (err) {
    console.error('❌ Fel vid indexering:', err.message);
  }
})();
