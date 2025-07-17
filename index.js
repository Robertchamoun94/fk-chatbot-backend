import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { semanticSearchFull } from './rag.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 5005;

app.use(cors());
app.use(express.json());

// GET /ask – används för test i webbläsare
app.get('/ask', async (req, res) => {
  const query = req.query.query;

  if (!query) {
    return res.status(400).json({ error: '❌ Fråga saknas i query-parametern.' });
  }

  try {
    const docs = await semanticSearchFull(query, 5);
    const answer = docs.join('\n\n');
    res.json({ answer, query });
  } catch (error) {
    console.error('❌ Fel i /ask:', error.message);
    res.status(500).json({ error: '❌ Internt serverfel. Försök igen senare.' });
  }
});

// 🔧 NY: POST /rag – används av frontend
app.post('/rag', async (req, res) => {
  const { query } = req.body;

  if (!query) {
    return res.status(400).json({ error: '❌ Fråga saknas i POST-body.' });
  }

  try {
    const docs = await semanticSearchFull(query, 5);
    const answer = docs.join('\n\n');
    res.json({ answer, query });
  } catch (error) {
    console.error('❌ Fel i /rag:', error.message);
    res.status(500).json({ error: '❌ Internt serverfel. Försök igen senare.' });
  }
});

app.listen(port, () => {
  console.log(`✅ RAG-backend körs på http://localhost:${port}`);
});
