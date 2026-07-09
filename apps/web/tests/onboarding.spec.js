import { test, expect } from '@playwright/test'
import { dismissOverlays, TEST_PASS, TEST_NAME } from './helpers.js'

/**
 * Golden path: onboarding completo + activación de programa real.
 *
 * A diferencia de smoke.spec.js (que salta el wizard con "Ya conozco la app"),
 * este spec recorre los 7 pasos (welcome → basics → goals → health → training
 * → program → personalizing), selecciona el programa sembrado
 * "Intermedio – Balance Total" y verifica que:
 *   1. user_programs tiene el enrollment is_current=true en PB
 *   2. el dashboard muestra el programa activo (no el fallback)
 *   3. /workout muestra los días del programa real ("Push – Pecho y tríceps",
 *      que no existe en packages/core/data/workouts)
 *
 * Requiere el catálogo sembrado (scripts/seed-program.mjs), igual que el
 * segundo test de smoke.spec.js.
 */
const PB_URL = process.env.PB_URL || 'http://127.0.0.1:8090'

/** Signup SIN saltar el onboarding (no usar helpers.register, que lo salta). */
async function signup(page) {
  const email = `pw_ob_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@test.com`
  await page.goto('/auth?mode=signup')

  // El InstallPrompt programa su timer de 5s al montarse: pre-marcar el
  // dismiss ANTES del signup para que ni siquiera se monte durante el wizard.
  await page.evaluate(() => {
    localStorage.setItem('calistenia_install_dismiss', Date.now().toString())
    localStorage.setItem('calistenia_tour_dashboard', 'true')
  })

  const nameField = page.getByPlaceholder(/^name$|^nombre$/i)
  await expect(nameField).toBeVisible({ timeout: 10000 })
  await nameField.fill(TEST_NAME)
  await page.getByPlaceholder(/^email$/i).fill(email)
  await page.getByPlaceholder(/^password$|^contraseña$/i).fill(TEST_PASS)
  await page.getByRole('button', { name: /create account|crear cuenta/i }).click()
  return email
}

/** Lee token + userId del authStore de PB persistido en localStorage. */
async function readAuth(page) {
  return page.evaluate(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem('pocketbase_auth') || '{}')
      return { token: parsed?.token || '', userId: parsed?.record?.id || parsed?.model?.id || '' }
    } catch {
      return { token: '', userId: '' }
    }
  })
}

