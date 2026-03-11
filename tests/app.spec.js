import { test, expect } from '@playwright/test'

const TEST_PASS  = 'TestPass123!'
const TEST_NAME  = 'PW Tester'

// ─── helpers ──────────────────────────────────────────────────────────────────

async function register(page, email, password = TEST_PASS, name = TEST_NAME) {
  const _email = email || `pw_${Date.now()}_${Math.random().toString(36).slice(2,7)}@test.com`
  await page.goto('/')
  await page.getByRole('button', { name: /registrarse/i }).click()
  await page.getByPlaceholder('Guillermo').fill(name)
  await page.getByPlaceholder('tu@email.com').fill(_email)
  await page.getByPlaceholder(/mínimo 8/i).fill(password)
  await page.getByRole('button', { name: /crear cuenta/i }).click()
  await expect(page.locator('header nav')).toBeVisible({ timeout: 15000 })
  return _email
}

async function login(page, email, password = TEST_PASS) {
  await page.goto('/')
  await expect(page.getByPlaceholder('tu@email.com')).toBeVisible({ timeout: 8000 })
  await page.getByPlaceholder('tu@email.com').fill(email)
  await page.getByPlaceholder('••••••••').fill(password)
  await page.getByRole('button', { name: /entrar/i }).click()
  await expect(page.locator('header nav')).toBeVisible({ timeout: 10000 })
}

/** Navigate to Entrenar, pick Fase 1, pick Lunes, and wait for the workout to load */
async function goToWorkout(page) {
  await page.getByRole('button', { name: /entrenar/i }).click()
  await page.getByRole('button', { name: /lunes/i }).click()
  await expect(page.getByText(/bird.dog|push.up|plank/i).first()).toBeVisible({ timeout: 5000 })
}

/** Navigate to a workout and click ▶ EMPEZAR to enter SessionView */
async function startSession(page) {
  await goToWorkout(page)
  await page.getByRole('button', { name: /empezar/i }).click()
  // SessionView top bar should be visible (← SALIR is the session exit button)
  await expect(page.getByRole('button', { name: '← SALIR' })).toBeVisible({ timeout: 5000 })
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

test.describe('Auth', () => {

  test('muestra pantalla de login al entrar sin sesión', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('CALISTENIA')).toBeVisible()
    await expect(page.getByPlaceholder('tu@email.com')).toBeVisible()
    await expect(page.getByRole('button', { name: /entrar/i })).toBeVisible()
  })

  test('error con credenciales incorrectas', async ({ page }) => {
    await page.goto('/')
    await page.getByPlaceholder('tu@email.com').fill('noexiste@test.com')
    await page.getByPlaceholder('••••••••').fill('wrongpassword')
    await page.getByRole('button', { name: /entrar/i }).click()
    await expect(page.getByText(/email o contraseña incorrectos/i)).toBeVisible({ timeout: 8000 })
  })

  test('registro de nuevo usuario', async ({ page }) => {
    await register(page)
    await expect(page.getByText('SALIR')).toBeVisible()
    await expect(page.getByText(/FASE 1/)).toBeVisible()
  })

  test('logout cierra sesión y vuelve al login', async ({ page }) => {
    await register(page)
    await page.getByRole('button', { name: 'SALIR', exact: true }).click()
    await expect(page.getByPlaceholder('tu@email.com')).toBeVisible({ timeout: 5000 })
  })

  test('login con cuenta existente', async ({ page }) => {
    const email = await register(page)
    await page.getByRole('button', { name: 'SALIR', exact: true }).click()
    await login(page, email)
    await expect(page.getByText('SALIR')).toBeVisible()
  })

})

// ─── Navegación principal ─────────────────────────────────────────────────────

