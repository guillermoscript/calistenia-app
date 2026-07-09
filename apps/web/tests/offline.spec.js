import { test, expect } from '@playwright/test'
import { register, navigateTo } from './helpers.js'

/**
 * Regresión de los 3 bugs de datos offline del #151 (fix en PR #195, 29d96ea):
 *
 *   (a) arrancar la app sin red hacía LOGOUT: tryRefreshAuth limpiaba el
 *       authStore ante cualquier fallo de authRefresh, incluidos errores de
 *       red (status 0). Ahora solo un 401/403 real limpia la sesión.
 *   (b) la cola drenaba SIN auth válida → PB respondía 400 → el item se
 *       descartaba como "poison" = pérdida de datos. Ahora drainQueue se
 *       gatea en authStore.isValid y authStore.onChange re-dispara el drain.
 *   (c) drenajes concurrentes (StrictMode, boot + evento online, multi-tab)
 *       releían el mismo snapshot y duplicaban los creates. Ahora hay guard
 *       drainInFlight en memoria + Web Locks entre tabs.
 *
 * Técnica: `context.setOffline(true) + reload` NO sirve en dev (sin service
 * worker el documento no carga). En su lugar se bloquea SOLO el host de PB
 * con context.route → los fetch a PB fallan con status 0, exactamente el
 * "network error" que el código distingue de un 4xx. Los triggers de drenaje
 * se disparan con eventos `online` sintéticos (los handlers de
 * setupAutoSync/OfflineBanner escuchan el evento, no navigator.onLine).
 *
 * La escritura encolada es agua en el Dashboard (+200): un click, sin
 * diálogos, sin depender de nutrition_goals, y pasa por persistOrQueue →
 * colección water_entries. Complementa (no duplica) los unit tests de
 * packages/core/lib/offlineQueue.test.ts, que ya cubren la cola con mocks:
 * aquí se ejercita el wiring real (boot, localStorage, eventos de window).
 */
const PB_URL = process.env.PB_URL || 'http://127.0.0.1:8090'
const QUEUE_KEY = 'calistenia_offline_queue'

async function pbAuth(page) {
  return page.evaluate(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem('pocketbase_auth') || '{}')
      return { token: parsed?.token || '', userId: parsed?.record?.id || parsed?.model?.id || '' }
    } catch {
      return { token: '', userId: '' }
    }
  })
}

async function queueLength(page) {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || '[]').length,
    QUEUE_KEY,
  )
}

/** Corta la red hacia PocketBase (status 0 en el browser); el resto sigue. */
async function blockPB(context) {
  await context.route(`${PB_URL}/**`, (route) => route.abort('internetdisconnected'))
}

async function unblockPB(context) {
  await context.unroute(`${PB_URL}/**`)
}

test.describe('Offline → recuperación (#151)', () => {
  test('(a) arrancar sin red NO desloguea', async ({ page, context }) => {
    test.setTimeout(90_000)
    await register(page)
    await navigateTo(page, '/')
    const before = await pbAuth(page)
    expect(before.token).toBeTruthy()

    // "Arranque offline": recarga completa con PB inalcanzable. El boot llama
    // tryRefreshAuth → authRefresh falla con status 0 → la sesión debe
    // sobrevivir (el bug la limpiaba y echaba al usuario a /auth).
    await blockPB(context)
    await page.reload()

    await expect(page.locator('header nav')).toBeVisible({ timeout: 15000 })
    expect(page.url()).not.toMatch(/\/auth/)
    const after = await pbAuth(page)
    expect(after.token, 'el token se perdió al arrancar offline').toBeTruthy()
    expect(after.userId).toBe(before.userId)

    await unblockPB(context)
  })

  test('(b) escritura sin red se encola y drena al volver, sin pérdida ni logout', async ({ page, context, request }) => {
    test.setTimeout(90_000)
    await register(page)
    await navigateTo(page, '/')
    const auth = await pbAuth(page)

    // La secuencia real del incidente #151: ARRANCAR sin red (pre-fix esto
    // limpiaba la auth) y encolar una escritura (pre-fix el drain sin token
    // recibía 400 y la descartaba como poison = pérdida de datos).
    await blockPB(context)
    await page.reload()
    await expect(page.locator('header nav')).toBeVisible({ timeout: 15000 })
    await page.getByRole('button', { name: '+200', exact: true }).click()
    await expect
      .poll(() => queueLength(page), { timeout: 8000, message: 'el create no se encoló' })
      .toBe(1)

    // Vuelve la red: el evento online dispara el drain de setupAutoSync.
    await unblockPB(context)
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await expect
      .poll(() => queueLength(page), { timeout: 15000, message: 'la cola no drenó al volver online' })
      .toBe(0)

    // Ground truth: el registro llegó a PB exactamente una vez y sin logout.
    const res = await request.get(`${PB_URL}/api/collections/water_entries/records`, {
      headers: { Authorization: auth.token },
      params: { perPage: 5, filter: `user='${auth.userId}'` },
    })
    expect(res.ok()).toBeTruthy()
    expect((await res.json()).totalItems, 'el agua encolada no se persistió (¿descartada como poison?)').toBe(1)
    expect((await pbAuth(page)).token, 'logout inesperado tras drenar').toBeTruthy()
  })

  test('(c) drenajes concurrentes NO duplican la escritura', async ({ page, context, request }) => {
    test.setTimeout(90_000)
    await register(page)
    await navigateTo(page, '/')
    const auth = await pbAuth(page)

    await blockPB(context)
    await page.getByRole('button', { name: '+200', exact: true }).click()
    await expect.poll(() => queueLength(page), { timeout: 8000 }).toBe(1)
    await unblockPB(context)

    // La carrera real del bug: varios triggers de drain a la vez — dos eventos
    // online en el mismo tab (comparten drainInFlight) + una segunda pestaña
    // recién arrancada (boot drain, serializado vía Web Locks).
    const page2 = await context.newPage()
    await Promise.all([
      page.evaluate(() => {
        window.dispatchEvent(new Event('online'))
        window.dispatchEvent(new Event('online'))
      }),
      page2.goto('/'),
    ])

    await expect
      .poll(() => queueLength(page), { timeout: 15000, message: 'la cola no drenó' })
      .toBe(0)
    // Margen para que un hipotético segundo drain duplicado llegara a PB
    await page.waitForTimeout(1500)

    const res = await request.get(`${PB_URL}/api/collections/water_entries/records`, {
      headers: { Authorization: auth.token },
      params: { perPage: 5, filter: `user='${auth.userId}'` },
    })
    expect(res.ok()).toBeTruthy()
    expect((await res.json()).totalItems, 'el create se duplicó al drenar en paralelo').toBe(1)
    await page2.close()
  })
})
