import { test, expect } from '@playwright/test'
import { register, navigateTo, dismissOverlays } from './helpers.js'

/**
 * Smoke test del golden path (#145): signup → primera sesión de entrenamiento.
 *
 * Es el único spec que corre en CI (job e2e-smoke de ci.yml) antes de los
 * deploys de web/AI-API. Debe funcionar contra un PocketBase recién migrado y
 * SIN datos sembrados: un usuario sin programa activo ve los workouts de
 * fallback de packages/core/data/workouts, así que el flujo completo
 * (workout → sesión → celebración → registro en PB) no depende de seeds.
 *
 * PB_URL solo se usa para la aserción final de persistencia vía REST.
 */
const PB_URL = process.env.PB_URL || 'http://127.0.0.1:8090'

/** Completa sets y salta descansos hasta llegar a la pantalla de nota. */
async function completeAllSets(page) {
  for (let i = 0; i < 80; i++) {
    const guardarBtn = page.getByRole('button', { name: /^GUARDAR$/i })
    const saltarNotaBtn = page.getByRole('button', { name: /^SALTAR$/i })
    if (await guardarBtn.isVisible({ timeout: 500 }).catch(() => false)) return 'note'
    if (await saltarNotaBtn.isVisible({ timeout: 200 }).catch(() => false)) return 'note'

    const saltarDescansoBtn = page.getByRole('button', { name: /SALTAR DESCANSO|SKIP REST/i })
    if (await saltarDescansoBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await saltarDescansoBtn.click()
      await page.waitForTimeout(300)
      continue
    }

    const serieBtn = page.getByRole('button', { name: /SERIE COMPLETADA/i })
    if (await serieBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await serieBtn.click()
      await page.waitForTimeout(300)
      continue
    }

    await page.waitForTimeout(500)
  }
  return 'unknown'
}

test('signup → primera sesión completada y persistida en PocketBase', async ({ page, request }) => {
  test.setTimeout(180_000)

  // 1. Registro (auto-login) + saltar onboarding
  await register(page)

  // 2. Workout: elegir el primer día de entrenamiento del programa fallback
  await navigateTo(page, '/workout')
  await page.getByRole('button', { name: /lun|mon/i }).first().click()
  const startBtn = page.getByRole('button', { name: /▶ START|▶ EMPEZAR|empezar/i }).first()
  await expect(startBtn).toBeVisible({ timeout: 8000 })

  // 3. Empezar la sesión → SessionView a pantalla completa
  await startBtn.click()
  await expect(
    page.locator('[aria-label*="Descartar" i], [aria-label*="Discard" i]'),
  ).toBeVisible({ timeout: 8000 })
  await dismissOverlays(page)
  await expect(page.getByText(/SERIE \d+\/\d+/).first()).toBeVisible({ timeout: 5000 })

  // 4. Completar todos los sets hasta la pantalla de nota
  const reached = await completeAllSets(page)
  expect(reached, 'no llegó a la pantalla de nota tras completar los sets').toBe('note')

  // 5. Saltar la nota → pantalla de celebración
  await page.getByRole('button', { name: /^SALTAR$/i }).click()
  await expect(page.getByText(/SESIÓN COMPLETADA/i)).toBeVisible({ timeout: 8000 })

  // 6. La sesión quedó persistida en PB (no solo en la cola offline)
  const auth = await page.evaluate(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem('pocketbase_auth') || '{}')
      return { token: parsed?.token || '', userId: parsed?.record?.id || parsed?.model?.id || '' }
    } catch {
      return { token: '', userId: '' }
    }
  })
  expect(auth.token, 'no hay token de PB en localStorage').toBeTruthy()

  await expect
    .poll(
      async () => {
        const res = await request.get(`${PB_URL}/api/collections/sessions/records`, {
          headers: { Authorization: auth.token },
          params: { perPage: 1, filter: `user='${auth.userId}'` },
        })
        if (!res.ok()) return -1
        return (await res.json()).totalItems
      },
      { timeout: 15_000, message: 'la sesión no apareció en la colección sessions de PB' },
    )
    .toBeGreaterThan(0)

  // 7. Volver al dashboard
  await page.getByRole('button', { name: /IR AL DASHBOARD/i }).click()
  await expect(
    page.getByText(/racha|streak|sesiones|sessions|objetivo|goal/i).first(),
  ).toBeVisible({ timeout: 8000 })
})

// En CI, scripts/seed-program.mjs siembra "Intermedio – Balance Total" en el
// PB efímero antes de correr Playwright. Este test verifica el pipeline
// completo de datos: seed → API de PB → catálogo renderizado en la UI.
test('el catálogo de programas sembrado es visible en /programs', async ({ page }) => {
  await register(page)
  await navigateTo(page, '/programs')
  await expect(page.getByText(/^PROGRAMAS$|^PROGRAMS$/i).first()).toBeVisible({ timeout: 8000 })
  await expect(page.getByText(/Balance Total/i).first()).toBeVisible({ timeout: 8000 })
})
