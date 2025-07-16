import { ChromaClient } from "chromadb";
import { OpenAIEmbeddingFunction } from "chromadb";
import * as dotenv from "dotenv";
dotenv.config();

const client = new ChromaClient();

const embedder = new OpenAIEmbeddingFunction({
  openai_api_key: process.env.OPENAI_API_KEY,
});

const collection = await client.getOrCreateCollection({
  name: "fk-full",
  embeddingFunction: embedder,
});

// ✅ Skapa nytt index varje gång Render startar
import chunks from "./data/fk-full.json" assert { type: "json" };

await collection.add({
  ids: chunks.map((c, i) => `doc-${i}`),
  documents: chunks.map((c) => c.text),
});

console.log(`✅ ${chunks.length} dokument indexerade`);

export async function ask_rag(query, top_k = 5) {
  const results = await collection.query({
    queryTexts: [query],
    nResults: top_k,
  });

  const docs = results.documents?.[0] || [];
  return docs.join("\n---\n");
}
