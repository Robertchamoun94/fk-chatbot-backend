const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
require('dotenv').config();
const { askRAG } = require('./rag.js');
const sanitizeHtml = require('sanitize-html');
const path = require('path');
const { exec } = require('child_process');

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

// 🌐 CORS – tillåt endast din frontend
const allowedOrigins = [
  'http://localhost:3000',
  'https://fk-chatbot-frontend.onrender.com' // ← detta MÅSTE vara exakt frontend-URL
];
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error('Otillåten domän'));
  }
}));

// 📦 JSON-parser + validering
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
  windowMs: 60 * 1000, // 1 minut
  max: 5,
  message: 'För många förfrågningar – vänta en stund innan du försöker igen.'
});
app.use(helmet());
app.use('/ask', askLimiter);

// 📂 Servera statiska filer från public/
app.use(express.static(path.join(__dirname, 'public'), {
  dotfiles: 'deny'
}));

// 🤖 /ask endpoint (standard OpenAI utan RAG)
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

// 🧠 /rag-query endpoint (med vektor-sökning + GPT)
app.post('/rag-query', async (req, res) => {
  const question = req.body.question;
  if (!question) return res.status(400).send("Ingen fråga angavs.");

  const sanitizedQuestion = question.replace(/"/g, '\\"');
  const command = `python3 rag_query.py "${sanitizedQuestion}"`;

  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`Fel vid exec: ${error}`);
      return res.status(500).send("Något gick fel i RAG-pipelinen.");
    }
    res.send(stdout);
  });
});

// 🚀 Starta servern
const port = process.env.PORT || 3000;
app.post('/rag-query', async (req, res) => {
  try {
    const { question } = req.body;

    if (!question || question.trim() === '') {
      return res.status(400).json({ error: 'Frågan saknas.' });
    }

    const answer = await askRAG(question);
    res.send(answer);
  } catch (error) {
    console.error('Fel i /rag-query:', error);
    res.status(500).send('Något gick fel i RAG-pipelinen.');
  }
});

app.listen(port, () => {
  console.log(`Servern körs på http://localhost:${port}`);
});
