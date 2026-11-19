/* POST /api/agent-stt – gesprochene Äußerung (WAV 16 kHz, base64) → Text. Nur mit gültiger Agent-Sitzung. */
'use strict';
const { send, originAllowed, rateLimited, verifyToken } = require('./_agent');
const { transcribe, VoiceError } = require('./_voice');

const MAX_BYTES = 2.6 * 1024 * 1024; // ≈ 80 s Sprache bei 16 kHz mono; Vercel-Limit für den Request: 4,5 MB

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  if (!originAllowed(req)) return send(res, 403, { error: 'origin' });
  if (rateLimited(req, 'stt', 90, 10 * 60 * 1000)) return send(res, 429, { error: 'rate' });
  const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  let session;
  try { session = verifyToken(b.token); } catch (e) { return send(res, 500, { error: 'config' }); }
  if (!session) return send(res, 401, { error: 'session' });
  if (typeof b.audio !== 'string' || !b.audio) return send(res, 400, { error: 'audio' });
  const wav = Buffer.from(b.audio, 'base64');
  if (wav.length < 3200 || wav.length > MAX_BYTES) return send(res, 400, { error: 'audio_size' });
  try {
    const text = await transcribe(wav, b.lang === 'en' ? 'en' : session.lang);
    return send(res, 200, { text: text.slice(0, 1200) });
  } catch (e) {
    console.error('agent stt:', e instanceof VoiceError ? e.message : e);
    return send(res, 502, { error: 'stt' });
  }
};
