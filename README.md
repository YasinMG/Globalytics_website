# Globalytics – Website

Statische One-Page-Website ohne Build-Schritt und ohne externe Abhängigkeiten. Schriften, Bilder und Video liegen lokal, es werden keine Daten an Google oder andere Drittanbieter übertragen.

## Struktur

```
index.html              Seite inkl. CSS, SEO-Meta-Tags und strukturierten Daten
assets/js/main.js       Slide-Regler, mobiles Menü, Video, Insights-Filter, Formular
assets/fonts/           Inter Tight und JetBrains Mono (selbst gehostet, WOFF2)
assets/img/             Logos, Porträts, Favicon, Social-Media-Vorschaubild
assets/video/           Werbevideo (H.264, ca. 7 MB) und Vorschaubild
robots.txt, sitemap.xml SEO
.htaccess               HTTPS/www-Weiterleitung, Caching, Komprimierung, Sicherheits-Header (Apache)
```

## Veröffentlichen

1. Den gesamten Ordnerinhalt in das Web-Root-Verzeichnis der Domain hochladen (bei Hostinger: `public_html`). Die versteckte Datei `.htaccess` mit hochladen.
2. SSL-Zertifikat für `globalytics.org` und `www.globalytics.org` aktivieren.
3. `https://www.globalytics.org` aufrufen und testen: Regler, mobiles Menü, Video, Formular.
4. Sitemap in der Google Search Console einreichen.

Die `.htaccess` leitet auf `https://www.globalytics.org` um. Falls die Domain ohne `www` laufen soll: die Weiterleitung anpassen und die URLs in `index.html` (canonical, og:url, og:image), `robots.txt` und `sitemap.xml` entsprechend ändern.

## Konfiguration (`assets/js/main.js`)

- `RADAR_URL`: Ziel des Reglers „Potenziale entdecken“ (aktuell `https://survey.globalytics.org/`).
- `FORM_ENDPOINT`: URL, an die das Lead-Formular als JSON gesendet wird, z. B. ein n8n-Webhook. Felder: `name`, `email`, `company`, `consent`, `source`, `submittedAt`. Solange leer, öffnet das Formular das E-Mail-Programm mit einer vorausgefüllten Anfrage an solutions@globalytics.org.

## Vor dem Livegang prüfen

- Datenschutzerklärung um Formular/Webhook-Verarbeitung, Hosting-Anbieter, Rechtsgrundlagen (Art. 6 DSGVO) und Beschwerderecht ergänzen bzw. rechtlich prüfen lassen.
- Insights-Beiträge: Die Teaser verweisen aktuell auf das KI-Potenzial-Radar bzw. das Kontaktformular. Sobald es eigene Artikelseiten oder LinkedIn-Beiträge gibt, die Links in `index.html` anpassen.
