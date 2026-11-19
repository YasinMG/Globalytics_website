/* POST /api/agent-tts – Antworttext → natürliche Stimme (Gemini oder OpenAI). Nur mit gültiger Agent-Sitzung. */
'use strict';
const { send, originAllowed, rateLimited, verifyToken, clip } = require('./_agent');
const { synthesize, VoiceError } = require('./_voice');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  if (!originAllowed(req)) return send(res, 403, { error: 'origin' });
  if (rateLimited(req, 'tts', 150, 10 * 60 * 1000)) return send(res, 429, { error: 'rate' });
  const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  let session;
  try { session = verifyToken(b.token); } catch (e) { return send(res, 500, { error: 'config' }); }
  if (!session) return send(res, 401, { error: 'session' });
  const text = clip(b.text, 600);
  if (!text) return send(res, 400, { error: 'text' });
  try {
    const { audio, mime } = await synthesize(text, b.lang === 'en' ? 'en' : session.lang);
    res.statusCode = 200;
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Length', audio.length);
    return res.end(audio);
  } catch (e) {
    console.error('agent tts:', e instanceof VoiceError ? e.message : e);
    return send(res, 502, { error: 'tts' });
  }
};
