import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { ChromaClient } from "chromadb";
import { OpenAIEmbeddingFunction } from "chromadb";

dotenv.config();

const app = express();
const port = process.env.PORT || 5005;

app.use(cors());

const client = new ChromaClient();

const embedder = new OpenAIEmbeddingFunction({
  openai_api_key: process.env.OPENAI_API_KEY,
});

const collection = await client.getOrCreateCollection({
  name: "fk-full",
  embeddingFunction: embedder,
});

app.get("/ask", async (req, res) => {
  const query = req.query.query;

  if (!query) {
    return res.status(400).json({ error: "Ingen fråga angavs." });
  }

  try {
    const result = await collection.query({
      queryTexts: [query],
      nResults: 1,
    });

    const answer = result?.documents?.[0]?.[0];

    if (!answer) {
      return res.json({ answer: "❌ Kunde inte hitta ett svar." });
    }

    res.json({ answer, query });
  } catch (error) {
    console.error("Fel i /ask:", error);
    res.status(500).json({ error: "Ett internt fel uppstod." });
  }
});

app.listen(port, () => {
  console.log(`✅ RAG-backend körs på http://127.0.0.1:${port}`);
});
