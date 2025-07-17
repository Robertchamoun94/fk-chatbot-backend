// weaviate_indexer.js – robust och optimerad
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv/config';
import { encode } from 'gpt-3-encoder';
import weaviate from 'weaviate-ts-client';

console.log('🚀 Startar Weaviate-indexering...');

const client = weaviate.client({
  scheme: 'https',
  host: process.env.WEAVIATE_HOST,
  headers: {
    'X-OpenAI-Api-Key': process.env.OPENAI_API_KEY,
    'Authorization': `Bearer ${process.env.WEAVIATE_API_KEY}`
  }
});

const CLASS_NAME = 'FK_Document';
const CHUNKS_DIR = './data/chunks'; // ✅ rätt
const MAX_TOKENS = 3000;
const MAX_PARALLEL = 5;

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
  console.log('📦 Kontrollerar schema...');
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
  } else {
    console.log('✅ Class finns redan:', CLASS_NAME);
  }
}

async function embedChunk(fileName, chunk, chunkIndex) {
  const id = `${fileName.replace(/\.txt$/, '')}_${chunkIndex}`;
  try {
    await client.data.creator()
      .withClassName(CLASS_NAME)
      .withId(id)
      .withProperties({
        source: fileName,
        text: chunk,
      }).do();
    console.log(`✅ Indexerad: ${fileName} [del ${chunkIndex + 1}]`);
  } catch (err) {
    console.error(`❌ Fel vid indexering (${fileName} del ${chunkIndex + 1}):`, err.message);
  }
}

async function embedAndIndexAllChunks() {
  console.log('📂 Läser chunks från mapp:', CHUNKS_DIR);
  const allEntries = await fs.readdir(CHUNKS_DIR, { withFileTypes: true });
  const files = allEntries.filter(entry => entry.isFile()).map(entry => entry.name);

  if (files.length === 0) {
    console.log('⚠️ Inga .txt-filer hittades i chunks-mappen.');
    return;
  }

  let allTasks = [];

  for (const fileName of files) {
    if (!fileName.endsWith('.txt') || fileName.startsWith('.')) continue;

    const filePath = path.join(CHUNKS_DIR, fileName);
    const content = await fs.readFile(filePath, 'utf-8');
    const chunks = splitTextByTokens(content, MAX_TOKENS);

    console.log(`🧩 Splittrar ${fileName} i ${chunks.length} delar...`);

    chunks.forEach((chunk, index) => {
      allTasks.push(() => embedChunk(fileName, chunk, index));
    });
  }

  console.log(`📦 Totalt ${allTasks.length} chunks kommer indexeras...`);
  console.log(`🕒 Detta kan ta ett tag beroende på antalet. Var tålmodig...`);

  for (let i = 0; i < allTasks.length; i += MAX_PARALLEL) {
    const batch = allTasks.slice(i, i + MAX_PARALLEL);
    await Promise.all(batch.map(fn => fn()));
  }

  console.log('🎉 Klar! Alla chunks indexerade i Weaviate.');
}

await ensureClass();
await embedAndIndexAllChunks();
