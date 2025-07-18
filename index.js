// 📁 Project: AI Reflection Assistant
// Tech stack: Node.js + Express + Twilio + MongoDB + OpenAI

// 1. Install dependencies:
// npm install express twilio mongoose body-parser openai dotenv

require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const { OpenAI } = require('openai');
const twilio = require('twilio');

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// ==== MongoDB Setup ====
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

const JournalSchema = new mongoose.Schema({
  timestamp: Date,
  rawText: String,
  summary: String,
  energy: String,
  gratitude: [String]
});

const Journal = mongoose.model('Journal', JournalSchema);

// ==== OpenAI Setup ====
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ==== Twilio Setup ====
const VoiceResponse = twilio.twiml.VoiceResponse;

app.post('/voice', (req, res) => {
  const twiml = new VoiceResponse();
  const gather = twiml.gather({ input: 'speech', action: '/process', method: 'POST' });
  gather.say(
    'Hi, this is your AI assistant. How was your day today? Please speak after the beep.'
  );
  res.type('text/xml');
  res.send(twiml.toString());
});

app.post('/process', async (req, res) => {
  const speech = req.body.SpeechResult;
  const timestamp = new Date();

  const summaryPrompt = `Summarize the following reflection and extract the energy level and 3 gratitude points:
"${speech}"`;

  const gptResponse = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      { role: 'system', content: 'You summarize user reflections.' },
      { role: 'user', content: summaryPrompt }
    ]
  });

  const summary = gptResponse.choices[0].message.content;

  const journal = new Journal({
    timestamp,
    rawText: speech,
    summary,
    energy: 'To be extracted manually or with regex',
    gratitude: []
  });

  await journal.save();

  const twiml = new VoiceResponse();
  twiml.say('Thank you! Your reflection has been saved. Have a good night.');
  res.type('text/xml');
  res.send(twiml.toString());
});

// ==== Endpoint to List Journals ====
app.get('/journals', async (req, res) => {
  const logs = await Journal.find({}).sort({ timestamp: -1 });
  res.json(logs);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// ==== .env Example (DO NOT COMMIT TO PUBLIC REPO) ====
// MONGO_URI=mongodb://localhost:27017/assistantdb
// TWILIO_ACCOUNT_SID=...
// TWILIO_AUTH_TOKEN=...
// OPENAI_API_KEY=...

// To test Twilio locally: use ngrok to expose localhost
// ngrok http 3000
// Add /voice URL to Twilio number webhook
