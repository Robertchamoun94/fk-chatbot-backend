// weaviate_indexer.js
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv/config';
import { encode } from 'gpt-3-encoder';
import weaviate, { ApiKey } from 'weaviate-ts-client';

const client = weaviate.client({
  scheme: 'https',
  host: process.env.WEAVIATE_HOST,
  headers: {
    'X-OpenAI-Api-Key': process.env.OPENAI_API_KEY,
    'Authorization': `Bearer ${process.env.WEAVIATE_API_KEY}`
  }
});

const CLASS_NAME = 'FK_Document';
const CHUNKS_DIR = './chunks';
const MAX_TOKENS = 3000;

function splitTextByTokens(text, maxTokens) {
  const words = text.split(' ');
  let chunks = [];
  let currentChunk = [];

  for (let word of words) {
    currentChunk.push(word);
    const tokenLength = encode(currentChunk.join(' ')).length;

    if (tokenLength > maxTokens) {
      currentChunk.pop();
      chunks.push(currentChunk.join(' '));
      currentChunk = [word];
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join(' '));
  }

  return chunks;
}

async function ensureClass() {
  const schemaRes = await client.schema.getter().do();
  const exists = schemaRes.classes.some(cls => cls.class === CLASS_NAME);
  if (!exists) {
    console.log('🔧 Skapar class:', CLASS_NAME);
    await client.schema.classCreator().withClass({
      class: CLASS_NAME,
      vectorizer: 'text2vec-openai',
      moduleConfig: {
        'text2vec-openai': {
          model: 'text-embedding-ada-002',
          type: 'text'
        }
      }
    }).do();
  }
}

async function embedAndIndexAllChunks() {
  const files = await fs.readdir(CHUNKS_DIR);

  for (const fileName of files) {
    if (!fileName.endsWith('.txt')) continue;

    const filePath = path.join(CHUNKS_DIR, fileName);
    const content = await fs.readFile(filePath, 'utf-8');
    const chunks = splitTextByTokens(content, MAX_TOKENS);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const id = `${fileName.replace(/\.txt$/, '')}_${i}`;

      try {
        await client.data
          .creator()
          .withClassName(CLASS_NAME)
          .withId(id)
          .withProperties({
            source: fileName,
            text: chunk,
          })
          .do();

        console.log(`✅ Indexerad: ${fileName} [del ${i + 1}/${chunks.length}]`);
      } catch (err) {
        console.error('❌ Fel vid indexering:', err.message);
      }
    }
  }
}

await ensureClass();
await embedAndIndexAllChunks();
