import { test, expect } from '@playwright/test'
import { register, navigateTo } from './helpers.js'

/**
 * Inicio simplificado hasta el 3.er entreno (#808), contra un PocketBase real.
 *
 * Un usuario recién registrado pasa por los tres tramos: 0 entrenos (vista
 * mínima), 1 (se añade la racha) y 3 (inicio completo). Los entrenos se crean
 * por REST con el token del propio usuario, así que también pasan por el hook
 * que mantiene `user_stats.total_sessions`, el contador que usa el inicio.
 *
 * Además de lo que se pinta, se mira la RED: antes del 3.er entreno el inicio
 * no debe pedir `water_entries` ni `sleep_entries` (los widgets de agua y
 * sueño ni se montan).
 *
 * No depende de datos sembrados: vale para el PB efímero del CI.
 */
const PB_URL = process.env.PB_URL || 'http://127.0.0.1:8090'
const FULL_ONLY_REQUESTS = /\/api\/collections\/(water_entries|sleep_entries)\/records/
const WELCOME = /Start with your first workout|Empieza por tu primer entreno/i
const SHOW_ALL = /Show full home|Ver todo el inicio/i

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

/** Abre el inicio desde cero y devuelve las peticiones a colecciones del inicio completo. */
async function openHome(page) {
  const seen = []
  const onRequest = (req) => {
    if (FULL_ONLY_REQUESTS.test(req.url())) seen.push(req.url())
  }
  page.on('request', onRequest)
  // Las sesiones se crean por REST, a espaldas de la app: sin tirar el caché
  // persistido de React Query, la recarga daría por frescos (30-60 s) los
  // contadores de antes. En uso real no pasa: terminar un entreno actualiza
  // el progreso al momento.
  await page.evaluate(() => localStorage.removeItem('calistenia_rq_cache'))
  await navigateTo(page, '/')
  await expect(page.locator('#tour-weekly-plan')).toBeVisible({ timeout: 10000 })
  // Margen para que salga cualquier query que el inicio fuera a lanzar.
  await page.waitForTimeout(1500)
  page.off('request', onRequest)
  return seen
}

test('el inicio se simplifica hasta el 3.er entreno (#808)', async ({ page, request }) => {
  test.setTimeout(120_000)
  await register(page)
  const auth = await authOf(page)
  expect(auth.token, 'no hay token de PB en localStorage').toBeTruthy()
  // La encuesta «¿cómo conociste la app?» (#586) abre un diálogo modal a los
  // 4 s que saca del árbol de accesibilidad todo lo que hay debajo.
  await page.evaluate((uid) => localStorage.setItem(`calistenia_discovery_survey_v1_${uid}`, 'dismissed'), auth.userId)

  // 0 entrenos: hoy toca X + plan de la semana, bienvenida, sin racha.
  let fullOnly = await openHome(page)
  await expect(page.locator('#tour-progress')).toBeVisible()
  await expect(page.getByText(WELCOME)).toBeVisible()
  await expect(page.locator('#tour-stats')).toHaveCount(0)
  await expect(page.getByRole('button', { name: SHOW_ALL })).toBeVisible()
  expect(fullOnly, 'el inicio mínimo pidió datos de widgets ocultos').toEqual([])

  // 1 entreno: aparece la racha; sigue sin widgets del inicio completo.
  await addSessions(request, auth, [0])
  fullOnly = await openHome(page)
  await expect(page.locator('#tour-stats')).toBeVisible()
  await expect(page.getByText(WELCOME)).toHaveCount(0)
  await expect(page.getByRole('button', { name: SHOW_ALL })).toBeVisible()
  expect(fullOnly, 'el inicio intermedio pidió datos de widgets ocultos').toEqual([])

  // 3 entrenos: el inicio completo de siempre.
  await addSessions(request, auth, [1, 2])
  fullOnly = await openHome(page)
  await expect(page.locator('#tour-stats')).toBeVisible()
  await expect(page.getByRole('button', { name: SHOW_ALL })).toHaveCount(0)
  expect(fullOnly.length, 'el inicio completo no cargó agua ni sueño').toBeGreaterThan(0)
})
