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

// Moderna modellnamn (kan overrideas via .env)
const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";
const EMBEDDING_MODEL = process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small";

// Toggle: sätt RAG_DISABLED=true i .env för att hoppa över Weaviate helt
const RAG_DISABLED = String(process.env.RAG_DISABLED).toLowerCase() === "true";

export async function askRAG(query) {
  // Snabbt demo-läge utan RAG
  if (RAG_DISABLED) {
    console.warn("RAG_DISABLED=true — hoppar över vektorsök och använder GPT direkt.");
    return await fallbackToGPT(query);
  }

  try {
    console.log("🔍 Skickar fråga till OpenAI för embedding...");
    const embeddingResponse = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: query,
    });
    const queryEmbedding = embeddingResponse.data[0].embedding;

    console.log("🧠 Frågar Weaviate med vektor...");
    let result;
    try {
      // Versionssäker GraphQL: be bara om 'text' (inga _additional-fält)
      result = await client.graphql
        .get()
        .withClassName(indexName)
        .withFields("text")
        .withNearVector({ vector: queryEmbedding }) // ingen 'certainty' (kan skilja mellan versioner)
        .withLimit(5)
        .do();
    } catch (weavErr) {
      console.error("❌ Weaviate-fel:", weavErr?.message || weavErr);
      // Fortsätt ändå med GPT så att demo fungerar
      return await fallbackToGPT(query);
    }

    const docs = result?.data?.Get?.[indexName] || [];
    if (docs.length === 0) {
      console.warn("⚠️ Inga träffar i Weaviate, använder fallback till GPT direkt...");
      return await fallbackToGPT(query);
    }

    const context = docs.map((doc) => doc.text).join("\n---\n");

    const prompt = `
Du är en hjälpsam AI-assistent som svarar med korrekt information från Försäkringskassan.
Använd bara fakta från TEXT nedan när du besvarar frågan. Om svaret inte finns i texten, svara exakt: "Jag vet tyvärr inte".

TEXT:
${context}

FRÅGA: ${query}
SVAR:
    `.trim();

    console.log("💬 Skickar prompt till GPT...");
    const chatResponse = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
    });

    return chatResponse.choices?.[0]?.message?.content?.trim() || "Jag vet tyvärr inte.";
  } catch (error) {
    console.error(
      "❌ Fel i RAG-sökning:",
      error?.response?.data?.error?.message || error.message
    );
    // Svara ändå
    return await fallbackToGPT(query);
  }
}

async function fallbackToGPT(query) {
  try {
    const fallbackPrompt = `
Du är en generell AI-assistent. Besvara frågan så gott du kan, även utan extern kontext.
FRÅGA: ${query}
SVAR:
    `.trim();

    const chatResponse = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: [{ role: "user", content: fallbackPrompt }],
      temperature: 0.4,
    });

    return chatResponse.choices?.[0]?.message?.content?.trim() || "Jag vet tyvärr inte.";
  } catch (error) {
    console.error(
      "❌ Fel i fallback till GPT:",
      error?.response?.data?.error?.message || error.message
    );
    return "Ett fel uppstod vid fallback-svar från GPT.";
  }
}
