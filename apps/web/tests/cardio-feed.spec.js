import { test, expect, request as pwRequest } from '@playwright/test'
import { register } from './helpers.js'

// Mismo PB que usa el navegador (VITE_POCKETBASE_URL del server bajo test);
// PB_URL permite apuntar a un stack efímero en otro puerto.
const PB = process.env.PB_URL || 'http://127.0.0.1:8090'

// Create + auth a user straight against PocketBase (no browser needed).
async function makeUser(api, tag) {
  const email = `cf_${tag}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@test.com`
  await api.post(`${PB}/api/collections/users/records`, {
    data: { email, password: 'TestPass123!', passwordConfirm: 'TestPass123!', display_name: tag },
  })
  const auth = await api.post(`${PB}/api/collections/users/auth-with-password`, {
    data: { identity: email, password: 'TestPass123!' },
  })
  const body = await auth.json()
  return { email, token: body.token, id: body.record.id }
}

test('cardio session shows in a friend feed as a commentable activity item', async ({ browser }) => {
  test.setTimeout(90_000)

  const api = await pwRequest.newContext()

  // ── User A (Alice) + a cardio session — all via PocketBase REST ─────────────
  const A = await makeUser(api, 'alice')
  const cardioRes = await api.post(`${PB}/api/collections/cardio_sessions/records`, {
    headers: { Authorization: A.token },
    data: {
      user: A.id, activity_type: 'running', distance_km: 5.2, duration_seconds: 1570,
      avg_pace: 5.03, started_at: new Date(Date.now() - 1600_000).toISOString(),
      finished_at: new Date().toISOString(), note: 'morning run test',
    },
  })
  expect(cardioRes.status(), JSON.stringify(await cardioRes.json())).toBe(200)
  const cardio = await cardioRes.json()

  // ── User B (Bob) registers in the browser and follows Alice ─────────────────
  const ctxB = await browser.newContext()
  const pageB = await ctxB.newPage()
  await register(pageB, { name: 'Bob Watcher' })
  const B = await pageB.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('pocketbase_auth'))
    return { token: p.token, id: p.record?.id || p.model?.id }
  })
  const followRes = await api.post(`${PB}/api/collections/follows/records`, {
    headers: { Authorization: B.token },
    data: { follower: B.id, following: A.id },
  })
  expect(followRes.status(), JSON.stringify(await followRes.json())).toBe(200)

  // ── Bob opens the activity feed → Alice's cardio appears as a card ──────────
  // (register() already marked tours seen; goto directly to avoid the flaky
  //  PWA-prompt dismissal in the shared dismissOverlays helper.)
  // register()'s tour list omits 'feed' — seed it so the feed tour popover
  // doesn't cover the comment button.
  await pageB.evaluate((uid) => {
    localStorage.setItem('calistenia_tour_feed', 'true')
    localStorage.setItem(`calistenia_tour_feed_${uid}`, 'true')
  }, B.id)
  await pageB.goto('/feed')
  await pageB.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
  await expect(pageB.getByText(/Hizo cardio/i).first()).toBeVisible({ timeout: 12000 })
  await expect(pageB.getByText(/Carrera/).first()).toBeVisible()
  await expect(pageB.getByText(/5\.20 km/).first()).toBeVisible()
  await expect(pageB.getByText(/morning run test/).first()).toBeVisible()

  // ── Bob comments on the cardio item through the UI ──────────────────────────
  await pageB.getByRole('button', { name: /Comentarios|Comments/i }).first().click()
  const input = pageB.getByPlaceholder(/Escribe un comentario|Write a comment/i)
  await expect(input).toBeVisible({ timeout: 8000 })
  await input.fill('great run!')
  await input.press('Enter')
  await expect(pageB.getByText('great run!').first()).toBeVisible({ timeout: 8000 })

  // ── The comment persisted against the cardio record id ──────────────────────
  const check = await api.get(
    `${PB}/api/collections/comments/records?filter=` + encodeURIComponent(`session_id='${cardio.id}'`),
    { headers: { Authorization: B.token } },
  )
  const comments = await check.json()
  expect(comments.totalItems).toBeGreaterThan(0)
  expect(comments.items[0].text).toBe('great run!')

  await api.dispose()
  await ctxB.close()
})
