const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
require('dotenv').config();
const sanitizeHtml = require('sanitize-html');
console.log("API-nyckel laddad:", process.env.OPENAI_API_KEY);

const app = express();
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'","'unsafe-inline'"],
        styleSrc: ["'self'","'unsafe-inline'", 'https:'],
        imgSrc: ["'self'", 'data:'],
      },
    },
  })
);
app.use(helmet.frameguard({ action: 'deny' }));

app.disable('x-powered-by');
const port = 3000;
app.use(cors({
  origin: 'http://localhost:3000' // Tillåt endast din frontend
}));

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

// Skydda /ask från missbruk – max 5 förfrågningar per minut
const askLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minut
  max: 5,              // Max 5 förfrågningar
  message: 'För många förfrågningar – vänta en stund innan du försöker igen.'
});

app.use('/ask', askLimiter);

// Test-endpoint
//app.get('/', (req, res) => {
 // res.send('Försäkringskassan-botten är igång!');
//});

// POST-endpoint som tar emot frågor
app.post('/ask', async (req, res) => {
  const userQuestion = sanitizeHtml(req.body.question, {
  allowedTags: [],
  allowedAttributes: {}
});


  try {
  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'Du är en mycket kunnig kundtjänstag...'},
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
  res.json({ answer }); // ✅ Avslutningen av try-blocket
} catch (error) {
  console.error('Fel vid samtal till OpenAI:', error.message);
  res.status(500).json({
    answer: "Ett tekniskt fel uppstod. Försök igen senare eller kontakta support."
  });
}


});
app.use(express.static('public'));

app.listen(port, () => {
  console.log(`Servern körs på http://localhost:${port}`);
});
