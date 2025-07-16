import { ChromaClient } from "chromadb";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const client = new ChromaClient();
await client.init();

const collection = await client.getOrCreateCollection({ name: "fk-full" });

async function getEmbedding(text) {
  const response = await axios.post(
    "https://api.openai.com/v1/embeddings",
    {
      input: text,
      model: "text-embedding-3-small"
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      }
    }
  );
  return response.data.data[0].embedding;
}

export async function askRAG(query) {
  const queryEmbedding = await getEmbedding(query);
  const results = await collection.query({
    queryEmbeddings: [queryEmbedding],
    nResults: 3
  });

  const documents = results.documents?.[0] || [];
  const context = documents.join("\n\n");

  return {
    context,
    query
  };
}
