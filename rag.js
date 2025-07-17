// rag.js – Använder Weaviate + OpenAI GPT
import weaviate from 'weaviate-ts-client';
import dotenv from 'dotenv/config';
import { OpenAI } from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const client = weaviate.client({
  scheme: 'https',
  host: process.env.WEAVIATE_HOST,
  headers: {
    'X-OpenAI-Api-Key': process.env.OPENAI_API_KEY,
    'Authorization': `Bearer ${process.env.WEAVIATE_API_KEY}`
  }
});

const CLASS_NAME = 'FK_Document';

export async function askRAG(query) {
  try {
    // 🔍 1. Semantisk sökning i Weaviate
    const result = await client.graphql.get()
      .withClassName(CLASS_NAME)
      .withFields('text source')
      .withNearText({ concepts: [query] })
      .withLimit(5)
      .do();

    const docs = result.data.Get[CLASS_NAME];
    if (!docs || docs.length === 0) {
      return "Jag hittade tyvärr inget relevant innehåll i kunskapsbasen.";
    }

    // 📄 2. Kombinera text från top-matcher
    const context = docs.map(doc => doc.text).join("\n\n");

    // 🤖 3. Skapa prompt till GPT
    const prompt = `
Du är en mycket kunnig assistent för Försäkringskassan. Besvara frågan baserat på nedanstående information från officiella källor. Svara på svenska.

### Information:
${context}

### Fråga:
${query}

### Svar:
`;

    // 🧠 4. Hämta svar från GPT
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3
    });

    return completion.choices[0].message.content;
  } catch (error) {
    console.error('❌ Fel i RAG-sökning:', error.message);
    return "Ett fel uppstod vid hämtning av svar från GPT.";
  }
}
