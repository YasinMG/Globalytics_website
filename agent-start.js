/* POST /api/agent-start – Kontaktdaten erfassen (Name, E-Mail, Telefon + Einwilligung), Sitzung starten. */
'use strict';
const crypto = require('crypto');
const { env, send, originAllowed, rateLimited, signToken, clip, toN8n } = require('./_agent');

const CONSENT_VERSION = '2026-11-19';
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i;
const PHONE = /^\+?[0-9][0-9 ()/.-]{5,24}$/;

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  if (!originAllowed(req)) return send(res, 403, { error: 'origin' });
  if (rateLimited(req, 'start', 6, 10 * 60 * 1000)) return send(res, 429, { error: 'Zu viele Versuche – bitte später erneut.' });

  const b = typeof req.body === 'string' ? safeJSON(req.body) : (req.body || {});
  if (b.website) return send(res, 200, { ok: true, token: null }); // Honeypot: Bots still ignorieren

  const name = clip(b.name, 80);
  const email = clip(b.email, 200).toLowerCase();
  const phone = clip(b.phone, 30);
  const lang = b.lang === 'en' ? 'en' : 'de';
  if (name.length < 2) return send(res, 400, { error: 'name' });
  if (!EMAIL.test(email)) return send(res, 400, { error: 'email' });
  if (!PHONE.test(phone) || phone.replace(/\D/g, '').length < 6) return send(res, 400, { error: 'phone' });
  if (b.consent !== true) return send(res, 400, { error: 'consent' });

  let token;
  const sid = crypto.randomUUID();
  try {
    token = signToken({ sid, name, email, phone, lang, exp: Date.now() + 3 * 60 * 60 * 1000 });
  } catch (e) {
    console.error(e.message);
    return send(res, 500, { error: 'config' });
  }

  await toN8n('lead.started', {
    session_id: sid,
    contact: { name, email, phone },
    consent: { given: true, version: CONSENT_VERSION, at: new Date().toISOString() },
    lang,
    page: clip(b.page, 200),
    context: sanitizeContext(b.context),
  });

  return send(res, 200, {
    ok: true,
    token,
    session_id: sid,
    booking_url: env('BOOKING_URL') || null,
    first_name: name.split(/\s+/)[0],
  });
};

function safeJSON(s) { try { return JSON.parse(s); } catch (e) { return {}; } }
function sanitizeContext(c) {
  if (!c || typeof c !== 'object') return null;
  return { section: clip(c.section, 40), sectionTitle: clip(c.sectionTitle, 120), depth: Number(c.depth) || 0 };
}
module.exports.safeJSON = safeJSON;
