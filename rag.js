import OpenAI from "openai";
import weaviate from "weaviate-ts-client";
import dotenv from "dotenv";
import fs from "fs";
dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const client = weaviate.client({
  scheme: "https",
  host: process.env.WEAVIATE_HOST,
  apiKey: new weaviate.ApiKey(process.env.WEAVIATE_API_KEY),
});

const indexName = "FK_Document";

export async function askRAG(query) {
  try {
    console.log("🔍 Skickar fråga till OpenAI för embedding...");
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-ada-002",
      input: query,
    });

    const queryEmbedding = embeddingResponse.data[0].embedding;

    console.log("🧠 Frågar Weaviate med vektor...");
    const result = await client.graphql.get()
      .withClassName(indexName)
      .withFields("text _additional {certainty}")
      .withNearVector({
        vector: queryEmbedding,
        certainty: 0.6, // Justera vid behov
      })
      .withLimit(5)
      .do();

    const docs = result.data.Get?.[indexName] || [];

    // 🔁 Om vi inte får några relevanta träffar → fallback till GPT direkt
    if (docs.length === 0) {
      console.warn("⚠️ Inga träffar i Weaviate, använder fallback till GPT direkt...");
      return await fallbackToGPT(query);
    }

    const context = docs.map((doc) => doc.text).join("\n---\n");

    const prompt = `
Du är en hjälpsam AI-assistent som svarar med korrekt information från Försäkringskassan.
Använd bara fakta från texten nedan när du besvarar frågan. Om svaret inte finns i texten, svara "Jag vet tyvärr inte".

TEXT:
${context}

FRÅGA: ${query}
SVAR:
    `.trim();

    console.log("💬 Skickar prompt till GPT...");
    const chatResponse = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
    });

    return chatResponse.choices[0].message.content.trim();
  } catch (error) {
    console.error("❌ Fel i RAG-sökning:", error.message);
    return "Ett fel uppstod vid hämtning av svar från GPT.";
  }
}

async function fallbackToGPT(query) {
  try {
    const fallbackPrompt = `
Du är en generell AI-assistent. Besvara frågan så gott du kan, även om du inte har tillgång till extern kontext.
FRÅGA: ${query}
SVAR:
    `.trim();

    const chatResponse = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: fallbackPrompt }],
      temperature: 0.7,
    });

    return chatResponse.choices[0].message.content.trim();
  } catch (error) {
    console.error("❌ Fel i fallback till GPT:", error.message);
    return "Ett fel uppstod vid fallback-svar från GPT.";
  }
}
