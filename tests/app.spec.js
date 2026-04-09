import { test, expect } from '@playwright/test'
import { register, login, navigateTo, dismissOverlays } from './helpers.js'

const TEST_PASS  = 'TestPass123!'

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Navigate to Workout page, pick first training day, and wait for the exercise list */
async function goToWorkout(page) {
  await navigateTo(page, '/workout')
  // Click the first day button (LUN / MON)
  await page.getByRole('button', { name: /lun|mon/i }).first().click()
  await expect(page.getByRole('button', { name: /▶ START|▶ EMPEZAR|empezar/i }).first()).toBeVisible({ timeout: 8000 })
}

/** Navigate to a workout and click ▶ START to enter SessionView */
async function startSession(page) {
  await goToWorkout(page)
  await page.getByRole('button', { name: /▶ START|▶ EMPEZAR|empezar/i }).first().click()
  // SessionView top bar: discard button (X icon) with aria-label
  await expect(page.locator('[aria-label*="Descartar" i], [aria-label*="Discard" i]')).toBeVisible({ timeout: 5000 })
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

test.describe('Auth', () => {

  test('muestra pantalla de login al entrar sin sesión', async ({ page }) => {
    await page.goto('/auth')
    await expect(page.getByText('CALISTENIA').first()).toBeVisible()
    await expect(page.getByPlaceholder(/^email$/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /sign in|iniciar sesión/i })).toBeVisible()
  })

  test('error con credenciales incorrectas', async ({ page }) => {
    await page.goto('/auth')
    await page.getByPlaceholder(/^email$/i).fill('noexiste@test.com')
    await page.getByPlaceholder(/^password$|^contraseña$/i).fill('wrongpassword')
    await page.getByRole('button', { name: /sign in|iniciar sesión/i }).click()
    // Error message is "Failed to authenticate." in EN
    await expect(page.getByText(/failed to authenticate|email o contraseña incorrectos/i).first()).toBeVisible({ timeout: 8000 })
  })

  test('registro de nuevo usuario', async ({ page }) => {
    await register(page)
    await expect(page.locator('header nav')).toBeVisible()
  })

  test('logout cierra sesión y vuelve al landing', async ({ page }) => {
    await register(page)
    // Open sidebar and click logout
    await page.locator('[data-sidebar="trigger"]').click()
    await page.getByRole('button', { name: /cerrar sesión|sign out|log out/i }).click()
    // After logout, user lands on the public landing page (not /auth directly)
    await expect(page.getByText(/get started|comenzar/i).first()).toBeVisible({ timeout: 8000 })
  })

  test('login con cuenta existente', async ({ page }) => {
    const email = await register(page)
    await page.locator('[data-sidebar="trigger"]').click()
    await page.getByRole('button', { name: /cerrar sesión|sign out|log out/i }).click()
    await expect(page.getByText(/get started|comenzar/i).first()).toBeVisible({ timeout: 8000 })
    await login(page, email)
    await expect(page.locator('header nav')).toBeVisible()
  })

})

// ─── Navegación principal ─────────────────────────────────────────────────────