test('onboarding completo activa el programa elegido (wizard de 7 pasos)', async ({ page, request }) => {
  test.setTimeout(150_000)

  await signup(page)

  // ── Paso 0: Welcome ──────────────────────────────────────────────────────
  const startBtn = page.getByRole('button', { name: /^EMPEZAR$|^START$/i })
  await expect(startBtn).toBeVisible({ timeout: 15000 })

  // Ya autenticados: marcar los tours por usuario antes de llegar al dashboard
  const { userId } = await readAuth(page)
  expect(userId, 'no hay userId tras el signup').toBeTruthy()
  await page.evaluate((uid) => {
    ;['dashboard', 'workout', 'programs'].forEach((p) => {
      localStorage.setItem(`calistenia_tour_${p}`, 'true')
      localStorage.setItem(`calistenia_tour_${p}_${uid}`, 'true')
    })
  }, userId)

  await startBtn.click()

  // ── Paso 1: Basics (todo opcional, sin validación) ───────────────────────
  await expect(page.getByText(/CUÉNTANOS DE TI|TELL US ABOUT YOU/i)).toBeVisible({ timeout: 8000 })
  await page.locator('#ob-weight').fill('75')
  await page.locator('#ob-height').fill('175')
  await page.locator('#ob-age').fill('30')
  await page.getByRole('button', { name: /^(Hombre|Male)/i }).click()
  await page.getByRole('button', { name: /^(CONTINUAR|CONTINUE)$/i }).click()

  // ── Paso 2: Goals ────────────────────────────────────────────────────────
  await expect(page.getByText(/TUS METAS|YOUR GOALS/i)).toBeVisible({ timeout: 8000 })
  await page.locator('#ob-goal-weight').fill('72')
  await page.getByRole('button', { name: /^(Activo|Active)\b/i }).click()
  await page.getByRole('button', { name: /^(Balanceado|Balanced)/i }).click()
  await page.getByRole('button', { name: /^(CONTINUAR|CONTINUE)$/i }).click()

  // ── Paso 3: Health (atajo "sin condiciones" guarda y avanza solo) ────────
  await expect(page.getByText(/^SALUD$|^HEALTH$/i)).toBeVisible({ timeout: 8000 })
  await page.getByRole('button', { name: /No tengo condiciones|No conditions/i }).click()

  // ── Paso 4: Training ─────────────────────────────────────────────────────
  await expect(page.getByText(/TU ENTRENAMIENTO|YOUR TRAINING/i)).toBeVisible({ timeout: 8000 })
  await page.getByRole('button', { name: /^(Intermedio|Intermediate)\b/i }).click()
  await page.getByRole('button', { name: /^(Moderada|Moderate)/i }).click()
  await page.locator('#ob-goal').fill('Dominadas estrictas x10')
  await page.getByRole('button', { name: /^(CONTINUAR|CONTINUE)$/i }).click()

  // ── Paso 5: Programa — seleccionar la card escribe user_programs en PB ───
  await expect(page.getByText(/ELIGE TU PROGRAMA|CHOOSE YOUR PROGRAM/i)).toBeVisible({ timeout: 8000 })
  await page.getByText(/Balance Total/i).first().click()
  const continueBtn = page.getByRole('button', { name: /^(CONTINUAR|CONTINUE)$/i })
  await expect(continueBtn).toBeEnabled({ timeout: 10000 }) // deshabilitado hasta que el write termina
  await continueBtn.click()

  // ── Paso 6: Personalizing (fase loading dura 2.4s) → preview → finish ────
  await expect(page.getByText(/PERSONALIZANDO|PERSONALIZING/i)).toBeVisible({ timeout: 8000 })
  const finishBtn = page.getByRole('button', { name: /EMPEZAR A ENTRENAR|START TRAINING/i })
  await expect(finishBtn).toBeVisible({ timeout: 10000 })
  // El preview del plan ya muestra el programa elegido
  await expect(page.getByText(/Balance Total/i).first()).toBeVisible({ timeout: 5000 })
  await finishBtn.click()

  // ── Aterrizaje en el dashboard con el programa ACTIVO (no fallback) ──────
  await expect(page.locator('header nav')).toBeVisible({ timeout: 15000 })
  await dismissOverlays(page)
  await expect(
    page.locator('#tour-weekly-plan').getByText(/Balance Total/i),
  ).toBeVisible({ timeout: 15000 })

  // onboarding marcado como completado para este usuario
  const onboardingDone = await page.evaluate(
    (uid) => localStorage.getItem(`calistenia_onboarding_done_${uid}`),
    userId,
  )
  expect(onboardingDone).toBe('true')

  // ── Ground truth: enrollment is_current=true en PB con el programa real ──
  const { token } = await readAuth(page)
  expect(token, 'no hay token de PB en localStorage').toBeTruthy()
  const res = await request.get(`${PB_URL}/api/collections/user_programs/records`, {
    headers: { Authorization: token },
    params: {
      perPage: 5,
      filter: `user='${userId}' && is_current=true && status='active'`,
      expand: 'program',
    },
  })
  expect(res.ok(), 'no se pudo leer user_programs de PB').toBeTruthy()
  const body = await res.json()
  expect(body.totalItems, 'no hay enrollment activo en user_programs').toBe(1)
  expect(JSON.stringify(body.items[0].expand?.program?.name || '')).toContain('Balance Total')

  // ── /workout renderiza los días del programa real, no el fallback ────────
  await page.goto('/workout')
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
  await dismissOverlays(page)
  await page.getByRole('button', { name: /lun|mon/i }).first().click()
  // "Push – Pecho y tríceps" es del seed; el fallback usa "Empuje + Core Lumbar"
  await expect(page.getByText(/Pecho y tríceps/i).first()).toBeVisible({ timeout: 8000 })
})
