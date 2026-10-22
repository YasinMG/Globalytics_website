/* Globalytics – main.js
   Konfiguration: die beiden Konstanten unten anpassen. */
(function () {
  'use strict';

  // Ziel des Reglers „Potenziale entdecken“ (KI-Potenzial-Radar)
  var RADAR_URL = 'https://survey.globalytics.org/';

  // Endpunkt für das Lead-Formular, z. B. ein n8n-Webhook:
  // 'https://n8n.example.com/webhook/globalytics-lead'
  // Leer lassen = Fallback: das E-Mail-Programm öffnet sich mit vorausgefüllter Anfrage.
  var FORM_ENDPOINT = '';

  var CONTACT_MAIL = 'solutions@globalytics.org';

  var reduceMotion = false;
  try { reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  /* ---------- Jahr im Footer ---------- */
  var year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());

  /* ---------- Mobile Navigation ---------- */
  var header = document.querySelector('.site-header');
  var menuBtn = document.querySelector('.nav-menu');
  function setMenu(open) {
    if (!header || !menuBtn) return;
    header.classList.toggle('nav-open', open);
    menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    menuBtn.setAttribute('aria-label', open ? 'Menü schließen' : 'Menü öffnen');
  }
  if (header && menuBtn) {
    menuBtn.addEventListener('click', function () {
      setMenu(!header.classList.contains('nav-open'));
    });
    header.querySelectorAll('.nav-links a').forEach(function (a) {
      a.addEventListener('click', function () { setMenu(false); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && header.classList.contains('nav-open')) { setMenu(false); menuBtn.focus(); }
    });
  }

  /* ---------- Navigation zu Zielen ---------- */
  function goTo(target) {
    if (target === 'radar') {
      window.open(RADAR_URL, '_blank', 'noopener');
      return;
    }
    var el = document.getElementById(target);
    if (el) el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }

  /* ---------- Slide-Regler im Hero ---------- */
  document.querySelectorAll('[data-slider]').forEach(function (knob) {
    var track = knob.parentElement;
    var fill = track.children[0];
    var label = track.children[1];
    var target = knob.getAttribute('data-slider');
    var anim = knob.style.transition;
    var x = 0, start = 0, max = 0, dragging = false, done = false;

    function measure() { max = Math.max(40, track.clientWidth - 12 - knob.offsetWidth); }
    function setAnim(on) { var t = on ? anim : 'none'; knob.style.transition = t; fill.style.transition = t; }
    function render() {
      knob.style.transform = 'translateX(' + x + 'px)';
      fill.style.width = (x + 60) + 'px';
      label.style.opacity = done ? '1' : String(Math.max(0, 1 - (x / (max || 1)) * 1.8));
    }
    function setDone(on) {
      done = on;
      track.querySelectorAll('.gl-idle').forEach(function (el) { el.hidden = on; });
      track.querySelectorAll('.gl-done').forEach(function (el) { el.hidden = !on; });
    }
    function complete() {
      measure();
      setAnim(true);
      x = max;
      setDone(true);
      render();
      setTimeout(function () { goTo(target); }, 420);
      setTimeout(function () { x = 0; setDone(false); render(); }, 1700);
    }
    function end() {
      if (!dragging) return;
      dragging = false;
      if (x >= max * 0.85) { complete(); }
      else { setAnim(true); x = 0; render(); }
    }

    knob.addEventListener('pointerdown', function (e) {
      if (done) return;
      measure();
      dragging = true;
      start = e.clientX - x;
      setAnim(false);
      try { knob.setPointerCapture(e.pointerId); } catch (err) {}
    });
    knob.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      x = Math.max(0, Math.min(max, e.clientX - start));
      render();
    });
    knob.addEventListener('pointerup', end);
    knob.addEventListener('pointercancel', end);
    knob.addEventListener('keydown', function (e) {
      if (done) return;
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') { e.preventDefault(); complete(); }
    });
  });

  /* ---------- Video: nur abspielen, wenn sichtbar ---------- */
  var video = document.querySelector('video');
  if (video) {
    video.muted = true;
    if (!reduceMotion && 'IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            var p = video.play();
            if (p && p.catch) p.catch(function () {});
          } else {
            video.pause();
          }
        });
      }, { threshold: 0.3 });
      io.observe(video);
    }
  }

  /* ---------- Insights-Filter ---------- */
  var filters = document.querySelectorAll('.gl-filter');
  filters.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var f = btn.getAttribute('data-filter');
      filters.forEach(function (b) { b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'); });
      document.querySelectorAll('#insights [data-cat]').forEach(function (card) {
        card.hidden = !(f === 'alle' || card.getAttribute('data-cat') === f);
      });
    });
  });

  /* ---------- Lead-Formular ---------- */
  var form = document.getElementById('lead-form');
  if (form) {
    var status = document.getElementById('form-status');
    var submit = form.querySelector('button[type="submit"]');
    function field(n) { var el = form.elements[n]; return el ? el : null; }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      if (field('website') && field('website').value) return; // Spam-Schutz

      var data = {
        name: field('name').value.trim(),
        email: field('email').value.trim(),
        company: field('company') ? field('company').value.trim() : '',
        consent: field('consent').checked,
        source: 'globalytics.org',
        submittedAt: new Date().toISOString()
      };

      if (!FORM_ENDPOINT) {
        var subject = 'Potenzialanfrage' + (data.company ? ' – ' + data.company : '');
        var body = 'Name: ' + data.name + '\nE-Mail: ' + data.email + '\nUnternehmen: ' + data.company + '\n\nIch möchte das Potenzial meiner Daten einschätzen lassen.';
        window.location.href = 'mailto:' + CONTACT_MAIL + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
        if (status) status.textContent = 'Ihr E-Mail-Programm öffnet sich mit Ihrer Anfrage.';
        return;
      }

      if (submit) { submit.disabled = true; submit.style.opacity = '0.6'; }
      if (status) status.textContent = 'Wird gesendet …';
      fetch(FORM_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      }).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        if (status) status.textContent = 'Vielen Dank! Wir melden uns in Kürze bei Ihnen.';
        form.reset();
      }).catch(function () {
        if (status) status.textContent = 'Das hat leider nicht geklappt. Bitte schreiben Sie uns an ' + CONTACT_MAIL + '.';
      }).then(function () {
        if (submit) { submit.disabled = false; submit.style.opacity = ''; }
      });
    });
  }
})();
