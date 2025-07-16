import { ChromaClient } from 'chromadb';
import 'dotenv/config';

const client = new ChromaClient({
  path: process.env.CHROMA_URL || 'http://127.0.0.1:8000',
});

// DefaultEmbeddingFunction finns automatiskt tillgänglig i nyare versioner
const collectionName = 'fk-full';
let collection;

export async function semanticSearchFull(query, topK = 5) {
  try {
    // Initiera och hämta collection om inte redan hämtad
    if (!collection) {
      collection = await client.getOrCreateCollection({
        name: collectionName,
      });
    }

    const results = await collection.query({
      queryTexts: [query],
      nResults: topK,
    });

    const documents = results.documents?.[0] || [];
    return documents;
  } catch (error) {
    console.error('🛑 Fel vid semantisk sökning:', error.message);
    return ['❌ Ett fel uppstod vid sökning. Kontrollera backend-loggar.'];
  }
}
