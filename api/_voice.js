/* Sprach-Schicht des Globalytics-Agenten (portiert aus EKEP llm/gemini_speech.py + provider.py).
 * STT: OpenAI gpt-4o-mini-transcribe (Fallback whisper-1) oder Gemini generateContent mit Audio.
 * TTS: Gemini 2.5 TTS (natürlichste Stimme, PCM → WAV) oder OpenAI gpt-4o-mini-tts.
 * Schlüssel nur serverseitig. Audio wird nicht gespeichert. */
'use strict';
const { env } = require('./_agent');

class VoiceError extends Error {}
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
const SILENCE = '[KEINE_SPRACHE]';

const sttEngine = () => env('STT_ENGINE') || (env('OPENAI_API_KEY') ? 'openai' : 'gemini');
const ttsEngine = () => env('TTS_ENGINE') || (env('GEMINI_API_KEY') ? 'gemini' : 'openai');

async function timed(url, opts, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctrl.signal }); }
  catch (e) { throw new VoiceError('Sprachdienst nicht erreichbar: ' + e.message); }
  finally { clearTimeout(t); }
}

function pcmToWav(pcm, rate = 24000) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

async function gemini(model, body, ms) {
  const key = env('GEMINI_API_KEY');
  if (!key) throw new VoiceError('GEMINI_API_KEY fehlt.');
  const r = await timed(`${GEMINI}/models/${model}:generateContent`, {
    method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }, ms);
  const text = await r.text();
  if (!r.ok) throw new VoiceError(`Gemini-Fehler ${r.status}: ${text.slice(0, 300)}`);
  const data = JSON.parse(text);
  const parts = data.candidates?.[0]?.content?.parts;
  if (!parts) throw new VoiceError('Gemini lieferte keine Antwort (' + (data.promptFeedback?.blockReason || data.candidates?.[0]?.finishReason || '?') + ').');
  return parts;
}

const TERMS = 'Globalytics, Power BI, Microsoft Fabric, Azure, Copilot Studio, n8n, KI-Agent, Data Engineering, Business Intelligence, KI-Potenzial-Radar, Aufwandsrechner, Dashboard';

/* ---------------- Speech-to-Text ---------------- */
async function transcribe(wav, lang) {
  const de = lang !== 'en';
  if (sttEngine() === 'gemini') {
    const prompt = (de ? 'Transkribiere die Sprachaufnahme wörtlich auf Deutsch.' : 'Transcribe the recording verbatim in English.') +
      ` Gib ausschließlich das Transkript aus, ohne Einleitung oder Anführungszeichen. Erfinde nichts. Ist keine verständliche Sprache enthalten, gib exakt ${SILENCE} aus. Mögliche Fachbegriffe: ${TERMS}.`;
    const parts = await gemini(env('GEMINI_STT_MODEL', 'gemini-2.5-flash'), {
      contents: [{ role: 'user', parts: [{ text: prompt }, { inline_data: { mime_type: 'audio/wav', data: wav.toString('base64') } }] }],
      generationConfig: { temperature: 0 },
    }, 20000);
    const t = parts.map((p) => p.text || '').join(' ').trim();
    return t.includes(SILENCE) ? '' : t.replace(/^["„“]+|["„“]+$/g, '').trim();
  }
  const key = env('OPENAI_API_KEY');
  if (!key) throw new VoiceError('OPENAI_API_KEY fehlt.');
  const base = (env('OPENAI_BASE_URL') || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const models = [env('STT_MODEL', 'gpt-4o-mini-transcribe'), 'whisper-1'];
  let last = '';
  for (const model of [...new Set(models)]) {
    const fd = new FormData();
    fd.append('file', new Blob([wav], { type: 'audio/wav' }), 'speech.wav');
    fd.append('model', model);
    fd.append('language', de ? 'de' : 'en');
    fd.append('prompt', TERMS);
    const r = await timed(`${base}/audio/transcriptions`, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: fd }, 20000);
    const text = await r.text();
    if (r.ok) return (JSON.parse(text).text || '').trim();
    last = `STT-Fehler ${r.status}: ${text.slice(0, 200)}`;
    if (r.status === 401 || r.status === 429) break;
  }
  throw new VoiceError(last);
}

/* ---------------- Text-to-Speech ---------------- */
const STYLE_DE = 'Sprich wie eine freundliche, kompetente Beraterin im echten Telefongespräch: warm, natürlich, ruhiges Tempo, mit natürlicher Betonung, nicht vorlesend.';
const STYLE_EN = 'Speak like a friendly, competent consultant on a real phone call: warm, natural, relaxed pace, natural intonation, not like reading aloud.';

async function synthesize(text, lang) {
  const style = env('TTS_STYLE') || (lang === 'en' ? STYLE_EN : STYLE_DE);
  if (ttsEngine() === 'gemini') {
    const parts = await gemini(env('GEMINI_TTS_MODEL', 'gemini-2.5-flash-preview-tts'), {
      contents: [{ role: 'user', parts: [{ text: `${style}\n\n${text}` }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: env('GEMINI_TTS_VOICE', 'Kore') } } },
      },
    }, 25000);
    for (const p of parts) {
      const inline = p.inlineData || p.inline_data;
      if (inline && inline.data) {
        const raw = Buffer.from(inline.data, 'base64');
        const mime = inline.mimeType || inline.mime_type || '';
        if (mime.includes('wav') || raw.slice(0, 4).toString() === 'RIFF') return { audio: raw, mime: 'audio/wav' };
        const m = mime.match(/rate=(\d+)/);
        return { audio: pcmToWav(raw, m ? Number(m[1]) : 24000), mime: 'audio/wav' };
      }
    }
    throw new VoiceError('Gemini-TTS lieferte kein Audio.');
  }
  const key = env('OPENAI_API_KEY');
  if (!key) throw new VoiceError('OPENAI_API_KEY fehlt.');
  const base = (env('OPENAI_BASE_URL') || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const r = await timed(`${base}/audio/speech`, {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: env('TTS_MODEL', 'gpt-4o-mini-tts'), voice: env('TTS_VOICE', 'coral'), input: text, instructions: style, response_format: 'mp3' }),
  }, 25000);
  if (!r.ok) throw new VoiceError(`TTS-Fehler ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return { audio: Buffer.from(await r.arrayBuffer()), mime: 'audio/mpeg' };
}

module.exports = { transcribe, synthesize, VoiceError, pcmToWav, sttEngine, ttsEngine };
