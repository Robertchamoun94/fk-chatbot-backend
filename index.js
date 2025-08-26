import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { askRAG } from './rag.js'; // ✅ använder GPT + Weaviate

dotenv.config();

const app = express();
const port = process.env.PORT || 5005;

app.use(cors());
app.use(express.json());

// GET /ask – enkel test-endpoint (utan historik)
app.get('/ask', async (req, res) => {
  const query = req.query.query;

  if (!query) {
    return res.status(400).json({ error: '❌ Fråga saknas i query-parametern.' });
  }

  try {
    const answer = await askRAG(String(query));
    res.json({ answer, query });
  } catch (error) {
    console.error('❌ Fel i /ask:', error?.message || error);
    res.status(500).json({ error: '❌ Internt serverfel. Försök igen senare.' });
  }
});

// POST /rag – används av frontend-chatten (med historik)
app.post('/rag', async (req, res) => {
  // Stöd både { query } och { message }, samt valfri { history: [{role, content}, ...] }
  const body = req.body || {};
  const query =
    typeof body.query === 'string' ? body.query :
    typeof body.message === 'string' ? body.message : '';

  if (!query || !query.trim()) {
    return res.status(400).json({ error: '❌ Fråga saknas i POST-body.' });
  }

  // Ta med senaste 6 meddelanden som historik om frontend skickar det
  const history = Array.isArray(body.history) ? body.history.slice(-6) : [];

  try {
    const answer = await askRAG(query.trim(), history);
    res.json({ answer, query: query.trim() });
  } catch (error) {
    console.error('❌ Fel i /rag:', error?.message || error);
    res.status(500).json({ error: '❌ Internt serverfel. Försök igen senare.' });
  }
});

app.listen(port, () => {
  console.log(`✅ RAG-backend körs på http://localhost:${port}`);
});
