// 📁 Project: AI Reflection Assistant (with working Twilio call script + DB integration)
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
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const VoiceResponse = twilio.twiml.VoiceResponse;

// ==== Make Nightly Call ====
async function makeCall() {
  try {
    const call = await client.calls.create({
      url: `${process.env.BASE_URL}/voice`,
      to: process.env.USER_PHONE_NUMBER,
      from: process.env.TWILIO_PHONE_NUMBER
    });
    console.log('Call initiated:', call.sid);
  } catch (error) {
    console.error('Call failed:', error);
  }
}

// ==== Trigger Call Manually ====
app.get('/trigger-call', async (req, res) => {
  await makeCall();
  res.send('Call initiated');
});

// ==== Twilio Call Flow ====
app.post('/voice', (req, res) => {
  const twiml = new VoiceResponse();
  const gather = twiml.gather({ input: 'speech', action: '/process', method: 'POST' });
  gather.say(
    'Hi, this is your AI assistant. How was your day today? Tell me about your energy, what went well, one thing you learned, and three things you are grateful for.'
  );
  res.type('text/xml');
  res.send(twiml.toString());
});

// ==== Process Reflection ====
app.post('/process', async (req, res) => {
  const speech = req.body.SpeechResult || 'No speech detected';
  const timestamp = new Date();

  const summaryPrompt = `Summarize the following reflection. Extract energy level (low/medium/high) and list 3 gratitude points:
"${speech}"`;

  let summary = '', energy = '', gratitude = [];
  try {
    const gptResponse = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'You are a journaling assistant that summarizes reflections.' },
        { role: 'user', content: summaryPrompt }
      ]
    });

    summary = gptResponse.choices[0].message.content;

    // (Optional) Use regex to extract energy & gratitude
    const energyMatch = summary.match(/energy.*?(low|medium|high)/i);
    energy = energyMatch ? energyMatch[1].toLowerCase() : 'unknown';

    const gratitudeMatch = summary.match(/grateful for:?(.*)/i);
    if (gratitudeMatch) {
      gratitude = gratitudeMatch[1]
        .split(/,|and|\n|\*/)
        .map(item => item.trim())
        .filter(Boolean)
        .slice(0, 3);
    }
  } catch (err) {
    summary = 'Error summarizing';
    console.error('OpenAI error:', err);
  }

  const journal = new Journal({ timestamp, rawText: speech, summary, energy, gratitude });
  await journal.save();

  const twiml = new VoiceResponse();
  twiml.say('Thank you. Your reflection has been saved. Good night!');
  res.type('text/xml');
  res.send(twiml.toString());
});

// ==== Review Journal Entries ====
app.get('/journals', async (req, res) => {
  const logs = await Journal.find({}).sort({ timestamp: -1 });
  res.json(logs);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// ==== .env Example (DO NOT COMMIT TO PUBLIC REPO) ====
// MONGO_URI=mongodb://localhost:27017/assistantdb
// TWILIO_ACCOUNT_SID=your_twilio_sid
// TWILIO_AUTH_TOKEN=your_twilio_auth
// TWILIO_PHONE_NUMBER=+1234567890
// USER_PHONE_NUMBER=+91xxxxxxxxxx
// OPENAI_API_KEY=sk-...
// BASE_URL=https://your-ngrok-or-deployed-url
