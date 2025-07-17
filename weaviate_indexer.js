// weaviate_indexer.js
import fs from 'fs/promises';
import path from 'path';
import 'dotenv/config';
import weaviate from 'weaviate-ts-client';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const client = weaviate.client({
  scheme: 'https',
  host: process.env.WEAVIATE_HOST,
  headers: {
    'X-OpenAI-Api-Key': process.env.WEAVIATE_API_KEY,
  },
});

const CLASS_NAME = 'fk_docs';
const CHUNKS_DIR = './chunks';

async function ensureCollection() {
  try {
    const schema = await client.schema.getter().do();
    const exists = schema.classes.some(cls => cls.class === CLASS_NAME);

    if (!exists) {
      console.log('📚 Skapar class:', CLASS_NAME);
      await client.schema.classCreator().withClass({
        class: CLASS_NAME,
        vectorizer: 'none',
        properties: [
          { name: 'text', dataType: ['text'] },
          { name: 'source', dataType: ['text'] },
        ],
      }).do();
    }
  } catch (error) {
    console.error('❌ Fel vid creation av collection:', error.message);
    process.exit(1);
  }
}

async function embed(text) {
  const res = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return res.data[0].embedding;
}

async function embedAndIndexAllChunks() {
  const entries = await fs.readdir(CHUNKS_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile() || entry.name === '.DS_Store') continue;

    const filePath = path.join(CHUNKS_DIR, entry.name);
    const content = await fs.readFile(filePath, 'utf8');

    const vector = await embed(content);

    await client.data
      .creator()
      .withClassName(CLASS_NAME)
      .withProperties({
        text: content,
        source: entry.name,
      })
      .withVector(vector)
      .do();

    console.log('✅ Indexerad:', entry.name);
  }
}

(async () => {
  try {
    await ensureCollection();
    await embedAndIndexAllChunks();
    console.log('🎉 Alla chunks är nu indexerade i Weaviate!');
  } catch (err) {
    console.error('❌ Fel vid indexering:', err.message);
  }
})();
