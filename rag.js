export async function askRAG(query) {
  try {
    // 🔁 1. Embeddar frågan med OpenAI
    const embedded = await openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: query
    });

    const vector = embedded.data[0].embedding;

    // 🔍 2. Semantisk sökning i Weaviate
    const result = await client.graphql.get()
      .withClassName(CLASS_NAME)
      .withFields('text source')
      .withNearVector({ vector })
      .withLimit(5)
      .do();

    const docs = result.data.Get[CLASS_NAME];
    const context = docs && docs.length > 0
      ? docs.map(doc => doc.text).join("\n\n")
      : null;

    // 📄 3. Skapa GPT-prompt
    const prompt = context
      ? `Du är en mycket kunnig assistent för Försäkringskassan. Besvara frågan baserat på nedanstående information från officiella källor. Svara på svenska.

### Information:
${context}

### Fråga:
${query}

### Svar:`
      : `Du är en mycket kunnig assistent för Försäkringskassan. Frågan nedan saknar direkt kopplad information från databasen, men besvara så gott du kan baserat på din egen kunskap. Svara på svenska.

### Fråga:
${query}

### Svar:`;

    // 🤖 4. GPT-svar
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4
    });

    return completion.choices[0].message.content;

  } catch (error) {
    console.error('❌ Fel i RAG-sökning:', error.message);
    return "Ett fel uppstod vid hämtning av svar från GPT.";
  }
}
