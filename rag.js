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

/* -------------------- Hälsning/ack/avslut (småprat) -------------------- */
const GREETING_RESPONSE =
  "Hej. Du chattar med Försäkringskassans chattbot. Hur kan jag hjälpa dig?";
const THANKS_RESPONSE =
  "Varsågod! Behöver du mer hjälp är du välkommen att ställa en ny fråga.";
const GOODBYE_RESPONSE =
  "Tack! Ha en fortsatt bra dag. Välkommen tillbaka om du undrar något mer.";

function norm(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[!?.…,:;()"'`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Klassificera småprat: greeting | thanks | goodbye | null
function classifySmalltalk(input) {
  const t = norm(input);
  if (!t) return "greeting";
  const isGreeting = [
    "hej", "hej hej", "hejsan", "tja", "tjabba", "tjena", "hallå",
    "god morgon", "god kväll", "hello", "hi", "hey",
  ].some((g) => t === g);
  if (isGreeting) return "greeting";
  if (/\b(tack|tackar|tusen tack|stort tack|tack så mycket)\b/.test(t)) return "thanks";
  if (/\b(ok|okej|okey)\b/.test(t) && t.length <= 20) return "thanks";
  if (/\b(hej då|hejdå|vi hörs|ha det|trevlig dag|adjö|bye|på återseende)\b/.test(t)) return "goodbye";
  return null;
}
/* ---------------------------------------------------------------------- */

/* --------- Rensa ev. källrader om modellen lägger till dem ----------- */
function cleanAnswer(text = "") {
  // Ta bort rader som börjar med "Källa:" eller "Källor:" (oavsett versaler/å/ä)
  const withoutSource = text.replace(/^\s*K(?:ä|a)ll(?:a|or)\s*:\s.*$/gmi, "").trim();
  return withoutSource.replace(/\n{3,}/g, "\n\n").trim();
}
/* ---------------------------------------------------------------------- */

/* ------------ Kondensera följdfråga → fristående fråga ------------- */
const MAX_HISTORY = 6; // senaste 6 meddelanden räcker långt

function sanitizeHistory(history = []) {
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
  // 0) Småprat först – ta det innan RAG/fallback
  const st = classifySmalltalk(query);
  if (st === "greeting") return GREETING_RESPONSE;
  if (st === "thanks") return THANKS_RESPONSE;
  if (st === "goodbye") return GOODBYE_RESPONSE;

  // 1) Gör senaste inmatning till fristående fråga baserat på historiken
  const standaloneQuestion = await condenseQuestion(history, query);

  // 2) Snabbt demo-läge utan RAG
  if (RAG_DISABLED) {
    console.warn("RAG_DISABLED=true — hoppar över vektorsök och använder GPT direkt.");
    return await fallbackToGPT(standaloneQuestion);
  }

  try {
    // 3) Embedding på den fristående frågan
    console.log("🔍 Skickar fråga till OpenAI för embedding (kondenserad)...");
    const embeddingResponse = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: standaloneQuestion,
    });
    const queryEmbedding = embeddingResponse.data[0].embedding;

    // 4) Vektorsök
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

    // 5) Bygg RAG-kontekst
    const context = docs.map((doc) => doc.text).join("\n---\n");

    const prompt = `
Du är en hjälpsam AI-assistent som svarar med korrekt information från Försäkringskassan.
Använd bara fakta från TEXT nedan när du besvarar frågan. Skriv svaret utan källhänvisning.

TEXT:
${context}

FRÅGA: ${standaloneQuestion}
SVAR:
    `.trim();

    // 6) Svara, med FK-systemprompten
    console.log("💬 Skickar prompt till GPT (med systemprompt)...");
    const chatResponse = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        { role: "system", content: fkSystemPrompt },
        { role: "user", content: prompt },
      ],
      temperature: 0.1,
    });

    const raw = chatResponse.choices?.[0]?.message?.content || "";
    return cleanAnswer(raw) || "Jag vet tyvärr inte.";
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
    const fallbackPrompt = `
Besvara endast frågor som rör Försäkringskassan. Om underlaget är oklart, ställ EN precis följdfråga.
Skriv svaret utan källhänvisning.
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

    const raw = chatResponse.choices?.[0]?.message?.content || "";
    return cleanAnswer(raw) || "Jag vet tyvärr inte.";
  } catch (error) {
    console.error(
      "❌ Fel i fallback till GPT:",
      error?.response?.data?.error?.message || error.message
    );
    return "Ett fel uppstod vid fallback-svar från GPT.";
  }
}
