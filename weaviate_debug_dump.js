// weaviate_debug_dump.js
import weaviate from 'weaviate-ts-client';
import dotenv from 'dotenv/config';

const client = weaviate.client({
  scheme: 'https',
  host: process.env.WEAVIATE_HOST,
  headers: {
    'Authorization': `Bearer ${process.env.WEAVIATE_API_KEY}`
  }
});

const CLASS_NAME = 'FK_Document';

async function listContents() {
  try {
    const result = await client.graphql.get()
      .withClassName(CLASS_NAME)
      .withFields('text source')
      .withLimit(5)
      .do();

    const docs = result.data.Get[CLASS_NAME];

    console.log("\n🔎 Totalt hittade vi:", docs.length, "chunks.\n");
    docs.forEach((doc, i) => {
      console.log(`📄 Dokument ${i + 1}:\n`);
      console.log(doc.text.slice(0, 500)); // Visa första 500 tecken
      console.log('\n––––––––––––––––––––––––––––––––––\n');
    });
  } catch (error) {
    console.error('❌ Fel vid hämtning:', error.message);
  }
}

listContents();
