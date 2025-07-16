import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import axios from 'axios';
import dotenv from 'dotenv';
import { askRAG } from './rag.js';
import sanitizeHtml from 'sanitize-html';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

// Fix för __dirname i ES Module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('trust proxy', 1); // 🔐 Viktigt för Render-proxy

// 🔒 Helmet med strikt CSP
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https:'],
        imgSrc: ["'self'", 'data:'],
      },
    },
  })
);
app.use(helmet.frameguard({ action: 'deny' }));
app.use(helmet.crossOriginResourcePolicy({ policy: "cross-origin" }));

// 🚫 Dölj serverteknologi
app.disable('x-powered-by');

// 🌐 CORS – tillåt endast frontend-domäner
const allowedOrigins = [
  'http://localhost:3000',
  'https://fk-chatbot-frontend.onrender.com'
];
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error('Otillåten domän'));
  }
}));

// 📦 JSON-parser med validering
app.use(express.json({
  strict: true,
  verify: (req, res, buf) => {
    try {
      JSON.parse(buf);
    } catch (e) {
      throw new Error('Ogiltig JSON');
    }
  }
}));
app.use((err, req, res, next) => {
  if (err.message === 'Ogiltig JSON') {
    return res.status(400).json({ error: 'Felaktig JSON-struktur i förfrågan.' });
  }
  next(err);
});

// 🛡️ Rate limiting på /ask
const askLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: 'För många förfrågningar – vänta en stund innan du försöker igen.'
});
app.use('/ask', askLimiter);

// 📂 Servera statiska filer från public/
app.use(express.static(path.join(__dirname, 'public'), {
  dotfiles: 'deny'
}));

// 🤖 /ask endpoint – OpenAI utan RAG
app.post('/ask', async (req, res) => {
  const rawQuestion = req.body.question?.toString().trim() || "";
  const userQuestion = sanitizeHtml(rawQuestion, {
    allowedTags: [],
    allowedAttributes: {}
  });

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'Du är en mycket kunnig kundtjänstagent för Försäkringskassan. Svara professionellt och tydligt.'
          },
          { role: 'user', content: userQuestion }
        ]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        }
      }
    );

    const answer = response.data.choices[0].message.content;
    res.json({ answer });

  } catch (error) {
    console.error('Fel vid samtal till OpenAI:', error.message);
    res.status(500).json({
      answer: "Ett tekniskt fel uppstod. Försök igen senare eller kontakta support."
    });
  }
});

// ✅ 🧠 /rag endpoint – GPT + semantisk sökning
app.post('/rag', async (req, res) => {
  try {
    const { query } = req.body;

    if (!query || query.trim() === '') {
      return res.status(400).json({ error: 'Query saknas.' });
    }

    const answer = await askRAG(query);
    res.json({ answer });
  } catch (error) {
    console.error('Fel i /rag:', error);
    res.status(500).json({ error: 'Fel i RAG-svarshanteringen.' });
  }
});

// 🚀 Starta servern
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`✅ Servern körs på http://localhost:${port}`);
});