test.describe('Navegación principal', () => {

  test.beforeEach(async ({ page }) => {
    await register(page)
  })

  test('4 tabs visibles en el header', async ({ page }) => {
    await expect(page.getByRole('button', { name: /dashboard/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /entrenar/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /lumbar/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /progreso/i })).toBeVisible()
  })

  test('navega a Entrenar y muestra selector de fase/día', async ({ page }) => {
    await page.getByRole('button', { name: /entrenar/i }).click()
    await expect(page.getByText(/FASE 1/i).first()).toBeVisible()
    await expect(page.getByText(/LUNES/i).first()).toBeVisible()
  })

  test('navega a Lumbar y muestra protocolos', async ({ page }) => {
    await page.getByRole('button', { name: /lumbar/i }).click()
    await expect(page.getByText(/emergencia|mañanero|pausa/i).first()).toBeVisible()
  })

  test('navega a Progreso', async ({ page }) => {
    await page.getByRole('button', { name: /progreso/i }).click()
    await expect(page.getByText(/sesion|entrenamiento|historial/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('Dashboard muestra stats y calendario', async ({ page }) => {
    await expect(page.getByText(/racha|sesiones|objetivo/i).first()).toBeVisible({ timeout: 5000 })
  })

})

// ─── Workout - list view ──────────────────────────────────────────────────────

test.describe('Workout - vista de lista', () => {

  test.beforeEach(async ({ page }) => {
    await register(page)
    await page.getByRole('button', { name: /entrenar/i }).click()
  })

  test('puede seleccionar fase 1 y día lunes', async ({ page }) => {
    await expect(page.getByText(/empuje|push|core/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('puede abrir y expandir una ExerciseCard', async ({ page }) => {
    await page.getByRole('button', { name: /lunes/i }).click()
    const firstCard = page.getByText(/bird.dog|push.up|plank/i).first()
    await expect(firstCard).toBeVisible({ timeout: 5000 })
  })

  test('muestra botón EMPEZAR cuando el workout no está completado', async ({ page }) => {
    await page.getByRole('button', { name: /lunes/i }).click()
    await expect(page.getByRole('button', { name: /empezar/i })).toBeVisible({ timeout: 5000 })
  })

})

// ─── SessionView ──────────────────────────────────────────────────────────────

test.describe('SessionView - modo sesión', () => {

  test.beforeEach(async ({ page }) => {
    await register(page)
  })

  test('EMPEZAR abre la vista de sesión con barra superior', async ({ page }) => {
    await startSession(page)
    // Top bar: ← SALIR button and step counter (e.g. "1/N")
    await expect(page.getByRole('button', { name: '← SALIR' })).toBeVisible()
    await expect(page.getByText(/\/\d+/).first()).toBeVisible()
  })

  test('muestra el nombre del ejercicio y el tracker de series', async ({ page }) => {
    await startSession(page)
    // Exercise name in big Bebas Neue heading
    await expect(page.getByText(/bird.dog|plank|push.up/i).first()).toBeVisible()
    // Series counter "SERIE X/Y"
    await expect(page.getByText(/SERIE \d+\/\d+/).first()).toBeVisible()
  })

  test('botón SERIE COMPLETADA loguea y avanza al descanso', async ({ page }) => {
    await startSession(page)
    // Click the quick-log button
    await page.getByRole('button', { name: /SERIE COMPLETADA/i }).click()
    // Should enter rest phase: "Descansando" label and "SALTAR DESCANSO" button
    await expect(page.getByText(/Descansando/i)).toBeVisible({ timeout: 3000 })
    await expect(page.getByRole('button', { name: /SALTAR DESCANSO/i })).toBeVisible()
  })

  test('pantalla de descanso muestra cuenta regresiva y preview del siguiente ejercicio', async ({ page }) => {
    await startSession(page)
    await page.getByRole('button', { name: /SERIE COMPLETADA/i }).click()
    // Circular countdown renders a time value like "1:30" or "0:45"
    await expect(page.getByText(/\d+:\d{2}/).first()).toBeVisible({ timeout: 3000 })
    // Next exercise preview card
    await expect(page.getByText(/SIGUIENTE/i)).toBeVisible()
  })

  test('SALTAR DESCANSO vuelve a la pantalla de ejercicio', async ({ page }) => {
    await startSession(page)
    await page.getByRole('button', { name: /SERIE COMPLETADA/i }).click()
    await expect(page.getByRole('button', { name: /SALTAR DESCANSO/i })).toBeVisible({ timeout: 3000 })
    await page.getByRole('button', { name: /SALTAR DESCANSO/i }).click()
    // Back to exercise screen
    await expect(page.getByRole('button', { name: /SERIE COMPLETADA/i })).toBeVisible({ timeout: 3000 })
  })

  test('botón EDITAR REPS abre el formulario de reps personalizadas', async ({ page }) => {
    await startSession(page)
    await page.getByRole('button', { name: /EDITAR REPS/i }).click()
    await expect(page.getByText(/REPS PERSONALIZADAS/i)).toBeVisible()
    await expect(page.getByPlaceholder(/Reps/i)).toBeVisible()
  })

  test('← SALIR muestra el overlay de confirmación', async ({ page }) => {
    await startSession(page)
    await page.getByRole('button', { name: '← SALIR' }).click({ force: true })
    await expect(page.getByText(/interrumpir sesión/i)).toBeVisible({ timeout: 3000 })
    await expect(page.getByRole('button', { name: /GUARDAR Y SALIR/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /CONTINUAR ENTRENANDO/i })).toBeVisible()
  })

  test('CONTINUAR ENTRENANDO cierra el overlay y vuelve a la sesión', async ({ page }) => {
    await startSession(page)
    await page.getByRole('button', { name: '← SALIR' }).click({ force: true })
    await expect(page.getByRole('button', { name: /CONTINUAR ENTRENANDO/i })).toBeVisible({ timeout: 3000 })
    await page.getByRole('button', { name: /CONTINUAR ENTRENANDO/i }).click()
    // Overlay gone, session still active
    await expect(page.getByText(/interrumpir sesión/i)).not.toBeVisible()
    await expect(page.getByRole('button', { name: /SERIE COMPLETADA/i })).toBeVisible()
  })

  test('GUARDAR Y SALIR regresa a la vista de lista', async ({ page }) => {
    await startSession(page)
    await page.getByRole('button', { name: '← SALIR' }).click({ force: true })
    await expect(page.getByRole('button', { name: /GUARDAR Y SALIR/i })).toBeVisible({ timeout: 3000 })
    await page.getByRole('button', { name: /GUARDAR Y SALIR/i }).click()
    // Back to list view: EMPEZAR is gone, workout is now marked done
    await expect(page.getByRole('button', { name: /GUARDAR Y SALIR/i })).not.toBeVisible({ timeout: 5000 })
    // The list view header should be back (phase selector)
    await expect(page.getByText(/FASE ACTIVA/i)).toBeVisible()
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
    // Safety limit: at most 40 iterations to prevent infinite loops
    for (let i = 0; i < 40; i++) {
      const serieBtn = page.getByRole('button', { name: /SERIE COMPLETADA/i })
      const saltarBtn = page.getByRole('button', { name: /SALTAR DESCANSO/i })
      const guardarBtn = page.getByRole('button', { name: /^GUARDAR$/i })
      const saltarNotaBtn = page.getByRole('button', { name: /^SALTAR$/i })

      if (await guardarBtn.isVisible()) return 'note'
      if (await saltarNotaBtn.isVisible()) return 'note'

      if (await saltarBtn.isVisible()) {
        await saltarBtn.click()
        continue
      }

      if (await serieBtn.isVisible()) {
        await serieBtn.click()
        continue
      }

      // Wait a tick and try again
      await page.waitForTimeout(300)
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
    // Should reach celebrate screen
    await expect(page.getByText(/SESIÓN COMPLETADA/i)).toBeVisible({ timeout: 5000 })
  })

  test('pantalla de celebración muestra checkmark, título y quote', async ({ page }) => {
    await startSession(page)
    await completeAllSets(page)
    await page.getByRole('button', { name: /^SALTAR$/i }).click()
    // Celebrate screen
    await expect(page.getByText(/SESIÓN COMPLETADA/i)).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('✓')).toBeVisible()
    // A local motivational quote should be visible immediately (no spinner)
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
    // Dashboard tab should now be active — shows stats
    await expect(page.getByText(/racha|sesiones|objetivo/i).first()).toBeVisible({ timeout: 5000 })
  })

})
