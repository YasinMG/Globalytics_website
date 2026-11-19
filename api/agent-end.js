/* POST /api/agent-end – Gesprächsende (Schließen des Widgets / Verlassen der Seite, per sendBeacon).
 * Schickt das Transkript an n8n → CRM-Eintrag + Follow-up per E-Mail/WhatsApp. Es wird nichts gespeichert. */
'use strict';
const { send, originAllowed, rateLimited, verifyToken, redactPII, clip, toN8n } = require('./_agent');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  if (!originAllowed(req)) return send(res, 403, { error: 'origin' });
  if (rateLimited(req, 'end', 10, 10 * 60 * 1000)) return send(res, 429, { error: 'rate' });

  let b = req.body || {};
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  let session;
  try { session = verifyToken(b.token); } catch (e) { return send(res, 500, { error: 'config' }); }
  if (!session) return send(res, 401, { error: 'session' });

  const transcript = (Array.isArray(b.messages) ? b.messages : []).slice(-40)
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
    .map((m) => ({ role: m.role, content: m.role === 'user' ? redactPII(clip(m.content, 1200)) : clip(m.content, 1500) }));
  if (!transcript.some((m) => m.role === 'user')) return send(res, 200, { ok: true, skipped: true });

  await toN8n('lead.conversation', {
    session_id: session.sid,
    contact: { name: session.name, email: session.email, phone: session.phone },
    stage: clip(b.stage, 20) || 'new',
    reason: clip(b.reason, 20),
    calculator: b.calculator && typeof b.calculator === 'object' ? b.calculator : null,
    visited: Array.isArray(b.visited) ? b.visited.slice(0, 12).map((s) => clip(s, 30)) : [],
    transcript,
    lang: session.lang,
  });
  return send(res, 200, { ok: true });
};
