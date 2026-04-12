/// <reference path="../pb_data/types.d.ts" />

/**
 * Dynamic Open Graph tags for /race/:id.
 *
 * PocketBase serves the SPA from --publicDir=./dist, so a bot fetching
 * /race/abc123 gets the generic index.html with no race-specific meta.
 * This hook intercepts GET requests to /race/:id when the user-agent is
 * a known social-media crawler and responds with a minimal HTML document
 * carrying og:* tags for the requested race. Real browsers skip this path
 * and hit the static SPA as usual.
 */

console.log('[race_og_tags] hook file loaded')

routerUse((e) => {
  // PB JSVM scope: everything must live inside the callback because
  // top-level consts/functions are not captured across request boundaries.
  const BOT_RE = /bot|crawler|spider|facebookexternalhit|whatsapp|telegrambot|twitterbot|slackbot|linkedinbot|discordbot|preview/i
  const escapeHtml = (s) => String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

  const path = e.request.url.path
  const m = /^\/race\/([a-z0-9]+)\/?$/.exec(path)
  if (!m) return e.next()

  const ua = (e.request.header.get('User-Agent') || '').toLowerCase()
  if (!BOT_RE.test(ua)) return e.next()

  const raceId = m[1]
  let race
  try {
    race = $app.findRecordById('races', raceId)
  } catch (err) {
    return e.next()
  }

  if (!race.getBool('is_public')) {
    // Don't leak private race info to crawlers
    return e.next()
  }

  const name = escapeHtml(race.getString('name'))
  const activity = race.getString('activity_type') || 'running'
  const targetKm = race.getFloat('target_distance_km')
  const targetSec = race.getFloat('target_duration_seconds')
  const mode = race.getString('mode')

  let subtitle = activity.toUpperCase()
  if (mode === 'distance' && targetKm > 0) subtitle += ` · ${targetKm} km`
  else if (mode === 'time' && targetSec > 0) subtitle += ` · ${Math.round(targetSec / 60)} min`

  const description = escapeHtml(`Únete a esta carrera en Calistenia — ${subtitle}`)
  const proto = e.request.header.get('X-Forwarded-Proto') || 'https'
  const host = e.request.header.get('X-Forwarded-Host') || e.request.host || ''
  const url = `${proto}://${host}/race/${raceId}`
  const imageUrl = `${proto}://${host}/logo-bg-less.png`

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${name} — Calistenia Race</title>
<meta name="description" content="${description}">
<meta property="og:type" content="website">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${name} — Calistenia Race">
<meta property="og:description" content="${description}">
<meta property="og:image" content="${imageUrl}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${name} — Calistenia Race">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${imageUrl}">
</head>
<body>
<h1>${name}</h1>
<p>${escapeHtml(subtitle)}</p>
<p><a href="${url}">Abrir en Calistenia App</a></p>
</body>
</html>`

  return e.html(200, html)
})
