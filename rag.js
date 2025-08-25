import OpenAI from "openai";
import weaviate from "weaviate-ts-client";
import dotenv from "dotenv";
import fs from "fs";
import { createRequire } from "module"; // <-- för att kunna importera CJS-modulen
dotenv.config();

// Importera systemprompten (CJS) in i ESM
const require = createRequire(import.meta.url);
const { fkSystemPrompt } = require("./prompts/fkSystemPrompt.js");

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
Om källhänvisning saknas i texten, avsluta ändå svaret med "Källa: Försäkringskassan".

TEXT:
${context}

FRÅGA: ${query}
SVAR:
    `.trim();

    console.log("💬 Skickar prompt till GPT (med systemprompt)...");
    const chatResponse = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        { role: "system", content: fkSystemPrompt }, // 🔒 Låsning till Försäkringskassan i Sverige
        { role: "user", content: prompt },           // 📚 Din RAG-kontekst + fråga (oförändrad)
      ],
      temperature: 0.1, // stramare, minskar ”sväv”
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
    // Fallbacken är också FK-låst via systemprompten.
    const fallbackPrompt = `
Besvara endast frågor som rör Försäkringskassan i Sverige.
Om frågan inte rör Försäkringskassan, svara: "Jag svarar bara på frågor som rör Försäkringskassan."
Skriv sakligt och kortfattat. Avsluta gärna med "Källa: Försäkringskassan" om relevant.
FRÅGA: ${query}
SVAR:
    `.trim();

    const chatResponse = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        { role: "system", content: fkSystemPrompt }, // 🔒 håll policyn även i fallback
        { role: "user", content: fallbackPrompt },
      ],
      temperature: 0.1,
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
