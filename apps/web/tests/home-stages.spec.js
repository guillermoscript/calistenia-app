import { test, expect } from '@playwright/test'
import { register, navigateTo } from './helpers.js'

/**
 * Inicio «qué hago hoy» por estados (#855), contra un PocketBase real.
 *
 * Un usuario recién registrado (sin programa activo: el onboarding se salta)
 * pasa por: 0 entrenos (`first_workout`), 1 entreno hoy (`no_program`: hay
 * entrenos en la cuenta pero ningún programa) y 3 entrenos («Para ti» ya
 * permitido). Los entrenos se crean por REST con el token del propio usuario,
 * así que pasan por el hook que mantiene el contador de la cuenta.
 *
 * Además se mira la RED: el inicio no pide `water_entries` ni `sleep_entries`
 * en ningún tramo (el agua solo vive en /nutrition).
 *
 * No depende de datos sembrados: vale para el PB efímero del CI.
 */
const PB_URL = process.env.PB_URL || 'http://127.0.0.1:8090'
/** Lo que el inicio ya no pide nunca: agua, sueño, insights y ranking (#855). */
const FORBIDDEN_REQUESTS = /\/api\/collections\/(water_entries|sleep_entries|user_insights|public_user_stats|public_prs)\/records/
/** Consultas de «Para ti»: solo desde el 3.er entreno de la cuenta. */
const PARA_TI_REQUESTS = /\/api\/collections\/(challenge_participants|follows|community_programs)\/records/

async function authOf(page) {
  return page.evaluate(() => {
    const parsed = JSON.parse(localStorage.getItem('pocketbase_auth') || '{}')
    return { token: parsed?.token || '', userId: parsed?.record?.id || parsed?.model?.id || '' }
  })
}

/** Crea un entreno completado hace `n` días por cada `n` de `daysAgo`. */
async function addSessions(request, auth, daysAgo) {
  for (const n of daysAgo) {
    const at = new Date()
    at.setDate(at.getDate() - n)
    const res = await request.post(`${PB_URL}/api/collections/sessions/records`, {
      headers: { Authorization: auth.token },
      data: { user: auth.userId, workout_key: 'p1_lun', phase: 1, day: 'lun', completed_at: at.toISOString() },
    })
    expect(res.ok(), `no se pudo crear la sesión: ${await res.text()}`).toBeTruthy()
  }
}

/** Abre el inicio desde cero y devuelve las peticiones prohibidas (agua/sueño). */
async function openHome(page) {
  const seen = []
  const paraTi = []
  const onRequest = (req) => {
    if (FORBIDDEN_REQUESTS.test(req.url())) seen.push(req.url())
    if (PARA_TI_REQUESTS.test(req.url())) paraTi.push(req.url())
  }
  page.on('request', onRequest)
  // Las sesiones se crean por REST, a espaldas de la app: sin tirar el caché
  // persistido de React Query, la recarga daría por frescos (30-60 s) los
  // contadores de antes. En uso real no pasa: terminar un entreno actualiza
  // el progreso al momento.
  await page.evaluate(() => localStorage.removeItem('calistenia_rq_cache'))
  await navigateTo(page, '/')
  await expect(page.locator('[data-testid="home-today"]')).toBeVisible({ timeout: 10000 })
  // Margen para que salga cualquier query que el inicio fuera a lanzar.
  await page.waitForTimeout(1500)
  page.off('request', onRequest)
  return { forbidden: seen, paraTi }
}

test('el inicio cambia de estado con los entrenos y nunca pide agua ni sueño (#855)', async ({ page, request }) => {
  test.setTimeout(120_000)
  await register(page)
  const auth = await authOf(page)
  expect(auth.token, 'no hay token de PB en localStorage').toBeTruthy()
  // La encuesta «¿cómo conociste la app?» (#586) abre un diálogo modal a los
  // 4 s que saca del árbol de accesibilidad todo lo que hay debajo.
  await page.evaluate((uid) => localStorage.setItem(`calistenia_discovery_survey_v1_${uid}`, 'dismissed'), auth.userId)
  const home = page.locator('[data-testid="home-today"]')

  // 0 entrenos: primer entreno, meta de la primera semana, sin «Para ti».
  let { forbidden, paraTi } = await openHome(page)
  await expect(home).toHaveAttribute('data-state', 'first_workout')
  await expect(page.locator('[data-testid="home-primary"]')).toBeVisible()
  await expect(page.locator('[data-testid="home-first-week"]')).toBeVisible()
  await expect(page.locator('[data-testid="home-para-ti"]')).toHaveCount(0)
  await expect(page.locator('#tour-weekly-plan')).toHaveCount(0)
  expect(forbidden, 'el inicio pidió agua/sueño/insights/ranking con 0 entrenos').toEqual([])
  expect(paraTi, '«Para ti» consultó antes del 3.er entreno').toEqual([])

  // 1 entreno hoy y sin programa activo: `no_program`; sigue sin «Para ti».
  await addSessions(request, auth, [0])
  ;({ forbidden, paraTi } = await openHome(page))
  await expect(home).toHaveAttribute('data-state', 'no_program')
  await expect(page.locator('[data-testid="home-para-ti"]')).toHaveCount(0)
  expect(forbidden, 'el inicio pidió agua/sueño/insights/ranking con 1 entreno').toEqual([])
  expect(paraTi, '«Para ti» consultó antes del 3.er entreno').toEqual([])

  // 3 entrenos: «Para ti» permitido (puede salir vacío) y nada de agua/sueño.
  await addSessions(request, auth, [1, 2])
  ;({ forbidden, paraTi } = await openHome(page))
  await expect(home).toHaveAttribute('data-state', 'no_program')
  expect(forbidden, 'el inicio pidió agua/sueño/insights/ranking con 3 entrenos').toEqual([])
  expect(paraTi.length, '«Para ti» no consultó con 3 entrenos').toBeGreaterThan(0)
})
