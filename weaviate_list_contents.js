// weaviate_list_contents.js
import weaviate from 'weaviate-ts-client';
import dotenv from 'dotenv/config';

const client = weaviate.client({
  scheme: 'https',
  host: process.env.WEAVIATE_HOST,
  headers: {
    'Authorization': `Bearer ${process.env.WEAVIATE_API_KEY}`,
    'X-OpenAI-Api-Key': process.env.OPENAI_API_KEY
  }
});

const CLASS_NAME = 'FK_Document';

async function listDocuments() {
  try {
    const response = await client.graphql.get()
      .withClassName(CLASS_NAME)
      .withFields('source text')
      .withLimit(10) // Öka om du vill se fler
      .do();

    const data = response.data.Get[CLASS_NAME];
    if (!data || data.length === 0) {
      console.log('❌ Inga dokument hittades i Weaviate.');
      return;
    }

    console.log(`✅ Hittade ${data.length} dokument:\n`);
    data.forEach((doc, index) => {
      console.log(`📄 ${index + 1}. ${doc.source}`);
      console.log(`   Första 100 tecken: ${doc.text.slice(0, 100)}\n`);
    });
  } catch (err) {
    console.error('❌ Fel vid hämtning från Weaviate:', err.message);
  }
}

listDocuments();
