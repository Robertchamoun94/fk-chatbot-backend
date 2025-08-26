import OpenAI from "openai";
import weaviate from "weaviate-ts-client";
import dotenv from "dotenv";
import fs from "fs";
import { fkSystemPrompt } from "./prompts/fkSystemPrompt.js";
dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

/* -------------------- Hälsnings-/småpratsfilter -------------------- */
const GREETING_RESPONSE =
  "Hej. Du chattar med Försäkringskassans chattbot. Hur kan jag hjälpa dig?";

function isGreetingOrEmpty(input) {
  const t = (input || "").trim().toLowerCase();
  if (!t) return true;
  const cleaned = t.replace(/[!?.…,:;()"'`~]/g, "").replace(/\s+/g, " ");
  const greetings = new Set([
    "hej", "hej hej", "hejsan", "tja", "tjabba", "tjena", "hallå",
    "god morgon", "god kväll", "godnatt", "god natt", "hello", "hi", "hey",
  ]);
  const shortacks = new Set(["tack", "ok", "okej", "okey"]);
  return greetings.has(cleaned) || shortacks.has(cleaned);
}
/* ------------------------------------------------------------------ */

/* ------------ Kondensera följdfråga → fristående fråga ------------- */
const MAX_HISTORY = 6; // senaste 6 meddelanden räcker långt

function sanitizeHistory(history = []) {
  // Förvänta { role: "user"|"assistant", content: string }
  return history
    .filter(
      (m) =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim().length > 0
    )
    .slice(-MAX_HISTORY);
}

async function condenseQuestion(history, latestUserInput) {
  const safeHist = sanitizeHistory(history);
  if (safeHist.length === 0) return (latestUserInput || "").trim();

  const convo = safeHist
    .map((m) => `${m.role === "assistant" ? "Bot" : "Användare"}: ${m.content}`)
    .join("\n");

  const sys =
    "Du skriver om användarens senaste inmatning till en FRISTÅENDE, tydlig fråga om Försäkringskassan. " +
    "Använd endast uppgifter som redan finns i samtalet. Ingen extra text, inga citattecken – returnera bara den omskrivna frågan på svenska.";

  const user = `Samtal hittills:\n${convo}\n\nSenaste inmatning: "${latestUserInput}"\n\nSkriv nu en fristående fråga:`;

  const resp = await openai.chat.completions.create({
    model: CHAT_MODEL,
    messages: [
      { role: "system", content: sys },
      { role: "user", content: user },
    ],
    temperature: 0.1,
  });

  const q = resp.choices?.[0]?.message?.content?.trim();
  return q && q.length > 0 ? q : (latestUserInput || "").trim();
}
/* ------------------------------------------------------------------ */

export async function askRAG(query, history = []) {
  // Hälsningar/”tack”
  if (isGreetingOrEmpty(query)) {
    return GREETING_RESPONSE;
  }

  // 1) Gör senaste inmatning till fristående fråga baserat på historiken
  const standaloneQuestion = await condenseQuestion(history, query);

  // Snabbt demo-läge utan RAG
  if (RAG_DISABLED) {
    console.warn("RAG_DISABLED=true — hoppar över vektorsök och använder GPT direkt.");
    return await fallbackToGPT(standaloneQuestion);
  }

  try {
    // 2) Embedding på den fristående frågan
    console.log("🔍 Skickar fråga till OpenAI för embedding (kondenserad)...");
    const embeddingResponse = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: standaloneQuestion,
    });
    const queryEmbedding = embeddingResponse.data[0].embedding;

    // 3) Vektorsök
    console.log("🧠 Frågar Weaviate med vektor...");
    let result;
    try {
      result = await client.graphql
        .get()
        .withClassName(indexName)
        .withFields("text")
        .withNearVector({ vector: queryEmbedding })
        .withLimit(5)
        .do();
    } catch (weavErr) {
      console.error("❌ Weaviate-fel:", weavErr?.message || weavErr);
      return await fallbackToGPT(standaloneQuestion);
    }

    const docs = result?.data?.Get?.[indexName] || [];
    if (docs.length === 0) {
      console.warn("⚠️ Inga träffar i Weaviate, använder fallback till GPT direkt...");
      return await fallbackToGPT(standaloneQuestion);
    }

    // 4) Bygg RAG-kontekst
    const context = docs.map((doc) => doc.text).join("\n---\n");

    const prompt = `
Du är en hjälpsam AI-assistent som svarar med korrekt information från Försäkringskassan.
Använd bara fakta från TEXT nedan när du besvarar frågan. Om svaret inte finns i texten, svara exakt: "Jag vet tyvärr inte".
Om källhänvisning saknas i texten, avsluta ändå svaret med "Källa: Försäkringskassan".

TEXT:
${context}

FRÅGA: ${standaloneQuestion}
SVAR:
    `.trim();

    // 5) Svara, med FK-systemprompten
    console.log("💬 Skickar prompt till GPT (med systemprompt)...");
    const chatResponse = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        { role: "system", content: fkSystemPrompt },
        { role: "user", content: prompt },
      ],
      temperature: 0.1,
    });

    return chatResponse.choices?.[0]?.message?.content?.trim() || "Jag vet tyvärr inte.";
  } catch (error) {
    console.error(
      "❌ Fel i RAG-sökning:",
      error?.response?.data?.error?.message || error.message
    );
    return await fallbackToGPT(standaloneQuestion);
  }
}

async function fallbackToGPT(standaloneQuestion) {
  try {
    // Fallback: håll dig till FK, men om osäker → be om ETT förtydligande.
    const fallbackPrompt = `
Besvara endast frågor som rör Försäkringskassan. Om underlaget är oklart, ställ EN precis följdfråga.
Skriv sakligt och kortfattat. Avsluta gärna med "Källa: Försäkringskassan" om relevant.
FRÅGA: ${standaloneQuestion}
SVAR:
    `.trim();

    const chatResponse = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        { role: "system", content: fkSystemPrompt },
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