test.describe('Navegación principal', () => {

  test.beforeEach(async ({ page }) => {
    await register(page)
  })

  test('sidebar has main navigation links', async ({ page }) => {
    // Sidebar should show key navigation items
    await expect(page.locator('[data-sidebar="trigger"]')).toBeVisible()
    await expect(page.locator('header nav')).toBeVisible()
  })

  test('navega a Workout y muestra selector de fase/día', async ({ page }) => {
    await navigateTo(page, '/workout')
    await expect(page.getByText(/FASE 1|PHASE 1|fase/i).first()).toBeVisible({ timeout: 5000 })
    await expect(page.getByText(/^LUN$|^MON$/i).first()).toBeVisible()
  })

  test('navega a Lumbar y muestra la página', async ({ page }) => {
    await page.goto('/lumbar')
    // Lumbar page shows a pain-check dialog — wait for it and skip it
    const skipBtn = page.getByRole('button', { name: /skip for today|saltar por hoy|omitir/i })
    await expect(skipBtn).toBeVisible({ timeout: 8000 })
    await skipBtn.click()
    await dismissOverlays(page)
    await expect(page.getByText(/lumbar|posture/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('navega a Progreso', async ({ page }) => {
    await navigateTo(page, '/progress')
    await expect(page.getByText(/sesion|session|entrenamiento|training|historial|history/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('Dashboard muestra stats', async ({ page }) => {
    await navigateTo(page, '/')
    await expect(page.getByText(/racha|streak|sesiones|sessions|objetivo|goal/i).first()).toBeVisible({ timeout: 5000 })
  })

})

// ─── Workout - list view ──────────────────────────────────────────────────────

test.describe('Workout - vista de lista', () => {

  test.beforeEach(async ({ page }) => {
    await register(page)
    await navigateTo(page, '/workout')
  })

  test('puede seleccionar fase 1 y día lunes', async ({ page }) => {
    await expect(page.getByText(/empuje|push|core/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('puede ver ejercicios al seleccionar un día', async ({ page }) => {
    await page.getByRole('button', { name: /lun|mon/i }).first().click()
    // Exercise cards should be visible (exercise name + sets info)
    await expect(page.getByText(/SETS|sets|series/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('muestra botón EMPEZAR cuando el workout no está completado', async ({ page }) => {
    await page.getByRole('button', { name: /lun|mon/i }).first().click()
    await expect(page.getByRole('button', { name: /▶ START|▶ EMPEZAR|empezar/i }).first()).toBeVisible({ timeout: 5000 })
  })

})

// ─── SessionView ──────────────────────────────────────────────────────────────

test.describe('SessionView - modo sesión', () => {

  test.beforeEach(async ({ page }) => {
    await register(page)
  })

  test('START abre la vista de sesión con barra superior', async ({ page }) => {
    await startSession(page)
    await expect(page.locator('[aria-label*="Descartar" i], [aria-label*="Discard" i]')).toBeVisible()
    await expect(page.getByText(/\/\d+/).first()).toBeVisible()
  })

  test('muestra el nombre del ejercicio y el tracker de series', async ({ page }) => {
    await startSession(page)
    // Exercise name visible (varies by program)
    await expect(page.getByText(/SERIE \d+\/\d+/).first()).toBeVisible()
  })

  test('botón SERIE COMPLETADA loguea y avanza al descanso', async ({ page }) => {
    await startSession(page)
    await page.getByRole('button', { name: /SERIE COMPLETADA/i }).click()
    await expect(page.getByText(/Descansando|Resting|DESCANSO/i).first()).toBeVisible({ timeout: 3000 })
    await expect(page.getByRole('button', { name: /SALTAR DESCANSO|SKIP REST/i })).toBeVisible()
  })

  test('pantalla de descanso muestra cuenta regresiva', async ({ page }) => {
    await startSession(page)
    await page.getByRole('button', { name: /SERIE COMPLETADA/i }).click()
    await expect(page.getByText(/\d+:\d{2}/).first()).toBeVisible({ timeout: 3000 })
  })

  test('SALTAR DESCANSO vuelve a la pantalla de ejercicio', async ({ page }) => {
    await startSession(page)
    await page.getByRole('button', { name: /SERIE COMPLETADA/i }).click()
    await expect(page.getByRole('button', { name: /SALTAR DESCANSO|SKIP REST/i })).toBeVisible({ timeout: 3000 })
    await page.getByRole('button', { name: /SALTAR DESCANSO|SKIP REST/i }).click()
    await expect(page.getByRole('button', { name: /SERIE COMPLETADA/i })).toBeVisible({ timeout: 3000 })
  })

  test('discard button muestra el overlay de confirmación', async ({ page }) => {
    await startSession(page)
    await page.locator('[aria-label*="Descartar" i], [aria-label*="Discard" i]').click({ force: true })
    // Dialog title: "Discard session?" or "¿Descartar sesión?"
    await expect(page.getByText(/discard session|descartar sesión/i).first()).toBeVisible({ timeout: 3000 })
    // "DISCARD SESSION" / "DESCARTAR SESIÓN" button
    await expect(page.getByRole('button', { name: /discard session|descartar sesión/i })).toBeVisible()
    // "CONTINUAR ENTRENANDO" button (hardcoded Spanish)
    await expect(page.getByRole('button', { name: /CONTINUAR ENTRENANDO/i })).toBeVisible()
  })

  test('continuar cierra el overlay y vuelve a la sesión', async ({ page }) => {
    await startSession(page)
    await page.locator('[aria-label*="Descartar" i], [aria-label*="Discard" i]').click({ force: true })
    await expect(page.getByRole('button', { name: /CONTINUAR ENTRENANDO/i })).toBeVisible({ timeout: 3000 })
    await page.getByRole('button', { name: /CONTINUAR ENTRENANDO/i }).click()
    await expect(page.getByRole('button', { name: /SERIE COMPLETADA/i })).toBeVisible({ timeout: 5000 })
  })

})

// ─── SessionView - pantalla de nota y celebración ────────────────────────────

test.describe('SessionView - nota y celebración', () => {

  test.beforeEach(async ({ page }) => {
    await register(page)
  })

  /**
   * Helper: complete all sets in the session by repeatedly clicking
   * "SERIE COMPLETADA" and "SALTAR DESCANSO" until we reach the note screen.
   */
  async function completeAllSets(page) {
    for (let i = 0; i < 50; i++) {
      // Check for note screen first
      const guardarBtn = page.getByRole('button', { name: /^GUARDAR$/i })
      const saltarNotaBtn = page.getByRole('button', { name: /^SALTAR$/i })
      if (await guardarBtn.isVisible({ timeout: 500 }).catch(() => false)) return 'note'
      if (await saltarNotaBtn.isVisible({ timeout: 200 }).catch(() => false)) return 'note'

      // Try to skip rest
      const saltarBtn = page.getByRole('button', { name: /SALTAR DESCANSO|SKIP REST/i })
      if (await saltarBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        await saltarBtn.click()
        await page.waitForTimeout(300)
        continue
      }

      // Try to complete a set
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

  test('después de todos los sets aparece la pantalla de nota', async ({ page }) => {
    await startSession(page)
    const reached = await completeAllSets(page)
    expect(reached).toBe('note')
    await expect(page.getByText(/último set listo/i)).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('button', { name: /^GUARDAR$/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /^SALTAR$/i })).toBeVisible()
  })

  test('pantalla de nota permite escribir y guardar', async ({ page }) => {
    await startSession(page)
    await completeAllSets(page)
    await expect(page.getByRole('button', { name: /^GUARDAR$/i })).toBeVisible({ timeout: 5000 })
    await page.getByPlaceholder(/Dominadas|Ej:/i).fill('Todo bien hoy')
    await page.getByRole('button', { name: /^GUARDAR$/i }).click()
    await expect(page.getByText(/SESIÓN COMPLETADA/i)).toBeVisible({ timeout: 5000 })
  })

  test('pantalla de celebración muestra checkmark, título y quote', async ({ page }) => {
    await startSession(page)
    await completeAllSets(page)
    await page.getByRole('button', { name: /^SALTAR$/i }).click()
    await expect(page.getByText(/SESIÓN COMPLETADA/i)).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('✓')).toBeVisible()
    await expect(page.getByText(/"/i).first()).toBeVisible()
  })

  test('pantalla de celebración tiene botón IR AL DASHBOARD', async ({ page }) => {
    await startSession(page)
    await completeAllSets(page)
    await page.getByRole('button', { name: /^SALTAR$/i }).click()
    await expect(page.getByRole('button', { name: /IR AL DASHBOARD/i })).toBeVisible({ timeout: 5000 })
  })

  test('IR AL DASHBOARD navega al tab de dashboard', async ({ page }) => {
    await startSession(page)
    await completeAllSets(page)
    await page.getByRole('button', { name: /^SALTAR$/i }).click()
    await expect(page.getByRole('button', { name: /IR AL DASHBOARD/i })).toBeVisible({ timeout: 5000 })
    await page.getByRole('button', { name: /IR AL DASHBOARD/i }).click()
    await expect(page.getByText(/racha|streak|sesiones|sessions|objetivo|goal/i).first()).toBeVisible({ timeout: 5000 })
  })

})
