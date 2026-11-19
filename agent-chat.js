/* POST /api/agent-chat – eine Gesprächsrunde mit dem KI-Agenten.
 * Eingabe: token, messages (Verlauf), context (Abschnitt, Scrollrichtung, Lesetiefe, Rechnerwerte), stage (bisher).
 * Ausgabe: reply, suggestions, action, target_section, stage. Bewertung + Lead-Felder bleiben serverseitig (→ n8n). */
'use strict';
const { env, send, originAllowed, rateLimited, verifyToken, redactPII, clip, toN8n } = require('./_agent');
const { structured, LLMError } = require('./_agent');
const { systemPrompt, REPLY_SCHEMA, SECTIONS } = require('./_agent');

const RANK = { new: 0, engaged: 1, not_fit: 1, qualified: 2, booked: 3 };
const num = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null; };

function contextBlock(c) {
  if (!c || typeof c !== 'object') return 'Kein Seitenkontext verfügbar.';
  const lines = [];
  const sec = SECTIONS.includes(c.section) ? c.section : 'unbekannt';
  lines.push(`Aktueller Abschnitt: ${sec}${c.sectionTitle ? ` („${clip(c.sectionTitle, 120)}“)` : ''}`);
  if (c.direction) lines.push(`Scrollrichtung zuletzt: ${c.direction === 'up' ? 'nach oben (geht zurück)' : 'nach unten (liest weiter)'}`);
  if (c.depth != null) lines.push(`Gelesen bis: ${num(c.depth, 0, 100)} % der Seite`);
  if (Array.isArray(c.visited)) lines.push(`Bisher angesehen: ${c.visited.filter((s) => SECTIONS.includes(s)).slice(0, 12).join(', ') || '–'}`);
  if (c.seconds != null) lines.push(`Zeit auf der Seite: ${Math.round(num(c.seconds, 0, 36000) / 60)} Min.`);
  const k = c.calculator;
  if (k && typeof k === 'object') {
    const touched = k.touched ? 'vom Besucher eingestellt' : 'Standardwerte, noch nicht verändert';
    lines.push(`Aufwandsrechner (${touched}): ${num(k.people, 0, 500)} Personen · ${num(k.hours, 0, 60)} Std./Woche pro Person · ${num(k.rate, 0, 500)} €/Std. · Automatisierungsgrad ${num(k.auto, 0, 100)} %` +
      ` → ca. ${num(k.savedYear, 0, 1e9)} € gespart/Jahr, ${num(k.hoursMonth, 0, 1e6)} Std. zurück/Monat, ${num(k.eurMonth, 0, 1e8)} €/Monat.`);
  }
  return lines.join('\n');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  if (!originAllowed(req)) return send(res, 403, { error: 'origin' });
  if (rateLimited(req, 'chat', 40, 10 * 60 * 1000)) return send(res, 429, { error: 'rate' });

  const b = typeof req.body === 'string' ? safeJSON(req.body) : (req.body || {});
  let session;
  try { session = verifyToken(b.token); } catch (e) { console.error(e.message); return send(res, 500, { error: 'config' }); }
  if (!session) return send(res, 401, { error: 'session' });

  // Verlauf begrenzen, Rollen erzwingen, PII im Freitext entfernen (Kontaktdaten kennt der Server aus dem Token)
  const history = (Array.isArray(b.messages) ? b.messages : []).slice(-16)
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: m.role === 'user' ? redactPII(clip(m.content, 1200)) : clip(m.content, 1500) }));
  if (!history.length || history[history.length - 1].role !== 'user') return send(res, 400, { error: 'messages' });

  const lang = b.lang === 'en' ? 'en' : session.lang;
  const firstName = session.name.split(/\s+/)[0];
  const ctx = `SEITENKONTEXT (automatisch, nicht vom Besucher geschrieben)\n${contextBlock(b.context)}\nBesucher: ${firstName} (Kontaktdaten liegen vor).`;

  let out;
  try {
    out = await structured({
      system: systemPrompt(lang) + '\n\n' + ctx,
      messages: history,
      schema: REPLY_SCHEMA,
      name: 'agent_turn',
      model: env('AGENT_MODEL', env('LLM_PROVIDER') === 'azure' ? env('AZURE_OPENAI_DEPLOYMENT', 'gpt-4.1-mini') : 'gpt-4.1-mini'),
    });
  } catch (e) {
    console.error('agent chat:', e instanceof LLMError ? e.message : e);
    return send(res, 502, { error: 'llm' });
  }

  const prev = RANK[b.stage] != null ? b.stage : 'new';
  const stage = out.stage;
  const score = Math.max(0, Math.min(100, out.score | 0));
  const escalated = RANK[stage] > RANK[prev] && (stage === 'qualified' || stage === 'booked');
  const wantsContact = out.action === 'book_meeting' || out.action === 'callback';

  if (escalated || (wantsContact && b.stage !== 'booked')) {
    await toN8n(stage === 'booked' || out.action === 'callback' ? 'lead.booking_intent' : 'lead.qualified', {
      session_id: session.sid,
      contact: { name: session.name, email: session.email, phone: session.phone },
      lead: out.lead, score, stage, action: out.action, summary: out.summary,
      calculator: b.context && b.context.calculator ? b.context.calculator : null,
      last_section: b.context && b.context.section, lang,
    });
  }

  return send(res, 200, {
    reply: out.reply,
    suggestions: (out.suggestions || []).slice(0, 3).map((s) => clip(s, 40)),
    action: out.action,
    target_section: SECTIONS.includes(out.target_section) ? out.target_section : null,
    stage: RANK[stage] >= RANK[prev] ? stage : prev,
    booking_url: env('BOOKING_URL') || null,
  });
};

function safeJSON(s) { try { return JSON.parse(s); } catch (e) { return {}; } }
module.exports.contextBlock = contextBlock;
